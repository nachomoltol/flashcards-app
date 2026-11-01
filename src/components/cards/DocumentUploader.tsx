'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { parseDocxIntoVirtualPages } from '@/lib/docxPagination';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useCardStore, useDeckStore, useProModalStore, useLanguageStore } from '@/stores';
import { generateCardsFromDocumentAction } from '@/app/actions/generateCards';
import { showAdMobRewardedAd } from '@/lib/admob';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';
import type { CardFormat, GeneratedCard, DocenteFormat, TargetAudience } from '@/types/cards';
import { FormattedCardView } from './FormattedCardView';
import { PrintExamSheet } from '@/components/decks';
import { cleanupUploadedDocument } from '@/lib/storageCleanup';
import { purgeExpiredDocumentsAction } from '@/app/actions/storageCleanup';

interface DocumentUploaderProps {
  deckId: string;
  onSuccess?: (cardsCount: number) => void;
  onCancel?: () => void;
  onSwitchToUrl?: () => void;
  initialMeticulousPhase?: boolean;
  onMeticulousChange?: (val: boolean) => void;
  onStepChange?: (step: 1 | 2 | 3) => void;
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

interface InfoTooltipProps {
  content: React.ReactNode;
  title?: string;
}

function InfoTooltip({ content, title }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-label="Más información"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="w-4 h-4 rounded-full bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center text-[10px] font-bold font-mono transition-colors cursor-pointer ml-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        ?
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 sm:w-80 p-3 rounded-xl bg-neutral-900/95 dark:bg-neutral-950/95 text-neutral-200 border border-neutral-700/80 shadow-2xl backdrop-blur-md text-xs leading-relaxed animate-in fade-in zoom-in-95 pointer-events-auto"
        >
          {title && (
            <div className="font-semibold text-neutral-100 text-[11px] mb-1.5 pb-1 border-b border-neutral-800 flex items-center gap-1.5">
              <span>💡</span>
              <span>{title}</span>
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-neutral-300 font-normal">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-950" />
        </div>
      )}
    </span>
  );
}

export function DocumentUploader({
  deckId,
  onSuccess,
  onCancel,
  onSwitchToUrl,
  initialMeticulousPhase,
  onMeticulousChange,
  onStepChange,
}: DocumentUploaderProps) {
  const { user } = useAuthStore();
  const { cards, createCardsBatch, fetchCardsByDeck } = useCardStore();
  const { fetchDeckById } = useDeckStore();
  const { openProModal } = useProModalStore();
  const { language, t } = useLanguageStore();
  const isEn = language === 'en';

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cardFormat, setCardFormat] = useState<CardFormat>('multiple_choice');
  const [cardCount, setCardCount] = useState<number>(10);
  const [customPrompt, setCustomPrompt] = useState('');
  const [pageStart, setPageStart] = useState<string>('');
  const [pageEnd, setPageEnd] = useState<string>('');
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null);
  const [docxTotalPages, setDocxTotalPages] = useState<number | null>(null);
  
  // Modal de restricción obligatoria de páginas para documentos PDF / DOCX
  const [isPageRangeRequiredModalOpen, setIsPageRangeRequiredModalOpen] = useState<boolean>(false);
  const [modalPageStart, setModalPageStart] = useState<string>('');
  const [modalPageEnd, setModalPageEnd] = useState<string>('');
  
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
  const [isExhaustiveMode, setIsExhaustiveMode] = useState<boolean>(false);
  const [pedagogicalMode, setPedagogicalMode] = useState<'academic' | 'didactic'>('academic');
  const [docenteFormat, setDocenteFormat] = useState<DocenteFormat>('mixed_test');
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('auto');
  const [generatedCardsPreview, setGeneratedCardsPreview] = useState<GeneratedCard[]>([]);
  const [materialExhaustedNotice, setMaterialExhaustedNotice] = useState<{ generated: number; requested: number } | null>(null);

  // Estatus de suscripción PRO / VIP del usuario
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const uid: string = user.id;
    async function checkTier() {
      try {
        const { data } = await supabase
          .from('api_limits')
          .select('tier')
          .eq('user_id', uid)
          .maybeSingle();

        if (data && (data.tier === 'pro' || data.tier === 'vip')) {
          setIsPro(true);
        }
      } catch (err) {
        console.warn('Error al verificar estatus PRO:', err);
      }
    }
    checkTier();
  }, [user?.id]);

  // Marcapáginas (Cursor) y Bucle Acumulador Backend
  const [nextCursorPage, setNextCursorPage] = useState<number | null>(null);
  const [lastStartPage, setLastStartPage] = useState<number | null>(null);
  const [uploadedStorage, setUploadedStorage] = useState<{
    storagePath: string;
    signedUrl?: string;
    fileKey: string;
  } | null>(null);

  // Referencia mutable para auto-borrado garantizado en desmontaje
  const uploadedStorageRef = useRef<string | null>(null);

  useEffect(() => {
    uploadedStorageRef.current = uploadedStorage?.storagePath || null;
  }, [uploadedStorage]);

  // Purga proactiva de archivos huérfanos (> 2 horas) al montar el modal
  useEffect(() => {
    purgeExpiredDocumentsAction(2).catch(() => {});
  }, []);

  // Limpieza en el desmontaje garantizada mediante Beacon / keepalive
  useEffect(() => {
    return () => {
      if (uploadedStorageRef.current) {
        cleanupUploadedDocument(uploadedStorageRef.current);
      }
    };
  }, []);

  // Cancelación segura y asíncrona que aguarda la eliminación del archivo
  const handleSafeCancel = async () => {
    if (uploadedStorage?.storagePath) {
      await cleanupUploadedDocument(uploadedStorage.storagePath);
      setUploadedStorage(null);
    }
    if (onCancel) {
      onCancel();
    }
  };

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
    setDocxTotalPages(null);
    setNextCursorPage(null);
    setLastStartPage(null);
    if (uploadedStorage?.storagePath) {
      cleanupUploadedDocument(uploadedStorage.storagePath);
    }
    setUploadedStorage(null);
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      return;
    }

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    const isAudio = ext === '.mp3' || ext === '.wav' || file.type.startsWith('audio/');
    if (isAudio && !isPro) {
      setErrorMessage(
        isEn
          ? 'Audio and Voice processing is exclusive to PRO members. Upgrade to PRO to generate flashcards from audio recordings.'
          : 'El procesamiento de archivos de Audio y Grabaciones es exclusivo para miembros PRO. Actualiza tu cuenta para generar tarjetas desde audios.'
      );
      openProModal(false, 'audio');
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

    const isDocx =
      file.name.toLowerCase().endsWith('.docx') ||
      file.name.toLowerCase().endsWith('.doc') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword';
    if (isDocx) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const virtualPages = await parseDocxIntoVirtualPages(arrayBuffer);
        const docxPagesCount = Math.max(1, virtualPages.length);
        setDocxTotalPages(docxPagesCount);
      } catch (docxErr) {
        console.warn('No se pudo determinar el número total de páginas virtuales del DOCX:', docxErr);
      }
    }

    setSelectedFile(file);
    setStatus('idle');
  }, [isPro, isEn, openProModal, uploadedStorage]);

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

  // Upload to Supabase Storage and process with Gemini Flash using Sliding Window
  const handleProcessDocument = async (overrideCursor?: number) => {
    if (!selectedFile) return;

    if (!user) {
      setErrorMessage('Debes haber iniciado sesión para subir documentos a Supabase Storage.');
      return;
    }

    const isPdf =
      selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf';
    const isDocx =
      selectedFile.name.toLowerCase().endsWith('.docx') ||
      selectedFile.name.toLowerCase().endsWith('.doc') ||
      selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      selectedFile.type === 'application/msword';
    const isPageable = isPdf || isDocx;
    const totalPagesForRun = isPdf ? pdfTotalPages : docxTotalPages;

    let startPageForRun: number | undefined = undefined;
    let endPageForRun: number | undefined = undefined;

    // FASE 2: Validación y cálculo del Marcapáginas (Cursor) para PDFs y páginas virtuales de Word (.docx)
    if (isPageable) {
      const parsedStart = pageStart.trim() ? parseInt(pageStart.trim(), 10) : undefined;
      const parsedEnd = pageEnd.trim() ? parseInt(pageEnd.trim(), 10) : undefined;

      // Validación de coherencia si se especificó rango
      if (parsedStart !== undefined && parsedEnd !== undefined) {
        if (parsedStart < 1 || parsedEnd < 1) {
          setErrorMessage('Las páginas deben ser números positivos mayores o iguales a 1.');
          return;
        }
        if (parsedEnd < parsedStart) {
          setErrorMessage('La página final ("Hasta página") no puede ser menor que la inicial ("Desde página").');
          return;
        }
        if (totalPagesForRun !== null && parsedEnd > totalPagesForRun) {
          setErrorMessage(
            `La página final (${parsedEnd}) supera el total de páginas (${totalPagesForRun}).`
          );
          return;
        }
      }

      const masterStart = parsedStart !== undefined && !isNaN(parsedStart) ? Math.max(1, parsedStart) : 1;
      const masterEnd = parsedEnd !== undefined && !isNaN(parsedEnd) ? parsedEnd : (totalPagesForRun || 9999);

      // Calcular cursor activo para el bucle acumulador
      const effectiveCursor = typeof overrideCursor === 'number'
        ? overrideCursor
        : (nextCursorPage !== null ? nextCursorPage : masterStart);

      if (effectiveCursor > masterEnd) {
        setErrorMessage(
          `Has alcanzado el final del temario delimitado (página ${masterEnd}). Modifica el rango para seguir extrayendo.`
        );
        return;
      }

      startPageForRun = effectiveCursor;
      endPageForRun = masterEnd;
      setLastStartPage(startPageForRun);
    }

    try {
      setErrorMessage(null);

      const fileInfo = getFileTypeInfo(selectedFile);
      const fileKey = `${selectedFile.name}-${selectedFile.size}`;

      let storagePath = uploadedStorage?.fileKey === fileKey ? uploadedStorage.storagePath : '';
      let signedUrl = uploadedStorage?.fileKey === fileKey ? uploadedStorage.signedUrl : undefined;

      // 1. Subir archivo al bucket 'user-documents' (reutilizando si ya está subido para este archivo)
      if (!storagePath) {
        setStatus('uploading');
        const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const timestamp = Date.now();
        storagePath = `${user.id}/${timestamp}-${sanitizedName}`;

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

        const { data: signedData, error: signedError } = await supabase.storage
          .from('user-documents')
          .createSignedUrl(storagePath, 300);

        signedUrl = signedData?.signedUrl;
        if (signedError) {
          console.warn('Advertencia al generar signedUrl, se utilizará fallback de descarga:', signedError);
        }

        setUploadedStorage({
          storagePath,
          signedUrl,
          fileKey,
        });
      }

      // 2. Procesar micro-chunk con Gemini Flash nativo multimodal
      setStatus('analyzing');

      const existingFronts = cards && cards.length > 0 ? cards.map((c) => c.front) : [];

      const effectivePedagogicalMode: 'academic' | 'didactic' =
        pedagogicalMode === 'didactic' ? 'didactic' : 'academic';

      const effectiveCardFormat: CardFormat =
        effectivePedagogicalMode === 'didactic'
          ? (docenteFormat === 'open_cases'
              ? 'basic'
              : docenteFormat === 'mixed_test'
              ? cardFormat
              : docenteFormat)
          : cardFormat;

      console.log('[FRONTEND PAYLOAD -> BACKEND]', {
        pedagogicalMode: effectivePedagogicalMode,
        isExhaustiveMode: Boolean(isExhaustiveMode),
        startPage: startPageForRun,
        finalPage: endPageForRun,
        cardCount,
      });

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
          cardFormat: effectiveCardFormat,
          cardCount,
          existingQuestions: existingFronts,
          cursorPage: startPageForRun,
          pageStart: startPageForRun,
          pageEnd: endPageForRun,
          language,
          coreExhaustedPrevious: coreExhausted || isMeticulousPhase,
          isExhaustiveMode: Boolean(isExhaustiveMode),
          pedagogicalMode: effectivePedagogicalMode,
          docenteFormat,
          targetAudience,
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

      // Validar resultado de la IA sin lanzar errores fatales
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
                return handleProcessDocument(startPageForRun);
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
          `El fragmento es demasiado denso para generar ${cardCount} tarjetas en este lote. Por favor, intenta generar una cantidad menor (ej. 10 tarjetas).`;
        setErrorMessage(errorDetail);
        return;
      }

      // 3. Guardar las tarjetas generadas en Supabase en lote mediante el store de Zustand
      setStatus('saving');
      const generatedCards = result.cards;
      setGeneratedCardsPreview(generatedCards);

      const cardsPayload = generatedCards.map((card) => ({
        front: card.front,
        back: card.back,
        cardType: card.cardFormat === 'cloze' ? 'cloze' : 'basic',
        cardFormat: card.cardFormat,
      }));
      await createCardsBatch(deckId, cardsPayload);

      // Sincronizar datos del mazo en local
      await fetchCardsByDeck(deckId);
      await fetchDeckById(deckId);

      // Notificación si el texto se agotó antes de alcanzar el tope solicitado
      if (generatedCards.length < cardCount) {
        setMaterialExhaustedNotice({
          generated: generatedCards.length,
          requested: cardCount,
        });
      } else {
        setMaterialExhaustedNotice(null);
      }

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

      if (typeof result.nextCursorPage === 'number') {
        setNextCursorPage(result.nextCursorPage);
      }

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
    setCurrentStep(1);
    setSelectedFile(null);
    setPdfTotalPages(null);
    setDocxTotalPages(null);
    setPageStart('');
    setPageEnd('');
    setStatus('idle');
    setErrorMessage(null);
    setGeneratedCardsPreview([]);
    setNextCursorPage(null);
    setLastStartPage(null);
    if (uploadedStorage?.storagePath) {
      cleanupUploadedDocument(uploadedStorage.storagePath);
    }
    setUploadedStorage(null);
    setMaterialExhaustedNotice(null);
    setPedagogicalMode('academic');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isBusy = status === 'uploading' || status === 'analyzing' || status === 'saving';

  const isPdf = selectedFile
    ? selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf'
    : false;
  const isDocx = selectedFile
    ? selectedFile.name.toLowerCase().endsWith('.docx') ||
      selectedFile.name.toLowerCase().endsWith('.doc') ||
      selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      selectedFile.type === 'application/msword'
    : false;
  const isPageableDoc = isPdf || isDocx;
  const effectiveTotalPages = isPdf ? pdfTotalPages : docxTotalPages;

  const isSinglePage = Boolean(
    isPageableDoc &&
    pageStart.trim() !== '' &&
    pageEnd.trim() !== '' &&
    pageStart.trim() === pageEnd.trim()
  );

  const handleValidateAndProceedToStep3 = () => {
    if (isPageableDoc) {
      const pStart = parseInt(pageStart.trim(), 10);
      const pEnd = parseInt(pageEnd.trim(), 10);
      const isInvalid =
        pageStart.trim() === '' ||
        pageEnd.trim() === '' ||
        isNaN(pStart) ||
        isNaN(pEnd) ||
        pStart < 1 ||
        pEnd < pStart ||
        Boolean(effectiveTotalPages && (pStart > effectiveTotalPages || pEnd > effectiveTotalPages));

      if (isInvalid) {
        setModalPageStart(pageStart.trim() || '1');
        setModalPageEnd(pageEnd.trim() || (effectiveTotalPages ? String(effectiveTotalPages) : '10'));
        setIsPageRangeRequiredModalOpen(true);
        return;
      }
    }
    setCurrentStep(3);
  };

  const handleApplyModalPageRange = () => {
    const pStart = parseInt(modalPageStart.trim(), 10);
    const pEnd = parseInt(modalPageEnd.trim(), 10);
    if (!isNaN(pStart) && !isNaN(pEnd) && pStart >= 1 && pEnd >= pStart) {
      setPageStart(String(pStart));
      setPageEnd(String(pEnd));
      setNextCursorPage(null);
      setLastStartPage(null);
      setIsPageRangeRequiredModalOpen(false);
      setCurrentStep(3);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Error Banner Amigable con Botón de Reintento Rápido */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-950 dark:text-rose-300 text-xs sm:text-sm flex flex-col sm:flex-row items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <svg className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <strong className="font-semibold block text-rose-950 dark:text-rose-200 mb-0.5">Aviso de Generación:</strong>
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
              className="shrink-0 self-end sm:self-center px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:border-rose-500/40 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚡</span>
              <span>Ajustar a 10 tarjetas</span>
            </button>
          )}
        </div>
      )}

      {/* Success View */}
      {status === 'success' ? (
        <div className="p-6 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-center space-y-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center mx-auto shadow-md">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('ai_uploader.success_title', '¡{count} Tarjetas Generadas y Guardadas!').replace('{count}', String(successCount))}
            </h3>

            {/* FASE 2: Notificación si el texto no contenía más conceptos únicos */}
            {materialExhaustedNotice && (
              <div className="mt-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs text-left flex items-start gap-2.5 max-w-md mx-auto shadow-sm animate-in fade-in">
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

            {/* Si es documento por páginas / tramos, mostramos ÚNICAMENTE la caja de progreso limpia */}
            {isPageableDoc && typeof nextCursorPage === 'number' ? (
              <div className="mt-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-200 text-xs text-center max-w-md mx-auto shadow-sm">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-sm">📖</span>
                  <span className="font-medium text-blue-950 dark:text-blue-200">
                    Páginas consumidas por el motor:{' '}
                    <strong className="text-blue-950 dark:text-white font-semibold">
                      {lastStartPage && lastStartPage !== nextCursorPage
                        ? `de la ${lastStartPage} a la ${nextCursorPage}`
                        : `página ${nextCursorPage}`}
                    </strong>
                    {effectiveTotalPages && (
                      <span className="text-blue-900/80 dark:text-blue-300"> (de {effectiveTotalPages} págs {isPdf ? 'totales' : 'virtuales'})</span>
                    )}
                  </span>
                </div>
                <span className="block text-[11px] text-blue-900/80 dark:text-blue-300 mt-1 font-medium">
                  Marcapáginas guardado en pág. {nextCursorPage} • El motor retomará desde aquí en el siguiente clic
                </span>
              </div>
            ) : (
              /* Para documentos generales sin páginas */
              <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 text-xs text-left flex items-start gap-2.5 max-w-md mx-auto shadow-sm">
                <span className="text-base shrink-0">✅</span>
                <p className="leading-relaxed">
                  <strong className="font-semibold text-emerald-950 dark:text-emerald-300">{t('deck_detail.cards_added_title', 'Tarjetas añadidas con éxito.')}</strong>
                </p>
              </div>
            )}

            <p className="text-[11px] text-slate-600 dark:text-neutral-400 mt-2 max-w-sm mx-auto font-medium">
              {t('ai_uploader.document_label', 'Documento:')} &ldquo;{selectedFile?.name}&rdquo; ({cardFormat})
            </p>
          </div>

          {/* Cards Preview with FormattedCardView (Pantalla: visible | Impresión: oculta) */}
          <div className="space-y-3 print:hidden">
            <div className="overflow-y-auto max-h-[55vh] sm:max-h-[60vh] pr-2 space-y-3 text-left">
              {generatedCardsPreview.map((card, i) => (
                <div
                  key={card.id || `card-batch-${Date.now()}-${(card.front || '').slice(0, 15)}-${i}`}
                  className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs shadow-sm"
                >
                  <FormattedCardView
                    cardId={card.id || `preview-${(card.front || '').slice(0, 15)}-${i}`}
                    front={card.front}
                    back={card.back}
                    cardFormat={card.cardFormat}
                    isRevealed={true}
                    interactive={false}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Documento de Impresión Ultra-Compacto para Vista Previa */}
          <PrintExamSheet
            deckTitle={
              selectedFile?.name
                ? `${selectedFile.name.replace(/\.[^/.]+$/, '')} — ${
                    pedagogicalMode === 'didactic'
                      ? (docenteFormat === 'mixed_test' ? 'Examen de Evaluación (Test Mixto)' : 'Casos Prácticos y Preguntas Abiertas')
                      : 'Ficha de Estudio y Repaso'
                  }`
                : 'Examen de Evaluación'
            }
            deckDescription={pedagogicalMode === 'didactic' ? `Modo Docente • ${docenteFormat}` : undefined}
            cards={generatedCardsPreview}
          />

          {/* Sticky Actions Footer */}
          <div className="sticky bottom-0 z-10 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-3 mt-2 rounded-xl flex flex-wrap items-center justify-center gap-2.5 shadow-lg print:hidden">
            {/* Exportar a PDF / Imprimir */}
            <button
              type="button"
              onClick={() => {
                if (!isPro) {
                  openProModal(false, 'print');
                  return;
                }
                window.print();
              }}
              className="px-3.5 py-2.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold transition flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
              title={
                !isPro
                  ? isEn
                    ? 'Export to PDF / Print is exclusive to PRO'
                    : 'Exportar a PDF / Imprimir es exclusivo para PRO'
                  : 'Guardar como PDF o Imprimir tarjetas'
              }
            >
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>{t('ai_uploader.export_pdf_btn', isEn ? 'Export to PDF / Print' : 'Exportar a PDF / Imprimir')}</span>
              {!isPro && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white leading-none shadow-xs">
                  PRO
                </span>
              )}
            </button>
            {isPageableDoc && typeof nextCursorPage === 'number' ? (
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  handleProcessDocument(nextCursorPage);
                }}
                className="px-5 py-2.5 text-xs rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span>Continuar extrayendo (Retomar desde pág. {nextCursorPage})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  handleProcessDocument();
                }}
                className={`px-4 py-2.5 text-xs rounded-xl ${
                  isMeticulousPhase
                    ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-600/30'
                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/30'
                } text-white font-medium shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer`}
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
            )}
            <button
              onClick={handleReset}
              className="px-3.5 py-2.5 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 dark:hover:text-white font-medium transition cursor-pointer"
            >
              {t('ai_uploader.process_another_btn', 'Procesar otro documento')}
            </button>
            {onCancel && (
              <button
                onClick={handleSafeCancel}
                className="px-3.5 py-2.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium transition cursor-pointer"
              >
                {t('ai_uploader.close_btn', 'Cerrar ventana')}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Stepper Flow (3 Pasos) */
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

          {/* Stepper Header (3 Pasos) */}
          <div className="w-full pb-3 border-b border-neutral-200 dark:border-neutral-800/80">
            <div className="flex items-center justify-between max-w-sm sm:max-w-md mx-auto px-1">
              {[
                { id: 1, label: t('ai_uploader.step1_title', isEn ? 'Document' : 'Documento') },
                { id: 2, label: t('ai_uploader.step2_title', isEn ? 'Range & Format' : 'Rango y Formato') },
                { id: 3, label: t('ai_uploader.step3_title', isEn ? 'Mode & Focus' : 'Modo y Enfoque') },
              ].map((s, idx) => {
                const isActive = currentStep === s.id;
                const isPassed = currentStep > s.id;
                const canNavigate = !isBusy && (s.id === 1 || Boolean(selectedFile));
                return (
                  <React.Fragment key={s.id}>
                    {idx > 0 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 transition-colors duration-200 ${
                          isPassed ? 'bg-violet-600' : 'bg-neutral-200 dark:bg-neutral-800'
                        }`}
                      />
                    )}
                    <button
                      type="button"
                      disabled={!canNavigate}
                      onClick={() => {
                        if (canNavigate) {
                          if (s.id === 3 && currentStep === 2) {
                            handleValidateAndProceedToStep3();
                          } else {
                            setCurrentStep(s.id as 1 | 2 | 3);
                          }
                        }
                      }}
                      className={`group flex items-center gap-1.5 text-xs font-semibold transition-all ${
                        isActive
                          ? 'text-violet-600 dark:text-violet-400'
                          : isPassed
                          ? 'text-neutral-800 dark:text-neutral-200 hover:text-violet-600 dark:hover:text-violet-300'
                          : canNavigate
                          ? 'text-neutral-600 dark:text-neutral-400 hover:text-violet-600 dark:hover:text-violet-300'
                          : 'text-neutral-400 dark:text-neutral-600 opacity-50 cursor-not-allowed'
                      } ${canNavigate ? 'cursor-pointer active:scale-95' : ''}`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono transition-all ${
                          isActive
                            ? 'bg-violet-600 text-white ring-2 ring-violet-500/30 shadow-sm shadow-violet-600/30'
                            : isPassed
                            ? 'bg-emerald-500 text-white group-hover:bg-emerald-600'
                            : canNavigate
                            ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/50 group-hover:text-violet-600'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600'
                        }`}
                      >
                        {isPassed ? '✓' : s.id}
                      </span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Progress Indicator durante proceso en background */}
          {isBusy && (
            <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/80 space-y-2 animate-in fade-in">
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

          {/* ========================================================
              PASO 1: Documento
             ======================================================== */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
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
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                        Audio (.mp3, .wav)
                        <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-white leading-none">PRO</span>
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
                <div className="space-y-4">
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
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Botones de navegación Paso 1 */}
              <div className="flex items-center justify-between pt-2">
                {onCancel && (
                  <button
                    type="button"
                    onClick={handleSafeCancel}
                    className="px-4 py-2 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                  >
                    {t('common.cancel', 'Cancelar')}
                  </button>
                )}
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs sm:text-sm transition shadow-lg shadow-violet-600/25 active:scale-95 cursor-pointer"
                  >
                    <span>{t('ai_uploader.continue_step2', isEn ? 'Continue to Step 2' : 'Continuar al Paso 2')}</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              PASO 2: Rango y Formato
             ======================================================== */}
          {currentStep === 2 && selectedFile && (
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-150">
              {/* Rango de Páginas si es PDF o DOCX */}
              {isPageableDoc ? (
                <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center">
                      <span>
                        {isPdf
                          ? t('ai_uploader.page_range_pdf', isEn ? 'Page Range (PDF)' : 'Rango de Páginas (PDF)')
                          : (isEn ? 'Virtual Page Range (DOCX)' : 'Rango de Páginas Virtuales (DOCX)')}
                      </span>
                      <InfoTooltip
                        title={
                          isPdf
                            ? t('ai_uploader.tooltip_page_range_title', isEn ? 'PDF Viewer vs. Printed Page Numbers' : 'Numeración de visor vs. libro impreso')
                            : (isEn ? 'Virtual Page Pagination' : 'Paginación Virtual de Documento')
                        }
                        content={
                          isPdf
                            ? t(
                                'ai_uploader.tooltip_page_range',
                                isEn
                                  ? '⚠️ PDF Viewer vs. Printed Page Numbers: Enter the page number shown in your PDF reader\'s top bar (e.g., page 96 of 569). Covers and indexes often offset physical page numbers.'
                                  : '⚠️ Numeración de visor vs. libro impreso: Introduce el número que marca tu lector PDF en la barra superior (ej. pág. 96 de 569). Las portadas e índices suelen desfasar la numeración impresa en papel.'
                              )
                            : (isEn
                                ? '📄 Virtual Pages: The Word document has been divided into virtual pages of ~400 words (~2,200 characters) so it can be processed section by section just like a PDF.'
                                : '📄 Páginas Virtuales: El documento Word ha sido dividido en páginas virtuales homogéneas de ~400 palabras (~2.200 caracteres) para procesarse sección por sección exactamente igual que un PDF.')
                        }
                      />
                    </label>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      {effectiveTotalPages !== null
                        ? (isPdf
                            ? t('ai_uploader.total_pages', { count: effectiveTotalPages }, isEn ? `${effectiveTotalPages} total pages` : `${effectiveTotalPages} págs totales`)
                            : (isEn ? `${effectiveTotalPages} virtual pages` : `${effectiveTotalPages} págs virtuales`))
                        : (isPdf ? 'PDF' : 'DOCX')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 dark:text-neutral-300 mb-1">
                        {t('ai_uploader.from_page', isEn ? 'Start page:' : 'Desde página:')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={effectiveTotalPages || undefined}
                        disabled={isBusy}
                        value={pageStart}
                        onChange={(e) => {
                          setPageStart(e.target.value);
                          setNextCursorPage(null);
                          setLastStartPage(null);
                        }}
                        placeholder="ej. 1"
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 dark:text-neutral-300 mb-1">
                        {t('ai_uploader.to_page', isEn ? 'End page:' : 'Hasta página:')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={effectiveTotalPages || undefined}
                        disabled={isBusy}
                        value={pageEnd}
                        onChange={(e) => {
                          setPageEnd(e.target.value);
                          setNextCursorPage(null);
                          setLastStartPage(null);
                        }}
                        placeholder={effectiveTotalPages ? (isEn ? `e.g. ${effectiveTotalPages}` : `ej. ${effectiveTotalPages}`) : (isEn ? 'e.g. 30' : 'ej. 30')}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {typeof nextCursorPage === 'number' && (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-indigo-500/10 border border-blue-200 dark:border-indigo-500/25 text-blue-950 dark:text-indigo-300 text-[11px] flex items-center justify-between gap-2 font-medium">
                      <span>{t('ai_uploader.bookmark_resume', { page: nextCursorPage }, isEn ? `🔖 Bookmark: Will resume from page ${nextCursorPage}` : `🔖 Marcapáginas: Retomará desde pág. ${nextCursorPage}`)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNextCursorPage(null);
                          setLastStartPage(null);
                        }}
                        className="text-[10px] text-blue-700 hover:text-blue-900 dark:text-indigo-400 dark:hover:text-indigo-200 underline font-mono cursor-pointer font-semibold"
                      >
                        {t('ai_uploader.bookmark_reset', isEn ? 'Reset' : 'Reiniciar')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-slate-700 dark:text-neutral-300 flex items-center gap-2 font-medium">
                  <span>📄</span>
                  <span>{t('ai_uploader.full_doc_notice', { name: selectedFile.name }, isEn ? `Full document: The engine will process the entire file (${selectedFile.name}).` : `Documento completo: El motor procesará la totalidad del archivo (${selectedFile.name}).`)}</span>
                </div>
              )}

              {/* Formato de Tarjetas (Grid 2x2) */}
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-neutral-300">
                    {t('ai_uploader.card_format_label', isEn ? 'Card Format' : 'Formato de Tarjetas')}
                  </label>
                  {pedagogicalMode === 'didactic' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono">
                      {docenteFormat === 'mixed_test'
                        ? t('ai_uploader.didactic_mixed_badge', isEn ? '✨ Varied Test: Bloom Taxonomy' : '✨ Test Variado: Distribución Bloom')
                        : docenteFormat === 'open_cases'
                        ? t('ai_uploader.didactic_open_badge', isEn ? '📋 Cases with Rubric' : '📋 Casos con Rúbrica')
                        : docenteFormat === 'multiple_choice'
                        ? t('ai_uploader.didactic_mc_badge', isEn ? '📝 Multiple Choice Only' : '📝 Solo Test')
                        : docenteFormat === 'true_false'
                        ? t('ai_uploader.didactic_tf_badge', isEn ? '⚖️ True/False Only' : '⚖️ Solo V/F')
                        : docenteFormat === 'cloze'
                        ? t('ai_uploader.didactic_cloze_badge', isEn ? '🧩 Cloze Only' : '🧩 Solo Huecos')
                        : t('ai_uploader.didactic_basic_badge', isEn ? '🃏 Short Question Only' : '🃏 Solo Pregunta Corta')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                  {[
                    {
                      id: 'multiple_choice' as CardFormat,
                      icon: '📝',
                      title: t('card_editor.format_test', isEn ? 'Multiple Choice' : 'Opción Múltiple'),
                      subtitle: t('ai_uploader.format_mc_sub', isEn ? '4-option test with solution' : 'Test con 4 alternativas y solución'),
                    },
                    {
                      id: 'basic' as CardFormat,
                      icon: '🃏',
                      title: t('card_editor.format_basic', isEn ? 'Basic' : 'Básica'),
                      subtitle: t('ai_uploader.format_basic_sub', isEn ? 'Direct question and concise answer' : 'Pregunta directa y respuesta concisa'),
                    },
                    {
                      id: 'cloze' as CardFormat,
                      icon: '🧩',
                      title: t('card_editor.format_cloze', isEn ? 'Cloze' : 'Cloze'),
                      subtitle: t('ai_uploader.format_cloze_sub', isEn ? 'Fill-in-the-blank brackets' : 'Completar conceptos entre corchetes'),
                    },
                    {
                      id: 'true_false' as CardFormat,
                      icon: '⚖️',
                      title: t('card_editor.format_tf', isEn ? 'True or False' : 'Verdadero o Falso'),
                      subtitle: t('ai_uploader.format_tf_sub', isEn ? 'Statements with strict justifications' : 'Afirmación con justificación rigurosa'),
                    },
                  ].map((opt) => {
                    const isSelected = cardFormat === opt.id;
                    return (
                      <button
                        key={`uploader-card-fmt-${opt.id}`}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setCardFormat(opt.id);
                          if (pedagogicalMode === 'didactic') {
                            setDocenteFormat(opt.id);
                          }
                        }}
                        className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer active:scale-[0.99] ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500 text-slate-900 dark:text-white shadow-sm'
                            : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 text-slate-800 dark:text-neutral-300'
                        }`}
                      >
                        <span className="text-xl shrink-0 mt-0.5">{opt.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">{opt.title}</p>
                          <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 leading-snug line-clamp-2 mt-0.5">
                            {opt.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cantidad de Tarjetas o Notificación Didáctica */}
              {pedagogicalMode === 'didactic' ? (
                <div className="p-3 sm:p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <span className="text-base">👨‍🏫</span>
                    <span className="font-medium">
                      {t('ai_uploader.docente_step2_notice', { count: cardCount }, isEn ? `Teacher Mode: Question quantity is configured in Step 3 (${cardCount} questions)` : `Modo Docente activo: El número de preguntas se define en el Paso 3 (${cardCount} preguntas)`)}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 shrink-0">
                    {cardCount} / 40 MÁX
                  </span>
                </div>
              ) : (
                <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="cardCount" className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-neutral-300">
                      {t('ai_uploader.card_count_label', isEn ? 'Card Quantity' : 'Cantidad de Tarjetas')}
                    </label>
                    <span className="text-[10px] font-mono font-bold text-violet-600 dark:text-violet-400">
                      {cardCount} / 30 MÁX
                    </span>
                  </div>
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
                    className="w-full text-xs font-semibold px-3.5 py-2 sm:py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition disabled:opacity-50"
                    placeholder={isEn ? "1 to 30 cards" : "1 a 30 tarjetas"}
                  />
                </div>
              )}

              {/* Alerta Preventiva Condicional (1 sola página y > 15 tarjetas) */}
              {isSinglePage && cardCount > 15 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2 shadow-sm animate-in fade-in">
                  <span className="text-sm shrink-0 mt-0.5">⚠️</span>
                  <p>
                    {t(
                      'ai_uploader.density_warning',
                      isEn
                        ? 'You selected 1 page for a high card count. Unless it is a dense table, a single page typically yields 8–15 high-fidelity cards without hallucinating content.'
                        : 'Has seleccionado 1 página para un lote alto. Salvo en tablas muy densas, una sola página suele rendir 8-15 tarjetas de alta fidelidad sin inventar.'
                    )}
                  </p>
                </div>
              )}

              {/* Botones de navegación Paso 2 */}
              <div className="flex items-center justify-between pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-xs text-slate-700 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{t('ai_uploader.back_btn', isEn ? 'Back' : 'Atrás')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleValidateAndProceedToStep3}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs sm:text-sm transition shadow-lg shadow-violet-600/25 active:scale-95 cursor-pointer"
                >
                  <span>{t('ai_uploader.continue_step3', isEn ? 'Continue to Step 3' : 'Continuar al Paso 3')}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
              PASO 3: Modo y Enfoque
             ======================================================== */}
          {currentStep === 3 && selectedFile && (
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-150">
              {/* Selector Enfoque Pedagógico: Académico vs Docente */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎓</span>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white tracking-tight flex items-center">
                      <span>{t('ai_uploader.pedagogical_mode_label', isEn ? 'Pedagogical Focus' : 'Enfoque Pedagógico')}</span>
                      <InfoTooltip
                        title={t('ai_uploader.tooltip_pedagogical_title', isEn ? 'Pedagogical Focus Guide' : 'Guía de Enfoque Pedagógico')}
                        content={
                          <div className="space-y-2.5 text-[11px]">
                            <div>
                              <strong className="text-white block font-semibold flex items-center gap-1.5">
                                <span>📚</span>
                                <span>{t('ai_uploader.pedagogical_academic_title', isEn ? 'Academic / Self-Study Mode:' : 'Modo Estudio / Académico:')}</span>
                              </strong>
                              <p className="text-neutral-300 mt-0.5 leading-relaxed">
                                {isEn
                                  ? 'Designed for personal mastery, active recall, and competitive exams (oposiciones, university). Generates flashcards optimized for long-term retention using the FSRS spaced repetition algorithm.'
                                  : 'Diseñado para el estudio personal, memorización activa y oposiciones. Genera tarjetas de estudio atomizadas optimizadas para la retención a largo plazo con el algoritmo FSRS.'}
                              </p>
                            </div>
                            <div>
                              <strong className="text-amber-300 block font-semibold flex items-center gap-1.5">
                                <span>👨‍🏫</span>
                                <span>{t('ai_uploader.pedagogical_didactic_title', isEn ? 'Teacher / Didactic Mode:' : 'Modo Docente / Didáctico:')}</span>
                              </strong>
                              <p className="text-neutral-300 mt-0.5 leading-relaxed">
                                {isEn
                                  ? 'Designed exclusively for teachers and educators to create classroom assessments, exams, and worksheets. Calibrates questions using Bloom\'s Taxonomy and age cognitive stages, eliminating references to document structure.'
                                  : 'Diseñado exclusivamente para profesores y formadores para crear exámenes, pruebas y controles de clase. Calibra las preguntas según la Taxonomía de Bloom y tramos de edad escolar, formulando ejercicios de aplicación práctica.'}
                              </p>
                            </div>
                          </div>
                        }
                      />
                    </h4>
                  </div>
                </div>

                {/* Segmented Control */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-200/60 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPedagogicalMode('academic');
                      if (cardCount > 30) setCardCount(30);
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
                      pedagogicalMode === 'academic'
                        ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-bold'
                        : 'text-slate-900 hover:text-black dark:text-neutral-300 dark:hover:text-white font-medium'
                    } disabled:opacity-50`}
                  >
                    <span>📚</span>
                    <span className="truncate">{t('ai_uploader.mode_academic', isEn ? 'Study / Academic' : 'Estudio / Académico')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setPedagogicalMode('didactic')}
                    className={`py-2 px-2.5 rounded-lg text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
                      pedagogicalMode === 'didactic'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-sm font-bold'
                        : 'text-slate-900 hover:text-black dark:text-neutral-300 dark:hover:text-white font-medium'
                    } disabled:opacity-50`}
                  >
                    <span>👨‍🏫</span>
                    <span className="truncate">{t('ai_uploader.mode_didactic', isEn ? 'Teacher / Didactic' : 'Docente / Didáctico')}</span>
                  </button>
                </div>

                {/* Configuración específica del Modo Docente / Didáctico */}
                {pedagogicalMode === 'didactic' && (
                  <div className="space-y-3.5 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Micro-texto explicativo */}
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
                      <span className="text-xs shrink-0 mt-0.5">💡</span>
                      <p className="font-medium">
                        {t(
                          'ai_uploader.pedagogical_didactic_notice',
                          isEn
                            ? 'Optimized for teachers: transforms worksheets and lists into practical assessment exercises without references to document structure.'
                            : 'Optimizado para profesores: transforma fichas y listas en ejercicios prácticos de evaluación sin referencias a la estructura del documento.'
                        )}
                      </p>
                    </div>

                    {/* Limitador Independiente de Preguntas (Modo Docente: Máx 40) */}
                    <div className="p-3 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-amber-950 dark:text-amber-200 flex items-center">
                          <span className="mr-1.5">🎯</span>
                          <span>{t('ai_uploader.didactic_card_count_label', isEn ? 'Number of Exam Questions' : 'Número de Preguntas del Examen')}</span>
                          <InfoTooltip
                            title={t('ai_uploader.tooltip_exam_questions_title', isEn ? 'Exam Question Limit (Max 40)' : 'Límite de Preguntas del Examen (Máx 40)')}
                            content={
                              <div className="space-y-1.5 text-[11px]">
                                <p className="text-neutral-200">
                                  {t('ai_uploader.tooltip_exam_questions_desc', isEn ? 'Configure how many questions you want for this exam. The chunking engine will distribute them proportionally across all selected pages.' : 'Define cuántas preguntas quieres para este examen. El motor de chunking las distribuirá proporcionalmente por todas las páginas seleccionadas para que ninguna quede sin evaluar.')}
                                </p>
                                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px]">
                                  {isEn ? '💡 Maximum 40 questions per batch for optimal evaluation quality.' : '💡 Máximo 40 preguntas por lote para mantener la máxima calidad de evaluación.'}
                                </div>
                              </div>
                            }
                          />
                        </label>
                        <span className="text-xs font-mono font-bold text-amber-950 dark:text-amber-200 bg-amber-200/60 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700">
                          {cardCount} {isEn ? 'questions' : 'preguntas'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Preset buttons */}
                        <div className="flex items-center gap-1.5 flex-1">
                          {[10, 20, 30, 40].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              disabled={isBusy}
                              onClick={() => setCardCount(preset)}
                              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                cardCount === preset
                                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/25 ring-1 ring-amber-600'
                                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:border-amber-300'
                              } disabled:opacity-50`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        {/* Custom number input */}
                        <div className="w-20 shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={40}
                            disabled={isBusy}
                            value={cardCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) {
                                setCardCount(Math.min(40, Math.max(1, val)));
                              }
                            }}
                            className="w-full text-center text-xs font-mono font-bold py-1.5 px-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Selector Formato Docente (6 Opciones) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-neutral-200 flex items-center">
                          <span className="mr-1.5">📋</span>
                          <span>{t('ai_uploader.docente_format_label', isEn ? 'Teacher Assessment Format' : 'Formato de Evaluación Docente')}</span>
                          <InfoTooltip
                            title={t('ai_uploader.tooltip_docente_formats_title', isEn ? 'Teacher Assessment Formats Guide' : 'Guía de Formatos de Evaluación Docente')}
                            content={
                              <div className="space-y-2 text-[11px]">
                                <div>
                                  <span className="font-semibold text-amber-300 block">🎯 {isEn ? 'Mixed Test (Bloom Distribution):' : 'Test Variado (Bloom):'}</span>
                                  <span className="text-neutral-300">{isEn ? 'Combines formats balancing Bloom taxonomy levels (Remember, Understand, Apply, Analyze).' : 'Combina los 4 formatos distribuyendo las preguntas según los niveles cognitivos de Bloom (Recordar, Comprender, Aplicar y Analizar).'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-300 block">📝 {isEn ? 'Multiple Choice Only:' : 'Solo Test:'}</span>
                                  <span className="text-neutral-300">{isEn ? '4 options with single solution and reasoning.' : '4 alternativas con solución única argumentada y distractores plausibles.'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-300 block">⚖️ {isEn ? 'True or False Only:' : 'Solo Verdadero o Falso:'}</span>
                                  <span className="text-neutral-300">{isEn ? 'Statements with reasoned justification.' : 'Afirmaciones críticas para discriminación conceptual con justificación argumentada.'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-300 block">🧩 {isEn ? 'Cloze / Fill-in Only:' : 'Solo Huecos (Cloze):'}</span>
                                  <span className="text-neutral-300">{isEn ? 'Complete key concepts in brackets [...].' : 'Completar conceptos clave y fórmulas entre corchetes [...].'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-300 block">🃏 {isEn ? 'Short Question Only:' : 'Solo Pregunta Corta:'}</span>
                                  <span className="text-neutral-300">{isEn ? 'Direct questions and concise key answers.' : 'Preguntas directas y respuestas concisas orientadas a lo esencial.'}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-amber-300 block">📋 {isEn ? 'Cases with Rubric:' : 'Casos con Rúbrica:'}</span>
                                  <span className="text-neutral-300">{isEn ? 'Open cases with grading rubric for teachers.' : 'Casos prácticos de desarrollo con rúbrica de corrección y baremo de puntos para el docente.'}</span>
                                </div>
                              </div>
                            }
                          />
                        </label>
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 font-mono font-medium">
                          🧠 Taxonomía de Bloom
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {[
                          {
                            id: 'mixed_test' as const,
                            icon: '🎯',
                            title: t('ai_uploader.docente_format_mixed_title', isEn ? 'Mixed Test (Varied)' : 'Test Variado (Mixto)'),
                            desc: t('ai_uploader.docente_format_mixed_desc', isEn ? 'Combines test, concepts, T/F and cloze with Bloom taxonomy.' : 'Combina test, conceptos, V/F y cloze con taxonomía de Bloom.'),
                          },
                          {
                            id: 'multiple_choice' as const,
                            icon: '📝',
                            title: t('ai_uploader.docente_format_mc_title', isEn ? 'Multiple Choice Only' : 'Solo Test'),
                            desc: t('ai_uploader.docente_format_mc_desc', isEn ? '4 options with single solution and reasoning.' : '4 alternativas con solución única y justificación.'),
                          },
                          {
                            id: 'true_false' as const,
                            icon: '⚖️',
                            title: t('ai_uploader.docente_format_tf_title', isEn ? 'True or False Only' : 'Solo Verdadero o Falso'),
                            desc: t('ai_uploader.docente_format_tf_desc', isEn ? 'Statements with reasoned justification.' : 'Afirmaciones con justificación argumentada.'),
                          },
                          {
                            id: 'cloze' as const,
                            icon: '🧩',
                            title: t('ai_uploader.docente_format_cloze_title', isEn ? 'Cloze / Fill-in Only' : 'Solo Huecos (Cloze)'),
                            desc: t('ai_uploader.docente_format_cloze_desc', isEn ? 'Complete key concepts in brackets [...].' : 'Completar conceptos clave entre corchetes [...].'),
                          },
                          {
                            id: 'basic' as const,
                            icon: '🃏',
                            title: t('ai_uploader.docente_format_basic_title', isEn ? 'Short Question Only' : 'Solo Pregunta Corta'),
                            desc: t('ai_uploader.docente_format_basic_desc', isEn ? 'Direct questions and concise key answers.' : 'Preguntas directas y respuestas concisas esenciales.'),
                          },
                          {
                            id: 'open_cases' as const,
                            icon: '📋',
                            title: t('ai_uploader.docente_format_open_title', isEn ? 'Cases with Rubric' : 'Casos con Rúbrica'),
                            desc: t('ai_uploader.docente_format_open_desc', isEn ? 'Open cases with grading rubric for teachers.' : 'Casos prácticos de desarrollo con rúbrica para el docente.'),
                          },
                        ].map((item) => {
                          const isSelected = docenteFormat === item.id;
                          return (
                            <button
                              key={`uploader-docente-fmt-${item.id}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setDocenteFormat(item.id);
                                if (item.id === 'open_cases') setCardFormat('basic');
                                else if (item.id !== 'mixed_test') setCardFormat(item.id);
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400/40 shadow-sm font-semibold'
                                  : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-sm">{item.icon}</span>
                                <span className="text-xs font-semibold leading-tight">{item.title}</span>
                              </div>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                                {item.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selector Audiencia / Nivel Educativo */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-800 dark:text-neutral-200 flex items-center">
                        <span className="mr-1.5">🎓</span>
                        <span>{t('ai_uploader.target_audience_label', isEn ? 'Target Audience / Educational Level' : 'Audiencia / Nivel Educativo del Alumnado')}</span>
                        <InfoTooltip
                          title={t('ai_uploader.tooltip_target_audience_title', isEn ? 'Cognitive Calibration by Educational Level' : 'Calibración Cognitiva por Nivel Educativo')}
                          content={
                            <div className="space-y-2 text-[11px]">
                              <div>
                                <span className="font-semibold text-amber-300 block">🤖 {isEn ? 'Auto-detection:' : 'Detección Automática:'}</span>
                                <span className="text-neutral-300">{isEn ? 'AI adapts difficulty to document complexity.' : 'La IA analiza la complejidad léxica y sintáctica del material para calibrar la dificultad.'}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-amber-300 block">🎒 {isEn ? '12-14 years (Middle School / 1º-2º ESO):' : '12-14 años (1º-2º ESO):'}</span>
                                <span className="text-neutral-300">{isEn ? 'Accessible vocabulary, direct conceptual understanding.' : 'Lenguaje accesible, enunciados directos y foco en conceptos troncales.'}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-amber-300 block">🏫 {isEn ? '15-17 years (High School / 3º-4º ESO / Bachillerato):' : '15-17 años (3º-4º ESO / Bachillerato):'}</span>
                                <span className="text-neutral-300">{isEn ? 'Pre-university analytical depth, cause-effect reasoning.' : 'Rigor preuniversitario, pensamiento crítico y análisis de relaciones causa-efecto.'}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-amber-300 block">🏛️ {isEn ? 'University & Professional (+18 years):' : 'Universidad / Oposiciones (+18 años):'}</span>
                                <span className="text-neutral-300">{isEn ? 'Technical rigor, legal precision, advanced evaluation.' : 'Máximo rigor técnico, plazos legales, excepciones y evaluación conceptual avanzada.'}</span>
                              </div>
                            </div>
                          }
                        />
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          {
                            id: 'auto' as const,
                            icon: '🤖',
                            title: t('ai_uploader.target_audience_auto', isEn ? 'Auto-detection' : 'Detección Automática'),
                            desc: t('ai_uploader.target_audience_auto_desc', isEn ? 'Adapts to text complexity' : 'Adapta según el texto')
                          },
                          {
                            id: '12-14_years' as const,
                            icon: '🎒',
                            title: t('ai_uploader.target_audience_12_14', isEn ? '12-14 years' : '12-14 años'),
                            desc: isEn ? 'Middle School / ESO 1-2' : '1º-2º ESO / Intermedio'
                          },
                          {
                            id: '15-17_years' as const,
                            icon: '🏫',
                            title: t('ai_uploader.target_audience_15_17', isEn ? '15-17 years' : '15-17 años'),
                            desc: isEn ? 'High School / Bachillerato' : '3º-4º ESO / Bachillerato'
                          },
                          {
                            id: 'university_plus' as const,
                            icon: '🏛️',
                            title: t('ai_uploader.target_audience_univ', isEn ? 'University / Pro' : 'Universidad / Opos'),
                            desc: isEn ? 'Higher Ed & Professional' : 'Universidad / +18 años'
                          }
                        ].map(item => (
                          <button
                            key={`uploader-target-aud-${item.id}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => setTargetAudience(item.id)}
                            className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-between min-h-[72px] ${
                              targetAudience === item.id
                                ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400/40 font-semibold'
                                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            <span className="text-base mb-1">{item.icon}</span>
                            <span className="text-[11px] font-semibold leading-tight">{item.title}</span>
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5 line-clamp-1">{item.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modo Exhaustivo - Toggle/Switch destacado con Tooltip */}
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                  isExhaustiveMode
                    ? 'bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-purple-600/15 dark:from-violet-950/50 dark:via-indigo-950/40 dark:to-purple-950/50 border-violet-500/50 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/10'
                    : 'bg-neutral-50 dark:bg-neutral-950/80 border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white tracking-tight flex items-center">
                        <span>
                          {t('ai_uploader.exhaustive_mode_label', isEn ? 'Exhaustive Mode' : 'Modo Exhaustivo')} (
                          {isExhaustiveMode
                            ? t('ai_uploader.mode_surgical', isEn ? 'Surgical' : 'Quirúrgico')
                            : t('ai_uploader.mode_normal', isEn ? 'Normal' : 'Normal')}
                          )
                        </span>
                        <InfoTooltip
                          title={t('ai_uploader.tooltip_exhaustive_title', isEn ? 'Normal vs. Exhaustive Mode' : 'Modo Normal vs. Modo Exhaustivo')}
                          content={
                            <div className="space-y-2">
                              <div>
                                <strong className="text-white block font-semibold">
                                  {t('ai_uploader.tooltip_exhaustive_normal_title', isEn ? '💡 Normal Mode:' : '💡 Modo Normal:')}
                                </strong>
                                <span className="text-neutral-300">
                                  {t(
                                    'ai_uploader.tooltip_exhaustive_normal_desc',
                                    isEn
                                      ? 'Extracts core concepts, causes, consequences, and key definitions (ideal for initial study rounds).'
                                      : 'Extrae conceptos troncales, causas, consecuencias y definiciones clave (ideal para una primera vuelta de estudio).'
                                  )}
                                </span>
                              </div>
                              <div>
                                <strong className="text-violet-300 block font-semibold">
                                  {t('ai_uploader.tooltip_exhaustive_mode_title', isEn ? '⚡ Exhaustive Mode:' : '⚡ Modo Exhaustivo:')}
                                </strong>
                                <span className="text-neutral-300">
                                  {t(
                                    'ai_uploader.tooltip_exhaustive_mode_desc',
                                    isEn
                                    ? 'Surgically analyzes every table row, chart, numeric stat, legal deadline, and exception.'
                                    : 'Analiza cada fila de tablas, gráficas, cifras, plazos legales y excepciones con precisión quirúrgica.'
                                )}
                              </span>
                            </div>
                          </div>
                        }
                      />
                    </h4>
                    {isExhaustiveMode && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white animate-pulse">
                        {t('ai_uploader.mode_surgical', isEn ? 'SURGICAL' : 'QUIRÚRGICO').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-neutral-300 leading-relaxed font-medium">
                    {isExhaustiveMode
                      ? t(
                          'ai_uploader.exhaustive_desc_surgical',
                          isEn
                            ? 'Surgically analyzes every table row, chart, numeric stat, legal deadline, and exception without summarizing.'
                            : 'Desglose exhaustivo de tablas, gráficos y listas densas sin resumir información.'
                        )
                      : t(
                          'ai_uploader.exhaustive_desc_normal',
                          isEn
                            ? 'Standard extraction and synthesis of main core concepts.'
                            : 'Extracción estándar y síntesis de los conceptos clave principales.'
                        )}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isExhaustiveMode}
                  disabled={isBusy}
                  onClick={() => setIsExhaustiveMode(!isExhaustiveMode)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                    isExhaustiveMode
                      ? 'bg-violet-600 dark:bg-violet-500'
                      : 'bg-neutral-300 dark:bg-neutral-700'
                  } disabled:opacity-50`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isExhaustiveMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Enfoque Temático con Tooltip */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center">
                  <span>{t('ai_uploader.thematic_focus_label', isEn ? '🎯 Thematic Focus (Optional)' : '🎯 Enfoque Temático (Opcional)')}</span>
                  <InfoTooltip
                    title={t('ai_uploader.tooltip_focus_title', isEn ? 'Filtering and Focus Examples' : 'Ejemplos de Filtrado y Enfoque')}
                    content={t(
                      'ai_uploader.tooltip_focus_content',
                      isEn
                        ? 'Use this field to guide the AI and filter information within the chosen pages. Example: \'Focus on Table 5-3 and extract drug dosages\' or \'Ignore historical introduction and only ask about current regulations\'.'
                        : 'Usa este campo para guiar a la IA y filtrar la información dentro de las páginas elegidas. Ejemplo: \'Centrar en el Cuadro 5-3 y extraer dosis farmacológicas\' o \'Ignorar introducción histórica y preguntar solo por la normativa vigente\'.'
                    )}
                  />
                </label>
              </div>
              <textarea
                rows={2}
                disabled={isBusy}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={t(
                  'ai_uploader.focus_prompt_placeholder',
                  isEn
                    ? "E.g., 'Extract data exclusively from Table 5-3 on fat content'..."
                    : "Ej: 'Extrae exclusivamente datos del Cuadro 5-3 de contenido de grasa'..."
                )}
                className="w-full text-xs px-3.5 py-2 sm:py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition disabled:opacity-50 resize-none font-medium"
              />
            </div>

            {/* Botones de navegación Paso 3 */}
            <div className="flex items-center justify-between pt-1 sm:pt-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 text-xs text-slate-700 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium"
              >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{t('ai_uploader.back_btn', isEn ? 'Back' : 'Atrás')}</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy || !selectedFile}
                  onClick={() => handleProcessDocument()}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl ${
                    isMeticulousPhase
                      ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-600/25'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-600/25'
                  } disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg active:scale-95 cursor-pointer`}
                >
                  {isBusy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      <span>
                        {isPageableDoc
                          ? (isEn ? 'Extracting meticulously...' : 'Extrayendo minuciosamente...')
                          : t('ai_uploader.processing_file', isEn ? 'Processing file...' : 'Procesando archivo...')}
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>
                        {isPageableDoc
                          ? (typeof nextCursorPage === 'number'
                              ? t('ai_uploader.continue_extract_btn', { page: nextCursorPage }, isEn ? `Continue extracting (Resume p. ${nextCursorPage})` : `Continuar extrayendo (Retomar pág. ${nextCursorPage})`)
                              : t('ai_uploader.extract_action_btn', { count: cardCount }, isEn ? `Extract ${cardCount} cards` : `Extraer ${cardCount} tarjetas`))
                          : (isMeticulousPhase
                              ? t('ai_uploader.process_file_meticulous', { count: cardCount }, isEn ? `Generate detailed cards (up to ${cardCount})` : `Generar tarjetas detalladas (hasta ${cardCount})`)
                              : t('ai_uploader.process_file', { count: cardCount }, isEn ? `Generate up to ${cardCount} cards` : `Generar hasta ${cardCount} tarjetas`))}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Rango de Páginas Obligatorio (UX y Cobertura Total) */}
      {isPageRangeRequiredModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 text-xl font-bold">
                📖
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('ai_uploader.page_range_required_modal_title', isEn ? 'Mandatory Page Range' : 'Rango de Páginas Obligatorio')}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {t('ai_uploader.page_range_required_modal_desc', isEn ? 'To ensure the exam accurately covers your required material without context saturation or topic omissions, you must set the page range before proceeding.' : 'Para garantizar que el examen cubra exactamente la materia deseada sin saturación de contexto ni omisión de temas, debes definir el rango de páginas a evaluar antes de continuar.')}
                </p>
              </div>
            </div>

            {/* Didactic Box: Visor PDF vs. Libro Impreso */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs">
              <div className="font-semibold text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                <span>💡</span>
                <span>{t('ai_uploader.diff_pdf_vs_book_title', isEn ? 'PDF Reader vs. Printed Book Page Numbers' : 'Diferencia entre Visor PDF y Libro Impreso')}</span>
              </div>
              <div className="space-y-2 text-[11px] text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
                <div>
                  <strong className="block text-slate-900 dark:text-amber-200">
                    {t('ai_uploader.diff_pdf_page_title', isEn ? 'PDF Reader Page (Absolute):' : 'Página del Visor PDF (Absoluta):')}
                  </strong>
                  <span>{t('ai_uploader.diff_pdf_page_desc', isEn ? 'The number shown in your PDF viewer or browser toolbar (e.g. page 12 of 120). This is the actual page number processed by the AI.' : 'Es el número que marca la barra de herramientas de tu lector o navegador (ej. página 12 de 120). Es la numeración técnica real que procesa la IA.')}</span>
                </div>
                <div>
                  <strong className="block text-slate-900 dark:text-amber-200">
                    {t('ai_uploader.diff_book_page_title', isEn ? 'Printed Book Page (Relative):' : 'Página Impresa en el Libro (Relativa):')}
                  </strong>
                  <span>{t('ai_uploader.diff_book_page_desc', isEn ? 'The number printed on the physical sheet corner (e.g. page 3 of Chapter 1). Covers, indices, or prologues typically offset printed numbers from digital page numbers.' : 'Es el número impreso en la esquina física de la hoja (ej. pág. 3 del Tema 1). Las portadas, índices o prólogos suelen desfasar la numeración impresa respecto al archivo digital.')}</span>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-amber-100/70 dark:bg-amber-900/40 text-amber-950 dark:text-amber-200 font-semibold text-[11px] flex items-center gap-1.5">
                <span>⭐</span>
                <span>{t('ai_uploader.diff_golden_rule', isEn ? 'Golden Rule: ALWAYS enter the page numbers displayed by your PDF viewer to ensure the AI evaluates the exact section.' : 'Regla de Oro: Introduce SIEMPRE los números que muestra tu visor PDF para asegurar que la IA evalúe la sección exacta.')}</span>
              </div>
            </div>

            {/* Input controls */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-800 dark:text-neutral-200">
                {isEn ? 'Set the range of pages to analyze:' : 'Indica el rango de páginas a analizar:'}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-1">{isEn ? 'From page:' : 'Desde página:'}</span>
                  <input
                    type="number"
                    min={1}
                    max={effectiveTotalPages || undefined}
                    value={modalPageStart}
                    onChange={(e) => setModalPageStart(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                    placeholder="1"
                  />
                </div>
                <span className="text-neutral-400 font-bold self-end pb-2">→</span>
                <div className="flex-1">
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-1">{isEn ? 'To page:' : 'Hasta página:'}</span>
                  <input
                    type="number"
                    min={parseInt(modalPageStart, 10) || 1}
                    max={effectiveTotalPages || undefined}
                    value={modalPageEnd}
                    onChange={(e) => setModalPageEnd(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                    placeholder={effectiveTotalPages ? String(effectiveTotalPages) : '10'}
                  />
                </div>
              </div>
              {Boolean(effectiveTotalPages) && (
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {isEn ? `Document total: ${effectiveTotalPages} pages` : `Total del documento: ${effectiveTotalPages} páginas`}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsPageRangeRequiredModalOpen(false)}
                className="px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition cursor-pointer"
              >
                {t('ai_uploader.btn_cancel_edit_range', isEn ? 'Back to form' : 'Volver al formulario')}
              </button>
              <button
                type="button"
                onClick={handleApplyModalPageRange}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition shadow-md shadow-amber-600/20 cursor-pointer"
              >
                {t('ai_uploader.btn_apply_range_continue', isEn ? 'Save Range and Continue to Step 3' : 'Guardar Rango y Continuar al Paso 3')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
