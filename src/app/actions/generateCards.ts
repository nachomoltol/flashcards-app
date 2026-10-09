'use server';

import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';
import { supabase } from '@/lib/supabase';
import { randomizeMultipleChoiceCard } from '@/lib/cardUtils';
import type {
  CardFormat,
  GeneratedCard,
  GenerateCardsResult,
  MultimodalDocumentInput,
} from '@/types/cards';

const flashcardSchema = {
  type: Type.OBJECT,
  description: 'Objeto con tarjetas de estudio y radar de profundidad de contenido',
  properties: {
    core_exhausted: {
      type: Type.BOOLEAN,
      description:
        'true si la teoría troncal y conceptos principales ya han sido extraídos en lotes anteriores; false si aún queda información troncal.',
    },
    cards: {
      type: Type.ARRAY,
      description: 'Array con tarjetas de estudio de alta precisión según el formato solicitado',
      items: {
        type: Type.OBJECT,
        properties: {
          front: {
            type: Type.STRING,
            description:
              'Anverso de la tarjeta. En multiple_choice DEBE contener la pregunta limpia, un salto de línea doble, y luego exactamente las 4 opciones a), b), c), d) en líneas separadas.',
          },
          back: {
            type: Type.STRING,
            description: 'Reverso de la tarjeta según el formato indicado',
          },
          cardFormat: {
            type: Type.STRING,
            description: 'Formato de la tarjeta: "basic", "multiple_choice", "cloze" o "true_false"',
          },
        },
        required: ['front', 'back', 'cardFormat'],
      },
    },
  },
  required: ['core_exhausted', 'cards'],
};

/**
 * Devuelve las instrucciones del prompt según el formato de tarjeta solicitado.
 */
function getFormatInstructions(format: CardFormat): string {
  switch (format) {
    case 'multiple_choice':
      return `FORMATO OBLIGATORIO: multiple_choice (Opción Múltiple / Test):
- "front": El texto DEBE estructurarse estrictamente con saltos de línea (\\n) con el siguiente formato exacto:
[Escribe aquí ÚNICAMENTE el enunciado de la pregunta limpia, sin incluir ninguna letra a, b, c o d]

a) [Texto de la opción A]
b) [Texto de la opción B]
c) [Texto de la opción C]
d) [Texto de la opción D]

REGLAS CRÍTICAS PARA "front":
1. Primero coloca ÚNICAMENTE la pregunta limpia.
2. Añade obligatoriamente un salto de línea antes de empezar las opciones.
3. Cada una de las 4 opciones (a, b, c, d) DEBE ir en su propia línea independiente separada por un salto de línea (\\n).
4. NUNCA mezcles las letras a), b), c), d) dentro del texto o párrafo de la pregunta.
5. La opción correcta DEBE estar posicionada de manera totalmente aleatoria entre a, b, c o d. Los distractores deben ser técnicamente plausibles y basados estrictamente en el temario.
- "back": SOLAMENTE la respuesta correcta indicando letra y texto (ejemplo: "b) Texto de la opción correcta"). No agregues texto innecesario.
- "cardFormat": "multiple_choice"`;

    case 'cloze':
      return `FORMATO OBLIGATORIO: cloze (Texto para rellenar / Cloze):
- "front": Un texto explicativo riguroso con una palabra o frase clave oculta usando obligatoriamente la notación [...] (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina [...]").
- "back": El texto completo donde la palabra o frase clave revelada esté claramente resaltada con doble asterisco (ejemplo: "El proceso mediante el cual las plantas convierten la luz solar en energía química se denomina **fotosíntesis**").
- "cardFormat": "cloze"`;

    case 'true_false':
      return `FORMATO OBLIGATORIO: true_false (Verdadero o Falso):
- "front": Una afirmación técnica o conceptual rotunda (que puede ser verdadera o falsa según el temario).
- "back": Iniciar obligatoriamente con la palabra "Verdadero" o "Falso" (en negrita: **Verdadero** o **Falso**), seguido de una breve justificación directa basada estrictamente en el texto.
- "cardFormat": "true_false"`;

    case 'basic':
    default:
      return `FORMATO OBLIGATORIO: basic (Pregunta y Respuesta Directa):
- "front": Pregunta directa, específica y concisa para evaluar el concepto.
- "back": Respuesta rigurosa, comprensiva y directa.
- "cardFormat": "basic"`;
  }
}

const RADAR_DIRECTIVE = `RADAR DE PROFUNDIDAD DE CONTENIDO (RADAR, NO FRENO):
Analiza el historial de tarjetas frente al texto. Si consideras que la teoría troncal y los conceptos principales ya han sido extraídos en lotes anteriores, marca core_exhausted: true y CONTINÚA generando el número de tarjetas solicitado buscando detalles minuciosos, excepciones, datos muy específicos o notas al pie. Si aún queda información troncal, marca false.`;

const GLOBAL_RULES = `REGLAS GLOBALES ESTRICTAS:
1. Extrae información EXCLUSIVAMENTE del contenido/documento proporcionado. Jamás inventes datos ni asumas conocimientos no contenidos en la fuente.
2. Los distractores (en preguntas de opción múltiple) deben ser técnicamente plausibles y basados estrictamente en el temario.
3. Todo acrónimo debe ir acompañado obligatoriamente de su nombre completo (ejemplo: "ARN (Ácido Ribonucleico)", "TCP (Transmission Control Protocol)").
4. INTEGRIDAD ESTRUCTURAL DEL JSON (PRIORIDAD ABSOLUTA): La integridad estructural del JSON es prioridad absoluta y debes devolver un objeto JSON válido con los campos "core_exhausted" (booleano) y "cards" (array). Para garantizar que el JSON no se trunque por el límite de tokens, sé sintético, directo y conciso en el texto de las preguntas, opciones y respuestas, sin rodeos ni explicaciones excesivas.`;

/**
 * Recupera de forma segura el texto del front de todas las tarjetas ya existentes en el mazo.
 * Si es la primera vez que se generan tarjetas en el mazo o hay un error, devuelve un array vacío.
 */
async function fetchExistingCardFronts(deckId?: string): Promise<string[]> {
  if (!deckId) return [];

  try {
    const { data, error } = await supabase
      .from('cards')
      .select('front')
      .eq('deck_id', deckId);

    if (error || !data) {
      console.warn('Advertencia al consultar tarjetas existentes del mazo en Supabase:', error);
      return [];
    }

    return data
      .map((row) => row.front?.trim())
      .filter((front): front is string => Boolean(front && front.length > 0));
  } catch (err: unknown) {
    console.warn('Error no bloqueante al consultar el historial de tarjetas en Supabase:', err);
    return [];
  }
}

/**
 * Construye la sección del prompt de Memoria Anti-Duplicados según las instrucciones estrictas.
 */
function buildAntiDuplicateSection(existingFronts: string[], isDocument = true): string {
  if (!existingFronts || existingFronts.length === 0) {
    return '';
  }

  // Extraemos la pregunta limpia de cada tarjeta existente (tomando la primera línea para descartar opciones de multiple_choice)
  const frontsList = existingFronts
    .map((f, i) => {
      const cleanFront = f.split('\n')[0].trim();
      return `${i + 1}. "${cleanFront}"`;
    })
    .join('\n');

  const sourceContext = isDocument ? 'en el documento' : 'en el tema';

  return `HISTORIAL DE TARJETAS EXISTENTES (CONTEXTO A EVITAR):
${frontsList}

REGLA CRÍTICA ANTI-DUPLICADOS (CONTEXTO A EVITAR): Tienes estrictamente prohibido generar preguntas que cubran los mismos conceptos o se solapen con las tarjetas de este historial. Debes buscar información y conceptos nuevos ${sourceContext} que no se hayan tocado aún.`;
}

/**
 * Server Action que genera tarjetas a partir de un tema de texto usando Gemini 3.8 Flash.
 */
export async function generateCardsAction(
  topic: string,
  cardFormat: CardFormat = 'basic',
  cardCount: number = 10,
  deckId?: string,
  existingQuestions?: string[]
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

  // Límite seguro de 30 tarjetas por petición para evitar saturación y truncamientos
  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

  try {
    // 1. Consultar historial de tarjetas existentes en este mazo para la Memoria Anti-Duplicados
    const existingFronts = (existingQuestions && existingQuestions.length > 0)
      ? existingQuestions
      : await fetchExistingCardFronts(deckId);
    const antiDuplicatePrompt = buildAntiDuplicateSection(existingFronts, false);

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Eres un pedagogo experto en ciencias cognitivas y diseño de flashcards para el algoritmo de repetición espaciada FSRS.
Debes analizar el tema en profundidad y generar EXACTAMENTE ${targetCount} tarjetas de estudio de alta calidad cubriendo los conceptos clave de forma equitativa desde el principio hasta el final sobre el tema: "${cleanTopic}".

${GLOBAL_RULES}

${getFormatInstructions(cardFormat)}

${RADAR_DIRECTIVE}

${antiDuplicatePrompt ? `${antiDuplicatePrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano) y "cards" (array con exactamente ${targetCount} tarjetas del formato "${cardFormat}"). Para asegurar que las ${targetCount} tarjetas quepan dentro del límite sin truncarse, formula preguntas, opciones y respuestas directas y concisas.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: flashcardSchema,
        maxOutputTokens: 8192,
      },
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

    // Aplicar aleatorización Fisher-Yates a las opciones de preguntas test antes de retornar y guardar
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: parsedCards.slice(0, targetCount).map((card) => {
        const cleaned: GeneratedCard = {
          front: card.front.trim(),
          back: card.back.trim(),
          cardFormat: (card.cardFormat as CardFormat) || cardFormat,
          cardType: card.cardFormat === 'cloze' ? 'cloze' : 'basic',
        };
        return randomizeMultipleChoiceCard(cleaned);
      }),
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
    cardFormat = 'basic',
    cardCount = 10,
    existingQuestions,
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
      else if (ext === 'mp4') normalizedMime = 'video/mp4';
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

    // 3. Consultar historial de tarjetas existentes en este mazo para la Memoria Anti-Duplicados
    const existingFronts = (existingQuestions && existingQuestions.length > 0)
      ? existingQuestions
      : await fetchExistingCardFronts(deckId);
    const antiDuplicatePrompt = buildAntiDuplicateSection(existingFronts, true);

    // 4. Procesar instrucción de enfoque (focusInstruction) con prioridad absoluta
    const focusInstruction = (rawFocus || customPrompt || '').trim();

    const focusRuleSection = focusInstruction
      ? `🚨 REGLA DE ENFOQUE CRÍTICA (PRIORIDAD ABSOLUTA):
El usuario ha indicado la siguiente instrucción de enfoque: "${focusInstruction}".
REGLA ESTRICTA: Si el usuario proporciona una instrucción de enfoque (ej. un capítulo o tema específico), DEBES ignorar el resto del documento y extraer la información EXCLUSIVAMENTE de la sección solicitada. Bajo ninguna circunstancia generes preguntas sobre partes o secciones ajenas a lo solicitado.`
      : '';

    const coverageText = focusInstruction
      ? `Debes analizar el documento dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}") y generar EXACTAMENTE ${targetCount} tarjetas extraídas EXCLUSIVAMENTE de esa parte del documento.`
      : `Debes analizar el documento completo y generar EXACTAMENTE ${targetCount} tarjetas cubriendo los conceptos clave de forma equitativa desde el principio hasta el final del texto.`;

    // 5. Preparar llamada a Gemini 3.8 Flash con instrucciones de formato, cantidad, enfoque e historial
    const ai = new GoogleGenAI({ apiKey });

    const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText}${fileName ? ` Documento de referencia: "${fileName}".` : ''}

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${GLOBAL_RULES}

${getFormatInstructions(cardFormat)}

${RADAR_DIRECTIVE}

${antiDuplicatePrompt ? `${antiDuplicatePrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano) y "cards" (array con exactamente ${targetCount} tarjetas del formato "${cardFormat}"). Para garantizar que quepan las ${targetCount} tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, opción y respuesta rigurosa pero concisa y directa.`;

    // Si es un documento de Word, pasamos el texto extraído directamente para evitar fallos de decodificación zip
    const contents = isWordDocument
      ? [
          {
            text: `${promptText}\n\nCONTENIDO DEL DOCUMENTO DE WORD:\n=========================================\n${extractedWordText}\n=========================================`,
          },
        ]
      : [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: base64Data,
            },
          },
          {
            text: promptText,
          },
        ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: flashcardSchema,
        maxOutputTokens: 8192,
      },
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

    // Aplicar aleatorización Fisher-Yates a las opciones de preguntas test antes de retornar y guardar
    return {
      success: true,
      core_exhausted: coreExhausted,
      cards: parsedCards.slice(0, targetCount).map((card) => {
        const cleaned: GeneratedCard = {
          front: card.front.trim(),
          back: card.back.trim(),
          cardFormat: (card.cardFormat as CardFormat) || cardFormat,
          cardType: card.cardFormat === 'cloze' ? 'cloze' : 'basic',
        };
        return randomizeMultipleChoiceCard(cleaned);
      }),
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
