import { GoogleGenAI } from '@google/genai';
import type { GeneratedCard } from '@/types/cards';

export interface CardHistoryItem {
  front: string;
  back?: string;
}

export interface DeduplicationResult {
  uniqueCards: GeneratedCard[];
  duplicateCount: number;
  duplicatesRemoved: Array<{
    candidateFront: string;
    matchedWith: string;
    similarityScore: number;
    reason: string;
  }>;
}

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en',
  'a', 'al', 'con', 'por', 'para', 'que', 'es', 'son', 'se', 'su', 'sus',
  'como', 'sobre', 'entre', 'sin', 'tras', 'cual', 'cuales', 'este', 'esta',
  'estos', 'estas', 'ser', 'estar', 'ha', 'han', 'y', 'o', 'u', 'e', 'pero',
  'mas', 'menos', 'muy', 'lo', 'les', 'me', 'nos', 'te', 'the', 'of', 'in',
  'and', 'to', 'a', 'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'by'
]);

/**
 * Normaliza una cadena de texto para comparación léxica y semántica:
 * - Elimina explicaciones extensas ("Explicación: ...") para no diluir la comparación
 * - Elimina acentos/diacríticos
 * - Pasa a minúsculas
 * - Elimina opciones múltiples (a), b), c), d) del front o prefijos de opción del back
 * - Elimina fórmulas interrogativas iniciales (¿cuál es, define, qué es...)
 * - Elimina signos de puntuación
 */
export function normalizeCardText(rawText: string): string {
  if (!rawText) return '';

  // 0. Cortar cualquier bloque de "Explicación:" / "Explanation:" / "Justificación:" para aislar el núcleo evaluativo
  let text = rawText
    .split(/\r?\n+\s*(?:explicaci[oó]n|explanation|justificaci[oó]n)\s*:/i)[0]
    .split(/\b(?:explicaci[oó]n|explanation|justificaci[oó]n)\s*:/i)[0]
    .trim();

  // 1. Tomar únicamente la pregunta o respuesta principal (antes de cualquier salto de línea de opciones tipo test)
  text = text.split(/\r?\n\s*[a-dA-D][\)\.\:\-]/)[0].trim();

  // 2. Eliminar prefijos de opción al inicio (ej. "a) ", "d) ") y negritas markdown
  text = text.replace(/^[a-dA-D][\)\.\:\-]\s*/i, '').replace(/\*\*/g, '').trim();

  // 3. Normalizar diacríticos (á -> a, é -> e...) y minúsculas
  text = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 4. Eliminar signos de puntuación iniciales y finales
  text = text.replace(/^[¿\?¡!\s\d\.\)\-]+/, '').replace(/[\?¡!\s\.]+$/, '').trim();

  // 5. Limpiar fórmulas interrogativas comunes en español e inglés
  text = text.replace(
    /^(cual\s+es|cuales\s+son|que\s+es|en\s+que\s+consiste|defina|define|indique|indica|senale|senala|describa|describe|explique|explica|mencione|menciona|diga|diga\s+que|what\s+is|which\s+is|describe|define)\s+(el|la|los|las|un|una|unos|unas)?\s*/i,
    ''
  ).trim();

  // 6. Eliminar corchetes de cloze [...]
  text = text.replace(/\[\.\.\.\]/g, '').replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Extrae exclusivamente el núcleo de la respuesta correcta en `back`, descartando por completo
 * el bloque de 'Explicación: ...' y los prefijos de letra ('a)', 'b)', etc.).
 * Para tarjetas Cloze donde el término oculto se resalta en **negrita**, prioriza dicho término junto con la línea base.
 */
export function extractCoreAnswerText(rawBack?: string): string {
  if (!rawBack) return '';

  const withoutExplanation = rawBack
    .split(/\r?\n+\s*(?:explicaci[oó]n|explanation|justificaci[oó]n)\s*:/i)[0]
    .split(/\b(?:explicaci[oó]n|explanation|justificaci[oó]n)\s*:/i)[0]
    .trim();

  const firstLine = withoutExplanation.split(/\r?\n/)[0].trim();

  // Si contiene término resaltado en negrita (ej. Cloze "**fotosíntesis**" o True/False "**Verdadero**"), extraerlo
  const boldMatches = Array.from(firstLine.matchAll(/\*\*([^*]+)\*\*/g)).map((m) => m[1].trim());
  if (boldMatches.length > 0) {
    const boldCore = boldMatches.join(' ');
    const normalizedBold = normalizeCardText(boldCore);
    // Si el término en negrita no es solo "verdadero"/"falso", es el concepto clave exacto
    if (normalizedBold && normalizedBold !== 'verdadero' && normalizedBold !== 'falso' && normalizedBold !== 'true' && normalizedBold !== 'false') {
      return normalizedBold;
    }
  }

  return normalizeCardText(firstLine);
}

/**
 * Extrae tokens significativos sin stopwords
 */
export function extractContentTokens(normalizedText: string): string[] {
  return normalizedText
    .split(/[\s,.;:()_/\-–—"']/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Determina si dos enunciados (`front`) evalúan variables o sujetos sustancialmente distintos
 * dentro de una misma estructura de pregunta (ej. despiece de tablas/esquemas: 'hierro' vs. 'calcio',
 * 'amilasa' vs. 'lipasa', 'vitamina A' vs. 'vitamina D').
 * Devuelve true cuando cada enunciado posee al menos un término sustancial propio que no aparece en el otro.
 */
export function hasDistinctEvaluatedSubject(frontA: string, frontB: string): boolean {
  const tokensA = new Set(extractContentTokens(normalizeCardText(frontA)));
  const tokensB = new Set(extractContentTokens(normalizeCardText(frontB)));

  if (tokensA.size === 0 || tokensB.size === 0) return false;

  const uniqueToA: string[] = [];
  const uniqueToB: string[] = [];

  for (const t of tokensA) {
    if (!tokensB.has(t)) uniqueToA.push(t);
  }
  for (const t of tokensB) {
    if (!tokensA.has(t)) uniqueToB.push(t);
  }

  return uniqueToA.length >= 1 && uniqueToB.length >= 1;
}

/**
 * Calcula la similitud Jaccard y el coeficiente de contención léxica entre dos textos
 */
export function calculateLexicalSimilarity(
  textA: string,
  textB: string
): { jaccard: number; containment: number } {
  const tokensA = new Set(extractContentTokens(normalizeCardText(textA)));
  const tokensB = new Set(extractContentTokens(normalizeCardText(textB)));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return { jaccard: 0, containment: 0 };
  }

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = intersection / Math.min(tokensA.size, tokensB.size);

  return { jaccard, containment };
}

/**
 * Producto escalar y norma para similitud coseno
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Genera embeddings vectoriales en lotes utilizando gemini-embedding-001
 */
async function batchEmbedTexts(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  const ai = new GoogleGenAI({ apiKey });
  const EMBED_MODEL = 'gemini-embedding-001';
  const BATCH_SIZE = 30;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: chunk,
      });

      if (response && response.embeddings && response.embeddings.length > 0) {
        for (const emb of response.embeddings) {
          allEmbeddings.push(emb.values || []);
        }
      } else {
        // Fallback si no devuelve lista de embeddings
        for (let j = 0; j < chunk.length; j++) {
          allEmbeddings.push([]);
        }
      }
    } catch (err) {
      console.warn(`[Deduplication] Fallo en llamada a batchEmbedContent (chunk ${i}-${i + chunk.length}):`, err);
      // Rellenar con arrays vacíos para continuar con el filtro léxico
      for (let j = 0; j < chunk.length; j++) {
        allEmbeddings.push([]);
      }
    }
  }

  return allEmbeddings;
}

/**
 * BARRERA DETERMINISTA SEMÁNTICA Y LÉXICA POST-GENERACIÓN
 * 
 * Filtra rigurosamente las tarjetas generadas por Gemini contra el historial de tarjetas existentes
 * y elimina duplicados intra-lote utilizando un sistema híbrido de dos capas:
 * 1. Capa Léxica Determinista (Jaccard + Contención de conceptos clave)
 * 2. Capa de Embeddings Vectoriales (Coseno >= 0.80 con gemini-embedding-001)
 */
export async function deduplicateCandidateCards(params: {
  candidateCards: GeneratedCard[];
  existingCards: CardHistoryItem[];
  apiKey?: string;
  similarityThreshold?: number;
  targetCount?: number;
  isExhaustiveMode?: boolean;
}): Promise<DeduplicationResult> {
  const {
    candidateCards,
    existingCards,
    apiKey,
    similarityThreshold = params.isExhaustiveMode ? 0.92 : 0.80,
    targetCount,
    isExhaustiveMode = false,
  } = params;

  if (!candidateCards || candidateCards.length === 0) {
    return { uniqueCards: [], duplicateCount: 0, duplicatesRemoved: [] };
  }

  const duplicatesRemoved: DeduplicationResult['duplicatesRemoved'] = [];
  const acceptedCards: GeneratedCard[] = [];

  // =========================================================================
  // PASO 1: Deduplicación Intra-Lote (Eliminar gemelas devueltas en la misma tirada)
  // =========================================================================
  const intraBatchUnique: GeneratedCard[] = [];
  for (const card of candidateCards) {
    let isIntraDuplicate = false;
    const candidateCoreAns = extractCoreAnswerText(card.back);

    for (const accepted of intraBatchUnique) {
      const { jaccard, containment } = calculateLexicalSimilarity(card.front, accepted.front);
      const acceptedCoreAns = extractCoreAnswerText(accepted.back);
      const answerLex = calculateLexicalSimilarity(candidateCoreAns, acceptedCoreAns);
      const distinctSubject = hasDistinctEvaluatedSubject(card.front, accepted.front);

      // En modo exhaustivo, si el enunciado evalúa un sujeto/variable distinta (ej. 'hierro' vs. 'calcio',
      // 'amilasa' vs. 'lipasa'), permitimos que compartan respuesta nuclear o plantilla de pregunta.
      // Solo se marca como clon si TANTO el concepto en el front como la respuesta nuclear son esencialmente idénticos.
      const sameCoreAnswerClone =
        candidateCoreAns.length > 0 &&
        acceptedCoreAns.length > 0 &&
        (candidateCoreAns === acceptedCoreAns || answerLex.jaccard >= 0.75 || answerLex.containment >= 0.85) &&
        (isExhaustiveMode
          ? (!distinctSubject && (jaccard >= 0.75 || containment >= 0.85))
          : (jaccard >= 0.35 || containment >= 0.45));

      // Criterio de duplicado léxico intra-lote:
      const isDuplicate = isExhaustiveMode
        ? (jaccard >= 0.90 || (!distinctSubject && jaccard >= 0.75) || (!distinctSubject && containment >= 0.85 && answerLex.jaccard >= 0.50) || sameCoreAnswerClone)
        : (jaccard >= 0.65 || (containment >= 0.75 && answerLex.jaccard >= 0.35) || sameCoreAnswerClone);

      if (isDuplicate) {
        isIntraDuplicate = true;
        duplicatesRemoved.push({
          candidateFront: card.front,
          matchedWith: accepted.front,
          similarityScore: Math.max(jaccard, containment, answerLex.jaccard),
          reason: sameCoreAnswerClone
            ? 'Concepto/respuesta nuclear duplicada intra-lote'
            : 'Duplicado léxico intra-lote',
        });
        break;
      }
    }
    if (!isIntraDuplicate) {
      intraBatchUnique.push(card);
    }
  }

  // Si no hay tarjetas previas en el mazo, la deduplicación intra-lote es suficiente
  if (!existingCards || existingCards.length === 0) {
    const finalCards = targetCount ? intraBatchUnique.slice(0, targetCount) : intraBatchUnique;
    return {
      uniqueCards: finalCards,
      duplicateCount: duplicatesRemoved.length,
      duplicatesRemoved,
    };
  }

  // =========================================================================
  // PASO 2: Capa Léxica Rápida contra el Historial de la Base de Datos
  // =========================================================================
  const survivingLexical: GeneratedCard[] = [];

  for (const card of intraBatchUnique) {
    let matchedExisting: CardHistoryItem | null = null;
    let maxLexSim = 0;
    const candidateCoreAns = extractCoreAnswerText(card.back);

    for (const existing of existingCards) {
      const qSim = calculateLexicalSimilarity(card.front, existing.front);
      const existingCoreAns = extractCoreAnswerText(existing.back);
      const aSim = existingCoreAns
        ? calculateLexicalSimilarity(candidateCoreAns, existingCoreAns)
        : { jaccard: 0, containment: 0 };
      const distinctSubject = hasDistinctEvaluatedSubject(card.front, existing.front);

      const sameCoreAnswerClone =
        candidateCoreAns.length > 0 &&
        existingCoreAns.length > 0 &&
        (candidateCoreAns === existingCoreAns || aSim.jaccard >= 0.75 || aSim.containment >= 0.85) &&
        (isExhaustiveMode
          ? (!distinctSubject && (qSim.jaccard >= 0.75 || qSim.containment >= 0.85))
          : (qSim.jaccard >= 0.35 || qSim.containment >= 0.45));

      // Criterio de rechazo léxico comparando pregunta y núcleo de respuesta (sin explicación)
      const isDuplicate = isExhaustiveMode
        ? (qSim.jaccard >= 0.90 || (!distinctSubject && qSim.jaccard >= 0.75) || (!distinctSubject && qSim.containment >= 0.85 && aSim.jaccard >= 0.50) || sameCoreAnswerClone)
        : (qSim.jaccard >= 0.65 || (qSim.containment >= 0.75 && aSim.jaccard >= 0.35) || sameCoreAnswerClone);

      if (isDuplicate) {
        matchedExisting = existing;
        maxLexSim = Math.max(qSim.jaccard, qSim.containment, aSim.jaccard);
        break;
      }
    }

    if (matchedExisting) {
      duplicatesRemoved.push({
        candidateFront: card.front,
        matchedWith: matchedExisting.front,
        similarityScore: maxLexSim,
        reason: 'Filtro léxico determinista contra historial',
      });
    } else {
      survivingLexical.push(card);
    }
  }

  // =========================================================================
  // PASO 3: Capa Semántica Vectorial Profunda con gemini-embedding-001
  // =========================================================================
  if (apiKey && survivingLexical.length > 0) {
    try {
      // Limitamos el historial evaluado para embeddings a las últimas 80 tarjetas si el mazo es gigantesco
      const relevantHistory = existingCards.slice(-80);

      // Formatear texto representativo aislando estrictamente "Pregunta | Respuesta Nuclear" (sin "Explicación: ...")
      const candidateTexts = survivingLexical.map(
        (c) => `${normalizeCardText(c.front)} | ${extractCoreAnswerText(c.back)}`
      );
      const existingTexts = relevantHistory.map(
        (e) => `${normalizeCardText(e.front)} | ${extractCoreAnswerText(e.back)}`
      );

      console.log(
        `[Deduplication Gatekeeper] Calculando embeddings vectoriales: ${candidateTexts.length} candidatas vs ${existingTexts.length} existentes...`
      );

      // Generar embeddings en paralelo
      const [candidateVectors, existingVectors] = await Promise.all([
        batchEmbedTexts(candidateTexts, apiKey),
        batchEmbedTexts(existingTexts, apiKey),
      ]);

      for (let i = 0; i < survivingLexical.length; i++) {
        const candidate = survivingLexical[i];
        const cVec = candidateVectors[i];

        if (!cVec || cVec.length === 0) {
          // Si falló el vector individual, se acepta ya que superó la capa léxica
          acceptedCards.push(candidate);
          continue;
        }

        let isSemanticDuplicate = false;
        let highestSim = 0;
        let matchedItem: CardHistoryItem | null = null;

        for (let j = 0; j < relevantHistory.length; j++) {
          const eVec = existingVectors[j];
          if (!eVec || eVec.length === 0) continue;

          const sim = cosineSimilarity(cVec, eVec);
          const distinctSubject = hasDistinctEvaluatedSubject(
            candidate.front,
            relevantHistory[j].front
          );

          // En modo exhaustivo, si el enunciado evalúa un sujeto/variable diferente de una tabla o esquema
          // (ej. 'hierro' vs 'calcio'), solo se descarta por embedding si son prácticamente idénticas (>= 0.97).
          const effectiveThreshold =
            isExhaustiveMode && distinctSubject ? 0.97 : similarityThreshold;

          if (sim > highestSim) {
            highestSim = sim;
            matchedItem = relevantHistory[j];
          }

          if (sim >= effectiveThreshold) {
            isSemanticDuplicate = true;
            break;
          }
        }

        if (isSemanticDuplicate && matchedItem) {
          console.log(
            `[Deduplication Gatekeeper] ❌ DUPLICADO SEMÁNTICO PURGADO (${(highestSim * 100).toFixed(1)}%):\n  Candidata: "${candidate.front}"\n  Existente:  "${matchedItem.front}"`
          );
          duplicatesRemoved.push({
            candidateFront: candidate.front,
            matchedWith: matchedItem.front,
            similarityScore: highestSim,
            reason: `Similitud semántica vectorial (${(highestSim * 100).toFixed(1)}% >= ${(similarityThreshold * 100).toFixed(0)}%)`,
          });
        } else {
          acceptedCards.push(candidate);
        }
      }
    } catch (embErr) {
      console.warn('[Deduplication Gatekeeper] Error no fatal en capa de embeddings, aplicando supervivencia léxica:', embErr);
      acceptedCards.push(...survivingLexical);
    }
  } else {
    // Si no hay API key o no quedaron tarjetas, pasamos las supervivientes léxicas
    acceptedCards.push(...survivingLexical);
  }

  // Re-indexar generation_index correlativo para las tarjetas aceptadas
  const finalUniqueCards = acceptedCards.map((card, idx) => ({
    ...card,
    generation_index: idx + 1,
  }));

  const slicedCards = targetCount ? finalUniqueCards.slice(0, targetCount) : finalUniqueCards;

  console.log(
    `[Deduplication Gatekeeper] Resumen: ${candidateCards.length} candidatas -> ${duplicatesRemoved.length} duplicados eliminados -> ${slicedCards.length} tarjetas únicas definitivas.`
  );

  return {
    uniqueCards: slicedCards,
    duplicateCount: duplicatesRemoved.length,
    duplicatesRemoved,
  };
}
