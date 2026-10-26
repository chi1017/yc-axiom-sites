-- 014：網站留言加上類型（一般留言／預約申請）與預約資料。可重複執行。
alter table public.site_messages add column if not exists kind text not null default 'message';
alter table public.site_messages add column if not exists meta jsonb;
do $$ begin
  alter table public.site_messages add constraint site_messages_kind_ok check (kind in ('message', 'booking'));
exception when duplicate_object then null; end $$;
