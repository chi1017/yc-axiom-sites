// 版型固定由 YC 設計；客戶只能換配色（CSS 變數）。
export function cafeCss(c) {
  return `:root{--bg:${c.bg};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--accent:${c.accent};--on-accent:${c.onAccent};--line:${c.line}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.8 -apple-system,BlinkMacSystemFont,"Noto Sans TC","PingFang TC","Microsoft JhengHei","Segoe UI",sans-serif}
img{max-width:100%;height:auto;display:block}
a{color:var(--accent)}
h1,h2,h3{font-family:"Noto Serif TC","Songti TC","PMingLiU",Georgia,serif;line-height:1.35;margin:0}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:var(--on-accent);padding:8px 14px;z-index:20}
.skip:focus{left:8px;top:8px}
.top{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;flex-wrap:wrap}
.brand{font:700 18px/1.3 "Noto Serif TC","Songti TC",Georgia,serif;color:var(--text);text-decoration:none}
.top nav{display:flex;gap:4px 16px;flex-wrap:wrap;font-size:14px}
.top nav a{color:var(--muted);text-decoration:none;padding:6px 0}
.top nav a:hover{color:var(--accent)}
section{padding:56px 0;scroll-margin-top:64px}
section+section{border-top:1px solid var(--line)}
h2{font-size:26px;margin-bottom:20px}
.hero{padding:48px 0 56px}
.hero-grid{display:grid;gap:28px;align-items:center}
.kicker{margin:0 0 10px;color:var(--muted);font-size:14px;letter-spacing:.08em}
h1{font-size:clamp(32px,6vw,48px);letter-spacing:.02em}
.lead{margin:14px 0 0;font-size:18px;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.btn{display:inline-block;padding:11px 24px;border-radius:999px;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;border:2px solid var(--accent)}
.btn.ghost{background:transparent;color:var(--accent)}
.btn:hover{opacity:.9}
.hero figure,.gallery figure{margin:0}
.hero img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:18px;background:var(--surface)}
.about p{margin:0 0 14px;max-width:46em}
.menu{list-style:none;margin:0;padding:0;display:grid;gap:0 40px}
.menu li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px dashed var(--line)}
.menu .price{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600}
.note{color:var(--muted);font-size:14px;margin-top:14px}
.gallery{display:grid;gap:14px}
.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:var(--surface)}
.news{list-style:none;margin:0;padding:0}
.news li{display:grid;gap:2px 20px;padding:12px 0;border-bottom:1px solid var(--line)}
.news time{color:var(--muted);font-variant-numeric:tabular-nums}
.faq-item{background:var(--surface);border-radius:14px;padding:18px 22px;margin-bottom:14px}
.faq-item h3{font-size:18px;margin-bottom:8px}
.faq-item p{margin:0}
.visit-grid{display:grid;gap:28px}
dl.info{margin:0}
dl.info dt{font-weight:700;margin-top:14px}
dl.info dt:first-child{margin-top:0}
dl.info dd{margin:2px 0 0}
table.hours{border-collapse:collapse;width:100%;max-width:420px}
table.hours th,table.hours td{text-align:left;padding:8px 0;border-bottom:1px solid var(--line);font-weight:400}
table.hours th{color:var(--muted);padding-right:20px;white-space:nowrap}
.social{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--muted);font-size:14px;background:var(--surface)}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px}
.ph{background:rgba(127,127,127,.18);border:1px dashed var(--muted);border-radius:6px;padding:0 6px;color:var(--muted);font-weight:400}
.ph-img{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;border-radius:18px;background:var(--surface);border:2px dashed var(--muted);color:var(--muted)}
@media(min-width:760px){
 .hero-grid{grid-template-columns:1.05fr 1fr;gap:48px}
 .menu{grid-template-columns:1fr 1fr}
 .gallery{grid-template-columns:repeat(3,1fr)}
 .news li{grid-template-columns:130px 1fr}
 .visit-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:759px){section{padding:40px 0}h2{font-size:23px}.top nav{font-size:13px;gap:2px 12px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;
}
