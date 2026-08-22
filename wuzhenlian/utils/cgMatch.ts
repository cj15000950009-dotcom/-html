import type { CGItem, CGSet } from '../types';

/** CG 列 / CG:xxx / &lt;cg id=xxx&gt; 与单张 CG 的匹配（含 cgTagId、触发内容、旧 keywords） */
export function matchCgItemQuery(cg: CGItem, rawQuery: string): boolean {
  let q = (rawQuery || '').trim();
  const tagM = q.match(/^<cg\s+id\s*=\s*([^>\s]+)\s*>$/i);
  if (tagM) q = tagM[1].trim();
  if (!q) return false;
  const lower = q.toLowerCase();
  const id = String(cg.cgTagId || '').trim();
  if (id && id.toLowerCase() === lower) return true;
  if (
    cg.name &&
    (cg.name.toLowerCase() === lower ||
      cg.name.toLowerCase().includes(lower) ||
      lower.includes(cg.name.toLowerCase()))
  )
    return true;
  const tc = String(cg.triggerContent || '').trim();
  if (tc) {
    const tcl = tc.toLowerCase();
    if (tcl === lower || tcl.includes(lower) || lower.includes(tcl)) return true;
  }
  return (
    Array.isArray(cg.keywords) &&
    cg.keywords.some(
      k =>
        k &&
        (k.toLowerCase() === lower || k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())),
    )
  );
}

/** 管道第三列 CG:xxx / &lt;cg id=xxx&gt; 与「图集」的匹配（名称、触发内容、图集 cg id、额外关键词） */
export function matchCgSetQuery(set: CGSet, rawQuery: string): boolean {
  let q = (rawQuery || '').trim();
  const tagM = q.match(/^<cg\s+id\s*=\s*([^>\s]+)\s*>$/i);
  if (tagM) q = tagM[1].trim();
  if (!q) return false;
  const lower = q.toLowerCase();
  const id = String(set.cgTagId || '').trim();
  if (id && id.toLowerCase() === lower) return true;
  if (
    set.name &&
    (set.name.toLowerCase() === lower ||
      set.name.toLowerCase().includes(lower) ||
      lower.includes(set.name.toLowerCase()))
  )
    return true;
  const tc = String(set.triggerContent || '').trim();
  if (tc) {
    const tcl = tc.toLowerCase();
    if (tcl === lower || tcl.includes(lower) || lower.includes(tcl)) return true;
  }
  return (
    Array.isArray(set.keywords) &&
    set.keywords.some(
      k =>
        k &&
        (k.toLowerCase() === lower || k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())),
    )
  );
}

/** 从 AI 正文扫描：图集名称 / 触发内容 / 图集 CG ID / 额外关键词（与原先名称+关键词逻辑兼容并扩展） */
export function matchCgSetInProse(set: CGSet, lowerResp: string): boolean {
  const nameHit = set.name && lowerResp.includes(set.name.toLowerCase());
  const kwHit =
    Array.isArray(set.keywords) &&
    set.keywords.some(k => {
      if (!k) return false;
      const kl = k.toLowerCase();
      return lowerResp.includes(kl);
    });
  const tc = String(set.triggerContent || '').trim();
  const triggerHit = tc && lowerResp.includes(tc.toLowerCase());
  const tid = String(set.cgTagId || '').trim();
  const tagHit = tid && lowerResp.includes(tid.toLowerCase());
  return !!(nameHit || kwHit || triggerHit || tagHit);
}
