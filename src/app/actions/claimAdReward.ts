'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface ClaimRewardResult {
  success: boolean;
  bonusCredits?: number;
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
 */
export async function claimAdRewardAction(
  userId?: string,
  accessToken?: string
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
    const { data, error } = await rpcClient.rpc('add_bonus_credit', {
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

    const res = data as { success?: boolean; bonus_credits?: number; error?: string; message?: string };
    if (!res || !res.success) {
      return {
        success: false,
        message: res?.message || 'No se pudo procesar la recompensa.',
        error: res?.error || 'CLAIM_FAILED',
      };
    }

    // Obtener los límites actualizados para cálculo preciso del cupo publicitario unificado
    let count = 0;
    let bonusCredits = typeof res.bonus_credits === 'number' ? res.bonus_credits : 1;
    let tutorAdsUsed = 0;
    try {
      const { data: updatedRec } = await rpcClient
        .from('api_limits')
        .select('generations_count, last_generation_date, bonus_credits, tutor_consultations_count, last_tutor_date')
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

        const lastTutorMonth = updatedRec.last_tutor_date
          ? String(updatedRec.last_tutor_date).slice(0, 7)
          : null;
        const isSameTutorMonth = lastTutorMonth === currentMonth;
        const tutorCount = isSameTutorMonth ? (updatedRec.tutor_consultations_count || 0) : 0;
        tutorAdsUsed = Math.max(0, tutorCount - 3);
      }
    } catch (fetchErr) {
      console.warn('[claimAdRewardAction] Error al refrescar registro actualizado:', fetchErr);
    }

    const adsUsedInCycle = count + bonusCredits + tutorAdsUsed;
    const remainingAds = Math.max(0, 45 - adsUsedInCycle);

    return {
      success: true,
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
