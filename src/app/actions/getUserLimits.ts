'use server';

import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isAdminEmail, isTestDevice } from '@/lib/config/whitelist';

export interface UserLimitsResult {
  success: boolean;
  tier: 'free' | 'pro' | 'vip';
  count: number;
  bonusCredits: number;
  welcomeGenerations: number;
  tutorConsultationsCount: number;
  tutorAdCredits: number;
  tutorAdsUsed: number;
  adsUsedInCycle: number;
  remainingAds: number;
  deviceGenerationsCount?: number;
  deviceLimitReached?: boolean;
  error?: string;
}

/**
 * Server Action que consulta de forma fidedigna y autorizada (bypass RLS con service_role)
 * los límites de generación del usuario en Supabase (`api_limits`):
 * - Mazos de Estudio PRO/VIP: hasta 100 generaciones/mes.
 * - Mazos de Estudio Free: máximo 20 generaciones/mes (5 bienvenida en el primer mes sin anuncio + hasta 15 anuncios; en meses sucesivos, hasta 20 con anuncio).
 * - Profesor Socrático Free: 3 consultas gratis/mes y a partir de la 4.ª ILIMITADO con 1 anuncio/consulta.
 */
export async function getUserLimitsAction(
  userId?: string,
  accessToken?: string,
  deviceId?: string
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

  // 3. Validación de concordancia con userId explícito (anti-suplantación) o fallback
  if (targetUserId && userId && userId.trim() && userId.trim() !== targetUserId) {
    console.warn('[getUserLimitsAction] Discrepancia de userId detectada. Rechazando llamada suplantada.');
    return {
      success: false,
      tier: 'free',
      count: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      tutorConsultationsCount: 0,
      tutorAdCredits: 0,
      tutorAdsUsed: 0,
      adsUsedInCycle: 0,
      remainingAds: 15,
      error: 'UNAUTHORIZED',
    };
  }

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
      tutorConsultationsCount: 0,
      tutorAdCredits: 0,
      tutorAdsUsed: 0,
      adsUsedInCycle: 0,
      remainingAds: 15,
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
      .select('tier, generations_count, last_generation_date, bonus_credits, welcome_generations, tutor_consultations_count, last_tutor_date, tutor_ad_credits, current_period_end')
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
        tutorConsultationsCount: 0,
        tutorAdCredits: 0,
        tutorAdsUsed: 0,
        adsUsedInCycle: 0,
        remainingAds: 15,
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
        tutorConsultationsCount: 0,
        tutorAdCredits: 0,
        tutorAdsUsed: 0,
        adsUsedInCycle: 0,
        remainingAds: 15,
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
    let tier = (data.tier as 'free' | 'pro' | 'vip') || 'free';

    // Lazy Expiration de suscripción PRO vencida
    if (tier === 'pro' && data.current_period_end) {
      const periodEnd = new Date(data.current_period_end).getTime();
      if (periodEnd < Date.now()) {
        try {
          await client
            .from('api_limits')
            .update({
              tier: 'free',
              subscription_status: 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', targetUserId);
          tier = 'free';
        } catch (downgradeErr) {
          console.warn('[getUserLimitsAction] Error al aplicar lazy expiration:', downgradeErr);
        }
      }
    }

    const lastTutorMonth = data.last_tutor_date
      ? String(data.last_tutor_date).slice(0, 7)
      : null;
    const isSameTutorMonth = lastTutorMonth === currentMonth;
    const tutorConsultationsCount = isSameTutorMonth ? (data.tutor_consultations_count || 0) : 0;
    const tutorAdCredits = typeof data.tutor_ad_credits === 'number' ? data.tutor_ad_credits : 0;

    // Desacoplamiento contable:
    // 1. Profesor Socrático: 3 gratis y a partir de la 4.ª ilimitado con 1 anuncio/consulta
    const tutorAdsUsed = Math.max(0, tutorConsultationsCount - 3);

    // Comprobar si el usuario es administrador por lista blanca de Vercel
    try {
      const { data: profile } = await client
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle();
      if (profile?.email && isAdminEmail(profile.email)) {
        tier = 'pro';
      }
    } catch {
      // Silencioso
    }

    // Comprobar límites de dispositivo si el usuario es Free y no es dispositivo de prueba
    let deviceGenerationsCount: number | undefined;
    let deviceWelcomeUsed = 0;
    let deviceLimitReached: boolean | undefined;

    if (tier === 'free' && deviceId && !isTestDevice(deviceId)) {
      try {
        const { data: devData } = await client
          .from('device_limits')
          .select('generations_count, welcome_generations_used, reset_at')
          .eq('device_id', deviceId.trim())
          .maybeSingle();

        if (devData) {
          const rawDev = devData as {
            generations_count?: number;
            welcome_generations_used?: number;
            reset_at?: string;
          };
          const isDevExpired = rawDev.reset_at ? new Date(rawDev.reset_at) <= new Date() : false;
          const currentDevCount = isDevExpired ? 0 : (rawDev.generations_count || 0);
          deviceWelcomeUsed = rawDev.welcome_generations_used || 0;
          deviceGenerationsCount = currentDevCount;
          if (currentDevCount >= 20) {
            deviceLimitReached = true;
          }
        }
      } catch {
        // Silencioso
      }
    }

    // 2. Generaciones de mazos en Free: tope mensual de 20 en total
    // (Mes 1: 5 bienvenida + hasta 15 con anuncios = 20; Mes 2+: welcome >= 5 -> hasta 20 con anuncios)
    const effectiveWelcome = deviceWelcomeUsed >= 5 ? 5 : welcomeGenerations;
    const reservedWelcome = Math.max(0, 5 - effectiveWelcome);
    const adsUsedInCycle = count + reservedWelcome + bonusCredits;
    let remainingAds = Math.max(0, 20 - adsUsedInCycle);
    if (typeof deviceGenerationsCount === 'number') {
      remainingAds = Math.min(remainingAds, Math.max(0, 20 - (deviceGenerationsCount + bonusCredits)));
    }

    return {
      success: true,
      tier,
      count,
      bonusCredits,
      welcomeGenerations,
      tutorConsultationsCount,
      tutorAdCredits,
      tutorAdsUsed,
      adsUsedInCycle,
      remainingAds,
      deviceGenerationsCount,
      deviceLimitReached,
    };
  } catch (err: unknown) {
    console.error('[getUserLimitsAction] Error inesperado:', err);
    return {
      success: false,
      tier: 'free',
      count: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      tutorConsultationsCount: 0,
      tutorAdCredits: 0,
      tutorAdsUsed: 0,
      adsUsedInCycle: 0,
      remainingAds: 15,
      error: 'SERVER_ERROR',
    };
  }
}
