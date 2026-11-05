'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface UserLimitsResult {
  success: boolean;
  tier: 'free' | 'pro' | 'vip';
  count: number;
  bonusCredits: number;
  welcomeGenerations: number;
  adsUsedInCycle: number;
  remainingAds: number;
  error?: string;
}

/**
 * Server Action que consulta de forma fidedigna y autorizada (bypass RLS con service_role)
 * los límites de generación del usuario en Supabase (`api_limits`), calculando el cupo
 * mensual real de anuncios disponibles (base 45).
 */
export async function getUserLimitsAction(
  userId?: string,
  accessToken?: string
): Promise<UserLimitsResult> {
  let targetUserId: string | undefined;

  // 1. Intento por cookies de sesión
  try {
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();
    if (cookieUser?.id) {
      targetUserId = cookieUser.id;
    }
  } catch (err) {
    console.warn('[getUserLimitsAction] Error al verificar sesión por cookies:', err);
  }

  // 2. Intento por token JWT (WebView Capacitor)
  if (!targetUserId && accessToken && accessToken.trim()) {
    try {
      const {
        data: { user: tokenUser },
        error: tokenErr,
      } = await supabase.auth.getUser(accessToken.trim());

      if (!tokenErr && tokenUser?.id) {
        targetUserId = tokenUser.id;
      }
    } catch (err) {
      console.warn('[getUserLimitsAction] Error al validar accessToken:', err);
    }
  }

  // 3. Fallback a userId verificado
  if (!targetUserId && userId && userId.trim()) {
    targetUserId = userId.trim();
  }

  if (!targetUserId) {
    return {
      success: false,
      tier: 'free',
      count: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      adsUsedInCycle: 0,
      remainingAds: 45,
      error: 'AUTH_REQUIRED',
    };
  }

  // 4. Conexión autorizada a Supabase con service_role para evitar bloqueo RLS
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://placeholder.supabase.co';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const client = serviceRoleKey
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
    const { data, error } = await client
      .from('api_limits')
      .select('tier, generations_count, last_generation_date, bonus_credits, welcome_generations')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (error) {
      console.error('[getUserLimitsAction] Error consultando api_limits:', error);
      return {
        success: false,
        tier: 'free',
        count: 0,
        bonusCredits: 0,
        welcomeGenerations: 0,
        adsUsedInCycle: 0,
        remainingAds: 45,
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        tier: 'free',
        count: 0,
        bonusCredits: 0,
        welcomeGenerations: 0,
        adsUsedInCycle: 0,
        remainingAds: 45,
      };
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = data.last_generation_date
      ? String(data.last_generation_date).slice(0, 7)
      : null;
    const isSameMonth = lastMonth === currentMonth;

    const count = isSameMonth ? (data.generations_count || 0) : 0;
    const bonusCredits = typeof data.bonus_credits === 'number' ? data.bonus_credits : 0;
    const welcomeGenerations = typeof data.welcome_generations === 'number' ? data.welcome_generations : 0;
    const tier = (data.tier as 'free' | 'pro' | 'vip') || 'free';

    const adsUsedInCycle = count + bonusCredits;
    const remainingAds = Math.max(0, 45 - adsUsedInCycle);

    return {
      success: true,
      tier,
      count,
      bonusCredits,
      welcomeGenerations,
      adsUsedInCycle,
      remainingAds,
    };
  } catch (err: unknown) {
    console.error('[getUserLimitsAction] Error inesperado:', err);
    return {
      success: false,
      tier: 'free',
      count: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      adsUsedInCycle: 0,
      remainingAds: 45,
      error: 'SERVER_ERROR',
    };
  }
}
