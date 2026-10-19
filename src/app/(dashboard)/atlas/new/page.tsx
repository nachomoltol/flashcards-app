'use client';

import React, { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAtlasStore, useLanguageStore, type AtlasBox } from '@/stores';
import {
  Map,
  ArrowLeft,
  Upload,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  RotateCcw,
  MousePointerClick,
  Info,
} from 'lucide-react';

interface DrawingCoords {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function NewAtlasPage() {
  const router = useRouter();
  const { t } = useLanguageStore();
  const { createAtlasItem } = useAtlasStore();

  // Estados del Atlas
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<AtlasBox[]>([]);

  // Estados de carga e interfaz
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Estado del trazado de oclusión actual
  const [drawing, setDrawing] = useState<DrawingCoords | null>(null);

  // Referencias de elementos DOM
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);

  // Subir imagen base al bucket 'atlas-images' de Supabase
  const handleUploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError(
        t('study.invalid_image_type', 'Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP o GIF).')
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError(t('study.image_too_large', 'La imagen no puede superar los 10MB.'));
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const userId = user?.id || 'anon';
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('atlas-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('atlas-images').getPublicUrl(filePath);

      setImageUrl(publicUrl);
      setBoxes([]); // Resetear cajas anteriores al cambiar de imagen
      setErrorMessage(null);
    } catch (err: unknown) {
      console.error('Error subiendo imagen base de Atlas:', err);
      setUploadError(
        t('atlas.image_upload_error', 'Error al subir la imagen a Supabase Storage. Inténtalo de nuevo.')
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  // Eliminar imagen actual
  const handleRemoveImage = async () => {
    if (!imageUrl) return;
    try {
      const parts = imageUrl.split('/atlas-images/');
      if (parts.length > 1) {
        const pathInBucket = decodeURIComponent(parts[1]);
        await supabase.storage.from('atlas-images').remove([pathInBucket]);
      }
    } catch (err) {
      console.warn('Advertencia al remover imagen de atlas-images:', err);
    }
    setImageUrl(null);
    setBoxes([]);
  };

  // Helper para convertir coordenadas del puntero a porcentajes relativos (%) al contenedor de imagen
  const getRelativePercentages = useCallback((clientX: number, clientY: number) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }, []);

  // Evento PointerDown: Iniciar dibujo de caja
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Si se hizo clic en un botón interno (como la X de borrar), no iniciar dibujo
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    const { x, y } = getRelativePercentages(e.clientX, e.clientY);
    setDrawing({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignorar si el navegador no admite capture en ese contexto
    }
  };

  // Evento PointerMove: Actualizar rectángulo visual
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const { x, y } = getRelativePercentages(e.clientX, e.clientY);
    setDrawing((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
  };

  // Evento PointerUp: Finalizar y registrar la caja en porcentajes
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignorar
    }

    const normX = Math.min(drawing.startX, drawing.currentX);
    const normY = Math.min(drawing.startY, drawing.currentY);
    const normWidth = Math.abs(drawing.currentX - drawing.startX);
    const normHeight = Math.abs(drawing.currentY - drawing.startY);

    // Descartar clics accidentales sin arrastre (menos del 1% del lienzo)
    if (normWidth >= 1.2 && normHeight >= 1.2) {
      const newBox: AtlasBox = {
        id: `box-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        x: Number(normX.toFixed(2)),
        y: Number(normY.toFixed(2)),
        width: Number(normWidth.toFixed(2)),
        height: Number(normHeight.toFixed(2)),
        label: `${boxes.length + 1}`,
      };
      setBoxes((prev) => [...prev, newBox]);
      setErrorMessage(null);
    }

    setDrawing(null);
  };

  const handlePointerCancel = () => {
    setDrawing(null);
  };

  // Eliminar una caja puntual
  const handleDeleteBox = (boxId: string) => {
    setBoxes((prev) => {
      const filtered = prev.filter((b) => b.id !== boxId);
      // Renumerar etiquetas correlativamente
      return filtered.map((b, idx) => ({ ...b, label: `${idx + 1}` }));
    });
  };

  // Limpiar todas las cajas
  const handleClearAllBoxes = () => {
    if (boxes.length === 0) return;
    if (window.confirm('¿Deseas eliminar todas las oclusiones dibujadas?')) {
      setBoxes([]);
    }
  };

  // Guardar en Supabase a través del store aislado `useAtlasStore`
  const handleSaveAtlas = async () => {
    if (!title.trim()) {
      setErrorMessage(t('atlas.error_no_title', 'Por favor escribe un título para el Atlas.'));
      return;
    }

    if (!imageUrl) {
      setErrorMessage(t('atlas.error_no_image', 'Por favor sube una imagen base para el Atlas.'));
      return;
    }

    if (boxes.length === 0) {
      setErrorMessage(t('atlas.error_no_boxes', 'Por favor dibuja al menos una caja de oclusión sobre la imagen.'));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const created = await createAtlasItem({
        title: title.trim(),
        image_url: imageUrl,
        boxes,
      });

      if (!created) {
        throw new Error('No se pudo guardar el registro en Supabase.');
      }

      setSuccessToast(t('atlas.toast_saved_success', '¡Atlas Visual guardado con éxito!'));

      // Redirigir al panel principal tras confirmación visual
      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: unknown) {
      console.error('Error guardando Atlas Visual:', err);
      const msg = err instanceof Error ? err.message : 'Error al guardar Atlas Visual';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12">
      {/* Toast Flotante de Éxito */}
      {successToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-medium text-sm shadow-2xl shadow-emerald-950/40 border border-emerald-400/30">
            <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            <span>{successToast}</span>
          </div>
        </div>
      )}

      {/* Header y Navegación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition active:scale-95"
            title={t('atlas.back_to_dashboard', 'Volver al panel principal')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🗺️</span>
              <h1 className="text-lg sm:text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
                {t('atlas.title_new', 'Nuevo Atlas Visual')}
              </h1>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('atlas.desc_new', 'Crea oclusiones de imágenes y esquemas anatómicos para estudiar visualmente.')}
            </p>
          </div>
        </div>

        {/* Botón Principal Guardar */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isSaving || isUploading || !imageUrl}
            onClick={handleSaveAtlas}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>{t('atlas.saving_atlas', 'Guardando...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('atlas.save_atlas_btn', 'Guardar Atlas Visual')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner de Mensaje de Error */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Formulario de Configuración Inicial: Título */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 sm:p-5 shadow-sm space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
          {t('atlas.title_input_label', 'Título del Atlas')} <span className="text-emerald-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          disabled={isSaving}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('atlas.title_input_placeholder', 'ej. Anatomía del Corazón, Mapa de Europa...')}
          className="w-full text-sm px-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner"
        />
      </div>

      {/* Área de Subida de Imagen (si aún no se ha subido) */}
      {!imageUrl ? (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={isUploading}
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center flex flex-col items-center justify-center space-y-4 transition-all cursor-pointer ${
              isDraggingFile
                ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:border-emerald-500/50 hover:bg-neutral-50 dark:hover:bg-neutral-900/80 shadow-sm'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
              {isUploading ? (
                <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
              ) : (
                <Upload className="w-7 h-7" />
              )}
            </div>

            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {isUploading
                  ? t('atlas.uploading_image', 'Subiendo imagen a Supabase...')
                  : t('atlas.upload_drop_hint', 'Arrastra y suelta tu imagen aquí o haz clic para seleccionarla')}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {t('atlas.upload_formats_hint', 'Formatos admitidos: PNG, JPG, WebP o GIF (máx. 10MB)')}
              </p>
            </div>

            <button
              type="button"
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition active:scale-95"
            >
              <ImageIcon className="w-4 h-4" />
              <span>{t('atlas.upload_image_label', 'Seleccionar imagen base')}</span>
            </button>
          </div>

          {uploadError && (
            <p className="text-xs text-rose-500 dark:text-rose-400 text-center">{uploadError}</p>
          )}
        </div>
      ) : (
        /* Lienzo de Oclusión y Controles Activos */
        <div className="space-y-4">
          {/* Barra de Herramientas del Lienzo */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                {boxes.length}
              </span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {boxes.length === 1
                  ? '1 oclusión creada'
                  : t('atlas.boxes_count', '{count} oclusiones creadas').replace('{count}', String(boxes.length))}
              </span>
              <span className="hidden sm:inline text-neutral-400">|</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <MousePointerClick className="w-3.5 h-3.5 text-emerald-500" />
                {t('atlas.drawing_instructions', 'Haz clic y arrastra sobre la imagen para crear cajas de oclusión.')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {boxes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllBoxes}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition cursor-pointer text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('atlas.clear_all_boxes', 'Borrar todas')}</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
                disabled={isUploading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 transition cursor-pointer text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
                <span>{t('atlas.change_image', 'Cambiar imagen')}</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer"
                title={t('atlas.remove_image', 'Eliminar imagen')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Contenedor del Lienzo Interactivo (Responsivo al 100% en Porcentajes) */}
          <div className="w-full flex justify-center items-center py-2 overflow-hidden">
            <div
              ref={imageContainerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{ touchAction: 'none' }}
              className="relative max-w-full rounded-2xl overflow-hidden border-2 border-neutral-300 dark:border-neutral-800 bg-neutral-950 shadow-2xl select-none cursor-crosshair inline-block group"
            >
              {/* Imagen base */}
              <img
                ref={imageElementRef}
                src={imageUrl}
                alt={title || 'Atlas'}
                draggable={false}
                className="block max-h-[66vh] w-auto max-w-full object-contain pointer-events-none select-none rounded-2xl"
              />

              {/* Cajas de oclusión guardadas */}
              {boxes.map((box, index) => (
                <div
                  key={box.id}
                  className="absolute border-2 border-amber-400 bg-neutral-900/90 dark:bg-black/90 text-white rounded-md shadow-lg flex items-center justify-center select-none group/box transition-all"
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  {/* Número o etiqueta de la oclusión */}
                  <span className="text-[10px] sm:text-xs font-bold text-amber-300 font-mono select-none pointer-events-none drop-shadow-sm px-1 truncate">
                    {box.label || index + 1}
                  </span>

                  {/* Botón (X) para eliminar la caja */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBox(box.id);
                    }}
                    className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md transition active:scale-90 cursor-pointer z-20 group-hover/box:scale-110"
                    title="Eliminar oclusión"
                  >
                    <X className="w-3 h-3 stroke-[3]" />
                  </button>
                </div>
              ))}

              {/* Caja de previsualización activa mientras el usuario arrastra */}
              {drawing && (
                <div
                  className="absolute border-2 border-dashed border-emerald-400 bg-emerald-500/25 pointer-events-none rounded-md transition-none shadow-sm z-30"
                  style={{
                    left: `${Math.min(drawing.startX, drawing.currentX)}%`,
                    top: `${Math.min(drawing.startY, drawing.currentY)}%`,
                    width: `${Math.abs(drawing.currentX - drawing.startX)}%`,
                    height: `${Math.abs(drawing.currentY - drawing.startY)}%`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Guía de ayuda inferior */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800/80 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              {t(
                'atlas.info_responsive_note',
                'Las oclusiones se calculan en proporciones relativas (%), adaptándose de forma idéntica a pantallas de escritorio, tablets y móviles.'
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
