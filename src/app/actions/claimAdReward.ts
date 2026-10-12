'use server';

import { supabase } from '@/lib/supabase';

export interface ClaimRewardResult {
  success: boolean;
  bonusCredits?: number;
  message?: string;
  error?: string;
}

/**
 * Server Action que acredita +1 crédito bonificado en Supabase al usuario tras
 * completar la visualización exitosa de un anuncio de vídeo bonificado de Google AdMob.
 */
export async function claimAdRewardAction(userId?: string): Promise<ClaimRewardResult> {
  let targetUserId = userId;
  if (!targetUserId) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      targetUserId = user?.id;
    } catch {
      // Fallback
    }
  }

  if (!targetUserId) {
    return {
      success: false,
      message: 'Debes iniciar sesión para obtener créditos bonificados.',
      error: 'AUTH_REQUIRED',
    };
  }

  try {
    const { data, error } = await supabase.rpc('add_bonus_credit', {
      p_user_id: targetUserId,
      p_amount: 1,
    });

    if (error) {
      console.error('Error al otorgar crédito bonificado por anuncio en Supabase:', error);
      return {
        success: false,
        message: 'No se pudo acreditar la bonificación en el servidor.',
        error: error.message || 'SERVER_ERROR',
      };
    }

    const res = data as { success?: boolean; bonus_credits?: number; error?: string };
    if (!res || !res.success) {
      return {
        success: false,
        message: 'No se pudo procesar la recompensa.',
        error: res?.error || 'CLAIM_FAILED',
      };
    }

    return {
      success: true,
      bonusCredits: typeof res.bonus_credits === 'number' ? res.bonus_credits : 1,
      message: '¡Recompensa desbloqueada! Se ha añadido +1 crédito de generación con IA.',
    };
  } catch (err: unknown) {
    console.error('Error inesperado al reclamar recompensa de anuncio:', err);
    return {
      success: false,
      message: 'Ocurrió un error inesperado al procesar la recompensa.',
      error: 'UNEXPECTED_ERROR',
    };
  }
}
