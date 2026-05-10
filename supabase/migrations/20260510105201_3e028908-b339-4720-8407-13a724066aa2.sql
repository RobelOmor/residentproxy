CREATE OR REPLACE FUNCTION public.admin_assign_sub_user_to_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  s RECORD;
  required_mb numeric;
  flow_bytes text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT * INTO o FROM public.proxy_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order already %', o.status; END IF;

  -- Round to nearest MB to avoid floating-point mismatch (e.g. 110.000128 vs 110)
  required_mb := round(o.gb_amount * 1024);

  SELECT * INTO s FROM public.sub_user_pool
    WHERE assigned_to_order_id IS NULL AND mb_capacity >= required_mb
    ORDER BY mb_capacity ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No available sub-user in pool with capacity >= % MB. Add more sub-users to the pool.', required_mb;
  END IF;

  UPDATE public.sub_user_pool
    SET assigned_to_order_id = o.id, assigned_at = now()
    WHERE id = s.id;

  flow_bytes := (required_mb * 1024 * 1024)::bigint::text;

  UPDATE public.proxy_orders
    SET status = 'approved',
        approved_at = now(),
        order_no = s.suname,
        proxy_username = s.suname,
        proxy_passwd = s.passwd,
        host = s.host,
        port = s.port,
        proto = s.proto,
        un = s.suname || ':' || s.passwd || '@' || s.host || ':' || s.port,
        un_flow = flow_bytes,
        un_flow_used = '0',
        expire = COALESCE(EXTRACT(EPOCH FROM s.expire_at)::bigint::text,
                          EXTRACT(EPOCH FROM (now() + INTERVAL '30 days'))::bigint::text)
    WHERE id = o.id;

  RETURN jsonb_build_object('ok', true, 'suname', s.suname);
END;
$function$;