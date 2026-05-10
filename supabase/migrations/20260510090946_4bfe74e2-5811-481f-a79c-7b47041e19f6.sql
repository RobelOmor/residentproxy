
-- Allow fractional GB amounts (1 MB minimum = ~0.001 GB)
ALTER TABLE public.proxy_orders ALTER COLUMN gb_amount TYPE numeric(12,6) USING gb_amount::numeric;

-- Add user balance to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance_usdt numeric(12,2) NOT NULL DEFAULT 0;

-- Topup requests table
CREATE TABLE IF NOT EXISTS public.topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_usdt numeric(12,2) NOT NULL CHECK (amount_usdt > 0),
  tx_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own topups" ON public.topup_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users create own topups" ON public.topup_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "admins view all topups" ON public.topup_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update topups" ON public.topup_requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Approve a topup: marks approved + credits user's profile balance. Admin-only.
CREATE OR REPLACE FUNCTION public.admin_approve_topup(_topup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT * INTO t FROM public.topup_requests WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topup not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Topup already %', t.status; END IF;

  UPDATE public.topup_requests
    SET status = 'approved', approved_at = now()
    WHERE id = _topup_id;

  UPDATE public.profiles
    SET balance_usdt = balance_usdt + t.amount_usdt
    WHERE id = t.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_topup(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_topup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_topup(_topup_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  UPDATE public.topup_requests
    SET status = 'rejected', admin_note = _note
    WHERE id = _topup_id AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_topup(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_topup(uuid, text) TO authenticated;
