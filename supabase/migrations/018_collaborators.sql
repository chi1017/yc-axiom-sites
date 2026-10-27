-- 018：多人協作（進階方案）。擁有者用 Email 邀請；被邀請的人登入後接受，就能編輯內容、上傳照片、發佈、處理預約。
-- 收款設定、網域、刪除網站、邀請成員、改網址代稱／行業／版型仍只有擁有者能做。只新增資料表、函式與「額外的」權限規則，原有規則不變。可重複執行。

create table if not exists public.site_members (
  site_id      uuid not null references public.rental_sites (id) on delete cascade,
  email        text not null check (email = lower(email) and char_length(email) between 3 and 120),
  member_id    uuid references public.members (id) on delete set null,
  role         text not null default 'editor' check (role in ('editor')),
  status       text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (site_id, email)
);
create index if not exists site_members_member_idx on public.site_members (member_id) where status = 'active';
create index if not exists site_members_email_idx on public.site_members (email) where status = 'invited';

-- 目前登入的人是不是這個網站的協作者（進階方案、已接受）。security definer：給權限規則用，避免規則互相查詢造成遞迴
create or replace function public.rental_is_collab(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_members m join public.rental_sites s on s.id = m.site_id
                  where m.site_id = p_site and m.member_id = auth.uid() and m.status = 'active' and s.tier = 'pro');
$$;
create or replace function public.rental_is_owner(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rental_sites s where s.id = p_site and s.member_id = auth.uid());
$$;
-- 儲存空間用：資料夾名稱（文字）不一定是合法的 uuid，所以用文字比對，不做型別轉換
create or replace function public.rental_is_collab_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_members m join public.rental_sites s on s.id = m.site_id
                  where s.id::text = p_folder and m.member_id = auth.uid() and m.status = 'active' and s.tier = 'pro');
$$;
revoke all on function public.rental_is_collab(uuid), public.rental_is_owner(uuid), public.rental_is_collab_folder(text) from public, anon;
grant execute on function public.rental_is_collab(uuid), public.rental_is_owner(uuid), public.rental_is_collab_folder(text) to authenticated;

alter table public.site_members enable row level security;
revoke all on public.site_members from anon, authenticated;
grant select on public.site_members to authenticated;
grant select, insert, update on public.site_members to service_role;
drop policy if exists site_members_select_owner on public.site_members;
drop policy if exists site_members_select_self on public.site_members;
drop policy if exists site_members_select_admin on public.site_members;
create policy site_members_select_owner on public.site_members for select to authenticated using (public.rental_is_owner(site_id));
create policy site_members_select_self on public.site_members for select to authenticated using (member_id = auth.uid());
create policy site_members_select_admin on public.site_members for select to authenticated using (public.is_admin());

-- 協作者：讀寫網站內容（欄位權限沿用原本給會員的 update 欄位），讀版本、事件、留言與預約、程式碼審核結果
drop policy if exists rental_sites_select_collab on public.rental_sites;
drop policy if exists rental_sites_update_collab on public.rental_sites;
create policy rental_sites_select_collab on public.rental_sites for select to authenticated using (public.rental_is_collab(id));
create policy rental_sites_update_collab on public.rental_sites for update to authenticated using (public.rental_is_collab(id)) with check (public.rental_is_collab(id));

-- 協作者不能改網址代稱、行業、版型（只有擁有者能改）
create or replace function public.rental_collab_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.member_id and not public.is_admin() then
    if new.slug is distinct from old.slug or new.template is distinct from old.template or new.layout is distinct from old.layout or new.member_id is distinct from old.member_id then
      raise exception '協作者不能修改網址代稱、行業或版型';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_sites_collab_guard on public.rental_sites;
create trigger rental_sites_collab_guard before update on public.rental_sites for each row execute function public.rental_collab_guard();

drop policy if exists site_versions_select_collab on public.site_versions;
create policy site_versions_select_collab on public.site_versions for select to authenticated using (public.rental_is_collab(site_id));
drop policy if exists site_events_select_collab on public.site_events;
create policy site_events_select_collab on public.site_events for select to authenticated using (public.rental_is_collab(site_id));
drop policy if exists site_messages_select_collab on public.site_messages;
create policy site_messages_select_collab on public.site_messages for select to authenticated using (public.rental_is_collab(site_id));
drop policy if exists site_code_reviews_select_collab on public.site_code_reviews;
create policy site_code_reviews_select_collab on public.site_code_reviews for select to authenticated using (public.rental_is_collab(site_id));

-- 照片與字型：協作者可以上傳、替換、刪除該網站資料夾裡的檔案
drop policy if exists site_photos_select_collab on storage.objects;
drop policy if exists site_photos_insert_collab on storage.objects;
drop policy if exists site_photos_update_collab on storage.objects;
drop policy if exists site_photos_delete_collab on storage.objects;
create policy site_photos_select_collab on storage.objects for select to authenticated
  using (bucket_id in ('site-photos', 'site-fonts') and public.rental_is_collab_folder((storage.foldername(name))[1]));
create policy site_photos_insert_collab on storage.objects for insert to authenticated
  with check (bucket_id in ('site-photos', 'site-fonts') and public.rental_is_collab_folder((storage.foldername(name))[1]));
create policy site_photos_update_collab on storage.objects for update to authenticated
  using (bucket_id in ('site-photos', 'site-fonts') and public.rental_is_collab_folder((storage.foldername(name))[1]))
  with check (bucket_id in ('site-photos', 'site-fonts') and public.rental_is_collab_folder((storage.foldername(name))[1]));
create policy site_photos_delete_collab on storage.objects for delete to authenticated
  using (bucket_id in ('site-photos', 'site-fonts') and public.rental_is_collab_folder((storage.foldername(name))[1]));
