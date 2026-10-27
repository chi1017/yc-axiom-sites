// 入帳：寫收款紀錄、延長到期日、更新狀態（待上線→上線、暫停→恢復）、需要時部署、寄收據。
// 管理員「確認收款」（admin-site）與綠界自動通知（site-public）共用同一份邏輯。
import { customerReceipt } from './emails.mjs';
import { addMonths } from './dates.mjs';

export async function applyPayment({ db, site, siteId, amount, months, method, reference = '', paidOn, by, today, event, queueDeploy, sendMail, deployWarn = '' }) {
  if (!['pending', 'live', 'overdue', 'suspended'].includes(site.status)) return { ok: false, error: 'not_allowed', status: 409, message: site.status === 'draft' ? '客戶還沒有送出上線申請' : '這個網站已終止服務，無法收款' };
  const latestVersion = async () => (await db.list('site_versions', 'site_id=eq.' + siteId + '&select=id&order=created_at.desc&limit=1'))[0] || null;
  let deployVersionId = null;
  if (site.status === 'pending') {
    const v = await latestVersion();
    if (!v) return { ok: false, error: 'no_version', status: 409, message: '這個網站沒有可上線的版本' };
    deployVersionId = v.id;
  }
  const from = site.paid_until && site.paid_until > today ? site.paid_until : today;
  const to = addMonths(from, months);
  const pay = await db.insertReturning('payments', { site_id: siteId, member_id: site.member_id, amount, months, method, reference: reference || null, paid_on: paidOn, period_from: from, period_to: to, confirmed_by: by });
  if (!pay) return { ok: false, error: 'server_error', status: 500, message: '寫入收款紀錄失敗，請稍後再試' };

  const newStatus = to >= today ? 'live' : 'overdue';
  const patch = { paid_until: to };
  let needDeploy = false;
  // 續約時套用客戶申請的降級（多頁 → 一頁、取消進階功能）；內容保留，網站重新部署
  const downgraded = [];
  if (site.status !== 'pending' && site.next_layout === 'single' && site.layout === 'multi') {
    const pg = site.pages || {};
    Object.assign(patch, { layout: 'single', next_layout: null, sections: { ...(site.sections || {}), ...Object.fromEntries(['menu', 'interior', 'faq', 'news'].filter((k) => typeof pg[k] === 'boolean').map((k) => [k, pg[k]])) } });
    downgraded.push('layout');
  }
  if (site.status !== 'pending' && site.next_tier === 'basic' && site.tier === 'pro') { Object.assign(patch, { tier: 'basic', next_tier: null }); downgraded.push('tier'); }
  if (downgraded.length && ['live', 'overdue'].includes(site.status)) { needDeploy = true; deployVersionId = site.live_version_id || (await latestVersion() || {}).id || null; }
  if (site.status !== newStatus) patch.status = newStatus;
  if (site.status === 'suspended') { patch.suspended_at = null; patch.suspend_reason = null; needDeploy = true; deployVersionId = site.live_version_id || (await latestVersion() || {}).id || null; }
  if (site.status === 'pending') needDeploy = true;
  try { await db.patch('rental_sites', 'id=eq.' + siteId, patch); } catch (e) {
    await event('payment_confirmed', { payment_id: pay.id, amount, months, period_to: to, method, warning: '收款已記錄，但更新網站狀態失敗' });
    return { ok: false, error: 'server_error', status: 500, message: '收款已記錄，但更新網站狀態失敗。請在詳情頁檢查狀態與到期日。' };
  }
  const statusFrom = site.status;
  Object.assign(site, patch);
  await event('payment_confirmed', { payment_id: pay.id, amount, months, ...(method !== 'bank_transfer' ? { method } : {}), period_from: from, period_to: to, status_from: statusFrom, status_to: site.status });
  if (downgraded.length) await event('plan_downgraded', { layout: downgraded.includes('layout') ? 'single' : undefined, tier: downgraded.includes('tier') ? 'basic' : undefined });

  let warning = '';
  if (needDeploy) {
    if (!deployVersionId) warning = '找不到可部署的版本，請請客戶按一次發佈。';
    else { const d = await queueDeploy({ versionId: deployVersionId }); if (!d.ok) warning = deployWarn; }
  }
  // 收據信：失敗只記錄，不影響收款
  const member = await db.getOne('members', 'id=eq.' + site.member_id + '&select=email').catch(() => null);
  if (member && member.email && sendMail) {
    const mail = customerReceipt({ shopName: (site.content && site.content.name) || site.slug, amount, months, paidOn, periodTo: to, reference });
    const r = await sendMail({ to: member.email, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? 'email_sent' : 'email_failed', { template: 'customerReceipt', ...(r.ok ? {} : { error: String(r.error || '').slice(0, 200) }) });
  }
  return { ok: true, status: patch.status || site.status, paidUntil: to, deploying: needDeploy && !warning, warning, paymentId: pay.id };
}
