'use client';

import React, { useState, useEffect } from 'react';
import { Flag, Volume2, Check, X } from 'lucide-react';
import { useLanguageStore, useExamStore, type CardRow } from '@/stores';
import { parseMultipleChoice, renderClozeContent } from '@/components/cards/FormattedCardView';

interface ExamQuestionViewProps {
  card: CardRow;
  index: number;
  total: number;
}

export function ExamQuestionView({ card, index, total }: ExamQuestionViewProps) {
  const { t, language } = useLanguageStore();
  const { answers, selectAnswer, flagged, toggleFlag } = useExamStore();

  const isFlagged = flagged.includes(card.id);
  const currentAnswer = answers[card.id] || '';

  const format =
    card.cardFormat ||
    card.card_format ||
    (card.card_type === 'cloze' ? 'cloze' : 'basic');

  // Text-to-Speech
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [card.id]);

  const handleSpeak = (textToRead: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = language === 'en' ? 'en-US' : 'es-ES';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // 1. FORMATO: MULTIPLE CHOICE
  if (format === 'multiple_choice') {
    const { question, options } = parseMultipleChoice(card.front);

    return (
      <div className="w-full space-y-4 sm:space-y-6 text-left">
        {/* Top Header of Card */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
              {t('study.badge_mc', 'Opción Múltiple')}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              #{index + 1} / {total}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSpeak(question)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              title={t('formatted_card.listen', 'Escuchar')}
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-indigo-500 animate-bounce' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => toggleFlag(card.id)}
              className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl transition active:scale-90 cursor-pointer flex items-center gap-1 text-xs font-bold ${
                isFlagged
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-xs'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-amber-600 hover:bg-amber-500/10 border border-transparent'
              }`}
              title={isFlagged ? t('exam.flag_remove', 'Quitar duda') : t('exam.flag_add', 'Marcar con duda 🚩')}
            >
              <Flag className={`w-3.5 h-3.5 ${isFlagged ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span>Duda 🚩</span>
            </button>
          </div>
        </div>

        {/* Question Statement */}
        <div className="text-base sm:text-xl font-bold text-neutral-900 dark:text-white leading-snug sm:leading-relaxed">
          <p className="whitespace-pre-wrap">{question}</p>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-2">
          {options.map((opt) => {
            const isSelected = currentAnswer.toLowerCase() === opt.key.toLowerCase();
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => selectAnswer(card.id, opt.key)}
                className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border text-left transition-all duration-150 flex items-start gap-3 active:scale-[0.99] cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500/30 dark:border-indigo-500 dark:bg-indigo-600/20 dark:text-white shadow-md'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:text-neutral-200'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg text-xs font-bold uppercase flex items-center justify-center shrink-0 border transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {opt.key}
                </span>
                <span className="text-xs sm:text-sm font-medium leading-relaxed pt-0.5">
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. FORMATO: VERDADERO / FALSO
  if (format === 'true_false') {
    return (
      <div className="w-full space-y-4 sm:space-y-6 text-left">
        {/* Top Header of Card */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
              {t('study.badge_tf', 'Verdadero / Falso')}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              #{index + 1} / {total}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSpeak(card.front)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              title={t('formatted_card.listen', 'Escuchar')}
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-indigo-500 animate-bounce' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => toggleFlag(card.id)}
              className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl transition active:scale-90 cursor-pointer flex items-center gap-1 text-xs font-bold ${
                isFlagged
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-xs'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-amber-600 hover:bg-amber-500/10 border border-transparent'
              }`}
              title={isFlagged ? t('exam.flag_remove', 'Quitar duda') : t('exam.flag_add', 'Marcar con duda 🚩')}
            >
              <Flag className={`w-3.5 h-3.5 ${isFlagged ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span>Duda 🚩</span>
            </button>
          </div>
        </div>

        {/* Question Statement */}
        <div className="text-base sm:text-xl font-bold text-neutral-900 dark:text-white leading-snug sm:leading-relaxed">
          <p className="whitespace-pre-wrap">{card.front}</p>
        </div>

        {/* 2 Botones: Verdadero vs Falso */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-3">
          <button
            type="button"
            onClick={() => selectAnswer(card.id, 'verdadero')}
            className={`p-4 sm:p-5 rounded-2xl border text-center transition-all duration-150 flex flex-col items-center justify-center gap-2 active:scale-95 cursor-pointer ${
              currentAnswer.toLowerCase() === 'verdadero'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/30 dark:border-emerald-500 dark:bg-emerald-600/20 dark:text-emerald-200 shadow-lg'
                : 'border-neutral-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-emerald-800 dark:text-neutral-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              currentAnswer.toLowerCase() === 'verdadero'
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}>
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-sm sm:text-base font-extrabold uppercase tracking-wider">
              {t('exam.true', 'Verdadero')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => selectAnswer(card.id, 'falso')}
            className={`p-4 sm:p-5 rounded-2xl border text-center transition-all duration-150 flex flex-col items-center justify-center gap-2 active:scale-95 cursor-pointer ${
              currentAnswer.toLowerCase() === 'falso'
                ? 'border-rose-500 bg-rose-50 text-rose-950 ring-2 ring-rose-500/30 dark:border-rose-500 dark:bg-rose-600/20 dark:text-rose-200 shadow-lg'
                : 'border-neutral-200 bg-white hover:border-rose-300 hover:bg-rose-50/30 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-rose-800 dark:text-neutral-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              currentAnswer.toLowerCase() === 'falso'
                ? 'bg-rose-500 text-white'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              <X className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-sm sm:text-base font-extrabold uppercase tracking-wider">
              {t('exam.false', 'Falso')}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // 3. FORMATO: CLOZE O BÁSICA (Pregunta abierta / rellenar hueco)
  const isCloze = format === 'cloze';
  const displayText = isCloze ? card.front : card.front;

  return (
    <div className="w-full space-y-4 sm:space-y-6 text-left">
      {/* Top Header of Card */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
            isCloze
              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25'
              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25'
          }`}>
            {isCloze ? t('study.badge_cloze', 'Completar Hueco') : t('study.badge_basic', 'Pregunta Directa')}
          </span>
          <span className="text-xs text-neutral-400 font-mono">
            #{index + 1} / {total}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSpeak(displayText.replace(/\[\.\.\.\]/g, 'espacio en blanco').replace(/\{\{c\d+::(.*?)\}\}/g, '$1'))}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
            title={t('formatted_card.listen', 'Escuchar')}
          >
            <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-indigo-500 animate-bounce' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => toggleFlag(card.id)}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl transition active:scale-90 cursor-pointer flex items-center gap-1 text-xs font-bold ${
              isFlagged
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-xs'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-amber-600 hover:bg-amber-500/10 border border-transparent'
            }`}
            title={isFlagged ? t('exam.flag_remove', 'Quitar duda') : t('exam.flag_add', 'Marcar con duda 🚩')}
          >
            <Flag className={`w-3.5 h-3.5 ${isFlagged ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>Duda 🚩</span>
          </button>
        </div>
      </div>

      {/* Statement */}
      <div className="text-base sm:text-xl font-bold text-neutral-900 dark:text-white leading-snug sm:leading-relaxed">
        {isCloze ? (
          <div>{renderClozeContent(displayText, false)}</div>
        ) : (
          <p className="whitespace-pre-wrap">{displayText}</p>
        )}
      </div>

      {/* Text Area for Student's written answer */}
      <div className="space-y-1.5 pt-2">
        <label className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
          <span>{t('exam.typed_answer_label', 'Tu respuesta (opcional para comparar al final):')}</span>
          <span className="text-[11px] font-normal text-neutral-400">
            {t('exam.typed_answer_hint', 'Se revisará en el veredicto final')}
          </span>
        </label>
        <textarea
          rows={3}
          value={currentAnswer}
          onChange={(e) => selectAnswer(card.id, e.target.value)}
          placeholder={t(
            'exam.typed_answer_placeholder',
            'Escribe aquí tu respuesta para cotejarla con la solución oficial al terminar...'
          )}
          className="w-full p-3 sm:p-3.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none transition shadow-inner"
        />
      </div>
    </div>
  );
}
