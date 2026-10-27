// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/member-site/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function corsHeaders(req, allowed) {
  const origin = req.headers.get("origin") || "";
  const h = { Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Max-Age": "86400" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function parseOrigins(v) {
  return (v || "https://chi1017.github.io").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}
var json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

// supabase/functions/_shared/domain.mjs
function normalizeDomain(v) {
  let s = String(v == null ? "" : v).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return "";
  if (/(^|\.)pages\.dev$/.test(s) || /(^|\.)workers\.dev$/.test(s)) return "";
  return s;
}
var DEFAULT_WARN = "Actions 沒有啟動成功，請稍後再試一次（或請管理員重新發佈）。";
async function domainAction(action, ctx) {
  const { site, siteId, body, db: db2, cf: cf2, event, queueDeploy, reply, fail, audience = "admin" } = ctx;
  const deployWarn = ctx.deployWarn || DEFAULT_WARN;
  const notReady = audience === "admin" ? "尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）" : "網域功能暫時無法使用，請聯絡我們";
  switch (action) {
    case "set_domain": {
      if (!cf2) return fail("cf_not_configured", notReady, 501);
      const domain = normalizeDomain(body.domain);
      if (!domain) return fail("bad_request", "網域格式不正確（例如 www.example.com；不接受 pages.dev）");
      if (!site.cf_project_name) return fail("not_deployed", audience === "admin" ? "網站還沒有部署過，請先確認收款上線後再綁網域" : "網站上線後才能綁定自己的網域", 409);
      if (["draft", "cancelled"].includes(site.status)) return fail("not_allowed", "這個狀態的網站不能綁網域", 409);
      const used = await db2.getOne("rental_sites", "custom_domain=eq." + encodeURIComponent(domain) + "&id=neq." + siteId + "&select=id");
      if (used) return fail("domain_in_use", "這個網域已經綁在別的網站上", 409);
      let r;
      try {
        r = await cf2.addDomain(site.cf_project_name, domain);
      } catch (e) {
        await event("domain_failed", { domain, message: String(e.message || e).slice(0, 200) });
        return fail("cloudflare_error", "新增網域失敗：" + String(e.message || e).slice(0, 200), 502);
      }
      const active = r.status === "active";
      if (site.custom_domain && site.custom_domain !== domain) await cf2.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {
      });
      await db2.patch("rental_sites", "id=eq." + siteId, { custom_domain: domain, domain_status: active ? "active" : "pending_dns" });
      await event("domain_set", { domain, cf_status: r.status });
      let warning = "";
      if (active && ["live", "overdue"].includes(site.status) && site.live_version_id) {
        const d = await queueDeploy({ versionId: site.live_version_id });
        if (!d.ok) warning = deployWarn;
      }
      return reply({
        ok: true,
        domain,
        domain_status: active ? "active" : "pending_dns",
        cname_target: r.target,
        ...warning ? { warning } : {},
        message: active ? "網域已生效。" : (audience === "admin" ? "請客戶（或網域管理者）" : "請到你買網域的地方（或請網域管理者）") + "到網域的 DNS 設定新增一筆 CNAME：名稱 " + domain + " → " + r.target + "。設定後等幾分鐘到數小時，再按「檢查網域」。"
      }, 200);
    }
    case "check_domain": {
      if (!cf2) return fail("cf_not_configured", notReady, 501);
      if (!site.custom_domain || !site.cf_project_name) return fail("no_domain", "這個網站還沒有設定自訂網域", 409);
      let r;
      try {
        r = await cf2.getDomain(site.cf_project_name, site.custom_domain);
      } catch (e) {
        return fail("cloudflare_error", "查詢網域失敗：" + String(e.message || e).slice(0, 200), 502);
      }
      if (!r) return fail("domain_missing", "Cloudflare 上找不到這個網域，請重新設定網域", 409);
      if (r.status !== "active") {
        await event("domain_checked", { domain: site.custom_domain, cf_status: r.status });
        return reply({ ok: true, domain_status: "pending_dns", cf_status: r.status, message: "網域尚未生效（Cloudflare 狀態：" + r.status + "）" + (r.error ? "：" + r.error : "") + "。DNS 設定後可能要等幾分鐘到數小時。" }, 200);
      }
      let warning = "";
      if (site.domain_status !== "active") {
        await db2.patch("rental_sites", "id=eq." + siteId, { domain_status: "active" });
        await event("domain_active", { domain: site.custom_domain });
        if (["live", "overdue"].includes(site.status) && site.live_version_id) {
          const d = await queueDeploy({ versionId: site.live_version_id });
          if (!d.ok) warning = deployWarn;
        }
      }
      return reply({ ok: true, domain_status: "active", cf_status: r.status, ...warning ? { warning } : {}, message: "網域已生效，網站正在以新網域重新發佈（約 1–2 分鐘）。" }, 200);
    }
    case "clear_domain": {
      if (!site.custom_domain) return fail("no_domain", "這個網站沒有自訂網域", 409);
      if (cf2 && site.cf_project_name) {
        try {
          await cf2.removeDomain(site.cf_project_name, site.custom_domain);
        } catch (e) {
          return fail("cloudflare_error", "移除網域失敗：" + String(e.message || e).slice(0, 200), 502);
        }
      }
      await db2.patch("rental_sites", "id=eq." + siteId, { custom_domain: null, domain_status: "none" });
      await event("domain_cleared", { domain: site.custom_domain });
      let warning = "";
      if (["live", "overdue"].includes(site.status) && site.live_version_id) {
        const d = await queueDeploy({ versionId: site.live_version_id });
        if (!d.ok) warning = deployWarn;
      }
      return reply({ ok: true, domain_status: "none", ...warning ? { warning } : {}, message: "已移除自訂網域，網站改回 pages.dev 網址並重新發佈。" }, 200);
    }
  }
  return fail("bad_request", "不支援的動作");
}

// supabase/functions/_shared/secretbox.mjs
var te = new TextEncoder();
var td = new TextDecoder();
var b64 = (u8) => btoa(String.fromCharCode(...u8));
async function keyFrom(secret) {
  if (!secret) throw new Error("secretbox: missing secret");
  const base = await crypto.subtle.importKey("raw", te.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode("yc-axiom-site-pay"), info: te.encode("ecpay-keys-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function seal(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(secret), te.encode(String(plain))));
  return "v1." + b64(iv) + "." + b64(ct);
}

// templates/shared/palettes.js
var PALETTES = {
  forest: { label: "森林綠", bg: "#F6F3EC", surface: "#EAE4D6", text: "#22301F", muted: "#4F5A4B", accent: "#2F4A3A", onAccent: "#F6F3EC", line: "#D8D1C1" },
  caramel: { label: "焦糖棕", bg: "#FBF6F0", surface: "#F0E3D3", text: "#3A2618", muted: "#6B5444", accent: "#8A5A3B", onAccent: "#FBF6F0", line: "#E2D2BE" },
  ink: { label: "墨夜金", bg: "#17161A", surface: "#24222A", text: "#F1ECE2", muted: "#B9B2A5", accent: "#C9A66B", onAccent: "#17161A", line: "#36333C" },
  mist: { label: "霧藍灰", bg: "#F3F5F6", surface: "#DDE5EA", text: "#1D2A33", muted: "#4C5C67", accent: "#3E5A6E", onAccent: "#F3F5F6", line: "#C9D3D9" },
  rose: { label: "玫瑰粉", bg: "#F8F2F3", surface: "#EDDEE2", text: "#2E151B", muted: "#66474F", accent: "#AF4B65", onAccent: "#FFFFFF", line: "#DCC6CC" },
  lilac: { label: "薰衣草", bg: "#F4F2F8", surface: "#E2DEED", text: "#1D162C", muted: "#504766", accent: "#6E55A8", onAccent: "#FFFFFF", line: "#CDC6DC" },
  ocean: { label: "海洋藍", bg: "#F2F6F8", surface: "#DEE7ED", text: "#15242E", muted: "#475B66", accent: "#1F6F9E", onAccent: "#FFFFFF", line: "#C6D4DC" },
  olive: { label: "橄欖綠", bg: "#F7F8F2", surface: "#EAEDDE", text: "#292E15", muted: "#606647", accent: "#647227", onAccent: "#FFFFFF", line: "#D8DCC6" },
  clay: { label: "陶土紅", bg: "#F8F3F2", surface: "#EDE1DE", text: "#2E1A15", muted: "#664E47", accent: "#AA5137", onAccent: "#FFFFFF", line: "#DCCBC6" },
  sand: { label: "沙丘黃", bg: "#F8F6F2", surface: "#EDE8DE", text: "#2E2515", muted: "#665C47", accent: "#916511", onAccent: "#FFFFFF", line: "#DCD5C6" },
  graphite: { label: "石墨灰", bg: "#151719", surface: "#202427", text: "#EBEDEF", muted: "#ABB2BA", accent: "#9AA3AD", onAccent: "#151719", line: "#353A41" },
  midnight: { label: "夜海藍", bg: "#13171B", surface: "#1E2429", text: "#E9EDF1", muted: "#A8B3BD", accent: "#6FA8DC", onAccent: "#13171B", line: "#323B43" },
  matcha: { label: "抹茶綠", bg: "#F6F7EF", surface: "#E6EAD5", text: "#1F2614", muted: "#4D5640", accent: "#4A6B22", onAccent: "#FFFFFF", line: "#D2D8BD" },
  lake: { label: "湖水青", bg: "#0E1A1C", surface: "#152528", text: "#E6F1F0", muted: "#A9C0BE", accent: "#5CC8B8", onAccent: "#0E1A1C", line: "#26393C" },
  paper: { label: "宣紙朱", bg: "#FAF7F0", surface: "#EFE7D6", text: "#2A241C", muted: "#5C5244", accent: "#9E2B25", onAccent: "#FFFFFF", line: "#DED3BE" },
  navy: { label: "藏青金", bg: "#F7F6F1", surface: "#E8E5DB", text: "#18202F", muted: "#4A5162", accent: "#1F3B6B", onAccent: "#FFFFFF", line: "#D6D1C3" }
};
var PALETTE_IDS = Object.keys(PALETTES);

// templates/shared/content.js
var SECTION_KEYS = ["menu", "interior", "faq", "news"];
function defaultSections() {
  return { menu: true, interior: true, faq: true, news: true };
}
function normalizeSections(s) {
  const o = defaultSections();
  const r = s && typeof s === "object" ? s : {};
  SECTION_KEYS.forEach((k) => {
    if (typeof r[k] === "boolean") o[k] = r[k];
  });
  return o;
}

// supabase/functions/_shared/shop.mjs
var MERCHANT_RE = /^\d{7,10}$/;
var KEY_RE = /^[A-Za-z0-9]{16}$/;
var PAY_MODES = ["off", "test", "live"];

// supabase/functions/_shared/emails.mjs
var esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var CONTACT = { line: "@788cblaq", email: "ycaxiom@gmail.com" };
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px"><h2 style="margin:0 0 14px;font-size:18px">` + esc(title) + "</h2>" + bodyHtml + '</div><p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM 網站租用 · LINE ' + CONTACT.line + " · " + CONTACT.email + "</p></div></body></html>";
}
var ADD_CONTACT = "為避免我們的信件被歸到垃圾信匣，請把 " + CONTACT.email + " 加入你的聯絡人；直接回覆這封信也會寄到我們的信箱。";
var button = (href, label) => '<p><a href="' + esc(href) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">' + esc(label) + "</a></p>";
var LINE_HINT = "有任何問題都可以直接回覆這封信，或用 LINE " + CONTACT.line + " 聯絡我們。";
function guestBookingResult({ shopName, when, confirmed, note, base }) {
  const subject = "【" + shopName + "】你的預約" + (confirmed ? "已確認" : "已取消") + "：" + when;
  const msg = confirmed ? "你在 " + shopName + " 的預約已經確認：" + when + "。期待你的光臨！" : "很抱歉，你在 " + shopName + " 的預約（" + when + "）已經取消。";
  const html = "<p>" + esc(msg) + "</p>" + (note ? "<p>店家說明：" + esc(note) + "</p>" : "") + '<p style="color:#777;font-size:14px">需要更改，請直接回覆這封信，會寄給店家。' + (base ? "網站：" + esc(base) : "") + "</p>";
  const text = [msg, note ? "店家說明：" + note : "", "需要更改請直接回覆這封信。"].filter(Boolean).join("\n");
  return { subject, html, text };
}
function collabInvite({ shopName, inviter, dashboardUrl }) {
  const subject = "【YC AXIOM】" + (inviter || "網站擁有者") + " 邀請你一起編輯「" + shopName + "」的網站";
  const html = layout(
    "你被邀請一起編輯網站",
    "<p>" + esc(inviter || "網站擁有者") + " 邀請你一起編輯「" + esc(shopName) + "」的網站。</p><p>請用收到這封信的 Email 登入（或註冊）YC AXIOM 會員專區，登入後就會在「我的網站」看到這個網站。</p>" + (dashboardUrl ? button(dashboardUrl, "前往會員專區") : "") + '<p style="color:#666;font-size:13px">協作者可以編輯內容、發佈更新、處理預約；收款設定、網域與刪除網站只有擁有者能操作。</p>'
  );
  const text = [(inviter || "網站擁有者") + " 邀請你一起編輯「" + shopName + "」的網站。", "請用這個 Email 登入 YC AXIOM 會員專區，登入後就會看到這個網站。", dashboardUrl].filter(Boolean).join("\n");
  return { subject, html, text };
}
function adminUpgradeRequest({ shopName, slug, memberEmail, amount, days, yearly, adminUrl }) {
  const subject = "【網站租用】升級多頁版，待補差額 NT$ " + Number(amount).toLocaleString("en-US") + "：" + shopName;
  const html = layout(
    "客戶申請升級成多頁版",
    "<p>「" + esc(shopName) + "」（" + esc(slug) + "，" + esc(memberEmail) + "）申請把網站升級成多頁版。</p><p>剩餘 " + esc(days) + " 天，" + (yearly ? "年繳" : "月繳") + "，差額 <b>NT$ " + esc(Number(amount).toLocaleString("en-US")) + "</b>。</p><p>收到客戶匯款後，到管理後台的網站詳情按「確認收到升級差額」，系統會自動發佈多頁版。在那之前正式網站維持一頁版。</p>" + (adminUrl ? button(adminUrl, "開啟管理後台") : "")
  );
  const text = ["客戶申請升級成多頁版", "", shopName + "（" + slug + "，" + memberEmail + "）", "剩餘 " + days + " 天，" + (yearly ? "年繳" : "月繳") + "，差額 NT$ " + amount, "", "收到匯款後到管理後台按「確認收到升級差額」，系統會自動發佈多頁版。"].join("\n");
  return { subject, html, text };
}

// supabase/functions/_shared/plans.mjs
var PLANS = {
  single: { name: "自架版（一頁）", monthly: 599, yearPaidMonths: 10 },
  multi: { name: "自架版（多頁）", monthly: 899, yearPaidMonths: 10 }
};
function upgradeQuote({ paidUntil, today, yearly = false }) {
  if (!paidUntil || paidUntil < today) return { days: 0, amount: 0, yearly };
  const days = Math.round((Date.parse(paidUntil + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5) + 1;
  const perDay = yearly ? (PLANS.multi.monthly - PLANS.single.monthly) * PLANS.single.yearPaidMonths / 365 : (PLANS.multi.monthly - PLANS.single.monthly) / 30;
  return { days, amount: Math.round(days * perDay), yearly };
}

// templates/shared/industries.js
var OFFERS = {
  menu: { label: "菜單與價格", nav: "菜單", path: "menu/", item: "品項", provide: "店內提供", note: "價格以現場公告為準。", more: "看完整菜單" },
  service: { label: "服務與價格", nav: "服務項目", path: "services/", item: "服務", provide: "提供", note: "實際價格依現場評估為準。", more: "看所有服務" },
  course: { label: "課程與費用", nav: "課程", path: "courses/", item: "課程", provide: "開設", note: "費用以最新公告為準。", more: "看所有課程" },
  product: { label: "商品與價格", nav: "商品", path: "products/", item: "商品", provide: "販售", note: "價格以門市公告為準。", more: "看更多商品" },
  treatment: { label: "診療項目", nav: "診療項目", path: "treatments/", item: "項目", provide: "提供", note: "費用依實際診療內容為準。", more: "看所有診療項目" },
  room: { label: "房型與價格", nav: "房型", path: "rooms/", item: "房型", provide: "提供", note: "房價依日期與方案調整，以訂房時為準。", more: "看所有房型" }
};
var SPACES = {
  store: { label: "店內環境", path: "space/", more: "看更多照片" },
  space: { label: "環境介紹", path: "space/", more: "看更多照片" },
  classroom: { label: "教室環境", path: "space/", more: "看更多照片" },
  clinic: { label: "診所環境", path: "space/", more: "看更多照片" },
  school: { label: "園所環境", path: "space/", more: "看更多照片" },
  lodging: { label: "空間介紹", path: "space/", more: "看更多照片" },
  portfolio: { label: "作品集", path: "works/", more: "看更多作品" }
};
var VISITS = {
  store: { label: "來店資訊", path: "visit/", intro: "來店", ask: "如果想先確認座位或詢問細節" },
  clinic: { label: "看診資訊", path: "visit/", intro: "看診", ask: "如果想先確認看診時間或預約" },
  school: { label: "交通與聯絡", path: "visit/", intro: "參觀", ask: "如果想預約參觀或詢問課程" },
  contact: { label: "聯絡我們", path: "contact/", intro: "洽詢", ask: "如果想詢問報價或預約時間" },
  lodging: { label: "交通與入住", path: "visit/", intro: "入住", ask: "如果想詢問空房或交通方式" }
};
var ROWS = [
  ["cafe", "咖啡店", "餐飲", "CafeOrCoffeeShop", "menu", "store", "store"],
  ["bakery", "烘焙坊", "餐飲", "Bakery", "menu", "store", "store"],
  ["drink", "飲料店", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["dessert", "甜點店", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["restaurant", "餐廳", "餐飲", "Restaurant", "menu", "store", "store"],
  ["brunch", "早午餐店", "餐飲", "Restaurant", "menu", "store", "store"],
  ["bar", "酒吧", "餐飲", "BarOrPub", "menu", "store", "store"],
  ["tea", "茶館", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["salon", "美髮沙龍", "美業", "HairSalon", "service", "store", "store"],
  ["beauty", "美容美體", "美業", "BeautySalon", "service", "store", "store"],
  ["nail", "美甲美睫", "美業", "NailSalon", "service", "store", "store"],
  ["spa", "按摩 SPA", "美業", "DaySpa", "service", "store", "store"],
  ["pet", "寵物美容", "美業", "PetStore", "service", "store", "store"],
  ["gym", "健身房", "運動與健康", "ExerciseGym", "course", "space", "store"],
  ["yoga", "瑜珈教室", "運動與健康", "SportsActivityLocation", "course", "classroom", "school"],
  ["medical", "診所", "運動與健康", "MedicalClinic", "treatment", "clinic", "clinic"],
  ["dental", "牙醫診所", "運動與健康", "Dentist", "treatment", "clinic", "clinic"],
  ["tcm", "中醫診所", "運動與健康", "MedicalClinic", "treatment", "clinic", "clinic"],
  ["physio", "物理治療所", "運動與健康", "Physiotherapy", "treatment", "clinic", "clinic"],
  ["vet", "動物醫院", "運動與健康", "VeterinaryCare", "treatment", "clinic", "clinic"],
  ["edu", "補習班", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["arts", "才藝教室", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["music", "音樂教室", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["kindergarten", "幼兒園", "教育", "Preschool", "course", "school", "school"],
  ["daycare", "托嬰中心", "教育", "ChildCare", "course", "school", "school"],
  ["fashion", "服飾店", "零售", "ClothingStore", "product", "store", "store"],
  ["furniture", "家具店", "零售", "FurnitureStore", "product", "store", "store"],
  ["florist", "花店", "零售", "Florist", "product", "store", "store"],
  ["bookstore", "書店", "零售", "BookStore", "product", "store", "store"],
  ["eyewear", "眼鏡行", "零售", "Optician", "product", "store", "store"],
  ["gift", "選物店", "零售", "Store", "product", "store", "store"],
  ["grocery", "雜貨店", "零售", "GroceryStore", "product", "store", "store"],
  ["car-detailing", "汽車美容", "生活服務", "AutoWash", "service", "store", "store"],
  ["auto-repair", "汽車維修", "生活服務", "AutoRepair", "service", "store", "store"],
  ["motorcycle", "機車行", "生活服務", "MotorcycleRepair", "service", "store", "store"],
  ["laundry", "洗衣店", "生活服務", "DryCleaningOrLaundry", "service", "store", "store"],
  ["cleaning", "居家清潔", "生活服務", "ProfessionalService", "service", "portfolio", "contact"],
  ["photo", "攝影工作室", "生活服務", "ProfessionalService", "service", "portfolio", "contact"],
  ["interior", "室內設計", "生活服務", "HomeAndConstructionBusiness", "service", "portfolio", "contact"],
  ["renovation", "裝修工程", "生活服務", "GeneralContractor", "service", "portfolio", "contact"],
  ["lodging", "民宿", "住宿", "BedAndBreakfast", "room", "lodging", "lodging"],
  ["law", "法律事務所", "專業服務", "LegalService", "service", "space", "contact"],
  ["accounting", "會計記帳", "專業服務", "AccountingService", "service", "space", "contact"],
  ["realestate", "房屋仲介", "專業服務", "RealEstateAgent", "service", "space", "contact"],
  ["other", "其他店家", "其他", "LocalBusiness", "service", "store", "store"]
];
var INDUSTRIES = ROWS.map(([key, label, group, schemaType, offer, space, visit]) => ({
  key,
  label,
  group,
  schemaType,
  kindLabel: label,
  offer: OFFERS[offer],
  space: SPACES[space],
  visit: VISITS[visit]
}));
var INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key);
var INDUSTRY_GROUPS = [...new Set(INDUSTRIES.map((i) => i.group))];
var BY_KEY = Object.fromEntries(INDUSTRIES.map((i) => [i.key, i]));

// templates/shared/pages.js
var PAGES = [
  { key: "about", label: "關於", path: "about/" },
  { key: "menu", label: "菜單與價格", path: "menu/" },
  { key: "interior", label: "店內環境", path: "space/" },
  { key: "news", label: "最新消息", path: "news/" },
  { key: "faq", label: "常見問題", path: "faq/" },
  { key: "visit", label: "來店資訊", path: "visit/" }
];
var PAGE_KEYS = PAGES.map((p) => p.key);
function defaultPages() {
  const o = {};
  PAGE_KEYS.forEach((k) => {
    o[k] = true;
  });
  return o;
}
function normalizePages(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const o = defaultPages();
  PAGE_KEYS.forEach((k) => {
    if (typeof r[k] === "boolean") o[k] = r[k];
  });
  return o;
}
function pagesFromSections(sections) {
  const s = normalizeSections(sections);
  return { about: true, menu: s.menu, interior: s.interior, news: s.news, faq: s.faq, visit: true };
}

// supabase/functions/member-site/handler.mjs
var ACTIONS = ["set_domain", "check_domain", "clear_domain", "get_pay", "set_pay", "order_done", "delete_site", "set_booking", "invite_collab", "remove_collab", "accept_invites", "upgrade_quote", "upgrade_layout"];
var MAX_COLLABS = 5;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var DELETABLE = ["draft", "pending"];
async function handleMember(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed", message: "不支援的請求方式" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: "forbidden_origin", message: "來源不被允許" }, 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: "unauthorized", message: "請先登入" }, 401);
  let body;
  try {
    const t = await req.text();
    if (t.length > 2e3) throw new Error("too big");
    body = JSON.parse(t);
  } catch {
    return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  }
  if (!body || typeof body !== "object" || !ACTIONS.includes(body.action)) return reply({ error: "bad_request", message: "不支援的動作" }, 400);
  const { db: db2 } = deps;
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  if (body.action === "accept_invites") return acceptInvites(user, deps, reply);
  if (typeof body.site_id !== "string" || !UUID.test(body.site_id)) return reply({ error: "bad_request", message: "缺少網站編號" }, 400);
  const siteId = body.site_id;
  let site = await db2.getOne("rental_sites", "id=eq." + siteId + "&member_id=eq." + user.id + "&select=*");
  if (!site && body.action === "set_booking") {
    const cm = await db2.getOne("site_members", "site_id=eq." + siteId + "&member_id=eq." + user.id + "&status=eq.active&select=site_id");
    const s2 = cm ? await db2.getOne("rental_sites", "id=eq." + siteId + "&select=*") : null;
    if (s2 && s2.tier === "pro") site = s2;
  }
  if (!site) return reply({ error: "not_found", message: "找不到這個網站" }, 404);
  if (body.action === "set_booking") return setBooking(body, site, user, deps, reply, fail);
  if (body.action === "invite_collab" || body.action === "remove_collab") return collabAction(body, site, user, deps, reply, fail);
  if (body.action === "upgrade_quote" || body.action === "upgrade_layout") return upgradeAction(body, site, user, deps, reply, fail);
  if (["get_pay", "set_pay", "order_done"].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
  if (body.action === "delete_site") {
    if (!DELETABLE.includes(site.status) || site.first_published_at) return fail("not_allowed", "已上線過的網站不能自己刪除，請用 LINE（@788cblaq）聯絡我們辦理終止", 409);
    const done = await db2.patchReturning("rental_sites", "id=eq." + siteId + "&status=in.(draft,pending)", { status: "cancelled" });
    if (!done.length) return fail("not_allowed", "這個網站目前的狀態不能刪除", 409);
    await db2.insert("site_events", { site_id: siteId, type: "deleted_by_member", detail: { from: site.status, by: "member:" + (user.email || user.id) } }).catch(() => {
    });
    return reply({ ok: true, message: "已刪除網站「" + (site.content && site.content.name || site.slug) + "」。" }, 200);
  }
  if (body.action === "set_domain" && !["live", "overdue"].includes(site.status)) return fail("not_allowed", "網站上線後才能綁定自己的網域", 409);
  const by = "member:" + (user.email || user.id);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {
  });
  async function queueDeploy({ versionId } = {}) {
    const d = await deps.dispatch({ siteId, versionId }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), ...versionId ? { version_id: versionId } : {} });
    return d;
  }
  return domainAction(body.action, { site, siteId, body, db: db2, cf: deps.cf, event, queueDeploy, reply, fail, audience: "member" });
}
async function payAction(body, site, user, deps, reply, fail) {
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const by = "member:" + (user.email || user.id);
  const cur = await db2.getOne("site_pay_settings", "site_id=eq." + site.id + "&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at");
  const was = cur ? cur.mode : "off";
  const view = (r) => ({ mode: r ? r.mode : "off", merchant_id: r ? r.merchant_id || "" : "", has_keys: !!(r && r.key_enc && r.iv_enc), updated_at: r ? r.updated_at : null });
  if (body.action === "get_pay") return reply({ ok: true, ...view(cur) }, 200);
  if (body.action === "order_done") {
    const tn = String(body.trade_no || "");
    if (!/^[A-Za-z0-9]{1,20}$/.test(tn)) return fail("bad_request", "缺少訂單編號");
    const done = body.done !== false;
    const r = await db2.patchReturning("shop_orders", "trade_no=eq." + tn + "&site_id=eq." + site.id, { fulfilled_at: done ? now.toISOString() : null, updated_at: now.toISOString() });
    if (!r.length) return fail("not_found", "找不到這筆訂單", 404);
    return reply({ ok: true, done }, 200);
  }
  const mode = PAY_MODES.includes(body.mode) ? body.mode : "";
  if (!mode) return fail("bad_request", "請選擇收款模式");
  const patch = { mode, updated_at: now.toISOString() };
  if (mode === "live") {
    const mid = String(body.merchant_id || "").trim();
    const key = String(body.hash_key || "").trim(), iv = String(body.hash_iv || "").trim();
    if (!MERCHANT_RE.test(mid)) return fail("bad_request", "特店編號（MerchantID）格式不正確，應該是 7 到 10 位數字");
    if (mid === "3002607" || mid === "2000132") return fail("bad_request", "這是綠界的測試帳號。要測試請選「測試模式」；正式收款請填你自己的特店編號");
    const changingKeys = key || iv || !cur || !cur.key_enc || cur.merchant_id !== mid;
    if (changingKeys) {
      if (!KEY_RE.test(key) || !KEY_RE.test(iv)) return fail("bad_request", "HashKey 與 HashIV 都是 16 個英文或數字，請到綠界廠商後台複製貼上");
      patch.key_enc = await seal(key, deps.paySecret);
      patch.iv_enc = await seal(iv, deps.paySecret);
    }
    patch.merchant_id = mid;
  }
  if (cur) await db2.patch("site_pay_settings", "site_id=eq." + site.id, patch);
  else await db2.insert("site_pay_settings", { site_id: site.id, member_id: site.member_id, ...patch });
  await db2.insert("site_events", { site_id: site.id, type: "pay_settings", detail: { mode, ...patch.merchant_id ? { merchant_id: patch.merchant_id } : {}, keys_changed: !!patch.key_enc, by } }).catch(() => {
  });
  let warning = "";
  if (was === "off" !== (mode === "off") && ["live", "overdue"].includes(site.status) && site.live_version_id) {
    const d = await deps.dispatch({ siteId: site.id, versionId: site.live_version_id }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) warning = "網站沒有自動重新發佈，請到編輯器按一次「發佈」。";
  }
  const after = await db2.getOne("site_pay_settings", "site_id=eq." + site.id + "&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at");
  const msg = mode === "off" ? "已關閉線上收款。" : mode === "test" ? "已開啟測試模式：可以用綠界測試卡號下單，不會真的收款。" : "已開啟正式收款，款項會進到你的綠界帳戶。建議先自己下一筆小額訂單確認。";
  return reply({ ok: true, ...view(after), message: msg + (warning ? " " + warning : ""), ...warning ? { warning } : {} }, 200);
}
async function setBooking(body, site, user, deps, reply, fail) {
  const { db: db2 } = deps;
  const id = String(body.message_id || "");
  if (!UUID.test(id)) return fail("bad_request", "缺少預約編號");
  const status = body.status === "confirmed" ? "confirmed" : body.status === "cancelled" ? "cancelled" : "";
  if (!status) return fail("bad_request", "狀態只能是確認或取消");
  const note = body.note == null ? "" : String(body.note).trim();
  if (note.length > 200) return fail("bad_request", "說明最長 200 字");
  const msg = await db2.getOne("site_messages", "id=eq." + id + "&site_id=eq." + site.id + "&select=id,slot_date,slot_time,slot_status,meta");
  if (!msg || !msg.slot_date) return fail("not_found", "找不到這筆預約", 404);
  if (msg.slot_status === status) return reply({ ok: true, status, message: "狀態沒有變更。" }, 200);
  if (msg.slot_status === "cancelled") return fail("not_allowed", "已取消的預約不能再改，請請客人重新預約", 409);
  await db2.patch("site_messages", "id=eq." + id, { slot_status: status, meta: { ...msg.meta || {}, handled_by: user.email || user.id, ...note ? { owner_note: note } : {} } });
  const email = msg.meta && msg.meta.email;
  let mailed = false;
  if (email && EMAIL_RE.test(email) && deps.sendMail) {
    const shopName = site.content && site.content.name || "店家";
    const when = String(msg.slot_date).replace(/-/g, "/") + " " + msg.slot_time;
    const owner = await db2.getOne("members", "id=eq." + site.member_id + "&select=email");
    const r = await deps.sendMail({ to: email, ...guestBookingResult({ shopName, when, confirmed: status === "confirmed", note, base: site.public_url || "" }), ...owner && owner.email ? { replyTo: owner.email } : {} }).catch(() => null);
    mailed = !!(r && r.ok);
  }
  return reply({ ok: true, status, mailed, message: (status === "confirmed" ? "已確認預約。" : "已取消預約，名額已釋出。") + (mailed ? "已寄信通知客人。" : email ? "通知信沒有寄出，請自行聯絡客人。" : "客人沒有留 Email，請用電話聯絡。") }, 200);
}
async function collabAction(body, site, user, deps, reply, fail) {
  const { db: db2 } = deps;
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) return fail("bad_request", "請輸入正確的 Email");
  const by = "member:" + (user.email || user.id);
  if (body.action === "remove_collab") {
    const r = await db2.patchReturning("site_members", "site_id=eq." + site.id + "&email=eq." + encodeURIComponent(email), { status: "removed", member_id: null });
    if (!r.length) return fail("not_found", "找不到這位協作者", 404);
    await db2.insert("site_events", { site_id: site.id, type: "collab_removed", detail: { email, by } }).catch(() => {
    });
    return reply({ ok: true, message: "已移除 " + email + "。" }, 200);
  }
  if (site.tier !== "pro") return fail("not_allowed", "多人協作是進階方案功能，請用 LINE（@788cblaq）聯絡我們升級", 403);
  if (email === String(user.email || "").toLowerCase()) return fail("bad_request", "不能邀請自己");
  const list = await db2.list("site_members", "site_id=eq." + site.id + "&status=neq.removed&select=email");
  if (list.some((x) => x.email === email)) return fail("bad_request", "這個 Email 已經邀請過了");
  if (list.length >= MAX_COLLABS) return fail("not_allowed", "每個網站最多 " + MAX_COLLABS + " 位協作者", 409);
  const old = await db2.getOne("site_members", "site_id=eq." + site.id + "&email=eq." + encodeURIComponent(email) + "&select=email");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))().toISOString();
  if (old) await db2.patch("site_members", "site_id=eq." + site.id + "&email=eq." + encodeURIComponent(email), { status: "invited", member_id: null, invited_by: user.id, created_at: now, accepted_at: null });
  else await db2.insert("site_members", { site_id: site.id, email, status: "invited", invited_by: user.id });
  await db2.insert("site_events", { site_id: site.id, type: "collab_invited", detail: { email, by } }).catch(() => {
  });
  let mailed = false;
  if (deps.sendMail) {
    const r = await deps.sendMail({ to: email, ...collabInvite({ shopName: site.content && site.content.name || site.slug, inviter: user.email || "", dashboardUrl: deps.dashboardUrl || "" }) }).catch(() => null);
    mailed = !!(r && r.ok);
  }
  return reply({ ok: true, message: "已邀請 " + email + "。" + (mailed ? "對方會收到邀請信，" : "") + "對方用這個 Email 登入會員專區後就能一起編輯。" }, 200);
}
async function acceptInvites(user, deps, reply) {
  const { db: db2 } = deps;
  const email = String(user.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return reply({ ok: true, accepted: 0 }, 200);
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))().toISOString();
  const r = await db2.patchReturning("site_members", "email=eq." + encodeURIComponent(email) + "&status=eq.invited", { status: "active", member_id: user.id, accepted_at: now });
  for (const x of r) await db2.insert("site_events", { site_id: x.site_id, type: "collab_joined", detail: { email, by: "member:" + email } }).catch(() => {
  });
  return reply({ ok: true, accepted: r.length }, 200);
}
var PAID_STATUSES = ["live", "overdue", "suspended"];
async function quoteFor(site, deps) {
  const today = new Date((deps.now ? deps.now() : /* @__PURE__ */ new Date()).getTime() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
  if (!PAID_STATUSES.includes(site.status) || !site.paid_until) return { days: 0, amount: 0, yearly: false };
  const last = await deps.db.getOne("payments", "site_id=eq." + site.id + "&select=months&order=paid_on.desc");
  return upgradeQuote({ paidUntil: site.paid_until, today, yearly: !!(last && last.months >= 12) });
}
async function upgradeAction(body, site, user, deps, reply, fail) {
  const { db: db2 } = deps;
  if (site.layout === "multi") return fail("not_allowed", "這個網站已經是多頁版", 409);
  if (site.status === "cancelled") return fail("not_allowed", "這個網站已終止服務", 409);
  const q = await quoteFor(site, deps);
  if (body.action === "upgrade_quote") return reply({ ok: true, ...q }, 200);
  const pages = body.pages ? normalizePages(body.pages) : pagesFromSections(normalizeSections(site.sections));
  const pending = q.amount > 0;
  const now = (deps.now ? deps.now() : /* @__PURE__ */ new Date()).toISOString();
  const done = await db2.patchReturning("rental_sites", "id=eq." + site.id + "&layout=eq.single", { layout: "multi", pages, upgrade_pending: pending, upgrade_amount: q.amount, upgrade_requested_at: now });
  if (!done.length) return fail("not_allowed", "這個網站已經是多頁版", 409);
  const by = "member:" + (user.email || user.id);
  await db2.insert("site_events", { site_id: site.id, type: "layout_upgraded", detail: { amount: q.amount, days: q.days, yearly: q.yearly, pending, by } }).catch(() => {
  });
  if (pending && deps.sendMail && deps.adminEmail) {
    await deps.sendMail({ to: deps.adminEmail, ...adminUpgradeRequest({ shopName: site.content && site.content.name || site.slug, slug: site.slug, memberEmail: user.email || "", amount: q.amount, days: q.days, yearly: q.yearly, adminUrl: deps.adminUrl }) }).catch(() => null);
  }
  const r = done[0];
  return reply({
    ok: true,
    layout: "multi",
    pages: r.pages,
    upgraded_at: r.upgraded_at,
    upgrade_pending: pending,
    amount: q.amount,
    days: q.days,
    yearly: q.yearly,
    message: pending ? "已升級成多頁版。請匯款升級差額 NT$ " + q.amount.toLocaleString("en-US") + "，我們確認收到後會自動發佈多頁版；在那之前正式網站維持一頁版。" : "已升級成多頁版，按「發佈」後正式網站就會變成多頁。"
  }, 200);
}

// build/lib/supabase.mjs
function makeSupabase({ url, serviceKey, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, "");
  const headers = (extra = {}) => ({ apikey: serviceKey, Authorization: "Bearer " + serviceKey, ...extra });
  async function rest(path, { method = "GET", body, prefer } = {}) {
    const res = await fetchImpl(base + "/rest/v1/" + path, {
      method,
      headers: headers({ "Content-Type": "application/json", ...prefer ? { Prefer: prefer } : {} }),
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error("Supabase " + method + " " + path.split("?")[0] + " → " + res.status + " " + text.slice(0, 200));
    return text ? JSON.parse(text) : null;
  }
  return {
    async getOne(table, query) {
      const r = await rest(table + "?" + query + "&limit=1");
      return r && r[0] ? r[0] : null;
    },
    async patch(table, query, body) {
      return rest(table + "?" + query, { method: "PATCH", body, prefer: "return=minimal" });
    },
    // 條件式更新並回傳實際被更新的列（沒有符合條件的列 → 空陣列）。排程用它「先佔位再動作」，避免兩個執行同時處理同一個網站。
    async patchReturning(table, query, body) {
      const r = await rest(table + "?" + query, { method: "PATCH", body, prefer: "return=representation" });
      return r || [];
    },
    async remove(table, query) {
      return rest(table + "?" + query, { method: "DELETE", prefer: "return=minimal" });
    },
    async insert(table, body) {
      return rest(table, { method: "POST", body, prefer: "return=minimal" });
    },
    async insertReturning(table, body) {
      const r = await rest(table, { method: "POST", body, prefer: "return=representation" });
      return r && r[0] ? r[0] : null;
    },
    async list(table, query) {
      return await rest(table + "?" + query) || [];
    },
    // 呼叫資料庫函式（RPC）
    async rpc(fn, args) {
      return rest("rpc/" + fn, { method: "POST", body: args || {} });
    },
    async count(table, query) {
      const res = await fetchImpl(base + "/rest/v1/" + table + "?" + query + "&select=*", { method: "HEAD", headers: headers({ Prefer: "count=exact" }) });
      if (!res.ok) throw new Error("Supabase count " + table + " → " + res.status);
      const m = (res.headers.get("content-range") || "").match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    },
    // Storage：列出某個資料夾（prefix）底下的物件；回傳 [{name,id,created_at,...}]（資料夾的 id 為 null）
    async storageList(bucket, prefix, { offset = 0, limit = 100 } = {}) {
      const res = await fetchImpl(base + "/storage/v1/object/list/" + bucket, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }) });
      if (!res.ok) throw new Error("Storage list " + prefix + " → " + res.status);
      return res.json();
    },
    async storageRemove(bucket, paths) {
      const res = await fetchImpl(base + "/storage/v1/object/" + bucket, { method: "DELETE", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths }) });
      if (!res.ok) throw new Error("Storage remove → " + res.status);
      return res.json();
    },
    async download(bucket, path) {
      const res = await fetchImpl(base + "/storage/v1/object/" + bucket + "/" + path.split("/").map(encodeURIComponent).join("/"), { headers: headers() });
      if (!res.ok) throw new Error("Storage download " + path + " → " + res.status);
      return Buffer.from(await res.arrayBuffer());
    }
  };
}

// build/lib/cloudflare.mjs
function makeCloudflare({ token, accountId, fetchImpl = fetch }) {
  const api = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/pages/projects";
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  async function call(url, opts) {
    const res = await fetchImpl(url, { ...opts, headers: h });
    let j = null;
    try {
      j = await res.json();
    } catch {
    }
    return { status: res.status, json: j };
  }
  return {
    // 取得專案；不存在就建立。回傳 { name, subdomain }（subdomain 例如 my-cafe.pages.dev 或 my-cafe-abc.pages.dev）
    async ensureProject(name) {
      const got = await call(api + "/" + encodeURIComponent(name), { method: "GET" });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name, subdomain: got.json.result.subdomain, created: false };
      if (got.status !== 404) throw new Error("Cloudflare 讀取專案失敗 (" + got.status + ")：" + errText(got.json));
      const made = await call(api, { method: "POST", body: JSON.stringify({ name, production_branch: "main" }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error("Cloudflare 建立專案失敗 (" + made.status + ")：" + errText(made.json));
      return { name: made.json.result.name, subdomain: made.json.result.subdomain, created: true };
    },
    // 把客戶網域加到 Pages 專案。回傳 { name, status, target }：target 是客戶要設定 CNAME 指向的主機（專案的 pages.dev 網域）。
    async addDomain(project, domain) {
      const p = await call(api + "/" + encodeURIComponent(project), { method: "GET" });
      if (p.status !== 200 || !p.json || !p.json.result) throw new Error("Cloudflare 讀取專案失敗 (" + p.status + ")：" + errText(p.json));
      const target = p.json.result.subdomain;
      const got = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "GET" });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name || domain, status: got.json.result.status || "pending", target, created: false };
      if (got.status !== 404) throw new Error("Cloudflare 讀取網域失敗 (" + got.status + ")：" + errText(got.json));
      const made = await call(api + "/" + encodeURIComponent(project) + "/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error("Cloudflare 新增網域失敗 (" + made.status + ")：" + errText(made.json));
      return { name: made.json.result.name || domain, status: made.json.result.status || "pending", target, created: true };
    },
    // 從 Pages 專案移除網域（找不到視為已移除）
    async removeDomain(project, domain) {
      const r = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "DELETE" });
      if (r.status === 404) return { removed: false };
      if (r.status >= 300) throw new Error("Cloudflare 移除網域失敗 (" + r.status + ")：" + errText(r.json));
      return { removed: true };
    },
    // 刪除整個 Pages 專案（連同所有部署）。找不到視為已刪除（讓「永久刪除」可以安全重試）
    async deleteProject(project) {
      const r = await call(api + "/" + encodeURIComponent(project), { method: "DELETE" });
      if (r.status === 404) return { deleted: false };
      if (r.status >= 300) throw new Error("Cloudflare 刪除專案失敗 (" + r.status + ")：" + errText(r.json));
      return { deleted: true };
    },
    // 查詢網域狀態：Cloudflare 的 status 為 initializing／pending／active／deactivated／blocked／error
    async getDomain(project, domain) {
      const got = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "GET" });
      if (got.status === 404) return null;
      if (got.status !== 200 || !got.json || !got.json.result) throw new Error("Cloudflare 讀取網域失敗 (" + got.status + ")：" + errText(got.json));
      const r = got.json.result;
      return { name: r.name || domain, status: r.status || "pending", error: r.validation_data && r.validation_data.error_message || r.verification_data && r.verification_data.error_message || "" };
    }
  };
}
function errText(j) {
  return j && j.errors && j.errors.length ? j.errors.map((e) => e.message).join("; ") : "unknown";
}

// supabase/functions/_shared/runtime.mjs
function makeGetUser({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  return async function getUser2(token) {
    const res = await fetchImpl(supabaseUrl + "/auth/v1/user", { headers: { apikey: anonKey, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: u.email, isAdmin: !!(u.app_metadata && u.app_metadata.role === "admin") };
  };
}
function makeDispatcher({ token, repo, ref = "main", fetchImpl = fetch }) {
  return async function dispatch2({ siteId, versionId, mode }) {
    if (!token) return { ok: false, error: "GITHUB_DISPATCH_TOKEN 未設定" };
    const inputs = { site_id: siteId };
    if (versionId) inputs.version_id = versionId;
    if (mode) inputs.mode = mode;
    const res = await fetchImpl("https://api.github.com/repos/" + repo + "/actions/workflows/deploy-site.yml/dispatches", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "yc-axiom-sites-functions" },
      body: JSON.stringify({ ref: ref || "main", inputs }),
      signal: AbortSignal.timeout(1e4)
    });
    return res.status === 204 ? { ok: true } : { ok: false, error: "github " + res.status };
  };
}

// supabase/functions/_shared/brevo.mjs
var SENDER = { name: "YC AXIOM 網站租用", email: "ycaxiom@gmail.com" };
function makeBrevoSender({ apiKey, fetchImpl = fetch, timeoutMs = 1e4 }) {
  return async function sendMail2(m) {
    if (!apiKey) return { ok: false, error: "BREVO_API_KEY 未設定" };
    if (!m || !m.to) return { ok: false, error: "沒有收件人" };
    try {
      const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: SENDER, replyTo: { email: m.replyTo || SENDER.email }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: "brevo " + res.status + " " + String(await res.text()).slice(0, 200) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
  };
}

// supabase/functions/member-site/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var SUPABASE_URL = need("SUPABASE_URL");
var SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: SERVICE });
var getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need("SUPABASE_ANON_KEY") });
var dispatch = makeDispatcher({ token: Deno.env.get("GITHUB_DISPATCH_TOKEN") || "", repo: Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites", ref: Deno.env.get("GITHUB_REF") || "main" });
var CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
var CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
var cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : void 0;
var sendMail = makeBrevoSender({ apiKey: Deno.env.get("BREVO_API_KEY") || "" });
var SITE_BASE = Deno.env.get("OFFICIAL_SITE_URL") || "https://chi1017.github.io/yc-axiom-site/";
Deno.serve((req) => handleMember(req, { allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")), db, getUser, dispatch, cf, sendMail, dashboardUrl: SITE_BASE + "dashboard/", adminUrl: SITE_BASE + "admin/", adminEmail: Deno.env.get("ADMIN_EMAIL") || "ycaxiom@gmail.com", paySecret: Deno.env.get("PAY_SECRET") || SERVICE }));
