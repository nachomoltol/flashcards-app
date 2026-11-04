-- =====================================================================
-- Migración: Blindaje de Permisos RPCs en Supabase (Auditoría 04/11/2026)
-- 1. set_user_tier y downgrade_user_by_stripe: Uso exclusivo de service_role (Stripe Webhooks)
-- 2. add_bonus_credit: Incremento fijo de 1, tope mensual de 50 y solo para authenticated/service_role
-- =====================================================================

-- A. Blindar set_user_tier y downgrade para uso exclusivo del Webhook de Stripe (service_role)
REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_tier(uuid, text, text, text, timestamptz, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.downgrade_user_by_stripe(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.downgrade_user_by_stripe(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.downgrade_user_by_stripe(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.downgrade_user_by_stripe(text, text, text) TO service_role;

-- B. Blindar add_bonus_credit: incremento fijo de 1 y tope mensual de 50
CREATE OR REPLACE FUNCTION public.add_bonus_credit(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_credits INT;
  v_rec RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED');
  END IF;

  SELECT * INTO v_rec FROM public.api_limits WHERE user_id = p_user_id;

  IF COALESCE(v_rec.generations_count, 0) + COALESCE(v_rec.bonus_credits, 0) >= 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MONTHLY_AD_LIMIT_REACHED');
  END IF;

  INSERT INTO public.api_limits (user_id, generations_count, last_generation_date, tier, bonus_credits)
  VALUES (p_user_id, 0, CURRENT_DATE, 'free', 1)
  ON CONFLICT (user_id) DO UPDATE
  SET bonus_credits = LEAST(public.api_limits.bonus_credits + 1, 50),
      updated_at = NOW()
  RETURNING bonus_credits INTO v_new_credits;

  RETURN jsonb_build_object('success', true, 'bonus_credits', v_new_credits);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_bonus_credit FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_bonus_credit TO authenticated, service_role;
