-- Rachas diarias: persistencia eficiente en profiles + RPC atómica.
-- last_study_date se guarda como 'YYYY-MM-DD' en la zona horaria LOCAL del usuario.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_study_date TEXT DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.record_daily_study(p_study_date text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date;
  v_profile public.profiles%ROWTYPE;
  v_new_streak integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_study_date IS NULL OR p_study_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid date format, expected YYYY-MM-DD';
  END IF;
  v_today := p_study_date::date;

  -- Garantiza la existencia de la fila de perfil
  INSERT INTO public.profiles (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  -- Bloqueo de fila para evitar condiciones de carrera
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;

  -- Ya estudió hoy: sin cambios
  IF v_profile.last_study_date = p_study_date THEN
    RETURN json_build_object(
      'current_streak', v_profile.current_streak,
      'longest_streak', v_profile.longest_streak,
      'last_study_date', v_profile.last_study_date
    );
  END IF;

  IF v_profile.last_study_date IS NOT NULL
     AND v_profile.last_study_date ~ '^\d{4}-\d{2}-\d{2}$'
     AND v_profile.last_study_date::date = v_today - 1 THEN
    v_new_streak := v_profile.current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  UPDATE public.profiles
  SET current_streak = v_new_streak,
      longest_streak = GREATEST(v_profile.longest_streak, v_new_streak),
      last_study_date = p_study_date,
      updated_at = now()
  WHERE id = v_uid
  RETURNING * INTO v_profile;

  RETURN json_build_object(
    'current_streak', v_profile.current_streak,
    'longest_streak', v_profile.longest_streak,
    'last_study_date', v_profile.last_study_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_study(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_daily_study(text) TO authenticated;
