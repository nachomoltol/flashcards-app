# STATE OF THE APP — FLASHMENTE (flashcards-app)
> **Fecha de consolidación:** Octubre 2026  
> **Versión:** 0.1.0 (Producción / Stable)  
> **Propósito:** Documento maestro de arquitectura técnica y mapa de referencia para el equipo de desarrollo.

---

## 1. INTRODUCCIÓN Y VISIÓN GENERAL

**Flashmente** es una plataforma web y móvil de aprendizaje acelerado y memorización a largo plazo de alto rendimiento. Combina el estado del arte en inteligencia artificial generativa (**Google Gemini 3.1 Flash-Lite**) con algoritmos de repetición espaciada de última generación (**FSRS - Free Spaced Repetition Scheduler**) para transformar automáticamente contenidos densos (apuntes clínicos, manuales técnicos, papers científicos, vídeos y páginas web) en mazos de flashcards pedagógicamente estructuradas y 100% libres de alucinaciones y duplicados.

### Principios Fundamentales del Sistema
1. **Grounding Clínico / Estilo NotebookLM:** La IA actúa estrictamente como un extractor fiel del material fuente provisto; no inventa ni asume conocimientos previos externos.
2. **Procesamiento Multimodal Nativo:** Capacidad visual para interpretar diagramas, gráficos, tablas estadísticas y esquemas dentro de documentos PDF.
3. **Escudo Financiero y Chunking Sostenible:** Segmentación estricta de documentos grandes en fragmentos manejables (máximo 40 páginas por petición) para garantizar viabilidad económica, evitar saturación de la ventana de contexto y mantener tiempos de respuesta de milisegundos.
4. **Arquitectura Zero-Worker:** Sustitución de dependencias complejas con workers en Node.js/SSR por procesamiento 100% en memoria con `pdf-lib`.
5. **Memoria Expansiva Anti-Duplicados:** Esquema JSON dinámico y seguimiento de conceptos previos para que el usuario pueda generar múltiples lotes sucesivos sobre el mismo temario sin repeticiones.

---

## 2. STACK TECNOLÓGICO Y ESTADO DE DEPENDENCIAS

| Categoría | Tecnología / Librería | Versión | Rol en el Sistema |
|---|---|---|---|
| **Framework Web** | [Next.js](https://nextjs.org/) | `15.5.27` | Arquitectura basada en App Router, Server Actions (`"use server"`) y compilador Turbopack. |
| **Librería UI** | [React](https://react.dev/) / React DOM | `19.1.0` | Renderizado reactivo, Server & Client Components (`'use client'`). |
| **Tipado** | [TypeScript](https://www.typescriptlang.org/) | `^5.0.0` | Tipado estricto en cliente, servidor y modelos de base de datos. |
| **Estilos & Diseño** | [Tailwind CSS](https://tailwindcss.com/) + PostCSS | `^4.0.0` | Estilizado utility-first, soporte dinámico de modo oscuro/claro y micro-animaciones. |
| **BaaS / Backend** | [@supabase/supabase-js](https://supabase.com/) | `^2.117.2` | Autenticación (Auth), PostgreSQL con Row Level Security (RLS), Storage privado (`user-documents`) y funciones RPC transaccionales. |
| **Motor de IA** | [@google/genai](https://www.npmjs.com/package/@google/genai) | `^2.27.0` | SDK oficial de Google Gen AI. Modelo unificado: `gemini-3.1-flash-lite`. |
| **Manipulación PDF** | [pdf-lib](https://pdf-lib.js.org/) | `^1.17.1` | Motor de parsing y slicing de PDFs 100% en memoria. Sin workers externos, compatible con Node.js y navegadores. |
| **Documentos Word** | [mammoth](https://www.npmjs.com/package/mammoth) | `^1.13.0` | Extracción de texto y tablas estructuradas de documentos `.docx` y `.doc`. |
| **YouTube & Web** | [youtube-transcript](https://www.npmjs.com/package/youtube-transcript) | `^1.3.1` | Fallback de extracción de subtítulos para vídeos de YouTube; complementa la integración nativa con Gemini File API. |
| **Repetición Espaciada**| [ts-fsrs](https://www.npmjs.com/package/ts-fsrs) | `^5.4.2` | Algoritmo cognitivo FSRS para cálculo matemático de intervalos de repaso óptimos. |
| **Gestión de Estado** | [zustand](https://github.com/pmndrs/zustand) | `^5.0.15` | Estado global persistente (`useAuthStore`, `useCardStore`, `useDeckStore`, `useProModalStore`, `useLanguageStore`). |
| **Monetización & Ads**| AdMob Simulator & [stripe](https://stripe.com/) | `^23.0.0` | Modelo Freemium (5 bienvenida / 50 mensuales con rewarded ads / 120 en Plan PRO) y pasarela de pago. |
| **Email Transaccional**| [resend](https://resend.com/) | `^6.32.1` | Notificaciones por correo electrónico y confirmaciones transaccionales. |
| **Entorno Móvil** | [@capacitor](https://capacitorjs.com/) (`android`, `cli`, `core`) | `^8.5.3` | Empaquetado nativo para Android. |

---

## 3. CAPACIDADES DE LA APLICACIÓN (QUÉ PUEDE HACER EL USUARIO)

### 3.1. Creación y Gestión de Mazos
- **Organización jerárquica:** Creación, edición, renombrado y eliminación de mazos y carpetas de estudio.
- **Visualización interactiva:** Modo de estudio con volteo de tarjetas en 3D, atajos de teclado (espacio para voltear, números 1-4 para evaluar retención).
- **Control de retención FSRS:** Cuatro niveles de respuesta (*Again*, *Hard*, *Good*, *Easy*) que ajustan la estabilidad, dificultad y fecha de próximo repaso de cada tarjeta.

### 3.2. Generación Inteligente Multicanal
El usuario dispone de 3 vías de generación asistida por IA:
1. **Generación por Tema:** Introducción de un título o concepto general (ej. *"Farmacología de los betabloqueantes"*).
2. **Generación por Enlace (URL / YouTube):**
   - **Vídeos de YouTube:** Ingesta directa de conferencias o clases mediante enlace público con análisis nativo multimodal o fallback de transcripción.
   - **Artículos Web:** Extracción automática del contenido textual mediante scraping seguro y bypass de bloqueos vía proxy.
3. **Generación por Documento Multimodal (`DocumentUploader.tsx`):**
   - **Formatos admitidos:** PDF (`.pdf`), Word (`.docx`, `.doc`), Audio (`.mp3`, `.wav`) y Texto plano (`.txt`) hasta 50 MB con almacenamiento seguro bajo Supabase RLS.
   - **Aislamiento de páginas ("Chunking"):** El usuario puede especificar rangos de páginas precisos (ej. *"páginas 12 a 28"*).
   - **Enfoque Temático Conversacional:** Campo dedicado para instruir a la IA a priorizar elementos específicos (ej. *"Centra la información que buscas para tu mazo, escribe por ejemplo: Extrae las preguntas EXCLUSIVAMENTE de los datos de las TABLAS, los cuadros estadísticos y las imágenes. Ignora el texto de los párrafos normales."*).

### 3.3. Formatos de Tarjetas Disponibles
El motor soporta 4 formatos estrictamente tipados y adaptados en el prompt:
- **Opción Múltiple (`multiple_choice`):** Pregunta clínica/académica con exactamente 4 opciones (`a`, `b`, `c`, `d`), respuesta justificada y aleatorización Fisher-Yates en el cliente para evitar sesgos de respuesta.
- **Básica (`basic`):** Pregunta directa y concisa en el anverso, respuesta analítica y rigurosa en el reverso.
- **Texto Oculto / Cloze (`cloze`):** Párrafo explicativo con corchetes `[...]` en el anverso y término fundamental revelado en negrita en el reverso (`**término**`).
- **Verdadero o Falso (`true_false`):** Afirmación categórica y respuesta estricta como "Verdadero" o "Falso".

### 3.4. Escudo Financiero y UX de Recortes
- **Detección automática de páginas:** Lectura instantánea en cliente mediante `pdf-lib` al seleccionar el archivo.
- **Obligatoriedad automática:** Si el PDF tiene **más de 30 páginas totales**, los campos "Desde página" y "Hasta página" se vuelven estrictamente obligatorios tanto en la interfaz como en la validación del servidor.
- **Tope de 40 páginas:** No se permite procesar más de 40 páginas en un único lote, obligando al usuario a trocear el estudio en bloques digeribles y rentables.

### 3.5. Modelo de Monetización Freemium (5 / 50 / 120)
- **Fase de Bienvenida:** Los usuarios nuevos disponen de **5 generaciones gratuitas sin fricción** ni anuncios (`welcome_generations < 5`).
- **Fase con Anuncios Recompensados (AdMob):** Una vez consumidas las 5 de bienvenida, el usuario puede generar hasta **50 mensuales gratis** viendo un anuncio bonificado por generación (`bonus_credits`).
- **Plan PRO / VIP:** Límite ampliado de **120 generaciones mensuales** por 3,50€/mes o acceso irrestricto mediante cupones VIP, sin publicidad y con máxima prioridad.

---

## 4. ARQUITECTURA DEL MOTOR IA (PIPELINE MULTIMODAL END-TO-END)

```
[Usuario selecciona PDF]
       │
       ▼
[pdf-lib en Cliente] ──► Detecta total de páginas (ej. 85 págs)
       │                 Activa Escudo Financiero (Chunking Obligatorio)
       ▼
[Subida a Supabase Storage] ──► user-documents/{userId}/{timestamp}_{filename}
       │
       ▼
[Server Action: generateCardsFromDocumentAction]
       │
       ├─► 1. Validación de Cuota Freemium (enforceApiLimit)
       ├─► 2. Descarga de Buffer desde Supabase Storage
       ├─► 3. Slicing en Memoria (slicePdfDocument con pdf-lib)
       │       - Carga srcDoc = PDFDocument.load(buffer)
       │       - Copia únicamente pageIndices [start-1 .. end-1]
       │       - Genera subDoc limpio en memoria
       │       - Exporta a Base64 puro (sin cabecera data-uri)
       │
       ├─► 4. Consulta de Historial Existente (fetchExistingCardsHistory)
       │       - Obtiene tarjetas previas de Supabase (mazo actual)
       │       - Inyecta hasta 60 tarjetas como Memoria de Progreso
       │
       ├─► 5. Construcción de Prompts & Grounding Estricto
       │       - Protocolo en Dos Fases (Troncal vs. Minucioso)
       │       - Directiva de Idioma imperativa
       │       - Directiva Anti-Duplicados y Quota Relajada
       │
       ├─► 6. Invocación Multimodal a Gemini API (@google/genai)
       │       - model: 'gemini-3.1-flash-lite'
       │       - contents: [ { inlineData: { data: base64Pdf, mimeType: 'application/pdf' } }, { text: prompt } ]
       │       - config: responseJsonSchema (flashcardSchema dinámico)
       │
       ▼
[Parsing & Normalización]
       ├─► Validación de JSON estructurado ({ core_exhausted, cards })
       ├─► Procesa 1 a 30 tarjetas sin rechazar arrays cortos
       ├─► Aleatorización Fisher-Yates de opciones múltiples (a-d)
       └─► Registro atómico de uso de cuota (recordApiUsage)
       │
       ▼
[Cliente recibe tarjetas] ──► Guardado en Supabase vía Zustand (createCard)
```

### Ventajas Clave del Pipeline con `pdf-lib`:
- **Cero dependencias de DOM/Canvas:** A diferencia de `pdf-parse` o `pdfjs-dist`, `pdf-lib` no requiere polyfills de Canvas ni inicialización de web workers que bloqueaban Turbopack en Next.js App Router (`Setting up fake worker failed`).
- **Capacidad Multimodal Real:** Al enviar un PDF recortado directamente a Gemini como `inlineData`, el modelo de lenguaje "ve" las páginas exactamente como fueron maquetadas, leyendo tablas complejas, pies de foto, diagramas anatómicos e infografías que se perdían por completo al extraer texto plano.

---

## 5. LÓGICA ANTI-DUPLICADOS Y ESQUEMA JSON DINÁMICO

### 5.1. El Conflicto Histórico de Generación
- **Fase inicial ("Lazy Generation"):** Modelos de lenguaje compactos como Flash-Lite tendían a detenerse tras 10 o 15 tarjetas alegando que el material nuclear se había agotado.
- **Fase de directiva estricta:** Al forzar al modelo con la directiva `"DEBES GENERAR EXACTAMENTE 30 TARJETAS O SERÁ FALLO CRÍTICO"`, Gemini, al llegar a re-generaciones consecutivas sobre el mismo PDF, empezaba a repetir preguntas del historial o a refrasearlas para poder alcanzar la cuota impuesta.

### 5.2. La Solución Definitiva (Libre de Duplicados)
1. **Liberación del Esquema JSON (`flashcardSchema`):**
   - El esquema pasado en `responseJsonSchema` define `cards` como un array de objetos sin `minItems`.
   - El backend acepta e inserta cualquier array válido devuelto por Gemini entre **1 y 30 elementos**.
2. **Directiva Condicional por Historial (`buildTargetCountDirective`):**
   - **Primera Generación (`existingCards.length === 0`):** Exige rigurosidad total para cubrir la materia troncal del fragmento hasta el objetivo solicitado.
   - **Re-Generaciones (`existingCards.length > 0`):** Se relaja la cuota y se inyecta la orden final inquebrantable en el System Prompt y en las Reglas Globales:
     > *"ATENCIÓN: EL ESQUEMA JSON TE PERMITE DEVOLVER MENOS DE 30 TARJETAS. SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas). NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA."*
3. **Memoria de Progreso (`buildProgressMemorySection`):**
   - Ingesta hasta 60 conceptos previos del mazo.
   - Instruye a Gemini a identificar el punto exacto donde se detuvo el lote anterior y continuar secuencialmente hacia adelante.
4. **Radar de Profundidad (`core_exhausted`):**
   - La IA reporta `core_exhausted: true` únicamente cuando la materia troncal se vacía matemáticamente, alertando al usuario en la interfaz de que el mazo ha cubierto la teoría principal y comenzará a extraer detalles minuciosos y tablas avanzadas.

---

## 6. MAPA DE ARCHIVOS CLAVE PARA DESARROLLADORES

```
flashcards-app/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── decks/[id]/page.tsx      # Vista principal del mazo, estadísticas FSRS y modal de generadores
│   │   │   └── page.tsx                 # Dashboard principal y listado de mazos
│   │   ├── actions/
│   │   │   ├── generateCards.ts         # Server Action central: Gemini API, pdf-lib slicer, prompts y FSRS
│   │   │   ├── claimAdReward.ts         # Validación y asignación de bonus_credits tras ver rewarded ad
│   │   │   └── redeemPromoCode.ts       # Canje de cupones VIP / ilimitados
│   │   ├── layout.tsx                   # Layout raíz con proveedores y fuentes
│   │   └── globals.css                  # Directivas de Tailwind CSS v4
│   │
│   ├── components/
│   │   ├── cards/
│   │   │   ├── DocumentUploader.tsx     # Componente de subida de PDF/Word/Audio con validación y Escudo Financiero
│   │   │   ├── UrlCardGenerator.tsx     # Generador desde enlaces web y vídeos de YouTube
│   │   │   ├── FormattedCardView.tsx    # Renderizador de tarjetas (opción múltiple, cloze, etc.)
│   │   │   └── StudyModal.tsx           # Interfaz de estudio con algoritmo cognitivo FSRS
│   │   └── subscription/
│   │       ├── ProModal.tsx             # Modal de suscripción PRO, canje de códigos y simulador AdMob
│   │       └── AdMobRewardModal.tsx     # Componente visual para recompensas publicitarias
│   │
│   ├── lib/
│   │   ├── admob.ts                     # Controlador del simulador de anuncios recompensados AdMob
│   │   ├── cardUtils.ts                 # Algoritmo Fisher-Yates para aleatorizar opciones múltiples
│   │   ├── fsrs.ts                      # Instanciación y configuración matemática de ts-fsrs
│   │   ├── supabase.ts                  # Cliente de Supabase con persistencia de sesión
│   │   └── resend.ts                    # Cliente de Resend para notificaciones
│   │
│   ├── locales/
│   │   ├── es.json                      # Diccionario maestro de internacionalización (Español)
│   │   └── en.json                      # Diccionario maestro de internacionalización (Inglés)
│   │
│   ├── stores/
│   │   ├── useAuthStore.ts              # Estado de usuario autenticado
│   │   ├── useCardStore.ts              # CRUD de tarjetas locales y sincronización con Supabase
│   │   ├── useDeckStore.ts              # Gestión de mazos y carpetas
│   │   ├── useLanguageStore.ts          # Selector de idioma (es/en) con persistencia
│   │   └── useProModalStore.ts          # Control de apertura del modal de suscripción y límites
│   │
│   └── types/
│       ├── cards.ts                     # Tipos de tarjetas, formatos y payloads de generación
│       └── database.ts                  # Definición de tablas de Supabase (decks, cards, api_limits)
│
├── package.json                         # Dependencias y scripts de Turbopack
├── next.config.ts                       # Configuración de Next.js
└── STATE_OF_THE_APP.md                  # Este documento
```

---

## 7. VARIABLES DE ENTORNO Y CONFIGURACIÓN

Crea o revisa tu archivo `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# Google Gemini API
GEMINI_API_KEY=tu-gemini-api-key

# Stripe (Opcional si se usa modo producción)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_API_KEY=re_...
```

---

## 8. GUÍA DE DESPLIEGUE Y COMANDOS DE DESARROLLO

```bash
# Instalar dependencias
npm install

# Comprobación de tipado TypeScript
npx tsc --noEmit

# Servidor de desarrollo con Turbopack
npm run dev

# Compilación de producción optimizada
npm run build

# Despliegue en Vercel
vercel --prod
```

---
*Fin del documento STATE_OF_THE_APP.md — Flashmente Engineering Team.*
