'use server';

import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export interface KeyConceptItem {
  title: string;
  description: string;
  keyTakeaway: string;
}

export interface ContrastTableItem {
  title: string;
  description?: string;
  headers: string[];
  rows: string[][];
}

export interface CriticalDataItem {
  label: string;
  value: string;
  context: string;
}

export interface MnemonicItem {
  concept: string;
  rule: string;
  explanation: string;
}

export interface DeckSummaryGuide {
  title: string;
  deckTitle: string;
  generatedAt: string;
  cardCount: number;
  key_concepts: KeyConceptItem[];
  contrast_tables: ContrastTableItem[];
  critical_data: CriticalDataItem[];
  mnemonics: MnemonicItem[];
}

export interface GenerateDeckSummaryResult {
  success: boolean;
  summary?: DeckSummaryGuide;
  cached?: boolean;
  error?: string;
}

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Obtiene un cliente de Supabase administrativo con SERVICE_ROLE_KEY para acciones de servidor,
 * evitando que las políticas de RLS bloqueen la consulta cuando no hay cookies de sesión en Node.js.
 */
function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (url && serviceKey) {
    return createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

/**
 * Resuelve la clave de la API de Gemini desde variables de entorno o lee directamente
 * de .env.local en caso de que el entorno de desarrollo no la haya cargado en caliente.
 */
function resolveGeminiApiKey(): string | null {
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^(?:GEMINI_API_KEY|GOOGLE_GENAI_API_KEY)\s*=\s*(.*)$/m);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        if (val) return val;
      }
    }
  } catch (err) {
    console.warn('[generateDeckSummary] Advertencia al leer .env.local de respaldo:', err);
  }

  return null;
}


const deckSummarySchema = {
  type: Type.OBJECT,
  description: 'Documento estructurado de síntesis y repaso rápido de alto rendimiento (Cheat Sheet de estudio)',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título ejecutivo del documento de síntesis',
    },
    key_concepts: {
      type: Type.ARRAY,
      description: 'Ideas fuerza y fundamentos troncales extraídos del mazo (de 3 a 6 conceptos clave)',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Nombre del concepto clave o principio troncal' },
          description: { type: Type.STRING, description: 'Explicación concisa y rigurosa del mecanismo o teoría' },
          keyTakeaway: { type: Type.STRING, description: 'Conclusión indispensable para no fallar preguntas de este concepto' },
        },
        required: ['title', 'description', 'keyTakeaway'],
      },
    },
    contrast_tables: {
      type: Type.ARRAY,
      description: 'Tablas comparativas de conceptos que suelen confundirse o generar trampas de examen (de 1 a 3 tablas)',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Título de la tabla comparativa (ej. "Diagnóstico Diferencial A vs B")' },
          description: { type: Type.STRING, description: 'Breve contexto del contraste' },
          headers: {
            type: Type.ARRAY,
            description: 'Encabezados de columnas (ej. ["Criterio", "Concepto A", "Concepto B"])',
            items: { type: Type.STRING },
          },
          rows: {
            type: Type.ARRAY,
            description: 'Filas de la tabla (cada fila es un array de strings correspondiente a los headers)',
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
        required: ['title', 'headers', 'rows'],
      },
    },
    critical_data: {
      type: Type.ARRAY,
      description: 'Cifras, dosis, fechas, plazos, porcentajes o umbrales indispensables para memorizar (de 4 a 8 datos)',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: 'Nombre de la variable o dato crítico' },
          value: { type: Type.STRING, description: 'Cifra exacta, valor numérico o umbral legal/médico/técnico' },
          context: { type: Type.STRING, description: 'Contexto de aplicación o relevancia' },
        },
        required: ['label', 'value', 'context'],
      },
    },
    mnemonics: {
      type: Type.ARRAY,
      description: 'Reglas mnemotécnicas, acrónimos o frases ingeniosas para fijar datos difíciles (de 2 a 4 mnemotecnias)',
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING, description: 'Concepto complejo o lista a recordar' },
          rule: { type: Type.STRING, description: 'Acrónimo, frase o truco mnemotécnico' },
          explanation: { type: Type.STRING, description: 'Desglose paso a paso de cada letra o elemento de la regla' },
        },
        required: ['concept', 'rule', 'explanation'],
      },
    },
  },
  required: ['title', 'key_concepts', 'contrast_tables', 'critical_data', 'mnemonics'],
};

/**
 * Server Action para generar y consultar la Guía de Repaso Rápido de un Mazo.
 * Implementa caché en Supabase en `decks.summary_guide` para coste 0 en lecturas posteriores.
 */
export async function getOrGenerateDeckSummaryAction(
  deckId: string,
  userIdOrLocale?: string,
  localeOrForce?: 'es' | 'en' | boolean,
  forceRegenerate: boolean = false
): Promise<GenerateDeckSummaryResult> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    console.error('[generateDeckSummary] Error: deckId vacío o no proporcionado.');
    return { success: false, error: 'DECK_ID_REQUIRED' };
  }

  // Resolver argumentos flexibles (permite signature con o sin userId)
  const isSecondArgLocale = userIdOrLocale === 'es' || userIdOrLocale === 'en';
  const resolvedUserId = isSecondArgLocale ? undefined : userIdOrLocale?.trim();
  const resolvedLocale: 'es' | 'en' = isSecondArgLocale
    ? (userIdOrLocale as 'es' | 'en')
    : (localeOrForce === 'es' || localeOrForce === 'en' ? localeOrForce : 'es');
  const resolvedForce = typeof localeOrForce === 'boolean' ? localeOrForce : forceRegenerate;

  console.log(`[generateDeckSummary] Solicitando guía para mazo: ${cleanDeckId} (userId: ${resolvedUserId || 'N/A'}, locale: ${resolvedLocale}, force: ${resolvedForce})`);

  try {
    const db = getServerSupabaseClient();

    // 1. Consultar el mazo en Supabase
    const { data: deck, error: deckErr } = await db
      .from('decks')
      .select('id, title, user_id, is_public, summary_guide')
      .eq('id', cleanDeckId)
      .maybeSingle();

    if (deckErr) {
      console.error('[generateDeckSummary] Error en consulta de mazo en Supabase:', deckErr);
      return { success: false, error: 'DB_ERROR' };
    }

    if (!deck) {
      console.error(`[generateDeckSummary] DECK_NOT_FOUND: No se encontró ningún mazo con id = "${cleanDeckId}".`);
      return { success: false, error: 'DECK_NOT_FOUND' };
    }

    console.log(`[generateDeckSummary] Mazo localizado: "${deck.title}" (ID: ${deck.id}). Cache presente: ${Boolean(deck.summary_guide)}`);

    // Si ya existe en caché y no se solicitó forzar regeneración
    if (!resolvedForce && deck.summary_guide) {
      const parsed = typeof deck.summary_guide === 'string'
        ? JSON.parse(deck.summary_guide)
        : deck.summary_guide;

      if (parsed && Array.isArray(parsed.key_concepts)) {
        console.log(`[generateDeckSummary] Retornando guía desde caché para "${deck.title}" (Coste $0).`);
        return {
          success: true,
          summary: parsed as DeckSummaryGuide,
          cached: true,
        };
      }
    }

    // 2. Obtener las tarjetas del mazo para alimentar la síntesis de Gemini
    const { data: cards, error: cardsErr } = await db
      .from('cards')
      .select('front, back, card_format, notes')
      .eq('deck_id', cleanDeckId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (cardsErr) {
      console.error('[generateDeckSummary] Error al consultar tarjetas con deck_id:', cardsErr);
      return { success: false, error: 'CARDS_FETCH_ERROR' };
    }

    if (!cards || cards.length === 0) {
      console.warn(`[generateDeckSummary] El mazo "${deck.title}" no tiene tarjetas registradas.`);
      return {
        success: false,
        error: resolvedLocale === 'en'
          ? 'This deck has no cards yet. Add or generate cards first.'
          : 'El mazo aún no tiene tarjetas. Añade o genera tarjetas primero.',
      };
    }

    console.log(`[generateDeckSummary] Tarjetas obtenidas: ${cards.length}. Procediendo a sintetizar con Gemini 3.1 Flash-Lite...`);

    // 3. Preparar el corpus condensado de tarjetas
    const deckTitle = deck.title || (resolvedLocale === 'en' ? 'Study Deck' : 'Mazo de Estudio');
    const cardsCorpus = cards
      .map((c, i) => {
        let text = `[Card ${i + 1}] Q: ${c.front}\nA: ${c.back}`;
        if (c.notes && c.notes.trim()) {
          text += `\nNote: ${c.notes.trim()}`;
        }
        return text;
      })
      .join('\n---\n');

    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      console.error('[generateDeckSummary] Error: GEMINI_API_KEY no está configurada ni en process.env ni en .env.local.');
      return { success: false, error: 'SERVER_CONFIG_ERROR' };
    }

    console.log('[generateDeckSummary] Inicializando GoogleGenAI con Gemini 3.1 Flash-Lite...');
    const ai = new GoogleGenAI({ apiKey });
    const isEnglish = resolvedLocale === 'en';

    const systemInstruction = isEnglish
      ? `You are an elite academic synthesizer and cognitive architect for Flashmente.
Your task is to analyze the flashcards of the deck "${deckTitle}" and create an ultra-structured, high-yield Quick Study Guide (Cheat Sheet).
MANDATORY RULES:
1. Respond EXCLUSIVELY in English.
2. Structure the output into 4 core sections:
   - key_concepts: 3 to 6 foundational principles or core theoretical mechanisms (clear explanation + key takeaway).
   - contrast_tables: 1 to 3 comparative tables contrasting easily confused concepts, differential diagnoses, or conflicting criteria.
   - critical_data: 4 to 8 indispensable numbers, thresholds, deadlines, formulas, or categorical facts to memorize.
   - mnemonics: 2 to 4 memorable acronyms, association rules, or witty rhymes anchoring tough facts.
3. Be academically rigorous, highly structured, direct, and pedagogical. Eliminate filler words.`
      : `Eres un sintetizador académico de élite y arquitecto cognitivo para Flashmente.
Tu misión es analizar las tarjetas de estudio del mazo "${deckTitle}" y generar una Guía de Repaso Rápido de Alto Rendimiento (Cheat Sheet estructurado).
REGLAS OBLIGATORIAS:
1. Responde OBLIGATORIAMENTE en Español.
2. Estructura el contenido en 4 secciones clave:
   - key_concepts: 3 a 6 ideas fuerza o principios troncales (explicación clara + conclusión/takeaway indispensable).
   - contrast_tables: 1 a 3 tablas comparativas que enfrenten conceptos comúnmente confundidos, diagnósticos diferenciales o clasificaciones enfrentadas.
   - critical_data: 4 a 8 cifras indispensables, dosis, umbrales legales/médicos, plazos, porcentajes o fórmulas a memorizar.
   - mnemonics: 2 a 4 reglas mnemotécnicas, acrónimos o trucos de asociación ingeniosos para afianzar datos complejos.
3. Sé académicamente riguroso, directo, pedagógico y sintético. Elimina texto de relleno.`;

    const userPrompt = isEnglish
      ? `DECK TITLE: ${deckTitle}
TOTAL CARDS ANALYZED: ${cards.length}

FLASHCARDS CONTENT:
${cardsCorpus}

Synthesize this deck into a high-yield study guide following the JSON schema:`
      : `TÍTULO DEL MAZO: ${deckTitle}
TOTAL TARJETAS ANALIZADAS: ${cards.length}

CONTENIDO DE LAS TARJETAS:
${cardsCorpus}

Sintetiza este mazo en una guía de repaso rápido estructurada siguiendo el esquema JSON:`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: deckSummarySchema,
      },
    });

    const responseText = response.text?.trim() || '';
    if (!responseText) {
      console.error('[generateDeckSummary] Gemini no devolvió texto de respuesta.');
      return {
        success: false,
        error: isEnglish
          ? 'Failed to generate study guide.'
          : 'No se pudo generar la guía de repaso.',
      };
    }

    const parsedJson = JSON.parse(responseText);

    const completeGuide: DeckSummaryGuide = {
      title: parsedJson.title || (isEnglish ? `Quick Study Guide: ${deckTitle}` : `Guía de Repaso Rápido: ${deckTitle}`),
      deckTitle,
      generatedAt: new Date().toISOString(),
      cardCount: cards.length,
      key_concepts: parsedJson.key_concepts || [],
      contrast_tables: parsedJson.contrast_tables || [],
      critical_data: parsedJson.critical_data || [],
      mnemonics: parsedJson.mnemonics || [],
    };

    // 4. Persistir en la tabla `decks` (coste 0 en posteriores aperturas)
    const { error: updateErr } = await db
      .from('decks')
      .update({
        summary_guide: completeGuide as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanDeckId);

    if (updateErr) {
      console.warn('[generateDeckSummary] Advertencia al persistir summary_guide en decks:', updateErr);
    } else {
      console.log(`[generateDeckSummary] Guía persistida exitosamente en BD para mazo "${deckTitle}".`);
    }

    return {
      success: true,
      summary: completeGuide,
      cached: false,
    };
  } catch (err) {
    console.error('[generateDeckSummary] Error crítico inesperado:', err);
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
    };
  }
}

