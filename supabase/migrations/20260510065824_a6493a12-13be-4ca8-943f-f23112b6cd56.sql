CREATE OR REPLACE FUNCTION public.get_public_pricing()
RETURNS TABLE(price_per_gb_usdt numeric, usdt_address text, usdt_network text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT price_per_gb_usdt, usdt_address, usdt_network
  FROM public.app_config
  WHERE id = 1
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pricing() TO anon, authenticated;