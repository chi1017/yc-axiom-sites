// Supabase Edge Function（Deno）進入點：會員自己綁定網域。邏輯在 handler.mjs。
// 使用既有的 Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID、GITHUB_DISPATCH_TOKEN、ALLOWED_ORIGINS（與 admin-site 相同）。
// 線上付款（綠界正式環境）：ECPAY_ENV=prod、ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV（由 ALAN 自己在 Supabase Secrets 設定）
import { handleMember } from './handler.mjs';
import { parseOrigins } from '../_shared/http.mjs';
import { makeSupabase } from '../../../build/lib/supabase.mjs';
import { makeCloudflare } from '../../../build/lib/cloudflare.mjs';
import { makeGetUser, makeDispatcher } from '../_shared/runtime.mjs';
import { ecpayConfig } from '../_shared/ecpay.mjs';

const need = (k) => { const v = Deno.env.get(k); if (!v) throw new Error('missing secret ' + k); return v; };
const SUPABASE_URL = need('SUPABASE_URL');
const db = makeSupabase({ url: SUPABASE_URL, serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need('SUPABASE_ANON_KEY') });
const dispatch = makeDispatcher({ token: Deno.env.get('GITHUB_DISPATCH_TOKEN') || '', repo: Deno.env.get('GITHUB_REPO') || 'chi1017/yc-axiom-sites', ref: Deno.env.get('GITHUB_REF') || 'main' });
const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') || '', CF_ACCOUNT = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
const cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : undefined;

// 綠界：ECPAY_ENV=prod 且三個金鑰都設定時用正式環境，否則是測試環境（只有管理員能測）
const ecpay = ecpayConfig({ ECPAY_ENV: Deno.env.get('ECPAY_ENV'), ECPAY_MERCHANT_ID: Deno.env.get('ECPAY_MERCHANT_ID'), ECPAY_HASH_KEY: Deno.env.get('ECPAY_HASH_KEY'), ECPAY_HASH_IV: Deno.env.get('ECPAY_HASH_IV') });
const SITE_BASE = Deno.env.get('OFFICIAL_SITE_URL') || 'https://chi1017.github.io/yc-axiom-site/';
Deno.serve((req) => handleMember(req, { allowedOrigins: parseOrigins(Deno.env.get('ALLOWED_ORIGINS')), db, getUser, dispatch, cf, ecpay,
  publicApi: SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/site-public', dashboardUrl: SITE_BASE + 'dashboard/' }));
