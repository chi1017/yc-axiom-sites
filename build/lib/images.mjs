// 只接受真正的圖片檔（看檔頭，不看副檔名），大小上限 6MB。
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return '';
}
