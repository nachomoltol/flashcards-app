import type { GeneratedCard } from '@/types/cards';

/**
 * Algoritmo de mezcla Fisher-Yates para barajar arrays aleatoriamente.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Parsea y aleatoriza las opciones de las tarjetas multiple_choice usando el algoritmo Fisher-Yates.
 * Actualiza dinámicamente la nueva letra y posición de la respuesta correcta tanto en el front como en el back,
 * garantizando que nunca se recorten palabras y sincronizando card.options.
 */
export function randomizeMultipleChoiceCard(card: GeneratedCard): GeneratedCard {
  if (card.cardFormat !== 'multiple_choice') {
    return card;
  }

  const cleanFront = card.front.trim();

  // 1. Detectar el inicio de la primera opción 'a)' / '(a)' / 'a.'
  const optionDelimRegex = /(?:^|\r?\n|\s+)(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s+/g;
  let firstOptionIndex = -1;
  let matchDelim: RegExpExecArray | null;

  while ((matchDelim = optionDelimRegex.exec(cleanFront)) !== null) {
    const letter = (matchDelim[1] || matchDelim[2]).toLowerCase();
    if (letter === 'a') {
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

  const options: { origKey: string; text: string }[] = [];

  if (rawOptionsBlock) {
    const optRegex = /(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s*([\s\S]*?)(?=(?:(?:\r?\n|\s+)(?:\(?[a-dA-D]\s*[\)\.\-\]\:]|\b[a-dA-D]\))\s+)|$)/gi;
    let optMatch: RegExpExecArray | null;

    while ((optMatch = optRegex.exec(rawOptionsBlock)) !== null) {
      const key = (optMatch[1] || optMatch[2]).toLowerCase();
      const text = optMatch[3].trim().replace(/\s+/g, ' ').trim();
      if (text) {
        options.push({ origKey: key, text });
      }
    }
  }

  // Fallback si no se extrajeron suficientes opciones por lookahead
  if (options.length < 2) {
    options.length = 0;
    const lines = cleanFront.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const qLines: string[] = [];
    const lineOptionRegex = /^(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s*(.+)$/i;

    for (const line of lines) {
      const matchLine = line.match(lineOptionRegex);
      if (matchLine) {
        options.push({
          origKey: (matchLine[1] || matchLine[2]).toLowerCase(),
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

  // Si no hay suficientes opciones para barajar, devolver la tarjeta original
  if (options.length < 2) {
    return card;
  }

  const cleanQuestion = rawQuestion
    .replace(/(?:^|\r?\n|\s+)(?:\(?a\s*[\)\.\-\]\:]|\ba\))\s+[\s\S]*$/i, '')
    .trim();

  // 2. Determinar la opción correcta original a partir del reverso (back)
  const backTrimmed = card.back.trim();

  // REGEX BLINDADO: Exige delimitador formal OBLIGATORIO (paréntesis, punto, guion, dos puntos)
  // Soporta opcionalmente prefijos de negrita (**a)** o **a) **)
  const strictLetterRegex = /^\s*(?:\*\*)?\(?([a-dA-D])\s*[\)\.\-\]\:](?:\*\*)?\s*/i;
  const backLetterMatch = backTrimmed.match(strictLetterRegex);
  const correctOrigKey = backLetterMatch ? backLetterMatch[1].toLowerCase() : null;

  // Extraer el texto limpio de la respuesta en el reverso (eliminando la viñeta inicial si existe y delimitadores de explicación)
  const cleanBackText = backTrimmed
    .replace(strictLetterRegex, '')
    .split(/(?:\r?\n+|Explicación:|Justificación:|Fundamento:|Razón:)/i)[0]
    .replace(/[.,;:]+$/, '')
    .trim()
    .toLowerCase();

  let correctOpt: { origKey: string; text: string } | undefined;

  // PASO A: Si hay letra detectada, verificar si el texto de la opción con esa clave coincide realmente
  if (correctOrigKey) {
    const candidateByLetter = options.find((o) => o.origKey === correctOrigKey);
    if (candidateByLetter) {
      const candTextLower = candidateByLetter.text.toLowerCase().replace(/[.,;:]+$/, '').trim();
      if (
        candTextLower &&
        cleanBackText &&
        (candTextLower === cleanBackText ||
          cleanBackText.includes(candTextLower) ||
          (candTextLower.length >= 3 && candTextLower.includes(cleanBackText)))
      ) {
        correctOpt = candidateByLetter;
      }
    }
  }

  // PASO B (Escudo principal anti-alucinación de letra):
  // Si no coincide (discrepancia letra vs texto generada por la IA), buscar en TODAS las opciones
  // cuál es la que verdaderamente coincide por contenido o inclusión con la respuesta del reverso
  if (!correctOpt && cleanBackText) {
    // 1. Coincidencia directa o inclusión con el texto del veredicto
    correctOpt = options.find((o) => {
      const optLower = o.text.toLowerCase().replace(/[.,;:]+$/, '').trim();
      if (!optLower) return false;
      return (
        optLower === cleanBackText ||
        cleanBackText.includes(optLower) ||
        (optLower.length >= 3 && optLower.includes(cleanBackText))
      );
    });

    // 2. Coincidencia en todo el reverso completo si el corte de la primera línea fue muy breve
    if (!correctOpt) {
      const fullBackLower = backTrimmed.toLowerCase();
      correctOpt = options.find((o) => {
        const optLower = o.text.toLowerCase().replace(/[.,;:]+$/, '').trim();
        return optLower.length >= 3 && fullBackLower.includes(optLower);
      });
    }
  }

  // PASO C: Fallback secundario si aún no se halló por texto: usar la letra detectada
  if (!correctOpt && correctOrigKey) {
    correctOpt = options.find((o) => o.origKey === correctOrigKey);
  }

  // PASO D: Fallback de seguridad final (primera opción)
  if (!correctOpt) {
    correctOpt = options[0];
  }

  // 3. Aplicar algoritmo de mezcla Fisher-Yates
  const shuffledOptions = shuffleArray(options);

  // 4. Asignar las nuevas letras a, b, c, d y construir el nuevo anverso
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  let newCorrectKey = 'a';
  const newOptionLines: string[] = [];

  shuffledOptions.forEach((opt, idx) => {
    const assignedLetter = letters[idx] || String.fromCharCode(97 + idx);
    if (opt === correctOpt) {
      newCorrectKey = assignedLetter;
    }
    newOptionLines.push(`${assignedLetter}) ${opt.text}`);
  });

  const newFront = `${cleanQuestion || rawQuestion}\n\n${newOptionLines.join('\n')}`;

  // 5. Actualizar dinámicamente el reverso preservando 100% el texto y las explicaciones
  let newBack = backTrimmed;
  if (backLetterMatch) {
    // Si tenía viñeta formal, reemplazar ÚNICAMENTE la viñeta respetando el resto del texto
    newBack = backTrimmed.replace(strictLetterRegex, `${newCorrectKey}) `);
  } else {
    // Si NO tenía viñeta formal, anteponer la nueva viñeta SIN borrar el texto ni explicaciones
    newBack = `${newCorrectKey}) ${backTrimmed}`;
  }

  return {
    ...card,
    front: newFront,
    back: newBack,
    options: shuffledOptions.map((o) => o.text),
  };
}
