// 只接受真正的圖片檔（看檔頭，不看副檔名），大小上限 6MB。
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return '';
}

// 手機用小圖：寬 800px、WebP 品質 78（原圖較窄時不放大）。sharp 不可用或失敗時丟出錯誤，由呼叫端改成只用原圖。
export async function makeSmall(buf, width = 800) {
  const { default: sharp } = await import('sharp');
  return sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
}
