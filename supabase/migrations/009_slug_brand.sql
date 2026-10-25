-- 009：網址代稱不可以帶平台品牌字樣（yc、ycaxiom、yc-axiom 當作獨立單字或連字號分段）
-- 規則與 templates/shared/slug.js 的 BRAND_RE 一致（tests/shared.test.js 會比對）。
--
-- 只在「建立網站」或「修改網址代稱」時檢查，不改 rental_slug_ok()／check constraint：
-- Postgres 每次 UPDATE 都會重新檢查 check constraint，若把品牌規則放進去，
-- 已經在用這類代稱的舊網站連存草稿都會失敗。舊代稱維持可用，發佈端也只在草稿時檢查品牌字樣。
--
-- 上線前可先查有沒有舊網站會受影響（只是查詢，不會改資料）：
--   select id, slug, status from public.rental_sites where slug ~ '(^|-)yc(-|$)|ycaxiom';

create or replace function public.rental_slug_brand_ok(p_slug text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_slug !~ '(^|-)yc(-|$)|ycaxiom'
$$;

create or replace function public.rental_guard_slug_brand()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.slug is distinct from old.slug)
     and not public.rental_slug_brand_ok(new.slug) then
    raise exception 'slug contains reserved brand name' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists rental_sites_guard_slug_brand on public.rental_sites;
create trigger rental_sites_guard_slug_brand before insert or update of slug on public.rental_sites
  for each row execute function public.rental_guard_slug_brand();

-- 編輯器用來即時檢查代稱是否可用：品牌字樣一律回答「不可用」
create or replace function public.rental_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and public.rental_slug_ok(p_slug)
     and public.rental_slug_brand_ok(p_slug)
     and not exists (select 1 from public.rental_sites s where s.slug = p_slug)
$$;

revoke all on function public.rental_slug_brand_ok(text), public.rental_guard_slug_brand(), public.rental_slug_available(text) from public, anon, authenticated;
grant execute on function public.rental_slug_brand_ok(text) to authenticated;
grant execute on function public.rental_slug_available(text) to authenticated;
