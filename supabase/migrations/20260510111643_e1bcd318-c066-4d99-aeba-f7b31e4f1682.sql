
-- 1. Helper: random lowercase+digit string of length n
CREATE OR REPLACE FUNCTION public._rand_lc(n int)
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', (floor(random()*36)+1)::int, 1), '')
  FROM generate_series(1, n);
$$;

-- 2. Update purchase_proxy_with_balance to also pre-fill suggested suname/passwd
CREATE OR REPLACE FUNCTION public.purchase_proxy_with_balance(_gb numeric, _cost numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  bal numeric;
  new_id uuid;
  suggested_user text;
  suggested_pass text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _gb IS NULL OR _gb <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _cost IS NULL OR _cost <= 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;

  SELECT balance_usdt INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF bal IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF bal < _cost THEN RAISE EXCEPTION 'Insufficient balance. Available: % USDT, required: % USDT', bal, _cost; END IF;

  UPDATE public.profiles SET balance_usdt = balance_usdt - _cost WHERE id = uid;

  suggested_user := 'rs' || public._rand_lc(12);
  suggested_pass := public._rand_lc(12);

  INSERT INTO public.proxy_orders (user_id, gb_amount, cost_usdt, status, tx_hash, proxy_username, proxy_passwd, host, port, proto)
  VALUES (uid, _gb, _cost, 'pending', 'BALANCE', suggested_user, suggested_pass,
          'global.rotgb.711proxy.com', '10000', 'http')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

-- 3. New admin approval RPC: admin enters the real 711 order_no after manual creation
CREATE OR REPLACE FUNCTION public.admin_approve_order_manual(
  _order_id uuid,
  _order_no text,
  _suname text,
  _passwd text,
  _un_flow text,
  _un_flow_used text,
  _expire text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT * INTO o FROM public.proxy_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order already %', o.status; END IF;

  UPDATE public.proxy_orders
    SET status = 'approved',
        approved_at = now(),
        order_no = _order_no,
        proxy_username = COALESCE(_suname, proxy_username),
        proxy_passwd = COALESCE(_passwd, proxy_passwd),
        host = COALESCE(host, 'global.rotgb.711proxy.com'),
        port = COALESCE(port, '10000'),
        proto = COALESCE(proto, 'http'),
        un = COALESCE(_suname, proxy_username) || ':' || COALESCE(_passwd, proxy_passwd) ||
             '@' || COALESCE(host, 'global.rotgb.711proxy.com') || ':' || COALESCE(port, '10000'),
        un_flow = COALESCE(_un_flow, un_flow),
        un_flow_used = COALESCE(_un_flow_used, '0'),
        expire = COALESCE(_expire, EXTRACT(EPOCH FROM (now() + INTERVAL '30 days'))::bigint::text)
    WHERE id = _order_id;
END;
$function$;
