ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS site_title text,
  ADD COLUMN IF NOT EXISTS site_tagline text,
  ADD COLUMN IF NOT EXISTS site_description text,
  ADD COLUMN IF NOT EXISTS site_logo_url text,
  ADD COLUMN IF NOT EXISTS site_favicon_url text,
  ADD COLUMN IF NOT EXISTS site_og_image_url text,
  ADD COLUMN IF NOT EXISTS site_support_email text;

-- Public RPC to read brand config (no secrets)
CREATE OR REPLACE FUNCTION public.get_public_site_config()
RETURNS TABLE (
  site_name text,
  site_title text,
  site_tagline text,
  site_description text,
  site_logo_url text,
  site_favicon_url text,
  site_og_image_url text,
  site_support_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT site_name, site_title, site_tagline, site_description,
         site_logo_url, site_favicon_url, site_og_image_url, site_support_email
  FROM public.app_config WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_site_config() TO anon, authenticated;