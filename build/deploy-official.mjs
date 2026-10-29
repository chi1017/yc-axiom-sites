// 部署官網到 Cloudflare Pages（專案名稱由環境變數 PROJECT 指定，預設 yc-axiom）。用法：node build/deploy-official.mjs <資料夾>
import { spawnSync } from 'node:child_process';
import { makeCloudflare } from './lib/cloudflare.mjs';

const dir = process.argv[2];
if (!dir) { console.log('::error::缺少要部署的資料夾'); process.exit(1); }
const cf = makeCloudflare({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID });
const project = await cf.ensureProject(process.env.PROJECT || 'yc-axiom');
const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', dir, '--project-name', project.name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
if (p.status !== 0) process.exit(1);
console.log('::notice::官網：https://' + project.subdomain + '/');
