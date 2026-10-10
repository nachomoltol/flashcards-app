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
        front: '¿Cuál es el botón más importante de la pantalla de inicio para empezar a organizar tu temario?',
        back: 'El botón  \'+ Nuevo\'. Desde ahí puedes crear Carpetas (para asignaturas) y Mazos de Estudio (donde irán las tarjetas).',
      },
      {
        front: 'Tienes un PDF de 20 páginas y no quieres escribir las preguntas a mano. ¿Qué haces?',
        back: 'Entras a tu mazo, pulsas \'Generar preguntas con IA\' y arrastras tu PDF. La IA creará las flashcards automáticamente sobre todo el documento o la parte que le pidas. Puedes generar tarjetas tantas veces como quieras en bloques de hasta 30 a la vez.',
      },
      {
        front: 'Acabas de voltear esta tarjeta. Si te ha parecido facilísima y te la sabes de memoria, ¿qué botón debes pulsar ahora mismo?',
        back: 'El botón azul \'Easy\' (o la tecla 4). Al pulsarlo, el algoritmo entenderá que dominas este concepto y tardará más días en volvértela a preguntar para no hacerte perder el tiempo.',
      },
      {
        front: 'Has creado un mazo pero quieres cambiarle el color o borrarlo por completo. ¿Dónde tocas?',
        back: 'En el icono del engranaje (⚙️) o en los tres puntitos (⋮) que aparecen al lado del botón de \'Estudiar\' en la vista general.',
      },
      {
        front: 'Te has quedado en blanco con una pregunta. Pulsas \'Again\' (botón rojo o tecla 1). ¿Qué ocurrirá con esa tarjeta?',
        back: 'Que no te librarás de ella. Volverá a aparecer al final de esta misma sesión de estudio hasta que logres memorizarla y puedas pulsar \'Good\'.',
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
