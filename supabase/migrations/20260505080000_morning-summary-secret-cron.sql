-- Store the morning-summary secret in app_settings so the cron job can read it.
-- After applying this migration, set the value in Supabase dashboard:
--   UPDATE public.app_settings
--   SET value = '{"secret": "<your-MORNING_SUMMARY_SECRET>"}'
--   WHERE key = 'morning_summary_secret';
INSERT INTO public.app_settings (key, value)
VALUES ('morning_summary_secret', '{"secret": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Helper function: reads the secret from app_settings and calls the endpoint.
-- SECURITY DEFINER runs as the function owner (service role) so it can read app_settings.
CREATE OR REPLACE FUNCTION public.call_morning_summary()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT value->>'secret' INTO v_secret
  FROM public.app_settings
  WHERE key = 'morning_summary_secret';

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE '[morning-summary] morning_summary_secret not set in app_settings — skipping';
    RETURN;
  END IF;

  PERFORM extensions.http_post(
    url     := 'https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/morning-summary',
    headers := jsonb_build_object(
      'Content-Type',             'application/json',
      'x-morning-summary-secret', v_secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Reschedule the cron to call the function (replaces the old header-less job).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-summary-telegram') THEN
    PERFORM cron.unschedule('morning-summary-telegram');
  END IF;
END $$;

SELECT cron.schedule(
  'morning-summary-telegram',
  '*/5 * * * *',
  'SELECT public.call_morning_summary()'
);
