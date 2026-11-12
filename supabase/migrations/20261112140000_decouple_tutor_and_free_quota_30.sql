-- Migración: Desacoplamiento del Profesor Socrático y Fijación de Cuota Free a 30 Mazos (5 + 25)
-- Incluye Lazy Reset mensual (to_char(CURRENT_DATE, 'YYYY-MM')), tope en 25 generations_count (5 welcome + 25 ads = 30) y compatibilidad JSON
-- Fecha: 12 de Noviembre de 2026

-- 1. Añadir columna tutor_ad_credits a api_limits
ALTER TABLE public.api_limits ADD COLUMN IF NOT EXISTS tutor_ad_credits INT NOT NULL DEFAULT 0;

-- 2. RPC add_tutor_ad_credit (ilimitada mediante anuncios, no toca bonus_credits)
CREATE OR REPLACE FUNCTION public.add_tutor_ad_credit(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_credits INT;
  v_increment INT := GREATEST(COALESCE(p_amount, 1), 1);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'allowed', false, 'error', 'AUTH_REQUIRED');
  END IF;

  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits, welcome_generations, tutor_consultations_count, tutor_ad_credits)
  VALUES (p_user_id, 0, CURRENT_DATE, 'free', 0, 0, 0, v_increment)
  ON CONFLICT (user_id) DO UPDATE
  SET tutor_ad_credits = public.api_limits.tutor_ad_credits + v_increment,
      updated_at = NOW()
  RETURNING tutor_ad_credits INTO v_new_credits;

  RETURN jsonb_build_object('success', true, 'allowed', true, 'tutor_ad_credits', v_new_credits);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_tutor_ad_credit FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_tutor_ad_credit TO authenticated, service_role;

-- 3. RPC add_bonus_credit para cupo exclusivo de mazos: máximo 25 anuncios con Lazy Reset mensual
CREATE OR REPLACE FUNCTION public.add_bonus_credit(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_current_month TEXT;
  v_last_month TEXT;
  v_count INT;
  v_bonus INT;
  v_new_credits INT;
  v_increment INT := GREATEST(COALESCE(p_amount, 1), 1);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'allowed', false, 'error', 'AUTH_REQUIRED');
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

  -- Cupo publicitario mensual exclusivo para mazos: tope de 25 anuncios por mes
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

REVOKE EXECUTE ON FUNCTION public.add_bonus_credit FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_bonus_credit TO authenticated, service_role;

-- 4. RPC check_api_limit: límite mensual 30 (5 bienvenida + 25 ads) con Lazy Reset
CREATE OR REPLACE FUNCTION public.check_api_limit(p_user_id UUID)
RETURNS JSONB
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
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'success', false, 'error', 'AUTH_REQUIRED');
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

  v_current_month := to_char(v_today, 'YYYY-MM');
  v_last_month := CASE WHEN v_rec.last_generation_date IS NOT NULL THEN to_char(v_rec.last_generation_date::date, 'YYYY-MM') ELSE NULL END;

  -- Lazy Reset mensual persistente
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

  -- 1. TIER 'pro' o 'vip': Límite de 120 mensuales
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
  -- Fase Bienvenida: Si welcome_generations < 5, permite directamente sin ads
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
  -- Si generations_count >= 25 -> LIMIT_REACHED (5 bienvenida + 25 con anuncio = 30 totales)
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

  -- Si generations_count < 25: Verificar bonus_credits
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

  -- Si bonus_credits > 0, permite la generación
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

REVOKE EXECUTE ON FUNCTION public.check_api_limit FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_api_limit TO authenticated, service_role;

-- 5. RPC increment_api_generation: límite mensual 30 (5 welcome + 25 ads) con Lazy Reset
CREATE OR REPLACE FUNCTION public.increment_api_generation(p_user_id UUID)
RETURNS JSONB
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
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'success', false, 'error', 'AUTH_REQUIRED');
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

  -- 1. TIER 'pro' o 'vip': suma 1 a generations_count (hasta 120)
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
    UPDATE public.api_limits
    SET welcome_generations = v_welcome + 1,
        last_generation_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'free',
      'phase', 'welcome',
      'welcome_generations', v_welcome + 1,
      'count', v_count,
      'generations_count', v_count,
      'bonus_credits', v_bonus
    );
  END IF;

  -- Fase Ads (welcome_generations >= 5):
  -- Si generations_count >= 25 -> LIMIT_REACHED (5 bienvenida + 25 con anuncio = 30 totales)
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

  -- Resta 1 a bonus_credits y suma 1 a generations_count
  UPDATE public.api_limits
  SET bonus_credits = GREATEST(bonus_credits - 1, 0),
      generations_count = v_count + 1,
      last_generation_date = v_today,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'success', true,
    'tier', 'free',
    'phase', 'ads',
    'count', v_count + 1,
    'generations_count', v_count + 1,
    'bonus_credits', GREATEST(v_bonus - 1, 0),
    'welcome_generations', v_welcome
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_api_generation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_api_generation TO authenticated, service_role;

-- 6. RPC get_tutor_quota_status: desacoplado con tutor_ad_credits, Lazy Reset y compatibilidad total
CREATE OR REPLACE FUNCTION public.get_tutor_quota_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_count INTEGER;
  v_last_date DATE;
  v_tutor_credits INTEGER;
  v_bonus_credits INTEGER;
  v_current_month TEXT;
  v_last_month TEXT;
  v_rem_free INTEGER;
  v_req_ad BOOLEAN;
  v_is_pro BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'success', false,
      'error', 'AUTH_REQUIRED',
      'is_pro', false,
      'count', 0,
      'free_limit', 3,
      'remaining_free', 0,
      'free_left', 0,
      'bonus_credits', 0,
      'tutor_ad_credits', 0,
      'requires_ad', true
    );
  END IF;

  INSERT INTO api_limits (user_id, tier, generations_count, tutor_consultations_count, bonus_credits, welcome_generations, tutor_ad_credits)
  VALUES (p_user_id, 'free', 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT tier, tutor_consultations_count, last_tutor_date, tutor_ad_credits, bonus_credits
  INTO v_tier, v_count, v_last_date, v_tutor_credits, v_bonus_credits
  FROM api_limits
  WHERE user_id = p_user_id;

  v_tier := COALESCE(v_tier, 'free');
  v_count := COALESCE(v_count, 0);
  v_tutor_credits := COALESCE(v_tutor_credits, 0);
  v_bonus_credits := COALESCE(v_bonus_credits, 0);

  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');
  v_last_month := CASE WHEN v_last_date IS NOT NULL THEN to_char(v_last_date::date, 'YYYY-MM') ELSE NULL END;

  IF v_last_month IS NULL OR v_last_month <> v_current_month THEN
    v_count := 0;
  END IF;

  v_is_pro := (v_tier IN ('pro', 'vip'));

  IF v_is_pro THEN
    v_rem_free := 9999;
    v_req_ad := false;
  ELSE
    v_rem_free := GREATEST(0, 3 - v_count);
    v_req_ad := (v_count >= 3 AND v_tutor_credits <= 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'success', true,
    'is_pro', v_is_pro,
    'tier', v_tier,
    'count', v_count,
    'free_limit', 3,
    'remaining_free', v_rem_free,
    'free_left', v_rem_free,
    'bonus_credits', v_bonus_credits,
    'tutor_ad_credits', v_tutor_credits,
    'requires_ad', v_req_ad
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tutor_quota_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tutor_quota_status TO authenticated, service_role;

-- 7. RPC record_tutor_consultation: decrementa tutor_ad_credits (NO bonus_credits), Lazy Reset y compatibilidad total
CREATE OR REPLACE FUNCTION public.record_tutor_consultation(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_count INTEGER;
  v_last_date DATE;
  v_tutor_credits INTEGER;
  v_bonus_credits INTEGER;
  v_current_month TEXT;
  v_last_month TEXT;
  v_rem_free INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'success', false,
      'error', 'AUTH_REQUIRED',
      'remaining_free', 0,
      'free_left', 0
    );
  END IF;

  INSERT INTO api_limits (user_id, tier, generations_count, tutor_consultations_count, bonus_credits, welcome_generations, tutor_ad_credits)
  VALUES (p_user_id, 'free', 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT tier, tutor_consultations_count, last_tutor_date, tutor_ad_credits, bonus_credits
  INTO v_tier, v_count, v_last_date, v_tutor_credits, v_bonus_credits
  FROM api_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_tier := COALESCE(v_tier, 'free');
  v_count := COALESCE(v_count, 0);
  v_tutor_credits := COALESCE(v_tutor_credits, 0);
  v_bonus_credits := COALESCE(v_bonus_credits, 0);

  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');
  v_last_month := CASE WHEN v_last_date IS NOT NULL THEN to_char(v_last_date::date, 'YYYY-MM') ELSE NULL END;

  IF v_last_month IS NULL OR v_last_month <> v_current_month THEN
    v_count := 0;
  END IF;

  IF v_tier IN ('pro', 'vip') THEN
    UPDATE api_limits
    SET tutor_consultations_count = v_count + 1,
        last_tutor_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', v_tier,
      'is_pro', true,
      'count', v_count + 1,
      'tutor_consultations_count', v_count + 1,
      'remaining_free', 9999,
      'free_left', 9999,
      'tutor_ad_credits', v_tutor_credits,
      'bonus_credits', v_bonus_credits
    );
  END IF;

  -- 3 consultas gratuitas por mes
  IF v_count < 3 THEN
    v_rem_free := GREATEST(0, 3 - (v_count + 1));
    UPDATE api_limits
    SET tutor_consultations_count = v_count + 1,
        last_tutor_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'free',
      'is_pro', false,
      'count', v_count + 1,
      'tutor_consultations_count', v_count + 1,
      'remaining_free', v_rem_free,
      'free_left', v_rem_free,
      'tutor_ad_credits', v_tutor_credits,
      'bonus_credits', v_bonus_credits
    );
  END IF;

  -- A partir de la 4.ª consulta: requiere 1 crédito de anuncio de tutor (tutor_ad_credits)
  IF v_tutor_credits > 0 THEN
    UPDATE api_limits
    SET tutor_consultations_count = v_count + 1,
        tutor_ad_credits = v_tutor_credits - 1,
        last_tutor_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'success', true,
      'tier', 'free',
      'is_pro', false,
      'count', v_count + 1,
      'tutor_consultations_count', v_count + 1,
      'remaining_free', 0,
      'free_left', 0,
      'bonus_used', true,
      'tutor_ad_credits', v_tutor_credits - 1,
      'bonus_credits', v_bonus_credits
    );
  END IF;

  -- Si no tiene créditos de anuncio para el tutor
  RETURN jsonb_build_object(
    'allowed', false,
    'success', false,
    'error', 'AD_REQUIRED',
    'message', 'Has agotado tus 3 consultas gratuitas mensuales. Mira un anuncio para continuar.',
    'tier', 'free',
    'is_pro', false,
    'count', v_count,
    'tutor_consultations_count', v_count,
    'remaining_free', 0,
    'free_left', 0,
    'tutor_ad_credits', 0,
    'bonus_credits', v_bonus_credits
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_tutor_consultation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_tutor_consultation TO authenticated, service_role;
