// GitHub Actions 進入點：node build/build-site.mjs --site-id <uuid> [--version-id <uuid>] [--mode normal|maintenance|closed] [--no-deploy]
import { spawn } from 'node:child_process';
import { makeSupabase } from './lib/supabase.mjs';
import { makeCloudflare } from './lib/cloudflare.mjs';
import { runBuild } from './run.mjs';
import { makeBrevoSender } from '../supabase/functions/_shared/brevo.mjs';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : ''; };
const need = (k) => { if (!process.env[k]) { console.error('缺少環境變數 ' + k); process.exit(2); } return process.env[k]; };
const siteId = arg('site-id');
if (!/^[0-9a-f-]{36}$/i.test(siteId)) { console.error('--site-id 格式不正確'); process.exit(2); }
const versionId = arg('version-id');
if (versionId && !/^[0-9a-f-]{36}$/i.test(versionId)) { console.error('--version-id 格式不正確'); process.exit(2); }

const mode = arg('mode') || 'normal';
if (!['normal', 'maintenance', 'closed'].includes(mode)) { console.error('--mode 只能是 normal、maintenance 或 closed'); process.exit(2); }

const db = makeSupabase({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
const cf = makeCloudflare({ token: need('CLOUDFLARE_API_TOKEN'), accountId: need('CLOUDFLARE_ACCOUNT_ID') });

function wrangler({ dir, project }) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', 'pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('wrangler 結束代碼 ' + c))));
  });
}
const deploy = process.argv.includes('--no-deploy') ? async () => console.log('（--no-deploy：略過上傳）') : wrangler;

// BREVO_API_KEY 選用：沒設定時只是不寄「網站已上線」通知信，部署照常進行
const sendMail = process.env.BREVO_API_KEY ? makeBrevoSender({ apiKey: process.env.BREVO_API_KEY }) : undefined;
const publicApi = process.env.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/site-public';
const r = await runBuild({ siteId, versionId, mode, outDir: 'dist', db, cf, deploy, sendMail, publicApi });
process.exit(r.ok ? 0 : 1);
