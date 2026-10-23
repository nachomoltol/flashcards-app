declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export interface ImageElement {
    contentType: string;
    altText?: string;
    read(encoding: 'base64'): Promise<string>;
    read(): Promise<Buffer>;
  }

  export interface ConversionOptions {
    convertImage?: unknown;
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    outputFormat?: string;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
  }

  export interface ImageConverter {
    imgElement(
      func: (element: ImageElement) => Promise<{ src: string; alt?: string }> | { src: string; alt?: string }
    ): unknown;
    inline(
      func: (element: ImageElement) => Promise<{ src: string; alt?: string }> | { src: string; alt?: string }
    ): unknown;
    dataUri: unknown;
    imageFilenameExtension: (contentType: string) => string;
  }

  export function extractRawText(
    input: { buffer?: Buffer; path?: string; arrayBuffer?: ArrayBuffer }
  ): Promise<MammothResult>;

  export function convertToMarkdown(
    input: { buffer?: Buffer; path?: string; arrayBuffer?: ArrayBuffer },
    options?: ConversionOptions
  ): Promise<MammothResult>;

  export function convertToHtml(
    input: { buffer?: Buffer; path?: string; arrayBuffer?: ArrayBuffer },
    options?: ConversionOptions
  ): Promise<MammothResult>;

  export const images: ImageConverter;

  const mammoth: {
    extractRawText: typeof extractRawText;
    convertToMarkdown: typeof convertToMarkdown;
    convertToHtml: typeof convertToHtml;
    images: ImageConverter;
  };
  export default mammoth;
}
