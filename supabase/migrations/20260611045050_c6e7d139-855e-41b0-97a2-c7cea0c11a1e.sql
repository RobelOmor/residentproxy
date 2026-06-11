
-- Restrict get_711_credentials to admin only
CREATE OR REPLACE FUNCTION public.get_711_credentials()
RETURNS TABLE(username text, passwd text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT proxy_username, proxy_passwd
  FROM public.app_config
  WHERE id = 1
    AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- Restrict get_dashboard_token to admin only
CREATE OR REPLACE FUNCTION public.get_dashboard_token()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT proxy_dashboard_token
  FROM public.app_config
  WHERE id = 1
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  LIMIT 1;
$$;

-- Restrict profile self-update to display_name column only
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
