import type { DocenteFormat, TargetAudience } from '@/types/cards';

/**
 * DIRECTIVA DE ENFOQUE PRÁCTICO Y SITUACIONAL (APRENDIZAJE BASADO EN PROBLEMAS):
 * Transforma conceptos teóricos en supuestos de aplicación del mundo real sin distorsionar el rigor factual.
 * Estructura obligatoria: [Contexto o caso operativo] + [Conflicto, necesidad o restricción técnica] + [Pregunta de toma de decisiones o intervención].
 */
export const PRACTICAL_MODE_DIRECTIVE = `🎯 DIRECTIVA UNIVERSAL DE ENFOQUE PRÁCTICO Y SITUACIONAL (PROBLEM-BASED LEARNING):
Toda tarjeta en modo práctico debe formularse mediante una situación aplicada, caso real o escenario de decisión del mundo real.
ESTRUCTURA DEL ENUNCIADO:
[Contexto operativo específico] + [Conflicto de variables, síntoma o restricción técnica] + [Pregunta de toma de decisiones o intervención concreta].

🚨 REGLAS OBLIGATORIAS DE COBERTURA TOTAL Y TRANSFORMACIÓN DEL INVENTARIO:
1. COBERTURA 100% DEL INVENTARIO (1 HECHO CLAVE = 1 MINI-CASO APLICADO):
   El Modo Práctico NO puede dejar menos conceptos evaluados que el Modo Teórico. Cada hecho sustancial identificado en las 4 dimensiones del "inventario_factual" (incluyendo qué es una entidad, cuál es su función, su fuente/origen o su fallo) debe tener su propia tarjeta en forma de situación aplicada, caso práctico o escenario de decisión.

2. ELIMINACIÓN DEL REQUISITO DE COMBINAR MÚLTIPLES VARIABLES:
   Se permite tanto el planteamiento de casos que integren variables como mini-escenarios directos focalizados en un único concepto clave cuando sea necesario para evaluar una definición funcional, un origen o un mecanismo base sin dejarlo fuera del mazo.

3. CÓMO PREGUNTAR CONCEPTOS BASE DE FORMA PRÁCTICA (SIN PREGUNTA TEÓRICA PLANA):
   Para evaluar una definición, fuente o función básica en Modo Práctico sin caer en la pregunta teórica plana ('¿Qué es X?'), plantea una situación real breve donde ese concepto, fuente o mecanismo esté ocurriendo o sea necesario elegirlo (ej. un caso clínico breve, una elección de pauta nutricional, una situación técnica o procesal concreta) y pregunta cuál es el elemento implicado, la decisión correcta o el mecanismo que explica lo que sucede en el caso.

4. DISTRACTORES PRÁCTICOS:
   Las opciones incorrectas deben representar fallos de juicio plausibles, errores procedimentales frecuentes o vías de intervención alternativas pero contraindicadas en ese supuesto concreto.`;

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
   - En tarjetas 'cloze', la palabra o fórmula revelada en el reverso DEBE encajar gramatical y conceptualmente con exactitud en el espacio marcado con [...] en el anverso.
4. PROHIBICIÓN ESTRICTA DE RESPUESTAS TAUTOLÓGICAS:
   - La opción correcta JAMÁS debe repetir la misma afirmación de la pregunta con otras palabras sin aportar la causa o explicación real.
   - Ejemplo erróneo prohibido: Si la pregunta dice '¿Por qué la celulosa carece de valor energético en la dieta humana?', la opción correcta NO PUEDE ser 'Porque no aporta energía al organismo' (tautología vacía), sino la causa biológica/funcional real: 'Porque el aparato digestivo humano carece de enzimas para hidrolizar sus enlaces beta-glucosídicos'.`;

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
 * PRINCIPIO DE ECONOMÍA CONCEPTUAL Y CERO REDUNDANCIA DE HECHO:
 * Prohíbe terminantemente generar más de una tarjeta sobre el mismo hecho singular,
 * pero permite y exige evaluar múltiples facetas independientes de una misma entidad.
 */
export const CONCEPTUAL_ECONOMY_DIRECTIVE = `⚖️ PRINCIPIO UNIVERSAL DE ECONOMÍA CONCEPTUAL Y CERO REDUNDANCIA DE HECHO:
- PROHIBICIÓN DE DUPLICIDAD FACTUAL: Queda TERMINANTEMENTE PROHIBIDO generar más de una tarjeta sobre el MISMO hecho, hallazgo, mecanismo específico o dato de respuesta, con total independencia de que se reformule el enunciado, se altere el orden de las opciones o se cambie la perspectiva gramatical.
- CLARIFICACIÓN ESENCIAL (FACETAS INDEPENDIENTES VS. MISMO HECHO SINGULAR): Una misma entidad, sujeto, nutriente, fármaco, norma jurídica, institución o concepto general (ej. el folato, un artículo legal, una enzima o un protocolo de red) PUEDE Y DEBE ser objeto de varias tarjetas si el texto describe múltiples facetas sustanciales independientes (por ejemplo: su papel fisiológico, su cuadro deficitario clínico, sus interacciones medicamentosas o su estabilidad físico-química). Lo que queda estrictamente vetado es duplicar la evaluación sobre el mismo hecho singular o conclusión fáctica idéntica.`;

/**
 * PRINCIPIO DE COBERTURA HORIZONTAL (BARRIDO DE ENTIDADES INDEPENDIENTES):
 * Exige identificar todos los subepígrafes y núcleos de conocimiento sin agotar la atención en un único párrafo.
 */
export const HORIZONTAL_COVERAGE_DIRECTIVE = `🌐 PRINCIPIO UNIVERSAL DE COBERTURA HORIZONTAL (BARRIDO DE ENTIDADES INDEPENDIENTES):
- IDENTIFICACIÓN PANORÁMICA DE NÚCLEOS: Identifica todos los subepígrafes, secciones temáticas y núcleos de conocimiento distintos que componen la página o sección analizada.
- PROHIBICIÓN DE HIPER-CONCENTRACIÓN EN UN SOLO PÁRRAFO: Queda terminantemente PROHIBIDO agotar la atención o volcar toda la generación en un único párrafo o concepto llamativo dejando otros bloques sustanciales de la misma página en blanco. Cada faceta troncal descrita en el material debe contar con su correspondiente tarjeta de evaluación para garantizar una cobertura equilibrada, homogénea y representativa de toda la sección.`;

/**
 * DIRECTIVA DE INVENTARIO FACTUAL PREVIO Y RIGOR DE EXTRACCIÓN:
 * Obliga al modelo a desglosar primero todos los hechos atómicos del texto antes de emitir las tarjetas.
 */
export const FACTUAL_INVENTORY_DIRECTIVE = `📋 DIRECTIVA DE INVENTARIO FACTUAL PREVIO (SCAFFOLDING COGNITIVO OBLIGATORIO Y MATRIZ DE 4 DIMENSIONES):
Antes de redactar la primera tarjeta en el array "cards", debes identificar y desglosar obligatoriamente en "inventario_factual" cada afirmación factual, definición canónica, dato cuantitativo, mecanismo causa-efecto, excepción técnica/normativa o cruce de tabla sustancial presente en el material analizado.

1. MATRIZ UNIVERSAL DE 4 DIMENSIONES (CONTRA LA ATENCIÓN ASIMÉTRICA):
   Cuando analices una entidad, concepto, proceso o norma en la página, queda PROHIBIDO saltar únicamente al dato más llamativo o dramático (ej. la enfermedad clínica o la sanción) dando por sentada la base. Revisa obligatoriamente las 4 dimensiones presentes en el texto para cada concepto:
   - 1) Identidad/Definición (qué es exactamente, naturaleza o concepto).
   - 2) Función/Mecanismo basal (qué hace y cómo funciona, proceso).
   - 3) Origen/Fuente/Entrada (de dónde se obtiene, cómo se sintetiza, absorbe o inicia, inputs o legitimación).
   - 4) Consecuencia/Patología/Límite (qué ocurre si falla, falta, sobra, sanción o qué excepciones tiene).
   (Más Dimensión 5: detalles de tablas, cifras o notas si aplica).

2. CORRESPONDENCIA ESTRICTA 1 A 1 (INVENTARIO -> TARJETAS):
   Todo hecho sustancial listado en "inventario_factual" DEBE tener su tarjeta correspondiente en "cards". Ninguna dimensión inventariada puede quedar huérfana de pregunta. Queda terminantemente PROHIBIDO inventar preguntas o basarse en hechos ausentes del inventario.

3. FILTRO REFLEXIVO DE SUFICIENCIA DE EXAMEN ("¿APROBARÍA EL ALUMNO?"):
   AUTOCOMPROBACIÓN ANTES DE CERRAR LA PÁGINA: Antes de cerrar el array "cards", hazte esta pregunta crítica: Si un estudiante fuera a un examen oficial sobre esta página habiendo estudiado ÚNICAMENTE las tarjetas que acabas de generar, ¿quedaría algún concepto importante, mecanismo, origen, función o dato clave del texto con el que el tribunal pudiera pillarle en blanco? Si la respuesta es sí, genera inmediatamente las tarjetas necesarias para cubrir esa laguna.`;

/**
 * PRINCIPIO DE DENSIDAD PROPORCIONAL Y EXTRACCIÓN SOSTENIDA:
 * Calibra el volumen de extracción según la riqueza intrínseca del texto asegurando que no se produzca lazy extraction.
 */
export const PROPORTIONAL_DENSITY_DIRECTIVE = `🌊 PRINCIPIO UNIVERSAL DE DENSIDAD PROPORCIONAL Y EXTRACCIÓN SOSTENIDA:
- PÁGINAS DE ALTA DENSIDAD CONCEPTUAL: Si la página contiene múltiples mecanismos, clasificaciones, patologías, relaciones causa-efecto, tablas o prescripciones técnicas, debes vaciar sistemáticamente su contenido transformando cada hecho sustancial del inventario en su correspondiente tarjeta de evaluación.
- PÁGINAS TRANSICIONALES O DE BAJA DENSIDAD: Si una página es meramente introductoria, transicional, de índice o con escaso contenido evaluable, extrae con sobriedad únicamente lo genuinamente relevante (o un conjunto vacío [] en "cards" indicando core_exhausted: true), sin introducir preguntas triviales de relleno.`;

// Alias de retrocompatibilidad
export const ADAPTIVE_DENSITY_DIRECTIVE = PROPORTIONAL_DENSITY_DIRECTIVE;

/**
 * DIRECTIVA UNIVERSAL DE EXCLUSIÓN DE METÁFORAS, ANALOGÍAS Y EQUIVALENCIAS VISUALES DOMÉSTICAS:
 * Prohíbe formular preguntas sobre analogías domésticas, alegorías o metáforas pedagógicas del texto
 * (ej. "el ribosoma funciona como una fábrica", "la membrana es como una puerta"),
 * así como sobre infografías de porciones que comparen medidas con objetos cotidianos
 * (ej. "pelota de tenis", "baraja de cartas", "disco de hockey", "dado", "puño cerrado").
 */
export const EXCLUSION_ANALOGIES_DIRECTIVE = `🚫 DIRECTIVA UNIVERSAL DE EXCLUSIÓN DE METÁFORAS, ANALOGÍAS Y EQUIVALENCIAS VISUALES DOMÉSTICAS:
1. PROHIBICIÓN DE EVALUAR METÁFORAS O ALEGORÍAS RETÓRICAS:
   Cuando el autor o texto utilice metáforas cotidianas, recursos estilísticos o analogías para facilitar la comprensión (ej. 'como un director de orquesta', 'como una batería recargable', 'como una llave y cerradura'), queda TERMINANTEMENTE PROHIBIDO crear preguntas cuya respuesta o distractor sea la metáfora o analogía misma. La evaluación debe versar con rigor sobre el concepto, mecanismo técnico o principio real.
2. PROHIBICIÓN TOTAL DE EQUIVALENCIAS CON OBJETOS COTIDIANOS O DOMÉSTICOS:
   Queda TERMINANTEMENTE PROHIBIDO formular preguntas (ni siquiera en Modo Exhaustivo, Práctico, Cloze o Verdadero/Falso) sobre recuadros, listas o tablas que comparen porciones, medidas, pesos o magnitudes con objetos cotidianos, deportivos o partes del cuerpo (ej. comparar gramos, tazas o tamaños con una pelota de tenis, pelota de béisbol, pelota de golf, disco de hockey, baraja de cartas, videocinta, caja de cerillos, ratón de computadora, disco de computadora, pieza de scrabble, dado, puño o dedos de la mano). Ignora por completo esas comparaciones visuales domésticas; jamás preguntes '¿qué objeto representa visualmente...?' ni '¿cómo se visualiza la cantidad de...?'.
   - Pregunta SIEMPRE por la magnitud cuantitativa real, peso, volumen o valor técnico (gramos, mililitros, raciones oficiales del grupo), NUNCA por el objeto doméstico utilizado como analogía visual.`;

/**
 * DIRECTIVA DE AUTONOMÍA COGNITIVA (CERO REFERENCIAS EDITORIALES / LOCALIZACIONES DE PÁGINA):
 * Erradica fórmulas del tipo "Según el Cuadro 3", "Como indica la Figura 2.1", "En este capítulo", etc.
 */
export const NO_EDITORIAL_REFERENCES_DIRECTIVE = `📖 DIRECTIVA DE AUTONOMÍA COGNITIVA Y CERO REFERENCIAS EDITORIALES:
- Las preguntas deben ser completamente autónomas, directas e independientes del soporte físico o editorial.
- Queda TERMINANTEMENTE PROHIBIDO redactar enunciados o justificaciones con referencias contextuales internas como: 'Según el autor', 'De acuerdo con el Cuadro X', 'Como se menciona en la Figura Y', 'En esta página', 'En el presente capítulo', 'En la tabla del texto'.
- Formula la pregunta directamente sobre el hecho, regla o concepto de la disciplina (ej. '¿Cuál es el valor umbral...?', '¿Qué efecto produce...?', 'En el caso de...').`;

/**
 * DIRECTIVA DE DETECCIÓN DE PÁGINAS DE RESUMEN, REPASO, CUESTIONARIOS O ACTIVIDADES FINALES DE CAPÍTULO:
 * Evita duplicar conceptos ya evaluados en páginas previas cuando se procesa una sección de recapitulación o cuestionario final.
 */
export const CHAPTER_SUMMARY_PAGES_DIRECTIVE = `📑 DIRECTIVA DE PÁGINAS DE RESUMEN, REPASO, CUESTIONARIOS O CASOS FINALES:
- Si la página analizada corresponde a una sección de 'Resumen', 'Resumen del capítulo', 'Puntos clave', 'Ideas principales', 'Recapitulación', 'Repaso', 'Preguntas de repaso', 'Review Questions', 'Temas de discusión', 'Actividades sugeridas', 'Autoevaluación', 'Cuestionario', 'Actividades de repaso', 'Caso de ejemplo', 'Estudio de caso' o 'Casos de ejercicio final' del propio libro:
- PROHIBICIÓN DE DUPLICACIÓN: Queda terminantemente PROHIBIDO extraer o reformular preguntas tomadas de los cuestionarios o preguntas de repaso del propio libro, pues evalúan conceptos ya explicados en el cuerpo del capítulo.
- Queda TERMINANTEMENTE PROHIBIDO leer las preguntas de opción múltiple de la sección 'REPASO' del libro para convertirlas en tarjetas o volver a preguntar datos básicos (como calorías por gramo, composición química elemental o definiciones iniciales) que ya fueron extraídos en las primeras páginas del capítulo.
- Devuelve un conjunto vacío [] en "cards" y core_exhausted: true salvo que exista un concepto teórico sustancial completamente inédito que no haya sido mencionado antes en ninguna página previa.`;

/**
 * DIRECTIVA DE PROCESOS SECUENCIALES, EQUIVALENCIAS TÉCNICAS Y CÁLCULOS EN OPCIÓN MÚLTIPLE:
 */
export const MULTIPLE_CHOICE_PROCESS_DIRECTIVE = `⚙️ DIRECTIVA DE PROCESOS SECUENCIALES, CÁLCULOS Y EQUIVALENCIAS TÉCNICAS EN TEST:
1. PROCESOS SECUENCIALES Y FASES TEMPORALES:
   - Cuando se evalúe un proceso por etapas (ej. ciclo celular, procedimiento administrativo, secuencia de protocolos o algoritmos), los distractores deben representar permutaciones plausibles del orden cronológico, omisiones de pasos críticos o confusión entre la fase precedente y la subsecuente.
2. CÁLCULOS MATEMÁTICOS Y RESULTADOS CUANTITATIVOS:
   - Si la pregunta exige un cálculo o aplicación de fórmula (ej. balances calóricos, plazos procesales, conversiones de unidades), calcula PRIMERO el resultado exacto en el campo "justification".
   - Las opciones deben incluir distractores cuantitativos realistas con sus unidades correspondientes (errores típicos de redondeo, olvido de una variable o uso de la constante equivocada), NUNCA cifras disparatadas ni números sin unidades.
3. EQUIVALENCIAS TÉCNICAS Y SINÓNIMOS CIENTÍFICOS:
   - En preguntas de terminología o sinonimia técnica, evita opciones triviales o pistas obvias; los distractores deben pertenecer al mismo campo semántico disciplinar.`;

/**
 * CALIBRACIÓN UNIVERSAL: MODO NORMAL VS. MODO EXHAUSTIVO (UNIFICADO MEDIANTE INVENTARIO FACTUAL):
 */
export function buildUniversalCalibrationDirective(isExhaustiveMode: boolean = false): string {
  const qualitativeReadingCore = `${CONCEPTUAL_ECONOMY_DIRECTIVE}

${HORIZONTAL_COVERAGE_DIRECTIVE}

${PROPORTIONAL_DENSITY_DIRECTIVE}

${FACTUAL_INVENTORY_DIRECTIVE}

${EXCLUSION_ANALOGIES_DIRECTIVE}

${NO_EDITORIAL_REFERENCES_DIRECTIVE}

${CHAPTER_SUMMARY_PAGES_DIRECTIVE}`;

  if (isExhaustiveMode) {
    return `### DIRECTIVA DE CALIBRACIÓN UNIVERSAL — MODO EXHAUSTIVO:
${qualitativeReadingCore}
2. PRIORIDAD ABSOLUTA AL TEXTO PRINCIPAL + DENSIDAD AMPLIADA (22 A 25 TARJETAS POR PÁGINA):
   - PRIORIDAD #1 (EL TEXTO ES SAGRADO): Tu obligación principal e innegociable es vaciar a fondo el TEXTO PRINCIPAL de la página párrafo por párrafo, extrayendo todas las preguntas troncales que sacarías en el modo estándar (definiciones, clasificaciones, partes, funciones, causas, efectos y mecanismos) MÁS todos los detalles finos del texto (cifras, porcentajes, rangos, cálculos, excepciones y denominaciones o sinónimos técnicos). Jamás sacrifiques preguntas del texto principal.
   - PRIORIDAD #2 (EL EXTRA EXHAUSTIVO EN TABLAS Y PIES DE IMAGEN): Sumado a las preguntas del texto, sácale punta a todas las tablas/cuadros de la página y a los pies de imagen, diagramas o recuadros que contengan información relevante y digna de estudio, hasta alcanzar entre 22 y 25 tarjetas en páginas densas.`;
  }

  return `🎯 CALIBRACIÓN PEDAGÓGICA UNIVERSAL: MODO NORMAL (EXTRACCIÓN TRONCAL EQUILIBRADA DE 8 A 12 TARJETAS):
${qualitativeReadingCore}

ENFOQUE OPERATIVO EN MODO NORMAL (META ADAPTATIVA DE 8 A 12 TARJETAS POR PÁGINA SUSTANCIAL):
1. COBERTURA COMPLETA DEL TEXTO PRINCIPAL (PROHIBIDO QUEDARSE CORTO):
   Barre todos los epígrafes, términos clave definidos y párrafos de prosa para extraer todas las definiciones, funciones, mecanismos, patologías/consecuencias y valores de referencia principales (adultos/estándar) sin omitir ningún concepto importante del tema. El estudiante debe dominar el 100% de la materia troncal explicada.
2. CERO REDUNDANCIA TEXTO-CUADRO RESUMEN:
   Si un concepto, función, regla o patología ya fue evaluado desde el texto en prosa, queda TERMINANTEMENTE PROHIBIDO generar una segunda pregunta sobre ese mismo hecho desde un cuadro resumen o esquema sintético (y viceversa). Un hecho evaluado en el texto = cero preguntas adicionales repetitivas desde su cuadro resumen.
3. TABLAS DE DATOS SIN MICRO-DESPIECE:
   En tablas de baremos, valores de ingesta, mediciones o clasificaciones complejas, extrae los valores generales principales y las excepciones clínicas o normativas más destacadas, pero NO despieces fila por fila los subgrupos secundarios ni los tramos específicos por edad o subcategorías accesorias (reservados al Modo Exhaustivo).
4. EXCLUSIÓN DE PERIFERIA:
   Omite pies de figura, notas al pie de tablas y recuadros de curiosidades o cuadros anecdóticos (reservados al Modo Exhaustivo). Reserva las 8 a 12 tarjetas de la página para el conocimiento troncal indispensable.`;
}

/**
 * DIRECTIVA DE COBERTURA INTEGRAL Y CRUCE RELACIONAL DE TABLAS:
 * Prohíbe el barrido mecánico celda a celda y exige cruces relacionales de orden superior con mentalidad de tribunal.
 */
export const EXHAUSTIVE_TABLES_DIRECTIVE = `### DIRECTIVA DE TABLAS, CUADROS Y PIES DE IMAGEN — MODO EXHAUSTIVO:
1. PRIORIDAD AL TEXTO Y COMPLEMENTO DE TABLAS:
   - Asegúrate siempre de haber extraído primero todas las preguntas del texto en prosa de la página.
2. SACAR PUNTA A TODOS LOS CUADROS Y TABLAS CON SENTIDO PRÁCTICO Y DE ESTUDIO:
   - Desglosa FILA POR FILA todas las tablas y cuadros de la página (generando entre 8 y 16 preguntas cuando la tabla sea completa) con verdadero SENTIDO PRÁCTICO Y UTILIDAD DE ESTUDIO: evalúa de forma independiente las definiciones, orígenes/fuentes, funciones, mecanismos, síntomas/deficiencias, comparaciones según condición o estado, valores extremos (máximo y mínimo de cada categoría) y notas al pie.
   - Verifica siempre la alineación exacta de fila y columna para no cruzar datos entre filas distintas.
3. PIES DE IMAGEN, ESQUEMAS Y RECUADROS RELEVANTES:
   - Exprime también los pies de figura, esquemas, ilustraciones explicadas y recuadros laterales o de vocabulario siempre que contengan definiciones, mecanismos o datos relevantes dignos de estudio.`;

/**
 * TRATAMIENTO UNIVERSAL DE TABLAS, CUADROS Y MATRICES DE DATOS:
 * Diferencia entre tablas de catálogo/inventario y matrices conceptuales relacionales.
 */
export function buildUniversalTablesDirective(isExhaustiveMode: boolean = false): string {
  if (isExhaustiveMode) {
    return EXHAUSTIVE_TABLES_DIRECTIVE;
  }

  return `📊 TRATAMIENTO ESTÁNDAR DE TABLAS Y CUADROS (MODO NORMAL):
En modo normal, si el documento contiene tablas, matrices o cuadros:
a) EVALUACIÓN GLOBAL Y RELEVANCIA GENERAL: Se formulan preguntas centradas en la síntesis, propósito de conjunto o conclusiones relevantes que aporten valor general a la comprensión del tema.
b) PROHIBICIÓN DE MINUCIOSIDAD ACCESORIA: Queda prohibido escudriñar minuciosamente cada casilla aislada, nota al pie secundaria o excepción accesoria sin contexto global. En tablas de catálogo o inventarios extensos, se permite como máximo 1 tarjeta que sintetice el criterio o regla general, vetando memorizar filas individuales secundarias.`;
}

/**
 * DIRECTIVA UNIVERSAL DE MODO MINUCIOSO / QUIRÚRGICO:
 * Cobertura en profundidad mediante estructura de doble capa obligatoria.
 */
export const EXHAUSTIVE_MODE_MANDATE = `🔬 DIRECTIVA UNIVERSAL DE MODO EXHAUSTIVO (ESTRUCTURA DE DOBLE CAPA OBLIGATORIA Y MENTALIDAD DE TRIBUNAL):
En páginas con contenido evaluable, no apliques topes restrictivos que limiten páginas ultra-densas; extrae todas las tarjetas necesarias (ej. de 22 a 25+ tarjetas en páginas de altísima densidad y tablas conceptuales) para cubrir el 100% de la página antes de pasar a la siguiente.

ESTRUCTURA DE DOBLE CAPA OBLIGATORIA:
1. CAPA 1 (100% DE LA BASE TRONCAL):
   Debe incluir absolutamente todas las preguntas troncales de las 4 dimensiones que generaría el Modo Teórico Normal: qué es (identidad/definición), qué hace y cómo funciona (función/mecanismo), de dónde procede o cómo se inicia (origen/fuente) y qué ocurre si falla o se excede (consecuencia/patología/límite). Queda terminantemente PROHIBIDO sacrificar preguntas troncales del texto por hacer preguntas de tablas.

2. CAPA 2 (PROFUNDIDAD DE EXAMEN AVANZADO / OPOSICIÓN - TABLAS, CIFRAS Y NOTAS):
   Añade encima de la Capa 1 el escrutinio de tablas, cuadros comparativos, valores cuantitativos, excepciones y notas al pie, aplicando la REGLA DE ORO DE ALTO VALOR EXAMINABLE (PROHIBIDO EL DETALLE BASURA):
   Actúa como un examinador humano experto, NO como un lector mecánico de celdas al azar. Queda PROHIBIDO formular preguntas triviales o memorísticas sobre datos aislados sin relevancia conceptual.
   De cada tabla, cuadro o nota, extrae preguntas enfocadas en:
   - 1) Los extremos y líderes (el valor más alto, el más bajo, la fuente principal o el caso prototípico).
   - 2) El rasgo diferencial crítico que permite distinguir la entidad A de la entidad B.
   - 3) Los puntos de corte, umbrales cuantitativos o dosis que cambian una clasificación o decisión.
   - 4) Las excepciones llamativas o contraintuitivas a la regla general.`;

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
- DESCOMPRESIÓN LÉXICA Y ANALOGÍAS: Cuando el texto original presente una densidad conceptual superior al nivel cognitivo de la audiencia, tu labor pedagógica permite usar ejemplos cotidianos accesibles para clarificar el concepto en la justificación o en un caso práctico aplicado. Sin embargo, queda TERMINANTEMENTE PROHIBIDO preguntar como materia de examen una metáfora del autor o evaluar equivalencias domésticas de objetos (pelotas, barajas, etc.); la pregunta debe versar siempre sobre el concepto, mecanismo o magnitud real sin desvirtuar el rigor factual.
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

