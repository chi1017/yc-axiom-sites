// Supabase Edge Function（Deno）進入點：客戶網站的聯絡表單與瀏覽計數（不需登入，部署時關閉 JWT 驗證）。邏輯在 handler.mjs。
// 使用既有的 Secrets：BREVO_API_KEY（寄留言通知與收據）、GITHUB_DISPATCH_TOKEN（付款後自動上線）。綠界正式金鑰見 member-site/main.mjs。選用：HIT_SALT（瀏覽者 IP 雜湊用的鹽，沒設定時用預設值）。
import { handlePublic } from './handler.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeBrevoSender } from '../_shared/brevo.mjs';
import { makeDispatcher } from '../_shared/runtime.mjs';
import { ecpayConfig } from '../_shared/ecpay.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const db = makeSupabase({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const sendMail = makeBrevoSender({ apiKey: Deno.env.get('BREVO_API_KEY') || '' });
const salt = Deno.env.get('HIT_SALT') || 'yc-site-public';

const dispatch = makeDispatcher({ token: Deno.env.get('GITHUB_DISPATCH_TOKEN') || '', repo: Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites', ref: Deno.env.get('GITHUB_REF') || 'main' });
const ecpay = ecpayConfig({ ECPAY_ENV: Deno.env.get('ECPAY_ENV'), ECPAY_MERCHANT_ID: Deno.env.get('ECPAY_MERCHANT_ID'), ECPAY_HASH_KEY: Deno.env.get('ECPAY_HASH_KEY'), ECPAY_HASH_IV: Deno.env.get('ECPAY_HASH_IV') });

Deno.serve((req) => handlePublic(req, { db, sendMail, salt, dispatch, ecpay }));
