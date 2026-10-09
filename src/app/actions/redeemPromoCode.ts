'use server';

import { supabase } from '@/lib/supabase';

export interface RedeemPromoCodeResult {
  success: boolean;
  tier?: 'free' | 'pro' | 'vip';
  message: string;
  error?: string;
}

export async function redeemPromoCodeAction(
  code: string,
  userId?: string
): Promise<RedeemPromoCodeResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return {
      success: false,
      message: 'Por favor introduce un código promocional.',
      error: 'EMPTY_CODE',
    };
  }

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
      message: 'Debes iniciar sesión para canjear un código.',
      error: 'AUTH_REQUIRED',
    };
  }

  try {
    const { data, error } = await supabase.rpc('redeem_promo_code', {
      p_code: cleanCode,
      p_user_id: targetUserId,
    });

    if (error) {
      console.error('Error in redeemPromoCodeAction:', error);
      return {
        success: false,
        message: error.message || 'Error al canjear el código en el servidor.',
        error: 'SERVER_ERROR',
      };
    }

    const res = data as {
      success?: boolean;
      tier?: 'free' | 'pro' | 'vip';
      message?: string;
      error?: string;
    };

    if (!res || !res.success) {
      return {
        success: false,
        message: res?.message || 'El código introducido no es válido o ha expirado.',
        error: res?.error || 'INVALID_CODE',
      };
    }

    return {
      success: true,
      tier: res.tier || 'vip',
      message: res.message || '¡Código canjeado con éxito!',
    };
  } catch (err: unknown) {
    console.error('Error inesperado al canjear código:', err);
    return {
      success: false,
      message: 'Error inesperado al procesar el código.',
      error: 'UNEXPECTED_ERROR',
    };
  }
}
