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
 * Resuelve la clave de la API de Gemini desde variables de entorno
 */
function resolveGeminiApiKey(): string | null {
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }
  return null;
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
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    console.error('[socraticTutor] GEMINI_API_KEY no está configurada.');
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
        ? `You are Flashmente's Socratic Tutor 🦉. The student has read your previous guidance and now has a specific follow-up doubt.
Respond with pedagogical warmth and precision in English (maximum 100-120 words):
- Address the exact core of their doubt, connecting it to the concept and topic ("${deckTitle}").
- Use a direct clarification, contrast, or simple analogy if confusion persists.
- Conclude with an encouraging statement or takeaway that solidifies their learning.`
        : `Eres el Tutor Socrático de Flashmente 🦉. El alumno ha leído tu orientación previa y plantea una duda puntual de seguimiento.
Responde con calidez didáctica y precisión en Español (máximo 100-120 palabras):
- Resuelve el núcleo exacto de la duda conectándolo con el concepto y tema ("${deckTitle}").
- Utiliza una aclaración directa, contraste o analogía simple si persiste la confusión.
- Cierra con una frase estimulante que fije el aprendizaje definitivo.`;

      userPrompt = isEnglish
        ? `DECK TOPIC: ${deckTitle}
ORIGINAL QUESTION: ${question}
CORRECT ANSWER: ${correctAnswer}
PREVIOUS TUTOR EXPLANATION: ${previousExplanation || 'N/A'}
STUDENT'S FOLLOW-UP QUESTION: ${followUpQuestion}

Answer the student's follow-up doubt with pedagogical warmth and precision (max 100-120 words):`
        : `TEMA DEL MAZO: ${deckTitle}
PREGUNTA ORIGINAL: ${question}
RESPUESTA CORRECTA: ${correctAnswer}
EXPLICACIÓN PREVIA DEL TUTOR: ${previousExplanation || 'N/A'}
DUDA / REPREGUNTA DEL ALUMNO: ${followUpQuestion}

Responde a la duda puntual del alumno con calidez didáctica y precisión (máximo 100-120 palabras):`;
    } else {
      systemInstruction = isEnglish
        ? `You are Flashmente's Socratic Tutor 🦉, an elite cognitive mentor designed to transform mistakes into deep learning opportunities.
The student has just missed this flashcard. Your mission is not to give a telegraphic answer or recite definitions, but to guide their reasoning so they understand the root cause of their error.

Mandatory structure of your response (maximum 150-180 words in total, natural, warm, and rigorous tone in English):
1. Cognitive empathy & diagnosis: Validate why the student's choice or misconception feels tempting or common, briefly identifying the conceptual trap.
2. Conceptual breakthrough & revelation: Illuminate the critical difference or true mechanism through a sharp contrast, real-world example, or intuitive analogy that dispels the confusion. Firmly tie it to the deck topic ("${deckTitle}").
3. Socratic closure: Conclude with a brief reflective question or direct mnemonic key so the student can consolidate the distinction themselves.`
        : `Eres el Tutor Socrático de Flashmente 🦉, un mentor cognitivo de élite diseñado para transformar un fallo en un momento de aprendizaje profundo.
El alumno acaba de equivocarse en esta tarjeta. Tu misión no es darle una respuesta telegráfica ni dictar la definición de memoria, sino guiar su razonamiento para que comprenda la raíz de su error.

Estructura obligatoria de tu respuesta (máximo 150-180 palabras en total, lenguaje natural, cálido y riguroso en Español):
1. Empatía cognitiva y diagnóstico: Valida por qué la opción o confusión del alumno resulta tentadora o común, señalando brevemente la trampa conceptual.
2. Quiebre conceptual y revelación: Ilumina la diferencia crítica o mecanismo real mediante un contraste nítido, ejemplo o analogía cotidiana que desmonte la confusión. Conéctalo firmemente con el tema del mazo ("${deckTitle}").
3. Cierre socrático: Finaliza con una breve pregunta reflexiva o clave nemotécnica directa para que el alumno consolide la distinción por sí mismo.`;

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
        ? `CORRECT ANSWER / GROUND TRUTH: ${correctAnswer}\n\nApply the 3-act pedagogical structure (cognitive empathy, conceptual breakthrough, and socratic closure) to explain this error to the student:`
        : `RESPUESTA CORRECTA / FUNDAMENTO: ${correctAnswer}\n\nAplica la estructura pedagógica de 3 actos (empatía y diagnóstico, quiebre conceptual y cierre socrático) para explicar este fallo al alumno:`;
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.55,
        maxOutputTokens: 260,
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
