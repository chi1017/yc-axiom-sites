// GitHub Actions 進入點：node build/build-site.mjs --site-id <uuid> [--version-id <uuid>] [--no-deploy]
import { spawn } from 'node:child_process';
import { makeSupabase } from './lib/supabase.mjs';
import { makeCloudflare } from './lib/cloudflare.mjs';
import { runBuild } from './run.mjs';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : ''; };
const need = (k) => { if (!process.env[k]) { console.error('缺少環境變數 ' + k); process.exit(2); } return process.env[k]; };
const siteId = arg('site-id');
if (!/^[0-9a-f-]{36}$/i.test(siteId)) { console.error('--site-id 格式不正確'); process.exit(2); }
const versionId = arg('version-id');
if (versionId && !/^[0-9a-f-]{36}$/i.test(versionId)) { console.error('--version-id 格式不正確'); process.exit(2); }

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

const r = await runBuild({ siteId, versionId, outDir: 'dist', db, cf, deploy });
process.exit(r.ok ? 0 : 1);
