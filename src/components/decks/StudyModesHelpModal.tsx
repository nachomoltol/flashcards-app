'use client';

import React, { useEffect } from 'react';
import { X, Sparkles, Brain, FileText, Zap, Award, Check } from 'lucide-react';
import { useLanguageStore } from '@/stores';

interface StudyModesHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StudyModesHelpModal({ isOpen, onClose }: StudyModesHelpModalProps) {
  const { t } = useLanguageStore();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modes = [
    {
      id: 'fsrs',
      icon: Brain,
      iconColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
      badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      title: t('study_modes_help.fsrs_title', '🧠 Estudio Diario FSRS'),
      badge: t('study_modes_help.fsrs_badge', 'Memoria a Largo Plazo'),
      desc: t(
        'study_modes_help.fsrs_desc',
        'El motor principal de Flashmente. Utiliza el algoritmo científico FSRS para espaciar cada tarjeta en el momento exacto antes de que la olvides. Es el modo a usar para estudiar todos los días.'
      ),
      highlight: 'Óptimo para retención duradera',
    },
    {
      id: 'guide',
      icon: FileText,
      iconColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
      badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      title: t('study_modes_help.guide_title', '📑 Guía de Repaso Rápido'),
      badge: t('study_modes_help.guide_badge', 'Síntesis Estructurada'),
      desc: t(
        'study_modes_help.guide_desc',
        'Genera un documento ejecutivo (Cheat Sheet) que extrae las ideas fuerza, tablas comparativas, cifras críticas y mnemotecnias de todo el mazo. Diseñado para dar una vuelta completa en 5 minutos o imprimir en PDF.'
      ),
      highlight: 'Sintetiza todo el mazo en 1 página',
    },
    {
      id: 'panic',
      icon: Zap,
      iconColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      title: t('study_modes_help.panic_title', '⚡ Modo Pánico (Emergencia)'),
      badge: t('study_modes_help.panic_badge', 'Repaso Intensivo'),
      desc: t(
        'study_modes_help.panic_desc',
        'Sesión intensiva 100% en memoria para la noche antes del examen. Te permite repasar únicamente puntos débiles o tarjetas en riesgo sin alterar tu algoritmo FSRS ni distorsionar tus estadísticas.'
      ),
      highlight: '100% en memoria • No altera FSRS',
    },
    {
      id: 'exam',
      icon: Award,
      iconColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
      badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      title: t('study_modes_help.exam_title', '🏆 Simulacro de Examen'),
      badge: t('study_modes_help.exam_badge', 'Evaluación a Ciegas'),
      desc: t(
        'study_modes_help.exam_desc',
        'Ponte a prueba en condiciones reales: sin pistas, con temporizador de cuenta atrás y retroalimentación solo al finalizar. Mide tu retención y detecta qué conceptos aún fallas.'
      ),
      highlight: 'Contrarreloj con desglose final',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-neutral-900 border border-neutral-700/80 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-neutral-800 bg-neutral-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {t('study_modes_help.modal_title', 'Modos de Aprendizaje y Estudio')}
              </h3>
              <p className="text-xs text-neutral-400">
                {t('study_modes_help.modal_subtitle', 'Elige la herramienta adecuada según tu objetivo pedagógico')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Modos */}
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.id}
                className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 hover:border-neutral-700/80 transition-all flex flex-col sm:flex-row gap-3.5 sm:items-start"
              >
                <div className={`p-2.5 rounded-xl border shrink-0 w-fit ${mode.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-white">{mode.title}</h4>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">{mode.desc}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 pt-0.5 font-mono">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{mode.highlight}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-900/90 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs sm:text-sm border border-neutral-700 transition cursor-pointer active:scale-95 shadow-sm"
          >
            {t('study_modes_help.close_btn', 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  );
}
