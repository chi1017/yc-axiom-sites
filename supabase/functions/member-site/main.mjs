// Supabase Edge Function（Deno）進入點：會員自己綁定網域。邏輯在 handler.mjs。
// 使用既有的 Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、GITHUB_DISPATCH_TOKEN、ALLOWED_ORIGINS（與 admin-site 相同）。
// 店家綠界金鑰加密：PAY_SECRET（選用；沒設定時由 service role key 導出，必須和 site-public 一致）
import { handleMember } from './handler.mjs';
import { parseOrigins } from '../_shared/http.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeCloudflare } from '../../../build/lib/cloudflare.mjs';
import { makeGetUser, makeDispatcher } from '../_shared/runtime.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE = need('SUPABASE_SERVICE_ROLE_KEY');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: SERVICE });
const getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need('SUPABASE_ANON_KEY') });
const dispatch = makeDispatcher({ token: Deno.env.get('GITHUB_DISPATCH_TOKEN') || '', repo: Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites', ref: Deno.env.get('GITHUB_REF') || 'main' });
const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') || '', CF_ACCOUNT = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : undefined;

Deno.serve((req) => handleMember(req, { allowedOrigins: parseOrigins(Deno.env.get('ALLOWED_ORIGINS')), db, getUser, dispatch, cf, paySecret: Deno.env.get('PAY_SECRET') || SERVICE }));
