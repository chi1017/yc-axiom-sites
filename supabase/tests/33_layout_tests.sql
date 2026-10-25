\set ON_ERROR_STOP off
\pset tuples_only on
-- 一頁版／多頁版（010）。執行前需先跑 005–010。
insert into auth.users (id,email,raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.com','{"provider":"google"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.com','{"provider":"google"}')
on conflict (id) do nothing;
update public.members set consented_at = now();

\echo == L1 既有寫法建立網站 → 期望 single、六頁全開、upgraded_at 空
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe') returning layout, pages, upgraded_at is null;
\echo == L2 會員勾選頁面 → 期望 UPDATE 成功、menu=false
update public.rental_sites set pages = '{"about":true,"menu":false,"interior":true,"news":true,"faq":true,"visit":true}' returning pages->'menu';
\echo == L3 不合法的 layout／pages → 期望 3 個 check 錯誤
update public.rental_sites set layout = 'double';
update public.rental_sites set pages = '{"home":false}';
update public.rental_sites set pages = '{"menu":"no"}';
\echo == L4 升級成多頁 → 期望 multi、upgraded_at 有值
update public.rental_sites set layout = 'multi' returning layout, upgraded_at is not null;
\echo == L5 會員改回一頁 → 期望錯誤 layout cannot be changed back
update public.rental_sites set layout = 'single';
\echo == L6 會員不能自己寫 upgraded_at → 期望 permission denied
update public.rental_sites set upgraded_at = null;
reset role;
\echo == L7 B 建立時直接選多頁 → 期望 multi、upgraded_at 空（不是升級）
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into public.rental_sites (member_id, slug, layout, pages) values ('bbbbbbbb-0000-0000-0000-000000000002','b-cafe','multi','{"faq":false}') returning layout, pages, upgraded_at is null;
reset role;
\echo == L8 後端（postgres）可修正成一頁 → 期望 single
update public.rental_sites set layout = 'single' where slug = 'a-cafe' returning layout;
\echo == L9 site_versions 存版型；舊版本預設 single → 期望 single 與 multi 各一
insert into public.site_versions (site_id, content, palette, sections) select id, '{}', 'forest', '{}' from public.rental_sites where slug = 'a-cafe';
insert into public.site_versions (site_id, content, palette, sections, layout, pages) select id, '{}', 'forest', '{}', 'multi', '{"menu":false}' from public.rental_sites where slug = 'b-cafe';
select layout, pages from public.site_versions order by layout desc;
\echo == L10 site_versions 不合法 pages → 期望 check 錯誤
insert into public.site_versions (site_id, content, palette, sections, pages) select id, '{}', 'forest', '{}', '{"x":true}' from public.rental_sites where slug = 'a-cafe';

\echo == I1 行業（011）：會員建立美髮沙龍 → 期望 salon；會員之後改行業 → 期望 permission denied（行業建立後固定）；後端寫入格式錯誤 → 期望 check 錯誤
delete from public.rental_sites;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into public.rental_sites (member_id, slug, template) values ('aaaaaaaa-0000-0000-0000-000000000001','a-salon','salon') returning template;
update public.rental_sites set template = 'car-detailing' returning template;
reset role;
update public.rental_sites set template = 'Bad_Key';
