REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM authenticated';
  END IF;
END $$;