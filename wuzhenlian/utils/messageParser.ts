/**
 * 消息解析工具
 * 从最新楼层消息中解析 maintext 和 option/options 标签
 * 严格按 @types/function/chat_message.d.ts：getChatMessages(range, { role })、-1 表示最新楼层
 */

declare function getChatMessages(
  range: string | number,
  options?: { role?: 'all' | 'system' | 'assistant' | 'user' },
): Array<{ message: string; message_id: number; role: string }>;
declare function getLastMessageId(): number;

/** 移除 thinking/<think>/think_nya~ 块，酒馆规则输出顺序为 <think> -> <maintext>，优先保留 maintext */
function stripThinking(cleaned: string): string {
  let s = cleaned
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // 酒馆默认 </think>
    .replace(/<think_nya~>[\s\S]*?<\/think_nya~>/gi, '');
  // 处理未闭合的<think>：移除 <think> 至 <maintext> 之间的内容，保留 maintext
  const unclosedThink = s.search(/<think>/i);
  const maintextStart = s.search(/<maintext>/i);
  if (unclosedThink !== -1 && maintextStart !== -1 && unclosedThink < maintextStart) {
    s = s.substring(0, unclosedThink) + s.substring(maintextStart);
  } else if (unclosedThink !== -1 && maintextStart === -1) {
    s = s.substring(0, unclosedThink);
  }
  // 处理未闭合的 <think_nya~>
  const unclosedNya = s.search(/<think_nya~>/i);
  const maintextStart2 = s.search(/<maintext>/i);
  if (unclosedNya !== -1 && maintextStart2 !== -1 && unclosedNya < maintextStart2) {
    s = s.substring(0, unclosedNya) + s.substring(maintextStart2);
  } else if (unclosedNya !== -1 && maintextStart2 === -1) {
    s = s.substring(0, unclosedNya);
  }
  const ts = s.search(/<thinking>/i);
  if (ts !== -1) s = s.substring(0, ts);
  const tnya = s.search(/<think_nya~>/i);
  if (tnya !== -1) s = s.substring(0, tnya);
  return s;
}

/**
 * 解析消息中的正文
 * 注意：只提取不在<thinking>或<think>标签内部的<maintext>或<VN>标签
 * 酒馆规则输出顺序：<think> -> <maintext> -> <option> -> <sum>，优先提取 <maintext>
 */
export function parseMaintext(messageContent: string): string {
  if (!messageContent) return '';
  const cleaned = stripThinking(messageContent);
  // 优先提取 <maintext>（可在顶层或 <VN> 内）
  const mainMatch = cleaned.match(/<maintext>([\s\S]*?)<\/maintext>/gi);
  if (mainMatch && mainMatch.length > 0) {
    const lastMain = mainMatch[mainMatch.length - 1];
    const inner = lastMain.match(/<maintext>([\s\S]*?)<\/maintext>/i);
    if (inner && inner[1].trim()) return inner[1].trim();
  }
  // 其次提取 <VN> 内层（若无 maintext 则取整个 VN 内容，再移除 option/sum 避免混入对话框）
  const vnMatch = cleaned.match(/<VN>([\s\S]*?)<\/VN>/gi);
  if (vnMatch && vnMatch.length > 0) {
    const lastVn = vnMatch[vnMatch.length - 1];
    const inner = lastVn.match(/<VN>([\s\S]*?)<\/VN>/i);
    if (inner && inner[1].trim()) {
      const vnInner = inner[1].trim();
      const withoutOptions = vnInner
        .replace(/<option[\s\S]*?<\/option>/gi, '')
        .replace(/<options>[\s\S]*?<\/options>/gi, '')
        .replace(/<sum>[\s\S]*?<\/sum>/gi, '')
        .trim();
      return withoutOptions || vnInner;
    }
  }
  return '';
}

/**
 * 解析 gametext 行：角色|背景|CG|服饰|表情|对白
 * 返回最后一行的展示文本及游戏状态
 */
export interface GametextLine {
  speaker: string;
  background: string;
  cg: string | null;
  outfit: string | null;
  expression: string | null;
  dialogue: string;
}

/**
 * 解析 gal_engine_v2 为同步数据
 */
export function parseGalEngineSync(messageContent: string): {
  background?: string;
  sprites?: Array<{ characterId: string; outfit: string; expression: string; pos: 'left' | 'center' | 'right' }>;
  info?: string;
} | null {
  if (!messageContent) return null;
  const cleaned = stripThinking(messageContent);
  const m = cleaned.match(/<gal_engine_v2>([\s\S]*?)<\/gal_engine_v2>/i);
  if (!m) return null;
  const inner = m[1];
  const bgM = inner.match(/\[Background\s*\|\s*([^\]]*)\]/i);
  const infoM = inner.match(/\[Info\s*\|\s*([^\]]*)\]/i);
  const parseStand = (regex: RegExp): { characterId: string; outfit: string; expression: string } | null => {
    const r = inner.match(regex);
    if (!r) return null;
    const parts = r[1].split('|').map((p: string) => p.trim());
    const name = parts[0] || '';
    if (!name || name === '旁白') return null;
    let charId = name;
    const n = name.toLowerCase();
    if (['user', '{{user}}', '主角', '玩家'].includes(n)) charId = 'Player';
    return {
      characterId: charId,
      outfit: parts[2] && parts[2] !== 'true' && parts[2] !== 'false' ? parts[2] : '常服',
      expression: parts[1] || '默认',
    };
  };
  const sprites: Array<{ characterId: string; outfit: string; expression: string; pos: 'left' | 'center' | 'right' }> =
    [];
  const l = parseStand(/\[Stand_L\s*\|\s*([^\]]*)\]/i);
  if (l) sprites.push({ ...l, pos: 'left' });
  const c = parseStand(/\[Stand_C\s*\|\s*([^\]]*)\]/i);
  if (c) sprites.push({ ...c, pos: 'center' });
  const r = parseStand(/\[Stand_R\s*\|\s*([^\]]*)\]/i);
  if (r) sprites.push({ ...r, pos: 'right' });
  const result: { background?: string; sprites?: typeof sprites; info?: string } = {};
  if (bgM && bgM[1].trim()) result.background = bgM[1].trim();
  if (infoM && infoM[1].trim()) result.info = infoM[1].trim();
  if (sprites.length > 0) result.sprites = sprites;
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * 解析 [Info|时间|地点/状态] 的 content 部分（即竖线后的整段），拆成时间与地点
 * 格式一般为 "上午 10:00|机关大楼前" 或 "凌晨 02:00|医护室值班"
 */
export function parseInfoSegment(infoContent: string): { timeStr?: string; locationStr?: string } {
  if (!infoContent || !infoContent.trim()) return {};
  const parts = infoContent
    .trim()
    .split('|')
    .map((p: string) => p.trim())
    .filter(Boolean);
  return {
    timeStr: parts[0] || undefined,
    locationStr: parts[1] || undefined,
  };
}

/**
 * 将正文中的「场景名」与背景图库条目匹配。库内名称与正文常不完全一致（括号、空格、时段说明），
 * 仅 `b.name === raw` 时同步地点/对话框背景会失败。
 */
export function matchBackgroundInLibrary(
  raw: string,
  items: Array<{ name: string; url: string }>,
): { name: string; url: string } | null {
  if (!raw?.trim() || !items?.length) return null;

  const strip = (s: string) =>
    s
      .replace(/[\*\[\]'"`「」]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  /** 去掉末尾括注：(夜晚)、（黄昏）等 */
  const stripParen = (s: string) =>
    strip(s)
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const q0 = strip(raw);
  const q1 = stripParen(raw);
  const ql = q0.toLowerCase();
  const q1l = q1.toLowerCase();

  let hit = items.find(b => b.name === q0 || b.name === q1);
  if (hit) return hit;

  hit = items.find(b => {
    const bn = b.name.toLowerCase();
    return bn === ql || bn === q1l;
  });
  if (hit) return hit;

  const subs = items.filter(b => {
    const bn = b.name.toLowerCase();
    if (bn.length < 2) return false;
    return ql.includes(bn) || (q1l.length >= 2 && q1l.includes(bn));
  });
  if (subs.length) return subs.sort((a, b) => b.name.length - a.name.length)[0];

  if (ql.length >= 3) {
    const rev = items.filter(b => b.name.toLowerCase().includes(ql));
    if (rev.length) return rev.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

/**
 * 将中文时间描述转为 hour、minute（用于与基准日期合并）
 * 支持：凌晨 HH:mm、上午 HH:mm、下午 HH:mm、晚上 HH:mm，以及纯 HH:mm
 */
export function parseChineseTimeToHourMinute(timeStr: string): { hour: number; minute: number } | null {
  if (!timeStr || !timeStr.trim()) return null;
  const s = timeStr.trim();
  const hmMatch = s.match(/(\d{1,2}):(\d{2})/);
  if (!hmMatch) return null;
  let hour = parseInt(hmMatch[1], 10);
  const minute = Math.min(59, Math.max(0, parseInt(hmMatch[2], 10)));
  if (hour < 0 || hour > 23) return null;
  if (/下午/.test(s) || /晚上/.test(s)) {
    if (hour >= 1 && hour <= 11) hour += 12; // 下午 3:00 → 15:00，晚上 8:30 → 20:30
  }
  // 凌晨、上午 保持原样（凌晨 02:00=2，上午 10:00=10，上午 12:00=12）
  return { hour: hour % 24, minute };
}

export function parseGametext(messageContent: string): GametextLine[] {
  if (!messageContent) return [];
  const cleaned = stripThinking(messageContent);
  const m = cleaned.match(/<gametext>([\s\S]*?)<\/gametext>/i);
  if (!m) return [];
  const inner = m[1].trim();
  const lines: GametextLine[] = [];
  for (const raw of inner.split('\n')) {
    const parts = raw
      .trim()
      .split('|')
      .map(p => p.trim());
    if (parts.length >= 6) {
      lines.push({
        speaker: parts[0] || '旁白',
        background: parts[1] || '',
        cg: parts[2] && parts[2].toLowerCase() !== 'null' ? parts[2] : null,
        outfit: parts[3] && parts[3].toLowerCase() !== 'null' ? parts[3] : null,
        expression: parts[4] && parts[4].toLowerCase() !== 'null' ? parts[4] : null,
        dialogue: parts[5] || '',
      });
    }
  }
  return lines;
}

/** 单行是否为「角色|场景|...|对白」管道符格式（5～8 段，可选第7/8段为入场/出场动画） */
function isPipeDelimitedLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const parts = t.split('|').map(p => p.trim());
  return parts.length >= 5 && parts.length <= 8 && parts[0].length > 0;
}

/**
 * 判断整段正文是否为管道符对话块（多行 角色|场景|null|...|对白）
 * 与 gametext 格式一致，用于 maintext 内直接输出该格式时的解析
 */
export function isPipeDelimitedDialogueBlock(text: string): boolean {
  if (!text || !text.trim()) return false;
  const lines = text.trim().split('\n');
  return lines.some(l => isPipeDelimitedLine(l));
}

/** 合法的入场动画类名前缀；第7段统一解析 */
const ENTER_ANIM_PREFIX = 'sprite-enter-';
/** 合法的出场动画类名前缀；第7段统一解析 */
const EXIT_ANIM_PREFIX = 'sprite-exit-';
function normalizeAnimationClass(value: string | undefined, prefix: string): string | undefined {
  const v = (value || '').trim();
  if (!v || v.toLowerCase() === 'null') return undefined;
  return v.startsWith(prefix) ? v : undefined;
}

/** 第 6 段（索引 5）是否为 sprite-enter/exit-*；用于识别「只写了 6 段且省略 CG 列」的常见写法 */
function isSpriteAnimSegment(s: string | undefined): boolean {
  const v = (s || '').trim();
  if (!v || v.toLowerCase() === 'null') return false;
  return v.startsWith(ENTER_ANIM_PREFIX) || v.startsWith(EXIT_ANIM_PREFIX);
}

/**
 * 解析管道符对话行（角色|场景|cg|服饰|表情|对白[|第7入场|第8出场]）
 * 第 7 段：入场动画（sprite-enter-*）；第 8 段：出场动画（sprite-exit-*）。
 * 兼容旧写法：仅第 7 段时入场/出场二选一（同段只能有一种前缀）。
 * 兼容 6 段且末段为 sprite-*：视为省略第 3 列 CG，即 角色|场景|服饰|表情|对白|动画（避免把龙袍填进 CG 列导致服饰/表情/对白整体错位、匹配到错误立绘）。
 */
export interface PipeDelimitedLine {
  speaker: string;
  location?: string;
  /** 6 段格式时的 CG（第 3 段），用于 info: 'CG:名称'；null/无 表示清除 CG */
  cg?: string | null;
  dialogue: string;
  /** 6 段格式时的表情，用于 stand 的中间段 */
  expression?: string;
  /** 6 段格式时的服饰，用于 stand 的第三段 */
  outfit?: string;
  /** 第 7 段：立绘入场动画（sprite-enter-*） */
  enterAnimation?: string;
  /** 第 8 段优先；否则兼容旧版第 7 段仅写 sprite-exit-* */
  exitAnimation?: string;
}

export function parsePipeDelimitedDialogueLines(text: string): PipeDelimitedLine[] {
  if (!text || !text.trim()) return [];
  const lines = text.trim().split('\n');
  const result: PipeDelimitedLine[] = [];
  for (const raw of lines) {
    const parts = raw
      .trim()
      .split('|')
      .map(p => p.trim());
    if (parts.length < 5) continue;
    const speaker = parts[0] || '旁白';

    let dialogue: string;
    let location: string | undefined;
    let cg: string | null;
    let expression: string;
    let outfit: string;
    let seg7: string | undefined;
    let seg8: string | undefined;

    const sixPartsAnimOmitCg = parts.length === 6 && isSpriteAnimSegment(parts[5]);
    if (sixPartsAnimOmitCg) {
      location = parts[1] && parts[1].toLowerCase() !== 'null' ? parts[1] : undefined;
      cg = null;
      outfit = parts[2] && parts[2].toLowerCase() !== 'null' ? parts[2] : '默认';
      expression = parts[3] && parts[3].toLowerCase() !== 'null' ? parts[3] : '默认';
      dialogue = (parts[4] ?? '').trim();
      seg7 = parts[5];
      seg8 = undefined;
    } else {
      dialogue = (parts[5] ?? parts[parts.length - 1] ?? '').trim();
      location = parts[1] && parts[1].toLowerCase() !== 'null' ? parts[1] : undefined;
      const rawCg = parts.length >= 6 ? parts[2] : undefined;
      // 区分「显式写了空CG列（7段及以上）」与「6段省略CG列」
      const hasExplicitCgColumn = parts.length >= 7;
      if (hasExplicitCgColumn) {
        // 7段及以上：CG列显式存在，空/null/无 都表示「清除CG」
        cg = rawCg && rawCg.toLowerCase() !== 'null' && rawCg !== '无'
          ? rawCg.replace(/\*+/g, '').trim()
          : '';
      } else {
        cg =
          rawCg && rawCg.toLowerCase() !== 'null' && rawCg !== '无'
            ? rawCg.replace(/\*+/g, '').trim() || null
            : null;
      }
      expression = parts.length >= 6 && parts[4] && parts[4].toLowerCase() !== 'null' ? parts[4] : '默认';
      outfit = parts.length >= 6 && parts[3] && parts[3].toLowerCase() !== 'null' ? parts[3] : '默认';
      seg7 = parts.length >= 7 ? parts[6] : undefined;
      seg8 = parts.length >= 8 ? parts[7] : undefined;
    }

    const enterAnimation = normalizeAnimationClass(seg7, ENTER_ANIM_PREFIX);
    // 出场优先读第 8 段（规范：第 7 入场、第 8 出场）；否则读第 7 段（旧版单段二选一）
    const exitAnimation =
      normalizeAnimationClass(seg8, EXIT_ANIM_PREFIX) ?? normalizeAnimationClass(seg7, EXIT_ANIM_PREFIX);
    result.push({ speaker, location, cg, dialogue, expression, outfit, enterAnimation, exitAnimation });
  }
  return result;
}

/**
 *  stripOptionAndSum 移除 option/sum 等非正文块，用于兜底提取
 */
function stripOptionAndSum(s: string): string {
  let t = s
    .replace(/<option[\s\S]*?<\/option>/gi, '')
    .replace(/<options>[\s\S]*?<\/options>/gi, '')
    .replace(/<sum>[\s\S]*?<\/sum>/gi, '')
    .replace(/<小总结>[\s\S]*?<\/小总结>/gi, '')
    .replace(/<大总结>[\s\S]*?<\/大总结>/gi, '');
  return t.trim();
}

/**
 * 从多种格式提取可展示的对话/正文
 * 优先级：maintext > VN > gal_engine_v2 > gametext > content > prologue > 兜底纯文本
 */
export function parseDisplayableText(messageContent: string): string {
  if (!messageContent) return '';
  const main = parseMaintext(messageContent);
  if (main.trim()) return main;
  const cleaned = stripThinking(messageContent);
  const galM = cleaned.match(/<gal_engine_v2>([\s\S]*?)<\/gal_engine_v2>/i);
  if (galM) return `<gal_engine_v2>${galM[1]}</gal_engine_v2>`;
  const gametext = parseGametext(messageContent);
  if (gametext.length > 0) {
    const last = gametext[gametext.length - 1];
    if (last.dialogue) return last.dialogue;
  }
  const contentM = cleaned.match(/<content>([\s\S]*?)<\/content>/i);
  if (contentM && contentM[1].trim()) return contentM[1].trim();
  const prologueM = cleaned.match(/<prologue>([\s\S]*?)<\/prologue>/i);
  if (prologueM && prologueM[1].trim()) return prologueM[1].trim();
  // 兜底：LLM 未使用标签时，移除 option/sum 后取剩余正文（至少 20 字视为有效）
  const stripped = stripOptionAndSum(cleaned);
  if (stripped.length >= 20 && !/^<\w+>/.test(stripped)) {
    return stripped;
  }
  return '';
}

/**
 * 清理消息中的思维链内容，返回纯净文本
 * DialogueBox 用于回退显示
 */
export function cleanThinking(messageContent: string): string {
  if (!messageContent) return '';
  let cleaned = messageContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
  cleaned = cleaned.replace(/<think_nya~>[\s\S]*?<\/think_nya~>/gi, '');
  const trimmed = cleaned.trim();
  return trimmed || messageContent.trim();
}

/**
 * 将管道符行格式化为展示文本：仅保留角色名+对白，不重复输出相同元数据。
 * 连续相同说话者时仅输出对白，避免「旁白|酒吧|null|null|null」等前缀重复。
 */
function formatPipeLinesForDisplay(lines: PipeDelimitedLine[]): string {
  return lines
    .map(l => (l.speaker && l.speaker !== '旁白' ? `${l.speaker}：${l.dialogue}` : l.dialogue))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 从可能包含 <gametext> 的文本中提取管道符行并解析
 */
function extractAndParsePipeLines(text: string): PipeDelimitedLine[] | null {
  const gametextMatch = text.match(/<gametext>([\s\S]*?)<\/gametext>/i);
  const inner = gametextMatch ? gametextMatch[1].trim() : text.trim();
  if (!inner) return null;
  const lines = parsePipeDelimitedDialogueLines(inner);
  return lines.length > 0 ? lines : null;
}

/**
 * 只显示角色名和正文：从 <maintext>/<gametext> 或管道符行中提取，不显示背景/CG/服饰/表情。
 * 与剧情记录、小说导出共用，保证展示一致。避免重复输出相同元数据前缀。
 */
export function cleanTextForDisplay(text: string): string {
  if (!text || !text.trim()) return '';
  // 1. 优先从 <maintext> 或 <VN> 提取
  const maintext = parseMaintext(text);
  if (maintext.trim()) {
    const pipeLines = isPipeDelimitedDialogueBlock(maintext)
      ? parsePipeDelimitedDialogueLines(maintext)
      : extractAndParsePipeLines(maintext);
    if (pipeLines && pipeLines.length > 0) {
      return formatPipeLinesForDisplay(pipeLines);
    }
    return maintext;
  }
  const dialogMatches = text.match(/\[Dialog\|(.*?)\]/g);
  if (dialogMatches && dialogMatches.length > 0) {
    const contents = dialogMatches.map(m => m.replace(/\[Dialog\||\]/g, ''));
    return contents.join('\n\n');
  }
  if (text.includes('<gametext>')) {
    const lines = parseGametext(text);
    if (lines.length > 0) {
      return formatPipeLinesForDisplay(lines.map(l => ({ speaker: l.speaker, dialogue: l.dialogue })));
    }
  }
  if (text.includes('<gal_engine_v2>')) {
    const cleaned = text
      .replace(/<[^>]+>/g, '')
      .replace(/\[.*?\]/g, '')
      .trim();
    if (cleaned) return cleaned;
  }
  const trimmed = text.trim();
  if (trimmed && trimmed.includes('|')) {
    const lines = trimmed
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const pipeLines = lines
      .map(l => {
        const parts = l.split('|').map(p => p.trim());
        if (parts.length >= 5) {
          const speaker = parts[0];
          const dialogue = parts[parts.length - 1];
          return { speaker: speaker || '旁白', dialogue };
        }
        return null;
      })
      .filter((x): x is { speaker: string; dialogue: string } => x !== null);
    if (pipeLines.length > 0) {
      return formatPipeLinesForDisplay(pipeLines);
    }
  }
  const cleaned = cleanThinking(text);
  if (cleaned) return cleaned;
  return text.trim();
}

/**
 * 解析消息中的选项
 * 支持两种格式：
 * 1. 带 id: <option id="A">选项文本</option>
 * 2. 不带 id: <option>\nA. 选项1\nB. 选项2\n</option>
 */
export interface Option {
  id: string;
  text: string;
}

export function parseOptions(messageContent: string): Option[] {
  if (!messageContent) return [];

  // 先移除 thinking、<think>、think_nya~ 标签
  let cleaned = messageContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<think_nya~>[\s\S]*?<\/think_nya~>/gi, '');

  const thinkingStart = cleaned.search(/<thinking>/i);
  if (thinkingStart !== -1) cleaned = cleaned.substring(0, thinkingStart);
  const redactedStart = cleaned.search(/<think>/i);
  if (redactedStart !== -1) cleaned = cleaned.substring(0, redactedStart);
  const thinkNyaStart = cleaned.search(/<think_nya~>/i);
  if (thinkNyaStart !== -1) cleaned = cleaned.substring(0, thinkNyaStart);

  // 严格模式：仅解析 <option ...>...</option>，且只从正文区(maintext)之外解析
  // 目的：避免正文里出现“示例标签文本”时被误判为选项（严重串框）
  let optionsSource = cleaned
    .replace(/<maintext>[\s\S]*?<\/maintext>/gi, '')
    .replace(/<maintext>[\s\S]*?(?=<\/VN>|$)/gi, '');

  // 兼容有些消息会把 VN 包起来，但 option 在 VN 内，去掉 maintext 后继续在剩余内容里找 option
  // 不再使用正文全文作为回退来源。

  const sanitizeOptionText = (raw: string): string => {
    return raw
      .replace(/<\s*\/?\s*option\b[^>]*>/gi, '')
      .replace(/\r/g, '')
      .trim();
  };

  // 第一优先级：先抓带 id 的 option，避免外层无 id 包裹吞掉内层 id 选项
  const optionWithIdRegex = /<option\s+id\s*=\s*["']([^"']*)["']\s*>([\s\S]*?)<\/option>/gi;
  const options: Option[] = [];
  let match: RegExpExecArray | null;
  while ((match = optionWithIdRegex.exec(optionsSource)) !== null) {
    const rawId = (match[1] || '').trim();
    const text = sanitizeOptionText(match[2] || '');
    if (!text) continue;
    options.push({
      id: rawId || String.fromCharCode(65 + options.length),
      text,
    });
  }
  if (options.length > 0) return options;

  // 第二优先级：无 id 的 option；若内容仍包含 option 标签，视为容器块，跳过
  const optionNoIdRegex = /<option\s*>([\s\S]*?)<\/option>/gi;
  while ((match = optionNoIdRegex.exec(optionsSource)) !== null) {
    const inner = match[1] || '';
    if (/<\s*option\b/i.test(inner)) continue;
    const text = sanitizeOptionText(inner);
    if (!text) continue;
    options.push({
      id: String.fromCharCode(65 + options.length),
      text,
    });
  }
  return options;
}

/**
 * 从楼层原文抽出供 DialogueBox 解析的正文：必须保留管道符与标签结构。
 * 不可使用 cleanTextForDisplay（会去掉管道符，导致立绘/背景/动画解析失效）。
 * 用于 parseMaintext/parseDisplayableText 因未闭合标签等返回空时的兜底。
 */
export function extractStructuredBodyForTavernDialogue(messageContent: string): string {
  if (!messageContent?.trim()) return '';
  const s0 = parseMaintext(messageContent);
  if (s0.trim()) return s0.trim();

  const s = cleanThinking(messageContent);
  let mt = s.match(/<maintext>([\s\S]*?)<\/maintext>/i);
  if (!mt) mt = s.match(/<maintext>([\s\S]+?)(?=<\/VN>|<\/maintext>|$)/i);
  if (mt?.[1]?.trim()) return mt[1].trim();

  let vn = s.match(/<VN>([\s\S]*?)<\/VN>/i);
  if (!vn) vn = s.match(/<VN>([\s\S]+)/i);
  if (vn?.[1]?.trim()) {
    let inner = vn[1]
      .replace(/<option[\s\S]*?<\/option>/gi, '')
      .replace(/<options>[\s\S]*?<\/options>/gi, '')
      .replace(/<sum>[\s\S]*?<\/sum>/gi, '')
      .trim();
    if (inner) return inner;
  }

  const pipeLines = s.split(/\r?\n/).filter(l => isPipeDelimitedLine(l));
  if (pipeLines.length > 0) return pipeLines.join('\n');

  return '';
}

/**
 * 从最新 assistant 消息中读取正文和选项
 * 遍历 0 到 lastMessageId 所有楼层，取最后一条 assistant 消息（避免最新楼层仅为 user 时无法读取正文）
 */
export function loadFromLatestMessage(): {
  maintext: string;
  options: Option[];
  messageId?: number;
  userMessageId?: number;
  fullMessage?: string;
} {
  try {
    const lastMessageId = getLastMessageId();
    if (typeof lastMessageId !== 'number' || lastMessageId < 0) {
      return { maintext: '', options: [] };
    }

    // 获取 0 到 lastMessageId 范围内所有 assistant 消息，取最后一条（确保最新楼层仅为 user 时仍能读到上一轮 assistant 正文）
    const range = lastMessageId >= 0 ? `0-${lastMessageId}` : '-1';
    const messages = getChatMessages(range, { role: 'assistant' });
    if (!messages || messages.length === 0) {
      return { maintext: '', options: [] };
    }

    const latestMsg = messages[messages.length - 1];
    const messageContent = latestMsg.message || '';

    let maintext = parseDisplayableText(messageContent);
    const structured = extractStructuredBodyForTavernDialogue(messageContent);
    if (structured.trim()) {
      // gametext 分支可能只返回最后一行对白，丢失管道符 → 立绘/背景失效；有管道正文时优先用结构化提取
      if (
        !maintext.trim() ||
        (isPipeDelimitedDialogueBlock(structured) && !isPipeDelimitedDialogueBlock(maintext))
      ) {
        maintext = structured;
      }
    }
    const options = parseOptions(messageContent);

    // 查找对应的 user 消息（上一楼）
    let userMessageId: number | undefined;
    if (latestMsg.message_id > 0) {
      const userMessages = getChatMessages(latestMsg.message_id - 1, { role: 'user' });
      if (userMessages && userMessages.length > 0) {
        userMessageId = userMessages[0].message_id;
      }
    }

    return {
      maintext,
      options,
      messageId: latestMsg.message_id,
      userMessageId,
      fullMessage: messageContent,
    };
  } catch (error) {
    console.error('❌ [messageParser] 加载最新消息失败:', error);
    return { maintext: '', options: [] };
  }
}
