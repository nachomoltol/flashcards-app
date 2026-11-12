'use server';

import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createInitialCardValues } from '@/lib/fsrs';
import { deduplicateCandidateCards } from '@/lib/cardDeduplication';
import { randomizeMultipleChoiceCard } from '@/lib/cardUtils';
import { GEMINI_DEFAULT_MODEL } from '@/lib/aiConfig';
import {
  buildDidacticModeDirective,
  PRACTICAL_MODE_DIRECTIVE,
  ZERO_MISMATCH_DIRECTIVE,
  buildUniversalTablesDirective,
} from '@/lib/aiDirectives';
import type {
  CardFormat,
  GeneratedCard,
  GenerateCardsResult,
  HandwrittenNotesInput,
} from '@/types/cards';

const GEMINI_MODEL = GEMINI_DEFAULT_MODEL;

const flashcardSchema = {
  type: Type.OBJECT,
  description:
    'Objeto con tarjetas de estudio de alta precisión extraídas de fotos de apuntes manuscritos',
  properties: {
    conceptos_identificados: {
      type: Type.ARRAY,
      description:
        'Lista de conceptos clave, definiciones, fórmulas o hechos identificados en las notas manuscritas.',
      items: {
        type: Type.STRING,
      },
    },
    core_exhausted: {
      type: Type.BOOLEAN,
      description:
        'true si todos los conceptos principales de las notas ya han sido convertidos en tarjetas; false si aún queda materia evaluable.',
    },
    cards: {
      type: Type.ARRAY,
      description:
        'Array de tarjetas de estudio adaptadas al formato solicitado.',
      items: {
        type: Type.OBJECT,
        properties: {
          generation_index: {
            type: Type.INTEGER,
            description: 'Índice correlativo de la tarjeta (1, 2, 3...).',
          },
          justification: {
            type: Type.STRING,
            description:
              'Fundamento o cita directa extraída de los apuntes manuscritos que justifica la respuesta correcta (Chain of Thought).',
          },
          question: {
            type: Type.STRING,
            description: 'Enunciado limpio y directo de la pregunta.',
          },
          options: {
            type: Type.ARRAY,
            description:
              'Array con exactamente 4 opciones de respuesta para multiple_choice. Vacío en otros formatos.',
            items: {
              type: Type.STRING,
            },
          },
          correct_option_index: {
            type: Type.INTEGER,
            description:
              'Índice de 0 a 3 de la opción verdadera en el array options (solo multiple_choice).',
          },
          front: {
            type: Type.STRING,
            description:
              'Anverso de la tarjeta (pregunta para basic, texto con [...] para cloze, afirmación para true_false o pregunta con opciones a-d para multiple_choice).',
          },
          back: {
            type: Type.STRING,
            description:
              'Reverso de la tarjeta con respuesta precisa y justificación técnica basada en los apuntes.',
          },
          cardFormat: {
            type: Type.STRING,
            description: 'Formato: "multiple_choice", "basic", "cloze" o "true_false"',
          },
        },
        required: ['generation_index', 'front', 'back', 'cardFormat'],
      },
    },
  },
  required: ['conceptos_identificados', 'core_exhausted', 'cards'],
};

function getFormatInstructions(format: CardFormat = 'multiple_choice'): string {
  switch (format) {
    case 'multiple_choice':
      return `FORMATO OBLIGATORIO: multiple_choice (Opción Múltiple / Test Determinista con Chain of Thought):
- "justification": Razonamiento factual o fórmula extraída de los apuntes ANTES de elegir la opción correcta.
- "question": Enunciado limpio de la pregunta sin letras ni opciones.
- "options": Exactamente 4 alternativas plausibles [opción 0, opción 1, opción 2, opción 3].
- "correct_option_index": Número entero (0 a 3) de la opción verdadera.
- "front": Enunciado seguido de las 4 opciones en líneas separadas: a) ..., b) ..., c) ..., d) ...
- "back": Letra y texto de la opción verdadera, seguida de '\\n\\nExplicación: [Justificación de los apuntes]'.
- "cardFormat": "multiple_choice"`;

    case 'cloze':
      return `FORMATO OBLIGATORIO: cloze (Rellenar huecos):
- "front": Texto conceptual riguroso con la palabra o fórmula clave oculta usando la notación [...] (ejemplo: "En los apuntes, la ley de [...] establece que...").
- "back": Texto completo con la solución resaltada en negrita (ejemplo: "En los apuntes, la ley de **Ohm** establece que...").
- "options": Debe ser un array vacío ([]).
- "cardFormat": "cloze"`;

    case 'true_false':
      return `FORMATO OBLIGATORIO: true_false (Verdadero o Falso):
- "front": Afirmación conceptual rotunda basada en los apuntes.
- "back": Debe iniciar con '**Verdadero**' o '**Falso**' seguido de una línea en blanco y: 'Explicación: [Justificación fundamentada en los apuntes]'.
- "options": Debe ser un array vacío ([]).
- "cardFormat": "true_false"`;

    case 'basic':
    default:
      return `FORMATO OBLIGATORIO: basic (Pregunta y Respuesta Directa):
- "front": Pregunta directa y precisa para evaluar un concepto o fórmula de los apuntes.
- "back": Respuesta rigurosa y concisa, seguida de una explicación técnica que aporte contexto.
- "options": Debe ser un array vacío ([]).
- "cardFormat": "basic"`;
  }
}

async function resolveUserId(deckId?: string, explicitUserId?: string): Promise<string | null> {
  if (explicitUserId && explicitUserId.trim()) {
    return explicitUserId.trim();
  }

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

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user.id;
  } catch {
    // Siguiente intento
  }

  return null;
}

function processGeneratedCards(
  parsedCards: GeneratedCard[],
  targetCount: number,
  cardFormat: CardFormat
): GeneratedCard[] {
  return parsedCards.slice(0, targetCount).map((card, idx) => {
    let front = (card.front || '').trim();
    let back = (card.back || '').trim();
    const resolvedFormat = (card.cardFormat as CardFormat) || cardFormat;
    const isMultipleChoice = resolvedFormat === 'multiple_choice';
    let cleanedOpts: string[] | undefined = undefined;

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
        .map((opt) => String(opt).replace(/^[a-d][\)\.\:\-]\s*/i, '').trim());
      const correctIdx = Math.min(Math.max(0, Math.floor(card.correct_option_index)), 3);
      const correctText = rawOpts[correctIdx];
      cleanedOpts = rawOpts;

      const qText = (card.question || front)
        .replace(/(?:^|\r?\n|\s+)(?:\(?a\s*[\)\.\-\]\:]|\ba\))\s+[\s\S]*$/i, '')
        .trim();

      const formattedOpts = rawOpts.map((opt, i) => `${letters[i]}) ${opt}`).join('\n');
      front = `${qText}\n\n${formattedOpts}`;

      const rawExplanation = (card.justification || back)
        .replace(/^[a-d][\)\.\:\-]\s*/i, '')
        .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
        .replace(/^(?:Explicación|Justificación):\s*/i, '')
        .trim();

      back = `${letters[correctIdx]}) ${correctText}${
        rawExplanation ? `\n\nExplicación: ${rawExplanation}` : ''
      }`;
    }

    const cleaned: GeneratedCard = {
      generation_index: idx + 1,
      front,
      back,
      cardFormat: resolvedFormat,
      cardType: resolvedFormat === 'cloze' ? 'cloze' : 'basic',
      options: isMultipleChoice && cleanedOpts ? cleanedOpts : undefined,
      question: card.question,
      justification: card.justification,
      correct_option_index: card.correct_option_index,
    };

    return isMultipleChoice ? randomizeMultipleChoiceCard(cleaned) : cleaned;
  });
}

/**
 * Valida la cuota de generación del usuario en api_limits exclusivamente desde el servidor
 * mediante el RPC 'check_api_limit' de Supabase (sin importar módulos de cliente).
 */
async function checkServerQuota(
  userId: string
): Promise<{ allowed: boolean; reason?: 'LIMIT_REACHED' | 'AD_REQUIRED' }> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('check_api_limit', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as {
        allowed?: boolean;
        error?: 'LIMIT_REACHED' | 'AD_REQUIRED';
        tier?: 'free' | 'pro' | 'vip';
        bonus_credits?: number;
      };

      if (res.allowed === false) {
        return {
          allowed: false,
          reason: res.error || 'LIMIT_REACHED',
        };
      }

      return { allowed: true };
    }

    if (rpcError) {
      console.warn('[generateCardsFromNotes] RPC check_api_limit error, fallback to table:', rpcError);
    }

    // Fallback a consulta directa sobre la tabla api_limits
    const { data: directData } = await supabase
      .from('api_limits')
      .select('tier, generations_count, bonus_credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (directData) {
      const tier = (directData.tier as 'free' | 'pro' | 'vip') || 'free';
      const count = typeof directData.generations_count === 'number' ? directData.generations_count : 0;
      const bonus = typeof directData.bonus_credits === 'number' ? directData.bonus_credits : 0;

      if (tier === 'pro' || tier === 'vip') {
        if (count >= 120) return { allowed: false, reason: 'LIMIT_REACHED' };
        return { allowed: true };
      }

      if (count >= 50) return { allowed: false, reason: 'LIMIT_REACHED' };
      if (bonus <= 0) return { allowed: false, reason: 'AD_REQUIRED' };

      return { allowed: true };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[generateCardsFromNotes] Error en checkServerQuota:', err);
    return { allowed: true };
  }
}

/**
 * Server Action: Genera tarjetas a partir de fotos de apuntes manuscritos.
 * Procesamiento 100% efímero en memoria RAM:
 * - Recibe imágenes en base64.
 * - Transmite inlineData a Gemini 3.1 Flash-Lite.
 * - Inserta tarjetas en la tabla `cards` de Supabase.
 * - 0 bytes guardados en Supabase Storage o File API.
 */
export async function generateCardsFromNotesAction(
  input: HandwrittenNotesInput
): Promise<GenerateCardsResult> {
  try {
    if (!input || typeof input !== 'object') {
      return { success: false, error: 'Parámetros de entrada inválidos.', cards: [] };
    }

    const {
      deckId,
      userId: explicitUserId,
      images = [],
      cardFormat = 'multiple_choice',
      cardCount = 10,
      customPrompt,
      focusInstruction,
      language = 'es',
      isPracticalMode = false,
      pedagogicalMode = 'academic',
      docenteFormat = 'mixed_test',
      targetAudience = 'auto',
    } = input;

    if (!deckId) {
      return { success: false, error: 'Identificador del mazo (deckId) no proporcionado.', cards: [] };
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return { success: false, error: 'Debes seleccionar al menos una foto de apuntes.', cards: [] };
    }

    if (images.length > 10) {
      return { success: false, error: 'Se permite un máximo de 10 fotos por lote para asegurar calidad.', cards: [] };
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error:
          'Clave GEMINI_API_KEY no configurada. Por favor define GEMINI_API_KEY en tu entorno.',
        cards: [],
      };
    }

    // Inicializar cliente de base de datos en servidor
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      'https://placeholder.supabase.co';

    const dbClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabase;

    // 1. Control de cuota de generación 100% Server-Side
    const resolvedUserId = await resolveUserId(deckId, explicitUserId);
    if (!resolvedUserId) {
      return { success: false, error: 'LIMIT_REACHED', cards: [] };
    }

    const quotaCheck = await checkServerQuota(resolvedUserId);
    if (!quotaCheck.allowed) {
      return {
        success: false,
        error: quotaCheck.reason === 'AD_REQUIRED' ? 'AD_REQUIRED' : 'LIMIT_REACHED',
        cards: [],
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    // 2. Ordenar secuencialmente las imágenes y construir inlineData
    const sortedImages = [...images].sort((a, b) => a.order - b.order);
    const inlineImageParts = sortedImages.map((img) => ({
      inlineData: {
        data: img.base64Data,
        mimeType: img.mimeType,
      },
    }));

    const effectiveInstruction = (customPrompt || focusInstruction || '').trim();

    const isDocenteMode = pedagogicalMode === 'didactic' || (pedagogicalMode as unknown as string) === 'docente';
    const didacticDirective = isDocenteMode ? `\n\n${buildDidacticModeDirective(docenteFormat, targetAudience)}\n` : '';
    const practicalDirective = isPracticalMode ? `\n\n${PRACTICAL_MODE_DIRECTIVE}\n` : '';

    // 3. Prompt pedagógico especializado para OCR de caligrafía
    const systemPromptText = `ERES UN PROFESOR UNIVERSITARIO Y ANALISTA CALIGRÁFICO MULTIMODAL ESPECIALIZADO EN EXTRACCIÓN DIDÁCTICA DE APUNTES MANUSCRITOS.
Has recibido ${sortedImages.length} foto(s) consecutiva(s) de apuntes manuscritos (cuadernos, esquemas conceptuales, pizarras o fichas de estudio).

TUS REGLAS DE ORO:
1. TRANSCRIPCIÓN Y OCR CALIGRÁFICO ROBUSTO:
   - Lee con máxima fidelidad la caligrafía (cursiva, imprenta, anotaciones rápidas, glosas en márgenes).
   - Interpreta la jerarquía visual de los apuntes: títulos subrayados, esquemas con llaves/flechas, tablas comparativas y diagramas.
   - Corrige erratas o faltas evidentes del autor, pero mantén intacto el rigor científico y técnico de la materia.
   - OMITIR ESTRICTAMENTE: Tachones, palabras tachadas, notas personales del estudiante ("comprar pan", "recordar examen") y garabatos irrelevantes.

2. ATOMICIDAD DIDÁCTICA Y PRECISIÓN FACTUAL:
   - Extrae los principios esenciales, definiciones, clasificaciones, reglas mnemotécnicas, fechas y fórmulas.
   - Genera exactamente ${cardCount} tarjetas de estudio de alta calidad pedagógica.
   - Cada tarjeta debe ser autocontenida y evaluar un concepto concreto.

3. REGLAS DE FORMATO SOLICITADO ("${cardFormat}"):
${getFormatInstructions(cardFormat)}${didacticDirective}${practicalDirective}

4. TRATAMIENTO DE TABLAS Y ESQUEMAS:
${buildUniversalTablesDirective(false)}

5. AUTO-AUDITORÍA LÓGICA (ZERO-MISMATCH):
${ZERO_MISMATCH_DIRECTIVE}

${effectiveInstruction ? `INSTRUCCIÓN ESPECÍFICA DEL ESTUDIANTE:\n"${effectiveInstruction}"\n` : ''}

IDIOMA DE SALIDA: ${language === 'en' ? 'Inglés' : 'Español'}.`;

    const contents = [
      ...inlineImageParts,
      { text: systemPromptText },
    ];

    // 4. Inferencia con Gemini 3.1 Flash-Lite
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: flashcardSchema,
      },
    });

    const responseText = response.text?.trim() || '';
    if (!responseText) {
      throw new Error('Gemini no retornó contenido en la respuesta.');
    }

    let parsed: { conceptos_identificados?: string[]; core_exhausted?: boolean; cards?: GeneratedCard[] };
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn('Error al parsear JSON retornado por Gemini:', parseErr, responseText);
      throw new Error('La respuesta de la IA no cumplió el esquema JSON requerido.');
    }

    const candidateCards: GeneratedCard[] = parsed.cards || [];
    if (candidateCards.length === 0) {
      return {
        success: false,
        error: 'No se pudieron extraer conceptos legibles de las fotos proporcionadas. Asegúrate de que las fotos tengan buena iluminación y enfoque.',
      };
    }

    // 5. Deduplicación con tarjetas existentes en el mazo
    const { data: existingRows } = await dbClient
      .from('cards')
      .select('front, back')
      .eq('deck_id', deckId);

    const existingCards = existingRows || [];

    const { uniqueCards } = await deduplicateCandidateCards({
      candidateCards,
      existingCards,
      apiKey,
      similarityThreshold: 0.85,
      targetCount: cardCount,
    });

    const processedCards = processGeneratedCards(uniqueCards, cardCount, cardFormat);

    // 6. Inserción directa en la base de datos Supabase (cards table)
    const initialFSRS = createInitialCardValues();
    const cardsToInsert = processedCards.map((card) => {
      const resolvedFormat: CardFormat =
        card.cardFormat || (card.cardType === 'cloze' ? 'cloze' : 'basic');
      return {
        deck_id: deckId,
        front: card.front.trim(),
        back: card.back.trim(),
        card_type: card.cardType || (card.cardFormat === 'cloze' ? 'cloze' : 'basic'),
        card_format: resolvedFormat,
        cardFormat: resolvedFormat,
        due: initialFSRS.due,
        stability: initialFSRS.stability,
        difficulty: initialFSRS.difficulty,
        state: initialFSRS.state,
        reps: initialFSRS.reps,
        lapses: initialFSRS.lapses,
        last_review: null,
      };
    });

    if (cardsToInsert.length > 0) {
      const { error: insertErr } = await dbClient
        .from('cards')
        .insert(cardsToInsert);

      if (insertErr) {
        console.error('Error al insertar flashcards en Supabase:', insertErr);
        throw insertErr;
      }
    }

    // 7. Registro de uso de cuota en api_limits
    await dbClient.rpc('increment_api_generation', {
      p_user_id: resolvedUserId,
    });

    const isExhausted = Boolean(parsed.core_exhausted) || processedCards.length < cardCount;

    return {
      success: true,
      cards: processedCards,
      core_exhausted: isExhausted,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar notas';
    console.error('[generateCardsFromNotesAction] Error:', err);
    return {
      success: false,
      error: message,
      cards: [],
    };
  }
}
