declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<MammothResult>;
  export function convertToMarkdown(input: { buffer: Buffer } | { path: string }): Promise<MammothResult>;
  export function convertToHtml(input: { buffer: Buffer } | { path: string }): Promise<MammothResult>;
  
  const mammoth: {
    extractRawText: typeof extractRawText;
    convertToMarkdown: typeof convertToMarkdown;
    convertToHtml: typeof convertToHtml;
  };
  export default mammoth;
}
