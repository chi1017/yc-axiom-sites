-- 008：放寬 palette 檢查，支援更多內建配色與自訂主色（c-RRGGBB-l / c-RRGGBB-d）
-- 內建配色名稱由程式端（templates/shared/palettes.js）驗證，之後新增配色不必再改資料庫。
alter table public.rental_sites drop constraint if exists rental_sites_palette_check;
alter table public.rental_sites add constraint rental_sites_palette_check
  check (palette ~ '^[a-z]{2,16}$' or palette ~ '^c-[0-9a-f]{6}-[ld]$');
