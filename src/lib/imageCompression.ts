/**
 * Utilidad nativa de compresión y reescalado de imágenes basada en HTML5 Canvas.
 * Permite reducir drásticamente el peso de imágenes en el cliente antes de subirlas
 * a Supabase Storage para preservar la cuota de almacenamiento.
 */

export interface CompressionOptions {
  /** Ancho máximo en píxeles (por defecto 1920) */
  maxWidth?: number;
  /** Alto máximo en píxeles (por defecto 1920) */
  maxHeight?: number;
  /** Calidad de compresión entre 0.1 y 1.0 (por defecto 0.8) */
  quality?: number;
  /** Formato de salida (por defecto 'image/webp') */
  format?: 'image/webp' | 'image/jpeg';
  /** Tamaño máximo objetivo en KB (por defecto 500 KB) */
  maxFileSizeKB?: number;
}

export interface CompressionResult {
  file: File;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  width: number;
  height: number;
}

/**
 * Comprime un archivo de imagen utilizando la API Canvas del navegador.
 * Mantiene la relación de aspecto original y optimiza la calidad hasta cumplir el tamaño objetivo.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    format = 'image/webp',
    maxFileSizeKB = 500,
  } = options;

  // Si no estamos en entorno de navegador (SSR), devolver el archivo original
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      file,
      blob: file,
      originalSize: file.size,
      compressedSize: file.size,
      reductionPercentage: 0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // 1. Calcular dimensiones manteniendo el aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 2. Crear lienzo de dibujo
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: format === 'image/webp' });
        if (!ctx) {
          throw new Error('No se pudo inicializar el contexto 2D de Canvas.');
        }

        // Si se exporta como JPEG (sin soporte alpha), pintar fondo blanco para evitar fondos negros
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        // Calidad de renderizado del Canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // 3. Helper para generar Blob con calidad específica
        const getBlobWithQuality = (q: number): Promise<Blob> => {
          return new Promise((res, rej) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  res(blob);
                } else {
                  rej(new Error('Canvas toBlob retornó null'));
                }
              },
              format,
              q
            );
          });
        };

        // 4. Compresión iterativa si el tamaño supera el objetivo (500 KB)
        let currentQuality = quality;
        let blob = await getBlobWithQuality(currentQuality);
        const maxBytes = maxFileSizeKB * 1024;

        // Si supera el límite y la calidad aún es reducible, ajustar calidad progresivamente
        while (blob.size > maxBytes && currentQuality > 0.4) {
          currentQuality -= 0.1;
          const smallerBlob = await getBlobWithQuality(currentQuality);
          blob = smallerBlob;
        }

        // 5. Construir File resultante con extensión adecuada
        const ext = format === 'image/webp' ? 'webp' : 'jpg';
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const newFileName = `${baseName}.${ext}`;

        const compressedFile = new File([blob], newFileName, {
          type: format,
          lastModified: Date.now(),
        });

        const reduction = Math.max(
          0,
          Math.round(((file.size - compressedFile.size) / file.size) * 100)
        );

        console.info(
          `[compressImage] Original: ${(file.size / 1024).toFixed(1)} KB -> Comprimido: ${(compressedFile.size / 1024).toFixed(1)} KB (-${reduction}%) [${width}x${height}px, ${format}]`
        );

        resolve({
          file: compressedFile,
          blob,
          originalSize: file.size,
          compressedSize: compressedFile.size,
          reductionPercentage: reduction,
          width,
          height,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Error al cargar la imagen para compresión: ${err}`));
    };

    img.src = objectUrl;
  });
}

