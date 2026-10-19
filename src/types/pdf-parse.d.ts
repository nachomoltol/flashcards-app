declare module 'pdf-parse' {
  export interface PDFParseTextResult {
    total: number;
    pages: number;
    text: string;
    [key: string]: unknown;
  }

  export interface PDFParseTextOptions {
    first?: number;
    last?: number;
    pageJoiner?: string;
    [key: string]: unknown;
  }

  export class PDFParse {
    constructor(options: { data: Buffer | Uint8Array; [key: string]: unknown });
    getText(options?: PDFParseTextOptions): Promise<PDFParseTextResult>;
    destroy(): Promise<void>;
  }
}
