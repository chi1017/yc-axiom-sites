\set ON_ERROR_STOP off
\pset tuples_only on
insert into auth.users (id,email,raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.com','{"provider":"google"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.com','{"provider":"google"}'),
 ('cccccccc-0000-0000-0000-000000000003','c@example.com','{"provider":"google"}'),
 ('dddddddd-0000-0000-0000-000000000004','ycaxiom@gmail.com','{"provider":"google","role":"admin"}')
on conflict (id) do nothing;
update public.members set consented_at = now() where id <> 'cccccccc-0000-0000-0000-000000000003';
delete from public.rental_sites;
insert into public.rental_sites (member_id, slug, status, content, paid_until) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a-cafe','live','{"name":"A 咖啡"}', current_date + 5),
 ('bbbbbbbb-0000-0000-0000-000000000002','b-cafe','pending','{"name":"B 咖啡"}', null);
select id as a_site from public.rental_sites where slug='a-cafe' \gset
select id as b_site from public.rental_sites where slug='b-cafe' \gset
insert into public.site_events (site_id,type,detail) values (:'a_site','deploy_failed','{"message":"舊錯誤"}');
insert into public.site_events (site_id,type,detail) values (:'a_site','deploy_ok','{"url":"https://a.pages.dev/"}');
insert into public.site_events (site_id,type,detail) values (:'a_site','deploy_failed','{"message":"最近一次失敗"}');
insert into public.payments (site_id,member_id,amount,months,reference,paid_on,period_from,period_to,confirmed_by)
 values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',3000,3,'12345',current_date,current_date,current_date+90,'ycaxiom@gmail.com');

\echo == S1 會員 A：讀 settings（空）→ 0；寫 settings → permission/RLS 錯誤
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) from public.settings;
insert into public.settings (key,value) values ('bank_transfer','{"bank":"x"}');
reset role;

\echo == S2 管理員寫 bank_transfer、plan；非法 key 被擋；更新只能改 value（改 key → permission denied）
select set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated","email":"ycaxiom@gmail.com","app_metadata":{"role":"admin"}}',false);
set role authenticated;
insert into public.settings (key,value) values ('bank_transfer','{"bank":"測試銀行","code":"000","account":"0000000000","holder":"測試戶名","note":""}');
insert into public.settings (key,value) values ('plan','{"text":"方案說明"}');
insert into public.settings (key,value) values ('secret_stuff','{"a":1}');
insert into public.settings (key,value) values ('bank_transfer','[1]') on conflict (key) do update set value = excluded.value;
update public.settings set value = '{"bank":"改過的銀行"}' where key='bank_transfer';
update public.settings set key = 'plan2' where key='plan';
select key, value->>'bank' as bank, updated_by from public.settings order by key;
reset role;

\echo == S3 會員 A / B 都讀得到 bank_transfer 與 plan（期望 2）；A 無法更新（UPDATE 0）
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) from public.settings;
update public.settings set value = '{"bank":"被竄改"}';
reset role;
select value->>'bank' as still from public.settings where key='bank_transfer';
-- 管理員專用的其他 key（用 postgres 臨時繞過 check 不可行；key 受 check 限制，這裡確認限制存在）
select count(*) as key_check_exists from pg_constraint where conrelid='public.settings'::regclass and contype='c';

\echo == S4 匿名：settings / payments / view 都 permission denied
set role anon;
select count(*) from public.settings;
select count(*) from public.payments;
select count(*) from public.admin_rental_overview;
reset role;

\echo == P1 payments：A 只看到自己的 1 筆；B 看到 0；A 不能新增／修改／刪除
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as a_payments, max(amount) from public.payments;
insert into public.payments (site_id,member_id,amount,months,paid_on,period_from,period_to,confirmed_by) values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',1,1,current_date,current_date,current_date,'x');
update public.payments set amount = 1;
delete from public.payments;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as b_payments from public.payments;
reset role;
select set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',false);
set role authenticated;
select count(*) as admin_payments from public.payments;
insert into public.payments (site_id,member_id,amount,months,paid_on,period_from,period_to,confirmed_by) values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',1,1,current_date,current_date,current_date,'x');
reset role;
\echo == P2 payments check：金額 0／月數 0／期間倒置 → 3 個 check 錯誤（postgres 身分）
insert into public.payments (site_id,member_id,amount,months,paid_on,period_from,period_to,confirmed_by) values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',0,1,current_date,current_date,current_date,'x');
insert into public.payments (site_id,member_id,amount,months,paid_on,period_from,period_to,confirmed_by) values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',100,0,current_date,current_date,current_date,'x');
insert into public.payments (site_id,member_id,amount,months,paid_on,period_from,period_to,confirmed_by) values (:'a_site','aaaaaaaa-0000-0000-0000-000000000001',100,1,current_date,current_date,current_date-1,'x');

\echo == T1 rental_accept_terms：A 同意自己的網站 → 回傳時間、terms_version 寫入、有 terms_accepted 事件
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select public.rental_accept_terms(:'a_site', '2026-10-draft') is not null as ok;
select terms_version, terms_accepted_at is not null as has_ts from public.rental_sites;
select count(*) as terms_events from public.site_events where type='terms_accepted';
\echo == T2 A 對 B 的網站同意 → 錯誤；版本為空／過長 → 錯誤；直接改 terms 欄位 → permission denied
select public.rental_accept_terms(:'b_site', 'v1');
select public.rental_accept_terms(:'a_site', '');
select public.rental_accept_terms(:'a_site', repeat('x', 41));
update public.rental_sites set terms_accepted_at = now();
update public.rental_sites set terms_version = 'x';
update public.rental_sites set suspended_at = now();
update public.rental_sites set suspend_reason = 'x';
update public.rental_sites set domain_status = 'active';
update public.rental_sites set go_live_notified_at = now();
update public.rental_sites set custom_domain = 'evil.com';
reset role;
\echo == T3 匿名／未同意者呼叫同意函式 → 錯誤
set role anon;
select public.rental_accept_terms(:'a_site', 'v1');
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select public.rental_accept_terms(:'a_site', 'v1');
reset role;

\echo == D1 custom_domain 與 domain_status 的 check（postgres 身分）：1 合法 OK；3 個非法被擋
update public.rental_sites set custom_domain = 'www.example.com.tw', domain_status = 'pending_dns' where id = :'a_site';
update public.rental_sites set custom_domain = 'Bad Domain' where id = :'a_site';
update public.rental_sites set custom_domain = 'nodot' where id = :'a_site';
update public.rental_sites set domain_status = 'weird' where id = :'a_site';
update public.rental_sites set custom_domain = null, domain_status = 'none' where id = :'a_site';

\echo == V1 admin_rental_overview：管理員 2 筆；A 0 筆；B 0 筆
select set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',false);
set role authenticated;
select count(*) as admin_rows from public.admin_rental_overview;
select slug, member_email, shop_name, days_left, last_deploy_type, last_deploy_message, paid_total, payment_count, status from public.admin_rental_overview order by slug;
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as a_rows from public.admin_rental_overview;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{}}',false);
set role authenticated;
select count(*) as b_rows from public.admin_rental_overview;
reset role;

\echo == V2 刪除會員 → payments 一併刪除
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select (select count(*) from public.payments) payments_left;
