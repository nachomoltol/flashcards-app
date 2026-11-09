'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Trash2,
  UploadCloud,
  Sparkles,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressImage } from '@/lib/imageCompression';
import { generateCardsFromNotesAction } from '@/app/actions/generateCardsFromNotes';
import { useAuthStore, useCardStore, useDeckStore, useProModalStore, useLanguageStore } from '@/stores';
import { InfoTooltip } from './InfoTooltip';
import type { CardFormat } from '@/types/cards';

interface NotePageItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface HandwrittenNotesUploaderProps {
  deckId: string;
  onSuccess?: (count: number) => void;
  onCancel?: () => void;
}

export function HandwrittenNotesUploader({
  deckId,
  onSuccess,
  onCancel,
}: HandwrittenNotesUploaderProps) {
  const { user } = useAuthStore();
  const { fetchCardsByDeck } = useCardStore();
  const { fetchDeckById } = useDeckStore();
  const { openProModal } = useProModalStore();
  const { language, t } = useLanguageStore();
  const isEn = language === 'en';

  const [pages, setPages] = useState<NotePageItem[]>([]);
  const [cardFormat, setCardFormat] = useState<CardFormat>('multiple_choice');
  const [cardCount, setCardCount] = useState<number>(10);
  const [isPracticalMode, setIsPracticalMode] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const [status, setStatus] = useState<'idle' | 'compressing' | 'generating' | 'success'>('idle');
  const [compressionProgress, setCompressionProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Agregar archivos nuevos a la lista respetando el límite de 10
  const addFilesToPages = useCallback((newFiles: File[]) => {
    setPages((prev) => {
      const remainingSlots = 10 - prev.length;
      if (remainingSlots <= 0) return prev;

      const validFiles = newFiles.filter((f) => f.type.startsWith('image/')).slice(0, remainingSlots);
      const newItems: NotePageItem[] = validFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      return [...prev, ...newItems];
    });
  }, []);

  // Manejador del input de archivos web
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (e.target.files && e.target.files.length > 0) {
        addFilesToPages(Array.from(e.target.files));
      }
    } catch (err: unknown) {
      console.error('[HandwrittenNotesUploader] Error al leer archivos:', err);
    } finally {
      // Reiniciar value para permitir seleccionar los mismos archivos en reintentos
      e.target.value = '';
    }
  };

  // Convertir path nativo de foto a File y agregar a la cola
  const handleAddNativePhoto = async (webPath: string) => {
    try {
      const response = await fetch(webPath);
      const blob = await response.blob();
      const file = new File([blob], `apunte_cam_${Date.now()}.jpg`, { type: 'image/jpeg' });
      addFilesToPages([file]);
    } catch (err) {
      console.error('[HandwrittenNotesUploader] Error al convertir foto nativa:', err);
    }
  };

  // Disparar captura de foto con cámara (Nativo Capacitor o fallback a input HTML5)
  const handleTakePhoto = async (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (Capacitor.isNativePlatform()) {
      try {
        const check = await Camera.checkPermissions();
        if (check.camera !== 'granted') {
          const req = await Camera.requestPermissions({ permissions: ['camera'] });
          if (req.camera !== 'granted') {
            cameraInputRef.current?.click();
            return;
          }
        }
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          quality: 85,
          allowEditing: false,
        });
        if (photo.webPath) {
          await handleAddNativePhoto(photo.webPath);
        }
      } catch (err) {
        console.warn('Native camera error or cancelled, falling back to input:', err);
        cameraInputRef.current?.click();
      }
    } else {
      cameraInputRef.current?.click();
    }
  };

  // Disparar selector de galería (Nativo Capacitor o fallback a input HTML5)
  const handlePickGallery = async (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (Capacitor.isNativePlatform()) {
      try {
        const remaining = Math.max(1, 10 - pages.length);
        const result = await Camera.pickImages({
          quality: 85,
          limit: remaining,
        });
        if (result.photos && result.photos.length > 0) {
          for (const p of result.photos) {
            if (p.webPath) await handleAddNativePhoto(p.webPath);
          }
        }
      } catch (err) {
        console.warn('Native gallery error or cancelled, falling back to input:', err);
        galleryInputRef.current?.click();
      }
    } else {
      galleryInputRef.current?.click();
    }
  };

  // Reordenar páginas hacia la izquierda
  const handleMoveLeft = (index: number) => {
    if (index === 0) return;
    setPages((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Reordenar páginas hacia la derecha
  const handleMoveRight = (index: number) => {
    if (index === pages.length - 1) return;
    setPages((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Eliminar página de la lista
  const handleDeletePage = (index: number) => {
    setPages((prev) => {
      const itemToDelete = prev[index];
      if (itemToDelete?.previewUrl) {
        URL.revokeObjectURL(itemToDelete.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Convertir un Blob en base64 puro (sin prefijo)
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Procesar y enviar apuntes a la IA
  const handleProcessNotes = async () => {
    if (pages.length === 0) {
      setErrorMessage('Selecciona al menos una foto de tus apuntes.');
      return;
    }

    setErrorMessage(null);
    setStatus('compressing');
    setCompressionProgress({ current: 0, total: pages.length });

    try {
      // 1. Compresión client-side en Canvas: 1920px max, JPEG, quality 0.78, ~400KB
      const processedImages: Array<{ order: number; mimeType: 'image/jpeg'; base64Data: string }> = [];

      for (let i = 0; i < pages.length; i++) {
        setCompressionProgress({ current: i + 1, total: pages.length });
        const { file } = pages[i];

        const compressed = await compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1920,
          format: 'image/jpeg',
          quality: 0.78,
          maxFileSizeKB: 450,
        });

        const base64 = await blobToBase64(compressed.blob);
        processedImages.push({
          order: i + 1,
          mimeType: 'image/jpeg',
          base64Data: base64,
        });
      }

      // 2. Transmisión efímera en memoria al Server Action con Gemini
      setStatus('generating');

      const result = await generateCardsFromNotesAction({
        deckId,
        userId: user?.id,
        images: processedImages,
        cardFormat,
        cardCount,
        customPrompt: customPrompt.trim() || undefined,
        language,
        isPracticalMode: Boolean(isPracticalMode),
      });

      if (!result.success || !result.cards || result.cards.length === 0) {
        if (result.error === 'LIMIT_REACHED' || result.error === 'AD_REQUIRED') {
          setStatus('idle');
          openProModal(true, null, () => handleProcessNotes());
          return;
        }

        setStatus('idle');
        setErrorMessage(
          result.error ||
            'No se pudieron extraer tarjetas legibles de los apuntes. Asegúrate de que las fotos tengan buena iluminación y enfoque.'
        );
        return;
      }

      // 3. Sincronizar datos locales del mazo
      await fetchCardsByDeck(deckId);
      await fetchDeckById(deckId);

      setGeneratedCount(result.cards.length);
      setStatus('success');
      onSuccess?.(result.cards.length);
    } catch (err: unknown) {
      console.error('[HandwrittenNotesUploader] Error:', err);
      const msg = err instanceof Error ? err.message : 'Error al procesar las fotos de apuntes.';
      setErrorMessage(msg);
      setStatus('idle');
    } finally {
      setCompressionProgress(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Inputs ocultos para web */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Estados de Notificación */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {status === 'success' && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs space-y-2 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
          <div className="font-bold text-sm">
            {t('notes_ocr.success_title', '¡Flashcards creadas con éxito!')}
          </div>
          <p>
            {t('notes_ocr.success_desc', 'Se han extraído e insertado {count} tarjetas de tus notas manuscritas.')
              .replace('{count}', String(generatedCount || pages.length))}
          </p>
        </div>
      )}

      {/* Selector de Archivos y Cámara */}
      {status !== 'success' && (
        <>
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              disabled={status !== 'idle' || pages.length >= 10}
              onClick={handleTakePhoto}
              className="w-full sm:flex-1 py-2.5 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]"
            >
              <CameraIcon className="w-4 h-4 text-violet-500" />
              <span>{t('notes_ocr.btn_camera', 'Hacer Foto con Cámara')}</span>
            </button>

            <button
              type="button"
              disabled={status !== 'idle' || pages.length >= 10}
              onClick={handlePickGallery}
              className="w-full sm:flex-1 py-2.5 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]"
            >
              <ImageIcon className="w-4 h-4 text-indigo-500" />
              <span>{t('notes_ocr.btn_gallery', 'Seleccionar de Galería')}</span>
            </button>
          </div>

          {/* Área de Drag & Drop para Escritorio */}
          {pages.length === 0 && (
            <div
              onClick={(e) => {
                e.preventDefault();
                handlePickGallery();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (status !== 'idle') return;
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  addFilesToPages(Array.from(e.dataTransfer.files));
                }
              }}
              className="p-8 sm:p-10 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-800 hover:border-violet-500 dark:hover:border-violet-500 bg-neutral-50/60 dark:bg-neutral-900/40 text-center flex flex-col items-center justify-center space-y-2 cursor-pointer transition"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                {t('notes_ocr.drop_title', 'Sube tus fotos de apuntes, cuadernos o esquemas')}
              </div>
              <p className="text-[11px] text-neutral-500 max-w-sm">
                {t('notes_ocr.drop_subtitle', 'Soporta hasta 10 páginas por tirada. La IA leerá la letra manuscrita, fórmulas y notas en los márgenes.')}
              </p>
            </div>
          )}

          {/* Tira Visual de Previsualización y Reordenación (Thumbnail Strip) */}
          {pages.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                <span>
                  {t('notes_ocr.pages_ordered', 'Páginas de apuntes')} ({pages.length} / 10)
                </span>
                <span className="text-[10px] text-neutral-400 font-normal">
                  {t('notes_ocr.order_hint', 'Usa las flechas para ordenar las páginas')}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="relative rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900/5 dark:bg-neutral-900/60 overflow-hidden group shadow-sm flex flex-col"
                  >
                    {/* Badge de Número de Página */}
                    <div className="absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-white shadow-sm">
                      Pág. {index + 1}
                    </div>

                    {/* Botón Borrar */}
                    <button
                      type="button"
                      disabled={status !== 'idle'}
                      onClick={() => handleDeletePage(index)}
                      className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer"
                      title={t('common.delete', 'Eliminar foto')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    {/* Imagen de Previsualización */}
                    <div className="w-full aspect-[4/3] bg-neutral-200 dark:bg-neutral-950 flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.previewUrl}
                        alt={`Página ${index + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>

                    {/* Controles de Reordenación (Flechas Izquierda / Derecha) */}
                    <div className="p-1 bg-white/95 dark:bg-neutral-900/95 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        disabled={index === 0 || status !== 'idle'}
                        onClick={() => handleMoveLeft(index)}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Mover antes"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] text-neutral-400 font-mono">#{index + 1}</span>
                      <button
                        type="button"
                        disabled={index === pages.length - 1 || status !== 'idle'}
                        onClick={() => handleMoveRight(index)}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Mover después"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Botón para Añadir Más Páginas si no se ha alcanzado el límite */}
                {pages.length < 10 && (
                  <button
                    type="button"
                    disabled={status !== 'idle'}
                    onClick={(e) => {
                      e.preventDefault();
                      handlePickGallery();
                    }}
                    className="aspect-[4/3] rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-800 hover:border-violet-500 flex flex-col items-center justify-center gap-1 text-neutral-400 hover:text-violet-500 transition cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">{t('notes_ocr.add_more', '+ Página')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Opciones de Formato y Cantidad de Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                {t('deck_detail.card_format_label', 'Formato de Tarjeta')}
              </label>
              <select
                disabled={status !== 'idle'}
                value={cardFormat}
                onChange={(e) => setCardFormat(e.target.value as CardFormat)}
                className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 transition cursor-pointer disabled:opacity-50"
              >
                <option value="multiple_choice">{t('deck_detail.format_opt_mc', 'Múltiple opción (Tipo Test)')}</option>
                <option value="basic">{t('deck_detail.format_opt_basic', 'Básica (Pregunta y Respuesta)')}</option>
                <option value="cloze">{t('deck_detail.format_opt_cloze', 'Completar espacios ([...])')}</option>
                <option value="true_false">{t('deck_detail.format_opt_tf', 'Verdadero o Falso')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                {t('deck_detail.card_count_label', 'Cantidad de Tarjetas')}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                disabled={status !== 'idle'}
                value={cardCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    setCardCount(Math.min(30, Math.max(1, val)));
                  }
                }}
                className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 transition disabled:opacity-50"
              />
            </div>
          </div>

          {/* Selector Enfoque de las Preguntas: Teórico vs Práctico */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center">
                <span>{t('ai_uploader.approach_label', isEn ? 'Question approach' : 'Enfoque de las preguntas')}</span>
                <InfoTooltip
                  placement="bottom"
                  title={t('ai_uploader.tooltip_approach_title', isEn ? 'Theoretical vs. Practical Approach' : 'Enfoque Teórico vs. Práctico')}
                  content={
                    <div className="space-y-2 text-[11px] leading-relaxed">
                      <p>
                        <strong className="text-slate-900 dark:text-white block font-semibold mb-0.5">
                          📖 {t('ai_uploader.approach_theoretical', isEn ? 'Theoretical' : 'Teórico')}:
                        </strong>
                        {isEn
                          ? 'Direct concepts, definitions, legal deadlines, and factual recall. Ideal for initial study and memorizing essential data.'
                          : 'Conceptos directos, definiciones, plazos legales y datos concretos. Ideal para primera vuelta y fijar contenidos esenciales.'}
                      </p>
                      <p>
                        <strong className="text-violet-600 dark:text-violet-400 block font-semibold mb-0.5">
                          🎯 {t('ai_uploader.approach_practical', isEn ? 'Practical' : 'Práctico')}:
                        </strong>
                        {isEn
                          ? 'Problem-based learning, clinical patient vignettes, legal cases, and professional decision-making scenarios.'
                          : 'Supuestos prácticos, casos clínicos de pacientes, problemas de derecho y situaciones reales de toma de decisiones.'}
                      </p>
                    </div>
                  }
                />
              </label>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md font-mono text-neutral-500 dark:text-neutral-400">
                {isPracticalMode
                  ? `🎯 ${t('ai_uploader.approach_practical', isEn ? 'Practical' : 'Práctico')}`
                  : `📖 ${t('ai_uploader.approach_theoretical', isEn ? 'Theoretical' : 'Teórico')}`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={status !== 'idle'}
                onClick={() => setIsPracticalMode(false)}
                className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  !isPracticalMode
                    ? 'bg-violet-500/10 border-violet-500 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500 font-bold'
                    : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                } disabled:opacity-50`}
              >
                <span>📖</span>
                <span>{t('ai_uploader.approach_theoretical', isEn ? 'Theoretical' : 'Teórico')}</span>
              </button>

              <button
                type="button"
                disabled={status !== 'idle'}
                onClick={() => setIsPracticalMode(true)}
                className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  isPracticalMode
                    ? 'bg-violet-500/10 border-violet-500 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500 font-bold'
                    : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                } disabled:opacity-50`}
              >
                <span>🎯</span>
                <span>{t('ai_uploader.approach_practical', isEn ? 'Practical' : 'Práctico')}</span>
              </button>
            </div>
          </div>

          {/* Instrucción Específica Opcional */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
              {t('notes_ocr.instruction_label', 'Instrucción de Enfoque (Opcional)')}
            </label>
            <input
              type="text"
              disabled={status !== 'idle'}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={t('notes_ocr.instruction_placeholder', 'Ej: Priorizar las fórmulas y definiciones en cajas')}
              className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition disabled:opacity-50"
            />
          </div>

          {/* Botonera de Acción */}
          <div className="pt-2 flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                disabled={status !== 'idle'}
                onClick={onCancel}
                className="px-4 py-2 text-xs sm:text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
              >
                {t('deck_detail.cancel', 'Cancelar')}
              </button>
            )}

            <button
              type="button"
              disabled={status !== 'idle' || pages.length === 0}
              onClick={handleProcessNotes}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-violet-600/25 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {status === 'compressing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {t('notes_ocr.optimizing_status', 'Optimizando páginas... ({current}/{total})')
                      .replace('{current}', String(compressionProgress?.current || 1))
                      .replace('{total}', String(compressionProgress?.total || pages.length))}
                  </span>
                </>
              ) : status === 'generating' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('notes_ocr.analyzing_status', 'Analizando apuntes con IA...')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>
                    {t('notes_ocr.generate_btn', 'Generar {count} tarjetas').replace('{count}', String(cardCount))}
                  </span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
