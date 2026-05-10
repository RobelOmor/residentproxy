CREATE OR REPLACE FUNCTION public.update_my_order_usage(
  _order_id uuid,
  _un_flow text,
  _un_flow_used text,
  _expire text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.proxy_orders
  SET un_flow = COALESCE(_un_flow, un_flow),
      un_flow_used = COALESCE(_un_flow_used, un_flow_used),
      expire = COALESCE(_expire, expire)
  WHERE id = _order_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_order_usage(uuid, text, text, text) TO authenticated;