// 版型固定由 YC 設計；客戶只能換配色（CSS 變數）與主視覺樣式。
// headingFont：建置時有產生 fonts/heading.woff2（只含標題用到的字）才加 @font-face；預覽與舊網站用系統字
// font：標題字型（serif／sans／round／kai）；button：按鈕形狀（pill／round／square）；fontUrl：預覽時直接載入完整字型檔
export const FONT_STACKS = {
  serif: '"Noto Serif TC","Songti TC","PMingLiU",Georgia,serif',
  sans: '"Noto Sans TC","PingFang TC","Microsoft JhengHei","Segoe UI",sans-serif',
  round: '"jf-openhuninn-2.0","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',
  kai: '"LXGW WenKai TC","Kaiti TC","BiauKai","DFKai-SB",serif'
};
const RADIUS = { pill: '999px', round: '10px', square: '2px' };
export function baseCss(c, { headingFont = false, font = 'serif', button = 'pill', fontUrl = '' } = {}) {
  const src = headingFont ? '/fonts/heading.woff2' : fontUrl;
  const stack = FONT_STACKS[font] || FONT_STACKS.serif;
  return (src ? '@font-face{font-family:"SiteHeading";src:url(' + src + ') format("woff2");font-weight:100 900;font-style:normal;font-display:swap}\n' : '') + `:root{--bg:${c.bg};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--accent:${c.accent};--on-accent:${c.onAccent};--line:${c.line};--alt:${c.surface};--alt:color-mix(in srgb,${c.surface} 55%,${c.bg})}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font:16px/1.8 -apple-system,BlinkMacSystemFont,"Noto Sans TC","PingFang TC","Microsoft JhengHei","Segoe UI",sans-serif}
img{max-width:100%;height:auto;display:block}
main{flex:1 0 auto}
a{color:var(--accent)}
h1,h2,h3{font-family:"SiteHeading",${stack};line-height:1.25;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.sr{position:absolute;left:-9999px}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:var(--on-accent);padding:8px 14px;z-index:20}
.skip:focus{left:8px;top:8px}
.top{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:60px;flex-wrap:wrap}
.brand{font:700 19px/1.3 "SiteHeading","Noto Serif TC","Songti TC",Georgia,serif;color:var(--text);text-decoration:none}
.top nav{display:flex;gap:4px 20px;flex-wrap:wrap;font-size:15px}
.top nav a{color:var(--muted);text-decoration:none;padding:6px 0;border-bottom:2px solid transparent;transition:color .18s,border-color .18s}
.top nav a:hover,.top nav a[aria-current=page]{color:var(--accent);border-bottom-color:var(--accent)}
.nav-btn{display:none;align-items:center;gap:8px;background:none;border:1px solid var(--line);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;color:var(--text);cursor:pointer}
.nav-btn[hidden]{display:none!important}
.bars,.bars::before,.bars::after{display:block;width:16px;height:2px;background:currentColor;border-radius:2px;position:relative}
.bars::before,.bars::after{content:"";position:absolute;left:0}
.bars::before{top:-5px}.bars::after{top:5px}
section{padding:88px 0;scroll-margin-top:68px}
section.alt{background:var(--alt)}
h2{font-size:32px;margin-bottom:28px}
h3.sub,h2.sub{font-size:19px;margin-bottom:10px}
.hero{padding:64px 0 80px}
.hero-grid{display:grid;gap:32px;align-items:center}
.kicker{margin:0 0 12px;color:var(--muted);font-size:14px;letter-spacing:.1em}
h1{font-size:clamp(38px,6.4vw,60px);letter-spacing:.02em}
.lead{margin:18px 0 0;font-size:19px;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.btn{display:inline-block;padding:12px 26px;border-radius:999px;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;border:2px solid var(--accent);transition:transform .18s,box-shadow .18s,background-color .18s,color .18s}
.btn.ghost{background:transparent;color:var(--accent)}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(0,0,0,.14)}
.hero figure,.gallery figure,.split figure{margin:0}
.hero img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px;background:var(--surface)}
.hero.full{position:relative;padding:0;min-height:min(82vh,720px);display:flex;align-items:flex-end;color:#fff;background:#222}
.hero.full figure{position:absolute;inset:0}
.hero.full img,.hero.full .ph-img{width:100%;height:100%;aspect-ratio:auto;border-radius:0;object-fit:cover}
.hero.full figure::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,.18) 60%,rgba(0,0,0,.08))}
.hero.full .wrap{position:relative;z-index:1;width:100%;padding-top:120px;padding-bottom:72px}
.hero.full h1{font-size:clamp(40px,7.2vw,72px);color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.25)}
.hero.full .kicker,.hero.full .lead{color:rgba(255,255,255,.88)}
.hero.full .hero-text{max-width:720px}
.hero.full .btn.ghost{color:#fff;border-color:rgba(255,255,255,.85)}
.page-head{padding:72px 0 8px}
.page-head+section{padding-top:40px}
.page-head .lead{max-width:40em;font-size:17px}
.page-head .hero-grid figure{margin:0}
.about p,.visit-text p{margin:0 0 14px;max-width:46em}
.split-grid{display:grid;gap:32px;align-items:center}
.split img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px}
.split img.tall{aspect-ratio:3/4}
.more{margin:24px 0 0}
.more a{font-weight:600;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:2px}
.more a::after{content:" →"}
.menu{list-style:none;margin:0;padding:0;display:grid;gap:0 48px}
.menu li{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px dashed var(--line)}
.menu .price{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600}
.price-table{width:100%;max-width:720px;border-collapse:collapse}
.price-table th,.price-table td{text-align:left;padding:14px 0;border-bottom:1px dashed var(--line);font-weight:400}
.price-table thead th{color:var(--muted);font-size:14px;border-bottom:1px solid var(--line)}
.price-table td,.price-table thead th:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.price-table td{color:var(--accent);font-weight:600}
.note{color:var(--muted);font-size:14px;margin-top:14px}
.gallery{columns:2 140px;column-gap:14px}
.gallery figure{break-inside:avoid;margin-bottom:14px;overflow:hidden;border-radius:16px;background:var(--surface)}
.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .5s ease}
.gallery img.tall{aspect-ratio:3/4}
.gallery figure:hover img{transform:scale(1.03)}
.news{list-style:none;margin:0;padding:0}
.news li{display:grid;gap:2px 24px;padding:14px 0;border-bottom:1px solid var(--line)}
.news time{color:var(--muted);font-variant-numeric:tabular-nums}
.faq-item{background:var(--surface);border-radius:16px;padding:20px 24px;margin-bottom:14px}
.alt .faq-item{background:var(--bg)}
.faq-item h2,.faq-item h3{font-size:18px;margin-bottom:8px}
.faq-item p{margin:0}
.visit-grid{display:grid;gap:32px}
.visit-text{margin-top:28px}
dl.info{margin:0}
dl.info dt{font-weight:700;margin-top:14px}
dl.info dt:first-child{margin-top:0}
dl.info dd{margin:2px 0 0}
.hours-list{list-style:none;margin:0;padding:0}.hours-list li{margin:0}
table.hours{border-collapse:collapse;width:100%;max-width:440px}
table.hours th,table.hours td{text-align:left;padding:9px 0;border-bottom:1px solid var(--line);font-weight:400}
table.hours th{color:var(--muted);padding-right:20px;white-space:nowrap}
.social{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px}
.reviews{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.review{margin:0;background:var(--surface);border-radius:16px;padding:22px 24px}
.alt .review{background:var(--bg)}
.review blockquote{margin:0}.review blockquote p{margin:0;font-size:17px}
.review blockquote p::before{content:"「"}.review blockquote p::after{content:"」"}
.review figcaption{margin-top:10px;color:var(--muted);font-size:14px}
.embed-load{position:relative;display:block;border-radius:16px;overflow:hidden;background:var(--surface);color:var(--text);text-decoration:none}
.yt{max-width:760px;aspect-ratio:16/9}
.yt img{width:100%;height:100%;object-fit:cover}
.play{position:absolute;left:50%;top:50%;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;background:rgba(0,0,0,.62)}
.play::after{content:"";position:absolute;left:29px;top:22px;border-style:solid;border-width:14px 0 14px 22px;border-color:transparent transparent transparent #fff}
.yt:hover .play{background:var(--accent)}
iframe.embed{display:block;width:100%;max-width:760px;aspect-ratio:16/9;border:0;border-radius:16px}
iframe.embed.map{max-width:none;aspect-ratio:auto;height:360px}
.map-box{margin-top:28px}
.map{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:180px;border:1px dashed var(--line);text-align:center;padding:16px}
.map span{font-weight:600;color:var(--accent)}.map small{color:var(--muted)}
.contact-form{max-width:560px}
.contact-form p{margin:0 0 14px}
.contact-form label{display:block;font-weight:600;margin-bottom:4px}
.form-row{display:grid;gap:0 14px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.contact-form select,.contact-form input,.contact-form textarea{width:100%;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.alt .contact-form select,.alt .contact-form input,.alt .contact-form textarea{background:var(--surface)}
.contact-form input:focus,.contact-form textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.contact-form button[disabled],.contact-form input[disabled],.contact-form textarea[disabled]{opacity:.6;cursor:not-allowed}
.hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}
.posts{list-style:none;margin:0;padding:0;display:grid;gap:18px}
.posts li{border-bottom:1px solid var(--line);padding-bottom:18px}
.posts a{text-decoration:none;color:var(--text)}.posts a:hover h3{color:var(--accent)}
.posts h3{font-size:20px;margin:0 0 4px}
.posts time{color:var(--muted);font-size:14px;font-variant-numeric:tabular-nums}
.posts p{margin:6px 0 0;color:var(--muted)}
.shop-grid{list-style:none;margin:0 0 28px;padding:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.shop-grid li{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.shop-grid figure{margin:0;aspect-ratio:4/3;background:var(--bg)}.shop-grid figure img{width:100%;height:100%;object-fit:cover;border-radius:0}
.shop-grid .it{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.shop-grid h3{font-size:18px;margin:0}.shop-grid .price{color:var(--accent);font-weight:700;font-variant-numeric:tabular-nums;margin:0}
.shop-grid .desc{color:var(--muted);font-size:15px;margin:0;flex:1}
.btn.small{padding:8px 18px;font-size:15px;cursor:pointer}
.cart td input{width:72px;text-align:right}
.cart-total{font-size:18px;margin:4px 0 18px}.cart-total b{color:var(--accent);font-variant-numeric:tabular-nums}
.cart-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:560px;margin:0 auto;padding:10px 14px 10px 18px;border-radius:999px;background:var(--text);color:var(--bg);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.cart-bar[hidden]{display:none}.cart-bar .btn{padding:8px 18px}
.post-body{max-width:42em}.post-body p{margin:0 0 18px;font-size:17px}
footer{border-top:1px solid var(--line);padding:32px 0 44px;color:var(--muted);font-size:14px;background:var(--surface)}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 24px}
.foot-nav{display:flex;flex-wrap:wrap;gap:4px 16px}
.foot-nav a{color:var(--muted);text-decoration:none}
.foot-nav a:hover{color:var(--accent)}
.ph{background:rgba(127,127,127,.18);border:1px dashed var(--muted);border-radius:6px;padding:0 6px;color:var(--muted);font-weight:400}
.ph-img{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;border-radius:18px;background:var(--surface);border:2px dashed var(--muted);color:var(--muted)}
.split-full{display:grid;padding:0;background:var(--bg)}
.split-full.alt{background:var(--alt)}
.split-full figure{margin:0;position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--surface)}
.split-full figure img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.split-full .txt{padding:56px 20px;align-self:center}
.split-full .txt p{max-width:34em}
h2.big{font-size:clamp(34px,5.2vw,60px);margin-bottom:24px;letter-spacing:.01em}
.menu.one{grid-template-columns:1fr}
.qa{margin-bottom:22px}.qa h3{font-size:19px;margin-bottom:6px}.qa p{margin:0}
.band{text-align:center;background:var(--alt)}
.band-grid{display:grid;gap:28px;margin-top:8px}
.band h3{font-size:18px;margin-bottom:8px}.band p{margin:2px 0;color:var(--muted)}
.strip{padding:0}
.strip-grid{display:grid;grid-template-columns:repeat(2,1fr)}
.strip figure{margin:0;overflow:hidden}
.strip img{width:100%;aspect-ratio:3/4;object-fit:cover;transition:transform .5s ease}
.strip figure:hover img{transform:scale(1.03)}
.js-rv .rv{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}
.js-rv .rv.in{opacity:1;transform:none}
@media(min-width:760px){
 .hero-grid{grid-template-columns:1.05fr 1fr;gap:56px}
 .split-grid{grid-template-columns:1.1fr 1fr;gap:56px}
 .menu{grid-template-columns:1fr 1fr}
 .gallery{columns:3 220px}
 .news li{grid-template-columns:130px 1fr}
 .visit-grid{grid-template-columns:1fr 1fr}
 .split-full{grid-template-columns:1fr 1fr;min-height:600px}
 .split-full figure{aspect-ratio:auto;min-height:600px}
 .split-full.left figure{order:0}.split-full.right figure{order:2}
 .split-full .txt{padding:96px clamp(32px,6vw,104px)}
 .band-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
 .strip-grid{grid-template-columns:repeat(var(--n),1fr)}
}
@media(max-width:759px){
 section{padding:56px 0}
 h2{font-size:26px;margin-bottom:20px}
 .hero{padding:40px 0 56px}
 .hero.full{min-height:78vh}
 .hero.full .wrap{padding-bottom:48px}
 .page-head{padding:48px 0 0}
 .top nav{font-size:14px;gap:2px 14px}
 .js-nav .nav-btn{display:inline-flex}
 .js-nav .top nav{display:none;width:100%;flex-direction:column;gap:0;padding:4px 0 12px}
 .js-nav .top nav.open{display:flex}
 .js-nav .top nav a{padding:12px 0;border-bottom:1px solid var(--line);font-size:16px}
}
@media print{.split-full{display:grid;padding:0;background:var(--bg)}
.split-full.alt{background:var(--alt)}
.split-full figure{margin:0;position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--surface)}
.split-full figure img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.split-full .txt{padding:56px 20px;align-self:center}
.split-full .txt p{max-width:34em}
h2.big{font-size:clamp(34px,5.2vw,60px);margin-bottom:24px;letter-spacing:.01em}
.menu.one{grid-template-columns:1fr}
.qa{margin-bottom:22px}.qa h3{font-size:19px;margin-bottom:6px}.qa p{margin:0}
.band{text-align:center;background:var(--alt)}
.band-grid{display:grid;gap:28px;margin-top:8px}
.band h3{font-size:18px;margin-bottom:8px}.band p{margin:2px 0;color:var(--muted)}
.strip{padding:0}
.strip-grid{display:grid;grid-template-columns:repeat(2,1fr)}
.strip figure{margin:0;overflow:hidden}
.strip img{width:100%;aspect-ratio:3/4;object-fit:cover;transition:transform .5s ease}
.strip figure:hover img{transform:scale(1.03)}
.js-rv .rv{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}

.btn{border-radius:${RADIUS[button] || RADIUS.pill}}
.float-line{position:fixed;right:16px;bottom:16px;z-index:45;display:flex;align-items:center;gap:6px;padding:12px 18px;border-radius:999px;background:#05873C;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.22)}
.float-line.up{bottom:84px}
.float-line:hover{filter:brightness(1.05)}
@media(min-width:760px){.img-left .split-grid{grid-template-columns:1fr 1.1fr}.img-left .split-grid>figure{order:-1}}
@media print{.float-line,.cart-bar{display:none!important}}
`;
}
