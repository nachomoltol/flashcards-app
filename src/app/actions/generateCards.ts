'use server';

import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';
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
Analiza el historial de tarjetas existentes frente al texto proporcionado. Si consideras que la teoría troncal y los conceptos principales del texto ya han sido extraídos en lotes anteriores, marca core_exhausted: true y CONTINÚA generando el número de tarjetas solicitado buscando detalles minuciosos, excepciones, datos muy específicos o notas al pie dentro del texto. Si aún queda información troncal por cubrir, marca false.`;

/**
 * System Prompt de Restricción Estricta (Grounding) y Extracción de Contenido.
 * Obliga a Gemini a actuar exclusivamente como un extractor fidedigno, prohibiendo el conocimiento externo.
 */
const SYSTEM_INSTRUCTION_GROUNDING = `Eres un sistema pedagógico experto en ciencias cognitivas, extracción estricta de contenidos y diseño de flashcards para el algoritmo de repetición espaciada FSRS.

REGLAS INQUEBRANTABLES DE EXTRACCIÓN Y RESTRICCIÓN DE CONTEXTO (GROUNDING ESTRICTO):
1. TU ÚNICA FUENTE DE VERDAD ES EL TEXTO PROPORCIONADO: Toda la información de las tarjetas DEBE extraerse EXCLUSIVA Y ESTRICTAMENTE de este texto.
2. PROHIBICIÓN TERMINANTE DE CONOCIMIENTO EXTERNO: Tienes TERMINANTEMENTE PROHIBIDO utilizar tu conocimiento externo, asunciones no fundadas o datos que no aparezcan en la fuente proporcionada.
3. SI UN CONCEPTO O DETALLE NO SE EXPLICA EXPLÍCITAMENTE EN EL DOCUMENTO, NO PUEDES GENERAR UNA TARJETA SOBRE ÉL: Actúa únicamente y exclusivamente como un extractor fidedigno. Si un dato no figura de forma explícita en el material de origen, para ti no existe y bajo ningún concepto debes inventarlo, completarlo o extrapolarlo.
4. DISTRACTORES BASADOS EN EL TEXTO: En preguntas de opción múltiple (test), todos los distractores incorrectos deben ser técnicamente plausibles pero fundamentados en términos y conceptos del propio texto fuente, sin introducir elementos externos.
5. OBJETIVIDAD Y RIGOR CIENTÍFICO: Las preguntas y respuestas deben reflejar exactamente la definición, clasificación o dato que el autor o texto expone sin divagar.`;

const GLOBAL_RULES = `REGLAS GLOBALES INQUEBRANTABLES DE GROUNDING Y EXTRACCIÓN:
1. RESTRICCIÓN ESTRICTA DE CONTEXTO: Tu única fuente de verdad es el texto proporcionado. Toda la información de las tarjetas DEBE extraerse EXCLUSIVA Y ESTRICTAMENTE de este texto. Tienes TERMINANTEMENTE PROHIBIDO utilizar tu conocimiento externo. Si un concepto o detalle no se explica explícitamente en el documento, NO puedes generar una tarjeta sobre él.
2. DISTRACTORES BASADOS EN EL TEMARIO: Los distractores (en preguntas de opción múltiple) deben ser técnicamente plausibles y basados estrictamente en el texto fuente.
3. ACRÓNIMOS: Todo acrónimo debe ir acompañado obligatoriamente de su nombre completo si figura en la fuente (ejemplo: "ARN (Ácido Ribonucleico)", "TCP (Transmission Control Protocol)").
4. INTEGRIDAD ESTRUCTURAL DEL JSON (PRIORIDAD ABSOLUTA): Debes devolver un objeto JSON válido con los campos "core_exhausted" (booleano) y "cards" (array). Sé sintético, directo y conciso en el texto de las preguntas, opciones y respuestas, sin rodeos innecesarios.`;

/**
 * Recupera de forma segura el texto del front de todas las tarjetas ya existentes en el mazo.
 * Si se pasa deckId, consulta la base de datos Supabase para obtener las preguntas reales actuales
 * y las fusiona con cualquier pregunta adicional provista por el cliente, devolviendo un conjunto deduplicado.
 */
async function fetchExistingCardFronts(
  deckId?: string,
  clientProvided: string[] = []
): Promise<string[]> {
  const questionsMap = new Map<string, string>();

  // 1. Incorporar preguntas pasadas por el cliente
  for (const q of clientProvided) {
    if (q && typeof q === 'string' && q.trim()) {
      const normalized = q.trim();
      questionsMap.set(normalized.toLowerCase(), normalized);
    }
  }

  // 2. Si se proporciona deckId, recuperar siempre las preguntas actuales de la base de datos Supabase
  if (deckId) {
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('front')
        .eq('deck_id', deckId);

      if (error) {
        console.warn('Advertencia al consultar tarjetas existentes del mazo en Supabase:', error);
      } else if (data && data.length > 0) {
        for (const row of data) {
          if (row.front && typeof row.front === 'string' && row.front.trim()) {
            const normalized = row.front.trim();
            questionsMap.set(normalized.toLowerCase(), normalized);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Error no bloqueante al consultar el historial de tarjetas en Supabase:', err);
    }
  }

  return Array.from(questionsMap.values());
}

/**
 * Construye la sección del prompt de Memoria Anti-Duplicados según las directivas estrictas de la Fase 20.
 */
function buildAntiDuplicateSection(existingFronts: string[]): string {
  if (!existingFronts || existingFronts.length === 0) {
    return '';
  }

  // Extraemos la pregunta limpia de cada tarjeta existente (tomando la primera línea para descartar opciones de multiple_choice)
  const cleanQuestions = existingFronts
    .map((f) => f.split('\n')[0].replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((f) => f.length > 3);

  const uniqueQuestions = Array.from(new Set(cleanQuestions));
  if (uniqueQuestions.length === 0) return '';

  const frontsList = uniqueQuestions
    .map((f, i) => `${i + 1}. "${f}"`)
    .join('\n');

  return `🚨 FILTRO ANTI-DUPLICADOS CONTEXTUAL (PROHIBICIÓN ESTRICTA):
Aquí tienes una lista de preguntas que ya existen en este mazo:
==================================================
${frontsList}
==================================================
DIRECTIVA OBLIGATORIA: Aquí tienes una lista de preguntas que ya existen. Tienes PROHIBIDO generar tarjetas sobre estos mismos conceptos o hacer preguntas similares.
Toda nueva tarjeta que generes DEBE evaluar aspectos, conceptos, detalles, relaciones o datos complementarios del material que NO hayan sido cubiertos en las preguntas anteriores.`;
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
  userId: string;
}

/**
 * Valida la cuota de generación del usuario en api_limits antes de llamar a Gemini:
 * - Si tier es 'pro' o 'vip': omite límites (bypass).
 * - Si tier es 'free': verifica si last_generation_date es de hoy. Si es anterior o null,
 *   reinicia el conteo a 0. Si es de hoy y count >= 5, aborta devolviendo { error: 'LIMIT_REACHED' }.
 */
async function enforceApiLimit(
  userId: string
): Promise<{ check: ApiLimitCheck } | { error: 'LIMIT_REACHED' }> {
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
        error?: string;
      };

      if (res.allowed === false || res.error === 'LIMIT_REACHED') {
        return { error: 'LIMIT_REACHED' };
      }

      return {
        check: {
          allowed: true,
          tier: res.tier || 'free',
          currentCount: typeof res.count === 'number' ? res.count : 0,
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
      const lastDate = directData.last_generation_date
        ? String(directData.last_generation_date).slice(0, 10)
        : null;

      if (tier === 'pro' || tier === 'vip') {
        return {
          check: {
            allowed: true,
            tier,
            currentCount: generationsCount,
            userId,
          },
        };
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const isToday = lastDate === todayStr;
      const count = isToday ? generationsCount : 0;

      if (isToday && count >= 5) {
        return { error: 'LIMIT_REACHED' };
      }

      return {
        check: {
          allowed: true,
          tier: 'free',
          currentCount: count,
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
 * Incrementa el uso en api_limits tras completarse la generación con la IA mediante RPC atómico.
 */
async function recordApiUsage(userId: string) {
  try {
    const { error: rpcErr } = await supabase.rpc('increment_api_generation', {
      p_user_id: userId,
    });

    if (rpcErr) {
      console.error('Advertencia al invocar increment_api_generation RPC:', rpcErr);
      const todayStr = new Date().toISOString().slice(0, 10);
      await supabase.from('api_limits').upsert({
        user_id: userId,
        generations_count: 1,
        last_generation_date: todayStr,
        tier: 'free',
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Advertencia no bloqueante al actualizar api_limits:', err);
  }
}

/**
 * Server Action que genera tarjetas a partir de un tema de texto usando Gemini 3.8 Flash.
 */
export async function generateCardsAction(
  topic: string,
  cardFormat: CardFormat = 'basic',
  cardCount: number = 10,
  deckId?: string,
  existingQuestions?: string[],
  userId?: string
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
    return { success: false, error: 'LIMIT_REACHED' };
  }
  const apiCheck = checkResult.check;

  // Límite seguro de 30 tarjetas por petición para evitar saturación y truncamientos
  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

  try {
    // 1. Consultar historial de tarjetas existentes en este mazo para la Memoria Anti-Duplicados
    const existingFronts = await fetchExistingCardFronts(deckId, existingQuestions);
    const antiDuplicatePrompt = buildAntiDuplicateSection(existingFronts);

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
        systemInstruction: SYSTEM_INSTRUCTION_GROUNDING,
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

    // Registrar uso en api_limits tras generación exitosa
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
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

  // 0. Protección estricta de Cuotas API / Bypass VIP (sin bypass si no hay usuario resoluble)
  const resolvedUserId = await resolveUserId(input.deckId, input.userId);
  if (!resolvedUserId) {
    console.warn('No se pudo resolver user_id para control de cuota en documento. Bloqueo de seguridad activado.');
    return { success: false, error: 'LIMIT_REACHED' };
  }

  const checkResult = await enforceApiLimit(resolvedUserId);
  if ('error' in checkResult) {
    return { success: false, error: 'LIMIT_REACHED' };
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

    // 3. Consultar historial de tarjetas existentes en este mazo para la Memoria Anti-Duplicados
    const existingFronts = await fetchExistingCardFronts(deckId, existingQuestions);
    const antiDuplicatePrompt = buildAntiDuplicateSection(existingFronts);

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
        systemInstruction: SYSTEM_INSTRUCTION_GROUNDING,
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

    // Registrar uso en api_limits tras generación exitosa
    if (apiCheck) {
      await recordApiUsage(apiCheck.userId);
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
    cardFormat = 'basic',
    cardCount = 10,
    existingQuestions,
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
    return { success: false, error: 'LIMIT_REACHED' };
  }
  const apiCheck = checkResult.check;

  const targetCount = Math.max(1, Math.min(30, cardCount || 10));

  try {
    const youtubeVideoId = extractYouTubeVideoId(parsedUrl.href);
    const isYouTube = Boolean(youtubeVideoId);
    const canonicalYouTubeUrl = youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : '';

    // 1. Consultar historial de tarjetas existentes en este mazo para la Memoria Anti-Duplicados
    const existingFronts = await fetchExistingCardFronts(deckId, existingQuestions);
    const antiDuplicatePrompt = buildAntiDuplicateSection(existingFronts);

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
      ? `Debes analizar el contenido dando PRIORIDAD ABSOLUTA a la sección solicitada ("${focusInstruction}") y generar EXACTAMENTE ${targetCount} tarjetas extraídas EXCLUSIVAMENTE de esa parte.`
      : `Debes analizar el contenido completo y generar EXACTAMENTE ${targetCount} tarjetas cubriendo los conceptos clave de forma equitativa desde el principio hasta el final del contenido.`;

    const promptText = `Eres un pedagogo experto en diseño pedagógico y repetición espaciada (algoritmo FSRS).
${coverageText} Fuente: ${sourceLabel} ("${sourceRef}").

${focusRuleSection ? `${focusRuleSection}\n\n` : ''}${GLOBAL_RULES}

${getFormatInstructions(cardFormat)}

${RADAR_DIRECTIVE}

${antiDuplicatePrompt ? `${antiDuplicatePrompt}\n\n` : ''}REGLA CRÍTICA DE INTEGRIDAD:
La integridad estructural del JSON es prioridad absoluta y DEBES devolver un objeto con "core_exhausted" (booleano) y "cards" (array con exactamente ${targetCount} tarjetas del formato "${cardFormat}"). Para garantizar que quepan las ${targetCount} tarjetas dentro del límite de tokens sin que el JSON se corte, mantén cada pregunta, opción y respuesta rigurosa pero concisa y directa.`;

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
          model: 'gemini-3.8-flash',
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
          config: {
            systemInstruction: SYSTEM_INSTRUCTION_GROUNDING,
            responseMimeType: 'application/json',
            responseJsonSchema: flashcardSchema,
            maxOutputTokens: 8192,
          },
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
            model: 'gemini-3.8-flash',
            contents: [
              {
                text: `${promptText}\n\nTRANSCRIPCIÓN DEL VÍDEO DE YOUTUBE:\n=========================================\n${truncatedTranscript}\n=========================================`,
              },
            ],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION_GROUNDING,
              responseMimeType: 'application/json',
              responseJsonSchema: flashcardSchema,
              maxOutputTokens: 8192,
            },
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
        model: 'gemini-3.8-flash',
        contents: [
          {
            text: `${promptText}\n\nCONTENIDO EXTRAÍDO DEL ENLACE WEB:\n=========================================\n${truncatedWebText}\n=========================================`,
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_GROUNDING,
          responseMimeType: 'application/json',
          responseJsonSchema: flashcardSchema,
          maxOutputTokens: 8192,
        },
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

    // Aplicar aleatorización Fisher-Yates a las opciones de preguntas test
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
    const message = err instanceof Error ? err.message : 'Error desconocido al procesar el enlace';
    console.error('Error in generateCardsFromUrlAction:', err);
    return {
      success: false,
      error: `Error al procesar el enlace con Gemini: ${message}`,
    };
  }
}
