// 每月 1 日：替所有「上線中」的客戶網站做 SEO／GEO 檢測、存進 site_reports、寄月報給客戶。
// 用法（GitHub Actions）：node build/monthly-report.mjs [--site-id <uuid>] [--month YYYY-MM-01] [--dry-run] [--no-email]
// 失敗（抓不到網站、逾時、無法評分）只記錄在 site_reports（status=failed）並出現在管理員週報，不會寄信給客戶。
import { pathToFileURL } from 'node:url';
import { monthLabel, pickTopIssues, clampScore } from './lib/report.mjs';
import { taipeiDate, firstOfMonth, isDateStr } from '../supabase/functions/_shared/dates.mjs';
import { customerMonthlyReport } from '../supabase/functions/_shared/emails.mjs';

const enc = encodeURIComponent;

/**
 * deps: { db, fetchPage(url), analyze({url,html,robots,llms}), sendMail?, now?, log?, month?, siteId?, sendEmails?, dryRun?, dashboardUrl? }
 * 回傳 { month, results:[{slug, status:'ok'|'failed'|'skipped', ...}] }
 */
export async function runMonthlyReport({ db, fetchPage, analyze, sendMail, now = () => new Date(), log = console.log, month, siteId, sendEmails = true, dryRun = false, dashboardUrl = '' }) {
  const m = month || firstOfMonth(taipeiDate(now()));
  if (!isDateStr(m) || m.slice(8) !== '01') throw new Error('month 必須是該月 1 日（YYYY-MM-01）：' + m);
  const sites = await db.list('rental_sites', 'status=eq.live&select=id,member_id,slug,public_url,custom_domain,domain_status,shop_name:content->>name' + (siteId ? '&id=eq.' + siteId : '') + '&order=created_at.asc&limit=1000');
  log('月報 ' + m + '：' + sites.length + ' 個上線中的網站' + (dryRun ? '（試跑：不寫入、不寄信）' : ''));
  const results = [];

  for (const site of sites) {
    const shop = site.shop_name || site.slug;
    const event = (type, detail) => dryRun ? null : db.insert('site_events', { site_id: site.id, type, detail: { by: 'system', ...detail } }).catch(() => {});
    const res = { slug: site.slug, status: 'failed' };
    results.push(res);
    try {
      const url = site.custom_domain && site.domain_status === 'active' ? 'https://' + site.custom_domain + '/' : site.public_url;
      let row = await db.getOne('site_reports', 'site_id=eq.' + site.id + '&month=eq.' + m + '&select=*');
      if (!(row && row.status === 'ok')) {
        // ── 抓取＋檢測 ──
        let data = null, error = '';
        if (!url) error = '沒有公開網址';
        else {
          const page = await fetchPage(url);
          if (!page.ok) error = page.error;
          else {
            try {
              const a = await analyze({ url: page.finalUrl || url, html: page.html, robots: page.robots, llms: page.llms });
              const seo = clampScore(a.seo.score), geo = clampScore(a.geo.score);
              if (seo == null || geo == null) error = '無法評分（' + (seo == null ? 'SEO' : 'GEO') + '）';
              else data = { seo, geo, issues: pickTopIssues({ seoActions: a.seo.actions, geoIssues: a.geo.issues }, 3) };
            } catch (e) { error = '檢測失敗：' + String((e && e.message) || e).slice(0, 150); }
          }
        }
        const fields = data
          ? { status: 'ok', url, seo_score: data.seo, geo_score: data.geo, top_issues: data.issues, error: null }
          : { status: 'failed', url: url || null, seo_score: null, geo_score: null, top_issues: [], error: String(error).slice(0, 290) };
        if (!dryRun) {
          if (row) await db.patch('site_reports', 'id=eq.' + row.id, fields);
          else await db.insert('site_reports', { site_id: site.id, month: m, ...fields });
        }
        row = { ...(row || {}), site_id: site.id, month: m, emailed_at: row ? row.emailed_at : null, ...fields };
        if (!data) { res.error = error; log('✗ ' + site.slug + '：' + error); await event('report_failed', { month: m, error: String(error).slice(0, 200) }); continue; }
        await event('monthly_report', { month: m, seo: data.seo, geo: data.geo });
      }
      res.status = 'ok'; res.seo = row.seo_score; res.geo = row.geo_score;
      log('✓ ' + site.slug + '：SEO ' + row.seo_score + ' / GEO ' + row.geo_score);

      // ── 寄信（失敗不影響報告；同月只寄一次）──
      if (!sendEmails || !sendMail || dryRun) { res.mail = 'skipped'; continue; }
      if (row.emailed_at) { res.mail = 'already'; continue; }
      const claim = await db.patchReturning('site_reports', 'site_id=eq.' + site.id + '&month=eq.' + m + '&emailed_at=is.null', { emailed_at: now().toISOString() });
      if (!claim.length) { res.mail = 'already'; continue; }
      const member = await db.getOne('members', 'id=eq.' + enc(site.member_id) + '&select=email').catch(() => null);
      const prev = await db.getOne('site_reports', 'site_id=eq.' + site.id + '&status=eq.ok&month=lt.' + m + '&select=seo_score,geo_score&order=month.desc').catch(() => null);
      let r;
      try {
        r = member && member.email
          ? await sendMail({ to: member.email, ...customerMonthlyReport({ shopName: shop, url: row.url, monthLabel: monthLabel(m), seo: row.seo_score, geo: row.geo_score, prevSeo: prev ? prev.seo_score : null, prevGeo: prev ? prev.geo_score : null, issues: row.top_issues || [], dashboardUrl }) })
          : { ok: false, error: '找不到客戶 Email' };
      } catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
      if (r && r.ok) { res.mail = 'sent'; await event('email_sent', { template: 'customerMonthlyReport', month: m }); }
      else {
        res.mail = 'failed';
        await db.patchReturning('site_reports', 'site_id=eq.' + site.id + '&month=eq.' + m, { emailed_at: null }).catch(() => {});   // 放掉，下次手動重跑會再寄
        await event('email_failed', { template: 'customerMonthlyReport', month: m, error: String((r && r.error) || 'unknown').slice(0, 200) });
        log('  寄信失敗：' + site.slug);
      }
    } catch (e) {
      res.status = 'failed'; res.error = String((e && e.message) || e).slice(0, 200);
      log('✗ ' + site.slug + '：' + res.error);
    }
  }
  const okN = results.filter((r) => r.status === 'ok').length;
  log('完成：成功 ' + okN + '、失敗 ' + (results.length - okN) + '、寄出 ' + results.filter((r) => r.mail === 'sent').length + ' 封');
  return { month: m, results };
}

// ───────────────────────── CLI ─────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { makeSupabase } = await import('./lib/supabase.mjs');
  const { makeFetchPage } = await import('./lib/fetchsite.mjs');
  const { makeAnalyzers } = await import('./lib/analyzers.mjs');
  const { makeBrevoSender } = await import('../supabase/functions/_shared/brevo.mjs');
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : ''; };
  const flag = (k) => process.argv.includes('--' + k);
  const need = (k) => { const v = process.env[k]; if (!v) { console.error('缺少環境變數 ' + k); process.exit(1); } return v; };
  if (arg('site-id') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg('site-id'))) { console.error('site-id 格式不正確'); process.exit(1); }
  const db = makeSupabase({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') });
  const analyzers = await makeAnalyzers({ seoTool: need('SEO_TOOL'), geoEngine: need('GEO_ENGINE'), chromePath: process.env.CHROME });
  try {
    const out = await runMonthlyReport({
      db, fetchPage: makeFetchPage(), analyze: analyzers.analyze,
      sendMail: makeBrevoSender({ apiKey: process.env.BREVO_API_KEY || '' }),
      siteId: arg('site-id') || undefined, month: arg('month') || undefined, dryRun: flag('dry-run'), sendEmails: !flag('no-email'),
      dashboardUrl: (process.env.OFFICIAL_SITE_URL || 'https://yc-axiom.pages.dev/') + 'dashboard/'
    });
    const failed = out.results.filter((r) => r.status === 'failed');
    if (failed.length) console.log('::warning::' + failed.length + ' 個網站月報失敗：' + failed.map((f) => f.slug).join('、'));
  } finally { await analyzers.close(); }
}
