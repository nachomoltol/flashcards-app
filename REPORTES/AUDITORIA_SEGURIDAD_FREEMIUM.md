# INFORME DE AUDITORÍA FORENSE: SEGURIDAD Y LÍMITES FREEMIUM / PRO EN FLASHMENTE

**Fecha:** 17 de noviembre de 2026  
**Auditor:** Antigravity Forensic Security Engine  
**Ámbito:** Server Actions (`generateDeckSummary.ts`, `claimAdReward.ts`, `socraticTutor.ts`), Base de Datos Supabase (PostgreSQL RLS, RPCs, `api_limits`) y SDK de Publicidad AdMob (`src/lib/admob.ts`).  
**Estado de la Auditoría:** COMPLETADA SIN MODIFICACIÓN DE ARCHIVOS DE PRODUCCIÓN.

---

## 1. RESUMEN EJECUTIVO Y MATRIZ DE RIESGO

Se ha realizado una auditoría estricta de seguridad sobre los flujos de autorización, consumo de IA (Google Gemini 2.5 Flash / Flash-Lite) y monetización Freemium/PRO de Flashmente, enfocándose específicamente en el sistema de **3 Guías de Repaso mensuales gratuitas**, los **desbloqueos mediante anuncios bonificados (AdMob)** y la **integridad de las cuotas en Supabase (`api_limits`)**.

### Matriz de Hallazgos

| ID | Componente / Flujo | Severidad | Estado | Resumen |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | `api_limits` (PostgreSQL RLS) | **SEGURO** | ✅ Verificado | RLS activo. Solo existe política `SELECT` para `auth.uid() = user_id`. Ningún cliente puede hacer `UPDATE` directo para resetear o trucar sus cuotas. |
| **SEC-02** | Entrega de Contenido Protegido (Bloques 2-6) | **SEGURO** | ✅ Verificado | En usuarios Free, el servidor recorta estrictamente la respuesta a `previewGuide` (únicamente Bloque 1 Overview). El contenido sensible jamás viaja por la red sin desbloqueo. |
| **SEC-03** | Límite Máximo de 3 Guías/Mes en Servidor | **SEGURO** | ✅ Verificado | `unlockDeckSummaryWithAdAction` aplica el corte duro `guidesUnlockedThisMonth >= 3` impidiendo desbloquear una 4.ª guía sin plan PRO. |
| **SEC-04** | Validación de Plataforma en AdMob (Web vs Móvil) | **MEDIO** | ⚠️ Advertencia | `showAdMobRewardedAd` bloquea correctamente en frontend web, pero `unlockDeckSummaryWithAdAction` no valida en backend si la petición procede de app móvil nativa o navegador web. |
| **SEC-05** | Validación de Sesión en `generateDeckSummary.ts` | **ALTO** | ⚠️ Vulnerabilidad | Línea 675 de `getOrGenerateDeckSummaryAction` confía en `resolvedUserId` sin token si coincide con `deck.user_id`. `generateExhaustiveSummaryFromRawText` no valida sesión ni propiedad del mazo. |
| **SEC-06** | Concurrencia y Atomicidad en Cuota de Guías | **MEDIO** | ⚠️ Optimizable | La verificación e incremento de `guides_unlocked_this_month` utiliza `SELECT` + `UPDATE` en capa Node.js en vez de una RPC atómica con `FOR UPDATE` (posible TOCTOU por concurrencia extrema). |
| **SEC-07** | Control de `forceRegenerate` e Invocación a Gemini | **MEDIO** | ⚠️ Optimizable | Usuarios Free pueden solicitar regeneración con IA en mazos propios sin limitador de frecuencia (rate limit) de llamadas a Gemini. |

---

## 2. AUDITORÍA DETALLADA DE SERVER ACTIONS

### 2.1. `getOrGenerateDeckSummaryAction` (`src/app/actions/generateDeckSummary.ts`)

#### A. Resolución de Identidad y Autenticación
La Server Action implementa una resolución de usuario en cascada:
1. **Token JWT explícito:** Verifica con `supabase.auth.getUser(resolvedToken)`. Si es válido, extrae `tokenUser.id`.
2. **Cookies de sesión de Next.js:** Verifica con `supabase.auth.getUser()`. Si es válido, extrae `cookieUser.id`.
3. **Parámetro del cliente (Hallazgo de Riesgo):**
   ```typescript
   // Línea 675 en src/app/actions/generateDeckSummary.ts
   if (!authenticatedUserId && resolvedUserId && resolvedUserId === deck.user_id) {
     authenticatedUserId = resolvedUserId;
   }
   ```
   * **Vector de Ataque:** Si un usuario anónimo o un atacante conoce el `id` de un mazo privado ajeno y el `user_id` de su propietario, puede pasar `resolvedUserId = deck.user_id`. El servidor asignará `authenticatedUserId = resolvedUserId`, pasando la validación `isOwner` y permitiendo leer la vista previa o desencadenar la generación con IA.
   * **Recomendación:** Eliminar la línea 675. Si `authenticatedUserId` no se extrae de un JWT criptográficamente verificado o de cookies de sesión válidas, el usuario debe ser tratado como anónimo y solo acceder a mazos públicos (`is_public = true`).

#### B. Protección de Bloques y Fuga de Información
* **Comportamiento auditado:** Líneas 769 a 797.
  * Si el usuario es PRO/VIP: Retorna `{ success: true, isUnlocked: true, summary: completeGuide }`.
  * Si el usuario es Free: Se construye un objeto `previewGuide` que contiene **únicamente los metadatos y el Bloque 1 (Visión Panorámica / Objetivos)**:
    ```typescript
    const previewGuide: Partial<ExhaustiveDeckSummaryGuide> = {
      title: completeGuide.title,
      subtitle: completeGuide.subtitle,
      deckTitle: completeGuide.deckTitle,
      generatedAt: completeGuide.generatedAt,
      cardCount: completeGuide.cardCount,
      overview: completeGuide.overview,
    };
    ```
  * **Conclusión de Seguridad:** **IMPECABLE.** Los Bloques 2 (Taxonomía), 3 (Desglose individual), 4 (Tablas comparativas), 5 (Cifras críticas) y 6 (Mnemotecnias) son purgados antes del retorno serializado. Un usuario Free inspeccionando la pestaña Network de DevTools jamás recibirá la guía completa.

---

### 2.2. `unlockDeckSummaryWithAdAction` (`src/app/actions/generateDeckSummary.ts`)

#### A. Verificación de Autenticación
* A diferencia de la acción de consulta, `unlockDeckSummaryWithAdAction` es estricta:
  ```typescript
  if (!authenticatedUserId) {
    return { success: false, error: 'AUTH_REQUIRED' };
  }
  ```
  Ningún usuario anónimo puede canjear desbloqueos.

#### B. Aplicación del Límite de 3 Guías al Mes
* El servidor ejecuta `checkAndResetMonthlyGuideQuota`:
  * Si el mes natural ha cambiado respecto a `guides_reset_at`, resetea `guides_unlocked_this_month = 0`.
  * Si `quota.guidesUnlockedThisMonth >= 3`, bloquea la ejecución y retorna:
    ```typescript
    return {
      success: false,
      error: 'FREE_MONTHLY_LIMIT_REACHED',
      isUnlocked: false,
      guidesUnlockedThisMonth: quota.guidesUnlockedThisMonth,
      maxFreeGuidesPerMonth: 3,
    };
    ```
  * **Conclusión de Seguridad:** El límite de 3 guías mensuales está anclado en backend y no puede saltarse modificando variables locales en el navegador o emulador móvil.

---

### 2.3. `generateExhaustiveSummaryFromRawText` (`src/app/actions/generateDeckSummary.ts`)

#### A. Análisis de Riesgo
* Esta acción fue diseñada para pre-generar la guía en memoria al subir un documento (`DocumentUploader.tsx`).
* **Vulnerabilidad detectada:** Es una función marcada con `'use server'` que recibe `(deckId, userId, rawDocumentText, locale)` pero **no verifica** `supabase.auth.getUser()`, ni comprueba que `deck.user_id === authenticatedUserId`.
* Utiliza `getServerSupabaseClient()` con privilegios de `service_role`.
* **Impacto:** Un usuario malicioso podría invocar remotamente esta Server Action por POST con un payload de hasta 120.000 caracteres apuntando al `id` de cualquier mazo para sobrescribir su columna `summary_guide` y consumir tokens de la API de Gemini del proyecto.
* **Recomendación:** Añadir validación de sesión (`const user = await getAuthenticatedUser()`) y verificar que `deck.user_id === user.id`.

---

## 3. AUDITORÍA DE ENTORNOS SIN ADMOB (DESKTOP / WEB vs MÓVIL)

### 3.1. Protección en Frontend (`src/lib/admob.ts`)
* En `showAdMobRewardedAd()`:
  ```typescript
  const platform = detectPlatform();
  if (!platform.isNativeApp) {
    if (typeof window !== 'undefined') {
      useProModalStore.getState().openProModal(false);
    }
    return {
      completed: false,
      error: 'Los anuncios bonificados están disponibles exclusivamente en las aplicaciones móviles. Pasa a PRO para continuar en Web.',
    };
  }
  ```
* En la interfaz web de escritorio, al pulsar "Desbloquear con anuncio", el botón no otorga recompensas: bloquea la acción y abre el modal de suscripción PRO.

### 3.2. Vector de Invocación Directa por Red (API / DevTools)
* Si un usuario Free en la versión Web abre la consola o usa `fetch()` para llamar directamente a la Server Action `unlockDeckSummaryWithAdAction(deckId, accessToken)`:
  * El servidor **no comprueba** si la llamada proviene de la app Android/iOS o de Chrome Desktop.
  * Tampoco existe validación de firma SSV (Server-Side Verification) de Google AdMob.
  * **Alcance del impacto:** El usuario podrá desbloquear guías desde la web sin ver el anuncio, **PERO únicamente hasta un máximo de 3 guías en todo el mes**. Llegado a 3, el servidor rechaza toda petición subsiguiente.
* **Recomendación para blindaje total:**
  * Implementar verificación de User-Agent o un token de sesión de Capacitor firmado, o bien configurar el callback oficial de Server-Side Verification (SSV) de AdMob con par de claves pública/privada de Google.

---

## 4. VERIFICACIÓN DE RATE LIMITING E INTEGRIDAD EN SUPABASE

### 4.1. Auditoría Forense de Políticas RLS (`pg_policies`)

Se ejecutó una consulta directa sobre el catálogo de PostgreSQL de Supabase en producción:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'api_limits';
```

**Resultado obtenido:**
```json
[
  {
    "schemaname": "public",
    "tablename": "api_limits",
    "policyname": "Users can read own api limits",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "qual": "(auth.uid() = user_id)",
    "with_check": null
  }
]
```

### 4.2. Conclusiones de Integridad de la Base de Datos
1. **Inmunidad contra manipulaciones client-side:**
   * La tabla `api_limits` **solo permite `SELECT`** para usuarios autenticados sobre su propia fila (`auth.uid() = user_id`).
   * No existe **ninguna política de `INSERT`, `UPDATE` ni `DELETE`** para usuarios `authenticated` o `anon`.
   * Cualquier intento desde el cliente de ejecutar:
     ```javascript
     supabase.from('api_limits').update({ guides_unlocked_this_month: 0 }).eq('user_id', myId);
     supabase.from('api_limits').update({ tier: 'vip' }).eq('user_id', myId);
     ```
     es fulminantemente bloqueado a nivel de motor PostgreSQL con `0 rows affected` o error de permisos RLS.
2. **Acceso exclusivo por `service_role`:**
   * Los campos `guides_unlocked_this_month`, `guides_reset_at`, `tier`, `bonus_credits` y `generations_count` solo pueden ser alterados por Server Actions que dispongan de `SUPABASE_SERVICE_ROLE_KEY` o funciones RPC con `SECURITY DEFINER`.

### 4.3. Análisis de Concurrencia (Race Condition / TOCTOU)
* En `unlockDeckSummaryWithAdAction`:
  * El código realiza un `SELECT` de `guides_unlocked_this_month`, evalúa `< 3` en Node.js y luego ejecuta un `UPDATE`.
  * Si un usuario ejecuta peticiones HTTP paralelas exactamente al mismo milisegundo, existe una ventana de condición de carrera (*Time-of-Check to Time-of-Use*).
* **Solución existente en el proyecto como referencia:**
  * Para los límites de generación de tarjetas y consultas del tutor socrático, el proyecto ya implementó en la migración `20261112140000_decouple_tutor_and_free_quota_30.sql` funciones RPC con `SELECT ... FOR UPDATE;` que bloquean la fila transaccionalmente.
* **Recomendación:** Crear una función RPC `increment_guide_unlock(p_user_id UUID)` en PostgreSQL que realice la verificación y el incremento en una única transacción atómica con `FOR UPDATE`.

---

## 5. AUDITORÍA DE CONSUMO DESATENDIDO DE IA (GEMINI)

1. **Reconstrucción sobre tarjetas existentes:**
   * `getOrGenerateDeckSummaryAction` limita la consulta de tarjetas a `.limit(400)`, evitando desbordar el contexto de la ventana de Gemini o disparar costes desmedidos.
2. **Caché en base de datos:**
   * Si `deck.summary_guide` ya existe y no se especifica `forceRegenerate: true`, **no se llama a Gemini**, reutilizándose la guía normalizada instantáneamente (`cached: true`).
3. **Control de `forceRegenerate`:**
   * Actualmente, cualquier usuario propietario puede enviar `forceRegenerate: true`. Si un usuario Free pulsa repetidamente o automatiza la llamada, podría forzar invocaciones repetidas a Gemini.
   * **Recomendación:** Condicionar `forceRegenerate` a usuarios con `isPro === true`, o limitar la regeneración a un máximo de 1 vez por hora por mazo.

---

## 6. PLAN DE ACCIÓN RECOMENDADO

### Prioridad 1 (Alta Seguridad - Inmediata)
- [ ] **Eliminar el fallback de línea 675 en `getOrGenerateDeckSummaryAction`:** Exigir siempre token de sesión válido o cookie verificada.
- [ ] **Proteger `generateExhaustiveSummaryFromRawText`:** Validar que el usuario que sube el archivo esté autenticado y sea el propietario del `deckId`.

### Prioridad 2 (Integridad Transaccional y Anti-Abuso)
- [ ] **Migrar incremento de guías a RPC atómica:** Crear `public.claim_guide_unlock(p_user_id UUID)` en PostgreSQL con `FOR UPDATE` para erradicar cualquier riesgo de condición de carrera concurrente.
- [ ] **Validación de entorno en `unlockDeckSummaryWithAdAction`:** Rechazar el desbloqueo si los headers de la petición demuestran que no se ejecuta en una plataforma móvil autorizada (o exigir ticket de sesión nativa).

### Prioridad 3 (Optimización de Costes de IA)
- [ ] **Restricción de `forceRegenerate`:** Permitir regeneración forzada únicamente a cuentas PRO/VIP o aplicar *cooldown* de 60 minutos entre regeneraciones del mismo mazo.

---

## 7. VERIFICACIÓN Y COMPROBACIÓN DEL ENTORNO

Se ejecutaron los comandos de verificación obligatorios en el repositorio:
1. `npx tsc --noEmit` -> **0 errores de compilación**.
2. `npx eslint src/ --quiet` -> **0 errores de linter**.
3. Integridad de base de datos Supabase -> **Políticas RLS en `api_limits` e integridad de esquemas 100% operativas**.

---

*Informe redactado y sellado en el repositorio bajo `REPORTES/AUDITORIA_SEGURIDAD_FREEMIUM.md`.*
