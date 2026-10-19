// Supabase Edge Function（Deno）進入點：只負責接線，邏輯都在 handler.mjs。
// 需要的 Secrets（Edge Functions → Secrets）：
//   GITHUB_DISPATCH_TOKEN    觸發部署（與 publish-site 共用同一個）
//   BREVO_API_KEY            寄「已收到款項」收據給客戶
//   ALLOWED_ORIGINS          逗號分隔（預設 https://chi1017.github.io）
//   CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID   綁定客戶網域用（沒設定時，只有網域功能不能用）
//   選用：GITHUB_REPO（預設 chi1017/yc-axiom-sites）、GITHUB_REF（預設 main；驗收尚未合併的分支時暫時指到該分支）
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供。
import { handleAdmin } from './handler.mjs';
import { parseOrigins } from '../_shared/http.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeCloudflare } from '../../../build/lib/cloudflare.mjs';
import { makeBrevoSender } from '../_shared/brevo.mjs';
import { makeGetUser, makeDispatcher } from '../_shared/runtime.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need('SUPABASE_ANON_KEY') });
const sendMail = makeBrevoSender({ apiKey: Deno.env.get('BREVO_API_KEY') || '' });
const dispatch = makeDispatcher({ token: Deno.env.get('GITHUB_DISPATCH_TOKEN') || '', repo: Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites', ref: Deno.env.get('GITHUB_REF') || 'main' });
const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') || '', CF_ACCOUNT = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : undefined;

Deno.serve((req) => handleAdmin(req, { allowedOrigins: parseOrigins(Deno.env.get('ALLOWED_ORIGINS')), db, getUser, sendMail, dispatch, cf }));
