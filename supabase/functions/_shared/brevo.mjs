// Brevo 寄信封裝（Edge Function 與 GitHub Actions 共用）。寄件人固定為 ycaxiom@gmail.com，Reply-To 同一個信箱。
// 沒有 API key 或寄送失敗都回傳 { ok:false }，不丟錯——信件失敗不可以擋住發佈／部署。
export const SENDER = { name: 'YC AXIOM 網站租用', email: 'ycaxiom@gmail.com' };

export function makeBrevoSender({ apiKey, fetchImpl = fetch, timeoutMs = 10000 }) {
  return async function sendMail(m) {
    if (!apiKey) return { ok: false, error: 'BREVO_API_KEY 未設定' };
    if (!m || !m.to) return { ok: false, error: '沒有收件人' };
    try {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: SENDER, replyTo: { email: SENDER.email }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: 'brevo ' + res.status + ' ' + String(await res.text()).slice(0, 200) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
  };
}
