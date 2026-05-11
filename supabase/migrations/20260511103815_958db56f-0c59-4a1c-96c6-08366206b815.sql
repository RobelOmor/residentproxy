DELETE FROM proxy_orders WHERE user_id = 'ccf9a62e-ca31-4a31-84e4-c49aa73de615';
DELETE FROM topup_requests WHERE user_id = 'ccf9a62e-ca31-4a31-84e4-c49aa73de615';
UPDATE sub_user_pool SET assigned_to_order_id = NULL, assigned_at = NULL WHERE assigned_to_order_id IN (SELECT id FROM proxy_orders WHERE user_id = 'ccf9a62e-ca31-4a31-84e4-c49aa73de615');
UPDATE profiles SET balance_usdt = 0 WHERE id = 'ccf9a62e-ca31-4a31-84e4-c49aa73de615';