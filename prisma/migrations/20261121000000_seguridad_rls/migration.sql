-- Seguridad en Supabase: cerrar la API de datos pública.
--
-- Supabase publica las tablas del esquema "public" por su API REST (PostgREST) y cualquiera con la
-- llave anónima (NEXT_PUBLIC_SUPABASE_ANON_KEY, que va en el navegador) podría leerlas o modificarlas.
-- BarberOS no usa esa API: todo pasa por el servidor con Prisma, que se conecta como dueño de las
-- tablas y no se ve afectado por RLS. Activamos RLS sin políticas (nadie entra por la API) y
-- quitamos los permisos a los roles de la API. En una base sin Supabase solo se activa RLS.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    -- Tablas que se creen después tampoco quedan publicadas
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
