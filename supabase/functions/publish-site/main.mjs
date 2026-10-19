// Supabase Edge Function（Deno）進入點：只負責接線，邏輯都在 handler.mjs。
// 需要的 Secrets（supabase secrets set …）：
//   BREVO_API_KEY            Brevo API 金鑰
//   GITHUB_DISPATCH_TOKEN    GitHub fine-grained token（只給 yc-axiom-sites 的 Actions: Read and write）
//   ADMIN_EMAIL              收通知的信箱（預設 ycaxiom@gmail.com）
//   ALLOWED_ORIGINS          逗號分隔（預設 https://chi1017.github.io）
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供。
import { handlePublish, parseOrigins } from './handler.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeBrevoSender } from '../_shared/brevo.mjs';
import { makeGetUser, makeDispatcher } from '../_shared/runtime.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const ANON = need('SUPABASE_ANON_KEY');
const GH_TOKEN = Deno.env.get('GITHUB_DISPATCH_TOKEN') || '';
const BREVO = Deno.env.get('BREVO_API_KEY') || '';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'ycaxiom@gmail.com';
const REPO = Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites';
const sendMail = makeBrevoSender({ apiKey: BREVO });
const getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: ANON });
const dispatch = makeDispatcher({ token: GH_TOKEN, repo: REPO, ref: Deno.env.get('GITHUB_REF') || 'main' });
const SITE_BASE = Deno.env.get('OFFICIAL_SITE_URL') || 'https://chi1017.github.io/yc-axiom-site/';

Deno.serve((req) => handlePublish(req, {
  allowedOrigins: parseOrigins(Deno.env.get('ALLOWED_ORIGINS')),
  previewBase: SITE_BASE + 'builder/preview/',
  adminUrl: SITE_BASE + 'admin/',
  adminEmail: ADMIN_EMAIL,
  db,
  getUser,
  sendMail,
  dispatch
}));
