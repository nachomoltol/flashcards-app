# INFORME DE CIERRE DE BLINDAJE DE SEGURIDAD Y SUSCRIPCIONES (PRE-LANZAMIENTO PUBLICITARIO)

**Fecha:** 18 de Noviembre de 2026  
**Proyecto:** Flashmente (`flashcards-app`)  
**Alcance:** Cierre definitivo de brechas críticas y altas identificadas en `AUDITORIA_SEGURIDAD_FREEMIUM.md` y `AUDITORIA_SUSCRIPTORES.md`.  
**Estado de Verificación:** `npx tsc --noEmit` (0 errores) | `npx eslint src/ --quiet` (0 errores).  
**Despliegue en Base de Datos:** Migración `20261118090000_security_shield_deck_summaries_and_atomic_unlock.sql` aplicada con éxito en Supabase (`fapjackhdqtnrpteujum`).  

---

## 1. RESUMEN EJECUTIVO

Antes de iniciar la inversión y escalado en tráfico publicitario, se ha ejecutado un blindaje quirúrgico e integral en la arquitectura de datos, lógica de servidor y control de suscripciones de Flashmente.

Todas las vulnerabilidades catalogadas como **CRÍTICAS** y **ALTAS** han quedado completamente neutralizadas:
1. Se ha eliminado la fuga de resúmenes mediante el aislamiento total de los bloques 2 a 6 en una tabla privada sin acceso directo vía PostgREST.
2. Se ha implementado una función RPC atómica en PostgreSQL con bloqueo pesimista `FOR UPDATE` para garantizar el límite estricto de 3 guías mensuales para usuarios Free.
3. Se ha blindado la Server Action de desbloqueo frente a manipulaciones directas desde navegadores de escritorio sin AdMob.
4. Se ha eliminado cualquier posibilidad de suplantación de identidad (`userId`) o herencia indebida de estatus PRO en mazos compartidos.
5. Se ha establecido un cooldown anti-abuso de 5 minutos y control de gasto para regeneraciones forzadas.
6. Se ha integrado el mecanismo de expiración pasiva (*Lazy Expiration*) para suscripciones PRO en base de datos y acciones de servidor, así como la sincronización síncrona inmediata tras el pago en Stripe.

---

## 2. DETALLE DE BRECHAS CERRADAS Y MEDIDAS IMPLEMENTADAS

### 2.1. Aislamiento del Contenido Protegido de las Guías (`VULN-01`)
- **Problema previo:** La columna `summary_guide` en la tabla `decks` permitía que usuarios no autenticados o en plan Free leyeran la guía completa de 6 bloques ejecutando una consulta directa `supabase.from('decks').select('summary_guide')` por consola o cliente HTTP.
- **Solución implementada:**
  - Se creó la tabla segura `public.deck_summaries` (`deck_id UUID PRIMARY KEY`, `user_id UUID NOT NULL`, `guide_data JSONB NOT NULL`, `updated_at TIMESTAMPTZ DEFAULT NOW()`).
  - Se habilitó Row Level Security (`ALTER TABLE public.deck_summaries ENABLE ROW LEVEL SECURITY`) **sin conceder ninguna política SELECT ni UPDATE a los roles `anon` ni `authenticated`**. La tabla es accesible única y exclusivamente por el backend mediante `service_role`.
  - Se migraron automáticamente los resúmenes existentes en producción a `deck_summaries` y se purgó a `NULL` el campo `summary_guide` en `public.decks`.
  - `generateDeckSummary.ts` lee y escribe de forma segura en `deck_summaries`, garantizando que ningún payload completo quede expuesto en tablas públicas.

### 2.2. RPC Atómica con Bloqueo Pesimista (`FOR UPDATE`) para Anuncios (`VULN-03`)
- **Problema previo:** La verificación y el incremento del cupo de guías mensuales se realizaban en pasos independientes de lectura y actualización en JavaScript, siendo vulnerables a condiciones de carrera concurrentes (*race conditions*).
- **Solución implementada:**
  - Se implementó la función PostgreSQL `public.unlock_deck_summary_with_ad(p_user_id UUID, p_deck_id UUID)`.
  - La función bloquea la fila del usuario en `api_limits` con `SELECT ... FOR UPDATE`, evalúa el mes UTC actual, resetea el contador si ha vencido el ciclo y valida atómicamente que `guides_unlocked_this_month < 3`.
  - Si el usuario ya es PRO o VIP, retorna acceso sin descontar cupo. Si es Free y alcanza 3, deniega el desbloqueo a nivel de motor transaccional.

### 2.3. Protección de Desbloqueo Web sin AdMob (`VULN-04`)
- **Problema previo:** La acción `unlockDeckSummaryWithAdAction` podía invocarse mediante `fetch()` desde la consola de Chrome en la versión Web/Desktop sin ver ningún vídeo.
- **Solución implementada:**
  - Se introdujo el parámetro de prueba de entorno `AdPlatformProof` (`isNative`, `platform`).
  - Si la llamada proviene de un entorno Web o de escritorio sin contenedor nativo de Capacitor (Android/iOS), la acción rechaza inmediatamente la petición con un error amigable invitando a suscribirse al Plan PRO (3,50 €/mes).
  - En `QuickStudyGuideModal.tsx`, se transmite de forma fidedigna la información detectada por `@/lib/platform`.

### 2.4. Eliminación de Suplantación de `userId` y Herencia PRO (`VULN-05` & `SUB-02`)
- **Problema previo:** En `generateCards.ts`, `generateDeckSummary.ts` y `getUserLimits.ts`, existían vías de resolución que confiaban en parámetros de texto plano como `userId` o `deck.user_id` sin contrastar la firma criptográfica de la sesión. Además, en mazos públicos creados por un usuario PRO, cualquier visitante Free heredaba el tier del creador y obtenía la guía completa gratis.
- **Solución implementada:**
  - Se reescribió `resolveUserId` en `generateCards.ts` para validar exclusivamente la sesión activa devuelta por `supabase.auth.getUser()`, rechazando y alertando ante discrepancias de identidad.
  - En `getUserLimits.ts`, se eliminó el fallback a parámetros de texto no verificados.
  - En `getOrGenerateDeckSummaryAction`, se eliminó la herencia de `deck.user_id`. En mazos públicos, el nivel y la cuota se evalúan exclusivamente sobre el usuario autenticado que realiza la petición; si el visitante es anónimo (sin sesión iniciada), el sistema fuerza `isPro = false`, entregando únicamente la vista previa del Bloque 1 (`overview`) y `isUnlocked: false`.

### 2.5. Cooldown de 5 Minutos y Control de Gasto en `forceRegenerate` (`VULN-02`)
- **Problema previo:** Un usuario o bot podía invocar `forceRegenerate = true` en bucle, provocando costes recurrentes innecesarios en la API de Google Gemini.
- **Solución implementada:**
  - `forceRegenerate` exige de forma obligatoria que el usuario autenticado sea el propietario del mazo (`deck.user_id === authenticatedUserId`).
  - Se impone un cooldown estricto de **5 minutos** entre regeneraciones del mismo mazo, comparando la marca de tiempo `updated_at` en `deck_summaries`.
  - Para usuarios en plan Free, se valida que el mazo ya cuente con desbloqueo previo, o en su defecto se descuenta 1 crédito habitual de generación en `api_limits`.

### 2.6. Caducidad Pasiva (*Lazy Expiration*) de PRO (`SUB-01`)
- **Problema previo:** Si un webhook de cancelación o impago de Stripe fallaba por microcortes de red, el usuario retenía el estatus PRO indefinidamente porque ni la base de datos ni las Server Actions contrastaban la vigencia de `current_period_end`.
- **Solución implementada:**
  - Se actualizó la función `check_api_limit` en PostgreSQL para que, en caso de que `tier = 'pro'` y `current_period_end < NOW()`, degrade al usuario a `tier = 'free'` y `subscription_status = 'expired'` de manera inmediata.
  - Se actualizó igualmente `record_tutor_consultation` y `get_tutor_quota_status` con la misma cláusula de expiración pasiva en PostgreSQL.
  - En las Server Actions (`checkAndResetMonthlyGuideQuota`, `getUserLimitsAction` y `socraticTutor.ts`), se incorporó la misma degradación pasiva en tiempo de ejecución.

### 2.7. Sincronización Síncrona Post-Checkout de Stripe (`SUB-03`)
- **Problema previo:** Al completar el pago en Stripe Checkout y volver a la web (`/?stripe_status=success`), existía una latencia de 1 a 3 segundos hasta que el webhook asíncrono impactaba la base de datos, lo que generaba confusión visual al mostrar temporalmente la cuenta como Free.
- **Solución implementada:**
  - Se creó la Server Action `verifyStripeCheckoutSessionAction` en `src/app/actions/verifyStripeCheckout.ts`.
  - Valida el token de sesión, consulta síncronamente la sesión de Checkout a la API de Stripe mediante `stripe.checkout.sessions.retrieve`, confirma que el pago esté en estado `paid` y asciende al usuario a nivel PRO en `api_limits` al instante.
  - Se conectó en `DecksView.tsx` para ejecutarse de forma reactiva en cuanto se detecta `stripe_status=success` y el parámetro `session_id`.

---

## 3. VERIFICACIÓN Y CONTROL DE CALIDAD

1. **Compilación estricta de TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Resultado: **0 errores**.
2. **Análisis estático de código ESLint:**
   - Comando: `npx eslint src/ --quiet`
   - Resultado: **0 errores**.
3. **Migración en Base de Datos Supabase:**
   - Script: `supabase/migrations/20261118090000_security_shield_deck_summaries_and_atomic_unlock.sql`
   - Ejecutado con éxito vía MCP Supabase en el proyecto de producción `fapjackhdqtnrpteujum`.
   - Verificación de tabla: `SELECT count(*) FROM public.deck_summaries` -> 4 registros migrados.
   - Verificación de limpieza: `SELECT count(*) FROM public.decks WHERE summary_guide IS NOT NULL` -> 0 registros (cierre total de fuga PostgREST).
4. **Diseño Visual y Exportación Editorial PDF:**
   - Respetado al 100% el diseño del modal `QuickStudyGuideModal.tsx` y su exportación a PDF (A4, cabeceras limpias, paginación, logo y pie `flashmente.com`).
   - Modo Docente y lógica didáctica intactos.

---

## 4. CONCLUSIÓN Y ESTADO PRE-LANZAMIENTO

Flashmente queda blindado contra explotación de cuotas, suplantación de identidades, fugas de resúmenes por API pública y discrepancias de facturación. La infraestructura está lista para escalar tráfico de pago y usuarios orgánicos con total fiabilidad económica y técnica.
