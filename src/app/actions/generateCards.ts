'use server';

import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { YoutubeTranscript } from 'youtube-transcript';
import { supabase } from '@/lib/supabase';
import { randomizeMultipleChoiceCard } from '@/lib/cardUtils';
import type {
  CardFormat,
  GeneratedCard,
  GenerateCardsResult,
  MultimodalDocumentInput,
  UrlCardInput,
} from '@/types/cards';

const flashcardSchema = {
  type: Type.OBJECT,
  description: 'Objeto con tarjetas de estudio clínico y académico y radar de profundidad',
  properties: {
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
            description: 'Reverso de la tarjeta con la respuesta exacta según el formato indicado.',
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
  required: ['core_exhausted', 'cards'],
};

/**
 * Regla de formato obligatoria inyectada dinámicamente en el System Prompt y Reglas Globales.
 */
function getFormatRule(format: CardFormat = 'multiple_choice'): string {
  switch (format) {
    case 'multiple_choice':
      return 'FORMATO OBLIGATORIO: Múltiple opción con exactamente 4 alternativas (a, b, c, d). Cada tarjeta DEBE incluir obligatoriamente el array "options" con las 4 opciones de respuesta.';
    case 'true_false':
      return `FORMATO OBLIGATORIO: Afirmación categórica. 
- El campo 'front' DEBE contener la afirmación.
- El campo 'back' DEBE ser exactamente la palabra 'Verdadero' o 'Falso'.
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]). BAJO NINGÚN CONCEPTO generes opciones A, B, C, D.`;
    case 'cloze':
      return 'FORMATO OBLIGATORIO: Texto con una palabra clave o concepto fundamental oculto (ej. usando corchetes [...] o el estándar que utilice el frontend). PROHIBIDO terminantemente generar 4 opciones de respuesta o formato de test múltiple. REGLA CRÍTICA: El array \'options\' DEBE SER OMITIDO o estar VACÍO ([]).';
    case 'basic':
    default:
      return 'FORMATO OBLIGATORIO: Pregunta directa y concisa en el anverso, y respuesta exacta en el reverso. PROHIBIDO terminantemente generar 4 opciones de respuesta o formato de test múltiple. REGLA CRÍTICA: El array \'options\' DEBE SER OMITIDO o estar VACÍO ([]).';
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
1. Primero coloca ÚNICAMENTE el enunciado de la pregunta limpia, directo, clínico y riguroso.
2. Añade obligatoriamente un salto de línea doble antes de empezar las opciones.
3. Cada una de las exactamente 4 opciones (a, b, c, d) DEBE ir en su propia línea independiente separada por un salto de línea (\\n).
4. NUNCA mezcles las letras a), b), c), d) dentro del enunciado de la pregunta.
5. La opción correcta DEBE estar posicionada de manera aleatoria entre a, b, c o d. Los 3 distractores deben ser técnicamente plausibles y extraídos estrictamente de términos y conceptos presentes en el texto fuente.
- "back": SOLAMENTE la respuesta correcta indicando letra y texto (ejemplo: "b) Texto de la opción correcta"). No agregues texto innecesario.
- "cardFormat": "multiple_choice"
- "options": Array con exactamente las 4 alternativas [opción A, opción B, opción C, opción D].`;

    case 'cloze':
      return `FORMATO OBLIGATORIO: cloze (Texto para rellenar / Cloze):
PROHIBIDO terminantemente generar opciones múltiples (a, b, c, d).
- "front": Un texto explicativo riguroso con una palabra o frase clave oculta usando obligatoriamente la notación [...] (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina [...]").
- "back": El texto completo donde la palabra o frase clave revelada esté claramente resaltada con doble asterisco (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina **fotosíntesis**").
- "cardFormat": "cloze"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]).`;

    case 'true_false':
      return `FORMATO OBLIGATORIO: true_false (Verdadero o Falso):
PROHIBIDO terminantemente generar 4 opciones múltiples (a, b, c, d).
- "front": Una afirmación técnica o conceptual rotunda (que puede ser verdadera o falsa según el temario).
- "back": Debe ser exactamente la palabra "Verdadero" o "Falso".
- "cardFormat": "true_false"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]). BAJO NINGÚN CONCEPTO generes opciones A, B, C, D.`;

    case 'basic':
    default:
      return `FORMATO OBLIGATORIO: basic (Pregunta y Respuesta Directa):
PROHIBIDO terminantemente generar opciones múltiples (a, b, c, d).
- "front": Pregunta directa, específica y concisa para evaluar el concepto.
- "back": Respuesta rigurosa, comprensiva y directa.
- "cardFormat": "basic"
- REGLA CRÍTICA: El array 'options' DEBE SER OMITIDO o estar VACÍO ([]).`;
  }
}

/**
 * PROTOCOLO OBLIGATORIO DE GENERACIÓN EN DOS FASES (MOTOR DE IA FLASHMENTE):
 * Obliga a Gemini a ejecutar internamente primero una indexación (Troncal vs. Minucioso)
 * y posteriormente una generación secuencial priorizando lo Troncal.
 */
const TWO_PHASE_SYSTEM_PROMPT = `PROTOCOLO OBLIGATORIO DE GENERACIÓN EN DOS FASES:
Antes de generar el JSON definitivo, debes ejecutar obligatoria y rigurosamente de forma interna y secuencial las dos fases siguientes:

FASE 1: INDEXACIÓN INTERNA (TRONCAL VS. MINUCIOSO)
1. Analiza exhaustivamente el texto fuente proporcionado (o el rango exacto de páginas delimitado).
2. Clasifica y separa mentalmente todos los conceptos del material en dos inventarios rigurosos:
   - LISTA TRONCAL: Conceptos nucleares, definiciones esenciales, principios clave, mecanismos fisiológicos/técnicos primarios y clasificaciones directas que constituyen la base indispensable del tema.
   - LISTA MINUCIOSA: Cifras secundarias, excepciones raras, notas al pie, clasificaciones accesorias y detalles periféricos.
3. Si dispones de HISTORIAL DE PROGRESO (tarjetas existentes generadas previamente), cruza ambas listas y DESCARTA inmediatamente de la LISTA TRONCAL todo concepto que ya haya sido evaluado en tarjetas previas.

FASE 2: GENERACIÓN SECUENCIAL PRIORIZADA
1. Extrae y genera SECUENCIALMENTE las tarjetas solicitadas comenzando obligatoriamente por los conceptos pendientes de la LISTA TRONCAL, siguiendo el orden cronológico y pedagógico del material.
2. Cada tarjeta debe centrarse en un concepto nuclear único, formulado según el formato solicitado.
3. ÚNICAMENTE cuando la LISTA TRONCAL se vacíe matemáticamente (es decir, el 100% de la teoría nuclear ya ha sido cubierta por tarjetas existentes o por las primeras tarjetas de este lote), continúa obligatoriamente la extracción con los conceptos de la LISTA MINUCIOSA hasta alcanzar exactamente el total de tarjetas solicitado.`;

/**
 * RIGOR MATEMÁTICO EN ADVERTENCIAS (core_exhausted):
 * Solo se dispara cuando la lista Troncal se vacía matemáticamente.
 */
const RIGOR_WARNING_DIRECTIVE = `RIGOR MATEMÁTICO EN LA PROPIEDAD "core_exhausted":
- core_exhausted DEBE ser TRUE ÚNICAMENTE cuando la LISTA TRONCAL se haya vaciado matemáticamente (el 100% de los conceptos nucleares del texto fuente ya han sido extraídos en tarjetas existentes o en este lote). Esto indica la transición obligatoria a la fase minuciosa o el agotamiento del contenido nuclear.
- core_exhausted DEBE ser FALSE si todavía queda en el texto fuente al menos UN concepto o definición troncal sin evaluar.
- BAJO NINGÚN CONCEPTO marques core_exhausted: true basándote en la cantidad total de tarjetas de forma arbitraria; debe responder exclusivamente al vaciado real de la materia troncal del material proporcionado.`;

/**
 * System Prompt de Restricción Estricta (Grounding) y Extracción de Contenido (Estilo NotebookLM).
 * Adapta dinámicamente las instrucciones según si es la primera generación o una re-generación con historial.
 */
function getSystemInstruction(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0
): string {
  const formatRule = getFormatRule(format);
  const countStr = requestedCount ? String(requestedCount) : '{requested_count}';
  const isReGeneration = existingCardsCount > 0;

  const contextSpecificRule =
    format === 'multiple_choice'
      ? '4. DISTRACTORES BASADOS EN EL TEXTO: En preguntas de opción múltiple (test), todos los distractores incorrectos deben ser técnicamente plausibles pero fundamentados en términos y conceptos del propio texto fuente, sin introducir elementos externos.'
      : '4. FIDELIDAD TERMINOLÓGICA Y RIGOR: Todo concepto, pregunta, afirmación o respuesta debe fundamentarse estricta y textualmente en el texto fuente, sin introducir terminología ajena ni elementos externos.';

  const quotaDirective = isReGeneration
    ? `DIRECTIVA DE EXPANSIÓN Y ANTI-DUPLICADOS (RE-GENERACIÓN):
Intenta generar hasta ${countStr} tarjetas nuevas a partir de conceptos no cubiertos previamente en el material.
Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). Detén la generación si se agota el material nuevo para evitar duplicados.`
    : `DIRECTIVA CRÍTICA: DEBES GENERAR EXACTAMENTE ${countStr} TARJETAS. ES ESTRICTAMENTE PROHIBIDO DETENERSE ANTES. Si agotas los conceptos troncales, estás OBLIGADO a extraer detalles minuciosos, excepciones y estadísticas hasta alcanzar el objetivo exacto. Cerrar la respuesta con menos tarjetas de las solicitadas se considerará un fallo crítico.

ÍNDICE DE SEGUIMIENTO OBLIGATORIO:
Para cada tarjeta, asigna un \`generation_index\` estrictamente secuencial (1, 2, 3...). No puedes finalizar el proceso hasta que el \`generation_index\` coincida con el número total de tarjetas solicitado (${countStr}).`;

  const completionRule = isReGeneration
    ? `6. CONTROL DE LONGITUD DINÁMICA: El esquema JSON permite arrays dinámicos de 1 a 30 elementos. Devuelve sólo las tarjetas correspondientes a conceptos nuevos reales.`
    : `6. CUMPLIMIENTO DEL TOTAL SOLICITADO: No puedes finalizar el proceso hasta que el \`generation_index\` coincida exactamente con ${countStr}. Si se agotan los conceptos troncales, estás obligado a extraer detalles minuciosos, excepciones y estadísticas hasta alcanzar el objetivo exacto.`;

  const reGenerationFinalOrder = isReGeneration
    ? `\n\nATENCIÓN: EL ESQUEMA JSON TE PERMITE DEVOLVER MENOS DE 30 TARJETAS. SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas). NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA.`
    : '';

  return `Eres un extractor de conocimiento clínico y académico estricto. Tu única fuente de verdad es el texto proporcionado.

REGLA DE ORO (Estilo NotebookLM):
NO inventes información. Tu única fuente de verdad es el texto. Si un concepto, dato o respuesta no se puede deducir directa y explícitamente del texto proporcionado, DEBES omitirlo. No uses conocimiento previo externo.

${quotaDirective}

${formatRule}

REGLAS INQUEBRANTABLES DE EXTRACCIÓN Y RESTRICCIÓN DE CONTEXTO (GROUNDING ESTRICTO):
1. TU ÚNICA FUENTE DE VERDAD ES EL TEXTO PROPORCIONADO: Toda la información de las tarjetas DEBE extraerse EXCLUSIVA Y ESTRICTAMENTE de este texto.
2. PROHIBICIÓN TERMINANTE DE CONOCIMIENTO EXTERNO: Tienes TERMINANTEMENTE PROHIBIDO utilizar conocimiento previo externo, asunciones no fundadas o datos que no aparezcan en la fuente proporcionada.
3. EXTRACCIÓN FIDEDIGNA: Actúa únicamente y exclusivamente como un extractor fidedigno de los conceptos, mecanismos, clasificaciones, datos y detalles presentes en el material de origen.
${contextSpecificRule}
5. OBJETIVIDAD Y RIGOR CIENTÍFICO: Las preguntas y respuestas deben reflejar exactamente la definición, clasificación, mecanismo, dosis, valor o dato que el texto expone sin divagar.
${completionRule}${reGenerationFinalOrder}`;
}

/**
 * Reglas globales inquebrantables de blindaje (Estilo NotebookLM) con inyección dinámica de formato.
 */
function getGlobalRules(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0
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

  return `REGLAS GLOBALES INQUEBRANTABLES DE BLINDAJE (ESTILO NOTEBOOKLM):
1. REGLA DE ORO (Estilo NotebookLM): NO inventes información. Tu única fuente de verdad es el texto. Si un concepto, dato o respuesta no se puede deducir directa y explícitamente del texto proporcionado, DEBES omitirlo. No uses conocimiento previo externo.
${directiveRule}
4. ${formatRule}
5. PRECISIÓN Y GROUNDING: Toda pregunta, afirmación, distractor o respuesta debe estar basada estricta y textualmente en el texto fuente.
6. ACRÓNIMOS: Todo acrónimo debe ir acompañado obligatoriamente de su nombre completo si figura en la fuente (ejemplo: "ARN (Ácido Ribonucleico)", "TCP (Transmission Control Protocol)").
7. INTEGRIDAD ESTRUCTURAL DEL JSON (PRIORIDAD ABSOLUTA): Debes devolver un objeto JSON válido con los campos "core_exhausted" (booleano) y "cards" (${cardRequirement}). Sé sintético, directo y conciso en el texto de las preguntas, opciones y respuestas, sin rodeos innecesarios.`;
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
 * AISLAMIENTO MULTIMODAL DE PDF (pdf-lib):
 * Aísla el rango de páginas solicitado del PDF en memoria, genera un nuevo documento
 * PDF recortado y lo convierte a Base64 para pasárselo a Gemini como parte multimodal nativa (inlineData).
 * Permite a Gemini procesar directamente tablas, diagramas, esquemas e imágenes de las páginas seleccionadas.
 */
async function slicePdfDocument(
  pdfBuffer: Buffer,
  pageRange: ParsedPageRange
): Promise<{ base64Pdf: string; totalPages: number; pageCount: number; extractedRange: string }> {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages === 0) {
      throw new Error('El PDF no contiene páginas válidas.');
    }

    // Validación de viabilidad económica y protección: Si el PDF tiene >30 páginas totales, el rango es estrictamente obligatorio
    if (totalPages > 30 && !pageRange.startPage && !pageRange.endPage) {
      throw new Error(
        `El PDF tiene ${totalPages} páginas (más de 30 páginas totales). Por motivos de rendimiento y viabilidad económica, los campos "Desde página" y "Hasta página" son estrictamente obligatorios (máximo 40 páginas por petición).`
      );
    }

    // Calcular páginas 1-indexadas solicitadas dentro del rango real del archivo
    const start = Math.max(1, Math.min(pageRange.startPage || 1, totalPages));
    const end = Math.max(start, Math.min(pageRange.endPage || totalPages, totalPages));
    const rangeSpan = end - start + 1;

    if (rangeSpan > 40) {
      throw new Error(
        `El rango de páginas solicitado (${rangeSpan} páginas: de la ${start} a la ${end}) supera el límite máximo permitido de 40 páginas por petición.`
      );
    }

    const pageIndices: number[] = [];
    for (let i = start - 1; i < end; i++) {
      pageIndices.push(i);
    }

    const rangeLabel =
      pageRange.rangeLabel ||
      (start === 1 && end === totalPages
        ? `Documento completo (Páginas 1 a ${totalPages})`
        : `Páginas ${start} a ${end}`);

    // Construir sub-documento PDF limpio con únicamente las páginas deseadas
    const subDoc = await PDFDocument.create();
    const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      subDoc.addPage(page);
    }

    const base64Pdf = await subDoc.saveAsBase64({ dataUri: false });

    console.log(
      `[PDF MULTIMODAL SLICER] Rango aislado: ${rangeLabel}. Páginas: ${pageIndices.length} de ${totalPages}. Tamaño Base64: ${base64Pdf.length} caracteres.`
    );

    return {
      base64Pdf,
      totalPages,
      pageCount: pageIndices.length,
      extractedRange: rangeLabel,
    };
  } catch (err) {
    console.error('Error al aislar páginas del PDF con pdf-lib:', err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo procesar el archivo PDF: ${msg}`);
  }
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
      const { data, error } = await supabase
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
 * MEMORIA DE PROGRESO Y REANUDACIÓN SECUENCIAL:
 * Inyecta las tarjetas generadas previamente en el contexto de Gemini para que reanude
 * la extracción donde lo dejó en el PDF/documento, garantizando avance continuo sin repeticiones.
 */
function buildProgressMemorySection(existingCards: ExistingCardHistoryItem[]): string {
  if (!existingCards || existingCards.length === 0) {
    return '';
  }

  // Limitar al historial de hasta 60 tarjetas más relevantes para no saturar el prompt
  const items = existingCards.slice(-60).map((card, idx) => {
    const firstLine = card.front.split(/\r?\n/)[0].replace(/^(\d+[\.\)\-:]|\(?[a-dA-D]\))\s*/, '').trim();
    const shortBack = card.back ? ` -> [Respuesta: ${card.back.replace(/\s+/g, ' ').slice(0, 70)}]` : '';
    return `${idx + 1}. ${firstLine}${shortBack}`;
  });

  return `======================================================================
MEMORIA DE PROGRESO Y REANUDACIÓN SECUENCIAL (PROGRESO DEL DOCUMENTO):
======================================================================
El usuario ya ha generado ${existingCards.length} tarjetas anteriormente a partir de este material/mazo.
Historial secuencial de conceptos ya evaluados:
${items.join('\n')}

INSTRUCCIONES OBLIGATORIAS DE REANUDACIÓN:
1. REANUDACIÓN EXACTA: Examina minuciosamente estas tarjetas existentes para determinar el punto exacto del documento o PDF donde se detuvo el lote anterior.
2. AVANCE SECUENCIAL: Reanuda la extracción inmediatamente desde el siguiente concepto pendiente, avanzando hacia las partes subsiguientes del texto.
3. PROHIBICIÓN ABSOLUTA DE REPETICIÓN: Bajo ninguna circunstancia formules preguntas redundantes, refraseadas o equivalentes sobre los conceptos cubiertos arriba.
4. AGOTAMIENTO Y PROFUNDIZACIÓN: Si tras recorrer el texto ya no quedan conceptos troncales pendientes por extraer, continúa con la LISTA MINUCIOSA (detalles, excepciones, clasificaciones secundarias y tablas). SI HAS AGOTADO EL MATERIAL NUEVO DEL TEXTO E IMÁGENES, DEBES DETENERTE Y DEVOLVER UN ARRAY MÁS CORTO (ej. 12, 18 o 25 tarjetas), marcando "core_exhausted: true". NUNCA INVENTES NI REPITAS CONCEPTOS DEL HISTORIAL SÓLO PARA LLEGAR A LA CUOTA.
======================================================================`;
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

/**
 * Modelo global de Google Gemini unificado para rentabilidad y generaciones ilimitadas sostenibles.
 */
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Configuración estricta de Gemini generada dinámicamente según el formato de tarjeta:
 * - temperature: 0.1 para forzar respuestas deterministas, eliminar la creatividad y evitar alucinaciones.
 * - responseMimeType: 'application/json' y responseJsonSchema: flashcardSchema para forzar la estructura de salida.
 * - systemInstruction: System Prompt adaptado dinámicamente con la regla del formato seleccionado y directiva de cantidad.
 */
function getGeminiConfig(
  format: CardFormat = 'multiple_choice',
  requestedCount?: number,
  existingCardsCount: number = 0
) {
  return {
    systemInstruction: getSystemInstruction(format, requestedCount, existingCardsCount),
    temperature: 0.1,
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
  language: string = 'es'
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
    const progressMemoryPrompt = buildProgressMemorySection(existingCards);
    const languageDirective = buildLanguageDirective(language);

    // FASE 3: SALVAVIDAS ANTI-DUPLICACIÓN (LÍMITE DINÁMICO RELAJADO)
    const { directive: targetCountDirective, integrityNote } = buildTargetCountDirective(
      targetCount,
      existingCards.length
    );

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
${targetCountDirective}

Cubre los conceptos clave sobre el tema: "${cleanTopic}".

${TWO_PHASE_SYSTEM_PROMPT}

${RIGOR_WARNING_DIRECTIVE}

${getGlobalRules(cardFormat, targetCount, existingCards.length)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para asegurar que las tarjetas quepan dentro del límite sin truncarse, formula preguntas, textos, opciones (si aplica) y respuestas directas y concisas.

${languageDirective}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: getGeminiConfig(cardFormat, targetCount, existingCards.length),
    });

    const text = response.text;
    if (!text) {
      return { success: false, error: 'Gemini no devolvió contenido de texto.' };
    }

    let parsedCards: GeneratedCard[] = [];
    let coreExhausted = false;

    try {
      const parsedData = JSON.parse(text) as
        | { core_exhausted?: boolean; cards?: GeneratedCard[] }
        | GeneratedCard[];

      if (Array.isArray(parsedData)) {
        parsedCards = parsedData;
        coreExhausted = false;
      } else if (parsedData && Array.isArray(parsedData.cards)) {
        parsedCards = parsedData.cards;
        coreExhausted = Boolean(parsedData.core_exhausted);
      } else {
        throw new Error('El JSON devuelto no contiene un array de tarjetas válido.');
      }

      if (parsedCards.length === 0) {
        throw new Error('El array de tarjetas está vacío.');
      }
    } catch (parseError: unknown) {
      console.warn('Fallo al parsear JSON de Gemini en generateCardsAction (posible truncamiento por límite de tokens):', parseError);
      const suggestedCount = targetCount >= 20 ? 10 : 5;
      const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
      return {
        success: false,
        error: `El tema es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
      };
    }

    // Registrar uso en api_limits tras generación exitosa
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processGeneratedCards(parsedCards, targetCount, cardFormat),
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
    let base64Data: string;

    // 1. Descargar el archivo desde Supabase Storage
    if (signedUrl) {
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Error HTTP al descargar de Supabase Storage: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
    } else {
      const { data, error } = await supabase.storage
        .from('user-documents')
        .download(storagePath);

      if (error || !data) {
        throw error || new Error('No se pudo descargar el archivo desde el bucket user-documents.');
      }
      const arrayBuffer = await data.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
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
        const fileBuffer = Buffer.from(base64Data, 'base64');
        const mammothResult = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedWordText = (mammothResult.value || '').trim();
      } catch (docxErr) {
        console.warn('Advertencia al extraer texto con mammoth de documento Word:', docxErr);
      }

      // Fallback para documentos Word binarios .doc o si mammoth no extrajo suficiente texto
      if (!extractedWordText || extractedWordText.length < 20) {
        try {
          const rawBuffer = Buffer.from(base64Data, 'base64');
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

    // FASE 1: Si es un PDF, aislamos estrictamente el rango de páginas en un sub-documento binario con pdf-lib
    let slicedPdf: { base64Pdf: string; totalPages: number; pageCount: number; extractedRange: string } | null = null;
    if (isPdfDocument) {
      const fileBuffer = Buffer.from(base64Data, 'base64');
      slicedPdf = await slicePdfDocument(fileBuffer, parsedRange);
      if (!slicedPdf || !slicedPdf.base64Pdf) {
        throw new Error(
          'No se pudo procesar el documento PDF. Asegúrate de que el archivo no esté dañado o protegido.'
        );
      }
    }

    // 4. Consultar historial de tarjetas existentes en este mazo para la Memoria de Progreso
    const existingCards = await fetchExistingCardsHistory(deckId, existingQuestions);
    const progressMemoryPrompt = buildProgressMemorySection(existingCards);

    // FASE 3: SALVAVIDAS ANTI-DUPLICACIÓN (LÍMITE DINÁMICO RELAJADO)
    const { directive: targetCountDirective, integrityNote } = buildTargetCountDirective(
      targetCount,
      existingCards.length
    );

    const focusRuleSection = focusInstruction
      ? `🚨 REGLA DE ENFOQUE CRÍTICA (PRIORIDAD ABSOLUTA):
El usuario ha indicado la siguiente instrucción de enfoque: "${focusInstruction}".
REGLA ESTRICTA: Si el usuario proporciona una instrucción de enfoque (ej. un capítulo o tema específico), DEBES ignorar el resto del documento y extraer la información EXCLUSIVAMENTE de la sección solicitada. Bajo ninguna circunstancia generes preguntas sobre partes o secciones ajenas a lo solicitado.`
      : '';

    const rangeLabel = parsedRange.rangeLabel ? ` [${parsedRange.rangeLabel}]` : '';
    const coverageText = focusInstruction
      ? `Debes analizar el documento dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}"${rangeLabel}). ${targetCountDirective} Extrae la información EXCLUSIVAMENTE de esa parte del documento.`
      : `Debes analizar el documento completo${rangeLabel}. ${targetCountDirective} Cubre los conceptos clave de forma equitativa desde el principio hasta el final del contenido.`;

    // FASE 2: Directiva de lectura visual y multimodal para PDFs (Tablas, gráficos, esquemas, recuadros)
    const pdfMultimodalDirective = isPdfDocument
      ? `\n\n🚨 DIRECTIVA DE ANÁLISIS MULTIMODAL DE PDF:
Analiza el documento PDF adjunto. Presta especial atención y extrae preguntas rigurosas de las TABLAS, GRÁFICOS, ESQUEMAS y RECUADROS que veas en las páginas, además del texto principal.`
      : '';

    // 5. Preparar llamada a Gemini 3.1 Flash-Lite con el protocolo de dos fases, advertencia con rigor y memoria de progreso
    const ai = new GoogleGenAI({ apiKey });

    const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText}${fileName ? ` Documento de referencia: "${fileName}".` : ''}${pdfMultimodalDirective}

${TWO_PHASE_SYSTEM_PROMPT}

${RIGOR_WARNING_DIRECTIVE}

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, targetCount, existingCards.length)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano con rigor matemático) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa.

${buildLanguageDirective(language)}`;

    // Configurar contenidos según la estrategia multimodal y tipo de documento:
    // 1) Si es PDF: enviamos directamente el PDF recortado como inlineData multimodal
    // 2) Si es Word: enviamos el texto extraído con mammoth
    // 3) Si es Audio: enviamos inlineData con el mimeType de audio correspondiente
    let contents: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    >;

    if (isWordDocument) {
      contents = [
        {
          text: `${promptText}\n\n=========================================\nCONTENIDO DEL DOCUMENTO DE WORD:\n=========================================\n${extractedWordText}\n=========================================`,
        },
      ];
    } else if (isPdfDocument && slicedPdf) {
      // FASE 2: Enviar el PDF recortado directamente como parte multimodal (inlineData)
      console.log(
        `[DEBUG SERVER - GEMINI CALL MULTIMODAL] Enviando PDF recortado (${slicedPdf.extractedRange}, ${slicedPdf.pageCount} páginas, Base64: ${slicedPdf.base64Pdf.length} caracteres) como inlineData a Gemini.`
      );
      contents = [
        {
          inlineData: {
            data: slicedPdf.base64Pdf,
            mimeType: 'application/pdf',
          },
        },
        {
          text: promptText,
        },
      ];
    } else {
      // Audio u otros archivos multimedia
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

    if (isPdfDocument && slicedPdf) {
      console.log(
        `[DEBUG SERVER - GEMINI CALL] PDF multimodal enviado a Gemini: ${slicedPdf.extractedRange} (${slicedPdf.pageCount} páginas, Base64: ${slicedPdf.base64Pdf.length} caracteres). Objetivo máximo: ${targetCount} tarjetas.`
      );
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: getGeminiConfig(cardFormat, targetCount, existingCards.length),
    });

    const text = response.text;
    if (!text) {
      return { success: false, error: 'Gemini no devolvió contenido de texto para el documento.' };
    }

    let parsedCards: GeneratedCard[] = [];
    let coreExhausted = false;

    try {
      const parsedData = JSON.parse(text) as
        | { core_exhausted?: boolean; cards?: GeneratedCard[] }
        | GeneratedCard[];

      if (Array.isArray(parsedData)) {
        parsedCards = parsedData;
        coreExhausted = false;
      } else if (parsedData && Array.isArray(parsedData.cards)) {
        parsedCards = parsedData.cards;
        coreExhausted = Boolean(parsedData.core_exhausted);
      } else {
        throw new Error('El JSON devuelto no contiene un array de tarjetas válido.');
      }

      if (parsedCards.length === 0) {
        throw new Error('El array de tarjetas está vacío.');
      }
    } catch (parseError: unknown) {
      console.warn('Fallo al parsear el JSON de Gemini en generateCardsFromDocumentAction (posible truncamiento por límite de tokens):', parseError);
      const suggestedCount = targetCount >= 20 ? 10 : 5;
      const formatSuffix = cardFormat === 'multiple_choice' ? ' tipo test' : '';
      return {
        success: false,
        error: `El documento es demasiado denso para ${targetCount} tarjetas${formatSuffix}. Por favor, intenta generar ${suggestedCount}.`,
      };
    }

    // Registrar uso en api_limits tras generación exitosa
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processGeneratedCards(parsedCards, targetCount, cardFormat),
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

    const coverageText = focusInstruction
      ? `Debes analizar el contenido dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}"). ${targetCountDirective} Extrae la información EXCLUSIVAMENTE de esa parte.`
      : `Debes analizar el contenido completo. ${targetCountDirective} Cubre los conceptos clave de forma equitativa desde el principio hasta el final del contenido.`;

    const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText} Fuente: ${sourceLabel} ("${sourceRef}").

${TWO_PHASE_SYSTEM_PROMPT}

${RIGOR_WARNING_DIRECTIVE}

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${getGlobalRules(cardFormat, targetCount, existingCards.length)}

${getFormatInstructions(cardFormat)}

${progressMemoryPrompt ? `${progressMemoryPrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano con rigor matemático) y "cards" (${integrityNote} "${cardFormat}", numeradas estrictamente con generation_index del 1 al N). Para garantizar que quepan las tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, texto, opción (si aplica) y respuesta rigurosa pero concisa y directa.

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
          config: getGeminiConfig(cardFormat, targetCount, existingCards.length),
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
            config: getGeminiConfig(cardFormat, targetCount, existingCards.length),
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
        config: getGeminiConfig(cardFormat, targetCount, existingCards.length),
      });
      responseText = webResponse.text;
    }

    if (!responseText) {
      return { success: false, error: 'Gemini no devolvió contenido de texto para el enlace.' };
    }

    let parsedCards: GeneratedCard[] = [];
    let coreExhausted = false;

    try {
      const parsedData = JSON.parse(responseText) as
        | { core_exhausted?: boolean; cards?: GeneratedCard[] }
        | GeneratedCard[];

      if (Array.isArray(parsedData)) {
        parsedCards = parsedData;
        coreExhausted = false;
      } else if (parsedData && Array.isArray(parsedData.cards)) {
        parsedCards = parsedData.cards;
        coreExhausted = Boolean(parsedData.core_exhausted);
      } else {
        throw new Error('El JSON devuelto no contiene un array de tarjetas válido.');
      }

      if (parsedCards.length === 0) {
        throw new Error('El array de tarjetas está vacío.');
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

    // Registrar uso en api_limits tras generación exitosa
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
    }

    // Procesar y garantizar 4 opciones con aleatorización Fisher-Yates
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: processGeneratedCards(parsedCards, targetCount, cardFormat),
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
