-- 015：線上付款（綠界）。付款訂單 pay_orders；收款紀錄 payments 增加付款方式。可重複執行。

-- 收款方式：原本只有銀行轉帳（人工確認），加上信用卡、信用卡定期定額、ATM 虛擬帳號（綠界自動通知）
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('bank_transfer', 'credit', 'credit_recurring', 'atm'));

-- 付款訂單：會員按「付款」時建立，綠界通知付款成功後由系統自動入帳
create table if not exists public.pay_orders (
  trade_no       text primary key check (trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  site_id        uuid not null references public.rental_sites (id) on delete cascade,
  member_id      uuid not null references public.members (id) on delete cascade,
  kind           text not null check (kind in ('card', 'card_monthly', 'atm')),
  months         integer not null check (months between 1 and 60),
  amount         integer not null check (amount > 0 and amount <= 10000000),
  status         text not null default 'created' check (status in ('created', 'atm_issued', 'paid', 'active', 'failed', 'cancelled')),
  success_times  integer not null default 0,           -- 定期定額已成功扣款次數（避免重複入帳）
  atm            jsonb,                                -- ATM：銀行代碼、虛擬帳號、繳費期限
  test           boolean not null default false,       -- 綠界測試環境的訂單
  last_notify    jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pay_orders_site_idx on public.pay_orders (site_id, created_at desc);

alter table public.pay_orders enable row level security;
revoke all on public.pay_orders from anon, authenticated;
grant select on public.pay_orders to authenticated;
grant select, insert, update on public.pay_orders to service_role;
drop policy if exists pay_orders_select_own on public.pay_orders;
drop policy if exists pay_orders_select_admin on public.pay_orders;
create policy pay_orders_select_own on public.pay_orders for select to authenticated using (member_id = auth.uid());
create policy pay_orders_select_admin on public.pay_orders for select to authenticated using (public.is_admin());
