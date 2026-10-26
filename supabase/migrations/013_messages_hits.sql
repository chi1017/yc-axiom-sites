-- 013：客戶網站的「聯絡表單留言」與「每日瀏覽次數」。
-- 寫入一律經由 Edge Function site-public（service role）；網站擁有者與管理員可以讀。
-- 可重複執行。

-- ── 聯絡表單留言 ──
create table if not exists public.site_messages (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.rental_sites (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  contact     text not null check (char_length(contact) between 1 and 120),
  message     text not null check (char_length(message) between 1 and 2000),
  ip_hash     text,
  emailed     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists site_messages_site_idx on public.site_messages (site_id, created_at desc);
create index if not exists site_messages_ip_idx on public.site_messages (ip_hash, created_at desc);

-- ── 每日瀏覽次數（不記錄個人資料：只有網站、日期、頁面路徑與次數）──
create table if not exists public.site_daily_hits (
  site_id  uuid not null references public.rental_sites (id) on delete cascade,
  day      date not null,
  path     text not null check (char_length(path) between 1 and 120),
  views    integer not null default 0,
  primary key (site_id, day, path)
);

-- 記一次瀏覽（只給 service role 呼叫；只計上線中的網站；每個網站每天最多 200 個不同路徑）
create or replace function public.rental_record_hit(p_site uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Taipei')::date;
begin
  if p_path is null or char_length(p_path) not between 1 and 120 then return; end if;
  if not exists (select 1 from public.rental_sites s where s.id = p_site and s.status in ('live', 'overdue')) then return; end if;
  if not exists (select 1 from public.site_daily_hits h where h.site_id = p_site and h.day = d and h.path = p_path)
     and (select count(*) from public.site_daily_hits h where h.site_id = p_site and h.day = d) >= 200 then
    return;
  end if;
  insert into public.site_daily_hits (site_id, day, path, views) values (p_site, d, p_path, 1)
  on conflict (site_id, day, path) do update set views = public.site_daily_hits.views + 1;
end $$;
revoke all on function public.rental_record_hit(uuid, text) from public, anon, authenticated;
grant execute on function public.rental_record_hit(uuid, text) to service_role;

-- ── 權限：會員只能讀自己網站的資料；寫入只透過 service role ──
alter table public.site_messages enable row level security;
alter table public.site_daily_hits enable row level security;
revoke all on public.site_messages, public.site_daily_hits from anon, authenticated;
grant select on public.site_messages, public.site_daily_hits to authenticated;
grant select, insert, update on public.site_messages to service_role;
grant select on public.site_daily_hits to service_role;

drop policy if exists site_messages_select_own on public.site_messages;
drop policy if exists site_messages_select_admin on public.site_messages;
create policy site_messages_select_own on public.site_messages for select to authenticated
  using (exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_messages_select_admin on public.site_messages for select to authenticated using (public.is_admin());

drop policy if exists site_daily_hits_select_own on public.site_daily_hits;
drop policy if exists site_daily_hits_select_admin on public.site_daily_hits;
create policy site_daily_hits_select_own on public.site_daily_hits for select to authenticated
  using (exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_daily_hits_select_admin on public.site_daily_hits for select to authenticated using (public.is_admin());
