'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface ClaimRewardResult {
  success: boolean;
  rewardType?: 'deck' | 'tutor';
  bonusCredits?: number;
  tutorAdCredits?: number;
  generationsCount?: number;
  adsUsedInCycle?: number;
  remainingAds?: number;
  message?: string;
  error?: string;
}

/**
 * Server Action que acredita +1 crédito bonificado en Supabase al usuario tras
 * completar la visualización exitosa de un anuncio de vídeo bonificado de Google AdMob.
 * Soporta autenticación dual: cookies web o accessToken JWT de Capacitor.
 * Desacoplado: 'deck' (mazos, máximo 25 al mes) vs 'tutor' (Profesor Socrático, ilimitado).
 */
export async function claimAdRewardAction(
  userId?: string,
  accessToken?: string,
  rewardType: 'deck' | 'tutor' = 'deck'
): Promise<ClaimRewardResult> {
  // 1. Resolver usuario autenticado de forma estricta: cookies o token JWT de Capacitor
  let targetUserId: string | undefined;

  // Intento 1: Sesión por cookies en el servidor
  try {
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();
    if (cookieUser?.id) {
      targetUserId = cookieUser.id;
    }
  } catch (err) {
    console.warn('[claimAdRewardAction] Error al verificar sesión por cookies:', err);
  }

  // Intento 2: Token JWT enviado por WebView móvil (Capacitor)
  if (!targetUserId && accessToken && accessToken.trim()) {
    try {
      const {
        data: { user: tokenUser },
        error: tokenErr,
      } = await supabase.auth.getUser(accessToken.trim());

      if (!tokenErr && tokenUser?.id) {
        targetUserId = tokenUser.id;
      } else if (tokenErr) {
        console.warn('[claimAdRewardAction] Token de acceso no válido:', tokenErr.message);
      }
    } catch (err) {
      console.warn('[claimAdRewardAction] Error al validar accessToken:', err);
    }
  }

  // Si no se pudo verificar sesión ni por cookie ni por token, denegar
  if (!targetUserId) {
    return {
      success: false,
      message: 'Debes iniciar sesión para obtener créditos bonificados.',
      error: 'AUTH_REQUIRED',
    };
  }

  // 2. Instanciar cliente autorizado (service_role o token autenticado de usuario)
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://placeholder.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  const rpcClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : accessToken && accessToken.trim()
    ? createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;

  try {
    if (rewardType === 'tutor') {
      const { data, error } = await rpcClient.rpc('add_tutor_ad_credit', {
        p_user_id: targetUserId,
        p_amount: 1,
      });

      if (error) {
        console.error('Error al otorgar crédito de tutor por anuncio en Supabase:', error);
        return {
          success: false,
          rewardType: 'tutor',
          message: 'No se pudo acreditar la bonificación del tutor en el servidor.',
          error: error.message || 'SERVER_ERROR',
        };
      }

      const res = data as { success?: boolean; tutor_ad_credits?: number; error?: string; message?: string };
      if (!res || !res.success) {
        return {
          success: false,
          rewardType: 'tutor',
          message: res?.message || 'No se pudo procesar la recompensa del tutor.',
          error: res?.error || 'CLAIM_FAILED',
        };
      }

      const tutorAdCredits = typeof res.tutor_ad_credits === 'number' ? res.tutor_ad_credits : 1;

      return {
        success: true,
        rewardType: 'tutor',
        tutorAdCredits,
        message: '¡Recompensa desbloqueada! Se ha añadido +1 consulta para el Profesor Socrático.',
      };
    }

    // Flujo para Mazos de Estudio (rewardType === 'deck', máximo 25 al mes)
    const { data, error } = await rpcClient.rpc('add_bonus_credit', {
      p_user_id: targetUserId,
      p_amount: 1,
    });

    if (error) {
      console.error('Error al otorgar crédito bonificado por anuncio en Supabase:', error);
      return {
        success: false,
        rewardType: 'deck',
        message: 'No se pudo acreditar la bonificación en el servidor.',
        error: error.message || 'SERVER_ERROR',
      };
    }

    const res = data as { success?: boolean; bonus_credits?: number; error?: string; message?: string };
    if (!res || !res.success) {
      return {
        success: false,
        rewardType: 'deck',
        message: res?.message || 'No se pudo procesar la recompensa.',
        error: res?.error || 'CLAIM_FAILED',
      };
    }

    // Obtener límites actualizados exclusivos para generación de mazos (máximo 25 anuncios)
    let count = 0;
    let bonusCredits = typeof res.bonus_credits === 'number' ? res.bonus_credits : 1;
    try {
      const { data: updatedRec } = await rpcClient
        .from('api_limits')
        .select('generations_count, last_generation_date, bonus_credits')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (updatedRec) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastMonth = updatedRec.last_generation_date
          ? String(updatedRec.last_generation_date).slice(0, 7)
          : null;
        const isSameMonth = lastMonth === currentMonth;
        count = isSameMonth ? (updatedRec.generations_count || 0) : 0;
        if (typeof updatedRec.bonus_credits === 'number') {
          bonusCredits = updatedRec.bonus_credits;
        }
      }
    } catch (fetchErr) {
      console.warn('[claimAdRewardAction] Error al refrescar registro actualizado:', fetchErr);
    }

    const adsUsedInCycle = count + bonusCredits;
    const remainingAds = Math.max(0, 25 - adsUsedInCycle);

    return {
      success: true,
      rewardType: 'deck',
      bonusCredits,
      generationsCount: count,
      adsUsedInCycle,
      remainingAds,
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
