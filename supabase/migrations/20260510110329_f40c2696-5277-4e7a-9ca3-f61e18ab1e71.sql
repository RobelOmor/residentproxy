ALTER TABLE public.sub_user_pool
  ADD COLUMN IF NOT EXISTS mb_used numeric NOT NULL DEFAULT 0;

-- User pulls usage from their assigned pool entry
CREATE OR REPLACE FUNCTION public.sync_my_orders_usage_from_pool()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cnt integer := 0;
  r RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR r IN
    SELECT o.id AS order_id, s.mb_used, s.mb_capacity
    FROM public.proxy_orders o
    JOIN public.sub_user_pool s ON s.assigned_to_order_id = o.id
    WHERE o.user_id = uid AND o.status = 'approved'
  LOOP
    UPDATE public.proxy_orders
      SET un_flow_used = (round(r.mb_used * 1024 * 1024))::bigint::text,
          un_flow      = (round(GREATEST(r.mb_capacity - r.mb_used, 0) * 1024 * 1024))::bigint::text
      WHERE id = r.order_id;
    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

-- Admin updates mb_used on a pool entry; also syncs the linked order
CREATE OR REPLACE FUNCTION public.admin_update_pool_usage(_pool_id uuid, _mb_used numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF _mb_used < 0 THEN RAISE EXCEPTION 'mb_used must be >= 0'; END IF;

  UPDATE public.sub_user_pool
    SET mb_used = _mb_used
    WHERE id = _pool_id
    RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pool entry not found'; END IF;

  IF s.assigned_to_order_id IS NOT NULL THEN
    UPDATE public.proxy_orders
      SET un_flow_used = (round(_mb_used * 1024 * 1024))::bigint::text,
          un_flow      = (round(GREATEST(s.mb_capacity - _mb_used, 0) * 1024 * 1024))::bigint::text
      WHERE id = s.assigned_to_order_id;
  END IF;
END;
$$;