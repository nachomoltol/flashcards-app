'use client';

import React, { useState, useEffect } from 'react';
import type { CardFormat } from '@/types/database';
import { useLanguageStore } from '@/stores';
import { Volume2, Check, X, Lightbulb } from 'lucide-react';

export interface FormattedCardViewProps {
  front: string;
  back: string;
  notes?: string | null;
  noteImageUrl?: string | null;
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
        <strong key={i} className="text-neutral-900 dark:text-white font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Estructura y separa el reverso en veredicto/respuesta clave y explicación técnica detallada.
 */
export function parseBackContent(
  backText: string,
  format: CardFormat = 'basic'
): { verdict: string; explanation: string } {
  const trimmed = (backText || '').trim();
  if (!trimmed) return { verdict: '', explanation: '' };

  // 1. Si contiene saltos de línea (doble o simple)
  const lines = trimmed.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return {
      verdict: lines[0],
      explanation: lines.slice(1).join('\n\n'),
    };
  }

  // 2. Si no hay saltos de línea pero contiene un marcador de explicación
  const explanationSplit = trimmed.split(/(?:Explicación|Justificación|Fundamento|Razón):\s*/i);
  if (explanationSplit.length > 1 && explanationSplit[0].trim()) {
    return {
      verdict: explanationSplit[0].trim(),
      explanation: explanationSplit.slice(1).join(' ').trim(),
    };
  }

  // 3. Para True/False en una sola línea (ej: "Verdadero. Porque las células...")
  if (format === 'true_false') {
    const tfMatch = trimmed.match(/^(Verdadero|Falso)[\.\,\:\s\-]+(.*)$/i);
    if (tfMatch && tfMatch[2].trim()) {
      return {
        verdict: tfMatch[1],
        explanation: tfMatch[2].trim(),
      };
    }
  }

  // 4. Para Multiple Choice en una sola línea (ej: "c) Mitocondria. Es el orgánulo...")
  if (format === 'multiple_choice') {
    const mcMatch = trimmed.match(/^(\(?[a-dA-D][\)\.\:\-]\s*[^.\n]+?\.)\s+([\s\S]+)$/);
    if (mcMatch && mcMatch[2].trim()) {
      return {
        verdict: mcMatch[1].trim(),
        explanation: mcMatch[2].trim(),
      };
    }
    const mcDashMatch = trimmed.match(/^(\(?[a-dA-D][\)\.\:\-]\s*[^\-\–\n]+?)\s*[\-\–]\s+([\s\S]+)$/);
    if (mcDashMatch && mcDashMatch[2].trim()) {
      return {
        verdict: mcDashMatch[1].trim(),
        explanation: mcDashMatch[2].trim(),
      };
    }
  }

  return { verdict: trimmed, explanation: '' };
}

export function FormattedCardView({
  front,
  back,
  notes,
  noteImageUrl,
  cardFormat = 'basic',
  isRevealed = false,
  interactive = true,
  className = '',
}: FormattedCardViewProps) {
  const { t, language } = useLanguageStore();
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

  // Parser para el reverso clínico (veredicto vs explicación detallada)
  const parsedBack = parseBackContent(back, resolvedFormat);

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
    utterance.lang = language === 'en' ? 'en-US' : 'es-ES';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`space-y-3 sm:space-y-5 ${className || ''}`}>
      {/* ANVERSO (FRONT) */}
      <div className="mb-2 sm:mb-4 space-y-2.5 sm:space-y-3">
        {/* Pregunta principal con botón TTS integrado sin fila redundante de badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 text-base sm:text-lg md:text-xl font-semibold text-neutral-900 dark:text-white leading-snug sm:leading-relaxed">
            {resolvedFormat === 'cloze' ? (
              renderClozeContent(question, isRevealed)
            ) : (
              <p className="whitespace-pre-wrap">{question}</p>
            )}
          </div>

          {/* Botón de Altavoz discreto (Text-to-Speech) integrado */}
          <button
            type="button"
            onClick={handleSpeak}
            aria-label={isSpeaking ? (language === 'en' ? 'Stop audio' : 'Detener lectura en voz alta') : (language === 'en' ? 'Read aloud' : 'Leer pregunta en voz alta')}
            title={isSpeaking ? (language === 'en' ? 'Stop audio' : 'Detener audio') : (language === 'en' ? 'Read aloud' : 'Leer pregunta en voz alta')}
            className={`px-2.5 py-1 rounded-xl border text-xs transition-all duration-150 flex items-center gap-1.5 shrink-0 cursor-pointer mt-0.5 ${
              isSpeaking
                ? 'bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border-indigo-500/50 ring-1 ring-indigo-500/40 animate-pulse'
                : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900/80 dark:hover:bg-neutral-800 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 active:scale-95'
            }`}
          >
            {isSpeaking ? (
              <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-bounce" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            )}
            <span className="text-[11px] font-medium hidden sm:inline">
              {isSpeaking ? t('formatted_card.reading', 'Leyendo...') : t('formatted_card.listen', 'Escuchar')}
            </span>
          </button>
        </div>

        {/* Renderizado específico para Opción Múltiple: Dibujar las 4 opciones */}
        {resolvedFormat === 'multiple_choice' && options.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-1 sm:pt-2 transition-all duration-200">
            {options.map((opt) => {
              const isSelected = selectedOption === opt.key;
              const isCorrect = correctKey === opt.key;

              // Estilo dinámico según revelación y selección
              let cardStyles =
                'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/70 dark:hover:border-neutral-700 dark:text-neutral-300';
              let badgeStyles = 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';

              if (isRevealed) {
                if (isCorrect) {
                  cardStyles =
                    'border-emerald-500/60 bg-emerald-50 text-emerald-950 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-emerald-950/40';
                  badgeStyles = 'bg-emerald-500 text-white dark:text-black font-bold border-emerald-400';
                } else if (isSelected && !isCorrect) {
                  cardStyles =
                    'border-rose-500/60 bg-rose-50 text-rose-900 line-through opacity-85 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-300';
                  badgeStyles = 'bg-rose-500 text-white font-bold border-rose-400';
                } else {
                  cardStyles = 'border-neutral-200/80 bg-neutral-50/50 text-neutral-400 opacity-60 dark:border-neutral-800/60 dark:bg-neutral-950/40 dark:text-neutral-500';
                }
              } else if (isSelected) {
                cardStyles =
                  'border-violet-500 bg-violet-50 text-violet-950 shadow-md shadow-violet-200/50 ring-1 ring-violet-500 dark:border-violet-500 dark:bg-violet-600/20 dark:text-white dark:shadow-violet-900/30';
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
                  className={`${
                    isRevealed ? 'p-2 sm:p-2.5 min-h-[40px]' : 'p-2.5 sm:p-3.5 min-h-[40px] sm:min-h-[48px]'
                  } rounded-xl border text-left flex items-start gap-2 sm:gap-3 transition-all duration-150 group active:scale-[0.99] ${cardStyles}`}
                >
                  <span
                    className={`${
                      isRevealed ? 'w-5 h-5 sm:w-6 sm:h-6 text-[10px] sm:text-[11px]' : 'w-6 h-6 sm:w-7 sm:h-7 text-xs'
                    } rounded-lg flex items-center justify-center shrink-0 uppercase font-mono border transition-all ${badgeStyles}`}
                  >
                    {opt.key}
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5 text-xs sm:text-sm font-medium leading-relaxed">
                    {opt.text}
                  </div>
                  {isRevealed && isCorrect && (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  {isRevealed && isSelected && !isCorrect && (
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
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
              className={`flex-1 ${
                isRevealed ? 'py-2.5 sm:py-3 min-h-[42px]' : 'py-3.5 px-4 min-h-[48px]'
              } rounded-xl border font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                isRevealed && isTrue
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500'
                  : isRevealed && selectedOption === 'true' && !isTrue
                  ? 'border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-300 line-through'
                  : selectedOption === 'true'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                  : 'border-neutral-200 bg-white hover:border-emerald-500/40 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-neutral-300'
              }`}
            >
              <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>{t('formatted_card.true_btn', 'Verdadero')}</span>
            </button>

            <button
              type="button"
              disabled={!interactive || isRevealed}
              onClick={(e) => {
                (e.currentTarget as HTMLElement)?.blur();
                setSelectedOption('false');
              }}
              className={`flex-1 ${
                isRevealed ? 'py-2.5 sm:py-3 min-h-[42px]' : 'py-3.5 px-4 min-h-[48px]'
              } rounded-xl border font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                isRevealed && isFalse
                  ? 'border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-300 ring-1 ring-rose-500'
                  : isRevealed && selectedOption === 'false' && !isFalse
                  ? 'border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-300 line-through'
                  : selectedOption === 'false'
                  ? 'border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-200'
                  : 'border-neutral-200 bg-white hover:border-rose-500/40 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-neutral-300'
              }`}
            >
              <X className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span>{t('formatted_card.false_btn', 'Falso')}</span>
            </button>
          </div>
        )}
      </div>

      {/* REVERSO (BACK) */}
      {isRevealed && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-neutral-200 dark:border-neutral-800/80 space-y-2.5 sm:space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('formatted_card.answer_heading', 'Respuesta / Justificación')}
            </span>

            {resolvedFormat === 'multiple_choice' && correctKey && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 uppercase font-bold">
                {t('formatted_card.correct_option', 'Opción Correcta: ({key})').replace('{key}', correctKey)}
              </span>
            )}
          </div>

          {/* Bloque Clínico de Respuesta y Justificación */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 border-l-4 border-indigo-500/80 dark:border-indigo-400 p-3.5 sm:p-4 rounded-r-xl border-y border-r border-neutral-200/80 dark:border-neutral-800/80 shadow-sm space-y-2.5">
            {/* Veredicto / Respuesta Principal */}
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">
                {resolvedFormat === 'multiple_choice'
                  ? t('formatted_card.verdict_option', 'Opción Correcta')
                  : resolvedFormat === 'true_false'
                  ? t('formatted_card.verdict_tf', 'Veredicto')
                  : t('formatted_card.verdict_title', 'Respuesta / Veredicto')}
              </span>
              <div className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white leading-relaxed">
                {renderMarkdownBold(parsedBack.verdict)}
              </div>
            </div>

            {/* Explicación Técnica Detallada (si existe) */}
            {parsedBack.explanation && (
              <div className="pt-2.5 border-t border-neutral-200/80 dark:border-neutral-800/80">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1">
                  {t('formatted_card.explanation_title', 'Fundamento / Explicación Detallada')}
                </span>
                <div className="text-sm sm:text-base text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {renderMarkdownBold(parsedBack.explanation)}
                </div>
              </div>
            )}
          </div>

          {/* Notas Adicionales o Fuente/Página al pie */}
          {Boolean((notes && notes.trim()) || noteImageUrl) && (
            <div className="space-y-2 pt-1">
              {notes && notes.trim() && (
                <div className="text-xs text-neutral-400 dark:text-neutral-500 font-mono flex items-start gap-1.5 bg-neutral-100/60 dark:bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-200/60 dark:border-neutral-800/60">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 fill-amber-400" />
                  <span className="flex-1 whitespace-pre-wrap leading-relaxed">
                    {notes.trim()}
                  </span>
                </div>
              )}
              {noteImageUrl && (
                <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-black/40 max-h-56 flex items-center justify-center p-1">
                  <img
                    src={noteImageUrl}
                    alt="Nota visual"
                    className="w-full h-auto max-h-52 object-contain rounded-lg"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
