'use client';

import React, { useState } from 'react';
import { useCardStore, type CardRow } from '@/stores';
import type { CardFormat } from '@/types/database';
import { FormattedCardView } from './FormattedCardView';

interface CardEditorProps {
  deckId: string;
  onCardCreated?: (card: CardRow) => void;
  className?: string;
}

export function CardEditor({ deckId, onCardCreated, className = '' }: CardEditorProps) {
  const { createCard } = useCardStore();
  const [cardFormat, setCardFormat] = useState<CardFormat>('basic');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) return;

    if (cardFormat === 'basic' && !back.trim()) {
      setErrorMessage('La respuesta del reverso es obligatoria para tarjetas básicas.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const backValue =
      cardFormat === 'cloze' && !back.trim() ? front.trim() : back.trim();

    const created = await createCard(
      deckId,
      front.trim(),
      backValue,
      cardFormat === 'cloze' ? 'cloze' : 'basic',
      cardFormat
    );

    setIsSubmitting(false);

    if (created) {
      if (onCardCreated) {
        onCardCreated(created);
      }
      setFront('');
      setBack('');
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 2500);
    } else {
      setErrorMessage('No se pudo guardar la tarjeta en Supabase. Verifica tu conexión.');
    }
  };

  // Helper para insertar sintaxis cloze
  const insertCloze = () => {
    const textarea = document.getElementById('card-front-input') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = front.substring(start, end);
    const clozeTag = selectedText ? `{{c1::${selectedText}}}` : '[...]';

    const newText = front.substring(0, start) + clozeTag + front.substring(end);
    setFront(newText);
  };

  // Helper para plantilla de opción múltiple
  const insertMultipleChoiceTemplate = () => {
    const template = `¿Cuál es la función principal de [...]?
a) Primera opción plausible
b) Segunda opción plausible
c) Tercera opción plausible
d) Cuarta opción plausible`;
    setFront(template);
    setBack('b) Segunda opción plausible');
  };

  // Helper para Verdadero / Falso
  const setTrueFalseAnswer = (isTrue: boolean) => {
    setBack(
      isTrue
        ? '**Verdadero**. Explica aquí por qué esta afirmación es verdadera según el texto.'
        : '**Falso**. Explica aquí por qué esta afirmación es falsa según el texto.'
    );
  };

  return (
    <div
      className={`rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm p-6 shadow-xl space-y-6 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800/80">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Editor de Tarjetas Dinámico
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Soporta formatos Básica, Opción Múltiple (Test), Cloze y Verdadero/Falso con FSRS.
          </p>
        </div>

        {/* Format Selector Pills */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-neutral-950 border border-neutral-800">
          <button
            type="button"
            onClick={() => setCardFormat('basic')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              cardFormat === 'basic'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Básica
          </button>
          <button
            type="button"
            onClick={() => setCardFormat('multiple_choice')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              cardFormat === 'multiple_choice'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Test (4 Opcs)
          </button>
          <button
            type="button"
            onClick={() => setCardFormat('cloze')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              cardFormat === 'cloze'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Cloze
          </button>
          <button
            type="button"
            onClick={() => setCardFormat('true_false')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              cardFormat === 'true_false'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            V / F
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Front Field with Dynamic Helpers */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="card-front-input"
              className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5"
            >
              <span>
                {cardFormat === 'basic' && 'Front (Pregunta)'}
                {cardFormat === 'multiple_choice' && 'Front (Pregunta y Opciones a, b, c, d)'}
                {cardFormat === 'cloze' && 'Front (Texto con espacio [...])'}
                {cardFormat === 'true_false' && 'Front (Afirmación rotunda)'}
              </span>
              <span className="text-indigo-400">*</span>
            </label>

            {/* Helper buttons according to format */}
            <div className="flex items-center gap-2">
              {cardFormat === 'cloze' && (
                <button
                  type="button"
                  onClick={insertCloze}
                  className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20"
                  title="Inserta [...] o {{c1::palabra}}"
                >
                  Insertar [...]
                </button>
              )}
              {cardFormat === 'multiple_choice' && (
                <button
                  type="button"
                  onClick={insertMultipleChoiceTemplate}
                  className="text-[11px] font-medium text-purple-400 hover:text-purple-300 transition flex items-center gap-1 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20"
                  title="Cargar plantilla con pregunta y 4 opciones"
                >
                  Cargar plantilla a,b,c,d
                </button>
              )}
            </div>
          </div>

          <textarea
            id="card-front-input"
            rows={cardFormat === 'multiple_choice' ? 5 : cardFormat === 'cloze' ? 4 : 3}
            required
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder={
              cardFormat === 'basic'
                ? 'ej. ¿Cuál es la capital de Francia?'
                : cardFormat === 'multiple_choice'
                ? 'ej.\n¿Cuál es la función principal de los ribosomas?\na) Síntesis de proteínas\nb) Producción de ATP\nc) Digestión celular\nd) Almacenamiento genético'
                : cardFormat === 'cloze'
                ? 'ej. La capital de Francia es {{c1::París}} o La capital es [...].'
                : 'ej. Las mitocondrias poseen su propio ADN circular independiente del núcleo.'
            }
            className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none font-sans"
          />
        </div>

        {/* Back Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="card-back-input"
              className="text-xs font-semibold uppercase tracking-wider text-neutral-300"
            >
              {cardFormat === 'basic' && 'Back (Respuesta o Reverso)'}
              {cardFormat === 'multiple_choice' && 'Back (Solo la opción correcta)'}
              {cardFormat === 'cloze' && 'Back (Texto completo con palabra revelada)'}
              {cardFormat === 'true_false' && 'Back (Verdadero / Falso + Justificación)'}
              {cardFormat !== 'cloze' && <span className="text-indigo-400 ml-1">*</span>}
            </label>

            {cardFormat === 'true_false' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTrueFalseAnswer(true)}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
                >
                  + Verdadero
                </button>
                <button
                  type="button"
                  onClick={() => setTrueFalseAnswer(false)}
                  className="text-[11px] font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20"
                >
                  + Falso
                </button>
              </div>
            )}
          </div>

          <textarea
            id="card-back-input"
            rows={3}
            required={cardFormat !== 'cloze'}
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder={
              cardFormat === 'basic'
                ? 'ej. París'
                : cardFormat === 'multiple_choice'
                ? 'ej. a) Síntesis de proteínas'
                : cardFormat === 'cloze'
                ? 'ej. La capital de Francia es París.'
                : 'ej. **Verdadero**. Las mitocondrias contienen ADN mitocondrial (ADNmt).'
            }
            className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
          />
        </div>

        {/* Live Visual Preview of how the card renders */}
        {front.trim() && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                Renderizado Visual en Vivo
              </span>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-[11px] text-neutral-500 hover:text-neutral-300"
              >
                {showPreview ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            {showPreview && (
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/70 shadow-inner">
                <FormattedCardView
                  front={front}
                  back={back || (cardFormat === 'cloze' ? front : 'Esperando respuesta...')}
                  cardFormat={cardFormat}
                  isRevealed={Boolean(back.trim())}
                  interactive={true}
                />
              </div>
            )}
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-2 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            {successMessage && (
              <span className="text-emerald-400 font-medium flex items-center gap-1.5 animate-in fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                ¡Tarjeta ({cardFormat}) guardada en Supabase!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {(front || back) && (
              <button
                type="button"
                onClick={() => {
                  setFront('');
                  setBack('');
                }}
                className="px-3.5 py-2 text-xs text-neutral-400 hover:text-white transition"
              >
                Limpiar
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !front.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-lg shadow-indigo-600/25 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              {isSubmitting ? 'Guardando...' : `Añadir (${cardFormat})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
