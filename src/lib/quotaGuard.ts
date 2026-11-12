'use client';

import { supabase } from '@/lib/supabase';

export interface QuotaCheckResult {
  canGenerate: boolean;
  tier: 'free' | 'pro' | 'vip';
  phase?: 'welcome' | 'ads';
  currentCount: number;
  bonusCredits: number;
  welcomeGenerations: number;
  monthlyLimit: number;
  reason?: 'AD_REQUIRED' | 'LIMIT_REACHED';
}

/**
 * Comprueba preventivamente el saldo y cuota de generación del usuario en el cliente
 * antes de iniciar loaders de UI o disparar llamadas de backend a Gemini (Zero Latency Guard).
 *
 * Reglas de negocio:
 * 1. PRO / VIP: hasta 120 generaciones/mes.
 * 2. FREE:
 *    - Fase Bienvenida (< 5 generaciones iniciales): Permitido sin anuncios.
 *    - Fase Anuncios (>= 5 generaciones):
 *        - Si generaciones del mes >= 30: Bloqueado por cuota mensual agotada ('LIMIT_REACHED').
 *        - Si bonus_credits <= 0: Bloqueado requiriendo anuncio ('AD_REQUIRED').
 *        - Si bonus_credits > 0: Permitido (+1 generación disponible).
 */
export async function checkUserGenerationQuota(
  userId?: string | null
): Promise<QuotaCheckResult> {
  if (!userId) {
    return {
      canGenerate: false,
      tier: 'free',
      currentCount: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      monthlyLimit: 30,
      reason: 'LIMIT_REACHED',
    };
  }

  try {
    // 1. Intentar validar atómicamente mediante RPC check_api_limit (con reseteo mensual persistente)
    const { data: rpcData, error: rpcError } = await supabase.rpc('check_api_limit', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as {
        allowed?: boolean;
        error?: 'LIMIT_REACHED' | 'AD_REQUIRED';
        tier?: 'free' | 'pro' | 'vip';
        count?: number;
        bonus_credits?: number;
        welcome_generations?: number;
        phase?: 'welcome' | 'ads';
        monthly_limit?: number;
      };

      const tier = (res.tier as 'free' | 'pro' | 'vip') || 'free';
      const count = typeof res.count === 'number' ? res.count : 0;
      const bonusCredits = typeof res.bonus_credits === 'number' ? res.bonus_credits : 0;
      const welcomeGenerations = typeof res.welcome_generations === 'number' ? res.welcome_generations : 0;
      const monthlyLimit = res.monthly_limit || (tier === 'pro' || tier === 'vip' ? 120 : 30);

      if (res.allowed === false) {
        return {
          canGenerate: false,
          tier,
          phase: res.phase,
          currentCount: count,
          bonusCredits,
          welcomeGenerations,
          monthlyLimit,
          reason: res.error || (tier === 'free' && bonusCredits <= 0 ? 'AD_REQUIRED' : 'LIMIT_REACHED'),
        };
      }

      return {
        canGenerate: true,
        tier,
        phase: res.phase,
        currentCount: count,
        bonusCredits,
        welcomeGenerations,
        monthlyLimit,
      };
    }

    // 2. Fallback a consulta directa sobre la tabla api_limits
    const { data: directData } = await supabase
      .from('api_limits')
      .select('tier, generations_count, last_generation_date, bonus_credits, welcome_generations')
      .eq('user_id', userId)
      .maybeSingle();

    if (directData) {
      const tier = (directData.tier as 'free' | 'pro' | 'vip') || 'free';
      const generationsCount =
        typeof directData.generations_count === 'number' ? directData.generations_count : 0;
      const bonusCredits =
        typeof directData.bonus_credits === 'number' ? directData.bonus_credits : 0;
      const welcomeGenerations =
        typeof directData.welcome_generations === 'number' ? directData.welcome_generations : 0;
      const lastDate = directData.last_generation_date
        ? String(directData.last_generation_date).slice(0, 7)
        : null;

      const currentMonth = new Date().toISOString().slice(0, 7);
      const isSameMonth = lastDate === currentMonth;
      const count = isSameMonth ? generationsCount : 0;

      // Tier PRO / VIP
      if (tier === 'pro' || tier === 'vip') {
        if (count >= 120) {
          return {
            canGenerate: false,
            tier,
            currentCount: count,
            bonusCredits,
            welcomeGenerations,
            monthlyLimit: 120,
            reason: 'LIMIT_REACHED',
          };
        }
        return {
          canGenerate: true,
          tier,
          currentCount: count,
          bonusCredits,
          welcomeGenerations,
          monthlyLimit: 120,
        };
      }

      // Tier FREE:
      // Fase Bienvenida: 5 generaciones iniciales sin anuncios
      if (welcomeGenerations < 5) {
        return {
          canGenerate: true,
          tier: 'free',
          phase: 'welcome',
          currentCount: count,
          bonusCredits,
          welcomeGenerations,
          monthlyLimit: 30,
        };
      }

      // Fase Anuncios: máximo 25 con anuncios (5 bienvenida + 25 anuncios = 30 mensuales totales)
      if (count >= 25) {
        return {
          canGenerate: false,
          tier: 'free',
          phase: 'ads',
          currentCount: count,
          bonusCredits,
          welcomeGenerations,
          monthlyLimit: 30,
          reason: 'LIMIT_REACHED',
        };
      }

      // Saldo de créditos bonificados
      if (bonusCredits <= 0) {
        return {
          canGenerate: false,
          tier: 'free',
          phase: 'ads',
          currentCount: count,
          bonusCredits: 0,
          welcomeGenerations,
          monthlyLimit: 30,
          reason: 'AD_REQUIRED',
        };
      }

      return {
        canGenerate: true,
        tier: 'free',
        phase: 'ads',
        currentCount: count,
        bonusCredits,
        welcomeGenerations,
        monthlyLimit: 30,
      };
    }

    // Usuario nuevo sin registro aún: tiene derecho a las generaciones de bienvenida
    return {
      canGenerate: true,
      tier: 'free',
      phase: 'welcome',
      currentCount: 0,
      bonusCredits: 0,
      welcomeGenerations: 0,
      monthlyLimit: 30,
    };
  } catch (err) {
    console.warn('Advertencia en comprobación preventiva de cuota:', err);
    // En caso de fallo de red en la guardia previa, no bloquear en cliente
    return {
      canGenerate: true,
      tier: 'free',
      currentCount: 0,
      bonusCredits: 1,
      welcomeGenerations: 0,
      monthlyLimit: 30,
    };
  }
}

