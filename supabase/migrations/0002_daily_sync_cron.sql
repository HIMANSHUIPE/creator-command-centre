-- Daily automatic sync at 02:30 IST (21:00 UTC).
-- Run this once in the Supabase SQL editor AFTER setting the CRON_SECRET edge function secret.
-- Replace <CRON_SECRET> below with the same value (it is stored in Vault, not in this file).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'cron_secret');

select cron.schedule(
  'daily-social-sync',
  '0 21 * * *',
  $$
  select net.http_post(
    url := 'https://wnuufmkrmppebzikxfdu.supabase.co/functions/v1/api/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb
  );
  $$
);
