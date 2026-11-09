/**
 * Configuración centralizada de modelos de Inteligencia Artificial (Google Gemini) para Flashmente.
 *
 * REGLA ESTRICTA DE PLATAFORMA:
 * El 100% de las operaciones de generación de flashcards (documentos, enlaces, temas, OCR de apuntes),
 * resúmenes y tutor socrático utilizan EXCLUSIVAMENTE 'gemini-3.1-flash-lite'.
 */
export const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

/**
 * Modelo oficial de embeddings vectoriales para deduplicación semántica (Cosine Similarity >= 0.80).
 */
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
