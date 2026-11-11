import type { DocenteFormat, TargetAudience } from '@/types/cards';

/**
 * DIRECTIVA DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
 * Transforma conceptos teóricos en supuestos de aplicación del mundo real sin distorsionar el rigor factual.
 * Estructura obligatoria: [Contexto o caso operativo] + [Conflicto, necesidad o restricción técnica] + [Pregunta de toma de decisiones o intervención].
 */
export const PRACTICAL_MODE_DIRECTIVE = `🎯 DIRECTIVA UNIVERSAL DE ENFOQUE PRÁCTICO Y SITUACIONAL (PROBLEM-BASED LEARNING):
Toda tarjeta en modo práctico debe formularse mediante un supuesto o escenario aplicado del mundo real.
ESTRUCTURA OBLIGATORIA DEL ENUNCIADO:
[Contexto operativo específico] + [Conflicto de variables, síntoma o restricción técnica] + [Pregunta de toma de decisiones o intervención concreta].

🚨 REGLA DE DEPENDENCIA CONTEXTUAL ESTRICTA (ANTI-CASO COSMÉTICO):
1. CRITERIO DE VALIDEZ PRÁCTICA: La pregunta DEBE ser IMPOSIBLE de responder sin los datos y condiciones del supuesto. Queda terminantemente PROHIBIDO anteponer un escenario decorativo a una pregunta teórica de manual (ej. es INVÁLIDO escribir 'Un bombero acude a un incendio, ¿a qué temperatura hierve el agua?').
2. INTERACCIÓN DE VARIABLES: El caso debe obligar a relacionar al menos dos datos del texto (ej. valores de análisis, antecedentes, condiciones de contorno, plazos legales, especificaciones técnicas concurrentes).
3. DISTRACTORES PRÁCTICOS: Las opciones incorrectas deben representar fallos de juicio plausibles, errores procedimentales frecuentes o vías de intervención alternativas pero contraindicadas en ese supuesto concreto.`;

/**
 * DIRECTIVA UNIVERSAL DE CALIBRACIÓN PSICOMÉTRICA DE DISTRACTORES (ZERO-OBVIOUS / ANTI-HEURÍSTICAS):
 * Erradica el descarte por sentido común, la heurística de longitud ("la más larga es la correcta")
 * y obliga a utilizar el conocimiento real de la materia para discriminar opciones.
 */
export const DISTRACTOR_VEROSIMILITUDE_DIRECTIVE = `🎯 DIRECTIVA UNIVERSAL DE CALIBRACIÓN PSICOMÉTRICA DE DISTRACTORES (ANTI-DESCARTE TRIVIAL Y SIMETRÍA):
La validez y calidad técnica de una prueba depende primordialmente de la plausibilidad intrínseca de sus alternativas incorrectas. Todo distractor debe obligar al estudiante a recurrir al conocimiento específico de la materia para discriminarlo.

1. PRINCIPIO DE VEROSIMILITUD TOTAL (CERO DISTRACTORES ABSURDOS):
   - Queda TERMINANTEMENTE PROHIBIDO generar opciones disparatadas, cómicas, extremas o que cualquier persona pueda descartar por simple lógica, intuición o sentido común general sin haber estudiado el texto.
   - Cada una de las opciones incorrectas debe parecer científica, jurídica o técnicamente correcta ante una lectura rápida o desatenta.

2. TAXONOMÍA OBLIGATORIA DE FUENTES PARA DISTRACTORES:
   Los distractores deben originarse EXCLUSIVAMENTE a partir de estas 4 categorías de error conceptual:
   a) Confusión de Mecanismos Cruzados o Entidades Análogas: Asignar la función, característica o efecto de un concepto cercano de la misma familia temática (ej. intercambiar las funciones de dos enzimas afines, dos artículos de leyes correlativas o dos protocolos de red).
   b) Umbrales Cuantitativos Limítrofes y Rangos Intercambiados: En preguntas numéricas o de dosis/plazos, utilizar valores cuantitativos que figuren en otras partes del mismo tema (ej. usar el límite máximo en vez del mínimo, o un rango perteneciente a otra categoría del texto), NUNCA cifras inventadas o disparatadas (evita '9999 días' o '0%').
   c) Afirmaciones Ciertas pero No Pertinentes: Opciones que expresan un hecho rigurosamente verídico según el texto, pero que NO responden a la pregunta formulada o a las condiciones específicas del caso.
   d) Inversión Causa-Efecto y Falsos Amigos: Intercambiar el orden temporal de una secuencia, invertir una relación de causa/consecuencia o utilizar términos con etimología o apariencia similar pero significado conceptual opuesto.

3. SIMETRÍA ESTRUCTURAL Y LINGÜÍSTICA (ANTI-PISTAS DE EXAMEN):
   - Homogeneidad de Longitud: Las 4 opciones deben compartir una extensión visual y número de palabras similar (ninguna opción debe ser notablemente más larga o tener el triple de explicaciones que las demás, erradicando la heurística de 'la más larga es la correcta').
   - Paralelismo Sintáctico: Todas las opciones de una pregunta deben compartir la misma estructura gramatical (mismo tiempo verbal, misma categoría gramatical de inicio, misma formulación afirmativa/negativa).
   - Prohibición de Absolutos Reveladores: No emplees calificadores absolutos ('siempre', 'nunca', 'en ningún caso') en los distractores para delatarlos artificialmente mientras la opción correcta usa un lenguaje moderado.

4. CALIBRACIÓN ESPECÍFICA EN FORMATOS ALTERNATIVOS:
   - En 'true_false': La premisa falsa debe construirse alterando sutilmente un matiz crítico, un condicional o un factor limitante de un concepto verídico. PROHIBIDO crear afirmaciones ridículas o invertir una verdad mediante negaciones gramaticales forzadas o burdas.
   - En 'cloze': El espacio [...] debe ocultar EXCLUSIVAMENTE el núcleo conceptual sustantivo, término técnico indispensable o valor determinante, NUNCA palabras funcionales, artículos o conectores triviales.`;

/**
 * DIRECTIVA DE RESONANCIA LÉXICA Y DENSIDAD ADAPTATIVA DE DISTRACTORES (MODO ESTUDIO):
 * Auto-nivela la sofisticación y sutilidad de las opciones incorrectas a la densidad académica del documento.
 */
export const TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE = `🔬 RESONANCIA LÉXICA Y DENSIDAD ADAPTATIVA DE DISTRACTORES (MODO ESTUDIO):
- Evalúa la complejidad conceptual, densidad técnica y registro académico del documento fuente analizado.
- Calibra la sofisticación y sutilidad de las opciones incorrectas para que reflejen EXACTAMENTE el mismo nivel terminológico y rigor intelectual que el texto fuente:
  * Si el documento es un texto científico o médico especializado, los distractores deben emplear nomenclatura fisiopatológica exacta, biomarcadores reales o cuadros clínicos diferenciales.
  * Si el documento es normativo o legal, los distractores deben utilizar el lenguaje procesal riguroso, plazos o excepciones formales pertinentes.
  * Si el documento es divulgativo o escolar, los distractores deben mantener la claridad y sencillez léxica correspondiente sin forzar una artificialidad inapropiada.`;

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
 * LEY DE PROPORCIÓN COGNITIVA UNIVERSAL (TAXONOMÍA DE BLOOM 30/50/20):
 * Distribuye rigurosamente cualquier batería de preguntas tipo test en tres niveles de profundidad cognitiva:
 * - 30% Asimilación conceptual / declarativa (Bloom 1-2: Recordar / Comprender).
 * - 50% Supuestos prácticos y resolución situacional (Bloom 3-4: Aplicar / Analizar).
 * - 20% Juicio crítico, diagnóstico diferencial y excepciones (Bloom 5-6: Evaluar / Sintetizar).
 */
export const UNIVERSAL_BLOOM_PROPORTION_DIRECTIVE = `🧠 LEY DE PROPORCIÓN COGNITIVA UNIVERSAL (DISTRIBUCIÓN TAXONOMÍA DE BLOOM 30/50/20):
Toda batería de preguntas tipo test debe estructurarse obligatoriamente bajo las siguientes cuotas cognitivas exactas según el número de tarjetas del lote (N):

1. EXACTAMENTE EL 30% DEL LOTE: ASIMILACIÓN CONCEPTUAL TRONCAL (Bloom 1 y 2 - Recordar / Comprender):
   - Enfoque: Definiciones canónicas, terminología disciplinar clave, principios rectores y valores cuantitativos de referencia indispensables.
   - Prohibido formular preguntas sobre datos anecdóticos de formato o curiosidades secundarias.

2. EXACTAMENTE EL 50% DEL LOTE: SUPUESTOS PRÁCTICOS Y RESOLUCIÓN SITUACIONAL (Bloom 3 y 4 - Aplicar / Analizar):
   - Enfoque: Problemas reales aplicados con la estructura obligatoria:
     [Contexto o caso operativo] + [Conflicto, necesidad o hallazgo técnico] + [Pregunta de toma de decisiones o intervención].
   - El alumno debe aplicar los conceptos teóricos para diagnosticar, calcular, elegir la técnica o resolver el problema.

3. EXACTAMENTE EL 20% DEL LOTE: ANÁLISIS CRÍTICO, DIAGNÓSTICO Y EXCEPCIONES (Bloom 5 y 6 - Evaluar / Discernir):
   - Enfoque: Escenarios de alta discriminación donde se evalúan excepciones a la regla general, criterios de exclusión, dilemas profesionales o distinción sutil entre opciones casi idénticas con distractores altamente verosímiles.`;

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
 * DIRECTIVA DE COBERTURA INTEGRAL Y CRUCE RELACIONAL DE TABLAS:
 * Prohíbe el barrido mecánico celda a celda y exige cruces relacionales de orden superior.
 */
export const EXHAUSTIVE_TABLES_DIRECTIVE = `📊 DIRECTIVA DE COBERTURA INTEGRAL Y CRUCE RELACIONAL DE TABLAS:
Cuando el texto contenga tablas, cuadros sinópticos o matrices de datos:
1. PROHIBICIÓN DE BARRIDO MECÁNICO AISLADO: Queda terminantemente PROHIBIDO formular preguntas de memoria ciega sobre celdas individuales inconexas (ej. '¿Qué dato exacto figura en la fila 3?').
2. CRUCE RELACIONAL DE DATOS: Genera preguntas de orden superior que comparen y relacionen la información de la tabla:
   - Comparación entre filas o categorías (mayor que, menor que, diferencias clave).
   - Identificación de casos extremos (valores máximos, mínimos, excepciones señaladas).
   - Correlación bidireccional (ej. dadas unas condiciones o propiedades, identificar a qué entidad o categoría de la tabla corresponden).
3. COBERTURA TOTAL SIN DUPLICIDAD: Asegura que todas las entidades principales de la tabla queden evaluadas, pero NUNCA formules dos preguntas distintas sobre el mismo cruce o valor idéntico.`;

/**
 * TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES DE DATOS:
 * Diferencia entre tablas de catálogo/inventario y matrices conceptuales relacionales.
 */
export function buildUniversalTablesDirective(isExhaustiveMode: boolean = false): string {
  if (isExhaustiveMode) {
    return EXHAUSTIVE_TABLES_DIRECTIVE;
  }

  return `📊 TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES (MODO NORMAL / ESTÁNDAR):
En modo estándar, las tablas deben evaluarse desde su jerarquía conceptual troncal y conclusiones de alto nivel:
a) Evalúa la regla, patrón o principio general que sintetiza la matriz.
b) Compara a gran escala las columnas o categorías principales, enfocando tendencias globales y relaciones causa-efecto determinantes.
c) Evalúa únicamente umbrales de decisión críticos o excepciones notorias señaladas en la tabla.
d) Queda TERMINANTEMENTE PROHIBIDO desglosar mecánicamente celdas individuales o hacer preguntas memorísticas sobre filas secundarias aisladas.`;
}

/**
 * DIRECTIVA UNIVERSAL DE MODO MINUCIOSO / QUIRÚRGICO:
 * Cobertura total de la riqueza real del texto y explotación funcional de tablas y cuadros.
 */
export const EXHAUSTIVE_MODE_MANDATE = `🔬 DIRECTIVA UNIVERSAL DE MODO MINUCIOSO / QUIRÚRGICO:
Analiza la totalidad del contenido de esta sección o página sin pasar por alto ningún dato relevante.
1. COBERTURA TOTAL DE LA RIQUEZA REAL: No dejes ningún concepto nuclear, mecanismo, cifra de referencia, excepción o regla técnica sin transformar en pregunta de evaluación. La densidad y cantidad de preguntas generadas debe responder fielmente a la riqueza real del texto, sin auto-limitarte si la página es densa.
2. EXPRIMIR TABLAS Y CUADROS SIN RELLENO: En tablas, diagramas o cuadros de datos, exprime el valor funcional de la información:
   - Contrasta filas, elementos o categorías adyacentes (diferencias críticas).
   - Evalúa los valores límite, umbrales máximos, mínimos y parámetros de alerta.
   - Pregunta por el significado funcional y las consecuencias prácticas de las cifras o condiciones expuestas.
   - Incluye las notas al pie o excepciones señaladas entre paréntesis.
   - Queda prohibida la memoria ciega de casillas sueltas descontextualizadas por mero relleno.`;

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
- DIRECTIVA DE DISTRACTORES PARA 9-11 AÑOS:
  * Los distractores deben basarse en errores conceptuales comunes de la vida cotidiana o confusión entre elementos de la misma familia concreta que el alumno suele mezclar (ej. confundir carnívoro con herbívoro, o rotación con traslación).
  * Quedan terminantemente prohibidos distractores con vocabulario abstracto incomprensible o basados en memorizar cifras secundarias sin sentido.
${didacticTranslationClause}`;
      break;

    case '12-14_years':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - SECUNDARIA INICIAL (12 A 14 AÑOS / MIDDLE SCHOOL):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Comprensión y Discriminación conceptual.
- ENFOQUE: Comparación y contraste entre conceptos afines, taxonomías, clasificaciones y resolución de problemas guiados con rigor léxico intermedio.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Plantea preguntas orientadas a diferenciar matices entre categorías similares, estructurar clasificaciones y aplicar conceptos a situaciones concretas guiadas.
  * Emplea oraciones directas, vocabulario disciplinar progresivo y preguntas que estimulen el razonamiento estructurado sin ambigüedades ni subordinación excesiva.
- DIRECTIVA DE DISTRACTORES PARA 12-14 AÑOS:
  * Los distractores deben enfocarse en la discriminación entre categorías taxonómicas vecinas, pasos contiguos de un proceso secuencial o propiedades opuestas de dos elementos comparados en el texto.
${didacticTranslationClause}`;
      break;

    case '15-17_years':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - BACHILLERATO / SECUNDARIA SUPERIOR (15 A 17 AÑOS / HIGH SCHOOL):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Aplicación y Análisis sistemático.
- ENFOQUE: Relaciones sistémicas, mecanismos, procesos secuenciales, deducción lógica y dominio de la terminología técnica o formal de la disciplina.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Exige análisis de dependencias multivariables, causas subyacentes, inferencias lógicas, etapas de procesos y justificaciones estructuradas.
  * Genera distractores plausibles que representen trampas de razonamiento, confusiones conceptuales o errores metodológicos frecuentes en la materia.
- DIRECTIVA DE DISTRACTORES PARA 15-17 AÑOS:
  * Los distractores deben incorporar trampas de razonamiento deductivo, correlaciones espurias, inversión de dependencias causa-efecto y condiciones restrictivas ('salvo que...', 'a excepción de...').
${didacticTranslationClause}`;
      break;

    case 'university_plus':
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - UNIVERSIDAD, POSGRADO Y OPOSICIONES (+18 AÑOS / HIGHER EDUCATION):
- NIVEL COGNITIVO (TAXONOMÍA DE BLOOM): Análisis crítico, Evaluación y Diagnóstico.
- ENFOQUE: Casos complejos, resolución de escenarios reales, excepciones normativas o doctrinales, y máxima precisión técnica y metodológica.
- DIRECTIVA UNIVERSAL DE DISCRIMINACIÓN:
  * Nivel de máxima exigencia analítica: valoración crítica de supuestos, resolución de dilemas técnicos o profesionales, interpretación de excepciones a la regla general y contraste riguroso de alternativas excluyentes.
  * Terminología especializada y rigor metodológico acorde a estándares universitarios y tribunales de oposición, sin simplificaciones artificiales.
- DIRECTIVA DE DISTRACTORES PARA UNIVERSIDAD / OPOSICIONES (+18):
  * Máximo estándar psicométrico. Los distractores deben formularse como opciones de alta plausibilidad profesional: diagnósticos diferenciales estrechos, contraindicaciones farmacológicas directas, excepciones jurisprudenciales cruzadas o interpretaciones doctrinales alternativas defendibles si no se domina el detalle normativo estricto.`;
      break;

    case 'auto':
    default:
      audienceInstruction = `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL - DETECCIÓN AUTOMÁTICA SEGÚN EL TEXTO:
- Analiza la densidad léxica, complejidad conceptual y nivel formativo intrínseco del texto fuente para ajustar automáticamente el nivel en la Taxonomía de Bloom (desde comprensión fundamental hasta análisis crítico y evaluación), calibrando proporcionalmente la sintaxis, el vocabulario técnico y la profundidad evaluativa.`;
      break;
  }

  // PROTOCOLO DE DISTRIBUCIÓN COGNITIVA UNIVERSAL (TAXONOMÍA DE BLOOM OBLIGATORIA)
  const bloomTaxonomyInstruction = `🧠 PROTOCOLO DE DISTRIBUCIÓN COGNITIVA UNIVERSAL (TAXONOMÍA DE BLOOM OBLIGATORIA 30/50/20):
Debes estructurar la batería de preguntas distribuyendo el nivel cognitivo de los ejercicios bajo la siguiente proporción estricta:
1. 30% NIVEL BÁSICO / CONCEPTUAL (Recordar / Comprender):
   - Identificación pura de conceptos, definiciones esenciales, terminología fundamental y reconocimiento de hechos explícitos.
2. 50% NIVEL INTERMEDIO / APLICADO (Aplicar / Analizar):
   - Escenarios prácticos aplicados, resolución de problemas situacionales, diferenciación entre conceptos similares, uso de reglas en situaciones nuevas y análisis de causas y consecuencias.
3. 20% NIVEL AVANZADO / CRÍTICO (Evaluar / Pensamiento Crítico):
   - Supuestos de diagnóstico diferencial, resolución de casos límite o atípicos, detección de excepciones a la regla general, juicio fundamentado o razonamiento deductivo complejo.`;

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
- En "front" coloca la pregunta con sus 4 opciones a-d y en "back" la opción verdadera ("VEREDICTO_EXACTO: [texto]") seguida de su justificación. Queda terminantemente PROHIBIDO devolver tarjetas en otro formato.

${UNIVERSAL_BLOOM_PROPORTION_DIRECTIVE}`;
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

${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}

REGLA DE COBERTURA HOMOGÉNEA Y BARRIDO INTEGRAL (DE PRINCIPIO A FIN):
- Es OBLIGATORIO realizar un barrido homogéneo y equilibrado por la TOTALIDAD del texto fuente aportado (desde la primera página o párrafo inicial hasta la última sección).
- Queda terminantemente prohibido concentrar las preguntas en la introducción o los primeros temas dejando el resto del documento sin evaluar.
- LÍMITE MÁXIMO ESTRICTO: Hasta 40 preguntas por documento/lote.`;
}

