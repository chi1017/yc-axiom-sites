// 自訂程式碼（嵌入 HTML 區塊、全站程式碼）與進階方案功能的開關。
// 規則：只有進階方案（tier='pro'）能用；程式碼要管理員核准（以內容雜湊比對）才會放進正式網站，沒核准前網站照常更新、只是不含程式碼。
// 編輯器、Edge Function、建置腳本共用同一份。
export const TIERS = ['basic', 'pro'];
export const TIER_LABELS = { basic: '一般方案', pro: '進階方案' };
export const isPro = (tier) => tier === 'pro';

// 會放進正式網站的程式碼（隱藏的區塊、空的區塊不算）
export function customCode(c) {
  const blocks = (c.blocks || []).filter((b) => b.kind === 'html' && !b.hidden && b.html).map((b) => ({ id: b.id, html: b.html }));
  const head = (c.code && c.code.head) || '', body = (c.code && c.code.body) || '';
  return { head, body, blocks };
}
export function hasCustomCode(c) { const x = customCode(c); return !!(x.head || x.body || x.blocks.length); }

// 程式碼內容的 SHA-256（十六進位 64 字）。Node 20 與 Deno 都有 WebCrypto
export async function codeHash(c) {
  const data = new TextEncoder().encode(JSON.stringify(customCode(c)));
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 依方案與審核結果，回傳正式網站實際使用的內容（不改動傳入的物件）
// codeApproved：這份程式碼已核准；tier 不是 pro 時，程式碼與預約行事曆都不會出現
export function effectiveContent(c, { tier = 'basic', codeApproved = false } = {}) {
  const pro = isPro(tier);
  const keepCode = pro && codeApproved;
  if (keepCode && (pro || !c.bookingCal.enabled)) return c;
  return {
    ...c,
    code: keepCode ? c.code : { head: '', body: '' },
    blocks: keepCode ? c.blocks : c.blocks.filter((b) => b.kind !== 'html'),
    order: keepCode ? c.order : c.order.filter((k) => !(k.startsWith('b:') && (c.blocks.find((b) => 'b:' + b.id === k) || {}).kind === 'html')),
    bookingCal: pro ? c.bookingCal : { ...c.bookingCal, enabled: false }
  };
}
