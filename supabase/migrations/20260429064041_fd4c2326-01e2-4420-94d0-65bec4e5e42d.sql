REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM authenticated;