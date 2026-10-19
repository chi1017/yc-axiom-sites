-- YC AXIOM 網站租用系統 · 每日排程（pg_cron → Edge Function rental-cron）
-- 這是「範本」，不是 migration：請先把下面兩個地方換成你自己的值再到 SQL Editor 執行，不要把換好的版本放進 repo。
--   <PROJECT_REF>  你的 Supabase 專案代號（SUPABASE_URL 開頭 https://xxxx.supabase.co 的 xxxx）
--   <CRON_SECRET>  自己產生的一長串隨機字串；同一組也要設成 Edge Functions → Secrets 的 CRON_SECRET
-- 需要的擴充套件（Database → Extensions）：pg_cron、pg_net（Supabase Vault 預設已啟用）。
-- 每天台灣時間 09:00（= UTC 01:00）執行；週一的同一次呼叫會順便寄管理員週報。

-- 1) 把 CRON_SECRET 存進 Vault（資料庫內加密儲存，不會出現在排程指令裡）
select vault.create_secret('<CRON_SECRET>', 'rental_cron_secret');
-- 之後若要換密碼：select vault.update_secret((select id from vault.secrets where name = 'rental_cron_secret'), '<新的 CRON_SECRET>');

-- 2) 建立排程
select cron.schedule(
  'rental-cron-daily',
  '0 1 * * *',
  $job$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/rental-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rental_cron_secret')
    ),
    body    := '{"job":"daily"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- 查看排程：select jobid, jobname, schedule, active from cron.job where jobname = 'rental-cron-daily';
-- 查看最近回應：select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 5;
-- 停用排程：select cron.unschedule('rental-cron-daily');
