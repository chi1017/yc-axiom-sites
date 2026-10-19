// 建置與部署流程。所有對外 I/O（Supabase、Cloudflare、wrangler）都由參數注入，方便測試。
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSite, imagePlan } from '../templates/shared/site.js';
import { normalizeContent, normalizePalette, normalizeSections } from '../templates/shared/content.js';
import { validateForPublish } from '../templates/shared/validate.js';
import { sniffImage, MAX_IMAGE_BYTES } from './lib/images.mjs';

const BUCKET = 'site-photos';
const DEPLOYABLE = ['live', 'overdue'];

export const HEADERS_FILE = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/images/*
  Cache-Control: public, max-age=3600
`;

export async function runBuild({ siteId, versionId, outDir, db, cf, deploy, log = console.log, now = () => new Date() }) {
  const t0 = Date.now();
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail }).catch((e) => log('event 寫入失敗：' + e.message));
  try {
    const site = await db.getOne('rental_sites', 'id=eq.' + encodeURIComponent(siteId) + '&select=*');
    if (!site) throw new Error('找不到網站 ' + siteId);
    if (!DEPLOYABLE.includes(site.status)) throw new Error('網站狀態是 ' + site.status + '，不會部署（只有 live／overdue 會部署）');
    const vid = versionId || site.live_version_id;
    if (!vid) throw new Error('這個網站還沒有指定上線版本（live_version_id）');
    const ver = await db.getOne('site_versions', 'id=eq.' + encodeURIComponent(vid) + '&site_id=eq.' + encodeURIComponent(siteId) + '&select=*');
    if (!ver) throw new Error('找不到版本 ' + vid);

    const content = normalizeContent(ver.content), palette = normalizePalette(ver.palette), sections = normalizeSections(ver.sections);
    const check = validateForPublish(content, sections, site.slug);
    if (!check.ok) throw new Error('內容未通過檢查：' + check.errors.map((e) => e.msg).join('、'));

    const project = await cf.ensureProject(site.cf_project_name || site.slug);
    const siteUrl = 'https://' + project.subdomain + '/';
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
    return { ok: true, url: siteUrl };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).replace(/(Bearer\s+)[\w.\-]+/gi, '$1***').slice(0, 500);
    await event('deploy_failed', { message: msg, version_id: versionId || null });
    log('部署失敗：' + msg);
    return { ok: false, error: msg };
  }
}
