'use client';

import React, { Suspense, use, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer, AlertCircle, Loader2, LogIn, FileText } from 'lucide-react';
import { PrintExamSheet } from '@/components/decks/PrintExamSheet';
import {
  StudyGuidePrintableContent,
  STUDY_GUIDE_PRINT_CSS,
} from '@/components/decks/QuickStudyGuideModal';
import {
  getDeckForPrintAction,
  getGuideForPrintAction,
  type PrintDeckData,
  type PrintGuideData,
} from '@/app/actions/getDeckForPrint';
import { supabase } from '@/lib/supabase';

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

function DeckPrintContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'guide' ? 'guide' : 'exam';
  const pt = searchParams.get('pt') || undefined;
  const lang: 'es' | 'en' = searchParams.get('lang') === 'en' ? 'en' : 'es';

  const [deckData, setDeckData] = useState<PrintDeckData | null>(null);
  const [guideData, setGuideData] = useState<PrintGuideData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<
    'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVER_ERROR' | undefined
  >(undefined);
  const hasTriggeredPrintRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    hasTriggeredPrintRef.current = false;

    async function loadData() {
      setIsLoading(true);
      setErrorMessage(null);
      setErrorCode(undefined);

      let accessToken: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token;
      } catch {
        // Sin sesión local activa en este navegador
      }

      if (mode === 'guide') {
        const res = await getGuideForPrintAction(id, lang, accessToken, pt);
        if (isCancelled) return;

        if (res.error || !res.data) {
          setErrorMessage(
            res.error ||
              (lang === 'en'
                ? 'Could not load the study guide for printing.'
                : 'No se pudo cargar la guía de estudio solicitada.')
          );
          setErrorCode(res.code);
          setIsLoading(false);
          return;
        }

        setGuideData(res.data);
        setIsLoading(false);
        return;
      }

      const res = await getDeckForPrintAction(id, accessToken, pt);
      if (isCancelled) return;

      if (res.error || !res.data) {
        setErrorMessage(res.error || 'No se pudo cargar el mazo solicitado');
        setErrorCode(res.code);
        setIsLoading(false);
        return;
      }

      setDeckData(res.data);
      setIsLoading(false);
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [id, mode, pt, lang]);

  // Al finalizar de cargar y renderizar los datos, disparar el diálogo nativo de impresión
  useEffect(() => {
    if (isLoading || hasTriggeredPrintRef.current) return;
    if (mode === 'guide' && !guideData) return;
    if (mode === 'exam' && (!deckData || deckData.cards.length === 0)) return;

    hasTriggeredPrintRef.current = true;
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.print();
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [mode, deckData, guideData, isLoading]);

  const isDocente = Boolean(
    deckData?.description?.toLowerCase().includes('docente') ||
      deckData?.description?.toLowerCase().includes('didactic') ||
      deckData?.title?.toLowerCase().includes('modo docente')
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-semibold text-neutral-600">
          {mode === 'guide'
            ? lang === 'en'
              ? 'Preparing study guide for PDF / Print...'
              : 'Preparando guía de estudio para impresión / PDF...'
            : 'Preparando examen para impresión...'}
        </p>
      </div>
    );
  }

  if (errorMessage || (mode === 'guide' ? !guideData : !deckData)) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 max-w-md shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <p className="text-xs font-medium leading-relaxed">
            {errorMessage || 'Error al cargar el contenido de impresión'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {errorCode === 'AUTH_REQUIRED' && (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>{lang === 'en' ? 'Sign in' : 'Iniciar sesión'}</span>
            </Link>
          )}
          <Link
            href={`/decks/${id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'en' ? 'Back to deck' : 'Volver al mazo'}</span>
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'guide' && guideData) {
    return (
      <div className="min-h-screen bg-white text-black p-4 sm:p-8">
        <style>{STUDY_GUIDE_PRINT_CSS}</style>

        {/* Barra de utilidades flotante superior (exclusiva de pantalla, oculta en papel) */}
        <nav className="no-print print:hidden mb-6 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-100 border border-neutral-300 shadow-sm max-w-5xl mx-auto">
          <Link
            href={`/decks/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-black transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'en' ? 'Back to deck' : 'Volver al mazo'}</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-700 font-semibold">
              <FileText className="w-3.5 h-3.5" />
              <span>
                {lang === 'en' ? 'Study Guide' : 'Guía de Estudio'} ({guideData.guide.cardCount}{' '}
                cards)
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.print();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {lang === 'en' ? 'Print / Save PDF' : 'Imprimir / Guardar como PDF'}
              </span>
            </button>
          </div>
        </nav>

        {/* Contenedor imprimible de la Guía de Estudio Rápida (idéntico al modal) */}
        <main className="max-w-5xl mx-auto">
          <div
            id="quick-study-guide-printable"
            className="rounded-3xl bg-neutral-900 border border-neutral-800 p-4 sm:p-6 space-y-5 print:space-y-3 text-left relative"
          >
            <StudyGuidePrintableContent
              guide={guideData.guide}
              deckTitle={guideData.deckTitle}
              isUnlocked={true}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black p-4 sm:p-8">
      {/* Barra de utilidades flotante superior (exclusiva de pantalla, oculta en papel) */}
      <nav className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-100 border border-neutral-300 shadow-sm max-w-4xl mx-auto">
        <Link
          href={`/decks/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-black transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al mazo</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-neutral-500 font-semibold">
            {deckData!.cards.length} preguntas
          </span>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.print();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / Guardar como PDF</span>
          </button>
        </div>
      </nav>

      {/* Contenedor central del examen */}
      <main className="max-w-4xl mx-auto">
        <PrintExamSheet
          deckTitle={deckData!.title}
          deckDescription={deckData!.description}
          cards={deckData!.cards}
          pedagogicalMode={isDocente ? 'didactic' : 'academic'}
          isDocenteMode={isDocente}
          forceVisible={true}
        />
      </main>
    </div>
  );
}

export default function DeckPrintPage({ params }: PrintPageProps) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 space-y-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-neutral-600">
            Preparando vista de impresión...
          </p>
        </div>
      }
    >
      <DeckPrintContent id={id} />
    </Suspense>
  );
}

