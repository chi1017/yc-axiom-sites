-- 016：店家用自己的綠界帳號在網站上收款（線上購買、預約訂金）。可重複執行。
-- 金鑰只由 Edge Function（service role）讀寫，而且加密存放；會員只能看到模式與特店編號。

create table if not exists public.site_pay_settings (
  site_id      uuid primary key references public.rental_sites (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  mode         text not null default 'off' check (mode in ('off', 'test', 'live')),
  merchant_id  text check (merchant_id ~ '^[0-9]{7,10}$'),
  key_enc      text check (char_length(key_enc) <= 200),
  iv_enc       text check (char_length(iv_enc) <= 200),
  updated_at   timestamptz not null default now()
);
alter table public.site_pay_settings enable row level security;
revoke all on public.site_pay_settings from anon, authenticated;
grant select (site_id, member_id, mode, merchant_id, updated_at) on public.site_pay_settings to authenticated;
grant select, insert, update on public.site_pay_settings to service_role;
drop policy if exists site_pay_settings_select_own on public.site_pay_settings;
drop policy if exists site_pay_settings_select_admin on public.site_pay_settings;
create policy site_pay_settings_select_own on public.site_pay_settings for select to authenticated using (member_id = auth.uid());
create policy site_pay_settings_select_admin on public.site_pay_settings for select to authenticated using (public.is_admin());

-- 訪客的訂單（購物車、預約訂金）。建立與付款狀態都由 Edge Function 寫入。
create table if not exists public.shop_orders (
  trade_no      text primary key check (trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  site_id       uuid not null references public.rental_sites (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  kind          text not null check (kind in ('cart', 'deposit')),
  items         jsonb not null default '[]'::jsonb check (pg_column_size(items) <= 8000),
  amount        integer not null check (amount > 0 and amount <= 1000000),
  buyer         jsonb not null default '{}'::jsonb check (pg_column_size(buyer) <= 4000),
  status        text not null default 'created' check (status in ('created', 'awaiting', 'paid', 'failed')),
  test          boolean not null default false,
  pay_info      jsonb,
  booking_id    uuid references public.site_messages (id) on delete set null,
  ip_hash       text,
  paid_at       timestamptz,
  fulfilled_at  timestamptz,
  last_notify   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists shop_orders_site_idx on public.shop_orders (site_id, created_at desc);
create index if not exists shop_orders_ip_idx on public.shop_orders (ip_hash, created_at desc);

alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon, authenticated;
grant select on public.shop_orders to authenticated;
grant select, insert, update on public.shop_orders to service_role;
drop policy if exists shop_orders_select_own on public.shop_orders;
drop policy if exists shop_orders_select_admin on public.shop_orders;
create policy shop_orders_select_own on public.shop_orders for select to authenticated using (member_id = auth.uid());
create policy shop_orders_select_admin on public.shop_orders for select to authenticated using (public.is_admin());
