'use server';

import { GoogleGenAI, Type } from '@google/genai';
import {
  parseDocxIntoVirtualPages,
  type VirtualDocxPage,
} from '@/lib/docxPagination';
import { PDFDocument } from 'pdf-lib';
import { YoutubeTranscript } from 'youtube-transcript';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { randomizeMultipleChoiceCard, stripOptionPrefix, sanitizeCardFrontText } from '@/lib/cardUtils';
import { deduplicateCandidateCards } from '@/lib/cardDeduplication';
import { GEMINI_DEFAULT_MODEL } from '@/lib/aiConfig';
import {
  PRACTICAL_MODE_DIRECTIVE,
  EXHAUSTIVE_MODE_MANDATE,
  buildDidacticModeDirective,
  buildUniversalCalibrationDirective,
  buildUniversalTablesDirective,
  ZERO_MISMATCH_DIRECTIVE,
  DISTRACTOR_VEROSIMILITUDE_DIRECTIVE,
  TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE,
  EXCLUSION_ANALOGIES_DIRECTIVE,
  NO_EDITORIAL_REFERENCES_DIRECTIVE,
  CHAPTER_SUMMARY_PAGES_DIRECTIVE,
  MULTIPLE_CHOICE_PROCESS_DIRECTIVE,
} from '@/lib/aiDirectives';
import type {
  CardFormat,
  GeneratedCard,
  GenerateCardsResult,
  MultimodalDocumentInput,
  UrlCardInput,
  DocenteFormat,
  TargetAudience,
} from '@/types/cards';

interface FactualItem {
  id: string;
  tipo: string;
  declaracion_factual: string;
}

const factualItemSchemaProperties = {
  id: {
    type: Type.STRING,
    description: 'Identificador correlativo del hecho (ej. H1, H2, H3...).',
  },
  tipo: {
    type: Type.STRING,
    description:
      'Dimensión del hecho extraído: "1_identidad_definicion" (qué es, naturaleza o concepto), "2_funcion_mecanismo" (para qué sirve, cómo actúa, proceso), "3_origen_fuente_requisitos" (de dónde procede, cómo se obtiene/absorbe, inputs o legitimación), "4_consecuencia_falla_limite" (qué pasa si falta/sobra, patología, sanción, excepción o límite), o "5_detalle_tabla_nota" (cruce comparativo de tabla, cifra crítica o nota técnica en modo exhaustivo).',
  },
  declaracion_factual: {
    type: Type.STRING,
    description:
      'Declaración fáctica atómica, precisa e inequívoca extraída fielmente del material analizado.',
  },
};

const factualItemRequiredFields = ['id', 'tipo', 'declaracion_factual'];

const cardItemSchemaProperties = {
  generation_index: {
    type: Type.INTEGER,
    description:
      'Índice secuencial estricto obligatorio de la tarjeta (1, 2, 3... de la página procesada).',
  },
  justification: {
    type: Type.STRING,
    description:
      'Razonamiento factual, cálculo o cita técnica extraída del documento que justifica con rigor absoluto la respuesta ANTES de marcar la opción correcta (Chain of Thought).',
  },
  question: {
    type: Type.STRING,
    description:
      'Enunciado limpio y directo de la pregunta sin letras ni opciones.',
  },
  options: {
    type: Type.ARRAY,
    description:
      'Array con exactamente 4 opciones de respuesta distintas para multiple_choice: [opción 0, opción 1, opción 2, opción 3]. Omitir o dejar vacío en basic, cloze o true_false.',
    items: {
      type: Type.STRING,
    },
  },
  correct_option_index: {
    type: Type.INTEGER,
    description:
      'Índice numérico de 0 a 3 de la opción verdadera en el array options (0 para la primera, 1 para la segunda, 2 para la tercera, 3 para la cuarta). Exclusivo de multiple_choice.',
  },
  front: {
    type: Type.STRING,
    description:
      'Anverso de la tarjeta según el formato solicitado (pregunta directa para basic, texto con [...] para cloze, afirmación categórica para true_false, o pregunta con opciones a-d para multiple_choice).',
  },
  back: {
    type: Type.STRING,
    description:
      'Respuesta exacta seguida obligatoriamente de la explicación y justificación técnica basada en el documento.',
  },
  cardFormat: {
    type: Type.STRING,
    description: 'Formato de la tarjeta: "multiple_choice", "basic", "cloze" o "true_false"',
  },
  relevance_tier: {
    type: Type.STRING,
    description:
      'Nivel de valor examinable de esta tarjeta: "A_core" (evalúa una de las 4 dimensiones troncales: definición/identidad, mecanismo/función, origen/fuente/requisito, o consecuencia/patología/límite), "B_exam_detail" (evalúa un dato cuantitativo fino, matiz diferencial, excepción o extremo de tabla), o "C_trivial_filler" (pregunta de relleno irrelevante, obvia, sacada de un pie de foto decorativo, introducción anecdótica o repetida solo para intentar alcanzar el cupo en una página con poco texto).',
  },
};

const cardItemRequiredFields = [
  'generation_index',
  'front',
  'back',
  'cardFormat',
  'options',
  'correct_option_index',
];

/**
 * Esquema unificado de extracción de conocimiento con Inventario Factual previo.
 * Fuerza a Gemini a desglosar primero todos los hechos atómicos del texto antes de generar las tarjetas.
 */
const unifiedExtractionSchema = {
  type: Type.OBJECT,
  description:
    'Objeto de extracción universal de conocimiento con inventario factual previo y tarjetas de estudio',
  properties: {
    inventario_factual: {
      type: Type.ARRAY,
      description:
        'Mapeo obligatorio previo de TODOS los conceptos y hechos evaluables de la página analizada. Para cada entidad o tema de la página, debes rastrear e inventariar activamente sus 4 dimensiones presentes en el texto (1_identidad_definicion, 2_funcion_mecanismo, 3_origen_fuente_requisitos, 4_consecuencia_falla_limite) más los detalles de tablas/notas si aplica. Cada ítem de este inventario DEBE transformarse obligatoriamente en una tarjeta dentro de "cards".',
      items: {
        type: Type.OBJECT,
        properties: factualItemSchemaProperties,
        required: factualItemRequiredFields,
      },
    },
    core_exhausted: {
      type: Type.BOOLEAN,
      description:
        'true si el material o página está casi vacío o se han extraído absolutamente todos sus conceptos relevantes; false si aún contiene información adicional por evaluar.',
    },
    page_classification: {
      type: Type.STRING,
      description:
        'Clasificación estructural de la página actual: "standard_content" (páginas con desarrollo teórico normal Y TAMBIÉN páginas que contengan Tablas Conceptuales, Sintéticas o Comparativas de estudio que relacionen categorías, tipos, agentes o elementos con sus orígenes, funciones, mecanismos, normativas o efectos, las cuales deben desglosarse íntegramente al 100%), "catalog_table_only" (reservado EXCLUSIVAMENTE para páginas compuestas casi en su totalidad por un directorio o listado masivo de consulta de decenas de ejemplos o baremos numéricos repetitivos sin desarrollo conceptual), o "review_or_case_exercises" (páginas finales de capítulo con cuestionarios de Repaso, Autoevaluación o Ejercicios para el alumno).',
    },
    cards: {
      type: Type.ARRAY,
      description:
        'Array dinámico con tarjetas de estudio de alta precisión según el formato solicitado, donde cada tarjeta evalúa directa y rigurosamente los hechos catalogados en el inventario_factual.',
      items: {
        type: Type.OBJECT,
        properties: cardItemSchemaProperties,
        required: cardItemRequiredFields,
      },
    },
  },
  required: ['inventario_factual', 'cards'],
};

// Aliases unificados para garantizar compatibilidad retroactiva total
const flashcardSchema = unifiedExtractionSchema;
const singlePageExtractionSchema = unifiedExtractionSchema;
const tieredExhaustiveExtractionSchema = unifiedExtractionSchema;

void flashcardSchema;
void singlePageExtractionSchema;
void tieredExhaustiveExtractionSchema;

/**
 * REGLA INQUEBRANTABLE DE RELEVANCIA COGNITIVA:
 * Erradica preguntas sobre artefactos de maquetación, notas al pie editoriales, símbolos tipográficos,
 * índices/glosarios marginales, datos biográficos ficticios o permisos editoriales.
 */
const EDITORIAL_ARTIFACTS_DIRECTIVE = `REGLA UNIVERSAL DE EXCLUSIÓN DE METADATOS Y ESTRUCTURA EDITORIAL:
- Queda estrictamente PROHIBIDO formular preguntas sobre cajas de 'Términos Clave', vocabularios al margen, índices o glosarios que sirvan de resumen o listado en el documento. La evaluación debe versar sobre la explicación teórica, la evidencia, las relaciones o los datos descritos en el cuerpo del texto, NUNCA sobre la presencia o ausencia de palabras en un recuadro accesorio.
- Queda estrictamente PROHIBIDO formular preguntas sobre datos anecdóticos de personajes ficticios en viñetas o ejemplos narrativos (ej. nombres de personajes en supuestos pedagógicos, datos biográficos intrascendentes) o notas de créditos editoriales (ej. 'reimpreso con permiso de...'). Concéntrate en los principios, la disciplina, la técnica, la regla y el fundamento sustancial.
- Tienes TERMINANTEMENTE PROHIBIDO formular preguntas sobre la maquetación o estructura editorial del documento (por ejemplo: 'según el símbolo †', 'qué indica el asterisco', 'qué significan los números entre paréntesis en la tabla', 'en qué columna se encuentra X', 'según la nota al pie').
- Si un gráfico, tabla o nota al margen contiene datos sustanciales, formula la pregunta DIRECTAMENTE sobre el concepto o hecho real evaluable, NUNCA sobre el número de cuadro, símbolo o disposición editorial en la página.
- Pregunta SIEMPRE por el conocimiento sustancial y factual, jamás por cómo fue maquetado o diagramado en la página.

${EXCLUSION_ANALOGIES_DIRECTIVE}

${NO_EDITORIAL_REFERENCES_DIRECTIVE}`;

/**
 * Regla de formato obligatoria inyectada dinámicamente en el System Prompt y Reglas Globales.
 */
function getFormatRule(format: CardFormat = 'multiple_choice'): string {
  switch (format) {
    case 'multiple_choice':
      return 'FORMATO OBLIGATORIO: Múltiple opción con exactamente 4 alternativas en array "options" (0 a 3) y "correct_option_index" (0 a 3). Cada tarjeta DEBE incluir "justification" previa con el razonamiento del documento, "question", "options" y "correct_option_index". En "back" se incluye la opción correcta con su justificación técnica.';
    case 'true_false':
      return `FORMATO OBLIGATORIO: Afirmación categórica. 
- El campo 'front' DEBE contener la afirmación.
- El campo 'back' DEBE contener dos partes obligatorias: 1) La palabra 'Verdadero' o 'Falso' en negrita al inicio. 2) Una línea en blanco seguida de: 'Explicación: [Fundamento científico/técnico que justifica inequívocamente la veracidad o falsedad de la afirmación basándose en el documento]'. NUNCA devuelvas solo 'Verdadero' o 'Falso'.
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]). BAJO NINGÚN CONCEPTO generes opciones A, B, C, D.`;
    case 'cloze':
      return 'FORMATO OBLIGATORIO: Texto con una palabra clave o concepto fundamental oculto (ej. usando corchetes [...] o el estándar que utilice el frontend). Asegura que el reverso proporcione el fundamento conceptual completo y contextualizado del dato consultado, sin respuestas monosilábicas. PROHIBIDO terminantemente generar 4 opciones de respuesta o formato de test múltiple. REGLA CRÍTICA: El array \'options\' DEBE SER OMITIDO o estar VACÍO ([]).';
    case 'basic':
    default:
      return 'FORMATO OBLIGATORIO: Pregunta directa en el anverso. Asegura que el reverso proporcione el fundamento conceptual completo y contextualizado del dato consultado, sin respuestas monosilábicas. PROHIBIDO terminantemente generar 4 opciones de respuesta o formato de test múltiple. REGLA CRÍTICA: El array \'options\' DEBE SER OMITIDO o estar VACÍO ([]).';
  }
}

/**
 * Devuelve las instrucciones del prompt según el formato de tarjeta solicitado.
 */
function getFormatInstructions(format: CardFormat = 'multiple_choice'): string {
  switch (format) {
    case 'multiple_choice':
      return `FORMATO INNEGOCIABLE: multiple_choice (Opción Múltiple / Test Determinista con Chain of Thought):
Cada tarjeta tipo test DEBE seguir rigurosamente este flujo cognitivo de 4 pasos obligatorios:

1º "justification": Redacta PRIMERO el razonamiento factual, cálculo u operación matemática exacta citando el documento ANTES de elegir o marcar la opción correcta (Chain of Thought), concluyendo OBLIGATORIAMENTE en su última línea con la etiqueta:
   VEREDICTO_EXACTO: [texto exacto de la opción ganadora]
2º "question": Escribe el enunciado limpio y directo de la pregunta de examen, sin incluir opciones ni letras a, b, c, d.
3º "options": Proporciona un array con exactamente 4 alternativas [opción 0, opción 1, opción 2, opción 3] derivadas del texto. Deben cumplir SIMETRÍA ESTRUCTURAL (longitud visual similar y redacción paralela, erradicando la heurística de que 'la más larga es la correcta') y originarse de las 4 fuentes taxonómicas permitidas (mecanismos cruzados afines, umbrales cuantitativos limítrofes, afirmaciones verídicas no pertinentes o inversión causa-efecto/falsos amigos). Queda terminantemente PROHIBIDO incluir opciones absurdas o descartables por sentido común.
4º "correct_option_index": Asigna el número entero estricto (0, 1, 2 o 3) correspondiente a la opción verdadera justificada en "options".

ESTRUCTURA DE COMPATIBILIDAD EN "front" Y "back":
- "front": Coloca el enunciado limpio de la pregunta seguido de un salto de línea doble y las 4 opciones formateadas con:
  a) [Texto opción 0]
  b) [Texto opción 1]
  c) [Texto opción 2]
  d) [Texto opción 3]
- "back": Debe comenzar obligatoriamente con la opción verdadera con su letra formal y su texto, seguida de la etiqueta de veredicto y la explicación técnica:
  [letra]) [Texto opción 0]
  VEREDICTO_EXACTO: [Texto opción ganadora]

  Explicación: [Justificación técnica extraída del campo justification]
- "cardFormat": "multiple_choice"
- ${EDITORIAL_ARTIFACTS_DIRECTIVE}

${MULTIPLE_CHOICE_PROCESS_DIRECTIVE}`;

    case 'cloze':
      return `FORMATO OBLIGATORIO: cloze (Texto para rellenar / Cloze):
PROHIBIDO terminantemente generar opciones múltiples (a, b, c, d).
- "front": Un texto explicativo riguroso con una palabra o frase clave oculta usando obligatoriamente la notación [...] (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina [...]").
- "back": El texto completo donde la palabra o frase clave revelada esté claramente resaltada con doble asterisco (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina **fotosíntesis**"). Asegura que el reverso proporcione el fundamento conceptual completo y contextualizado del dato consultado, sin respuestas monosilábicas.
- "cardFormat": "cloze"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]).`;

    case 'true_false':
      return `FORMATO OBLIGATORIO: true_false (Verdadero o Falso):
PROHIBIDO terminantemente generar 4 opciones múltiples (a, b, c, d).
- "front": Una afirmación técnica o conceptual rotunda (que puede ser verdadera o falsa según el temario).
- "back": El campo 'back' DEBE contener dos partes obligatorias:
1) La palabra 'Verdadero' o 'Falso' en negrita al inicio (ej: '**Verdadero**' o '**Falso**').
2) Una línea en blanco seguida de: 'Explicación: [Fundamento científico/técnico que justifica inequívocamente la veracidad o falsedad de la afirmación basándose en el documento]'. NUNCA devuelvas solo 'Verdadero' o 'Falso'.
- "cardFormat": "true_false"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]). BAJO NINGÚN CONCEPTO generes opciones A, B, C, D.`;

    case 'basic':
    default:
      return `FORMATO OBLIGATORIO: basic (Pregunta y Respuesta Directa):
PROHIBIDO terminantemente generar opciones múltiples (a, b, c, d).
- "front": Pregunta directa, específica y rigurosa para evaluar el concepto.
- "back": Respuesta rigurosa y directa seguida obligatoriamente de una explicación que proporcione el fundamento conceptual completo y contextualizado del dato consultado, sin respuestas monosilábicas.
- "cardFormat": "basic"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]).`;
  }
}

/**
 * RIGOR MATEMÁTICO EN ADVERTENCIAS (core_exhausted):
 * Solo se dispara cuando la lista Troncal se vacía matemáticamente.
 */
const RIGOR_WARNING_DIRECTIVE = `RIGOR MATEMÁTICO EN LA PROPIEDAD "core_exhausted":
- core_exhausted DEBE ser TRUE ÚNICAMENTE cuando la LISTA TRONCAL se haya vaciado matemáticamente (el 100% de los conceptos nucleares del texto fuente ya han sido extraídos en tarjetas existentes o en este lote). Esto indica la transición obligatoria a la fase minuciosa o el agotamiento del contenido nuclear.
- core_exhausted DEBE ser FALSE si todavía queda en el texto fuente al menos UN concepto o definición troncal sin evaluar.
- BAJO NINGÚN CONCEPTO marques core_exhausted: true basándote en la cantidad total de tarjetas de forma arbitraria; debe responder exclusivamente al vaciado real de la materia troncal del material proporcionado.`;


/**
 * Genera la sección de formato e integridad para el Modo Docente en lotes de página (PDF / DOCX).
 */
function getDidacticFormatSection(docenteFormat: DocenteFormat = 'mixed_test'): string {
  switch (docenteFormat) {
    case 'open_cases':
      return `${getFormatRule('basic')}
${getFormatInstructions('basic')}

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual" (array de objetos con id, tipo y declaracion_factual con los hechos encontrados en este bloque), "core_exhausted" (booleano) y "cards" (array dinámico con casos prácticos en formato "basic" con caso/pregunta abierta en "front" y respuesta modelo + rúbrica de calificación docente en "back").`;

    case 'multiple_choice':
      return `${getFormatRule('multiple_choice')}
${getFormatInstructions('multiple_choice')}

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual", "core_exhausted" y "cards" (array dinámico formulado estrictamente en formato "multiple_choice" con sus 4 alternativas en array options y justificación clara en back).`;

    case 'true_false':
      return `${getFormatRule('true_false')}
${getFormatInstructions('true_false')}

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual", "core_exhausted" y "cards" (array dinámico formulado estrictamente en formato "true_false" con afirmación categórica en front y "Verdadero" o "Falso" con justificación rigurosa en back).`;

    case 'cloze':
      return `${getFormatRule('cloze')}
${getFormatInstructions('cloze')}

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual", "core_exhausted" y "cards" (array dinámico formulado estrictamente en formato "cloze" ocultando el término clave exactamente con el marcador [...] en front —de 1 a 4 palabras máximo por hueco, sin escribir la respuesta dentro de los corchetes ni símbolos ☐/□— y términos ocultos con explicación en back).`;

    case 'basic':
      return `${getFormatRule('basic')}
${getFormatInstructions('basic')}

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual", "core_exhausted" y "cards" (array dinámico formulado estrictamente en formato "basic" con pregunta directa en front y respuesta concisa en back).`;

    case 'mixed_test':
    default:
      return `FORMATO TEST VARIADO / MIXTO: Tienes absoluta libertad para alternar dinámicamente entre los 4 formatos ("multiple_choice", "basic", "cloze", "true_false") según lo que mejor evalúe cada concepto y nivel de la taxonomía de Bloom (30% básico, 40% intermedio, 30% avanzado).
- Si una tarjeta usa cardFormat: "multiple_choice", rellena "question" con el enunciado sin opciones, "options" con 4 alternativas [0, 1, 2, 3], "correct_option_index" (0 a 3), "front" con el enunciado y las 4 opciones a-d, y "back" con la opción correcta y su justificación.
- Si una tarjeta usa cardFormat: "cloze", rellena TANTO "question" COMO "front" con la oración o párrafo completo ocultando el término clave exactamente con el marcador [...] (PROHIBIDO escribir la respuesta dentro de los corchetes en 'front' o 'question' y PROHIBIDO incluir símbolos de casilla ☐/□; escribe únicamente [...] donde deba ir el hueco y pon el término oculto en 'back'). Cada hueco [...] debe ocultar un término o concepto concreto (de 1 a 4 palabras máximo), nunca una lista de varias oraciones, y deja "options" vacío [].
- Si una tarjeta usa cardFormat: "true_false", rellena TANTO "question" COMO "front" con la afirmación completa a evaluar, "back" con "Verdadero" o "Falso" más su justificación rigurosa, y deja "options" vacío [].
- Si una tarjeta usa cardFormat: "basic", rellena TANTO "question" COMO "front" con la pregunta directa completa, "back" con la respuesta concisa, y deja "options" vacío [].
- PROHIBIDO escribir el nombre del formato ("cloze", "true_false", "basic") dentro del campo "front". Tanto en "question" como en "front" debes escribir SIEMPRE el enunciado completo de la pregunta, la frase con [...] o la afirmación de Verdadero/Falso.

REGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "inventario_factual", "core_exhausted" y "cards" (array dinámico combinando de forma variada y equilibrada formatos test, básica, cloze y verdadero/falso).`;
  }
}

/**
 * TRATAMIENTO DE TABLAS EN MODO NORMAL (JERARQUÍA CONCEPTUAL TRONCAL):
 * Directiva universal que evalúa matrices, tablas y catálogos desde su significado global,
 * umbrales críticos y tendencias sin caer en memorismo monótono repetitivo.
 */
const NORMAL_TABLES_DIRECTIVE = buildUniversalTablesDirective(false);

/**
 * PROTOCOLO OBLIGATORIO DE EXTRACCIÓN DE TABLAS EN MODO EXHAUSTIVO (QUIRÚRGICO CELDA A CELDA):
 * Desglosa sistemáticamente cruces de variables, umbrales y excepciones evitando preguntas mecánicas idénticas.
 */
const EXHAUSTIVE_TABLES_DIRECTIVE = buildUniversalTablesDirective(true);

// Alias de retrocompatibilidad
const TABLES_AND_FIGURES_DIRECTIVE = EXHAUSTIVE_TABLES_DIRECTIVE;

/**
 * REFORMULACIÓN DEL OBJETIVO: EXPRIMIDO TOTAL SIN ALUCINACIÓN:
 * Directiva de anclaje estricto al documento sin amenazas coercitivas que fuercen alucinaciones.
 */
const STRICT_GROUNDING_DIRECTIVE = `RIGOR FACTUAL Y ANCLAJE ESTRICTO AL DOCUMENTO (GROUNDING):
Tu misión es extraer con fidelidad y rigor la información sustancial del texto sin omitir conceptos clave, mecanismos explicativos, principios rectores, clasificaciones ni definiciones fundamentales.
Queda ESTRICTAMENTE PROHIBIDO recurrir a tu conocimiento general externo para incorporar conceptos, hechos, normas o datos que NO figuren explícitamente en el texto o figuras provistas. Si el contenido sustancial de la página ha sido evaluado con fidelidad, cierra el lote con las tarjetas obtenidas. La exactitud y fidelidad al documento prevalecen sobre cualquier conjetura.`;

/**
 * DIRECTIVA UNIVERSAL DE COBERTURA HORIZONTAL Y DENSIDAD ADAPTATIVA (SWEEP):
 */
const COMPREHENSIVE_SWEEP_DIRECTIVE = `COBERTURA HORIZONTAL Y DENSIDAD ADAPTATIVA:
Realiza un barrido transversal y equilibrado de toda la página o sección identificando todos sus subepígrafes y núcleos de conocimiento distintos. Queda terminantemente PROHIBIDO agotar la atención o hiper-concentrar la generación en un único párrafo o concepto llamativo dejando otros bloques sustanciales en blanco. Modula la densidad adaptativa de forma pura según la riqueza intrínseca del texto: si la página es transicional o introductoria, extrae con sobriedad únicamente lo relevante (incluso una o ninguna tarjeta); si presenta alta densidad conceptual, extrae con rigor todas sus facetas sustanciales sin cuotas ni topes numéricos arbitrarios.`;

const EXHAUSTIVE_SWEEP_DIRECTIVE = `COBERTURA HORIZONTAL Y PROFUNDIDAD EXHAUSTIVA:
Realiza un barrido transversal y equilibrado de toda la página o sección identificando todos sus subepígrafes y núcleos de conocimiento distintos. Queda terminantemente PROHIBIDO agotar la atención o hiper-concentrar la generación en un único párrafo o concepto llamativo dejando otros bloques sustanciales en blanco. En Modo Exhaustivo, extrae con rigor e intensidad cada definición, mecanismo, clasificación, cifra y dato relevante presente en el texto principal y sus tablas/recuadros.`;

/**
 * DIRECTIVA UNIVERSAL DE ECONOMÍA CONCEPTUAL Y CERO REDUNDANCIA DE HECHO (ANTI-CLONES):
 */
const SINGLE_CORE_CONCEPT_DIRECTIVE = `ECONOMÍA CONCEPTUAL Y CERO REDUNDANCIA DE HECHO:
Queda terminantemente PROHIBIDO generar más de una tarjeta sobre el MISMO hecho, hallazgo puntual, mecanismo específico o dato de respuesta, con independencia de que se reformule el enunciado, se altere el orden de las opciones o se cambie la perspectiva.
DISTINCIÓN ESENCIAL (FACETAS INDEPENDIENTES VS. MISMO HECHO SINGULAR): Una misma entidad, nutriente, fármaco, norma o concepto general (ej. el folato, un artículo legal, una enzima o un protocolo de red) PUEDE Y DEBE ser objeto de varias tarjetas si el texto describe múltiples facetas sustanciales independientes (ej. su papel fisiológico, su cuadro deficitario clínico, sus interacciones medicamentosas o su estabilidad físico-química). Lo que queda estrictamente vetado es duplicar la evaluación sobre el mismo hecho singular o conclusión fáctica idéntica.`;

/**
 * DIRECTIVA UNIVERSAL DE JERARQUÍA DE CONTENIDO (SUSTANCIA VS. ANÉCDOTAS):
 */
const CONTENT_HIERARCHY_DIRECTIVE = `JERARQUÍA DEL CONTENIDO (SUSTANCIA VS. ANÉCDOTAS Y CASOS ILUSTRATIVOS):
Prioriza siempre los principios rectores, fundamentos teóricos/científicos, relaciones causa-efecto, normativas, mecanismos funcionales y clasificaciones troncales sobre cuadros puramente decorativos, ejemplos comerciales, marcas o recuadros de curiosidades divulgativas. Queda TERMINANTEMENTE PROHIBIDO generar tarjetas sobre menciones de marcas comerciales, anécdotas de consumo o ejemplos periféricos de relleno. Reserva el 100% de las tarjetas para el conocimiento académico y profesional sustancial.`;

const buildSystemPrompt = (
  existingCardsLength: number,
  coreExhaustedPrevious: boolean,
  existingTopicsList: string = '',
  pedagogicalMode?: 'academic' | 'didactic',
  docenteFormat: DocenteFormat = 'mixed_test',
  targetAudience: TargetAudience = 'auto',
  isExhaustiveMode: boolean = false,
  isPracticalMode: boolean = false
) => {
  const tablesDirective = isExhaustiveMode ? EXHAUSTIVE_TABLES_DIRECTIVE : NORMAL_TABLES_DIRECTIVE;
  const sweepDirective = isExhaustiveMode ? EXHAUSTIVE_SWEEP_DIRECTIVE : COMPREHENSIVE_SWEEP_DIRECTIVE;

  // 1. EL NÚCLEO DEL COMPORTAMIENTO (Universal y Exhaustivo)
  let prompt = `Eres Flashmente, un motor de extracción de conocimiento de alto rendimiento. Tu objetivo es diseccionar el texto proporcionado y generar tarjetas de estudio (flashcards) rigurosas. No resumas el texto. Actúa como un interrogador minucioso.

${sweepDirective}

${SINGLE_CORE_CONCEPT_DIRECTIVE}

${CONTENT_HIERARCHY_DIRECTIVE}

ADAPTACIÓN UNIVERSAL AL CONTEXTO:
El texto puede ser de cualquier temática (ciencias, derecho, historia, tecnología, humanidades). Adapta tu análisis a la naturaleza del texto buscando activamente:
- Relaciones causa-efecto o condicionales (si ocurre X, entonces Y).
- Clasificaciones, tipologías y listas estructuradas.
- Excepciones a reglas generales, notas al pie y datos estadísticos/numéricos.
- Conceptos técnicos, definiciones y normativas.
No asumas conocimientos externos. Extrae la información estrictamente del texto provisto.

${tablesDirective}

${STRICT_GROUNDING_DIRECTIVE}
\n`;

  // 2. LÓGICA DINÁMICA DE ENFOQUE (Tiradas)
  if (!coreExhaustedPrevious) {
    prompt += `ENFOQUE ACTUAL: EXTRACCIÓN TRONCAL. Sigue extrayendo definiciones y procesos. EXTREMADAMENTE IMPORTANTE: Es matemáticamente imposible que agotes la teoría principal de un documento denso en un solo lote. TIENES PROHIBIDO marcar "core_exhausted: true" a menos que el texto sea minúsculo o estés 100% seguro de que no puedes formular NI UNA SOLA PREGUNTA MÁS sobre los conceptos base. Ante la duda, devuelve "core_exhausted: false" para permitir más lotes troncales.\n`;
  } else {
    prompt += `ENFOQUE ACTUAL: EXTRACCIÓN MINUCIOSA DE DETALLES (LENTE PROFUNDA).
Ya has extraído los conceptos troncales en generaciones anteriores. Ahora debes hacer una lectura de máximo escrutinio. Céntrate exclusivamente en datos muy específicos: 
- Datos ocultos en tablas, gráficos o cuadros anexos.
- Fechas exactas, porcentajes, medidas o rangos numéricos.
- Casos atípicos o excepciones muy raras mencionadas en el texto.
Genera tarjetas solo si encuentras este tipo de detalles minuciosos que no se hayan preguntado antes.\n`;
  }

  // 3. INYECCIÓN DEL RADAR ANTI-DUPLICADOS (INSTRUCCIÓN DE CONTINUIDAD CON TÓPICOS)
  if (existingCardsLength > 0) {
    const topicsFormatted = existingTopicsList ? existingTopicsList.trim() : `${existingCardsLength} conceptos previos`;
    prompt += `\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: ${topicsFormatted}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.\n`;
  }

  if (pedagogicalMode === 'didactic') {
    prompt += `\n${buildDidacticModeDirective(docenteFormat, targetAudience)}\n`;
    if (isPracticalMode) {
      prompt += `\n${PRACTICAL_MODE_DIRECTIVE}\n`;
    }
    if (isExhaustiveMode) {
      prompt += `\n${buildUniversalCalibrationDirective(true)}\n`;
      prompt += `\n${EXHAUSTIVE_MODE_MANDATE}\n`;
    }
    prompt += `\n${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n`;
    prompt += `\n${ZERO_MISMATCH_DIRECTIVE}\n`;
  } else {
    prompt += `\n${TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE}\n`;
    if (isPracticalMode) {
      prompt += `\n${PRACTICAL_MODE_DIRECTIVE}\n`;
    }
    prompt += `\n${buildUniversalCalibrationDirective(isExhaustiveMode)}\n`;
    prompt += `\n${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n`;
    prompt += `\n${ZERO_MISMATCH_DIRECTIVE}\n`;
    if (isExhaustiveMode) {
      prompt += `\n${EXHAUSTIVE_MODE_MANDATE}\n`;
    }
  }

  prompt += `\n${EDITORIAL_ARTIFACTS_DIRECTIVE}\n`;

  return prompt;
};

/**
 * Reglas globales inquebrantables de blindaje (Estilo NotebookLM) con inyección dinámica de formato.
 */
function getGlobalRules(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0,
  pedagogicalMode?: 'academic' | 'didactic',
  docenteFormat: DocenteFormat = 'mixed_test',
  targetAudience: TargetAudience = 'auto',
  isExhaustiveMode: boolean = false,
  isPracticalMode: boolean = false
): string {
  const tablesDirective = isExhaustiveMode ? EXHAUSTIVE_TABLES_DIRECTIVE : NORMAL_TABLES_DIRECTIVE;
  let formatRule = '';
  if (pedagogicalMode === 'didactic') {
    switch (docenteFormat) {
      case 'multiple_choice':
        formatRule = getFormatRule('multiple_choice');
        break;
      case 'true_false':
        formatRule = getFormatRule('true_false');
        break;
      case 'cloze':
        formatRule = getFormatRule('cloze');
        break;
      case 'basic':
      case 'open_cases':
        formatRule = getFormatRule('basic');
        break;
      case 'mixed_test':
      default:
        formatRule =
          'FORMATO TEST VARIADO / MIXTO: Tienes libertad total para alternar dinámicamente entre "multiple_choice", "basic", "cloze" y "true_false" según cada concepto y nivel de la taxonomía de Bloom (30% básico, 40% intermedio, 30% avanzado).';
        break;
    }
  } else {
    formatRule = getFormatRule(format);
  }

  const countStr = requestedCount ? String(requestedCount) : '{requested_count}';
  const isReGeneration = existingCardsCount > 0;
  const maxBatchLimit = pedagogicalMode === 'didactic' ? 40 : 30;

  const cardRequirement = isReGeneration
    ? (format === 'multiple_choice'
        ? `array dinámico de hasta ${countStr} tarjetas según formato multiple_choice con sus 4 opciones, respuesta correcta y generation_index del 1 al N`
        : `array dinámico de hasta ${countStr} tarjetas formuladas según el formato "${format}" y generation_index del 1 al N`)
    : (format === 'multiple_choice'
        ? `array dinámico de hasta ${countStr} tarjetas según formato multiple_choice con sus 4 opciones, respuesta correcta y generation_index del 1 al N`
        : `array dinámico de hasta ${countStr} tarjetas formuladas estrictamente según el formato "${format}" y generation_index del 1 al N`);

  const directiveRule = isReGeneration
    ? `2. DIRECTIVA DE EXPANSIÓN Y ANTI-DUPLICADOS: Intenta alcanzar hasta ${countStr} tarjetas nuevas basándote en conceptos aún no evaluados y datos visuales. SIN EMBARGO, ATENCIÓN: EL ESQUEMA JSON TE PERMITE DEVOLVER MENOS DE ${maxBatchLimit} TARJETAS. SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas). NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA.
3. ÍNDICE DE SEGUIMIENTO: Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación cuando alcances las ${countStr} tarjetas o cuando hayas evaluado todos los conceptos únicos posibles sin duplicar nada del historial.`
    : `2. ${STRICT_GROUNDING_DIRECTIVE} Objetivo de extracción: hasta ${countStr} tarjetas reales respaldadas por la fuente.
3. ÍNDICE DE SEGUIMIENTO OBLIGATORIO: Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación al alcanzar las ${countStr} tarjetas o si el material académico real se ha agotado por completo sin inventar datos externos.`;

  const isDocenteMode =
    pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

  const didacticRule = isDocenteMode
    ? `\n\n13. ${buildDidacticModeDirective(docenteFormat, targetAudience)}`
    : `\n\n13. ${TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE}`;

  const practicalRule = isPracticalMode ? `\n\n14. ${PRACTICAL_MODE_DIRECTIVE}` : '';
  const calibrationRule = isDocenteMode
    ? (isExhaustiveMode ? `\n\n15. ${buildUniversalCalibrationDirective(true)}` : '')
    : `\n\n15. ${buildUniversalCalibrationDirective(isExhaustiveMode)}`;
  const distractorRule = `\n\n16. ${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}`;
  const zeroMismatchRule = `\n\n17. ${ZERO_MISMATCH_DIRECTIVE}`;

  const sweepDirective = isExhaustiveMode ? EXHAUSTIVE_SWEEP_DIRECTIVE : COMPREHENSIVE_SWEEP_DIRECTIVE;

  return `REGLAS GLOBALES INQUEBRANTABLES DE BLINDAJE (ESTILO NOTEBOOKLM):
1. REGLA DE ORO (Estilo NotebookLM): NO inventes información. Tu única fuente de verdad es el texto. Si un concepto, dato o respuesta no se puede deducir directa y explícitamente del texto proporcionado, DEBES omitirlo. No uses conocimiento previo externo.
${directiveRule}
4. ${formatRule}
5. PRECISIÓN Y GROUNDING: Toda pregunta, afirmación, distractor o respuesta debe estar basada estricta y textualmente en el texto fuente.
6. ACRÓNIMOS: Todo acrónimo debe ir acompañado obligatoriamente de su nombre completo si figura en la fuente (ejemplo: "ARN (Ácido Ribonucleico)", "TCP (Transmission Control Protocol)").
7. INTEGRIDAD ESTRUCTURAL DEL JSON (PRIORIDAD ABSOLUTA): Debes devolver un objeto JSON válido con los campos "conceptos_identificados" (array de strings con conceptos clave no evaluados), "core_exhausted" (booleano) y "cards" (${cardRequirement}). Sé sintético y directo en el enunciado de las preguntas y opciones, y riguroso, explicativo y profundamente justificado en el reverso ("back"), incluyendo siempre la justificación técnica basada en la fuente.
8. ${sweepDirective}
9. ${SINGLE_CORE_CONCEPT_DIRECTIVE}
10. ${CONTENT_HIERARCHY_DIRECTIVE}
11. ${tablesDirective}
12. ${EDITORIAL_ARTIFACTS_DIRECTIVE}${didacticRule}${practicalRule}${calibrationRule}${distractorRule}${zeroMismatchRule}`;
}

interface ParsedPageRange {
  startPage?: number;
  endPage?: number;
  rangeLabel?: string;
}

/**
 * CHUNKING DE PRECISIÓN:
 * Parsea y aísla el rango de páginas solicitado a partir de inputs numéricos, strings de rango
 * o instrucciones en lenguaje natural (ej. "páginas 5-12", "pág. 10 a 20", "capítulo 3 págs 15-30").
 */
function parsePageRange(
  pageRangeStr?: string,
  pageStart?: number,
  pageEnd?: number,
  focusInstruction?: string
): ParsedPageRange {
  let start: number | undefined = pageStart && pageStart > 0 ? pageStart : undefined;
  let end: number | undefined = pageEnd && pageEnd > 0 ? pageEnd : undefined;

  // 1. Si se pasó string explícito de rango (ej. "5-12", "1 a 10")
  if ((!start || !end) && pageRangeStr && pageRangeStr.trim()) {
    const cleanStr = pageRangeStr.trim();
    const match = cleanStr.match(/(\d+)\s*(?:-|–|—|a|al|hasta|to)\s*(\d+)/i);
    if (match) {
      start = start ?? parseInt(match[1], 10);
      end = end ?? parseInt(match[2], 10);
    } else {
      const singleMatch = cleanStr.match(/(\d+)/);
      if (singleMatch) {
        start = start ?? parseInt(singleMatch[1], 10);
        end = end ?? start;
      }
    }
  }

  // 2. Si no se especificó rango numérico, buscar menciones de páginas en focusInstruction
  if ((!start || !end) && focusInstruction && focusInstruction.trim()) {
    const rangeRegex = /(?:p[aá]ginas?|p[aá]gs?\.?|pages?|pp\.?)\s*(\d+)\s*(?:-|–|—|a|al|hasta|to)\s*(\d+)/i;
    const match = focusInstruction.match(rangeRegex);
    if (match) {
      start = start ?? parseInt(match[1], 10);
      end = end ?? parseInt(match[2], 10);
    } else {
      const singlePageRegex = /(?:p[aá]gina|p[aá]g\.?|page)\s*(\d+)/i;
      const singleMatch = focusInstruction.match(singlePageRegex);
      if (singleMatch) {
        start = start ?? parseInt(singleMatch[1], 10);
        end = end ?? start;
      }
    }
  }

  // Coherencia matemática
  if (start && start < 1) start = 1;
  if (start && end && end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  let rangeLabel: string | undefined = undefined;
  if (start && end) {
    rangeLabel = start === end ? `Página ${start}` : `Páginas ${start} a ${end}`;
  } else if (start) {
    rangeLabel = `Desde página ${start}`;
  } else if (end) {
    rangeLabel = `Hasta página ${end}`;
  }

  return { startPage: start, endPage: end, rangeLabel };
}

/**
 * SALVAVIDAS ANTI-DUPLICACIÓN Y ANCLAJE ESTRICTO (GROUNDING):
 * Construye la directiva de cuota de tarjetas para Gemini sin forzar alucinaciones.
 */
function buildTargetCountDirective(
  targetCount: number,
  existingCardsCount: number
): { directive: string; integrityNote: string } {
  const isFirstGeneration = existingCardsCount === 0;

  if (isFirstGeneration) {
    return {
      directive: `${STRICT_GROUNDING_DIRECTIVE}
Objetivo de extracción para este lote: hasta ${targetCount} tarjetas.
${TABLES_AND_FIGURES_DIRECTIVE}

ÍNDICE DE SEGUIMIENTO OBLIGATORIO:
Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación al alcanzar las ${targetCount} tarjetas o si el material académico real de la fuente ha sido completamente evaluado sin omitir nada.`,
      integrityNote: `array dinámico de hasta ${targetCount} tarjetas únicas respaldadas por la fuente en formato`,
    };
  }

  return {
    directive: `DIRECTIVA DE EXPANSIÓN (ANTI-DUPLICADOS): Intenta alcanzar hasta ${targetCount} tarjetas nuevas basándote en detalles minuciosos, tablas y datos de las imágenes.
${STRICT_GROUNDING_DIRECTIVE}
ATENCIÓN: EL ESQUEMA JSON TE PERMITE DEVOLVER MENOS DE 30 TARJETAS. SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas). NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA.

ÍNDICE DE SEGUIMIENTO:
Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación cuando alcances las ${targetCount} tarjetas o cuando hayas evaluado todos los conceptos únicos posibles sin duplicar nada del historial.`,
    integrityNote: `array dinámico de entre 1 y ${targetCount} tarjetas únicas no repetidas del formato (deteniéndote antes si el material se agota para evitar duplicar el historial)`,
  };
}

/**
 * Aísla exactamente una página de un documento PDF en memoria y la devuelve en Base64.
 */
async function sliceSinglePdfPage(
  srcDoc: PDFDocument,
  pageNumber: number
): Promise<string> {
  const subDoc = await PDFDocument.create();
  const [copiedPage] = await subDoc.copyPages(srcDoc, [pageNumber - 1]);
  subDoc.addPage(copiedPage);
  return await subDoc.saveAsBase64({ dataUri: false });
}

/**
 * Aísla un rango continuo de páginas de un documento PDF en memoria y lo devuelve en Base64.
 */
async function slicePdfPageRange(
  srcDoc: PDFDocument,
  startPage: number,
  endPage: number
): Promise<string> {
  const subDoc = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = startPage; p <= endPage; p++) {
    indices.push(p - 1);
  }
  const copiedPages = await subDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) {
    subDoc.addPage(page);
  }
  return await subDoc.saveAsBase64({ dataUri: false });
}

interface PageChunk {
  chunkIndex: number;
  totalChunks: number;
  startPage: number;
  endPage: number;
  quota: number;
}

/**
 * MOTOR DE CHUNKING Y BATCHING MATEMÁTICO:
 * Divide un rango de páginas en segmentos equilibrados (chunks) y distribuye proporcionalmente
 * el total de tarjetas solicitadas entre dichos segmentos para garantizar que el 100% de las páginas
 * aporten preguntas al examen y evitar la saturación de contexto.
 */
function partitionPagesIntoChunks(
  startPage: number,
  finalPage: number,
  targetCount: number
): PageChunk[] {
  const totalPages = finalPage - startPage + 1;
  if (totalPages <= 0) return [];

  // Determinar número óptimo de bloques (entre 1 y 6 chunks)
  let numChunks: number;
  if (totalPages === 1) {
    numChunks = 1;
  } else if (totalPages <= 3) {
    numChunks = totalPages;
  } else if (totalPages <= 6) {
    numChunks = Math.min(totalPages, 3);
  } else if (totalPages <= 12) {
    numChunks = Math.min(totalPages, 4);
  } else if (totalPages <= 20) {
    numChunks = Math.min(totalPages, 5);
  } else {
    numChunks = Math.min(totalPages, 6);
  }

  const basePagesPerChunk = Math.floor(totalPages / numChunks);
  const extraPages = totalPages % numChunks;

  const baseQuota = Math.floor(targetCount / numChunks);
  const extraQuota = targetCount % numChunks;

  const chunks: PageChunk[] = [];
  let currentStart = startPage;

  for (let i = 0; i < numChunks; i++) {
    const pagesInThisChunk = basePagesPerChunk + (i < extraPages ? 1 : 0);
    const chunkEnd = currentStart + pagesInThisChunk - 1;
    const chunkQuota = Math.max(1, baseQuota + (i < extraQuota ? 1 : 0));

    chunks.push({
      chunkIndex: i,
      totalChunks: numChunks,
      startPage: currentStart,
      endPage: chunkEnd,
      quota: chunkQuota,
    });

    currentStart = chunkEnd + 1;
  }

  return chunks;
}

interface ExistingCardHistoryItem {
  front: string;
  back?: string;
}

/**
 * Recupera de forma segura el historial completo de tarjetas ya existentes en el mazo.
 * Si se pasa deckId, consulta la base de datos Supabase para obtener las preguntas y respuestas
 * y las fusiona con cualquier pregunta adicional provista por el cliente, devolviendo un conjunto deduplicado.
 */
async function fetchExistingCardsHistory(
  deckId?: string,
  clientProvided: string[] = []
): Promise<ExistingCardHistoryItem[]> {
  const map = new Map<string, ExistingCardHistoryItem>();

  // 1. Incorporar preguntas pasadas por el cliente
  for (const q of clientProvided) {
    if (q && typeof q === 'string' && q.trim()) {
      const normalized = q.trim();
      map.set(normalized.toLowerCase(), { front: normalized });
    }
  }

  // 2. Si se proporciona deckId, recuperar siempre las tarjetas actuales de Supabase
  if (deckId) {
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
      const dbClient = serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : supabase;

      const { data, error } = await dbClient
        .from('cards')
        .select('front, back')
        .eq('deck_id', deckId);

      if (error) {
        console.warn('Advertencia al consultar tarjetas existentes del mazo en Supabase:', error);
      } else if (data && data.length > 0) {
        for (const row of data) {
          if (row.front && typeof row.front === 'string' && row.front.trim()) {
            const normalized = row.front.trim();
            map.set(normalized.toLowerCase(), {
              front: normalized,
              back: row.back && typeof row.back === 'string' ? row.back.trim() : undefined,
            });
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Error no bloqueante al consultar el historial de tarjetas en Supabase:', err);
    }
  }

  return Array.from(map.values());
}

/**
 * Extrae de forma concisa el tópico o concepto principal de una tarjeta previa (enunciado + respuesta nuclear)
 * para no saturar el contexto de la IA pero impedir preguntas clonadas sobre el mismo concepto.
 */
function extractCardTopic(card: ExistingCardHistoryItem): string {
  // Tomar únicamente la primera línea del front (antes de cualquier opción a-d o salto de línea)
  let text = card.front.split(/\r?\n/)[0].trim();
  // Eliminar numeraciones o viñetas iniciales (ej. "1.", "1-", "(a)", "a)")
  text = text.replace(/^(\d+[\.\)\-:]|\(?[a-dA-D]\))\s*/, '').trim();
  // Eliminar signos de interrogación
  text = text.replace(/^[¿\?]+/, '').replace(/[\?]+$/, '').trim();
  // Limpiar fórmulas interrogativas habituales para aislar el tópico nuclear
  text = text.replace(
    /^(cuál\s+es|cuáles\s+son|qué\s+es|en\s+qué\s+consiste|defina|define|indique|indica|señale|señala|describa|describe|explique|explica)\s+(el|la|los|las|un|una|unos|unas)?\s*/i,
    ''
  ).trim();
  // Limpiar corchetes de cloze
  text = text.replace(/\[\.\.\.\]/g, '').replace(/\s+/g, ' ').trim();

  if (text.length > 70) {
    const cut = text.slice(0, 70);
    const lastSpace = cut.lastIndexOf(' ');
    text = (lastSpace > 25 ? cut.slice(0, lastSpace) : cut) + '...';
  }

  // Extraer también la respuesta nuclear (sin la sección "Explicación:") si está disponible
  if (card.back && card.back.trim()) {
    let coreBack = card.back
      .split(/\r?\n+\s*(?:explicaci[oó]n|explanation|justificaci[oó]n)\s*:/i)[0]
      .split(/\r?\n/)[0]
      .replace(/^[a-dA-D][\)\.\:\-]\s*/, '')
      .replace(/\*\*/g, '')
      .trim();
    if (coreBack.length > 45) {
      coreBack = coreBack.slice(0, 45).trim() + '...';
    }
    if (coreBack) {
      return `${text} [${coreBack}]`;
    }
  }

  return text;
}

/**
 * Genera una lista separada por comas con los tópicos o palabras clave principales del historial de tarjetas.
 * Se evita pasar el texto completo de preguntas y respuestas anteriores para no saturar la ventana de atención de Gemini.
 */
function extractUniqueTopicsList(existingCards: ExistingCardHistoryItem[]): string {
  if (!existingCards || existingCards.length === 0) return '';
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const card of existingCards) {
    const topic = extractCardTopic(card);
    const normalized = topic.toLowerCase();
    if (topic && !seen.has(normalized)) {
      seen.add(normalized);
      topics.push(topic);
    }
  }

  return topics.join(', ');
}

/**
 * MEMORIA DE PROGRESO Y REANUDACIÓN SECUENCIAL:
 * Ya no se pasa el texto completo de las preguntas y respuestas anteriores para evitar saturar la atención de Gemini.
 * El historial se transmite de forma ligera y eficiente a través de extractUniqueTopicsList() en la INSTRUCCIÓN DE CONTINUIDAD de buildSystemPrompt.
 */
function buildProgressMemorySection(existingCards?: ExistingCardHistoryItem[]): string {
  void existingCards;
  return '';
}


/**
 * Expresión regular determinista para descartar tarjetas que pregunten por metadatos de cuadros o tablas
 */
const DISALLOWED_TABLE_METADATA_REGEX =
  /cl[ií]nica mayo|rochester|par[eé]ntesis en (el cuadro|la tabla)|asteriscos? en (el cuadro|la tabla)|nota al pie (del cuadro|de la tabla)|fuente (bibliogr[aá]fica|original) (del cuadro|de la tabla)|instituci[oó]n (que )?(elabor[oó]|proporcion[oó]|adapt[oó]) (el cuadro|la tabla)|referencia normativa utilizada para determinar|criterio t[eé]cnico utilizado en (el cuadro|la tabla)|est[aá]ndares de intercambio diab[eé]tico|formas de preparaci[oó]n.*(cuadro|tabla)/i;

/**
 * Expresión regular determinista para descartar preguntas sobre analogías domésticas o infografías de porciones con objetos cotidianos
 */
const DISALLOWED_DOMESTIC_ANALOGIES_REGEX =
  /pelota de tenis|pelota de golf|pelota de b[eé]isbol|disco de hockey|baraja( de cartas)?|videocinta|rat[oó]n de (una )?computadora|caja de cerillos|pieza de scrabble|disco de computadora|c[ií]rculo entre el pulgar|cubo de \d|cuchar[oó]n peque[ñn]o|pu[ñn]ado|pulgar de una mujer|palma de la mano|pu[ñn]o de una persona|pu[ñn]o peque[ñn]o|equival[ea] visualmente|referencia visual para (estimar )?una porci[oó]n|objeto (cotidiano|dom[eé]stico|se utiliza|sirve|representa).*(visualizar|estimar).*(porci[oó]n|taza|gramos|raci[oó]n|alimento|medida)/i;

/**
 * Filtro determinista contra contenido vetado por las directivas universales.
 * Si isFocusActive es true (el usuario activó un Enfoque Temático específico "Verso Libre"),
 * se desactivan estas restricciones para permitir estudiar a fondo cualquier cuadro o contenido solicitado.
 * Si allowTableMetadata es true, se exime de la prohibición de metadatos de tabla, manteniendo activo el veto a analogías domésticas.
 */
function isDisallowedCardContent(card: GeneratedCard, allowTableMetadata = false, isFocusActive = false): boolean {
  if (isFocusActive) return false;
  const textToScan = `${card.front || ''} ${card.question || ''} ${card.back || ''} ${(card.options || []).join(' ')}`;
  const matchesTableMetadata = !allowTableMetadata && DISALLOWED_TABLE_METADATA_REGEX.test(textToScan);
  return (
    matchesTableMetadata ||
    DISALLOWED_DOMESTIC_ANALOGIES_REGEX.test(textToScan)
  );
}

const FORMAT_LABEL_REGEX =
  /^(?:cloze|true_false|true\/false|verdadero_falso|verdadero\s*o\s*falso|basic|b[aá]sica|multiple_choice|test|open_cases|desarrollo|v\/f)$/i;

const UNICODE_CHECKBOX_REGEX = /[\u2610\u2611\u2612\u25A1\u25FB\u25FC\u25A2\u2B1C\u25AB\u25AF]/g;

function normalizeDocenteClozeText(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(UNICODE_CHECKBOX_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  const hasCanonicalGap = /(?:\[\s*(?:\.{2,}|\u2026+|_{2,})\s*\]|\{\{c\d+::.*?\}\}|_{3,})/.test(text);
  if (!hasCanonicalGap) {
    text = text.replace(/\[\s*([^\]\r\n]+?)\s*\]/g, (match, inner) => {
      const cleanInner = String(inner).trim();
      if (!cleanInner || FORMAT_LABEL_REGEX.test(cleanInner)) return match;
      return '[...]';
    });
  }
  return text;
}

function normalizeDocenteCandidateCard(card: GeneratedCard): void {
  if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
    card.front = (card.question || '').trim();
  }
  if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
    card.question = card.front;
  }
  if (card.cardFormat === 'cloze') {
    card.front = normalizeDocenteClozeText(card.front);
    if (card.question) {
      card.question = normalizeDocenteClozeText(card.question);
    }
  } else if (card.front) {
    card.front = card.front.replace(UNICODE_CHECKBOX_REGEX, '').trim();
  }
}

/**
 * Normaliza y procesa las tarjetas generadas garantizando la estructura de 4 opciones para preguntas tipo test.
 */
function processGeneratedCards(
  parsedCards: GeneratedCard[],
  targetCount: number,
  cardFormat: CardFormat,
  allowTableMetadata = false,
  isDocenteMode = false
): GeneratedCard[] {
  const allowedCards = parsedCards
    .filter((card) => !isDisallowedCardContent(card, allowTableMetadata))
    .filter((card) => isDocenteMode || card.relevance_tier !== 'C_trivial_filler');
  return allowedCards.slice(0, targetCount).map((card, idx) => {
    let front = (card.front || '').trim();
    let back = (card.back || '').trim();
    const resolvedFormat = (card.cardFormat as CardFormat) || cardFormat;

    const isMultipleChoice = resolvedFormat === 'multiple_choice';
    let cleanedOpts: string[] | undefined = undefined;

    // Ensamblado determinista Nivel 2: si viene con options y correct_option_index numérico
    if (
      isMultipleChoice &&
      card.options &&
      Array.isArray(card.options) &&
      card.options.length >= 4 &&
      typeof card.correct_option_index === 'number' &&
      card.correct_option_index >= 0 &&
      card.correct_option_index < card.options.length
    ) {
      const letters = ['a', 'b', 'c', 'd'];
      const rawOpts = card.options
        .slice(0, 4)
        .map((opt) => stripOptionPrefix(String(opt)));
      let correctIdx = Math.min(Math.max(0, Math.floor(card.correct_option_index)), 3);

      // Reconciliación de seguridad determinista entre justification, veredicto explícito y rawOpts
      const rawJustification = (card.justification || back || '').trim();
      if (rawJustification && rawOpts.length === 4) {
        const normalizeForMatch = (s: string) =>
          s
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 1. Extraer veredicto explícito si existe la etiqueta VEREDICTO_EXACTO
        const fullSource = `${rawJustification}\n${back}`;
        const explicitMatch = fullSource.match(
          /(?:VEREDICTO_EXACTO|VEREDICTO|RESPUESTA_CANONICA|RESPUESTA_CANÓNICA|RESPUESTA_CORRECTA)\s*[:=]\s*([^\r\n]+)/i
        );
        const explicitVerdictNorm = explicitMatch ? normalizeForMatch(explicitMatch[1]) : '';

        // 2. Comprobar si alguna opción coincide directamente con el veredicto explícito
        let explicitFoundIdx = -1;
        if (explicitVerdictNorm) {
          for (let i = 0; i < 4; i++) {
            const optNorm = normalizeForMatch(rawOpts[i]);
            if (!optNorm) continue;
            if (
              optNorm === explicitVerdictNorm ||
              explicitVerdictNorm === optNorm ||
              explicitVerdictNorm.startsWith(optNorm) ||
              optNorm.startsWith(explicitVerdictNorm)
            ) {
              explicitFoundIdx = i;
              break;
            }
          }
        }

        if (explicitFoundIdx !== -1) {
          correctIdx = explicitFoundIdx;
          card.correct_option_index = correctIdx;
        } else {
          // 3. Evaluador comparativo simultáneo de las 4 opciones
          // Aislar la parte conclusiva y detectar expresiones de exclusión/negación
          const justNorm = normalizeForMatch(rawJustification);
          const conclusionRegex =
            /(?:por tanto|en consecuencia|por lo que|por ende|el resultado es|la respuesta correcta es|la opcion correcta es|opcion correcta|concluye que|es decir|correcto es|correcta es|aporta[n]?|corresponde[n]? a|se define como|equivale[n]? a|consiste en)/i;
          const conclusionPart = justNorm.split(conclusionRegex).pop() || justNorm;

          const exclusionRegex =
            /(?:a diferencia de|en cambio|mientras que|no es|no son|no corresponde|no aplica|a excepcion de|frente a|contrariamente a|a pesar de|distinto de|lejos de)/i;

          // Puntuación comparativa simultánea para cada opción [0..3]
          const scores = [0, 0, 0, 0];

          for (let i = 0; i < 4; i++) {
            const optNorm = normalizeForMatch(rawOpts[i]);
            if (!optNorm || optNorm.length < 2) continue;

            const inConclusion =
              conclusionPart.includes(optNorm) ||
              new RegExp(`(?:^|\\s)${optNorm}(?:$|\\s)`).test(conclusionPart);
            const inWholeJust =
              justNorm.includes(optNorm) ||
              new RegExp(`(?:^|\\s)${optNorm}(?:$|\\s)`).test(justNorm);

            if (inConclusion) {
              scores[i] += 15;
            } else if (inWholeJust) {
              scores[i] += 5;
            }

            // Penalización estricta si aparece precedida por expresiones de exclusión o negación
            const optIndexInJust = justNorm.indexOf(optNorm);
            if (optIndexInJust > 0) {
              const precedingWindow = justNorm.substring(
                Math.max(0, optIndexInJust - 45),
                optIndexInJust
              );
              if (exclusionRegex.test(precedingWindow)) {
                scores[i] -= 25; // Fuertemente descartada como distractor mencionado
              }
            }
          }

          // Bonificación leve por fidelidad al índice original emitido si tiene soporte positivo
          if (scores[correctIdx] > 0) {
            scores[correctIdx] += 2;
          }

          // Determinar el mejor candidato
          let bestIdx = correctIdx;
          let maxScore = scores[correctIdx];

          for (let i = 0; i < 4; i++) {
            if (scores[i] > maxScore) {
              maxScore = scores[i];
              bestIdx = i;
            }
          }

          if (bestIdx !== correctIdx && maxScore > 0) {
            correctIdx = bestIdx;
            card.correct_option_index = correctIdx;
          }
        }
      }

      const correctText = rawOpts[correctIdx];
      cleanedOpts = rawOpts;

      // Obtener el enunciado limpio de la pregunta sanitizado sin referencias editoriales
      const sanitizedQ = sanitizeCardFrontText(card.question || front);
      const qText = sanitizedQ
        .replace(/(?:^|\r?\n|\s+)(?:\(?a\s*[\)\.\-\]\:]|\ba\))\s+[\s\S]*$/i, '')
        .trim();

      const formattedOpts = rawOpts.map((opt, i) => `${letters[i]}) ${opt}`).join('\n');
      front = `${qText}\n\n${formattedOpts}`;

      // Obtener la justificación eliminando etiquetas internas de veredicto y capitalizando
      let rawExplanation = stripOptionPrefix(card.justification || back)
        .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
        .replace(/^(?:Explicación|Justificación|Fundamento|Razón):\s*/i, '')
        .replace(/^\s*(?:seg[uú]n\s+(?:el\s+cuadro|la\s+tabla|el\s+gr[aá]fico|la\s+figura)\s+[^,.:]+[,.:]\s*)/i, '')
        .replace(/^\s*(?:el\s+texto\s+establece\s+expl[ií]citamente\s+que\s+)/i, '')
        .replace(/^\s*la\s+pregunta\s+de\s+repaso(?:\s+n[uú]mero)?\s+\d+\s+(?:identifica|vincula|senala|indica|establece|describe|explica)\s+(?:que\s+)?/i, '')
        .trim();
      rawExplanation = rawExplanation.replace(/^([a-záéíóúñ])/i, (m) => m.toUpperCase());

      back = `${letters[correctIdx]}) ${correctText}${
        rawExplanation ? `\n\nExplicación: ${rawExplanation}` : ''
      }`;
    } else if (
      // Compatibilidad si el modelo devolvió options en un array y front no tiene aún las opciones a), b), c), d)
      isMultipleChoice &&
      card.options &&
      Array.isArray(card.options) &&
      card.options.length >= 4 &&
      !/(?:^|\n)\s*[a-d]\)/i.test(front)
    ) {
      const letters = ['a', 'b', 'c', 'd'];
      const rawOpts = card.options
        .slice(0, 4)
        .map((opt) => stripOptionPrefix(String(opt)));
      cleanedOpts = rawOpts;
      const formattedOpts = rawOpts
        .map((opt, i) => `${letters[i]}) ${opt}`)
        .join('\n');
      front = `${sanitizeCardFrontText(front)}\n\n${formattedOpts}`;
    } else {
      if (isDocenteMode && (!front || FORMAT_LABEL_REGEX.test(front.trim())) && card.question) {
        front = sanitizeCardFrontText(card.question);
      } else {
        front = sanitizeCardFrontText(front);
      }
      if (isDocenteMode && resolvedFormat === 'cloze') {
        front = normalizeDocenteClozeText(front);
      }
    }

    const cleaned: GeneratedCard = {
      generation_index: typeof card.generation_index === 'number' ? card.generation_index : idx + 1,
      front,
      back,
      cardFormat: resolvedFormat,
      cardType: resolvedFormat === 'cloze' ? 'cloze' : 'basic',
      // Blindaje de backend: solo multiple_choice puede conservar options; en cualquier otro formato se descarta
      options:
        isMultipleChoice && (cleanedOpts || (card.options && Array.isArray(card.options)))
          ? cleanedOpts || card.options!.map(String)
          : undefined,
      question: card.question ? sanitizeCardFrontText(card.question) : undefined,
      justification: card.justification,
      correct_option_index: card.correct_option_index,
    };

    return randomizeMultipleChoiceCard(cleaned);
  });
}

interface ParsedGeminiBatch {
  cards: GeneratedCard[];
  coreExhausted: boolean;
  pageClassification?: string;
  conceptosIdentificados?: string[];
  inventarioFactual?: FactualItem[];
}

/**
 * Parsea y valida de forma resiliente la respuesta JSON de Gemini para un lote individual.
 * Elimina bloques de formato markdown si están presentes y extrae el array de tarjetas, inventario factual y estado de agotamiento troncal.
 */
function parseGeminiBatchResponse(rawText: string | undefined): ParsedGeminiBatch {
  if (!rawText || !rawText.trim()) {
    throw new Error('Gemini no devolvió contenido de texto.');
  }

  let cleanJson = rawText.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  const parsedData = JSON.parse(cleanJson) as
    | {
        conceptos_identificados?: string[];
        inventario_factual?: FactualItem[];
        core_exhausted?: boolean;
        page_classification?: string;
        cards?: GeneratedCard[];
        tarjetas_troncales?: GeneratedCard[];
        escrutinio_profundo?: GeneratedCard[];
      }
    | GeneratedCard[];

  let cards: GeneratedCard[] = [];
  let coreExhausted = false;
  let pageClassification: string | undefined;
  let conceptosIdentificados: string[] | undefined;
  let inventarioFactual: FactualItem[] | undefined;

  if (Array.isArray(parsedData)) {
    cards = parsedData;
  } else if (parsedData && typeof parsedData === 'object') {
    coreExhausted = Boolean(parsedData.core_exhausted);
    if (typeof parsedData.page_classification === 'string') {
      pageClassification = parsedData.page_classification.trim();
    }
    if (Array.isArray(parsedData.conceptos_identificados)) {
      conceptosIdentificados = parsedData.conceptos_identificados;
    }
    if (Array.isArray(parsedData.inventario_factual)) {
      inventarioFactual = parsedData.inventario_factual;
      // Si conceptos_identificados no viene explícito, lo derivamos enriquecido desde el inventario factual
      if (!conceptosIdentificados || conceptosIdentificados.length === 0) {
        conceptosIdentificados = parsedData.inventario_factual.map(
          (f) => `[${f.id || 'H'}] (${f.tipo || 'hecho'}) ${f.declaracion_factual || ''}`.trim()
        );
      }
    }

    // 1. Array estándar 'cards' (Modo Normal, Modo Docente o Esquema Unificado con Inventario)
    if (Array.isArray(parsedData.cards)) {
      cards.push(...parsedData.cards);
    }

    // 2. Capa 1 Modo Exhaustivo Estratificado ('tarjetas_troncales' para retrocompatibilidad)
    if (Array.isArray(parsedData.tarjetas_troncales)) {
      cards.push(...parsedData.tarjetas_troncales);
    }

    // 3. Capa 2 Modo Exhaustivo Estratificado ('escrutinio_profundo' para retrocompatibilidad)
    if (Array.isArray(parsedData.escrutinio_profundo)) {
      cards.push(...parsedData.escrutinio_profundo);
    }
  } else {
    throw new Error('El JSON devuelto no contiene un array de tarjetas válido.');
  }

  if (cards.length === 0 && !coreExhausted && pageClassification !== 'review_or_case_exercises') {
    throw new Error('El array de tarjetas devuelto por Gemini está vacío.');
  }

  return {
    cards,
    coreExhausted,
    pageClassification,
    conceptosIdentificados,
    inventarioFactual,
  };
}

/**
 * Modelo global de Google Gemini unificado para rentabilidad y generaciones ilimitadas sostenibles.
 */
const GEMINI_MODEL = GEMINI_DEFAULT_MODEL;

/**
 * Configuración estricta de Gemini generada dinámicamente según el formato de tarjeta:
 * - temperature: 0.25 en Modo Exhaustivo (para exploración sutil de detalles) y 0.15 en Modo Normal.
 * - responseMimeType: 'application/json' y responseJsonSchema para forzar la estructura de salida.
 * - systemInstruction: System Prompt adaptado dinámicamente con buildSystemPrompt basándose en coreExhaustedPrevious e historial sintetizado en tópicos.
 */
function getGeminiConfig(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0,
  coreExhaustedPrevious: boolean = false,
  existingTopicsList: string = '',
  isExhaustiveMode: boolean = false,
  pedagogicalMode?: 'academic' | 'didactic',
  docenteFormat: DocenteFormat = 'mixed_test',
  targetAudience: TargetAudience = 'auto',
  isPracticalMode: boolean = false
) {
  void format;
  void requestedCount;
  return {
    systemInstruction: buildSystemPrompt(
      existingCardsCount,
      coreExhaustedPrevious,
      existingTopicsList,
      pedagogicalMode,
      docenteFormat,
      targetAudience,
      isExhaustiveMode,
      isPracticalMode
    ),
    temperature: isExhaustiveMode ? 0.25 : 0.15,
    responseMimeType: 'application/json',
    responseJsonSchema: flashcardSchema,
    maxOutputTokens: 8192,
  };
}


/**
 * Inyecta la directiva estricta de idioma según las especificaciones de la Fase 25:
 * "GENERA ABSOLUTAMENTE TODO EL CONTENIDO (preguntas, respuestas, opciones y explicaciones) EXCLUSIVAMENTE EN IDIOMA [Idioma del Usuario], ignorando el idioma original de la fuente."
 */
function buildLanguageDirective(lang?: string): string {
  const normalized = (lang || 'es').toLowerCase();
  const targetLanguage = normalized.startsWith('en') ? 'Inglés (English)' : 'Español';
  return `\n\n🚨 DIRECTIVA OBLIGATORIA DE IDIOMA (PRIORIDAD ABSOLUTA):
GENERA ABSOLUTAMENTE TODO EL CONTENIDO (preguntas, respuestas, opciones y explicaciones) EXCLUSIVAMENTE EN IDIOMA ${targetLanguage}, ignorando el idioma original de la fuente.`;
}

/**
 * Intenta resolver el ID de usuario activo mediante varias vías robustas:
 * 1. Parámetro explícito userId pasado por el cliente
 * 2. ID del creador del mazo (consultando la tabla decks si se pasa deckId)
 * 3. Sesión activa en supabase.auth.getUser()
 */
async function resolveUserId(deckId?: string, explicitUserId?: string): Promise<string | null> {
  if (explicitUserId && explicitUserId.trim()) {
    return explicitUserId.trim();
  }

  // 1. Propietario del mazo mediante RPC SECURITY DEFINER (omite bloqueos RLS del cliente anónimo)
  if (deckId) {
    try {
      const { data, error } = await supabase.rpc('get_deck_owner', {
        p_deck_id: deckId,
      });
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('Advertencia al consultar get_deck_owner:', err);
    }
  }

  // 2. Intentar sesión activa de Supabase
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // Continuar con resolución por mazo
  }

  // 3. Fallback select en tabla decks
  if (deckId) {
    try {
      const { data, error } = await supabase
        .from('decks')
        .select('user_id')
        .eq('id', deckId)
        .single();
      if (!error && data?.user_id) {
        return data.user_id;
      }
    } catch (err) {
      console.warn('Advertencia no bloqueante al resolver user_id desde deck:', err);
    }
  }

  return null;
}

interface ApiLimitCheck {
  allowed: boolean;
  tier: 'free' | 'pro' | 'vip';
  currentCount: number;
  bonusCredits?: number;
  welcomeGenerations?: number;
  phase?: 'welcome' | 'ads';
  userId: string;
}

/**
 * Valida la cuota de generación del usuario en api_limits antes de llamar a Gemini según el modelo Freemium (5/50/120):
 * 1. TIER 'pro' o 'vip': Límite de 120 mensuales. Si generations_count >= 120 -> { error: 'LIMIT_REACHED' }.
 * 2. TIER 'free':
 *    - Fase Bienvenida: Si welcome_generations < 5 -> Permite directamente sin ads.
 *    - Fase Ads (Mensual, welcome_generations >= 5):
 *      - Si generations_count >= 50 -> { error: 'LIMIT_REACHED' } (Límite mensual gratis superado).
 *      - Si generations_count < 50:
 *        - Si bonus_credits <= 0 -> { error: 'AD_REQUIRED' }.
 *        - Si bonus_credits > 0 -> Permite la generación.
 */
async function enforceApiLimit(
  userId: string
): Promise<{ check: ApiLimitCheck } | { error: 'LIMIT_REACHED' | 'AD_REQUIRED' }> {
  try {
    // Consultar y validar cuota atómicamente mediante RPC SECURITY DEFINER
    const { data: rpcData, error: rpcError } = await supabase.rpc('check_api_limit', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as {
        allowed?: boolean;
        tier?: 'free' | 'pro' | 'vip';
        count?: number;
        bonus_credits?: number;
        welcome_generations?: number;
        phase?: 'welcome' | 'ads';
        error?: 'LIMIT_REACHED' | 'AD_REQUIRED';
      };

      if (res.allowed === false) {
        if (res.error === 'AD_REQUIRED') {
          return { error: 'AD_REQUIRED' };
        }
        return { error: 'LIMIT_REACHED' };
      }

      return {
        check: {
          allowed: true,
          tier: res.tier || 'free',
          currentCount: typeof res.count === 'number' ? res.count : 0,
          bonusCredits: typeof res.bonus_credits === 'number' ? res.bonus_credits : 0,
          welcomeGenerations: typeof res.welcome_generations === 'number' ? res.welcome_generations : 0,
          phase: res.phase,
          userId,
        },
      };
    }

    if (rpcError) {
      console.error('Error al invocar check_api_limit RPC en Supabase:', rpcError);
    }

    // Fallback a select directo solo si falla el RPC
    const { data: directData } = await supabase
      .from('api_limits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (directData) {
      const tier = (directData.tier as 'free' | 'pro' | 'vip') || 'free';
      const generationsCount =
        typeof directData.generations_count === 'number' ? directData.generations_count : 0;
      const bonusCredits =
        typeof directData.bonus_credits === 'number' ? directData.bonus_credits : 0;
      const welcomeGenerations =
        typeof directData.welcome_generations === 'number' ? directData.welcome_generations : 0;
      const lastDate = directData.last_generation_date
        ? String(directData.last_generation_date).slice(0, 10)
        : null;

      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
      const isSameMonth = lastMonth === currentMonth;
      let count = isSameMonth ? generationsCount : 0;

      // Reseteo mensual perezoso (Lazy Reset) persistente en base de datos si se detecta cambio de mes
      if (!isSameMonth && lastDate) {
        count = 0;
        const todayStr = new Date().toISOString().slice(0, 10);
        try {
          await supabase
            .from('api_limits')
            .update({
              generations_count: 0,
              last_generation_date: todayStr,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        } catch (resetErr) {
          console.warn('Advertencia no bloqueante al persistir lazy reset en fallback de cuota:', resetErr);
        }
      }

      // 1. TIER 'pro' o 'vip': límite 120 mensuales
      if (tier === 'pro' || tier === 'vip') {
        if (count >= 120) {
          return { error: 'LIMIT_REACHED' };
        }
        return {
          check: {
            allowed: true,
            tier,
            currentCount: count,
            bonusCredits,
            welcomeGenerations,
            userId,
          },
        };
      }

      // 2. TIER 'free':
      // Fase Bienvenida: Si welcome_generations < 5 -> permite directamente
      if (welcomeGenerations < 5) {
        return {
          check: {
            allowed: true,
            tier: 'free',
            phase: 'welcome',
            currentCount: count,
            bonusCredits,
            welcomeGenerations,
            userId,
          },
        };
      }

      // Fase Ads (welcome_generations >= 5):
      // Si generations_count >= 25 -> LIMIT_REACHED (5 bienvenida + 25 anuncios = 30 total)
      if (count >= 25) {
        return { error: 'LIMIT_REACHED' };
      }

      // Si generations_count < 25: verificar bonus_credits
      if (bonusCredits <= 0) {
        return { error: 'AD_REQUIRED' };
      }

      // Si bonus_credits > 0, permite la generación
      return {
        check: {
          allowed: true,
          tier: 'free',
          phase: 'ads',
          currentCount: count,
          bonusCredits,
          welcomeGenerations,
          userId,
        },
      };
    }

    // Si no se encuentra registro en api_limits y falló el RPC, bloquear por seguridad
    return { error: 'LIMIT_REACHED' };
  } catch (err) {
    console.error('Error crítico al validar api_limits en Supabase:', err);
    return { error: 'LIMIT_REACHED' };
  }
}

/**
 * Incrementa el uso en api_limits tras completarse la generación con la IA mediante RPC atómico:
 * - TIER 'pro'/'vip': suma 1 a generations_count (hasta 120).
 * - TIER 'free' Fase Bienvenida (< 5): suma 1 a welcome_generations y NO altera generations_count.
 * - TIER 'free' Fase Ads (>= 5): resta 1 a bonus_credits y suma 1 a generations_count.
 */
async function recordApiUsage(userId: string) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const dbClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabase;

    const { error: rpcErr } = await dbClient.rpc('increment_api_generation', {
      p_user_id: userId,
    });

    if (rpcErr) {
      console.error('Advertencia al invocar increment_api_generation RPC:', rpcErr);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: rec } = await dbClient
        .from('api_limits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (rec) {
        const welcome = typeof rec.welcome_generations === 'number' ? rec.welcome_generations : 0;
        const currentCount = typeof rec.generations_count === 'number' ? rec.generations_count : 0;
        const bonus = typeof rec.bonus_credits === 'number' ? rec.bonus_credits : 0;
        const tier = (rec.tier as 'free' | 'pro' | 'vip') || 'free';

        if (tier === 'pro' || tier === 'vip') {
          await dbClient.from('api_limits').update({
            generations_count: currentCount + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        } else if (welcome < 5) {
          // Fase Bienvenida: suma 1 a welcome_generations y NO altera generations_count
          await dbClient.from('api_limits').update({
            welcome_generations: welcome + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        } else {
          // Fase Ads: resta 1 a bonus_credits y suma 1 a generations_count
          await dbClient.from('api_limits').update({
            bonus_credits: Math.max(0, bonus - 1),
            generations_count: currentCount + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        }
      } else {
        await dbClient.from('api_limits').upsert({
          user_id: userId,
          welcome_generations: 1,
          generations_count: 0,
          last_generation_date: todayStr,
          tier: 'free',
          bonus_credits: 0,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Advertencia no bloqueante al actualizar api_limits:', err);
  }
}

/**
 * Server Action que genera tarjetas a partir de un tema de texto usando Gemini 3.1 Flash-Lite.
 */
export async function generateCardsAction(
  topic: string,
  cardFormat: CardFormat = 'multiple_choice',
  cardCount: number = 10,
  deckId?: string,
  existingQuestions?: string[],
  userId?: string,
  language: string = 'es',
  coreExhaustedPrevious: boolean = false,
  pedagogicalMode: 'academic' | 'didactic' = 'academic',
  docenteFormat: DocenteFormat = 'mixed_test',
  targetAudience: TargetAudience = 'auto',
  isPracticalMode: boolean = false
): Promise<GenerateCardsResult> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    return { success: false, error: 'Por favor introduce un tema para generar tarjetas.' };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        'Clave GEMINI_API_KEY no configurada. Por favor define GEMINI_API_KEY en tu archivo .env.local para usar la generación automática.',
    };
  }

  // 0. Protección estricta de Cuotas API / Bypass VIP (sin bypass si no hay usuario resoluble)
  const resolvedUserId = await resolveUserId(deckId, userId);
  if (!resolvedUserId) {
    console.warn('No se pudo resolver user_id para control de cuota. Bloqueo de seguridad activado.');
    return { success: false, error: 'LIMIT_REACHED' };
  }

  const checkResult = await enforceApiLimit(resolvedUserId);
  if ('error' in checkResult) {
    return { success: false, error: checkResult.error };
  }
  const apiCheck = checkResult.check;

  // Límite seguro: hasta 40 tarjetas en Modo Didáctico y 30 en Modo Estudio
  const maxAllowed =
    pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente'
      ? 40
      : 30;
  const targetCount = Math.max(1, Math.min(maxAllowed, cardCount || 10));

  try {
    // 1. Consultar historial de tarjetas existentes en este mazo para la Memoria de Progreso
    const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);
    const existingTopicsList = extractUniqueTopicsList(existingCards);
    const progressMemoryPrompt = buildProgressMemorySection(existingCards);
    const languageDirective = buildLanguageDirective(language);
    const ai = new GoogleGenAI({ apiKey });

    let candidateCards: GeneratedCard[] = [];
    let coreExhausted = false;

    if (targetCount >= 20) {
      // =========================================================================
      // CONCURRENT BATCHING (Peticiones Paralelas para Lotes Grandes)
      // =========================================================================
      const totalRequestedCards = targetCount;
      const batch1Target = Math.ceil(totalRequestedCards / 2);
      const batch2Target = totalRequestedCards - batch1Target;

      const { directive: dir1, integrityNote: note1 } = buildTargetCountDirective(
        batch1Target,
        existingCards.length
      );
      const { directive: dir2, integrityNote: note2 } = buildTargetCountDirective(
        batch2Target,
        existingCards.length
      );

      const prompt1 = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
${dir1}

ENFOQUE DE PARTICIÓN CONCURRENTE (LOTE 1/2): Concéntrate en la DEFINICIÓN, ETIOLOGÍA, MECANISMOS FISIOPATOLÓGICOS Y CONCEPTOS FUNDAMENTALES sobre el tema: "${cleanTopic}".

${RIGOR_WARNING_DIRECTIVE}

${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, false, isPracticalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "inventario_factual" (array de objetos con id, tipo y declaracion_factual como mapa previo), "core_exhausted" (booleano) y "cards" (${note1} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N).

${languageDirective}`;

      const prompt2 = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
${dir2}

ENFOQUE DE PARTICIÓN CONCURRENTE (LOTE 2/2): Concéntrate en el DIAGNÓSTICO, TRATAMIENTO, CRITERIOS CLÍNICOS, CASOS ESPECIALES Y EXCEPCIONES sobre el tema: "${cleanTopic}".

${RIGOR_WARNING_DIRECTIVE}

${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, false, isPracticalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "inventario_factual" (array de objetos con id, tipo y declaracion_factual como mapa previo), "core_exhausted" (booleano) y "cards" (${note2} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N).

${languageDirective}`;

      console.log(
        `[Concurrent Batching Tema] Invocando 2 llamadas concurrentes a Gemini Flash-Lite (${batch1Target} y ${batch2Target} tarjetas)...`
      );

      const [res1, res2] = await Promise.allSettled([
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt1,
          config: getGeminiConfig(
            cardFormat,
            batch1Target,
            existingCards.length,
            coreExhaustedPrevious,
            existingTopicsList,
            false,
            pedagogicalMode,
            docenteFormat,
            targetAudience,
            isPracticalMode
          ),
        }),
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt2,
          config: getGeminiConfig(
            cardFormat,
            batch2Target,
            existingCards.length,
            coreExhaustedPrevious,
            existingTopicsList,
            false,
            pedagogicalMode,
            docenteFormat,
            targetAudience,
            isPracticalMode
          ),
        }),
      ]);

      let b1Exhausted = false;
      let b2Exhausted = false;
      let atLeastOneSuccess = false;

      if (res1.status === 'fulfilled' && res1.value.text) {
        try {
          const parsed1 = parseGeminiBatchResponse(res1.value.text);
          candidateCards.push(...parsed1.cards);
          b1Exhausted = parsed1.coreExhausted;
          atLeastOneSuccess = true;
          console.log(`[Concurrent Batching Tema] Lote 1 OK: ${parsed1.cards.length} tarjetas.`);
        } catch (e1) {
          console.warn('[Concurrent Batching Tema] Error parseando Lote 1:', e1);
        }
      } else if (res1.status === 'rejected') {
        console.warn('[Concurrent Batching Tema] Lote 1 falló:', res1.reason);
      }

      if (res2.status === 'fulfilled' && res2.value.text) {
        try {
          const parsed2 = parseGeminiBatchResponse(res2.value.text);
          candidateCards.push(...parsed2.cards);
          b2Exhausted = parsed2.coreExhausted;
          atLeastOneSuccess = true;
          console.log(`[Concurrent Batching Tema] Lote 2 OK: ${parsed2.cards.length} tarjetas.`);
        } catch (e2) {
          console.warn('[Concurrent Batching Tema] Error parseando Lote 2:', e2);
        }
      } else if (res2.status === 'rejected') {
        console.warn('[Concurrent Batching Tema] Lote 2 falló:', res2.reason);
      }

      if (!atLeastOneSuccess || candidateCards.length === 0) {
        const suggestedCount = targetCount >= 20 ? 10 : 5;
        const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
        return {
          success: false,
          error: `El tema es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
        };
      }

      coreExhausted = b1Exhausted && b2Exhausted;
    } else {
      // Lote individual para targetCount < 20 (ej. 5, 10, 15)
      const requestCount = targetCount;
      const { directive: targetCountDirective, integrityNote } = buildTargetCountDirective(
        requestCount,
        existingCards.length
      );

      const prompt = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
${targetCountDirective}

Cubre los conceptos clave sobre el tema: "${cleanTopic}".

${RIGOR_WARNING_DIRECTIVE}

${getGlobalRules(cardFormat, requestCount, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, false, isPracticalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "inventario_factual" (array de objetos con id, tipo y declaracion_factual como mapa de extracción), "core_exhausted" (booleano) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para asegurar que las tarjetas quepan dentro del límite sin truncarse, formula preguntas, textos, opciones (si aplica) y respuestas directas y concisas.

${languageDirective}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: getGeminiConfig(
          cardFormat,
          requestCount,
          existingCards.length,
          coreExhaustedPrevious,
          existingTopicsList,
          false,
          pedagogicalMode,
          docenteFormat,
          targetAudience,
          isPracticalMode
        ),
      });

      try {
        const parsed = parseGeminiBatchResponse(response.text);
        candidateCards = parsed.cards;
        coreExhausted = parsed.coreExhausted;
      } catch (err: unknown) {
        console.warn('Fallo al parsear JSON de Gemini en generateCardsAction:', err);
        const suggestedCount = targetCount >= 20 ? 10 : 5;
        const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
        return {
          success: false,
          error: `El tema es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
        };
      }
    }

    const isDocenteMode =
      pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

    if (isDocenteMode && candidateCards.length > 0) {
      for (const card of candidateCards) {
        if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
          card.front = (card.question || '').trim();
        }
        if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
          card.question = card.front;
        }
        normalizeDocenteCandidateCard(card);
      }
    }

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: candidateCards,
      existingCards,
      apiKey,
      similarityThreshold: 0.88,
      targetCount,
    });

    if (duplicateCount > 0) {
      console.log(
        `[Tema] 🛡️ Barrera Determinista activada: Se eliminaron ${duplicateCount} tarjetas duplicadas de la tirada.`
      );
    }

    const processedCards = processGeneratedCards(
      uniqueCards,
      targetCount,
      cardFormat,
      isDocenteMode,
      isDocenteMode
    );

    // Si tras purgar duplicados no se alcanzó la cuota solicitada, la materia troncal está agotándose
    if (processedCards.length < targetCount) {
      coreExhausted = true;
    }

    // Registrar uso en api_limits tras generación exitosa (nunca se regalan créditos)
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processedCards,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al conectar con Gemini';
    console.error('Error in generateCardsAction:', err);
    return {
      success: false,
      error: `Error al generar tarjetas con Gemini: ${message}`,
    };
  }
}

/**
 * Saneamiento de Ruta (Path Parsing):
 * Extrae exclusivamente el path relativo del archivo dentro del bucket de Supabase Storage.
 * Si recibe una URL completa (con 'http' o dominio de Supabase), o prefijos de API/bucket,
 * los corta devolviendo únicamente la ruta interna limpia (ej. '123/file.pdf').
 * También detecta y extrae el nombre del bucket si viene incluido en la URL o ruta.
 */
function sanitizeStoragePath(
  rawPath: string,
  defaultBucket: string = 'user-documents'
): { cleanPath: string; bucket: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { cleanPath: '', bucket: defaultBucket };
  }

  let path = rawPath.trim();

  // 1. Quitar query parameters y fragmentos (# y ?)
  path = path.split('?')[0].split('#')[0];

  // 2. Si contiene protocolo http:// o https://, extraer el pathname
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = url.pathname;
    } catch {
      path = path.replace(/^https?:\/\/[^\/]+/i, '');
    }
  }

  let bucket = defaultBucket;

  // 3. Detectar rutas estándar de Supabase Storage:
  // ej. /storage/v1/object/public/mis-documentos/123/file.pdf -> bucket: mis-documentos, path: 123/file.pdf
  // ej. /storage/v1/object/sign/user-documents/123/file.pdf -> bucket: user-documents, path: 123/file.pdf
  // ej. /storage/v1/object/authenticated/user-documents/123/file.pdf -> bucket: user-documents, path: 123/file.pdf
  // ej. /storage/v1/object/user-documents/123/file.pdf -> bucket: user-documents, path: 123/file.pdf
  // ej. /storage/v1/render/image/public/user-documents/123/file.pdf -> bucket: user-documents, path: 123/file.pdf
  const supabaseStorageRegex =
    /(?:^|\/)storage\/v1\/(?:object|render\/image)\/(?:public\/|sign\/|authenticated\/)?([^\/]+)\/(.+)$/i;
  const match = path.match(supabaseStorageRegex);

  if (match) {
    bucket = match[1] || defaultBucket;
    path = match[2];
  } else {
    // Si no contiene el prefijo de API pero incluye diagonales al inicio
    path = path.replace(/^\/+/, '');

    // Si comienza con el nombre del bucket por defecto
    if (path.startsWith(`${defaultBucket}/`)) {
      path = path.slice(defaultBucket.length + 1);
    } else {
      const commonBuckets = ['user-documents', 'mis-documentos', 'documents', 'files'];
      for (const b of commonBuckets) {
        if (path.startsWith(`${b}/`)) {
          bucket = b;
          path = path.slice(b.length + 1);
          break;
        }
      }
    }
  }

  // 4. Limpiar diagonales residuales al inicio y final
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');

  // 5. Decodificar posibles caracteres de URL (%20, etc.)
  try {
    path = decodeURIComponent(path);
  } catch {
    // Conservar la ruta saneada si la decodificación falla
  }

  return { cleanPath: path, bucket };
}

/**
 * Server Action Multimodal:
 * Recibe un archivo alojado en Supabase Storage (PDF, MP4, MP3 o TXT),
 * lo descarga y lo envía a Gemini 3.8 Flash como inlineData para extraer y
 * estructurar los conceptos clave en un conjunto de flashcards según el formato y cantidad elegidos.
 */
export async function generateCardsFromDocumentAction(
  input: MultimodalDocumentInput
): Promise<GenerateCardsResult> {
  const {
    deckId,
    storagePath,
    signedUrl,
    mimeType,
    fileName,
    customPrompt,
    focusInstruction: rawFocus,
    cardFormat = 'multiple_choice',
    cardCount = 10,
    existingQuestions,
    language = 'es',
    coreExhaustedPrevious = false,
    isExhaustiveMode = false,
    isPracticalMode = false,
    pedagogicalMode = 'academic',
    docenteFormat = 'mixed_test',
    targetAudience = 'auto',
  } = input;

  if (!storagePath && !signedUrl) {
    return { success: false, error: 'Ruta de archivo de Supabase Storage no proporcionada.' };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        'Clave GEMINI_API_KEY no configurada. Por favor define GEMINI_API_KEY en tu archivo .env.local para usar la generación multimodal.',
    };
  }

  // 0. Protección estricta de Cuotas API / Bypass VIP (sin bypass si no hay usuario resoluble)
  const resolvedUserId = await resolveUserId(input.deckId, input.userId);
  if (!resolvedUserId) {
    console.warn('No se pudo resolver user_id para control de cuota en documento. Bloqueo de seguridad activado.');
    return { success: false, error: 'LIMIT_REACHED' };
  }

  const checkResult = await enforceApiLimit(resolvedUserId);
  if ('error' in checkResult) {
    return { success: false, error: checkResult.error };
  }
  const apiCheck = checkResult.check;

  // Límite seguro: hasta 40 tarjetas en Modo Didáctico y 30 en Modo Estudio
  const maxAllowed =
    pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente'
      ? 40
      : 30;
  const targetCount = Math.max(1, Math.min(maxAllowed, cardCount || 10));

  try {
    let fileArrayBuffer: ArrayBuffer;

    // 1. Bypass de Autenticación (Service Role Key):
    // Para tareas de servidor de larga duración como la extracción de páginas, se instancia
    // un cliente de administrador usando process.env.SUPABASE_SERVICE_ROLE_KEY.
    // Esto garantiza que la descarga jamás arroje un error de permisos o caducidad de sesión.
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      'https://placeholder.supabase.co';
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!serviceRoleKey) {
      console.warn(
        '[generateCardsFromDocumentAction] Advertencia: SUPABASE_SERVICE_ROLE_KEY no está configurada. Usando cliente por defecto (riesgo de caducidad de sesión en tareas largas).'
      );
    }

    const storageAdminClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabase;

    // Saneamiento de Ruta (Path Parsing): Antes de llamar a download(), extraer exclusivamente
    // el path relativo limpio del archivo. Si la variable contiene 'http' o la URL de Supabase,
    // se corta (ej. https://.../storage/v1/object/public/mis-documentos/123/file.pdf -> 123/file.pdf).
    const rawTarget = storagePath || signedUrl || '';
    const { cleanPath: initialCleanPath, bucket: targetBucket } = sanitizeStoragePath(rawTarget, 'user-documents');
    let cleanPath = initialCleanPath;

    if (cleanPath) {
      // Blindaje de la ruta antes de la descarga:
      // Remueve query strings, barras iniciales redundantes y decodifica caracteres URI
      cleanPath = cleanPath.split('?')[0].replace(/^\/+/, '');
      try {
        cleanPath = decodeURIComponent(cleanPath);
      } catch {
        // Preserva cleanPath si ocurre un error en la decodificación
      }

      console.log('[generateCardsFromDocumentAction] Descargando desde bucket:', targetBucket, 'path:', cleanPath);
      const { data, error } = await storageAdminClient.storage
        .from(targetBucket)
        .download(cleanPath);

      if (error || !data) {
        console.warn(
          `[generateCardsFromDocumentAction] Falló descarga nativa de cleanPath (${cleanPath}) en bucket '${targetBucket}':`,
          error?.message
        );
        if (signedUrl) {
          console.log(`[generateCardsFromDocumentAction] Fallback a signedUrl...`);
          const response = await fetch(signedUrl);
          if (!response.ok) {
            throw new Error(
              `Error HTTP al descargar de Supabase Storage: ${response.statusText} (${response.status})`
            );
          }
          fileArrayBuffer = await response.arrayBuffer();
        } else {
          throw error || new Error(`No se pudo descargar el archivo desde el bucket '${targetBucket}' (${cleanPath}).`);
        }
      } else {
        // data es un Blob descargado nativamente de Supabase Storage
        fileArrayBuffer = await data.arrayBuffer();
      }
    } else if (signedUrl) {
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(
          `Error HTTP al descargar de Supabase Storage: ${response.statusText} (${response.status})`
        );
      }
      fileArrayBuffer = await response.arrayBuffer();
    } else {
      throw new Error('Ruta de archivo de Supabase Storage no proporcionada o no válida tras el saneamiento.');
    }

    // 2. Normalizar tipo MIME soportado
    let normalizedMime = mimeType;
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') normalizedMime = 'application/pdf';
      else if (ext === 'docx') normalizedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'doc') normalizedMime = 'application/msword';
      else if (ext === 'mp3') normalizedMime = 'audio/mpeg';
      else if (ext === 'wav') normalizedMime = 'audio/wav';
      else if (ext === 'm4a') normalizedMime = 'audio/mp4';
      else if (ext === 'mp4') normalizedMime = 'video/mp4';
      else if (ext === 'mov') normalizedMime = 'video/quicktime';
      else if (ext === 'webm') normalizedMime = 'video/webm';
      else if (ext === 'txt') normalizedMime = 'text/plain';
    }

    // Gatekeeper PRO: Validación estricta de suscripción para archivos de Audio y Vídeo
    const isAudioOrVideo =
      normalizedMime?.startsWith('audio/') ||
      normalizedMime?.startsWith('video/') ||
      normalizedMime === 'audio/mpeg' ||
      normalizedMime === 'audio/wav' ||
      Boolean(fileName && /\.(mp3|wav|ogg|m4a|aac|flac|mp4|mov|webm)$/i.test(fileName));

    if (isAudioOrVideo && apiCheck.tier !== 'pro' && apiCheck.tier !== 'vip') {
      return {
        success: false,
        error:
          'El procesamiento de archivos de Audio y Vídeo es exclusivo para miembros PRO. Por favor actualiza tu suscripción en Flashmente PRO para desbloquear esta funcionalidad.',
      };
    }

    // Identificar si es un documento de Word (.docx o .doc)
    const isWordDocument =
      normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalizedMime === 'application/msword' ||
      Boolean(fileName && /\.(docx|doc)$/i.test(fileName));

    let wordPages: VirtualDocxPage[] = [];
    let extractedWordText = '';
    if (isWordDocument) {
      try {
        const fileBuffer = Buffer.from(fileArrayBuffer);
        wordPages = await parseDocxIntoVirtualPages(fileBuffer);
        extractedWordText = wordPages.map((p) => p.text).join('\n\n');
      } catch (docxErr) {
        console.warn('Advertencia al parsear documento Word con imágenes:', docxErr);
      }

      if (!wordPages || wordPages.length === 0) {
        return {
          success: false,
          error: `No se pudo extraer texto legible del documento de Word "${fileName || 'documento'}". Asegúrate de que contenga texto y no esté protegido por contraseña.`,
        };
      }
    }

    // Identificar si es un documento PDF
    const isPdfDocument =
      normalizedMime === 'application/pdf' ||
      Boolean(fileName && /\.pdf$/i.test(fileName));

    // 3. Procesar instrucción de enfoque y aislar rango de páginas para PDFs (Aislamiento Multimodal con pdf-lib)
    const focusInstruction = (rawFocus || customPrompt || '').trim();
    const parsedRange = parsePageRange(
      input.pageRange,
      input.pageStart,
      input.pageEnd,
      focusInstruction
    );

    // FASE 1: MOTOR DE EXTRACCIÓN SECUENCIAL PÁGINA POR PÁGINA (BUCLE ACUMULADOR)
    const fileBuffer = isPdfDocument ? Buffer.from(fileArrayBuffer) : null;
    const ai = new GoogleGenAI({ apiKey });

    if (isPdfDocument && fileBuffer) {
      const srcDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      const totalPages = srcDoc.getPageCount();

      if (totalPages === 0) {
        throw new Error('El PDF no contiene páginas válidas.');
      }

      // 1. Determinar página de inicio (cursorPage) y límite final (finalPage)
      const startPage = Math.max(
        1,
        Math.min(
          input.cursorPage ?? input.pageStart ?? parsedRange.startPage ?? 1,
          totalPages
        )
      );

      const finalPage = Math.min(
        input.pageEnd ?? parsedRange.endPage ?? totalPages,
        totalPages
      );

      if (startPage > finalPage) {
        return {
          success: false,
          error: `La página de inicio (${startPage}) supera la página final delimitada (${finalPage}).`,
        };
      }

      // 2. Historial de tarjetas existentes en este mazo para el Gatekeeper y Memoria de Página
      const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);

      const isFocusActive = Boolean(focusInstruction && focusInstruction.trim().length > 0);
      const isTableFocus = isFocusActive && /\b(tabla|cuadro|\d)\b/i.test(focusInstruction);

      // 3. Directiva de Extracción: 'Modo Exhaustivo Forzado' vs 'Libertad Universal Estándar'
      // Si Enfoque Temático está activo, se desconectan las directivas restrictivas de tablas
      const tablesDirective = isFocusActive ? '' : (isExhaustiveMode ? EXHAUSTIVE_TABLES_DIRECTIVE : NORMAL_TABLES_DIRECTIVE);

      const singleCoreConceptDirective = isExhaustiveMode
        ? `### REGLA DE COBERTURA MULTIDIMENSIONAL SIN CLONES (MODO EXHAUSTIVO):
En Modo Exhaustivo está expresamente PERMITIDO Y EXIGIDO formular tarjetas independientes para evaluar las distintas dimensiones o facetas de una misma entidad, concepto o proceso sustancial (por ejemplo: 1 tarjeta para su definición/sinónimo técnico, 1 para su origen/fuentes/requisitos, 1 para su función/mecanismo basal y 1 para su patología/consecuencia/límite).
Lo que queda TERMINANTEMENTE PROHIBIDO es generar clones redundantes que pregunten exactamente el mismo dato fáctico con la misma respuesta nuclear reformulada.`
        : SINGLE_CORE_CONCEPT_DIRECTIVE;

      const sweepDirective = isExhaustiveMode ? EXHAUSTIVE_SWEEP_DIRECTIVE : COMPREHENSIVE_SWEEP_DIRECTIVE;

      const universalDirective = isExhaustiveMode
        ? `DIRECTIVA BASE UNIVERSAL DE EXTRACCIÓN TRONCAL RIGUROSA:
Tu objetivo es diseccionar la página actual y extraer con rigor e intensidad TODOS sus conceptos clave, principios rectores, mecanismos de causa-efecto, definiciones sustanciales y clasificaciones vertebrales, con total independencia de la temática o disciplina del documento.
- Extrae con rigor e intensidad cada concepto sustancial, mecanismo, definición, dato cuantitativo y clasificación del texto principal y sus tablas complementarias.
- Queda ESTRICTAMENTE PROHIBIDO inventar información o formular preguntas triviales de relleno. Si la página contiene poco contenido evaluable (ej. una portada, un índice o imágenes decorativas), devuelve únicamente las preguntas válidas respaldadas por el texto, o un array vacío []. Sé implacable donde haya conocimiento sustancial, y sobrio donde no lo haya.

${sweepDirective}

${singleCoreConceptDirective}

${CONTENT_HIERARCHY_DIRECTIVE}
${tablesDirective ? `\n${tablesDirective}\n` : ''}
${STRICT_GROUNDING_DIRECTIVE}

${EDITORIAL_ARTIFACTS_DIRECTIVE}`
        : `DIRECTIVA BASE UNIVERSAL DE EXTRACCIÓN TRONCAL RIGUROSA:
Tu objetivo es diseccionar la página actual y extraer con rigor e intensidad TODOS sus conceptos clave, principios rectores, mecanismos de causa-efecto, definiciones sustanciales y clasificaciones vertebrales, con total independencia de la temática o disciplina del documento.
- Modula la densidad adaptativa de forma pura según la riqueza intrínseca del texto, sin forzar cuotas ni topes numéricos arbitrarios.
- Queda ESTRICTAMENTE PROHIBIDO inventar información o formular preguntas triviales de relleno. Si la página contiene poco contenido evaluable (ej. una portada, un índice o imágenes decorativas), devuelve únicamente las preguntas válidas respaldadas por el texto, o un array vacío []. Sé implacable donde haya conocimiento sustancial, y sobrio donde no lo haya.

${COMPREHENSIVE_SWEEP_DIRECTIVE}

${singleCoreConceptDirective}

${CONTENT_HIERARCHY_DIRECTIVE}
${tablesDirective ? `\n${tablesDirective}\n` : ''}
${STRICT_GROUNDING_DIRECTIVE}

${EDITORIAL_ARTIFACTS_DIRECTIVE}`;

      const exhaustiveDirective = isExhaustiveMode
        ? `\n\n${EXHAUSTIVE_MODE_MANDATE}\n\n`
        : '';

      const isDocenteMode = pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

      console.log('[DEBUG GENERATION]', {
        pedagogicalMode,
        isDocenteMode,
        isExhaustiveMode,
        startPage,
        finalPage,
        targetCount,
      });

      let singlePageSystemPrompt = '';

      if (isFocusActive) {
        singlePageSystemPrompt += `🚨 MODO ENFOQUE TEMÁTICO - VERSO LIBRE:
El usuario ha solicitado centrarse específicamente en: "${focusInstruction}".
Tu ÚNICA prioridad es exprimir al máximo todo lo relacionado con este tema en la página actual.
Ignora cualquier restricción general sobre tablas o resúmenes de capítulo si guardan relación con este tema.
Genera de 15 a 25 preguntas si la página contiene datos sustanciales sobre este tema.
PAUTA UNIVERSAL CUANDO EL FOCO SEA UNA TABLA O CUADRO:
Prioriza preguntas sobre:
1) Comparaciones de variación según condición o estado.
2) Extremos superiores e inferiores de cada categoría.
3) Criterios generales y notas al pie.
4) Elementos representativos de cada columna.\n\n`;
      }

      if (isDocenteMode) {
        singlePageSystemPrompt += `${buildDidacticModeDirective(docenteFormat, targetAudience)}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `${PRACTICAL_MODE_DIRECTIVE}\n\n`;
        }
        singlePageSystemPrompt += `${universalDirective}\n\n`;
        if (isExhaustiveMode) {
          singlePageSystemPrompt += `${buildUniversalCalibrationDirective(true)}\n\n`;
        }
        singlePageSystemPrompt += `${EXCLUSION_ANALOGIES_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${NO_EDITORIAL_REFERENCES_DIRECTIVE}\n\n`;
        if (isExhaustiveMode) {
          singlePageSystemPrompt += `${exhaustiveDirective}\n\n`;
        }
        singlePageSystemPrompt += `${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${ZERO_MISMATCH_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${getDidacticFormatSection(docenteFormat)}\n`;
        singlePageSystemPrompt += `\nRECORDATORIO MODO DOCENTE / DIDÁCTICO: Realiza un barrido homogéneo por todo el texto, transformando el contenido en ejercicios y problemas prácticos de examen para alumnos, omitiendo metadatos de aula (ejercicios, bloques, unidades) y omitiendo preguntas sobre transcripciones fonéticas.`;
      } else {
        singlePageSystemPrompt += `${TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `${PRACTICAL_MODE_DIRECTIVE}\n\n`;
        }
        singlePageSystemPrompt += `${buildUniversalCalibrationDirective(isExhaustiveMode)}\n\n`;
        singlePageSystemPrompt += `${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${ZERO_MISMATCH_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${EXCLUSION_ANALOGIES_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${NO_EDITORIAL_REFERENCES_DIRECTIVE}\n\n`;
        if (!isFocusActive) {
          singlePageSystemPrompt += `${CHAPTER_SUMMARY_PAGES_DIRECTIVE}\n\n`;
        }
        // universalDirective es la base obligatoria de calidad, rigor y sin artefactos
        singlePageSystemPrompt += `${universalDirective}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `🎯 DIRECTIVA DE BARRIDO PRÁCTICO Y SITUACIONAL:
Transforma el 100% de los hechos del inventario_factual (1 hecho clave = 1 mini-caso aplicado) sin omitir definiciones base, planteando situaciones reales breves de toma de decisiones o aplicación donde dicho concepto, mecanismo u origen sea indispensable para resolver el caso.\n\n`;
        }
        singlePageSystemPrompt += `${getFormatRule(cardFormat)}`;
        singlePageSystemPrompt += `\n${getFormatInstructions(cardFormat)}`;
        singlePageSystemPrompt += `\n\nREGLA DE INTEGRIDAD ESTRUCTURAL CON INVENTARIO FACTUAL:
Devuelve un objeto JSON estructurado con:
- "inventario_factual": array obligatorio de objetos [{ "id": "H1", "tipo": "1_identidad_definicion"|"2_funcion_mecanismo"|"3_origen_fuente_requisitos"|"4_consecuencia_falla_limite"|"5_detalle_tabla_nota", "declaracion_factual": "..." }] con el desglose exhaustivo de TODOS los hechos atómicos, definiciones y relaciones de la página antes de generar las tarjetas.
- "core_exhausted": booleano que indica si la página ha sido vaciada conceptualmente.
- "cards": array dinámico con las tarjetas de estudio generadas evaluando directa y rigurosamente los hechos del inventario_factual (numeradas estrictamente con generation_index del 1 al N, formuladas según el formato "${cardFormat}").`;
      }

      singlePageSystemPrompt += buildLanguageDirective(language);

      let tarjetasAcumuladas: GeneratedCard[] = [];
      const accumulatedHistory: ExistingCardHistoryItem[] = [...existingCards];
      let lastProcessedPage = startPage;

      if (isDocenteMode) {
        // 4A. MOTOR DE CHUNKING Y BATCHING MATEMÁTICO (EXCLUSIVO MODO DOCENTE / EVALUACIÓN BLOOM):
        // Divide el rango de páginas en bloques proporcionales y asigna una cuota matemática a cada bloque
        // para evitar la "Saturación de Contexto" y garantizar que el 100% de las páginas aporten al examen.
        const chunks = partitionPagesIntoChunks(startPage, finalPage, targetCount);
        let deficitCarryOver = 0;
        lastProcessedPage = finalPage;

        console.log(
          `[Motor Chunking PDF - Modo Docente] Dividiendo rango págs ${startPage}-${finalPage} en ${chunks.length} bloques. Meta total: ${targetCount} tarjetas.`
        );

        for (const chunk of chunks) {
          lastProcessedPage = chunk.endPage;
          const currentChunkQuota = Math.max(1, chunk.quota + deficitCarryOver);
          const requestChunkQuota = currentChunkQuota + 2;
          deficitCarryOver = 0;

          console.log(
            `[Motor Chunking PDF - Modo Docente] Procesando Bloque ${chunk.chunkIndex + 1}/${chunk.totalChunks} (Págs ${chunk.startPage} a ${chunk.endPage}). Cuota asignada: ${currentChunkQuota} tarjetas (solicitando ${requestChunkQuota} con colchón).`
          );

          // Cortar el rango de páginas del bloque
          const chunkBase64 =
            chunk.startPage === chunk.endPage
              ? await sliceSinglePdfPage(srcDoc, chunk.startPage)
              : await slicePdfPageRange(srcDoc, chunk.startPage, chunk.endPage);

          // Extraer lista de tópicos ya cubiertos
          const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
          const historyDirective = coveredTopics
            ? `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O BLOQUES PREVIOS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de este bloque que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.`
            : '';

          const exhaustiveDocenteFocus = isExhaustiveMode
            ? `\n- PROFUNDIDAD EXHAUSTIVA DOCENTE: Dentro de la cuota asignada de ${requestChunkQuota} preguntas, prioriza formular preguntas que evalúen excepciones a reglas generales, contrastes conceptuales sutiles y cruces relacionales de tablas o matrices según EXHAUSTIVE_TABLES_DIRECTIVE a lo largo de todas las páginas del bloque (${chunk.startPage} a ${chunk.endPage}).`
            : '';

          const chunkQuotaMandate = `\n\n🚨 DIRECTIVA DE CUOTA MATEMÁTICA DEL BLOQUE (EXACTAMENTE ${requestChunkQuota} PREGUNTAS):
- Tu objetivo OBLIGATORIO para este bloque (páginas ${chunk.startPage} a ${chunk.endPage}) es generar exactamente ${requestChunkQuota} preguntas.
- Realiza un barrido homogéneo cubriendo todas las páginas de este bloque (${chunk.startPage} a ${chunk.endPage}) para que este segmento aporte equitativamente al examen global sin saturar el inicio del documento.${exhaustiveDocenteFocus}`;

          const currentChunkSystemPrompt = `${singlePageSystemPrompt}${historyDirective}${chunkQuotaMandate}`;

          const pageLabel =
            chunk.startPage === chunk.endPage
              ? `Página ${chunk.startPage}`
              : `Páginas ${chunk.startPage} a ${chunk.endPage}`;

          const chunkUserPrompt = isExhaustiveMode
            ? `Analiza el bloque (${pageLabel}) del documento aplicando la DIRECTIVA DE COBERTURA Y CALIDAD (cuota asignada: exactamente ${requestChunkQuota} tarjetas). Desglosa en "inventario_factual" los hechos del bloque y genera las preguntas en "cards". Aplica la DIRECTIVA DE MODO DOCENTE / DIDÁCTICO para crear ejercicios prácticos de evaluación sin metadatos de aula. Evalúa excepciones, contrastes conceptuales y análisis relacional de tablas según EXHAUSTIVE_TABLES_DIRECTIVE a lo largo del bloque. Formato: "${docenteFormat}".`
            : `Analiza el bloque (${pageLabel}) del documento adjunto desglosando en "inventario_factual" y extrayendo exactamente ${requestChunkQuota} preguntas en "cards" con formato de evaluación docente "${docenteFormat}". Aplica el Modo Docente / Didáctico: preguntas prácticas de examen sin metadatos de aula. Asegúrate de cubrir equilibradamente el contenido de todas las páginas del bloque.`;

          let chunkCandidateCards: GeneratedCard[] = [];

          try {
            const chunkResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: [
                {
                  inlineData: {
                    data: chunkBase64,
                    mimeType: 'application/pdf',
                  },
                },
                {
                  text: chunkUserPrompt,
                },
              ],
              config: {
                systemInstruction: currentChunkSystemPrompt,
                temperature: isExhaustiveMode ? 0.1 : 0.15,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (chunkResponse.text) {
              try {
                const parsed = parseGeminiBatchResponse(chunkResponse.text);
                chunkCandidateCards = parsed.cards || [];
                console.log(
                  `[Motor Chunking PDF - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Gemini devolvió ${chunkCandidateCards.length} tarjetas brutas.`
                );
              } catch (parseErr) {
                console.warn(
                  `[Motor Chunking PDF - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Error parseando respuesta de Gemini:`,
                  parseErr
                );
              }
            }
          } catch (geminiErr) {
            console.warn(
              `[Motor Chunking PDF - Modo Docente] Error en llamada a Gemini para Bloque ${chunk.chunkIndex + 1}:`,
              geminiErr
            );
          }

          if (chunkCandidateCards.length > 0) {
            for (const card of chunkCandidateCards) {
              if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
                card.front = (card.question || '').trim();
              }
              if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
                card.question = card.front;
              }
              normalizeDocenteCandidateCard(card);
            }
            chunkCandidateCards = chunkCandidateCards.filter(
              (card) =>
                !isDisallowedCardContent(card, true) &&
                Boolean(card.front && card.front.trim() && !FORMAT_LABEL_REGEX.test(card.front.trim()))
            );
          }

          // Acumulación y Deduplicación rápida del bloque (con gatekeeper vectorial)
          if (chunkCandidateCards.length > 0) {
            const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
              candidateCards: chunkCandidateCards,
              existingCards: accumulatedHistory,
              apiKey,
              similarityThreshold: isExhaustiveMode ? 0.94 : 0.88,
              isExhaustiveMode,
            });

            if (duplicateCount > 0) {
              console.log(
                `[Motor Chunking PDF - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Se filtraron ${duplicateCount} duplicados.`
              );
            }

            if (uniqueCards.length > 0) {
              tarjetasAcumuladas.push(...uniqueCards);
              for (const uc of uniqueCards) {
                accumulatedHistory.push({ front: uc.front, back: uc.back });
              }
              console.log(
                `[Motor Chunking PDF - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Acumuladas ${uniqueCards.length} tarjetas. Total: ${tarjetasAcumuladas.length}/${targetCount}.`
              );
            }

            if (uniqueCards.length < currentChunkQuota) {
              deficitCarryOver = currentChunkQuota - uniqueCards.length;
            }
          } else {
            deficitCarryOver = currentChunkQuota;
          }
        }

        // Pase de rescate (Top-Up) de 1 iteración si tras todos los bloques aún faltan preguntas para alcanzar targetCount
        if (tarjetasAcumuladas.length < targetCount) {
          const missing = targetCount - tarjetasAcumuladas.length + 2;
          console.log(
            `[Motor Chunking PDF - Modo Docente] Pase Top-Up activado: faltan ${targetCount - tarjetasAcumuladas.length} tarjetas (solicitando ${missing} adicionales sobre págs ${startPage}-${finalPage}).`
          );

          try {
            const rescueBase64 =
              startPage === finalPage
                ? await sliceSinglePdfPage(srcDoc, startPage)
                : await slicePdfPageRange(srcDoc, startPage, finalPage);
            const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
            const rescueHistoryDirective = coveredTopics
              ? `\n\nPREGUNTAS Y CONCEPTOS YA INCLUIDOS EN EL EXAMEN (NO REPETIR): ${coveredTopics}.\nDEBES extraer exactamente ${missing} preguntas NUEVAS sobre otros hechos, detalles, relaciones o casos prácticos del documento que aún no hayan sido evaluados.`
              : '';
            const rescueQuotaMandate = `\n\n🚨 DIRECTIVA DE RESCATE DE CUOTA DOCENTE (EXACTAMENTE ${missing} PREGUNTAS NUEVAS):
- Tu objetivo OBLIGATORIO es generar exactamente ${missing} preguntas adicionales válidas para completar la cuota cerrada del examen docente (${targetCount} preguntas).`;

            const rescueUserPrompt = `Analiza el rango completo (Páginas ${startPage} a ${finalPage}) del documento adjunto y genera exactamente ${missing} preguntas adicionales en "cards" con formato de evaluación docente "${docenteFormat}" que no repitan las preguntas ya formuladas. Aplica el Modo Docente / Didáctico sin metadatos de aula.`;

            const rescueResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: [
                {
                  inlineData: {
                    data: rescueBase64,
                    mimeType: 'application/pdf',
                  },
                },
                {
                  text: rescueUserPrompt,
                },
              ],
              config: {
                systemInstruction: `${singlePageSystemPrompt}${rescueHistoryDirective}${rescueQuotaMandate}`,
                temperature: 0.2,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (rescueResponse.text) {
              const parsedRescue = parseGeminiBatchResponse(rescueResponse.text);
              let rescueCandidates = parsedRescue.cards || [];
              for (const card of rescueCandidates) {
                if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
                  card.front = (card.question || '').trim();
                }
                if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
                  card.question = card.front;
                }
                normalizeDocenteCandidateCard(card);
              }
              rescueCandidates = rescueCandidates.filter(
                (card) =>
                  !isDisallowedCardContent(card, true) &&
                  Boolean(card.front && card.front.trim() && !FORMAT_LABEL_REGEX.test(card.front.trim()))
              );

              if (rescueCandidates.length > 0) {
                const { uniqueCards: rescueUnique } = await deduplicateCandidateCards({
                  candidateCards: rescueCandidates,
                  existingCards: accumulatedHistory,
                  apiKey,
                  similarityThreshold: isExhaustiveMode ? 0.94 : 0.88,
                  isExhaustiveMode,
                });
                if (rescueUnique.length > 0) {
                  tarjetasAcumuladas.push(...rescueUnique);
                  for (const uc of rescueUnique) {
                    accumulatedHistory.push({ front: uc.front, back: uc.back });
                  }
                  console.log(
                    `[Motor Chunking PDF - Modo Docente] Pase Top-Up sumó ${rescueUnique.length} tarjetas. Total final: ${tarjetasAcumuladas.length}/${targetCount}.`
                  );
                }
              }
            }
          } catch (rescueErr) {
            console.warn('[Motor Chunking PDF - Modo Docente] Advertencia en pase Top-Up:', rescueErr);
          }
        }

        tarjetasAcumuladas = tarjetasAcumuladas.slice(0, targetCount);
      } else {
        // 4B. MOTOR ORIGINAL MODO ESTUDIO (RECUPERADO DE COMMIT 57e614e):
        // Bucle Secuencial Página a Página con Marcapáginas y Modo Minucioso/Exhaustivo.
        // while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage)
        let currentPage = startPage;
        lastProcessedPage = currentPage;

        console.log(
          `[Bucle Acumulador Backend - Modo Estudio] Iniciando: Desde pág. ${startPage} hasta pág. ${finalPage}. Meta: ${targetCount} tarjetas.`
        );

        while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage) {
          lastProcessedPage = currentPage;
          const remainingToTarget = targetCount - tarjetasAcumuladas.length;

          console.log(
            `[Bucle Acumulador Backend - Modo Estudio] Procesando Página ${currentPage} de ${finalPage}... (Acumuladas: ${tarjetasAcumuladas.length}/${targetCount}, Restan: ${remainingToTarget})`
          );

          // Cortar EXACTAMENTE 1 PÁGINA
          const singlePageBase64 = await sliceSinglePdfPage(srcDoc, currentPage);

          // Extraer lista de tópicos ya cubiertos (BD + páginas previas del lote) para evitar repeticiones a ciegas
          const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
          const historyDirective = coveredTopics
            ? isExhaustiveMode
              ? `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de esta página que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.
NOTA MODO EXHAUSTIVO: Aunque una entidad o tema general aparezca en la lista previa, si la página actual aporta NUEVOS datos, mecanismos, cifras, clasificaciones, funciones o filas de tablas sobre ese mismo tema que aún no han sido preguntados literalmente, DEBES generar todas las tarjetas correspondientes a estos nuevos datos.`
              : `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de esta página que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.`
            : '';

          const exhaustiveQuotaMandate = isExhaustiveMode
            ? `\n\n🎯 ENFOQUE EXHAUSTIVO (PRIORIDAD ABSOLUTA AL TEXTO + SUPLEMENTO DE TABLAS Y PIES DE IMAGEN):
- Analiza la página y desglosa en "inventario_factual" absolutamente todas sus definiciones, clasificaciones vertebrales, mecanismos causa-efecto, cifras, porcentajes, cálculos, sinónimos técnicos y datos relevantes de tablas y pies de imagen.
- META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): Tu objetivo es extraer entre 22 y 25 tarjetas sustanciales: vacía primero al 100% todo el TEXTO PRINCIPAL párrafo por párrafo (sin omitir nada de lo que incluye el modo estándar más todos los detalles finos del texto) y, SUMADO A ELLO, sácale punta con sentido práctico y de estudio a todas las tablas/cuadros y pies de imagen o recuadros relevantes de la página. Si la página tiene muy poco contenido real, detente al agotar los hechos legítimos o marca el resto como relevance_tier: 'C_trivial_filler'.
- Genera en "cards" tarjetas de alta precisión evaluando todos los hechos catalogados y respetando las exclusiones de páginas de ejercicios/repaso.`
            : `\n\n🎯 ENFOQUE TRONCAL EQUILIBRADO (MODO NORMAL: 8 A 12 TARJETAS):
- Analiza la página y desglosa en "inventario_factual" sus conceptos vertebrales, definiciones, funciones y mecanismos clave del texto principal.
- META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): Tu objetivo es extraer entre 8 y 12 tarjetas sustanciales cubriendo exhaustivamente todo el texto principal y sus conceptos clave sin omitir nada importante, pero evitando duplicar hechos entre texto y cuadros resumen y sin despiezar subfilas secundarias de tablas. Si la página tiene poco texto real, detente al agotar los hechos legítimos o marca el resto como relevance_tier: 'C_trivial_filler'.
- Genera en "cards" tarjetas de alta precisión evaluando los hechos troncales catalogados, de forma proporcional al contenido real de la página y respetando estrictamente las exclusiones.`;

          const currentPageSystemPrompt = `${singlePageSystemPrompt}${historyDirective}${exhaustiveQuotaMandate}`;

          const practicalInstruction = isPracticalMode
            ? `ENFOQUE OBLIGATORIO: MODO PRÁCTICO Y SITUACIONAL (PROBLEM-BASED LEARNING).
Transforma cada concepto o hecho identificado en "inventario_factual" en un supuesto del mundo real, escenario de toma de decisiones o problema aplicado. Queda terminantemente PROHIBIDO formular preguntas teóricas directas o definiciones de manual, y queda prohibido omitir conceptos sustanciales del inventario.`
            : `Extrae todos los conceptos clave, datos precisos, normativas o hechos únicos posibles basándote en el inventario_factual.`;

          const pageClassificationInstruction = isExhaustiveMode
            ? `\nClasifica obligatoriamente la página en "page_classification":
- "standard_content": página con contenido teórico, explicaciones, conceptos, fórmulas, texto continuo estándar O tablas conceptuales/comparativas (clasificaciones, patologías, mecanismos, enzimas, diferencias clave). En estas páginas se extrae con la densidad completa indicada.
- "catalog_table_only": la página contiene de forma casi exclusiva una tabla de catálogo masivo, directorio o baremo numérico de consulta de decenas de elementos sin prosa explicativa. En Modo Exhaustivo, no te limites a 1 o 2 tarjetas: extrae entre 6 y 12 tarjetas sustanciales con sentido práctico y de estudio (comparaciones por condición/grupo, extremos superiores e inferiores más relevantes, patrones generales y notas al pie sustanciales).
- "review_or_case_exercises": la página contiene preguntas de repaso, cuestionarios de autoevaluación, ejercicios finales de capítulo o casos de estudio de discusión del libro. Si es esta sección, devuelve un array vacío [] en "cards" para no duplicar preguntas del libro.`
            : `\nClasifica obligatoriamente la página en "page_classification":
- "standard_content": página con contenido teórico, explicaciones, conceptos, fórmulas, texto continuo estándar O tablas conceptuales/comparativas (clasificaciones, patologías, mecanismos, enzimas, diferencias clave). En estas páginas se extrae con la densidad completa indicada.
- "catalog_table_only": la página contiene de forma casi exclusiva una tabla de catálogo masivo, directorio o baremo numérico de consulta de decenas de elementos sin prosa explicativa. Si es catálogo masivo, extrae como máximo 1 o 2 tarjetas conceptuales sobre el principio organizativo general o los extremos más notables.
- "review_or_case_exercises": la página contiene preguntas de repaso, cuestionarios de autoevaluación, ejercicios finales de capítulo o casos de estudio de discusión del libro. Si es esta sección, devuelve un array vacío [] en "cards" para no duplicar preguntas del libro.`;

          let pageUserPrompt = '';
          if (isFocusActive) {
            pageUserPrompt = `🎯 MODO ENFOQUE TEMÁTICO - VERSO LIBRE ACTIVO: El usuario ha solicitado generar tarjetas específicamente sobre: '${focusInstruction}'. Analiza la Página ${currentPage} del documento adjunto:
1) Si esta página NO contiene información relacionada con '${focusInstruction}', devuelve obligatoriamente 'inventario_factual': [] y 'cards': [].
2) ⚠️ PRECISIÓN DE OBJETIVO EN MODO ENFOQUE: Si el usuario solicita específicamente un 'Cuadro X' o 'Tabla X' (ej. 'Cuadro 4.3' o 'Tabla 4-3'), NO extraigas preguntas de una 'Figura X' o ilustración con el mismo número (ej. 'Figura 4-3') que trate de otro subtema en páginas anteriores: devuelve 'cards': [] hasta llegar a la página donde se encuentra realmente la Tabla/Cuadro solicitado.
3) Si esta página SÍ contiene información o tablas sobre '${focusInstruction}', extrae de forma profunda y exhaustiva entre 15 y 25 preguntas sustanciales exprimiendo al máximo dicho tema. Formato: '${cardFormat}'.`;
          } else if (isExhaustiveMode && !isPracticalMode) {
            pageUserPrompt = `Analiza la Página ${currentPage} del documento adjunto desglosando obligatoriamente en "inventario_factual" entre 15 y 25 hechos atómicos de forma exhaustiva y genera en "cards" 1 tarjeta de estudio independiente por cada hecho catalogado en el inventario (relación 1 a 1 estricta, prohibido agrupar varios hechos en una sola tarjeta).
PRIORIDAD #1 ABSOLUTA (TEXTO PRINCIPAL): Vacía primero cada párrafo del texto (definiciones, sinónimos o denominaciones alternativas, composiciones, partes, mecanismos, lugares de acción, cifras, porcentajes, rangos y cálculos) sin omitir nada de lo que incluye el modo estándar.
PRIORIDAD #2 (SUPLEMENTO EXHAUSTIVO EN TABLAS Y PIES DE IMAGEN): Además del texto, desglosa FILA POR FILA todas las tablas y cuadros de la página (extrayendo entre 8 y 16 tarjetas sobre tipos, orígenes/fuentes, funciones, efectos/deficiencias, extremos y comparaciones con sentido práctico y de estudio) y exprime los pies de imagen, diagramas y recuadros con información relevante de examen.
META DE EXTRACCIÓN ('standard_content'): Entre 20 y 25 tarjetas sustanciales por página. ${pageClassificationInstruction} ${practicalInstruction} Formato: "${cardFormat}".`;
          } else if (isExhaustiveMode && isPracticalMode) {
            pageUserPrompt = `Analiza la Página ${currentPage} del documento adjunto desglosando obligatoriamente en "inventario_factual" entre 15 y 25 hechos atómicos de forma exhaustiva y genera en "cards" 1 caso práctico/situacional independiente por cada hecho catalogado en el inventario (relación 1 a 1 estricta).
PRIORIDAD #1 ABSOLUTA (TEXTO PRINCIPAL): Vacía primero cada párrafo del texto transformando cada concepto, mecanismo, cifra, cálculo o regla en un mini-caso aplicado con toma de decisiones.
PRIORIDAD #2 (SUPLEMENTO EXHAUSTIVO EN TABLAS Y PIES DE IMAGEN): Además del texto, desglosa FILA POR FILA todas las tablas y cuadros de la página y exprime los pies de imagen y recuadros relevantes en forma de casos prácticos de estudio.
META DE EXTRACCIÓN ('standard_content'): Entre 20 y 25 tarjetas sustanciales por página. ${pageClassificationInstruction} ${practicalInstruction} Formato: "${cardFormat}".`;
          } else {
            pageUserPrompt = `Analiza la Página ${currentPage} del documento adjunto desglosando en "inventario_factual" los conceptos troncales, definiciones y relaciones clave del texto principal, y genera en "cards" las tarjetas de estudio correspondientes evaluando los hechos troncales. META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): En páginas de contenido estándar, tu objetivo obligatorio es extraer entre 8 y 12 tarjetas sustanciales cubriendo exhaustivamente todo el texto principal y sus conceptos clave sin dejar lagunas de examen, evitando duplicar hechos entre texto y cuadros resumen y sin despiezar subfilas secundarias de tablas ni recuadros periféricos. Si la página tiene muy poco texto real y solo da para menos tarjetas legítimas, detente al agotar los hechos legítimos o márcalo como relevance_tier: 'C_trivial_filler'. ${pageClassificationInstruction} ${practicalInstruction} Formato: "${cardFormat}".`;
          }

          let pageCandidateCards: GeneratedCard[] = [];

          try {
            const pageResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: [
                {
                  inlineData: {
                    data: singlePageBase64,
                    mimeType: 'application/pdf',
                  },
                },
                {
                  text: pageUserPrompt,
                },
              ],
              config: {
                systemInstruction: currentPageSystemPrompt,
                temperature: 0.15,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (pageResponse.text) {
              try {
                const parsed = parseGeminiBatchResponse(pageResponse.text);
                let rawCards = parsed.cards || [];

                // Criba programática instantánea de relleno por autoclasificación C_trivial_filler (omitida en Verso Libre)
                if (!isFocusActive) {
                  rawCards = rawCards.filter((card) => {
                    if (card.relevance_tier === 'C_trivial_filler') {
                      console.log(
                        `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Descartada tarjeta por autoclasificación C_trivial_filler: "${card.front || card.question}"`
                      );
                      return false;
                    }
                    return true;
                  });
                }

                // Filtro determinista contra metadatos editoriales de tablas y analogías domésticas
                rawCards = rawCards.filter((card) => {
                  if (isDisallowedCardContent(card, isTableFocus, isFocusActive)) {
                    console.log(
                      `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Descartada tarjeta por metadatos de tabla o analogía doméstica: "${card.front || card.question}"`
                    );
                    return false;
                  }
                  return true;
                });

                // CANDADO PROGRAMÁTICO (Code Gate) según page_classification
                if (parsed.pageClassification === 'review_or_case_exercises') {
                  console.log(
                    `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage} clasificada como "review_or_case_exercises" (acumuladas: ${tarjetasAcumuladas.length}): descartando ${rawCards.length} tarjetas por ser cuestionarios/repaso finales del libro.`
                  );
                  rawCards = [];
                } else if (parsed.pageClassification === 'catalog_table_only') {
                  if (isFocusActive || isExhaustiveMode) {
                    console.log(
                      `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage} clasificada como "catalog_table_only", pero ${isExhaustiveMode ? 'Modo Exhaustivo' : 'Enfoque Temático'} está activo: se conservan el 100% de las tarjetas (${rawCards.length}).`
                    );
                  } else {
                    const maxCatalogCards = 1;
                    if (rawCards.length > maxCatalogCards) {
                      console.log(
                        `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage} clasificada como "catalog_table_only": recortando de ${rawCards.length} a máximo ${maxCatalogCards} tarjeta(s).`
                      );
                      rawCards = rawCards.slice(0, maxCatalogCards);
                    }
                  }
                }

                pageCandidateCards = rawCards;

                console.log(
                  `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Gemini devolvió ${pageCandidateCards.length} tarjetas brutas.`
                );
              } catch (parseErr) {
                console.warn(
                  `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Sin tarjetas válidas o poca información:`,
                  parseErr
                );
              }
            }
          } catch (geminiErr) {
            console.warn(
              `[Bucle Acumulador Backend - Modo Estudio] Error en llamada a Gemini para Página ${currentPage}:`,
              geminiErr
            );
          }

          // Acumulación y Deduplicación rápida (con gatekeeper vectorial habilitado)
          if (pageCandidateCards.length > 0) {
            const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
              candidateCards: pageCandidateCards,
              existingCards: accumulatedHistory,
              apiKey,
              similarityThreshold: isFocusActive ? 0.94 : (isExhaustiveMode ? 0.94 : 0.88),
              isExhaustiveMode,
              isFocusActive,
            });

            if (duplicateCount > 0) {
              console.log(
                `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Gatekeeper léxico filtró ${duplicateCount} duplicados.`
              );
            }

            if (uniqueCards.length > 0) {
              tarjetasAcumuladas.push(...uniqueCards);
              for (const uc of uniqueCards) {
                accumulatedHistory.push({ front: uc.front, back: uc.back });
              }
              console.log(
                `[Bucle Acumulador Backend - Modo Estudio] Página ${currentPage}: Se acumularon ${uniqueCards.length} tarjetas únicas. Total acumulado: ${tarjetasAcumuladas.length}/${targetCount}.`
              );
            }
          }

          // Si alcanzamos o superamos el objetivo, nos detenemos conservando íntegramente todas las tarjetas de la página actual sin truncar
          if (tarjetasAcumuladas.length >= targetCount) {
            console.log(
              `[Bucle Acumulador Backend - Modo Estudio] 🎯 Objetivo alcanzado/superado: ${tarjetasAcumuladas.length} tarjetas en Página ${currentPage}.`
            );
            break;
          }

          currentPage++;
        }
      }

      // Pase único de deduplicación semántica vectorial al finalizar el bucle (si hay historial previo en BD)
      if (!isDocenteMode && tarjetasAcumuladas.length > 0 && existingCards.length > 0) {
        const { uniqueCards: semanticallyUnique } = await deduplicateCandidateCards({
          candidateCards: tarjetasAcumuladas,
          existingCards,
          apiKey,
          similarityThreshold: isFocusActive ? 0.94 : (isExhaustiveMode ? 0.94 : 0.88),
          isExhaustiveMode,
          isFocusActive,
        });
        tarjetasAcumuladas = semanticallyUnique;
      }

      if (tarjetasAcumuladas.length === 0) {
        const hasReachedEnd = lastProcessedPage >= finalPage;
        if (hasReachedEnd && existingCards.length > 0) {
          return {
            success: true,
            cards: [],
            rangeCompleted: true,
            nextCursorPage: undefined,
            startCursorPage: startPage,
            message: `¡Rango completado! Se ha llegado al final de las páginas seleccionadas (pág. ${finalPage}); las últimas páginas corresponden a cuestionarios de repaso o su contenido ya está cubierto en el mazo.`,
          };
        }
        return {
          success: false,
          error: `No se pudieron extraer tarjetas únicas del rango procesado (págs. ${startPage} a ${lastProcessedPage}). Comprueba que las páginas contengan texto con información relevante y no estén ya en el mazo.`,
          nextCursorPage: hasReachedEnd ? undefined : lastProcessedPage + 1,
          startCursorPage: startPage,
        };
      }

      const processedCards = processGeneratedCards(
        tarjetasAcumuladas,
        isDocenteMode ? targetCount : tarjetasAcumuladas.length,
        cardFormat,
        isDocenteMode,
        isDocenteMode
      );

      // Registrar uso en api_limits (1 crédito gastado por tirada exitosa)
      if (apiCheck) {
        await recordApiUsage(apiCheck.userId);
      }

      const hasReachedEnd = lastProcessedPage >= finalPage;
      const isExhausted = hasReachedEnd;

      const nextCursor = hasReachedEnd
        ? undefined
        : lastProcessedPage + 1;

      // Retorno del Cursor (El Marcapáginas):
      // El Server Action debe devolver al cliente la página exacta para la siguiente extracción (nextCursorPage).
      return {
        success: true,
        core_exhausted: isExhausted,
        cards: processedCards,
        nextCursorPage: nextCursor,
        startCursorPage: startPage,
      };
    }

    // FASE 1-DOCX: MOTOR DE EXTRACCIÓN SECUENCIAL PÁGINA VIRTUAL POR PÁGINA VIRTUAL PARA DOCUMENTOS WORD (.docx / .doc)
    if (isWordDocument && wordPages.length > 0) {
      const totalPages = wordPages.length;

      // 1. Determinar página de inicio (cursorPage) y límite final (finalPage)
      const startPage = Math.max(
        1,
        Math.min(
          input.cursorPage ?? input.pageStart ?? parsedRange.startPage ?? 1,
          totalPages
        )
      );

      const finalPage = Math.min(
        input.pageEnd ?? parsedRange.endPage ?? totalPages,
        totalPages
      );

      if (startPage > finalPage) {
        return {
          success: false,
          error: `La página virtual de inicio (${startPage}) supera la página final delimitada (${finalPage}).`,
        };
      }

      // 2. Historial de tarjetas existentes en este mazo para el Gatekeeper y Memoria de Página
      const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);

      const isFocusActive = Boolean(focusInstruction && focusInstruction.trim().length > 0);
      const isTableFocus = isFocusActive && /\b(tabla|cuadro|\d)\b/i.test(focusInstruction);

      // 3. Directiva de Extracción: 'Modo Exhaustivo Forzado' vs 'Libertad Universal Estándar'
      // Si Enfoque Temático está activo, se desconectan las directivas restrictivas de tablas
      const tablesDirective = isFocusActive ? '' : (isExhaustiveMode ? EXHAUSTIVE_TABLES_DIRECTIVE : NORMAL_TABLES_DIRECTIVE);

      const singleCoreConceptDirective = isExhaustiveMode
        ? `### REGLA DE COBERTURA MULTIDIMENSIONAL SIN CLONES (MODO EXHAUSTIVO):
En Modo Exhaustivo está expresamente PERMITIDO Y EXIGIDO formular tarjetas independientes para evaluar las distintas dimensiones o facetas de una misma entidad, concepto o proceso sustancial (por ejemplo: 1 tarjeta para su definición/sinónimo técnico, 1 para su origen/fuentes/requisitos, 1 para su función/mecanismo basal y 1 para su patología/consecuencia/límite).
Lo que queda TERMINANTEMENTE PROHIBIDO es generar clones redundantes que pregunten exactamente el mismo dato fáctico con la misma respuesta nuclear reformulada.`
        : SINGLE_CORE_CONCEPT_DIRECTIVE;

      const sweepDirective = isExhaustiveMode ? EXHAUSTIVE_SWEEP_DIRECTIVE : COMPREHENSIVE_SWEEP_DIRECTIVE;

      const universalDirective = isExhaustiveMode
        ? `DIRECTIVA BASE UNIVERSAL DE EXTRACCIÓN TRONCAL RIGUROSA:
Tu objetivo es diseccionar la página virtual actual y extraer con rigor e intensidad TODOS sus conceptos clave, principios rectores, mecanismos de causa-efecto, definiciones sustanciales y clasificaciones vertebrales, con total independencia de la temática o disciplina del documento.
- Extrae con rigor e intensidad cada concepto sustancial, mecanismo, definición, dato cuantitativo y clasificación del texto principal y sus tablas complementarias.
- Queda ESTRICTAMENTE PROHIBIDO inventar información o formular preguntas triviales de relleno. Si la página virtual contiene poco contenido relevante, devuelve únicamente las preguntas válidas respaldadas por el texto, o un array vacío []. Sé implacable donde haya conocimiento sustancial, y sobrio donde no lo haya.

${sweepDirective}

${singleCoreConceptDirective}

${CONTENT_HIERARCHY_DIRECTIVE}
${tablesDirective ? `\n${tablesDirective}\n` : ''}
${STRICT_GROUNDING_DIRECTIVE}

${EDITORIAL_ARTIFACTS_DIRECTIVE}`
        : `DIRECTIVA BASE UNIVERSAL DE EXTRACCIÓN TRONCAL RIGUROSA:
Tu objetivo es diseccionar la página virtual actual y extraer con rigor e intensidad TODOS sus conceptos clave, principios rectores, mecanismos de causa-efecto, definiciones sustanciales y clasificaciones vertebrales, con total independencia de la temática o disciplina del documento.
- Modula la densidad adaptativa de forma pura según la riqueza intrínseca del texto, sin forzar cuotas ni topes numéricos arbitrarios.
- Queda ESTRICTAMENTE PROHIBIDO inventar información o formular preguntas triviales de relleno. Si la página virtual contiene poco contenido relevante, devuelve únicamente las preguntas válidas respaldadas por el texto, o un array vacío []. Sé implacable donde haya conocimiento sustancial, y sobrio donde no lo haya.

${COMPREHENSIVE_SWEEP_DIRECTIVE}

${singleCoreConceptDirective}

${CONTENT_HIERARCHY_DIRECTIVE}
${tablesDirective ? `\n${tablesDirective}\n` : ''}
${STRICT_GROUNDING_DIRECTIVE}

${EDITORIAL_ARTIFACTS_DIRECTIVE}`;

      const exhaustiveDirective = isExhaustiveMode
        ? `\n\n${EXHAUSTIVE_MODE_MANDATE}\n\n`
        : '';

      const isDocenteMode = pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

      console.log('[DEBUG GENERATION]', {
        pedagogicalMode,
        isDocenteMode,
        isExhaustiveMode,
        startPage,
        finalPage,
        targetCount,
      });

      let singlePageSystemPrompt = '';

      if (isFocusActive) {
        singlePageSystemPrompt += `🚨 MODO ENFOQUE TEMÁTICO - VERSO LIBRE:
El usuario ha solicitado centrarse específicamente en: "${focusInstruction}".
Tu ÚNICA prioridad es exprimir al máximo todo lo relacionado con este tema en la página actual.
Ignora cualquier restricción general sobre tablas o resúmenes de capítulo si guardan relación con este tema.
Genera de 15 a 25 preguntas si la página contiene datos sustanciales sobre este tema.
PAUTA UNIVERSAL CUANDO EL FOCO SEA UNA TABLA O CUADRO:
Prioriza preguntas sobre:
1) Comparaciones de variación según condición o estado.
2) Extremos superiores e inferiores de cada categoría.
3) Criterios generales y notas al pie.
4) Elementos representativos de cada columna.\n\n`;
      }

      if (isDocenteMode) {
        singlePageSystemPrompt += `${buildDidacticModeDirective(docenteFormat, targetAudience)}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `${PRACTICAL_MODE_DIRECTIVE}\n\n`;
        }
        singlePageSystemPrompt += `${universalDirective}\n\n`;
        if (isExhaustiveMode) {
          singlePageSystemPrompt += `${buildUniversalCalibrationDirective(true)}\n\n`;
        }
        singlePageSystemPrompt += `${EXCLUSION_ANALOGIES_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${NO_EDITORIAL_REFERENCES_DIRECTIVE}\n\n`;
        if (isExhaustiveMode) {
          singlePageSystemPrompt += `${exhaustiveDirective}\n\n`;
        }
        singlePageSystemPrompt += `${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${ZERO_MISMATCH_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${getDidacticFormatSection(docenteFormat)}\n`;
        singlePageSystemPrompt += `\nRECORDATORIO MODO DOCENTE / DIDÁCTICO: Realiza un barrido homogéneo por todo el texto, transformando el contenido en ejercicios y problemas prácticos de examen para alumnos, omitiendo metadatos de aula (ejercicios, bloques, unidades) y omitiendo preguntas sobre transcripciones fonéticas.`;
      } else {
        singlePageSystemPrompt += `${TEXT_DENSITY_ADAPTIVE_DISTRACTOR_DIRECTIVE}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `${PRACTICAL_MODE_DIRECTIVE}\n\n`;
        }
        singlePageSystemPrompt += `${buildUniversalCalibrationDirective(isExhaustiveMode)}\n\n`;
        singlePageSystemPrompt += `${DISTRACTOR_VEROSIMILITUDE_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${ZERO_MISMATCH_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${EXCLUSION_ANALOGIES_DIRECTIVE}\n\n`;
        singlePageSystemPrompt += `${NO_EDITORIAL_REFERENCES_DIRECTIVE}\n\n`;
        if (!isFocusActive) {
          singlePageSystemPrompt += `${CHAPTER_SUMMARY_PAGES_DIRECTIVE}\n\n`;
        }
        // universalDirective es la base obligatoria de calidad, rigor y sin artefactos
        singlePageSystemPrompt += `${universalDirective}\n\n`;
        if (isPracticalMode) {
          singlePageSystemPrompt += `🎯 DIRECTIVA DE BARRIDO PRÁCTICO Y SITUACIONAL:
Transforma el 100% de los hechos del inventario_factual (1 hecho clave = 1 mini-caso aplicado) sin omitir definiciones base, planteando situaciones reales breves de toma de decisiones o aplicación donde dicho concepto, mecanismo u origen sea indispensable para resolver el caso.\n\n`;
        }
        singlePageSystemPrompt += `${getFormatRule(cardFormat)}`;
        singlePageSystemPrompt += `\n${getFormatInstructions(cardFormat)}`;
        singlePageSystemPrompt += `\n\nREGLA DE INTEGRIDAD ESTRUCTURAL CON INVENTARIO FACTUAL:
Devuelve un objeto JSON estructurado con:
- "inventario_factual": array obligatorio de objetos [{ "id": "H1", "tipo": "1_identidad_definicion"|"2_funcion_mecanismo"|"3_origen_fuente_requisitos"|"4_consecuencia_falla_limite"|"5_detalle_tabla_nota", "declaracion_factual": "..." }] con el desglose exhaustivo de TODOS los hechos atómicos, definiciones y relaciones de la página virtual antes de generar las tarjetas.
- "core_exhausted": booleano que indica si la página virtual ha sido vaciada conceptualmente.
- "cards": array dinámico con las tarjetas de estudio generadas evaluando directa y rigurosamente los hechos del inventario_factual (numeradas estrictamente con generation_index del 1 al N, formuladas según el formato "${cardFormat}").`;
      }

      singlePageSystemPrompt += buildLanguageDirective(language);

      let tarjetasAcumuladas: GeneratedCard[] = [];
      const accumulatedHistory: ExistingCardHistoryItem[] = [...existingCards];
      let lastProcessedPage = startPage;

      if (isDocenteMode) {
        // 4A. MOTOR DE CHUNKING Y BATCHING MATEMÁTICO DOCX (MODO DOCENTE):
        // Divide el rango de páginas virtuales en bloques proporcionales y asigna una cuota matemática a cada bloque
        // para evitar la "Saturación de Contexto" y garantizar que el 100% de las páginas aporten al examen.
        const chunks = partitionPagesIntoChunks(startPage, finalPage, targetCount);
        let deficitCarryOver = 0;
        lastProcessedPage = finalPage;

        console.log(
          `[Motor Chunking DOCX - Modo Docente] Dividiendo rango págs virtuales ${startPage}-${finalPage} en ${chunks.length} bloques. Meta total: ${targetCount} tarjetas.`
        );

        for (const chunk of chunks) {
          lastProcessedPage = chunk.endPage;
          const currentChunkQuota = Math.max(1, chunk.quota + deficitCarryOver);
          const requestChunkQuota = currentChunkQuota + 2;
          deficitCarryOver = 0;

          console.log(
            `[Motor Chunking DOCX - Modo Docente] Procesando Bloque ${chunk.chunkIndex + 1}/${chunk.totalChunks} (Págs Virtuales ${chunk.startPage} a ${chunk.endPage}). Cuota asignada: ${currentChunkQuota} tarjetas (solicitando ${requestChunkQuota} con colchón).`
          );

          const chunkVirtualPages = wordPages.slice(chunk.startPage - 1, chunk.endPage);
          const chunkText = chunkVirtualPages
            .map((p, idx) => `=== PÁGINA VIRTUAL ${chunk.startPage + idx} ===\n${p.text}`)
            .join('\n\n');
          const chunkImages = chunkVirtualPages
            .flatMap((p) => p.images || [])
            .slice(0, 4);

          // Extraer lista de tópicos ya cubiertos
          const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
          const historyDirective = coveredTopics
            ? `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O BLOQUES PREVIOS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de este bloque que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.`
            : '';

          const exhaustiveDocenteFocus = isExhaustiveMode
            ? `\n- PROFUNDIDAD EXHAUSTIVA DOCENTE: Dentro de la cuota asignada de ${requestChunkQuota} preguntas, prioriza formular preguntas que evalúen excepciones a reglas generales, contrastes conceptuales sutiles y cruces relacionales de tablas o matrices según EXHAUSTIVE_TABLES_DIRECTIVE a lo largo de todas las páginas virtuales del bloque (${chunk.startPage} a ${chunk.endPage}).`
            : '';

          const chunkQuotaMandate = `\n\n🚨 DIRECTIVA DE CUOTA MATEMÁTICA DEL BLOQUE (EXACTAMENTE ${requestChunkQuota} PREGUNTAS):
- Tu objetivo OBLIGATORIO para este bloque (páginas virtuales ${chunk.startPage} a ${chunk.endPage}) es generar exactamente ${requestChunkQuota} preguntas.
- Realiza un barrido homogéneo cubriendo todas las páginas de este bloque (${chunk.startPage} a ${chunk.endPage}) para que este segmento aporte equitativamente al examen global sin saturar el inicio del documento.${exhaustiveDocenteFocus}`;

          const currentChunkSystemPrompt = `${singlePageSystemPrompt}${historyDirective}${chunkQuotaMandate}`;

          const pageLabel =
            chunk.startPage === chunk.endPage
              ? `Página Virtual ${chunk.startPage}`
              : `Páginas Virtuales ${chunk.startPage} a ${chunk.endPage}`;

          const imageNotice =
            chunkImages.length > 0
              ? ` Se adjuntan ${chunkImages.length} imagen(es) o diagrama(s) de este bloque.`
              : '';

          const chunkUserPrompt = isExhaustiveMode
            ? `Analiza el bloque (${pageLabel}) del documento Word aplicando la DIRECTIVA DE COBERTURA Y CALIDAD (cuota asignada: exactamente ${requestChunkQuota} tarjetas). Desglosa en "inventario_factual" los hechos del bloque y genera las preguntas en "cards". Aplica la DIRECTIVA DE MODO DOCENTE / DIDÁCTICO para crear ejercicios prácticos de evaluación sin metadatos de aula. ${imageNotice}Evalúa excepciones, contrastes conceptuales y análisis relacional de tablas según EXHAUSTIVE_TABLES_DIRECTIVE a lo largo del bloque. Formato de evaluación: "${docenteFormat}".
 
--- TEXTO DEL BLOQUE (${pageLabel}) ---
${chunkText}`
            : `Analiza el bloque (${pageLabel}) del documento Word adjunto desglosando en "inventario_factual" y extrayendo exactamente ${requestChunkQuota} preguntas en "cards" con formato de evaluación docente "${docenteFormat}". Aplica el Modo Docente / Didáctico: preguntas prácticas de examen sin metadatos de aula.${imageNotice} Asegúrate de cubrir equilibradamente el contenido de todas las páginas virtuales del bloque.

--- TEXTO DEL BLOQUE (${pageLabel}) ---
${chunkText}`;

          const geminiContentParts: Array<
            | { inlineData: { mimeType: string; data: string } }
            | { text: string }
          > = [];

          for (const img of chunkImages) {
            if (img.dataBase64 && img.mimeType) {
              geminiContentParts.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.dataBase64,
                },
              });
            }
          }

          geminiContentParts.push({
            text: chunkUserPrompt,
          });

          let chunkCandidateCards: GeneratedCard[] = [];

          try {
            const chunkResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: geminiContentParts,
              config: {
                systemInstruction: currentChunkSystemPrompt,
                temperature: isExhaustiveMode ? 0.1 : 0.15,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (chunkResponse.text) {
              try {
                const parsed = parseGeminiBatchResponse(chunkResponse.text);
                chunkCandidateCards = parsed.cards || [];
                console.log(
                  `[Motor Chunking DOCX - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Gemini devolvió ${chunkCandidateCards.length} tarjetas brutas.`
                );
              } catch (parseErr) {
                console.warn(
                  `[Motor Chunking DOCX - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Error parseando respuesta de Gemini:`,
                  parseErr
                );
              }
            }
          } catch (geminiErr) {
            console.warn(
              `[Motor Chunking DOCX - Modo Docente] Error en llamada a Gemini para Bloque ${chunk.chunkIndex + 1}:`,
              geminiErr
            );
          }

          if (chunkCandidateCards.length > 0) {
            for (const card of chunkCandidateCards) {
              if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
                card.front = (card.question || '').trim();
              }
              if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
                card.question = card.front;
              }
              normalizeDocenteCandidateCard(card);
            }
            chunkCandidateCards = chunkCandidateCards.filter(
              (card) =>
                !isDisallowedCardContent(card, true) &&
                Boolean(card.front && card.front.trim() && !FORMAT_LABEL_REGEX.test(card.front.trim()))
            );
          }

          // Acumulación y Deduplicación rápida del bloque (con gatekeeper vectorial)
          if (chunkCandidateCards.length > 0) {
            const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
              candidateCards: chunkCandidateCards,
              existingCards: accumulatedHistory,
              apiKey,
              similarityThreshold: isExhaustiveMode ? 0.94 : 0.88,
              isExhaustiveMode,
            });

            if (duplicateCount > 0) {
              console.log(
                `[Motor Chunking DOCX - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Se filtraron ${duplicateCount} duplicados.`
              );
            }

            if (uniqueCards.length > 0) {
              tarjetasAcumuladas.push(...uniqueCards);
              for (const uc of uniqueCards) {
                accumulatedHistory.push({ front: uc.front, back: uc.back });
              }
              console.log(
                `[Motor Chunking DOCX - Modo Docente] Bloque ${chunk.chunkIndex + 1}: Acumuladas ${uniqueCards.length} tarjetas. Total: ${tarjetasAcumuladas.length}/${targetCount}.`
              );
            }

            if (uniqueCards.length < currentChunkQuota) {
              deficitCarryOver = currentChunkQuota - uniqueCards.length;
            }
          } else {
            deficitCarryOver = currentChunkQuota;
          }
        }

        // Pase de rescate (Top-Up) de 1 iteración si tras todos los bloques aún faltan preguntas para alcanzar targetCount
        if (tarjetasAcumuladas.length < targetCount) {
          const missing = targetCount - tarjetasAcumuladas.length + 2;
          console.log(
            `[Motor Chunking DOCX - Modo Docente] Pase Top-Up activado: faltan ${targetCount - tarjetasAcumuladas.length} tarjetas (solicitando ${missing} adicionales sobre págs virtuales ${startPage}-${finalPage}).`
          );

          try {
            const rescueVirtualPages = wordPages.slice(startPage - 1, finalPage);
            const rescueText = rescueVirtualPages
              .map((p, idx) => `=== PÁGINA VIRTUAL ${startPage + idx} ===\n${p.text}`)
              .join('\n\n');
            const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
            const rescueHistoryDirective = coveredTopics
              ? `\n\nPREGUNTAS Y CONCEPTOS YA INCLUIDOS EN EL EXAMEN (NO REPETIR): ${coveredTopics}.\nDEBES extraer exactamente ${missing} preguntas NUEVAS sobre otros hechos, detalles, relaciones o casos prácticos del documento que aún no hayan sido evaluados.`
              : '';
            const rescueQuotaMandate = `\n\n🚨 DIRECTIVA DE RESCATE DE CUOTA DOCENTE (EXACTAMENTE ${missing} PREGUNTAS NUEVAS):
- Tu objetivo OBLIGATORIO es generar exactamente ${missing} preguntas adicionales válidas para completar la cuota cerrada del examen docente (${targetCount} preguntas).`;

            const rescueUserPrompt = `Analiza el rango completo (Páginas Virtuales ${startPage} a ${finalPage}) del documento Word adjunto y genera exactamente ${missing} preguntas adicionales en "cards" con formato de evaluación docente "${docenteFormat}" que no repitan las preguntas ya formuladas. Aplica el Modo Docente / Didáctico sin metadatos de aula.

--- TEXTO DEL DOCUMENTO (Páginas Virtuales ${startPage} a ${finalPage}) ---
${rescueText}`;

            const rescueResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: [{ text: rescueUserPrompt }],
              config: {
                systemInstruction: `${singlePageSystemPrompt}${rescueHistoryDirective}${rescueQuotaMandate}`,
                temperature: 0.2,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (rescueResponse.text) {
              const parsedRescue = parseGeminiBatchResponse(rescueResponse.text);
              let rescueCandidates = parsedRescue.cards || [];
              for (const card of rescueCandidates) {
                if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
                  card.front = (card.question || '').trim();
                }
                if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
                  card.question = card.front;
                }
                normalizeDocenteCandidateCard(card);
              }
              rescueCandidates = rescueCandidates.filter(
                (card) =>
                  !isDisallowedCardContent(card, true) &&
                  Boolean(card.front && card.front.trim() && !FORMAT_LABEL_REGEX.test(card.front.trim()))
              );

              if (rescueCandidates.length > 0) {
                const { uniqueCards: rescueUnique } = await deduplicateCandidateCards({
                  candidateCards: rescueCandidates,
                  existingCards: accumulatedHistory,
                  apiKey,
                  similarityThreshold: isExhaustiveMode ? 0.94 : 0.88,
                  isExhaustiveMode,
                });
                if (rescueUnique.length > 0) {
                  tarjetasAcumuladas.push(...rescueUnique);
                  for (const uc of rescueUnique) {
                    accumulatedHistory.push({ front: uc.front, back: uc.back });
                  }
                  console.log(
                    `[Motor Chunking DOCX - Modo Docente] Pase Top-Up sumó ${rescueUnique.length} tarjetas. Total final: ${tarjetasAcumuladas.length}/${targetCount}.`
                  );
                }
              }
            }
          } catch (rescueErr) {
            console.warn('[Motor Chunking DOCX - Modo Docente] Advertencia en pase Top-Up:', rescueErr);
          }
        }

        tarjetasAcumuladas = tarjetasAcumuladas.slice(0, targetCount);
      } else {
        // 4B. MOTOR ORIGINAL MODO ESTUDIO DOCX (RECUPERADO DE COMMIT 57e614e):
        // Bucle Secuencial Virtual Página a Página con Marcapáginas y Modo Minucioso/Exhaustivo.
        // while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage)
        let currentPage = startPage;
        lastProcessedPage = currentPage;

        console.log(
          `[Bucle Acumulador Backend DOCX - Modo Estudio] Iniciando: Desde pág. virtual ${startPage} hasta pág. virtual ${finalPage}. Meta: ${targetCount} tarjetas.`
        );

        while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage) {
          lastProcessedPage = currentPage;
          const remainingToTarget = targetCount - tarjetasAcumuladas.length;
          const currentVirtualPage = wordPages[currentPage - 1];
          const currentPageText = currentVirtualPage?.text || '';
          const currentPageImages = (currentVirtualPage?.images || []).slice(0, 3);

          console.log(
            `[Bucle Acumulador Backend DOCX - Modo Estudio] Procesando Página Virtual ${currentPage} de ${finalPage}... (Acumuladas: ${tarjetasAcumuladas.length}/${targetCount}, Restan: ${remainingToTarget}, Imágenes: ${currentPageImages.length})`
          );

          // Extraer lista de tópicos ya cubiertos (BD + páginas previas del lote) para evitar repeticiones a ciegas
          const coveredTopics = extractUniqueTopicsList(accumulatedHistory);
          const historyDirective = coveredTopics
            ? isExhaustiveMode
              ? `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de esta página que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.
NOTA MODO EXHAUSTIVO: Aunque una entidad o tema general aparezca en la lista previa, si la página actual aporta NUEVOS datos, mecanismos, cifras, clasificaciones, funciones o filas de tablas sobre ese mismo tema que aún no han sido preguntados literalmente, DEBES generar todas las tarjetas correspondientes a estos nuevos datos.`
              : `\n\nCONCEPTOS YA EVALUADOS EN ESTE MAZO O PÁGINAS PREVIAS: ${coveredTopics}.
DEBES explorar conceptos, relaciones, celdas de tablas o párrafos de esta página que aún NO hayan sido preguntados. No repitas la misma pregunta con ligeras variaciones de redacción.`
            : '';

          const exhaustiveQuotaMandate = isExhaustiveMode
            ? `\n\n🎯 ENFOQUE EXHAUSTIVO (PRIORIDAD ABSOLUTA AL TEXTO + SUPLEMENTO DE TABLAS Y PIES DE IMAGEN):
- Analiza la página y desglosa en "inventario_factual" absolutamente todas sus definiciones, clasificaciones vertebrales, mecanismos causa-efecto, cifras, porcentajes, cálculos, sinónimos técnicos y datos relevantes de tablas y pies de imagen.
- META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): Tu objetivo es extraer entre 22 y 25 tarjetas sustanciales: vacía primero al 100% todo el TEXTO PRINCIPAL párrafo por párrafo (sin omitir nada de lo que incluye el modo estándar más todos los detalles finos del texto) y, SUMADO A ELLO, sácale punta con sentido práctico y de estudio a todas las tablas/cuadros y pies de imagen o recuadros relevantes de la página. Si la página tiene muy poco contenido real, detente al agotar los hechos legítimos o marca el resto como relevance_tier: 'C_trivial_filler'.
- Genera en "cards" tarjetas de alta precisión evaluando todos los hechos catalogados y respetando las exclusiones de páginas de ejercicios/repaso.`
            : `\n\n🎯 ENFOQUE TRONCAL EQUILIBRADO (MODO NORMAL: 8 A 12 TARJETAS):
- Analiza la página y desglosa en "inventario_factual" sus conceptos vertebrales, definiciones, funciones y mecanismos clave del texto principal.
- META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): Tu objetivo es extraer entre 8 y 12 tarjetas sustanciales cubriendo exhaustivamente todo el texto principal y sus conceptos clave sin omitir nada importante, pero evitando duplicar hechos entre texto y cuadros resumen y sin despiezar subfilas secundarias de tablas. Si la página tiene poco texto real, detente al agotar los hechos legítimos o marca el resto como relevance_tier: 'C_trivial_filler'.
- Genera en "cards" tarjetas de alta precisión evaluando los hechos troncales catalogados, de forma proporcional al contenido real de la página y respetando estrictamente las exclusiones.`;

          const currentPageSystemPrompt = `${singlePageSystemPrompt}${historyDirective}${exhaustiveQuotaMandate}`;

          const imageNotice = currentPageImages.length > 0
            ? ` Se adjuntan ${currentPageImages.length} imagen(es) o diagrama(s) incrustados en esta sección del documento Word. Analízalos visualmente con precisión para extraer datos, esquemas, clasificaciones o conceptos presentes en ellos.`
            : '';

          const practicalInstructionWord = isPracticalMode
            ? `ENFOQUE OBLIGATORIO: MODO PRÁCTICO Y SITUACIONAL (PROBLEM-BASED LEARNING).
Transforma cada concepto o hecho identificado en "inventario_factual" en un supuesto del mundo real, escenario de toma de decisiones o problema aplicado. Queda terminantemente PROHIBIDO formular preguntas teóricas directas o definiciones de manual, y queda prohibido omitir conceptos sustanciales del inventario.`
            : `Extrae todos los conceptos clave, datos precisos, normativas o hechos únicos posibles basándote en el inventario_factual.`;

          const pageClassificationInstructionWord = isExhaustiveMode
            ? `\nClasifica obligatoriamente la página en "page_classification":
- "standard_content": página con contenido teórico, explicaciones, conceptos, fórmulas, texto continuo estándar O tablas conceptuales/comparativas (clasificaciones, patologías, mecanismos, enzimas, diferencias clave). En estas páginas se extrae con la densidad completa indicada.
- "catalog_table_only": la página contiene de forma casi exclusiva una tabla de catálogo masivo, directorio o baremo numérico de consulta de decenas de elementos sin prosa explicativa. En Modo Exhaustivo, no te limites a 1 o 2 tarjetas: extrae entre 6 y 12 tarjetas sustanciales con sentido práctico y de estudio (comparaciones por condición/grupo, extremos superiores e inferiores más relevantes, patrones generales y notas al pie sustanciales).
- "review_or_case_exercises": la página contiene preguntas de repaso, cuestionarios de autoevaluación, ejercicios finales de capítulo o casos de estudio de discusión del libro. Si es esta sección, devuelve un array vacío [] en "cards" para no duplicar preguntas del libro.`
            : `\nClasifica obligatoriamente la página en "page_classification":
- "standard_content": página con contenido teórico, explicaciones, conceptos, fórmulas, texto continuo estándar O tablas conceptuales/comparativas (clasificaciones, patologías, mecanismos, enzimas, diferencias clave). En estas páginas se extrae con la densidad completa indicada.
- "catalog_table_only": la página contiene de forma casi exclusiva una tabla de catálogo masivo, directorio o baremo numérico de consulta de decenas de elementos sin prosa explicativa. Si es catálogo masivo, extrae como máximo 1 o 2 tarjetas conceptuales sobre el principio organizativo general o los extremos más notables.
- "review_or_case_exercises": la página contiene preguntas de repaso, cuestionarios de autoevaluación, ejercicios finales de capítulo o casos de estudio de discusión del libro. Si es esta sección, devuelve un array vacío [] en "cards" para no duplicar preguntas del libro.`;

          const isFocusActiveWord = Boolean(focusInstruction && focusInstruction.trim().length > 0);
          const isTableFocusWord = isFocusActiveWord && /\b(tabla|cuadro|\d)\b/i.test(focusInstruction);

          let pageUserPrompt = '';
          if (isFocusActiveWord) {
            pageUserPrompt = `🎯 MODO ENFOQUE TEMÁTICO - VERSO LIBRE ACTIVO: El usuario ha solicitado generar tarjetas específicamente sobre: '${focusInstruction}'. Analiza el contenido de la Página Virtual ${currentPage} del documento Word adjunto:
1) Si esta página NO contiene información relacionada con '${focusInstruction}', devuelve obligatoriamente 'inventario_factual': [] y 'cards': [].
2) ⚠️ PRECISIÓN DE OBJETIVO EN MODO ENFOQUE: Si el usuario solicita específicamente un 'Cuadro X' o 'Tabla X' (ej. 'Cuadro 4.3' o 'Tabla 4-3'), NO extraigas preguntas de una 'Figura X' o ilustración con el mismo número (ej. 'Figura 4-3') que trate de otro subtema en páginas anteriores: devuelve 'cards': [] hasta llegar a la página donde se encuentra realmente la Tabla/Cuadro solicitado.
3) Si esta página SÍ contiene información o tablas sobre '${focusInstruction}', extrae de forma profunda y exhaustiva entre 15 y 25 preguntas sustanciales exprimiendo al máximo dicho tema. Formato: '${cardFormat}'.

--- TEXTO DE LA PÁGINA VIRTUAL ${currentPage} (${fileName || 'documento.docx'}) ---
${currentPageText}`;
          } else if (isExhaustiveMode && !isPracticalMode) {
            pageUserPrompt = `Analiza el contenido de la Página Virtual ${currentPage} del documento Word adjunto desglosando obligatoriamente en "inventario_factual" entre 15 y 25 hechos atómicos de forma exhaustiva y genera en "cards" 1 tarjeta de estudio independiente por cada hecho catalogado en el inventario (relación 1 a 1 estricta, prohibido agrupar varios hechos en una sola tarjeta).
PRIORIDAD #1 ABSOLUTA (TEXTO PRINCIPAL): Vacía primero cada párrafo del texto (definiciones, sinónimos o denominaciones alternativas, composiciones, partes, mecanismos, lugares de acción, cifras, porcentajes, rangos y cálculos) sin omitir nada de lo que incluye el modo estándar.
PRIORIDAD #2 (SUPLEMENTO EXHAUSTIVO EN TABLAS Y PIES DE IMAGEN): Además del texto, desglosa FILA POR FILA todas las tablas y cuadros de la página (extrayendo entre 8 y 16 tarjetas sobre tipos, orígenes/fuentes, funciones, efectos/deficiencias, extremos y comparaciones con sentido práctico y de estudio) y exprime los pies de imagen, diagramas y recuadros con información relevante de examen.
META DE EXTRACCIÓN ('standard_content'): Entre 20 y 25 tarjetas sustanciales por página. ${pageClassificationInstructionWord} ${imageNotice}${practicalInstructionWord} Formato: "${cardFormat}".

--- TEXTO DE LA PÁGINA VIRTUAL ${currentPage} (${fileName || 'documento.docx'}) ---
${currentPageText}`;
          } else if (isExhaustiveMode && isPracticalMode) {
            pageUserPrompt = `Analiza el contenido de la Página Virtual ${currentPage} del documento Word adjunto desglosando obligatoriamente en "inventario_factual" entre 15 y 25 hechos atómicos de forma exhaustiva y genera en "cards" 1 caso práctico/situacional independiente por cada hecho catalogado en el inventario (relación 1 a 1 estricta).
PRIORIDAD #1 ABSOLUTA (TEXTO PRINCIPAL): Vacía primero cada párrafo del texto transformando cada concepto, mecanismo, cifra, cálculo o regla en un mini-caso aplicado con toma de decisiones.
PRIORIDAD #2 (SUPLEMENTO EXHAUSTIVO EN TABLAS Y PIES DE IMAGEN): Además del texto, desglosa FILA POR FILA todas las tablas y cuadros de la página y exprime los pies de imagen y recuadros relevantes en forma de casos prácticos de estudio.
META DE EXTRACCIÓN ('standard_content'): Entre 20 y 25 tarjetas sustanciales por página. ${pageClassificationInstructionWord} ${imageNotice}${practicalInstructionWord} Formato: "${cardFormat}".

--- TEXTO DE LA PÁGINA VIRTUAL ${currentPage} (${fileName || 'documento.docx'}) ---
${currentPageText}`;
          } else {
            pageUserPrompt = `Analiza el contenido de la Página Virtual ${currentPage} del documento Word adjunto desglosando en "inventario_factual" los conceptos troncales, definiciones y relaciones clave del texto principal, y genera en "cards" las tarjetas de estudio correspondientes evaluando los hechos troncales. META DE EXTRACCIÓN EN PÁGINAS DE CONTENIDO ('standard_content'): En páginas de contenido estándar, tu objetivo obligatorio es extraer entre 8 y 12 tarjetas sustanciales cubriendo exhaustivamente todo el texto principal y sus conceptos clave sin dejar lagunas de examen, evitando duplicar hechos entre texto y cuadros resumen y sin despiezar subfilas secundarias de tablas ni recuadros periféricos. Si la página tiene muy poco texto real y solo da para menos tarjetas legítimas, detente al agotar los hechos legítimos o márcalo como relevance_tier: 'C_trivial_filler'. ${pageClassificationInstructionWord} ${imageNotice}${practicalInstructionWord} Formato: "${cardFormat}".

--- TEXTO DE LA PÁGINA VIRTUAL ${currentPage} (${fileName || 'documento.docx'}) ---
${currentPageText}`;
          }

          // Construir contenido multimodal para Gemini: imágenes + texto
          const geminiContentParts: Array<
            | { inlineData: { mimeType: string; data: string } }
            | { text: string }
          > = [];

          for (const img of currentPageImages) {
            if (img.dataBase64 && img.mimeType) {
              geminiContentParts.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.dataBase64,
                },
              });
            }
          }

          geminiContentParts.push({
            text: pageUserPrompt,
          });

          let pageCandidateCards: GeneratedCard[] = [];

          try {
            const pageResponse = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: geminiContentParts,
              config: {
                systemInstruction: currentPageSystemPrompt,
                temperature: 0.15,
                responseMimeType: 'application/json',
                responseJsonSchema: unifiedExtractionSchema,
                maxOutputTokens: 8192,
              },
            });

            if (pageResponse.text) {
              try {
                const parsed = parseGeminiBatchResponse(pageResponse.text);
                let rawCards = parsed.cards || [];

                // Criba programática instantánea de relleno por autoclasificación C_trivial_filler (omitida en Verso Libre)
                if (!isFocusActiveWord) {
                  rawCards = rawCards.filter((card) => {
                    if (card.relevance_tier === 'C_trivial_filler') {
                      console.log(
                        `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Descartada tarjeta por autoclasificación C_trivial_filler: "${card.front || card.question}"`
                      );
                      return false;
                    }
                    return true;
                  });
                }

                // Filtro determinista contra metadatos editoriales de tablas y analogías domésticas
                rawCards = rawCards.filter((card) => {
                  if (isDisallowedCardContent(card, isTableFocusWord, isFocusActiveWord)) {
                    console.log(
                      `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Descartada tarjeta por metadatos de tabla o analogía doméstica: "${card.front || card.question}"`
                    );
                    return false;
                  }
                  return true;
                });

                // CANDADO PROGRAMÁTICO (Code Gate) según page_classification
                if (parsed.pageClassification === 'review_or_case_exercises') {
                  console.log(
                    `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage} clasificada como "review_or_case_exercises" (acumuladas: ${tarjetasAcumuladas.length}): descartando ${rawCards.length} tarjetas por ser cuestionarios/repaso finales del libro.`
                  );
                  rawCards = [];
                } else if (parsed.pageClassification === 'catalog_table_only') {
                  if (isFocusActiveWord || isExhaustiveMode) {
                    console.log(
                      `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage} clasificada como "catalog_table_only", pero ${isExhaustiveMode ? 'Modo Exhaustivo' : 'Enfoque Temático'} está activo: se conservan el 100% de las tarjetas (${rawCards.length}).`
                    );
                  } else {
                    const maxCatalogCards = 1;
                    if (rawCards.length > maxCatalogCards) {
                      console.log(
                        `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage} clasificada como "catalog_table_only": recortando de ${rawCards.length} a máximo ${maxCatalogCards} tarjeta(s).`
                      );
                      rawCards = rawCards.slice(0, maxCatalogCards);
                    }
                  }
                }

                pageCandidateCards = rawCards;

                console.log(
                  `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Gemini devolvió ${pageCandidateCards.length} tarjetas brutas.`
                );
              } catch (parseErr) {
                console.warn(
                  `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Sin tarjetas válidas o poca información:`,
                  parseErr
                );
              }
            }
          } catch (geminiErr) {
            console.warn(
              `[Bucle Acumulador Backend DOCX - Modo Estudio] Error en llamada a Gemini para Página Virtual ${currentPage}:`,
              geminiErr
            );
          }

          // Acumulación y Deduplicación rápida (con gatekeeper vectorial habilitado)
          if (pageCandidateCards.length > 0) {
            const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
              candidateCards: pageCandidateCards,
              existingCards: accumulatedHistory,
              apiKey,
              similarityThreshold: isFocusActiveWord ? 0.94 : (isExhaustiveMode ? 0.94 : 0.88),
              isExhaustiveMode,
              isFocusActive: isFocusActiveWord,
            });

            if (duplicateCount > 0) {
              console.log(
                `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Gatekeeper léxico filtró ${duplicateCount} duplicados.`
              );
            }

            if (uniqueCards.length > 0) {
              tarjetasAcumuladas.push(...uniqueCards);
              for (const uc of uniqueCards) {
                accumulatedHistory.push({ front: uc.front, back: uc.back });
              }
              console.log(
                `[Bucle Acumulador Backend DOCX - Modo Estudio] Página Virtual ${currentPage}: Se acumularon ${uniqueCards.length} tarjetas únicas. Total acumulado: ${tarjetasAcumuladas.length}/${targetCount}.`
              );
            }
          }

          // Si alcanzamos o superamos el objetivo, nos detenemos conservando íntegramente todas las tarjetas de la página actual sin truncar
          if (tarjetasAcumuladas.length >= targetCount) {
            console.log(
              `[Bucle Acumulador Backend DOCX - Modo Estudio] 🎯 Objetivo alcanzado/superado: ${tarjetasAcumuladas.length} tarjetas en Página Virtual ${currentPage}.`
            );
            break;
          }

          currentPage++;
        }
      }

      // Pase único de deduplicación semántica vectorial al finalizar el bucle (si hay historial previo en BD)
      if (!isDocenteMode && tarjetasAcumuladas.length > 0 && existingCards.length > 0) {
        const { uniqueCards: semanticallyUnique } = await deduplicateCandidateCards({
          candidateCards: tarjetasAcumuladas,
          existingCards,
          apiKey,
          similarityThreshold: isFocusActive ? 0.94 : (isExhaustiveMode ? 0.94 : 0.88),
          isExhaustiveMode,
          isFocusActive,
        });
        tarjetasAcumuladas = semanticallyUnique;
      }

      if (tarjetasAcumuladas.length === 0) {
        const hasReachedEnd = lastProcessedPage >= finalPage;
        if (hasReachedEnd && existingCards.length > 0) {
          return {
            success: true,
            cards: [],
            rangeCompleted: true,
            nextCursorPage: undefined,
            startCursorPage: startPage,
            message: `¡Rango completado! Se ha llegado al final de las páginas seleccionadas (pág. virtual ${finalPage}); las últimas páginas corresponden a cuestionarios de repaso o su contenido ya está cubierto en el mazo.`,
          };
        }
        return {
          success: false,
          error: `No se pudieron extraer tarjetas únicas del rango procesado (págs. virtuales ${startPage} a ${lastProcessedPage}). Comprueba que las páginas contengan texto con información relevante y no estén ya en el mazo.`,
          nextCursorPage: hasReachedEnd ? undefined : lastProcessedPage + 1,
          startCursorPage: startPage,
        };
      }

      const processedCards = processGeneratedCards(
        tarjetasAcumuladas,
        isDocenteMode ? targetCount : tarjetasAcumuladas.length,
        cardFormat,
        isDocenteMode,
        isDocenteMode
      );

      if (apiCheck) {
        await recordApiUsage(apiCheck.userId);
      }

      const hasReachedEnd = lastProcessedPage >= finalPage;
      const isExhausted = hasReachedEnd;

      const nextCursor = hasReachedEnd
        ? undefined
        : lastProcessedPage + 1;

      return {
        success: true,
        core_exhausted: isExhausted,
        cards: processedCards,
        nextCursorPage: nextCursor,
        startCursorPage: startPage,
      };
    }

    // FASE 2: Fallback para documentos que no sean PDF ni DOCX paginado (Audio, TXT)
    // 4. Consultar historial de tarjetas existentes en este mazo para la Memoria de Progreso
    const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);
    const existingTopicsList = extractUniqueTopicsList(existingCards);
    const progressMemoryPrompt = buildProgressMemorySection(existingCards);
    const isContinuation = existingCards.length > 0;

    const focusRuleSection = focusInstruction
      ? `🚨 REGLA DE ENFOQUE CRÍTICA (PRIORIDAD ABSOLUTA):
El usuario ha indicado la siguiente instrucción de enfoque: "${focusInstruction}".
REGLA ESTRICTA: Si el usuario proporciona una instrucción de enfoque (ej. un capítulo o tema específico), DEBES ignorar el resto del documento y extraer la información EXCLUSIVAMENTE de la sección solicitada. Bajo ninguna circunstancia generes preguntas sobre partes o secciones ajenas a lo solicitado.`
      : '';

    let candidateCards: GeneratedCard[] = [];
    let coreExhausted = false;

    // Si no es documento Word (es decir, es Audio u otro archivo multimedia), subirlo a Gemini File API
    let uploadedMediaFile: { uri: string; mimeType?: string; name: string } | null = null;
    if (!isWordDocument) {
      try {
        const mediaBlob = new Blob([fileArrayBuffer], { type: normalizedMime });
        console.log(
          `[Gemini File API] Subiendo archivo multimedia a Google (${normalizedMime}, ${(fileArrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB)...`
        );
        const fileResult = await ai.files.upload({
          file: mediaBlob,
          config: {
            mimeType: normalizedMime,
          },
        });
        if (!fileResult.uri || !fileResult.name) {
          throw new Error('Gemini File API no devolvió una URI o nombre de archivo válido.');
        }
        uploadedMediaFile = {
          uri: fileResult.uri,
          mimeType: fileResult.mimeType || normalizedMime,
          name: fileResult.name,
        };
        console.log(`[Gemini File API] Archivo subido con éxito: ${fileResult.name} (URI: ${fileResult.uri})`);
      } catch (uploadErr) {
        console.error('[Gemini File API] Error al subir archivo multimedia a Gemini File API:', uploadErr);
        throw new Error(
          `Error al transferir el archivo multimedia a Google Gemini File API: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`
        );
      }
    }

    try {
      if (targetCount >= 20) {
        // =========================================================================
        // CONCURRENT BATCHING (Peticiones Paralelas con Partición de Páginas)
        // =========================================================================
        // Dividimos la solicitud en 2 llamadas concurrentes (Promise.all) solicitando la mitad de tarjetas a cada una.
        // Cada promesa se enfoca en una mitad distinta de las páginas del micro-chunk para erradicar el límite de maxOutputTokens.
        const totalRequestedCards = targetCount; // Sin sobreaprovisionamiento masivo
        const batch1Target = Math.ceil(totalRequestedCards / 2);
        const batch2Target = totalRequestedCards - batch1Target;

        const { directive: dirBatch1 } = buildTargetCountDirective(
          batch1Target,
          existingCards.length
        );
        const { directive: dirBatch2 } = buildTargetCountDirective(
          batch2Target,
          existingCards.length
        );

        let contentsBatch1: Array<{ text?: string; fileData?: { fileUri?: string; mimeType?: string } }>;
        let contentsBatch2: Array<{ text?: string; fileData?: { fileUri?: string; mimeType?: string } }>;

        if (isWordDocument) {
          const halfLen = Math.floor(extractedWordText.length / 2);
          const splitIdx = extractedWordText.indexOf('\n\n', halfLen);
          const effectiveSplit = splitIdx !== -1 && splitIdx < extractedWordText.length * 0.75 ? splitIdx : halfLen;
          const wordPart1 = extractedWordText.slice(0, effectiveSplit);
          const wordPart2 = extractedWordText.slice(effectiveSplit);

          const prompt1 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (1/2): Concéntrate en la PRIMERA MITAD del documento. ${dirBatch1} ${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, isExhaustiveMode, isPracticalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;
          const prompt2 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (2/2): Concéntrate en la SEGUNDA MITAD del documento. ${dirBatch2} ${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, isExhaustiveMode, isPracticalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;

          contentsBatch1 = [{ text: `${prompt1}\n\n${wordPart1}` }];
          contentsBatch2 = [{ text: `${prompt2}\n\n${wordPart2}` }];
        } else {
          const prompt1 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (1/2): Concéntrate en la primera mitad del audio/archivo. ${dirBatch1} ${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, isExhaustiveMode, isPracticalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;
          const prompt2 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (2/2): Concéntrate en la segunda mitad del audio/archivo. ${dirBatch2} ${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, isExhaustiveMode, isPracticalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;

          contentsBatch1 = [
            {
              fileData: {
                fileUri: uploadedMediaFile?.uri,
                mimeType: uploadedMediaFile?.mimeType || normalizedMime,
              },
            },
            { text: prompt1 },
          ];
          contentsBatch2 = [
            {
              fileData: {
                fileUri: uploadedMediaFile?.uri,
                mimeType: uploadedMediaFile?.mimeType || normalizedMime,
              },
            },
            { text: prompt2 },
          ];
        }

        console.log(
          `[Concurrent Batching Documento] Invocando 2 llamadas paralelas a Gemini Flash-Lite (${batch1Target} y ${batch2Target} tarjetas objetivo)...`
        );

        const [res1, res2] = await Promise.allSettled([
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: contentsBatch1,
            config: getGeminiConfig(
              cardFormat,
              batch1Target,
              existingCards.length,
              coreExhaustedPrevious,
              existingTopicsList,
              isExhaustiveMode,
              pedagogicalMode,
              docenteFormat,
              targetAudience,
              isPracticalMode
            ),
          }),
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: contentsBatch2,
            config: getGeminiConfig(
              cardFormat,
              batch2Target,
              existingCards.length,
              coreExhaustedPrevious,
              existingTopicsList,
              isExhaustiveMode,
              pedagogicalMode,
              docenteFormat,
              targetAudience,
              isPracticalMode
            ),
          }),
        ]);

        let b1Exhausted = false;
        let b2Exhausted = false;
        let atLeastOneSuccess = false;

        if (res1.status === 'fulfilled' && res1.value.text) {
          try {
            const parsed1 = parseGeminiBatchResponse(res1.value.text);
            candidateCards.push(...parsed1.cards);
            b1Exhausted = parsed1.coreExhausted;
            atLeastOneSuccess = true;
            console.log(`[Concurrent Batching Documento] Lote 1 OK: ${parsed1.cards.length} tarjetas.`);
          } catch (e1) {
            console.warn('[Concurrent Batching Documento] Error parseando Lote 1:', e1);
          }
        } else if (res1.status === 'rejected') {
          console.warn('[Concurrent Batching Documento] Lote 1 falló:', res1.reason);
        }

        if (res2.status === 'fulfilled' && res2.value.text) {
          try {
            const parsed2 = parseGeminiBatchResponse(res2.value.text);
            candidateCards.push(...parsed2.cards);
            b2Exhausted = parsed2.coreExhausted;
            atLeastOneSuccess = true;
            console.log(`[Concurrent Batching Documento] Lote 2 OK: ${parsed2.cards.length} tarjetas.`);
          } catch (e2) {
            console.warn('[Concurrent Batching Documento] Error parseando Lote 2:', e2);
          }
        } else if (res2.status === 'rejected') {
          console.warn('[Concurrent Batching Documento] Lote 2 falló:', res2.reason);
        }

        if (!atLeastOneSuccess || candidateCards.length === 0) {
          const suggestedCount = targetCount >= 20 ? 10 : 5;
          const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
          return {
            success: false,
            error: `El documento es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
          };
        }

        coreExhausted = b1Exhausted && b2Exhausted;
      } else {
        // Flujo de lote individual para targetCount < 20 (ej. 5, 10, 15)
        const requestCount = targetCount; // Sin sobreaprovisionamiento masivo
        const { directive: targetCountDirective, integrityNote } = buildTargetCountDirective(
          requestCount,
          existingCards.length
        );

        const rangeLabel = parsedRange.rangeLabel ? ` [${parsedRange.rangeLabel}]` : '';
        const coverageText = isContinuation
          ? `ATENCIÓN: Este es un lote de continuación sobre el documento${rangeLabel}. El usuario ya ha extraído ${existingCards.length} tarjetas de los conceptos iniciales y troncales. TIENES ESTRICTAMENTE PROHIBIDO repetir preguntas o formular tarjetas equivalentes sobre los conceptos ya evaluados. Avanza en profundidad: extrae tarjetas EXCLUSIVAMENTE de las secciones, tablas, detalles técnicos, fórmulas y páginas del fragmento que aún no hayan sido exploradas.`
          : (focusInstruction
            ? `Debes analizar el documento dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}"${rangeLabel}). ${targetCountDirective} Extrae la información EXCLUSIVAMENTE de esa parte del documento.`
            : `Debes analizar el documento completo${rangeLabel}. ${targetCountDirective} Cubre los conceptos clave de forma equitativa desde el principio hasta el final del contenido.`);

        const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText}${fileName ? ` Documento de referencia: "${fileName}".` : ''}

${RIGOR_WARNING_DIRECTIVE}

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, requestCount, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, isExhaustiveMode, isPracticalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings como mapa de extracción), "core_exhausted" (booleano con rigor matemático) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa.

${buildLanguageDirective(language)}`;

        let contents: Array<{ text?: string; fileData?: { fileUri?: string; mimeType?: string } }>;

        if (isWordDocument) {
          contents = [
            {
              text: `${promptText}\n\n=========================================\nCONTENIDO DEL DOCUMENTO DE WORD:\n=========================================\n${extractedWordText}\n=========================================`,
            },
          ];
        } else {
          contents = [
            {
              fileData: {
                fileUri: uploadedMediaFile?.uri,
                mimeType: uploadedMediaFile?.mimeType || normalizedMime,
              },
            },
            {
              text: promptText,
            },
          ];
        }

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: getGeminiConfig(
            cardFormat,
            requestCount,
            existingCards.length,
            coreExhaustedPrevious,
            existingTopicsList,
            isExhaustiveMode,
            pedagogicalMode,
            docenteFormat,
            targetAudience,
            isPracticalMode
          ),
        });

        try {
          const parsed = parseGeminiBatchResponse(response.text);
          candidateCards = parsed.cards;
          coreExhausted = parsed.coreExhausted;
        } catch (err: unknown) {
          console.warn('Fallo al parsear el JSON de Gemini en generateCardsFromDocumentAction:', err);
          const suggestedCount = targetCount >= 20 ? 10 : 5;
          const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
          return {
            success: false,
            error: `El documento es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
          };
        }
      }
    } finally {
      if (uploadedMediaFile?.name) {
        try {
          await ai.files.delete({ name: uploadedMediaFile.name });
          console.log(`[Gemini File API] Archivo temporal ${uploadedMediaFile.name} eliminado de Google con éxito.`);
        } catch (delErr) {
          console.warn(`[Gemini File API] Advertencia al eliminar archivo temporal ${uploadedMediaFile.name}:`, delErr);
        }
      }
    }

    const isDocenteModeFallback =
      pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

    if (isDocenteModeFallback && candidateCards.length > 0) {
      for (const card of candidateCards) {
        if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
          card.front = (card.question || '').trim();
        }
        if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
          card.question = card.front;
        }
        normalizeDocenteCandidateCard(card);
      }
    }

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: candidateCards,
      existingCards,
      apiKey,
      similarityThreshold: isExhaustiveMode ? 0.94 : 0.88,
      targetCount,
      isExhaustiveMode,
    });

    if (duplicateCount > 0) {
      console.log(
        `[Documento] 🛡️ Barrera Determinista activada: Se eliminaron ${duplicateCount} tarjetas duplicadas de la tirada.`
      );
    }

    const processedCards = processGeneratedCards(
      uniqueCards,
      targetCount,
      cardFormat,
      isDocenteModeFallback,
      isDocenteModeFallback
    );

    // Si tras purgar duplicados no se alcanzó la cuota solicitada, la materia troncal está agotándose
    if (processedCards.length < targetCount) {
      coreExhausted = true;
    }

    // Registrar uso en api_limits tras generación exitosa (siempre se cobra cuota, protegiendo la rentabilidad del SaaS)
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processedCards,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al procesar el documento con Gemini';
    console.error('Error in generateCardsFromDocumentAction:', err);
    return {
      success: false,
      error: `Error al procesar el archivo multimodal con Gemini: ${message}`,
    };
  }
}

/**
 * Limpia y extrae el texto legible de un documento HTML estándar
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae el identificador de un vídeo de YouTube a partir de cualquier formato de URL:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/embed/ID
 * - https://www.youtube.com/shorts/ID
 * - https://www.youtube.com/live/ID
 */
function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

/**
 * Server Action para procesar URLs de YouTube y artículos web en entornos Serverless (Vercel).
 * Para YouTube: Utiliza la integración nativa directa de Gemini con URLs de YouTube
 * (procesamiento directo en la nube de Google, evitando por completo los bloqueos IP 429/403 de Vercel)
 * con fallback resiliente mediante múltiples mecanismos de extracción de subtítulos.
 * Para páginas web: Descarga y limpia el contenido textual con fallback a proxy si la web bloquea peticiones de servidor.
 */
export async function generateCardsFromUrlAction(
  input: UrlCardInput
): Promise<GenerateCardsResult> {
  const {
    url,
    deckId,
    customPrompt,
    focusInstruction: rawFocus,
    cardFormat = 'multiple_choice',
    cardCount = 10,
    existingQuestions,
    language = 'es',
    coreExhaustedPrevious = false,
    isPracticalMode = false,
    pedagogicalMode = 'academic',
    docenteFormat = 'mixed_test',
    targetAudience = 'auto',
  } = input;

  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    return { success: false, error: 'Por favor introduce una URL válida.' };
  }

  // Validar formato de URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
  } catch {
    return {
      success: false,
      error: 'La URL proporcionada no tiene un formato válido (ej. https://www.youtube.com/watch?v=...)',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        'Clave GEMINI_API_KEY no configurada. Por favor define GEMINI_API_KEY en tu archivo .env.local para usar la generación automática.',
    };
  }

  // 0. Protección estricta de Cuotas API / Bypass VIP (sin bypass si no hay usuario resoluble)
  const resolvedUserId = await resolveUserId(input.deckId, input.userId);
  if (!resolvedUserId) {
    console.warn('No se pudo resolver user_id para control de cuota en URL. Bloqueo de seguridad activado.');
    return { success: false, error: 'LIMIT_REACHED' };
  }

  const checkResult = await enforceApiLimit(resolvedUserId);
  if ('error' in checkResult) {
    return { success: false, error: checkResult.error };
  }
  const apiCheck = checkResult.check;

  const maxAllowed =
    pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente'
      ? 40
      : 30;
  const targetCount = Math.max(1, Math.min(maxAllowed, cardCount || 10));

  try {
    const youtubeVideoId = extractYouTubeVideoId(parsedUrl.href);
    const isYouTube = Boolean(youtubeVideoId);
    const canonicalYouTubeUrl = youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : '';

    // Gatekeeper PRO: Validación estricta de suscripción para extracción de Vídeos de YouTube
    if (isYouTube && apiCheck.tier !== 'pro' && apiCheck.tier !== 'vip') {
      return {
        success: false,
        error:
          'La generación de tarjetas a partir de vídeos de YouTube es exclusiva para miembros PRO. Por favor actualiza tu suscripción en Flashmente PRO para desbloquear esta funcionalidad.',
      };
    }

    // 1. Consultar historial de tarjetas existentes en este mazo para la Memoria de Progreso
    const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);
    const existingTopicsList = extractUniqueTopicsList(existingCards);
    const progressMemoryPrompt = buildProgressMemorySection(existingCards);

    // FASE 3: SALVAVIDAS ANTI-DUPLICACIÓN (LÍMITE DINÁMICO RELAJADO)
    const { directive: targetCountDirective, integrityNote } = buildTargetCountDirective(
      targetCount,
      existingCards.length
    );

    // 2. Procesar instrucción de enfoque
    const focusInstruction = (rawFocus || customPrompt || '').trim();
    const focusRuleSection = focusInstruction
      ? `🚨 REGLA DE ENFOQUE CRÍTICA (PRIORIDAD ABSOLUTA):
El usuario ha indicado la siguiente instrucción de enfoque: "${focusInstruction}".
REGLA ESTRICTA: Debes ignorar el resto del contenido y extraer la información EXCLUSIVAMENTE de los conceptos relacionados con la instrucción solicitada.`
      : '';

    const sourceLabel = isYouTube ? 'Vídeo de YouTube' : 'Enlace Web';
    const sourceRef = isYouTube ? canonicalYouTubeUrl : parsedUrl.href;

    const requestCount = existingCards.length > 0 ? Math.min(30, targetCount + 6) : targetCount;

    const coverageText = existingCards.length > 0
      ? `ATENCIÓN: Este es un lote de continuación sobre ${sourceLabel}. El usuario ya ha extraído ${existingCards.length} tarjetas de los conceptos iniciales. TIENES ESTRICTAMENTE PROHIBIDO repetir preguntas o formular tarjetas equivalentes sobre los conceptos ya evaluados. Avanza en profundidad hacia secciones, detalles y aspectos no explorados previamente.`
      : (focusInstruction
        ? `Debes analizar el contenido dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}"). ${targetCountDirective} Extrae la información EXCLUSIVAMENTE de esa parte.`
        : `Debes analizar el contenido completo. ${targetCountDirective} Cubre los conceptos clave de forma equitativa desde el principio hasta el final del contenido.`);

    const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText} Fuente: ${sourceLabel} ("${sourceRef}").

${RIGOR_WARNING_DIRECTIVE}

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, targetCount, existingCards.length, pedagogicalMode, docenteFormat, targetAudience, false, isPracticalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings como mapa de extracción), "core_exhausted" (booleano con rigor matemático) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa.

${buildLanguageDirective(language)}`;

    const ai = new GoogleGenAI({ apiKey });

    let responseText: string | undefined;

    // =========================================================================
    // ESTRATEGIA PARA YOUTUBE:
    // 1. Primaria: Integración nativa de Gemini con fileUri de YouTube (100% inmune a bloqueos IP de Vercel)
    // 2. Secundaria (Fallback): Extracción de subtítulos vía youtube-transcript
    // =========================================================================
    if (isYouTube) {
      let nativeError: unknown = null;
      try {
        const nativeResponse = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              fileData: {
                fileUri: canonicalYouTubeUrl,
              },
            },
            {
              text: promptText,
            },
          ],
          config: getGeminiConfig(
            cardFormat,
            requestCount,
            existingCards.length,
            coreExhaustedPrevious,
            existingTopicsList,
            false,
            pedagogicalMode,
            docenteFormat,
            targetAudience,
            isPracticalMode
          ),
        });
        responseText = nativeResponse.text;
      } catch (err: unknown) {
        nativeError = err;
        console.warn('Advertencia en integración nativa Gemini YouTube, probando estrategia fallback de transcripción:', err);
      }

      // Si la llamada nativa falló por alguna razón (ej. restricciones del vídeo o API preview), probamos fallback de transcripción
      if (!responseText) {
        let fallbackTranscript = '';
        try {
          const transcriptItems = await YoutubeTranscript.fetchTranscript(canonicalYouTubeUrl);
          if (transcriptItems && transcriptItems.length > 0) {
            fallbackTranscript = transcriptItems
              .map((t) => t.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
        } catch (subErr) {
          console.warn('Fallback youtube-transcript falló también:', subErr);
        }

        if (fallbackTranscript && fallbackTranscript.length >= 50) {
          const truncatedTranscript =
            fallbackTranscript.length > 80000
              ? fallbackTranscript.slice(0, 80000) + '... [truncado por límite]'
              : fallbackTranscript;

          const fallbackResponse = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              {
                text: `${promptText}\n\nTRANSCRIPCIÓN DEL VÍDEO DE YOUTUBE:\n=========================================\n${truncatedTranscript}\n=========================================`,
              },
            ],
            config: getGeminiConfig(
              cardFormat,
              requestCount,
              existingCards.length,
              coreExhaustedPrevious,
              existingTopicsList,
              false,
              pedagogicalMode,
              docenteFormat,
              targetAudience,
              isPracticalMode
            ),
          });
          responseText = fallbackResponse.text;
        } else {
          // Si ni nativo ni fallback pudieron procesar el vídeo
          const nativeMsg = nativeError instanceof Error ? nativeError.message : String(nativeError || '');
          return {
            success: false,
            error: `No se pudo procesar el vídeo de YouTube (${canonicalYouTubeUrl}). Asegúrate de que sea público y accesible. Detalle: ${nativeMsg || 'Vídeo restringido o no disponible para la IA'}. Recuerda que también puedes subir el audio en formato .mp3 en la pestaña "Subir Documento".`,
          };
        }
      }
    } else {
      // =========================================================================
      // ESTRATEGIA PARA ENLACES WEB GENERALES (Artículos, Documentación):
      // Descarga directa con User-Agent y fallback a proxy público si el servidor es bloqueado
      // =========================================================================
      let extractedWebText = '';
      try {
        const res = await fetch(parsedUrl.href, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const html = await res.text();
          extractedWebText = extractTextFromHtml(html);
        }
      } catch (directErr) {
        console.warn('Fallo al obtener URL web de forma directa, intentando proxy:', directErr);
      }

      // Fallback a proxy si la descarga directa fue bloqueada o vacía
      if (!extractedWebText || extractedWebText.length < 50) {
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(parsedUrl.href)}`;
          const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
          if (proxyRes.ok) {
            const html = await proxyRes.text();
            extractedWebText = extractTextFromHtml(html);
          }
        } catch (proxyErr) {
          console.warn('Fallback de proxy falló:', proxyErr);
        }
      }

      if (!extractedWebText || extractedWebText.length < 50) {
        return {
          success: false,
          error:
            'No se pudo extraer suficiente contenido de texto legible de la página web proporcionada. Verifica que el enlace sea público y accesible.',
        };
      }

      const truncatedWebText =
        extractedWebText.length > 80000
          ? extractedWebText.slice(0, 80000) + '... [contenido truncado]'
          : extractedWebText;

      const webResponse = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            text: `${promptText}\n\nCONTENIDO EXTRAÍDO DEL ENLACE WEB:\n=========================================\n${truncatedWebText}\n=========================================`,
          },
        ],
        config: getGeminiConfig(
          cardFormat,
          requestCount,
          existingCards.length,
          coreExhaustedPrevious,
          existingTopicsList,
          false,
          pedagogicalMode,
          docenteFormat,
          targetAudience,
          isPracticalMode
        ),
      });
      responseText = webResponse.text;
    }

    if (!responseText) {
      return { success: false, error: 'Gemini no devolvió contenido de texto para el enlace.' };
    }

    let parsedCards: GeneratedCard[] = [];
    let coreExhausted = false;

    try {
      const parsed = parseGeminiBatchResponse(responseText);
      parsedCards = parsed.cards;
      coreExhausted = parsed.coreExhausted;
      if (parsed.conceptosIdentificados) {
        console.log(
          `[DEBUG - Chain of Thought URL] Conceptos identificados (${parsed.conceptosIdentificados.length}):`,
          parsed.conceptosIdentificados
        );
      }
    } catch (parseError: unknown) {
      console.warn('Fallo al parsear JSON de Gemini en generateCardsFromUrlAction:', parseError);
      const suggestedCount = targetCount >= 20 ? 10 : 5;
      const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
      return {
        success: false,
        error: `El contenido del enlace es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
      };
    }

    const isDocenteModeUrl =
      pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';

    if (isDocenteModeUrl && parsedCards.length > 0) {
      for (const card of parsedCards) {
        if (!card.front || FORMAT_LABEL_REGEX.test(card.front.trim())) {
          card.front = (card.question || '').trim();
        }
        if (!card.question || FORMAT_LABEL_REGEX.test(card.question.trim())) {
          card.question = card.front;
        }
        normalizeDocenteCandidateCard(card);
      }
    }

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: parsedCards,
      existingCards,
      apiKey,
      similarityThreshold: 0.88,
      targetCount,
    });

    if (duplicateCount > 0) {
      console.log(
        `[URL/YouTube] 🛡️ Barrera Determinista activada: Se eliminaron ${duplicateCount} tarjetas duplicadas de la tirada.`
      );
    }

    if (uniqueCards.length < targetCount) {
      coreExhausted = true;
    }

    const processedCards = processGeneratedCards(
      uniqueCards,
      targetCount,
      cardFormat,
      isDocenteModeUrl,
      isDocenteModeUrl
    );

    // Registrar uso en api_limits tras generación exitosa (siempre se cobra cuota, protegiendo la rentabilidad del SaaS)
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processedCards,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al procesar el enlace';
    console.error('Error in generateCardsFromUrlAction:', err);
    return {
      success: false,
      error: `Error al procesar el enlace con Gemini: ${message}`,
    };
  }
}
