# FICHA TÉCNICA INTEGRAL DEL SISTEMA: FLASHMENTE
> **Documento de Arquitectura, Estado de Módulos, Esquema de Datos y Diagnóstico Técnico**  
> *Diseñado para lectura, análisis e ingesta automática por modelos de Inteligencia Artificial (Google Gemini, Claude, etc.) y desarrolladores.*  
> **Fecha de actualización:** 25 de noviembre de 2026  
> **Versión del código:** 1.0 (Web en Vercel, Android v1.0.3 versionCode: 4, iOS v1.0 Build: 7)  
> **Dominio de producción:** [https://www.flashmente.com](https://www.flashmente.com) / [https://flashmente.com](https://flashmente.com)  
> **Package ID (Android):** `com.flashmente.app` (Google Play Store)  
> **Bundle ID / App ID (iOS):** `com.flashmente.app` / Apple ID: `6831512051` (App Store)  
> **Repositorio:** `nachomoltol/flashcards-app`  

---

## 1. RESUMEN EJECUTIVO Y VISIÓN GENERAL

**Flashmente** es una aplicación multiplataforma (Web Desktop/Móvil en Vercel, Android Nativo vía Capacitor en Google Play e iOS Nativo vía Capacitor en Apple App Store) orientada al aprendizaje acelerado y la retención nemotécnica a largo plazo. Combina dos tecnologías núcleo:
1. **Inteligencia Artificial Multimodal (Google Gemini):** Extracción pedagógica y generación automatizada de tarjetas de estudio a partir de textos, documentos PDF, Word (.docx/.doc), pistas de audio, vídeos de YouTube, enlaces web, fotos de apuntes manuscritos y Tutor Socrático en vivo.
2. **Repetición Espaciada FSRS v5 (`ts-fsrs`):** Algoritmo matemático moderno de optimización de memoria a largo plazo que sustituye al tradicional SM-2 de Anki con calibración adaptativa de estabilidad, dificultad y retención.

---

## 2. MAPA DE ARQUITECTURA Y STACK TECNOLÓGICO

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  CANALES DE CONSUMO                                    │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│   Navegadores Web & PWA       │   App Nativa Android          │   App Nativa iOS       │
│   (Chrome, Safari, Edge)      │   Google Play (v1.0.3 / vC: 4)│   App Store (v1.0 / B7)│
└───────────────────────────────┴───────────────────────────────┴────────────────────────┘
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND & SERVERLESS RUNTIME (VERCEL)                          │
│   Next.js 15.5.27 (Turbopack, App Router, React 19.1.0, Tailwind CSS v4)              │
│   Alojado y desplegado en la red Edge/Serverless global de Vercel (https://flashmente.com)│
└────────────────────────────────────────────────────────────────────────────────────────┘
           │                        │                         │                  │
           ▼                        ▼                         ▼                  ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐
│  SUPABASE POSTGRES   │ │   GOOGLE GENAI API   │ │   STRIPE & RESEND    │ │  GOOGLE ADMOB    │
│  - GoTrue Auth (JWT) │ │ - gemini-2.5-flash   │ │ - Checkout & Webhook │ │ - Android Rewarded│
│  - 7 Tablas RLS      │ │ - Grounding Estricto │ │   (Solo Web Desktop) │ │ - iOS Rewarded    │
│  - 14 RPCs Security  │ │ - Anti-Duplicados    │ │ - Resend Emails      │ │ - Mutex in-flight │
│  - Storage Buckets   │ │ - Tutor Socrático    │ │   (Feedback soporte) │ │ - device_limits   │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘ └──────────────────┘
```

### 2.1. Tecnologías Base
* **Framework:** Next.js 15.5.27 con App Router y Turbopack.
* **Librería de UI:** React 19.1.0 (Concurrent Mode, Server Components y Server Actions).
* **Estilos:** Tailwind CSS v4 (`@tailwindcss/postcss`) con Safe Area Utilities (`.pt-safe`, `.pb-safe`).
* **Lenguaje:** TypeScript 5 en modo estricto.
* **Gestor de Estado Global:** Zustand 5.0.15 (stores desacoplados: auth, streak, language, etc.).
* **Internacionalización (i18n):** `useLanguageStore` con soporte completo en Español e Inglés (`es.json`, `en.json`) en toda la aplicación, incluyendo el panel de estadísticas `/stats`.
* **Envoltorios Móviles:** Capacitor 8.5.3 (`@capacitor/android`, `@capacitor/ios`, `@capacitor/core`, `@capacitor/cli`).
* **Base de Datos y Auth:** Supabase (`@supabase/supabase-js` v2.117.2, PostgreSQL 14.18, Ref: `fapjackhdqtnrpteujum`).
* **Motor de IA:** `@google/genai` v2.27.0 (`gemini-2.5-flash`).
* **Pasarela de Pago:** Stripe SDK v23.0.0 (exclusivo para Web Desktop; en iOS se respetan las directrices de Apple sin enlaces de cobro externo).
* **Servicio de Correos:** Resend SDK v6.32.1.
* **Algoritmo de Memoria:** `ts-fsrs` v5.4.2.

---

## 3. AUDITORÍA DE MÓDULOS DEL SISTEMA

### 3.1. Sistema de Cuotas, Niveles de Usuario y Escudo Anti-Abuso
* **Modelo de Cuotas (Unificado en UI, TypeScript y RPCs SQL de Supabase):**
  * **Usuario Free (Gratuito):**
    * **Generaciones de Mazos con IA:** 20 generaciones al mes. El primer mes de alta recibe 5 de bienvenida inmediatas y hasta 15 adicionales visualizando anuncios bonificados. A partir del siguiente mes, dispone de hasta 20 generaciones mensuales con anuncio.
    * **Guías de Estudio Rápido (Cheat Sheets):** Hasta 3 guías de estudio al mes, desbloqueables mediante visualización de anuncio bonificado (`unlock_deck_summary_with_ad`).
    * **Tutor Socrático:** Hasta 3 consultas pedagógicas gratuitas al mes (`get_tutor_quota_status`, `record_tutor_consultation`).
  * **Usuario PRO:**
    * **Generaciones de Mazos con IA:** 100 generaciones al mes sin anuncios.
    * **Guías de Estudio Rápido:** Ilimitadas, con acceso directo e impresión/exportación en PDF.
    * **Tutor Socrático:** Consultas ilimitadas.
  * **Escudo por Dispositivo (`device_limits`):**
    * Tabla transaccional en Supabase vinculada por `device_id` y mes (`month_key`), asegurando que ningún usuario eluda los límites creando múltiples cuentas en el mismo terminal (Tope dispositivo: máx. 15 generaciones con anuncio/mes y 3 guías/mes).
* **Procedimientos Almacenados RPC (con `SECURITY DEFINER`):**
  * `check_api_limit(p_user_id)`: Valida saldo mensual, créditos bonificados acumulados o bypass PRO/VIP.
  * `increment_api_generation(p_user_id)`: Deduce créditos de anuncios o incrementa el contador mensual.
  * `add_bonus_credit(p_user_id, p_amount, p_device_id)`: Suma atómicamente créditos de recompensa AdMob protegiendo el tope de dispositivo.
  * `unlock_deck_summary_with_ad(p_user_id, p_deck_id, p_device_id)`: Desbloquea guías de estudio verificando el cupo mensual (3/mes) y el límite por dispositivo.
  * `get_tutor_quota_status(p_user_id)` / `record_tutor_consultation(p_user_id)`: Controlan las 3 consultas mensuales del Tutor Socrático.

### 3.2. Publicidad y Monetización Móvil (Google AdMob)
* **Archivos fuente:** `src/lib/admob.ts`, `src/app/actions/claimAdReward.ts`, `src/types/admob.d.ts`.
* **Identificadores Oficiales de Producción:**
  * **Android:**
    * App ID: `ca-app-pub-8525131609099761~8283952108`
    * Rewarded Ad Unit ID: `ca-app-pub-8525131609099761/8767167832`
  * **iOS:**
    * App ID: `ca-app-pub-8525131609099761~9670087799`
    * Rewarded Ad Unit ID: `ca-app-pub-8525131609099761/1577605194`
* **Mutex de Inicialización Concurrente:**
  * `initializingPromise` en `src/lib/admob.ts` para evitar que llamadas simultáneas a `AdMob.initialize()` provoquen excepciones no controladas o solapamientos en dispositivos nativos.
* **Integración en 3 Canales:**
  1. Capacitor Nativo (`@capacitor-community/admob` en Android e iOS).
  2. Puente WebView (`window.AndroidAdMob` o JavaScript Bridge).
  3. Simulador web para entornos de desarrollo local.

### 3.3. Seguridad y Protección de Impresión / PDF
* **Archivos fuente:** `src/lib/printToken.ts`, `src/app/actions/getDeckForPrint.ts`, `src/app/(dashboard)/decks/[id]/print/page.tsx`, `src/components/decks/QuickStudyGuideModal.tsx`.
* **Token HMAC Firmado:**
  * La Server Action `getDeckForPrintAction` genera un token firmado criptográficamente (`hmac-sha256`) con caducidad de 15 minutos que valida identidad del usuario, pertenencia o visibilidad pública del mazo y modo de impresión (`exam` o `guide`).
  * En iOS (`isNativeIOS`), la Guía de Estudio Rápido abre Safari externo con el token seguro y el parámetro `mode=guide`, renderizando el contenido real de la guía en lugar de la hoja de examen.

### 3.4. Cumplimiento de Políticas Apple (App Store Guidelines)
* **Aislamiento Comercial en iOS:**
  * Conforme a la directriz 3.1.1 de la App Store, en `isNativeIOS` se suprimen todos los botones de Stripe Checkout, enlaces a precios web externos y referencias a pasarelas ajenas.
  * La modal PRO en iOS (`ProModal.tsx`) muestra un mensaje nativo informativo y redirige a la ficha oficial de la App Store (`itms-apps://itunes.apple.com/app/id6831512051`) sin procesar pagos externos.
  * Modales y pantallas adaptadas a `dvh` (`max-h-[min(94dvh,94vh)]`) para garantizar visualización sin scroll innecesario.
* **Safe Area Dinámica y Adaptativa:**
  * En `src/app/layout.tsx` se define `viewport: { viewportFit: 'cover' }`.
  * En `src/app/globals.css` se declaran variables seguras `--safe-area-top` y `--safe-area-bottom`.
  * En `ios/App/App/SceneDelegate.swift` la vista raíz utiliza `UIColor(dynamicProvider:)` para adaptarse automáticamente a modo claro (`systemBackground`) y modo oscuro (`#0a0a0a`), actualizando el estilo de la barra de estado de manera reactiva.

### 3.5. Autenticación y Supabase
* **Instancia:** PostgreSQL 14.18 (Project Ref: `fapjackhdqtnrpteujum`).
* **Tablas con RLS Activo:**
  1. `decks`: Mazos y carpetas con árbol jerárquico.
  2. `cards`: Flashcards con parámetros FSRS (`stability`, `difficulty`, `state`, `reps`, `lapses`, `due`).
  3. `notes`: Documentos y fuentes estructuradas.
  4. `reviews`: Historial de repasos individuales (1-4).
  5. `profiles`: Preferencias de retención y configuración del usuario.
  6. `api_limits`: Registro de consumo y cuotas del usuario.
  7. `device_limits`: Escudo anti-abuso y cuotas por dispositivo.
* **Supresión de Cuentas (Google Play & Apple Guidelines):**
  * `DeleteAccountModal.tsx` y `deleteAccountAction` eliminan por completo los datos del usuario en cascada e invocan `auth.admin.deleteUser`.

### 3.6. Motor de IA y Modo Docente
* **Modelo:** `gemini-2.5-flash` vía `@google/genai`.
* **Capacidades:**
  * Ingesta multimodal: PDF, Audio, Word, YouTube, Web Scraping y fotos de apuntes manuscritos (`generateCardsFromNotes.ts`).
  * Modo Docente (`targetAudience` y formatos didácticos estructurados): Generación calibrada para primaria, secundaria, bachillerato, universidad y oposiciones.
  * Tutor Socrático (`socraticTutor.ts`): Diálogo pedagógico en 3 actos (empatía, quiebre conceptual y cierre socrático) con holgura ampliada de tokens (`maxOutputTokens: 320`).

---

## 4. INTEGRACIÓN CONTINUA (CI / GITHUB ACTIONS)

1. **`ci-main.yml` (Rama `main`):**
   * Disparador: `push` a `main` y `workflow_dispatch`.
   * Ejecuta: `npm ci`, `npx tsc --noEmit` y `npx eslint src/ --quiet` en Node.js v22 sobre `ubuntu-latest`.
2. **`ios-build.yml` (Rama `feature/ios-build`):**
   * Disparador: `push` a `feature/ios-build` y `workflow_dispatch`.
   * Ejecuta: Compilación nativa de Xcode 16 sobre `macos-15` con sincronización de Capacitor iOS.

---

## 5. GUÍA RÁPIDA DE COMANDOS DE DESPLIEGUE

```bash
# 1. Desarrollo local con Turbopack
npm run dev

# 2. Validación de TypeScript y ESLint
npx tsc --noEmit
npx eslint src/ --quiet

# 3. Sincronización de contenedores Capacitor
npx cap sync android
npx cap sync ios

# 4. Compilación Android (Google Play Release)
cd android
./gradlew bundleRelease

# 5. Compilación y Apertura iOS (Xcode)
npx cap open ios
```
