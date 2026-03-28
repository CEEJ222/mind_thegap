-- Enable pg_net and pg_cron for scheduled edge function invocation
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Store project URL and anon key in Vault for secure access
SELECT vault.create_secret('https://jogmtuiakwzxmmyrmnky.supabase.co', 'project_url');
SELECT vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZ210dWlha3d6eG1teXJtbmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzQ2ODUsImV4cCI6MjA5MDE1MDY4NX0.H1dLqhtv8cQA_mDXn3oSpaepLch6DIG7xg0GOPEAlNY', 'anon_key');

-- Schedule job-alerts edge function to run daily at 8am UTC
SELECT cron.schedule(
  'daily-job-alerts',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/job-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
