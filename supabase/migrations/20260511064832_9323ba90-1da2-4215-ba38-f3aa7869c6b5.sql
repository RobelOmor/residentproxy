SELECT cron.unschedule('sync-proxy-usage') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-proxy-usage');

SELECT cron.schedule(
  'sync-proxy-usage',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://project--15abcbef-2757-4414-9cf7-34ec7df6b252.lovable.app/api/public/hooks/sync-usage',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);