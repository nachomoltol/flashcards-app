import type { DocenteFormat, TargetAudience } from '@/types/cards';

/**
 * DIRECTIVA DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
 * Transforma conceptos teóricos en supuestos de aplicación del mundo real sin distorsionar el rigor factual.
 * Estructura obligatoria: [Contexto o caso operativo] + [Conflicto, necesidad o restricción técnica] + [Pregunta de toma de decisiones o intervención].
 */
export const PRACTICAL_MODE_DIRECTIVE = `🎯 DIRECTIVA UNIVERSAL DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
Queda terminantemente prohibido formular preguntas teóricas pasivas o de memorización descontextualizada (evita '¿Qué es X?', 'Define Y', 'Enumera las características de Z').
Tampoco se considera práctico añadir un prefijo cosmético superficial (como 'En el hospital...' o 'Un abogado observa...') a una pregunta puramente memorística.

ESTRUCTURA OBLIGATORIA DEL ENUNCIADO PRÁCTICO:
Toda tarjeta en modo práctico debe formularse mediante un supuesto o escenario aplicado realista estructurado en tres partes:
[Contexto o caso operativo] + [Conflicto, necesidad o restricción técnica] + [Pregunta de toma de decisiones o intervención].
El alumno debe verse obligado a utilizar el criterio técnico y el conocimiento de la materia para resolver la situación.

APLICACIÓN UNIVERSAL SEGÚN LA DISCIPLINA:
- Ciencias de la Salud y Biología: Caso clínico, paciente o muestra experimental que presenta signos o hallazgos específicos; conflicto terapéutico, farmacológico o fisiológico; decisión fundamentada sobre la intervención, pauta, diagnóstico diferencial o mecanismo subyacente.
- Leyes, Normativa y Administración: Supuesto de hecho o consulta profesional con plazos, partes implicadas o conflicto de intereses; determinación fundada de la acción jurídica, derecho aplicable o consecuencia legal correspondiente.
- Ingeniería, Tecnología y Exactas: Problema de diseño, fallo en un sistema o condiciones operativas límite; selección fundada del método de cálculo, algoritmo, arquitectura o solución técnica óptima.
- Humanidades, Historia y Filosofía: Análisis de una fuente histórica, dilema ético o coyuntura sociopolítica concreta; juicio crítico sobre causas, consecuencias o contraste de posturas doctrinales conforme al texto.
- Idiomas y Comunicación: Situación comunicativa real o profesional con matiz pragmático o de registro; selección de la expresión idiomática, término o estructura adecuada para resolver el intercambio.

DISTRACTORES EN MODO PRÁCTICO:
En preguntas tipo test o verdadero/falso, los distractores deben representar decisiones o interpretaciones plausibles dentro del contexto del caso (trampas operativas comunes o diagnósticos alternativos verosímiles), nunca errores absurdos o datos inventados ajenos al temario.`;

/**
 * PROTOCOLO DE AUTO-AUDITORÍA LÓGICA (ZERO-MISMATCH / COHERENCIA INQUEBRANTABLE):
 * Exige una verificación interna estricta de consistencia entre la justificación, las opciones y la clave marcada.
 */
export const ZERO_MISMATCH_DIRECTIVE = `⚖️ PROTOCOLO DE AUTO-AUDITORÍA LÓGICA (ZERO-MISMATCH / COHERENCIA INQUEBRANTABLE):
Antes de emitir cada tarjeta en el JSON final, realiza obligatoriamente una verificación interna de consistencia lógica entre todos sus campos:
1. COHERENCIA UNÍVOCA Y ETIQUETA DE VEREDICTO EXPLÍCITO:
   - En preguntas tipo test ("multiple_choice"), la propiedad "justification" DEBE concluir OBLIGATORIAMENTE en su última línea con la etiqueta estricta:
     VEREDICTO_EXACTO: [texto exacto de la opción ganadora]
   - El inicio del campo "back" DEBE comenzar obligatoriamente con la misma opción ganadora y su letra:
     [letra]) [texto exacto de la opción ganadora]
     VEREDICTO_EXACTO: [texto exacto de la opción ganadora]
   - El número entero "correct_option_index" (0 a 3) DEBE coincidir con precisión milimétrica con la posición de dicha opción ganadora en el array "options".
   - Queda ESTRICTAMENTE PROHIBIDO cualquier desajuste lógico o numérico (ejemplo: si la justificación concluye que la respuesta válida son "4 calorías" o "el plazo es de 10 días", el índice 'correct_option_index' bajo ninguna circunstancia puede apuntar a la opción de '7 calorías' o '15 días').
2. DISTRACTORES PLAUSIBLES PERO INEQUÍVOCAMENTE FALSOS:
   - Las alternativas incorrectas deben pertenecer al dominio temático del texto para exigir discriminación real, pero deben ser indiscutiblemente falsas, incompletas o no aplicables frente al caso planteado.
3. CONCORDANCIA EN VERDADERO/FALSO Y CLOZE:
   - En tarjetas 'true_false', si el texto de la justificación demuestra que la premisa es errónea, la respuesta en 'back' DEBE comenzar categóricamente con '**Falso**', y viceversa.
   - En tarjetas 'cloze', la palabra o fórmula revelada en el reverso DEBE encajar gramatical y conceptualmente con exactitud en el espacio marcado con [...] en el anverso.`;

/**
 * CALIBRACIÓN UNIVERSAL: MODO NORMAL VS. MODO MINUCIOSO:
 */
export function buildUniversalCalibrationDirective(isExhaustiveMode: boolean = false): string {
  if (isExhaustiveMode) {
    return `🔬 CALIBRACIÓN PEDAGÓGICA UNIVERSAL: MODO MINUCIOSO (ALTA EXIGENCIA / ENFOQUE 100%):
- PROFUNDIDAD INTEGRAL: Evalúa todo el espectro sustancial del documento sin omitir subdivisiones teóricas, excepciones a la regla general, clasificaciones secundarias, etimología, umbrales numéricos críticos, valores de referencia y contrastes sutiles.
- REGLA DE CALIDAD PEDAGÓGICA: "Exprimir el texto" significa elevar al máximo la discriminación conceptual y el análisis crítico. Está TERMINANTEMENTE PROHIBIDO convertir la generación en una copia mecánica o inventario memorístico pasivo de listas. Cada detalle evaluado debe tener relevancia funcional o metodológica dentro de la disciplina.`;
  }

  return `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL: MODO NORMAL (ENFOQUE 80/20):
- NÚCLEO SUSTANCIAL: Concéntrate en el 20% de los conceptos que explican el 80% de la materia: definiciones fundamentales, mecanismos centrales, principios rectores y relaciones de alto nivel.
- FILTRO ANTI-SATURACIÓN: Excluye deliberadamente notas al pie accesorias, cifras secundarias sin relevancia clínica/jurídica/técnica, excepciones ultra-raras y detalles enciclopédicos que sobrecarguen la sesión de estudio básica.`;
}

/**
 * TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES DE DATOS:
 * Diferencia entre tablas de catálogo/inventario y matrices conceptuales relacionales.
 */
export function buildUniversalTablesDirective(isExhaustiveMode: boolean = false): string {
  if (isExhaustiveMode) {
    return `📊 TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES (MODO MINUCIOSO / EXHAUSTIVO):
Las tablas y diagramas concentran el conocimiento de mayor densidad y exigencia evaluativa del material. Debes procesarlas diferenciando con rigor su naturaleza pedagógica:

a) Tablas de Inventario, Catálogo o Valores de Referencia (listas de componentes, constantes numéricas, posologías, composiciones):
   - PROHIBICIÓN DE MEMORIA CIEGA: Queda prohibido formular preguntas aisladas y mecánicas sobre celdas individuales descontextualizadas (ej. '¿Qué valor exacto aparece en la fila 14?').
   - EVALUACIÓN DE ALTO NIVEL: Evalúa valores extremos significativos (máximos y mínimos determinantes), umbrales críticos de corte que condicionan un cambio de estado, casos atípicos que rompen la tendencia general y correlaciones directas o inversas entre columnas.
   - REGLA ANTI-MONOTONÍA: Prohibido generar más de 2 preguntas con la misma sintaxis o plantilla interrogativa procedentes de la misma matriz.

b) Matrices Conceptuales y Relacionales (cruces de causas, mecanismos, efectos, órganos diana, clasificaciones normativas o taxonomías):
   - Evalúa el cruce conceptual entre filas y columnas, la relación de causalidad y la diferenciación sistemática entre categorías adyacentes.
   - Exige discriminar por qué un elemento pertenece a una categoría y no a otra según los criterios de la tabla.`;
  }

  return `📊 TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES (MODO NORMAL / ESTÁNDAR):
En modo estándar, las tablas deben evaluarse desde su jerarquía conceptual troncal y conclusiones de alto nivel:
a) Evalúa la regla, patrón o principio general que sintetiza la matriz.
b) Compara a gran escala las columnas o categorías principales, enfocando tendencias globales y relaciones causa-efecto determinantes.
c) Evalúa únicamente umbrales de decisión críticos o excepciones notorias señaladas en la tabla.
d) Queda TERMINANTEMENTE PROHIBIDO desglosar mecánicamente celdas individuales o hacer preguntas memorísticas sobre filas secundarias aisladas.`;
}

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
  1º "justification": Razonamiento técnico del texto antes de elegir la respuesta (Chain of Thought), concluyendo obligatoriamente con la etiqueta:
     VEREDICTO_EXACTO: [texto exacto de la opción ganadora]
  2º "question": Enunciado limpio de la pregunta sin opciones.
  3º "options": Exactamente 4 alternativas plausibles en el array options [0, 1, 2, 3].
  4º "correct_option_index": Número entero (0 a 3) de la opción verdadera justificada.
- En "front" coloca la pregunta con sus 4 opciones a-d y en "back" la opción verdadera ("VEREDICTO_EXACTO: [texto]") seguida de su justificación. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.`;
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

