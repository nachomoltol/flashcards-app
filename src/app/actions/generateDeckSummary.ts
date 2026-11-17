'use server';

import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { GEMINI_DEFAULT_MODEL } from '@/lib/aiConfig';
import type { Database, Json } from '@/types/database';

// ---------------------------------------------------------------------------
// TIPOS Y ESTRUCTURAS DE DATOS (ESQUEMA EXHAUSTIVO DE 6 BLOQUES)
// ---------------------------------------------------------------------------

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

export interface OverviewBlock {
  summary: string;
  learningObjectives: string[];
}

export interface TaxonomyGroup {
  category: string;
  elements: string[];
  description: string;
}

export interface ItemBreakdownEntry {
  name: string;
  role: string;
  dietarySources?: string[];
  deficiency?: string;
  toxicity?: string;
  keyFact: string;
}

/**
 * Esquema oficial de Resumen Completo y Exhaustivo de Capítulo para Flashmente PRO.
 * Contiene 6 bloques pedagógicos sin límites artificiales de conceptos ni tablas.
 */
export interface ExhaustiveDeckSummaryGuide {
  title: string;
  subtitle?: string;
  deckTitle: string;
  generatedAt: string;
  cardCount: number;
  overview: OverviewBlock;
  taxonomy_tree: TaxonomyGroup[];
  item_breakdown: ItemBreakdownEntry[];
  contrast_tables: ContrastTableItem[];
  critical_data: CriticalDataItem[];
  mnemonics: MnemonicItem[];
  key_concepts: KeyConceptItem[]; // Garantizado como array para compatibilidad retroactiva
}

/**
 * Alias retrocompatible para componentes que utilicen DeckSummaryGuide
 */
export type DeckSummaryGuide = ExhaustiveDeckSummaryGuide;

export interface GenerateDeckSummaryResult {
  success: boolean;
  summary?: ExhaustiveDeckSummaryGuide;
  previewGuide?: Partial<ExhaustiveDeckSummaryGuide>;
  isUnlocked?: boolean;
  guidesUnlockedThisMonth?: number;
  maxFreeGuidesPerMonth?: number;
  cached?: boolean;
  error?: string;
}

const GEMINI_MODEL = GEMINI_DEFAULT_MODEL;

// ---------------------------------------------------------------------------
// CLIENTE SUPABASE DE SERVIDOR & RESOLUCIÓN DE API KEY
// ---------------------------------------------------------------------------

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

function resolveGeminiApiKey(): string | null {
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// ESQUEMA JSON PARA GEMINI (SIN RESTRICCIONES ARTIFICIALES)
// ---------------------------------------------------------------------------

const exhaustiveDeckSummarySchema = {
  type: Type.OBJECT,
  description:
    'Documento estructurado de Resumen Completo y Exhaustivo de Capítulo para estudio universitario y oposiciones (Full Chapter Blueprint)',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título académico principal y riguroso del capítulo',
    },
    subtitle: {
      type: Type.STRING,
      description: 'Subtítulo descriptivo del capítulo y alcance temático',
    },
    overview: {
      type: Type.OBJECT,
      description: 'Bloque 1: Síntesis panorámica del capítulo y objetivos de aprendizaje',
      properties: {
        summary: {
          type: Type.STRING,
          description:
            'Síntesis narrativa global del capítulo (2 a 3 párrafos densos, rigurosos y sin relleno que expliquen la arquitectura general del tema).',
        },
        learningObjectives: {
          type: Type.ARRAY,
          description:
            'Lista completa de objetivos docentes y competencias nucleares que el estudiante debe dominar.',
          items: { type: Type.STRING },
        },
      },
      required: ['summary', 'learningObjectives'],
    },
    taxonomy_tree: {
      type: Type.ARRAY,
      description:
        'Bloque 2: Esquema jerárquico y clasificaciones completas. Debe enumerar el 100% de los elementos de cada categoría sin omitir ninguno.',
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'Nombre de la rama, categoría o grupo (ej. Macrominerales, Oligoelementos, Nutrientes Orgánicos)',
          },
          elements: {
            type: Type.ARRAY,
            description: 'Lista exhaustiva de TODOS y cada uno de los elementos pertenecientes a esta categoría.',
            items: { type: Type.STRING },
          },
          description: {
            type: Type.STRING,
            description: 'Criterio taxonómico o principio fisiológico/técnico que define a esta categoría.',
          },
        },
        required: ['category', 'elements', 'description'],
      },
    },
    item_breakdown: {
      type: Type.ARRAY,
      description:
        'Bloque 3: Ficha individual detallada de CADA elemento, concepto o epígrafe tratado en el mazo o documento sin límite de cantidad.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Nombre del elemento, mineral, vitamina, principio o concepto',
          },
          role: {
            type: Type.STRING,
            description: 'Función fisiológica principal, mecanismo de acción o definición técnica exacta',
          },
          dietarySources: {
            type: Type.ARRAY,
            description: 'Fuentes dietéticas primarias, ejemplos prácticos o aplicaciones reales',
            items: { type: Type.STRING },
          },
          deficiency: {
            type: Type.STRING,
            description: 'Patología, signo clínico o consecuencia derivada de su déficit o carencia',
          },
          toxicity: {
            type: Type.STRING,
            description: 'Efectos de sobredosis, toxicidad, contraindicaciones o excepciones',
          },
          keyFact: {
            type: Type.STRING,
            description: 'Dato de oro o trampa recurrente de examen imprescindible para no fallar preguntas test',
          },
        },
        required: ['name', 'role', 'keyFact'],
      },
    },
    contrast_tables: {
      type: Type.ARRAY,
      description: 'Bloque 4: Tablas comparativas cara a cara para desarmar confusiones y trampas de examen',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Título de la tabla comparativa (ej. "Macrominerales vs Oligoelementos" o "Diagnóstico Diferencial")',
          },
          description: {
            type: Type.STRING,
            description: 'Contexto del contraste y motivo pedagógico de la comparación',
          },
          headers: {
            type: Type.ARRAY,
            description: 'Encabezados de columnas (ej. ["Criterio", "Concepto A", "Concepto B"])',
            items: { type: Type.STRING },
          },
          rows: {
            type: Type.ARRAY,
            description: 'Filas de la tabla (cada fila es un array de strings en correspondencia con los headers)',
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
      description:
        'Bloque 5: Cifras críticas, rangos, plazos y dosis oficiales con verificación estricta de unidades (mg vs µg vs g).',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: 'Nombre del parámetro, umbral o variable' },
          value: { type: Type.STRING, description: 'Cifra y unidad rigurosamente verificada (ej. 100 mg/día, 900 µg/día, 1300 mg)' },
          context: { type: Type.STRING, description: 'Contexto de aplicación, población diana o relevancia para examen' },
        },
        required: ['label', 'value', 'context'],
      },
    },
    mnemonics: {
      type: Type.ARRAY,
      description:
        'Bloque 6: Reglas mnemotécnicas, acrónimos o frases nemotécnicas para memorización acelerada (puede ser array vacío [] si no aplica).',
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING, description: 'Concepto complejo o lista a recordar' },
          rule: { type: Type.STRING, description: 'Acrónimo, frase o truco mnemotécnico' },
          explanation: { type: Type.STRING, description: 'Desglose detallado de cada letra o elemento de la regla' },
        },
        required: ['concept', 'rule', 'explanation'],
      },
    },
  },
  required: [
    'title',
    'overview',
    'taxonomy_tree',
    'item_breakdown',
    'contrast_tables',
    'critical_data',
    'mnemonics',
  ],
};

// ---------------------------------------------------------------------------
// NORMALIZACIÓN RETROCOMPATIBLE (ADAPTA GUÍAS ANTIGUAS Y NUEVAS)
// ---------------------------------------------------------------------------

interface RawGuidePayload {
  title?: string;
  subtitle?: string;
  generatedAt?: string;
  cardCount?: number;
  overview?: {
    summary?: string;
    learningObjectives?: string[];
  };
  taxonomy_tree?: TaxonomyGroup[];
  item_breakdown?: ItemBreakdownEntry[];
  contrast_tables?: ContrastTableItem[];
  critical_data?: CriticalDataItem[];
  mnemonics?: MnemonicItem[];
  key_concepts?: KeyConceptItem[];
}

function normalizeToExhaustiveGuide(
  raw: unknown,
  deckTitle: string,
  cardCount: number
): ExhaustiveDeckSummaryGuide {
  const parsed = ((typeof raw === 'string' ? JSON.parse(raw) : raw) as RawGuidePayload | null) || {};

  let overview: OverviewBlock;
  if (parsed.overview && typeof parsed.overview.summary === 'string') {
    overview = {
      summary: parsed.overview.summary,
      learningObjectives: Array.isArray(parsed.overview.learningObjectives)
        ? parsed.overview.learningObjectives
        : [],
    };
  } else if (Array.isArray(parsed.key_concepts) && parsed.key_concepts.length > 0) {
    // Retrocompatibilidad con guías de versión 1
    const summaryText = parsed.key_concepts
      .map((k: KeyConceptItem) => `${k.title}: ${k.description}`)
      .join(' ');
    const objectives = parsed.key_concepts.map((k: KeyConceptItem) => k.keyTakeaway);
    overview = {
      summary: summaryText,
      learningObjectives: objectives,
    };
  } else {
    overview = {
      summary: `Resumen académico estructurado del mazo ${deckTitle}.`,
      learningObjectives: [],
    };
  }

  return {
    title: parsed.title || `Guía de Repaso: ${deckTitle}`,
    subtitle: parsed.subtitle || 'Resumen Integral de Alto Rendimiento',
    deckTitle,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    cardCount: parsed.cardCount || cardCount,
    overview,
    taxonomy_tree: Array.isArray(parsed.taxonomy_tree) ? parsed.taxonomy_tree : [],
    item_breakdown: Array.isArray(parsed.item_breakdown) ? parsed.item_breakdown : [],
    contrast_tables: Array.isArray(parsed.contrast_tables) ? parsed.contrast_tables : [],
    critical_data: Array.isArray(parsed.critical_data) ? parsed.critical_data : [],
    mnemonics: Array.isArray(parsed.mnemonics) ? parsed.mnemonics : [],
    key_concepts: Array.isArray(parsed.key_concepts) ? parsed.key_concepts : [],
  };
}

// ---------------------------------------------------------------------------
// HELPER DE CUOTA MENSUAL INDEPENDIENTE EN api_limits
// ---------------------------------------------------------------------------

/**
 * Consulta y normaliza el ciclo mensual de desbloqueo de guías en api_limits.
 * Si ha vencido el mes, reinicia guides_unlocked_this_month = 0 sin tocar
 * ningún otro contador de la fila (generaciones, tutor, racha, etc.).
 */
export async function checkAndResetMonthlyGuideQuota(
  dbClient: ReturnType<typeof getServerSupabaseClient>,
  userId: string
): Promise<{
  tier: 'free' | 'pro' | 'vip';
  guidesUnlockedThisMonth: number;
  guidesResetAt: string;
}> {
  const { data, error } = await dbClient
    .from('api_limits')
    .select('tier, guides_unlocked_this_month, guides_reset_at')
    .eq('user_id', userId)
    .maybeSingle();

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  if (error || !data) {
    const initialResetAt = currentMonthStart.toISOString();
    if (!data) {
      await dbClient
        .from('api_limits')
        .insert({
          user_id: userId,
          tier: 'free',
          guides_unlocked_this_month: 0,
          guides_reset_at: initialResetAt,
        })
        .select()
        .maybeSingle();
    }
    return {
      tier: 'free',
      guidesUnlockedThisMonth: 0,
      guidesResetAt: initialResetAt,
    };
  }

  const tier = (data.tier || 'free') as 'free' | 'pro' | 'vip';
  let unlockedCount = Number(data.guides_unlocked_this_month) || 0;
  const resetAtDate = data.guides_reset_at ? new Date(data.guides_reset_at) : new Date(0);

  // Reinicio si el mes guardado es anterior al inicio del mes UTC actual
  const shouldReset =
    resetAtDate.getTime() < currentMonthStart.getTime() ||
    now.getTime() >= resetAtDate.getTime() + 32 * 24 * 60 * 60 * 1000;

  if (shouldReset) {
    unlockedCount = 0;
    await dbClient
      .from('api_limits')
      .update({
        guides_unlocked_this_month: 0,
        guides_reset_at: currentMonthStart.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId);

    return {
      tier,
      guidesUnlockedThisMonth: 0,
      guidesResetAt: currentMonthStart.toISOString(),
    };
  }

  return {
    tier,
    guidesUnlockedThisMonth: unlockedCount,
    guidesResetAt: data.guides_reset_at || currentMonthStart.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// PROMPTS Y GENERACIÓN CON GEMINI
// ---------------------------------------------------------------------------

function buildExhaustivePrompts(deckTitle: string, corpusText: string, locale: 'es' | 'en') {
  const isEnglish = locale === 'en';

  const systemInstruction = isEnglish
    ? `You are an elite Professor of Educational Sciences and Chief Medical/Academic Examiner for Flashmente PRO.
Your mission is to construct an EXHAUSTIVE, MASTERFUL Full-Chapter Study Guide from the provided material.
MANDATORY ACADEMIC RULES:
1. Respond EXCLUSIVELY in English adhering to the JSON schema.
2. ZERO ARBITRARY LIMITS: Do NOT limit yourself to 3 or 4 items. If the source material covers 14 minerals, 20 drugs, or 18 laws, list and analyze EVERY SINGLE ONE of them without omission.
3. SIX COMPREHENSIVE BLOCKS:
   - Block 1 (overview): 2 to 3 dense, rigorous paragraphs synthesizing the core mechanisms and learning objectives.
   - Block 2 (taxonomy_tree): Complete taxonomic tree classifying 100% of all entities into categories.
   - Block 3 (item_breakdown): In-depth individual profile for EVERY relevant item (name, physiological/technical role, dietary sources/examples, deficiency consequences, toxicity/exceptions, and key exam takeaway).
   - Block 4 (contrast_tables): Side-by-side matrices specifically contrasting items that examiners use to create confusing test questions.
   - Block 5 (critical_data): Exact official thresholds, clinical ranges, and statutory deadlines with STRICT UNIT VERIFICATION:
     * CRITICAL: Strictly distinguish between milligrams (mg), micrograms (µg), and grams (g). Never confuse micrograms with milligrams for trace elements (e.g. Copper DRI is 900 µg / 0.9 mg, NEVER 900 mg).
   - Block 6 (mnemonics): Natural, practical mnemonics (empty array [] if not applicable).
4. Eliminate conversational pleasantries. Deliver maximum pedagogical density per square centimeter.`
    : `Eres un Catedrático Distinguido en Ciencias de la Educación y Estratega Jefe de Exámenes de Oposiciones para Flashmente PRO.
Tu misión es construir un RESUMEN COMPLETO Y EXHAUSTIVO DE CAPÍTULO a partir del material docente proporcionado.
REGLAS ACADÉMICAS OBLIGATORIAS:
1. Responde OBLIGATORIAMENTE en Español ajustándote al esquema JSON.
2. CERO LÍMITES ARTIFICIALES: PROHIBIDO recortar a 3 o 4 conceptos. Si el tema trata 14 minerales, 20 fármacos o 15 principios jurídicos, debes enumerar y analizar EL 100% DE ELLOS sin omitir ninguno.
3. SEIS BLOQUES PEDAGÓGICOS EXHAUSTIVOS:
   - Bloque 1 (overview): 2 a 3 párrafos densos, técnicos y rigurosos que sinteticen la arquitectura general del capítulo junto a sus objetivos docentes clave.
   - Bloque 2 (taxonomy_tree): Árbol taxonómico y clasificaciones jerárquicas completas enumerando todos los miembros de cada grupo (ej. Macrominerales vs Oligoelementos).
   - Bloque 3 (item_breakdown): Ficha exhaustiva individual de CADA elemento o concepto del capítulo (nombre, función fisiológica/mecanismo, fuentes dietéticas o ejemplos prácticos, patología por déficit, toxicidad/contraindicaciones y dato clave de examen).
   - Bloque 4 (contrast_tables): Tablas comparativas cara a cara para desmontar las preguntas trampa más habituales de los tribunales de examen.
   - Bloque 5 (critical_data): Cifras oficiales, umbrales y dosis con VERIFICACIÓN ESTRICTA DE UNIDADES:
     * OBLIGATORIO: Distingue rigurosamente entre miligramos (mg), microgramos (µg) y gramos (g). Bajo ningún concepto confundas microgramos con miligramos en oligoelementos (ej. el Cobre tiene un DRI de 900 µg / 0.9 mg, NUNCA 900 mg; el Yodo 150 µg, etc.).
   - Bloque 6 (mnemonics): Mnemotecnias ingeniosas y naturales en español (devuelve array vacío [] si el tema no lo requiere).
4. Suprime cualquier texto conversacional de cortesía. Maximiza la densidad de conocimiento útil por centímetro cuadrado.`;

  const userPrompt = isEnglish
    ? `CHAPTER / DECK TITLE: ${deckTitle}

SOURCE MATERIAL:
${corpusText}

Generate the exhaustive, full-chapter master study guide now:`
    : `TÍTULO DEL CAPÍTULO / MAZO: ${deckTitle}

MATERIAL DOCENTE FUENTE:
${corpusText}

Genera el resumen completo y exhaustivo de capítulo ahora:`;

  return { systemInstruction, userPrompt };
}

// ---------------------------------------------------------------------------
// GENERACIÓN DIRECTA DESDE TEXTO FUENTE CRUDO (PARA SUBIDA DE DOCUMENTOS)
// ---------------------------------------------------------------------------

/**
 * Genera el Resumen Exhaustivo de Capítulo directamente a partir del texto crudo
 * extraído de un documento en memoria (recortado de forma segura hasta 120.000 caracteres).
 * Diseñado para ejecutarse en paralelo sin bloquear la extracción de tarjetas.
 */
export async function generateExhaustiveSummaryFromRawText(
  deckId: string,
  userId: string,
  rawDocumentText: string,
  locale: 'es' | 'en' = 'es'
): Promise<GenerateDeckSummaryResult> {
  const cleanDeckId = deckId?.trim();
  const cleanText = rawDocumentText?.trim();

  if (!cleanDeckId || !cleanText) {
    return { success: false, error: 'INVALID_INPUT' };
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return { success: false, error: 'SERVER_CONFIG_ERROR' };
  }

  try {
    const db = getServerSupabaseClient();
    const { data: deck } = await db
      .from('decks')
      .select('title')
      .eq('id', cleanDeckId)
      .maybeSingle();

    const deckTitle = deck?.title || 'Capítulo de Estudio';
    const safeText = cleanText.slice(0, 120000);

    const ai = new GoogleGenAI({ apiKey });
    const { systemInstruction, userPrompt } = buildExhaustivePrompts(deckTitle, safeText, locale);

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: exhaustiveDeckSummarySchema,
      },
    });

    const responseText = response.text?.trim() || '';
    if (!responseText) {
      return { success: false, error: 'GEMINI_EMPTY_RESPONSE' };
    }

    const parsedJson = JSON.parse(responseText);
    const completeGuide = normalizeToExhaustiveGuide(parsedJson, deckTitle, 0);

    await db
      .from('decks')
      .update({
        summary_guide: completeGuide as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanDeckId);

    return {
      success: true,
      summary: completeGuide,
      cached: false,
    };
  } catch (err) {
    console.error('[generateExhaustiveSummaryFromRawText] Error:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// ---------------------------------------------------------------------------
// ACCIÓN PRINCIPAL DE CONSULTA Y GENERACIÓN DE GUÍA
// ---------------------------------------------------------------------------

/**
 * Server Action para consultar o generar la Guía de Repaso Completa del mazo.
 * Soporta recuperación desde caché y reconstrucción sobre hasta 400 tarjetas del mazo.
 *
 * Para usuarios PRO/VIP: Devuelve la guía íntegra (isUnlocked = true).
 * Para usuarios Free: Devuelve únicamente el Bloque 1 (overview) como vista previa segura,
 * requiriendo desbloqueo mensual (3 guías/mes mediante anuncio).
 */
export async function getOrGenerateDeckSummaryAction(
  deckId: string,
  userIdOrLocale?: string,
  localeOrForce?: 'es' | 'en' | boolean,
  forceRegenerate: boolean = false,
  accessToken?: string
): Promise<GenerateDeckSummaryResult> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { success: false, error: 'DECK_ID_REQUIRED' };
  }

  const isSecondArgLocale = userIdOrLocale === 'es' || userIdOrLocale === 'en';
  const resolvedUserId = isSecondArgLocale ? undefined : userIdOrLocale?.trim();
  const resolvedLocale: 'es' | 'en' = isSecondArgLocale
    ? (userIdOrLocale as 'es' | 'en')
    : (localeOrForce === 'es' || localeOrForce === 'en' ? localeOrForce : 'es');
  const resolvedForce = typeof localeOrForce === 'boolean' ? localeOrForce : forceRegenerate;
  const resolvedToken = typeof accessToken === 'string' && accessToken.trim() ? accessToken.trim() : undefined;

  try {
    const db = getServerSupabaseClient();

    // 1. Obtener mazo
    const { data: deck, error: deckErr } = await db
      .from('decks')
      .select('id, title, user_id, is_public, summary_guide')
      .eq('id', cleanDeckId)
      .maybeSingle();

    if (deckErr || !deck) {
      return { success: false, error: deckErr ? 'DB_ERROR' : 'DECK_NOT_FOUND' };
    }

    // 2. Autenticación y resolución de usuario
    let authenticatedUserId: string | null = null;
    if (resolvedToken) {
      try {
        const {
          data: { user: tokenUser },
        } = await supabase.auth.getUser(resolvedToken);
        if (tokenUser?.id) authenticatedUserId = tokenUser.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId) {
      try {
        const {
          data: { user: cookieUser },
        } = await supabase.auth.getUser();
        if (cookieUser?.id) authenticatedUserId = cookieUser.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId && resolvedUserId && resolvedUserId === deck.user_id) {
      authenticatedUserId = resolvedUserId;
    }

    const isOwner = Boolean(authenticatedUserId && authenticatedUserId === deck.user_id);
    const isPublicDeck = Boolean(deck.is_public);

    if (!isOwner && !isPublicDeck) {
      return { success: false, error: authenticatedUserId ? 'UNAUTHORIZED' : 'AUTH_REQUIRED' };
    }

    // 3. Comprobar cuota mensual en api_limits
    const targetUserId = authenticatedUserId || deck.user_id;
    const quota = await checkAndResetMonthlyGuideQuota(db, targetUserId);
    const isPro = quota.tier === 'pro' || quota.tier === 'vip';

    // 4. Comprobar si ya existe guía en caché
    let completeGuide: ExhaustiveDeckSummaryGuide | null = null;
    let isCached = false;

    if (!resolvedForce && deck.summary_guide) {
      completeGuide = normalizeToExhaustiveGuide(deck.summary_guide, deck.title, 0);
      isCached = true;
    }

    // 5. Si no existe o se fuerza regeneración, generar reconstruyendo sobre las tarjetas (hasta 400 tarjetas)
    if (!completeGuide) {
      const { data: cards, error: cardsErr } = await db
        .from('cards')
        .select('front, back, card_format, notes')
        .eq('deck_id', cleanDeckId)
        .order('created_at', { ascending: true })
        .limit(400);

      if (cardsErr) {
        return { success: false, error: 'CARDS_FETCH_ERROR' };
      }

      if (!cards || cards.length === 0) {
        return {
          success: false,
          error:
            resolvedLocale === 'en'
              ? 'This deck has no cards yet. Add or generate cards first.'
              : 'El mazo aún no tiene tarjetas. Añade o genera tarjetas primero.',
        };
      }

      const apiKey = resolveGeminiApiKey();
      if (!apiKey) {
        return { success: false, error: 'SERVER_CONFIG_ERROR' };
      }

      const cardsCorpus = cards
        .map((c, i) => {
          let text = `[Card ${i + 1}] Q: ${c.front}\nA: ${c.back}`;
          if (c.notes && c.notes.trim()) text += `\nNota: ${c.notes.trim()}`;
          return text;
        })
        .join('\n---\n');

      const ai = new GoogleGenAI({ apiKey });
      const { systemInstruction, userPrompt } = buildExhaustivePrompts(deck.title, cardsCorpus, resolvedLocale);

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          responseSchema: exhaustiveDeckSummarySchema,
        },
      });

      const responseText = response.text?.trim() || '';
      if (!responseText) {
        return { success: false, error: 'GEMINI_EMPTY_RESPONSE' };
      }

      const parsedJson = JSON.parse(responseText);
      completeGuide = normalizeToExhaustiveGuide(parsedJson, deck.title, cards.length);

      await db
        .from('decks')
        .update({
          summary_guide: completeGuide as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cleanDeckId);
    }

    // 6. Control de acceso Freemium / PRO
    if (isPro) {
      return {
        success: true,
        isUnlocked: true,
        summary: completeGuide,
        guidesUnlockedThisMonth: quota.guidesUnlockedThisMonth,
        maxFreeGuidesPerMonth: 3,
        cached: isCached,
      };
    }

    // Usuario Free: Se devuelve vista previa segura (únicamente Bloque 1 overview)
    const previewGuide: Partial<ExhaustiveDeckSummaryGuide> = {
      title: completeGuide.title,
      subtitle: completeGuide.subtitle,
      deckTitle: completeGuide.deckTitle,
      generatedAt: completeGuide.generatedAt,
      cardCount: completeGuide.cardCount,
      overview: completeGuide.overview,
    };

    return {
      success: true,
      isUnlocked: false,
      previewGuide,
      guidesUnlockedThisMonth: quota.guidesUnlockedThisMonth,
      maxFreeGuidesPerMonth: 3,
      cached: isCached,
    };
  } catch (err) {
    console.error('[getOrGenerateDeckSummaryAction] Error crítico:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// ---------------------------------------------------------------------------
// DESBLOQUEO MENSUAL POR ANUNCIO RECOMPENSADO (MÁXIMO 3 GUÍAS AL MES)
// ---------------------------------------------------------------------------

/**
 * Server Action para desbloquear una Guía de Repaso Completa tras completar un anuncio bonificado.
 * Aplica un límite estricto e independiente de 3 guías al mes por usuario Free.
 */
export async function unlockDeckSummaryWithAdAction(
  deckId: string,
  accessToken?: string
): Promise<GenerateDeckSummaryResult> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { success: false, error: 'DECK_ID_REQUIRED' };
  }

  const resolvedToken = typeof accessToken === 'string' && accessToken.trim() ? accessToken.trim() : undefined;

  try {
    const db = getServerSupabaseClient();

    // 1. Resolver usuario autenticado
    let authenticatedUserId: string | null = null;
    if (resolvedToken) {
      try {
        const {
          data: { user: tokenUser },
        } = await supabase.auth.getUser(resolvedToken);
        if (tokenUser?.id) authenticatedUserId = tokenUser.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId) {
      try {
        const {
          data: { user: cookieUser },
        } = await supabase.auth.getUser();
        if (cookieUser?.id) authenticatedUserId = cookieUser.id;
      } catch {
        // Silencioso
      }
    }

    if (!authenticatedUserId) {
      return { success: false, error: 'AUTH_REQUIRED' };
    }

    // 2. Verificar existencia del mazo
    const { data: deck } = await db
      .from('decks')
      .select('id, title, user_id, is_public, summary_guide')
      .eq('id', cleanDeckId)
      .maybeSingle();

    if (!deck) {
      return { success: false, error: 'DECK_NOT_FOUND' };
    }

    // 3. Comprobar cuota mensual independiente
    const quota = await checkAndResetMonthlyGuideQuota(db, authenticatedUserId);
    const isPro = quota.tier === 'pro' || quota.tier === 'vip';

    // Si ya es PRO, no consume cupo de anuncio
    if (isPro) {
      const guide = deck.summary_guide
        ? normalizeToExhaustiveGuide(deck.summary_guide, deck.title, 0)
        : undefined;
      return {
        success: true,
        isUnlocked: true,
        summary: guide,
        guidesUnlockedThisMonth: quota.guidesUnlockedThisMonth,
        maxFreeGuidesPerMonth: 3,
      };
    }

    // Límite mensual de 3 guías para usuarios Free
    if (quota.guidesUnlockedThisMonth >= 3) {
      return {
        success: false,
        error: 'FREE_MONTHLY_LIMIT_REACHED',
        isUnlocked: false,
        guidesUnlockedThisMonth: quota.guidesUnlockedThisMonth,
        maxFreeGuidesPerMonth: 3,
      };
    }

    // Incrementar únicamente el contador de guías de este mes (sin tocar generaciones ni tutor)
    const newCount = quota.guidesUnlockedThisMonth + 1;
    await db
      .from('api_limits')
      .update({
        guides_unlocked_this_month: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', authenticatedUserId);

    // Obtener la guía completa (de caché o generándola)
    let fullGuide: ExhaustiveDeckSummaryGuide;
    if (deck.summary_guide) {
      fullGuide = normalizeToExhaustiveGuide(deck.summary_guide, deck.title, 0);
    } else {
      const genRes = await getOrGenerateDeckSummaryAction(
        cleanDeckId,
        authenticatedUserId,
        'es',
        false,
        resolvedToken
      );
      if (genRes.summary) {
        fullGuide = genRes.summary;
      } else {
        return {
          success: false,
          error: genRes.error || 'GUIDE_GENERATION_FAILED',
        };
      }
    }

    return {
      success: true,
      isUnlocked: true,
      summary: fullGuide,
      guidesUnlockedThisMonth: newCount,
      maxFreeGuidesPerMonth: 3,
    };
  } catch (err) {
    console.error('[unlockDeckSummaryWithAdAction] Error inesperado:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}
