import { SystemTask } from '../types';

/** 取【标签】后的内容，支持【标签:内容】或【标签】：内容；下一项以【开头或结尾即停止 */
function pickField(raw: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`【${escaped}】\\s*[:：]\\s*([\\s\\S]*?)(?=【|$)`, 'g');
  const m = reg.exec(raw);
  return m?.[1]?.trim() ?? '';
}

/** 取任意【xxx】后的内容，用于兼容 AI 输出的变体字段名 */
function pickAny(raw: string, labels: string[]): string {
  for (const label of labels) {
    const v = pickField(raw, label);
    if (v) return v;
  }
  return '';
}

/** 取第一个【xxx:yyy】作为标题（当无标准任务名称时） */
function pickFirstBracketContent(raw: string): string {
  const m = raw.match(/【([^】]*?)】\s*[:：]\s*([\s\S]*?)(?=【|$)/);
  return m?.[2]?.trim() ?? '';
}

/** 将一个 <xitong> 文本块解析为 SystemTask。未能解析到有效任务名时返回 null。 */
export function parseXitongBlockToTask(block: string, index: number = 0): SystemTask | null {
  const raw = (block ?? '').trim();
  if (!raw) return null;

  const category = pickAny(raw, ['任务类别']);
  const title = pickAny(raw, ['任务名称', '任务名', '发布新手任务', '发布任务']);
  const goal = pickAny(raw, ['任务目标', '任务内容']);
  const deadline = pickAny(raw, ['截止时间', '截止']);
  const difficulty = pickAny(raw, ['难度等级', '难度']);
  const reward = pickAny(raw, ['任务奖励', '奖励']);
  const penalty = pickAny(raw, ['任务惩罚', '失败惩罚', '惩罚']);

  // 若无标准任务名，尝试取第一个【xxx:yyy】的内容作为标题
  const finalTitle = title || pickFirstBracketContent(raw);
  if (!finalTitle) return null;

  const idBase = (finalTitle || `task-${index}`).replace(/\s+/g, '-').slice(0, 40);
  const id = `xitong-${index}-${idBase}`;

  return {
    id,
    category,
    title: finalTitle,
    goal,
    deadline,
    difficulty,
    reward,
    penalty,
    raw,
  };
}

/** 从多个 <xitong> 文本块中解析所有任务 */
export function parseXitongBlocksToTasks(blocks: string[]): SystemTask[] {
  const tasks: SystemTask[] = [];
  (blocks || []).forEach((b, idx) => {
    const t = parseXitongBlockToTask(b, idx);
    if (t) tasks.push(t);
  });
  return tasks;
}

/** 从整段文本中提取所有 <xitong> 块内容（用于跨楼层聚合任务） */
export function extractXitongBlocksFromText(input: string): string[] {
  const raw = input ?? '';
  const blocks: string[] = [];
  raw.replace(/<xitong[^>]*>([\s\S]*?)<\/xitong>/gi, (_m, inner) => {
    blocks.push(String(inner ?? '').trim());
    return '';
  });
  raw.replace(/(^|\n)\s*<\s*xitong\s*>\s*[:：]?\s*([^\n]*)/gi, (_m, _prefix, inner) => {
    blocks.push(String(inner ?? '').trim());
    return '';
  });
  return blocks.filter(Boolean);
}

