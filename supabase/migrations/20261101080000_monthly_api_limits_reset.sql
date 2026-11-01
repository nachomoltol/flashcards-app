-- =====================================================================
-- Migración: Reseteo Mensual Persistente de Cuotas de Generación en api_limits
-- Fecha: 2026-11-01
-- =====================================================================

-- 1. Actualización de la RPC check_api_limit con persistencia inmediata en disco
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
  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits, welcome_generations)
  VALUES (p_user_id, 0, v_today, 'free', 0, 0)
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

-- 2. Programación del Cron Job Nativo mediante pg_cron
-- Desprogramar si ya existiese
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-api-limits-reset') THEN
    PERFORM cron.unschedule('monthly-api-limits-reset');
  END IF;
END $$;

-- Programar ejecución a las 00:00 UTC de cada día 1 del mes
SELECT cron.schedule(
  'monthly-api-limits-reset',
  '0 0 1 * *',
  $$
    UPDATE public.api_limits
    SET generations_count = 0,
        last_generation_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE last_generation_date < CURRENT_DATE;
  $$
);

-- 3. Reseteo inmediato retroactivo para cuentas que generaron en meses anteriores
UPDATE public.api_limits
SET generations_count = 0,
    last_generation_date = CURRENT_DATE,
    updated_at = NOW()
WHERE last_generation_date < CURRENT_DATE;

