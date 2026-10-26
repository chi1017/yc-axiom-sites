\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'c@x.com'), ('00000000-0000-0000-0000-0000000000d4', 'd@x.com') on conflict do nothing;
insert into public.members (id, email, consented_at) values ('00000000-0000-0000-0000-0000000000c3', 'c@x.com', now()), ('00000000-0000-0000-0000-0000000000d4', 'd@x.com', now()) on conflict do nothing;
insert into public.rental_sites (id, member_id, slug, template, palette, sections, content, status)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c3', 'msg-live', 'cafe', 'forest', '{}', '{}', 'live'),
         ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c3', 'msg-draft', 'cafe', 'forest', '{}', '{}', 'draft');
-- service role 記瀏覽
set role service_role;
select public.rental_record_hit('00000000-0000-0000-0000-00000000aaaa', '/');
select public.rental_record_hit('00000000-0000-0000-0000-00000000aaaa', '/');
select public.rental_record_hit('00000000-0000-0000-0000-00000000aaaa', '/menu/');
select public.rental_record_hit('00000000-0000-0000-0000-00000000bbbb', '/');
insert into public.site_messages (site_id, name, contact, message) values ('00000000-0000-0000-0000-00000000aaaa', '王小明', 'a@b.com', '請問有包場嗎');
reset role;
do $$ begin
  if (select views from public.site_daily_hits where site_id = '00000000-0000-0000-0000-00000000aaaa' and path = '/') = 2 then raise notice 'PASS hits counted'; else raise notice 'FAIL hits'; end if;
  if not exists (select 1 from public.site_daily_hits where site_id = '00000000-0000-0000-0000-00000000bbbb') then raise notice 'PASS draft site not counted'; else raise notice 'FAIL draft counted'; end if;
end $$;
-- 擁有者讀得到；別人讀不到；不能寫
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', false);
do $$ begin
  if (select count(*) from public.site_messages) = 1 and (select count(*) from public.site_daily_hits) = 2 then raise notice 'PASS owner reads'; else raise notice 'FAIL owner reads'; end if;
end $$;
do $$ begin insert into public.site_messages (site_id, name, contact, message) values ('00000000-0000-0000-0000-00000000aaaa', 'x', 'x', 'x'); raise notice 'FAIL owner inserted';
exception when others then raise notice 'PASS owner cannot insert'; end $$;
do $$ begin perform public.rental_record_hit('00000000-0000-0000-0000-00000000aaaa', '/x/'); raise notice 'FAIL member called record_hit';
exception when others then raise notice 'PASS member cannot record hits'; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4"}', false);
do $$ begin
  if (select count(*) from public.site_messages) = 0 and (select count(*) from public.site_daily_hits) = 0 then raise notice 'PASS others read nothing'; else raise notice 'FAIL others read'; end if;
end $$;
reset role;
set role anon;
do $$ begin perform count(*) from public.site_messages; raise notice 'FAIL anon read';
exception when others then raise notice 'PASS anon blocked'; end $$;
reset role;
