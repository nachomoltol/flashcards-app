import type { CardFormat } from './database';

export type { CardFormat };

export interface GeneratedCard {
  id?: string;
  generation_index?: number;
  front: string;
  back: string;
  cardFormat: CardFormat;
  cardType?: string;
  options?: string[];
}

export interface GenerateCardsResult {
  success: boolean;
  cards?: GeneratedCard[];
  core_exhausted?: boolean;
  isRefunded?: boolean;
  error?: string;
  nextCursorPage?: number;
  startCursorPage?: number;
}

export interface MultimodalDocumentInput {
  deckId?: string;
  userId?: string;
  storagePath: string;
  signedUrl?: string;
  mimeType: string;
  fileName?: string;
  customPrompt?: string;
  focusInstruction?: string;
  cardFormat?: CardFormat;
  cardCount?: number;
  existingQuestions?: string[];
  pageStart?: number;
  pageEnd?: number;
  pageRange?: string;
  cursorPage?: number;
  language?: string;
  coreExhaustedPrevious?: boolean;
  isExhaustiveMode?: boolean;
}

export interface UrlCardInput {
  url: string;
  deckId?: string;
  userId?: string;
  customPrompt?: string;
  focusInstruction?: string;
  cardFormat?: CardFormat;
  cardCount?: number;
  existingQuestions?: string[];
  language?: string;
  coreExhaustedPrevious?: boolean;
}


