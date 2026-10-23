/**
 * Utilidades para segmentación de documentos Word (.docx / .doc)
 * en páginas virtuales homogéneas (~400 palabras / ~2.200 caracteres)
 * con soporte multimodal para extracción y vinculación de imágenes incrustadas.
 */

import mammoth from 'mammoth';

export const TARGET_DOCX_WORDS_PER_PAGE = 400;
export const TARGET_DOCX_CHARS_PER_PAGE = 2200;

export interface DocxImage {
  mimeType: string;
  dataBase64: string;
}

export interface VirtualDocxPage {
  pageNumber: number;
  text: string;
  images: { mimeType: string; dataBase64: string }[];
}

function normalizeImageMime(rawMime?: string): string | null {
  if (!rawMime) return null;
  const lower = rawMime.toLowerCase().trim();
  if (lower === 'image/jpeg' || lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/webp') return 'image/webp';
  if (lower === 'image/gif') return 'image/gif';
  return null;
}

/**
 * Convierte el HTML generado por Mammoth en texto estructurado limpio,
 * preservando tablas, listas, encabezados y marcadores de imágenes.
 */
export function htmlToDocxStructuredText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<img[^>]*src=["']__DOCX_IMG_PLACEHOLDER_(\d+)__["'][^>]*>/gi, '\n\n__DOCX_IMG_PLACEHOLDER_$1__\n\n')
    .replace(/<\/p>|<\/h[1-6]>|<\/tr>|<\/div>|<\/blockquote>/gi, '\n\n')
    .replace(/<\/td>|<\/th>/gi, ' | ')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Segmenta el texto de un documento DOCX en páginas virtuales homogéneas,
 * asociando las imágenes detectadas a la página virtual correspondiente.
 */
export function segmentDocxIntoVirtualPages(
  rawText: string,
  targetWords: number = TARGET_DOCX_WORDS_PER_PAGE,
  targetChars: number = TARGET_DOCX_CHARS_PER_PAGE,
  imagesPool: DocxImage[] = []
): VirtualDocxPage[] {
  const cleanText = (rawText || '').trim();
  if (!cleanText) return [];

  // 1. Respetar saltos de página explícitos de Word (\f o \x0c) si vienen indicados
  const explicitSections = cleanText.split(/\f|\x0c/);
  const rawVirtualPages: string[] = [];

  for (const section of explicitSections) {
    const trimmedSection = section.trim();
    if (!trimmedSection) continue;

    // Dividir en párrafos
    const rawParagraphs = trimmedSection.split(/\r?\n\s*\r?\n/);
    const paragraphs: string[] = [];

    // Si un párrafo individual es desmesuradamente largo y no contiene marcador de imagen, subdividirlo por bloques de palabras
    for (const p of rawParagraphs) {
      const trimmedP = p.trim();
      if (!trimmedP) continue;

      const words = trimmedP.split(/\s+/).filter(Boolean);
      if (words.length > targetWords * 1.4 && !trimmedP.includes('__DOCX_IMG_PLACEHOLDER_')) {
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
        rawVirtualPages.push(currentPageParagraphs.join('\n\n'));
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
      rawVirtualPages.push(currentPageParagraphs.join('\n\n'));
    }
  }

  // Fallback de seguridad si no se generó ninguna página pero hay texto
  if (rawVirtualPages.length === 0 && cleanText.length > 0) {
    rawVirtualPages.push(cleanText);
  }

  // Vincular las imágenes incrustadas a cada página virtual correspondiente
  return rawVirtualPages.map((pageRawText, idx) => {
    const pageImages: DocxImage[] = [];
    const placeholderRegex = /__DOCX_IMG_PLACEHOLDER_(\d+)__/g;
    let match: RegExpExecArray | null;
    const seenIndices = new Set<number>();

    while ((match = placeholderRegex.exec(pageRawText)) !== null) {
      const imgIdx = parseInt(match[1], 10);
      if (!isNaN(imgIdx) && !seenIndices.has(imgIdx) && imagesPool[imgIdx]) {
        seenIndices.add(imgIdx);
        pageImages.push(imagesPool[imgIdx]);
      }
    }

    const cleanedPageText = pageRawText
      .replace(
        /__DOCX_IMG_PLACEHOLDER_(\d+)__/g,
        (_m, p1) => `[Figura / Diagrama adjunto: Imagen ${parseInt(p1, 10) + 1}]`
      )
      .trim();

    return {
      pageNumber: idx + 1,
      text: cleanedPageText,
      images: pageImages.slice(0, 3), // Máximo 3 imágenes principales por página virtual
    };
  });
}

/**
 * Parsea un documento Word (.docx) extrayendo texto estructurado e imágenes incrustadas,
 * y lo divide en páginas virtuales homogéneas con sus respectivas imágenes asociadas.
 */
export async function parseDocxIntoVirtualPages(
  fileData: ArrayBuffer | Buffer,
  targetWords: number = TARGET_DOCX_WORDS_PER_PAGE,
  targetChars: number = TARGET_DOCX_CHARS_PER_PAGE
): Promise<VirtualDocxPage[]> {
  const imagesPool: DocxImage[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertImage = mammoth.images.imgElement(async (element: any) => {
    try {
      const base64 = await element.read('base64');
      const normalizedMime = normalizeImageMime(element.contentType);
      // Validar tipo MIME soportado por Gemini y tamaño seguro (< 6MB en base64)
      if (normalizedMime && base64 && base64.length <= 6 * 1024 * 1024) {
        const imgIndex = imagesPool.length;
        imagesPool.push({
          mimeType: normalizedMime,
          dataBase64: base64,
        });
        return {
          src: `__DOCX_IMG_PLACEHOLDER_${imgIndex}__`,
          alt: element.altText || `Imagen ${imgIndex + 1}`,
        };
      }
    } catch (imgErr) {
      console.warn('Error al leer imagen de Word:', imgErr);
    }
    return { src: '' };
  });

  let htmlResult = '';
  try {
    const input =
      typeof Buffer !== 'undefined' && fileData instanceof Buffer
        ? { buffer: fileData }
        : { arrayBuffer: fileData as ArrayBuffer };

    const res = await mammoth.convertToHtml(input, { convertImage });
    htmlResult = (res && res.value) || '';
  } catch (htmlErr) {
    console.warn('Advertencia en mammoth.convertToHtml:', htmlErr);
  }

  let structuredText = htmlToDocxStructuredText(htmlResult);

  // Fallback 1: Si convertToHtml no extrajo suficiente texto, probar extractRawText
  if (!structuredText || structuredText.length < 20) {
    try {
      const input =
        typeof Buffer !== 'undefined' && fileData instanceof Buffer
          ? { buffer: fileData }
          : { arrayBuffer: fileData as ArrayBuffer };
      const rawRes = await mammoth.extractRawText(input);
      const rawVal = (rawRes && rawRes.value) || '';
      if (rawVal.length > structuredText.length) {
        structuredText = rawVal;
      }
    } catch {
      // Ignorar fallback
    }
  }

  // Fallback 2: Para documentos Word binarios .doc legacy
  if (!structuredText || structuredText.length < 20) {
    try {
      const rawString =
        typeof Buffer !== 'undefined' && fileData instanceof Buffer
          ? fileData.toString('utf-8')
          : new TextDecoder('utf-8', { fatal: false }).decode(fileData as ArrayBuffer);
      const cleaned = rawString
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned.length > structuredText.length) {
        structuredText = cleaned;
      }
    } catch {
      // Ignorar
    }
  }

  return segmentDocxIntoVirtualPages(structuredText, targetWords, targetChars, imagesPool);
}
