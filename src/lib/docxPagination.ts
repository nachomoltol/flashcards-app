/**
 * Utilidades para segmentación de documentos Word (.docx / .doc)
 * en páginas virtuales homogéneas (~400 palabras / ~2.200 caracteres).
 */

export const TARGET_DOCX_WORDS_PER_PAGE = 400;
export const TARGET_DOCX_CHARS_PER_PAGE = 2200;

/**
 * Segmenta el texto de un documento DOCX en páginas virtuales homogéneas,
 * respetando saltos de página explícitos (\f o \x0c) y divisiones naturales por párrafos.
 */
export function segmentDocxIntoVirtualPages(
  rawText: string,
  targetWords: number = TARGET_DOCX_WORDS_PER_PAGE,
  targetChars: number = TARGET_DOCX_CHARS_PER_PAGE
): string[] {
  const cleanText = (rawText || '').trim();
  if (!cleanText) return [];

  // 1. Respetar saltos de página explícitos de Word (\f o \x0c) si vienen indicados
  const explicitSections = cleanText.split(/\f|\x0c/);
  const virtualPages: string[] = [];

  for (const section of explicitSections) {
    const trimmedSection = section.trim();
    if (!trimmedSection) continue;

    // Dividir en párrafos
    const rawParagraphs = trimmedSection.split(/\r?\n\s*\r?\n/);
    const paragraphs: string[] = [];

    // Si un párrafo individual es desmesuradamente largo, subdividirlo por bloques de palabras
    for (const p of rawParagraphs) {
      const trimmedP = p.trim();
      if (!trimmedP) continue;

      const words = trimmedP.split(/\s+/).filter(Boolean);
      if (words.length > targetWords * 1.4) {
        for (let i = 0; i < words.length; i += targetWords) {
          paragraphs.push(words.slice(i, i + targetWords).join(' '));
        }
      } else {
        paragraphs.push(trimmedP);
      }
    }

    let currentPageParagraphs: string[] = [];
    let currentPageWordCount = 0;
    let currentPageCharCount = 0;

    for (const p of paragraphs) {
      const pWords = p.split(/\s+/).filter(Boolean).length;
      const pChars = p.length;

      // Si al añadir este párrafo se superan los umbrales de ~400 palabras / ~2.200 chars
      if (
        currentPageWordCount > 0 &&
        (currentPageWordCount + pWords > targetWords ||
          currentPageCharCount + pChars > targetChars)
      ) {
        virtualPages.push(currentPageParagraphs.join('\n\n'));
        currentPageParagraphs = [p];
        currentPageWordCount = pWords;
        currentPageCharCount = pChars;
      } else {
        currentPageParagraphs.push(p);
        currentPageWordCount += pWords;
        currentPageCharCount += pChars;
      }
    }

    if (currentPageParagraphs.length > 0) {
      virtualPages.push(currentPageParagraphs.join('\n\n'));
    }
  }

  // Fallback de seguridad si no se generó ninguna página pero hay texto
  if (virtualPages.length === 0 && cleanText.length > 0) {
    virtualPages.push(cleanText);
  }

  return virtualPages;
}
