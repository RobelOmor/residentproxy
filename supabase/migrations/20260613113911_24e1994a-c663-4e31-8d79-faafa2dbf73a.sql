
CREATE OR REPLACE FUNCTION public._gen_proxy_username()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  body text;
BEGIN
  SELECT string_agg(c, '') INTO body FROM (
    SELECT c FROM (
      SELECT substr('abcdefghijklmnopqrstuvwxyz', (floor(random()*26)+1)::int, 1) AS c, random() AS r
      UNION ALL
      SELECT substr('0123456789', (floor(random()*10)+1)::int, 1) AS c, random() AS r
      UNION ALL
      SELECT substr('abcdefghijklmnopqrstuvwxyz0123456789', (floor(random()*36)+1)::int, 1) AS c, random() AS r
      FROM generate_series(1, 6)
    ) s
    ORDER BY r
  ) x;
  RETURN 'RP' || body;
END;
$$;

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

  -- Username: starts with "RP", total 10 chars, guaranteed to contain letters AND digits
  suggested_user := public._gen_proxy_username();
  suggested_pass := public._rand_lc(10);

  INSERT INTO public.proxy_orders (user_id, gb_amount, cost_usdt, status, tx_hash, proxy_username, proxy_passwd, host, port, proto)
  VALUES (uid, _gb, _cost, 'pending', 'BALANCE', suggested_user, suggested_pass,
          'global.rotgb.711proxy.com', '10000', 'http')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;
