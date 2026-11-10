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
  pedagogicalMode?: 'academic' | 'didactic' | string;
  isDocenteMode?: boolean;
  forceVisible?: boolean;
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

  // Limpiar explanation eliminando etiquetas internas de veredicto
  const cleanExplanation = (parsedBack.explanation || '')
    .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
    .trim();

  // 1. Aislar estrictamente la primera línea del veredicto descartando cualquier bloque explicativo
  const rawVerdictLine = (parsedBack.verdict || back || '')
    .split(/(?:\r?\n+|Explicación:|Justificación:|Fundamento:|Razón:)/i)[0]
    .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
    .trim();

  // 2. Extraer letra si existe viñeta formal (ej: 'a)', 'b.', '(c)')
  const letterMatch = rawVerdictLine.match(/^\s*(?:\*\*)?\(?([a-dA-D])\s*[\)\.\-\]\:]/i);
  const detectedLetter = letterMatch ? letterMatch[1].toLowerCase() : null;

  // INVERSIÓN DE JERARQUÍA (BLINDAJE DETERMINISTA):
  // Si existe una letra formal detectada en el reverso, resolver DIRECTAMENTE la opción del examen
  if (detectedLetter) {
    const letterOpt = parsedFront.options.find(
      (o) => o.key.toLowerCase() === detectedLetter
    );
    if (letterOpt) {
      return {
        letter: letterOpt.key.toLowerCase(),
        text: letterOpt.text,
        explanation: cleanExplanation,
      };
    }
  }

  // 3. Si no hay letra formal, buscar por veredicto explícito o texto aislado de la opción
  const explicitMatch = back.match(
    /(?:VEREDICTO_EXACTO|VEREDICTO|RESPUESTA_CANONICA|RESPUESTA_CANÓNICA|RESPUESTA_CORRECTA)\s*[:=]\s*([^\r\n]+)/i
  );
  const candidateText = (
    explicitMatch
      ? explicitMatch[1]
      : rawVerdictLine.replace(/^\s*(?:\*\*)?\(?[a-dA-D]\s*[\)\.\-\]\:]\s*/i, '')
  ).trim();

  const cleanAns = candidateText
    .toLowerCase()
    .replace(/^[.,;:¿?¡!]+|[.,;:¿?¡!]+$/g, '')
    .trim();

  // Buscar coincidencia rigurosa en parsedFront.options (ELIMINADO: cleanAns.includes(cleanOpt))
  const matchedOpt = parsedFront.options.find((opt) => {
    if (!cleanAns) return false;
    const cleanOpt = opt.text
      .toLowerCase()
      .replace(/^[.,;:¿?¡!]+|[.,;:¿?¡!]+$/g, '')
      .trim();
    if (!cleanOpt) return false;

    // 1. Coincidencia exacta
    if (cleanOpt === cleanAns) return true;

    // 2. Contención unidireccional: la opción completa del examen contiene el veredicto aislado
    if (cleanAns.length >= 3 && cleanOpt.includes(cleanAns)) return true;

    // 3. Prefijo común idéntico
    if (cleanOpt.length >= 4 && cleanAns.length >= 4) {
      if (cleanOpt.startsWith(cleanAns) || cleanAns.startsWith(cleanOpt)) return true;
    }

    return false;
  });

  if (matchedOpt) {
    return {
      letter: matchedOpt.key.toLowerCase(),
      text: matchedOpt.text,
      explanation: cleanExplanation,
    };
  }

  return {
    letter: detectedLetter || (parsedFront.options[0]?.key.toLowerCase() ?? 'a'),
    text: candidateText || rawVerdictLine,
    explanation: cleanExplanation,
  };
}

export function PrintExamSheet({
  deckTitle = 'Cuaderno de Repaso',
  deckDescription,
  cards,
  pedagogicalMode,
  isDocenteMode,
  forceVisible = false,
}: PrintExamSheetProps) {
  const { language, t } = useLanguageStore();
  const isEn = language === 'en';

  // Detección estricta: Modo Docente vs Modo Estudio
  const isDocente =
    isDocenteMode !== undefined
      ? Boolean(isDocenteMode)
      : pedagogicalMode !== undefined
      ? pedagogicalMode === 'didactic'
      : Boolean(
          deckDescription?.toLowerCase().includes('docente') ||
          deckDescription?.toLowerCase().includes('didactic') ||
          deckTitle?.toLowerCase().includes('modo docente')
        );

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div
      className={`print-exam-root w-full bg-white text-black font-sans leading-tight pt-1 ${
        forceVisible ? 'block' : 'hidden print:block'
      }`}
    >
      {/* =========================================================================
          SECCIÓN 1: CUESTIONARIO / HOJA DE ESTUDIO
          Diseño continuo, sin respuestas ni pistas, con cortes limpios de página.
         ========================================================================= */}
      <section className="print-student-section space-y-3">
        {/* Cabecera Formal: Bifurcada según Modo Docente vs Modo Estudio */}
        <header className="border-b-2 border-black pb-2.5 space-y-2 mb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-black uppercase tracking-tight leading-tight">
                {isDocente
                  ? deckTitle
                  : (isEn ? 'STUDY & SELF-ASSESSMENT WORKBOOK' : 'CUADERNO DE REPASO Y AUTOEVALUACIÓN')}
              </h1>
              <p className="text-[9.5pt] text-neutral-800 font-semibold mt-0.5 leading-snug">
                {isDocente ? deckDescription : deckTitle}
                {!isDocente && deckDescription && (
                  <span className="font-normal italic text-neutral-600"> • {deckDescription}</span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block border border-black px-2 py-0.5 text-[9pt] font-mono font-bold uppercase">
                {cards.length} {isEn ? 'QUESTIONS' : 'PREGUNTAS'}
              </span>
            </div>
          </div>

          {/* Fila de Metadatos del Alumno (ÚNICAMENTE EN MODO DOCENTE) */}
          {isDocente && (
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
          )}

          {/* Instrucciones al usuario: bifurcadas */}
          <p className="text-[8.5pt] text-neutral-600 italic leading-snug pt-0.5">
            {isDocente
              ? t(
                  'deck_detail.print_instructions',
                  isEn
                    ? 'Instructions: Read each question carefully. Mark the correct answer with an X or complete your answer in the designated space.'
                    : 'Instrucciones: Lea atentamente cada enunciado. Marque con una X la opción correcta o desarrolle su respuesta en el espacio asignado.'
                )
              : (isEn
                  ? 'Instructions: Read each question carefully to test your conceptual understanding. Check the reasoned solutions at the end of the document.'
                  : 'Instrucciones: Lea cada cuestión y compruebe su nivel de asimilación conceptual. Consulte las soluciones razonadas al final del documento.')}
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
                className="print-question-item break-inside-avoid text-[10pt] leading-snug py-1.5"
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
        {/* Cabecera del Solucionario: Modo Docente vs Modo Estudio */}
        <header className="border-b-2 border-black pb-2 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-black uppercase tracking-tight">
              {isDocente
                ? t(
                    'deck_detail.print_answer_key_title',
                    isEn
                      ? 'Answer Key & Grading Criteria'
                      : 'Hoja de Respuestas y Criterios de Corrección'
                  )
                : (isEn ? 'ANSWER KEYS & SELF-ASSESSMENT' : 'CLAVES DE RESPUESTA Y AUTOEVALUACIÓN')}
            </h2>
            <span className={`${isDocente ? 'bg-black text-white' : 'bg-neutral-800 text-white'} px-2 py-0.5 text-[8pt] font-mono font-bold uppercase tracking-wider shrink-0`}>
              {isDocente
                ? t(
                    'deck_detail.print_answer_key_sub',
                    isEn
                      ? 'Official Solution Sheet • Teacher Use Only'
                      : 'Solucionario Oficial • Uso Exclusivo del Docente'
                  )
                : (isEn ? 'STUDY SOLUTION SHEET' : 'SOLUCIONARIO DE REPASO')}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9pt] text-neutral-700">
            <span>
              {isDocente ? 'Materia / Examen:' : 'Mazo / Temario:'}{' '}
              <strong className="text-black">{deckTitle}</strong>
            </span>
            <span>
              Total: <strong>{cards.length} {isEn ? 'questions' : 'preguntas'}</strong>
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
                className="print-solution-item break-inside-avoid text-[9.5pt] border-b border-neutral-200 py-2.5"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <span className="font-bold text-black text-[10.5pt]">
                      {index + 1}.
                    </span>
                    <span className="text-[7.5pt] font-mono font-bold uppercase px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-neutral-700 rounded-sm shrink-0">
                      {formatLabel}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Veredicto / Solución Principal Destacada con Píldora Visual */}
                    {fmt === 'cloze' ? (
                      <div>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2.5 py-1 font-semibold text-sm inline-block">
                          <span className="text-emerald-700 font-bold mr-1">
                            {t('deck_detail.print_solution_label', isEn ? 'Solution:' : 'Solución:')}
                          </span>
                          {clozeTeacher?.hiddenWords.length
                            ? clozeTeacher.hiddenWords.join(', ')
                            : parsedBack.verdict || card.back}
                        </span>
                        {clozeTeacher?.highlighted && (
                          <p className="text-[8.5pt] text-neutral-600 mt-1 italic leading-snug">
                            &ldquo;{clozeTeacher.highlighted}&rdquo;
                          </p>
                        )}
                      </div>
                    ) : fmt === 'multiple_choice' && mcResolution ? (
                      <div>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2.5 py-1 font-semibold text-sm inline-block">
                          <strong className="font-bold uppercase mr-1">
                            {mcResolution.letter.toUpperCase()})
                          </strong>{' '}
                          {mcResolution.text}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2.5 py-1 font-semibold text-sm inline-block">
                          <span className="text-emerald-700 font-bold mr-1">
                            {t('deck_detail.print_solution_label', isEn ? 'Solution:' : 'Solución:')}
                          </span>
                          {parsedBack.verdict || card.back}
                        </span>
                      </div>
                    )}

                    {/* Bloque de Justificación / Criterios de Evaluación con Espaciado Nítido */}
                    {(mcResolution ? mcResolution.explanation : parsedBack.explanation) && (
                      <div className="mt-2 text-[8.5pt] text-neutral-700 leading-relaxed bg-neutral-50 rounded-md p-2 border-l-2 border-emerald-400">
                        <p>
                          <strong className="text-black font-semibold mr-1">
                            {isDocente
                              ? t(
                                  'deck_detail.print_justification_label',
                                  isEn
                                    ? 'Justification / Evaluation Criteria:'
                                    : 'Justificación / Criterios de Evaluación:'
                                )
                              : (isEn
                                  ? 'Reasoned Explanation:'
                                  : 'Justificación Razonada:')}
                          </strong>
                          {mcResolution ? mcResolution.explanation : parsedBack.explanation}
                        </p>
                      </div>
                    )}

                    {/* Notas adicionales del docente */}
                    {card.notes && (
                      <p className="text-[8pt] text-neutral-500 italic mt-1.5">
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

