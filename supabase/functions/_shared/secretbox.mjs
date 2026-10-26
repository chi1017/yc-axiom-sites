// 店家綠界金鑰（HashKey／HashIV）加密存放：AES-GCM，金鑰由伺服器端的祕密（PAY_SECRET，沒有時用 service role key）導出。
// 資料庫裡只有密文；瀏覽器永遠拿不到明文（會員專區只顯示「已設定」）。Node 20 與 Deno 都有 WebCrypto。
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(secret) {
  if (!secret) throw new Error('secretbox: missing secret');
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('yc-axiom-site-pay'), info: te.encode('ecpay-keys-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), te.encode(String(plain))));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}

export async function open(box, secret) {
  const m = /^v1\.([A-Za-z0-9+/=]+)\.([A-Za-z0-9+/=]+)$/.exec(String(box || ''));
  if (!m) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m[1]) }, await keyFrom(secret), unb64(m[2]));
    return td.decode(pt);
  } catch { return null; }
}
