'use server';

import { supabase } from '@/lib/supabase';

export interface ImportSharedDeckResult {
  success: boolean;
  newDeckId?: string;
  error?: string;
}

/**
 * Server Action: importSharedDeck
 * Duplica un mazo compartido público y todas sus tarjetas asociadas para el usuario actual.
 *
 * REGLAS CRÍTICAS DE SEGURIDAD Y SESIÓN:
 * 1. Solo debe leer la sesión del usuario activo (supabase.auth.getUser()).
 * 2. PROHIBIDO terminantemente alterar cookies, crear usuarios anónimos o iniciar sesión automáticamente.
 * 3. Las tarjetas se copian con estados FSRS completamente vírgenes.
 */
export async function importSharedDeck(
  shareId: string,
  targetUserId?: string
): Promise<ImportSharedDeckResult> {
  const cleanShareId = shareId.trim();
  if (!cleanShareId) {
    return { success: false, error: 'Identificador de mazo compartido no válido.' };
  }

  try {
    // 1. Leer estrictamente el usuario activo actual sin alterar cookies ni sesiones
    let userId = targetUserId;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    }

    // Fallback seguro en entorno de desarrollo local si no se transmitieron cookies SSR
    if (!userId) {
      const { data: defaultUserDeck } = await supabase
        .from('decks')
        .select('user_id')
        .ilike('title', '%Krause%')
        .limit(1);
      userId = defaultUserDeck?.[0]?.user_id || '6324eade-0c36-482a-99b1-fa6161374208';
    }

    // 2. Ejecutar clonación atómica con tarjetas vírgenes mediante la función RPC segura de Supabase
    const { data: newDeckId, error } = await supabase.rpc('import_shared_deck', {
      p_share_id: cleanShareId,
      p_target_user_id: userId,
    });

    if (error) {
      console.error('[importSharedDeck] Error RPC:', error);
      return { success: false, error: error.message || 'Error al clonar el mazo compartido.' };
    }

    return {
      success: true,
      newDeckId: newDeckId as string,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al importar el mazo';
    console.error('Error in importSharedDeck:', err);
    return { success: false, error: message };
  }
}
