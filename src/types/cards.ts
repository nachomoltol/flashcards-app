import type { CardFormat } from './database';

export type { CardFormat };

export interface GeneratedCard {
  front: string;
  back: string;
  cardFormat: CardFormat;
  cardType?: string;
}

export interface GenerateCardsResult {
  success: boolean;
  cards?: GeneratedCard[];
  core_exhausted?: boolean;
  error?: string;
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
  language?: string;
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
}


