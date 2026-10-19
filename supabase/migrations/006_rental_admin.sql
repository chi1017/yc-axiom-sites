-- YC AXIOM 網站租用系統 · 第二階段資料庫（管理後台、收款、條款）
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行（需先套用 001～005）。可重複執行。
-- 內容不含任何金鑰。匯款資訊請在 /admin/ 的「租用網站」設定區填寫，不要寫在這個檔案裡。

-- ───────────────────────── settings：匯款資訊等設定 ─────────────────────────
create table if not exists public.settings (
  key        text primary key check (key in ('bank_transfer', 'plan')),
  value      jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 8000),
  updated_at timestamptz not null default now(),
  updated_by text
);

create or replace function public.settings_stamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', current_user);
  return new;
end $$;
drop trigger if exists settings_stamp on public.settings;
create trigger settings_stamp before insert or update on public.settings
  for each row execute function public.settings_stamp();

-- ───────────────────────── payments：收款紀錄（手動匯款，由管理員確認） ─────────────────────────
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.rental_sites (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  amount       integer not null check (amount > 0 and amount <= 10000000),  -- 新台幣整數
  months       integer not null check (months between 1 and 60),
  method       text not null default 'bank_transfer' check (method in ('bank_transfer')),
  reference    text check (reference is null or char_length(reference) <= 100),  -- 匯款末五碼／備註
  paid_on      date not null,
  period_from  date not null,
  period_to    date not null check (period_to >= period_from),
  confirmed_by text not null,
  created_at   timestamptz not null default now()
);
create index if not exists payments_site_idx on public.payments (site_id, paid_on desc, created_at desc);
create index if not exists payments_member_idx on public.payments (member_id);

-- ───────────────────────── rental_sites 新欄位 ─────────────────────────
alter table public.rental_sites add column if not exists suspended_at       timestamptz;
alter table public.rental_sites add column if not exists suspend_reason     text check (suspend_reason is null or char_length(suspend_reason) <= 200);
alter table public.rental_sites add column if not exists domain_status      text not null default 'none';
alter table public.rental_sites add column if not exists terms_version      text check (terms_version is null or char_length(terms_version) <= 40);
alter table public.rental_sites add column if not exists go_live_notified_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rental_sites_domain_status_check') then
    alter table public.rental_sites add constraint rental_sites_domain_status_check
      check (domain_status in ('none', 'pending_dns', 'active'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rental_sites_custom_domain_check') then
    alter table public.rental_sites add constraint rental_sites_custom_domain_check
      check (custom_domain is null or (char_length(custom_domain) <= 253
             and custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'));
  end if;
end $$;

-- ───────────────────────── 會員同意租用條款 ─────────────────────────
-- 會員沒有 terms_* 欄位的寫入權限，只能透過這個函式同意「自己的」網站。
create or replace function public.rental_accept_terms(p_site_id uuid, p_version text)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare ts timestamptz;
begin
  if auth.uid() is null or not public.has_consented() then
    raise exception 'not allowed';
  end if;
  if p_version is null or char_length(p_version) not between 1 and 40 then
    raise exception 'invalid version';
  end if;
  update public.rental_sites
     set terms_accepted_at = now(), terms_version = p_version
   where id = p_site_id and member_id = auth.uid()
  returning terms_accepted_at into ts;
  if ts is null then raise exception 'site not found'; end if;
  insert into public.site_events (site_id, type, detail)
  values (p_site_id, 'terms_accepted', jsonb_build_object('version', p_version));
  return ts;
end $$;

-- ───────────────────────── 管理員總覽 view（僅管理員有資料） ─────────────────────────
create or replace view public.admin_rental_overview with (security_invoker = true) as
select s.id, s.member_id, m.email as member_email, s.slug, s.template, s.status,
       s.content ->> 'name' as shop_name,
       s.public_url, s.custom_domain, s.domain_status,
       s.paid_until, (s.paid_until - (now() at time zone 'Asia/Taipei')::date) as days_left,
       s.live_version_id, s.created_at, s.first_published_at, s.last_published_at,
       s.suspended_at, s.suspend_reason, s.terms_accepted_at, s.terms_version, s.go_live_notified_at,
       d.type as last_deploy_type, d.created_at as last_deploy_at, d.detail ->> 'message' as last_deploy_message,
       p.paid_total, p.payment_count
from public.rental_sites s
join public.members m on m.id = s.member_id
left join lateral (
  select e.type, e.created_at, e.detail from public.site_events e
  where e.site_id = s.id and e.type in ('deploy_ok', 'deploy_failed')
  order by e.created_at desc, e.id desc limit 1) d on true
left join lateral (
  select coalesce(sum(x.amount), 0) as paid_total, count(*) as payment_count
  from public.payments x where x.site_id = s.id) p on true
where public.is_admin();

-- ───────────────────────── 權限 ─────────────────────────
revoke all on public.settings, public.payments from anon, authenticated;
revoke all on public.admin_rental_overview from anon, authenticated;
revoke all on function public.settings_stamp(), public.rental_accept_terms(uuid, text) from public, anon, authenticated;
grant execute on function public.rental_accept_terms(uuid, text) to authenticated;

grant select on public.settings to authenticated;
grant insert (key, value) on public.settings to authenticated;
grant update (value) on public.settings to authenticated;
grant select on public.payments to authenticated;   -- 寫入一律走 Edge Function（service role）
grant select on public.admin_rental_overview to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.settings enable row level security;
alter table public.payments enable row level security;

drop policy if exists settings_select on public.settings;
drop policy if exists settings_insert_admin on public.settings;
drop policy if exists settings_update_admin on public.settings;
-- 已登入會員讀得到匯款資訊與方案說明；其他設定（日後新增）只有管理員看得到
create policy settings_select on public.settings for select to authenticated
  using (key in ('bank_transfer', 'plan') or public.is_admin());
create policy settings_insert_admin on public.settings for insert to authenticated with check (public.is_admin());
create policy settings_update_admin on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_select_own on public.payments;
drop policy if exists payments_select_admin on public.payments;
create policy payments_select_own   on public.payments for select to authenticated using (member_id = auth.uid());
create policy payments_select_admin on public.payments for select to authenticated using (public.is_admin());
