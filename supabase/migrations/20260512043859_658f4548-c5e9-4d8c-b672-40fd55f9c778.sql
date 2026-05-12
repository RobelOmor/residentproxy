-- Payment methods (USDT addresses, Binance Pay, Telegram agents, future card)
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('usdt','binance','card','agent')),
  label text NOT NULL,
  network text,
  address text,
  qr_url text,
  binance_id text,
  binance_email text,
  telegram_url text,
  manager_name text,
  country_code text,
  enabled boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_url_format CHECK (telegram_url IS NULL OR telegram_url ~ '^https://t\.me/.+'),
  CONSTRAINT country_code_format CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Public can only see enabled methods
CREATE POLICY "public read enabled methods" ON public.payment_methods
  FOR SELECT USING (enabled = true);

CREATE POLICY "admins manage methods" ON public.payment_methods
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Migrate legacy USDT config into a row
INSERT INTO public.payment_methods (kind, label, network, address, sort)
SELECT 'usdt', 'USDT ' || COALESCE(usdt_network,'TRC20'), COALESCE(usdt_network,'TRC20'), usdt_address, 0
FROM public.app_config
WHERE id = 1 AND usdt_address IS NOT NULL AND length(trim(usdt_address)) > 0;

-- Coupons (admin-only)
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  amount_usdt numeric NOT NULL CHECK (amount_usdt > 0 AND amount_usdt <= 100000),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coupons_code_lower_idx ON public.coupons (lower(code));

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage coupons" ON public.coupons
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_usdt numeric NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own redemptions" ON public.coupon_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins view all redemptions" ON public.coupon_redemptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- SECURITY DEFINER atomic redemption
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  c RECORD;
  new_balance numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _code IS NULL OR length(trim(_code)) = 0 OR length(_code) > 64 THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  SELECT * INTO c FROM public.coupons
    WHERE lower(code) = lower(trim(_code))
      AND enabled = true
    FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired code'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RAISE EXCEPTION 'Invalid or expired code';
  END IF;
  IF c.used_count >= c.max_uses THEN
    RAISE EXCEPTION 'Invalid or expired code';
  END IF;

  -- per-user one-time
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE coupon_id = c.id AND user_id = uid) THEN
    RAISE EXCEPTION 'Code already used';
  END IF;

  INSERT INTO public.coupon_redemptions (coupon_id, user_id, amount_usdt)
    VALUES (c.id, uid, c.amount_usdt);

  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = c.id;

  UPDATE public.profiles SET balance_usdt = balance_usdt + c.amount_usdt
    WHERE id = uid
    RETURNING balance_usdt INTO new_balance;

  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO authenticated;

-- Public RPC to list visible payment methods
CREATE OR REPLACE FUNCTION public.get_public_payment_methods()
RETURNS SETOF public.payment_methods
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.payment_methods WHERE enabled = true ORDER BY kind, sort, label;
$$;