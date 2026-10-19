-- YC AXIOM 網站租用系統 · 第三階段資料庫（每日排程、月報）
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行（需先套用 001～006）。可重複執行。
-- 這個檔案只建立資料表／欄位／權限，不含任何金鑰，也不會建立排程；排程請照文件另外執行 supabase/cron/schedule_rental_cron.sql。

-- ───────────────────────── rental_sites：排程「已處理」記號 ─────────────────────────
-- 記號用「對應的到期日／暫停時間」當值，所以收款後到期日一變，下一輪提醒就會自動重新計算，不必另外歸零。
alter table public.rental_sites add column if not exists reminder_sent_for   date;         -- 已為這個到期日寄過「即將到期」提醒
alter table public.rental_sites add column if not exists overdue_notified_for date;        -- 已為這個到期日寄過「已到期」通知
alter table public.rental_sites add column if not exists suspend_notified_for date;        -- 已為這次暫停（以暫停日的台灣日期為準）通知過管理員「暫停滿 30 天」

-- ───────────────────────── cron_runs：排程執行紀錄 ─────────────────────────
create table if not exists public.cron_runs (
  id           bigint generated always as identity primary key,
  job          text not null check (job in ('daily', 'weekly')),
  run_date     date not null,                       -- 以台灣日期計算的「今天」（模擬時為假日期）
  mode         text not null default 'real' check (mode in ('real', 'simulated')),
  triggered_by text not null default 'cron' check (char_length(triggered_by) <= 200),
  summary      jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 60000),
  created_at   timestamptz not null default now()
);
create index if not exists cron_runs_recent_idx on public.cron_runs (created_at desc);
-- 每週摘要同一天（真實執行）只會寄一次
create unique index if not exists cron_runs_weekly_once on public.cron_runs (run_date) where job = 'weekly' and mode = 'real';

-- ───────────────────────── site_reports：每月 SEO／GEO 月報 ─────────────────────────
create table if not exists public.site_reports (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.rental_sites (id) on delete cascade,
  month      date not null check (month = date_trunc('month', month)::date),   -- 該月 1 日
  status     text not null default 'ok' check (status in ('ok', 'failed')),
  url        text check (url is null or char_length(url) <= 300),
  seo_score  integer check (seo_score between 0 and 100),
  geo_score  integer check (geo_score between 0 and 100),
  top_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(top_issues) = 'array' and pg_column_size(top_issues) <= 8000),
  error      text check (error is null or char_length(error) <= 300),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, month),
  check (status = 'failed' or (seo_score is not null and geo_score is not null))
);
create index if not exists site_reports_site_idx on public.site_reports (site_id, month desc);
create index if not exists site_events_type_idx on public.site_events (type, created_at desc);

-- ───────────────────────── 權限 ─────────────────────────
revoke all on public.cron_runs, public.site_reports from anon, authenticated;
grant select on public.cron_runs to authenticated;      -- 只有管理員讀得到（RLS）
grant select on public.site_reports to authenticated;   -- 客戶讀自己的、管理員讀全部（RLS）；寫入一律走 service role

alter table public.cron_runs enable row level security;
alter table public.site_reports enable row level security;

drop policy if exists cron_runs_select_admin on public.cron_runs;
create policy cron_runs_select_admin on public.cron_runs for select to authenticated using (public.is_admin());

drop policy if exists site_reports_select_own on public.site_reports;
drop policy if exists site_reports_select_admin on public.site_reports;
create policy site_reports_select_own on public.site_reports for select to authenticated
  using (status = 'ok' and exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_reports_select_admin on public.site_reports for select to authenticated using (public.is_admin());
