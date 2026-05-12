-- Clear test data and reset balances before going live
DELETE FROM public.coupon_redemptions;
DELETE FROM public.topup_requests;
DELETE FROM public.proxy_orders;
DELETE FROM public.sub_user_pool;
UPDATE public.coupons SET used_count = 0;
UPDATE public.profiles SET balance_usdt = 0;