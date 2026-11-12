'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { parseDocxIntoVirtualPages } from '@/lib/docxPagination';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useCardStore, useDeckStore, useProModalStore, useLanguageStore } from '@/stores';
import { generateCardsFromDocumentAction } from '@/app/actions/generateCards';
import { checkUserGenerationQuota } from '@/lib/quotaGuard';
import type { CardFormat, GeneratedCard, DocenteFormat, TargetAudience } from '@/types/cards';
import { FormattedCardView } from './FormattedCardView';
import { PrintExamSheet } from '@/components/decks';
import { cleanupUploadedDocument } from '@/lib/storageCleanup';
import { purgeExpiredDocumentsAction } from '@/app/actions/storageCleanup';
import { InfoTooltip } from './InfoTooltip';
import { detectPlatform } from '@/lib/platform';

interface DocumentUploaderProps {
  deckId: string;
  onSuccess?: (cardsCount: number) => void;
  onCancel?: () => void;
  onSwitchToUrl?: () => void;
  initialMeticulousPhase?: boolean;
  onMeticulousChange?: (val: boolean) => void;
  onStepChange?: (step: 1 | 2 | 3 | 4) => void;
}

type FileTypeCategory = 'pdf' | 'docx' | 'audio' | 'video' | 'text';

interface FileTypeInfo {
  category: FileTypeCategory;
  label: string;
  badgeBg: string;
  badgeText: string;
  borderCol: string;
  iconBg: string;
  mime: string;
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.mp3', '.wav', '.m4a', '.mp4', '.mov', '.webm', '.txt'];
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
  if (
    ext === '.mp4' ||
    ext === '.mov' ||
    ext === '.webm' ||
    file.type.startsWith('video/')
  ) {
    const isMov = ext === '.mov' || file.type === 'video/quicktime';
    const isWebm = ext === '.webm' || file.type === 'video/webm';
    return {
      category: 'video',
      label: isMov ? 'Vídeo MOV' : isWebm ? 'Vídeo WebM' : 'Vídeo MP4',
      badgeBg: 'bg-purple-500/15',
      badgeText: 'text-purple-400',
      borderCol: 'border-purple-500/30',
      iconBg: 'bg-purple-500/20 text-purple-300',
      mime: isMov ? 'video/quicktime' : isWebm ? 'video/webm' : 'video/mp4',
    };
  }
  if (ext === '.mp3' || ext === '.wav' || ext === '.m4a' || file.type.startsWith('audio/')) {
    return {
      category: 'audio',
      label: ext === '.wav' ? 'Audio WAV' : ext === '.m4a' ? 'Audio M4A' : 'Audio MP3',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-400',
      borderCol: 'border-emerald-500/30',
      iconBg: 'bg-emerald-500/20 text-emerald-300',
      mime: ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg',
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
    file.type.startsWith('audio/') ||
    file.type.startsWith('video/') ||
    file.type === 'audio/mpeg' ||
    file.type === 'audio/mp3' ||
    file.type === 'audio/wav' ||
    file.type === 'audio/x-wav' ||
    file.type === 'audio/mp4' ||
    file.type === 'audio/x-m4a' ||
    file.type === 'video/mp4' ||
    file.type === 'video/quicktime' ||
    file.type === 'video/webm' ||
    file.type === 'text/plain';

  if (!isSupportedExt && !isSupportedMime) {
    return `Tipo de archivo no soportado. Formatos admitidos: PDF, Word (.docx, .doc), Audio (.mp3, .wav, .m4a), Vídeo (.mp4, .mov, .webm) y TXT.`;
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
  onStepChange,
}: DocumentUploaderProps) {
  const { user } = useAuthStore();
  const { cards, createCardsBatch, fetchCardsByDeck } = useCardStore();
  const { fetchDeckById, currentDeck } = useDeckStore();
  const { openProModal } = useProModalStore();
  const { language, t } = useLanguageStore();
  const isEn = language === 'en';

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cardFormat, setCardFormat] = useState<CardFormat>('multiple_choice');
  const [cardCount, setCardCount] = useState<number>(10);
  const [isPracticalMode, setIsPracticalMode] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [pageStart, setPageStart] = useState<string>('');
  const [pageEnd, setPageEnd] = useState<string>('');
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null);
  const [docxTotalPages, setDocxTotalPages] = useState<number | null>(null);
  
  // Modal de restricción obligatoria de páginas para documentos PDF / DOCX
  const [isPageRangeRequiredModalOpen, setIsPageRangeRequiredModalOpen] = useState<boolean>(false);
  const [modalPageStart, setModalPageStart] = useState<string>('');
  const [modalPageEnd, setModalPageEnd] = useState<string>('');

  // Modal numérico táctil para selección de página en Paso 2 (sin teclado OS)
  const [pageKeypadModal, setPageKeypadModal] = useState<{
    isOpen: boolean;
    target: 'start' | 'end';
    tempValue: number;
    replaceOnNextKey: boolean;
  }>({
    isOpen: false,
    target: 'start',
    tempValue: 1,
    replaceOnNextKey: true,
  });

  // Control de buffer limpio para el teclado táctil del Paso 3 (Cantidad de Tarjetas)
  const [cardKeypadReplaceOnNextKey, setCardKeypadReplaceOnNextKey] = useState<boolean>(true);

  // Sub-stepper local para navegación en Modo Docente (3 Fases compactas)
  const [docenteStep, setDocenteStep] = useState<1 | 2 | 3>(1);
  const [showThematicFocus, setShowThematicFocus] = useState<boolean>(false);
  
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
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [materialExhaustedNotice, setMaterialExhaustedNotice] = useState<{ generated: number; requested: number } | null>(null);

  // Estatus de suscripción PRO / VIP del usuario
  const [isPro, setIsPro] = useState(false);

  // Mensajes de progreso dinámicos durante la generación con IA para evitar sensación de congelamiento
  const [analyzingPhaseIndex, setAnalyzingPhaseIndex] = useState<number>(0);

  const analyzingPhasesEs = [
    'Extrayendo conceptos clave y estructura del documento...',
    'Redactando flashcards con preguntas y respuestas...',
    'Generando explicaciones pedagógicas y opciones...',
    'Verificando cobertura de contenido y distractores...',
    'Finalizando y optimizando el lote de tarjetas (casi listo)...',
  ];

  const analyzingPhasesEn = [
    'Extracting key concepts and document structure...',
    'Drafting flashcards with questions and answers...',
    'Generating pedagogical explanations and options...',
    'Verifying content coverage and distractors...',
    'Finalizing and polishing card batch (almost done)...',
  ];

  const currentAnalyzingPhase = isEn
    ? analyzingPhasesEn[analyzingPhaseIndex] || analyzingPhasesEn[0]
    : analyzingPhasesEs[analyzingPhaseIndex] || analyzingPhasesEs[0];

  useEffect(() => {
    if (status !== 'analyzing') {
      setAnalyzingPhaseIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setAnalyzingPhaseIndex((prev) => (prev < 4 ? prev + 1 : prev));
    }, 6500);

    return () => clearInterval(interval);
  }, [status]);

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
    const isVideo = ext === '.mp4' || ext === '.mov' || ext === '.webm' || file.type.startsWith('video/');
    const isAudio = ext === '.mp3' || ext === '.wav' || ext === '.m4a' || file.type.startsWith('audio/');
    if ((isAudio || isVideo) && !isPro) {
      setErrorMessage(
        isEn
          ? `${isVideo ? 'Video' : 'Audio'} processing is exclusive to PRO members. Upgrade to PRO to generate flashcards from multimedia files.`
          : `El procesamiento de archivos de ${isVideo ? 'Vídeo' : 'Audio'} y Grabaciones es exclusivo para miembros PRO. Actualiza tu cuenta para generar tarjetas desde archivos multimedia.`
      );
      openProModal(false, isVideo ? 'video' : 'audio');
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

    // Zero Latency Guard: comprobar preventivamente saldo en cliente ANTES de procesar o subir
    const quota = await checkUserGenerationQuota(user.id);
    if (!quota.canGenerate) {
      openProModal(true, null, () => {
        handleProcessDocument(overrideCursor);
      });
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

        // A) Refresco de sesión proactivo antes de subir
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error('Sesión no válida o expirada. Por favor, vuelve a iniciar sesión.');
        }

        const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const timestamp = Date.now();
        storagePath = `${user.id}/${timestamp}-${sanitizedName}`;

        let uploadContentType = selectedFile.type;
        const fileExt = '.' + (selectedFile.name.split('.').pop()?.toLowerCase() || '');
        if (fileExt === '.docx') {
          uploadContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (fileExt === '.doc') {
          uploadContentType = 'application/msword';
        } else if (fileExt === '.mp4') {
          uploadContentType = 'video/mp4';
        } else if (fileExt === '.mov') {
          uploadContentType = 'video/quicktime';
        } else if (fileExt === '.webm') {
          uploadContentType = 'video/webm';
        } else if (fileExt === '.m4a') {
          uploadContentType = 'audio/mp4';
        } else if (!uploadContentType) {
          uploadContentType = fileInfo.mime || 'application/octet-stream';
        }

        // B) Mecanismo de reintento automático (resiliencia ante microcortes)
        const maxAttempts = 3;
        let lastUploadError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const { error: uploadError } = await supabase.storage
            .from('user-documents')
            .upload(storagePath, selectedFile, {
              contentType: uploadContentType,
              upsert: attempt > 1,
            });

          if (!uploadError) {
            lastUploadError = null;
            break;
          }

          const errMsg = uploadError.message || String(uploadError);
          const isRetryable =
            errMsg.includes('Failed to fetch') ||
            errMsg.toLowerCase().includes('timeout') ||
            errMsg.toLowerCase().includes('network') ||
            errMsg.toLowerCase().includes('aborted');

          if (isRetryable && attempt < maxAttempts) {
            console.warn(
              `[DocumentUploader] Reintento ${attempt}/${maxAttempts} de subida a Supabase Storage tras error: ${errMsg}. Pausando ${attempt}s...`
            );
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          } else {
            lastUploadError = new Error(
              isRetryable
                ? `No se pudo completar la subida tras ${maxAttempts} intentos por problemas de conexión a internet. Por favor, verifica tu red y vuelve a intentarlo.`
                : `Error al subir a Supabase Storage: ${errMsg}`
            );
            break;
          }
        }

        if (lastUploadError) {
          throw lastUploadError;
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
        isPracticalMode: Boolean(isPracticalMode),
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
          isPracticalMode: Boolean(isPracticalMode),
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

      // Validar si el rango ya fue completado de forma limpia (ej. fin de documento en páginas de repaso)
      if ((result as any).rangeCompleted === true) {
        setStatus('idle');
        setErrorMessage(null);
        setNextCursorPage(null);
        setMaterialExhaustedNotice(null);
        alert((result as any).message || '¡Rango completado! Se ha llegado al final de las páginas seleccionadas.');
        return;
      }

      // Validar resultado de la IA sin lanzar errores fatales
      if (!result.success || !result.cards || result.cards.length === 0) {
        if (result.error === 'LIMIT_REACHED' || result.error === 'AD_REQUIRED') {
          setStatus('idle');
          openProModal(true, null, () => handleProcessDocument(startPageForRun));
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

      // Persistir metadatos del Modo Docente en la descripción del mazo si corresponde
      if (effectivePedagogicalMode === 'didactic') {
        try {
          const currentDesc = currentDeck?.description || '';
          const alreadyMarked =
            currentDesc.toLowerCase().includes('docente') ||
            currentDesc.toLowerCase().includes('didactic');

          if (!alreadyMarked) {
            const updatedDesc = currentDesc
              ? `${currentDesc} [Modo Docente • ${docenteFormat} • ${targetAudience}]`
              : `[Modo Docente] Formato: ${docenteFormat} • Audiencia: ${targetAudience}`;
            await supabase.from('decks').update({ description: updatedDesc }).eq('id', deckId);
          }
        } catch (updateDeckErr) {
          console.warn('No se pudo actualizar metadatos docentes en el mazo:', updateDeckErr);
        }
      }

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
        const parsedLimit = pageEnd.trim() ? parseInt(pageEnd.trim(), 10) : undefined;
        const activeLimit = parsedLimit && !isNaN(parsedLimit) ? parsedLimit : (totalPagesForRun || undefined);
        if (activeLimit && result.nextCursorPage > activeLimit) {
          setNextCursorPage(null);
        } else {
          setNextCursorPage(result.nextCursorPage);
        }
      } else {
        setNextCursorPage(null);
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
    setIsPracticalMode(false);
    if (uploadedStorage?.storagePath) {
      cleanupUploadedDocument(uploadedStorage.storagePath);
    }
    setUploadedStorage(null);
    setMaterialExhaustedNotice(null);
    setShowPreview(false);
    setPedagogicalMode('academic');
    setDocenteStep(1);
    setShowThematicFocus(false);
    setCardKeypadReplaceOnNextKey(true);
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
  const parsedPageEnd = pageEnd.trim() ? parseInt(pageEnd.trim(), 10) : undefined;
  const activeRunEndPage = parsedPageEnd && !isNaN(parsedPageEnd) ? parsedPageEnd : effectiveTotalPages;

  const isSinglePage = Boolean(
    isPageableDoc &&
    pageStart.trim() !== '' &&
    pageEnd.trim() !== '' &&
    pageStart.trim() === pageEnd.trim()
  );

  // Controladores del modal numérico táctil de páginas (Paso 2)
  const openPageKeypad = useCallback((target: 'start' | 'end') => {
    const currentVal = target === 'start'
      ? (parseInt(pageStart.trim(), 10) || 1)
      : (parseInt(pageEnd.trim(), 10) || (effectiveTotalPages ? Math.min(effectiveTotalPages, (parseInt(pageStart.trim(), 10) || 1) + 4) : 10));
    setPageKeypadModal({
      isOpen: true,
      target,
      tempValue: currentVal,
      replaceOnNextKey: true,
    });
  }, [pageStart, pageEnd, effectiveTotalPages]);

  const handlePageModalKeypadPress = useCallback((key: string) => {
    const maxPages = effectiveTotalPages || 9999;
    if (key === 'C') {
      setPageKeypadModal(prev => ({ ...prev, tempValue: 0, replaceOnNextKey: false }));
      return;
    }
    if (key === 'backspace') {
      setPageKeypadModal(prev => {
        if (prev.replaceOnNextKey) {
          return { ...prev, tempValue: 0, replaceOnNextKey: false };
        }
        const str = String(prev.tempValue);
        if (str.length <= 1) return { ...prev, tempValue: 0, replaceOnNextKey: false };
        const sliced = parseInt(str.slice(0, -1), 10);
        return { ...prev, tempValue: isNaN(sliced) ? 0 : sliced, replaceOnNextKey: false };
      });
      return;
    }
    const digit = parseInt(key, 10);
    if (isNaN(digit)) return;
    setPageKeypadModal(prev => {
      let val: number;
      if (prev.replaceOnNextKey) {
        val = digit;
      } else {
        const currentStr = prev.tempValue === 0 ? '' : String(prev.tempValue);
        const newStr = currentStr + key;
        val = parseInt(newStr, 10);
      }
      if (isNaN(val)) val = 0;
      if (val > maxPages) val = maxPages;
      return { ...prev, tempValue: val, replaceOnNextKey: false };
    });
  }, [effectiveTotalPages]);

  const handleConfirmPageModal = useCallback(() => {
    const maxPages = effectiveTotalPages || 9999;
    const target = pageKeypadModal.target;
    let chosenVal = pageKeypadModal.tempValue;

    if (target === 'start') {
      if (chosenVal < 1) chosenVal = 1;
      if (chosenVal > maxPages) chosenVal = maxPages;
      setPageStart(String(chosenVal));
      const currentEnd = parseInt(pageEnd.trim(), 10);
      if (!isNaN(currentEnd) && chosenVal > currentEnd) {
        setPageEnd(String(chosenVal));
      }
    } else {
      const currentStart = parseInt(pageStart.trim(), 10) || 1;
      if (chosenVal < currentStart) chosenVal = currentStart;
      if (chosenVal > maxPages) chosenVal = maxPages;
      setPageEnd(String(chosenVal));
    }
    setNextCursorPage(null);
    setLastStartPage(null);
    setPageKeypadModal(prev => ({ ...prev, isOpen: false }));
  }, [effectiveTotalPages, pageKeypadModal, pageEnd, pageStart]);

  // Soporte de teclado físico para el modal de página
  useEffect(() => {
    if (!pageKeypadModal.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPageKeypadModal(prev => ({ ...prev, isOpen: false }));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmPageModal();
      } else if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handlePageModalKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePageModalKeypadPress('backspace');
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handlePageModalKeypadPress('C');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageKeypadModal.isOpen, handleConfirmPageModal, handlePageModalKeypadPress]);

  const maxAllowedCards = pedagogicalMode === 'didactic' ? 40 : 30;

  // Keypad táctil para el Paso 3
  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'C') {
      setCardCount(0);
      setCardKeypadReplaceOnNextKey(false);
      return;
    }
    if (key === 'backspace') {
      if (cardKeypadReplaceOnNextKey) {
        setCardCount(0);
        setCardKeypadReplaceOnNextKey(false);
        return;
      }
      setCardCount((prev) => {
        const str = String(prev);
        if (str.length <= 1) return 0;
        const sliced = parseInt(str.slice(0, -1), 10);
        return isNaN(sliced) ? 0 : sliced;
      });
      return;
    }
    const digit = parseInt(key, 10);
    if (isNaN(digit)) return;
    setCardCount((prev) => {
      let val: number;
      if (cardKeypadReplaceOnNextKey) {
        val = digit;
      } else {
        const currentStr = prev === 0 ? '' : String(prev);
        const newStr = currentStr + key;
        val = parseInt(newStr, 10);
      }
      if (isNaN(val)) val = 0;
      if (val > maxAllowedCards) val = maxAllowedCards;
      return val;
    });
    setCardKeypadReplaceOnNextKey(false);
  }, [cardKeypadReplaceOnNextKey, maxAllowedCards]);

  const handleProceedToStep4 = useCallback(() => {
    setCardCount((prev) => {
      if (prev < 1) return 10;
      if (prev > maxAllowedCards) return maxAllowedCards;
      return prev;
    });
    setCurrentStep(4);
  }, [maxAllowedCards]);

  // Soporte de teclado físico de PC durante el Paso 3
  useEffect(() => {
    if (currentStep !== 3) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadPress('backspace');
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleKeypadPress('C');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleProceedToStep4();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, handleKeypadPress, handleProceedToStep4]);

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
    setCardKeypadReplaceOnNextKey(true);
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
    <div className="w-full space-y-5 overflow-x-hidden">
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
        <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 text-center space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center justify-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center shrink-0 shadow-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('ai_uploader.success_title', '¡{count} Tarjetas Generadas y Guardadas!').replace('{count}', String(successCount))}
            </h3>
          </div>

          {/* FASE 2: Notificación si el texto no contenía más conceptos únicos */}
          {materialExhaustedNotice && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs text-left flex items-start gap-2 max-w-md mx-auto shadow-xs">
              <span className="text-sm shrink-0">⚠️</span>
              <p className="leading-snug font-medium">
                {t(
                  'deck_detail.material_exhausted',
                  'Material agotado: Se han generado {count} tarjetas. El texto no contenía más conceptos únicos para alcanzar las {requested} solicitadas.'
                )
                  .replace('{count}', String(materialExhaustedNotice.generated))
                  .replace('{requested}', String(materialExhaustedNotice.requested))}
              </p>
            </div>
          )}

          {/* Si es documento por páginas / tramos y restan páginas, mostramos la caja de progreso y marcapáginas */}
          {isPageableDoc && typeof nextCursorPage === 'number' && (!activeRunEndPage || nextCursorPage <= activeRunEndPage) ? (
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-200 text-xs text-center max-w-md mx-auto shadow-xs">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <span className="text-xs">📖</span>
                <span className="font-medium text-blue-950 dark:text-blue-200">
                  Páginas analizadas:{' '}
                  <strong className="text-blue-950 dark:text-white font-semibold">
                    {lastStartPage && lastStartPage !== nextCursorPage
                      ? `de la ${lastStartPage} a la ${nextCursorPage - 1}`
                      : `hasta la página ${nextCursorPage - 1}`}
                  </strong>
                  {activeRunEndPage && (
                    <span className="text-blue-900/80 dark:text-blue-300"> (de {activeRunEndPage} págs)</span>
                  )}
                </span>
                <span className="mx-1 text-blue-400">•</span>
                <span className="text-[11px] text-blue-900/80 dark:text-blue-300 font-medium">
                  Siguiente tanda: pág. {nextCursorPage}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 text-xs text-center max-w-md mx-auto shadow-xs">
              <p className="font-medium">
                ✅ <strong className="font-semibold text-emerald-950 dark:text-emerald-300">{t('deck_detail.cards_added_title', 'Tarjetas añadidas con éxito.')}</strong>
                {isPageableDoc && activeRunEndPage && (
                  <span className="block text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5 font-normal">
                    🎉 Se ha completado el análisis íntegro de las páginas delimitadas (hasta pág. {activeRunEndPage}).
                  </span>
                )}
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-neutral-400 max-w-sm mx-auto font-medium">
            {t('ai_uploader.document_label', 'Documento:')} &ldquo;{selectedFile?.name}&rdquo; ({cardFormat})
          </p>

          {/* Actions-First Header Buttons (Always immediately visible without scrolling) */}
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-800 p-2.5 rounded-xl flex flex-wrap items-center justify-center gap-2 shadow-md print:hidden">
            {isPageableDoc && typeof nextCursorPage === 'number' && (!activeRunEndPage || nextCursorPage <= activeRunEndPage) ? (
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  handleProcessDocument(nextCursorPage);
                }}
                className="px-4 py-2 text-xs rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span>Continuar extrayendo (Retomar desde pág. {nextCursorPage}{activeRunEndPage ? ` de ${activeRunEndPage}` : ''})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  handleProcessDocument();
                }}
                className={`px-4 py-2 text-xs rounded-xl ${
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

            {/* Exportar a PDF / Imprimir */}
            <button
              type="button"
              onClick={() => {
                if (typeof window === 'undefined') return;
                const platform = detectPlatform();
                const isAndroidNative =
                  platform.isNativeAndroid ||
                  Boolean(
                    (window as unknown as { Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string } })
                      .Capacitor?.isNativePlatform() &&
                    (window as unknown as { Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string } })
                      .Capacitor?.getPlatform() === 'android'
                  );

                if (isAndroidNative) {
                  const printUrl = `https://www.flashmente.com/decks/${deckId}/print`;
                  window.open(printUrl, '_system');
                } else {
                  window.print();
                }
              }}
              className="px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold transition flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-xs"
              title={isEn ? 'Export to PDF / Print' : 'Guardar como PDF o Imprimir tarjetas'}
            >
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>{t('ai_uploader.export_pdf_btn', isEn ? 'Export to PDF / Print' : 'Exportar a PDF / Imprimir')}</span>
            </button>

            <button
              onClick={handleReset}
              className="px-3 py-2 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 dark:hover:text-white font-medium transition cursor-pointer"
            >
              {t('ai_uploader.process_another_btn', 'Procesar otro documento')}
            </button>

            {onCancel && (
              <button
                onClick={handleSafeCancel}
                className="px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium transition cursor-pointer"
              >
                {t('ai_uploader.close_btn', 'Cerrar ventana')}
              </button>
            )}
          </div>

          {/* Collapsible Accordion Preview (Zero screen takeover) */}
          <div className="pt-1 print:hidden">
            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="w-full py-2 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>{showPreview ? '▲' : '▼'}</span>
              <span>
                {showPreview
                  ? t('ai_uploader.hide_preview', 'Ocultar tarjetas generadas')
                  : t('ai_uploader.show_preview', 'Ver tarjetas generadas ({count})').replace('{count}', String(generatedCardsPreview.length))}
              </span>
            </button>

            {showPreview && (
              <div className="mt-2.5 overflow-y-auto max-h-[35vh] pr-1.5 space-y-2.5 text-left animate-in fade-in duration-200">
                {generatedCardsPreview.map((card, i) => (
                  <div
                    key={card.id || `card-batch-${Date.now()}-${(card.front || '').slice(0, 15)}-${i}`}
                    className="p-3 rounded-xl bg-neutral-900/95 border border-neutral-800 text-xs shadow-sm"
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
            )}
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
                : (pedagogicalMode === 'didactic' ? 'Examen de Evaluación' : 'Cuaderno de Repaso y Autoevaluación')
            }
            deckDescription={pedagogicalMode === 'didactic' ? `Modo Docente • ${docenteFormat}` : undefined}
            cards={generatedCardsPreview}
            pedagogicalMode={pedagogicalMode}
            isDocenteMode={pedagogicalMode === 'didactic'}
          />
        </div>
      ) : (
        /* Stepper Flow (3 Pasos) */
        <div className="space-y-2.5 sm:space-y-3.5 overflow-x-hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4a,text/plain"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
              }
            }}
          />

          {/* Stepper Header (4 Pasos) */}
          <div className="w-full pb-3 border-b border-neutral-200 dark:border-neutral-800/80">
            <div className="flex items-center justify-between max-w-sm sm:max-w-lg mx-auto px-1">
              {[
                { id: 1, label: t('ai_uploader.step1_title', isEn ? 'Document' : 'Archivo') },
                { id: 2, label: t('ai_uploader.step2_title', isEn ? 'Pages & Format' : 'Páginas y Formato') },
                { id: 3, label: t('ai_uploader.step3_title', isEn ? 'Quantity' : 'Cantidad') },
                { id: 4, label: t('ai_uploader.step4_title', isEn ? 'Mode & Focus' : 'Modo y Enfoque') },
              ].map((s, idx) => {
                const isActive = currentStep === s.id;
                const isPassed = currentStep > s.id;
                const canNavigate = !isBusy && (s.id === 1 || Boolean(selectedFile));
                return (
                  <React.Fragment key={s.id}>
                    {idx > 0 && (
                      <div
                        className={`flex-1 h-0.5 mx-1.5 sm:mx-2 transition-colors duration-200 ${
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
                          } else if (s.id === 4) {
                            if (currentStep === 2) {
                              handleValidateAndProceedToStep3();
                            } else {
                              handleProceedToStep4();
                            }
                          } else {
                            setCurrentStep(s.id as 1 | 2 | 3 | 4);
                          }
                        }
                      }}
                      className={`group flex items-center gap-1 sm:gap-1.5 text-xs font-semibold transition-all ${
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
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-bold font-mono transition-all ${
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
            <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/80 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-800 dark:text-neutral-300 font-medium flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  {status === 'uploading' && t('ai_uploader.status_uploading', '1/3 Subiendo archivo a Supabase Storage...')}
                  {status === 'analyzing' && (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="text-violet-600 dark:text-violet-400 font-semibold">2/3 Gemini Flash:</span>
                      <span className="text-slate-700 dark:text-slate-200">{currentAnalyzingPhase}</span>
                    </span>
                  )}
                  {status === 'saving' && t('ai_uploader.status_saving', '3/3 Guardando tarjetas generadas en Supabase...')}
                </span>
                <span className="text-[11px] text-violet-600 dark:text-violet-400 font-mono uppercase shrink-0">
                  {status === 'uploading' && 'Storage'}
                  {status === 'analyzing' && `${cardCount} Cards`}
                  {status === 'saving' && 'Zustand / DB'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-900 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 transition-all duration-700 ${
                    status === 'uploading'
                      ? 'w-1/4'
                      : status === 'analyzing'
                      ? analyzingPhaseIndex === 0
                        ? 'w-1/3'
                        : analyzingPhaseIndex === 1
                        ? 'w-1/2'
                        : analyzingPhaseIndex === 2
                        ? 'w-2/3'
                        : analyzingPhaseIndex === 3
                        ? 'w-5/6'
                        : 'w-[92%]'
                      : 'w-full'
                  }`}
                />
              </div>
              {status === 'analyzing' && (
                <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                  <span>Generando lote de {cardCount} flashcards ({cardFormat})</span>
                  <span className="font-mono text-violet-500 font-semibold animate-pulse">Fase {analyzingPhaseIndex + 1} de 5</span>
                </div>
              )}
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
                        Audio (.mp3, .wav, .m4a)
                        <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-white leading-none">PRO</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-700 dark:text-purple-300 inline-flex items-center gap-1">
                        Vídeo (.mp4, .mov, .webm)
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
                              {info.category === 'video' && (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
              PASO 2: Páginas y Formato
             ======================================================== */}
          {currentStep === 2 && selectedFile && (
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-150">
              {/* Rango de Páginas si es PDF o DOCX con Casillas Limpias y Modal Táctil */}
              {isPageableDoc ? (
                <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
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

                  {/* 2 Casillas limpias tradicionales para Desde / Hasta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 dark:text-neutral-300 mb-1">
                        {t('ai_uploader.from_page', isEn ? 'Start page:' : 'Desde página:')}
                      </label>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openPageKeypad('start')}
                        className="w-full text-center text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white hover:border-violet-500 dark:hover:border-violet-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer select-none active:scale-[0.99] shadow-xs"
                        title={isEn ? "Click to set start page" : "Toca para fijar página inicial"}
                      >
                        <span className={pageStart ? "font-bold text-violet-600 dark:text-violet-400" : "text-neutral-400"}>
                          {pageStart || '1'}
                        </span>
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 dark:text-neutral-300 mb-1">
                        {t('ai_uploader.to_page', isEn ? 'End page:' : 'Hasta página:')}
                      </label>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openPageKeypad('end')}
                        className="w-full text-center text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white hover:border-violet-500 dark:hover:border-violet-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition cursor-pointer select-none active:scale-[0.99] shadow-xs"
                        title={isEn ? "Click to set end page" : "Toca para fijar página final"}
                      >
                        <span className={pageEnd ? "font-bold text-violet-600 dark:text-violet-400" : "text-neutral-400"}>
                          {pageEnd || (effectiveTotalPages ? String(effectiveTotalPages) : '10')}
                        </span>
                      </button>
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

              {/* Formato de Tarjetas (Grid 2x2 Amplio con textos íntegros y compactos) */}
              <div className="space-y-1.5">
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
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {[
                    {
                      id: 'multiple_choice' as CardFormat,
                      icon: '📝',
                      title: t('card_editor.format_test', isEn ? 'Multiple Choice' : 'Opción Múltiple'),
                      subtitle: t('ai_uploader.format_mc_sub', isEn ? '4-option test with solution' : 'Test con 4 alternativas y solución argumentada'),
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
                        className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer active:scale-[0.99] ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500 text-slate-900 dark:text-white shadow-sm'
                            : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 text-slate-800 dark:text-neutral-300'
                        }`}
                      >
                        <span className="text-base sm:text-lg shrink-0 mt-0.5">{opt.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold leading-tight">{opt.title}</p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5 font-normal">
                            {opt.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selector Enfoque de las Preguntas: Teórico vs Práctico */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🎯</span>
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-neutral-300 flex items-center">
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
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md font-mono text-neutral-500 dark:text-neutral-400">
                    {isPracticalMode
                      ? `🎯 ${t('ai_uploader.approach_practical', isEn ? 'Practical' : 'Práctico')}`
                      : `📖 ${t('ai_uploader.approach_theoretical', isEn ? 'Theoretical' : 'Teórico')}`}
                  </span>
                </div>

                {/* Segmented Control de 2 botones (>= 44px de alto para tap targets mobile-first) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setIsPracticalMode(false)}
                    className={`min-h-[44px] p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer active:scale-[0.99] ${
                      !isPracticalMode
                        ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500 text-slate-900 dark:text-white shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 text-slate-800 dark:text-neutral-300'
                    }`}
                  >
                    <span className="text-base sm:text-lg shrink-0 mt-0.5">📖</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold leading-tight">
                        {t('ai_uploader.approach_theoretical', isEn ? 'Theoretical' : 'Teórico')}
                      </p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5 font-normal">
                        {t('ai_uploader.approach_theoretical_desc', isEn ? 'Direct concepts & facts' : 'Conceptos y datos directos')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setIsPracticalMode(true)}
                    className={`min-h-[44px] p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer active:scale-[0.99] ${
                      isPracticalMode
                        ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500 text-slate-900 dark:text-white shadow-sm'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 text-slate-800 dark:text-neutral-300'
                    }`}
                  >
                    <span className="text-base sm:text-lg shrink-0 mt-0.5">🎯</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold leading-tight">
                        {t('ai_uploader.approach_practical', isEn ? 'Practical' : 'Práctico')}
                      </p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5 font-normal">
                        {t('ai_uploader.approach_practical_desc', isEn ? 'Real-world cases & scenarios' : 'Casos y situaciones reales')}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Botones de navegación Paso 2 */}
              <div className="flex items-center justify-between pt-1.5 sm:pt-2">
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
              PASO 3: Cantidad de Tarjetas (Pantalla Dedicada con Keypad)
             ======================================================== */}
          {currentStep === 3 && selectedFile && (
            <div className="space-y-2.5 sm:space-y-3 animate-in fade-in duration-150 overflow-x-hidden">
              <div className="p-3 sm:p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 text-center space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-neutral-300">
                    {t('ai_uploader.card_count_label', isEn ? 'Card Quantity' : 'Cantidad de Tarjetas')}
                  </label>
                  <span className="text-[11px] font-mono font-bold text-violet-600 dark:text-violet-400">
                    {cardCount} / {maxAllowedCards} MÁX
                  </span>
                </div>

                {/* Display Central Compacto */}
                <div className="py-1 my-0.5 flex flex-col items-center justify-center">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight text-violet-600 dark:text-violet-400 transition-all ${
                      cardKeypadReplaceOnNextKey ? 'bg-violet-500/10 dark:bg-violet-500/20 rounded-lg px-2 ring-1 ring-violet-500/30' : ''
                    }`}>
                      {cardCount === 0 ? '0' : cardCount}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-neutral-500 font-mono">
                      / {maxAllowedCards}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400 font-medium">
                    <span>⏱️ ~{Math.max(1, Math.round(cardCount * 1.5))} min de estudio activo</span>
                    <span>•</span>
                    <span>{pedagogicalMode === 'didactic' ? '👨‍🏫 Modo Docente' : '📚 Repaso FSRS'}</span>
                  </div>
                </div>

                {/* Chips de Selección Rápida Compactos */}
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap pt-0.5">
                  {(pedagogicalMode === 'didactic' ? [5, 10, 15, 20, 30, 40] : [5, 10, 15, 20, 25, 30]).map((num) => (
                    <button
                      key={`preset-card-${num}`}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setCardCount(num);
                        setCardKeypadReplaceOnNextKey(true);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer active:scale-95 ${
                        cardCount === num
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-500/50'
                          : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50 dark:hover:bg-violet-950/30'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {/* Alerta Preventiva Condicional (1 sola página y > 15 tarjetas) */}
                {isSinglePage && cardCount > 15 && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2 shadow-sm animate-in fade-in text-left">
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

                {/* Keypad Táctil 3x4 Compactado */}
                <div className="max-w-[240px] sm:max-w-[260px] mx-auto pt-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'backspace'].map((key) => {
                      const isClear = key === 'C';
                      const isBack = key === 'backspace';
                      return (
                        <button
                          key={`touch-key-${key}`}
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleKeypadPress(key)}
                          className={`h-10 sm:h-11 rounded-xl text-base font-bold font-mono transition-all flex items-center justify-center cursor-pointer active:scale-95 select-none ${
                            isClear
                              ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40'
                              : isBack
                              ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40'
                              : 'bg-white hover:bg-slate-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-800 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-800 shadow-xs'
                          }`}
                        >
                          {isBack ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                            </svg>
                          ) : (
                            key
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botones de navegación Paso 3 */}
              <div className="flex items-center justify-between pt-1.5 sm:pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-xs text-slate-700 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{t('ai_uploader.back_btn', isEn ? 'Back' : 'Atrás')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleProceedToStep4}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs sm:text-sm transition shadow-lg shadow-violet-600/25 active:scale-95 cursor-pointer"
                >
                  <span>{t('ai_uploader.continue_step4', isEn ? 'Continue to Step 4' : 'Continuar al Paso 4')}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
              PASO 4: Modo y Enfoque (Bifurcado Estudio vs Wizard Docente)
             ======================================================== */}
          {currentStep === 4 && selectedFile && (
            <div className="space-y-2.5 sm:space-y-3 animate-in fade-in duration-150 overflow-x-hidden">
              {/* Selector Enfoque Pedagógico: Académico vs Docente */}
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎓</span>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white tracking-tight flex items-center">
                      <span>{t('ai_uploader.pedagogical_mode_label', isEn ? 'Pedagogical Focus' : 'Enfoque Pedagógico')}</span>
                      <InfoTooltip
                        placement="bottom"
                        title={t('ai_uploader.tooltip_pedagogical_title', isEn ? 'Pedagogical Focus Guide' : 'Guía de Enfoque Pedagógico')}
                        content={
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <strong className="text-slate-900 dark:text-white block font-semibold flex items-center gap-1.5">
                                <span>📚</span>
                                <span>{t('ai_uploader.pedagogical_academic_title', isEn ? 'Academic / Self-Study Mode:' : 'Modo Estudio / Académico:')}</span>
                              </strong>
                              <p className="text-neutral-300 mt-0.5 leading-relaxed">
                                {isEn
                                  ? 'Designed for personal mastery, active recall, and exams. Flashcards optimized for retention using the FSRS algorithm.'
                                  : 'Diseñado para el estudio personal, memorización activa y oposiciones. Tarjetas optimizadas para la retención con FSRS.'}
                              </p>
                            </div>
                            <div>
                              <strong className="text-amber-700 dark:text-amber-400 block font-semibold flex items-center gap-1.5">
                                <span>👨‍🏫</span>
                                <span>{t('ai_uploader.pedagogical_didactic_title', isEn ? 'Teacher / Didactic Mode:' : 'Modo Docente / Didáctico:')}</span>
                              </strong>
                              <p className="text-neutral-300 mt-0.5 leading-relaxed">
                                {isEn
                                  ? 'Designed for teachers to create classroom assessments. Calibrates questions using Bloom\'s Taxonomy and age levels.'
                                  : 'Diseñado para profesores. Calibra las preguntas según la Taxonomía de Bloom y tramos de edad escolar sin referencias al documento.'}
                              </p>
                            </div>
                          </div>
                        }
                      />
                    </h4>
                  </div>
                </div>

                {/* Segmented Control */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-200/60 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPedagogicalMode('academic');
                      if (cardCount > 30) setCardCount(30);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 text-center cursor-pointer ${
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
                    onClick={() => {
                      setPedagogicalMode('didactic');
                      setDocenteStep(1);
                    }}
                    className={`py-1.5 px-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 text-center cursor-pointer ${
                      pedagogicalMode === 'didactic'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-sm font-bold'
                        : 'text-slate-900 hover:text-black dark:text-neutral-300 dark:hover:text-white font-medium'
                    } disabled:opacity-50`}
                  >
                    <span>👨‍🏫</span>
                    <span className="truncate">{t('ai_uploader.mode_didactic', isEn ? 'Teacher / Didactic' : 'Docente / Didáctico')}</span>
                  </button>
                </div>
              </div>

              {/* RAMA 1: MODO DOCENTE (WIZARD DE 3 FASES COMPACTAS) */}
              {pedagogicalMode === 'didactic' ? (
                <div className="space-y-2.5 animate-in fade-in duration-200">
                  {/* Sub-Stepper Indicador de Fases Docente */}
                  <div className="px-1 py-0.5">
                    <div className="flex items-center justify-between max-w-xs mx-auto">
                      {[
                        { id: 1 as const, label: isEn ? '1. Structure' : '1. Estructura' },
                        { id: 2 as const, label: isEn ? '2. Bloom & Level' : '2. Calibración' },
                        { id: 3 as const, label: isEn ? '3. Review' : '3. Resumen' },
                      ].map((stepItem, idx) => {
                        const isActive = docenteStep === stepItem.id;
                        const isPassed = docenteStep > stepItem.id;
                        return (
                          <React.Fragment key={stepItem.id}>
                            {idx > 0 && (
                              <div
                                className={`flex-1 h-0.5 mx-2 transition-colors duration-200 ${
                                  isPassed ? 'bg-amber-500' : 'bg-neutral-200 dark:bg-neutral-800'
                                }`}
                              />
                            )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDocenteStep(stepItem.id)}
                              className={`flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer ${
                                isActive
                                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                                  : isPassed
                                  ? 'text-neutral-700 dark:text-neutral-300'
                                  : 'text-neutral-400 dark:text-neutral-600'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                                  isActive
                                    ? 'bg-amber-500 text-white ring-2 ring-amber-500/30 shadow-xs'
                                    : isPassed
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                                }`}
                              >
                                {isPassed ? '✓' : stepItem.id}
                              </span>
                              <span className="truncate">{stepItem.label}</span>
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* FASE 1: Estructura del Examen (Límites y Formato) */}
                  {docenteStep === 1 && (
                    <div className="space-y-2.5 animate-in fade-in duration-150">
                      {/* Micro-aviso didáctico */}
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-950 dark:text-amber-300 text-[11px] leading-snug flex items-center gap-1.5">
                        <span className="text-xs shrink-0">💡</span>
                        <p className="font-medium truncate">
                          {t('ai_uploader.pedagogical_didactic_notice', 'Optimizado para profesores: genera ejercicios de evaluación sin referencias al documento.')}
                        </p>
                      </div>

                      {/* Limitador de Preguntas (Presets 10, 20, 30, 40 + micro-input) */}
                      <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-amber-950 dark:text-amber-200 flex items-center gap-1">
                            <span>🎯</span>
                            <span>{t('ai_uploader.didactic_card_count_label', isEn ? 'Exam Questions' : 'Número de Preguntas')}</span>
                            <InfoTooltip
                              title={t('ai_uploader.tooltip_exam_questions_title', isEn ? 'Exam Question Limit (Max 40)' : 'Límite de Preguntas (Máx 40)')}
                              content={t('ai_uploader.tooltip_exam_questions_desc', isEn ? 'Configure questions for this exam (max 40).' : 'Define cuántas preguntas quieres para este examen (máx 40).')}
                            />
                          </label>
                          <span className="text-[11px] font-mono font-bold text-amber-950 dark:text-amber-200 bg-amber-200/60 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700">
                            {cardCount} {isEn ? 'questions' : 'preguntas'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1 flex-1">
                            {[10, 20, 30, 40].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                disabled={isBusy}
                                onClick={() => setCardCount(preset)}
                                className={`flex-1 py-1 px-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                  cardCount === preset
                                    ? 'bg-amber-500 text-white shadow-xs ring-1 ring-amber-600'
                                    : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:border-amber-300'
                                } disabled:opacity-50`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <div className="w-16 shrink-0">
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
                              className="w-full text-center text-xs font-mono font-bold py-1 px-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Selector de Formato de Evaluación Docente en Grid Compacto 3x2 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-800 dark:text-neutral-200 flex items-center gap-1">
                            <span>📋</span>
                            <span>{t('ai_uploader.docente_format_label', isEn ? 'Assessment Format' : 'Formato de Evaluación')}</span>
                            <InfoTooltip
                              title={t('ai_uploader.tooltip_docente_formats_title', isEn ? 'Teacher Formats' : 'Guía de Formatos')}
                              content={
                                <div className="space-y-1.5 text-[11px]">
                                  <p>🎯 <strong>Test Variado:</strong> Combina los 4 formatos distribuidos según Bloom.</p>
                                  <p>📝 <strong>Solo Test:</strong> 4 opciones con respuesta única justificada.</p>
                                  <p>⚖️ <strong>Solo V/F:</strong> Afirmaciones críticas razonadas.</p>
                                  <p>🧩 <strong>Solo Huecos:</strong> Conceptos clave entre corchetes [...].</p>
                                  <p>🃏 <strong>Pregunta Corta:</strong> Respuestas concisas y directas.</p>
                                  <p>📋 <strong>Casos con Rúbrica:</strong> Supuestos con baremo de corrección.</p>
                                </div>
                              }
                            />
                          </label>
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 font-mono font-medium">
                            Taxonomía Bloom
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {[
                            { id: 'mixed_test' as const, icon: '🎯', title: isEn ? 'Mixed Test' : 'Test Variado' },
                            { id: 'multiple_choice' as const, icon: '📝', title: isEn ? 'Multiple Choice' : 'Solo Test' },
                            { id: 'true_false' as const, icon: '⚖️', title: isEn ? 'True or False' : 'Solo V / F' },
                            { id: 'cloze' as const, icon: '🧩', title: isEn ? 'Cloze / Fill-in' : 'Solo Huecos' },
                            { id: 'basic' as const, icon: '🃏', title: isEn ? 'Short Question' : 'Pregunta Corta' },
                            { id: 'open_cases' as const, icon: '📋', title: isEn ? 'Cases + Rubric' : 'Casos + Rúbrica' },
                          ].map((item) => {
                            const isSelected = docenteFormat === item.id;
                            return (
                              <button
                                key={`docente-fmt-${item.id}`}
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setDocenteFormat(item.id);
                                  if (item.id === 'open_cases') setCardFormat('basic');
                                  else if (item.id !== 'mixed_test') setCardFormat(item.id);
                                }}
                                className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  isSelected
                                    ? 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400/50 shadow-xs font-semibold'
                                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                                }`}
                              >
                                <span className="text-sm">{item.icon}</span>
                                <span className="text-xs font-semibold truncate">{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Botones Navegación Fase 1 */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setCurrentStep(3)}
                          className="px-3.5 py-2 text-xs text-slate-700 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          <span>{t('ai_uploader.back_btn', isEn ? 'Back' : 'Atrás')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDocenteStep(2)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs transition shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
                        >
                          <span>{isEn ? 'Calibrate Bloom & Age' : 'Continuar a Calibración'}</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* FASE 2: Calibración y Audiencia (Bloom & Profundidad) */}
                  {docenteStep === 2 && (
                    <div className="space-y-2.5 animate-in fade-in duration-150">
                      {/* Selector Audiencia / Nivel Educativo en layout horizontal compacto */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-800 dark:text-neutral-200 flex items-center gap-1">
                            <span>🎓</span>
                            <span>{t('ai_uploader.target_audience_label', isEn ? 'Target Audience / Level' : 'Nivel Educativo del Alumnado')}</span>
                            <InfoTooltip
                              title={t('ai_uploader.tooltip_target_audience_title', isEn ? 'Cognitive Calibration' : 'Calibración por Nivel')}
                              content={
                                <div className="space-y-1.5 text-[11px]">
                                  <p>🤖 <strong>Auto:</strong> Adapta según complejidad del texto.</p>
                                  <p>🎨 <strong>Primaria (9-11):</strong> Lenguaje sencillo y analogías cotidianas.</p>
                                  <p>🎒 <strong>Secundaria (12-14):</strong> Conceptos directos y taxonomías.</p>
                                  <p>🏫 <strong>Bachillerato (15-17):</strong> Rigor preuniversitario y análisis causa-efecto.</p>
                                  <p>🏛️ <strong>Universidad / Opos (+18):</strong> Máximo rigor técnico y excepciones.</p>
                                </div>
                              }
                            />
                          </label>
                          <span className="text-[10px] text-neutral-500 font-mono">Bloom adaptativo</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                          {[
                            { id: 'auto' as const, icon: '🤖', title: isEn ? 'Auto' : 'Auto' },
                            { id: '9-11_years' as const, icon: '🎨', title: isEn ? '9-11 yrs' : '9-11 años' },
                            { id: '12-14_years' as const, icon: '🎒', title: isEn ? '12-14 yrs' : '12-14 años' },
                            { id: '15-17_years' as const, icon: '🏫', title: isEn ? '15-17 yrs' : '15-17 años' },
                            { id: 'university_plus' as const, icon: '🏛️', title: isEn ? 'Univ / Pro' : 'Univ / Opos' },
                          ].map((item) => (
                            <button
                              key={`docente-aud-${item.id}`}
                              type="button"
                              disabled={isBusy}
                              onClick={() => setTargetAudience(item.id)}
                              className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                                targetAudience === item.id
                                  ? 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400/50 font-semibold shadow-xs'
                                  : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                              }`}
                            >
                              <span className="text-base">{item.icon}</span>
                              <span className="text-[11px] font-semibold leading-tight truncate">{item.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Nivel de Exigencia (Modo Exhaustivo / Quirúrgico compacto) */}
                      <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/80 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">⚡</span>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{isExhaustiveMode ? 'Modo Quirúrgico (Exhaustivo)' : 'Modo Normal (Estándar)'}</span>
                              <InfoTooltip
                                title="Profundidad de Examen"
                                content="Normal: Conceptos troncales 80/20. Quirúrgico: Analiza tablas, cifras y excepciones con máximo rigor."
                              />
                            </h4>
                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                              {isExhaustiveMode ? 'Desglose quirúrgico de tablas y detalles finos' : 'Enfoque en conceptos clave troncales'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isExhaustiveMode}
                          disabled={isBusy}
                          onClick={() => setIsExhaustiveMode(!isExhaustiveMode)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            isExhaustiveMode ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-700'
                          } disabled:opacity-50`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                              isExhaustiveMode ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Enfoque temático en acordeón colapsable */}
                      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/60 p-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setShowThematicFocus(!showThematicFocus)}
                          className="w-full flex items-center justify-between text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white font-medium cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🎯</span>
                            <span>{showThematicFocus ? 'Enfoque temático específico (activo)' : '+ Añadir directiva o tema específico'}</span>
                          </span>
                          <span className="text-[11px] text-neutral-400">{showThematicFocus ? '▲' : '▼'}</span>
                        </button>
                        {showThematicFocus && (
                          <div className="pt-2 animate-in fade-in duration-150">
                            <textarea
                              rows={2}
                              disabled={isBusy}
                              value={customPrompt}
                              onChange={(e) => setCustomPrompt(e.target.value)}
                              placeholder={t('ai_uploader.focus_prompt_placeholder', "Ej: 'Centrar en el Cuadro 5-3 y extraer dosis farmacológicas'...")}
                              className="w-full text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none font-medium"
                            />
                          </div>
                        )}
                      </div>

                      {/* Botones Navegación Fase 2 */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDocenteStep(1)}
                          className="px-3.5 py-2 text-xs text-slate-700 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          <span>{isEn ? 'Back' : 'Atrás'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDocenteStep(3)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs transition shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
                        >
                          <span>{isEn ? 'Review & Launch' : 'Continuar a Revisión'}</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* FASE 3: Resumen y Lanzamiento "Actions-First" */}
                  {docenteStep === 3 && (
                    <div className="space-y-2.5 animate-in fade-in duration-150">
                      {/* Ficha Resumen Compacta */}
                      <div className="p-2.5 sm:p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 font-mono text-[10px] font-semibold">
                          <span>RESUMEN EXAMEN DOCENTE</span>
                          <span className="text-amber-600 dark:text-amber-400 font-bold">Fase 3 de 3</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                            <span>📄</span>
                            <span className="truncate max-w-[130px] sm:max-w-[180px]" title={selectedFile.name}>{selectedFile.name}</span>
                          </span>
                          {isPageableDoc && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[11px]">
                              <span>📖</span>
                              <span>Págs {pageStart.trim() || 1}–{pageEnd.trim() || (effectiveTotalPages || 'Fin')}</span>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold font-mono text-[11px] border border-amber-500/30">
                            <span>🎯 {cardCount} preguntas</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium">
                            <span>📋</span>
                            <span>
                              {docenteFormat === 'mixed_test'
                                ? 'Test Variado (Bloom)'
                                : docenteFormat === 'multiple_choice'
                                ? 'Solo Test'
                                : docenteFormat === 'true_false'
                                ? 'Solo V/F'
                                : docenteFormat === 'cloze'
                                ? 'Solo Huecos'
                                : docenteFormat === 'basic'
                                ? 'Pregunta Corta'
                                : 'Casos con Rúbrica'}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[11px]">
                            <span>🎓</span>
                            <span>
                              {targetAudience === 'auto'
                                ? 'Auto'
                                : targetAudience === '9-11_years'
                                ? '9-11 años'
                                : targetAudience === '12-14_years'
                                ? '12-14 años'
                                : targetAudience === '15-17_years'
                                ? '15-17 años'
                                : 'Universidad / Opos'}
                            </span>
                          </span>
                          {isExhaustiveMode && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 font-mono text-[11px] font-bold">
                              <span>⚡ Quirúrgico</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botón Primario de Lanzamiento "Actions-First" */}
                      <button
                        type="button"
                        disabled={isBusy || !selectedFile}
                        onClick={() => handleProcessDocument()}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span className="truncate max-w-[240px] sm:max-w-xs">
                              {status === 'uploading'
                                ? (isEn ? 'Uploading document...' : 'Subiendo documento...')
                                : status === 'analyzing'
                                ? currentAnalyzingPhase
                                : status === 'saving'
                                ? (isEn ? 'Saving cards...' : 'Guardando tarjetas...')
                                : (isEn ? 'Processing...' : 'Procesando...')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-base">🚀</span>
                            <span>
                              {isEn
                                ? `Generate Teacher Exam (${cardCount} Questions)`
                                : `Generar Examen Docente (${cardCount} Preguntas)`}
                            </span>
                          </>
                        )}
                      </button>

                      {/* Botón Secundario */}
                      <div className="flex items-center justify-between pt-0.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDocenteStep(2)}
                          className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition cursor-pointer font-medium"
                        >
                          ← Volver a Calibración
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDocenteStep(1)}
                          className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer underline underline-offset-4"
                        >
                          Modificar Formato / Preguntas
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* RAMA 2: MODO ESTUDIO ESTÁNDAR (ACADÉMICO / FSRS) */
                <div className="space-y-2.5 animate-in fade-in duration-200">
                  {/* Modo Exhaustivo - Toggle/Switch destacado con Tooltip */}
                  <div
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
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
                                    <strong className="text-slate-900 dark:text-white block font-semibold">
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
                                    <strong className="text-violet-700 dark:text-violet-400 block font-semibold">
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
                <div className="p-2.5 sm:p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center">
                      <span>{t('ai_uploader.thematic_focus_label', isEn ? '🎯 Thematic Focus (Optional)' : '🎯 Enfoque Temático (Opcional)')}</span>
                      <InfoTooltip
                        title={t('ai_uploader.tooltip_focus_title', isEn ? 'Filtering and Focus Examples' : 'Ejemplos de Filtrado y Enfoque')}
                        content={t(
                          'ai_uploader.tooltip_focus_content',
                          isEn
                            ? 'Use this field to guide the AI and filter information within the chosen pages.'
                            : 'Usa este campo para guiar a la IA y filtrar la información dentro de las páginas elegidas.'
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

                {/* Ficha Resumen Pre-Vuelo */}
                <div className="p-2.5 sm:p-3 rounded-2xl bg-neutral-100/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 font-mono text-[10px] sm:text-[11px] font-semibold">
                    <span>FICHA RESUMEN PRE-LANZAMIENTO</span>
                    <span className="text-violet-600 dark:text-violet-400">Paso 4 de 4</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-slate-800 dark:text-neutral-200 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                      <span>📄</span>
                      <span className="truncate max-w-[130px] sm:max-w-[200px]" title={selectedFile.name}>{selectedFile.name}</span>
                    </span>
                    {isPageableDoc && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[11px]">
                        <span>📖</span>
                        <span>Págs {pageStart.trim() || 1}–{pageEnd.trim() || (effectiveTotalPages || 'Fin')}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 font-semibold text-[11px]">
                      <span>{cardFormat === 'multiple_choice' ? '📝 Test' : cardFormat === 'basic' ? '🃏 Básica' : cardFormat === 'cloze' ? '🧩 Cloze' : '⚖️ V/F'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold font-mono text-[11px]">
                      <span>🎯 {cardCount} tarjetas</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                      <span>📚 Estudio</span>
                    </span>
                    {isExhaustiveMode && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 font-mono text-[11px] font-bold">
                        <span>⚡ Quirúrgico</span>
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                      isPracticalMode 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                    }`}>
                      <span>{isPracticalMode ? '🎯 Práctico' : '📖 Teórico'}</span>
                    </span>
                  </div>
                </div>

                {/* Botones de navegación Modo Estudio */}
                <div className="flex items-center justify-between pt-1 sm:pt-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setCurrentStep(3)}
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
                        <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="truncate max-w-[240px] sm:max-w-xs">
                          {status === 'uploading'
                            ? (isEn ? 'Uploading document...' : 'Subiendo documento...')
                            : status === 'analyzing'
                            ? currentAnalyzingPhase
                            : status === 'saving'
                            ? (isEn ? 'Saving cards...' : 'Guardando tarjetas...')
                            : (isEn ? 'Processing...' : 'Procesando...')}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>
                          {isPageableDoc
                            ? (typeof nextCursorPage === 'number' && (!activeRunEndPage || nextCursorPage <= activeRunEndPage)
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
        </div>
      )}

      {/* Modal Diálogo Numérico Táctil para Selección de Página (z-[100] sin teclado OS) */}
      {pageKeypadModal.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setPageKeypadModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div
            className="w-[92vw] max-w-xs mx-auto p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>📖</span>
                <span>
                  {pageKeypadModal.target === 'start'
                    ? (isEn ? 'Select Start Page' : 'Página Inicial (Desde)')
                    : (isEn ? 'Select End Page' : 'Página Final (Hasta)')}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setPageKeypadModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Cerrar modal"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visor Grande del Número */}
            <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/80 border border-neutral-200 dark:border-neutral-800 text-center">
              <div className="flex items-baseline justify-center gap-1.5">
                <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight text-violet-600 dark:text-violet-400 transition-all ${
                  pageKeypadModal.replaceOnNextKey ? 'bg-violet-500/10 dark:bg-violet-500/20 rounded-lg px-2 ring-1 ring-violet-500/30' : ''
                }`}>
                  {pageKeypadModal.tempValue === 0 ? '0' : pageKeypadModal.tempValue}
                </span>
                {effectiveTotalPages && (
                  <span className="text-xs font-semibold text-neutral-500 font-mono">
                    / {effectiveTotalPages}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {pageKeypadModal.target === 'start'
                  ? (effectiveTotalPages ? `Rango permitido: 1 a ${effectiveTotalPages}` : 'Indica la página de inicio')
                  : (effectiveTotalPages ? `Rango permitido: hasta ${effectiveTotalPages}` : 'Indica la página final')}
              </p>
            </div>

            {/* Keypad Táctil 3x4 */}
            <div className="max-w-[240px] mx-auto">
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'backspace'].map((key) => {
                  const isClear = key === 'C';
                  const isBack = key === 'backspace';
                  return (
                    <button
                      key={`page-modal-key-${key}`}
                      type="button"
                      onClick={() => handlePageModalKeypadPress(key)}
                      className={`h-10 rounded-xl text-base font-bold font-mono transition-all flex items-center justify-center cursor-pointer active:scale-95 select-none ${
                        isClear
                          ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40'
                          : isBack
                          ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40'
                          : 'bg-white hover:bg-slate-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 shadow-xs'
                      }`}
                    >
                      {isBack ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                        </svg>
                      ) : (
                        key
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botones de acción */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageKeypadModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-center cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={handleConfirmPageModal}
                className="flex-1 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition shadow-md shadow-violet-600/20 active:scale-95 text-center cursor-pointer"
              >
                {isEn ? 'Set Page' : 'Fijar Página'}
              </button>
            </div>
          </div>
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
