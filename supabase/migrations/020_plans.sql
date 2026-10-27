-- 020：方案。加購進階功能（補差額後開通）、下一期改方案（續約時才生效的降級）。只新增欄位。可重複執行。
alter table public.rental_sites add column if not exists pro_pending boolean not null default false;
alter table public.rental_sites add column if not exists pro_amount integer check (pro_amount is null or (pro_amount >= 0 and pro_amount <= 1000000));
alter table public.rental_sites add column if not exists pro_requested_at timestamptz;
alter table public.rental_sites add column if not exists next_layout text check (next_layout is null or next_layout = 'single');
alter table public.rental_sites add column if not exists next_tier text check (next_tier is null or next_tier = 'basic');
