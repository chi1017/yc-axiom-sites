-- 012：會員可在編輯器更改行業；一個會員可以有多個網站（未終止的最多 5 個）
-- 可重複執行。

-- 行業（template）開放會員自己更新；格式由 011 的 check 把關，發佈時再檢查是不是支援的行業
grant update (template) on public.rental_sites to authenticated;

-- 建立網站：原本每位會員 1 個，改為未終止的網站最多 5 個
create or replace function public.rental_site_quota_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.rental_sites x
          where x.member_id = auth.uid() and x.status <> 'cancelled') < 5
$$;
revoke all on function public.rental_site_quota_ok() from public, anon;
grant execute on function public.rental_site_quota_ok() to authenticated;

drop policy if exists rental_sites_insert_own on public.rental_sites;
create policy rental_sites_insert_own on public.rental_sites for insert to authenticated
  with check (member_id = auth.uid() and public.has_consented() and public.rental_site_quota_ok());
