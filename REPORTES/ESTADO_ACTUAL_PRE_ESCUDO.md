# AUDITORÍA DE ESTADO ACTUAL (PRE-ESCUDO ANTI-MULTICUENTAS)

**Fecha y Hora:** 18 de Noviembre de 2026 - 09:56 UTC  
**Proyecto:** Flashmente (`flashcards-app`)  
**Base de Datos Supabase:** `fapjackhdqtnrpteujum`  
**Último Commit en `main`:** `4125d5d` (*"fix(generate-cards): restore valid PRO quota check after a7b63af"*)  
**Estado de Trabajo:** Árbol limpio, desplegado y sincronizado con `origin/main`  
**Modo:** Estrictamente Solo Lectura (sin modificaciones de código ni migraciones SQL)

---

## 1. RESUMEN EJECUTIVO

Se ha ejecutado una auditoría integral y de solo lectura sobre la base de datos Supabase, el árbol de código en `src/`, las variables de entorno y el estado de despliegue de Flashmente.

El objetivo es establecer la línea base exacta previa a la implementación del **Escudo Anti-Multicuentas por Dispositivo (`device_id`)**, asegurando que no existan colisiones, identificando cómo interactúan hoy las cuotas Free y PRO y documentando el estado actual de los usuarios reales.

### Conclusiones Principales:
1. **Inexistencia Previa de Tablas/Columnas de Dispositivo:** En Supabase no existe ninguna tabla (`device_limits`, `user_devices`) ni columna (`device_id`, `fingerprint`, `hardware`) en los esquemas `public`, `auth` o `storage`.
2. **Identidad y Estado de `angelagmilla@gmail.com`:**
   - Su UUID real en `auth.users` es `9ecc1c13-6dcf-423a-952f-f001c0a3a804`.
   - Posee Plan `pro` activo con 56 generaciones realizadas este mes (`generations_count = 56`), 0 guías desbloqueadas este mes (`guides_unlocked_this_month = 0`).
   - Tiene dos sesiones activas en `auth.sessions` (una desde Windows 10/Chrome y otra desde macOS/Safari, ambas bajo la IP `62.37.5.206`).
   - El identificador `edb52a6e-...` no existe en la base de datos como usuario ni como dispositivo (aparecía únicamente en archivos locales de reportes antiguos como prefijo de una imagen eliminada).
3. **RPCs Atómicas en Supabase:**
   - `check_api_limit(p_user_id uuid)` y `unlock_deck_summary_with_ad(p_user_id uuid, p_deck_id uuid)` operan exclusivamente a nivel de `user_id`. Ninguna de ellas acepta ni valida actualmente un parámetro `device_id`.
   - Vulnerabilidad actual: Cualquier usuario Free que cierre sesión y cree una cuenta nueva con otro email en el mismo navegador/teléfono obtiene inmediatamente 5 generaciones de bienvenida nuevas y 3 guías de estudio gratuitas mensuales adicionales.
4. **Cliente y Server Actions (`src/`):**
   - No existe generador de huella digital ni guardado de `device_id` (`web_...` / `native_...`) en `localStorage`, cookies o encabezados.
   - No existen listas blancas de administración o pruebas (`UNLIMITED_ADMIN_EMAILS`, `UNLIMITED_TEST_DEVICE_IDS`).
5. **Entorno y Secretos:**
   - Todas las variables críticas (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`) están configuradas y activas.

---

## 2. ESTADO DE CUOTAS Y DISPOSITIVOS EN SUPABASE (`fapjackhdqtnrpteujum`)

### A) Inventario de Tablas en Esquema `public`

| Tabla | Propósito Actual | Columnas de Límites / Dispositivos |
| :--- | :--- | :--- |
| `api_limits` | Control central de cuotas por usuario (`user_id`) | `generations_count`, `last_generation_date`, `tier`, `bonus_credits`, `welcome_generations`, `tutor_consultations_count`, `last_tutor_date`, `current_period_end`, `subscription_status`, `tutor_ad_credits`, `guides_unlocked_this_month`, `guides_reset_at` |
| `profiles` | Perfil público y de estudio del usuario | `id`, `username`, `full_name`, `avatar_url`, `request_retention`, `maximum_interval`, `enable_fuzz`, `current_streak`, `longest_streak`, `last_study_date`, `email` |
| `deck_summaries` | Aislamiento de contenido completo de guías de estudio | `deck_id` (PK), `summary_content`, `created_at`, `updated_at` (Protegida con RLS) |
| `decks` | Mazos de tarjetas | `id`, `user_id`, `title`, `summary_preview`, etc. |
| `cards` | Tarjetas de estudio | `id`, `deck_id`, `question`, `answer`, etc. |
| `notes` | Apuntes y notas de usuarios | `id`, `title`, `content`, `created_at`, etc. |
| `interactive_images` | Diagramas e imágenes interactivas | `id`, `deck_id`, etc. |
| `promo_codes` | Códigos promocionales | `code`, `tier`, `max_uses`, etc. |
| `reviews` | Historial de repasos espaciados | `id`, `card_id`, `rating`, `review_time`, etc. |

> **Resultado:** No existe en la actualidad ninguna tabla `device_limits`, `user_devices`, `device_fingerprints` ni campos `device_id` en ninguna tabla pública.

---

### B) Inspección de la Usuaria `angelagmilla@gmail.com`

Se realizó una búsqueda cruzada entre `auth.users`, `public.profiles`, `public.api_limits` y `auth.sessions`:

1. **Datos de Autenticación y Perfil:**
   - **ID de Usuario (`user_id`):** `9ecc1c13-6dcf-423a-952f-f001c0a3a804`
   - **Email:** `angelagmilla@gmail.com` (Verificado: `true`)
   - **Username en `profiles`:** `Angie`
   - **Fecha de Registro:** `2026-10-14 20:28:00 UTC`

2. **Estado en `public.api_limits`:**
   - **Tier:** `'pro'`
   - **Contador de Generaciones (`generations_count`):** `56`
   - **Créditos Bonus:** `0`
   - **Generaciones de Bienvenida:** `0`
   - **Guías Desbloqueadas Este Mes (`guides_unlocked_this_month`):** `0`
   - **Diagnóstico de Cuota:** Saldo disponible de 64 generaciones restantes en su cupo PRO (120 mensuales).

3. **Sesiones Activas en `auth.sessions`:**
   - **Sesión 1 (`47ff1529-54e8-446d-8c54-7a53e09eee31`):**
     - User-Agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36`
     - IP: `62.37.5.206`
     - Fecha: `2026-11-17 10:46:20 UTC`
   - **Sesión 2 (`df981f67-7e92-4734-8fd5-32fcb8f9dc0e`):**
     - User-Agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Safari/605.1.15`
     - IP: `62.37.5.206`
     - Último Refresco de Token: `2026-11-18 09:00:29 UTC`

4. **Aclaración sobre `edb52a6e-...`:**
   - Se ejecutaron consultas en `auth.users`, `public.decks`, `public.cards`, `public.profiles`, `public.api_limits`, `storage.objects` y `auth.audit_log_entries`.
   - **No existe ningún `device_id` ni `user_id` que comience por `edb52a6e`**.
   - Dicho hash corresponde en realidad a una entrada en reportes locales de auditoría de imágenes (`AUDITORIA_STORAGE_E_IMAGENES.md`), no a un identificador de hardware de la app.

---

### C) Definición Exacta de las Funciones RPC de Cuotas

#### 1. `check_api_limit(p_user_id uuid)`
- **Firma:** `check_api_limit(p_user_id uuid) RETURNS jsonb`
- **Parámetros:** Recibe únicamente `p_user_id`. **No recibe `device_id`**.
- **Flujo Interno:**
  1. Inserta fila por defecto en `public.api_limits` si el usuario no existe.
  2. Ejecuta *Lazy Expiration*: si `tier = 'pro'` y `current_period_end < NOW()`, degrada a `'free'` y marca `subscription_status = 'expired'`.
  3. Ejecuta *Lazy Reset Mensual*: compara `last_generation_date` con el mes actual en UTC (`YYYY-MM`). Si ha cambiado de mes, resetea `generations_count = 0`.
  4. **Si `tier IN ('pro', 'vip')`:** Límite mensual de 120 generaciones. Si `count >= 120` -> `'LIMIT_REACHED'`.
  5. **Si `tier = 'free'`:**
     - **Fase de Bienvenida:** Si `welcome_generations < 5`, permite generar sin anuncios (`phase: 'welcome'`).
     - **Fase con Anuncios:** Si `welcome_generations >= 5`:
       - Si `generations_count >= 25` -> `'LIMIT_REACHED'` (30 generaciones totales mensuales).
       - Si `bonus_credits <= 0` -> `'AD_REQUIRED'`.
       - Si `bonus_credits > 0` -> Permite generación (`phase: 'ads'`).

#### 2. `unlock_deck_summary_with_ad(p_user_id uuid, p_deck_id uuid)`
- **Firma:** `unlock_deck_summary_with_ad(p_user_id uuid, p_deck_id uuid) RETURNS jsonb`
- **Parámetros:** Recibe únicamente `p_user_id` y `p_deck_id`. **No recibe `device_id`**.
- **Flujo Interno:**
  1. Bloqueo pesimista con `FOR UPDATE` sobre `public.api_limits`.
  2. *Lazy Expiration* para usuarios PRO con periodo vencido.
  3. Si es PRO o VIP, retorna `{ success: true, allowed: true, is_pro: true, remaining_guides: 9999 }` sin descontar cuota.
  4. Para usuarios Free: *Lazy Reset Mensual* de guías (`guides_reset_at < primer día del mes actual UTC`).
  5. Si `guides_unlocked_this_month >= 3` -> Retorna `{ success: false, error: 'FREE_MONTHLY_LIMIT_REACHED' }`.
  6. Si es menor a 3, incrementa atómicamente `guides_unlocked_this_month = guides_unlocked_this_month + 1` y retorna `{ success: true, remaining_guides: 3 - nuevo_conteo }`.

---

## 3. ESTADO DEL CLIENTE Y SERVER ACTIONS (`src/`)

### A) Detección de Dispositivos y Almacenamiento Local
- **Búsqueda en Frontend:** Se inspeccionó todo `src/` en busca de generadores de huella digital, llamadas a `navigator.userAgent`, Canvas Fingerprinting, AudioContext, o identificadores tipo `web_...` / `native_...`.
- **Resultado:** **No existe ningún mecanismo de generación ni persistencia de `device_id` en el cliente actualmente.**
- La persistencia del cliente en React se limita a:
  - Zustand (`useAuthStore`): `user`, `session`, `isPro`.
  - Supabase Auth Client: Almacena el `access_token` y `refresh_token` de Supabase en LocalStorage / Cookies.

### B) Server Actions de Generación y Guías
1. **`src/app/actions/generateCards.ts`:**
   - Funciones exportadas: `generateCardsAction`, `generateCardsFromDocumentAction`, `generateCardsFromUrlAction`.
   - Flujo de cuota: Llama a `enforceApiLimit(deckId, explicitUserId)` -> invoca la RPC `check_api_limit(resolvedUserId)`.
   - **No recibe ni propaga `deviceId`.**
2. **`src/app/actions/generateDeckSummary.ts`:**
   - Funciones exportadas: `getOrGenerateDeckSummaryAction`, `unlockDeckSummaryWithAdAction`.
   - Flujo de desbloqueo: Valida token con `supabase.auth.getUser(accessToken)` e invoca la RPC `unlock_deck_summary_with_ad(userId, deckId)`.
   - **No recibe ni propaga `deviceId`.**

### C) Listas Blancas en Código
- Se auditó la existencia de listas de exclusión o administradores:
  - `UNLIMITED_ADMIN_EMAILS`: **Inexistente en el código actual.**
  - `UNLIMITED_TEST_DEVICE_IDS`: **Inexistente en el código actual.**
- En [ProModal.tsx](file:///c:/Users/Nacho/OneDrive/Desktop/flashcards-app/src/components/subscription/ProModal.tsx#L1377) únicamente aparece la clave de traducción `"unlimited_gens": "(Hasta 120 generaciones/mes)"`.

---

## 4. VERIFICACIÓN DE DESPLIEGUE Y ENTORNO (GIT / VERCEL)

### A) Estado de Git y Despliegue en Producción
- **Rama Actual:** `main`
- **Sincronización:** `Your branch is up to date with 'origin/main'. Nothing to commit, working tree clean.`
- **Historial de Commits Recientes:**
  - `4125d5d` (HEAD -> main, origin/main): *fix(generate-cards): restore valid PRO quota check after a7b63af*
  - `a7b63af`: *security: harden freemium paywall, atomic ad unlock RPC, deck_summaries isolation and lazy subscription expiration*
  - `5fbdfc4`: *fix(study-guide): anchor print footer strictly to bottom margin with official icon and flashmente.com*

### B) Variables de Entorno en `.env.local`
Se verificó la presencia y activación de todas las variables esenciales para el backend y las Server Actions:

| Variable de Entorno | Estado | Propósito |
| :--- | :---: | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | **Configurada y Activa** | Llamadas seguras desde Server Actions (`enforceApiLimit`, desbloqueo atómico) con bypass de RLS donde se requiere |
| `NEXT_PUBLIC_SUPABASE_URL` | **Configurada y Activa** | Conexión del cliente y del servidor a Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Configurada y Activa** | Operaciones públicas y autenticadas con RLS |
| `STRIPE_SECRET_KEY` | **Configurada y Activa** | Cobros y gestión de suscripciones PRO |
| `STRIPE_WEBHOOK_SECRET` | **Configurada y Activa** | Sincronización de eventos de pago y cancelaciones |
| `GEMINI_API_KEY` | **Configurada y Activa** | Motor de generación de tarjetas y guías exhaustivas |

---

## 5. HOJA DE RUTA RECOMENDADA PARA EL ESCUDO ANTI-MULTICUENTAS

Para cerrar la brecha de multicuentas en el mismo dispositivo de forma limpia y robusta, se recomienda:

1. **Generación del Identificador en Frontend:**
   - Web: Generar un UUID persistente almacenado en `localStorage` con prefijo `web_` (ej. `web_` + `crypto.randomUUID()`).
   - App Móvil (Capacitor/Android): Usar `@capacitor/device` -> `Device.getId()` con prefijo `native_`.
   - Propagar el `deviceId` como cabecera HTTP (`x-device-id`) o parámetro en las Server Actions.

2. **Diseño de Base de Datos en Supabase:**
   - Crear la tabla `public.device_limits`:
     ```sql
     CREATE TABLE public.device_limits (
       device_id TEXT PRIMARY KEY,
       welcome_generations_used INT DEFAULT 0,
       guides_unlocked_this_month INT DEFAULT 0,
       guides_reset_at TIMESTAMPTZ DEFAULT date_trunc('month', NOW() AT TIME ZONE 'UTC'),
       last_seen_user_id UUID REFERENCES auth.users(id),
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );
     ```
   - Crear tabla relacional `public.user_devices (user_id UUID, device_id TEXT, PRIMARY KEY(user_id, device_id))`.

3. **Modificación de RPCs (`check_api_limit` y `unlock_deck_summary_with_ad`):**
   - Recibir `p_device_id TEXT DEFAULT NULL`.
   - Excluir de los límites de dispositivo si el usuario autenticado tiene `tier IN ('pro', 'vip')` o si su email está en la lista blanca de administradores (`UNLIMITED_ADMIN_EMAILS`).
   - Si el dispositivo ya agotó las 5 generaciones de bienvenida (incluso con otro usuario), no otorgar nuevas generaciones de bienvenida en el nuevo registro.
   - Si el dispositivo ya desbloqueó 3 guías de estudio gratuitas este mes, bloquear solicitudes adicionales desde el mismo hardware.

4. **Listas Blancas Seguras:**
   - Definir `UNLIMITED_ADMIN_EMAILS` (ej. `nachomoltol@gmail.com`) y `UNLIMITED_TEST_DEVICE_IDS` centralizados tanto en Postgres (en una tabla o constante SQL) como en un archivo de configuración del servidor (`src/lib/config/whitelist.ts`), permitiendo realizar pruebas y QA sin alterar las cuotas reales.
