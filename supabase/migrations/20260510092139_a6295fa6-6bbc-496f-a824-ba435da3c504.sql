
-- Atomic purchase using user balance
CREATE OR REPLACE FUNCTION public.purchase_proxy_with_balance(_gb numeric, _cost numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  bal numeric;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _gb IS NULL OR _gb <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _cost IS NULL OR _cost <= 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;

  SELECT balance_usdt INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF bal IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF bal < _cost THEN RAISE EXCEPTION 'Insufficient balance. Available: % USDT, required: % USDT', bal, _cost; END IF;

  UPDATE public.profiles SET balance_usdt = balance_usdt - _cost WHERE id = uid;

  INSERT INTO public.proxy_orders (user_id, gb_amount, cost_usdt, status, tx_hash)
  VALUES (uid, _gb, _cost, 'pending', 'BALANCE')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_proxy_with_balance(numeric, numeric) TO authenticated;

-- Refund on admin reject (only refund balance-paid orders that aren't already rejected)
CREATE OR REPLACE FUNCTION public.admin_reject_order_refund(_order_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SET status = 'rejected', admin_note = _note
    WHERE id = _order_id;

  IF o.tx_hash = 'BALANCE' THEN
    UPDATE public.profiles SET balance_usdt = balance_usdt + o.cost_usdt WHERE id = o.user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_order_refund(uuid, text) TO authenticated;
