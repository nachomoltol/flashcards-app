# AUDITORÍA COMERCIAL, DE SUSCRIPTORES Y CONTROL DE ACCESO PRO/VIP EN FLASHMENTE

**Fecha:** 17 de Noviembre de 2026  
**Proyecto:** Flashmente (`flashcards-app`)  
**Módulos Auditados:** `generateDeckSummary.ts`, `generateCards.ts`, `socraticTutor.ts`, `getUserLimits.ts`, `redeemPromoCode.ts`, `stripe/checkout/route.ts`, `stripe/webhook/route.ts`, `ProModal.tsx`, `QuickStudyGuideModal.tsx`, `DecksView.tsx`, Supabase RPCs y tabla `api_limits`.  
**Estado de Verificación:** `npx tsc --noEmit` (0 errores) | `npx eslint src/ --quiet` (0 errores).

---

## 1. RESUMEN EJECUTIVO

Se ha ejecutado una auditoría integral del subsistema de suscripciones, control de niveles (`tier`: `'free'`, `'pro'`, `'vip'`), ciclo de vida de facturación con Stripe, políticas de tiendas nativas (Google Play / App Store) y coherencia de privilegios entre el cliente (React) y el servidor (Next.js Server Actions y PostgreSQL).

### Conclusión Principal
El sistema basa la validación de suscripciones en una única fuente de verdad en base de datos (`public.api_limits.tier`), impidiendo que el cliente manipule directamente variables booleanas como `isPro` en el backend. Los webhooks de Stripe están sólidamente programados para gestionar altas, cobros exitosos, impagos y cancelaciones. Sin embargo, **se han detectado 2 vulnerabilidades funcionales de severidad alta** relativas a la ausencia de expiración pasiva (*Lazy Expiration*) y la suplantación de `userId` en acciones de servidor, así como **una discrepancia de latencia en la sincronización de retorno de pago**.

---

## 2. MATRIZ DE RIESGOS Y HALLAZGOS COMERCIALES

| ID | Hallazgo / Vulnerabilidad | Componente Afectado | Severidad | Impacto Comercial |
| :--- | :--- | :--- | :---: | :--- |
| **SUB-01** | **Falta de Validación Activa de Fecha de Caducidad (*Lazy Expiration*)** | Supabase RPCs (`check_api_limit`, `check_tutor_consultation`) y Server Actions | **ALTA** | Aunque `current_period_end` se almacena en `api_limits`, ni la base de datos ni las Server Actions validan si `current_period_end < NOW()`. Si un webhook de Stripe se pierde o falla, el usuario retiene acceso PRO indefinidamente sin pagar. |
| **SUB-02** | **Herencia y Suplantación de Rol PRO en Peticiones No Autenticadas** | `generateCards.ts` (`resolveUserId`) y `generateDeckSummary.ts` | **ALTA** | `resolveUserId` prioriza `explicitUserId` sin validar firma de sesión. Además, en mazos públicos, un visitante Free hereda el nivel PRO del creador del mazo y obtiene la guía íntegra sin coste. |
| **SUB-03** | **Condición de Carrera en Sincronización Inmediata Post-Checkout** | `stripe/checkout/route.ts` & `DecksView.tsx` | **MEDIA** | El frontend confía exclusivamente en el webhook asíncrono de Stripe. Si el usuario regresa a la web antes de que el webhook termine de procesarse (~1-3s de latencia de red), experimenta una desincronización temporal donde se le muestra como Free a pesar de haber pagado. |
| **SUB-04** | **Fragmentación de Estado PRO en Frontend (Ausencia de Contexto Global)** | Componentes (`DocumentUploader`, `UrlCardGenerator`, `QuickStudyGuideModal`) | **BAJA** | Cada componente realiza su propia llamada independiente a `api_limits` o a Server Actions para comprobar `isPro`. No genera agujero de seguridad, pero provoca consultas redundantes a Supabase. |

---

## 3. AUDITORÍA TÉCNICA DETALLADA

### 3.1. Verificación del Campo `tier` y Permisos en Backend

#### Origen y Protección del Campo `tier`
- **Fuente de Verdad:** Tabla `public.api_limits` (Columna `tier TEXT CHECK (tier IN ('free', 'pro', 'vip'))`).
- **Seguridad RLS:** La tabla `api_limits` cuenta con Row Level Security activado (`rowsecurity = true`) y una única política de `SELECT` para usuarios autenticados (`auth.uid() = user_id`). Ningún cliente puede alterar su propio nivel `tier` mediante PostgREST.
- **Acceso en Servidor:** Las Server Actions consultan el nivel a través de RPCs con `SECURITY DEFINER` o mediante un cliente Supabase con privilegios `service_role`.

#### Análisis por Server Action:
1. **`generateDeckSummary.ts`:**
   - Comprueba la cuota mediante `checkAndResetMonthlyGuideQuota(db, targetUserId)`.
   - Si `isPro === true`, devuelve la guía completa de 6 bloques (`summary: completeGuide, isUnlocked: true`).
   - Si `isPro === false`, entrega únicamente la vista previa del Bloque 1 (`overview`).
   - *Punto Crítico:* Si el mazo es público (`isPublicDeck`), `targetUserId` toma el valor de `deck.user_id`. Un usuario Free que visite el mazo de un usuario PRO recibe la guía completa gratis.
2. **`generateCards.ts`:**
   - Ejecuta `enforceApiLimit(resolvedUserId)`, que invoca la función RPC de PostgreSQL `check_api_limit`.
   - Si `tier IN ('pro', 'vip')`, se amplía el cupo a 120 generaciones mensuales y se habilitan funciones exclusivas (como extracción de tarjetas desde URLs de YouTube).
   - *Punto Crítico:* La función interna `resolveUserId(deckId, explicitUserId)` retorna `explicitUserId` directamente si el argumento no está vacío, permitiendo que llamadas manipuladas utilicen cuotas ajenas.
3. **`socraticTutor.ts`:**
   - Llama a `getTutorQuotaStatusAction` y a la RPC `check_tutor_consultation`.
   - Si `tier IN ('pro', 'vip')`, otorga consultas ilimitadas (`remainingFree = 9999`).
   - Para usuarios Free, impone el límite estricto de 3 consultas mensuales, requiriendo anuncios bonificados a partir de la 4.ª.

---

### 3.2. Control de Caducidad y Estados de Pago (Stripe & Plataformas)

#### Flujo de Webhooks de Stripe (`src/app/api/stripe/webhook/route.ts`)
El endpoint valida la firma criptográfica obligatoria con `stripe.webhooks.constructEvent` y `STRIPE_WEBHOOK_SECRET`. Maneja rigurosamente los 5 eventos clave:

1. **`checkout.session.completed`:**
   - Extrae `userId` de `client_reference_id` o `metadata.userId`.
   - Consulta el objeto suscripción de Stripe para obtener `current_period_end` y `subscriptionStatus`.
   - Ejecuta `set_user_tier(p_user_id, p_tier: 'pro', ...)` y actualiza `api_limits`.
2. **`invoice.paid`:**
   - Procesa renovaciones periódicas mensuales (3,50 €/mes).
   - Actualiza `current_period_end` con la nueva fecha de vencimiento y mantiene `tier = 'pro'`.
3. **`invoice.payment_failed`:**
   - Detecta fallos en el método de pago del cliente.
   - Si Stripe determina que los reintentos se han agotado (`next_payment_attempt === null`) o el estado es `canceled`/`unpaid`, degrada automáticamente al usuario a `tier = 'free'` y `subscription_status = 'unpaid'`.
4. **`customer.subscription.updated`:**
   - Si la suscripción cambia a `canceled`, `unpaid` o `incomplete_expired`, actualiza inmediatamente `tier = 'free'`.
5. **`customer.subscription.deleted`:**
   - Ejecuta `set_user_tier(p_user_id, p_tier: 'free', ...)` o `downgrade_user_by_stripe` para revocar de inmediato los privilegios PRO.

#### Control en Tiendas Nativas (Google Play y Apple App Store)
- En `src/components/subscription/ProModal.tsx` (Líneas 1208–1238):
  - Si la plataforma detectada es nativa (`platform.isNativeApp`), el botón directo a la pasarela de Stripe se oculta, mostrando un mensaje informativo indicando que la suscripción se formaliza a través de la web oficial.
  - Esto cumple estrictamente las directrices **Google Play Developer Policy (sección 3.1.3)** y **Apple App Store Review Guidelines (3.1.1)**, protegiendo a Flashmente de bloqueos o rechazos por inclusión de pasarelas externas dentro de las aplicaciones binarias.

#### El Fallo de Caducidad Pasiva (*Lazy Expiration Gap*)
- En la base de datos se almacena `current_period_end TIMESTAMPTZ`.
- Sin embargo, en la RPC `check_api_limit`:
  ```sql
  -- Evaluación actual en PostgreSQL:
  IF v_rec.tier IN ('pro', 'vip') THEN
     ... (otorga 120 generaciones sin contrastar fecha)
  ```
- **Vulnerabilidad:** Si un usuario cancela su tarjeta bancaria y el webhook de Stripe se pierde por microcortes de red o reintentos expirados, la base de datos conservará `tier = 'pro'` para siempre, porque ninguna función comprueba si `NOW() > current_period_end`.

---

### 3.3. Coherencia en Cliente y Experiencia de Usuario

#### Desbloqueo Inmediato tras Suscripción
- **En `QuickStudyGuideModal.tsx`:**
  - El estado se calcula como `const isUnlocked = isPro || isAdUnlocked;`.
  - Al confirmarse `isPro === true`:
    - El bloque de paywall (`<div className="my-6 ...">`) se desmonta.
    - Los 6 bloques temáticos (`overview`, `taxonomy_tree`, `item_breakdown`, `contrast_tables`, `critical_data`, `mnemonics`) se desenfocan y muestran su contenido completo.
    - Se elimina el bloqueo de exportación e impresión (`handlePrintGuide`), permitiendo generar el PDF limpio en formato A4 sin marcas de agua ni restricciones.
- **En `DecksView.tsx`:**
  - Detecta el parámetro de retorno `?stripe_status=success` y despliega el banner de felicitación con animación.
  - *Área de Mejora:* No realiza una comprobación activa de `session_id`. Si el webhook tarda unos segundos en impactar la base de datos, el usuario verá el banner pero los componentes aún leerán `tier = 'free'` hasta una recarga manual posterior.

---

## 4. PLAN DE ACCIÓN Y RECOMENDACIONES TÉCNICAS

1. **Implementar Lazy Expiration en PostgreSQL (`check_api_limit`):**
   Añadir en la RPC de Supabase una cláusula de degradación automática:
   ```sql
   IF v_rec.tier = 'pro' AND v_rec.current_period_end IS NOT NULL AND v_rec.current_period_end < NOW() THEN
     UPDATE public.api_limits
     SET tier = 'free',
         subscription_status = 'expired',
         updated_at = NOW()
     WHERE user_id = p_user_id;
     v_rec.tier := 'free';
   END IF;
   ```
2. **Eliminar Suplantación de Parámetro `explicitUserId`:**
   En `generateCards.ts`, forzar siempre la resolución de identidad mediante el token de sesión verificado (`supabase.auth.getUser()`), ignorando identificadores de usuario enviados como texto plano por el cliente.
3. **Aislar Privilegios en Mazos Públicos:**
   En `generateDeckSummary.ts`, evaluar siempre el tier del usuario que realiza la petición y nunca el del propietario del mazo cuando el visitante es un usuario ajeno o anónimo.
4. **Endpoint de Verificación Eager de Checkout (`/api/stripe/verify-session`):**
   Al regresar a `/?stripe_status=success&session_id=cs_...`, disparar una llamada rápida al backend para consultar directamente a Stripe y actualizar `api_limits` de forma síncrona sin depender de la cola de webhooks.

---

## 5. VERIFICACIÓN Y SANIDAD DE CÓDIGO

Se ha verificado la integridad de la base de código de `flashcards-app`:
- **TypeScript:** `npx tsc --noEmit` -> **0 errores**.
- **ESLint:** `npx eslint src/ --quiet` -> **0 errores**.
- **Lógica de negocio:** 0 archivos modificados (auditoría estrictamente de solo lectura).
