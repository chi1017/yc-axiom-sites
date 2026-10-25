// 版型登錄：所有行業共用 templates/base，依 industries.js 的行業設定換用詞與 schema.org 類型。
import { makeTemplate } from '../base/index.js';
import { INDUSTRIES, getIndustry } from './industries.js';

const CACHE = {};
export function getTemplate(id) {
  const ind = getIndustry(id);
  if (!ind) return null;
  return CACHE[id] || (CACHE[id] = makeTemplate(ind));
}
export const TEMPLATE_IDS = INDUSTRIES.map((i) => i.key);
