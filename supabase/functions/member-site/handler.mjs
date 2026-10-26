// 會員自己管理網站的 Edge Function：目前提供自訂網域（設定、檢查、移除）。
// 只有網站擁有者能呼叫；網域邏輯與管理後台共用（_shared/domain.mjs）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { domainAction } from '../_shared/domain.mjs';
export { parseOrigins };

const ACTIONS = ['set_domain', 'check_domain', 'clear_domain'];

/** deps: { allowedOrigins, getUser, db, dispatch, cf? } */
export async function handleMember(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed', message: '不支援的請求方式' }, 405);
  const origin = req.headers.get('origin') || '';
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: 'forbidden_origin', message: '來源不被允許' }, 403);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: 'unauthorized', message: '請先登入' }, 401);

  let body;
  try { const t = await req.text(); if (t.length > 2000) throw new Error('too big'); body = JSON.parse(t); } catch { return reply({ error: 'bad_request', message: '請求格式不正確' }, 400); }
  if (!body || typeof body !== 'object' || !ACTIONS.includes(body.action)) return reply({ error: 'bad_request', message: '不支援的動作' }, 400);
  if (typeof body.site_id !== 'string' || !UUID.test(body.site_id)) return reply({ error: 'bad_request', message: '缺少網站編號' }, 400);

  const { db } = deps;
  const siteId = body.site_id;
  const site = await db.getOne('rental_sites', 'id=eq.' + siteId + '&member_id=eq.' + user.id + '&select=*');
  if (!site) return reply({ error: 'not_found', message: '找不到這個網站' }, 404);
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  if (body.action === 'set_domain' && !['live', 'overdue'].includes(site.status)) return fail('not_allowed', '網站上線後才能綁定自己的網域', 409);
  const by = 'member:' + (user.email || user.id);
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {});
  async function queueDeploy({ versionId } = {}) {
    const d = await deps.dispatch({ siteId, versionId }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), ...(versionId ? { version_id: versionId } : {}) });
    return d;
  }
  return domainAction(body.action, { site, siteId, body, db, cf: deps.cf, event, queueDeploy, reply, fail, audience: 'member' });
}
