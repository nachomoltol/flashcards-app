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
    'Documento estructurado de Resumen Proporcional de Capítulo para estudio (Full Chapter Blueprint adaptable a nivel escolar, bachillerato, universidad u oposiciones)',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título académico principal del capítulo',
    },
    subtitle: {
      type: Type.STRING,
      description: 'Subtítulo descriptivo y alcance temático',
    },
    overview: {
      type: Type.OBJECT,
      description: 'Bloque 1: Visión panorámica ejecutiva y objetivos docentes',
      properties: {
        summary: {
          type: Type.STRING,
          description:
            'Síntesis ejecutiva de exactamente 1 párrafo conciso (3 a 5 líneas) con la idea fuerza y arquitectura general del tema.',
        },
        learningObjectives: {
          type: Type.ARRAY,
          description:
            'Lista de 3 a 6 objetivos docentes y competencias nucleares esenciales.',
          items: { type: Type.STRING },
        },
      },
      required: ['summary', 'learningObjectives'],
    },
    taxonomy_tree: {
      type: Type.ARRAY,
      description:
        'Bloque 2: Esquema jerárquico o clasificación completa de las categorías o ramas del tema.',
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'Nombre de la rama, categoría o grupo taxonómico',
          },
          elements: {
            type: Type.ARRAY,
            description: 'Lista de elementos pertenecientes a esta categoría.',
            items: { type: Type.STRING },
          },
          description: {
            type: Type.STRING,
            description: 'Criterio taxonómico o principio que define a esta categoría en 1 frase.',
          },
        },
        required: ['category', 'elements', 'description'],
      },
    },
    item_breakdown: {
      type: Type.ARRAY,
      description:
        'Bloque 3: Ficha individual telegráfica y concisa de cada elemento, regla o concepto clave (1 frase directa por campo). Si un campo no aplica o no figura en el material, déjalo vacío ("" o []); PROHIBIDO escribir textos de relleno como "No especificado", "N/A" o "No aplica".',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Nombre del elemento, concepto, regla o principio',
          },
          role: {
            type: Type.STRING,
            description: 'Función principal, definición técnica o regla en 1 frase directa',
          },
          dietarySources: {
            type: Type.ARRAY,
            description: 'Ejemplos prácticos, fuentes primarias o supuestos de aplicación (array vacío [] si no aplica)',
            items: { type: Type.STRING },
          },
          deficiency: {
            type: Type.STRING,
            description: 'Efecto del déficit, consecuencias de error o fallo típico (cadena vacía "" si no aplica)',
          },
          toxicity: {
            type: Type.STRING,
            description: 'Excepciones, casos irregulares, contraindicaciones o riesgos (cadena vacía "" si no aplica)',
          },
          keyFact: {
            type: Type.STRING,
            description: 'Dato de oro o trampa de examen indispensable en 1 frase directa',
          },
        },
        required: ['name', 'role', 'keyFact'],
      },
    },
    contrast_tables: {
      type: Type.ARRAY,
      description: 'Bloque 4: De 1 a 4 tablas comparativas cara a cara para desarmar confusiones y trampas de examen (1 tabla en temas cortos; hasta 4 en capítulos largos).',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Título de la tabla comparativa (ej. "Present Simple vs Continuous" o "Macrominerales vs Oligoelementos")',
          },
          description: {
            type: Type.STRING,
            description: 'Contexto del contraste en 1 frase',
          },
          headers: {
            type: Type.ARRAY,
            description: 'Encabezados de columnas',
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
        'Bloque 5: De 0 a 10 cifras críticas, fechas, plazos, dosis o fórmulas oficiales con verificación estricta de unidades (devolver array vacío [] si el tema no tiene datos cuantitativos ni fechas).',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: 'Nombre del parámetro, variable o fecha clave' },
          value: { type: Type.STRING, description: 'Cifra, plazo o unidad verificada (ej. 100 mg/día, 900 µg/día, 15 días)' },
          context: { type: Type.STRING, description: 'Contexto o relevancia para el examen en 1 frase concisa' },
        },
        required: ['label', 'value', 'context'],
      },
    },
    mnemonics: {
      type: Type.ARRAY,
      description:
        'Bloque 6: De 0 a 4 reglas mnemotécnicas naturales y útiles para memorización acelerada (devolver array vacío [] si no aportan valor real).',
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING, description: 'Concepto o lista a recordar' },
          rule: { type: Type.STRING, description: 'Acrónimo, frase o truco mnemotécnico' },
          explanation: { type: Type.STRING, description: 'Desglose breve del truco' },
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

function cleanFillerString(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  if (/^(no\s*especificad[oa]|no\s*aplica|n\/?a|ningun[oa]|none|not\s*specified|-)$/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
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

  const cleanedBreakdown = Array.isArray(parsed.item_breakdown)
    ? parsed.item_breakdown.map((item: ItemBreakdownEntry) => ({
        name: item.name || '',
        role: item.role || '',
        dietarySources: Array.isArray(item.dietarySources)
          ? item.dietarySources
              .map(s => s?.trim())
              .filter((s): s is string => Boolean(s && !/^(no\s*especificad[oa]|no\s*aplica|n\/?a|ningun[oa]|none|not\s*specified|-)$/i.test(s)))
          : [],
        deficiency: cleanFillerString(item.deficiency),
        toxicity: cleanFillerString(item.toxicity),
        keyFact: item.keyFact || '',
      }))
    : [];

  return {
    title: parsed.title || `Guía de Repaso: ${deckTitle}`,
    subtitle: parsed.subtitle || 'Resumen Integral de Alto Rendimiento',
    deckTitle,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    cardCount: parsed.cardCount || cardCount,
    overview,
    taxonomy_tree: Array.isArray(parsed.taxonomy_tree) ? parsed.taxonomy_tree : [],
    item_breakdown: cleanedBreakdown,
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
    .select('tier, guides_unlocked_this_month, guides_reset_at, current_period_end')
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

  let tier = (data.tier || 'free') as 'free' | 'pro' | 'vip';

  // Lazy Expiration de suscripción PRO vencida (SUB-01)
  if (tier === 'pro' && data.current_period_end) {
    if (new Date(data.current_period_end).getTime() < now.getTime()) {
      await dbClient
        .from('api_limits')
        .update({
          tier: 'free',
          subscription_status: 'expired',
          updated_at: now.toISOString(),
        })
        .eq('user_id', userId);
      tier = 'free';
    }
  }

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
    ? `You are an elite Educational Curriculum Specialist and Lead Academic Examiner for Flashmente.
Your mission is to construct a HIGH-YIELD, UNIVERSAL Study Guide strictly proportional to the educational level and real depth of the provided material.

MANDATORY PEDAGOGICAL & PROPORTIONALITY RULES:
1. DETECT EDUCATIONAL LEVEL & DEPTH AUTOMATICALLY:
   - Primary / Middle / High School: Use clear, engaging, pedagogically accessible explanations with real-world examples.
   - University / Competitive Exams / Medical / Legal: Maintain rigorous technical accuracy and exact professional terminology.
   - STRICT PROPORTIONALITY (ZERO FLUFF): If the material is short (e.g. 2-3 pages of grammar or vocabulary), deliver a concise 1-2 page synthesis without artificial bloat. If the topic is a large 20+ page chapter, cover 100% of essential elements using a high-density, telegraphic style designed to fit within 4-6 printed pages.
2. DISCIPLINE-AGNOSTIC ADAPTATION:
   - Works universally across ALL subjects (Sciences, Languages, Humanities, Law, Medicine, Mathematics, History).
   - In item_breakdown: Adapt 'role' to the subject (grammatical rule, legal principle, physiological function, historical role). Adapt 'dietarySources' to examples/use cases. Adapt 'deficiency' to typical mistakes or failure consequences. Adapt 'toxicity' to exceptions or contraindications.
   - CLEAN OMISSION: If a secondary field (sources, deficiency, toxicity) does not apply or is not in the material, leave it empty ("" or []). NEVER write filler like "Not specified", "N/A", or "Does not apply".
3. THE 6 SYSTEMATIC BLOCKS:
   - Block 1 (overview): EXACTLY 1 concise executive paragraph (3-5 lines) capturing the core theme + 3 to 6 focused learning objectives.
   - Block 2 (taxonomy_tree): Clean classification tree grouping the entities/categories of the topic.
   - Block 3 (item_breakdown): Compact, telegraphic cards for EVERY relevant item or concept. 1 direct, punchy sentence per field. No duplicated narrative from tables.
   - Block 4 (contrast_tables): 1 to 4 high-yield comparative tables targeting common exam confusions (1 table for short topics, up to 4 for large chapters).
   - Block 5 (critical_data): 0 to 10 crucial figures, dates, formulas, or official thresholds. Return [] if the subject has no quantitative/date data. ALWAYS verify units strictly (mg vs µg vs g).
   - Block 6 (mnemonics): 0 to 4 practical, natural mnemonics. Return [] if not genuinely helpful.
4. Eliminate conversational pleasantries. Maximise pedagogical density and brevity.`
    : `Eres un Catedrático Especialista en Ciencias de la Educación y Estratega Jefe de Exámenes para Flashmente.
Tu misión es construir una GUÍA DE ESTUDIO UNIVERSAL Y DE ALTO RENDIMIENTO, estrictamente proporcional al nivel educativo y a la extensión real del material docente.

REGLAS PEDAGÓGICAS Y DE PROPORCIONALIDAD OBLIGATORIAS:
1. DETECCIÓN AUTOMÁTICA DE NIVEL EDUCATIVO Y DENSIDAD:
   - Primaria / ESO / Bachillerato: Explicaciones claras, didácticas, directas y con ejemplos prácticos acordes a la edad.
   - Universidad / Oposiciones / Formación Profesional técnica: Rigor técnico, exactitud terminológica y precisión conceptual absoluta.
   - PROPORCIONALIDAD ESTRICTA (CERO RELLENO): Si el tema es breve (ej. 2-3 páginas de inglés, 15 tarjetas de vocabulario o reglas), sintetiza con precisión quirúrgica en 1-2 páginas sin inventar complejidad artificial. Si el capítulo es extenso (ej. 20+ páginas, 100 tarjetas de minerales o medicina), cubre el 100% de los elementos esenciales con estilo telegráfico de alta densidad para ocupar 4-6 páginas impresas máximo.
2. ADAPTACIÓN UNIVERSAL A CUALQUIER ASIGNATURA:
   - Válido para TODAS las materias (Ciencias, Idiomas, Humanidades, Derecho, Medicina, Matemáticas, Historia).
   - En item_breakdown: Adapta 'role' a la materia (regla gramatical, principio jurídico, función fisiológica, hito histórico). Adapta 'dietarySources' a ejemplos de uso o supuestos prácticos. Adapta 'deficiency' a errores frecuentes o consecuencias de incumplimiento. Adapta 'toxicity' a excepciones, contraindicaciones o irregularidades.
   - OMISIÓN LIMPIA DE CAMPOS INAPLICABLES: Si un campo secundario no aplica o no figura en el texto, déjalo vacío ("" o []). PROHIBIDO escribir textos de relleno como "No especificado", "No aplica", "N/A" o "Ninguno".
3. ESTRUCTURA DE LOS 6 BLOQUES:
   - Bloque 1 (overview): EXACTAMENTE 1 párrafo ejecutivo conciso (3-5 líneas) con la idea fuerza del capítulo + 3 a 6 objetivos de aprendizaje directos.
   - Bloque 2 (taxonomy_tree): Esquema o árbol clasificatorio completo de las categorías del tema.
   - Bloque 3 (item_breakdown): Ficha telegráfica de CADA elemento o concepto clave. 1 frase directa y contundente por campo, sin párrafos redundantes que ya figuren en tablas.
   - Bloque 4 (contrast_tables): De 1 a 4 tablas comparativas cara a cara para preguntas trampa (1 tabla en temas cortos; máximo 4 en capítulos largos).
   - Bloque 5 (critical_data): De 0 a 10 cifras críticas, fechas, plazos, dosis o fórmulas oficiales. Si el tema no tiene datos numéricos ni fechas, devuelve [] limpiamente. VERIFICACIÓN ESTRICTA DE UNIDADES (mg vs µg vs g; nunca confundas µg con mg).
   - Bloque 6 (mnemonics): De 0 a 4 reglas mnemotécnicas naturales y útiles. Si no aportan valor real, devuelve [] limpiamente.
4. Suprime cualquier saludo o cortesía conversacional. Entrega máxima densidad y síntesis pedagógica por centímetro cuadrado.`;

  const userPrompt = isEnglish
    ? `CHAPTER / DECK TITLE: ${deckTitle}

SOURCE MATERIAL:
${corpusText}

Generate the proportional, high-yield study guide now:`
    : `TÍTULO DEL CAPÍTULO / MAZO: ${deckTitle}

MATERIAL DOCENTE FUENTE:
${corpusText}

Genera la guía de estudio universal, proporcional y de alto rendimiento ahora:`;

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

    // Guardar en la tabla segura aislada deck_summaries (VULN-01)
    await db.from('deck_summaries').upsert({
      deck_id: cleanDeckId,
      user_id: userId,
      guide_data: completeGuide as unknown as Json,
      updated_at: new Date().toISOString(),
    });

    // Limpiar summary_guide en decks para evitar fuga PostgREST
    await db
      .from('decks')
      .update({
        summary_guide: null,
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

    // Anti-suplantación (VULN-05): Descartar resolvedUserId si no coincide con el usuario autenticado
    if (resolvedUserId && authenticatedUserId && resolvedUserId !== authenticatedUserId) {
      console.warn('[getOrGenerateDeckSummaryAction] Discrepancia entre userId recibido y sesión autenticada.');
    }

    const isOwner = Boolean(authenticatedUserId && authenticatedUserId === deck.user_id);
    const isPublicDeck = Boolean(deck.is_public);

    if (!isOwner && !isPublicDeck) {
      return { success: false, error: authenticatedUserId ? 'UNAUTHORIZED' : 'AUTH_REQUIRED' };
    }

    // 3. Comprobar cuota mensual y nivel PRO del usuario solicitante (VULN-05 & SUB-02)
    // En mazos públicos, evalúa exclusivamente al visitante autenticado; si es anónimo, nunca es PRO
    let isPro = false;
    let quota = {
      tier: 'free' as 'free' | 'pro' | 'vip',
      guidesUnlockedThisMonth: 0,
      guidesResetAt: '',
    };

    if (authenticatedUserId) {
      quota = await checkAndResetMonthlyGuideQuota(db, authenticatedUserId);
      isPro = quota.tier === 'pro' || quota.tier === 'vip';
    }

    // 4. Cooldown y Protección Anti-Abuso en forceRegenerate (VULN-02)
    if (resolvedForce) {
      // Exige usuario autenticado propietario del mazo
      if (!isOwner || !authenticatedUserId) {
        return {
          success: false,
          error:
            resolvedLocale === 'en'
              ? 'Only the deck owner can regenerate the study guide.'
              : 'Solo el creador del mazo puede regenerar la guía de estudio.',
        };
      }

      // Cooldown obligatorio de 5 minutos entre regeneraciones del mismo mazo
      const { data: existingSummaryRec } = await db
        .from('deck_summaries')
        .select('updated_at')
        .eq('deck_id', cleanDeckId)
        .maybeSingle();

      if (existingSummaryRec?.updated_at) {
        const lastUpdated = new Date(existingSummaryRec.updated_at).getTime();
        const elapsed = Date.now() - lastUpdated;
        const cooldownMs = 5 * 60 * 1000;
        if (elapsed < cooldownMs) {
          const waitMin = Math.ceil((cooldownMs - elapsed) / 60000);
          return {
            success: false,
            error:
              resolvedLocale === 'en'
                ? `Please wait ${waitMin} min before regenerating this guide.`
                : `Debes esperar ${waitMin} min antes de regenerar la guía de este mazo.`,
          };
        }
      }

      // Si es Free, requiere tener el mazo desbloqueado o descuenta 1 crédito de generación habitual
      if (!isPro) {
        if (quota.guidesUnlockedThisMonth === 0) {
          const { data: userLimits } = await db
            .from('api_limits')
            .select('welcome_generations, bonus_credits, generations_count')
            .eq('user_id', authenticatedUserId)
            .maybeSingle();

          const welcome = userLimits?.welcome_generations || 0;
          const bonus = userLimits?.bonus_credits || 0;
          const count = userLimits?.generations_count || 0;

          if (welcome >= 5 && bonus <= 0) {
            return {
              success: false,
              error:
                resolvedLocale === 'en'
                  ? 'You need an available generation credit to regenerate this guide.'
                  : 'Necesitas un crédito de generación para regenerar la guía.',
            };
          }

          const todayStr = new Date().toISOString().slice(0, 10);
          if (welcome < 5) {
            await db
              .from('api_limits')
              .update({
                welcome_generations: welcome + 1,
                last_generation_date: todayStr,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', authenticatedUserId);
          } else {
            await db
              .from('api_limits')
              .update({
                bonus_credits: Math.max(0, bonus - 1),
                generations_count: count + 1,
                last_generation_date: todayStr,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', authenticatedUserId);
          }
        }
      }
    }

    // 5. Comprobar si ya existe guía en caché (tabla aislada deck_summaries con fallback retrocompatible)
    let completeGuide: ExhaustiveDeckSummaryGuide | null = null;
    let isCached = false;

    if (!resolvedForce) {
      const { data: summaryRec } = await db
        .from('deck_summaries')
        .select('guide_data, updated_at')
        .eq('deck_id', cleanDeckId)
        .maybeSingle();

      if (summaryRec?.guide_data) {
        completeGuide = normalizeToExhaustiveGuide(summaryRec.guide_data, deck.title, 0);
        isCached = true;
      } else if (deck.summary_guide) {
        // Fallback de retrocompatibilidad y migración al vuelo
        completeGuide = normalizeToExhaustiveGuide(deck.summary_guide, deck.title, 0);
        isCached = true;

        await db.from('deck_summaries').upsert({
          deck_id: cleanDeckId,
          user_id: deck.user_id,
          guide_data: completeGuide as unknown as Json,
          updated_at: new Date().toISOString(),
        });

        await db
          .from('decks')
          .update({
            summary_guide: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cleanDeckId);
      }
    }

    // 6. Si no existe o se fuerza regeneración, generar reconstruyendo sobre las tarjetas (hasta 400 tarjetas)
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

      // Guardar en la tabla aislada y segura deck_summaries (VULN-01)
      await db.from('deck_summaries').upsert({
        deck_id: cleanDeckId,
        user_id: deck.user_id,
        guide_data: completeGuide as unknown as Json,
        updated_at: new Date().toISOString(),
      });

      // Limpiar decks.summary_guide para cerrar la fuga PostgREST
      await db
        .from('decks')
        .update({
          summary_guide: null,
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

export interface AdPlatformProof {
  isNative?: boolean;
  platform?: string;
}

/**
 * Server Action para desbloquear una Guía de Repaso Completa tras completar un anuncio bonificado en App móvil.
 * Aplica la RPC atómica `unlock_deck_summary_with_ad` con bloqueo pesimista FOR UPDATE (VULN-03).
 * Exige validación de origen en entorno nativo móvil AdMob, rechazando llamadas web directas (VULN-04).
 */
export async function unlockDeckSummaryWithAdAction(
  deckId: string,
  accessToken?: string,
  platformProof?: AdPlatformProof
): Promise<GenerateDeckSummaryResult> {
  const cleanDeckId = deckId?.trim();
  if (!cleanDeckId) {
    return { success: false, error: 'DECK_ID_REQUIRED' };
  }

  const resolvedToken = typeof accessToken === 'string' && accessToken.trim() ? accessToken.trim() : undefined;

  try {
    const db = getServerSupabaseClient();

    // 1. Resolver usuario autenticado de forma estricta (VULN-05)
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

    // 2. Verificación estricta de entorno nativo móvil (VULN-04)
    if (!platformProof?.isNative) {
      return {
        success: false,
        error:
          'Los anuncios bonificados están disponibles exclusivamente en la App móvil (Android/iOS). Suscríbete a PRO (3,50 €/mes) para desbloquear guías ilimitadas en la web.',
      };
    }

    // 3. Invocar la función RPC atómica con bloqueo pesimista FOR UPDATE (VULN-03)
    const { data: rpcRes, error: rpcErr } = await db.rpc('unlock_deck_summary_with_ad', {
      p_user_id: authenticatedUserId,
      p_deck_id: cleanDeckId,
    });

    if (rpcErr) {
      console.error('[unlockDeckSummaryWithAdAction] Error en RPC unlock_deck_summary_with_ad:', rpcErr);
      return { success: false, error: 'DATABASE_ERROR' };
    }

    const claimData = rpcRes as {
      success?: boolean;
      allowed?: boolean;
      is_pro?: boolean;
      error?: string;
      message?: string;
      guides_unlocked_this_month?: number;
      remaining_guides?: number;
    } | null;

    if (!claimData || !claimData.allowed) {
      return {
        success: false,
        error: claimData?.error || 'CLAIM_FAILED',
        guidesUnlockedThisMonth: claimData?.guides_unlocked_this_month ?? 3,
        maxFreeGuidesPerMonth: 3,
      };
    }

    // 4. Obtener la guía completa desde la tabla segura aislada deck_summaries (VULN-01)
    let fullGuide: ExhaustiveDeckSummaryGuide | null = null;
    const { data: summaryRec } = await db
      .from('deck_summaries')
      .select('guide_data')
      .eq('deck_id', cleanDeckId)
      .maybeSingle();

    if (summaryRec?.guide_data) {
      const { data: deck } = await db.from('decks').select('title').eq('id', cleanDeckId).maybeSingle();
      fullGuide = normalizeToExhaustiveGuide(summaryRec.guide_data, deck?.title || '', 0);
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
      guidesUnlockedThisMonth: claimData.guides_unlocked_this_month,
      maxFreeGuidesPerMonth: 3,
    };
  } catch (err) {
    console.error('[unlockDeckSummaryWithAdAction] Error inesperado:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}
