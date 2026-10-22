'use server';

import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { YoutubeTranscript } from 'youtube-transcript';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { randomizeMultipleChoiceCard } from '@/lib/cardUtils';
import { deduplicateCandidateCards } from '@/lib/cardDeduplication';
import type {
  CardFormat,
  GeneratedCard,
  GenerateCardsResult,
  MultimodalDocumentInput,
  UrlCardInput,
} from '@/types/cards';

const flashcardSchema = {
  type: Type.OBJECT,
  description: 'Objeto con tarjetas de estudio de alta precisión y radar de profundidad',
  properties: {
    conceptos_identificados: {
      type: Type.ARRAY,
      description:
        'Antes de crear las tarjetas, analiza el texto y haz un listado interno de conceptos clave, datos numéricos o hechos únicos presentes en el texto que NO estén en el historial de tarjetas previas. Usa esta lista como mapa para generar el array de cards.',
      items: {
        type: Type.STRING,
      },
    },
    core_exhausted: {
      type: Type.BOOLEAN,
      description:
        'true ÚNICAMENTE si la LISTA TRONCAL se ha vaciado matemáticamente y todos los conceptos principales del material ya han sido extraídos en tarjetas existentes o en este lote; false si aún queda al menos un concepto troncal por evaluar.',
    },
    cards: {
      type: Type.ARRAY,
      description:
        'Array dinámico con tarjetas de estudio de alta precisión según el formato solicitado (multiple_choice, basic, cloze o true_false). Puede contener cualquier número de tarjetas de 1 a 30 sin longitud fija obligatoria.',
      items: {
        type: Type.OBJECT,
        properties: {
          generation_index: {
            type: Type.INTEGER,
            description:
              'Índice secuencial estricto obligatorio de la tarjeta (1, 2, 3... del lote generado).',
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
          options: {
            type: Type.ARRAY,
            description:
              'Array con las 4 opciones de respuesta exclusivas para preguntas de opción múltiple: [a, b, c, d]. En formatos true_false, basic y cloze este campo DEBE OMITIRSE o dejarse vacío ([]).',
            items: {
              type: Type.STRING,
            },
          },
        },
        required: ['generation_index', 'front', 'back', 'cardFormat'],
      },
    },
  },
  required: ['conceptos_identificados', 'core_exhausted', 'cards'],
};

/**
 * Esquema de extracción universal página por página (sin límites artificiales mínimos ni máximos)
 */
const singlePageExtractionSchema = {
  type: Type.OBJECT,
  description: 'Objeto de extracción universal de conocimiento por página',
  properties: {
    conceptos_identificados: {
      type: Type.ARRAY,
      description:
        'Listado de conceptos clave, datos precisos, normativas o hechos únicos identificados en esta página.',
      items: {
        type: Type.STRING,
      },
    },
    core_exhausted: {
      type: Type.BOOLEAN,
      description:
        'true si la página está casi vacía o se han extraído absolutamente todos sus conceptos relevantes; false si aún contiene información.',
    },
    cards: {
      type: Type.ARRAY,
      description:
        'Array dinámico con todas las tarjetas de estudio extraídas de esta página según el formato solicitado, sin límite máximo ni mínimo artificial.',
      items: {
        type: Type.OBJECT,
        properties: {
          generation_index: {
            type: Type.INTEGER,
            description:
              'Índice secuencial estricto obligatorio de la tarjeta (1, 2, 3... de la página procesada).',
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
          options: {
            type: Type.ARRAY,
            description:
              'Array con las 4 opciones de respuesta exclusivas para preguntas de opción múltiple: [a, b, c, d]. En formatos true_false, basic y cloze este campo DEBE OMITIRSE o dejarse vacío ([]).',
            items: {
              type: Type.STRING,
            },
          },
        },
        required: ['generation_index', 'front', 'back', 'cardFormat'],
      },
    },
  },
  required: ['conceptos_identificados', 'cards'],
};

/**
 * REGLA INQUEBRANTABLE DE RELEVANCIA COGNITIVA:
 * Erradica preguntas sobre artefactos de maquetación, notas al pie editoriales, símbolos tipográficos,
 * índices/glosarios marginales, datos biográficos ficticios o permisos editoriales.
 */
const EDITORIAL_ARTIFACTS_DIRECTIVE = `REGLA DE EXCLUSIÓN DE METADATOS Y ESTRUCTURA EDITORIAL:
- Queda estrictamente PROHIBIDO generar preguntas sobre cajas de 'Términos Clave', vocabularios al margen o listas de conceptos que sirvan de índice en el documento. La evaluación debe versar sobre la explicación teórica, la evidencia o los datos descritos en los párrafos, gráficos y tablas, NUNCA sobre la presencia o ausencia de palabras en un recuadro de términos.
- Queda estrictamente PROHIBIDO generar preguntas sobre datos anecdóticos de personajes ficticios en casos de estudio (ej. peso en la infancia, pertenencia a equipos escolares de personajes ficticios) o notas de créditos editoriales (ej. 'reimpreso con permiso de...'). Concéntrate en la clínica, la patología, la intervención nutricional y el fundamento fisiológico.
- PROHIBICIÓN ESTRICTA SOBRE MENÚS Y DATOS ANECTÓDICOS DE CASOS FICTICIOS:
  * Queda terminantemente PROHIBIDO generar preguntas sobre detalles accesorios o gramaticales de platillos/menús de casos de estudio ficticios (ej. peso en gramos del pan de ajo, tamaño de las albóndigas, marcas de aderezos caseros o ingredientes secundarios de ejemplos narrativos).
  * Las preguntas clínicas deben centrarse EXCLUSIVAMENTE en la patología médica, los requerimientos energéticos/nutricionales oficiales, la fisiología, el cálculo de gasto metabólico o los lineamientos dietéticos universales, NUNCA en la memorización de los gramos de comida descritos en un ejemplo narrativo de personaje.
- Tienes TERMINANTEMENTE PROHIBIDO formular preguntas sobre la estructura editorial o gráfica del documento (por ejemplo: 'según el símbolo †', 'qué indica el asterisco', 'qué significan los números entre paréntesis en la tabla', 'en qué columna se encuentra X', 'según la nota al pie').
- Si una tabla o pie de página contiene datos relevantes (ej. gramos de fibra, dosis clínicas, fechas, normativas), formula la pregunta DIRECTAMENTE sobre el concepto o hecho real (ej: '¿Cuántos gramos de fibra por ración aportan las frambuesas?' en lugar de '¿Qué fruta tiene el valor (4) según el Cuadro 4-3?').
- Pregunta SIEMPRE por el conocimiento sustancial, conceptual y factual, nunca por cómo fue maquetado, listado o simbolizado en el libro.`;

/**
 * Regla de formato obligatoria inyectada dinámicamente en el System Prompt y Reglas Globales.
 */
function getFormatRule(format: CardFormat = 'multiple_choice'): string {
  switch (format) {
    case 'multiple_choice':
      return 'FORMATO OBLIGATORIO: Múltiple opción con exactamente 4 alternativas (a, b, c, d). Cada tarjeta DEBE incluir obligatoriamente el array "options" con las 4 opciones de respuesta. El campo "back" DEBE incluir obligatoriamente la opción correcta seguida de una explicación y justificación técnica profunda.';
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
      return `FORMATO INNEGOCIABLE: multiple_choice (Opción Múltiple / Test):
Cada tarjeta DEBE tener obligatoriamente exactamente 4 opciones de respuesta múltiples (a, b, c, d).

ESTRUCTURA EXACTA DE "front":
[Escribe aquí ÚNICAMENTE el enunciado de la pregunta limpia, sin incluir ninguna letra a, b, c o d]

a) [Texto de la opción A]
b) [Texto de la opción B]
c) [Texto de la opción C]
d) [Texto de la opción D]

REGLAS CRÍTICAS PARA "front":
1. Primero coloca ÚNICAMENTE el enunciado de la pregunta limpia, directo y riguroso.
2. Añade obligatoriamente un salto de línea doble antes de empezar las opciones.
3. Cada una de las exactamente 4 opciones (a, b, c, d) DEBE ir en su propia línea independiente separada por un salto de línea (\\n).
4. NUNCA mezcles las letras a), b), c), d) dentro del enunciado de la pregunta.
5. La opción correcta DEBE estar posicionada de manera aleatoria entre a, b, c o d. Los 3 distractores deben ser técnicamente plausibles y extraídos estrictamente de términos y conceptos presentes en el texto fuente.
6. ${EDITORIAL_ARTIFACTS_DIRECTIVE}

REGLAS CRÍTICAS PARA "back":
El campo 'back' DEBE contener dos partes obligatorias:
1) La opción correcta exacta con su letra y texto (ej: 'd) El germen').
2) Una línea en blanco seguida de: 'Explicación: [Justificación técnica rigurosa extraída del texto, indicando con precisión por qué esta opción es la correcta y desglosando o contextualizando por qué los distractores no aplican según los datos o tablas del documento]'. NUNCA devuelvas solo la letra o frase corta.

- "cardFormat": "multiple_choice"
- "options": Array con exactamente las 4 alternativas [opción A, opción B, opción C, opción D].`;

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
 * DIRECTIVA EXCLUSIVA PARA MODO DOCENTE / DIDÁCTICO:
 * Diseñada para profesores que preparan baterías de ejercicios para sus alumnos a partir de fichas,
 * ejercicios o vocabularios, eliminando referencias de aula y transformando listas en problemas prácticos.
 */
const DIDACTIC_MODE_DIRECTIVE = `DIRECTIVA EXCLUSIVA PARA MODO DOCENTE / DIDÁCTICO:
- Este modo está diseñado para profesores que preparan exámenes y ejercicios para sus estudiantes a partir de fichas de clase, ejercicios o vocabularios.
- PROHIBICIÓN ABSOLUTA DE METADATOS DE AULA: Queda terminantemente PROHIBIDO utilizar fórmulas como 'Según el Bloque X', 'En la Unidad Y', 'En el Ejercicio Z', '¿Cuál es la frase de ejemplo del autor?' o hacer referencia a partes físicas de la ficha. La pregunta debe formularse como un examen directo e independiente.
- TRANSFORMACIÓN EN CASOS PRÁCTICOS Y HUECOS (FILL-IN-THE-BLANK):
  * Si el material contiene vocabulario o idiomas, transforma los ejemplos en frases incompletas con huecos ('______') para que el alumno demuestre el uso real del término en contexto, o formula preguntas de significado/traducción directa e inversa.
  * Queda terminantemente PROHIBIDO generar preguntas sobre símbolos fonéticos o pronunciación figurada escrita (ej. /tiː.tʃər/).
  * Si el material es de ciencias o humanidades, transforma las listas y ejemplos en problemas o preguntas de razonamiento competencial ('¿Qué ocurre si...?', 'Identifica el caso en el que...').`;

const buildSystemPrompt = (
  existingCardsLength: number,
  coreExhaustedPrevious: boolean,
  existingTopicsList: string = '',
  pedagogicalMode?: 'academic' | 'didactic'
) => {
  // 1. EL NÚCLEO DEL COMPORTAMIENTO (Universal y Exhaustivo)
  let prompt = `Eres Flashmente, un motor de extracción de conocimiento de alto rendimiento. Tu objetivo es diseccionar el texto proporcionado y generar tarjetas de estudio (flashcards) rigurosas. No resumas el texto. Actúa como un interrogador minucioso.

REGLA DE EXHAUSTIVIDAD Y DUPLICADOS (CRÍTICA):
Está PERMITIDO y FOMENTADO extraer múltiples tarjetas sobre el mismo concepto o tema central, siempre y cuando evalúen EJES DIFERENTES. Es decir, puedes crear una tarjeta sobre la causa/origen, otra sobre la consecuencia/efecto, otra sobre la excepción, otra sobre los valores numéricos o fechas, y otra sobre la definición general de ese mismo tema. 
Un duplicado ES SOLO una pregunta que se repite casi de forma literal y que tiene exactamente la misma respuesta literal que otra anterior. Disecciona el texto de forma exhaustiva, no dejes ningún dato preguntable atrás.

ADAPTACIÓN UNIVERSAL AL CONTEXTO:
El texto puede ser de cualquier temática (ciencias, derecho, historia, tecnología, humanidades). Adapta tu análisis a la naturaleza del texto buscando activamente:
- Relaciones causa-efecto o condicionales (si ocurre X, entonces Y).
- Clasificaciones, tipologías y listas estructuradas.
- Excepciones a reglas generales, notas al pie y datos estadísticos/numéricos.
- Conceptos técnicos, definiciones y normativas.
No asumas conocimientos externos. Extrae la información estrictamente del texto provisto.
\n`;

  // 2. LÓGICA DINÁMICA DE ENFOQUE (Tiradas)
  // En lugar de asumir en qué "tirada" estamos por un número, nos basamos en 
  // si la IA reportó previamente que el núcleo estaba agotado.
  
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
    prompt += `\nINSTRUCCIÓN DE CONTINUIDAD: Ya has evaluado los siguientes conceptos: ${topicsFormatted}. Te EXIJO que mires el texto original, identifiques conceptos, datos o relaciones que no estén en esta lista, y extraigas nuevas tarjetas sobre ellos.\n`;
  }

  if (pedagogicalMode === 'didactic') {
    prompt += `\n${DIDACTIC_MODE_DIRECTIVE}\n`;
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
  pedagogicalMode?: 'academic' | 'didactic'
): string {
  const formatRule = getFormatRule(format);
  const countStr = requestedCount ? String(requestedCount) : '{requested_count}';
  const isReGeneration = existingCardsCount > 0;

  const cardRequirement = isReGeneration
    ? (format === 'multiple_choice'
        ? `array dinámico de hasta ${countStr} tarjetas según formato multiple_choice con sus 4 opciones, respuesta correcta y generation_index del 1 al N`
        : `array dinámico de hasta ${countStr} tarjetas formuladas según el formato "${format}" y generation_index del 1 al N`)
    : (format === 'multiple_choice'
        ? `array con exactamente ${countStr} tarjetas según formato multiple_choice con sus 4 opciones, respuesta correcta y generation_index del 1 al ${countStr}`
        : `array con exactamente ${countStr} tarjetas formuladas estrictamente según el formato "${format}" y generation_index del 1 al ${countStr}`);

  const directiveRule = isReGeneration
    ? `2. DIRECTIVA DE EXPANSIÓN Y ANTI-DUPLICADOS: Intenta alcanzar hasta ${countStr} tarjetas nuevas basándote en conceptos aún no evaluados y datos visuales. SIN EMBARGO, ATENCIÓN: EL ESQUEMA JSON TE PERMITE DEVOLVER MENOS DE 30 TARJETAS. SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas). NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA.
3. ÍNDICE DE SEGUIMIENTO: Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación cuando alcances las ${countStr} tarjetas o cuando hayas evaluado todos los conceptos únicos posibles sin duplicar nada del historial.`
    : `2. DIRECTIVA CRÍTICA: DEBES GENERAR EXACTAMENTE ${countStr} TARJETAS. ES ESTRICTAMENTE PROHIBIDO DETENERSE ANTES. Si agotas los conceptos troncales, estás OBLIGADO a extraer detalles minuciosos, excepciones y estadísticas hasta alcanzar el objetivo exacto. Cerrar la respuesta con menos tarjetas de las solicitadas se considerará un fallo crítico.
3. ÍNDICE DE SEGUIMIENTO OBLIGATORIO: Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). No puedes finalizar el proceso hasta que el \`generation_index\` coincida con el número total de tarjetas solicitado (${countStr}).`;

  const didacticRule = pedagogicalMode === 'didactic' ? `\n\n9. ${DIDACTIC_MODE_DIRECTIVE}` : '';

  return `REGLAS GLOBALES INQUEBRANTABLES DE BLINDAJE (ESTILO NOTEBOOKLM):
1. REGLA DE ORO (Estilo NotebookLM): NO inventes información. Tu única fuente de verdad es el texto. Si un concepto, dato o respuesta no se puede deducir directa y explícitamente del texto proporcionado, DEBES omitirlo. No uses conocimiento previo externo.
${directiveRule}
4. ${formatRule}
5. PRECISIÓN Y GROUNDING: Toda pregunta, afirmación, distractor o respuesta debe estar basada estricta y textualmente en el texto fuente.
6. ACRÓNIMOS: Todo acrónimo debe ir acompañado obligatoriamente de su nombre completo si figura en la fuente (ejemplo: "ARN (Ácido Ribonucleico)", "TCP (Transmission Control Protocol)").
7. INTEGRIDAD ESTRUCTURAL DEL JSON (PRIORIDAD ABSOLUTA): Debes devolver un objeto JSON válido con los campos "conceptos_identificados" (array de strings con conceptos clave no evaluados), "core_exhausted" (booleano) y "cards" (${cardRequirement}). Sé sintético y directo en el enunciado de las preguntas y opciones, y riguroso, explicativo y profundamente justificado en el reverso ("back"), incluyendo siempre la justificación técnica basada en la fuente.
8. ${EDITORIAL_ARTIFACTS_DIRECTIVE}${didacticRule}`;
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
 * SALVAVIDAS ANTI-DUPLICACIÓN (LÍMITE DINÁMICO RELAJADO):
 * Construye la directiva de cuota de tarjetas para Gemini:
 * - Si es la primera generación (historial vacío): Mantiene la directiva estricta de generar exactamente targetCount.
 * - Si no es la primera generación (el array de historial tiene tarjetas): Relaja la cuota mediante la directiva de
 *   expansión, autorizando a detenerse antes de la cuota si se agotaron los conceptos para erradicar duplicados.
 */
function buildTargetCountDirective(
  targetCount: number,
  existingCardsCount: number
): { directive: string; integrityNote: string } {
  const isFirstGeneration = existingCardsCount === 0;

  if (isFirstGeneration) {
    return {
      directive: `DIRECTIVA CRÍTICA: DEBES GENERAR EXACTAMENTE ${targetCount} TARJETAS. ES ESTRICTAMENTE PROHIBIDO DETENERSE ANTES. Si agotas los conceptos troncales, estás OBLIGADO a extraer detalles minuciosos, excepciones y estadísticas hasta alcanzar el objetivo exacto. Cerrar la respuesta con menos tarjetas de las solicitadas se considerará un fallo crítico.

ÍNDICE DE SEGUIMIENTO OBLIGATORIO:
Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). No puedes finalizar el proceso hasta que el \`generation_index\` coincida con el número total de tarjetas solicitado (${targetCount}).`,
      integrityNote: `array con EXACTAMENTE ${targetCount} tarjetas únicas del formato`,
    };
  }

  return {
    directive: `DIRECTIVA DE EXPANSIÓN (ANTI-DUPLICADOS): Intenta alcanzar hasta ${targetCount} tarjetas nuevas basándote en detalles minuciosos y datos de las imágenes. SIN EMBARGO:
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
 * Extrae de forma concisa el tópico o concepto principal de una tarjeta previa para no saturar el contexto de la IA.
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

  // Limitar longitud para mantener el listado de tópicos compacto y de alta densidad
  if (text.length > 70) {
    const cut = text.slice(0, 70);
    const lastSpace = cut.lastIndexOf(' ');
    text = (lastSpace > 25 ? cut.slice(0, lastSpace) : cut) + '...';
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
 * Normaliza y procesa las tarjetas generadas garantizando la estructura de 4 opciones para preguntas tipo test.
 */
function processGeneratedCards(
  parsedCards: GeneratedCard[],
  targetCount: number,
  cardFormat: CardFormat
): GeneratedCard[] {
  return parsedCards.slice(0, targetCount).map((card, idx) => {
    let front = card.front.trim();
    const back = card.back.trim();
    const resolvedFormat = (card.cardFormat as CardFormat) || cardFormat;

    const isMultipleChoice = resolvedFormat === 'multiple_choice';

    // Si el modelo devolvió options en un array y front no tiene aún las opciones a), b), c), d), formatearlas
    if (
      isMultipleChoice &&
      card.options &&
      Array.isArray(card.options) &&
      card.options.length >= 4 &&
      !/(?:^|\n)\s*[a-d]\)/i.test(front)
    ) {
      const letters = ['a', 'b', 'c', 'd'];
      const formattedOpts = card.options
        .slice(0, 4)
        .map((opt, i) => `${letters[i]}) ${String(opt).replace(/^[a-d][\)\.\:\-]\s*/i, '').trim()}`)
        .join('\n');
      front = `${front}\n\n${formattedOpts}`;
    }

    const cleaned: GeneratedCard = {
      generation_index: typeof card.generation_index === 'number' ? card.generation_index : idx + 1,
      front,
      back,
      cardFormat: resolvedFormat,
      cardType: resolvedFormat === 'cloze' ? 'cloze' : 'basic',
      // Blindaje de backend: solo multiple_choice puede conservar options; en cualquier otro formato se descarta
      options:
        isMultipleChoice && card.options && Array.isArray(card.options)
          ? card.options.map(String)
          : undefined,
    };

    return randomizeMultipleChoiceCard(cleaned);
  });
}

interface ParsedGeminiBatch {
  cards: GeneratedCard[];
  coreExhausted: boolean;
  conceptosIdentificados?: string[];
}

/**
 * Parsea y valida de forma resiliente la respuesta JSON de Gemini para un lote individual.
 * Elimina bloques de formato markdown si están presentes y extrae el array de tarjetas y el estado de agotamiento troncal.
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
    | { conceptos_identificados?: string[]; core_exhausted?: boolean; cards?: GeneratedCard[] }
    | GeneratedCard[];

  let cards: GeneratedCard[] = [];
  let coreExhausted = false;
  let conceptosIdentificados: string[] | undefined;

  if (Array.isArray(parsedData)) {
    cards = parsedData;
  } else if (parsedData && Array.isArray(parsedData.cards)) {
    cards = parsedData.cards;
    coreExhausted = Boolean(parsedData.core_exhausted);
    if (Array.isArray(parsedData.conceptos_identificados)) {
      conceptosIdentificados = parsedData.conceptos_identificados;
    }
  } else {
    throw new Error('El JSON devuelto no contiene un array de tarjetas válido.');
  }

  if (cards.length === 0) {
    throw new Error('El array de tarjetas devuelto por Gemini está vacío.');
  }

  return {
    cards,
    coreExhausted,
    conceptosIdentificados,
  };
}

/**
 * Modelo global de Google Gemini unificado para rentabilidad y generaciones ilimitadas sostenibles.
 */
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Configuración estricta de Gemini generada dinámicamente según el formato de tarjeta:
 * - temperature: 0.1 para forzar respuestas deterministas, eliminar la creatividad y evitar alucinaciones.
 * - responseMimeType: 'application/json' y responseJsonSchema: flashcardSchema para forzar la estructura de salida con Chain of Thought.
 * - systemInstruction: System Prompt adaptado dinámicamente con buildSystemPrompt basándose en coreExhaustedPrevious e historial sintetizado en tópicos.
 */
function getGeminiConfig(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0,
  coreExhaustedPrevious: boolean = false,
  existingTopicsList: string = '',
  isExhaustiveMode: boolean = false,
  pedagogicalMode?: 'academic' | 'didactic'
) {
  void format;
  void requestedCount;
  return {
    systemInstruction: buildSystemPrompt(existingCardsCount, coreExhaustedPrevious, existingTopicsList, pedagogicalMode),
    temperature: isExhaustiveMode ? 0.1 : 0.15,
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
      const count = isSameMonth ? generationsCount : 0;

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
      // Si generations_count >= 50 -> LIMIT_REACHED
      if (count >= 50) {
        return { error: 'LIMIT_REACHED' };
      }

      // Si generations_count < 50: verificar bonus_credits
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
    const { error: rpcErr } = await supabase.rpc('increment_api_generation', {
      p_user_id: userId,
    });

    if (rpcErr) {
      console.error('Advertencia al invocar increment_api_generation RPC:', rpcErr);
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: rec } = await supabase
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
          await supabase.from('api_limits').update({
            generations_count: currentCount + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        } else if (welcome < 5) {
          // Fase Bienvenida: suma 1 a welcome_generations y NO altera generations_count
          await supabase.from('api_limits').update({
            welcome_generations: welcome + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        } else {
          // Fase Ads: resta 1 a bonus_credits y suma 1 a generations_count
          await supabase.from('api_limits').update({
            bonus_credits: Math.max(0, bonus - 1),
            generations_count: currentCount + 1,
            last_generation_date: todayStr,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
        }
      } else {
        await supabase.from('api_limits').upsert({
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
  pedagogicalMode: 'academic' | 'didactic' = 'academic'
): Promise<GenerateCardsResult> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    return { success: false, error: 'Por favor introduce un tema para generar tarjetas.' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
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

  // Límite seguro de 30 tarjetas por petición para evitar saturación y truncamientos
  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

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

${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings), "core_exhausted" (booleano) y "cards" (${note1} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N).

${languageDirective}`;

      const prompt2 = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
${dir2}

ENFOQUE DE PARTICIÓN CONCURRENTE (LOTE 2/2): Concéntrate en el DIAGNÓSTICO, TRATAMIENTO, CRITERIOS CLÍNICOS, CASOS ESPECIALES Y EXCEPCIONES sobre el tema: "${cleanTopic}".

${RIGOR_WARNING_DIRECTIVE}

${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings), "core_exhausted" (booleano) y "cards" (${note2} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N).

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
            pedagogicalMode
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
            pedagogicalMode
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

${getGlobalRules(cardFormat, requestCount, existingCards.length, pedagogicalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings como mapa de extracción), "core_exhausted" (booleano) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para asegurar que las tarjetas quepan dentro del límite sin truncarse, formula preguntas, textos, opciones (si aplica) y respuestas directas y concisas.

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
          pedagogicalMode
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

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: candidateCards,
      existingCards,
      apiKey,
      similarityThreshold: 0.80,
      targetCount,
    });

    if (duplicateCount > 0) {
      console.log(
        `[Tema] 🛡️ Barrera Determinista activada: Se eliminaron ${duplicateCount} tarjetas duplicadas de la tirada.`
      );
    }

    const processedCards = processGeneratedCards(uniqueCards, targetCount, cardFormat);

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
    pedagogicalMode = 'academic',
  } = input;

  if (!storagePath && !signedUrl) {
    return { success: false, error: 'Ruta de archivo de Supabase Storage no proporcionada.' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
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

  // Límite seguro de 30 tarjetas por petición para evitar saturación y truncamientos
  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

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

    const base64Data = Buffer.from(fileArrayBuffer).toString('base64');

    // 2. Normalizar tipo MIME soportado
    let normalizedMime = mimeType;
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') normalizedMime = 'application/pdf';
      else if (ext === 'docx') normalizedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'doc') normalizedMime = 'application/msword';
      else if (ext === 'mp3') normalizedMime = 'audio/mpeg';
      else if (ext === 'wav') normalizedMime = 'audio/wav';
      else if (ext === 'txt') normalizedMime = 'text/plain';
    }

    // Identificar si es un documento de Word (.docx o .doc)
    const isWordDocument =
      normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalizedMime === 'application/msword' ||
      Boolean(fileName && /\.(docx|doc)$/i.test(fileName));

    let extractedWordText = '';
    if (isWordDocument) {
      try {
        const fileBuffer = Buffer.from(fileArrayBuffer);
        const mammothResult = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedWordText = (mammothResult.value || '').trim();
      } catch (docxErr) {
        console.warn('Advertencia al extraer texto con mammoth de documento Word:', docxErr);
      }

      // Fallback para documentos Word binarios .doc o si mammoth no extrajo suficiente texto
      if (!extractedWordText || extractedWordText.length < 20) {
        try {
          const rawBuffer = Buffer.from(fileArrayBuffer);
          const rawString = rawBuffer.toString('utf-8');
          const cleanedString = rawString
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          if (cleanedString.length > extractedWordText.length) {
            extractedWordText = cleanedString;
          }
        } catch (rawErr) {
          console.warn('Fallback de extracción binaria falló:', rawErr);
        }
      }

      if (!extractedWordText || extractedWordText.length < 10) {
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

      // 2. Historial de tarjetas existentes en este mazo para el Gatekeeper
      const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);

      // 3. Directiva de Extracción: 'Modo Exhaustivo Forzado' vs 'Libertad Universal Estándar'
      const universalDirective = `Tu objetivo es extraer TODOS los conceptos clave, datos precisos, normativas o hechos únicos de esta página, sin importar la temática del documento. No tienes un límite máximo por página. Si encuentras tablas, cronologías, gráficos o listas, extrae absolutamente todos los datos relevantes posibles. SIN EMBARGO, tienes ESTRICTAMENTE PROHIBIDO inventar información o hacer preguntas triviales de relleno. Si la página está casi vacía (ej. una portada, un índice o fotos decorativas), devuelve únicamente las preguntas válidas que encuentres, o un array vacío []. Sé implacable y exhaustivo donde haya conocimiento real, y conservador donde no lo haya.

${EDITORIAL_ARTIFACTS_DIRECTIVE}`;

      const exhaustiveDirective = `🚨 MODO EXHAUSTIVO FORZADO: Anula cualquier instrucción de resumen, brevedad o selección pedagógica. Extrae una tarjeta por cada dato, celda de tabla, gráfica o cruce de información sin omitir nada. Prioriza la exhaustividad sobre la síntesis. Analiza profundamente todo el texto de la página extrayendo cualquier concepto, normativa o dato clave. Si encuentras tablas, gráficos o listas, actúa como un extractor implacable: extrae tarjetas individuales cruzando absolutamente TODOS los datos posibles de celdas, filas y columnas, sin resumir ni agrupar. No dejes ningún dato estructurado ni textual relevante sin extraer. Tienes terminantemente prohibido omitir datos o resumir información por considerarla secundaria.

${EDITORIAL_ARTIFACTS_DIRECTIVE}`;

      let singlePageSystemPrompt = '';

      if (focusInstruction) {
        singlePageSystemPrompt += `🚨 FILTRO DE ENFOQUE TEMÁTICO (PRIORIDAD ABSOLUTA):
El usuario ha establecido el siguiente enfoque temático: "${focusInstruction}".
Esta instrucción tiene PRIORIDAD ABSOLUTA y actúa como un filtro estricto sobre la extracción por defecto. Debes extraer conceptos clave, datos, tablas, normativas o hechos de esta página EXCLUSIVAMENTE o prioritariamente alineados con este enfoque. Si esta página no contiene información relacionada con dicho enfoque, no inventes preguntas ni introduzcas datos de relleno: devuelve un array vacío [] en "cards".\n\n`;
      }

      if (pedagogicalMode === 'didactic') {
        singlePageSystemPrompt += `${DIDACTIC_MODE_DIRECTIVE}\n\n`;
      }

      // Si el modo exhaustivo está activo, REEMPLAZA la directiva estándar para anular cualquier síntesis pedagógica o brevedad
      if (isExhaustiveMode) {
        singlePageSystemPrompt += `${exhaustiveDirective}\n\n`;
      } else {
        singlePageSystemPrompt += `${universalDirective}\n\n`;
      }

      singlePageSystemPrompt += `${getFormatRule(cardFormat)}`;
      singlePageSystemPrompt += `\n${getFormatInstructions(cardFormat)}`;
      singlePageSystemPrompt += `\n\nREGLA DE INTEGRIDAD: Devuelve un objeto JSON estructurado con "conceptos_identificados" (array de strings con los conceptos encontrados en esta página), "core_exhausted" (booleano) y "cards" (array dinámico con todas las tarjetas extraídas sin límite máximo ni mínimo artificial, formuladas según el formato "${cardFormat}").`;
      if (pedagogicalMode === 'didactic') {
        singlePageSystemPrompt += `\nRECORDATORIO MODO DOCENTE / DIDÁCTICO: Transforma el contenido en ejercicios y preguntas de examen prácticas para alumnos, omitiendo metadatos de aula (ejercicios, bloques, unidades) y omitiendo preguntas sobre transcripciones fonéticas.`;
      }
      if (isExhaustiveMode) {
        singlePageSystemPrompt += `\nRECORDATORIO MODO EXHAUSTIVO: Extrae cada celda, fila, columna y dato sustancial sin resumir ni abreviar, priorizando el conocimiento pedagógico real y respetando la prohibición estricta de metadatos o recuadros de vocabulario al margen.`;
      }
      singlePageSystemPrompt += buildLanguageDirective(language);

      // 4. Bucle Secuencial (Backend):
      // while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage)
      // En cada iteración del bucle, corta y envía a Gemini EXACTAMENTE 1 PÁGINA sin límites artificiales por página.
      let tarjetasAcumuladas: GeneratedCard[] = [];
      let currentPage = startPage;
      let lastProcessedPage = currentPage;

      console.log(
        `[Bucle Acumulador Backend] Iniciando: Desde pág. ${startPage} hasta pág. ${finalPage}. Meta: ${targetCount} tarjetas.`
      );

      while (tarjetasAcumuladas.length < targetCount && currentPage <= finalPage) {
        lastProcessedPage = currentPage;
        const remainingToTarget = targetCount - tarjetasAcumuladas.length;

        console.log(
          `[Bucle Acumulador Backend] Procesando Página ${currentPage} de ${finalPage}... (Acumuladas: ${tarjetasAcumuladas.length}/${targetCount}, Restan: ${remainingToTarget})`
        );

        // Cortar EXACTAMENTE 1 PÁGINA
        const singlePageBase64 = await sliceSinglePdfPage(srcDoc, currentPage);

        const exhaustiveQuotaMandate = isExhaustiveMode
          ? `\n\n🚨 DIRECTIVA DE COBERTURA Y CALIDAD (CUOTA RESTANTE: ${remainingToTarget} TARJETAS):
- Si la página contiene tablas, matrices de datos o clasificaciones densas, extrae preguntas independientes de tantas filas y cruces numéricos como existan hasta cumplir la cuota requerida.
- Si la página es texto continuo (prosa/teoría), extrae con rigor quirúrgico cada dato fáctico, definición, mecanismo y excepción relevante.
- IMPORTANTE: No dupliques preguntas con diferente redacción ni inventes preguntas sobre listas de palabras al margen para alcanzar un número artificial. Si has extraído todos los hechos sustanciales de esta página, concluye tu respuesta; el motor secuencial del servidor continuará acumulando tarjetas en las siguientes páginas del documento hasta completar el objetivo.`
          : '';

        const currentPageSystemPrompt = `${singlePageSystemPrompt}${exhaustiveQuotaMandate}`;

        const pageUserPrompt = isExhaustiveMode
          ? `Analiza la Página ${currentPage} del documento adjunto aplicando la DIRECTIVA DE COBERTURA Y CALIDAD (cuota restante: ${remainingToTarget} tarjetas). ${pedagogicalMode === 'didactic' ? 'Aplica la DIRECTIVA DE MODO DOCENTE / DIDÁCTICO para crear ejercicios prácticos de evaluación sin metadatos de aula. ' : ''}Si hay tablas o matrices de datos, extrae preguntas independientes por cada fila o cruce numérico. Si es texto continuo, extrae hechos y definiciones sustanciales sin duplicar ni inventar preguntas sobre términos al margen, concluyendo cuando los datos sustanciales se agoten para que el servidor avance de página. Formato: "${cardFormat}".`
          : `Analiza la Página ${currentPage} del documento adjunto y extrae todos los conceptos clave, datos precisos, normativas o hechos únicos posibles en formato "${cardFormat}".${pedagogicalMode === 'didactic' ? ' Aplica el Modo Docente / Didáctico: preguntas prácticas de examen sin metadatos de aula.' : ''}`;

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
              temperature: isExhaustiveMode ? 0.1 : 0.15,
              responseMimeType: 'application/json',
              responseJsonSchema: singlePageExtractionSchema,
              maxOutputTokens: 8192,
            },
          });

          if (pageResponse.text) {
            try {
              const parsed = parseGeminiBatchResponse(pageResponse.text);
              pageCandidateCards = parsed.cards || [];
              console.log(
                `[Bucle Acumulador Backend] Página ${currentPage}: Gemini devolvió ${pageCandidateCards.length} tarjetas brutas.`
              );
            } catch (parseErr) {
              console.warn(
                `[Bucle Acumulador Backend] Página ${currentPage}: Sin tarjetas válidas o poca información:`,
                parseErr
              );
            }
          }
        } catch (geminiErr) {
          console.warn(
            `[Bucle Acumulador Backend] Error en llamada a Gemini para Página ${currentPage}:`,
            geminiErr
          );
        }

        // Acumulación y Deduplicación:
        // Evaluamos todas las tarjetas candidatas de la página sin imponer un tope artificial dentro de deduplicateCandidateCards.
        if (pageCandidateCards.length > 0) {
          const combinedHistory = [
            ...existingCards,
            ...tarjetasAcumuladas.map((c) => ({ front: c.front, back: c.back })),
          ];

          const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
            candidateCards: pageCandidateCards,
            existingCards: combinedHistory,
            apiKey,
            similarityThreshold: isExhaustiveMode ? 0.92 : 0.80,
            isExhaustiveMode,
          });

          if (duplicateCount > 0) {
            console.log(
              `[Bucle Acumulador Backend] Página ${currentPage}: Gatekeeper filtró ${duplicateCount} duplicados.`
            );
          }

          if (uniqueCards.length > 0) {
            tarjetasAcumuladas.push(...uniqueCards);
            console.log(
              `[Bucle Acumulador Backend] Página ${currentPage}: Se acumularon ${uniqueCards.length} tarjetas únicas. Total acumulado: ${tarjetasAcumuladas.length}/${targetCount}.`
            );
          }
        }

        // Si al sumar se supera el targetCount, recorta el array exactamente al límite solicitado
        if (tarjetasAcumuladas.length > targetCount) {
          tarjetasAcumuladas = tarjetasAcumuladas.slice(0, targetCount);
        }

        // Si alcanzamos el límite exacto de tarjetas solicitadas para este lote, detenemos el bucle
        if (tarjetasAcumuladas.length >= targetCount) {
          console.log(
            `[Bucle Acumulador Backend] 🎯 Objetivo alcanzado: ${tarjetasAcumuladas.length} tarjetas exactas en Página ${currentPage}.`
          );
          break;
        }

        currentPage++;
      }

      if (tarjetasAcumuladas.length === 0) {
        return {
          success: false,
          error: `No se pudieron extraer tarjetas únicas del rango procesado (págs. ${startPage} a ${lastProcessedPage}). Comprueba que las páginas contengan texto con información relevante y no estén ya en el mazo.`,
          nextCursorPage: lastProcessedPage,
          startCursorPage: startPage,
        };
      }

      const processedCards = processGeneratedCards(tarjetasAcumuladas, targetCount, cardFormat);

      // Registrar uso en api_limits (1 crédito gastado por tirada exitosa)
      if (apiCheck) {
        await recordApiUsage(apiCheck.userId);
      }

      const isExhausted = tarjetasAcumuladas.length < targetCount && lastProcessedPage >= finalPage;

      // Retorno del Cursor (El Marcapáginas):
      // El Server Action debe devolver al cliente la página exacta donde se detuvo el bucle (nextCursorPage).
      return {
        success: true,
        core_exhausted: isExhausted,
        cards: processedCards,
        nextCursorPage: lastProcessedPage,
        startCursorPage: startPage,
      };
    }

    // FASE 2: Fallback para documentos que no sean PDF (Word, Audio, TXT)
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

      let contentsBatch1: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>;
      let contentsBatch2: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>;

      if (isWordDocument) {
        const halfLen = Math.floor(extractedWordText.length / 2);
        const splitIdx = extractedWordText.indexOf('\n\n', halfLen);
        const effectiveSplit = splitIdx !== -1 && splitIdx < extractedWordText.length * 0.75 ? splitIdx : halfLen;
        const wordPart1 = extractedWordText.slice(0, effectiveSplit);
        const wordPart2 = extractedWordText.slice(effectiveSplit);

        const prompt1 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (1/2): Concéntrate en la PRIMERA MITAD del documento. ${dirBatch1} ${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;
        const prompt2 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (2/2): Concéntrate en la SEGUNDA MITAD del documento. ${dirBatch2} ${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;

        contentsBatch1 = [{ text: `${prompt1}\n\n${wordPart1}` }];
        contentsBatch2 = [{ text: `${prompt2}\n\n${wordPart2}` }];
      } else {
        const prompt1 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (1/2): Concéntrate en la primera mitad del audio/archivo. ${dirBatch1} ${getGlobalRules(cardFormat, batch1Target, existingCards.length, pedagogicalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;
        const prompt2 = `Eres un pedagogo experto en diseño pedagógico. LOTE PARALELO (2/2): Concéntrate en la segunda mitad del audio/archivo. ${dirBatch2} ${getGlobalRules(cardFormat, batch2Target, existingCards.length, pedagogicalMode)} ${getFormatInstructions(cardFormat)} ${buildLanguageDirective(language)}`;

        contentsBatch1 = [{ inlineData: { data: base64Data, mimeType: normalizedMime } }, { text: prompt1 }];
        contentsBatch2 = [{ inlineData: { data: base64Data, mimeType: normalizedMime } }, { text: prompt2 }];
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
            pedagogicalMode
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
            pedagogicalMode
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

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, requestCount, existingCards.length, pedagogicalMode)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "conceptos_identificados" (array de strings como mapa de extracción), "core_exhausted" (booleano con rigor matemático) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa.

${buildLanguageDirective(language)}`;

      let contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>;

      if (isWordDocument) {
        contents = [
          {
            text: `${promptText}\n\n=========================================\nCONTENIDO DEL DOCUMENTO DE WORD:\n=========================================\n${extractedWordText}\n=========================================`,
          },
        ];
      } else {
        contents = [
          {
            inlineData: {
              data: base64Data,
              mimeType: normalizedMime,
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
          pedagogicalMode
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

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: candidateCards,
      existingCards,
      apiKey,
      similarityThreshold: isExhaustiveMode ? 0.92 : 0.80,
      targetCount,
      isExhaustiveMode,
    });

    if (duplicateCount > 0) {
      console.log(
        `[Documento] 🛡️ Barrera Determinista activada: Se eliminaron ${duplicateCount} tarjetas duplicadas de la tirada.`
      );
    }

    const processedCards = processGeneratedCards(uniqueCards, targetCount, cardFormat);

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
    pedagogicalMode = 'academic',
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

  const apiKey = process.env.GEMINI_API_KEY;
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

  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

  try {
    const youtubeVideoId = extractYouTubeVideoId(parsedUrl.href);
    const isYouTube = Boolean(youtubeVideoId);
    const canonicalYouTubeUrl = youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : '';

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

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, targetCount, existingCards.length, pedagogicalMode)}

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
            pedagogicalMode
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
              existingTopicsList
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
          pedagogicalMode
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

    // =========================================================================
    // BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA (Gatekeeper Anti-Duplicados)
    // =========================================================================
    const { uniqueCards, duplicateCount } = await deduplicateCandidateCards({
      candidateCards: parsedCards,
      existingCards,
      apiKey,
      similarityThreshold: 0.80,
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

    const processedCards = processGeneratedCards(uniqueCards, targetCount, cardFormat);

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
