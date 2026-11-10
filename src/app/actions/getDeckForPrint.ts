'use server';

import { createClient } from '@supabase/supabase-js';
import type { CardFormat } from '@/types/database';

export interface PrintDeckData {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  cards: {
    id: string;
    front: string;
    back: string;
    card_format: CardFormat | string;
    card_type?: string;
    notes?: string | null;
  }[];
}

export async function getDeckForPrintAction(deckId: string): Promise<{
  data?: PrintDeckData;
  error?: string;
}> {
  if (!deckId || !deckId.trim()) {
    return { error: 'ID de mazo requerido' };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return { error: 'Configuración de base de datos no disponible' };
  }

  const client = createClient(supabaseUrl, serviceRoleKey || anonKey!);

  try {
    const { data: deck, error: deckErr } = await client
      .from('decks')
      .select('id, title, description, color')
      .eq('id', deckId.trim())
      .maybeSingle();

    if (deckErr || !deck) {
      return { error: 'Mazo no encontrado' };
    }

    const { data: cards, error: cardsErr } = await client
      .from('cards')
      .select('id, front, back, card_format, card_type, notes')
      .eq('deck_id', deckId.trim())
      .order('created_at', { ascending: true });

    if (cardsErr) {
      return { error: 'Error al consultar las tarjetas del mazo' };
    }

    return {
      data: {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        color: deck.color,
        cards: cards || [],
      },
    };
  } catch (err: unknown) {
    console.error('Error en getDeckForPrintAction:', err);
    return {
      error: err instanceof Error ? err.message : 'Error inesperado al cargar datos de impresión',
    };
  }
}

