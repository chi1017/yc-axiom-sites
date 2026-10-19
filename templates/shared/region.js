// 從地址解析縣市與行政區。解析不出來就回傳空字串，呼叫端要能處理。
const CITY_RE = /([一-龥]{1,3}[縣市])/;
const DIST_RE = /[縣市]([一-龥]{1,3}[區鄉鎮市])/;
const POSTAL_RE = /^\s*(\d{3}(?:\d{2,3})?)\s*/;

export function parseAddress(address) {
  const a = String(address || '').trim();
  const postal = (a.match(POSTAL_RE) || [])[1] || '';
  const body = a.replace(POSTAL_RE, '');
  const city = (body.match(CITY_RE) || [])[1] || '';
  const district = city ? ((body.slice(body.indexOf(city) + city.length - 1).match(DIST_RE) || [])[1] || '') : '';
  const street = body.replace(city, '').replace(district, '').trim();
  return { postal, city, district, street, region: (city + district) };
}
