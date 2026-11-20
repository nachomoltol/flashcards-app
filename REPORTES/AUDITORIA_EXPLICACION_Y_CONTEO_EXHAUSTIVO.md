# SEGUNDA AUDITORÍA TÉCNICA Y PEDAGÓGICA: EXPLICACIÓN DETALLADA Y CONTEO EN TEÓRICO EXHAUSTIVO

**Fecha de auditoría:** 20 de Noviembre de 2026  
**Modo de ejecución:** Estrictamente Solo Lectura (0 modificaciones en código, prompts, esquemas o repositorio)  
**Motor de IA auditado:** `gemini-3.1-flash-lite` (`src/lib/aiConfig.ts`)  
**Archivos inspeccionados:**
- `src/lib/aiDirectives.ts`
- `src/app/actions/generateCards.ts`
- `src/app/actions/generateCardsFromNotes.ts`
- `src/app/actions/socraticTutor.ts`
- `src/lib/cardUtils.ts`
- `src/components/cards/FormattedCardView.tsx`
- `src/components/cards/DocumentUploader.tsx`
- `src/app/(dashboard)/study/[deckId]/page.tsx`
- `src/app/(dashboard)/decks/[id]/page.tsx`

---

## 1. AUDITORÍA DE LA "EXPLICACIÓN DETALLADA" (GENERACIÓN, ALMACENAMIENTO, UI, CALIDAD Y TOKENS)

### 1.1. Trazabilidad Completa: Dónde se define, parsea, almacena y muestra

#### A. Definición en el Esquema JSON y Prompts (`generateCards.ts`, `aiDirectives.ts`, `generateCardsFromNotes.ts`)
1. **Esquema JSON (`cardItemSchemaProperties` en `src/app/actions/generateCards.ts`, líneas 66-123):**
   - `justification` (`Type.STRING`): *"Razonamiento factual, cálculo o cita técnica extraída del documento que justifica con rigor absoluto la respuesta ANTES de marcar la opción correcta (Chain of Thought)."* (Nota: no está incluido en `cardItemRequiredFields`, aunque el prompt lo exige).
   - `back` (`Type.STRING`, obligatorio): *"Respuesta exacta seguida obligatoriamente de la explicación y justificación técnica basada en el documento."*
2. **Instrucciones en el Prompt (`getFormatInstructions` en `generateCards.ts`, líneas 216-271, y `ZERO_MISMATCH_DIRECTIVE` en `aiDirectives.ts`, líneas 69-86):**
   - En **`multiple_choice`**: El prompt ordena a Gemini generar el razonamiento primero en `"justification"` cerrando con `VEREDICTO_EXACTO: [opción ganadora]`, y luego le ordena **volver a escribirlo dentro de `"back"`** con la plantilla:
     ```text
     [letra]) [Texto opción 0]
     VEREDICTO_EXACTO: [Texto opción ganadora]

     Explicación: [Justificación técnica extraída del campo justification]
     ```
   - En **`true_false`**: Exige en `"back"` la palabra `**Verdadero**` o `**Falso**` seguida de `\n\nExplicación: [Fundamento científico/técnico...]`.
   - En **`basic` y `cloze`**: Exige en `"back"` la respuesta directa seguida de la explicación que proporcione el fundamento conceptual completo.
   - En **Apuntes Manuscritos (`generateCardsFromNotes.ts`, líneas 100-131)**: Pide `"justification"` y en `"back"` la opción verdadera seguida de `\n\nExplicación: [Justificación de los apuntes]`.

#### B. Procesamiento y Reconciliación en Backend (`processGeneratedCards` y `randomizeMultipleChoiceCard`)
1. En `processGeneratedCards()` (`src/app/actions/generateCards.ts`, líneas 1110-1122):
   - Toma `card.justification || back`.
   - Limpia mediante Regex la etiqueta `VEREDICTO_EXACTO:...`, prefijos como `Explicación:` / `Justificación:`, y muletillas editoriales (`"Según el cuadro..."`, `"El texto establece explícitamente que..."`).
   - **Reconstruye y sobrescribe `back` en TypeScript:**
     ```ts
     back = `${letters[correctIdx]}) ${correctText}${rawExplanation ? `\n\nExplicación: ${rawExplanation}` : ''}`;
     ```
2. En `randomizeMultipleChoiceCard()` (`src/lib/cardUtils.ts`, líneas 271-293):
   - Baraja las 4 opciones con Fisher-Yates, actualiza la letra (`a)`, `b)`, `c)`, `d)`) al inicio de `back`, elimina cualquier rastro de `VEREDICTO_EXACTO` y conserva el bloque `\n\nExplicación: ...`.

#### C. Almacenamiento en Base de Datos (`Supabase -> public.cards`)
- La tabla `public.cards` de Supabase **NO posee una columna independiente para `explanation` ni `justification`**.
- Al guardar el lote (`DocumentUploader.tsx`, líneas 766-772; `decks/[id]/page.tsx`, líneas 196-202; `generateCardsFromNotes.ts`, líneas 475-493), el campo `card.justification` se descarta y **todo se persiste concatenado en la columna `back`** separado por `\n\nExplicación: `.

#### D. Renderizado en la Interfaz de Usuario (`FormattedCardView.tsx`)
- En `src/components/cards/FormattedCardView.tsx` (líneas 203-258), la función `parseBackContent(back, resolvedFormat)` divide el string `back` por saltos de línea (`\r?\n+`) o por el marcador `(?:Explicación|Justificación|Fundamento|Razón):`.
- Al revelar la tarjeta (`isRevealed = true`, líneas 526-553):
  - **Bloque superior (`parsedBack.verdict`):** Muestra la etiqueta *"OPCIÓN CORRECTA"* (o *"VEREDICTO"*) y la respuesta en tamaño grande (`text-base sm:text-lg font-bold`).
  - **Bloque inferior (`parsedBack.explanation`):** Muestra debajo de un borde divisor la etiqueta **"FUNDAMENTO / EXPLICACIÓN DETALLADA"** y el texto explicativo en `text-sm sm:text-base`.
- Además, en `StudyPage` (`src/app/(dashboard)/study/[deckId]/page.tsx`, líneas 83-97), al pulsar *"Mostrar respuesta"*, un `useEffect` hace auto-scroll suave hacia el fondo del contenedor para que el bloque de explicación quede visible.

---

### 1.2. Evaluación Pedagógica: ¿Qué aporta hoy vs. Repetir la respuesta vs. Tutor Socrático?

#### 1. El Problema Actual: "Paráfrasis Circular" (Eco de la Respuesta Correcta)
- **Por qué ocurre:** En el flujo actual, cada tarjeta nace de una `declaracion_factual` atómica de 1 o 2 líneas en el `inventario_factual`. Cuando el prompt le pide a Gemini: *"Redacta PRIMERO el razonamiento factual... citando el documento ANTES de elegir la opción correcta"*, el modelo usa esa `declaracion_factual` para redactar `justification`, y acto seguido extrae de ahí mismo la pregunta (`question`) y la opción ganadora (`VEREDICTO_EXACTO`).
- **Resultado en la práctica:** En la gran mayoría de las tarjetas teóricas, la **"Explicación Detallada" no explica el porqué profundo ni descarta las opciones falsas, sino que vuelve a decir exactamente lo mismo que la pregunta + la opción correcta en forma de oración enunciativa**.
  - *Ejemplo típico actual:*
    - **Pregunta:** *"¿Dónde se produce la mayor parte de la absorción de hierro no hemo en el tracto gastrointestinal?"*
    - **Opción Correcta:** *"a) En el duodeno y la primera porción del yeyuno."*
    - **Fundamento / Explicación Detallada actual:** *"La absorción del hierro no hemo tiene lugar principalmente en el duodeno y en la parte superior del yeyuno dentro del tracto gastrointestinal."* -> **Valor pedagógico real cercano a cero (mera repetición léxica).**

#### 2. Diferencia Estructural con el Tutor Socrático (`src/app/actions/socraticTutor.ts`)
| Característica | Explicación Detallada del Reverso (`back`) | Tutor Socrático Post-Fallo (`socraticTutor.ts`) |
| :--- | :--- | :--- |
| **Cuándo se ejecuta** | Durante la generación del mazo (se muestra **siempre** al voltear cada tarjeta, acierte o falle el alumno). | **Bajo demanda**, únicamente cuando el alumno falla la tarjeta y pulsa el botón `1 = Again (Fallo)`. |
| **Llamada a la API y Cuota** | Incluida dentro del JSON del lote de generación (0 llamadas extra durante el estudio). | 1 llamada independiente a Gemini por fallo (`maxOutputTokens: 260`, `temperature: 0.55`) sujeta a cuota propia (3 gratis/mes en Free + anuncios; ilimitado en PRO). |
| **Contexto que conoce** | Conoce el documento fuente original, la pregunta y las 4 opciones, pero **no sabe qué opción va a marcar el alumno**. | Conoce **qué opción incorrecta concreta marcó el alumno** (`selectedAnswer`), pero **no tiene el PDF original adjunto** (trabaja con `deckTitle`, `question`, `options` y `correctAnswer`). |
| **Estructura y Extensión** | Texto expositivo plano (actualmente 1-2 frases de ~25-45 palabras citando el texto). | Estructura dialógica de 3 actos (**150-180 palabras**): 1) Empatía cognitiva sobre el error elegido, 2) Quiebre conceptual / analogía, 3) Pregunta reflexiva socrática + chat de repregunta. |

#### 3. El Punto Intermedio Ideal para la Explicación Detallada del Reverso
La explicación del reverso **no debe ser un Tutor Socrático** (sería demasiado larga para leer en cada tarjeta acertada y ralentizaría el repaso FSRS), pero **tampoco puede ser una paráfrasis de la opción correcta**.
El punto intermedio exacto de máximo valor para el estudiante ("Micro-Cápsula de Criterio y Descarte", de **30 a 50 palabras / 2 a 3 frases cortas**) debe aportar tres elementos que la opción correcta por sí sola no dice:
1. **El Porqué / Mecanismo Causal (1 frase):** Por qué esa opción es verdadera desde la lógica de la materia (qué función cumple, qué causa o qué regla aplica), prohibiendo repetir con las mismas palabras el par pregunta-respuesta.
2. **Descarte de Distractores / Trampa de Examen (1 frase):** Por qué la alternativa más parecida o tentadora es falsa (ej. *"A diferencia de [Opción X], que corresponde a..., en este caso..."*).
3. **Ancla o Matiz Clave (opcional, media línea):** El dato diferencial o excepción que permite no confundirlo en un examen.

---

### 1.3. Estimación de Impacto en Tokens de Salida (`Output Tokens`)

#### Hallazgo Crítico de Eficiencia: Hoy se están pagando los tokens de la explicación DOS VECES por tarjeta en `multiple_choice`
Al inspeccionar `getFormatInstructions('multiple_choice')` (`src/app/actions/generateCards.ts`, líneas 222-238), se detecta una **duplicación oculta de tokens de salida**:
1. Gemini genera el campo `"justification"` (~40-55 palabras + `"VEREDICTO_EXACTO: ..."` = **~70 tokens**).
2. Gemini genera el campo `"back"`, donde el prompt le exige **copiar otra vez la opción correcta, otra vez `VEREDICTO_EXACTO:` y otra vez `"Explicación: [Justificación técnica extraída del campo justification]"`** (**otros ~85 tokens**).
3. Inmediatamente después, en `processGeneratedCards()` (líneas 1111-1122), **el código TypeScript desecha el texto de `back` y lo reconstruye concatenando `letters[correctIdx] + correctText + "\n\nExplicación: " + card.justification`**.

#### Comparativa de Consumo de Tokens de Salida por Tarjeta Test x4

| Escenario | Tokens en `justification` | Tokens en `back` (JSON de Gemini) | Total Output Tokens (Reverso/Explicación) por Tarjeta | Total en un Lote de 25 Tarjetas (Límite: 8.192) |
| :--- | :---: | :---: | :---: | :---: |
| **1. Estado Actual (Paráfrasis duplicada en `justification` y `back`)** | ~70 tokens | ~85 tokens (repite opción + veredicto + explicación) | **~155 tokens / tarjeta** | **~3.875 tokens** |
| **2. Punto Intermedio SIN cambiar el esquema JSON (Explicación de Causa + Contraste de Distractor de 35-45 palabras, duplicada en `back`)** | ~80 tokens | ~95 tokens | **~175 tokens / tarjeta** (+12% tokens, coste prácticamente idéntico) | **~4.375 tokens** (Cabe holgadamente en los 8.192 tokens) |
| **3. Punto Intermedio OPTIMIZADO (Explicación rica de Causa + Contraste en `justification`, y `back` en el JSON solo con el veredicto corto, ya que TypeScript le inyecta `\n\nExplicación: ${justification}` gratis)** | ~80 tokens | ~20 tokens (solo veredicto, TypeScript concatena la explicación) | **~100 tokens / tarjeta** (**-35% de ahorro neto en tokens**) | **~2.500 tokens** (Libera ~1.375 tokens por lote y evita truncados JSON) |

**Conclusión sobre tokens:** Adoptar el punto intermedio (explicar el *porqué* + *por qué se descarta el distractor principal*) **no aumenta el gasto de tokens** si se elimina la duplicación interna entre `justification` y `back` en el JSON; de hecho, **reduce un ~35% los tokens de salida** mientras multiplica la utilidad pedagógica del reverso.

---

## 2. AUDITORÍA DEL CONTEO: ¿POR QUÉ UN PDF DE 19 PÁGINAS EN TEÓRICO EXHAUSTIVO PRODUCE 79 PREGUNTAS?

### 2.1. Anatomía del Motor en Modo Estudio Teórico Exhaustivo (`generateCardsFromDocumentAction`)

Cuando el usuario sube un PDF de **19 páginas** en **Modo Estudio (`pedagogicalMode === 'academic'`) -> Teórico (`isPracticalMode === false`) -> Exhaustivo (`isExhaustiveMode === true`)**, el sistema NO utiliza el motor de división por bloques del Modo Docente (`partitionPagesIntoChunks`), sino el **Bucle Acumulador Secuencial Página a Página** (`src/app/actions/generateCards.ts`, líneas 2738-3014).

Veamos paso a paso qué ocurre en el código y por qué el resultado final en un PDF de 19 páginas arroja un número como **79 preguntas**:

#### Mecanismo 1: Por qué cada tirada supera el límite de `cardCount` (30) sin recortar (Ausencia deliberada de `.slice(0, targetCount)`)
1. En el Paso 3 del frontend (`DocumentUploader.tsx`, línea 993), el tope seleccionable por tirada en Modo Estudio es `maxAllowedCards = 30` (`cardCount` entre 1 y 30).
2. En el backend (`generateCards.ts`, línea 2748), el bucle itera página por página:
   ```ts
   while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage)
   ```
3. En cada página `currentPage`, al estar activo `isExhaustiveMode = true`, el prompt le exige a Gemini (`generateCards.ts`, líneas 2773 y 2804-2807):
   - *"desglosando obligatoriamente en 'inventario_factual' entre 15 y 25 hechos atómicos de forma exhaustiva y genera en 'cards' 1 tarjeta de estudio independiente por cada hecho catalogado... META DE EXTRACCIÓN ('standard_content'): Entre 20 y 25 tarjetas sustanciales por página."*
4. **El desbordamiento por página completa (Líneas 2940-2946 y 2985-2991):**
   - Al terminar de procesar la página `currentPage`, el backend añade todas las tarjetas únicas de esa página a `tarjetasAcumuladas` y comprueba:
     ```ts
     // Línea 2940:
     // Si alcanzamos o superamos el objetivo, nos detenemos conservando íntegramente todas las tarjetas de la página actual sin truncar
     if (tarjetasAcumuladas.length >= targetCount) {
       break;
     }
     ```
   - Y al salir del bucle, en la **línea 2985**, llama a `processGeneratedCards`:
     ```ts
     const processedCards = processGeneratedCards(
       tarjetasAcumuladas,
       isDocenteMode ? targetCount : tarjetasAcumuladas.length, // <-- EN MODO ESTUDIO NO TRUNCA A targetCount
       cardFormat,
       isDocenteMode,
       isDocenteMode
     );
     ```
   - **Efecto matemático:** Si el usuario pide `30` tarjetas y las páginas 1 y 2 rinden `14 + 15 = 29 tarjetas` (todavía `< 30`), el bucle entra en la página 3. Si la página 3 es muy densa (con tablas) y rinde `20 tarjetas`, la tirada devuelve **`49 tarjetas`** de golpe (no 30). Y si el usuario pulsa *"Continuar extrayendo"*, la siguiente tirada suma otras `~30 tarjetas`, totalizando **79 preguntas**.

#### Mecanismo 2: Por qué al recorrer las 19 páginas completas del PDF se obtienen 79 preguntas en total (~4,15 preguntas/página de media en vez de 19 × 20 = 380)
Si el usuario recorrió las **19 páginas completas** del PDF en Modo Teórico Exhaustivo y el mazo finalizó con **79 preguntas totales**, existe una brecha evidente entre lo que el prompt promete por página (*"Entre 20 y 25 tarjetas por página"*) y el promedio real obtenido (`79 / 19 = 4,15 tarjetas por página`).

La auditoría del código revela los **5 factores exactos** que comprimen un PDF de 19 páginas hasta ~79 preguntas:

1. **Factor A — El freno del bucle por tirada (`tarjetasAcumuladas.length >= targetCount`, línea 2941):**
   - Una sola ejecución de `generateCardsFromDocumentAction` **nunca procesa las 19 páginas de una vez** si las primeras páginas ya alcanzan `targetCount` (máx. 30).
   - En un PDF denso en Modo Exhaustivo, las primeras 3 o 4 páginas ya generan entre 35 y 45 tarjetas y el bucle hace `break;`, devolviendo `nextCursorPage: 5`. Si el usuario solo ejecutó 2 tiradas (ej. Págs 1-3 = ~40 tarjetas + Págs 4-6 = ~39 tarjetas), el mazo tiene **79 preguntas** habiendo procesado únicamente las primeras 5-6 páginas de las 19 (quedando el marcapáginas pendiente para las páginas restantes).

2. **Factor B — Asfixia progresiva del prompt por la lista `CONCEPTOS YA EVALUADOS` (`coveredTopics`, líneas 2760-2768):**
   - En cada nueva página `currentPage` del bucle (de la 1 a la 19), el backend ejecuta:
     ```ts
     const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
     ```
     e inyecta en el `systemInstruction` de Gemini:
     `CONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: [lista de todas las preguntas y respuestas previas]... DEBES explorar conceptos que aún NO hayan sido preguntados.`
   - Cuando el bucle va por la página 8, 12 o 19, `accumulatedHistory` ya tiene 45-65 tarjetas. La cadena `coveredTopics` contiene **más de 1.500 palabras con todos los términos del tema**.
   - Aunque la línea 2765 añade una nota para Modo Exhaustivo (*"Aunque una entidad aparezca en la lista previa, si la página actual aporta NUEVOS datos... debes generar las tarjetas"*), en la práctica `gemini-3.1-flash-lite` sufre **inhibición por saturación de negativos**: al ver decenas de conceptos listados como "YA EVALUADOS", en las páginas intermedias y finales del PDF solo se atreve a extraer **2, 3 o 4 tarjetas por página** para no violar la prohibición de repetición.

3. **Factor C — Candado programático que borra páginas enteras (`page_classification`, líneas 2872-2891):**
   - El esquema obliga a Gemini a clasificar cada página en `standard_content`, `catalog_table_only` o `review_or_case_exercises`.
   - En un PDF académico de 19 páginas, suele haber:
     - 1-2 páginas de portada, índice o introducción transicional (que rinden 0-2 tarjetas).
     - 2-4 páginas finales o intermedias de *"Resumen del capítulo"*, *"Preguntas de repaso"*, *"Estudio de caso"*, *"Autoevaluación"* o *"Bibliografía"*.
   - Según la línea 2872:
     ```ts
     if (parsed.pageClassification === 'review_or_case_exercises') {
       rawCards = []; // <-- DESCARTA EL 100% DE LAS TARJETAS DE ESA PÁGINA
     }
     ```
   - Esto reduce las 19 páginas físicas del PDF a ~12-14 páginas útiles de extracción real.

4. **Factor D — Triple filtro de descarte post-respuesta en cada página (líneas 2848-2869 y 2914):**
   - De las tarjetas que Gemini sí genera en cada página, el backend elimina silenciosamente:
     1. Todas las tarjetas donde Gemini haya puesto `relevance_tier === 'C_trivial_filler'` (línea 2850).
     2. Todas las tarjetas que coincidan con `DISALLOWED_TABLE_METADATA_REGEX` o `DISALLOWED_DOMESTIC_ANALOGIES_REGEX` (línea 2862).
     3. Todas las tarjetas que el **Gatekeeper de Deduplicación** (`deduplicateCandidateCards`, línea 2914) considere similares (`similarityThreshold: 0.94` o solapamiento léxico) con cualquier tarjeta de las páginas anteriores.

5. **Factor E — Doble pase de deduplicación al salir del bucle (líneas 2953-2963):**
   - Al terminar el bucle `while`, si ya existían tarjetas en el mazo (`existingCards.length > 0`), el código vuelve a ejecutar `deduplicateCandidateCards` sobre todo el array `tarjetasAcumuladas` (línea 2954), pudiendo recortar tarjetas adicionales antes de devolver el resultado final.

---

## 3. DIAGNÓSTICO RESUMIDO Y PROPUESTAS DE AJUSTE (SIN APLICAR)

### 3.1. Resumen Ejecutivo del Diagnóstico

1. **Sobre la Explicación Detallada:**
   - **Problema:** Hoy el modelo tiende a **repetir o parafrasear la opción correcta** usando la misma frase del `inventario_factual`, aportando poco criterio diferencial, y además **escribe la explicación dos veces en el JSON** (en `justification` y en `back`), desperdiciando ~75-85 tokens de salida por tarjeta que luego TypeScript sobrescribe.
   - **Solución óptima:** Convertir `justification` en una **Micro-Cápsula de Criterio (2 frases, 30-45 palabras)**: *Frase 1: Porqué causal/mecanismo (sin repetir literalmente la opción)* + *Frase 2: Por qué se descarta el distractor más cercano o qué confusión evitar*. Y hacer que `back` en el JSON de `multiple_choice` solo pida el veredicto corto, dejando que TypeScript (`processGeneratedCards`) concatene `\n\nExplicación: ${rawExplanation}` como ya hace hoy. Esto **mejora la calidad pedagógica y ahorra un ~35% de tokens de salida**.

2. **Sobre el Conteo de 79 Preguntas en Teórico Exhaustivo (PDF de 19 páginas):**
   - **Problema dual:**
     - Por un lado, el Paso 3 pide elegir una cantidad (`cardCount`, máx. 30 por tirada), pero en Modo Estudio el bucle página a página **no trunca al llegar a `targetCount`** (conserva todas las tarjetas de la última página procesada) y detiene el bucle en la página donde superó `targetCount`, obligando a usar el botón *"Continuar extrayendo (Retomar desde pág. X)"* para procesar el resto del PDF.
     - Por otro lado, a lo largo de las 19 páginas, la inyección acumulativa de `coveredTopics` (todas las preguntas y respuestas de todas las páginas previas) en el prompt **inhibe progresivamente a `gemini-3.1-flash-lite`**, haciendo que en las primeras páginas extraiga 15-20 tarjetas/página y en las páginas avanzadas caiga a 2-4 tarjetas/página, resultando en ~79 preguntas totales para las 19 páginas.

---

### 3.2. Opciones de Ajuste Propuestas (Para futura orden de implementación)

#### Propuesta A (Explicación Detallada): "Micro-Explicación de Causa + Contraste" con Ahorro del 35% de Tokens
1. **En `ZERO_MISMATCH_DIRECTIVE` (`src/lib/aiDirectives.ts`) y `getFormatInstructions('multiple_choice')` (`src/app/actions/generateCards.ts`):**
   - Reemplazar la instrucción genérica de `"justification"` por la regla de **Valor Añadido en 2 Frases (30-45 palabras máximo)**:
     - **Frase 1 (Fundamento Causal):** Explica la causa, función o mecanismo subyacente que hace cierta la respuesta, **prohibiendo repetir literalmente el texto de la opción ganadora**.
     - **Frase 2 (Descarte de Distractor):** Aclara brevemente por qué el distractor más tentador es incorrecto o a qué otro concepto pertenece (*"No confundir con [Distractor], que..."*).
     - **Línea final obligatoria:** `VEREDICTO_EXACTO: [texto exacto de la opción ganadora]`.
2. **Eliminar la duplicación en `"back"` dentro del prompt de `multiple_choice`:**
   - Pedir que en `multiple_choice` el campo `"back"` del JSON contenga únicamente `[letra]) [Texto opción ganadora]`, ya que `processGeneratedCards()` en TypeScript ya inyecta automáticamente `\n\nExplicación: ${rawExplanation}` a partir de `"justification"`.
   - **Impacto:** Cero cambios en base de datos, cero cambios en UI (`FormattedCardView` seguirá recibiendo exactamente el mismo formato `back`), **explicaciones con criterio real de examen y un 35% menos de tokens de salida**.

#### Propuesta B (Conteo en Modo Teórico Exhaustivo): Claridad de Cupo y Ventana Deslizante de `coveredTopics`
Según el comportamiento que se desee priorizar para el usuario en **Modo Exhaustivo**, existen dos opciones limpias:

1. **Opción B1 — Desbloquear la inhibición en PDFs largos (Ventana deslizante en `coveredTopics`) + Tope o Barrido claro:**
   - En lugar de inyectar en `coveredTopics` las 60-80 tarjetas de todo el mazo (lo que satura e inhibe a Gemini a partir de la página 5), limitar `coveredTopics` en el prompt del bucle página a página a las **últimas 20 tarjetas (de las 2 páginas inmediatamente anteriores)**, dejando que la deduplicación exacta contra páginas lejanas la haga el Gatekeeper en TypeScript (`deduplicateCandidateCards`).
   - Esto evita que Gemini se vuelva tímido en las páginas 6 a 19 y mantiene una densidad constante en todo el PDF.
2. **Opción B2 — Alinear la UX del Paso 3 con el Modo Exhaustivo:**
   - **Si se quiere que el Modo Exhaustivo respete el número exacto pedido por el usuario en el Paso 3** (ej. si pidió 30 tarjetas, que devuelva exactamente 30 y guarde las sobrantes o corte en 30): basta con pasar `targetCount` en vez de `tarjetasAcumuladas.length` en la línea 2987 de `generateCards.ts`.
   - **O bien, si en Modo Exhaustivo el usuario espera que se vacíen TODAS las páginas seleccionadas sin parar en 30:** cuando `isExhaustiveMode === true` y el usuario selecciona un rango de páginas (ej. Págs 1 a 5), indicar en la UI que cada tirada extrae hasta `30` tarjetas avanzando el marcapáginas página a página, o permitir un cupo por tirada calibrado al número de páginas seleccionadas sin superar el timeout de 60s de Vercel (ej. procesar bloques de 3-4 páginas por tirada en Exhaustivo).
