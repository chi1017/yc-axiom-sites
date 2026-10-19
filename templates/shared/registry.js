import { cafe } from '../cafe/index.js';
// 新增行業模板：在 templates/ 下新增資料夾，匯出同樣介面的物件，再加到這裡。
export const TEMPLATES = { cafe };
export function getTemplate(id) { return TEMPLATES[id] || null; }
export const TEMPLATE_IDS = Object.keys(TEMPLATES);
