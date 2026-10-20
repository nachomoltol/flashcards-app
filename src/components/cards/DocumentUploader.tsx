'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useCardStore, useDeckStore, useProModalStore, useLanguageStore } from '@/stores';
import { generateCardsFromDocumentAction } from '@/app/actions/generateCards';
import { showAdMobRewardedAd } from '@/lib/admob';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import type { CardFormat, GeneratedCard } from '@/types/cards';
import { FormattedCardView } from './FormattedCardView';

interface DocumentUploaderProps {
  deckId: string;
  onSuccess?: (cardsCount: number) => void;
  onCancel?: () => void;
  onSwitchToUrl?: () => void;
  initialMeticulousPhase?: boolean;
  onMeticulousChange?: (val: boolean) => void;
}

type FileTypeCategory = 'pdf' | 'docx' | 'audio' | 'text';

interface FileTypeInfo {
  category: FileTypeCategory;
  label: string;
  badgeBg: string;
  badgeText: string;
  borderCol: string;
  iconBg: string;
  mime: string;
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.mp3', '.wav', '.txt'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB matching Supabase bucket limit

// Helper para identificar la categoría visual del archivo
function getFileTypeInfo(file: File): FileTypeInfo {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  if (ext === '.pdf' || file.type === 'application/pdf') {
    return {
      category: 'pdf',
      label: 'PDF Document',
      badgeBg: 'bg-rose-500/15',
      badgeText: 'text-rose-400',
      borderCol: 'border-rose-500/30',
      iconBg: 'bg-rose-500/20 text-rose-300',
      mime: 'application/pdf',
    };
  }
  if (
    ext === '.docx' ||
    ext === '.doc' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword'
  ) {
    const isLegacy = ext === '.doc' || file.type === 'application/msword';
    return {
      category: 'docx',
      label: isLegacy ? 'Documento Word (.doc)' : 'Documento Word (.docx)',
      badgeBg: 'bg-blue-500/15',
      badgeText: 'text-blue-400',
      borderCol: 'border-blue-500/30',
      iconBg: 'bg-blue-500/20 text-blue-300',
      mime: isLegacy
        ? 'application/msword'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (ext === '.mp3' || ext === '.wav' || file.type.startsWith('audio/')) {
    return {
      category: 'audio',
      label: ext === '.wav' ? 'Audio WAV' : 'Audio MP3',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-400',
      borderCol: 'border-emerald-500/30',
      iconBg: 'bg-emerald-500/20 text-emerald-300',
      mime: ext === '.wav' ? 'audio/wav' : 'audio/mpeg',
    };
  }
  return {
    category: 'text',
    label: 'Texto Plano TXT',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    borderCol: 'border-amber-500/30',
    iconBg: 'bg-amber-500/20 text-amber-300',
    mime: 'text/plain',
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  const isSupportedExt = SUPPORTED_EXTENSIONS.includes(ext);
  const isSupportedMime =
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword' ||
    file.type === 'audio/mpeg' ||
    file.type === 'audio/mp3' ||
    file.type === 'audio/wav' ||
    file.type === 'audio/x-wav' ||
    file.type === 'text/plain';

  if (!isSupportedExt && !isSupportedMime) {
    return `Tipo de archivo no soportado. Formatos admitidos: PDF, Word (.docx, .doc), Audio (.mp3, .wav) y TXT.`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `El archivo supera el límite de 50 MB (tamaño actual: ${formatFileSize(file.size)}).`;
  }

  return null;
}

export function DocumentUploader({
  deckId,
  onSuccess,
  onCancel,
  onSwitchToUrl,
  initialMeticulousPhase,
  onMeticulousChange,
}: DocumentUploaderProps) {
  const { user } = useAuthStore();
  const { cards, createCard, fetchCardsByDeck } = useCardStore();
  const { fetchDeckById } = useDeckStore();
  const { openProModal } = useProModalStore();
  const { language, t } = useLanguageStore();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cardFormat, setCardFormat] = useState<CardFormat>('multiple_choice');
  const [cardCount, setCardCount] = useState<number>(10);
  const [customPrompt, setCustomPrompt] = useState('');
  const [pageStart, setPageStart] = useState<string>('');
  const [pageEnd, setPageEnd] = useState<string>('');
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null);
  
  // Status flow: idle -> uploading -> analyzing -> saving -> success | error
  const [status, setStatus] = useState<
    'idle' | 'uploading' | 'analyzing' | 'saving' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [coreExhausted, setCoreExhausted] = useState<boolean>(false);
  const [isMeticulousPhase, setIsMeticulousPhase] = useState<boolean>(
    () => Boolean(initialMeticulousPhase)
  );
  const [generatedCardsPreview, setGeneratedCardsPreview] = useState<GeneratedCard[]>([]);
  const [materialExhaustedNotice, setMaterialExhaustedNotice] = useState<{ generated: number; requested: number } | null>(null);

  // Sincronizar fase minuciosa si viene activa por prop
  useEffect(() => {
    if (initialMeticulousPhase) {
      setIsMeticulousPhase(true);
    }
  }, [initialMeticulousPhase]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = useCallback(async (file: File) => {
    setErrorMessage(null);
    setPdfTotalPages(null);
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      return;
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (isPdf) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pagesCount = doc.getPageCount();
        setPdfTotalPages(pagesCount);
      } catch (pdfErr) {
        console.warn('No se pudo determinar el número total de páginas del PDF:', pdfErr);
      }
    }

    setSelectedFile(file);
    setStatus('idle');
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFileSelection(droppedFiles[0]);
    }
  }, [handleFileSelection]);

  // Upload to Supabase Storage and process with Gemini Flash
  const handleProcessDocument = async () => {
    if (!selectedFile) return;

    if (!user) {
      setErrorMessage('Debes haber iniciado sesión para subir documentos a Supabase Storage.');
      return;
    }

    const isPdf =
      selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf';

    // FASE 2: Validación estricta del rango de páginas para PDFs (anti-desbordamiento y control de costes)
    if (isPdf) {
      const parsedStart = pageStart.trim() ? parseInt(pageStart.trim(), 10) : undefined;
      const parsedEnd = pageEnd.trim() ? parseInt(pageEnd.trim(), 10) : undefined;

      // 1. Si el PDF cargado tiene más de 30 páginas totales, los campos "Desde página" y "Hasta página" se vuelven estrictamente OBLIGATORIOS
      if (pdfTotalPages !== null && pdfTotalPages > 30) {
        if (!parsedStart || !parsedEnd) {
          setErrorMessage(
            `El PDF cargado tiene ${pdfTotalPages} páginas (más de 30). Los campos "Desde página" y "Hasta página" son estrictamente OBLIGATORIOS.`
          );
          return;
        }
      }

      // 2. Validación del rango si se especificó (o si era obligatorio): máximo 40 páginas
      if (parsedStart !== undefined || parsedEnd !== undefined) {
        if (!parsedStart || !parsedEnd) {
          setErrorMessage('Debes especificar tanto "Desde página" como "Hasta página" para delimitar el bloque.');
          return;
        }
        if (parsedStart < 1 || parsedEnd < 1) {
          setErrorMessage('Las páginas deben ser números positivos mayores o iguales a 1.');
          return;
        }
        if (parsedEnd < parsedStart) {
          setErrorMessage('La página final ("Hasta página") no puede ser menor que la inicial ("Desde página").');
          return;
        }
        const span = parsedEnd - parsedStart + 1;
        if (span > 40) {
          setErrorMessage(
            `El rango de páginas seleccionado (${span} páginas: de la ${parsedStart} a la ${parsedEnd}) supera el límite máximo permitido de 40 páginas por petición.`
          );
          return;
        }
        if (pdfTotalPages !== null && parsedEnd > pdfTotalPages) {
          setErrorMessage(
            `La página final (${parsedEnd}) supera el total de páginas del PDF (${pdfTotalPages}).`
          );
          return;
        }
      }
    }

    try {
      setErrorMessage(null);
      setStatus('uploading');

      // 1. Subir archivo al bucket 'user-documents' bajo la carpeta del usuario según RLS
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = Date.now();
      const storagePath = `${user.id}/${timestamp}-${sanitizedName}`;

      // Resolver MIME type exacto para la subida a Supabase
      const fileInfo = getFileTypeInfo(selectedFile);
      let uploadContentType = selectedFile.type;
      const fileExt = '.' + (selectedFile.name.split('.').pop()?.toLowerCase() || '');
      if (fileExt === '.docx') {
        uploadContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (fileExt === '.doc') {
        uploadContentType = 'application/msword';
      } else if (!uploadContentType) {
        uploadContentType = fileInfo.mime || 'application/octet-stream';
      }

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(storagePath, selectedFile, {
          contentType: uploadContentType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Error al subir a Supabase Storage: ${uploadError.message}`);
      }

      // 2. Crear URL firmada temporal (5 minutos) para lectura segura
      const { data: signedData, error: signedError } = await supabase.storage
        .from('user-documents')
        .createSignedUrl(storagePath, 300);

      const signedUrl = signedData?.signedUrl;
      if (signedError) {
        console.warn('Advertencia al generar signedUrl, se utilizará fallback de descarga:', signedError);
      }

      // 3. Procesar archivo con Gemini 3.8 Flash nativo multimodal con el formato elegido
      setStatus('analyzing');

      const existingFronts = cards && cards.length > 0 ? cards.map((c) => c.front) : [];

      let result: Awaited<ReturnType<typeof generateCardsFromDocumentAction>>;
      try {
        result = await generateCardsFromDocumentAction({
          deckId,
          userId: user?.id,
          storagePath,
          signedUrl,
          mimeType: fileInfo.mime,
          fileName: selectedFile.name,
          customPrompt: customPrompt.trim() || undefined,
          focusInstruction: customPrompt.trim() || undefined,
          cardFormat,
          cardCount,
          existingQuestions: existingFronts,
          pageStart: pageStart ? parseInt(pageStart, 10) : undefined,
          pageEnd: pageEnd ? parseInt(pageEnd, 10) : undefined,
          language,
        });
      } catch (actionErr: unknown) {
        const actionErrMsg =
          actionErr instanceof Error
            ? actionErr.message
            : 'Error de comunicación al procesar el documento con la IA.';
        console.error('Error invocando generateCardsFromDocumentAction:', actionErr);
        setErrorMessage(
          `No se pudo completar la generación: ${actionErrMsg}. Si el documento es muy denso o extenso, prueba a solicitar menos tarjetas (ej. 10).`
        );
        setStatus('idle');
        return;
      }

      // Validar resultado de la IA sin lanzar errores fatales (throw new Error)
      if (!result.success || !result.cards || result.cards.length === 0) {
        if (result.error === 'LIMIT_REACHED') {
          setStatus('idle');
          openProModal(true);
          return;
        }

        if (result.error === 'AD_REQUIRED') {
          try {
            const adResult = await showAdMobRewardedAd();
            if (adResult.completed) {
              const claim = await claimAdRewardAction(user?.id);
              if (claim.success) {
                // Reintentar automáticamente la generación de forma fluida tras completar el anuncio
                return handleProcessDocument();
              } else {
                setErrorMessage(claim.message || (language === 'en' ? 'Could not claim ad reward.' : 'No se pudo reclamar la recompensa del anuncio.'));
              }
            } else if (adResult.error) {
              setErrorMessage(adResult.error);
            }
          } catch (adErr) {
            console.warn('Error en flujo de anuncio bonificado:', adErr);
            setErrorMessage(language === 'en' ? 'Unexpected error during ad viewing.' : 'Error inesperado durante el anuncio.');
          }
          setStatus('idle');
          return;
        }

        setStatus('idle');
        const errorDetail =
          result.error ||
          `El documento es demasiado denso para generar ${cardCount} tarjetas en este lote. Por favor, intenta generar una cantidad menor (ej. 10 tarjetas) para evitar sobrecargar la respuesta.`;
        setErrorMessage(errorDetail);
        return;
      }

      // 4. Guardar las tarjetas generadas en Supabase mediante el store de Zustand
      setStatus('saving');
      const generatedCards = result.cards;
      setGeneratedCardsPreview(generatedCards);

      for (const card of generatedCards) {
        await createCard(
          deckId,
          card.front,
          card.back,
          card.cardFormat === 'cloze' ? 'cloze' : 'basic',
          card.cardFormat
        );
      }

      // Sincronizar datos del mazo en local
      await fetchCardsByDeck(deckId);
      await fetchDeckById(deckId);

      // FASE 2: Notificación si el texto se agotó antes de alcanzar el tope solicitado
      if (generatedCards.length < cardCount) {
        setMaterialExhaustedNotice({
          generated: generatedCards.length,
          requested: cardCount,
        });
      } else {
        setMaterialExhaustedNotice(null);
      }

      // Rigor en advertencias: Solo cuando la lista troncal se vacíe matemáticamente o el material se agote por completo
      const isExhausted =
        Boolean(result.core_exhausted) ||
        (generatedCards.length < cardCount && generatedCards.length > 0);

      if (isExhausted) {
        setIsMeticulousPhase(true);
        if (onMeticulousChange) {
          onMeticulousChange(true);
        }
      }
      setCoreExhausted(isExhausted);
      setSuccessCount(generatedCards.length);
      setStatus('success');

      if (onSuccess) {
        onSuccess(generatedCards.length);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado durante el procesamiento multimodal';
      console.error('Error in handleProcessDocument:', err);
      setErrorMessage(msg);
      setStatus('idle');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPdfTotalPages(null);
    setPageStart('');
    setPageEnd('');
    setStatus('idle');
    setErrorMessage(null);
    setGeneratedCardsPreview([]);
    // Conservar isMeticulousPhase fijo una vez alcanzada la fase minuciosa o material agotado
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isBusy = status === 'uploading' || status === 'analyzing' || status === 'saving';

  return (
    <div className="w-full space-y-5">
      {/* Error Banner Amigable con Botón de Reintento Rápido */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex flex-col sm:flex-row items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <strong className="font-semibold block text-rose-200 mb-0.5">Aviso de Generación:</strong>
              {errorMessage}
            </div>
          </div>
          {cardCount > 10 && (
            <button
              type="button"
              onClick={() => {
                setCardCount(10);
                setErrorMessage(null);
              }}
              className="shrink-0 self-end sm:self-center px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-xs font-medium transition active:scale-95 flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>Ajustar a 10 tarjetas</span>
            </button>
          )}
        </div>
      )}

      {/* Success View */}
      {status === 'success' ? (
        <div className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 text-center space-y-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-900/30">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('ai_uploader.success_title', '¡{count} Tarjetas Generadas y Guardadas!').replace('{count}', String(successCount))}
            </h3>

            {/* FASE 2: Notificación si el texto no contenía más conceptos únicos */}
            {materialExhaustedNotice && (
              <div className="mt-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs text-left flex items-start gap-2.5 max-w-md mx-auto shadow-md animate-in fade-in">
                <span className="text-base shrink-0">⚠️</span>
                <p className="leading-relaxed font-medium">
                  {t(
                    'deck_detail.material_exhausted',
                    'Material agotado: Se han generado {count} tarjetas. El texto no contenía más conceptos únicos para alcanzar las {requested} solicitadas.'
                  )
                    .replace('{count}', String(materialExhaustedNotice.generated))
                    .replace('{requested}', String(materialExhaustedNotice.requested))}
                </p>
              </div>
            )}

            {/* Banner de Feedback de Continuidad / Radar de Profundidad */}
            {(isMeticulousPhase || coreExhausted) ? (
              <div className="mt-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs text-left flex items-start gap-2.5 max-w-md mx-auto shadow-sm">
                <span className="text-base shrink-0">🎯</span>
                <p className="leading-relaxed">
                  <strong className="font-semibold text-amber-300">{t('deck_detail.theory_covered_title', 'Teoría principal cubierta.')}</strong> {t('deck_detail.theory_covered_desc', 'Se han extraído los conceptos troncales. Si continúas generando, la IA rebuscará detalles minuciosos, datos estadísticos y excepciones del texto para un estudio de máxima profundidad.')}
                </p>
              </div>
            ) : (
              <div className="mt-3 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs text-left flex items-start gap-2.5 max-w-md mx-auto shadow-sm">
                <span className="text-base shrink-0">✅</span>
                <p className="leading-relaxed">
                  <strong className="font-semibold text-emerald-300">{t('deck_detail.cards_added_title', 'Tarjetas añadidas con éxito.')}</strong> {t('deck_detail.cards_added_desc', '¿El temario es largo? Dale a generar de nuevo para extraer el siguiente bloque de conocimientos.')}
                </p>
              </div>
            )}

            <p className="text-[11px] text-neutral-400 mt-2 max-w-sm mx-auto">
              {t('ai_uploader.document_label', 'Documento:')} &ldquo;{selectedFile?.name}&rdquo; ({cardFormat}) • {t('ai_uploader.anti_duplicate_active', 'Memoria Anti-Duplicados activa para los siguientes bloques.')}
            </p>
          </div>

          {/* Cards Preview with FormattedCardView */}
          <div className="max-h-56 overflow-y-auto space-y-3 text-left pr-1">
            {generatedCardsPreview.map((card, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs shadow-sm"
              >
                <FormattedCardView
                  front={card.front}
                  back={card.back}
                  cardFormat={card.cardFormat}
                  isRevealed={true}
                  interactive={false}
                />
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => {
                setStatus('idle');
                handleProcessDocument();
              }}
              className={`px-4 py-2.5 text-xs rounded-xl ${
                isMeticulousPhase
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-600/30'
                  : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/30'
              } text-white font-medium shadow-md transition flex items-center gap-1.5 active:scale-95`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>
                {isMeticulousPhase
                  ? t('ai_uploader.next_block_meticulous_btn', 'Generar tarjetas detalladas ({count})').replace('{count}', String(cardCount))
                  : t('ai_uploader.next_block_btn', 'Generar siguiente bloque ({count} tarjetas)').replace('{count}', String(cardCount))}
              </span>
            </button>
            <button
              onClick={handleReset}
              className="px-3.5 py-2.5 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 dark:hover:text-white font-medium transition cursor-pointer"
            >
              {t('ai_uploader.process_another_btn', 'Procesar otro documento')}
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-3.5 py-2.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium transition cursor-pointer"
              >
                {t('ai_uploader.close_btn', 'Cerrar ventana')}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Dropzone & File Selection Area */
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,text/plain"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
              }
            }}
          />

          {/* 1. Zona de Carga (Dropzone o Archivo Seleccionado) - POR ENCIMA de Formato y Cantidad */}
          {!selectedFile ? (
            /* Drag and drop zone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all duration-200 group ${
                isDragging
                  ? 'border-violet-500 bg-violet-600/10 scale-[1.01] shadow-xl shadow-violet-900/20'
                  : 'border-neutral-300 dark:border-neutral-800 hover:border-violet-500/60 bg-neutral-50/70 dark:bg-neutral-950/60 hover:bg-neutral-100/80 dark:hover:bg-neutral-900/40'
              }`}
            >
              {/* Background Glow */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-violet-600/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10 flex flex-col items-center justify-center space-y-3">
                <div
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 shadow-sm ${
                    isDragging
                      ? 'bg-violet-600 text-white shadow-violet-600/30'
                      : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-violet-600 dark:text-violet-400 group-hover:text-violet-500 group-hover:border-violet-500/40'
                  }`}
                >
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                    {t('ai_uploader.drag_drop_title', 'Arrastra y suelta tu archivo aquí')}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {t('ai_uploader.drag_drop_subtitle', 'o haz clic para explorar en tu dispositivo')}
                  </p>
                </div>

                {/* Formats Pills */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 sm:pt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300">
                    PDF (.pdf)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-700 dark:text-blue-300">
                    Word (.docx, .doc)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
                    Audio (.mp3, .wav)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300">
                    Texto (.txt)
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-neutral-500 block">
                    {t('ai_uploader.max_file_size', 'Tamaño máximo por archivo: 50 MB • Almacenamiento privado seguro con Supabase RLS')}
                  </span>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300/95 font-medium flex items-center justify-center gap-1.5">
                    <span>💡</span>
                    <span>
                      {t('ai_uploader.video_hint', 'Para vídeos o clases grabadas,')}{' '}
                      {onSwitchToUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwitchToUrl();
                          }}
                          className="underline hover:text-amber-900 dark:hover:text-amber-100 font-semibold transition cursor-pointer"
                        >
                          {t('ai_uploader.video_hint_link', 'pega el enlace web')}
                        </button>
                      ) : (
                        t('ai_uploader.video_hint_link', 'pega el enlace web')
                      )}{' '}
                      {t('ai_uploader.video_hint_audio', 'o sube el archivo de audio en .mp3')}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Selected File Card */
            <div>
              {(() => {
                const info = getFileTypeInfo(selectedFile);
                return (
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/80 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${info.borderCol} ${info.iconBg}`}
                        >
                          {info.category === 'pdf' && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          )}
                          {info.category === 'docx' && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                          {info.category === 'audio' && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          )}
                          {info.category === 'text' && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white truncate" title={selectedFile.name}>
                            {selectedFile.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[10px] font-mono px-2 py-0.2 rounded ${info.badgeBg} ${info.badgeText} border ${info.borderCol}`}
                            >
                              {info.label}
                            </span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                              {pdfTotalPages !== null ? `${pdfTotalPages} págs • ` : ''}
                              {formatFileSize(selectedFile.size)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!isBusy && (
                        <button
                          type="button"
                          onClick={handleReset}
                          title="Cambiar archivo"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Progress Indicator */}
                    {isBusy && (
                      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-800 dark:text-neutral-300 font-medium flex items-center gap-2">
                            <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            {status === 'uploading' && t('ai_uploader.status_uploading', '1/3 Subiendo archivo a Supabase Storage...')}
                            {status === 'analyzing' && t('ai_uploader.status_analyzing', '2/3 Gemini Flash generando {count} tarjetas ({format})...').replace('{count}', String(cardCount)).replace('{format}', cardFormat)}
                            {status === 'saving' && t('ai_uploader.status_saving', '3/3 Guardando tarjetas generadas en Supabase...')}
                          </span>
                          <span className="text-[11px] text-violet-600 dark:text-violet-400 font-mono uppercase">
                            {status === 'uploading' && 'Storage'}
                            {status === 'analyzing' && 'Gemini Flash'}
                            {status === 'saving' && 'Zustand / DB'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 transition-all duration-500 ${
                              status === 'uploading'
                                ? 'w-1/3'
                                : status === 'analyzing'
                                ? 'w-2/3'
                                : 'w-full'
                            }`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 2. Selectores: Formato y Cantidad de Tarjetas (Situados debajo de la zona de subida) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Card Format Selector Dropdown */}
            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                  {t('ai_uploader.card_format_label', 'Formato de Tarjetas')}
                </span>
                <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 uppercase">{cardFormat}</span>
              </label>

              <div className="relative">
                <select
                  disabled={isBusy}
                  value={cardFormat}
                  onChange={(e) => setCardFormat(e.target.value as CardFormat)}
                  className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition appearance-none cursor-pointer disabled:opacity-50 pr-10"
                >
                  <option value="basic">🃏 {t('card_editor.format_basic', 'Básica')} — {t('url_generator.format_basic_desc', 'Pregunta directa y respuesta concisa')}</option>
                  <option value="multiple_choice">📝 {t('card_editor.format_test', 'Opción Múltiple')} — {t('url_generator.format_mc_desc', 'Pregunta test con 4 alternativas y solución')}</option>
                  <option value="cloze">🧩 {t('card_editor.format_cloze', 'Cloze')} — {t('url_generator.format_cloze_desc', 'Completar conceptos clave entre corchetes')}</option>
                  <option value="true_false">⚖️ {t('card_editor.format_tf', 'Verdadero o Falso')}</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                {cardFormat === 'basic' && (language === 'en' ? 'Direct questions with rigorous answers.' : 'Preguntas directas con respuestas rigurosas.')}
                {cardFormat === 'multiple_choice' && (language === 'en' ? 'Quiz questions with 4 plausible options.' : 'Preguntas test con 4 opciones plausibles.')}
                {cardFormat === 'cloze' && (language === 'en' ? 'Hide key concepts with [...].' : 'Oculta conceptos clave con [...].')}
                {cardFormat === 'true_false' && (language === 'en' ? 'Statements with strict justifications.' : 'Afirmaciones con justificación estricta.')}
              </p>
            </div>

            {/* Card Count Numeric Input con Límite Seguro y Hint Educativo */}
            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
              <label htmlFor="cardCount" className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {t('ai_uploader.card_count_label', 'Cantidad de Tarjetas')}
                </span>
                <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 font-bold">{cardCount} / 30 MÁX</span>
              </label>

              <div className="relative">
                <input
                  id="cardCount"
                  name="cardCount"
                  type="number"
                  min={1}
                  max={30}
                  disabled={isBusy}
                  value={cardCount}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    if (rawVal === '') {
                      setCardCount(1);
                      return;
                    }
                    const val = parseInt(rawVal, 10);
                    if (!isNaN(val)) {
                      setCardCount(Math.min(30, Math.max(1, val)));
                    }
                  }}
                  className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                  placeholder="1 a 30 tarjetas"
                />
              </div>

              {/* Mensaje de ayuda visualmente atractivo o banner de fase minuciosa si ya está activa */}
              {isMeticulousPhase ? (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                  <span className="text-base shrink-0">🎯</span>
                  <div className="flex-1">
                    <p className="leading-relaxed">
                      <strong className="font-semibold text-amber-700 dark:text-amber-300">
                        {t('deck_detail.theory_covered_title', 'Teoría principal cubierta.')}
                      </strong>{' '}
                      {t(
                        'deck_detail.theory_covered_desc',
                        'Se han extraído los conceptos troncales. Si continúas generando, la IA rebuscará detalles minuciosos, datos estadísticos y excepciones del texto para un estudio de máxima profundidad.'
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-[11px] text-violet-800 dark:text-violet-200/90 flex items-start gap-2 leading-relaxed">
                  <span className="shrink-0 text-sm">💡</span>
                  <span>
                    {t(
                      'deck_detail.batch_hint',
                      'Generamos por lotes para evitar saturación. Puedes pedir varios lotes seguidos del mismo documento: nuestra IA analiza tu mazo y extraerá conceptos 100% nuevos sin repetir preguntas anteriores.'
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Instrucción adicional y Botones de Acción (visibles cuando hay un archivo cargado) */}
          {selectedFile && (
            <div className="space-y-4 pt-1">
              {/* Chunking de Precisión para PDFs (Rango de Páginas) */}
              {(selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf') && (
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span>Chunking de Precisión (Rango de Páginas PDF)</span>
                    </label>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      {pdfTotalPages !== null ? `${pdfTotalPages} págs totales` : 'Aislamiento estricto'}
                    </span>
                  </div>

                  {pdfTotalPages !== null && pdfTotalPages > 30 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                      <span className="shrink-0 text-sm">⚠️</span>
                      <p className="leading-relaxed">
                        <strong>PDF Extenso ({pdfTotalPages} páginas totales):</strong> Al superar las 30 páginas, y para asegurar la rigurosidad del mazo, los campos <strong>&quot;Desde página&quot;</strong> y <strong>&quot;Hasta página&quot;</strong> son estrictamente obligatorios (máximo 40 páginas por petición).
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                        Desde página: {pdfTotalPages !== null && pdfTotalPages > 30 && <span className="text-rose-500 font-bold">* (Obligatorio)</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={pdfTotalPages || undefined}
                        disabled={isBusy}
                        value={pageStart}
                        onChange={(e) => setPageStart(e.target.value)}
                        placeholder="ej. 1"
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                        Hasta página: {pdfTotalPages !== null && pdfTotalPages > 30 && <span className="text-rose-500 font-bold">* (Obligatorio)</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={pdfTotalPages || undefined}
                        disabled={isBusy}
                        value={pageEnd}
                        onChange={(e) => setPageEnd(e.target.value)}
                        placeholder={pdfTotalPages ? (pdfTotalPages > 40 ? 'ej. 40' : `ej. ${pdfTotalPages}`) : 'ej. 15'}
                        className="w-full text-xs font-medium px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Aísla de 1 a 40 páginas por lote antes de enviarlas a Gemini. Procesa directamente tablas, gráficos y recuadros de forma multimodal.
                  </p>
                </div>
              )}

              {/* Enfoque temático - High-visibility callout box */}
              <div className="relative p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-violet-500/5 to-indigo-500/10 dark:from-purple-950/40 dark:via-violet-950/30 dark:to-indigo-950/40 border border-purple-300 dark:border-purple-500/40 ring-2 ring-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.25)] transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                    <span>
                      {t(
                        'ai_uploader.custom_prompt_label',
                        '🎯 Enfoque temático (Opcional - Aplica solo al rango seleccionado)'
                      )}
                    </span>
                  </label>
                </div>
                <textarea
                  rows={3}
                  disabled={isBusy}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={t(
                    'ai_uploader.custom_prompt_placeholder',
                    'Centra la información que buscas para tu mazo, escribe por ejemplo: Extrae las preguntas EXCLUSIVAMENTE de los datos de las TABLAS, los cuadros estadísticos y las imágenes. Ignora el texto de los párrafos normales.'
                  )}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-purple-200 dark:border-purple-600/50 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ring-1 ring-purple-400/40 dark:ring-purple-500/40 shadow-inner transition disabled:opacity-50 resize-none"
                />
                <p className="text-[11px] text-purple-800 dark:text-purple-300/90 mt-1.5 leading-relaxed font-medium">
                  {t(
                    'ai_uploader.custom_prompt_help',
                    'Usa este campo para guiar a la IA y filtrar la información EXCLUSIVAMENTE dentro de las páginas que has recortado arriba.'
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {onCancel && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onCancel}
                    className="px-4 py-2 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
                  >
                    {t('common.cancel', 'Cancelar')}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy || !selectedFile}
                  onClick={handleProcessDocument}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl ${
                    isMeticulousPhase
                      ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-600/25'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/25'
                  } disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg active:scale-95 cursor-pointer`}
                >
                  {isBusy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      <span>{t('ai_uploader.processing_file', 'Procesando archivo...')}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>
                        {isMeticulousPhase
                          ? t('ai_uploader.process_file_meticulous', 'Generar tarjetas detalladas (hasta {count})').replace('{count}', String(cardCount))
                          : t('ai_uploader.process_file', 'Generar hasta {count} tarjetas').replace('{count}', String(cardCount))}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
