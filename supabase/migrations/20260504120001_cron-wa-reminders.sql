CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- WhatsApp reminder job: runs every 30 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-reminders') THEN
    PERFORM cron.unschedule('wa-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'wa-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/wa-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Re-schedule morning summary to run every 5 min (handler checks 08:00 IL window)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-summary-whatsapp') THEN
    PERFORM cron.unschedule('morning-summary-whatsapp');
  END IF;
END $$;

SELECT cron.schedule(
  'morning-summary-telegram',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/morning-summary',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
