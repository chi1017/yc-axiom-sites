-- 010：一頁版／多頁版（多頁租用版第一階段：資料與方案）
-- 規則與 templates/shared/pages.js 一致（tests 會比對頁面清單）：
--   layout = 'single'（一頁版，預設）或 'multi'（多頁版）；建立網站時選。
--   pages  = 多頁版要開哪些頁（首頁一定開，不存）；只接受下列鍵、值必須是 true／false。
--   只能從一頁升級到多頁，會員不能改回；升級時自動記下 upgraded_at。
-- 既有網站一律是一頁版，行為不變。可以重複執行。

create or replace function public.rental_page_keys()
returns text[] language sql immutable set search_path = ''
as $$ select array['about', 'menu', 'interior', 'news', 'faq', 'visit']::text[] $$;

create or replace function public.rental_pages_ok(p jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where not (e.key = any (public.rental_page_keys())) or jsonb_typeof(e.value) <> 'boolean')
$$;

-- ───────────────────────── rental_sites ─────────────────────────
alter table public.rental_sites add column if not exists layout text not null default 'single';
alter table public.rental_sites add column if not exists pages jsonb not null
  default '{"about":true,"menu":true,"interior":true,"news":true,"faq":true,"visit":true}'::jsonb;
alter table public.rental_sites add column if not exists upgraded_at timestamptz;   -- 一頁升級到多頁的時間（月費自下一期改多頁價）

alter table public.rental_sites drop constraint if exists rental_sites_layout_check;
alter table public.rental_sites add constraint rental_sites_layout_check check (layout in ('single', 'multi'));
alter table public.rental_sites drop constraint if exists rental_sites_pages_check;
alter table public.rental_sites add constraint rental_sites_pages_check check (public.rental_pages_ok(pages));

-- ───────────────────────── site_versions ─────────────────────────
-- 版本要記下當時的版型與頁面，重新部署舊版本時才會產生相同的網站
alter table public.site_versions add column if not exists layout text not null default 'single';
alter table public.site_versions add column if not exists pages jsonb not null default '{}'::jsonb;
alter table public.site_versions drop constraint if exists site_versions_layout_check;
alter table public.site_versions add constraint site_versions_layout_check check (layout in ('single', 'multi'));
alter table public.site_versions drop constraint if exists site_versions_pages_check;
alter table public.site_versions add constraint site_versions_pages_check check (public.rental_pages_ok(pages));

-- ───────────────────────── 只能升級，不能改回 ─────────────────────────
create or replace function public.rental_guard_layout()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.layout is distinct from old.layout then
    if old.layout = 'multi' and new.layout = 'single' and current_user in ('authenticated', 'anon') then
      raise exception 'layout cannot be changed back to single' using errcode = 'check_violation';
    end if;
    if old.layout = 'single' and new.layout = 'multi' then
      new.upgraded_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_sites_guard_layout on public.rental_sites;
create trigger rental_sites_guard_layout before update of layout on public.rental_sites
  for each row execute function public.rental_guard_layout();

-- ───────────────────────── 權限 ─────────────────────────
-- 會員可在建立時選 layout／pages，之後可勾選頁面、升級；upgraded_at 只由觸發器寫入
revoke all on function public.rental_page_keys(), public.rental_pages_ok(jsonb), public.rental_guard_layout() from public, anon, authenticated;
grant execute on function public.rental_page_keys(), public.rental_pages_ok(jsonb) to authenticated;
grant insert (layout, pages) on public.rental_sites to authenticated;
grant update (layout, pages) on public.rental_sites to authenticated;
