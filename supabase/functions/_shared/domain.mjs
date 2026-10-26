// 自訂網域：設定、檢查、移除（管理後台 admin-site 與會員 member-site 共用同一份邏輯）。
// ctx: { site, siteId, body, db, cf?, event(type, detail), queueDeploy({versionId}), reply(body, status), fail(code, msg, status), audience: 'admin'|'member' }
export function normalizeDomain(v) {
  let s = String(v == null ? '' : v).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return '';
  if (/(^|\.)pages\.dev$/.test(s) || /(^|\.)workers\.dev$/.test(s)) return '';
  return s;
}
const DEFAULT_WARN = 'Actions 沒有啟動成功，請稍後再試一次（或請管理員重新發佈）。';

export async function domainAction(action, ctx) {
  const { site, siteId, body, db, cf, event, queueDeploy, reply, fail, audience = 'admin' } = ctx;
  const deployWarn = ctx.deployWarn || DEFAULT_WARN;
  const notReady = audience === 'admin' ? '尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）' : '網域功能暫時無法使用，請聯絡我們';
  switch (action) {
    case 'set_domain': {
      if (!cf) return fail('cf_not_configured', notReady, 501);
      const domain = normalizeDomain(body.domain);
      if (!domain) return fail('bad_request', '網域格式不正確（例如 www.example.com；不接受 pages.dev）');
      if (!site.cf_project_name) return fail('not_deployed', audience === 'admin' ? '網站還沒有部署過，請先確認收款上線後再綁網域' : '網站上線後才能綁定自己的網域', 409);
      if (['draft', 'cancelled'].includes(site.status)) return fail('not_allowed', '這個狀態的網站不能綁網域', 409);
      const used = await db.getOne('rental_sites', 'custom_domain=eq.' + encodeURIComponent(domain) + '&id=neq.' + siteId + '&select=id');
      if (used) return fail('domain_in_use', '這個網域已經綁在別的網站上', 409);
      let r;
      try { r = await cf.addDomain(site.cf_project_name, domain); } catch (e) { await event('domain_failed', { domain, message: String(e.message || e).slice(0, 200) }); return fail('cloudflare_error', '新增網域失敗：' + String(e.message || e).slice(0, 200), 502); }
      const active = r.status === 'active';
      // 換網域：舊的從 Cloudflare 移掉（失敗不影響）
      if (site.custom_domain && site.custom_domain !== domain) await cf.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {});
      await db.patch('rental_sites', 'id=eq.' + siteId, { custom_domain: domain, domain_status: active ? 'active' : 'pending_dns' });
      await event('domain_set', { domain, cf_status: r.status });
      let warning = '';
      if (active && ['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      return reply({ ok: true, domain, domain_status: active ? 'active' : 'pending_dns', cname_target: r.target, ...(warning ? { warning } : {}),
        message: active ? '網域已生效。' : (audience === 'admin' ? '請客戶（或網域管理者）' : '請到你買網域的地方（或請網域管理者）') + '到網域的 DNS 設定新增一筆 CNAME：名稱 ' + domain + ' → ' + r.target + '。設定後等幾分鐘到數小時，再按「檢查網域」。' }, 200);
    }

    case 'check_domain': {
      if (!cf) return fail('cf_not_configured', notReady, 501);
      if (!site.custom_domain || !site.cf_project_name) return fail('no_domain', '這個網站還沒有設定自訂網域', 409);
      let r;
      try { r = await cf.getDomain(site.cf_project_name, site.custom_domain); } catch (e) { return fail('cloudflare_error', '查詢網域失敗：' + String(e.message || e).slice(0, 200), 502); }
      if (!r) return fail('domain_missing', 'Cloudflare 上找不到這個網域，請重新設定網域', 409);
      if (r.status !== 'active') {
        await event('domain_checked', { domain: site.custom_domain, cf_status: r.status });
        return reply({ ok: true, domain_status: 'pending_dns', cf_status: r.status, message: '網域尚未生效（Cloudflare 狀態：' + r.status + '）' + (r.error ? '：' + r.error : '') + '。DNS 設定後可能要等幾分鐘到數小時。' }, 200);
      }
      let warning = '';
      if (site.domain_status !== 'active') {
        await db.patch('rental_sites', 'id=eq.' + siteId, { domain_status: 'active' });
        await event('domain_active', { domain: site.custom_domain });
        if (['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      }
      return reply({ ok: true, domain_status: 'active', cf_status: r.status, ...(warning ? { warning } : {}), message: '網域已生效，網站正在以新網域重新發佈（約 1–2 分鐘）。' }, 200);
    }

    case 'clear_domain': {
      if (!site.custom_domain) return fail('no_domain', '這個網站沒有自訂網域', 409);
      if (cf && site.cf_project_name) { try { await cf.removeDomain(site.cf_project_name, site.custom_domain); } catch (e) { return fail('cloudflare_error', '移除網域失敗：' + String(e.message || e).slice(0, 200), 502); } }
      await db.patch('rental_sites', 'id=eq.' + siteId, { custom_domain: null, domain_status: 'none' });
      await event('domain_cleared', { domain: site.custom_domain });
      let warning = '';
      if (['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      return reply({ ok: true, domain_status: 'none', ...(warning ? { warning } : {}), message: '已移除自訂網域，網站改回 pages.dev 網址並重新發佈。' }, 200);
    }
  }
  return fail('bad_request', '不支援的動作');
}
