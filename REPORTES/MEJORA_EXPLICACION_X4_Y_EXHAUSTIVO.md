# INFORME DE IMPLEMENTACIÓN: EXPLICACIÓN DETALLADA, EQUILIBRIO EN TEST X4 Y EXTRACCIÓN EN MODO EXHAUSTIVO

**Fecha:** 20 de Noviembre de 2026  
**Alcance:** Mejoras quirúrgicas en calidad pedagógica del reverso, simetría en test x4 y continuidad de extracción en Modo Exhaustivo (no docente).  
**Garantías verificadas:**
- **Modo Docente intacto:** 0 modificaciones en `buildDidacticModeDirective`, `partitionPagesIntoChunks`, `getDidacticFormatSection`, `docenteFormat` ni en bloques `if (isDocenteMode)`.
- **Diseño visual y PDF intactos:** 0 modificaciones en componentes de UI ni en la exportación PDF de la Guía de Repaso.
- **Control de calidad:** `npx tsc --noEmit` (0 errores) y `npx eslint src/ --quiet` (0 errores).

---

## 1. EXPLICACIÓN DETALLADA (PUNTO INTERMEDIO + AHORRO DE TOKENS DE SALIDA)

### Cambios aplicados
- **`src/lib/aiDirectives.ts` (`ZERO_MISMATCH_DIRECTIVE`):**
  - Se redefinió el campo `"justification"` para preguntas `multiple_choice` como una **micro-explicación directa de 2 frases (30 a 50 palabras máximo)**, sin tono conversacional ni preguntas socráticas al alumno:
    1. **Frase 1 (Fundamento causal):** Explica brevemente el *porqué* conceptual, mecanismo o regla que sustenta la respuesta correcta **sin limitarse a repetir o parafrasear literalmente el enunciado ni la opción ganadora**.
    2. **Frase 2 (Contraste breve):** Aclara en una línea por qué se descarta el distractor más cercano o qué confusión habitual evitar (ej. *"No confundir con [distractor], que..."*).
    3. **Línea final obligatoria:** Mantiene intacta la etiqueta determinista `VEREDICTO_EXACTO: [texto exacto de la opción ganadora]` para el reconciliador del backend.
  - **Eliminación de duplicación en JSON (`back`):** En `multiple_choice`, el prompt solicita ahora que `"back"` contenga únicamente `[letra]) [texto exacto de la opción ganadora]`, evitando que Gemini escriba la misma explicación dos veces dentro del mismo JSON. El backend (`processGeneratedCards` en `generateCards.ts` y `generateCardsFromNotes.ts`) continúa ensamblando automáticamente `${letter}) ${correctText}\n\nExplicación: ${rawExplanation}` a partir de `"justification"`, preservando al 100% el formato almacenado en Supabase y el renderizado en `FormattedCardView.tsx`, con un **ahorro estimado del ~30-35% en tokens de salida** dedicados al reverso.
- **`src/app/actions/generateCards.ts`:**
  - Actualizadas las descripciones de `justification` y `back` en `cardItemSchemaProperties`, `getFormatRule('multiple_choice')` y `getFormatInstructions('multiple_choice')`.
- **`src/app/actions/generateCardsFromNotes.ts`:**
  - Actualizada `getFormatInstructions('multiple_choice')` con la misma micro-explicación de 2 frases y el formato optimizado sin duplicación en `"back"`.

---

## 2. EQUILIBRIO EN OPCIONES TEST X4 (SIN PERDER VOLUMEN NI COBERTURA)

### Cambios aplicados
- **`src/lib/aiDirectives.ts` (`DISTRACTOR_VEROSIMILITUDE_DIRECTIVE`):**
  - **Homogeneidad de Longitud y Matices:** Refuerzo equilibrado para evitar que la opción correcta sea una oración larga y matizada frente a 3 distractores cortos, especificando explícitamente no caer en redacciones rebuscadas que frenen la cobertura del texto.
  - **Anti-Eco Léxico suave:** Evitar que la opción correcta sea la única que repite literalmente palabras clave del enunciado.
  - **Prohibición de Opciones Meta-Referenciales:** Se prohíben expresamente opciones dependientes del orden o con referencias a letras (*"Todas las anteriores"*, *"Ninguna de las anteriores"*, *"Todas son correctas"*, *"Ninguna es correcta"*, *"A y B son ciertas"*) que entrarían en conflicto con el barajado Fisher-Yates (`randomizeMultipleChoiceCard`).
  - **Prioridad de Cobertura en Páginas de Concepto Único:** La pregunta y la respuesta correcta permanecen 100% ancladas al texto fuente; si una página breve desarrolla una única entidad sin 3 alternativas en esa misma página, se autoriza usar términos técnicos plausibles del mismo campo disciplinar exclusivamente como distractores falsos en lugar de crear negaciones obvias o recortar el volumen de preguntas.
- **`src/app/actions/generateCards.ts` (`getGlobalRules`, regla 5):**
  - Alineada la regla de grounding para proteger la cobertura en páginas de un solo concepto sin perder rigor factual en la pregunta ni en la respuesta correcta.
- **`src/app/actions/generateCardsFromNotes.ts`:**
  - Importada e inyectada `DISTRACTOR_VEROSIMILITUDE_DIRECTIVE` en el modo no docente (`!isDocenteMode`), equiparando la calidad de los test generados desde apuntes manuscritos con el resto de flujos sin tocar el Modo Docente.

---

## 3. CONTINUIDAD DE EXTRACCIÓN EN MODO EXHAUSTIVO (SIN FRENAZO EN PDF / DOCX)

### Cambios aplicados
- **`src/app/actions/generateCards.ts` (Bucle de Modo Estudio en PDF y DOCX — ramas `else` no docentes):**
  - Se aplicó una **ventana deslizante (`accumulatedHistory.slice(-18)`)** para construir `coveredTopics` en el prompt cuando `isExhaustiveMode === true`, evitando que una lista masiva de 50-80 conceptos previos en el `systemInstruction` inhiba a `gemini-3.1-flash-lite` en las páginas intermedias y finales de documentos extensos.
  - Se reforzó la nota de Modo Exhaustivo indicando explícitamente no reducir el ritmo ni el volumen de extracción en páginas intermedias o finales.
  - **Deduplicación global intacta:** `deduplicateCandidateCards()` sigue recibiendo el historial completo `accumulatedHistory` (y `existingCards`), garantizando que no entren duplicados reales sin asfixiar la generación del modelo.

---

## 4. ARCHIVOS MODIFICADOS

- `src/lib/aiDirectives.ts`
- `src/app/actions/generateCards.ts`
- `src/app/actions/generateCardsFromNotes.ts`
