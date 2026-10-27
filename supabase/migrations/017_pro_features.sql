-- 017：進階方案、上傳字型、自訂程式碼審核、預約行事曆（時段與名額）。只新增，不改既有欄位。可重複執行。

-- ── 方案等級：basic（一般）／pro（進階）。只有管理員（Edge Function admin-site）能改，會員只能讀 ──
alter table public.rental_sites add column if not exists tier text not null default 'basic';
do $$ begin
  alter table public.rental_sites add constraint rental_sites_tier_ok check (tier in ('basic', 'pro'));
exception when duplicate_object then null; end $$;

-- ── 店家上傳的字型：不公開（字型多半有授權限制）。只有網站擁有者能讀寫自己網站的資料夾；建置時用 service role 下載並只取用到的字 ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-fonts', 'site-fonts', false, 20971520,
  array['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'font/sfnt', 'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf', 'application/x-font-opentype', 'application/vnd.ms-opentype', 'application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'font/sfnt', 'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf', 'application/x-font-opentype', 'application/vnd.ms-opentype', 'application/octet-stream'];

drop policy if exists site_fonts_select_own on storage.objects;
drop policy if exists site_fonts_insert_own on storage.objects;
drop policy if exists site_fonts_update_own on storage.objects;
drop policy if exists site_fonts_delete_own on storage.objects;
create policy site_fonts_select_own on storage.objects for select to authenticated
  using (bucket_id = 'site-fonts' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_fonts_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'site-fonts' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_fonts_update_own on storage.objects for update to authenticated
  using (bucket_id = 'site-fonts' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()))
  with check (bucket_id = 'site-fonts' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_fonts_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'site-fonts' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));

-- ── 自訂程式碼（嵌入 HTML、全站程式碼）審核：以內容雜湊為準，同一份程式碼核准過就不用再審 ──
create table if not exists public.site_code_reviews (
  site_id      uuid not null references public.rental_sites (id) on delete cascade,
  hash         text not null check (hash ~ '^[0-9a-f]{64}$'),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note         text check (char_length(note) <= 300),
  version_id   uuid,
  reviewed_by  text,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (site_id, hash)
);
create index if not exists site_code_reviews_status_idx on public.site_code_reviews (status, created_at desc);
alter table public.site_code_reviews enable row level security;
revoke all on public.site_code_reviews from anon, authenticated;
grant select on public.site_code_reviews to authenticated;
grant select, insert, update on public.site_code_reviews to service_role;
drop policy if exists site_code_reviews_select_own on public.site_code_reviews;
drop policy if exists site_code_reviews_select_admin on public.site_code_reviews;
create policy site_code_reviews_select_own on public.site_code_reviews for select to authenticated
  using (exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_code_reviews_select_admin on public.site_code_reviews for select to authenticated using (public.is_admin());

-- ── 預約行事曆：預約申請（site_messages）加上時段與處理狀態 ──
alter table public.site_messages add column if not exists slot_date date;
alter table public.site_messages add column if not exists slot_time text;
alter table public.site_messages add column if not exists slot_status text;
do $$ begin
  alter table public.site_messages add constraint site_messages_slot_ok check (
    (slot_date is null and slot_time is null and slot_status is null) or
    (slot_date is not null and slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and slot_status in ('pending', 'confirmed', 'cancelled')));
exception when duplicate_object then null; end $$;
create index if not exists site_messages_slot_idx on public.site_messages (site_id, slot_date, slot_time) where slot_date is not null;

-- 佔一個時段：同一時段同時只有一個請求能檢查名額並寫入（advisory lock），額滿回傳 null。
-- 只給 service role（site-public）呼叫；時段是否在店家設定的班表內由 Edge Function 先檢查。
create or replace function public.rental_book_slot(p_site uuid, p_date date, p_time text, p_capacity integer,
  p_name text, p_contact text, p_message text, p_ip_hash text, p_meta jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare used integer; new_id uuid;
begin
  if p_capacity is null or p_capacity < 1 then return null; end if;
  perform pg_advisory_xact_lock(hashtext(p_site::text || '|' || p_date::text || '|' || p_time));
  select count(*) into used from public.site_messages
   where site_id = p_site and slot_date = p_date and slot_time = p_time and slot_status <> 'cancelled';
  if used >= p_capacity then return null; end if;
  insert into public.site_messages (site_id, name, contact, message, ip_hash, kind, meta, slot_date, slot_time, slot_status)
  values (p_site, p_name, p_contact, p_message, p_ip_hash, 'booking', p_meta, p_date, p_time, 'pending')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.rental_book_slot(uuid, date, text, integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rental_book_slot(uuid, date, text, integer, text, text, text, text, jsonb) to service_role;

-- 某段日期內各時段已被預約的組數（顯示剩餘名額用；不回傳任何個人資料）
create or replace function public.rental_slot_usage(p_site uuid, p_from date, p_to date)
returns table (slot_date date, slot_time text, used bigint) language sql stable security definer set search_path = public as $$
  select m.slot_date, m.slot_time, count(*) from public.site_messages m
   where m.site_id = p_site and m.slot_date between p_from and p_to and m.slot_status <> 'cancelled'
   group by m.slot_date, m.slot_time;
$$;
revoke all on function public.rental_slot_usage(uuid, date, date) from public, anon, authenticated;
grant execute on function public.rental_slot_usage(uuid, date, date) to service_role;
