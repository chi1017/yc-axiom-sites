-- YC AXIOM 網站租用系統 · 方案（自助版／標準版／進階版）與早鳥
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行（需先套用 001～008）。可重複執行。不含任何金鑰。
-- 價格表在程式裡（templates/shared/plans.js），資料庫只記錄每個網站目前選的方案。

alter table public.rental_sites add column if not exists plan text not null default 'self';
alter table public.rental_sites add column if not exists early_bird boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rental_sites_plan_check') then
    alter table public.rental_sites add constraint rental_sites_plan_check check (plan in ('self', 'standard', 'pro'));
  end if;
end $$;

-- 會員只能在「還沒開通」（draft／pending）時選方案；早鳥資格只有管理員能給（走 admin-site），
-- 會員改成標準版以外的方案時早鳥資格自動取消。
create or replace function public.rental_set_plan(p_site_id uuid, p_plan text)
returns text language plpgsql security definer set search_path = ''
as $$
declare r text;
begin
  if auth.uid() is null or not public.has_consented() then
    raise exception 'not allowed';
  end if;
  if p_plan is null or p_plan not in ('self', 'standard', 'pro') then
    raise exception 'invalid plan';
  end if;
  update public.rental_sites
     set plan = p_plan, early_bird = (early_bird and p_plan = 'standard')
   where id = p_site_id and member_id = auth.uid() and status in ('draft', 'pending')
  returning plan into r;
  if r is null then raise exception 'site not found or plan locked'; end if;
  insert into public.site_events (site_id, type, detail)
  values (p_site_id, 'plan_set', jsonb_build_object('plan', p_plan, 'by', 'member'));
  return r;
end $$;
revoke all on function public.rental_set_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.rental_set_plan(uuid, text) to authenticated;

-- 管理員總覽 view：在最後加上 plan、early_bird（create or replace 只能在尾端加欄位）
create or replace view public.admin_rental_overview with (security_invoker = true) as
select s.id, s.member_id, m.email as member_email, s.slug, s.template, s.status,
       s.content ->> 'name' as shop_name,
       s.public_url, s.custom_domain, s.domain_status,
       s.paid_until, (s.paid_until - (now() at time zone 'Asia/Taipei')::date) as days_left,
       s.live_version_id, s.created_at, s.first_published_at, s.last_published_at,
       s.suspended_at, s.suspend_reason, s.terms_accepted_at, s.terms_version, s.go_live_notified_at,
       d.type as last_deploy_type, d.created_at as last_deploy_at, d.detail ->> 'message' as last_deploy_message,
       p.paid_total, p.payment_count,
       s.plan, s.early_bird
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
grant select on public.admin_rental_overview to authenticated;
