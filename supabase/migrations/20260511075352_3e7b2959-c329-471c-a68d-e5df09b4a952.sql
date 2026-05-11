CREATE OR REPLACE FUNCTION public.get_dashboard_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT proxy_dashboard_token
  FROM public.app_config
  WHERE id = 1
    AND auth.uid() IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_token() TO authenticated;