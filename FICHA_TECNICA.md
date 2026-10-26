# FICHA TÉCNICA INTEGRAL DEL SISTEMA: FLASHMENTE
> **Documento de Arquitectura, Estado de Módulos, Esquema de Datos y Diagnóstico Técnico**  
> *Diseñado para lectura, análisis e ingesta automática por modelos de Inteligencia Artificial (Google Gemini, Claude, etc.) y desarrolladores.*  
> **Fecha de actualización:** 16 de octubre de 2026  
> **Versión del código:** 1.0.3 (Android VersionCode: 4)  
> **Dominio de producción:** [https://flashmente.com](https://flashmente.com) / [https://www.flashmente.com](https://www.flashmente.com)  
> **Package ID (Android):** `com.flashmente.app`  
> **Repositorio:** `nachomoltol/flashcards-app`  

---

## 1. RESUMEN EJECUTIVO Y VISIÓN GENERAL

**Flashmente** es una aplicación multiplataforma (Web Desktop, PWA móvil y Android Nativo vía Capacitor) orientada al aprendizaje acelerado y la retención nemotécnica a largo plazo. Combina dos tecnologías núcleo:
1. **Inteligencia Artificial Multimodal (Google Gemini):** Extracción pedagógica y generación automatizada de tarjetas de estudio a partir de textos, documentos PDF, Word (.docx/.doc), pistas de audio, vídeos de YouTube y enlaces web.
2. **Repetición Espaciada FSRS v5 (`ts-fsrs`):** Algoritmo matemático moderno de optimización de memoria a largo plazo que sustituye al tradicional SM-2 de Anki con calibración adaptativa de estabilidad, dificultad y retención.

---

## 2. MAPA DE ARQUITECTURA Y STACK TECNOLÓGICO

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CANALES DE CONSUMO                              │
├───────────────────────────────┬────────────────────────────────────────┤
│   Navegadores Web & PWA       │   App Nativa Android (Capacitor 8)     │
│   (Chrome, Safari, Firefox)   │   Google Play Store (.aab / versionCode 4)│
└───────────────────────────────┴────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND & SERVERLESS RUNTIME                   │
│   Next.js 15.5.27 (Turbopack, App Router, React 19.1.0, Tailwind v4)   │
│   Alojado y desplegado en la red Edge/Serverless global de Vercel      │
└────────────────────────────────────────────────────────────────────────┘
           │                        │                         │
           ▼                        ▼                         ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  SUPABASE POSTGRES   │ │   GOOGLE GENAI API   │ │   STRIPE & RESEND    │
│  - GoTrue Auth (JWT) │ │ - gemini-3.1-flash-  │ │ - Checkout & Webhook │
│  - 6 Tablas RLS      │ │   lite (Económico)   │ │ - Resend Emails      │
│  - 10 RPCs Security  │ │ - Grounding Estricto │ │ - Google AdMob       │
│  - Storage Buckets   │ │ - Anti-Duplicados    │ │   Rewarded Ads       │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

### 2.1. Tecnologías Base
* **Framework:** Next.js 15.5.27 con App Router y Turbopack.
* **Librería de UI:** React 19.1.0 (Concurrent Mode, Server Components y Server Actions).
* **Estilos:** Tailwind CSS v4 (`@tailwindcss/postcss`).
* **Lenguaje:** TypeScript 5 en modo estricto.
* **Gestor de Estado Global:** Zustand 5.0.15 (11 stores desacoplados).
* **Envoltorio Móvil:** Capacitor 8.5.3 (`@capacitor/android`, `@capacitor/core`, `@capacitor/cli`).
* **Base de Datos y Auth:** Supabase (`@supabase/supabase-js` v2.117.2, PostgreSQL 14.18).
* **Motor de IA:** `@google/genai` v2.27.0 (`gemini-3.1-flash-lite`).
* **Pasarela de Pago:** Stripe SDK v23.0.0.
* **Servicio de Correos:** Resend SDK v6.32.1.
* **Algoritmo de Memoria:** `ts-fsrs` v5.4.2.

---

## 3. AUDITORÍA DE MÓDULOS FINALIZADOS

### 3.1. Autenticación Cruzada e Híbrida (Auth)
* **Archivos fuente:**
  * `src/app/auth/callback/page.tsx`
  * `src/components/auth/AuthForm.tsx`
  * `src/app/actions/deleteAccount.ts`
  * `src/lib/onboarding/seedGuideDeck.ts`
  * `src/lib/platform.ts`
* **Características implementadas:**
  * **Intercambio Multi-Flujo en Callback:** Resuelve de forma robusta enlaces mágicos, confirmaciones por correo y sesiones activas mediante 4 vías jerárquicas:
    1. Intercambio de código PKCE: `supabase.auth.exchangeCodeForSession(code)`.
    2. Fallback de verificación OTP: `supabase.auth.verifyOtp({ token_hash, type: 'email' })`.
    3. Fragmento Hash implícito: Captura `#access_token=...&refresh_token=...` con `supabase.auth.setSession`.
    4. Sesión precargada: `supabase.auth.getSession()`.
  * **Onboarding Automatizado Idempotente:** Tras validar la cuenta, llama a `ensureQuickGuideDeck(userId)` para crear un mazo tutorial con 5 preguntas interactivas si el usuario es nuevo.
  * **Cuenta Demo de 1 Clic:** Botón directo en el login con credenciales `demo@flashcards.app` para revisión y testing rápido.
  * **Cumplimiento de Supresión de Cuenta (Google Play Compliance):**
    * Componente: `src/components/auth/DeleteAccountModal.tsx` montado en el layout principal.
    * Server Action: `deleteAccountAction(userId)` invoca `SUPABASE_SERVICE_ROLE_KEY` para purgar de la base de datos `reviews`, `cards`, `decks`, `profiles`, `api_limits` y remueve el usuario con `auth.admin.deleteUser`.

### 3.2. Base de Datos y Persistencia (Supabase)
* **Instancia:** PostgreSQL 14.18 (Project Ref: `fapjackhdqtnrpteujum`).
* **Esquema de Tablas (6 Tablas con Row Level Security activado):**
  1. **`decks`:** Árbol jerárquico de carpetas y mazos de estudio.
     * Columnas: `id` (UUID), `user_id` (UUID), `parent_id` (UUID nullable), `title`, `description`, `color`, `is_folder` (bool), `is_public` (bool), `share_id` (text unique), `is_collaborative` (bool), `created_at`, `updated_at`.
  2. **`cards`:** Flashcards de estudio asociadas a un mazo.
     * Columnas: `id` (UUID), `deck_id` (UUID), `front`, `back`, `card_format` (`'basic' | 'multiple_choice' | 'cloze' | 'true_false'`), `due` (timestamptz), `stability` (float), `difficulty` (float), `state` (int), `reps` (int), `lapses` (int), `last_review` (timestamptz nullable), `created_at`, `updated_at`.
  3. **`notes`:** Documentos base asociados a las tarjetas con contenido semiestructurado (`fields` JSONB, `tags` text[]).
  4. **`reviews`:** Registro transaccional de cada respuesta en estudio para cálculo de curvas de olvido y métricas en `/stats`.
     * Columnas: `id` (UUID), `card_id` (UUID), `user_id` (UUID), `rating` (1-4), `state`, `due`, `stability`, `difficulty`, `created_at`.
  5. **`profiles`:** Configuración de retención FSRS y preferencias del usuario.
     * Columnas: `id` (UUID), `username`, `full_name`, `avatar_url`, `request_retention` (default 0.90), `maximum_interval` (default 365), `enable_fuzz` (default true), `created_at`, `updated_at`.
  6. **`api_limits`:** Monitoreo de cuotas de Inteligencia Artificial y niveles de suscripción.
     * Columnas: `user_id` (UUID), `generations_count` (int), `last_generation_date` (text), `tier` (`'free' | 'pro' | 'vip'`), `bonus_credits` (int default 0), `stripe_customer_id`, `stripe_subscription_id`, `created_at`, `updated_at`.
* **Procedimientos Almacenados (10 RPCs con `SECURITY DEFINER`):**
  * `check_api_limit(p_user_id)`: Valida saldo mensual (10 generaciones gratuitas), créditos bonificados acumulados o bypass PRO/VIP.
  * `increment_api_generation(p_user_id)`: Deduce créditos de anuncios o incrementa el contador mensual.
  * `add_bonus_credit(p_user_id, p_amount)`: Suma atómicamente créditos de recompensa AdMob.
  * `get_deck_owner(p_deck_id)`: Obtiene el creador del mazo para Server Actions.
  * `redeem_promo_code(p_code, p_user_id)`: Canjea cupones para desbloquear niveles PRO/VIP.
  * `import_shared_deck(p_share_id, p_target_user_id)`: Clona un mazo público reinicializando el algoritmo FSRS para el receptor.
  * `set_user_tier(p_user_id, p_tier, p_customer_id, p_subscription_id)`: Actualiza nivel PRO desde webhooks de Stripe.
  * `downgrade_user_by_stripe(p_subscription_id, p_customer_id)`: Reversa privilegios a `'free'` al expirar o cancelarse la suscripción.
  * `get_user_api_limits(p_user_id)`: Lectura segura de consumo.
  * `record_api_generation(p_user_id, p_new_count, p_date)`: Registro directo de generación.
* **Storage Cloud:** Bucket `user-documents` para ingesta de archivos multimodales temporales.

### 3.3. Pasarela de Pago y Suscripciones (Stripe)
* **Archivos fuente:**
  * `src/app/api/stripe/checkout/route.ts`
  * `src/app/api/stripe/webhook/route.ts`
  * `src/lib/stripe.ts`
  * `src/components/subscription/ProModal.tsx`
* **Modelo Comercial:** Suscripción mensual única a 3,50€/mes (`STRIPE_PRICE_MONTHLY`).
* **Flujo Checkout:** Recibe `userId` y `email`, crea la sesión de suscripción en Stripe inyectando metadatos y devuelve la URL segura con flags de retorno (`?stripe_status=success`).
* **Webhooks Criptográficos:**
  * `checkout.session.completed`: Invoca la RPC `set_user_tier` pasando el `userId`, elevando la cuenta a tier `'pro'`.
  * `invoice.paid`: Renueva y mantiene confirmado el tier `'pro'` del usuario.
  * `customer.subscription.deleted`: Revoca el plan y degrada a `'free'`.
* **Protección de Políticas Móviles:** La pasarela web de Stripe solo se ofrece en entornos Web Desktop (`!platform.isNativeAndroid`). En Android nativo se priorizan los anuncios bonificados y bonos promocionales para evitar conflictos de facturación en Google Play Store.

### 3.4. Publicidad y Monetización Móvil (Google AdMob)
* **Archivos fuente:**
  * `src/lib/admob.ts`
  * `src/app/actions/claimAdReward.ts`
  * `src/types/admob.d.ts`
* **Identificadores Oficiales de Producción:**
  * **App ID:** `ca-app-pub-8525131609099761~8283952108`
  * **Rewarded Ad Unit ID:** `ca-app-pub-8525131609099761/8767167832`
* **Arquitectura de Ejecución en 3 Canales:**
  1. **Capacitor Nativo:** Dynamic import de `@capacitor-community/admob` al detectar `platform.isCapacitorAndroid`.
  2. **Android WebView / Puente JS:** Escucha `window.AndroidAdMob?.showRewardedAd`.
  3. **Simulador de Desarrollo:** Modal de desarrollo `emulateRewardedAdDialog` con temporizador de 5 segundos para probar en local la acreditación en Supabase sin necesidad de un dispositivo Android real.
* **Acreditación Server-Side:** `claimAdRewardAction` ejecuta la RPC `add_bonus_credit`, otorgando +1 generación con IA al usuario por cada anuncio completo.

### 3.5. Envoltorio Móvil Nativo (Capacitor Android)
* **Archivos fuente:**
  * `capacitor.config.ts`
  * Directorio nativo `android/`
  * `android/app/build.gradle`
  * `android/app/src/main/AndroidManifest.xml`
  * `src/lib/platform.ts`
* **Estrategia de Despliegue:**
  * Modo **Hosted Remote Server:** `server.url = 'https://flashmente.com'`. Esto permite que cualquier mejora o corrección en el frontend web se refleje instantáneamente en la app nativa sin requerir subir un nuevo bundle a Google Play Console.
  * Identificador: `com.flashmente.app`.
  * Versión: `versionCode: 4`, `versionName: "1.0.3"`.
  * Firma: Keystore de producción vinculado en Gradle (`signing.keystore`, alias `flashmente-key`).
  * `platform.ts`: Hook y función síncrona `detectPlatform()` para adaptar la interfaz según si corre en Capacitor Android, TWA, WebView o Web pura.

### 3.6. Motor de IA y Generación de Tarjetas
* **Archivo fuente:** `src/app/actions/generateCards.ts` (1,149 líneas).
* **Modelo Utilizado:** `gemini-3.1-flash-lite` vía `@google/genai`.
* **Directivas Pedagógicas Inquebrantables:**
  * **Grounding Estricto:** Prohíbe terminantemente el uso de conocimiento externo o invenciones; solo extrae conceptos explícitos del texto.
  * **Esquema JSON Forzado:** Utiliza `responseJsonSchema` con validación estricta de campos `core_exhausted` y `cards`.
  * **Radar de Profundidad:** Señaliza si la teoría troncal ya está cubierta y pasa a extraer detalles y excepciones.
  * **Memoria Anti-Duplicados:** Lee de la base de datos las preguntas que ya existen en el mazo y las incluye en el prompt con prohibición de repetición.
  * **Aleatorización Fisher-Yates:** Distribuye de forma aleatoria la opción correcta en tarjetas tipo test (`multiple_choice`).
* **Entrada de Datos Multicanal:**
  * Documentos PDF y Audio vía `inlineData` base64.
  * Documentos Word (`.docx` / `.doc`) parseados con `mammoth` y saneamiento ASCII.
  * Vídeos de YouTube procesados mediante `fileUri` nativo de Google (evita bloqueos HTTP 429/403 en Vercel) con fallback a `youtube-transcript`.
  * Artículos web mediante web scraper limpio y fallback por proxy `allorigins.win`.

### 3.7. Algoritmo Nemotécnico FSRS v5
* **Archivo fuente:** `src/lib/fsrs/scheduler.ts`
* **Librería:** `ts-fsrs` v5.4.2.
* **Calibración:**
  * Parámetros personalizados con `initialFSRSWeights[2] = 1.2` (Good inicial) e `initialFSRSWeights[3] = 3.0` (Easy inicial).
  * `enable_fuzz: true` para evitar acumulación de repasos en días idénticos.
  * Ciclo de 4 botones: `Again` (1, 10 min), `Hard` (2, 3 horas), `Good` (3, 1.2 días), `Easy` (4, 3 días).

### 3.8. Centro de Soporte y Feedback
* **Archivos fuente:** `src/app/api/feedback/route.ts`, `src/components/feedback/FeedbackModal.tsx`, `src/lib/resend.ts`.
* **Servicio:** Resend API.
* **Funcionalidad:** Envío de correos estructurados con plantilla HTML dark-mode hacia `nachomoltol@gmail.com`. Incluye datos del usuario autenticado en Supabase y cabecera `replyTo` para respuesta directa.

---

## 4. ESTADO ACTUAL Y MATRIZ DE PENDIENTES TÉCNICOS

| Área | Estado | Diagnóstico y Acción Pendiente |
| :--- | :---: | :--- |
| **Capacitor AdMob Nativo** | 🟡 Parcial | El frontend (`admob.ts`) tiene el puente dinámico y simulador listos, pero en el proyecto nativo falta instalar `@capacitor-community/admob` en `package.json` (`npm i @capacitor-community/admob`), registrar `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-8525131609099761~8283952108"/>` en `android/app/src/main/AndroidManifest.xml` y ejecutar `npx cap sync android`. Sin esto, la APK nativa recurre al simulador web en lugar del SDK nativo de Google. |
| **Variables Locales (.env.local)** | 🟡 Parcial | Las variables de producción están en Vercel, pero el archivo `.env.local` de la máquina de desarrollo carece de `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` y `SUPABASE_SERVICE_ROLE_KEY`. Deben rellenarse si se quiere probar pagos o eliminación de cuenta en local. |
| **Sincronización Offline FSRS** | 🟢 PWA / 🟡 Cola Local | El Service Worker almacena la aplicación (`flashmente-pwa-v3`), pero si un usuario califica tarjetas sin conexión a internet, las mutaciones a Supabase fallan. Se requiere una cola local (IndexedDB) para almacenar revisiones pendientes y sincronizarlas al recuperar conexión. |
| **Capacitor iOS** | ⚪ No iniciado | El contenedor móvil actual es exclusivamente Android (`android/`). Para iOS se requerirá inicializar `npx cap add ios` y configurar certificados de Apple. |
| **Pagos Google Play Billing** | ⚪ Opcional | Actualmente en Android se monetiza mediante AdMob bonificado y cupones de activación. Si se desea cobrar suscripciones mensuales dentro de Google Play sin web, se debe integrar el plugin de facturación in-app nativo. |

---

## 5. INVENTARIO DE VARIABLES DE ENTORNO

| Variable | Alcance | Finalidad | Estado Local |
| :--- | :--- | :--- | :---: |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente / Servidor | URL base de Supabase | ✅ Presente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente / Servidor | Llave pública anónima de Supabase | ✅ Presente |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor (Privada) | Bypass administrativo para borrado de usuarios | ⚠️ En Vercel / Pendiente en local |
| `GEMINI_API_KEY` | Servidor (Privada) | Clave de Google GenAI para generación de tarjetas | ✅ Presente |
| `STRIPE_SECRET_KEY` | Servidor (Privada) | Clave secreta para Stripe Checkout y suscripciones | ⚠️ En Vercel / Pendiente en local |
| `STRIPE_WEBHOOK_SECRET` | Servidor (Privada) | Validación de firmas de eventos Stripe | ⚠️ En Vercel / Pendiente en local |
| `STRIPE_PRICE_MONTHLY` | Servidor (Privada) | ID del precio de Stripe (ej. `price_...`) | ⚠️ En Vercel / Pendiente en local |
| `RESEND_API_KEY` | Servidor (Privada) | Envío de correos de feedback mediante Resend | ⚠️ En Vercel / Pendiente en local |
| `RESEND_FROM_EMAIL` | Servidor | Remitente de los correos (`Flashmente <...>`) | ✅ Presente |
| `ADMIN_FEEDBACK_EMAIL` | Servidor | Destino del feedback (`nachomoltol@gmail.com`) | ✅ Presente |

---

## 6. GUÍA RÁPIDA DE COMANDOS DE DESPLIEGUE

```bash
# 1. Ejecutar desarrollo local con Turbopack
npm run dev

# 2. Verificar compilación TypeScript y bundles
npm run build

# 3. Sincronizar cambios web con el contenedor Android de Capacitor
npx cap sync android

# 4. Abrir proyecto nativo en Android Studio para compilar APK / AAB
npx cap open android

# 5. Compilar bundle de producción firmado (.aab) vía Gradle (desde /android)
cd android
./gradlew bundleRelease
# El archivo firmado se generará en: android/app/build/outputs/bundle/release/app-release.aab
```
