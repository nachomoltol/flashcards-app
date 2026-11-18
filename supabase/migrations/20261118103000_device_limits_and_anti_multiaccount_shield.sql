-- Migration: 20261118103000_device_limits_and_anti_multiaccount_shield.sql
-- Escudo anti-multicuentas por dispositivo físico (device_limits) y auditoría user_devices

-- 1. Tabla de límites físicos por dispositivo
CREATE TABLE IF NOT EXISTS public.device_limits (
  device_id TEXT PRIMARY KEY,
  welcome_generations_used INT NOT NULL DEFAULT 0,
  generations_count INT NOT NULL DEFAULT 0,
  guides_unlocked_this_month INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month'),
  last_seen_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de auditoría de dispositivos por usuario
CREATE TABLE IF NOT EXISTS public.user_devices (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

ALTER TABLE public.device_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 3. Actualización de set_user_tier para reinicio automático de generations_count = 0 en PRO/VIP
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
    generations_count = CASE WHEN EXCLUDED.tier IN ('pro', 'vip') THEN 0 ELSE public.api_limits.generations_count END,
    updated_at = NOW();
END;
$$;

-- 4. RPC check_api_limit con soporte de device_limits y listas blancas
CREATE OR REPLACE FUNCTION public.check_api_limit(
  p_user_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_dev_count INT;
  v_dev_welcome INT;
  v_next_month_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'success', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- 0. Lista blanca de Administrador: Barra libre total
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
      'welcome_generations', 9999,
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

  -- Lazy Reset mensual persistente en la cuenta
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

  -- 1. TIER 'pro' o 'vip': Límite de 120 mensuales. IGNORA POR COMPLETO device_limits
  IF v_rec.tier IN ('pro', 'vip') THEN
    IF v_count >= 120 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'LIMIT_REACHED',
        'tier', v_rec.tier,
        'count', v_count,
        'current_count', v_count,
        'bonus_credits', v_bonus,
        'welcome_generations', v_welcome,
        'limit', 120,
        'monthly_limit', 120
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
      'limit', 120,
      'monthly_limit', 120
    );
  END IF;

  -- 2. TIER 'free':
  -- A) Auditoría de Dispositivo y Escudo Anti-Multicuentas
  IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
    INSERT INTO public.user_devices (user_id, device_id, last_seen_at)
    VALUES (p_user_id, TRIM(p_device_id), NOW())
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW();

    -- Si NO es dispositivo de prueba, evaluar cuota física en device_limits
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

      -- REGLA 1: Tope de 30 generaciones mensuales por dispositivo entre cuentas Free
      IF v_dev_count >= 30 THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'success', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ha alcanzado el límite mensual gratuito (30 generaciones). Pasa a PRO (3,50 €/mes) para continuar sin límites.',
          'tier', 'free',
          'device_count', v_dev_count,
          'device_limit', 30
        );
      END IF;

      -- REGLA 2: Si el dispositivo ya consumió sus 5 de bienvenida, no conceder bienvenida gratis en nuevas cuentas
      IF v_dev_welcome >= 5 THEN
        -- Forzar fase con anuncios
        IF v_count >= 25 THEN
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
            'limit', 30,
            'monthly_limit', 30
          );
        END IF;

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
            'welcome_generations', v_welcome,
            'limit', 30,
            'monthly_limit', 30
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
          'welcome_generations', v_welcome,
          'limit', 30,
          'monthly_limit', 30
        );
      END IF;
    END IF;
  END IF;

  -- B) Evaluación normal de cuenta Free
  IF v_welcome < 5 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'free',
      'phase', 'welcome',
      'count', v_count,
      'current_count', v_count,
      'bonus_credits', v_bonus,
      'welcome_generations', v_welcome,
      'limit', 30,
      'monthly_limit', 30
    );
  END IF;

  -- Fase Ads (welcome_generations >= 5):
  IF v_count >= 25 THEN
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
      'limit', 30,
      'monthly_limit', 30
    );
  END IF;

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
      'welcome_generations', v_welcome,
      'limit', 30,
      'monthly_limit', 30
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
    'welcome_generations', v_welcome,
    'limit', 30,
    'monthly_limit', 30
  );
END;
$$;

-- 5. RPC increment_api_generation con soporte de device_limits
CREATE OR REPLACE FUNCTION public.increment_api_generation(
  p_user_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_is_admin_email BOOLEAN DEFAULT FALSE,
  p_is_test_device BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_today DATE := CURRENT_DATE;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_welcome INT;
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

  -- 1. TIER 'pro' o 'vip': suma 1 a generations_count (hasta 120), no toca device_limits
  IF v_rec.tier IN ('pro', 'vip') THEN
    IF v_count >= 120 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'LIMIT_REACHED',
        'tier', v_rec.tier,
        'count', v_count,
        'generations_count', v_count,
        'limit', 120
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
      'bonus_credits', v_bonus
    );
  END IF;

  -- 2. TIER 'free':
  -- Fase Bienvenida: Si welcome_generations < 5 -> suma 1 a welcome_generations y NO altera generations_count
  IF v_welcome < 5 THEN
    v_is_welcome_consumed := TRUE;
    UPDATE public.api_limits
    SET welcome_generations = v_welcome + 1,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Fase Ads (welcome_generations >= 5):
    IF v_count >= 25 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'LIMIT_REACHED',
        'tier', 'free',
        'phase', 'ads',
        'count', v_count,
        'generations_count', v_count,
        'limit', 30
      );
    END IF;

    IF v_bonus <= 0 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'success', false,
        'error', 'AD_REQUIRED',
        'tier', 'free',
        'phase', 'ads',
        'count', v_count,
        'generations_count', v_count,
        'limit', 30
      );
    END IF;

    UPDATE public.api_limits
    SET bonus_credits = GREATEST(bonus_credits - 1, 0),
        generations_count = v_count + 1,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_count := v_count + 1;
    v_bonus := GREATEST(v_bonus - 1, 0);
  END IF;

  -- B) Actualizar device_limits si corresponde
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
        CASE WHEN v_is_welcome_consumed THEN 1 ELSE 0 END,
        1,
        0,
        v_next_month_start,
        p_user_id,
        NOW()
      )
      ON CONFLICT (device_id) DO UPDATE
      SET
        welcome_generations_used = CASE WHEN v_is_welcome_consumed THEN public.device_limits.welcome_generations_used + 1 ELSE public.device_limits.welcome_generations_used END,
        generations_count = public.device_limits.generations_count + 1,
        last_seen_user_id = p_user_id,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'success', true,
    'tier', 'free',
    'phase', CASE WHEN v_is_welcome_consumed THEN 'welcome' ELSE 'ads' END,
    'welcome_generations', CASE WHEN v_is_welcome_consumed THEN v_welcome + 1 ELSE v_welcome END,
    'count', v_count,
    'generations_count', v_count,
    'bonus_credits', v_bonus
  );
END;
$$;

-- 6. RPC unlock_deck_summary_with_ad con soporte de device_limits
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

  -- 0. Admin whitelist
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

  -- Garantizar fila en api_limits
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

  -- Bloqueo pesimista FOR UPDATE en api_limits
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

  -- Si es PRO o VIP, acceso ilimitado sin gastar cupo (ignora device_limits)
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
      'message', 'Has alcanzado el límite de 3 guías gratuitas este mes.',
      'guides_unlocked_this_month', v_unlocked_count,
      'remaining_guides', 0
    );
  END IF;

  -- Escudo de Dispositivo para Guías
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

      -- Lazy reset mensual de device_limits
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

      -- Tope de 3 guías mensuales en el dispositivo
      IF v_dev_guides >= 3 THEN
        RETURN jsonb_build_object(
          'success', false,
          'allowed', false,
          'error', 'DEVICE_LIMIT_REACHED',
          'message', 'Este dispositivo ya ha alcanzado el límite de 3 guías gratuitas este mes. Pasa a PRO (3,50 €/mes) para guías ilimitadas.',
          'guides_unlocked_this_month', v_dev_guides,
          'remaining_guides', 0
        );
      END IF;

      -- Incrementar en device_limits
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
    'remaining_guides', 3 - (v_unlocked_count + 1)
  );
END;
$$;

-- 7. RPC add_bonus_credit con soporte de device_limits
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
AS $$
DECLARE
  v_rec RECORD;
  v_dev RECORD;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_new_credits INT;
  v_increment INT := GREATEST(COALESCE(p_amount, 1), 1);
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
      'remaining_ads', 25
    );
  END IF;

  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits, welcome_generations)
  VALUES (p_user_id, 0, CURRENT_DATE, 'free', 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_rec FROM public.api_limits WHERE user_id = p_user_id FOR UPDATE;

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

  -- Cupo publicitario mensual exclusivo para mazos: máximo 25 anuncios por mes
  IF (v_count + v_bonus) >= 25 THEN
    RETURN jsonb_build_object(
      'success', false,
      'allowed', false,
      'error', 'MONTHLY_AD_LIMIT_REACHED',
      'message', 'Has alcanzado el cupo mensual máximo de 25 anuncios para generar mazos.',
      'bonus_credits', v_bonus,
      'generations_count', v_count,
      'remaining_ads', 0
    );
  END IF;

  -- Validar que el dispositivo no haya superado ya el tope de 30 generaciones
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
        UPDATE public.device_limits
        SET generations_count = 0,
            guides_unlocked_this_month = 0,
            reset_at = v_next_month_start,
            last_seen_user_id = p_user_id,
            updated_at = NOW()
        WHERE device_id = TRIM(p_device_id);
      ELSE
        IF COALESCE(v_dev.generations_count, 0) >= 30 THEN
          RETURN jsonb_build_object(
            'success', false,
            'allowed', false,
            'error', 'DEVICE_LIMIT_REACHED',
            'message', 'Este dispositivo ha alcanzado el límite mensual gratuito (30 generaciones). Pasa a PRO (3,50 €/mes) para continuar sin límites.',
            'bonus_credits', v_bonus,
            'generations_count', v_count,
            'remaining_ads', 0
          );
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE public.api_limits
  SET bonus_credits = LEAST(bonus_credits + v_increment, 25),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING bonus_credits INTO v_new_credits;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'bonus_credits', v_new_credits,
    'generations_count', v_count,
    'ads_used_in_cycle', v_count + v_new_credits,
    'remaining_ads', GREATEST(0, 25 - (v_count + v_new_credits))
  );
END;
$$;
