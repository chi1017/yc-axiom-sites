// 客戶網站對外的 Edge Function（不需登入）：
//   POST …/site-public/contact  聯絡表單（一般 HTML 表單送出，不需要 JavaScript）→ 存進 site_messages、寄信給店家 → 導回網站的感謝頁
//   POST …/site-public/hit      瀏覽計數（網站用 sendBeacon 送出）→ 每日每頁的次數，不記錄個人資料
import { UUID } from '../_shared/http.mjs';

export const LIMITS = { name: 60, contact: 120, message: 2000, perIpHour: 5, perSiteDay: 100 };
const LIVE = ['live', 'overdue'];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|curl|wget|python|node-fetch/i;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 網站目前的正式網址（自訂網域生效時用自訂網域）。只會導回這個網址，避免被拿來當跳板。
export function siteBase(site) {
  if (site.custom_domain && site.domain_status === 'active') return 'https://' + site.custom_domain + '/';
  const u = String(site.public_url || '');
  return /^https:\/\/[a-z0-9.-]+\/?$/i.test(u) ? u.replace(/\/?$/, '/') : '';
}
const page = (title, text, back) => new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + '</title>' +
  '<body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,\'Noto Sans TC\',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">' + esc(title) + '</h1><p>' + esc(text) + '</p>' +
  (back ? '<p><a href="' + esc(back) + '">回到網站</a></p>' : '<p><a href="javascript:history.back()">回上一頁</a></p>') + '</body></html>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export function shopMessageEmail({ shopName, name, contact, message, base }) {
  const subject = '「' + shopName + '」網站留言：' + name;
  const text = shopName + ' 你好，\n\n有人透過網站的聯絡表單留言給你：\n\n姓名：' + name + '\n聯絡方式：' + contact + '\n\n' + message + '\n\n' +
    (EMAIL.test(contact) ? '直接回覆這封信，就會寄給對方。\n' : '請用對方留下的聯絡方式回覆。\n') + '所有留言也可以在會員專區查看。\n\n網站：' + base;
  const html = '<p>' + esc(shopName) + ' 你好，</p><p>有人透過網站的聯絡表單留言給你：</p>' +
    '<table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc(contact) + '</td></tr></table>' +
    '<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc(message) + '</p>' +
    '<p style="color:#777;font-size:14px">' + (EMAIL.test(contact) ? '直接回覆這封信，就會寄給對方。' : '請用對方留下的聯絡方式回覆。') + '所有留言也可以在會員專區查看。</p>';
  return { subject, text, html };
}

/** deps: { db: { getOne, insert, count, rpc, patch }, sendMail, now?, salt? } */
export async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' } });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (route === 'hit') return hit(req, deps);
  if (route === 'contact') return contact(req, deps);
  return new Response('not found', { status: 404 });
}

async function hit(req, deps) {
  const ok = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (BOT.test(req.headers.get('user-agent') || '')) return ok;
  let b;
  try { const t = await req.text(); if (t.length > 500) return ok; b = JSON.parse(t); } catch { return ok; }
  if (!b || typeof b.s !== 'string' || !UUID.test(b.s)) return ok;
  let path = String(b.p || '/').split('?')[0].split('#')[0];
  if (!/^\/[a-z0-9/_-]{0,118}$/i.test(path)) path = '/other';
  await deps.db.rpc('rental_record_hit', { p_site: b.s, p_path: path }).catch(() => {});
  return ok;
}

async function contact(req, deps) {
  let f;
  try { const t = await req.text(); if (t.length > 12000) return page('留言太長', '請縮短內容後再送出。'); f = new URLSearchParams(t); } catch { return page('送出失敗', '請稍後再試一次。'); }
  const siteId = f.get('site') || '';
  if (!UUID.test(siteId)) return page('送出失敗', '表單資料不完整，請重新整理網頁後再試。');
  const site = await deps.db.getOne('rental_sites', 'id=eq.' + siteId + '&select=id,member_id,status,public_url,custom_domain,domain_status,content');
  if (!site || !LIVE.includes(site.status)) return page('送出失敗', '這個網站目前無法接收留言。');
  const base = siteBase(site);
  const thanks = base ? base + 'thanks/' : '';
  // 機器人陷阱：看不見的欄位有值就當作已送出（不告訴機器人被擋）
  if (f.get('website')) return thanks ? Response.redirect(thanks, 303) : page('已送出', '謝謝你的留言。');
  const name = clean(f.get('name'), LIMITS.name), contactV = clean(f.get('contact'), LIMITS.contact), message = clean(f.get('message'), LIMITS.message);
  if (!name || !contactV || !message) return page('還有欄位沒填', '請填寫姓名、聯絡方式與留言內容。');
  if ((message.match(/https?:\/\//gi) || []).length > 2) return page('送出失敗', '留言裡的網址太多，請刪減後再送出。');

  const now = (deps.now || (() => new Date()))();
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = ip ? (await sha256((deps.salt || '') + '|' + now.toISOString().slice(0, 10) + '|' + ip)).slice(0, 32) : null;
  const hourAgo = new Date(now.getTime() - 3600 * 1000).toISOString(), dayAgo = new Date(now.getTime() - 86400 * 1000).toISOString();
  if (ipHash && (await deps.db.count('site_messages', 'ip_hash=eq.' + ipHash + '&created_at=gte.' + encodeURIComponent(hourAgo))) >= LIMITS.perIpHour) return page('送出太頻繁', '請稍後再試，或直接用電話、LINE 聯絡店家。', base);
  if ((await deps.db.count('site_messages', 'site_id=eq.' + siteId + '&created_at=gte.' + encodeURIComponent(dayAgo))) >= LIMITS.perSiteDay) return page('暫時無法留言', '今天的留言已經很多了，請改用電話或 LINE 聯絡店家。', base);

  const row = await deps.db.insertReturning('site_messages', { site_id: siteId, name, contact: contactV, message, ip_hash: ipHash });
  const owner = await deps.db.getOne('members', 'id=eq.' + site.member_id + '&select=email');
  if (owner && owner.email && deps.sendMail) {
    const shopName = (site.content && site.content.name) || '你的網站';
    const m = shopMessageEmail({ shopName, name, contact: contactV, message, base });
    const r = await deps.sendMail({ to: owner.email, ...m, ...(EMAIL.test(contactV) ? { replyTo: contactV } : {}) }).catch(() => ({ ok: false }));
    if (r && r.ok && row && row.id) await deps.db.patch('site_messages', 'id=eq.' + row.id, { emailed: true }).catch(() => {});
  }
  return thanks ? Response.redirect(thanks, 303) : page('已送出', '謝謝你的留言，店家會盡快回覆你。');
}
