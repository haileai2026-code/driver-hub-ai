-- Enable pg_cron and pg_net for scheduled HTTP calls
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Telegram polling: every minute, call the telegram-poll endpoint
select cron.schedule(
  'telegram-poll-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/telegram-poll',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer haile_morning_2026"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=58000
  ) as request_id;
  $$
);

-- Morning summary: every minute (the endpoint itself checks the time window)
select cron.schedule(
  'morning-summary-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://project--a8af2e8a-adc4-4ba1-99c4-8206fd15daba.lovable.app/api/public/hooks/morning-summary',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer haile_morning_2026"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  ) as request_id;
  $$
);