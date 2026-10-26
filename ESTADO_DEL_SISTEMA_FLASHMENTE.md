# ESTADO DEL SISTEMA FLASHMENTE (DOCUMENTO MAESTRO DE MIGRACIÓN)
> **Fecha de consolidación:** 25 de octubre de 2026  
> **Versión del Sistema:** v1.3.0 (Android VersionCode: 6)  
> **Entorno de Producción:** Desplegado en Vercel Edge Serverless ([https://flashmente.com](https://flashmente.com))  
> **Canal Nativo:** Android App Bundle (.aab) firmado en Google Play Console (Pruebas Cerradas / Closed Testing)  
> **Identificador de Paquete:** `com.flashmente.app`  
> **Repositorio:** `nachomoltol/flashcards-app`  
> **Propósito:** Transferencia de contexto técnico integral, arquitectura de software, estado operativo y roadmap para el nuevo asistente de desarrollo.

---

## 1. RESUMEN EJECUTIVO DEL PROYECTO

### 1.1. Identidad y Propósito
**Flashmente** es una plataforma multiplataforma (Web Desktop, PWA y Android Nativo vía Capacitor) orientada al aprendizaje acelerado, el estudio intensivo (oposiciones, facultades de medicina, enfermería, derecho y carreras técnicas) y la memorización a largo plazo de alto rendimiento.

### 1.2. Propuesta de Valor Diferencial
1. **Grounding Quirúrgico Anti-Alucinaciones (Estilo NotebookLM):** El motor de IA actúa estrictamente como extractor fiel del material fuente provisto por el usuario; no asume conocimientos externos ni inventa hechos.
2. **Generación Multimodal Nativa y Paridad Total:** Capacidad de procesar PDFs densos y documentos Word (.docx/.doc) extrayendo texto, tablas estructuradas e imágenes incrustadas simultáneamente.
3. **Optimización Cognitiva FSRS v5:** Sustitución de algoritmos clásicos y obsoletos (como el SM-2 de Anki) por el **Free Spaced Repetition Scheduler v5**, adaptando matemáticamente intervalos de repaso según estabilidad, dificultad y retención real.
4. **Escudo Financiero y Sostenibilidad SaaS:** Procesamiento por páginas en memoria con límites de chunking estrictos para garantizar rentabilidad y tiempos de respuesta de milisegundos sin sobrecostes en tokens.
5. **Memoria Expansiva Libre de Duplicados:** Deduplicación híbrida de dos niveles (léxica determinista y semántica vectorial) que permite procesar sucesivamente el mismo temario sin repetir conceptos ya memorizados.

### 1.3. Estado de Producción Actual
- **Versión de Producción:** `v1.3.0` (Android `versionCode: 6`, `versionName: "1.3.0"` definido en `android/app/build.gradle`).
- **Despliegue Web:** Vercel Edge / Serverless con soporte de dominio con y sin prefijo www ([https://flashmente.com](https://flashmente.com) y [https://www.flashmente.com](https://www.flashmente.com)).
- **Estrategia Híbrida Capacitor:** Configurado en modo *Hosted Remote Server* (`server.url = 'https://flashmente.com'` en `capacitor.config.ts`), lo que permite que las mejoras del frontend y parches se reflejen al instante en los dispositivos nativos sin requerir compilar un nuevo bundle por cada cambio de UI.
- **Canal de Google Play Store:** Android App Bundle (.aab) compilado con Gradle (`./gradlew bundleRelease`), firmado con Keystore de producción (`signing.keystore`, alias `flashmente-key`) y subido a Google Play Console dentro del canal de **Pruebas Cerradas (Closed Testing)**.

---

## 2. ARQUITECTURA TÉCNICA Y STACK TECNOLÓGICO

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           CANALES DE DISTRIBUCIÓN                              │
├───────────────────────────────────────┬────────────────────────────────────────┤
│   Navegadores Desktop & PWA Móvil     │   App Nativa Android (Capacitor 8.5.3) │
│   (Vercel Edge Global Runtime)        │   Google Play Store (AAB VersionCode 6)│
└───────────────────────────────────────┴────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                       CAPA FRONTEND & SERVERLESS RUNTIME                       │
│   Next.js 15.5.27 (App Router, Turbopack, React 19.1.0, Tailwind CSS v4)      │
│   Gestor de Estado: Zustand 5.0.15 (11 stores desacoplados)                   │
│   Iconografía: Lucide React 1.53.0 | Internacionalización i18n (es / en)      │
└────────────────────────────────────────────────────────────────────────────────┘
           │                        │                         │
           ▼                        ▼                         ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  SUPABASE POSTGRES   │ │   GOOGLE GENAI API   │ │   MONETIZACIÓN & COM │
│  - GoTrue Auth PKCE  │ │ - gemini-3.1-flash-  │ │ - Stripe Checkout/WH │
│  - 6 Tablas con RLS  │ │   lite (Structured)  │ │ - AdMob Rewarded Ads │
│  - 10 RPCs Security  │ │ - gemini-embedding-  │ │ - Resend Transacc.   │
│  - 2 Storage Buckets │ │   001 (Vector Gate)  │ │ - Capacitor Plugins  │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

### 2.1. Frontend y Componentes
- **Framework Web:** Next.js `15.5.27` con App Router y Turbopack.
- **Librería de UI:** React `19.1.0` (Client Components `'use client'` y Server Actions `'use server'`).
- **Estilos y Diseño:** Tailwind CSS `^4.0.0` con `@tailwindcss/postcss`. Estética glassmorphic, micro-animaciones, adaptación total a modo oscuro y soporte nativo de áreas seguras (`env(safe-area-inset-bottom)`).
- **Iconografía:** `lucide-react` `^1.53.0`.
- **Envoltorio Móvil:** Capacitor `^8.5.3` (`@capacitor/android`, `@capacitor/cli`, `@capacitor/core`).
- **Gestión de Estado:** Zustand `^5.0.15` con stores modulares:
  * `useAuthStore`: Sesión y credenciales de usuario.
  * `useCardStore`: CRUD de tarjetas y sincronización reactiva con Supabase.
  * `useDeckStore`: Árbol jerárquico de carpetas y mazos de estudio.
  * `useAtlasStore`: Control de diagramas clínicos e Image Occlusion interactivo.
  * `useLanguageStore`: Preferencia de idioma persistente (`es` / `en`).
  * `useProModalStore`: Control de límites de cuota, pasarela de pago y apertura de modales.

### 2.2. Backend y Persistencia (Supabase BaaS)
- **Instancia:** PostgreSQL 14.18 (Project Ref: `fapjackhdqtnrpteujum`).
- **Autenticación (GoTrue Auth):** Flujo de autenticación híbrido en `src/app/auth/callback/page.tsx` compatible con 4 resoluciones jerárquicas:
  1. Intercambio de código PKCE: `supabase.auth.exchangeCodeForSession(code)`.
  2. Fallback de verificación OTP: `supabase.auth.verifyOtp({ token_hash, type: 'email' })`.
  3. Fragmento Hash implícito (`#access_token=...&refresh_token=...`).
  4. Sesión precargada: `supabase.auth.getSession()`.
- **Esquema de Tablas (6 Tablas protegidas con Row Level Security - RLS):**
  1. `decks`: Mazos y carpetas jerárquicas (`parent_id`, `title`, `color`, `is_folder`, `is_public`, `share_id`).
  2. `cards`: Flashcards de estudio (`front`, `back`, `card_format`, métricas FSRS: `stability`, `difficulty`, `state`, `reps`, `lapses`, `due`).
  3. `notes`: Documentos base y campos semiestructurados JSONB.
  4. `reviews`: Registro histórico transaccional de respuestas (`rating`, `stability`, `difficulty`, `due`).
  5. `profiles`: Parámetros de retención FSRS del usuario (`request_retention: 0.90`, `maximum_interval: 365`, `enable_fuzz: true`).
  6. `api_limits`: Balance de uso de IA y suscripciones (`generations_count`, `last_generation_date`, `tier`, `bonus_credits`, `welcome_generations`).
- **Seguridad y Procedimientos Almacenados (10 RPCs `SECURITY DEFINER`):**
  * `check_api_limit`, `increment_api_generation`, `add_bonus_credit`, `get_deck_owner`, `redeem_promo_code`, `import_shared_deck`, `set_user_tier`, `downgrade_user_by_stripe`, `get_user_api_limits`, `record_api_generation`.
- **Storage Buckets:**
  * `user-documents`: Archivos PDF/DOCX subidos temporalmente para procesamiento seguro.
  * `atlas-images`: Diagramas e imágenes médicas de alta resolución para oclusión visual.

### 2.3. Motor de Inteligencia Artificial
- **SDK Oficial:** `@google/genai` `^2.27.0`.
- **Modelo de Generación:** `gemini-3.1-flash-lite` (unificado por máxima velocidad, bajo coste de tokens y excelente razonamiento deductivo).
- **Invocación Estructurada Forzada:**
  * `responseMimeType: 'application/json'`.
  * `responseJsonSchema: flashcardSchema`: Define un objeto con razonamiento interno (*Chain of Thought* en `conceptos_identificados`), radar de profundidad troncal (`core_exhausted: boolean`) y el listado dinámico `cards`.
  * Parámetros térmicos deterministas: `temperature: 0.1` en modo exhaustivo y `0.15` en modo normal para erradicar cualquier invención o creatividad no grounded.
- **Directivas Pedagógicas Inyectadas:**
  * *Directiva de Cobertura y Calidad*: Extracción implacable sin inventar preguntas triviales ni duplicados.
  * *Directiva Imperativa de Idioma*: Genera el 100% del contenido exclusivamente en el idioma seleccionado por el usuario, independientemente del idioma del documento original.
  * *Regla de Exclusión de Metadatos Editoriales*: Prohibición estricta de generar preguntas sobre artefactos de maquetación (recuadros marginales de 'Términos Clave', símbolos como asteriscos `*` o dagas `†`, números de página o referencias editoriales accesorias).

### 2.4. Procesamiento de Documentos de Alto Rendimiento
#### A. Documentos PDF (Motor In-Memory `pdf-lib`)
- **Librería:** `pdf-lib` `^1.17.1`.
- **Arquitectura Zero-Worker:** Procesa y segmenta PDFs 100% en memoria en el servidor y en el cliente sin requerir workers externos de Node.js ni polyfills de Canvas (evitando los bloqueos de Turbopack tipo `Setting up fake worker failed`).
- **Slicing Quirúrgico de Páginas:** La función `sliceSinglePdfPage` o `slicePdfDocument` lee el buffer del archivo, clona únicamente los índices de página solicitados en un `PDFDocument` nuevo y lo exporta a Base64 puro.
- **Inyección Multimodal Nativa:** Se transmite a Gemini como `inlineData: { data: base64Pdf, mimeType: 'application/pdf' }`. La IA "ve" las páginas maquetadas con exactitud milimétrica, interpretando diagramas anatómicos, tablas comparativas, flechas de flujo y clasificaciones que se destruían al extraer solo texto plano.

#### B. Documentos Word DOCX (Motor `mammoth` + `jszip`)
- **Librerías:** `mammoth` `^1.13.0` y `jszip` `^3.10.2`.
- **Módulo `docxPagination.ts`:** Resuelve la ausencia de concepto nativo de página en Word mediante la función `parseDocxIntoVirtualPages`:
  1. **Segmentación Virtual Homogénea:** Divide el contenido en páginas virtuales de aproximadamente ~400 palabras / ~2.200 caracteres, respetando párrafos y saltos de sección explícitos (`\f`, `\x0c`).
  2. **Conversión y Extracción de Tablas:** `htmlToDocxStructuredText` procesa el HTML de Mammoth convirtiendo etiquetas `<table>`, `<tr>`, `<td>` y `<th>` en tablas Markdown limpias delimitadas con `|`, preservando celdas y filas para el análisis de la IA.
  3. **Extracción Multimodal de Imágenes (`word/media/*`):** `mammoth.images.imgElement` intercepta cada imagen incrustada en el archivo DOCX:
     - Extrae el buffer Base64.
     - Normaliza y valida el tipo MIME (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
     - Filtra imágenes seguras (< 6 MB).
     - Inserta un placeholder en el texto `__DOCX_IMG_PLACEHOLDER_X__` y alimenta el pool de imágenes (`imagesPool`).
     - Al paginar virtualmente, asocia hasta 3 imágenes principales a su página virtual de origen y las envía a Gemini como `inlineData`, logrando **paridad multimodal total entre Word y PDF**.

---

## 3. MODELO DE NEGOCIO Y LÍMITES OPERATIVOS

El sistema opera bajo una arquitectura Freemium sostenible de 3 fases, protegiendo los costes de la API de Google y monetizando a través de anuncios bonificados y suscripciones:

### 3.1. Niveles de Usuario y Cuotas
| Plan | Cuota Mensual | Publicidad / Condiciones | Precio | Pasarela |
|---|:---:|---|:---:|:---:|
| **Free (Fase Bienvenida)** | Primeras 5 generaciones | **Sin anuncios** (`welcome_generations < 5`). Fricción cero para nuevos usuarios. | 0,00 € | N/A |
| **Free (Fase Ads)** | Hasta 50 generaciones/mes | **1 Anuncio Recompensado (AdMob Rewarded)** requerido por cada generación a partir de la 6.ª. | 0,00 € | Google AdMob |
| **PRO / VIP** | **120 generaciones/mes** | **Cero publicidad**, máxima prioridad de procesamiento y acceso sin restricciones. | 3,50 €/mes | Stripe / Cupón VIP |

### 3.2. Lógica de Reseteo Mensual Lazy (`YYYY-MM`)
- **Sin Cron Jobs Costosos:** El reseteo no depende de trabajadores en segundo plano ni de tareas programadas de servidor que puedan fallar o incurrir en costes.
- **Cálculo Lazy en Servidor y RPC:** En cada llamada a `enforceApiLimit` o en la RPC `check_api_limit`, el backend compara la fecha actual en formato `YYYY-MM` con la subcadena `YYYY-MM` almacenada en `last_generation_date`:
  ```typescript
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-10"
  const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
  const isSameMonth = lastMonth === currentMonth;
  const count = isSameMonth ? generationsCount : 0; // Si cambia el mes, resetea a 0 automáticamente
  ```
- Al llegar el día 1 de cada mes, la primera petición del usuario calcula que `lastMonth !== currentMonth`, reiniciando el contador de generaciones a 0 de forma transparente y atómica.

### 3.3. Tabla de Persistencia `api_limits` (Supabase)
- **Campos Principales:**
  * `user_id` (UUID, clave primaria vinculada a `auth.users`).
  * `generations_count` (int): Tarjetas o lotes consumidos en el mes vigente.
  * `last_generation_date` (text / timestamptz): Marca temporal de la última generación.
  * `tier` (`'free' | 'pro' | 'vip'`): Nivel de suscripción actual.
  * `bonus_credits` (int): Créditos acumulados tras visualizar anuncios AdMob Rewarded.
  * `welcome_generations` (int): Contador de bienvenida (tope 5).
  * `stripe_customer_id` y `stripe_subscription_id`: Identificadores de facturación recurrente.
- **Acreditación Server-Side:** `claimAdRewardAction` valida el anuncio y ejecuta la RPC `add_bonus_credit`, garantizando que ningún usuario obtenga generaciones sin haber completado la visualización del anuncio.

---

## 4. MOTOR PEDAGÓGICO Y ALGORITMO DE ESTUDIO

### 4.1. Algoritmo Nemotécnico FSRS v5 (`ts-fsrs`)
Flashmente integra la versión más avanzada del algoritmo de repetición espaciada (**Free Spaced Repetition Scheduler v5.4.2**), el cual modela matemáticamente la curva del olvido de Ebbinghaus mediante variables dinámicas de memoria:
- **Estados de Memoria:**
  * **Estabilidad ($S$):** Tiempo en días que un recuerdo tarda en caer del 100% al 90% de probabilidad de retención.
  * **Dificultad ($D$):** Resistencia inherente del concepto (escala 1 a 10).
  * **Repeticiones ($R$) y Lapsos ($L$):** Historial de repasos acumulados y olvidos/fallos.
- **Ciclo de 4 Calificaciones:**
  1. **Again (1):** Olvido total. Intervalo reiniciado a 10 minutos; incrementa el contador de lapsos.
  2. **Hard (2):** Recuerdo difícil. Intervalo adaptativo de ~3 horas.
  3. **Good (3):** Retención exitosa estándar. Intervalo calibrado a ~1.2 días iniciales.
  4. **Easy (4):** Retención perfecta sin esfuerzo. Intervalo de consolidación de ~3 días iniciales.
- **Fuzzing Anti-Agrupamiento (`enable_fuzz: true`):** Introduce una variación pseudoaleatoria mínima en las fechas calculadas (`due`) para evitar que cientos de tarjetas venzan simultáneamente en el mismo día.

### 4.2. Modos de Generación Pedagógica

#### A. Modo Normal vs. Modo Exhaustivo
- **Modo Normal (Similitud 0.80):**
  * Extrae los conceptos troncales y las definiciones clave con un balance didáctico ideal.
  * Umbral semántico en embeddings: `0.80`. Purgará cualquier tarjeta candidata cuya distancia de coseno contra el historial del mazo sea $\ge 0.80$.
- **Modo Exhaustivo (Similitud 0.92 - Destripador Quirúrgico):**
  * Activado mediante toggle destacado en `DocumentUploader.tsx`.
  * **Anulación de Resumen:** Sobrescribe cualquier instrucción de síntesis. Ordena a Gemini extraer una tarjeta individual por cada celda, fila, columna de tabla, cifra estadística, clasificación o cruce numérico de gráficos sin omitir nada.
  * Umbral semántico en embeddings elevado a `0.92`: Permite que múltiples preguntas muy parecidas estructuralmente (ej. "Valores normales de Calcio" vs. "Valores normales de Magnesio" en una misma tabla de analíticas) convivan en el mazo sin ser eliminadas por el filtro léxico-semántico.

#### B. Modo Académico vs. Modo Didáctico / Docente
- **Modo Académico:**
  * Enfoque formal, riguroso y analítico para estudiantes universitarios, oposiciones o especialidades clínicas.
- **Modo Didáctico / Docente (`DIDACTIC_MODE_DIRECTIVE`):**
  * Especialmente diseñado para profesores y formadores que preparan baterías de preguntas a partir de fichas de aula o listas de vocabulario.
  * **Prohibición Absoluta de Metadatos de Aula:** Prohíbe tajantemente fórmulas como *"Según el Bloque 2"*, *"En el Ejercicio 4"* o *"Como indica la Unidad 1"*. Las preguntas se formulan como ítems de examen directo e independiente.
  * **Transformación en Casos Prácticos y Huecos (*Fill-in-the-blank*):** Transforma ejemplos en oraciones incompletas con `______` y prohíbe terminantemente preguntas sobre transcripciones fonéticas marginales (ej. `/tiː.tʃər/`).

### 4.3. Formatos de Tarjetas Disponibles
1. **Opción Múltiple (`multiple_choice`):** Pregunta técnica con exactamente 4 opciones (`a`, `b`, `c`, `d`), respuesta justificada y aleatorización Fisher-Yates en el cliente para eliminar sesgos de posición.
2. **Básica (`basic`):** Pregunta directa en el anverso y razonamiento riguroso en el reverso.
3. **Texto Oculto (`cloze`):** Párrafo explicativo con corchetes `[...]` en el anverso y término fundamental revelado en negrita en el reverso (`**término**`).
4. **Verdadero o Falso (`true_false`):** Enunciado categórico con resolución booleana y fundamentación teórica.

---

## 5. ÚLTIMAS MEJORAS IMPLEMENTADAS Y AUDITADAS

1. **Paridad Multimodal Completa en DOCX:**
   - Implementación del pipeline `mammoth` + `jszip` con `parseDocxIntoVirtualPages`.
   - Extracción de tablas completas en formato Markdown e inyección de imágenes incrustadas (`word/media/*`) enviadas como `inlineData` Base64 a Gemini.
2. **Sticky Footer Blindado en `DocumentUploader.tsx`:**
   - Contenedor inferior de navegación de pasos y botón de extracción fijado mediante clases sticky/fixed optimizadas.
   - Respeto del `padding-bottom` de seguridad para navegación gestual móvil (`env(safe-area-inset-bottom)`), evitando que el botón quede oculto tras la barra de navegación de Android o tras teclados virtuales.
3. **Atlas Visual Clínico Interactivo (Image Occlusion):**
   - Módulo para estudiantes de medicina y ciencias que permite estudiar diagramas anatómicos, rutas metabólicas y esquemas radiológicos.
   - Creación de cajas de oclusión (`AtlasBox` con coordenadas relativas `x, y, width, height`), almacenamiento seguro en el bucket de Supabase `atlas-images` y gestión reactiva mediante `useAtlasStore`.
4. **Release v1.3.0 Empaquetada y Firmada en Android (.aab):**
   - Configuración de Gradle en `android/app/build.gradle` con `versionCode 6` y `versionName "1.3.0"`.
   - Firma oficial generada mediante Keystore de producción (`signing.keystore`, alias `flashmente-key`, contraseña asignada).
   - Generación del paquete `.aab` (`android/app/build/outputs/bundle/release/app-release.aab`) y carga validada en Google Play Console para el canal de pruebas cerradas.

---

## 6. PRÓXIMO ROADMAP DE PRODUCTO

Las siguientes funcionalidades estratégicas están planificadas para las próximas iteraciones de desarrollo:

### 6.1. Rachas Diarias y Notificaciones Push Locales
- **Objetivo:** Maximizar el *retention rate* y la disciplina de estudio diario del usuario.
- **Implementación Técnica:**
  * Contador de días consecutivos de estudio (`streak_count` y `last_study_date` en la tabla `profiles`).
  * Integración de `@capacitor/local-notifications` en Android para programar alertas locales a las 20:00 h ("¡Tu racha de 7 días está en peligro! Repasa tus 15 tarjetas de hoy en Flashmente"). Sin consumo de servidores ni servicios de push externos de pago.

### 6.2. Modo Simulacro de Examen con Temporizador
- **Objetivo:** Entrenar la velocidad de respuesta para opositores y exámenes tipo test (MIR, OPE, oposiciones técnicas).
- **Implementación Técnica:**
  * Selector de tiempo por tarjeta o tiempo global de bloque (ej. 50 preguntas en 45 minutos).
  * Desactivación de feedback inmediato durante el examen: las respuestas se guardan en un buffer temporal y la corrección analítica detallada con nota sobre 10 se entrega al finalizar el simulacro.
  * Cálculo de penalización por respuestas incorrectas configurable (ej. -0.33 por fallo).

### 6.3. Tutor Socrático Post-Fallo con IA Interactiva
- **Objetivo:** Evitar la frustración cuando el alumno califica una tarjeta con `Again` (1).
- **Implementación Técnica:**
  * Al pulsar `Again`, se despliega opcionalmente un panel lateral *"¿Por qué he fallado?"*.
  * Gemini Flash-Lite recibe el front, el back, la respuesta del alumno y el fragmento del documento, formulando una pista pedagógica o pregunta socrática breve para que el usuario descubra el matiz olvidado antes de memorizar mecánicamente la respuesta.

### 6.4. Hub Comunitario de Mazos y Exportador Imprimible a PDF
- **Objetivo:** Viralidad orgánica entre compañeros de facultad/oposición y estudio analógico.
- **Implementación Técnica:**
  * Catálogo de mazos públicos con sistema de búsqueda, valoración por estrellas y clonación en 1 clic mediante la RPC `import_shared_deck`.
  * Generador en cliente con `pdf-lib` para exportar cualquier mazo en formato imprimible de doble cara (fichas troqueladas de papel) o resumen esquemático de estudio para repasar sin pantallas.

---

## 7. MAPA DE ARCHIVOS CRÍTICOS PARA EL DESARROLLADOR

```
flashcards-app/
├── android/
│   ├── app/
│   │   ├── build.gradle                 # VersionCode 6, VersionName 1.3.0, signingConfigs
│   │   ├── signing.keystore             # Llave criptográfica oficial de producción
│   │   └── src/main/AndroidManifest.xml # Permisos, AdMob App ID y configuración nativa
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── decks/[id]/page.tsx      # Vista de mazo, estudio y apertura de generadores
│   │   │   └── page.tsx                 # Listado principal de mazos y carpetas
│   │   ├── actions/
│   │   │   ├── generateCards.ts         # Server Action central (Gemini 3.1 Flash-Lite, Slicing, Prompting)
│   │   │   ├── claimAdReward.ts         # Acreditación server-side de anuncios AdMob
│   │   │   ├── deleteAccount.ts         # Cumplimiento de borrado de cuenta en Google Play
│   │   │   └── redeemPromoCode.ts       # Canje de cupones VIP
│   │   └── auth/callback/page.tsx       # Intercambio híbrido multi-flujo de sesión Supabase
│   ├── components/
│   │   ├── cards/
│   │   │   ├── DocumentUploader.tsx     # Subida multimodal (PDF/Word/Audio), Modo Exhaustivo y Sticky Footer
│   │   │   ├── UrlCardGenerator.tsx     # Extracción desde YouTube y artículos web
│   │   │   └── StudyModal.tsx           # Interfaz de estudio con algoritmo FSRS v5
│   │   └── subscription/
│   │       ├── ProModal.tsx             # Modal de precios PRO, cupones y límites
│   │       └── AdMobRewardModal.tsx     # Visualizador de anuncios bonificados
│   ├── lib/
│   │   ├── admob.ts                     # Controlador del SDK AdMob nativo y simulador dev
│   │   ├── cardDeduplication.ts         # Gatekeeper híbrido: Filtro léxico + Embeddings (0.80 / 0.92)
│   │   ├── docxPagination.ts            # Mammoth + JSZip: páginas virtuales, tablas e imágenes de Word
│   │   ├── fsrs.ts                      # Instancia matemática de ts-fsrs v5.4.2
│   │   └── supabase.ts                  # Cliente de conexión Supabase con persistencia de sesión
│   └── stores/
│       ├── useAtlasStore.ts             # Estado de Atlas Visual e Image Occlusion
│       ├── useAuthStore.ts              # Estado de autenticación
│       ├── useCardStore.ts              # Gestión de tarjetas en memoria y BD
│       └── useDeckStore.ts              # Gestión de mazos y carpetas
└── capacitor.config.ts                  # Configuración Capacitor (server.url = 'https://flashmente.com')
```

---
*Documento consolidado oficialmente para traspaso técnico — Flashmente Engineering Team.*
