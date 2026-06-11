
DROP POLICY IF EXISTS "support read public" ON storage.objects;

CREATE POLICY "support read own or admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support thread realtime read" ON realtime.messages;
CREATE POLICY "support thread realtime read"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.support_threads t
    WHERE t.user_id = auth.uid()
      AND realtime.topic() LIKE '%' || t.id::text || '%'
  )
);

ALTER FUNCTION public._rand_lc(integer) SET search_path = public, pg_catalog;
