\set ON_ERROR_STOP off
\pset tuples_only on
\set a '''aaaaaaaa-0000-0000-0000-000000000001'''
-- 使用者：A（已同意）、B（已同意）、C（未同意）、admin
insert into auth.users (id,email,raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.com','{"provider":"google"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.com','{"provider":"google"}'),
 ('cccccccc-0000-0000-0000-000000000003','c@example.com','{"provider":"google"}'),
 ('dddddddd-0000-0000-0000-000000000004','ycaxiom@gmail.com','{"provider":"google","role":"admin"}')
on conflict (id) do nothing;
update public.members set consented_at = now() where id <> 'cccccccc-0000-0000-0000-000000000003';

\echo == R1 A 建立網站成功（期望 1 筆 draft）
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe') returning slug, status, template, palette;
\echo == R2 A 再建第 2 個（第一階段每人 1 個）→ 期望 row-level security 錯誤
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe-2');
\echo == R3 A 偽造 member_id 為 B → 期望 RLS 錯誤
insert into public.rental_sites (member_id, slug) values ('bbbbbbbb-0000-0000-0000-000000000002','b-cafe-x');
\echo == R4 A 建立時直接指定 status=live → 期望 permission denied
reset role;
delete from public.rental_sites;
set role authenticated;
insert into public.rental_sites (member_id, slug, status) values ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe','live');
\echo == R5 保留字／格式不合的 slug → 期望 4 個 check 錯誤
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','admin');
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','Ab-Cafe');
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','a--b');
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','ab');
insert into public.rental_sites (member_id, slug) values ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe');
reset role;
\echo == R6 C（未同意）建立 → 期望 RLS 錯誤
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into public.rental_sites (member_id, slug) values ('cccccccc-0000-0000-0000-000000000003','c-cafe');
reset role;

\echo == R7 A 可改 content／palette／sections／slug（草稿時）→ 期望 UPDATE 1
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
update public.rental_sites set content = '{"name":"A 咖啡"}', palette = 'ink', sections = '{"menu":false}', slug = 'a-cafe-new';
select slug, palette, content->>'name' from public.rental_sites;
update public.rental_sites set slug = 'a-cafe';
\echo == R8 A 改受保護欄位（逐一）→ 期望 6 個 permission denied
update public.rental_sites set status = 'live';
update public.rental_sites set paid_until = '2030-01-01';
update public.rental_sites set cf_project_name = 'x';
update public.rental_sites set live_version_id = gen_random_uuid();
update public.rental_sites set public_url = 'https://x.pages.dev/';
update public.rental_sites set member_id = 'bbbbbbbb-0000-0000-0000-000000000002';
\echo == R9 非法 palette / 過大 content → 期望 2 個 check 錯誤
update public.rental_sites set palette = 'neon';
update public.rental_sites set content = jsonb_build_object('x', repeat('a', 200000));
reset role;

\echo == R10 slug 鎖定：狀態變成 pending 後，會員改 slug → 期望錯誤；後端（postgres）可改
update public.rental_sites set status = 'pending';
set role authenticated;
update public.rental_sites set slug = 'hacked';
reset role;
update public.rental_sites set slug = 'a-cafe-admin-fix';
update public.rental_sites set slug = 'a-cafe';
select slug from public.rental_sites;

\echo == R11 B 看不到也改不了 A 的網站（期望 0 筆、UPDATE 0）
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) from public.rental_sites;
update public.rental_sites set content = '{"name":"被竄改"}';
delete from public.rental_sites;
reset role;
select content->>'name' as name_still from public.rental_sites;

\echo == R12 管理員可讀全部、不可直接改（期望 1 筆、UPDATE 0）
select set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',false);
set role authenticated;
select count(*) from public.rental_sites;
update public.rental_sites set content = '{}';
reset role;

\echo == R13 site_versions：會員唯讀，不可新增；保留最新 20 筆且上線版本永遠保留
select id as site_id from public.rental_sites limit 1 \gset
insert into public.site_versions (site_id, content, palette, sections, created_at)
  select :'site_id', jsonb_build_object('n', g), 'forest', '{}', now() - (30 - g) * interval '1 minute' from generate_series(1, 25) g;
select count(*) from public.site_versions;
select id as oldest from public.site_versions order by created_at asc limit 1 \gset
update public.rental_sites set live_version_id = :'oldest';
insert into public.site_versions (site_id, content, palette, sections) select :'site_id', '{"n":99}', 'forest', '{}' from generate_series(1,3);
select count(*) as kept_plus_live from public.site_versions;
select count(*) as live_still_exists from public.site_versions where id = :'oldest';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as a_can_read from public.site_versions;
insert into public.site_versions (site_id, content, palette, sections) values (:'site_id','{}','forest','{}');
delete from public.site_versions;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as b_can_read from public.site_versions;
reset role;

\echo == R14 site_events：會員可讀自己、不可寫；B 看不到
insert into public.site_events (site_id, type, detail) values (:'site_id','deploy_ok','{"url":"https://a.pages.dev/"}');
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as a_events from public.site_events;
insert into public.site_events (site_id, type) values (:'site_id','deploy_ok');
update public.site_events set type = 'x';
delete from public.site_events;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as b_events from public.site_events;
reset role;

\echo == R15 rental_slug_available（期望 f 已被用、f 保留字、f 格式錯、t 可用；匿名 → permission denied）
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select public.rental_slug_available('a-cafe'), public.rental_slug_available('admin'), public.rental_slug_available('A_b'), public.rental_slug_available('b-cafe-ok');
reset role;
set role anon;
select public.rental_slug_available('b-cafe-ok');
reset role;

\echo == R16 Storage：A 只能寫自己網站的資料夾
insert into storage.objects (bucket_id, name) values ('site-photos', 'x') on conflict do nothing;
delete from storage.objects;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('site-photos', :'site_id' || '/hero-1.webp');
insert into storage.objects (bucket_id, name) values ('site-photos', 'bbbbbbbb-0000-0000-0000-000000000002/hero.webp');
insert into storage.objects (bucket_id, name) values ('site-photos', 'hero.webp');
insert into storage.objects (bucket_id, name) values ('other-bucket', :'site_id' || '/hero-1.webp');
select count(*) as a_objects from storage.objects;
delete from storage.objects where name = :'site_id' || '/hero-1.webp';
select count(*) as a_objects_after_delete from storage.objects;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('site-photos', :'site_id' || '/evil.webp');
reset role;

\echo == R17 刪除會員會一併刪除網站、版本、事件
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select (select count(*) from public.rental_sites) sites, (select count(*) from public.site_versions) versions, (select count(*) from public.site_events) events;
