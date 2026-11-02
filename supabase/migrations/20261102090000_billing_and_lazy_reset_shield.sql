-- =====================================================================
-- Migración: Blindaje de Facturación Stripe y Reseteo Mensual Atómico
-- Fecha: 2026-11-02
-- Objetivo:
-- 1. Añadir columnas de ciclo de vida de suscripción a public.api_limits
-- 2. Asegurar el reseteo mensual atómico e independiente en check_api_limit
-- 3. Actualizar RPCs de control de tier y suscripción
-- =====================================================================

-- 1. Añadir columnas de fecha de expiración y estado de suscripción si no existen
ALTER TABLE public.api_limits
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- 2. Actualización de la RPC check_api_limit con reseteo mensual garantizado
CREATE OR REPLACE FUNCTION public.check_api_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_today DATE := CURRENT_DATE;
  v_count INT;
  v_bonus INT;
  v_welcome INT;
BEGIN
  -- Insertar registro por defecto si el usuario no existe aún
  INSERT INTO public.api_limits (
    user_id,
    generations_count,
    last_generation_date,
    tier,
    bonus_credits,
    welcome_generations,
    subscription_status
  )
  VALUES (
    p_user_id,
    0,
    v_today,
    'free',
    0,
    0,
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_rec
  FROM public.api_limits
  WHERE user_id = p_user_id;

  -- Reseteo mensual persistente si el último registro es de un mes previo
  IF v_rec.last_generation_date IS NULL OR DATE_TRUNC('month', v_rec.last_generation_date::date) < DATE_TRUNC('month', v_today) THEN
    v_count := 0;
    UPDATE public.api_limits
    SET generations_count = 0,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    v_count := COALESCE(v_rec.generations_count, 0);
  END IF;

  v_bonus := COALESCE(v_rec.bonus_credits, 0);
  v_welcome := COALESCE(v_rec.welcome_generations, 0);

  -- 1. TIER 'pro' o 'vip': Límite de 120 mensuales
  IF v_rec.tier IN ('pro', 'vip') THEN
    IF v_count >= 120 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'LIMIT_REACHED',
        'tier', v_rec.tier,
        'count', v_count,
        'bonus_credits', v_bonus,
        'welcome_generations', v_welcome,
        'monthly_limit', 120
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'tier', v_rec.tier,
      'count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'monthly_limit', 120
    );
  END IF;

  -- 2. TIER 'free':
  -- Fase Bienvenida: Si welcome_generations < 5, permite directamente sin ads
  IF v_welcome < 5 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'tier', 'free',
      'phase', 'welcome',
      'count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'monthly_limit', 50
    );
  END IF;

  -- Fase Ads (Mensual) cuando welcome_generations >= 5:
  -- Si generations_count >= 50 -> LIMIT_REACHED (límite mensual gratis superado)
  IF v_count >= 50 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'LIMIT_REACHED',
      'tier', 'free',
      'count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'monthly_limit', 50
    );
  END IF;

  -- Si generations_count < 50: Verificar bonus_credits
  IF v_bonus <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'AD_REQUIRED',
      'tier', 'free',
      'count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'monthly_limit', 50
    );
  END IF;

  -- Si bonus_credits > 0, permite la generación
  RETURN jsonb_build_object(
    'allowed', true,
    'tier', 'free',
    'phase', 'ads',
    'count', v_count,
    'bonus_credits', v_bonus,
    'welcome_generations', v_welcome,
    'monthly_limit', 50
  );
END;
$$;

-- 3. Actualización de set_user_tier con soporte para periodo y estado
CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_id UUID,
  p_tier TEXT,
  p_customer_id TEXT DEFAULT NULL,
  p_subscription_id TEXT DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_subscription_status TEXT DEFAULT 'active'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.api_limits (
    user_id,
    tier,
    stripe_customer_id,
    stripe_subscription_id,
    current_period_end,
    subscription_status,
    generations_count,
    bonus_credits,
    welcome_generations,
    last_generation_date,
    updated_at
  )
  VALUES (
    p_user_id,
    p_tier,
    p_customer_id,
    p_subscription_id,
    p_current_period_end,
    COALESCE(p_subscription_status, 'active'),
    0,
    0,
    0,
    CURRENT_DATE,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    tier = EXCLUDED.tier,
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.api_limits.stripe_customer_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, public.api_limits.stripe_subscription_id),
    current_period_end = COALESCE(EXCLUDED.current_period_end, public.api_limits.current_period_end),
    subscription_status = COALESCE(EXCLUDED.subscription_status, public.api_limits.subscription_status),
    updated_at = NOW();
END;
$$;

-- 4. Actualización de downgrade_user_by_stripe con soporte para estado
CREATE OR REPLACE FUNCTION public.downgrade_user_by_stripe(
  p_subscription_id TEXT DEFAULT NULL,
  p_customer_id TEXT DEFAULT NULL,
  p_subscription_status TEXT DEFAULT 'canceled'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.api_limits
  SET
    tier = 'free',
    subscription_status = COALESCE(p_subscription_status, 'canceled'),
    updated_at = NOW()
  WHERE
    (p_subscription_id IS NOT NULL AND stripe_subscription_id = p_subscription_id)
    OR
    (p_customer_id IS NOT NULL AND stripe_customer_id = p_customer_id);
END;
$$;

