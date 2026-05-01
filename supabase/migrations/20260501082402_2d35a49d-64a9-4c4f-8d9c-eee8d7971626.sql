CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-summary-whatsapp') THEN
    PERFORM cron.unschedule('morning-summary-whatsapp');
  END IF;
END $$;

SELECT cron.schedule(
  'morning-summary-whatsapp',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/morning-summary',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);