# AUDITORÍA PSICOMÉTRICA Y TÉCNICA: CALIDAD DE OPCIONES EN TEST X4 Y MODO DOCENTE (TAXONOMÍA DE BLOOM)

**Fecha de auditoría:** 20 de Noviembre de 2026  
**Modo de ejecución:** Estrictamente Solo Lectura (0 modificaciones en código, esquemas o repositorio)  
**Motor de IA auditado:** `gemini-3.1-flash-lite` (`src/lib/aiConfig.ts`)  
**Archivos inspeccionados:**
- `src/lib/aiDirectives.ts`
- `src/app/actions/generateCards.ts`
- `src/app/actions/generateCardsFromNotes.ts`
- `src/lib/cardUtils.ts`
- `src/app/api/generate/route.ts`

---

## 1. ARQUITECTURA DE PROMPTS Y GENERACIÓN DE TEST X4 (MODOS ESTÁNDAR VS. MODO DOCENTE)

### 1.1. Mapa de Flujos de Generación de Test de 4 Opciones (`multiple_choice`)
Las preguntas tipo test de 4 opciones (`a, b, c, d`) se construyen y procesan a través de 4 flujos principales en el backend:

1. **Generación por Tema / Texto (`generateCardsAction` en `src/app/actions/generateCards.ts`):**
   - Si `targetCount < 20`: 1 llamada a Gemini con `buildSystemPrompt()` + `getGlobalRules()` + `getFormatInstructions('multiple_choice')`.
   - Si `targetCount >= 20`: *Concurrent Batching* (2 llamadas paralelas dividiendo el lote en Lote 1: Definición/Etiología/Conceptos fundamentales y Lote 2: Diagnóstico/Tratamiento/Casos/Excepciones).
2. **Generación Multimodal por Documento (`generateCardsFromDocumentAction` en `src/app/actions/generateCards.ts`):**
   - **PDF y Word (`.docx`):**
     - **En Modos No Docentes (Modo Estudio Normal / Exhaustivo / Práctico):** Utiliza un **Bucle Secuencial Página a Página** (`while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage)`), aislando cada página individual y exigiendo un `inventario_factual` previo con relación 1 a 1 (`1 hecho = 1 tarjeta`).
     - **En Modo Docente (`pedagogicalMode === 'didactic'`):** Utiliza un **Motor de Chunking Matemático** (`partitionPagesIntoChunks`) que agrupa el documento en entre 1 y 6 bloques de páginas y asigna una cuota cerrada por bloque (`currentChunkQuota + 2`), más un pase de rescate (*Top-Up*) si faltan preguntas tras la deduplicación.
   - **Audio / Vídeo / TXT (Fallback):** Usa `getGlobalRules()` + `getFormatInstructions()` (con *Concurrent Batching* si `targetCount >= 20`).
3. **Generación desde URLs y YouTube (`generateCardsFromUrlAction` en `src/app/actions/generateCards.ts`):**
   - Inyecta `getGlobalRules()` + `getFormatInstructions()` sobre la transcripción o el HTML limpio extraído.
4. **Generación desde Fotos de Apuntes Manuscritos (`generateCardsFromNotesAction` en `src/app/actions/generateCardsFromNotes.ts`):**
   - Utiliza un prompt propio de OCR caligráfico con su propia función local `getFormatInstructions()`.

---

### 1.2. Comparativa Directa: Modos Estándar (Teórico / Práctico / Exhaustivo) vs. Modo Docente

| Dimensión Técnica / Pedagógica | Modo Estándar Teórico (Estudio) | Modo Práctico (`isPracticalMode = true`) | Modo Docente (`pedagogicalMode = 'didactic'`) |
| :--- | :--- | :--- | :--- |
| **Unidad de extracción en PDF/DOCX** | Página individual (1 página por llamada) | Página individual (1 página por llamada) | Bloque multi-página (*Chunking* de 1 a 6 bloques) |
| **Andamiaje previo (`inventario_factual`)** | Matriz estricta de 4 dimensiones (Identidad, Función, Origen, Consecuencia) con relación **1 hecho = 1 tarjeta** | Matriz de 4 dimensiones transformando **1 hecho = 1 mini-caso aplicado** | Inventario factual del bloque orientado a cubrir la cuota matemática asignada (`requestChunkQuota`) |
| **Aplicación de la Taxonomía de Bloom** | **NO se inyecta** la directiva de proporción Bloom 30/50/20. La profundidad depende de las 4 dimensiones del inventario factual | Fuerza el 100% de las tarjetas a nivel de **Aplicación Situacional (Bloom 3-4)** mediante `[Contexto] + [Conflicto] + [Decisión]` | **SÍ se inyecta** explícitamente la Taxonomía de Bloom (cuota 30% Básico / 50% Aplicado / 20% Crítico) + calibración por edad (`targetAudience`) |
| **Calibración de Distractores** | `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` + `TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE` | `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` + Cláusula de *Distractores Prácticos* (errores procedimentales o vías contraindicadas) | `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` + Directiva específica de distractores por franja de edad (`9-11`, `12-14`, `15-17`, `university_plus`) |
| **Temperatura de inferencia (`temperature`)** | `0.15` (Normal) / `0.25` (Exhaustivo en tema/audio, pero fijado a `0.15` en bucle de página PDF/DOCX) | `0.15` | `0.15` (Normal) / `0.10` (Exhaustivo) / `0.20` (Rescate Top-Up) |
| **Formatos permitidos** | Fijo según elección del usuario (`multiple_choice`, `basic`, `cloze`, `true_false`) | Fijo según elección del usuario (por defecto `multiple_choice`) | Seleccionable en `docenteFormat`: `multiple_choice`, `mixed_test`, `true_false`, `cloze`, `basic`, `open_cases` |

---

### 1.3. Análisis del Uso de la Taxonomía de Bloom

1. **Exclusividad del Modo Docente:**
   - La constante `UNIVERSAL_BLOOM_PROPORTION_DIRECTIVE` (`src/lib/aiDirectives.ts`, líneas 95-108) y `bloomTaxonomyInstruction` (líneas 368-375) **solo se inyectan dentro de `buildDidacticModeDirective()`** (Modo Docente).
   - En los modos no docentes (Modo Estudio Teórico, Práctico o Exhaustivo), **no se aplica la distribución de Bloom 30/50/20**. En su lugar, el Modo Estudio utiliza la **Matriz Universal de 4 Dimensiones** (`1_identidad_definicion`, `2_funcion_mecanismo`, `3_origen_fuente_requisitos`, `4_consecuencia_falla_limite`).
2. **Inconsistencia menor de porcentajes en Modo Docente (`mixed_test` vs. `multiple_choice`):**
   - En `buildDidacticModeDirective()` (`src/lib/aiDirectives.ts`, líneas 368-375) y en `UNIVERSAL_BLOOM_PROPORTION_DIRECTIVE` (líneas 95-108), la proporción exigida es **30% Básico (Bloom 1-2) / 50% Intermedio-Aplicado (Bloom 3-4) / 20% Avanzado-Crítico (Bloom 5-6)**.
   - Sin embargo, en el cierre de `mixed_test` (`src/lib/aiDirectives.ts`, línea 429) y en `getDidacticFormatSection` / `getGlobalRules` (`src/app/actions/generateCards.ts`, líneas 320 y 493), el texto dice: `(30% básico, 40% intermedio, 30% avanzado)`. Aunque no rompe la generación, envía dos distribuciones porcentuales distintas al modelo en el mismo prompt cuando se usa `mixed_test`.
3. **Desconexión entre el Esquema JSON (`unifiedExtractionSchema`) y Bloom:**
   - El esquema JSON tiene un campo `tipo` dentro de `inventario_factual` (que clasifica por las 4 dimensiones factuales) y un campo `relevance_tier` dentro de `cards` (`A_core`, `B_exam_detail`, `C_trivial_filler`), pero **no existe un campo `bloom_level` en el esquema JSON de cada tarjeta**. Como resultado, Gemini recibe la orden de distribuir 30/50/20 en el prompt, pero no está obligado por el esquema estructurado a etiquetar ni contabilizar qué nivel de Bloom asigna a cada pregunta.

---

## 2. AUDITORÍA DE DISTRACTORES: ¿POR QUÉ Y CUÁNDO LA RESPUESTA CORRECTA PUEDE RESULTAR EVIDENTE?

### 2.1. Lo que YA está implementado y blindado en el sistema actual

El sistema cuenta con una base psicométrica notablemente avanzada en comparación con generadores estándar:

1. **Directiva explícita de Simetría y Verosimilitud (`DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` en `src/lib/aiDirectives.ts`):**
   - Prohíbe opciones absurdas o descartables por sentido común.
   - Define 4 fuentes taxonómicas obligatorias para distractores:
     - *a) Confusión de mecanismos cruzados o entidades análogas.*
     - *b) Umbrales cuantitativos limítrofes y rangos intercambiados.*
     - *c) Afirmaciones ciertas según el texto pero no pertinentes a la pregunta.*
     - *d) Inversión causa-efecto y falsos amigos.*
   - Exige **Homogeneidad de Longitud** (contra la heurística de *"la más larga es la correcta"*), **Paralelismo Sintáctico** y **Prohibición de Absolutos Reveladores** (*"siempre"*, *"nunca"*).
   - En `ZERO_MISMATCH_DIRECTIVE` (líneas 84-86), prohíbe explícitamente las **respuestas tautológicas** que repiten la pregunta con otras palabras.
2. **Aleatorización Determinista Post-Generación (Fisher-Yates en `src/lib/cardUtils.ts`):**
   - Los LLMs tienen un fuerte sesgo posicional (tienden a colocar la respuesta correcta en la opción `a` o `b`,es decir, índice `0` o `1`).
   - Flashmente **neutraliza al 100% el sesgo de posición** mediante `randomizeMultipleChoiceCard()` (`src/lib/cardUtils.ts`, líneas 110-294), que aplica `shuffleArray()` (Fisher-Yates) en TypeScript después de que Gemini devuelve el JSON, reasignando dinámicamente las letras `a), b), c), d)` y actualizando `correct_option_index` y el reverso (`back`).

---

### 2.2. Brechas Detectadas: ¿Dónde y por qué la opción correcta sigue siendo predecible para el alumno?

A pesar de las directivas anteriores, el análisis cruzado del flujo cognitivo del esquema JSON y los prompts revela **6 puntos críticos** que hacen que `gemini-3.1-flash-lite` genere opciones correctas evidentes o distractores débiles en determinadas circunstancias:

#### HALLAZGO CRÍTICO 1: El efecto colateral del Chain-of-Thought previo (`justification` + `VEREDICTO_EXACTO` ANTES de `options`)
- **Mecanismo actual (`cardItemSchemaProperties` y `getFormatInstructions`):**
  El esquema JSON obliga a Gemini a generar las propiedades en este orden exacto:
  1. `justification` (que termina con `VEREDICTO_EXACTO: [texto exacto de la opción ganadora]`).
  2. `question`.
  3. `options` (`[opción 0, opción 1, opción 2, opción 3]`).
- **Por qué delata a la respuesta correcta:**
  Al obligar al modelo a redactar `VEREDICTO_EXACTO: [texto]` **antes** de haber pensado los 3 distractores, el modelo redacta el `VEREDICTO_EXACTO` como una **conclusión sintética completa, llena de matices, precisiones y cláusulas subordinadas** (ej. *"La inhibición competitiva reversible mediante la unión al sitio activo de la enzima sin alterar la Vmax"*).
  Acto seguido, cuando pasa a rellenar el array `options`, copia literalmente ese `VEREDICTO_EXACTO` como una de las opciones (para no violar el reconciliador determinista `ZERO_MISMATCH_DIRECTIVE`), y luego **improvisa 3 distractores más cortos, genéricos o menos matizados** (ej. *"La activación alostérica irreversible"*, *"La hidrólisis del sustrato"*, *"El bloqueo de la síntesis proteica"*).
- **Consecuencia:** La opción correcta destaca visualmente por tener **mayor densidad de matices, cláusulas aclaratorias ("mediante...", "debido a que...", "sin alterar...") o precisión léxica**, permitiendo al estudiante experimentado acertar por "peso específico de la frase" aunque no domine el dato.

#### HALLAZGO CRÍTICO 2: Tensión en documentos de 1 sola página entre `STRICT_GROUNDING_DIRECTIVE` y la creación de 3 distractores en páginas cortas
- **Mecanismo actual:**
  En el bucle página a página de PDF/DOCX (`generateCardsFromDocumentAction`), Gemini solo ve **1 página aislada** a la vez y recibe `STRICT_GROUNDING_DIRECTIVE`: *"Queda ESTRICTAMENTE PROHIBIDO recurrir a tu conocimiento general externo para incorporar conceptos, hechos, normas o datos que NO figuren explícitamente en el texto"* + *"Toda pregunta, afirmación, distractor o respuesta debe estar basada estricta y textualmente en el texto fuente"* (`getGlobalRules`, regla 5).
- **Por qué debilita los distractores:**
  Si una página individual solo habla de **un único concepto** (por ejemplo, explica únicamente la *Vitamina C* o un único artículo de una ley) y no menciona otras 3 vitaminas u otros 3 artículos en esa misma página, la prohibición radical de usar términos del dominio que no estén textualmente en esa página concreta deja a `gemini-3.1-flash-lite` sin "hermanos taxonómicos" para construir 3 distractores plausibles.
- **Consecuencia:** Para obedecer la regla de no usar ningún término externo a esa página, el modelo recurre a **negar burdamente propiedades del propio texto** (ej. *"Disminuye la absorción de hierro"* cuando la correcta es *"Aumenta la absorción de hierro"*) o a inventar combinaciones artificiales con las pocas palabras presentes en esa página, haciendo que los 3 distractores suenen forzados o contradictorios frente a la fluidez natural de la opción verdadera.

#### HALLAZGO ALTO 3: Ausencia de `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` en la generación desde Apuntes Manuscritos (`generateCardsFromNotes.ts`)
- **Mecanismo actual:**
  En `src/app/actions/generateCardsFromNotes.ts` (líneas 10-15 y 390-416), se importan `buildDidacticModeDirective`, `PRACTICAL_MODE_DIRECTIVE`, `ZERO_MISMATCH_DIRECTIVE` y `buildUniversalTablesDirective`, pero **NO se importa ni se inyecta `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` ni `TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE`** cuando el usuario está en modo estándar (`pedagogicalMode === 'academic'`).
- **Además:** Su función local `getFormatInstructions('multiple_choice')` (líneas 100-108) es una versión reducida que solo pide *"Exactamente 4 alternativas plausibles"*, sin mencionar simetría de longitud, paralelismo sintáctico ni prohibición de absolutos.
- **Consecuencia:** En los mazos creados desde fotos de apuntes/cámara en modo estándar, los distractores carecen por completo de blindaje psicométrico.

#### HALLAZGO MEDIO 4: Mandato de concisión por límite de tokens en Tema, URL y Lotes que comprime los distractores
- **Mecanismo actual:**
  En `generateCardsAction` (línea 1907), `generateCardsFromDocumentAction` fallback (línea 3943) y `generateCardsFromUrlAction` (línea 4247), el prompt finaliza con:
  *"Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa."*
- **Por qué afecta a la calidad del test x4:**
  En un modelo ligero como `gemini-3.1-flash-lite`, una instrucción de ahorro de tokens al final del prompt (*recency bias*) hace que el modelo recorte longitud donde menos penalización recibe: en los **3 distractores**. La opción correcta conserva toda la información del `inventario_factual` (para cumplir con `VEREDICTO_EXACTO`), mientras que los 3 distractores se acortan para ahorrar tokens.

#### HALLAZGO MEDIO 5: Falta de prohibición explícita de fórmulas cliché ("Todas las anteriores", "Ninguna es correcta", "A y B son ciertas") + Riesgo al barajar con Fisher-Yates
- **Mecanismo actual:**
  En ninguna parte de `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` ni de `getFormatInstructions` se prohíbe explícitamente generar opciones como *"Todas las anteriores son correctas"*, *"Ninguna de las anteriores"* o *"Tanto A como B son correctas"*.
- **Peligro crítico con Fisher-Yates:**
  Dado que `randomizeMultipleChoiceCard()` baraja las 4 opciones con Fisher-Yates **después** de que la IA las redacta, si Gemini genera *"Todas las anteriores son correctas"* en la posición `d)` (`index 3`), el algoritmo Fisher-Yates puede moverla a la posición `a)` (`index 0`) o `b)` (`index 1`), quedando en el anverso de la tarjeta:
  `a) Todas las anteriores son correctas.` (¡en primera posición!), o rompiendo referencias cruzadas como *"Tanto A como B"*.

#### HALLAZGO MEDIO 6: Solapamiento léxico directo (Stem-Option Cueing / "Pista por eco gramatical")
- **Mecanismo actual:**
  En Modo Estudio Teórico, como cada tarjeta nace de una `declaracion_factual` atómica del `inventario_factual` (relación 1 a 1), el modelo suele dividir esa oración en dos mitades: la primera mitad va a `question` y la segunda mitad va a la opción correcta (`VEREDICTO_EXACTO`).
- **Por qué delata a la correcta:**
  A menudo la opción correcta conserva conectores, género/número específico o palabras técnicas exactas que hacen "eco léxico" con el enunciado de la pregunta, mientras que los distractores —tomados de otros párrafos de la página— no encajan con la misma continuidad estilística. No existe aún una regla explícita contra el *Stem-Option Lexical Echo* (evitar que la opción correcta sea la única que repite sustantivos clave del enunciado o la única que completa gramaticalmente la frase sin fricción).

---

## 3. DIAGNÓSTICO RESUMIDO Y PROPUESTAS DE MEJORA (SIN APLICAR)

### 3.1. Qué funciona muy bien hoy (No tocar)
1. **Barajado determinista Fisher-Yates (`randomizeMultipleChoiceCard` en `src/lib/cardUtils.ts`):** Elimina de raíz el sesgo posicional de la IA y sincroniza anverso, reverso, array `options` e índice `correct_option_index`.
2. **Reconciliador determinista (`VEREDICTO_EXACTO` + puntuador léxico en `processGeneratedCards`):** Evita que una tarjeta marque como correcta la opción `b)` cuando la explicación demuestra que es la `c)`.
3. **Diferenciación de motores en PDF/DOCX:** El bucle página a página para Modo Estudio vs. el motor de *Chunking* proporcional para Modo Docente es arquitectónicamente sólido: Modo Docente tiene visión de conjunto de varias páginas (lo que de hecho le permite crear **mejores distractores cruzados** que el Modo Estudio página a página).
4. **Calibración por edad en Modo Docente (`9-11`, `12-14`, `15-17`, `university_plus`):** Ajusta muy bien el tipo de error conceptual que sirve de distractor para cada etapa educativa.

---

### 3.2. Propuestas Quirúrgicas de Mejora (Para futura orden de implementación)

Para erradicar la predictibilidad de la opción correcta sin alterar la estructura de tarjetas ni romper el reconciliador `VEREDICTO_EXACTO`, se recomiendan los siguientes 5 ajustes:

#### Propuesta 1: Regla de "Espejo de Complejidad y Matiz" (*Complexity & Qualifier Mirroring*) en `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE`
Añadir en el punto 3 de `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` (`src/lib/aiDirectives.ts`):
- **Simetría de Matices y Subordinación:** *"Si la opción correcta (`VEREDICTO_EXACTO`) incluye una explicación causal, condición o cláusula subordinada ('mediante...', 'debido a...', 'cuando...'), los 3 distractores DEBEN incluir obligatoriamente una cláusula subordinada o matiz técnico de idéntica estructura y longitud (±15% de palabras). Queda prohibido que la opción correcta sea una oración compuesta detallada y los distractores sean sintagmas cortos."*
- **Anti-Eco Léxico (*Zero Stem-Cueing*):** *"Evita que la opción correcta sea la única que repite palabras técnicas del enunciado; o bien ningún distractor las repite, o bien todos los distractores utilizan la misma estructura de palabras clave del enunciado."*

#### Propuesta 2: Prohibición Absoluta de Opciones Meta-Referenciales (Compatible con Fisher-Yates)
Añadir en `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` y en `getFormatInstructions('multiple_choice')`:
- *"Queda TERMINANTEMENTE PROHIBIDO generar opciones meta-referenciales o dependientes del orden como 'Todas las anteriores', 'Ninguna de las anteriores', 'Todas son correctas', 'Ninguna es correcta' o 'A y B son ciertas', dado que las opciones se barajan aleatoriamente tras la generación."*

#### Propuesta 3: Flexibilización Controlada del Grounding exclusivamente para Distractores en Páginas de Concepto Único
Matizar `STRICT_GROUNDING_DIRECTIVE` y la regla 5 de `getGlobalRules` para que distinga entre **hecho evaluado/respuesta correcta** y **distractores**:
- *"La pregunta y la respuesta correcta DEBEN extraerse estricta y exclusivamente del texto fuente. Para los 3 distractores, prioriza utilizar conceptos, cifras o mecanismos presentes en la misma página/documento; si la página actual solo menciona una única entidad y no contiene suficientes elementos para 3 distractores, estás autorizado a emplear términos técnicos verosímiles del mismo campo disciplinar exclusivamente como distractores falsos, en lugar de crear negaciones obvias o absurdas."*

#### Propuesta 4: Inyección de `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` en `generateCardsFromNotes.ts`
- Importar e inyectar `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` y las instrucciones completas de simetría de `multiple_choice` en `src/app/actions/generateCardsFromNotes.ts`, igualando la calidad de los test generados desde fotos de apuntes con los generados desde PDF/DOCX.

#### Propuesta 5: Unificación del porcentaje de Bloom en Modo Docente (`30/50/20`) y Etiqueta Interna de Nivel de Bloom
- Unificar la mención `(30% básico, 40% intermedio, 30% avanzado)` de las líneas 320 y 493 de `generateCards.ts` y línea 429 de `aiDirectives.ts` al estándar `30% básico / 50% intermedio-aplicado / 20% avanzado-crítico` de `UNIVERSAL_BLOOM_PROPORTION_DIRECTIVE`.
- En Modo Estudio Teórico (cuando el formato sea `multiple_choice`), permitir que al menos las dimensiones `2_funcion_mecanismo` y `4_consecuencia_falla_limite` del inventario factual se formulen con nivel de comprensión/análisis (Bloom 2-4) en lugar de mera repetición literal (Bloom 1), reduciendo el fenómeno de "frase partida por la mitad".
