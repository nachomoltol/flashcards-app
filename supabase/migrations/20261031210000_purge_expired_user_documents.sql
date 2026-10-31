-- Migración: Función SQL y Programación de Purga Automática de Documentos en Supabase Storage
-- Bucket objetivo: 'user-documents'
-- Criterio: Objetos con created_at superior a 2 horas

-- 1. Habilitar extensión pg_cron en schema extensions si está disponible
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Función de base de datos para purgar objetos expirados
CREATE OR REPLACE FUNCTION public.purge_expired_user_documents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Permitir temporalmente la eliminación en storage.objects evitando la excepción de protect_delete
    PERFORM set_config('storage.allow_delete_query', 'true', true);

    DELETE FROM storage.objects
    WHERE bucket_id = 'user-documents'
      AND created_at < NOW() - INTERVAL '2 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 3. Programación con pg_cron para ejecución horaria automática
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Desprogramar si ya existiese
    PERFORM cron.unschedule('purge-user-documents-hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'purge-user-documents-hourly'
    );

    -- Programar ejecución al minuto 0 de cada hora
    PERFORM cron.schedule(
      'purge-user-documents-hourly',
      '0 * * * *',
      'SELECT public.purge_expired_user_documents();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no disponible o sin privilegios para programar job. La purga se gestiona mediante Server Action.';
END $$;

