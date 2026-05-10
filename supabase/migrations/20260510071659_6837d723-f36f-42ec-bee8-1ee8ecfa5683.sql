ALTER TABLE public.proxy_orders ADD COLUMN IF NOT EXISTS un_flow_used text;

CREATE OR REPLACE FUNCTION public.get_711_credentials()
RETURNS TABLE(username text, passwd text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT proxy_username, proxy_passwd
  FROM public.app_config
  WHERE id = 1
    AND auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.get_711_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_711_credentials() TO authenticated;