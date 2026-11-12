import type { GeneratedCard } from '@/types/cards';

/**
 * Función universal de saneamiento de prefijos de opciones.
 * Elimina EXCLUSIVAMENTE letras de opción a-d / A-D seguidas de ), ., - o : y espacio obligatorio.
 * JAMÁS elimina dígitos numéricos al inicio, garantizando que opciones numéricas como "100 mg/dl", "70 mg/dl", "0.5 g" conserven intactos todos sus dígitos.
 */
export function stripOptionPrefix(text: string): string {
  if (!text) return '';
  return text
    // Elimina estrictamente prefijos con letra de opción [a-dA-D] seguidas de delimitador formal y espacio
    .replace(/^\s*(?:\*{1,2}|_{1,2})?\(?[a-dA-D][\)\.\:\-\]](?:\*{1,2}|_{1,2})?\s+/i, '')
    .replace(/^\s*(?:\*{1,2}|_{1,2})?\([a-dA-D]\)(?:\*{1,2}|_{1,2})?\s+/i, '')
    .trim();
}

/**
 * Sanitiza el texto del anverso (front o question) eliminando muletillas editoriales
 * de localización en el libro (cuadros, tablas, figuras, páginas o referencias a estudios).
 */
export function sanitizeCardFrontText(rawFront: string): string {
  if (!rawFront) return '';
  let text = rawFront.trim();

  // Limpieza inicial contra doble apertura errónea en enunciados narrativos / viñetas clínicas:
  // Ej: "¿Un paciente acude a consulta. ¿Qué...?" -> "Un paciente acude a consulta. ¿Qué...?"
  text = text.replace(/^\s*¿\s*([^?]+?\.\s*¿)/, '$1');

  // Limpieza si quedaron dos signos '¿' abiertos en la misma oración (ej. "¿De acuerdo con..., ¿qué...?")
  text = text.replace(/¿\s*([^?]*?)\s*¿/g, '¿$1');

  // 1. Limpieza al inicio de la oración
  // Ej: "De acuerdo con el Cuadro 4-3, ¿qué..." -> "¿Qué..."
  // Ej: "Según la Tabla 2, el proceso..." -> "El proceso..."
  // Ej: "En el Cuadro 4-3 se describe que... ¿cuál...?"
  text = text.replace(
    /^(?:¿\s*)?(?:de\s+acuerdo\s+con|seg[uú]n|conforme\s+a|en)\s+(?:el\s+cuadro|la\s+tabla|la\s+figura|el\s+gr[aá]fico|la\s+ilustraci[oó]n|la\s+secci[oó]n|el\s+recuadro)\s+(?:de\s+[^,.:\n?]+|\d+(?:[.\-_]\d+)?)?(?:\s*\([^)]*\))?\s*[,.:;]?\s*(?:se\s+muestra\s+que|se\s+indica\s+que|se\s+describe\s+que)?\s*[,.:;]?\s*(?:¿\s*)?/i,
    ''
  );

  // Limpieza de referencias a estudios/documento al inicio
  text = text.replace(
    /^(?:¿\s*)?(?:seg[uú]n|de\s+acuerdo\s+con)\s+(?:el\s+documento|el\s+texto|el\s+art[ií]culo|el\s+estudio(?:\s+(?:mencionado|citado)(?:\s+en\s+el\s+recuadro(?:\s+['"][^'"]*['"])?)?)?)\s*[,.:;]?\s*(?:¿\s*)?/i,
    ''
  );

  // 2. Limpieza en medio o al final de la oración
  // Ej: "¿En qué rango se clasifican estos alimentos según el Cuadro 4-3?" -> "¿En qué rango se clasifican estos alimentos?"
  // Ej: "...según la información del Cuadro 4-3?" -> "...?"
  text = text.replace(
    /\s*[,;]?\s*(?:de\s+acuerdo\s+con|seg[uú]n|conforme\s+a)\s+(?:el\s+cuadro|la\s+tabla|la\s+figura|el\s+gr[aá]fico|el\s+documento|el\s+texto|la\s+informaci[oó]n\s+del\s+cuadro|la\s+informaci[oó]n\s+de\s+la\s+tabla)\s+(?:de\s+[^,.:?\n]+|\d+(?:[.\-_]\d+)?)?\s*(\?|\.|$)/gi,
    '$1'
  );

  text = text.replace(
    /\s*[,;]?\s*seg[uú]n\s+el\s+estudio(?:\s+(?:mencionado|citado)(?:\s+en\s+el\s+recuadro(?:\s+['"][^'"]*['"])?)?)?\s*(\?|\.|$)/gi,
    '$1'
  );

  // Re-chequeo tras limpieza por si quedaron signos '¿' redundantes
  text = text.replace(/¿\s*([^?]*?)\s*¿/g, '¿$1');

  // 3. Ajuste de puntuación y espaciado previo a signos de interrogación
  text = text.replace(/\s+\?/g, '?').replace(/\s+\./g, '.').trim();

  // Si el texto termina en '?' pero no contiene ningún '¿'
  if (text.endsWith('?') && !text.includes('¿')) {
    // Si hay un punto y espacio antes de la pregunta final (ej: narrativa/caso clínico + pregunta)
    const lastDotSpaceIndex = text.lastIndexOf('. ');
    if (lastDotSpaceIndex !== -1 && lastDotSpaceIndex < text.length - 2) {
      const narrativePart = text.substring(0, lastDotSpaceIndex + 2);
      const questionPart = text.substring(lastDotSpaceIndex + 2).trim();
      if (/^[a-záéíóúñ]/i.test(questionPart)) {
        text = `${narrativePart}¿${questionPart}`;
      }
    } else if (!text.startsWith('¿') && /^[a-záéíóúñ]/i.test(text)) {
      // Oración única sin puntos intermedios
      text = `¿${text}`;
    }
  }

  // Asegurar que la primera letra tras cualquier '¿' sea mayúscula
  text = text.replace(/(¿\s*)([a-záéíóúñ])/gi, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  if (!text.startsWith('¿')) {
    text = text.replace(/^([a-záéíóúñ])/i, (match) => match.toUpperCase());
  }

  return text;
}

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
    const optRegex = /(?:^|\r?\n)\s*(?:\(?([a-dA-D])\s*[\)\.\-\]\:]|\b([a-dA-D])\))\s*([\s\S]*?)(?=(?:\r?\n\s*(?:\(?[a-dA-D]\s*[\)\.\-\]\:]|\b[a-dA-D]\))\s+)|$)/gi;
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

  // 2. Determinar la opción correcta original a partir del reverso (back) y veredicto explícito
  const backTrimmed = card.back.trim();

  // REGEX BLINDADO: Exige delimitador formal OBLIGATORIO (paréntesis, punto, guion, dos puntos)
  // Soporta opcionalmente prefijos de negrita (**a)** o **a) **)
  const strictLetterRegex = /^\s*(?:\*\*)?\(?([a-dA-D])\s*[\)\.\-\]\:](?:\*\*)?\s*/i;
  const backLetterMatch = backTrimmed.match(strictLetterRegex);
  const correctOrigKey = backLetterMatch ? backLetterMatch[1].toLowerCase() : null;

  // Extraer el texto limpio de la respuesta en el reverso (aislando exclusivamente el veredicto antes de cualquier explicación)
  const cleanBackText = backTrimmed
    .replace(strictLetterRegex, '')
    .split(/(?:\r?\n+|Explicación:|Justificación:|Fundamento:|Razón:)/i)[0]
    .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
    .replace(/[.,;:]+$/, '')
    .trim()
    .toLowerCase();

  let correctOpt: { origKey: string; text: string } | undefined;

  // PASO 1: Si existe etiqueta explícita VEREDICTO_EXACTO en justificación o reverso
  const explicitMatch = `${card.justification || ''}\n${backTrimmed}`.match(
    /(?:VEREDICTO_EXACTO|VEREDICTO|RESPUESTA_CANONICA|RESPUESTA_CANÓNICA|RESPUESTA_CORRECTA)\s*[:=]\s*([^\r\n]+)/i
  );
  if (explicitMatch) {
    const explicitNorm = explicitMatch[1].toLowerCase().replace(/[.,;:]+$/, '').trim();
    if (explicitNorm) {
      correctOpt = options.find((o) => {
        const optLower = o.text.toLowerCase().replace(/[.,;:]+$/, '').trim();
        return (
          optLower === explicitNorm ||
          explicitNorm.startsWith(optLower) ||
          optLower.startsWith(explicitNorm)
        );
      });
    }
  }

  // PASO 2: Si hay letra detectada en el veredicto, verificar si la opción con esa clave coincide
  if (!correctOpt && correctOrigKey) {
    const candidateByLetter = options.find((o) => o.origKey === correctOrigKey);
    if (candidateByLetter) {
      correctOpt = candidateByLetter;
    }
  }

  // PASO 3: Búsqueda estricta por contenido en el veredicto aislado (sin buscar en explicaciones completas)
  if (!correctOpt && cleanBackText) {
    correctOpt = options.find((o) => {
      const optLower = o.text.toLowerCase().replace(/[.,;:]+$/, '').trim();
      if (!optLower) return false;
      return (
        optLower === cleanBackText ||
        cleanBackText.startsWith(optLower) ||
        optLower.startsWith(cleanBackText)
      );
    });
  }

  // PASO 4: Fallback de seguridad final (primera opción)
  if (!correctOpt) {
    correctOpt = options[0];
  }

  // 3. Aplicar algoritmo de mezcla Fisher-Yates
  const shuffledOptions = shuffleArray(options);

  // 4. Asignar las nuevas letras a, b, c, d y recalcular el índice de la opción correcta
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  let newCorrectKey = 'a';
  let newCorrectIndex = 0;
  const newOptionLines: string[] = [];

  shuffledOptions.forEach((opt, idx) => {
    const assignedLetter = letters[idx] || String.fromCharCode(97 + idx);
    if (opt === correctOpt) {
      newCorrectKey = assignedLetter;
      newCorrectIndex = idx;
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

  // Limpiar etiquetas internas de veredicto para presentación limpia
  newBack = newBack
    .replace(/VEREDICTO_EXACTO\s*[:=]\s*[^\r\n]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    ...card,
    correct_option_index: newCorrectIndex,
    front: newFront,
    back: newBack,
    options: shuffledOptions.map((o) => o.text),
  };
}
