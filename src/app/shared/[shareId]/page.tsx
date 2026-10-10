'use client';
/* eslint-disable @next/next/no-img-element */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores';
import { importSharedDeck } from '@/app/actions/importSharedDeck';
import { FormattedCardView } from '@/components/cards/FormattedCardView';
import type { CardFormat } from '@/types/database';

interface SharedDeckPageProps {
  params: Promise<{ shareId: string }>;
}

interface SharedDeckData {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  is_public: boolean;
  share_id: string;
  created_at: string;
  cards: {
    id: string;
    front: string;
    back: string;
    card_format: CardFormat;
    card_type?: string;
  }[];
}

export default function SharedDeckPage({ params }: SharedDeckPageProps) {
  const { shareId } = use(params);
  const router = useRouter();
  const { user, initialize: initAuth } = useAuthStore();

  const [deck, setDeck] = useState<SharedDeckData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    const fetchSharedDeck = async () => {
      setIsLoading(true);
      setNotFound(false);
      try {
        const { data, error } = await supabase
          .from('decks')
          .select('id, title, description, color, is_public, share_id, created_at, cards(id, front, back, card_format, card_type)')
          .eq('share_id', shareId)
          .eq('is_public', true)
          .single();

        if (error || !data) {
          console.warn('Mazo compartido no encontrado:', error);
          setNotFound(true);
        } else {
          const rawCards = Array.isArray(data.cards) ? data.cards : [];
          setDeck({
            ...(data as unknown as SharedDeckData),
            cards: rawCards as unknown as SharedDeckData['cards'],
          });
        }
      } catch (err) {
        console.error('Error al cargar el mazo compartido:', err);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSharedDeck();
  }, [shareId]);

  const handleImport = async () => {
    if (!deck) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const targetUserId = user?.id;
      const result = await importSharedDeck(shareId, targetUserId);

      if (!result.success || !result.newDeckId) {
        setImportError(result.error || 'No se pudo importar el mazo. Inténtalo de nuevo.');
        setIsImporting(false);
        return;
      }

      // Redirigir al usuario al nuevo mazo importado
      router.push(`/decks/${result.newDeckId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado durante la importación';
      setImportError(msg);
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-2xl space-y-6 animate-pulse">
          <div className="h-10 w-48 bg-neutral-900 rounded-xl mx-auto" />
          <div className="p-8 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4">
            <div className="h-6 w-3/4 bg-neutral-800 rounded-lg mx-auto" />
            <div className="h-4 w-1/2 bg-neutral-800/60 rounded mx-auto" />
            <div className="h-12 w-56 bg-neutral-800 rounded-xl mx-auto mt-6" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-neutral-900/50 rounded-2xl border border-neutral-800/60" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !deck) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center p-8 rounded-3xl bg-neutral-900/80 border border-neutral-800 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center text-2xl mx-auto">
            🔒
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Mazo no disponible
            </h1>
            <p className="text-xs text-neutral-400 leading-relaxed">
              El mazo que intentas ver no existe, su enlace ha caducado o su propietario ha desactivado el acceso público.
            </p>
          </div>
          <Link
            href="/decks"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition active:scale-95"
          >
            <span>Ir a Mis Mazos</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    );
  }

  const cardsCount = deck.cards?.length || 0;
  const previewCards = (deck.cards || []).slice(0, 3);
  const remainingCardsCount = Math.max(0, cardsCount - 3);
  const accentColor = deck.color || '#6366f1';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/decks" className="flex items-center gap-2.5 group">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-8 h-8 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform"
            />
            <span className="font-bold text-sm tracking-tight text-white group-hover:text-amber-300 transition-colors">
              Flashmente
            </span>
          </Link>

          <Link
            href="/decks"
            className="text-xs font-medium text-neutral-400 hover:text-white px-3 py-1.5 rounded-xl hover:bg-neutral-900 transition flex items-center gap-1.5"
          >
            <span>Mis Mazos</span>
            <span>→</span>
          </Link>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-in fade-in duration-300">
        {/* Error Banner */}
        {importError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 shadow-lg">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <strong className="font-semibold block text-rose-200">Error al importar:</strong>
              {importError}
            </div>
          </div>
        )}

        {/* Hero Card */}
        <div className="relative rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900/90 to-neutral-950 p-6 sm:p-8 shadow-2xl space-y-6 text-center overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ backgroundColor: accentColor }}
          />

          {/* Badge */}
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <span>🔗</span>
              <span>Mazo Compartido Público</span>
            </span>
          </div>

          {/* Title & Description */}
          <div className="space-y-2.5 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-2.5">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0 shadow-md"
                style={{ backgroundColor: accentColor }}
              />
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {deck.title}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              {deck.description || 'Mazo de estudio con tarjetas de repetición espaciada.'}
            </p>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
            <div className="px-4 py-2 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs font-medium text-neutral-300 flex items-center gap-2">
              <span className="text-indigo-400 font-bold font-mono text-sm">{cardsCount}</span>
              <span>{cardsCount === 1 ? 'tarjeta disponible' : 'tarjetas disponibles'}</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs font-medium text-neutral-300 flex items-center gap-2">
              <span>🌱</span>
              <span>FSRS virgen (estudio desde cero)</span>
            </div>
          </div>

          {/* Main Action Button: Importar a mis Mazos */}
          <div className="pt-3 max-w-md mx-auto">
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImport}
              className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-xl shadow-indigo-600/30 transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importando y configurando tarjetas vírgenes...</span>
                </>
              ) : (
                <>
                  <span className="text-lg">📥</span>
                  <span>Importar a mis Mazos</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-neutral-500 mt-2.5">
              Al importar, se creará una copia completa en tu colección. Tus repasos comenzarán desde cero.
            </p>
          </div>
        </div>

        {/* Preview Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
              <span>👁️</span>
              <span>Vista previa ({Math.min(3, cardsCount)} de {cardsCount} tarjetas)</span>
            </h2>
            <span className="text-xs text-neutral-500 font-mono">
              Primeras 3 preguntas
            </span>
          </div>

          {previewCards.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-neutral-800 bg-neutral-900/40 text-neutral-400 text-xs">
              Este mazo no tiene tarjetas todavía.
            </div>
          ) : (
            <div className="space-y-3.5">
              {previewCards.map((card, idx) => (
                <div
                  key={card.id || idx}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 shadow-sm space-y-2 hover:border-neutral-700/80 transition"
                >
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono pb-2 border-b border-neutral-800/60">
                    <span className="font-semibold text-indigo-400">Tarjeta #{idx + 1}</span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px] uppercase">
                      {card.card_format || 'básica'}
                    </span>
                  </div>

                  <FormattedCardView
                    front={card.front}
                    back={card.back}
                    cardFormat={card.card_format || 'basic'}
                    isRevealed={true}
                    interactive={false}
                  />
                </div>
              ))}

              {remainingCardsCount > 0 && (
                <div className="p-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 text-center space-y-1">
                  <p className="text-xs font-semibold text-neutral-300">
                    +{remainingCardsCount} {remainingCardsCount === 1 ? 'tarjeta adicional más' : 'tarjetas adicionales más'}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    Todas las tarjetas del mazo se incluirán automáticamente cuando hagas clic en &ldquo;Importar a mis Mazos&rdquo;.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
