// Supabase Edge Function（Deno）進入點：只負責接線，邏輯都在 handler.mjs。
// 部署時 Verify JWT 要「關閉」（pg_cron 用 x-cron-secret 驗證；管理員用登入 JWT，函式內自己檢查 role）。
// 需要的 Secrets（Edge Functions → Secrets）：
//   CRON_SECRET              排程密碼（與 SQL 裡 Vault 存的同一組）
//   BREVO_API_KEY            寄信
//   GITHUB_DISPATCH_TOKEN    自動暫停時部署維護頁（與 publish-site／admin-site 共用同一個）
//   ADMIN_EMAIL              收通知的信箱（預設 ycaxiom@gmail.com）
//   ALLOWED_ORIGINS          逗號分隔（預設 https://chi1017.github.io）
//   選用：GITHUB_REPO（預設 chi1017/yc-axiom-sites）、GITHUB_REF（預設 main）、OFFICIAL_SITE_URL
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供。
import { handleCron, parseOrigins } from './handler.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeBrevoSender } from '../_shared/brevo.mjs';
import { makeGetUser, makeDispatcher } from '../_shared/runtime.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need('SUPABASE_ANON_KEY') });
const sendMail = makeBrevoSender({ apiKey: Deno.env.get('BREVO_API_KEY') || '' });
const dispatch = makeDispatcher({ token: Deno.env.get('GITHUB_DISPATCH_TOKEN') || '', repo: Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites', ref: Deno.env.get('GITHUB_REF') || 'main' });
const SITE_BASE = Deno.env.get('OFFICIAL_SITE_URL') || 'https://yc-axiom.pages.dev/';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';   // 沒設定時，排程密碼驗證一律失敗（只剩管理員能呼叫）

Deno.serve((req) => handleCron(req, {
  allowedOrigins: parseOrigins(Deno.env.get('ALLOWED_ORIGINS')),
  cronSecret: CRON_SECRET,
  adminEmail: Deno.env.get('ADMIN_EMAIL') || 'ycaxiom@gmail.com',
  dashboardUrl: SITE_BASE + 'dashboard/',
  adminUrl: SITE_BASE + 'admin/',
  db, getUser, sendMail, dispatch
}));
