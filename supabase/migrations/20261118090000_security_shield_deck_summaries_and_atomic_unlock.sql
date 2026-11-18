-- Migration: 20261118090000_security_shield_deck_summaries_and_atomic_unlock.sql
-- 1. Tabla aislada y segura para resúmenes completos de capítulos
CREATE TABLE IF NOT EXISTS public.deck_summaries (
  deck_id UUID PRIMARY KEY REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  guide_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS habilitado y sin políticas SELECT para clientes (solo accesible vía service_role en Server Actions)
ALTER TABLE public.deck_summaries ENABLE ROW LEVEL SECURITY;

-- Migración segura de resúmenes existentes en decks.summary_guide a deck_summaries
INSERT INTO public.deck_summaries (deck_id, user_id, guide_data, updated_at)
SELECT id, user_id, summary_guide, COALESCE(updated_at, NOW())
FROM public.decks
WHERE summary_guide IS NOT NULL
ON CONFLICT (deck_id) DO UPDATE
SET guide_data = EXCLUDED.guide_data,
    updated_at = EXCLUDED.updated_at;

-- Limpieza preventiva de decks.summary_guide para cerrar la fuga PostgREST (VULN-01)
UPDATE public.decks
SET summary_guide = NULL
WHERE summary_guide IS NOT NULL;

-- 2. RPC atómica con bloqueo pesimista FOR UPDATE para desbloqueo mediante anuncios AdMob
CREATE OR REPLACE FUNCTION public.unlock_deck_summary_with_ad(
  p_user_id UUID,
  p_deck_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_current_month_start TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
  v_unlocked_count INT;
  v_tier TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'allowed', false, 'error', 'AUTH_REQUIRED');
  END IF;

  v_current_month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC');

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

  -- Bloqueo pesimista FOR UPDATE
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

  -- Si es PRO o VIP, acceso ilimitado sin gastar cupo
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

  -- Lazy reset mensual de guías
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

  -- Tope estricto de 3 guías mensuales para Free
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

  -- Incrementar contador atómicamente
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

REVOKE EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_deck_summary_with_ad TO authenticated, service_role;

-- 3. Actualización de check_api_limit con Lazy Expiration de PRO
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

-- 4. Actualización de record_tutor_consultation y get_tutor_quota_status con Lazy Expiration
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
  v_current_period_end TIMESTAMPTZ;
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

  SELECT tier, tutor_consultations_count, last_tutor_date, tutor_ad_credits, bonus_credits, current_period_end
  INTO v_tier, v_count, v_last_date, v_tutor_credits, v_bonus_credits, v_current_period_end
  FROM api_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_tier := COALESCE(v_tier, 'free');
  v_count := COALESCE(v_count, 0);
  v_tutor_credits := COALESCE(v_tutor_credits, 0);
  v_bonus_credits := COALESCE(v_bonus_credits, 0);

  -- Lazy Expiration de suscripción PRO vencida
  IF v_tier = 'pro' AND v_current_period_end IS NOT NULL AND v_current_period_end < NOW() THEN
    UPDATE public.api_limits
    SET tier = 'free',
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_tier := 'free';
  END IF;

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
  v_current_period_end TIMESTAMPTZ;
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

  SELECT tier, tutor_consultations_count, last_tutor_date, tutor_ad_credits, bonus_credits, current_period_end
  INTO v_tier, v_count, v_last_date, v_tutor_credits, v_bonus_credits, v_current_period_end
  FROM api_limits
  WHERE user_id = p_user_id;

  v_tier := COALESCE(v_tier, 'free');
  v_count := COALESCE(v_count, 0);
  v_tutor_credits := COALESCE(v_tutor_credits, 0);
  v_bonus_credits := COALESCE(v_bonus_credits, 0);

  -- Lazy Expiration de suscripción PRO vencida
  IF v_tier = 'pro' AND v_current_period_end IS NOT NULL AND v_current_period_end < NOW() THEN
    UPDATE public.api_limits
    SET tier = 'free',
        subscription_status = 'expired',
        updated_at = NOW()
    WHERE user_id = p_user_id;
    v_tier := 'free';
  END IF;

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
