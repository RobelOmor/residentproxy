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

  -- Username: starts with "RP", letters+digits, total 6-12 chars (RP + 6 random = 8)
  suggested_user := 'RP' || public._rand_lc(6);
  suggested_pass := public._rand_lc(10);

  INSERT INTO public.proxy_orders (user_id, gb_amount, cost_usdt, status, tx_hash, proxy_username, proxy_passwd, host, port, proto)
  VALUES (uid, _gb, _cost, 'pending', 'BALANCE', suggested_user, suggested_pass,
          'global.rotgb.711proxy.com', '10000', 'http')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;