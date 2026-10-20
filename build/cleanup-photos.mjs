// 清理 Storage（site-photos）裡「沒有任何網站草稿或版本引用」的舊照片（第一階段遺留：會員換照片後，舊檔案不會自動刪）。
// 安全規則（全部都要滿足才會刪，任何一項不確定就什麼都不刪）：
//   1. 只處理 <網站編號>/hero-xxx.* 或 room-xxx.* 這種由編輯器產生的檔名，其他檔案一律不碰
//   2. 任何網站的草稿（rental_sites.content）或任何歷史版本（site_versions.content）有引用到，就保留
//   3. 建立不到 30 天的檔案保留（可能是剛上傳、還沒存進草稿）
//   4. 查詢結果可疑（有網站卻查不到任何引用、或要刪的超過總數一半）就中止，交給人工確認
//   5. 每次最多刪 200 個；預設只列出清單（--apply 才真的刪）
// 用法：node build/cleanup-photos.mjs [--apply] [--grace-days 30] [--max 200]
import { pathToFileURL } from 'node:url';

const BUCKET = 'site-photos';
const NAME_OK = /^(hero|room)-[a-z0-9]+\.(webp|jpe?g|png)$/;
const REF = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^"\\\s]+/g;

async function pageAll(db, table, select, order) {
  const out = [];
  for (let off = 0; ; off += 100) {
    const rows = await db.list(table, 'select=' + select + '&order=' + order + '&limit=100&offset=' + off);
    out.push(...rows);
    if (rows.length < 100) return out;
  }
}
async function listAll(db, prefix) {
  const out = [];
  for (let off = 0; ; off += 100) {
    const rows = await db.storageList(BUCKET, prefix, { offset: off, limit: 100 });
    out.push(...rows);
    if (rows.length < 100) return out;
  }
}

export async function runCleanup({ db, now = () => new Date(), apply = false, graceDays = 30, maxDelete = 200, log = console.log }) {
  const refs = new Set();
  const sites = await pageAll(db, 'rental_sites', 'id,content', 'id.asc');
  const versions = await pageAll(db, 'site_versions', 'id,content', 'id.asc');
  for (const row of [...sites, ...versions]) for (const m of JSON.stringify(row.content || {}).matchAll(REF)) refs.add(m[0]);
  if (sites.length > 0 && refs.size === 0) { log('中止：有 ' + sites.length + ' 個網站，卻查不到任何照片引用，結果可疑，什麼都不刪。'); return { aborted: 'no_refs', deleted: [], candidates: [] }; }

  const folders = (await listAll(db, '')).filter((o) => o.id == null && o.name);
  const objects = [];
  for (const f of folders) for (const o of await listAll(db, f.name)) if (o.id != null) objects.push({ path: f.name + '/' + o.name, name: o.name, folder: f.name, created: o.created_at || (o.metadata && o.metadata.lastModified) || null });
  const cutoff = now().getTime() - graceDays * 86400000;
  const candidates = objects.filter((o) => NAME_OK.test(o.name) && !refs.has(o.path) && o.created && new Date(o.created).getTime() < cutoff);
  log('Storage 共 ' + objects.length + ' 個照片檔，被引用 ' + objects.filter((o) => refs.has(o.path)).length + ' 個，可清理 ' + candidates.length + ' 個（建立超過 ' + graceDays + ' 天且沒有任何網站草稿／版本引用）。');
  if (objects.length > 10 && candidates.length > objects.length / 2) { log('中止：要清理的超過總數一半，結果可疑，請人工確認後再執行。'); return { aborted: 'too_many', deleted: [], candidates: candidates.map((c) => c.path) }; }
  const batch = candidates.slice(0, maxDelete);
  if (candidates.length > batch.length) log('本次最多處理 ' + maxDelete + ' 個，其餘留給下次。');
  batch.forEach((c) => log((apply ? '刪除 ' : '將刪除 ') + c.path + '（' + String(c.created).slice(0, 10) + '）'));
  if (!apply || !batch.length) return { deleted: [], candidates: batch.map((c) => c.path) };

  const deleted = [];
  for (let i = 0; i < batch.length; i += 50) {
    const part = batch.slice(i, i + 50).map((c) => c.path);
    await db.storageRemove(BUCKET, part);
    deleted.push(...part);
  }
  // 有對應網站的，在事件時間軸留一筆紀錄
  const siteIds = new Set(sites.map((s) => s.id)), perSite = {};
  deleted.forEach((p) => { const id = p.split('/')[0]; perSite[id] = (perSite[id] || 0) + 1; });
  for (const [id, n] of Object.entries(perSite)) if (siteIds.has(id)) await db.insert('site_events', { site_id: id, type: 'photos_cleaned', detail: { by: 'system', count: n } }).catch(() => {});
  log('已刪除 ' + deleted.length + ' 個沒有被引用的舊照片。');
  return { deleted, candidates: batch.map((c) => c.path) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { makeSupabase } = await import('./lib/supabase.mjs');
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const need = (k) => { const v = process.env[k]; if (!v) { console.error('缺少環境變數 ' + k); process.exit(1); } return v; };
  const db = makeSupabase({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
  const r = await runCleanup({ db, apply: process.argv.includes('--apply'), graceDays: Number(arg('grace-days', 30)), maxDelete: Number(arg('max', 200)) });
  if (r.aborted) console.log('::warning::照片清理中止（' + r.aborted + '），沒有刪除任何檔案');
}
