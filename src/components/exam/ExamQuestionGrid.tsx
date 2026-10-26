'use client';

import React from 'react';
import { Flag } from 'lucide-react';
import { useLanguageStore, useExamStore } from '@/stores';

interface ExamQuestionGridProps {
  onSelectQuestion?: (index: number) => void;
}

export function ExamQuestionGrid({ onSelectQuestion }: ExamQuestionGridProps) {
  const { t } = useLanguageStore();
  const { cards, currentIndex, answers, flagged, goToQuestion } = useExamStore();

  const handleSelect = (idx: number) => {
    goToQuestion(idx);
    if (onSelectQuestion) {
      onSelectQuestion(idx);
    }
  };

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
          {t('exam.grid_title', 'Mapa de preguntas')}
        </h3>
        <span className="text-xs text-neutral-400 font-mono">
          {Object.keys(answers).filter((k) => (answers[k] || '').trim() !== '').length} / {cards.length} {t('exam.answered', 'respondidas')}
        </span>
      </div>

      {/* Grid of Question buttons */}
      <div className="grid grid-cols-5 sm:grid-cols-5 gap-2 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto pr-1">
        {cards.map((card, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = Boolean((answers[card.id] || '').trim() !== '');
          const isFlagged = flagged.includes(card.id);

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleSelect(idx)}
              className={`relative h-10 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center cursor-pointer border ${
                isCurrent
                  ? 'ring-2 ring-indigo-500 border-indigo-500 scale-105 z-10'
                  : 'hover:border-neutral-400 dark:hover:border-neutral-600'
              } ${
                isAnswered
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <span>{idx + 1}</span>
              {isFlagged && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] shadow-sm">
                  🚩
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-indigo-600 border border-indigo-600" />
          <span>{t('exam.legend_answered', 'Respondida')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700" />
          <span>{t('exam.legend_pending', 'En blanco')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">🚩</span>
          <span>{t('exam.legend_flagged', 'Con duda')}</span>
        </div>
      </div>
    </div>
  );
}
