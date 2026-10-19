-- YC AXIOM 網站租用系統 · 第一階段資料庫
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行（需先套用 001～004）。可重複執行。
-- 內容不含任何金鑰。受保護欄位（status、paid_until、cf_project_name…）只有後端（service role／管理員）能改，
-- 靠「欄位層級權限」＋ RLS 雙重保護，會員即使直接呼叫 REST API 也改不動。

-- ───────────────────────── 輔助函式 ─────────────────────────
-- 網址代稱規則（必須與 templates/shared/slug.js 一致；tests 會比對保留字清單）
create or replace function public.rental_slug_ok(p_slug text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
     and p_slug !~ '--'
     and not (p_slug = any (array['admin', 'administrator', 'www', 'yc', 'ycaxiom', 'yc-axiom', 'api', 'test', 'tests', 'demo', 'app', 'apps', 'mail', 'email', 'support', 'help', 'static', 'assets', 'cdn', 'dev', 'staging', 'preview', 'dashboard', 'login', 'logout', 'signup', 'register', 'billing', 'pay', 'payment', 'status', 'blog', 'docs', 'ftp', 'smtp', 'root', 'null', 'undefined', 'cloudflare', 'pages', 'workers', 'builder', 'terms', 'privacy', 'about', 'contact', 'services', 'pricing', 'works', 'seo', 'geo', 'supabase', 'github']))
$$;

-- ───────────────────────── 資料表 ─────────────────────────
create table if not exists public.rental_sites (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members (id) on delete cascade,
  template           text not null default 'cafe' check (template in ('cafe')),
  slug               text not null unique check (public.rental_slug_ok(slug)),
  status             text not null default 'draft'
                     check (status in ('draft', 'pending', 'live', 'overdue', 'suspended', 'cancelled')),
  palette            text not null default 'forest' check (palette in ('forest', 'caramel', 'ink', 'mist')),
  sections           jsonb not null default '{"menu":true,"interior":true,"faq":true,"news":true}'::jsonb
                     check (jsonb_typeof(sections) = 'object' and pg_column_size(sections) <= 2000),
  content            jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 100000),  -- 工作中的草稿
  live_version_id    uuid,                                    -- 目前上線（最後一次部署成功）的版本
  public_url         text,                                    -- 實際網址（Cloudflare 回傳的網域）
  custom_domain      text,
  cf_project_name    text,
  paid_until         date,
  terms_accepted_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  first_published_at timestamptz,
  last_published_at  timestamptz
);
create index if not exists rental_sites_member_idx on public.rental_sites (member_id);
create index if not exists rental_sites_status_idx on public.rental_sites (status);

create table if not exists public.site_versions (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.rental_sites (id) on delete cascade,
  content    jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 100000),
  palette    text not null,
  sections   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists site_versions_site_idx on public.site_versions (site_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rental_sites_live_version_fk') then
    alter table public.rental_sites add constraint rental_sites_live_version_fk
      foreign key (live_version_id) references public.site_versions (id) on delete set null;
  end if;
end $$;

create table if not exists public.site_events (
  id         bigint generated always as identity primary key,
  site_id    uuid not null references public.rental_sites (id) on delete cascade,
  type       text not null check (char_length(type) between 1 and 40),
  detail     jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists site_events_site_idx on public.site_events (site_id, created_at desc);

-- ───────────────────────── 觸發器 ─────────────────────────
drop trigger if exists rental_sites_touch on public.rental_sites;
create trigger rental_sites_touch before update on public.rental_sites
  for each row execute function public.touch_updated_at();

-- 網址代稱在「第一次發佈」之後鎖定（會員不能改；後端／管理員可以）
create or replace function public.rental_lock_slug()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug and old.status <> 'draft'
     and current_user in ('authenticated', 'anon') then
    raise exception 'slug is locked after first publish';
  end if;
  return new;
end $$;
drop trigger if exists rental_sites_lock_slug on public.rental_sites;
create trigger rental_sites_lock_slug before update on public.rental_sites
  for each row execute function public.rental_lock_slug();

-- 每個網站只保留最新 20 個版本（目前上線的版本永遠保留）
create or replace function public.prune_site_versions()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.site_versions v
   where v.site_id = new.site_id
     and v.id not in (select id from public.site_versions where site_id = new.site_id order by created_at desc, id desc limit 20)
     and v.id is distinct from (select live_version_id from public.rental_sites where id = new.site_id);
  return null;
end $$;
drop trigger if exists site_versions_prune on public.site_versions;
create trigger site_versions_prune after insert on public.site_versions
  for each row execute function public.prune_site_versions();

-- 查詢網址代稱是否可用（會員看不到別人的網站資料，所以用函式回答）
create or replace function public.rental_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and public.rental_slug_ok(p_slug)
     and not exists (select 1 from public.rental_sites s where s.slug = p_slug)
$$;

-- ───────────────────────── 權限 ─────────────────────────
revoke all on public.rental_sites, public.site_versions, public.site_events from anon, authenticated;
revoke all on function public.rental_slug_ok(text), public.rental_lock_slug(), public.prune_site_versions(), public.rental_slug_available(text) from public, anon, authenticated;
grant execute on function public.rental_slug_ok(text) to authenticated;
grant execute on function public.rental_slug_available(text) to authenticated;

grant select on public.rental_sites, public.site_versions, public.site_events to authenticated;
-- 會員只能寫這幾個欄位；status / paid_until / cf_project_name / live_version_id / public_url 等一律拒絕
grant insert (member_id, slug, template, palette, sections, content) on public.rental_sites to authenticated;
grant update (slug, palette, sections, content) on public.rental_sites to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.rental_sites enable row level security;
alter table public.site_versions enable row level security;
alter table public.site_events   enable row level security;

drop policy if exists rental_sites_select_own on public.rental_sites;
drop policy if exists rental_sites_select_admin on public.rental_sites;
drop policy if exists rental_sites_insert_own on public.rental_sites;
drop policy if exists rental_sites_update_own on public.rental_sites;
create policy rental_sites_select_own   on public.rental_sites for select to authenticated using (member_id = auth.uid());
create policy rental_sites_select_admin on public.rental_sites for select to authenticated using (public.is_admin());
-- 第一階段：每位會員 1 個網站（要放寬只需修改這條政策）
create policy rental_sites_insert_own on public.rental_sites for insert to authenticated
  with check (member_id = auth.uid() and public.has_consented()
              and not exists (select 1 from public.rental_sites x where x.member_id = auth.uid()));
create policy rental_sites_update_own on public.rental_sites for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists site_versions_select_own on public.site_versions;
drop policy if exists site_versions_select_admin on public.site_versions;
create policy site_versions_select_own on public.site_versions for select to authenticated
  using (exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_versions_select_admin on public.site_versions for select to authenticated using (public.is_admin());

drop policy if exists site_events_select_own on public.site_events;
drop policy if exists site_events_select_admin on public.site_events;
create policy site_events_select_own on public.site_events for select to authenticated
  using (exists (select 1 from public.rental_sites s where s.id = site_id and s.member_id = auth.uid()));
create policy site_events_select_admin on public.site_events for select to authenticated using (public.is_admin());

-- ───────────────────────── 照片儲存（Storage） ─────────────────────────
-- 公開讀取（客戶網站要顯示）；只有網站擁有者能寫入「自己網站 id」這個資料夾。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists site_photos_insert_own on storage.objects;
drop policy if exists site_photos_update_own on storage.objects;
drop policy if exists site_photos_delete_own on storage.objects;
drop policy if exists site_photos_select_own on storage.objects;
create policy site_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'site-photos' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'site-photos' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'site-photos' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()))
  with check (bucket_id = 'site-photos' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
create policy site_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'site-photos' and exists (select 1 from public.rental_sites s
         where s.id::text = (storage.foldername(name))[1] and s.member_id = auth.uid()));
