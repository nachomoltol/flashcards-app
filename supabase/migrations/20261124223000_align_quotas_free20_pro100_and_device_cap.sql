-- =====================================================================
-- Migration: 20261124223000_align_quotas_free20_pro100_and_device_cap.sql
-- Unificación de cuotas reales en Supabase (100% no destructiva con wrappers retrocompatibles):
--   1. PRO / VIP: 100 generaciones/mes (reset a 0 al activar suscripción o bono).
--   2. FREE Mazos: máximo 20 generaciones/mes en total:
--      - Mes 1: 5 generaciones de bienvenida sin anuncio + hasta 15 con anuncio = 20.
--      - Mes 2+: welcome_generations >= 5 (no se resetea), requiere anuncio en cada
--        generación hasta el tope mensual de 20 generaciones/mes.
--   3. Escudo físico (device_limits): tope de 20 generaciones/mes y 5 de bienvenida
--      únicas por dispositivo entre cuentas Free.
--   4. Guías de estudio (deck_summaries): máximo estricto de 3 guías/mes en Free
--      tanto por cuenta como por dispositivo, siempre mediante anuncio bonificado.
--   5. Tutor Socrático: mantiene 3 consultas gratis/mes + ilimitadas con anuncios.
-- =====================================================================

-- Normalización puntual de filas Free del mes en curso donde welcome_generations no había sumado a generations_count
UPDATE public.api_limits
SET generations_count = LEAST(20, COALESCE(generations_count, 0) + LEAST(COALESCE(welcome_generations, 0), 5)),
    updated_at = NOW()
WHERE tier = 'free'
  AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
  AND last_generation_date IS NOT NULL
  AND to_char(last_generation_date::date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
  AND COALESCE(welcome_generations, 0) > 0
  AND COALESCE(generations_count, 0) < COALESCE(welcome_generations, 0);

-- 1. RPC set_user_tier (firma completa + wrappers heredados de 2 y 4 parámetros)
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
SET search_path = public
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
    generations_count = CASE WHEN EXCLUDED.tier IN ('pro', 'vip') THEN 0 ELSE public.api_limits.generations_count END,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_id UUID,
  p_tier TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_user_tier(p_user_id, p_tier, NULL::text, NULL::text, NULL::timestamptz, 'active'::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_id UUID,
  p_tier TEXT,
  p_customer_id TEXT DEFAULT NULL,
  p_subscription_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_user_tier(p_user_id, p_tier, p_customer_id, p_subscription_id, NULL::timestamptz, 'active'::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text, timestamptz, text) TO service_role;

-- 2. RPC check_api_limit: Free 20/mes (5 bienvenida mes 1 + anuncios hasta 20), PRO/VIP 100/mes, device_limits 20/mes
CREATE OR REPLACE FUNCTION public.check_api_limit(
  p_user_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_dev RECORD;
  v_today DATE := CURRENT_DATE;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_welcome INT;
  v_dev_count INT := 0;
  v_dev_welcome INT := 0;
  v_device_blocks_welcome BOOLEAN := FALSE;
  v_next_month_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'success', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- 0. Lista blanca de Administrador: barra libre total
  IF p_is_admin_email = TRUE THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'is_admin', true,
      'tier', 'admin',
      'phase', 'admin',
      'count', 0,
      'current_count', 0,
      'bonus_credits', 9999,
      'welcome_generations', 5,
      'limit', 9999,
      'monthly_limit', 9999
    );
  END IF;

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

  -- Lazy Expiration de suscripción PRO vencida
  IF v_rec.tier = 'pro' AND v_rec.current_period_end IS NOT NULL AND v_rec.current_period_end < NOW() THEN
    UPDATE public.api_limits
    SET tier = 'free',
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_rec.tier := 'free';
  END IF;

  v_current_month := to_char(v_today, 'YYYY-MM');
  v_last_month := CASE WHEN v_rec.last_generation_date IS NOT NULL THEN to_char(v_rec.last_generation_date::date, 'YYYY-MM') ELSE NULL END;

  -- Lazy Reset mensual persistente de generations_count (welcome_generations NO se reinicia)
  IF v_last_month IS NULL OR v_last_month <> v_current_month THEN
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

  -- 1. TIER 'pro' o 'vip': Límite de 100 generaciones mensuales. Ignora device_limits.
  IF v_rec.tier IN ('pro', 'vip') THEN
    IF v_count >= 100 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'LIMIT_REACHED',
        'tier', v_rec.tier,
        'count', v_count,
        'current_count', v_count,
        'bonus_credits', v_bonus,
        'welcome_generations', v_welcome,
        'limit', 100,
        'monthly_limit', 100
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', v_rec.tier,
      'phase', 'pro',
      'count', v_count,
      'current_count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'limit', 100,
      'monthly_limit', 100
    );
  END IF;

  -- 2. TIER 'free':
  -- A) Auditoría de dispositivo y escudo anti-multicuentas (tope 20/mes por dispositivo)
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
    INSERT INTO public.user_devices (user_id, device_id, last_seen_at)
    VALUES (p_user_id, TRIM(p_device_id), NOW())
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW();

    IF p_is_test_device = FALSE THEN
      v_next_month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month';

      INSERT INTO public.device_limits (
        device_id,
        welcome_generations_used,
        generations_count,
        guides_unlocked_this_month,
        reset_at,
        last_seen_user_id,
        updated_at
      )
      VALUES (
        TRIM(p_device_id),
        0,
        0,
        0,
        v_next_month_start,
        p_user_id,
        NOW()
      )
      ON CONFLICT (device_id) DO NOTHING;

      SELECT * INTO v_dev
      FROM public.device_limits
      WHERE device_id = TRIM(p_device_id)
      FOR UPDATE;

      -- Lazy reset mensual del dispositivo
      IF v_dev.reset_at IS NULL OR v_dev.reset_at <= NOW() THEN
        v_dev_count := 0;
        UPDATE public.device_limits
        SET generations_count = 0,
            guides_unlocked_this_month = 0,
            reset_at = v_next_month_start,
            last_seen_user_id = p_user_id,
            updated_at = NOW()
        WHERE device_id = TRIM(p_device_id);
      ELSE
        v_dev_count := COALESCE(v_dev.generations_count, 0);
      END IF;

      v_dev_welcome := COALESCE(v_dev.welcome_generations_used, 0);

      -- Tope estricto de 20 generaciones mensuales por dispositivo entre cuentas Free
      IF v_dev_count >= 20 THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'success', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ha alcanzado el límite mensual gratuito (20 generaciones). Tu cuota se renovará automáticamente el próximo mes.',
          'tier', 'free',
          'device_count', v_dev_count,
          'device_limit', 20,
          'limit', 20,
          'monthly_limit', 20
        );
      END IF;

      -- Si el dispositivo ya agotó sus 5 generaciones únicas de bienvenida, forzar fase de anuncios
      IF v_dev_welcome >= 5 THEN
        v_device_blocks_welcome := TRUE;
      END IF;
    END IF;
  END IF;

  -- B) Tope mensual total de la cuenta Free: 20 generaciones/mes (incluyendo bienvenida si fue en este mes)
  IF v_count >= 20 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'success', false,
      'error', 'LIMIT_REACHED',
      'tier', 'free',
      'phase', 'ads',
      'count', v_count,
      'current_count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'limit', 20,
      'monthly_limit', 20
    );
  END IF;

  -- C) Fase Bienvenida (primeras 5 generaciones históricas de la cuenta y del dispositivo, sin anuncio)
  IF v_welcome < 5 AND v_device_blocks_welcome = FALSE THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'free',
      'phase', 'welcome',
      'count', v_count,
      'current_count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'limit', 20,
      'monthly_limit', 20
    );
  END IF;

  -- D) Fase Anuncios (welcome_generations >= 5 o dispositivo sin bienvenida): requiere crédito de anuncio hasta 20/mes
  IF v_bonus <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'success', false,
      'error', 'AD_REQUIRED',
      'tier', 'free',
      'phase', 'ads',
      'count', v_count,
      'current_count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', GREATEST(v_welcome, 5),
      'limit', 20,
      'monthly_limit', 20
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'success', true,
    'tier', 'free',
    'phase', 'ads',
    'count', v_count,
    'current_count', v_count,
    'bonus_credits', v_bonus,
    'welcome_generations', GREATEST(v_welcome, 5),
    'limit', 20,
    'monthly_limit', 20
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_api_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_api_limit(p_user_id, NULL::text, FALSE, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_api_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_api_limit(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_api_limit(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_api_limit(uuid, text, boolean, boolean) TO authenticated, service_role;

-- 3. RPC increment_api_generation: contabiliza toda generación del mes en generations_count (tope 20 Free / 100 PRO)
CREATE OR REPLACE FUNCTION public.increment_api_generation(
  p_user_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_dev RECORD;
  v_today DATE := CURRENT_DATE;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_welcome INT;
  v_dev_count INT := 0;
  v_dev_welcome INT := 0;
  v_device_blocks_welcome BOOLEAN := FALSE;
  v_is_welcome_consumed BOOLEAN := FALSE;
  v_next_month_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'success', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- Admin: barra libre sin consumo
  IF p_is_admin_email = TRUE THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'admin',
      'phase', 'admin',
      'count', 0,
      'generations_count', 0,
      'bonus_credits', 9999
    );
  END IF;

  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits, welcome_generations)
  VALUES (p_user_id, 0, v_today, 'free', 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_rec
  FROM public.api_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Lazy Expiration de suscripción PRO vencida
  IF v_rec.tier = 'pro' AND v_rec.current_period_end IS NOT NULL AND v_rec.current_period_end < NOW() THEN
    UPDATE public.api_limits
    SET tier = 'free',
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_rec.tier := 'free';
  END IF;

  v_current_month := to_char(v_today, 'YYYY-MM');
  v_last_month := CASE WHEN v_rec.last_generation_date IS NOT NULL THEN to_char(v_rec.last_generation_date::date, 'YYYY-MM') ELSE NULL END;

  -- Lazy Reset mensual
  IF v_last_month IS NULL OR v_last_month <> v_current_month THEN
    v_count := 0;
  ELSE
    v_count := COALESCE(v_rec.generations_count, 0);
  END IF;

  v_bonus := COALESCE(v_rec.bonus_credits, 0);
  v_welcome := COALESCE(v_rec.welcome_generations, 0);

  -- 1. TIER 'pro' o 'vip': suma 1 a generations_count (hasta 100), ignora device_limits
  IF v_rec.tier IN ('pro', 'vip') THEN
    IF v_count >= 100 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'LIMIT_REACHED',
        'tier', v_rec.tier,
        'count', v_count,
        'generations_count', v_count,
        'limit', 100
      );
    END IF;

    UPDATE public.api_limits
    SET generations_count = v_count + 1,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', v_rec.tier,
      'phase', 'pro',
      'count', v_count + 1,
      'generations_count', v_count + 1,
      'bonus_credits', v_bonus,
      'limit', 100
    );
  END IF;

  -- 2. TIER 'free':
  -- A) Validar tope mensual de cuenta (20)
  IF v_count >= 20 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'success', false,
      'error', 'LIMIT_REACHED',
      'tier', 'free',
      'phase', 'ads',
      'count', v_count,
      'generations_count', v_count,
      'limit', 20
    );
  END IF;

  -- B) Validar estado del dispositivo antes de decidir bienvenida vs anuncio
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
    INSERT INTO public.user_devices (user_id, device_id, last_seen_at)
    VALUES (p_user_id, TRIM(p_device_id), NOW())
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW();

    IF p_is_test_device = FALSE THEN
      v_next_month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month';

      INSERT INTO public.device_limits (
        device_id,
        welcome_generations_used,
        generations_count,
        guides_unlocked_this_month,
        reset_at,
        last_seen_user_id,
        updated_at
      )
      VALUES (
        TRIM(p_device_id),
        0,
        0,
        0,
        v_next_month_start,
        p_user_id,
        NOW()
      )
      ON CONFLICT (device_id) DO NOTHING;

      SELECT * INTO v_dev
      FROM public.device_limits
      WHERE device_id = TRIM(p_device_id)
      FOR UPDATE;

      IF v_dev.reset_at IS NULL OR v_dev.reset_at <= NOW() THEN
        v_dev_count := 0;
        UPDATE public.device_limits
        SET generations_count = 0,
            guides_unlocked_this_month = 0,
            reset_at = v_next_month_start,
            last_seen_user_id = p_user_id,
            updated_at = NOW()
        WHERE device_id = TRIM(p_device_id);
      ELSE
        v_dev_count := COALESCE(v_dev.generations_count, 0);
      END IF;

      v_dev_welcome := COALESCE(v_dev.welcome_generations_used, 0);

      IF v_dev_count >= 20 THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'success', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ha alcanzado el límite mensual gratuito (20 generaciones). Tu cuota se renovará automáticamente el próximo mes.',
          'tier', 'free',
          'device_count', v_dev_count,
          'device_limit', 20,
          'limit', 20
        );
      END IF;

      IF v_dev_welcome >= 5 THEN
        v_device_blocks_welcome := TRUE;
      END IF;
    END IF;
  END IF;

  -- C) Consumir generación (Bienvenida vs Anuncio): en ambos casos suma +1 a generations_count del mes
  IF v_welcome < 5 AND v_device_blocks_welcome = FALSE THEN
    v_is_welcome_consumed := TRUE;
    v_welcome := v_welcome + 1;
    v_count := v_count + 1;

    UPDATE public.api_limits
    SET welcome_generations = v_welcome,
        generations_count = v_count,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    IF v_bonus <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'AD_REQUIRED',
        'tier', 'free',
        'phase', 'ads',
        'count', v_count,
        'generations_count', v_count,
        'limit', 20
      );
    END IF;

    v_bonus := GREATEST(v_bonus - 1, 0);
    v_count := v_count + 1;
    v_welcome := GREATEST(v_welcome, 5);

    UPDATE public.api_limits
    SET bonus_credits = v_bonus,
        generations_count = v_count,
        welcome_generations = v_welcome,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- D) Actualizar contadores en device_limits si corresponde
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' AND p_is_test_device = FALSE THEN
    UPDATE public.device_limits
    SET welcome_generations_used = CASE WHEN v_is_welcome_consumed THEN welcome_generations_used + 1 ELSE welcome_generations_used END,
        generations_count = generations_count + 1,
        last_seen_user_id = p_user_id,
        updated_at = NOW()
    WHERE device_id = TRIM(p_device_id);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'success', true,
    'tier', 'free',
    'phase', CASE WHEN v_is_welcome_consumed THEN 'welcome' ELSE 'ads' END,
    'welcome_generations', v_welcome,
    'count', v_count,
    'generations_count', v_count,
    'bonus_credits', v_bonus,
    'limit', 20
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_api_generation(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.increment_api_generation(p_user_id, NULL::text, FALSE, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_api_generation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_api_generation(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.increment_api_generation(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_api_generation(uuid, text, boolean, boolean) TO authenticated, service_role;

-- 4. RPC add_bonus_credit: hasta completar el tope mensual de 20 generaciones (15 anuncios en mes 1 + 5 bienvenida; hasta 20 anuncios en mes 2+)
CREATE OR REPLACE FUNCTION public.add_bonus_credit(
  p_user_id UUID,
  p_amount INT DEFAULT 1,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_dev RECORD;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_welcome INT;
  v_dev_count INT := 0;
  v_dev_welcome INT := 0;
  v_effective_welcome INT;
  v_reserved_welcome INT;
  v_slots_committed INT;
  v_new_credits INT;
  v_remaining_ads INT;
  v_next_month_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'allowed', false, 'error', 'AUTH_REQUIRED');
  END IF;

  IF p_is_admin_email = TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'bonus_credits', 9999,
      'generations_count', 0,
      'ads_used_in_cycle', 0,
      'remaining_ads', 20
    );
  END IF;

  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits, welcome_generations)
  VALUES (p_user_id, 0, CURRENT_DATE, 'free', 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_rec
  FROM public.api_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');
  v_last_month := CASE WHEN v_rec.last_generation_date IS NOT NULL THEN to_char(v_rec.last_generation_date::date, 'YYYY-MM') ELSE NULL END;

  -- Lazy Reset mensual
  IF v_last_month IS NULL OR v_last_month <> v_current_month THEN
    v_count := 0;
    UPDATE public.api_limits
    SET generations_count = 0,
        last_generation_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    v_count := COALESCE(v_rec.generations_count, 0);
  END IF;

  v_bonus := COALESCE(v_rec.bonus_credits, 0);
  v_welcome := COALESCE(v_rec.welcome_generations, 0);

  -- Validar límites físicos del dispositivo (tope 20 generaciones/mes)
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
    INSERT INTO public.user_devices (user_id, device_id, last_seen_at)
    VALUES (p_user_id, TRIM(p_device_id), NOW())
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW();

    IF p_is_test_device = FALSE THEN
      v_next_month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month';

      INSERT INTO public.device_limits (
        device_id,
        welcome_generations_used,
        generations_count,
        guides_unlocked_this_month,
        reset_at,
        last_seen_user_id,
        updated_at
      )
      VALUES (
        TRIM(p_device_id),
        0,
        0,
        0,
        v_next_month_start,
        p_user_id,
        NOW()
      )
      ON CONFLICT (device_id) DO NOTHING;

      SELECT * INTO v_dev
      FROM public.device_limits
      WHERE device_id = TRIM(p_device_id)
      FOR UPDATE;

      IF v_dev.reset_at IS NULL OR v_dev.reset_at <= NOW() THEN
        v_dev_count := 0;
        UPDATE public.device_limits
        SET generations_count = 0,
            guides_unlocked_this_month = 0,
            reset_at = v_next_month_start,
            last_seen_user_id = p_user_id,
            updated_at = NOW()
        WHERE device_id = TRIM(p_device_id);
      ELSE
        v_dev_count := COALESCE(v_dev.generations_count, 0);
      END IF;

      v_dev_welcome := COALESCE(v_dev.welcome_generations_used, 0);

      IF (v_dev_count + v_bonus) >= 20 THEN
        RETURN jsonb_build_object(
          'success', false,
          'allowed', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ha alcanzado el límite mensual gratuito (20 generaciones). Tu cuota se renovará automáticamente el próximo mes.',
          'bonus_credits', v_bonus,
          'generations_count', v_count,
          'remaining_ads', 0
        );
      END IF;
    END IF;
  END IF;

  -- Plazas de bienvenida pendientes (0 si ya consumió las 5 en cuenta o dispositivo)
  v_effective_welcome := CASE WHEN v_dev_welcome >= 5 THEN 5 ELSE v_welcome END;
  v_reserved_welcome := GREATEST(0, 5 - v_effective_welcome);
  v_slots_committed := v_count + v_reserved_welcome + v_bonus;

  -- Tope mensual total de 20 generaciones (Mes 1: 5 bienvenida + 15 ads = 20; Mes 2+: hasta 20 ads = 20)
  IF v_slots_committed >= 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'allowed', false,
      'error', 'MONTHLY_AD_LIMIT_REACHED',
      'message', 'Has alcanzado el límite mensual gratuito de 20 generaciones para mazos.',
      'bonus_credits', v_bonus,
      'generations_count', v_count,
      'remaining_ads', 0
    );
  END IF;

  -- Incremento fijo de +1 crédito por anuncio completado
  UPDATE public.api_limits
  SET bonus_credits = LEAST(bonus_credits + 1, 20),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING bonus_credits INTO v_new_credits;

  v_remaining_ads := GREATEST(0, 20 - (v_count + v_reserved_welcome + v_new_credits));
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' AND p_is_test_device = FALSE THEN
    v_remaining_ads := LEAST(v_remaining_ads, GREATEST(0, 20 - (v_dev_count + v_new_credits)));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'bonus_credits', v_new_credits,
    'generations_count', v_count,
    'ads_used_in_cycle', v_count + v_new_credits,
    'remaining_ads', v_remaining_ads
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_bonus_credit(
  p_user_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.add_bonus_credit(p_user_id, p_amount, NULL::text, FALSE, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_bonus_credit(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_bonus_credit(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_bonus_credit(uuid, integer, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_bonus_credit(uuid, integer, text, boolean, boolean) TO authenticated, service_role;

-- 5. RPC unlock_deck_summary_with_ad: tope estricto de 3 guías/mes con anuncio en cuenta y device_limits
CREATE OR REPLACE FUNCTION public.unlock_deck_summary_with_ad(
  p_user_id UUID,
  p_deck_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_dev RECORD;
  v_current_month_start TIMESTAMPTZ;
  v_next_month_start TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
  v_unlocked_count INT;
  v_dev_guides INT;
  v_tier TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'allowed', false, 'error', 'AUTH_REQUIRED');
  END IF;

  IF p_is_admin_email = TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'is_admin', true,
      'is_pro', true,
      'tier', 'admin',
      'remaining_guides', 9999
    );
  END IF;

  v_current_month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_next_month_start := v_current_month_start + INTERVAL '1 month';

  INSERT INTO public.api_limits (
    user_id,
    tier,
    generations_count,
    last_generation_date,
    guides_unlocked_this_month,
    guides_reset_at
  )
  VALUES (
    p_user_id,
    'free',
    0,
    CURRENT_DATE,
    0,
    v_current_month_start
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_rec
  FROM public.api_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_tier := COALESCE(v_rec.tier, 'free');

  -- Lazy expiration de suscripción PRO vencida
  IF v_tier = 'pro' AND v_rec.current_period_end IS NOT NULL AND v_rec.current_period_end < NOW() THEN
    UPDATE public.api_limits
    SET tier = 'free',
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_tier := 'free';
  END IF;

  -- PRO o VIP: acceso ilimitado sin gastar cupo
  IF v_tier IN ('pro', 'vip') THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'is_pro', true,
      'tier', v_tier,
      'guides_unlocked_this_month', COALESCE(v_rec.guides_unlocked_this_month, 0),
      'remaining_guides', 9999
    );
  END IF;

  -- Lazy reset mensual de guías en api_limits
  v_reset_at := v_rec.guides_reset_at;
  IF v_reset_at IS NULL OR v_reset_at < v_current_month_start THEN
    v_unlocked_count := 0;
    UPDATE public.api_limits
    SET guides_unlocked_this_month = 0,
        guides_reset_at = v_current_month_start,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    v_unlocked_count := COALESCE(v_rec.guides_unlocked_this_month, 0);
  END IF;

  -- Tope estricto de 3 guías mensuales para Free en la cuenta
  IF v_unlocked_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'allowed', false,
      'error', 'FREE_MONTHLY_LIMIT_REACHED',
      'message', 'Has alcanzado el límite de 3 guías desbloqueables este mes.',
      'guides_unlocked_this_month', v_unlocked_count,
      'remaining_guides', 0
    );
  END IF;

  -- Escudo de dispositivo para Guías (máximo 3 guías/mes por dispositivo físico)
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
    INSERT INTO public.user_devices (user_id, device_id, last_seen_at)
    VALUES (p_user_id, TRIM(p_device_id), NOW())
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW();

    IF p_is_test_device = FALSE THEN
      INSERT INTO public.device_limits (
        device_id,
        welcome_generations_used,
        generations_count,
        guides_unlocked_this_month,
        reset_at,
        last_seen_user_id,
        updated_at
      )
      VALUES (
        TRIM(p_device_id),
        0,
        0,
        0,
        v_next_month_start,
        p_user_id,
        NOW()
      )
      ON CONFLICT (device_id) DO NOTHING;

      SELECT * INTO v_dev
      FROM public.device_limits
      WHERE device_id = TRIM(p_device_id)
      FOR UPDATE;

      IF v_dev.reset_at IS NULL OR v_dev.reset_at <= NOW() THEN
        v_dev_guides := 0;
        UPDATE public.device_limits
        SET generations_count = 0,
            guides_unlocked_this_month = 0,
            reset_at = v_next_month_start,
            last_seen_user_id = p_user_id,
            updated_at = NOW()
        WHERE device_id = TRIM(p_device_id);
      ELSE
        v_dev_guides := COALESCE(v_dev.guides_unlocked_this_month, 0);
      END IF;

      IF v_dev_guides >= 3 THEN
        RETURN jsonb_build_object(
          'success', false,
          'allowed', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ya ha alcanzado el límite de 3 guías desbloqueables este mes.',
          'guides_unlocked_this_month', v_dev_guides,
          'remaining_guides', 0
        );
      END IF;

      UPDATE public.device_limits
      SET guides_unlocked_this_month = v_dev_guides + 1,
          last_seen_user_id = p_user_id,
          updated_at = NOW()
      WHERE device_id = TRIM(p_device_id);
    END IF;
  END IF;

  -- Incrementar contador atómicamente en api_limits
  UPDATE public.api_limits
  SET guides_unlocked_this_month = v_unlocked_count + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'is_pro', false,
    'tier', 'free',
    'guides_unlocked_this_month', v_unlocked_count + 1,
    'remaining_guides', GREATEST(0, 3 - (v_unlocked_count + 1))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_deck_summary_with_ad(
  p_user_id UUID,
  p_deck_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.unlock_deck_summary_with_ad(p_user_id, p_deck_id, NULL::text, FALSE, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad(uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad(uuid, uuid, text, boolean, boolean) TO authenticated, service_role;
