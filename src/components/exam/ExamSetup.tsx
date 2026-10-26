'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, HelpCircle, Clock, Award, FileText } from 'lucide-react';
import { useLanguageStore, useExamStore, type CardRow } from '@/stores';
import { ExamHelpModal } from './ExamHelpModal';

interface ExamSetupProps {
  deckTitle: string;
  deckId: string;
  cards: CardRow[];
  onStartExam: () => void;
}

export function ExamSetup({ deckTitle, deckId, cards, onStartExam }: ExamSetupProps) {
  const { t } = useLanguageStore();
  const { config, setConfig } = useExamStore();
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

  const totalAvailable = cards.length;

  // Opciones predefinidas de cantidad de preguntas
  const questionCountOptions = [5, 10, 20, 30, 50, totalAvailable].filter(
    (val, idx, self) => val <= totalAvailable && self.indexOf(val) === idx && val > 0
  );

  const timeOptions = [
    { value: 0, label: t('exam.time_unlimited', 'Sin límite') },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '60 min' },
  ];

  const penaltyOptions = [
    { value: 'none' as const, label: t('exam.penalty_none', 'Sin penalización'), desc: t('exam.penalty_none_desc', 'Los fallos no restan puntos') },
    { value: 'one_third' as const, label: '-1/3 (Oposición)', desc: t('exam.penalty_one_third_desc', 'Cada 3 fallos restan 1 acierto') },
    { value: 'one_fourth' as const, label: '-1/4 (Estándar)', desc: t('exam.penalty_one_fourth_desc', 'Cada 4 fallos restan 1 acierto') },
  ];

  return (
    <div className="min-h-screen w-full overflow-y-auto py-4 sm:py-8 px-3 sm:px-6 pb-24 sm:pb-32 animate-in fade-in duration-200">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/decks/${deckId}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition group py-1"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="truncate max-w-[200px] sm:max-w-none">
              {t('common.back_to_deck', 'Volver al mazo')}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition cursor-pointer"
            title={t('exam.help_tooltip', 'Cómo funciona el examen')}
          >
            <HelpCircle className="w-4 h-4" />
            <span>{t('exam.help_btn', 'Ayuda')}</span>
          </button>
        </div>

        {/* Hero Card */}
        <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 shadow-lg text-left space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white shadow-sm">
            <span>🎯</span>
            <span>{t('exam.badge_simulacro', 'Modo Simulacro')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            {deckTitle}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {t(
              'exam.hero_description',
              'Evalúa tu retención en condiciones reales de examen con temporizador global y corrección a ciegas. Este simulacro es independiente y no altera tus algoritmos FSRS.'
            )}
          </p>
        </div>

        {/* Config Form */}
        <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 shadow-xl space-y-6 text-left">
          {/* 1. Cantidad de Preguntas */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>{t('exam.question_count_title', 'Cantidad de preguntas')}</span>
              <span className="text-xs font-normal text-neutral-400 normal-case">
                ({totalAvailable} {t('common.cards_available', 'disponibles')})
              </span>
            </label>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {questionCountOptions.map((count) => {
                const isSelected = config.totalQuestions === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setConfig({ totalQuestions: count })}
                    className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/25 ring-2 ring-indigo-500/30'
                        : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
                    }`}
                  >
                    {count === totalAvailable ? t('common.all', 'Todas') : count}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Límite de Tiempo */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>{t('exam.time_limit_title', 'Límite de tiempo')}</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {timeOptions.map((opt) => {
                const isSelected = config.timeLimitMinutes === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConfig({ timeLimitMinutes: opt.value })}
                    className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/25 ring-2 ring-indigo-500/30'
                        : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Fórmula de Penalización */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              <Award className="w-4 h-4 text-indigo-500" />
              <span>{t('exam.penalty_title', 'Sistema de penalización')}</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {penaltyOptions.map((opt) => {
                const isSelected = config.penaltyFormula === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConfig({ penaltyFormula: opt.value })}
                    className={`p-3 rounded-xl border text-left transition active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-500/40'
                        : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
                    }`}
                  >
                    <p className="font-bold text-xs sm:text-sm">{opt.label}</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Button (Visible on tablet/desktop) */}
          <div className="pt-3 hidden sm:block">
            <button
              type="button"
              onClick={onStartExam}
              disabled={totalAvailable === 0}
              className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-sm sm:text-base transition-all duration-150 shadow-xl shadow-indigo-600/30 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>{t('exam.start_button', 'Comenzar Examen')}</span>
            </button>
          </div>
        </div>

        {/* Mobile Sticky Action Bar (Always accessible on compact screens) */}
        <div className="sm:hidden sticky bottom-4 z-30 pt-2">
          <div className="p-2 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200/90 dark:border-neutral-800/90 shadow-2xl">
            <button
              type="button"
              onClick={onStartExam}
              disabled={totalAvailable === 0}
              className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-sm transition-all duration-150 shadow-lg shadow-indigo-600/30 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{t('exam.start_button', 'Comenzar Examen')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Ayuda */}
      <ExamHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
