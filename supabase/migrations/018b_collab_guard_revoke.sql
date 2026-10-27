-- 018b：觸發器函式不需要讓任何人直接呼叫。
revoke all on function public.rental_collab_guard() from public, anon, authenticated;
