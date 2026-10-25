-- 011：開放所有行業（通用版型）
-- rental_sites.template 存行業 key（templates/shared/industries.js）。原本只允許 'cafe'；
-- 改成只檢查格式，實際有沒有這個行業由程式驗證（發佈時不認得的行業會被擋下），以後新增行業不必改資料庫。
-- 格式與 industries.js 的 INDUSTRY_KEY_RE 一致（tests 會比對）。可以重複執行，既有網站不受影響。
alter table public.rental_sites drop constraint if exists rental_sites_template_check;
alter table public.rental_sites add constraint rental_sites_template_check check (template ~ '^[a-z][a-z-]{1,23}$');
