import type { DocenteFormat, TargetAudience } from '@/types/cards';

/**
 * DIRECTIVA DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
 * Transforma conceptos teóricos en supuestos de aplicación del mundo real sin distorsionar el rigor factual.
 */
export const PRACTICAL_MODE_DIRECTIVE = `DIRECTIVA DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
Queda prohibido formular preguntas memorísticas pasivas o pedir definiciones teóricas aisladas (evita '¿Qué es X?', 'Define Y', 'Enumera las características de Z').
PRINCIPIO UNIVERSAL: Transforma cada concepto, norma, regla, fórmula o principio del texto en una situación aplicada o supuesto del mundo real.
- Ciencias y Salud: Plantéalo como un caso clínico, observación de laboratorio o dilema biológico donde se requiera diagnosticar, predecir o pautar.
- Leyes y Empresa: Plantéalo como un supuesto de hecho, consulta profesional o escenario operativo donde se deba dictaminar o resolver conforme a la normativa.
- Idiomas y Letras: Plantéalo como una situación de comunicación real, contexto cultural o análisis causal de un acontecimiento histórico/filosófico.
- Fórmulas y Técnica: Plantea un problema aplicado o decisión de diseño donde deba identificarse qué principio aplicar ante unas condiciones dadas.
En preguntas tipo test o verdadero/falso, los distractores deben representar decisiones o interpretaciones plausibles dentro del contexto del caso, no errores absurdos.`;

/**
 * DIRECTIVA EXCLUSIVA PARA MODO DOCENTE / DIDÁCTICO:
 * Diseñada para profesores que preparan baterías de ejercicios para sus alumnos a partir de fichas,
 * ejercicios o vocabularios, eliminando referencias de aula y transformando listas en problemas prácticos.
 * Incluye calibración por edad internacional, taxonomía de Bloom y libertad de formatos según docenteFormat y targetAudience.
 */
export function buildDidacticModeDirective(
  docenteFormat: DocenteFormat = 'mixed_test',
  targetAudience: TargetAudience = 'auto'
): string {
  const didacticTranslationClause = `
PRINCIPIO UNIVERSAL DE FIDELIDAD FACTUAL Y TRADUCCIÓN DIDÁCTICA:
- FIDELIDAD AL CONTENIDO: Todos los hechos, reglas, conceptos, relaciones y respuestas deben derivarse estrictamente del texto fuente aportado. Queda terminantemente prohibido inventar información, alterar reglas o introducir hechos ausentes en el documento.
- DESCOMPRESIÓN LÉXICA Y ANALOGÍAS: Cuando el texto original presente una densidad conceptual, jurídica, técnica o científica superior al nivel de desarrollo cognitivo de la audiencia seleccionada, tu labor pedagógica consiste en traducir el concepto a un lenguaje accesible mediante analogías funcionales del entorno real y relaciones causa-efecto transparentes, sin relajar ni desvirtuar el rigor factual.
- TÉRMINOS CLAVE: Si un término técnico o formal es indispensable para la disciplina evaluada, introdúcelo con precisión y añade en el reverso su puente explicativo o significado funcional para afianzar su asimilación real.`;

  let audienceInstruction = '';
  switch (targetAudience) {
    case '9-11_years':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - EDUCACIÓN PRIMARIA (9 A 11 AÑOS / ELEMENTARY):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Comprensión y Aplicación práctica cotidiana.
- ENFOQUE: Relaciones de causa-efecto directas, identificación de conceptos clave y utilidad o manifestación observable en el mundo real.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Queda estrictamente PROHIBIDO basar preguntas o distractores en la memorización mecánica de cifras cuantitativas secundarias, constantes, porcentajes aislados o fechas accesorias.
  * El valor pedagógico debe radicar en entender el "por qué" y el "para qué", no en retener números sin contexto explicativo.
  * Emplea oraciones cortas, dinámicas y claras con un tono estimulante, cercano y motivador.
  * Queda terminantemente PROHIBIDA la subordinación sintáctica innecesaria y los tecnicismos abstractos sin un puente explicativo directo.
${didacticTranslationClause}`;
      break;

    case '12-14_years':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - SECUNDARIA INICIAL (12 A 14 AÑOS / MIDDLE SCHOOL):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Comprensión y Discriminación conceptual.
- ENFOQUE: Comparación y contraste entre conceptos afines, taxonomías, clasificaciones y resolución de problemas guiados con rigor léxico intermedio.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Plantea preguntas orientadas a diferenciar matices entre categorías similares, estructurar clasificaciones y aplicar conceptos a situaciones concretas guiadas.
  * Emplea oraciones directas, vocabulario disciplinar progresivo y preguntas que estimulen el razonamiento estructurado sin ambigüedades ni subordinación excesiva.
${didacticTranslationClause}`;
      break;

    case '15-17_years':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - BACHILLERATO / SECUNDARIA SUPERIOR (15 A 17 AÑOS / HIGH SCHOOL):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Aplicación y Análisis sistemático.
- ENFOQUE: Relaciones sistémicas, mecanismos, procesos secuenciales, deducción lógica y dominio de la terminología técnica o formal de la disciplina.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Exige análisis de dependencias multivariables, causas subyacentes, inferencias lógicas, etapas de procesos y justificaciones estructuradas.
  * Genera distractores plausibles que representen trampas de razonamiento, confusiones conceptuales o errores metodológicos frecuentes en la materia.
${didacticTranslationClause}`;
      break;

    case 'university_plus':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - UNIVERSIDAD, POSGRADO Y OPOSICIONES (+18 AÑOS / HIGHER EDUCATION):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Análisis crítico, Evaluación y Diagnóstico.
- ENFOQUE: Casos complejos, resolución de escenarios reales, excepciones normativas o doctrinales, y máxima precisión técnica y metodológica.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Nivel de máxima exigencia analítica: valoración crítica de supuestos, resolución de dilemas técnicos o profesionales, interpretación de excepciones a la regla general y contraste riguroso de alternativas excluyentes.
  * Terminología especializada y rigor metodológico acorde a estándares universitarios y tribunales de oposición, sin simplificaciones artificiales.`;
      break;

    case 'auto':
    default:
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - DETECCIÓN AUTOMÁTICA SEGÚN EL TEXTO:
- Analiza la densidad léxica, complejidad conceptual y nivel formativo intrínseco del texto fuente para ajustar automáticamente el nivel en la Taxonomía de Bloom (desde comprensión fundamental hasta análisis crítico y evaluación), calibrando proporcionalmente la sintaxis, el vocabulario técnico y la profundidad evaluativa.`;
      break;
  }

  // PROTOCOLO DE DISTRIBUCIÓN COGNITIVA UNIVERSAL (TAXONOMÍA DE BLOOM OBLIGATORIA)
  const bloomTaxonomyInstruction = `🧠 PROTOCOLO DE DISTRIBUCIÓN COGNITIVA UNIVERSAL (TAXONOMÍA DE BLOOM OBLIGATORIA):
Debes estructurar la batería de preguntas distribuyendo el nivel cognitivo de los ejercicios bajo la siguiente proporción estricta:
1. 30% NIVEL BÁSICO (Recordar / Comprender):
   - Identificación pura de conceptos, definiciones esenciales, terminología fundamental y reconocimiento de hechos explícitos.
2. 40% NIVEL INTERMEDIO (Aplicar / Analizar):
   - Escenarios prácticos aplicados, diferenciación entre conceptos similares, uso de reglas o fórmulas en situaciones nuevas y análisis de causas y consecuencias.
3. 30% NIVEL AVANZADO (Evaluar / Pensamiento Crítico):
   - Supuestos de diagnóstico, resolución de casos límite o atípicos, detección de excepciones a la regla general, juicio fundamentado o razonamiento deductivo complejo.`;

  // FORMATO DE EVALUACIÓN DOCENTE
  let formatInstruction = '';
  switch (docenteFormat) {
    case 'multiple_choice':
      formatInstruction = `📋 FORMATO DE EVALUACIÓN EXCLUSIVO: SOLO TEST / OPCIÓN MÚLTIPLE DETERMINISTA (FORMATO "multiple_choice"):
- TODAS las tarjetas DEBEN ser formuladas estrictamente en formato "multiple_choice".
- En cada tarjeta debes generar obligatoriamente:
  1º "justification": Razonamiento técnico del texto antes de elegir la respuesta (Chain of Thought).
  2º "question": Enunciado limpio de la pregunta sin opciones.
  3º "options": Exactamente 4 alternativas plausibles en el array options [0, 1, 2, 3].
  4º "correct_option_index": Número entero (0 a 3) de la opción verdadera justificada.
- En "front" coloca la pregunta con sus 4 opciones a-d y en "back" la opción verdadera con su justificación. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.`;
      break;
    case 'true_false':
      formatInstruction = `📋 FORMATO DE EVALUACIÓN EXCLUSIVO: SOLO VERDADERO O FALSO (FORMATO "true_false"):
- TODAS las tarjetas DEBEN ser formuladas estrictamente en formato "true_false".
- En "front" formula una afirmación clara y categórica para evaluar.
- En "back" indica obligatoriamente "Verdadero" o "Falso" acompañado de una justificación rigurosa basada en el texto. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.`;
      break;
    case 'cloze':
      formatInstruction = `📋 FORMATO DE EVALUACIÓN EXCLUSIVO: SOLO TEXTO CON HUECOS / CLOZE (FORMATO "cloze"):
- TODAS las tarjetas DEBEN ser formuladas estrictamente en formato "cloze".
- En "front" presenta una oración o párrafo contextualizado donde los conceptos clave a evaluar estén encerrados entre corchetes [como este].
- En "back" incluye los términos ocultos con una explicación concisa. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.`;
      break;
    case 'basic':
      formatInstruction = `📋 FORMATO DE EVALUACIÓN EXCLUSIVO: SOLO PREGUNTA CORTA / DIRECTA (FORMATO "basic"):
- TODAS las tarjetas DEBEN ser formuladas estrictamente en formato "basic".
- En "front" formula una pregunta directa y concisa sobre un concepto clave.
- En "back" redacta la respuesta directa y sintetizada. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.`;
      break;
    case 'open_cases':
      formatInstruction = `📋 FORMATO DE EVALUACIÓN EXCLUSIVO: CASOS DE DESARROLLO CON RÚBRICA (FORMATO "basic"):
- TODAS las tarjetas DEBEN ser formuladas estrictamente en formato "basic".
- ANVERSO ("front"): Presenta un caso de estudio práctico, situación hipotética o problema del mundo real ("Caso práctico: ...", "Supuesto real: ...", "Problema aplicado: ...").
- REVERSO ("back"): Debe incluir obligatoriamente:
  1. "Respuesta Modelo / Solución": Desarrollo completo y justificación técnica esperada del alumno.
  2. "Rúbrica de Corrección Docente": Criterios de evaluación desglosados (criterios de logro, penalizaciones y escala de calificación para que el profesor califique al estudiante).`;
      break;
    case 'mixed_test':
    default:
      formatInstruction = `📝 FORMATO DE EVALUACIÓN: TEST VARIADO / MIXTO (LIBERTAD COMPLETA DE FORMATOS):
- TIENES ABSOLUTA LIBERTAD para alternar dinámicamente entre los 4 formatos disponibles ("multiple_choice", "basic", "cloze", "true_false") según lo que mejor evalúe cada concepto y nivel taxonómico de Bloom:
  * "multiple_choice": Para discriminación de conceptos, reglas y opciones excluyentes (4 alternativas en array options).
  * "cloze": Para fijar definiciones exactas, vocabulario o términos técnicos entre corchetes [...].
  * "true_false": Para evaluar afirmaciones críticas y contrastar errores comunes.
  * "basic": Para conceptos clave o explicaciones breves.
- Diseña un conjunto variado y equilibrado de formatos respetando las cuotas de Bloom (30% básico, 40% intermedio, 30% avanzado).`;
      break;
  }

  return `DIRECTIVA EXCLUSIVA PARA MODO DOCENTE / DIDÁCTICO:
- Este modo está diseñado para profesores y formadores que preparan baterías de examen, ejercicios y evaluaciones para sus estudiantes en cualquier disciplina.
- PROHIBICIÓN ABSOLUTA DE METADATOS EDITORIALES O DE AULA: Queda terminantemente PROHIBIDO utilizar fórmulas como 'Según el Bloque X', 'En la Unidad Y', 'En el Ejercicio Z', '¿Cuál es la frase de ejemplo del autor?' o hacer referencia a páginas o partes físicas de la ficha. La pregunta debe formularse como un ítem de examen directo, profesional e independiente.
- TRANSFORMACIÓN EN CASOS PRÁCTICOS Y COMPETENCIALES:
  * Transforma las listas teóricas y enumeraciones pasivas en problemas o preguntas de razonamiento competencial y aplicación funcional.
  * Si el material contiene vocabulario o idiomas, formula oraciones contextualizadas con huecos ('______') para evaluar el uso en contexto, o preguntas de equivalencia/traducción funcional directa e inversa.
  * Queda terminantemente PROHIBIDO generar preguntas sobre símbolos fonéticos o pronunciación figurada escrita (ej. /tiː.tʃər/).

${audienceInstruction}

${bloomTaxonomyInstruction}

${formatInstruction}

REGLA DE COBERTURA HOMOGÉNEA Y BARRIDO INTEGRAL (DE PRINCIPIO A FIN):
- Es OBLIGATORIO realizar un barrido homogéneo y equilibrado por la TOTALIDAD del texto fuente aportado (desde la primera página o párrafo inicial hasta la última sección).
- Queda terminantemente prohibido concentrar las preguntas en la introducción o los primeros temas dejando el resto del documento sin evaluar.
- LÍMITE MÁXIMO ESTRICTO: Hasta 40 preguntas por documento/lote.`;
}

