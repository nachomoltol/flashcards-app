'use client';

import React from 'react';
import { parseMultipleChoice, parseBackContent } from '@/components/cards/FormattedCardView';
import { useLanguageStore } from '@/stores';
import type { CardFormat } from '@/types/database';

export interface PrintCardItem {
  id?: string;
  front: string;
  back: string;
  cardFormat?: CardFormat | string;
  card_format?: CardFormat | string;
  card_type?: string;
  notes?: string | null;
  note_image_url?: string | null;
}

export interface PrintExamSheetProps {
  deckTitle?: string;
  deckDescription?: string | null;
  cards: PrintCardItem[];
}

/**
 * Reemplaza los marcadores cloze {{c1::palabra}} y [...] por espacios en blanco para el alumno.
 */
function formatClozeForStudent(text: string): string {
  if (!text) return '';
  return text
    .replace(/\{\{c\d+::(.*?)\}\}/g, '[  ____________________  ]')
    .replace(/\[\.\.\.\]/g, '[  ____________________  ]');
}

/**
 * Extrae las palabras ocultas y reconstruye el texto resaltando la solución para el docente.
 */
function formatClozeForTeacher(text: string): { highlighted: string; hiddenWords: string[] } {
  if (!text) return { highlighted: '', hiddenWords: [] };
  const hiddenWords: string[] = [];
  const highlighted = text.replace(/\{\{c\d+::(.*?)\}\}/g, (_, word) => {
    hiddenWords.push(word);
    return `[${word}]`;
  });
  return { highlighted, hiddenWords };
}

/**
 * Resuelve la solución canónica para preguntas tipo test conciliando
 * las opciones reales del anverso con el texto del reverso.
 * Previene discrepancias de letras y recortes de caracteres en tarjetas históricas.
 */
function resolveMultipleChoiceSolution(
  front: string,
  back: string
): { letter: string; text: string; explanation: string } {
  const parsedFront = parseMultipleChoice(front);
  const parsedBack = parseBackContent(back, 'multiple_choice');
  const verdictRaw = parsedBack.verdict || back;

  // Extraer letra si existe viñeta formal
  const letterMatch = verdictRaw.match(/^\s*(?:\*\*)?\(?([a-dA-D])\s*[\)\.\-\]\:]/i);
  const detectedLetter = letterMatch ? letterMatch[1].toLowerCase() : null;

  // Limpiar texto de la respuesta en el veredicto (eliminando la viñeta si la tuviese y puntuación periférica)
  const cleanAnswerText = verdictRaw.replace(/^\s*(?:\*\*)?\(?[a-dA-D]\s*[\)\.\-\]\:]\s*/i, '').trim();
  const cleanAns = cleanAnswerText.toLowerCase().replace(/^[.,;:¿?¡!]+|[.,;:¿?¡!]+$/g, '').trim();

  // Buscar coincidencia en parsedFront.options por contenido de texto
  const matchedOpt = parsedFront.options.find((opt) => {
    if (!cleanAns) return false;
    const cleanOpt = opt.text.toLowerCase().replace(/^[.,;:¿?¡!]+|[.,;:¿?¡!]+$/g, '').trim();
    if (!cleanOpt) return false;

    // 1. Coincidencia exacta
    if (cleanOpt === cleanAns) return true;

    // 2. Contención directa (con longitud mínima de seguridad)
    if (cleanAns.length >= 3 && cleanOpt.includes(cleanAns)) return true;
    if (cleanOpt.length >= 3 && cleanAns.includes(cleanOpt)) return true;

    // 3. Rescate específico para mutilación de primera letra en tarjetas legacy (ej: 'ctúan' vs 'actúan')
    if (cleanOpt.length > 3 && cleanAns.includes(cleanOpt.slice(1))) return true;
    if (cleanAns.length > 3 && cleanOpt.includes(cleanAns.slice(0, Math.min(cleanAns.length, 12)))) return true;

    return false;
  });

  if (matchedOpt) {
    // Si encontramos la opción por texto, la letra canónica es la de esa opción en el examen
    return {
      letter: matchedOpt.key.toLowerCase(),
      text: matchedOpt.text,
      explanation: parsedBack.explanation,
    };
  }

  // Fallback si coincide por letra directa en el examen
  const letterOpt = detectedLetter ? parsedFront.options.find((o) => o.key.toLowerCase() === detectedLetter) : null;
  if (letterOpt) {
    return {
      letter: letterOpt.key.toLowerCase(),
      text: letterOpt.text,
      explanation: parsedBack.explanation,
    };
  }

  return {
    letter: detectedLetter || 'a',
    text: cleanAnswerText || verdictRaw,
    explanation: parsedBack.explanation,
  };
}

export function PrintExamSheet({
  deckTitle = 'Examen de Evaluación',
  deckDescription,
  cards,
}: PrintExamSheetProps) {
  const { language, t } = useLanguageStore();
  const isEn = language === 'en';

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div className="hidden print:block print-exam-root w-full bg-white text-black font-sans leading-tight">
      {/* =========================================================================
          SECCIÓN 1: CUESTIONARIO DE EVALUACIÓN (PARA EL ALUMNADO)
          Diseño continuo, ultra-compacto, sin respuestas ni pistas.
         ========================================================================= */}
      <section className="print-student-section space-y-3">
        {/* Cabecera Formal de Examen */}
        <header className="border-b-2 border-black pb-2.5 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-black uppercase tracking-tight leading-tight">
                {deckTitle}
              </h1>
              {deckDescription && (
                <p className="text-[9pt] text-neutral-700 italic mt-0.5 leading-snug">
                  {deckDescription}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block border border-black px-2 py-0.5 text-[9pt] font-mono font-bold uppercase">
                {cards.length} {isEn ? 'QUESTIONS' : 'PREGUNTAS'}
              </span>
            </div>
          </div>

          {/* Fila de Metadatos del Alumno */}
          <div className="grid grid-cols-12 gap-2 text-[9.5pt] pt-1">
            <div className="col-span-6 border-b border-black pb-0.5">
              <span className="font-bold">{t('deck_detail.print_student_label', isEn ? 'Student:' : 'Alumno/a:')} </span>
            </div>
            <div className="col-span-3 border-b border-black pb-0.5">
              <span className="font-bold">{t('deck_detail.print_date_label', isEn ? 'Date:' : 'Fecha:')} </span>
            </div>
            <div className="col-span-3 border-b border-black pb-0.5">
              <span className="font-bold">{t('deck_detail.print_score_label', isEn ? 'Score:' : 'Nota / Calificación:')} </span>
            </div>
          </div>

          {/* Instrucciones Breves */}
          <p className="text-[8.5pt] text-neutral-600 italic leading-snug">
            {t(
              'deck_detail.print_instructions',
              isEn
                ? 'Instructions: Read each question carefully. Mark the correct answer with an X or complete your answer in the designated space.'
                : 'Instrucciones: Lea atentamente cada enunciado. Marque con una X la opción correcta o desarrolle su respuesta en el espacio asignado.'
            )}
          </p>
        </header>

        {/* Lista Continua de Preguntas */}
        <div className="space-y-3 pt-1">
          {cards.map((card, index) => {
            const fmt = (
              card.cardFormat ||
              card.card_format ||
              (card.card_type === 'cloze' ? 'cloze' : 'basic')
            ) as CardFormat;

            return (
              <article
                key={card.id || `print-q-${index}`}
                className="print-question-item break-inside-avoid text-[10pt] leading-snug"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                {/* 1. Opción Múltiple (Test) */}
                {fmt === 'multiple_choice' && (() => {
                  const parsed = parseMultipleChoice(card.front);
                  const isShortOptions =
                    parsed.options.length > 0 &&
                    parsed.options.every((opt) => opt.text.length <= 48);

                  return (
                    <div className="space-y-1">
                      <div className="flex items-start gap-1.5">
                        <span className="font-bold shrink-0">{index + 1}.</span>
                        <p className="font-medium text-black">
                          {parsed.question || card.front}
                        </p>
                      </div>

                      {parsed.options.length > 0 ? (
                        <div
                          className={`pl-5 pt-0.5 ${
                            isShortOptions
                              ? 'grid grid-cols-2 gap-x-4 gap-y-1'
                              : 'space-y-1'
                          }`}
                        >
                          {parsed.options.map((opt, optIndex) => (
                            <div
                              key={`print-opt-${card.id || index}-${opt.key || ''}-${optIndex}`}
                              className="flex items-start gap-1.5 text-[9.5pt]"
                            >
                              <span className="inline-block w-3.5 h-3.5 border border-black rounded-[2px] shrink-0 mt-0.5" />
                              <span className="leading-tight">
                                <strong className="font-bold uppercase">
                                  {opt.key})
                                </strong>{' '}
                                {opt.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="pl-5 pt-1 text-[9pt] italic text-neutral-500">
                          {/* Fallback si el texto no separó opciones */}
                          {card.front}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Verdadero o Falso */}
                {fmt === 'true_false' && (
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold shrink-0">{index + 1}.</span>
                      <p className="font-medium text-black">{card.front}</p>
                    </div>
                    <div className="flex items-center gap-6 pl-5 pt-0.5 text-[9.5pt]">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3.5 h-3.5 border border-black rounded-[2px]" />
                        <span className="font-semibold">
                          {isEn ? 'True' : 'Verdadero'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3.5 h-3.5 border border-black rounded-[2px]" />
                        <span className="font-semibold">
                          {isEn ? 'False' : 'Falso'}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Huecos (Cloze) */}
                {fmt === 'cloze' && (
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold shrink-0">{index + 1}.</span>
                      <p className="font-medium text-black leading-relaxed">
                        {formatClozeForStudent(card.front)}
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Pregunta Corta / Casos de Desarrollo */}
                {fmt === 'basic' && (
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold shrink-0">{index + 1}.</span>
                      <p className="font-medium text-black">{card.front}</p>
                    </div>
                    {/* Líneas pautadas compactas para responder */}
                    <div className="pl-5 pt-1 space-y-2">
                      <div className="border-b border-neutral-400 h-3 w-full" />
                      <div className="border-b border-neutral-400 h-3 w-full" />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          SECCIÓN 2: HOJA DE RESPUESTAS DEL DOCENTE (SOLUCIONARIO OFICIAL)
          Fuerza un salto de página estricto (page-break-before: always).
          Muestra respuestas correctas, justificaciones argumentadas y rúbricas.
         ========================================================================= */}
      <section
        className="print-teacher-section break-before-page pt-4 space-y-3"
        style={{ breakBefore: 'page', pageBreakBefore: 'always' }}
      >
        {/* Cabecera del Solucionario */}
        <header className="border-b-2 border-black pb-2 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-black uppercase tracking-tight">
              {t(
                'deck_detail.print_answer_key_title',
                isEn
                  ? 'Answer Key & Grading Criteria'
                  : 'Hoja de Respuestas y Criterios de Corrección'
              )}
            </h2>
            <span className="bg-black text-white px-2 py-0.5 text-[8pt] font-mono font-bold uppercase tracking-wider shrink-0">
              {t(
                'deck_detail.print_answer_key_sub',
                isEn
                  ? 'Official Solution Sheet • Teacher Use Only'
                  : 'Solucionario Oficial • Uso Exclusivo del Docente'
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9pt] text-neutral-700">
            <span>
              Materia / Examen: <strong className="text-black">{deckTitle}</strong>
            </span>
            <span>
              Total: <strong>{cards.length} preguntas</strong>
            </span>
          </div>
        </header>

        {/* Lista Continua de Soluciones (Optimizada para espacio) */}
        <div className="space-y-2 pt-1">
          {cards.map((card, index) => {
            const fmt = (
              card.cardFormat ||
              card.card_format ||
              (card.card_type === 'cloze' ? 'cloze' : 'basic')
            ) as CardFormat;

            const formatLabel =
              fmt === 'multiple_choice'
                ? 'Test'
                : fmt === 'true_false'
                ? 'V/F'
                : fmt === 'cloze'
                ? 'Cloze'
                : 'Desarrollo';

            const parsedBack = parseBackContent(card.back, fmt);
            const clozeTeacher = fmt === 'cloze' ? formatClozeForTeacher(card.front) : null;
            const mcResolution =
              fmt === 'multiple_choice' ? resolveMultipleChoiceSolution(card.front, card.back) : null;

            return (
              <article
                key={`print-sol-${card.id || index}`}
                className="print-solution-item break-inside-avoid text-[9.5pt] border-b border-neutral-200 pb-1.5"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-black shrink-0">
                    {index + 1}.
                  </span>
                  <span className="text-[8pt] font-mono font-bold uppercase px-1 py-0.2 bg-neutral-200 text-neutral-800 rounded-xs shrink-0">
                    {formatLabel}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    {/* Veredicto / Solución Principal */}
                    {fmt === 'cloze' ? (
                      <div>
                        <span className="font-bold text-black">
                          {t('deck_detail.print_solution_label', isEn ? 'Solution:' : 'Solución:')}{' '}
                        </span>
                        <span className="font-mono font-bold text-neutral-900">
                          {clozeTeacher?.hiddenWords.length
                            ? clozeTeacher.hiddenWords.join(', ')
                            : parsedBack.verdict || card.back}
                        </span>
                        {clozeTeacher?.highlighted && (
                          <p className="text-[8.5pt] text-neutral-600 mt-0.5 italic">
                            &ldquo;{clozeTeacher.highlighted}&rdquo;
                          </p>
                        )}
                      </div>
                    ) : fmt === 'multiple_choice' && mcResolution ? (
                      <div>
                        <span className="font-bold text-black">
                          {t('deck_detail.print_solution_label', isEn ? 'Solution:' : 'Solución:')}{' '}
                        </span>
                        <span className="font-semibold text-neutral-900">
                          {mcResolution.letter.toUpperCase()}) {mcResolution.text}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold text-black">
                          {t('deck_detail.print_solution_label', isEn ? 'Solution:' : 'Solución:')}{' '}
                        </span>
                        <span className="font-semibold text-neutral-900">
                          {parsedBack.verdict || card.back}
                        </span>
                      </div>
                    )}

                    {/* Justificación o Rúbrica */}
                    {(mcResolution ? mcResolution.explanation : parsedBack.explanation) && (
                      <p className="text-[8.5pt] text-neutral-700 leading-snug">
                        <strong className="text-black font-semibold">
                          {t(
                            'deck_detail.print_justification_label',
                            isEn
                              ? 'Justification / Rubric:'
                              : 'Justificación / Criterios:'
                          )}{' '}
                        </strong>
                        {mcResolution ? mcResolution.explanation : parsedBack.explanation}
                      </p>
                    )}

                    {/* Notas adicionales del docente */}
                    {card.notes && (
                      <p className="text-[8pt] text-neutral-500 italic">
                        Nota: {card.notes}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

