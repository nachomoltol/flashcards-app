'use client';

import React, { useState, useEffect } from 'react';
import type { CardFormat } from '@/types/database';

export interface FormattedCardViewProps {
  front: string;
  back: string;
  cardFormat?: CardFormat | string;
  isRevealed?: boolean;
  interactive?: boolean; // Permite al usuario seleccionar opciones durante el estudio
  className?: string;
}

interface ParsedMultipleChoice {
  question: string;
  options: { key: string; text: string }[];
}

/**
 * Parsea el anverso para extraer la pregunta limpia y las 4 opciones (a, b, c, d).
 * Garantiza que la pregunta devuelta NUNCA contenga el texto de las opciones.
 */
export function parseMultipleChoice(frontText: string): ParsedMultipleChoice {
  if (!frontText || typeof frontText !== 'string') {
    return { question: '', options: [] };
  }

  const cleanFront = frontText.trim();

  // 1. Detectar el inicio de la primera opción 'a)' / '(a)' / 'a.'
  // Busca 'a' precedido de inicio de texto, salto de línea o espacios, y seguido de un delimitador
  const optionDelimRegex = /(?:^|\r?\n|\s+)(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s+/g;
  
  let firstOptionIndex = -1;
  let matchDelim: RegExpExecArray | null;

  while ((matchDelim = optionDelimRegex.exec(cleanFront)) !== null) {
    const letter = (matchDelim[1] || matchDelim[2]).toLowerCase();
    if (letter === 'a') {
      // Calculamos la posición exacta donde inicia la 'a' de la opción
      const leadingWhitespaceLen = matchDelim[0].length - matchDelim[0].trimStart().length;
      firstOptionIndex = matchDelim.index + leadingWhitespaceLen;
      break;
    }
  }

  let rawQuestion = cleanFront;
  let rawOptionsBlock = '';

  if (firstOptionIndex !== -1) {
    rawQuestion = cleanFront.substring(0, firstOptionIndex).trim();
    rawOptionsBlock = cleanFront.substring(firstOptionIndex).trim();
  }

  const options: { key: string; text: string }[] = [];

  if (rawOptionsBlock) {
    // Extraer cada opción mediante lookahead hasta la siguiente opción o fin de texto
    const optRegex = /(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s*([\s\S]*?)(?=(?:(?:\r?\n|\s+)(?:\(?[a-dA-D]\s*[\)\.\-\]\:]|\b[a-dA-D]\))\s+)|$)/gi;
    let optMatch: RegExpExecArray | null;

    while ((optMatch = optRegex.exec(rawOptionsBlock)) !== null) {
      const key = (optMatch[1] || optMatch[2]).toLowerCase();
      let text = optMatch[3].trim();
      // Limpiar saltos de línea repetidos o espacios dentro del texto de la opción
      text = text.replace(/\s+/g, ' ').trim();
      if (text) {
        options.push({ key, text });
      }
    }
  }

  // 2. Fallback si el bloque no devolvió opciones (ej. líneas simples como a) ... en saltos de línea)
  if (options.length < 2) {
    options.length = 0;
    const lines = cleanFront.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const qLines: string[] = [];
    const lineOptionRegex = /^(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s*(.+)$/i;

    for (const line of lines) {
      const matchLine = line.match(lineOptionRegex);
      if (matchLine) {
        options.push({
          key: (matchLine[1] || matchLine[2]).toLowerCase(),
          text: matchLine[3].trim(),
        });
      } else if (options.length === 0) {
        qLines.push(line);
      }
    }

    if (qLines.length > 0) {
      rawQuestion = qLines.join('\n').trim();
    }
  }

  // 3. Limpieza final: bajo NINGÚN concepto la pregunta debe conservar opciones 'a)...' al final
  const cleanQuestion = rawQuestion
    .replace(/(?:^|\r?\n|\s+)(?:\(?a\s*[\)\.\-\]\:]|\ba\))\s+[\s\S]*$/i, '')
    .trim();

  return {
    question: cleanQuestion || rawQuestion,
    options,
  };
}

/**
 * Normaliza y renderiza texto con Cloze ([...] o {{c1::palabra}}).
 */
export function renderClozeContent(text: string, isRevealed: boolean) {
  // Maneja tanto notación {{c1::palabra}} como [...]
  const parts = text.split(/(\{\{c\d+::.*?\}\}|\[\.\.\.\])/g);

  return parts.map((part, index) => {
    // Caso 1: {{c1::palabra}}
    const clozeMatch = part.match(/^\{\{c\d+::(.*?)\}\}$/);
    if (clozeMatch) {
      const hiddenWord = clozeMatch[1];
      if (!isRevealed) {
        return (
          <span
            key={index}
            className="inline-flex items-center px-2.5 py-0.5 mx-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-semibold border border-indigo-500/30 shadow-inner"
          >
            [...]
          </span>
        );
      }
      return (
        <span
          key={index}
          className="inline-flex items-center px-2.5 py-0.5 mx-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm animate-in fade-in"
        >
          {hiddenWord}
        </span>
      );
    }

    // Caso 2: Notación literal [...]
    if (part === '[...]') {
      if (!isRevealed) {
        return (
          <span
            key={index}
            className="inline-flex items-center px-2.5 py-0.5 mx-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-semibold border border-indigo-500/30 shadow-inner animate-pulse"
          >
            [...]
          </span>
        );
      }
      return null;
    }

    return <span key={index}>{part}</span>;
  });
}

/**
 * Helper para renderizar negritas simples (**texto**) en explicaciones o respuestas.
 */
function renderMarkdownBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-white font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function FormattedCardView({
  front,
  back,
  cardFormat = 'basic',
  isRevealed = false,
  interactive = true,
  className = '',
}: FormattedCardViewProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Reiniciar selección al cambiar de tarjeta o anverso
  useEffect(() => {
    setSelectedOption(null);
  }, [front]);

  // Normalizar el formato efectivo
  const resolvedFormat: CardFormat =
    cardFormat === 'multiple_choice' ||
    cardFormat === 'cloze' ||
    cardFormat === 'true_false'
      ? cardFormat
      : 'basic';

  // Parser para Opción Múltiple
  const { question, options } =
    resolvedFormat === 'multiple_choice'
      ? parseMultipleChoice(front)
      : { question: front, options: [] };

  // Identificar la clave correcta del Back (ej. "b) Respuesta" o "b")
  const correctKeyMatch = back.match(/^\s*([a-dA-D])[.)\]\-:]/);
  const correctKey = correctKeyMatch ? correctKeyMatch[1].toLowerCase() : null;

  // Analizar respuesta para Verdadero / Falso
  const isTrue = /^(verdadero|\*\*verdadero\*\*)/i.test(back.trim());
  const isFalse = /^(falso|\*\*falso\*\*)/i.test(back.trim());

  // Text-to-Speech (Altavoz accesible con Web Speech API)
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
  }, [front]);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement)?.blur();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    // Texto limpio para lectura accesible
    const textToRead =
      resolvedFormat === 'multiple_choice'
        ? question
        : question
            .replace(/\[\.\.\.\]/g, 'espacio en blanco')
            .replace(/\{\{c\d+::(.*?)\}\}/g, '$1');

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`space-y-3.5 sm:space-y-6 ${className || ''}`}>
      {/* Visual Header Badge for Format & TTS Speaker Button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {resolvedFormat === 'multiple_choice' && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              Opción Múltiple (Test)
            </span>
          )}
          {resolvedFormat === 'cloze' && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Texto Cloze [...]
            </span>
          )}
          {resolvedFormat === 'true_false' && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Verdadero o Falso
            </span>
          )}
          {resolvedFormat === 'basic' && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Pregunta Directa
            </span>
          )}
        </div>

        {/* Botón de Altavoz discreto (Text-to-Speech) */}
        <button
          type="button"
          onClick={handleSpeak}
          aria-label={isSpeaking ? 'Detener lectura en voz alta' : 'Leer pregunta en voz alta'}
          title={isSpeaking ? 'Detener audio' : 'Leer pregunta en voz alta'}
          className={`px-2.5 py-1 rounded-xl border text-xs transition-all duration-150 flex items-center gap-1.5 shrink-0 ${
            isSpeaking
              ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50 ring-1 ring-indigo-500/40 animate-pulse'
              : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white border-neutral-800 hover:border-neutral-700 active:scale-95'
          }`}
        >
          {isSpeaking ? (
            <svg className="w-3.5 h-3.5 text-indigo-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
          <span className="text-[11px] font-medium hidden sm:inline">
            {isSpeaking ? 'Leyendo...' : 'Escuchar'}
          </span>
        </button>
      </div>

      {/* ANVERSO (FRONT) */}
      <div className="space-y-3 sm:space-y-4">
        {/* Pregunta principal */}
        <div className="text-lg sm:text-xl md:text-2xl font-semibold text-white leading-snug sm:leading-relaxed">
          {resolvedFormat === 'cloze' ? (
            renderClozeContent(question, isRevealed)
          ) : (
            <p className="whitespace-pre-wrap">{question}</p>
          )}
        </div>

        {/* Renderizado específico para Opción Múltiple: Dibujar las 4 opciones */}
        {resolvedFormat === 'multiple_choice' && options.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {options.map((opt) => {
              const isSelected = selectedOption === opt.key;
              const isCorrect = correctKey === opt.key;

              // Estilo dinámico según revelación y selección
              let cardStyles =
                'border-neutral-800 bg-neutral-950/70 hover:border-neutral-700 text-neutral-300';
              let badgeStyles = 'bg-neutral-800 text-neutral-400 border-neutral-700';

              if (isRevealed) {
                if (isCorrect) {
                  cardStyles =
                    'border-emerald-500/60 bg-emerald-500/15 text-emerald-200 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/40';
                  badgeStyles = 'bg-emerald-500 text-black font-bold border-emerald-400';
                } else if (isSelected && !isCorrect) {
                  cardStyles =
                    'border-rose-500/60 bg-rose-500/15 text-rose-300 line-through opacity-85';
                  badgeStyles = 'bg-rose-500 text-white font-bold border-rose-400';
                } else {
                  cardStyles = 'border-neutral-800/60 bg-neutral-950/40 text-neutral-500 opacity-60';
                }
              } else if (isSelected) {
                cardStyles =
                  'border-violet-500 bg-violet-600/20 text-white shadow-md shadow-violet-900/30 ring-1 ring-violet-500';
                badgeStyles = 'bg-violet-600 text-white font-bold border-violet-400';
              }

              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={!interactive || isRevealed}
                  onClick={(e) => {
                    (e.currentTarget as HTMLElement)?.blur();
                    setSelectedOption(opt.key);
                  }}
                  className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start gap-3 transition-all duration-150 group active:scale-[0.99] min-h-[52px] ${cardStyles}`}
                >
                  <span
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs flex items-center justify-center shrink-0 uppercase font-mono border transition-colors ${badgeStyles}`}
                  >
                    {opt.key}
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5 text-xs sm:text-sm font-medium leading-relaxed">
                    {opt.text}
                  </div>
                  {isRevealed && isCorrect && (
                    <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isRevealed && isSelected && !isCorrect && (
                    <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Renderizado interactivo para Verdadero / Falso */}
        {resolvedFormat === 'true_false' && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={!interactive || isRevealed}
              onClick={(e) => {
                (e.currentTarget as HTMLElement)?.blur();
                setSelectedOption('true');
              }}
              className={`flex-1 py-3.5 px-4 min-h-[48px] rounded-xl border font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                isRevealed && isTrue
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500'
                  : isRevealed && selectedOption === 'true' && !isTrue
                  ? 'border-rose-500 bg-rose-500/20 text-rose-300 line-through'
                  : selectedOption === 'true'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                  : 'border-neutral-800 bg-neutral-950/70 hover:border-emerald-500/40 text-neutral-300'
              }`}
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Verdadero</span>
            </button>

            <button
              type="button"
              disabled={!interactive || isRevealed}
              onClick={(e) => {
                (e.currentTarget as HTMLElement)?.blur();
                setSelectedOption('false');
              }}
              className={`flex-1 py-3.5 px-4 min-h-[48px] rounded-xl border font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                isRevealed && isFalse
                  ? 'border-rose-500 bg-rose-500/20 text-rose-300 ring-1 ring-rose-500'
                  : isRevealed && selectedOption === 'false' && !isFalse
                  ? 'border-rose-500 bg-rose-500/20 text-rose-300 line-through'
                  : selectedOption === 'false'
                  ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                  : 'border-neutral-800 bg-neutral-950/70 hover:border-rose-500/40 text-neutral-300'
              }`}
            >
              <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Falso</span>
            </button>
          </div>
        )}
      </div>

      {/* REVERSO (BACK) */}
      {isRevealed && (
        <div className="pt-3 sm:pt-6 border-t border-neutral-800/80 space-y-2 sm:space-y-3 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Respuesta / Justificación
            </span>

            {resolvedFormat === 'multiple_choice' && correctKey && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                Opción Correcta: ({correctKey})
              </span>
            )}
          </div>

          <div className="text-sm sm:text-base md:text-lg text-neutral-200 leading-relaxed whitespace-pre-wrap bg-neutral-950/60 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-neutral-800/90 shadow-inner">
            {renderMarkdownBold(back)}
          </div>
        </div>
      )}
    </div>
  );
}
