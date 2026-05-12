
-- Token age tracking
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS proxy_dashboard_token_set_at timestamptz;

-- Support threads
CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_name text NOT NULL,
  telegram_id text,
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_admin int NOT NULL DEFAULT 0,
  unread_user int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user','admin')),
  body text,
  attachment_url text,
  attachment_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON public.support_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_user ON public.support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_threads_last ON public.support_threads(last_message_at DESC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own threads" ON public.support_threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins view all threads" ON public.support_threads FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "users create own threads" ON public.support_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own threads" ON public.support_threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "admins update threads" ON public.support_threads FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "users view own thread messages" ON public.support_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "admins view all messages" ON public.support_messages FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "users insert own messages" ON public.support_messages FOR INSERT
  WITH CHECK (sender = 'user' AND EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "admins insert messages" ON public.support_messages FOR INSERT
  WITH CHECK (sender = 'admin' AND public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Helper to send message + bump counters atomically
CREATE OR REPLACE FUNCTION public.support_send_message(_thread_id uuid, _body text, _attachment_url text DEFAULT NULL, _attachment_type text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.has_role(uid,'admin');
  t RECORD;
  msg_id uuid;
  sender_role text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF (_body IS NULL OR length(trim(_body))=0) AND _attachment_url IS NULL THEN
    RAISE EXCEPTION 'Empty message';
  END IF;
  IF length(coalesce(_body,'')) > 4000 THEN RAISE EXCEPTION 'Message too long'; END IF;

  SELECT * INTO t FROM public.support_threads WHERE id = _thread_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found'; END IF;

  IF is_admin THEN
    sender_role := 'admin';
  ELSIF t.user_id = uid THEN
    sender_role := 'user';
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.support_messages(thread_id,sender,body,attachment_url,attachment_type)
    VALUES (_thread_id, sender_role, nullif(trim(coalesce(_body,'')),''), _attachment_url, _attachment_type)
    RETURNING id INTO msg_id;

  IF sender_role = 'user' THEN
    UPDATE public.support_threads SET last_message_at = now(), unread_admin = unread_admin + 1 WHERE id = _thread_id;
  ELSE
    UPDATE public.support_threads SET last_message_at = now(), unread_user = unread_user + 1 WHERE id = _thread_id;
  END IF;

  RETURN msg_id;
END;$$;

CREATE OR REPLACE FUNCTION public.support_mark_read(_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); is_admin boolean := public.has_role(uid,'admin'); t RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.support_threads WHERE id = _thread_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF is_admin THEN
    UPDATE public.support_threads SET unread_admin = 0 WHERE id = _thread_id;
  ELSIF t.user_id = uid THEN
    UPDATE public.support_threads SET unread_user = 0 WHERE id = _thread_id;
  END IF;
END;$$;

-- Admin dashboard stats
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'gb_sold', COALESCE((SELECT SUM(gb_amount) FROM proxy_orders WHERE status='approved'),0),
    'gb_remaining', COALESCE((SELECT SUM(GREATEST(mb_capacity - mb_used,0))/1024 FROM sub_user_pool WHERE assigned_to_order_id IS NOT NULL),0),
    'usdt_sold', COALESCE((SELECT SUM(cost_usdt) FROM proxy_orders WHERE status='approved'),0),
    'usdt_topped_up', COALESCE((SELECT SUM(amount_usdt) FROM topup_requests WHERE status='approved'),0)
                   + COALESCE((SELECT SUM(amount_usdt) FROM coupon_redemptions),0),
    'orders_pending', (SELECT COUNT(*) FROM proxy_orders WHERE status='pending'),
    'orders_approved', (SELECT COUNT(*) FROM proxy_orders WHERE status='approved'),
    'orders_rejected', (SELECT COUNT(*) FROM proxy_orders WHERE status='rejected'),
    'support_unread', (SELECT COALESCE(SUM(unread_admin),0) FROM support_threads)
  ) INTO r;
  RETURN r;
END;$$;

-- Storage bucket
INSERT INTO storage.buckets (id,name,public) VALUES ('support-attachments','support-attachments',true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "support upload own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "support read public" ON storage.objects FOR SELECT
  USING (bucket_id='support-attachments');
CREATE POLICY "support admin all" ON storage.objects FOR ALL
  USING (bucket_id='support-attachments' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id='support-attachments' AND public.has_role(auth.uid(),'admin'));
