// 建置與部署流程。所有對外 I/O（Supabase、Cloudflare、wrangler）都由參數注入，方便測試。
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSite, imagePlan } from '../templates/shared/site.js';
import { normalizeContent, normalizePalette, normalizeSections } from '../templates/shared/content.js';
import { validateForPublish } from '../templates/shared/validate.js';
import { sniffImage, MAX_IMAGE_BYTES } from './lib/images.mjs';
import { buildMaintenancePage } from '../templates/shared/maintenance.js';
import { buildClosedPage } from '../templates/shared/closed.js';
import { customerGoLive } from '../supabase/functions/_shared/emails.mjs';

const BUCKET = 'site-photos';
const DEPLOYABLE = ['live', 'overdue'];   // 一般建置只允許這兩種；維護模式只允許 suspended
const MODES = ['normal', 'maintenance', 'closed'];

export const HEADERS_FILE = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/images/*
  Cache-Control: public, max-age=3600
`;

// mode: 'normal'（部署客戶網站）｜'maintenance'（部署「維護中」頁，僅限 suspended）｜'closed'（部署「已停止服務」頁，僅限 cancelled）
// sendMail?: ({to,subject,html,text}) → {ok,error?}  部署成功後寄「網站已上線」信；失敗只記錄，絕不影響部署結果
export async function runBuild({ siteId, versionId, mode = 'normal', outDir, db, cf, deploy, sendMail, log = console.log, now = () => new Date() }) {
  const t0 = Date.now();
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail }).catch((e) => log('event 寫入失敗：' + e.message));
  try {
    if (!MODES.includes(mode)) throw new Error('不支援的建置模式：' + mode);
    const site = await db.getOne('rental_sites', 'id=eq.' + encodeURIComponent(siteId) + '&select=*');
    if (!site) throw new Error('找不到網站 ' + siteId);
    if (mode === 'closed') return await runClosed({ site, outDir, db, cf, deploy, event, log, t0, now });
    if (mode === 'maintenance') return await runMaintenance({ site, outDir, db, cf, deploy, event, log, t0, now });
    if (!DEPLOYABLE.includes(site.status)) throw new Error('網站狀態是 ' + site.status + '，不會部署（只有 live／overdue 會部署）');
    const vid = versionId || site.live_version_id;
    if (!vid) throw new Error('這個網站還沒有指定上線版本（live_version_id）');
    const ver = await db.getOne('site_versions', 'id=eq.' + encodeURIComponent(vid) + '&site_id=eq.' + encodeURIComponent(siteId) + '&select=*');
    if (!ver) throw new Error('找不到版本 ' + vid);

    const content = normalizeContent(ver.content), palette = normalizePalette(ver.palette), sections = normalizeSections(ver.sections);
    const check = validateForPublish(content, sections, site.slug);
    if (!check.ok) throw new Error('內容未通過檢查：' + check.errors.map((e) => e.msg).join('、'));

    const project = await cf.ensureProject(site.cf_project_name || site.slug);
    // 自訂網域已生效（domain_status=active）時，canonical／sitemap／JSON-LD 都改用自訂網域
    const useCustom = site.custom_domain && site.domain_status === 'active';
    const siteUrl = 'https://' + (useCustom ? site.custom_domain : project.subdomain) + '/';
    log('Cloudflare 專案：' + project.name + (project.created ? '（新建立）' : '') + ' → ' + siteUrl);

    const built = buildSite({ template: site.template, content, palette, sections, siteUrl, lastmod: now().toISOString().slice(0, 10) });
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const [f, c] of Object.entries(built.files)) writeFileSync(join(outDir, f), c);
    writeFileSync(join(outDir, '_headers'), HEADERS_FILE);

    for (const img of imagePlan(content)) {
      const buf = await db.download(BUCKET, img.path);
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('圖片太大：' + img.role);
      if (!sniffImage(buf)) throw new Error('圖片格式不正確：' + img.role);
      const dest = join(outDir, img.file);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
    }

    await deploy({ dir: outDir, project: project.name });

    const ts = now().toISOString();
    await db.patch('rental_sites', 'id=eq.' + encodeURIComponent(siteId), {
      cf_project_name: project.name, public_url: siteUrl, live_version_id: vid, last_published_at: ts,
      ...(site.first_published_at ? {} : { first_published_at: ts })
    });
    await event('deploy_ok', { url: siteUrl, version_id: vid, seconds: Math.round((Date.now() - t0) / 1000) });
    log('部署完成：' + siteUrl);
    await notifyGoLive({ site, content, siteUrl, db, sendMail, event, log, now });
    return { ok: true, url: siteUrl };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).replace(/(Bearer\s+)[\w.\-]+/gi, '$1***').slice(0, 500);
    await event('deploy_failed', { message: msg, version_id: versionId || null, ...(mode !== 'normal' ? { mode } : {}) });
    log('部署失敗：' + msg);
    return { ok: false, error: msg };
  }
}

// 第一次成功上線 → 寄信給客戶（只寄一次，以 go_live_notified_at 判斷）。任何錯誤都吞掉並記錄。
async function notifyGoLive({ site, content, siteUrl, db, sendMail, event, log, now }) {
  if (!sendMail || site.go_live_notified_at) return;
  try {
    const member = await db.getOne('members', 'id=eq.' + encodeURIComponent(site.member_id) + '&select=email');
    if (!member || !member.email) { await event('email_failed', { template: 'customerGoLive', error: '找不到客戶 Email' }); return; }
    const mail = customerGoLive({ shopName: content.name || site.slug, url: siteUrl });
    const r = await sendMail({ to: member.email, ...mail });
    if (r && r.ok) {
      await db.patch('rental_sites', 'id=eq.' + encodeURIComponent(site.id), { go_live_notified_at: now().toISOString() });
      await event('email_sent', { template: 'customerGoLive' });
    } else {
      await event('email_failed', { template: 'customerGoLive', error: String((r && r.error) || 'unknown').slice(0, 200) });
    }
  } catch (e) {
    log('上線通知信失敗（不影響部署）：' + e.message);
    await event('email_failed', { template: 'customerGoLive', error: String(e.message || e).slice(0, 200) });
  }
}

// 維護模式：把「網站維護中」頁部署到同一個專案（網址不變）。不動 live_version_id，恢復時才能回到原版本。
async function runMaintenance({ site, outDir, db, cf, deploy, event, log, t0, now }) {
  if (site.status !== 'suspended') throw new Error('網站狀態是 ' + site.status + '，維護頁只會部署在 suspended 的網站');
  if (!site.cf_project_name) {
    await event('deploy_ok', { mode: 'maintenance', skipped: '尚未部署過，沒有需要換成維護頁的網站' });
    log('尚未部署過，略過維護頁');
    return { ok: true, skipped: true };
  }
  const project = await cf.ensureProject(site.cf_project_name);
  const shopName = (site.content && site.content.name) || '';
  const page = buildMaintenancePage({ shopName });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [f, c] of Object.entries(page.files)) writeFileSync(join(outDir, f), c);
  writeFileSync(join(outDir, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
  await deploy({ dir: outDir, project: project.name });
  await db.patch('rental_sites', 'id=eq.' + encodeURIComponent(site.id), { last_published_at: now().toISOString() });
  await event('deploy_ok', { mode: 'maintenance', url: site.public_url || null, seconds: Math.round((Date.now() - t0) / 1000) });
  log('維護頁已部署：' + project.name);
  return { ok: true, maintenance: true };
}

// 終止模式：把「網站已停止服務」頁部署到同一個專案（網址不變）。不動 live_version_id，復原租用時才能回到原版本。
async function runClosed({ site, outDir, db, cf, deploy, event, log, t0, now }) {
  if (site.status !== 'cancelled') throw new Error('網站狀態是 ' + site.status + '，停止服務頁只會部署在 cancelled 的網站');
  if (!site.cf_project_name) {
    await event('deploy_ok', { mode: 'closed', skipped: '尚未部署過，沒有需要換成停止服務頁的網站' });
    log('尚未部署過，略過停止服務頁');
    return { ok: true, skipped: true };
  }
  const project = await cf.ensureProject(site.cf_project_name);
  const shopName = (site.content && site.content.name) || '';
  const page = buildClosedPage({ shopName });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [f, c] of Object.entries(page.files)) writeFileSync(join(outDir, f), c);
  writeFileSync(join(outDir, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
  await deploy({ dir: outDir, project: project.name });
  await db.patch('rental_sites', 'id=eq.' + encodeURIComponent(site.id), { last_published_at: now().toISOString() });
  await event('deploy_ok', { mode: 'closed', url: site.public_url || null, seconds: Math.round((Date.now() - t0) / 1000) });
  log('停止服務頁已部署：' + project.name);
  return { ok: true, closed: true };
}
