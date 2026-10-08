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
 * Actualiza dinámicamente la nueva letra y posición de la respuesta correcta tanto en el front como en el back.
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
  const backLetterMatch = backTrimmed.match(/^\s*\(?([a-dA-D])\s*[\)\.\-\]\:]?/i);
  const correctOrigKey = backLetterMatch ? backLetterMatch[1].toLowerCase() : null;

  let correctOpt = options.find((o) => o.origKey === correctOrigKey);
  if (!correctOpt) {
    correctOpt = options.find((o) => backTrimmed.toLowerCase().includes(o.text.toLowerCase()));
  }
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

  // 5. Actualizar dinámicamente el reverso con la nueva letra asignada
  let newBack = backTrimmed;
  if (backLetterMatch) {
    newBack = backTrimmed.replace(/^\s*\(?[a-dA-D]\s*[\)\.\-\]\:]?\s*/i, `${newCorrectKey}) `);
  } else {
    newBack = `${newCorrectKey}) ${correctOpt.text}`;
  }

  return {
    ...card,
    front: newFront,
    back: newBack,
  };
}
