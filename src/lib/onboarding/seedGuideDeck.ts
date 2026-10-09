import { supabase } from '@/lib/supabase';
import { createInitialCardValues } from '@/lib/fsrs/scheduler';

export const GUIDE_DECK_TITLE = 'Guía Rápida';

/**
 * Inyecta el mazo interactivo 'Guía Rápida' para un usuario si aún no existe en su cuenta.
 * Es una operación idempotente y segura para primer inicio de sesión o registro.
 */
export async function ensureQuickGuideDeck(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    // 1. Verificar si el usuario ya posee un mazo con el título "Guía Rápida"
    const { data: existingDeck, error: fetchError } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', userId)
      .eq('title', GUIDE_DECK_TITLE)
      .maybeSingle();

    if (fetchError) {
      console.warn('Advertencia al verificar mazo demo:', fetchError.message);
    }

    if (existingDeck) {
      return existingDeck.id;
    }

    // 2. Crear el mazo "Guía Rápida"
    const { data: newDeck, error: deckError } = await supabase
      .from('decks')
      .insert({
        title: GUIDE_DECK_TITLE,
        description:
          'Mazo de bienvenida interactivo con consejos clave para dominar la interfaz y el algoritmo FSRS.',
        color: '#6366f1',
        is_folder: false,
        user_id: userId,
      })
      .select('id')
      .single();

    if (deckError || !newDeck) {
      console.error('Error al insertar el mazo Guía Rápida:', deckError);
      return null;
    }

    // 3. Generar las tarjetas interactivas de introducción
    const initialFSRS = createInitialCardValues();

    const guideCards = [
      {
        front: '¿Para qué sirven los tres puntitos (⋮) al lado de una carpeta o mazo?',
        back: 'Despliegan el menú contextual para cambiar el nombre o color, mover carpetas y mazos a otra ubicación, compartir con un enlace o eliminarlos.',
      },
      {
        front: '¿Qué formatos de archivos y fuentes admite la IA para crear tarjetas?',
        back: 'Admite documentos PDF, archivos de Word (.docx, .doc), audios (.mp3, .wav) y enlaces directos a vídeos de YouTube o páginas web.',
      },
      {
        front: '¿Cómo evalúa el algoritmo científico FSRS tu retención tras voltear una tarjeta?',
        back: 'Te permite calificar tu recuerdo del 1 al 4 (Again, Hard, Good, Easy). FSRS calcula con exactitud matemática el día ideal del siguiente repaso para afianzar tu memoria a largo plazo.',
      },
      {
        front: '¿Cómo puedes mantener organizada tu biblioteca de estudio?',
        back: 'Crea Carpetas para tus asignaturas o grandes áreas temáticas y añade Mazos dentro de ellas para cada tema o lección específica.',
      },
      {
        front: '¿Qué sucede si marcas una tarjeta con "Again" (1) durante tu sesión?',
        back: 'La tarjeta se reprograma de inmediato y vuelve a aparecer al final de la misma sesión para que fijes el concepto antes de terminar tu estudio diario.',
      },
    ];

    const cardsToInsert = guideCards.map((c) => ({
      deck_id: newDeck.id,
      front: c.front,
      back: c.back,
      card_type: 'basic',
      card_format: 'basic' as const,
      cardFormat: 'basic' as const,
      due: initialFSRS.due,
      stability: initialFSRS.stability,
      difficulty: initialFSRS.difficulty,
      state: initialFSRS.state,
      reps: initialFSRS.reps,
      lapses: initialFSRS.lapses,
      last_review: initialFSRS.last_review,
    }));

    const { error: cardsError } = await supabase.from('cards').insert(cardsToInsert);
    if (cardsError) {
      console.error('Error al insertar las tarjetas de la Guía Rápida:', cardsError);
    }

    return newDeck.id;
  } catch (err) {
    console.error('Excepción en ensureQuickGuideDeck:', err);
    return null;
  }
}
