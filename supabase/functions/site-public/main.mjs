// Supabase Edge Function（Deno）進入點：客戶網站的聯絡表單、預約、線上購買與瀏覽計數（不需登入，部署時關閉 JWT 驗證）。邏輯在 handler.mjs。
// 使用既有的 Secrets：BREVO_API_KEY（寄通知信）。選用：HIT_SALT（瀏覽者 IP 雜湊用的鹽）、PAY_SECRET（加密店家綠界金鑰用；沒設定時由 service role key 導出，兩個函式要一致）。
import { handlePublic } from './handler.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeBrevoSender } from '../_shared/brevo.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL'), SERVICE = need('SUPABASE_SERVICE_ROLE_KEY');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: SERVICE });
const sendMail = makeBrevoSender({ apiKey: Deno.env.get('BREVO_API_KEY') || '' });
const salt = Deno.env.get('HIT_SALT') || 'yc-site-public';
const paySecret = Deno.env.get('PAY_SECRET') || SERVICE;

Deno.serve((req) => handlePublic(req, { db, sendMail, salt, paySecret, publicApi: SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/site-public' }));
