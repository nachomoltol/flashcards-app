# INFORME DE IMPLEMENTACIÓN: JUSTIFICACIONES FINAS EN PREGUNTAS DIRECTAS/ESCALAS Y LIMPIEZA ORTOGRÁFICA/GRAMATICAL

**Fecha:** 20 de Noviembre de 2026  
**Alcance:** Refinamiento de justificaciones en preguntas directas, definiciones o ítems de tablas/escalas y refuerzo de pulcritud ortográfica, gramatical y tipográfica en opciones y justificaciones.  
**Garantías verificadas:**
- **Modo Docente intacto:** 0 modificaciones en `buildDidacticModeDirective`, `partitionPagesIntoChunks`, `getDidacticFormatSection`, `docenteFormat` ni en bloques exclusivos del Modo Docente.
- **Diseño visual y PDF intactos:** 0 modificaciones en UI ni en la exportación PDF de la Guía de Repaso.
- **Cobertura, volumen y tokens protegidos:** Sin filtros restrictivos adicionales, manteniendo la micro-explicación en 1–2 frases (30–50 palabras) y sin duplicación de texto en el JSON (`back` solo contiene el veredicto corto y el backend concatena la explicación desde `justification`).
- **Control de calidad:** `npx tsc --noEmit` (0 errores) y `npx eslint src/ --quiet` (0 errores).

---

## 1. JUSTIFICACIONES MÁS FINAS EN PREGUNTAS DIRECTAS, DEFINICIONES O ÍTEMS DE ESCALAS

### Cambios aplicados
- **`src/lib/aiDirectives.ts` (`ZERO_MISMATCH_DIRECTIVE`, punto 1):**
  - Se amplió la instrucción de `"justification"` (1–2 frases, 30–50 palabras máximo, sin tono conversacional ni preguntas socráticas) para cubrir explícitamente preguntas directas, definiciones e ítems/datos de tablas o escalas:
    - **Prohibición de paráfrasis ampliada:** Evita repetir o reformular lo obvio de la respuesta correcta.
    - **Valor añadido conciso:** Exige aportar un matiz práctico, contexto de aplicación, criterio interpretativo o el papel específico de ese ítem/grado dentro de la escala, seguido de un contraste breve con el distractor o ítem más cercano (*"No confundir con [distractor/otro ítem], que..."*).
- **`src/app/actions/generateCards.ts` (`cardItemSchemaProperties.justification` y `getFormatInstructions('multiple_choice')`):**
  - Sincronizada la descripción del esquema JSON y el paso `1º "justification"` con la nueva regla específica para definiciones e ítems de tablas/escalas.
- **`src/app/actions/generateCardsFromNotes.ts` (`getFormatInstructions('multiple_choice')`):**
  - Aplicada la misma pauta para apuntes manuscritos, manteniendo la optimización de tokens en `"back"`.

---

## 2. LIMPIEZA ORTOGRÁFICA, GRAMATICAL Y TIPOGRÁFICA

### Cambios aplicados
- **`src/lib/aiDirectives.ts` (`ZERO_MISMATCH_DIRECTIVE`, nuevo punto 5 — `PULCRITUD ORTOGRÁFICA, GRAMATICAL Y TIPOGRÁFICA`):**
  - Se añadió una regla explícita de revisión final sobre enunciado, las 4 opciones y la justificación antes de emitir el JSON:
    - Corregir verbos mal conjugados o infinitivos sueltos donde corresponda un verbo conjugado, concordancias de género y número, tildes y puntuación descuidada.
    - Evitar confusiones tipográficas o de OCR entre letras y dígitos (prohibido escribir la letra `'O'` en lugar del dígito `'0'` en puntuaciones, escalas o cifras, o `'l'`/`'I'` por `'1'`), respetando siempre la terminología técnica y datos exactos del texto fuente.
- **`src/app/actions/generateCards.ts` y `src/app/actions/generateCardsFromNotes.ts` (`getFormatInstructions('multiple_choice')`):**
  - Reforzado el paso `3º "options"` exigiendo redacción ortográfica y gramatical impecable (verbos bien conjugados sin infinitivos fuera de lugar, puntuación cuidada y dígitos exactos sin confundir `'O'` con `'0'`), sin alterar el número de preguntas ni el barajado aleatorio Fisher-Yates.

---

## 3. ARCHIVOS MODIFICADOS

- `src/lib/aiDirectives.ts`
- `src/app/actions/generateCards.ts`
- `src/app/actions/generateCardsFromNotes.ts`
