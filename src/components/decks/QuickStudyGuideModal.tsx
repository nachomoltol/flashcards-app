'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  FileText,
  Printer,
  Sparkles,
  Lock,
  Crown,
  PlayCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Table,
  Hash,
  Lightbulb,
} from 'lucide-react';
import { useLanguageStore, useAuthStore, useProModalStore } from '@/stores';
import { supabase } from '@/lib/supabase';
import {
  getOrGenerateDeckSummaryAction,
  type DeckSummaryGuide,
} from '@/app/actions/generateDeckSummary';
import { showAdMobRewardedAd } from '@/lib/admob';
import { claimAdRewardAction } from '@/app/actions/claimAdReward';

interface QuickStudyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: string;
  deckTitle: string;
}

export function QuickStudyGuideModal({
  isOpen,
  onClose,
  deckId,
  deckTitle,
}: QuickStudyGuideModalProps) {
  const { t, language } = useLanguageStore();
  const { user } = useAuthStore();
  const { openProModal } = useProModalStore();

  const [guide, setGuide] = useState<DeckSummaryGuide | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isAdUnlocked, setIsAdUnlocked] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);

  // Comprobar suscripción PRO del usuario
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

  // Cargar o generar la guía al abrir el modal
  const fetchGuide = useCallback(
    async (force = false) => {
      if (!deckId) return;
      if (force) {
        setIsRegenerating(true);
      } else {
        setIsLoading(true);
      }
      setErrorMsg(null);

      try {
        const res = await getOrGenerateDeckSummaryAction(
          deckId,
          user?.id,
          language === 'en' ? 'en' : 'es',
          force
        );

        if (res.success && res.summary) {
          setGuide(res.summary);
        } else {
          setErrorMsg(res.error || t('quick_guide.error_generic', 'No se pudo generar la guía.'));
        }
      } catch (err) {
        console.error('Error al obtener guía de repaso rápido:', err);
        setErrorMsg(t('quick_guide.error_generic', 'No se pudo generar la guía.'));
      } finally {
        setIsLoading(false);
        setIsRegenerating(false);
      }
    },
    [deckId, user?.id, language, t]
  );

  useEffect(() => {
    if (isOpen) {
      fetchGuide(false);
    }
  }, [isOpen, fetchGuide]);

  // Manejar tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Desbloqueo mediante anuncio bonificado AdMob
  const handleWatchAd = async () => {
    setAdError(null);
    setIsWatchingAd(true);
    try {
      const adResult = await showAdMobRewardedAd();
      if (adResult.completed) {
        const claim = await claimAdRewardAction(user?.id);
        if (claim.success) {
          setIsAdUnlocked(true);
        } else {
          setAdError(claim.message || t('quick_guide.ad_failed', 'Debes completar el anuncio para desbloquear.'));
        }
      } else {
        setAdError(adResult.error || t('quick_guide.ad_failed', 'Debes completar el anuncio para desbloquear.'));
      }
    } catch (err) {
      console.warn('Error al ver anuncio:', err);
      setAdError(t('quick_guide.ad_failed', 'Debes completar el anuncio para desbloquear.'));
    } finally {
      setIsWatchingAd(false);
    }
  };

  const isUnlocked = isPro || isAdUnlocked;

  const handlePrintGuide = () => {
    if (!isUnlocked) {
      openProModal(true);
      return;
    }

    const printContent = document.getElementById('quick-study-guide-printable');
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      // Fallback si el bloqueador de popups actúa:
      window.print();
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Flashmente - Guía de Repaso: ${deckTitle}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page {
              size: A4;
              margin: 12mm 15mm;
            }
            body {
              background-color: #ffffff !important;
              color: #111827 !important;
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .break-inside-avoid {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            /* Adaptar las tarjetas del modal a impresión limpia con fondo blanco y bordes nítidos */
            .bg-neutral-950,
            .bg-neutral-950\\/60,
            .bg-neutral-900,
            .bg-neutral-900\\/50,
            .bg-neutral-900\\/60,
            .bg-neutral-900\\/80,
            .bg-neutral-900\\/90 {
              background-color: #ffffff !important;
              color: #111827 !important;
              border-color: #e5e7eb !important;
            }
            .text-white,
            .text-neutral-100,
            .text-neutral-200,
            .text-neutral-300,
            .text-neutral-400 {
              color: #111827 !important;
            }
            .text-neutral-500,
            .text-neutral-600 {
              color: #4b5563 !important;
            }
            .print-card {
              background-color: #ffffff !important;
              color: #111827 !important;
              border: 1px solid #e5e7eb !important;
              border-radius: 12px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            p, h1, h2, h3, h4, h5, h6, span, tr, td, th, li {
              break-inside: auto;
              page-break-inside: auto;
            }
            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            .print-table th {
              background-color: #f3f4f6 !important;
              color: #111827 !important;
              border: 1px solid #d1d5db !important;
              padding: 6px 10px !important;
              font-weight: 700 !important;
            }
            .print-table td {
              background-color: #ffffff !important;
              color: #111827 !important;
              border: 1px solid #e5e7eb !important;
              padding: 6px 10px !important;
            }
            .bg-amber-500\\/10,
            .bg-violet-500\\/10,
            .bg-emerald-500\\/10,
            .bg-indigo-500\\/10 {
              background-color: #f9fafb !important;
              border: 1px solid #e5e7eb !important;
              color: #111827 !important;
            }
            .text-amber-300, .text-amber-400 { color: #92400e !important; }
            .text-violet-200, .text-violet-300, .text-violet-400 { color: #5b21b6 !important; }
            .text-emerald-400 { color: #065f46 !important; }
            .text-indigo-400 { color: #3730a3 !important; }
            .no-print {
              display: none !important;
            }
          </style>
        </head>
        <body class="p-4 bg-white text-neutral-900">
          <header class="border-b border-neutral-300 pb-3 mb-6">
            <div class="flex items-center justify-between">
              <h1 class="text-xl font-bold text-neutral-900">Flashmente - Guía de Repaso Rápido</h1>
              <span class="text-xs text-neutral-500 font-mono">FSRS Spaced Repetition</span>
            </div>
            <p class="text-sm font-semibold text-neutral-700 mt-1">${deckTitle}</p>
          </header>
          <main>
            ${printContent.innerHTML}
          </main>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    // Esperar a que renderice y disparar impresión limpia
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 350);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Estilos para impresión limpia de alta definición (@media print) */}
      <style>{`
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          /* Ocultar todo lo que no sea el contenido imprimible */
          body * {
            visibility: hidden;
          }

          #quick-study-guide-printable,
          #quick-study-guide-printable * {
            visibility: visible;
          }

          #quick-study-guide-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 15mm !important;
            background: #ffffff !important;
            color: #111827 !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Reset de contenedores del modal para flujo continuo sin fragmentación */
          .modal-backdrop-print-fix,
          .modal-dialog-print-fix {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            max-width: none !important;
            overflow: visible !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          /* Forzar fondos blancos y texto oscuro para ahorro de tinta y legibilidad */
          .bg-neutral-900,
          .bg-neutral-900\\/50,
          .bg-neutral-900\\/60,
          .bg-neutral-900\\/80,
          .bg-neutral-900\\/90,
          .bg-neutral-950,
          .bg-neutral-950\\/60,
          .bg-black {
            background-color: #ffffff !important;
            color: #111827 !important;
            border-color: #e5e7eb !important;
          }

          /* Colores de texto legible en papel */
          .text-white,
          .text-neutral-100,
          .text-neutral-200,
          .text-neutral-300,
          .text-neutral-400 {
            color: #111827 !important;
          }

          .text-neutral-500,
          .text-neutral-600 {
            color: #374151 !important;
          }

          /* Grids adaptadas a documento A4 */
          .grid {
            display: grid !important;
          }

          /* Aplica break-inside: avoid ÚNICAMENTE a los contenedores de tarjeta individuales */
          .print-card {
            background-color: #ffffff !important;
            color: #111827 !important;
            border: 1px solid #d1d5db !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Eliminar break-inside en elementos pequeños para flujo continuo y compacto */
          p, h1, h2, h3, h4, h5, h6, span, tr, td, th, li {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          /* Tablas comparativas limpias */
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          .print-table th {
            background-color: #f3f4f6 !important;
            color: #111827 !important;
            border: 1px solid #9ca3af !important;
            padding: 6px 10px !important;
            font-weight: 700 !important;
          }

          .print-table td {
            background-color: #ffffff !important;
            color: #111827 !important;
            border: 1px solid #d1d5db !important;
            padding: 6px 10px !important;
          }

          /* Indicadores sutiles */
          .bg-amber-500\\/10,
          .bg-violet-500\\/10,
          .bg-emerald-500\\/10,
          .bg-indigo-500\\/10 {
            background-color: #f9fafb !important;
            border: 1px solid #e5e7eb !important;
            color: #111827 !important;
          }

          .text-amber-300,
          .text-amber-400 {
            color: #92400e !important;
          }

          .text-violet-200,
          .text-violet-300,
          .text-violet-400 {
            color: #5b21b6 !important;
          }

          .text-emerald-400 {
            color: #065f46 !important;
          }

          .text-indigo-400 {
            color: #3730a3 !important;
          }

          /* Ajustar tamaño de página A4 con márgenes limpios */
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 modal-backdrop-print-fix">
        <div
          className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-neutral-900 border border-neutral-700/80 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 modal-dialog-print-fix"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera del Modal */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-900/90 gap-3 no-print">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-white truncate">
                    {guide?.title || `${t('quick_guide.modal_title', 'Guía de Repaso Rápido')}: ${deckTitle}`}
                  </h3>
                  {isPro && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/40 text-amber-300 shrink-0">
                      👑 PRO
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 truncate">
                  {guide
                    ? t('quick_guide.cards_analyzed', { count: guide.cardCount })
                    : t('quick_guide.modal_subtitle', 'Síntesis de alto rendimiento para afianzar conceptos')}
                </p>
              </div>
            </div>

            {/* Acciones de Cabecera */}
            <div className="flex items-center gap-2 shrink-0">
              {guide && (
                <>
                  <button
                    type="button"
                    onClick={handlePrintGuide}
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                    title={t('quick_guide.print_btn', '🖨️ Guardar PDF / Imprimir')}
                  >
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">{t('quick_guide.print_btn', 'Guardar PDF')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchGuide(true)}
                    disabled={isRegenerating || isLoading}
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition cursor-pointer active:scale-95 disabled:opacity-50"
                    title={t('quick_guide.regenerate_btn', 'Regenerar síntesis')}
                  >
                    <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cuerpo del Modal (Contenedor Imprimible y Desplazable) */}
          <div
            id="quick-study-guide-printable"
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-left"
          >
            {/* Estado: Cargando generación inicial */}
            {isLoading && (
              <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">
                    {t('quick_guide.loading', 'Sintetizando tarjetas del mazo con IA...')}
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Extrayendo ideas fuerza, tablas comparativas, métricas críticas y mnemotecnias.
                  </p>
                </div>
              </div>
            )}

            {/* Estado: Error */}
            {errorMsg && !isLoading && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <p className="font-semibold text-rose-200">Error al procesar la guía</p>
                  <p className="mt-0.5">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => fetchGuide(true)}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-medium transition cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {/* Contenido Completo de la Guía */}
            {guide && !isLoading && (
              <div className="space-y-6">
                {/* 1. SECCIÓN: CONCEPTOS CLAVE Y FUNDAMENTOS (Visible siempre para todos) */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
                    <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                    <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-400">
                      {t('quick_guide.section_key_concepts', '💡 Conceptos Clave y Fundamentos')}
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {guide.key_concepts.map((concept, idx) => (
                      <div
                        key={`concept-${idx}`}
                        className="print-card p-3.5 sm:p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-2 flex flex-col justify-between"
                      >
                        <div>
                          <h5 className="text-sm font-bold text-white mb-1">{concept.title}</h5>
                          <p className="text-xs text-neutral-300 leading-relaxed">{concept.description}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-1.5 font-medium">
                          <span className="font-bold shrink-0">{t('quick_guide.takeaway', 'Clave:')}</span>
                          <span>{concept.keyTakeaway}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* BLOQUE GATED / TEASER (Secciones 2, 3 y 4 con efecto blur para Free) */}
                <div className="relative mt-6">
                  <div
                    className={`space-y-6 transition-all duration-300 ${
                      !isUnlocked ? 'filter blur-[4px] select-none pointer-events-none opacity-40 max-h-[460px] overflow-hidden' : ''
                    }`}
                  >
                    {/* 2. SECCIÓN: TABLAS COMPARATIVAS Y TRAMPAS */}
                    {guide.contrast_tables && guide.contrast_tables.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
                          <Table className="w-4 h-4 text-indigo-400 shrink-0" />
                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-indigo-400">
                            {t('quick_guide.section_contrast_tables', '⚖️ Tablas Comparativas y Trampas')}
                          </h4>
                        </div>

                        <div className="space-y-4">
                          {guide.contrast_tables.map((table, tIdx) => (
                            <div
                              key={`table-${tIdx}`}
                              className="print-card rounded-2xl border border-neutral-800/80 bg-neutral-950/60 overflow-hidden"
                            >
                              <div className="p-3 bg-neutral-900/60 border-b border-neutral-800">
                                <h5 className="text-xs sm:text-sm font-bold text-white">{table.title}</h5>
                                {table.description && (
                                  <p className="text-[11px] text-neutral-400 mt-0.5">{table.description}</p>
                                )}
                              </div>
                              <div className="overflow-x-auto">
                                <table className="print-table w-full text-left text-xs">
                                  <thead className="bg-neutral-900/80 text-neutral-300 font-semibold border-b border-neutral-800">
                                    <tr>
                                      {table.headers.map((h, hIdx) => (
                                        <th key={`th-${hIdx}`} className="p-2.5 sm:p-3 font-semibold">
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                                    {table.rows.map((row, rIdx) => (
                                      <tr key={`tr-${rIdx}`} className="hover:bg-neutral-900/30">
                                        {row.map((cell, cIdx) => (
                                          <td key={`td-${cIdx}`} className="p-2.5 sm:p-3 align-top leading-relaxed">
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* 3. SECCIÓN: CIFRAS Y DATOS CRÍTICOS */}
                    {guide.critical_data && guide.critical_data.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
                          <Hash className="w-4 h-4 text-emerald-400 shrink-0" />
                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-400">
                            {t('quick_guide.section_critical_data', '🎯 Cifras y Datos Indispensables')}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {guide.critical_data.map((data, dIdx) => (
                            <div
                              key={`data-${dIdx}`}
                              className="print-card p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1"
                            >
                              <div className="text-xs font-semibold text-neutral-400 truncate">{data.label}</div>
                              <div className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                                {data.value}
                              </div>
                              <p className="text-[11px] text-neutral-300 leading-tight">{data.context}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* 4. SECCIÓN: REGLAS MNEMOTÉCNICAS */}
                    {guide.mnemonics && guide.mnemonics.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
                          <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-violet-400">
                            {t('quick_guide.section_mnemonics', '🧠 Reglas Mnemotécnicas')}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {guide.mnemonics.map((mnem, mIdx) => (
                            <div
                              key={`mnem-${mIdx}`}
                              className="print-card p-4 rounded-2xl bg-neutral-950/60 border border-violet-500/20 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h5 className="text-xs font-bold text-neutral-300">{mnem.concept}</h5>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                  Mnemotecnia
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 font-mono font-bold text-sm text-violet-200">
                                {mnem.rule}
                              </div>
                              <p className="text-xs text-neutral-300 leading-relaxed">{mnem.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* OVERLAY CONVERSIÓN PRO / REWARDED AD PARA USUARIOS FREE */}
                  {!isUnlocked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-neutral-950 via-neutral-950/85 to-transparent text-center z-10 rounded-2xl no-print">
                      <div className="max-w-md space-y-4 p-6 rounded-3xl bg-neutral-900/95 border border-amber-500/40 shadow-2xl backdrop-blur-xl">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
                          <Crown className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-base sm:text-lg font-bold text-white">
                            {t('quick_guide.pro_locked_title', 'Desbloquea la Guía Completa')}
                          </h4>
                          <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                            {t(
                              'quick_guide.pro_locked_desc',
                              'Accede a las tablas comparativas, datos críticos, mnemotecnias y exportación a PDF para todos tus mazos.'
                            )}
                          </p>
                        </div>

                        {adError && (
                          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                            {adError}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => openProModal(true)}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                          >
                            {t('quick_guide.upgrade_pro_btn', '👑 Desbloquear con PRO')}
                          </button>

                          <button
                            type="button"
                            onClick={handleWatchAd}
                            disabled={isWatchingAd}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {isWatchingAd ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                <span>Cargando...</span>
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
                                <span>{t('quick_guide.watch_ad_btn', '🎬 Ver anuncio (+1)')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer del Modal */}
          <div className="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-900/90 flex items-center justify-between gap-3 no-print">
            <div className="text-[11px] text-neutral-400 font-mono">
              {guide && (
                <span>
                  Flashmente • {guide.deckTitle} ({guide.cardCount} cards)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition cursor-pointer active:scale-95 border border-neutral-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
