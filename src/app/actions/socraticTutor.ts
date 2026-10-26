'use server';

import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

export interface SocraticTutorInput {
  deckTitle: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  selectedAnswer?: string;
  locale: 'es' | 'en';
  userId?: string;
  followUpQuestion?: string;
  previousExplanation?: string;
}

export interface SocraticTutorResult {
  success: boolean;
  explanation?: string;
  error?: 'AD_REQUIRED' | 'PRO_REQUIRED' | 'AUTH_REQUIRED' | string;
  remainingFree?: number;
  isPro?: boolean;
}

export interface TutorQuotaStatus {
  isPro: boolean;
  tier: 'free' | 'pro' | 'vip';
  count: number;
  freeLimit: number;
  remainingFree: number;
  bonusCredits: number;
  requiresAd: boolean;
}

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Resuelve el ID de usuario autenticado en la sesión o toma el provisto por el cliente
 */
async function resolveAuthUserId(explicitUserId?: string): Promise<string | null> {
  if (explicitUserId && explicitUserId.trim()) {
    return explicitUserId.trim();
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (err) {
    console.warn('Error al verificar sesión en resolveAuthUserId:', err);
    return null;
  }
}

/**
 * Consulta la cuota actual del Tutor Socrático para el usuario
 */
export async function getTutorQuotaStatusAction(explicitUserId?: string): Promise<TutorQuotaStatus> {
  const userId = await resolveAuthUserId(explicitUserId);
  if (!userId) {
    return {
      isPro: false,
      tier: 'free',
      count: 0,
      freeLimit: 3,
      remainingFree: 3,
      bonusCredits: 0,
      requiresAd: false,
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_tutor_quota_status', {
      p_user_id: userId,
    });

    if (!error && data) {
      const res = data as {
        is_pro?: boolean;
        tier?: 'free' | 'pro' | 'vip';
        count?: number;
        free_limit?: number;
        remaining_free?: number;
        bonus_credits?: number;
        requires_ad?: boolean;
      };

      const tier = res.tier || 'free';
      const isPro = tier === 'pro' || tier === 'vip';
      const count = typeof res.count === 'number' ? res.count : 0;
      const remainingFree = isPro ? 9999 : (typeof res.remaining_free === 'number' ? res.remaining_free : Math.max(0, 3 - count));
      const bonusCredits = typeof res.bonus_credits === 'number' ? res.bonus_credits : 0;

      return {
        isPro,
        tier,
        count,
        freeLimit: 3,
        remainingFree,
        bonusCredits,
        requiresAd: !isPro && count >= 3 && bonusCredits <= 0,
      };
    }
  } catch (err) {
    console.warn('Error al consultar get_tutor_quota_status RPC:', err);
  }

  // Fallback a consulta directa de api_limits si RPC no estuviera disponible
  try {
    const { data: record } = await supabase
      .from('api_limits')
      .select('tier, tutor_consultations_count, last_tutor_date, bonus_credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (record) {
      const tier = (record.tier as 'free' | 'pro' | 'vip') || 'free';
      const isPro = tier === 'pro' || tier === 'vip';
      const currentMonth = new Date().toISOString().slice(0, 7);
      const lastMonth = record.last_tutor_date ? String(record.last_tutor_date).slice(0, 7) : null;
      const isSameMonth = lastMonth === currentMonth;
      const count = isSameMonth ? (record.tutor_consultations_count || 0) : 0;
      const bonusCredits = record.bonus_credits || 0;
      const remainingFree = isPro ? 9999 : Math.max(0, 3 - count);

      return {
        isPro,
        tier,
        count,
        freeLimit: 3,
        remainingFree,
        bonusCredits,
        requiresAd: !isPro && count >= 3 && bonusCredits <= 0,
      };
    }
  } catch (directErr) {
    console.warn('Error en fallback getTutorQuotaStatusAction:', directErr);
  }

  return {
    isPro: false,
    tier: 'free',
    count: 0,
    freeLimit: 3,
    remainingFree: 3,
    bonusCredits: 0,
    requiresAd: false,
  };
}

/**
 * Server Action: Genera la explicación socrática post-fallo con Gemini 3.1 Flash-Lite
 */
export async function askSocraticTutorAction(input: SocraticTutorInput): Promise<SocraticTutorResult> {
  const {
    deckTitle,
    question,
    options,
    correctAnswer,
    selectedAnswer,
    locale = 'es',
    userId: explicitUserId,
    followUpQuestion,
    previousExplanation,
  } = input;

  const userId = await resolveAuthUserId(explicitUserId);
  if (!userId) {
    return {
      success: false,
      error: 'AUTH_REQUIRED',
    };
  }

  const isFollowUp = Boolean(followUpQuestion && followUpQuestion.trim());

  // 1. Validar y registrar la cuota de forma atómica solo en la consulta inicial
  let isPro = false;
  let remainingFree = 0;

  if (!isFollowUp) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('record_tutor_consultation', {
        p_user_id: userId,
      });

      if (rpcError) {
        console.error('Error al invocar record_tutor_consultation:', rpcError);
        return {
          success: false,
          error: 'SERVER_ERROR',
        };
      }

      const quotaRes = rpcData as {
        allowed?: boolean;
        error?: string;
        tier?: string;
        count?: number;
        remaining_free?: number;
        bonus_used?: boolean;
      };

      if (quotaRes.allowed === false) {
        if (quotaRes.error === 'AD_REQUIRED') {
          return {
            success: false,
            error: 'AD_REQUIRED',
            remainingFree: 0,
            isPro: false,
          };
        }
        return {
          success: false,
          error: 'PRO_REQUIRED',
          remainingFree: 0,
          isPro: false,
        };
      }

      isPro = quotaRes.tier === 'pro' || quotaRes.tier === 'vip';
      remainingFree = typeof quotaRes.remaining_free === 'number' ? quotaRes.remaining_free : (isPro ? 9999 : 0);
    } catch (err) {
      console.error('Error crítico al procesar cuota del tutor:', err);
      return {
        success: false,
        error: 'SERVER_ERROR',
      };
    }
  } else {
    // Para la repregunta de la tarjeta activa, no se descuenta cuota adicional
    const quota = await getTutorQuotaStatusAction(userId);
    isPro = quota.isPro;
    remainingFree = quota.remainingFree;
  }

  // 2. Invocar Gemini 3.1 Flash-Lite con prompt socrático y límites de coste
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY no está configurada.');
    return {
      success: false,
      error: 'SERVER_CONFIG_ERROR',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const isEnglish = locale === 'en';

    let systemInstruction = '';
    let userPrompt = '';

    if (isFollowUp) {
      systemInstruction = isEnglish
        ? `You are Flashmente's Socratic Tutor 🦉, an expert cognitive mentor.
The student has read your initial explanation and now has a specific follow-up doubt.
MANDATORY RULES:
1. Respond EXCLUSIVELY in English.
2. Be rigorous, direct, and ultra-concise: MAXIMUM 2 sentences (under 60 words).
3. Answer the student's doubt directly, connecting it conceptually to the original question and topic ("${deckTitle}").
4. Maintain a clear, encouraging socratic tone.`
        : `Eres el Tutor Socrático de Flashmente 🦉, un mentor cognitivo de élite.
El alumno ha leído tu explicación inicial y plantea una duda puntual de seguimiento.
REGLAS OBLIGATORIAS:
1. Responde OBLIGATORIAMENTE en Español.
2. Sé riguroso, directo y ultra conciso: MÁXIMO 2 frases claras y clarificadoras (menos de 60 palabras).
3. Resuelve la duda del alumno de forma directa, conectándola con la pregunta y tema del mazo ("${deckTitle}").
4. Mantén un tono socrático claro y estimulante.`;

      userPrompt = isEnglish
        ? `DECK TOPIC: ${deckTitle}
ORIGINAL QUESTION: ${question}
CORRECT ANSWER: ${correctAnswer}
PREVIOUS TUTOR EXPLANATION: ${previousExplanation || 'N/A'}
STUDENT'S FOLLOW-UP QUESTION: ${followUpQuestion}

Answer the student's follow-up doubt in maximum 2 concise sentences:`
        : `TEMA DEL MAZO: ${deckTitle}
PREGUNTA ORIGINAL: ${question}
RESPUESTA CORRECTA: ${correctAnswer}
EXPLICACIÓN PREVIA DEL TUTOR: ${previousExplanation || 'N/A'}
DUDA / REPREGUNTA DEL ALUMNO: ${followUpQuestion}

Responde a la duda puntual del alumno en un máximo de 2 frases concisas:`;
    } else {
      systemInstruction = isEnglish
        ? `You are Flashmente's Socratic Tutor 🦉, an expert cognitive mentor.
The student has just missed this flashcard. Your mission is to help them understand WHY their reasoning failed by illuminating the underlying conceptual distinction or mechanism.

MANDATORY RULES:
1. Respond EXCLUSIVELY in English.
2. Be rigorous, empathetic, and ultra-concise: EXACTLY 2 to 3 direct sentences (max 100 words).
3. Anchor your reasoning in the deck subject ("${deckTitle}"). Contrast the error against the true mechanism of the correct answer.
4. Do NOT merely repeat the correct answer or definition. Dissect why the mistake is common or where the conceptual trap lies.`
        : `Eres el Tutor Socrático de Flashmente 🦉, un mentor cognitivo de élite.
El alumno acaba de fallar esta tarjeta de estudio. Tu misión es ayudarle a comprender de raíz POR QUÉ falló, iluminando el contraste o mecanismo conceptual subyacente.

REGLAS OBLIGATORIAS:
1. Responde OBLIGATORIAMENTE en Español.
2. Sé riguroso, didáctico y ultra conciso: EXACTAMENTE 2 o 3 frases directas y reveladoras (máximo 100 palabras).
3. Ancla el razonamiento en el tema del mazo ("${deckTitle}"). Contrasta el fallo con el verdadero mecanismo de la respuesta correcta.
4. NO te limites a repetir la definición o decir la respuesta correcta. Desmonta la confusión típica o trampa conceptual de forma socrática.`;

      userPrompt = isEnglish
        ? `DECK TOPIC: ${deckTitle}\nQUESTION: ${question}\n`
        : `TEMA DEL MAZO: ${deckTitle}\nPREGUNTA: ${question}\n`;

      if (options && options.length > 0) {
        userPrompt += isEnglish
          ? `OPTIONS EVALUATED:\n${options.join('\n')}\n`
          : `OPCIONES EVALUADAS:\n${options.join('\n')}\n`;
      }

      if (selectedAnswer && selectedAnswer.trim()) {
        userPrompt += isEnglish
          ? `INCORRECT CHOICE BY STUDENT: ${selectedAnswer}\n`
          : `OPCIÓN INCORRECTA MARCADA POR EL ALUMNO: ${selectedAnswer}\n`;
      } else {
        userPrompt += isEnglish
          ? `STUDENT RESULT: Blank / Total Lapse (Failed to recall)\n`
          : `RESULTADO DEL ALUMNO: Olvido total / En blanco (No recordó la respuesta)\n`;
      }

      userPrompt += isEnglish
        ? `CORRECT ANSWER / GROUND TRUTH: ${correctAnswer}\n\nExplain socratically in 2-3 sentences why this error occurs and the key distinction to remember:`
        : `RESPUESTA CORRECTA / FUNDAMENTO: ${correctAnswer}\n\nExplica de forma socrática en 2 o 3 frases por qué ocurre este error y cuál es la distinción clave para no volver a fallarla:`;
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 120,
      },
    });

    const explanation = response.text?.trim() || '';

    if (!explanation) {
      return {
        success: false,
        error: isEnglish
          ? 'The tutor could not generate an explanation at this moment.'
          : 'El tutor no pudo generar una explicación en este momento.',
      };
    }

    return {
      success: true,
      explanation,
      remainingFree,
      isPro,
    };
  } catch (aiErr) {
    console.error('Error al invocar Gemini para el Tutor Socrático:', aiErr);
    return {
      success: false,
      error: 'AI_SERVICE_ERROR',
    };
  }
}
