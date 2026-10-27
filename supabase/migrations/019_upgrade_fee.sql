-- 019：一頁版升級多頁版要補差額。升級改由 Edge Function member-site 處理（計算差額、記錄、通知管理員），
-- 已付費的網站先標記「待補差額」，管理員確認收款後才發佈多頁版。會員不能再直接改 layout。只新增欄位、收回一個欄位權限。可重複執行。
alter table public.rental_sites add column if not exists upgrade_pending boolean not null default false;
alter table public.rental_sites add column if not exists upgrade_amount integer check (upgrade_amount is null or (upgrade_amount >= 0 and upgrade_amount <= 1000000));
alter table public.rental_sites add column if not exists upgrade_requested_at timestamptz;
revoke update (layout) on public.rental_sites from authenticated;
