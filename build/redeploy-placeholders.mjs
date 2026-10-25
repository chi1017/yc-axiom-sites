// 重新部署所有「維護中」與「已停止服務」頁（換掉舊版頁面上的內容，例如平台聯絡方式）。
// GitHub Actions 進入點：node build/redeploy-placeholders.mjs [--dry-run]
//   suspended → mode=maintenance；cancelled → mode=closed；只處理部署過（有 cf_project_name）的網站。
//   --dry-run：只列出名單，不部署。
// 另外會列出網址代稱帶平台品牌字樣的網站（只查詢、不改資料），方便上線 009 前確認。
// 這個 repo 是公開的，Actions log 任何人都看得到：只輸出 site_id／代稱／狀態，不輸出店名或 email。
import { spawn } from 'node:child_process';
import { makeSupabase } from './lib/supabase.mjs';

const need = (k) => { if (!process.env[k]) { console.error('缺少環境變數 ' + k); process.exit(2); } return process.env[k]; };
const dryRun = process.argv.includes('--dry-run');
const db = makeSupabase({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
// ::notice:: 會變成 check run 的 annotation，不用下載 log 也能從 API 讀到結果
const notice = (msg) => console.log('::notice::' + msg);

const brand = await db.list('rental_sites', 'select=id,slug,status&slug=match.' + encodeURIComponent('(^|-)yc(-|$)|ycaxiom') + '&order=slug');
notice('品牌代稱網站 ' + brand.length + ' 個' + (brand.length ? '：' + brand.map((s) => s.slug + '(' + s.status + ')').join(', ') : ''));

const sites = await db.list('rental_sites', 'select=id,slug,status&status=in.(suspended,cancelled)&cf_project_name=not.is.null&order=status,slug');
const MODE = { suspended: 'maintenance', cancelled: 'closed' };
notice((dryRun ? '[dry-run] ' : '') + '需要重新部署 ' + sites.length + ' 個' + (sites.length ? '：' + sites.map((s) => s.slug + '→' + MODE[s.status] + ' ' + s.id).join(', ') : ''));
if (dryRun || !sites.length) process.exit(0);

function buildOne(site) {
  return new Promise((resolve) => {
    const p = spawn('node', ['build/build-site.mjs', '--site-id', site.id, '--mode', MODE[site.status]], { stdio: 'inherit', env: process.env });
    p.on('error', () => resolve(false));
    p.on('exit', (c) => resolve(c === 0));
  });
}
const failed = [];
for (const s of sites) {
  console.log('── ' + s.slug + '（' + s.status + ' → ' + MODE[s.status] + '）');
  if (!(await buildOne(s))) failed.push(s);
}
notice('完成：成功 ' + (sites.length - failed.length) + '、失敗 ' + failed.length + (failed.length ? '（' + failed.map((s) => s.slug).join(', ') + '）' : ''));
process.exit(failed.length ? 1 : 0);
