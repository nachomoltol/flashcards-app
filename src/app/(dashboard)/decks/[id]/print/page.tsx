'use client';

import React, { use, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, AlertCircle, Loader2 } from 'lucide-react';
import { PrintExamSheet } from '@/components/decks/PrintExamSheet';
import { getDeckForPrintAction, type PrintDeckData } from '@/app/actions/getDeckForPrint';

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default function DeckPrintPage({ params }: PrintPageProps) {
  const { id } = use(params);
  const [deckData, setDeckData] = useState<PrintDeckData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTriggeredPrintRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await getDeckForPrintAction(id);
      if (isCancelled) return;

      if (res.error || !res.data) {
        setErrorMessage(res.error || 'No se pudo cargar el mazo solicitado');
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
  }, [id]);

  // Al finalizar de cargar y renderizar los datos, disparar el diálogo nativo de impresión
  useEffect(() => {
    if (!deckData || isLoading || hasTriggeredPrintRef.current) return;
    if (deckData.cards.length === 0) return;

    hasTriggeredPrintRef.current = true;
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.print();
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [deckData, isLoading]);

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
          Preparando examen para impresión...
        </p>
      </div>
    );
  }

  if (errorMessage || !deckData) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 max-w-md">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <p className="text-xs font-medium">{errorMessage || 'Error al cargar el mazo'}</p>
        </div>
        <Link
          href={`/decks/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al mazo</span>
        </Link>
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
            {deckData.cards.length} preguntas
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
          deckTitle={deckData.title}
          deckDescription={deckData.description}
          cards={deckData.cards}
          pedagogicalMode={isDocente ? 'didactic' : 'academic'}
          isDocenteMode={isDocente}
          forceVisible={true}
        />
      </main>
    </div>
  );
}

