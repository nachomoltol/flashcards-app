import { GoogleGenAI } from '@google/genai';
import { GEMINI_EMBEDDING_MODEL } from '@/lib/aiConfig';
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
  'and', 'to', 'a', 'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'by',
  'verdadero', 'falso', 'true', 'false',
  'integra', 'integran', 'compone', 'componen',
  'forman', 'forma', 'conforman', 'conforma', 'constituyen', 'constituye',
  'proporciona', 'proporcionan', 'aporta', 'aportan', 'suministra',
  'representa', 'representan', 'define', 'definen',
  'denomina', 'denominan', 'llama', 'llaman', 'recibe',
  'caracteriza', 'caracterizan', 'consiste', 'explica',
  'permite', 'permiten', 'produce', 'producen', 'genera', 'generan',
  'origina', 'cumple', 'cumplen', 'realiza', 'ocurre', 'sucede',
  'encuentra', 'encuentran', 'localiza', 'ubica', 'presenta', 'presentan',
  'posee', 'poseen', 'tiene', 'tienen', 'uno', 'una', 'dos', 'tres',
  'cuatro', 'cinco', 'seis', 'principal', 'principales', 'fundamental',
  'fundamentales', 'basico', 'basica', 'basicos', 'basicas', 'especifico',
  'especifica', 'especificos', 'especificas', 'segun', 'acuerdo',
  'contexto',
  'documento', 'texto', 'capitulo', 'cuadro', 'tabla', 'figura'
]);

/**
 * Detecta si una tarjeta es de tipo Verdadero / Falso analizando su formato o contenido
 */
export function isTrueFalseCard(card: {
  cardFormat?: string;
  front?: string;
  back?: string;
}): boolean {
  if (card.cardFormat === 'true_false') return true;

  const backLower = (card.back || '').trim().toLowerCase();
  const frontLower = (card.front || '').trim().toLowerCase();

  // Comprobar inicio del back con verdadero/falso
  if (/^(\*\*)?(verdadero|falso|true|false)\b/i.test(backLower)) return true;

  // Comprobar si el front plantea una instrucción explícita de V/F
  if (/\b(verdadero\s+o\s+falso|true\s+or\s+false|v\/f)\b/i.test(frontLower)) return true;

  return false;
}

/**
 * Normaliza unidades cuantitativas y equivalencias disciplinarias para evitar dispersión léxica
 */
export function normalizeUnitsAndEquivalences(text: string): string {
  return text
    .replace(/\b(kilocalor[ií]as?|kcal|calor[ií]as?|cal)\b/gi, 'calorias')
    .replace(/\b(gramos?|grs?|g)\b/gi, 'g')
    .replace(/\b(miligramos?|mgs?|mg)\b/gi, 'mg')
    .replace(/\b(decilitros?|dls?|dl)\b/gi, 'dl')
    .replace(/\b(por\s+ciento|porcentaje)\b/gi, '%')
    .replace(/\b(carb[oó]n|carbono)\b/gi, 'carbono');
}

/**
 * Extrae los números enteros presentes en un texto
 */
export function extractNumbersFromText(text: string): string[] {
  const matches = text.match(/\d+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

const KNOWN_UNITS_REGEX = /\b(calorias|mg|dl|ml|kg|cm|mm|horas|dias|anos|vasos|tazas)\b|%|\bg\b|\bl\b/gi;

/**
 * Extrae las unidades de medida normalizadas presentes en un texto
 */
export function extractUnitsFromText(text: string): string[] {
  const norm = normalizeUnitsAndEquivalences(text.toLowerCase());
  const matches = norm.match(KNOWN_UNITS_REGEX);
  return matches ? Array.from(new Set(matches.map((u) => u.toLowerCase()))) : [];
}

/**
 * Determina si dos textos comparten exactamente el mismo número o rango numérico y unidades compatibles
 */
export function shareSameNumbers(textA: string, textB: string): boolean {
  const numsA = extractNumbersFromText(textA);
  const numsB = extractNumbersFromText(textB);
  if (numsA.length === 0 || numsA.length !== numsB.length) return false;
  const allMatch = numsA.every((n) => numsB.includes(n)) && numsB.every((n) => numsA.includes(n));
  if (!allMatch) return false;

  // Verificación estricta de compatibilidad de unidades
  const unitsA = extractUnitsFromText(textA);
  const unitsB = extractUnitsFromText(textB);
  if (unitsA.length > 0 && unitsB.length > 0) {
    const hasCommonUnit = unitsA.some((u) => unitsB.includes(u));
    if (!hasCommonUnit) return false;
  }

  return true;
}

/**
 * Normaliza una cadena de texto para comparación léxica y semántica:
 * - Elimina explicaciones extensas ("Explicación: ...") para no diluir la comparación
 * - Elimina acentos/diacríticos
 * - Pasa a minúsculas
 * - Elimina opciones múltiples (a), b), c), d) del front o prefijos de opción del back
 * - Unifica unidades y equivalencias científicas (kcal -> calorias, gramos -> g, etc.)
 * - Preserva números cuantitativos en respuestas/preguntas eliminando solo prefijos de lista
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

  // 3b. Unificar sinónimos de unidades cuantitativas y equivalencias
  text = normalizeUnitsAndEquivalences(text);

  // 4. Eliminar signos de puntuación iniciales y prefijos de lista enumerativa,
  // pero PRESERVANDO números cuantitativos de valores (ej. "4 calorias", "50 a 100 g", "70 a 110 mg/dl")
  text = text.replace(/^[¿\?¡!\s]+/, '');
  text = text.replace(/^\d+[\.\)\-]\s+/, '');
  text = text.replace(/^[¿\?¡!\s]+/, '').replace(/[\?¡!\s\.]+$/, '').trim();

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
 * Extrae tokens significativos sin stopwords, incluyendo números cuantitativos y unidades críticas
 */
export function extractContentTokens(normalizedText: string): string[] {
  return normalizedText
    .split(/[\s,.;:()_/\-–—"']/)
    .map((w) => w.trim())
    .filter((w) => (w.length >= 3 || /^\d+$/.test(w) || w === '%' || w === 'g') && !STOP_WORDS.has(w));
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
 * Determina si dos tarjetas evalúan hechos o facetas sustancialmente distintas combinando
 * los tokens significativos del enunciado (front) y de la respuesta nuclear (back).
 * Erradica el 'Stem Collision': dos preguntas con el mismo encabezado introductorio
 * (ej. "En relación con el ácido fólico:") devolverán true si sus respuestas evalúan facetas
 * o datos distintos (ej. "absorción en yeyuno" vs. "espina bífida").
 */
export function hasDistinctEvaluatedFact(
  frontA: string,
  backA: string | undefined,
  frontB: string,
  backB: string | undefined
): boolean {
  const normFrontA = normalizeCardText(frontA);
  const normFrontB = normalizeCardText(frontB);
  const coreAnsA = extractCoreAnswerText(backA);
  const coreAnsB = extractCoreAnswerText(backB);

  // Si alguna tarjeta es True/False o devuelve polaridad, descartar 'verdadero'/'falso' del núcleo factual
  const cleanAnsA =
    coreAnsA === 'verdadero' || coreAnsA === 'falso' || coreAnsA === 'true' || coreAnsA === 'false'
      ? ''
      : coreAnsA;
  const cleanAnsB =
    coreAnsB === 'verdadero' || coreAnsB === 'falso' || coreAnsB === 'true' || coreAnsB === 'false'
      ? ''
      : coreAnsB;

  const tokensA = new Set([
    ...extractContentTokens(normFrontA),
    ...extractContentTokens(cleanAnsA),
  ]);
  const tokensB = new Set([
    ...extractContentTokens(normFrontB),
    ...extractContentTokens(cleanAnsB),
  ]);

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
  const EMBED_MODEL = GEMINI_EMBEDDING_MODEL;
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
  isFocusActive?: boolean;
}): Promise<DeduplicationResult> {
  const {
    candidateCards,
    existingCards,
    apiKey,
    similarityThreshold = params.isFocusActive
      ? 0.94
      : params.isExhaustiveMode
      ? 0.94
      : 0.88,
    targetCount,
    isExhaustiveMode = false,
    isFocusActive = false,
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
      const answerLex = (candidateCoreAns && acceptedCoreAns)
        ? calculateLexicalSimilarity(candidateCoreAns, acceptedCoreAns)
        : { jaccard: 0, containment: 0 };

      const distinctSubject = hasDistinctEvaluatedSubject(card.front, accepted.front);
      const distinctFact = hasDistinctEvaluatedFact(card.front, card.back, accepted.front, accepted.back);

      // Firma léxica combinada (pregunta + respuesta nuclear)
      const combinedCandidate = `${normalizeCardText(card.front)} ${candidateCoreAns}`.trim();
      const combinedAccepted = `${normalizeCardText(accepted.front)} ${acceptedCoreAns}`.trim();
      const combinedLex = calculateLexicalSimilarity(combinedCandidate, combinedAccepted);

      // Verificación de núcleo de respuesta idéntico o clon
      const hasBothCoreAnswers = candidateCoreAns.length > 0 && acceptedCoreAns.length > 0;
      const numbersMatch = shareSameNumbers(candidateCoreAns, acceptedCoreAns);

      const candidateUnits = extractUnitsFromText(candidateCoreAns);
      const acceptedUnits = extractUnitsFromText(acceptedCoreAns);
      const shareUnit =
        candidateUnits.length > 0 &&
        acceptedUnits.length > 0 &&
        candidateUnits.some((u) => acceptedUnits.includes(u));

      const isTextIdentical =
        candidateCoreAns === acceptedCoreAns ||
        answerLex.jaccard >= 0.75 ||
        answerLex.containment >= 0.85;

      const sameCoreAnswer =
        hasBothCoreAnswers &&
        (isTextIdentical ||
          (numbersMatch && (shareUnit || answerLex.jaccard >= 0.50)));

      const isHighlyIdenticalAnswer =
        candidateCoreAns === acceptedCoreAns || answerLex.jaccard >= 0.80;

      const sameCoreAnswerClone = sameCoreAnswer && (!distinctSubject && !distinctFact);

      const isTF = isTrueFalseCard(card) || isTrueFalseCard(accepted);

      // Si ambas respuestas contienen exactamente el mismo número o rango numérico y unidades compatibles,
      // no se consideran claramente distintas
      const hasClearlyDistinctAnswers =
        !isTF &&
        hasBothCoreAnswers &&
        !sameCoreAnswer &&
        answerLex.jaccard < 0.35 &&
        answerLex.containment < 0.50 &&
        !numbersMatch;

      // Conteo de tokens sustantivos compartidos en el enunciado
      const tokensQ1 = extractContentTokens(normalizeCardText(card.front));
      const tokensQ2 = extractContentTokens(normalizeCardText(accepted.front));
      const sharedQTokens = tokensQ1.filter((t) => tokensQ2.includes(t)).length;

      const combinedThreshold = isExhaustiveMode ? 0.90 : 0.80;

      let isDuplicate = false;
      let duplicateReason = 'Duplicado léxico intra-lote';

      if (isTF && (jaccard >= 0.60 || containment >= 0.72 || combinedLex.jaccard >= 0.65)) {
        isDuplicate = true;
        duplicateReason = 'Duplicado de Verdadero/Falso (mismo hecho evaluado con polaridad similar o invertida)';
      } else if (hasClearlyDistinctAnswers && jaccard < 0.88) {
        // Respuestas claramente distintas: evalúan hechos/facetas diferentes
        isDuplicate = false;
      } else if (!isFocusActive && jaccard >= 0.85) {
        // Enunciados prácticamente idénticos (aunque las respuestas utilicen sinónimos como "Digestión del almidón" vs "Hidrólisis del almidón")
        isDuplicate = true;
        duplicateReason = 'Enunciado prácticamente idéntico evaluando el mismo hecho con variantes sinonímicas de respuesta';
      } else if (
        !isFocusActive &&
        hasBothCoreAnswers &&
        sameCoreAnswer &&
        !distinctSubject &&
        !distinctFact &&
        (jaccard >= 0.28 || containment >= 0.45 || (isHighlyIdenticalAnswer && sharedQTokens >= 2))
      ) {
        isDuplicate = true;
        duplicateReason = 'Concepto o respuesta nuclear idéntica con coincidencia de enunciado sin diferenciación sustancial';
      } else if (
        !isFocusActive &&
        hasBothCoreAnswers &&
        isHighlyIdenticalAnswer &&
        sharedQTokens >= 3
      ) {
        isDuplicate = true;
        duplicateReason = 'Filtro anti-triplicados de respuesta monopalabra idéntica con alta coincidencia de tokens (sharedQTokens >= 3)';
      } else if (
        hasBothCoreAnswers &&
        sameCoreAnswer &&
        (distinctSubject || distinctFact) &&
        (jaccard >= 0.65 || containment >= 0.78)
      ) {
        isDuplicate = true;
        duplicateReason = 'Preguntas con sujetos diferenciados pero enunciado casi idéntico y misma respuesta';
      } else if (hasClearlyDistinctAnswers) {
        // Respuestas claramente distintas: evalúan hechos/facetas diferentes
        isDuplicate = false;
      } else if (sameCoreAnswerClone && jaccard >= 0.60) {
        isDuplicate = true;
        duplicateReason = 'Concepto/respuesta nuclear duplicada intra-lote';
      } else if (combinedLex.jaccard >= combinedThreshold) {
        isDuplicate = true;
        duplicateReason = 'Firma léxica combinada redundante intra-lote';
      } else if (!distinctFact && !distinctSubject) {
        if (isExhaustiveMode) {
          isDuplicate =
            jaccard >= 0.90 ||
            (containment >= 0.85 && answerLex.jaccard >= 0.50) ||
            sameCoreAnswerClone;
        } else {
          isDuplicate =
            (jaccard >= 0.65 && answerLex.jaccard >= 0.35) ||
            (containment >= 0.75 && answerLex.jaccard >= 0.35) ||
            sameCoreAnswerClone;
        }
        if (isDuplicate) {
          duplicateReason = 'Mismo hecho y sujeto evaluados sin diferenciación sustancial';
        }
      }

      if (isDuplicate) {
        isIntraDuplicate = true;
        duplicatesRemoved.push({
          candidateFront: card.front,
          matchedWith: accepted.front,
          similarityScore: Math.max(jaccard, containment, answerLex.jaccard, combinedLex.jaccard),
          reason: duplicateReason,
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
    let matchedReason = 'Filtro léxico determinista contra historial';
    const candidateCoreAns = extractCoreAnswerText(card.back);

    for (const existing of existingCards) {
      const qSim = calculateLexicalSimilarity(card.front, existing.front);
      const existingCoreAns = extractCoreAnswerText(existing.back);
      const aSim = (candidateCoreAns && existingCoreAns)
        ? calculateLexicalSimilarity(candidateCoreAns, existingCoreAns)
        : { jaccard: 0, containment: 0 };

      const distinctSubject = hasDistinctEvaluatedSubject(card.front, existing.front);
      const distinctFact = hasDistinctEvaluatedFact(card.front, card.back, existing.front, existing.back);

      // Firma léxica combinada (pregunta + respuesta nuclear)
      const combinedCandidate = `${normalizeCardText(card.front)} ${candidateCoreAns}`.trim();
      const combinedExisting = `${normalizeCardText(existing.front)} ${existingCoreAns}`.trim();
      const combinedLex = calculateLexicalSimilarity(combinedCandidate, combinedExisting);

      const hasBothCoreAnswers = candidateCoreAns.length > 0 && existingCoreAns.length > 0;
      const numbersMatch = shareSameNumbers(candidateCoreAns, existingCoreAns);

      const candidateUnits = extractUnitsFromText(candidateCoreAns);
      const existingUnits = extractUnitsFromText(existingCoreAns);
      const shareUnit =
        candidateUnits.length > 0 &&
        existingUnits.length > 0 &&
        candidateUnits.some((u) => existingUnits.includes(u));

      const isTextIdentical =
        candidateCoreAns === existingCoreAns ||
        aSim.jaccard >= 0.75 ||
        aSim.containment >= 0.85;

      const sameCoreAnswer =
        hasBothCoreAnswers &&
        (isTextIdentical ||
          (numbersMatch && (shareUnit || aSim.jaccard >= 0.50)));

      const isHighlyIdenticalAnswer =
        candidateCoreAns === existingCoreAns || aSim.jaccard >= 0.80;

      const sameCoreAnswerClone = sameCoreAnswer && (!distinctSubject && !distinctFact);

      const isTF = isTrueFalseCard(card) || isTrueFalseCard(existing);

      // Si ambas respuestas contienen exactamente el mismo número o rango numérico y unidades compatibles,
      // no se consideran claramente distintas
      const hasClearlyDistinctAnswers =
        !isTF &&
        hasBothCoreAnswers &&
        !sameCoreAnswer &&
        aSim.jaccard < 0.35 &&
        aSim.containment < 0.50 &&
        !numbersMatch;

      // Conteo de tokens sustantivos compartidos en el enunciado
      const tokensQ1 = extractContentTokens(normalizeCardText(card.front));
      const tokensQ2 = extractContentTokens(normalizeCardText(existing.front));
      const sharedQTokens = tokensQ1.filter((t) => tokensQ2.includes(t)).length;

      const combinedThreshold = isExhaustiveMode ? 0.90 : 0.80;

      let isDuplicate = false;
      let duplicateReason = 'Filtro léxico determinista contra historial';

      if (isTF && (qSim.jaccard >= 0.60 || qSim.containment >= 0.72 || combinedLex.jaccard >= 0.65)) {
        isDuplicate = true;
        duplicateReason = 'Duplicado de Verdadero/Falso contra historial (mismo hecho evaluado con polaridad similar o invertida)';
      } else if (hasClearlyDistinctAnswers && qSim.jaccard < 0.88) {
        // Respuestas claramente distintas contra historial: evalúan hechos/facetas diferentes
        isDuplicate = false;
      } else if (!isFocusActive && qSim.jaccard >= 0.85) {
        // Enunciados prácticamente idénticos (aunque las respuestas utilicen sinónimos como "Digestión del almidón" vs "Hidrólisis del almidón")
        isDuplicate = true;
        duplicateReason = 'Enunciado prácticamente idéntico evaluando el mismo hecho contra historial con variantes sinonímicas de respuesta';
      } else if (
        !isFocusActive &&
        hasBothCoreAnswers &&
        sameCoreAnswer &&
        !distinctSubject &&
        !distinctFact &&
        (qSim.jaccard >= 0.28 || qSim.containment >= 0.45 || (isHighlyIdenticalAnswer && sharedQTokens >= 2))
      ) {
        isDuplicate = true;
        duplicateReason = 'Concepto o respuesta nuclear idéntica con coincidencia de enunciado contra historial sin diferenciación sustancial';
      } else if (
        !isFocusActive &&
        hasBothCoreAnswers &&
        isHighlyIdenticalAnswer &&
        sharedQTokens >= 3
      ) {
        isDuplicate = true;
        duplicateReason = 'Filtro anti-triplicados contra historial de respuesta monopalabra idéntica con alta coincidencia de tokens (sharedQTokens >= 3)';
      } else if (
        hasBothCoreAnswers &&
        sameCoreAnswer &&
        (distinctSubject || distinctFact) &&
        (qSim.jaccard >= 0.65 || qSim.containment >= 0.78)
      ) {
        isDuplicate = true;
        duplicateReason = 'Preguntas con sujetos diferenciados pero enunciado casi idéntico y misma respuesta contra historial';
      } else if (hasClearlyDistinctAnswers) {
        isDuplicate = false;
      } else if (sameCoreAnswerClone && qSim.jaccard >= 0.60) {
        isDuplicate = true;
        duplicateReason = 'Concepto/respuesta nuclear duplicada contra historial';
      } else if (combinedLex.jaccard >= combinedThreshold) {
        isDuplicate = true;
        duplicateReason = 'Firma léxica combinada redundante contra historial';
      } else if (!distinctFact && !distinctSubject) {
        if (isExhaustiveMode) {
          isDuplicate =
            qSim.jaccard >= 0.90 ||
            (qSim.containment >= 0.85 && aSim.jaccard >= 0.50) ||
            sameCoreAnswerClone;
        } else {
          isDuplicate =
            (qSim.jaccard >= 0.65 && aSim.jaccard >= 0.35) ||
            (qSim.containment >= 0.75 && aSim.jaccard >= 0.35) ||
            sameCoreAnswerClone;
        }
        if (isDuplicate) {
          duplicateReason = 'Mismo hecho y sujeto evaluados sin diferenciación sustancial contra historial';
        }
      }

      if (isDuplicate) {
        matchedExisting = existing;
        matchedReason = duplicateReason;
        maxLexSim = Math.max(qSim.jaccard, qSim.containment, aSim.jaccard, combinedLex.jaccard);
        break;
      }
    }

    if (matchedExisting) {
      duplicatesRemoved.push({
        candidateFront: card.front,
        matchedWith: matchedExisting.front,
        similarityScore: maxLexSim,
        reason: matchedReason,
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
        let matchedThreshold = similarityThreshold;

        for (let j = 0; j < relevantHistory.length; j++) {
          const eVec = existingVectors[j];
          if (!eVec || eVec.length === 0) continue;

          const sim = cosineSimilarity(cVec, eVec);
          const distinctSubject = hasDistinctEvaluatedSubject(
            candidate.front,
            relevantHistory[j].front
          );
          const distinctFact = hasDistinctEvaluatedFact(
            candidate.front,
            candidate.back,
            relevantHistory[j].front,
            relevantHistory[j].back
          );

          // Si dos tarjetas comparten la misma respuesta nuclear, PROHÍBE que distinctSubject o distinctFact
          // eleven effectiveThreshold a 0.97. En su lugar, usa un umbral más estricto (0.84 normal / 0.86 exhaustivo).
          const candCore = extractCoreAnswerText(candidate.back);
          const histCore = extractCoreAnswerText(relevantHistory[j].back);
          const aSim = (candCore && histCore)
            ? calculateLexicalSimilarity(candCore, histCore)
            : { jaccard: 0, containment: 0 };
          const numbersMatch = candCore && histCore ? shareSameNumbers(candCore, histCore) : false;
          const candUnits = extractUnitsFromText(candCore);
          const histUnits = extractUnitsFromText(histCore);
          const shareUnit =
            candUnits.length > 0 &&
            histUnits.length > 0 &&
            candUnits.some((u) => histUnits.includes(u));

          const sameNuclearAns =
            candCore.length > 0 &&
            histCore.length > 0 &&
            (candCore === histCore ||
              aSim.jaccard >= 0.75 ||
              aSim.containment >= 0.85 ||
              (numbersMatch && (shareUnit || aSim.jaccard >= 0.50)));

          let effectiveThreshold = similarityThreshold;
          if (sameNuclearAns) {
            if (isFocusActive) {
              effectiveThreshold = 0.95;
            } else if (!distinctSubject && !distinctFact) {
              effectiveThreshold = isExhaustiveMode ? 0.86 : 0.84;
            } else {
              effectiveThreshold = isExhaustiveMode ? 0.95 : 0.92;
            }
          } else if (isFocusActive) {
            effectiveThreshold = 0.96;
          } else if (isExhaustiveMode && (distinctSubject || distinctFact)) {
            effectiveThreshold = 0.97;
          }

          if (sim > highestSim) {
            highestSim = sim;
            matchedItem = relevantHistory[j];
            matchedThreshold = effectiveThreshold;
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
            reason: `Similitud semántica vectorial (${(highestSim * 100).toFixed(1)}% >= ${(matchedThreshold * 100).toFixed(0)}%)`,
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
