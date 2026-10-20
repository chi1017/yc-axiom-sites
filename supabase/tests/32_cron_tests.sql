\set ON_ERROR_STOP off
\pset tuples_only on
-- 第三階段資料庫測試：記號欄位權限、cron_runs、site_reports 的 RLS 與限制。每項輸出 PASS／FAIL。
insert into auth.users (id,email,raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.com','{"provider":"google"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.com','{"provider":"google"}'),
 ('dddddddd-0000-0000-0000-000000000004','ycaxiom@gmail.com','{"provider":"google","role":"admin"}')
on conflict (id) do nothing;
update public.members set consented_at = now();
delete from public.rental_sites;
insert into public.rental_sites (member_id, slug, status, content, paid_until) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe','live','{"name":"A 咖啡"}', current_date + 5),
 ('bbbbbbbb-0000-0000-0000-000000000002','b-cafe','live','{"name":"B 咖啡"}', current_date + 5);
select id as a_site from public.rental_sites where slug='a-cafe' \gset
select id as b_site from public.rental_sites where slug='b-cafe' \gset
\set A '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}'
\set B '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}'
\set ADM '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated","email":"ycaxiom@gmail.com","app_metadata":{"role":"admin"}}'

\echo == C1 新欄位預設為空；會員不能改任何排程記號（permission denied → 值不變）
select (reminder_sent_for is null and overdue_notified_for is null and suspend_notified_for is null) as defaults_null from public.rental_sites where id=:'a_site';
select set_config('request.jwt.claims',:'A',false);
set role authenticated;
update public.rental_sites set reminder_sent_for = current_date where id=:'a_site';
update public.rental_sites set overdue_notified_for = current_date where id=:'a_site';
update public.rental_sites set suspend_notified_for = current_date where id=:'a_site';
reset role;
select case when reminder_sent_for is null and overdue_notified_for is null and suspend_notified_for is null then 'PASS markers untouched' else 'FAIL markers changed by member' end from public.rental_sites where id=:'a_site';
-- service role（postgres）可以改
update public.rental_sites set reminder_sent_for = paid_until where id=:'a_site';
select case when reminder_sent_for = paid_until then 'PASS backend can set marker' else 'FAIL' end from public.rental_sites where id=:'a_site';

\echo == C2 cron_runs：會員 0 筆且不能寫；匿名 permission denied；管理員看得到；每週真實執行同一天只能有一筆
insert into public.cron_runs (job, run_date, mode, triggered_by, summary) values ('daily', current_date, 'real', 'cron', '{"n":1}');
insert into public.cron_runs (job, run_date, mode, triggered_by, summary) values ('weekly', current_date, 'real', 'cron', '{}');
select set_config('request.jwt.claims',:'A',false);
set role authenticated;
select case when count(*) = 0 then 'PASS member sees 0 cron_runs' else 'FAIL member sees cron_runs' end from public.cron_runs;
insert into public.cron_runs (job, run_date) values ('daily', current_date);
delete from public.cron_runs;
reset role;
set role anon;
select count(*) from public.cron_runs;
reset role;
select set_config('request.jwt.claims',:'ADM',false);
set role authenticated;
select case when count(*) = 2 then 'PASS admin sees cron_runs' else 'FAIL admin count ' || count(*) end from public.cron_runs;
reset role;
insert into public.cron_runs (job, run_date, mode) values ('weekly', current_date, 'real');
select case when count(*) = 1 then 'PASS weekly real unique (duplicate rejected)' else 'FAIL duplicate weekly' end from public.cron_runs where job='weekly';
insert into public.cron_runs (job, run_date, mode) values ('weekly', current_date, 'simulated');
insert into public.cron_runs (job, run_date, mode) values ('weekly', current_date, 'simulated');
select case when count(*) = 3 then 'PASS simulated weekly not unique' else 'FAIL simulated count ' || count(*) end from public.cron_runs where job='weekly';
insert into public.cron_runs (job, run_date, mode) values ('monthly', current_date, 'real');
insert into public.cron_runs (job, run_date, mode) values ('daily', current_date, 'bogus');

\echo == C3 site_reports 限制：月份必須是 1 日、ok 必須有分數、分數 0–100、同月只能一筆
insert into public.site_reports (site_id, month, status, seo_score, geo_score, top_issues, url) values (:'a_site', date_trunc('month', current_date)::date, 'ok', 82, 71, '[{"title":"x","detail":"y"}]', 'https://a.pages.dev/');
insert into public.site_reports (site_id, month, status, seo_score, geo_score) values (:'a_site', date_trunc('month', current_date)::date + 1, 'ok', 80, 80);
insert into public.site_reports (site_id, month, status) values (:'a_site', (date_trunc('month', current_date) - interval '1 month')::date, 'ok');
insert into public.site_reports (site_id, month, status, seo_score, geo_score) values (:'a_site', (date_trunc('month', current_date) - interval '2 month')::date, 'ok', 101, 50);
insert into public.site_reports (site_id, month, status, seo_score, geo_score) values (:'a_site', date_trunc('month', current_date)::date, 'ok', 70, 70);
insert into public.site_reports (site_id, month, status, error) values (:'a_site', (date_trunc('month', current_date) - interval '1 month')::date, 'failed', '網站打不開');
insert into public.site_reports (site_id, month, status, seo_score, geo_score) values (:'b_site', date_trunc('month', current_date)::date, 'ok', 60, 55);
insert into public.site_reports (site_id, month, status, error) values (:'b_site', (date_trunc('month', current_date) - interval '1 month')::date, 'failed', 'timeout');
select case when count(*) = 4 then 'PASS only valid rows stored (4)' else 'FAIL stored ' || count(*) end from public.site_reports;

\echo == C4 site_reports RLS：A 只看到自己網站的 ok 報告；B 只看到自己的 ok；管理員看全部；匿名被擋；會員不能寫
select set_config('request.jwt.claims',:'A',false);
set role authenticated;
select case when count(*) = 1 and bool_and(site_id = :'a_site') and bool_and(status = 'ok') then 'PASS A sees only own ok report' else 'FAIL A sees ' || count(*) end from public.site_reports;
insert into public.site_reports (site_id, month, status, seo_score, geo_score) values (:'a_site', (date_trunc('month', current_date) - interval '3 month')::date, 'ok', 99, 99);
update public.site_reports set seo_score = 100;
delete from public.site_reports;
reset role;
select set_config('request.jwt.claims',:'B',false);
set role authenticated;
select case when count(*) = 1 and bool_and(site_id = :'b_site') then 'PASS B sees only own ok report' else 'FAIL B sees ' || count(*) end from public.site_reports;
reset role;
select set_config('request.jwt.claims',:'ADM',false);
set role authenticated;
select case when count(*) = 4 then 'PASS admin sees all 4 (incl. failed)' else 'FAIL admin sees ' || count(*) end from public.site_reports;
reset role;
set role anon;
select count(*) from public.site_reports;
reset role;
select case when seo_score = 82 and geo_score = 71 then 'PASS member could not modify scores' else 'FAIL scores changed' end from public.site_reports where site_id=:'a_site' and status='ok';

\echo == C5 刪除網站會連帶清掉報告（on delete cascade）；007 重跑不報錯
delete from public.rental_sites where id=:'b_site';
select case when count(*) = 0 then 'PASS reports cascade' else 'FAIL reports remain' end from public.site_reports where site_id=:'b_site';
