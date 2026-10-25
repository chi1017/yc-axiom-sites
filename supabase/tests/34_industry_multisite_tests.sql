-- 012 測試：行業可改、多網站上限
\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a@x.com'), ('00000000-0000-0000-0000-0000000000b2', 'b@x.com');
insert into public.members (id, email, consented_at) values ('00000000-0000-0000-0000-0000000000a1', 'a@x.com', now()), ('00000000-0000-0000-0000-0000000000b2', 'b@x.com', now());
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ declare i int; begin
  for i in 1..5 loop
    insert into public.rental_sites (member_id, slug, template, palette, sections, content)
      values (auth.uid(), 'shop-test-' || i, 'cafe', 'forest', '{}', '{}');
  end loop;
  raise notice 'PASS five sites allowed';
end $$;
do $$ begin
  insert into public.rental_sites (member_id, slug, template, palette, sections, content) values (auth.uid(), 'shop-test-6', 'cafe', 'forest', '{}', '{}');
  raise notice 'FAIL sixth site was allowed';
exception when others then raise notice 'PASS sixth site blocked: %', sqlerrm; end $$;
do $$ begin
  update public.rental_sites set template = 'salon' where slug = 'shop-test-1';
  if (select template from public.rental_sites where slug = 'shop-test-1') = 'salon' then raise notice 'PASS template updated'; else raise notice 'FAIL template not updated'; end if;
end $$;
do $$ begin
  update public.rental_sites set template = 'BAD KEY' where slug = 'shop-test-1';
  raise notice 'FAIL bad template accepted';
exception when others then raise notice 'PASS bad template rejected'; end $$;
do $$ begin
  update public.rental_sites set status = 'live' where slug = 'shop-test-1';
  raise notice 'FAIL member changed status';
exception when others then raise notice 'PASS status still protected'; end $$;
-- 別人的網站改不到
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', false);
do $$ declare n int; begin
  update public.rental_sites set template = 'bar' where slug = 'shop-test-2';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASS other member cannot change template'; else raise notice 'FAIL other member changed template'; end if;
end $$;
reset role;
-- 終止的網站不算在上限內
update public.rental_sites set status = 'cancelled' where slug = 'shop-test-5';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
do $$ begin
  insert into public.rental_sites (member_id, slug, template, palette, sections, content) values (auth.uid(), 'shop-test-7', 'cafe', 'forest', '{}', '{}');
  raise notice 'PASS cancelled site not counted';
exception when others then raise notice 'FAIL: %', sqlerrm; end $$;
reset role;
