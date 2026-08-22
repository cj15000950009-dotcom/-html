import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import inkNameFontUrl from '../../assets/fonts/HanYiShangWeiShouShuW.ttf';
import { dialogueFontOf, nameBoxFontOf } from '../../fontSettings';
import { fantasyElegantExternalUrls } from '../../skins/fantasyElegantExternalUrls';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { useImageCheck } from '../../hooks/useImageCheck';
import {
  BottomBarControlId,
  Character,
  CharacterId,
  Choice,
  CustomFolder,
  DialogueBoxLayoutConfig,
  GlobalSettings,
  StageSprite,
  SystemTask,
} from '../../types';
import { isPipeDelimitedDialogueBlock, parsePipeDelimitedDialogueLines } from '../../utils/messageParser';
import { getSpriteFolderKind } from '../../utils/spriteFolder';
import { parseXitongBlocksToTasks } from '../../utils/systemTasks';

const LAYOUT_SNAP_PX = 2;

/** 底栏控件 id 全集（部分可能未渲染，对齐时跳过） */
const ALL_BAR_IDS: BottomBarControlId[] = [
  'auto',
  'skip',
  'history',
  'hide',
  'choices',
  'regen',
  'nsfw',
  'sprite',
];

/** 指针拖拽：onDelta 为相对按下点的累计位移；lastEvent 为最近一次 move（可用于 Shift 对称等） */
function bindPointerDrag(
  ev: React.PointerEvent,
  onDelta: (totalDx: number, totalDy: number, lastEvent?: PointerEvent) => void,
  opts?: { onUp?: () => void; snapMovePx?: number; cursor?: string },
) {
  ev.preventDefault();
  ev.stopPropagation();
  const id = ev.pointerId;
  const x0 = ev.clientX;
  const y0 = ev.clientY;
  const cap = ev.currentTarget as HTMLElement | null;
  try {
    cap?.setPointerCapture?.(id);
  } catch {
    /* ignore */
  }
  const prevCursor = document.body.style.cursor;
  const dragCursor = opts?.cursor ?? 'grabbing';
  document.body.style.cursor = dragCursor;
  let raf = 0;
  let pendingDx = 0;
  let pendingDy = 0;
  let lastEv: PointerEvent | undefined;
  const flush = () => {
    raf = 0;
    onDelta(pendingDx, pendingDy, lastEv);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - x0;
    let dy = e.clientY - y0;
    const sp = opts?.snapMovePx ?? LAYOUT_SNAP_PX;
    if (sp > 0) {
      dx = Math.round(dx / sp) * sp;
      dy = Math.round(dy / sp) * sp;
    }
    pendingDx = dx;
    pendingDy = dy;
    lastEv = e;
    if (!raf) raf = requestAnimationFrame(flush);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    try {
      cap?.releasePointerCapture?.(id);
    } catch {
      /* ignore */
    }
    document.body.style.cursor = prevCursor;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      onDelta(pendingDx, pendingDy, lastEv);
    }
    opts?.onUp?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** 解析角色信息格式：[角色名 | 表情 | 服装] */
interface CharacterInfo {
  name: string;
  expression: string;
  outfit: string;
  fullMatch: string;
}

/** 将正文按「"」框起来的角色话语拆成普通文本与说话片段，便于对说话部分单独上色 */
function splitByQuotedSpeech(text: string): Array<{ type: 'normal' | 'speech'; text: string }> {
  if (!text) return [];
  const parts: Array<{ type: 'normal' | 'speech'; text: string }> = [];
  // 识别多种引号：英文 "…"、中文 “…”、以及日文/直角引号 「…」『…』
  const re =
    /([""\u201C\u201D\u300C\u300D\u300E\u300F])([^"\u201C\u201D\u300C\u300D\u300E\u300F]*?)([""\u201C\u201D\u300C\u300D\u300E\u300F])/g;
  let lastEnd = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) parts.push({ type: 'normal', text: text.slice(lastEnd, m.index) });
    parts.push({ type: 'speech', text: m[2] });
    lastEnd = re.lastIndex;
  }
  if (lastEnd < text.length) parts.push({ type: 'normal', text: text.slice(lastEnd) });
  return parts;
}

/** 将段落按 * … * 包裹的心理活动拆成普通与心理活动片段（user 心理活动，对应设置中的「心理活动」颜色） */
function splitByThought(text: string): Array<{ type: 'normal' | 'thought'; text: string }> {
  if (!text) return [];
  const parts: Array<{ type: 'normal' | 'thought'; text: string }> = [];
  const re = /\*([^*]*)\*/g;
  let lastEnd = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) parts.push({ type: 'normal', text: text.slice(lastEnd, m.index) });
    parts.push({ type: 'thought', text: m[1] });
    lastEnd = re.lastIndex;
  }
  if (lastEnd < text.length) parts.push({ type: 'normal', text: text.slice(lastEnd) });
  return parts.length ? parts : [{ type: 'normal' as const, text }];
}

/** 去掉姓名框中的方括号，避免 [Speaker|旁白] 解析出 "[旁白" */
function normalizeSpeakerName(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/^\[+|\]+$/g, '').trim() || '';
}

/**
 * 将 `**【NPC视角切换】**`、单独一行的「镜头切换」等非管道行规范成旁白管道行，否则 parsePipeDelimitedDialogueLines
 * 会丢弃该行，hasViewSwitchMarker 永远不成立，换视角后旧立绘会一直占槽。
 */
function coerceViewSwitchMarkerLinesToNarrationPipe(rawText: string): string {
  return rawText
    .split('\n')
    .map(rawLine => {
      const t = rawLine.trim();
      if (!t) return rawLine;
      if (t.split('|').length >= 5) return rawLine;
      const collapsed = t.replace(/[*【】\s_`#]/g, '');
      if (
        /^npc视角切换$/i.test(collapsed) ||
        /^视角切换$/i.test(collapsed) ||
        /^镜头切换$/i.test(collapsed)
      ) {
        return '旁白|null|null|null|null|视角切换';
      }
      return rawLine;
    })
    .join('\n');
}

/** 去掉对话内容末尾多余的 ]（解析 [角色|表情|服装] 时 remainingText 可能带出） */
function normalizeDialogueText(s: string): string {
  if (!s || typeof s !== 'string') return '';
  const noCgTag = s.replace(/<cg\s+id\s*=\s*[^>]+\s*>/gi, '').trim();
  // 模型常把立绘动画误写进对白（如 </sprite-enter-fade-in>）；动画只应从管道第 7/8 段解析，这里从可见正文剔除
  const noSpritePseudoTags = noCgTag.replace(/<\/?sprite-[\w-]+\s*\/?>/gi, '').trim();
  return noSpritePseudoTags.replace(/([。！？;：,，])[\s]*\][\s]*$/, '$1').trim();
}

/** 从正文提取最后一个 &lt;cg id=xxx&gt;，用于同步 CG（与管道第三列 CG: 等效） */
function cgInfoFromDialogueText(dialogText: string, pipeCg: string | null | undefined): string {
  if (pipeCg != null) {
    const trimmed = String(pipeCg).trim();
    if (trimmed && trimmed.toLowerCase() !== 'null')
      return `CG:${trimmed}`;
    return 'CG:'; // 显式空CG列 → 清除CG
  }
  const matches = [...dialogText.matchAll(/<cg\s+id\s*=\s*([^>\s]+)\s*>/gi)];
  if (matches.length === 0) return '';
  const id = matches[matches.length - 1][1].trim();
  return id ? `CG:${id}` : '';
}

function parseCharacterInfo(text: string): CharacterInfo | null {
  const match = text.match(/^\[([^\|]+)\s*\|\s*([^\|]+)\s*\|\s*([^\]]+)\]/);
  if (match) {
    return {
      name: match[1].trim(),
      expression: match[2].trim(),
      outfit: match[3].trim(),
      fullMatch: match[0],
    };
  }
  return null;
}

const MAX_STANDS_PER_PAGE = 3;
const PAGE_SIZE_CHARS = 400;
// 基于正文自动兜底触发退场动画：当有角色“离开/退场”关键词出现，
// 且 AI 没显式指定 sprite-exit-* 时，自动补默认退场动画，避免立绘无法离场。
const EXIT_KEYWORD_PATTERNS = [
  /离开/,
  /走出/,
  /消失/,
  /转身离去/,
  /走了/,
  /告辞/,
  /退下/,
  /退场/,
  /不见了/,
  /隐入/,
  /溜走/,
  /跑开/,
  /挥手告别/,
  /先行一步/,
];

function applyExitAnimationByKeywords(
  lines: ReturnType<typeof parsePipeDelimitedDialogueLines>,
): ReturnType<typeof parsePipeDelimitedDialogueLines> {
  return lines.map(line => {
    if (!line) return line;
    const speaker = (line.speaker || '').trim();
    const dialogue = line.dialogue || '';

    // 只针对有角色名的行；旁白/系统一般不需要“退场”
    if (!speaker || speaker === '旁白' || /narrator|system/i.test(speaker)) return line;

    // 已经显式指定 sprite-exit-* 时尊重 AI
    if (line.exitAnimation) return line;
    if (!dialogue) return line;

    const shouldExit = EXIT_KEYWORD_PATTERNS.some(re => re.test(dialogue));
    if (!shouldExit) return line;

    return {
      ...line,
      exitAnimation: 'sprite-exit-fade-out',
    };
  });
}

function trySplitBySize(
  currentPage: string,
  currentPageLength: number,
  currentCharacterInfos: CharacterInfo[],
  pageSize: number,
  pages: Array<{ text: string; characterInfos: CharacterInfo[] }>,
): { page: string; length: number } | null {
  if (currentPageLength < pageSize) return null;
  const lastPara = currentPage.lastIndexOf('\n\n');
  const lastLine = currentPage.lastIndexOf('\n');
  const minSplit = pageSize >> 1;
  if (lastPara >= minSplit) {
    const pageText = currentPage.substring(0, lastPara + 1).trim();
    pages.push({ text: pageText, characterInfos: [...currentCharacterInfos] });
    const rest = currentPage.substring(lastPara + 1);
    return { page: rest, length: rest.length };
  }
  if (lastLine >= minSplit) {
    const pageText = currentPage.substring(0, lastLine + 1).trim();
    pages.push({ text: pageText, characterInfos: [...currentCharacterInfos] });
    const rest = currentPage.substring(lastLine + 1);
    return { page: rest, length: rest.length };
  }
  return null;
}

function splitIntoPages(
  text: string,
  pageSize: number = PAGE_SIZE_CHARS,
): Array<{ text: string; characterInfos: CharacterInfo[] }> {
  const t = (text ?? '').trim();
  if (!t) return [{ text: '', characterInfos: [] }];

  const lines = t.split('\n');
  const pages: Array<{ text: string; characterInfos: CharacterInfo[] }> = [];
  let currentPage = '';
  let currentCharacterInfos: CharacterInfo[] = [];
  let currentPageLength = 0;
  let lastDialogueSpeaker: string | null = null;

  const pushCurrentPage = () => {
    if (currentPage.trim()) {
      pages.push({ text: currentPage.trim(), characterInfos: [...currentCharacterInfos] });
      currentPage = '';
      currentPageLength = 0;
      lastDialogueSpeaker = null;
    }
  };

  const appendAndMaybeSplit = (toAppend: string, charInfos: CharacterInfo[]) => {
    currentPage += toAppend;
    currentPageLength += toAppend.length;
    const split = trySplitBySize(currentPage, currentPageLength, charInfos, pageSize, pages);
    if (split) {
      currentPage = split.page;
      currentPageLength = split.length;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const charInfo = parseCharacterInfo(line.trim());

    if (charInfo && charInfo.name !== '旁白') {
      // 新角色说话时，若当前页已有内容，则强制分页，让新角色从新页开始
      if (currentPage.trim() && lastDialogueSpeaker && lastDialogueSpeaker !== charInfo.name) {
        pushCurrentPage();
        currentCharacterInfos = [];
      }

      if (currentCharacterInfos.length >= MAX_STANDS_PER_PAGE && currentPage.length > 0) {
        pushCurrentPage();
        currentCharacterInfos = [charInfo];
      } else {
        const idx = currentCharacterInfos.findIndex(c => c.name === charInfo.name);
        if (idx >= 0) currentCharacterInfos[idx] = charInfo;
        else currentCharacterInfos.push(charInfo);
      }
      const remainingText = line.replace(/^\[[^\]]+\]\s*/, '');
      if (remainingText.trim()) {
        appendAndMaybeSplit(remainingText + '\n', currentCharacterInfos);
        lastDialogueSpeaker = charInfo.name;
      }
    } else if (charInfo && charInfo.name === '旁白') {
      pushCurrentPage();
      currentCharacterInfos = [charInfo];
      const remainingText = line.replace(/^\[[^\]]+\]\s*/, '');
      if (remainingText.trim()) appendAndMaybeSplit(remainingText + '\n', currentCharacterInfos);
    } else {
      appendAndMaybeSplit(line + '\n', currentCharacterInfos);
      if (i < lines.length - 1) {
        const split = trySplitBySize(currentPage, currentPageLength, currentCharacterInfos, pageSize, pages);
        if (split) {
          currentPage = split.page;
          currentPageLength = split.length;
        }
      }
    }
  }

  if (currentPage.trim()) {
    pages.push({ text: currentPage.trim(), characterInfos: currentCharacterInfos });
  }
  return pages.length > 0 ? pages : [{ text: t, characterInfos: [] }];
}

/** 从单页正文解析地点名：仅当存在显式「地点切换」或「地点：」时才返回，避免分页时因正文模糊匹配导致背景与正文无关、频繁切换 */
function extractLocationFromPageText(pageText: string, locationNames: string[]): string {
  if (!pageText.trim()) return '';
  const explicit =
    pageText.match(/地点切换\s*[：:]\s*([^\s,，。\n]+)/) ?? pageText.match(/地点\s*[：:]\s*([^\s,，。\n]+)/);
  if (explicit) {
    const name = explicit[1].trim();
    if (locationNames.length > 0) {
      const found = locationNames.find(n => n === name || n.includes(name) || name.includes(n));
      return found ?? name;
    }
    return name;
  }
  return '';
}

// --- <xitong> 系统界面：把系统文本从对话框正文剥离 ---
function preprocessXitongBlocks(input: string): { text: string; blocks: string[] } {
  const raw = input ?? '';
  const blocks: string[] = [];
  // 1) 成对标签：<xitong> ... </xitong>
  let text = raw.replace(/<xitong[^>]*>([\s\S]*?)<\/xitong>/gi, (_m, inner) => {
    const idx = blocks.length;
    blocks.push(String(inner ?? '').trim());
    return `<<XITONG:${idx}>>`;
  });
  // 2) 单行前缀：<xitong>: ...
  text = text.replace(/(^|\n)\s*<\s*xitong\s*>\s*[:：]?\s*([^\n]*)/gi, (_m, prefix, inner) => {
    const idx = blocks.length;
    blocks.push(String(inner ?? '').trim());
    return `${prefix}<<XITONG:${idx}>>`;
  });
  return { text, blocks };
}

function consumeXitongTokens(pageText: string, blocks: string[]): { dialogText: string; systemText: string } {
  const tokens = [...(pageText ?? '').matchAll(/<<XITONG:(\d+)>>/g)];
  const picked: string[] = [];
  tokens.forEach(m => {
    const idx = Number(m[1]);
    if (Number.isFinite(idx) && idx >= 0 && idx < blocks.length) {
      const b = blocks[idx];
      if (b && b.trim()) picked.push(b.trim());
    }
  });
  const dialogText = (pageText ?? '')
    .replace(/<<XITONG:\d+>>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const systemText = picked.join('\n\n').trim();
  return { dialogText, systemText };
}

function isXitongSpeaker(name: string): boolean {
  const t = (name ?? '').trim().toLowerCase();
  if (!t) return false;
  return t === 'xitong' || t === '<xitong>' || t.includes('<xitong>');
}

interface DialogueBoxProps {
  speaker: Character | undefined;
  characters?: Character[];
  text: string;
  /** 用于解析 <xitong> 的完整消息原文；若提供则优先用此（酒馆模式下 text 仅为 maintext，xitong 在其外） */
  rawMessageForXitong?: string;
  onNext: () => void;
  onBack: () => void;
  choices?: Choice[];
  onChoice?: (text: string) => void;
  customInputValue: string;
  setCustomInputValue: (val: string | ((prev: string) => string)) => void;
  onSendMessage: (overrideText?: string) => void;
  onRegenerate?: () => void;
  globalSettings?: GlobalSettings;
  isAuto?: boolean;
  onToggleAuto?: () => void;
  onToggleLog?: () => void;
  onHideUI?: () => void;
  onQuickSave?: () => void;
  onQuickLoad?: () => void;
  onQuickSaveAction?: () => void;
  onQuickLoadAction?: () => void;
  onOpenSaveLoad?: () => void;
  autoSaveEnabled?: boolean;
  onAutoSaveToggle?: () => void;
  onClearSaves?: () => void;
  onExportSaves?: () => void;
  onImportSaves?: () => void;
  isAiProcessing?: boolean;
  boxConfig?: DialogueBoxLayoutConfig;
  onUpdateDialogueBoxConfig?: (c: DialogueBoxLayoutConfig) => void;
  /** 合并写入全局设置（如布局编辑、水墨框内边距） */
  onUpdateGlobalSettings?: (patch: Partial<GlobalSettings>) => void;
  onRefreshChoices?: () => void;
  commandStructure: Record<string, string[]>;
  commandTemplates: Record<string, string>;
  onUpdateCommandStructure: (s: Record<string, string[]>) => void;
  onUpdateCommandTemplates: (t: Record<string, string>) => void;
  onSyncGameState?: (data: {
    background?: string;
    sprites?: StageSprite[];
    info?: string;
    dossierUpdates?: { name: string; field: string; value: string }[];
    speakerName?: string;
    systemTasks?: SystemTask[];
    currentPageHasTasks?: boolean;
    /** 当前分屏索引：App 用于在翻页时丢弃底栏手动立绘覆盖 */
    dialogueScreenIndex?: number;
    /** 当前解析用正文指纹：换条消息时 App 丢弃手动立绘覆盖 */
    dialogueRawFingerprint?: string;
  }) => void;
  /** 切换对话框上方的缩小版系统任务弹窗（有 <xitong> 时会自动弹出，也可由此按键切换） */
  onToggleSystemTasksPopover?: () => void;
  backgroundLibrary?: { name: string; url: string }[];
  onOpenSpriteEdit?: () => void;
  onOpenCommandPalette?: () => void;
  forceOpenCommands?: boolean;
  forceOpenChoices?: boolean;
  onCloseCommand?: () => void;
  onCloseChoices?: () => void;
  onRandomNSFW?: () => void;
  /** 全部系统任务（当前消息内所有 <xitong>） */
  systemTasks?: SystemTask[];
  /** 当前分页是否实际出现任务块（用于控制小型面板自动弹出时机） */
  currentPageHasTasks?: boolean;
  nsfwSets?: { id: string; name: string; count: number; folderName?: string }[];
  /** 从指定图集随机/顺序播放一张 NSFW CG */
  onRandomNsfwFromSet?: (setId: string) => void;
  /** 打开详细的 NSFW CG 选择大界面（长按触发） */
  onOpenFullNsfwSelector?: () => void;
  onModifySprite?: () => void;
  tutorialStepId?: string;
  onTutorialEvent?: (id: string) => void;
  /** 立绘库（用于判定某角色文件夹为「头像立绘」还是全身舞台） */
  customLibrary?: CustomFolder[];
}

export const DialogueBox: React.FC<DialogueBoxProps> = ({
  speaker: originalSpeaker,
  characters = [],
  text: rawText,
  rawMessageForXitong,
  onNext,
  onBack,
  choices,
  onChoice,
  customInputValue,
  setCustomInputValue,
  onSendMessage,
  onRegenerate,
  globalSettings,
  isAuto,
  onToggleAuto,
  onToggleLog,
  onHideUI,
  onQuickSave,
  onQuickLoad,
  onQuickSaveAction,
  onQuickLoadAction,
  onOpenSaveLoad,
  autoSaveEnabled,
  onAutoSaveToggle,
  onClearSaves,
  onExportSaves,
  onImportSaves,
  isAiProcessing,
  boxConfig = { width: 90, height: 320, offsetX: 0, offsetY: 0 },
  onUpdateDialogueBoxConfig,
  onUpdateGlobalSettings,
  onRefreshChoices,
  commandStructure,
  commandTemplates,
  onSyncGameState,
  onToggleSystemTasksPopover,
  backgroundLibrary = [],
  onOpenSpriteEdit,
  onOpenCommandPalette,
  forceOpenCommands,
  onCloseCommand,
  forceOpenChoices,
  onCloseChoices,
  onRandomNSFW,
  nsfwSets,
  onRandomNsfwFromSet,
  onOpenFullNsfwSelector,
  onModifySprite,
  tutorialStepId,
  onTutorialEvent,
  customLibrary = [],
}) => {
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [isCommandsOpen, setIsCommandsOpen] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(Object.keys(commandStructure)[0] || '');
  const [isTyping, setIsTyping] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isNsfwPickerOpen, setIsNsfwPickerOpen] = useState(false);
  /** 布局编辑：底栏多选（用于组对齐）；正文区是否高亮为「可对齐目标」 */
  const [layoutBarPick, setLayoutBarPick] = useState<Set<BottomBarControlId>>(() => new Set());
  const [layoutTextPick, setLayoutTextPick] = useState(false);
  const bottomBarRowRef = useRef<HTMLDivElement | null>(null);
  const globalSettingsRef = useRef(globalSettings);
  const layoutBarPickRef = useRef(layoutBarPick);
  useEffect(() => {
    globalSettingsRef.current = globalSettings;
  }, [globalSettings]);
  useEffect(() => {
    layoutBarPickRef.current = layoutBarPick;
  }, [layoutBarPick]);

  const boxConfigRef = useRef(boxConfig);
  useEffect(() => {
    boxConfigRef.current = boxConfig;
  }, [boxConfig]);

  useEffect(() => {
    const styleId = 'ink-jianghu-name-font-face';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face {
  font-family: "HanYiShangWeiShouShuW";
  src: url("${inkNameFontUrl}") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}`;
    document.head.appendChild(style);
  }, []);
  useEffect(() => {
    if (forceOpenCommands) {
      setIsCommandsOpen(true);
      setIsDecisionOpen(false);
    }
  }, [forceOpenCommands]);

  useEffect(() => {
    if (forceOpenChoices) {
      setIsDecisionOpen(true);
      setIsCommandsOpen(false);
    }
  }, [forceOpenChoices]);

  useEffect(() => {
    if (forceOpenChoices) {
      setIsDecisionOpen(true);
      setIsCommandsOpen(false);
    }
  }, [forceOpenChoices]);

  /** 支持管道符对话块、gal_engine_v2、[角色|表情|服装] 三种格式；优先解析管道符，只展示对白与姓名框 */
  const screens = useMemo(() => {
    if (!rawText || !rawText.trim()) {
      return [
        {
          background: '',
          stand_L: '',
          stand_C: '',
          stand_R: '',
          speaker: originalSpeaker?.name || '',
          dialog: rawText || '',
          info: '',
          dossierUpdates: [] as { name: string; field: string; value: string }[],
        },
      ];
    }

    // 0. 管道符对话块（角色|场景|null|...|对白）：按页聚合，跨页累积舞台角色，使两人/多人立绘同时在场
    if (isPipeDelimitedDialogueBlock(rawText)) {
      const parsed = parsePipeDelimitedDialogueLines(coerceViewSwitchMarkerLinesToNarrationPipe(rawText));
      const lines =
        globalSettings?.spriteAutoExitFromDialogueKeywords === true ? applyExitAnimationByKeywords(parsed) : parsed;
      if (lines.length > 0) {
        const locationNames = backgroundLibrary.map(b => b.name);
        // 单页容量：控制在约 260 字左右，更适配当前对话框高度
        const PAGE_CHARS = 260;
        const pages: (typeof lines)[] = [];
        let current: typeof lines = [];
        let len = 0;
        let lastSpeakerForPage: string | null = null;
        const normalizePipeSpeakerName = (s: string) =>
          // 防止你这种写法 `靖-武帝` / `萧-让` 与 `靖武帝` / `萧让` 被当成“两个角色”
          s.replace(/[-‐‑‒–—]/g, '').trim();

        for (const line of lines) {
          const rawSpeaker = (line.speaker || '').trim();
          const canonicalSpeaker = normalizePipeSpeakerName(rawSpeaker);
          const isDialogueSpeaker =
            !!rawSpeaker &&
            rawSpeaker !== '旁白' &&
            !/narrator|system/i.test(rawSpeaker) &&
            !isXitongSpeaker(rawSpeaker);
          const speakerKey = isDialogueSpeaker ? canonicalSpeaker : null;

          // 旁白/系统/xitong 等之后第一条「具名角色」行：必须新页。否则 lastSpeakerForPage 在旁白段一直为 null，
          // 不会触发「换人拆页」，靖武帝会与前面旁白同页 → 第一句旁白就同步立绘上场。
          if (current.length > 0 && speakerKey) {
            const lastLine = current[current.length - 1];
            const lr = (lastLine.speaker || '').trim();
            const lastWasNarration = !lr || lr === '旁白' || /narrator|system/i.test(lr) || isXitongSpeaker(lr);
            if (lastWasNarration) {
              pages.push(current);
              current = [];
              len = 0;
            }
          }

          // 只要换了说话人，就强制从新页开始，让每个角色独立一页
          if (speakerKey && lastSpeakerForPage && speakerKey !== lastSpeakerForPage && current.length > 0) {
            pages.push(current);
            current = [];
            len = 0;
          }

          const lineLen = (line.dialogue || '').length + (line.speaker || '').length + 4;
          if (len + lineLen > PAGE_CHARS && current.length > 0) {
            pages.push(current);
            current = [];
            len = 0;
          }

          current.push(line);
          len += lineLen;
          if (speakerKey) lastSpeakerForPage = speakerKey;
        }
        if (current.length > 0) pages.push(current);

        type StandEntry = {
          speaker: string;
          expression: string;
          outfit: string;
          enterAnimation?: string;
          exitAnimation?: string;
        };
        const toStandStr = (u: StandEntry) => `${u.speaker}|${u.expression}|${u.outfit}`;

        // 最多 3 槽位：第 4 人出现时最早角色退场
        type SlotKey = 'L' | 'C' | 'R';
        const SLOTS: SlotKey[] = ['L', 'C', 'R'];
        const FILL_ORDER: SlotKey[] = ['C', 'L', 'R']; // 首个居中，第二、三个占左/右
        let prevStands: Record<SlotKey, StandEntry | null> = { L: null, C: null, R: null };
        let firstTaskPageMarked = false;

        let lastNonEmptyLocation = '';
        const screens = pages.map(pageLines => {
          // 本条消息内、本页开始前已在 L/C/R 上的角色（用于抑制「App 里还留着上一条消息的立绘」导致的重复入场）
          const occupantsAtPageStart = new Set(SLOTS.map(s => prevStands[s]?.speaker).filter(Boolean) as string[]);
          const first = pageLines[0];
          const hasViewSwitchMarker = pageLines.some(l => {
            const t = (l.dialogue || '').trim();
            return /视角切换|npc\s*视角|镜头切换/i.test(t);
          });
          // 背景名：不要只依赖 pageLines[0]（分页后第一行可能是旁白/空字段，导致拿不到背景名）
          // 在本页内找到第一个非空 location，再与 backgroundLibrary 进行模糊匹配。
          const rawBgLoc = (pageLines.find(l => (l.location || '').trim())?.location ?? first?.location ?? '').trim();
          if (rawBgLoc) lastNonEmptyLocation = rawBgLoc;
          // 分页后角色行常把 location 写成 null：这时要继承上一页背景名，否则 App 收到空值就不会换场景
          const bgLocForMatch = rawBgLoc || lastNonEmptyLocation;
          const background = bgLocForMatch
            ? locationNames.length > 0
              ? (locationNames.find(n => n === bgLocForMatch) ??
                locationNames.find(n => bgLocForMatch.startsWith(n) || n.startsWith(bgLocForMatch)) ??
                locationNames.find(n => {
                  const locKw = bgLocForMatch
                    .split(/[,，、\s]+/)
                    .map(k => k.trim())
                    .filter(Boolean);
                  const nKw = n
                    .split(/[,，、\s]+/)
                    .map(k => k.trim())
                    .filter(Boolean);
                  return locKw.some(
                    lk => lk.length >= 2 && nKw.some(nk => nk === lk || nk.includes(lk) || lk.includes(nk)),
                  );
                }) ??
                bgLocForMatch)
              : bgLocForMatch
            : '';

          // 当前页：表情/服饰仍按「最后一行」为准；入场取本页首次、退场取本页末次，避免两行「入+出」合并后只剩退场
          const currentPageMap = new Map<string, StandEntry>();
          const currentPageOrder: string[] = [];
          for (const l of pageLines) {
            const name = normalizePipeSpeakerName((l.speaker || '').trim());
            if (!name || name === '旁白' || /narrator|system/i.test(name)) continue;
            const prevE = currentPageMap.get(name);
            const entry: StandEntry = {
              speaker: name,
              expression: l.expression ?? prevE?.expression ?? '默认',
              outfit: l.outfit ?? prevE?.outfit ?? '常服',
              enterAnimation: prevE?.enterAnimation || l.enterAnimation,
              exitAnimation: l.exitAnimation || prevE?.exitAnimation,
            };
            currentPageMap.set(name, entry);
            if (!currentPageOrder.includes(name)) currentPageOrder.push(name);
          }

          // 明确出现“视角/镜头切换”标记时，先清空旧舞台，避免上一视角角色（如靖武帝）常驻不离场
          const nextStands: Record<SlotKey, StandEntry | null> = hasViewSwitchMarker
            ? { L: null, C: null, R: null }
            : { L: prevStands.L, C: prevStands.C, R: prevStands.R };

          for (const slot of SLOTS) {
            const prev = nextStands[slot];
            if (prev && currentPageMap.has(prev.speaker)) {
              nextStands[slot] = currentPageMap.get(prev.speaker)!;
            }
          }
          const prevNames = new Set(SLOTS.map(s => nextStands[s]?.speaker).filter(Boolean));
          for (const name of currentPageOrder) {
            if (prevNames.has(name)) continue;
            let targetSlot: SlotKey | undefined = FILL_ORDER.find(s => !nextStands[s]);
            if (!targetSlot) {
              // 无空槽：优先挤掉「本页已无任何管道行」的旧角色；若误用「始终占第一个槽」会连续踢掉刚上场的新人
              const occupantNames = SLOTS.map(s => nextStands[s]?.speaker).filter(Boolean) as string[];
              const notOnPage = occupantNames.filter(n => !currentPageOrder.includes(n));
              if (notOnPage.length > 0) {
                const victim = SLOTS.map(s => nextStands[s]?.speaker).find(
                  sp => !!sp && !currentPageOrder.includes(sp),
                );
                targetSlot = victim ? SLOTS.find(s => nextStands[s]?.speaker === victim) : undefined;
              }
              if (!targetSlot) {
                const indices = occupantNames.map(n => currentPageOrder.indexOf(n)).filter(i => i >= 0);
                if (indices.length === 0) {
                  targetSlot = SLOTS.find(s => !!nextStands[s]) || FILL_ORDER[0];
                } else {
                  const earliestIndex = Math.min(...indices);
                  const earliestName = currentPageOrder[earliestIndex];
                  targetSlot = SLOTS.find(s => nextStands[s]?.speaker === earliestName);
                }
              }
            }
            if (targetSlot) {
              const replaced = nextStands[targetSlot]?.speaker;
              nextStands[targetSlot] = currentPageMap.get(name)!;
              if (replaced) prevNames.delete(replaced);
              prevNames.add(name);
            }
          }

          // 合并后若同角色既有入场又有出场：
          // - 若本页存在「仅写出场、未写入场」的管道行（第 8 段退场），属合法「先入场对白、后单独退场行」→ 本屏只播退场，清入场。
          // - 否则视为同一处误填入+出 → 保留入场、去掉退场，避免 CharacterSprite 优先播退场导致秒没。
          for (const slot of SLOTS) {
            const e = nextStands[slot];
            if (!e?.enterAnimation || !e?.exitAnimation) continue;
            const sp = e.speaker;
            const hasExitOnlyLine = pageLines.some(
              l =>
                normalizePipeSpeakerName((l.speaker || '').trim()) === sp &&
                !!l.exitAnimation &&
                !l.enterAnimation,
            );
            const hasEnterLine = pageLines.some(
              l => normalizePipeSpeakerName((l.speaker || '').trim()) === sp && !!l.enterAnimation,
            );
            // 仅退场行、且本页没有任何入场行：视为「上一页已在台上，本屏只播退场」→ 清入场。
            // 若同页先有 sprite-enter 行再有仅退场行（严嵩年对白+退场），必须保留入场，否则会只剩退场类名甚至与 cleanedForNext 叠加导致本屏无立绘。
            if (hasExitOnlyLine && !hasEnterLine) {
              nextStands[slot] = { ...e, enterAnimation: undefined };
            } else if (!hasExitOnlyLine) {
              nextStands[slot] = { ...e, exitAnimation: undefined };
            }
          }

          // 本页中被标记为 exitAnimation 的角色：下一页从舞台移除；但本页仍须把立绘同步给 App（否则入场+退场同页时槽位先被清空 → sprites 为空）
          const exitSpeakers = new Set(
            pageLines
              .filter(l => l.exitAnimation)
              .map(l => normalizePipeSpeakerName((l.speaker || '').trim()))
              .filter(Boolean),
          );

          const displayStands: Record<SlotKey, StandEntry | null> = {
            L: nextStands.L,
            C: nextStands.C,
            R: nextStands.R,
          };

          const cleanedForNext: Record<SlotKey, StandEntry | null> = {
            L: nextStands.L,
            C: nextStands.C,
            R: nextStands.R,
          };
          SLOTS.forEach(slot => {
            const prev = cleanedForNext[slot];
            if (prev && exitSpeakers.has(prev.speaker)) {
              cleanedForNext[slot] = null;
            }
          });

          prevStands = cleanedForNext;

          // 必须在下面 strip 之前读取 enter：strip 会去掉 enterAnimation，供下一页 prev 不重复播入场。
          const enterForSlot = (slot: SlotKey): string | undefined => {
            const e = displayStands[slot];
            if (!e?.enterAnimation) return undefined;
            const sp = e.speaker;
            const hasExplicitEnterLine = pageLines.some(
              l => normalizePipeSpeakerName((l.speaker || '').trim()) === sp && !!l.enterAnimation,
            );
            // 本页开始前该角色已在 L/C/R 上、且本页管道没有显式写入场 → 不把入场类名再发给前端（避免跨页沿用仍播入场）
            if (occupantsAtPageStart.has(sp) && !hasExplicitEnterLine) return undefined;
            return e.enterAnimation;
          };

          const stand_L = displayStands.L ? toStandStr(displayStands.L) : '';
          const stand_C = displayStands.C ? toStandStr(displayStands.C) : '';
          const stand_R = displayStands.R ? toStandStr(displayStands.R) : '';
          const stand_L_enter = enterForSlot('L');
          const stand_C_enter = enterForSlot('C');
          const stand_R_enter = enterForSlot('R');
          const stand_L_exit = displayStands.L?.exitAnimation;
          const stand_C_exit = displayStands.C?.exitAnimation;
          const stand_R_exit = displayStands.R?.exitAnimation;

          // 入场动画只应在「本页管道行里首次写下」时传给前端；跨页沿用同一立绘时若保留 entry 引用，
          // 下一页只有旁白、没有该角色新行时不会进 currentPageMap 覆盖，会再带一次 enter → 入场播两遍。
          for (const slot of SLOTS) {
            const e = prevStands[slot];
            if (e) prevStands[slot] = { ...e, enterAnimation: undefined };
          }

          const firstNonSys =
            pageLines.find(l => {
              const sp = (l.speaker || '').trim();
              if (!sp) return false;
              if (sp === '旁白' || /narrator|system/i.test(sp)) return false;
              if (isXitongSpeaker(sp)) return false;
              return true;
            }) || null;

          // 对话框姓名：忽略 <xitong> 行，避免污染姓名框
          const speakerName = firstNonSys
            ? (() => {
                const canonical = normalizePipeSpeakerName(firstNonSys.speaker || '');
                const v = normalizeSpeakerName(canonical || '');
                return v || '旁白';
              })()
            : '';

          const systemLines: string[] = [];
          const dialogLines: string[] = [];
          pageLines.forEach(l => {
            const sp = normalizePipeSpeakerName((l.speaker || '').trim());
            const msg = (l.dialogue || '').trim();
            if (!msg) return;
            if (sp === '旁白' && /^视角切换$/i.test(msg)) return;
            if (isXitongSpeaker(sp)) {
              // 传统“系统说话”形式，整段作为系统文本
              systemLines.push(msg);
              return;
            }
            dialogLines.push(sp && sp !== '旁白' ? `${sp}：${msg}` : msg);
          });

          const rawDialog = dialogLines.join('\n\n');
          // 针对本分页对白+系统行做 <xitong> 解析（说话人为 xitong 时内容在 systemLines，需一并纳入）
          const combinedForXitong = [rawDialog, systemLines.join('\n\n').trim()].filter(Boolean).join('\n\n');
          const { text: xitongText, blocks: xitongBlocksForPage } = preprocessXitongBlocks(combinedForXitong);
          const { dialogText, systemText } = consumeXitongTokens(xitongText, xitongBlocksForPage);
          // 系统文本 = 传统 systemLines + 本页对白里通过 <xitong> 提取出的 systemText
          const mergedSystem = [systemLines.join('\n\n').trim(), systemText].filter(Boolean).join('\n\n').trim();
          // 只要这一页的 <xitong> blocks 能解析出任务，就认为这是“任务页”
          const hasTasksOnPage = parseXitongBlocksToTasks(xitongBlocksForPage).length > 0;
          const isFirstTaskPage = !firstTaskPageMarked && hasTasksOnPage;
          if (isFirstTaskPage) firstTaskPageMarked = true;
          const info = cgInfoFromDialogueText(dialogText, first?.cg);
          return {
            background,
            stand_L,
            stand_C,
            stand_R,
            stand_L_enterAnimation: stand_L_enter,
            stand_C_enterAnimation: stand_C_enter,
            stand_R_enterAnimation: stand_R_enter,
            stand_L_exitAnimation: stand_L_exit,
            stand_C_exitAnimation: stand_C_exit,
            stand_R_exitAnimation: stand_R_exit,
            speaker: speakerName,
            dialog: normalizeDialogueText(dialogText),
            system: mergedSystem,
            // 标记“本条消息中首次出现任务模板”的分页（用于驱动系统任务小弹窗自动弹出）
            isFirstTaskPage,
            info,
            dossierUpdates: [] as { name: string; field: string; value: string }[],
          };
        });
        return screens;
      }
    }

    // 1. gal_engine_v2 格式（兼容旧楼层）
    const galMatch = rawText.match(/<gal_engine_v2>([\s\S]*?)<\/gal_engine_v2>/i);
    if (galMatch) {
      const inner = galMatch[1];
      const bgM = inner.match(/\[Background\s*\|\s*([^\]]*)\]/i);
      const speakerM = inner.match(/\[Speaker\s*\|\s*([^\]]*)\]/i);
      const dialogM = inner.match(/\[Dialog\s*\|\s*([\s\S]*?)\](?=\s*\[|$)/i);
      const standLM = inner.match(/\[Stand_L\s*\|\s*([^\]]*)\]/i);
      const standCM = inner.match(/\[Stand_C\s*\|\s*([^\]]*)\]/i);
      const standRM = inner.match(/\[Stand_R\s*\|\s*([^\]]*)\]/i);
      const parseStand = (m: RegExpMatchArray | null): string => {
        if (!m) return '';
        const parts = m[1].split('|').map((p: string) => p.trim());
        if (parts.length >= 3) return `${parts[0]}|${parts[1]}|${parts[2]}`;
        if (parts.length >= 2) return `${parts[0]}|${parts[1]}|默认`;
        if (parts.length >= 1) return `${parts[0]}|默认|默认`;
        return '';
      };
      const rawDialog = normalizeDialogueText((dialogM?.[1] || '').trim().replace(/\r\n/g, '\n'));
      const { text, blocks } = preprocessXitongBlocks(rawDialog);
      const { dialogText, systemText } = consumeXitongTokens(text, blocks);
      const infoGal = cgInfoFromDialogueText(dialogText, null);
      const baseScreen = {
        background: (bgM?.[1] || '').trim(),
        stand_L: parseStand(standLM),
        stand_C: parseStand(standCM),
        stand_R: parseStand(standRM),
        speaker: normalizeSpeakerName((speakerM?.[1] || originalSpeaker?.name || '旁白').trim() || '') || '旁白',
        dialog: normalizeDialogueText(dialogText),
        system: systemText,
        info: infoGal,
        dossierUpdates: [],
      };
      // 若整条 Dialog 中解析出了系统任务，则视为“只有一页且为首次任务页”
      const hasTasks = parseXitongBlocksToTasks(blocks).length > 0;
      return [{ ...baseScreen, isFirstTaskPage: hasTasks }];
    }

    // 2. [角色|表情|服装] 多行分页格式
    const { text: xitongWrapped, blocks: xitongBlocks } = preprocessXitongBlocks(rawText);
    const pages = splitIntoPages(xitongWrapped);
    const locationNames = backgroundLibrary.map(b => b.name);
    let firstTaskPageMarked = false;
    const screensRaw = pages.map(({ text: dialog, characterInfos }) => {
      const { dialogText, systemText } = consumeXitongTokens(dialog, xitongBlocks);
      const seenNames = new Set<string>();
      const uniqueInfos = characterInfos.filter(c => {
        if (seenNames.has(c.name)) return false;
        seenNames.add(c.name);
        return true;
      });
      const first = uniqueInfos[0];
      const speakerName =
        normalizeSpeakerName(first?.name || originalSpeaker?.name || (dialogText.trim() ? '旁白' : '')) ||
        (dialogText.trim() ? '旁白' : '');
      const toStand = (c: CharacterInfo) => `${c.name}|${c.expression}|${c.outfit}`;
      const background = extractLocationFromPageText(dialogText, locationNames);
      // 根据本分页中出现的 XITONG 占位符，找出对应 blocks 判断是否有任务
      const tokenMatches = [...dialog.matchAll(/<<XITONG:(\d+)>>/g)];
      const blocksForPage = tokenMatches
        .map(m => {
          const idx = Number(m[1]);
          return Number.isFinite(idx) && idx >= 0 && idx < xitongBlocks.length ? xitongBlocks[idx] : null;
        })
        .filter((b): b is string => !!b && !!b.trim());
      const hasTasksOnPage = parseXitongBlocksToTasks(blocksForPage).length > 0;
      const isFirstTaskPage = !firstTaskPageMarked && hasTasksOnPage;
      if (isFirstTaskPage) firstTaskPageMarked = true;
      const infoBracket = cgInfoFromDialogueText(dialogText, null);
      return {
        background,
        stand_L: uniqueInfos[2] ? toStand(uniqueInfos[2]) : '',
        stand_C: uniqueInfos[0] ? toStand(uniqueInfos[0]) : '',
        stand_R: uniqueInfos[1] ? toStand(uniqueInfos[1]) : '',
        speaker: speakerName,
        dialog: normalizeDialogueText(dialogText),
        system: systemText,
        info: infoBracket,
        dossierUpdates: [] as { name: string; field: string; value: string }[],
        isFirstTaskPage,
      };
    });
    // 同条消息内：无显式地点的分页继承上一页背景，避免每翻一页就换图
    let lastBg = '';
    return screensRaw.map(s => {
      if (s.background) lastBg = s.background;
      else if (lastBg) return { ...s, background: lastBg };
      return s;
    });
  }, [rawText, originalSpeaker, backgroundLibrary, globalSettings?.spriteAutoExitFromDialogueKeywords]);

  // 本条消息内所有 <xitong> 块（用于全量解析任务并同步到 App）；使用 rawMessageForXitong 因 xitong 在 maintext 之外
  const xitongBlocks = useMemo(
    () => preprocessXitongBlocks((rawMessageForXitong ?? rawText) || '').blocks,
    [rawMessageForXitong, rawText],
  );
  const allTasksFromMessage = useMemo(() => parseXitongBlocksToTasks(xitongBlocks), [xitongBlocks]);

  const currentScreen = screens[currentScreenIndex] || screens[0];
  const isLastScreen = currentScreenIndex === screens.length - 1;
  const displaySpeakerName = useMemo(() => {
    if (!currentScreen?.speaker) return '';
    const raw = normalizeSpeakerName(currentScreen.speaker);
    const lower = raw.toLowerCase();
    const player = characters.find(c => c.id === CharacterId.PLAYER);
    return (lower === 'user' || lower === '{{user}}') && player?.name ? player.name : raw;
  }, [currentScreen?.speaker, characters]);
  const lastSyncSignature = useRef<string>('');
  const lastSyncedBackground = useRef<string>('');

  // 须先于下方「同步 App」effect：新消息若第 0 页与上一条某一页的 index/背景/立绘槽位字符串完全相同，
  // 会误判「未变化」而跳过 onSyncGameState → 说话人/舞台仍停在上一条（例如严嵩年对白却沿用靖武帝立绘）。
  useEffect(() => {
    setCurrentScreenIndex(0);
    lastSyncedBackground.current = '';
    lastSyncSignature.current = '';
  }, [rawText]);

  // 背景图库（backgroundLibrary）可能在首屏渲染后才异步加载完成。
  // 若第一次同步时背景库尚未包含目标背景名，App 会找不到该背景并保持旧图，
  // 但签名又可能因为 currentScreen.background 字符串不变而被跳过。
  // 因此：图库一旦变化，重置签名，确保同一页会重新同步背景/立绘。
  useEffect(() => {
    lastSyncedBackground.current = '';
    lastSyncSignature.current = '';
  }, [backgroundLibrary]);

  useEffect(() => {
    if (onSyncGameState && currentScreen) {
      // 带上 speaker：同一 index 下若姓名框与槽位字符串曾短暂不一致，仍能强制刷新 App 侧 activeSpeakerName
      const signature = `${currentScreenIndex}-${currentScreen.speaker || ''}-${currentScreen.background}-${currentScreen.stand_L}-${currentScreen.stand_C}-${currentScreen.stand_R}-${currentScreen.stand_L_enterAnimation || ''}-${currentScreen.stand_C_enterAnimation || ''}-${currentScreen.stand_R_enterAnimation || ''}-${currentScreen.stand_L_exitAnimation || ''}-${currentScreen.stand_C_exitAnimation || ''}-${currentScreen.stand_R_exitAnimation || ''}`;
      if (lastSyncSignature.current !== signature) {
        lastSyncSignature.current = signature;
        if (currentScreen.background) lastSyncedBackground.current = currentScreen.background;
        const sprites: StageSprite[] = [];
        const hasL = !!(currentScreen.stand_L || '').trim();
        const hasC = !!(currentScreen.stand_C || '').trim();
        const hasR = !!(currentScreen.stand_R || '').trim();
        const count = [hasL, hasC, hasR].filter(Boolean).length;
        type PosKey = 'left' | 'center' | 'right';
        const getPos = (pos: PosKey) => {
          if (count === 3) {
            if (pos === 'left') return { x: -80, scale: 1, zIndex: 20 };
            if (pos === 'right') return { x: 80, scale: 1, zIndex: 20 };
            return { x: 0, scale: 1, zIndex: 30 };
          }
          if (count === 2) {
            if (hasL && hasR) {
              if (pos === 'left') return { x: -60, scale: 1, zIndex: 20 };
              if (pos === 'right') return { x: 60, scale: 1, zIndex: 25 };
            }
            if (hasL && hasC) {
              if (pos === 'left') return { x: -60, scale: 1, zIndex: 20 };
              return { x: 60, scale: 1, zIndex: 30 };
            }
            if (hasC && hasR) {
              if (pos === 'center') return { x: -60, scale: 1, zIndex: 30 };
              if (pos === 'right') return { x: 60, scale: 1, zIndex: 20 };
            }
            return { x: pos === 'left' ? -60 : pos === 'right' ? 60 : 0, scale: 1, zIndex: 25 };
          }
          return { x: 0, scale: 1, zIndex: 30 };
        };
        const parseStand = (str: string, pos: PosKey, enterAnim?: string, exitAnim?: string) => {
          if (!str) return;
          const parts = str.split('|').map(p => p.trim());
          const name = parts[0] || '';
          const expr = parts[1] && parts[1] !== 'true' && parts[1] !== 'false' ? parts[1] : '默认';
          const rawOutfit = parts[2];
          const outfit = rawOutfit && rawOutfit !== 'true' && rawOutfit !== 'false' ? rawOutfit : '常服';
          if (!name || name === '旁白') return;
          const n = name.toLowerCase().trim();
          let charId = name;
          if (n === 'user' || n === '{{user}}' || n === '主角' || n === '玩家')
            charId = CharacterId.PLAYER;
          const { x, scale, zIndex } = getPos(pos);
          const sprite: StageSprite = {
            // 含槽位，避免同一角色同时占 L/C/R 时 React key 重复；换槽会重挂载立绘（位置过渡略弱于纯 gal_${charId}）
            instanceId: `gal_${pos}_${charId}`,
            characterId: charId,
            outfit,
            expression: expr,
            x,
            y: 0,
            scale,
            zIndex,
          };
          if (enterAnim) sprite.enterAnimation = enterAnim;
          if (exitAnim) sprite.exitAnimation = exitAnim;
          if (getSpriteFolderKind(charId, customLibrary, characters) === 'avatar') {
            sprite.layer = 'avatar';
            sprite.instanceId = `gal_avatar_${pos}_${charId}`;
            sprite.x = 0;
            sprite.y = 0;
            sprite.scale = 1;
            sprite.zIndex = 56;
          }
          sprites.push(sprite);
        };
        const scr = currentScreen as typeof currentScreen & {
          stand_L_enterAnimation?: string;
          stand_C_enterAnimation?: string;
          stand_R_enterAnimation?: string;
          stand_L_exitAnimation?: string;
          stand_C_exitAnimation?: string;
          stand_R_exitAnimation?: string;
        };
        parseStand(currentScreen.stand_L || '', 'left', scr.stand_L_enterAnimation, scr.stand_L_exitAnimation);
        parseStand(currentScreen.stand_C || '', 'center', scr.stand_C_enterAnimation, scr.stand_C_exitAnimation);
        parseStand(currentScreen.stand_R || '', 'right', scr.stand_R_enterAnimation, scr.stand_R_exitAnimation);
        // 当前页有背景时始终传递，确保 App 与分页状态一致（避免回档或状态错乱后背景/立绘失效）
        const rawFp = rawText ?? '';
        const dialogueRawFingerprint = `${rawFp.length}:${rawFp.slice(0, 64)}:${rawFp.slice(-64)}`;
        const payload: {
          background?: string;
          sprites: StageSprite[];
          info?: string;
          dossierUpdates?: { name: string; field: string; value: string }[];
          speakerName?: string;
          systemTasks?: SystemTask[];
          dialogueScreenIndex?: number;
          dialogueRawFingerprint?: string;
        } = {
          sprites,
          dossierUpdates: currentScreen.dossierUpdates,
          dialogueScreenIndex: currentScreenIndex,
          dialogueRawFingerprint,
        };
        if (currentScreen.background && currentScreen.background.trim())
          payload.background = currentScreen.background.trim();
        if (currentScreen.info) payload.info = currentScreen.info;
        if (currentScreen.speaker) payload.speakerName = currentScreen.speaker;
        // 将本条消息所有页的 xitong 块解析为系统任务并同步（仅含【任务名称】的块），供【系统任务】全屏/弹窗显示
        if (allTasksFromMessage.length > 0) {
          payload.systemTasks = allTasksFromMessage;
          const scrAny = currentScreen as any;
          // 仅当“当前分页是本条消息中首次出现任务模板的分页”时，才触发小型系统任务弹窗自动弹出
          if (scrAny && scrAny.isFirstTaskPage) {
            (payload as any).currentPageHasTasks = true;
          }
        }
        onSyncGameState(payload);
      }
    }
  }, [currentScreenIndex, screens, onSyncGameState, currentScreen, allTasksFromMessage, customLibrary, characters]);

  useEffect(() => {
    setDisplayedText('');
    setIsTyping(true);
    let i = 0;
    // 文本预处理：如果正文前缀是“姓名：”且与当前 speaker 一致，则去掉，避免姓名在姓名框和正文中重复
    let fullText = currentScreen.dialog || '';
    if (currentScreen.speaker) {
      const raw = normalizeSpeakerName(currentScreen.speaker);
      const lower = raw.toLowerCase();
      const player = characters.find(c => c.id === CharacterId.PLAYER);
      const displayName = (lower === 'user' || lower === '{{user}}') && player?.name ? player.name : raw;
      if (displayName) {
        const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRe = new RegExp(`^\\s*${escaped}\\s*[：:]\\s*`);
        if (prefixRe.test(fullText)) {
          fullText = fullText.replace(prefixRe, '');
        }
      }
    }
    if (!fullText) {
      setIsTyping(false);
      return;
    }
    const baseSpeed = globalSettings?.typingSpeed || 20;
    const speed = isSkipping ? 1 : baseSpeed;
    // 性能优化：每个 tick 增加多个字符，减少重排/重绘次数，避免“出字一卡一卡”
    const step = isSkipping ? 24 : 6;
    const interval = setInterval(() => {
      setDisplayedText(fullText.slice(0, i));
      i += step;
      if (i > fullText.length) {
        setDisplayedText(fullText);
        clearInterval(interval);
        setIsTyping(false);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [currentScreenIndex, screens, globalSettings?.typingSpeed, isSkipping]);

  /** 进入当前分页的时刻，用于自动播放时保证「整页最短停留」 */
  const pageEnterTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    pageEnterTimeRef.current = Date.now();
  }, [currentScreenIndex]);

  // 自动播放：在非打字、非选择/指令面板、非 AI 处理中时，按设定间隔自动翻页或进入下一条消息
  useEffect(() => {
    let autoTimer: ReturnType<typeof setTimeout> | undefined;
    if (isAuto && !isTyping && !isDecisionOpen && !isCommandsOpen && !isAiProcessing) {
      const autoMs = (globalSettings?.autoInterval ?? 2) * 1000;
      const minTotalMs = (globalSettings?.minPageDisplaySeconds ?? 4) * 1000;
      const elapsed = Date.now() - pageEnterTimeRef.current;
      // 短对白时打字很快结束，仅靠 autoInterval 会显得立绘只出现一两秒；用 max 拉长到「本页至少 minTotalMs」
      const delay = Math.max(autoMs, minTotalMs - elapsed);
      autoTimer = setTimeout(() => {
        if (currentScreenIndex < screens.length - 1) {
          setCurrentScreenIndex(prev => prev + 1);
        } else {
          if (!choices || choices.length === 0) {
            onNext();
          } else {
            setIsDecisionOpen(true);
          }
        }
      }, delay);
    }
    return () => {
      if (autoTimer) clearTimeout(autoTimer);
    };
  }, [
    isAuto,
    isTyping,
    isDecisionOpen,
    isCommandsOpen,
    isAiProcessing,
    currentScreenIndex,
    screens.length,
    choices,
    onNext,
    globalSettings?.autoInterval,
    globalSettings?.minPageDisplaySeconds,
  ]);

  // 点击对话框主体：优先停止打字，其次翻页或结束本条消息
  const handleBoxClick = () => {
    if (globalSettings?.uiLayoutEditMode) return;
    if (isAiProcessing) return;
    if (isTyping) {
      setDisplayedText(currentScreen.dialog || '');
      setIsTyping(false);
      return;
    }

    if (currentScreenIndex < screens.length - 1) {
      setCurrentScreenIndex(prev => prev + 1);
    } else {
      if (choices && choices.length > 0) {
        setIsDecisionOpen(true);
      } else {
        onNext();
      }
    }

    if (tutorialStepId === 'dialogue' && onTutorialEvent) {
      onTutorialEvent('dialogue');
    }
  };

  const isFirstPage = currentScreenIndex === 0;
  const handlePrevClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFirstPage) return;

    if (isTyping) {
      setDisplayedText(currentScreen.dialog || '');
      setIsTyping(false);
      return;
    }

    if (currentScreenIndex > 0) {
      setCurrentScreenIndex(prev => prev - 1);
    } else {
      onBack();
    }
  };

  const handleSendAction = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    onSendMessage(customInputValue);
    setIsDecisionOpen(false);
    setIsCommandsOpen(false);
    if (onCloseCommand) onCloseCommand();
  };

  const handleCloseOverlay = () => {
    setIsDecisionOpen(false);
    setIsCommandsOpen(false);
    if (onCloseCommand) onCloseCommand();
    if (onCloseChoices) onCloseChoices();
  };

  const speakerThemeColor = useMemo(() => {
    if (!currentScreen.speaker) return '#10b981';
    const char =
      characters.find(c => c.name === currentScreen.speaker || c.id === currentScreen.speaker) ||
      (originalSpeaker &&
      (originalSpeaker.name === currentScreen.speaker || originalSpeaker.id === currentScreen.speaker)
        ? originalSpeaker
        : null);
    return char?.themeColor || '#10b981';
  }, [currentScreen.speaker, originalSpeaker, characters]);

  const theme = globalSettings?.theme || 'ink-jianghu';
  const isFantasyElegant = theme === 'fantasy-elegant';
  /** 与水墨共用 PNG 框布局（奇幻典雅无左侧水墨挂件） */
  const useInkDialogueLayout = theme === 'ink-jianghu' || isFantasyElegant;
  const layoutEdit = globalSettings?.uiLayoutEditMode === true;
  const dialogueLayoutShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!layoutEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onUpdateGlobalSettings?.({ uiLayoutEditMode: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layoutEdit, onUpdateGlobalSettings]);

  useEffect(() => {
    if (!layoutEdit) {
      setLayoutBarPick(new Set());
      setLayoutTextPick(false);
    }
  }, [layoutEdit]);

  const bumpBottomBarLayout = (id: BottomBarControlId, next: { offsetXPx?: number; offsetYPx?: number; scale?: number }) => {
    if (!onUpdateGlobalSettings) return;
    const prevAll = globalSettings?.bottomBarControlLayout || {};
    const prev = prevAll[id] || {};
    onUpdateGlobalSettings({
      bottomBarControlLayout: {
        ...prevAll,
        [id]: { ...prev, ...next },
      },
    });
  };

  const snapLayoutCoord = (v: number) => Math.round(v / LAYOUT_SNAP_PX) * LAYOUT_SNAP_PX;

  const getAlignTargetBarIds = (): BottomBarControlId[] => {
    const row = bottomBarRowRef.current;
    if (!row) return [];
    const hasSlot = (id: BottomBarControlId) => !!row.querySelector(`[data-layout-edit-slot="${id}"]`);
    const pick = layoutBarPickRef.current;
    const picked = [...pick].filter(hasSlot);
    if (picked.length > 0) return picked;
    return ALL_BAR_IDS.filter(hasSlot);
  };

  const alignBarsRowCenterX = useCallback(() => {
    if (!onUpdateGlobalSettings) return;
    const row = bottomBarRowRef.current;
    if (!row) return;
    const ids = getAlignTargetBarIds();
    if (ids.length === 0) return;
    const centers: number[] = [];
    for (const id of ids) {
      const el = row.querySelector(`[data-layout-edit-slot="${id}"]`) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      centers.push(r.left + r.width / 2);
    }
    if (centers.length === 0) return;
    const gc = centers.reduce((a, b) => a + b, 0) / centers.length;
    const rr = row.getBoundingClientRect();
    const rc = rr.left + rr.width / 2;
    const delta = snapLayoutCoord(rc - gc);
    if (Math.abs(delta) < 1) return;
    const prevAll = { ...(globalSettingsRef.current?.bottomBarControlLayout || {}) };
    const next = { ...prevAll };
    for (const id of ids) {
      const p = prevAll[id] || {};
      next[id] = { ...p, offsetXPx: snapLayoutCoord((p.offsetXPx ?? 0) + delta) };
    }
    onUpdateGlobalSettings({ bottomBarControlLayout: next });
  }, [onUpdateGlobalSettings]);

  const alignBarsRowCenterY = useCallback(() => {
    if (!onUpdateGlobalSettings) return;
    const row = bottomBarRowRef.current;
    if (!row) return;
    const ids = getAlignTargetBarIds();
    if (ids.length === 0) return;
    const centers: number[] = [];
    for (const id of ids) {
      const el = row.querySelector(`[data-layout-edit-slot="${id}"]`) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      centers.push(r.top + r.height / 2);
    }
    if (centers.length === 0) return;
    const gc = centers.reduce((a, b) => a + b, 0) / centers.length;
    const rr = row.getBoundingClientRect();
    const rc = rr.top + rr.height / 2;
    const delta = snapLayoutCoord(rc - gc);
    if (Math.abs(delta) < 1) return;
    const prevAll = { ...(globalSettingsRef.current?.bottomBarControlLayout || {}) };
    const next = { ...prevAll };
    for (const id of ids) {
      const p = prevAll[id] || {};
      next[id] = { ...p, offsetYPx: snapLayoutCoord((p.offsetYPx ?? 0) + delta) };
    }
    onUpdateGlobalSettings({ bottomBarControlLayout: next });
  }, [onUpdateGlobalSettings]);

  const centerFramedTextPaddingLR = useCallback(() => {
    if (!onUpdateGlobalSettings) return;
    const g = globalSettingsRef.current;
    const L = g?.framedDialoguePaddingLeft ?? 122;
    const R = g?.framedDialoguePaddingRight ?? 88;
    const v = snapLayoutCoord(Math.round((L + R) / 2));
    onUpdateGlobalSettings({ framedDialoguePaddingLeft: v, framedDialoguePaddingRight: v });
  }, [onUpdateGlobalSettings]);

  const centerFramedTextPaddingTB = useCallback(() => {
    if (!onUpdateGlobalSettings) return;
    const g = globalSettingsRef.current;
    const T = g?.framedDialoguePaddingTop ?? 50;
    const B = g?.framedDialoguePaddingBottom ?? 44;
    const v = snapLayoutCoord(Math.round((T + B) / 2));
    onUpdateGlobalSettings({ framedDialoguePaddingTop: v, framedDialoguePaddingBottom: v });
  }, [onUpdateGlobalSettings]);

  const resetFramedTextPadding = useCallback(() => {
    onUpdateGlobalSettings?.({
      framedDialoguePaddingLeft: 122,
      framedDialoguePaddingRight: 88,
      framedDialoguePaddingTop: 50,
      framedDialoguePaddingBottom: 44,
    });
  }, [onUpdateGlobalSettings]);

  const centerGlassTextPaddingLR = useCallback(() => {
    if (!onUpdateDialogueBoxConfig) return;
    const bc = boxConfigRef.current;
    const L = bc.textPaddingLeft ?? 32;
    const R = bc.textPaddingRight ?? 32;
    const v = Math.max(4, Math.round((L + R) / 2));
    onUpdateDialogueBoxConfig({ ...bc, textPaddingLeft: v, textPaddingRight: v });
  }, [onUpdateDialogueBoxConfig]);

  const centerGlassTextPaddingTB = useCallback(() => {
    if (!onUpdateDialogueBoxConfig) return;
    const bc = boxConfigRef.current;
    const T = bc.textPaddingTop ?? 40;
    const B = bc.textPaddingBottom ?? 8;
    const v = Math.max(4, Math.round((T + B) / 2));
    onUpdateDialogueBoxConfig({ ...bc, textPaddingTop: v, textPaddingBottom: v });
  }, [onUpdateDialogueBoxConfig]);

  const resetGlassTextPadding = useCallback(() => {
    if (!onUpdateDialogueBoxConfig) return;
    const bc = boxConfigRef.current;
    onUpdateDialogueBoxConfig({
      ...bc,
      textPaddingLeft: 32,
      textPaddingRight: 32,
      textPaddingTop: 40,
      textPaddingBottom: 8,
    });
  }, [onUpdateDialogueBoxConfig]);

  const framedPaddingVars = useMemo((): React.CSSProperties => {
    const g = globalSettings;
    return {
      ['--framed-pad-top' as string]: `${g?.framedDialoguePaddingTop ?? 50}px`,
      ['--framed-pad-right' as string]: `${g?.framedDialoguePaddingRight ?? 88}px`,
      ['--framed-pad-bottom' as string]: `${g?.framedDialoguePaddingBottom ?? 44}px`,
      ['--framed-pad-left' as string]: `${g?.framedDialoguePaddingLeft ?? 122}px`,
    };
  }, [globalSettings]);
  const framedNamePositionStyle = useMemo((): React.CSSProperties => {
    const g = globalSettings;
    const wm: React.CSSProperties['writingMode'] =
      g?.framedNameWritingMode === 'horizontal' ? 'horizontal-tb' : 'vertical-rl';
    const st: React.CSSProperties = {
      left: `calc(50% - min(43vw, 490px) + ${24 + (g?.framedNameOffsetLeftPx ?? 0)}px)`,
      top: `${12 + (g?.framedNameOffsetTopPx ?? 0)}px`,
      writingMode: wm,
    };
    if (g?.framedNameAreaHeightPx != null) st.height = `${g.framedNameAreaHeightPx}px`;
    if (g?.framedNameAreaWidthPx != null && g.framedNameAreaWidthPx > 0) st.width = `${g.framedNameAreaWidthPx}px`;
    return st;
  }, [globalSettings]);
  const fallbackFont = '"Noto Sans SC"';
  const dialogueFontResolved = globalSettings ? dialogueFontOf(globalSettings) : fallbackFont;
  const nameBoxFontResolved = globalSettings ? nameBoxFontOf(globalSettings) : fallbackFont;
  const boxStyles: Record<
    string,
    {
      bg: string;
      text: string;
      accent: string;
      border: string;
      nameBox: string;
      panelHeader: string;
      panelText: string;
    }
  > = {
    day: {
      bg: 'bg-white/95 border-slate-200 shadow-xl',
      text: 'text-slate-800',
      accent: 'text-emerald-600',
      border: 'border-slate-200',
      nameBox: 'bg-white border-slate-200 text-slate-800 shadow-sm',
      panelHeader: 'bg-slate-50 border-slate-200',
      panelText: 'text-slate-700',
    },
    night: {
      bg: 'bg-slate-950/90 border-white/10 shadow-2xl',
      text: 'text-slate-200',
      accent: 'text-white',
      border: 'border-white/10',
      nameBox: 'bg-slate-950 border-white/10 text-white',
      panelHeader: 'bg-black/20 border-white/10',
      panelText: 'text-white',
    },
    military: {
      bg: 'bg-slate-900/90 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.15)] backdrop-blur-md',
      text: 'text-slate-100',
      accent: 'text-emerald-400',
      border: 'border-emerald-500/50',
      nameBox: 'bg-emerald-600 border-emerald-400 text-white shadow-lg',
      panelHeader: 'bg-slate-900/80 border-emerald-500/30',
      panelText: 'text-emerald-50',
    },
    tech: {
      bg: 'bg-[#0B1120]/95 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)]',
      text: 'text-cyan-100',
      accent: 'text-cyan-400',
      border: 'border-cyan-500/30',
      nameBox: 'bg-[#0B1120] border-cyan-500/30 text-cyan-400',
      panelHeader: 'bg-black/20 border-cyan-500/20',
      panelText: 'text-cyan-400',
    },
    'ink-jianghu': {
      /* 与宣纸底协调：浅底用深墨字，避免整块黑玻璃 */
      bg: 'bg-[#e8e0d4]/92 border-[#3d3832]/50 shadow-[0_16px_48px_rgba(0,0,0,0.38)] backdrop-blur-[2px]',
      text: 'text-[#1f1a17]',
      accent: 'text-[#5c2a2a]',
      border: 'border-[#3d3832]/50',
      nameBox: 'bg-[#2a2520]/92 border-[#8b7355]/45 text-[#f4efe6] shadow-[0_6px_24px_rgba(0,0,0,0.45)]',
      panelHeader: 'bg-[#1c1916]/95 border-[#5c5248]/40',
      panelText: 'text-[#e8e0d4]/95',
    },
    'black-gold': {
      bg: 'bg-[#050505]/95 border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.35)] backdrop-blur-md',
      text: 'text-amber-100',
      accent: 'text-amber-400',
      border: 'border-amber-500/40',
      nameBox: 'bg-[#050505] border-amber-500/60 text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.45)]',
      panelHeader: 'bg-[#050505]/90 border-amber-700/40',
      panelText: 'text-amber-100',
    },
    'fantasy-elegant': {
      bg: 'bg-[#faf6ee]/95 border-amber-800/30 shadow-[0_16px_48px_rgba(120,80,20,0.2)] backdrop-blur-[2px]',
      text: 'text-[#3d2e18]',
      accent: 'text-amber-700',
      border: 'border-amber-800/35',
      nameBox: 'bg-[#fff8e8] border-amber-700/50 text-amber-900 shadow-md',
      panelHeader: 'bg-[#f4ecd8] border-amber-800/30',
      panelText: 'text-[#4a3a22]',
    },
  };
  const ts = boxStyles[theme] || boxStyles['military'];

  const isNarrator =
    !currentScreen.speaker ||
    normalizeSpeakerName(currentScreen.speaker) === '旁白' ||
    normalizeSpeakerName(currentScreen.speaker) === 'Narrator' ||
    normalizeSpeakerName(currentScreen.speaker) === 'System';
  const textColor = isNarrator
    ? globalSettings?.colors?.narrator || ts.text
    : globalSettings?.colors?.dialogue || ts.text;
  const speechColor = globalSettings?.colors?.speech ?? '#fcd34d';
  const thoughtColor = globalSettings?.colors?.thought ?? (isFantasyElegant ? '#b45309' : '#10b981');
  const dialogueShadowEnabled = globalSettings?.dialogueTextShadowEnabled ?? true;
  const dialogueShadowSize = globalSettings?.dialogueTextShadowSize ?? 2;
  const dialogueTextShadow = dialogueShadowEnabled
    ? `0 0 ${dialogueShadowSize}px rgba(0,0,0,0.95), 0 1px ${Math.max(1, Math.round(dialogueShadowSize / 2))}px rgba(0,0,0,0.85)`
    : 'none';
  const nameBoxShadowOn = globalSettings?.nameBoxTextShadowEnabled !== false;
  const nameBoxTextShadowStyle = nameBoxShadowOn
    ? globalSettings?.dialogueSkin === 'glass'
      ? '0 2px 6px rgba(0,0,0,0.75)'
      : '0 1px 3px rgba(0,0,0,0.35)'
    : 'none';
  // 设置弹窗修改后一般会通过 props 传入；但在酒馆内某些注入/热更新场景中可能出现短暂不同步，
  // 因此这里加一层 localStorage 兜底读取，避免用户切换“中午/夜晚/深夜”后仍停留在白日。
  const inkFrameStyle = useMemo(() => {
    const v = globalSettings?.inkDialogueFrameStyle;
    if (v) return v;
    try {
      const saved = localStorage.getItem('spirit_command_settings');
      if (!saved) return 'day';
      const parsed = JSON.parse(saved) as Partial<GlobalSettings>;
      return (parsed.inkDialogueFrameStyle as any) || 'day';
    } catch {
      return 'day';
    }
  }, [globalSettings?.inkDialogueFrameStyle]);
  const inkDialogueFrameUrl =
    inkFrameStyle === 'noon'
      ? inkJianghuExternalUrls.dialogueFrameNoon
      : inkFrameStyle === 'night'
        ? inkJianghuExternalUrls.dialogueFrameNight
        : inkFrameStyle === 'deep-night'
          ? inkJianghuExternalUrls.dialogueFrameDeepNight
          : inkJianghuExternalUrls.dialogueFrame;
  // 外链图片可达性检查：失败时降级为纯色渐变，避免 UI 破损
  const inkFrameOk = useImageCheck(inkDialogueFrameUrl);
  const inkLeftDecorOk = useImageCheck(inkJianghuExternalUrls.leftDecor);
  const inkBaseBgOk = useImageCheck(inkJianghuExternalUrls.baseBg);
  const fantasyFrameOk = useImageCheck(fantasyElegantExternalUrls.dialogueFrame);
  const inkDialogueFrameBgImage = inkFrameOk
    ? `url("${inkDialogueFrameUrl}")`
    : inkFrameStyle === 'noon'
      ? 'linear-gradient(135deg, #3a3530 0%, #2a2520 100%)'
      : inkFrameStyle === 'night'
        ? 'linear-gradient(135deg, #1a1815 0%, #0f0e0c 100%)'
        : inkFrameStyle === 'deep-night'
          ? 'linear-gradient(135deg, #0a0908 0%, #050403 100%)'
          : 'linear-gradient(135deg, #4a4540 0%, #3a3530 100%)';
  const inkLeftDecorBgImage = inkLeftDecorOk
    ? `url("${inkJianghuExternalUrls.leftDecor}")`
    : 'none';
  const inkBaseBgImage = inkBaseBgOk
    ? `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.52)), url(${inkJianghuExternalUrls.baseBg})`
    : 'linear-gradient(135deg, #1a1815 0%, #0f0e0c 100%)';
  const fantasyDialogueFrameBgImage = fantasyFrameOk
    ? `url("${fantasyElegantExternalUrls.dialogueFrame}")`
    : 'linear-gradient(135deg, #f4ecd8 0%, #e8dcc0 100%)';

  const inkBackButtonOk = useImageCheck(inkJianghuExternalUrls.backButton);
  const fantasyPrevPageIconOk = useImageCheck(fantasyElegantExternalUrls.prevPageIcon);
  const inkBackButtonBg = inkBackButtonOk
    ? `url("${inkJianghuExternalUrls.backButton}")`
    : 'none';
  const fantasyPrevPageIconBg = fantasyPrevPageIconOk
    ? `url("${fantasyElegantExternalUrls.prevPageIcon}")`
    : 'none';

  const ControlButton = ({
    icon,
    label,
    onClick,
    onLongPress,
    active,
    disabled,
    colorClass = '',
    className = '',
    minimal = false,
  }: any) => {
    const isInk = theme === 'ink-jianghu';
    const isFantasyBtn = theme === 'fantasy-elegant';
    const isBlackGold = theme === 'black-gold';
    const accentText = isBlackGold
      ? 'text-amber-300'
      : isInk
        ? 'text-white'
        : isFantasyBtn
          ? 'text-amber-200'
          : 'text-emerald-400';
    const activeBorder = isBlackGold
      ? 'border-amber-400/50'
      : isInk
        ? 'border-white/25'
        : isFantasyBtn
          ? 'border-amber-500/50'
          : 'border-emerald-400/50';
    const hoverShadow = isBlackGold
      ? 'hover:shadow-[0_0_20px_rgba(245,158,11,0.45)]'
      : isInk
        ? 'hover:shadow-[0_0_20px_rgba(255,255,255,0.12)]'
        : isFantasyBtn
          ? 'hover:shadow-[0_0_18px_rgba(217,119,6,0.35)]'
          : 'hover:shadow-[0_0_20px_rgba(16,185,129,0.35)]';
    const hoverText =
      colorClass ||
      (isBlackGold
        ? 'group-hover:text-amber-200'
        : isInk
          ? 'group-hover:text-white/80'
          : isFantasyBtn
            ? 'group-hover:text-amber-100'
            : 'group-hover:text-emerald-300');

    const longPressTimeout = useRef<number | null>(null);
    const longPressedRef = useRef(false);

    const clearLongPress = () => {
      if (longPressTimeout.current !== null) {
        window.clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
    };

    const handlePointerDown = () => {
      if (!onLongPress || disabled) return;
      longPressedRef.current = false;
      clearLongPress();
      longPressTimeout.current = window.setTimeout(() => {
        longPressedRef.current = true;
        onLongPress();
        clearLongPress();
      }, 600);
    };

    const handlePointerUp = () => {
      clearLongPress();
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (longPressedRef.current) {
        // 已经触发长按，不再执行点击
        longPressedRef.current = false;
        return;
      }
      if (onClick) onClick();
    };

    return (
      <div className="group relative mx-1 md:mx-1.5 flex flex-col items-center pointer-events-auto">
        <button
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
          onClick={handleClick}
          disabled={disabled}
          className={`relative overflow-hidden flex justify-center items-center w-10 h-10 md:w-12 md:h-12 rounded-[14px] ${
            minimal
              ? 'bg-transparent border-none'
              : `bg-white/10 backdrop-blur-xl border border-white/10 ${
                  disabled ? 'opacity-30 cursor-not-allowed' : `cursor-pointer hover:bg-white/10 ${hoverShadow}`
                }`
          } ${active && !minimal ? `${accentText} ${activeBorder}` : accentText} ${
            !disabled && !active ? hoverText : ''
          } ${className}`}
        >
          {!minimal && (
            <div
              className={`absolute bottom-0 left-0 w-full bg-current transition-all opacity-10 ${
                active ? 'h-full' : 'h-0 group-hover:h-full'
              }`}
            />
          )}
          <div
            className="relative z-10 w-5 h-5 md:w-6 md:h-6 drop-shadow-sm"
            style={
              isInk
                ? { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 6px rgba(0,0,0,0.55))' }
                : undefined
            }
          >
            {icon}
          </div>
        </button>
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-slate-900/95 text-white text-[10px] font-black uppercase opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-100 pointer-events-none">
          {label}
        </div>
      </div>
    );
  };

  const barSlotStyle = (id: BottomBarControlId): React.CSSProperties => {
    const lo = globalSettings?.bottomBarControlLayout?.[id];
    if (!lo) return {};
    return {
      transform: `translate(${lo.offsetXPx ?? 0}px, ${lo.offsetYPx ?? 0}px) scale(${lo.scale ?? 1})`,
      transformOrigin: 'center bottom',
    };
  };

  const barGrip = (id: BottomBarControlId, child: React.ReactNode) => {
    if (!layoutEdit) {
      return (
        <span data-layout-edit-slot={id} style={{ ...barSlotStyle(id), display: 'inline-flex' }}>
          {child}
        </span>
      );
    }
    const picked = layoutBarPick.has(id);
    return (
      <span
        data-layout-edit-slot={id}
        className={`inline-flex items-center gap-0.5 rounded ${picked ? 'ring-2 ring-amber-400/90 ring-offset-1 ring-offset-cyan-950/90' : ''}`}
        style={barSlotStyle(id)}
      >
        <button
          type="button"
          className={`w-2 h-2 shrink-0 rounded-full border pointer-events-auto touch-none ${
            picked ? 'bg-amber-400 border-amber-100' : 'bg-cyan-950 border-cyan-400/55'
          }`}
          title="多选底栏：Shift 点可加选；无 Shift 为单选。再用上方「组水平/垂直居中」。"
          aria-pressed={picked}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            setLayoutBarPick(prev => {
              if (e.shiftKey) {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              }
              return new Set([id]);
            });
          }}
        />
        <span
          role="presentation"
          className="w-3 shrink-0 cursor-grab active:cursor-grabbing rounded-sm bg-cyan-800/90 text-cyan-100 text-[9px] font-bold leading-none py-1 px-0.5 border border-cyan-400/40 select-none pointer-events-auto touch-none"
          title="拖动移动；滚轮缩放"
          onPointerDown={e => {
            const lo0 = globalSettings?.bottomBarControlLayout?.[id] || {};
            const bxo = lo0.offsetXPx ?? 0;
            const byo = lo0.offsetYPx ?? 0;
            bindPointerDrag(
              e,
              (tdx, tdy) => {
                bumpBottomBarLayout(id, { offsetXPx: bxo + tdx, offsetYPx: byo + tdy });
              },
              { cursor: 'grabbing' },
            );
          }}
          onWheel={e => {
            e.preventDefault();
            e.stopPropagation();
            const loNow = globalSettings?.bottomBarControlLayout?.[id];
            const sBase = loNow?.scale ?? 1;
            const next = Math.min(2.2, Math.max(0.45, sBase + (e.deltaY > 0 ? -0.06 : 0.06)));
            bumpBottomBarLayout(id, { scale: next });
          }}
        >
          ┇
        </span>
        <span className="pointer-events-auto">{child}</span>
      </span>
    );
  };

  const textLayoutHighlightClass = !layoutEdit
    ? ''
    : layoutTextPick
      ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-black/25'
      : 'ring-1 ring-cyan-400/45';

  const isBlackGoldOverlay = theme === 'black-gold';
  const isInkOverlay = theme === 'ink-jianghu';
  const isFantasyOverlay = theme === 'fantasy-elegant';
  const overlayBg = isBlackGoldOverlay
    ? 'bg-[#050505] text-amber-100'
    : isInkOverlay
      ? 'bg-[#141210]/98 text-[#e8e0d4]'
      : isFantasyOverlay
        ? 'bg-[#faf6ee] text-amber-950'
        : 'bg-white text-slate-900';
  const overlayBorder = isBlackGoldOverlay
    ? 'border-amber-700/40'
    : isInkOverlay
      ? 'border-[#5c5248]/50'
      : isFantasyOverlay
        ? 'border-amber-700/40'
        : 'border-slate-200';
  const overlayHeader = isBlackGoldOverlay
    ? 'border-b border-amber-800/40 bg-[#050505]/95'
    : isInkOverlay
      ? 'border-b border-[#5c5248]/40 bg-[#1c1916]/98'
      : isFantasyOverlay
        ? 'border-b border-amber-800/35 bg-[#f4ecd8]'
        : 'border-b border-slate-200 bg-slate-50';
  const overlayInput = isBlackGoldOverlay
    ? 'bg-[#0a0a0a] border-amber-800/40 text-amber-100 focus:border-amber-500'
    : isInkOverlay
      ? 'bg-[#0d0c0b] border-[#5c5248]/50 text-[#e8e0d4] focus:border-[#8b7355]'
      : isFantasyOverlay
        ? 'bg-[#fffdf8] border-amber-700/40 text-amber-950 focus:border-amber-600'
        : 'bg-white border-slate-200 text-slate-900 focus:border-emerald-600';
  const overlaySidebar = isBlackGoldOverlay
    ? 'bg-[#050505] border-r border-amber-900/40'
    : isInkOverlay
      ? 'bg-[#181614] border-r border-[#5c5248]/45'
      : isFantasyOverlay
        ? 'bg-[#f4ecd8] border-r border-amber-700/35'
        : 'bg-slate-50 border-r border-slate-200';
  const overlayItemActive = isBlackGoldOverlay
    ? 'bg-amber-900/20 border-l-4 border-l-amber-500 text-amber-200 font-bold'
    : isInkOverlay
      ? 'bg-[#2a2520]/80 border-l-4 border-l-[#8b7355] text-[#f4efe6] font-bold'
      : isFantasyOverlay
        ? 'bg-amber-100/90 border-l-4 border-l-amber-600 text-amber-950 font-bold'
        : 'bg-emerald-50 border-l-4 border-l-emerald-600 text-emerald-800 font-bold';
  const overlayItemInactive = isBlackGoldOverlay
    ? 'hover:bg-amber-900/10 text-amber-200'
    : isInkOverlay
      ? 'hover:bg-[#2a2520]/50 text-[#c4b8a8]'
      : isFantasyOverlay
        ? 'hover:bg-amber-50/90 text-amber-900'
        : 'hover:bg-slate-100 text-slate-600';
  const inkOverlayPanelStyle = isInkOverlay
    ? {
        backgroundImage: inkBaseBgImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
      }
    : undefined;
  const inkTitleFontStyle = isInkOverlay ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;
  const oF = isFantasyOverlay;

  return (
    <>
      {(isDecisionOpen || isCommandsOpen) && (
        <div
          className={`fixed inset-0 z-[100] backdrop-blur-sm pointer-events-auto flex flex-col items-center justify-center p-8 ${
            isBlackGoldOverlay
              ? 'bg-black/70'
              : isInkOverlay
                ? 'bg-[#0a0908]/75'
                : isFantasyOverlay
                  ? 'bg-[#3d2e18]/45'
                  : 'bg-slate-900/60'
          }`}
          onClick={handleCloseOverlay}
        >
          <div
            className={`w-full max-w-6xl h-[70vh] shadow-2xl flex flex-col border ${overlayBg} ${overlayBorder}`}
            onClick={e => e.stopPropagation()}
            style={inkOverlayPanelStyle}
          >
            <div className={`h-16 flex justify-between items-center px-8 shrink-0 ${overlayHeader}`}>
              <div className="flex items-center gap-8 h-full">
                <button
                  onClick={() => {
                    setIsDecisionOpen(true);
                    setIsCommandsOpen(false);
                  }}
                  className={`h-full flex items-center gap-2 border-b-2 font-bold text-sm ${
                    isDecisionOpen
                      ? isBlackGoldOverlay
                        ? 'border-amber-500 text-amber-200'
                        : isInkOverlay
                          ? 'border-white/50 text-white'
                          : oF
                            ? 'border-amber-600 text-amber-900'
                            : 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400'
                  }`}
                  style={inkTitleFontStyle}
                >
                  选项 (CHOICES)
                </button>
                <button
                  onClick={() => {
                    setIsDecisionOpen(false);
                    setIsCommandsOpen(true);
                  }}
                  className={`h-full flex items-center gap-2 border-b-2 font-bold text-sm ${
                    isCommandsOpen
                      ? isBlackGoldOverlay
                        ? 'border-amber-500 text-amber-200'
                        : isInkOverlay
                          ? 'border-white/50 text-white'
                          : oF
                            ? 'border-amber-600 text-amber-900'
                            : 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400'
                  }`}
                  style={inkTitleFontStyle}
                >
                  指令 (COMMANDS)
                </button>
              </div>
              <div className="flex items-center gap-6">
                {isCommandsOpen && onOpenCommandPalette && (
                  <button
                    onClick={onOpenCommandPalette}
                    className={`text-xs font-bold ${
                      isBlackGoldOverlay
                        ? 'text-amber-300 hover:text-amber-200'
                        : isInkOverlay
                          ? 'text-white/70 hover:text-white'
                          : oF
                            ? 'text-amber-800/80 hover:text-amber-950'
                            : 'text-slate-400 hover:text-emerald-600'
                    }`}
                  >
                    ✎ 编辑指令
                  </button>
                )}
                {isDecisionOpen && onRefreshChoices && (
                  <button
                    onClick={onRefreshChoices}
                    disabled={isAiProcessing}
                    className={`text-[10px] font-black flex items-center gap-2 ${
                      isBlackGoldOverlay ? 'text-amber-300' : isInkOverlay ? 'text-white' : oF ? 'text-amber-800' : 'text-emerald-600'
                    } ${isAiProcessing ? 'opacity-50' : ''}`}
                  >
                    <span className={isAiProcessing ? 'animate-spin' : ''}>↻</span>{' '}
                    {isAiProcessing ? '运算中...' : '刷新选项'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
              {isAiProcessing && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin"></div>
                </div>
              )}
              {isDecisionOpen && (
                <div className="flex-1 p-8 overflow-y-auto">
                  {!choices || choices.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-300 italic">暂无选项数据...</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {choices.map(c =>
                        (() => {
                          const safeChoiceText = String(c.text || '')
                            .replace(/<\s*\/?\s*option\b[^>]*>/gi, '')
                            .trim();
                          return (
                            <button
                              key={c.id}
                              onClick={() => onChoice?.(safeChoiceText)}
                              className={`w-full text-left p-6 border rounded-lg hover:shadow-xl transition-all ${
                                isBlackGoldOverlay
                                  ? 'bg-[#050505] border-amber-800/60 hover:border-amber-400 text-amber-100 shadow-[0_8px_24px_rgba(0,0,0,0.7)]'
                                  : isInkOverlay
                                    ? 'bg-black/15 border-white/15 hover:border-white/30 text-white/90'
                                    : oF
                                      ? 'bg-[#fffdf8] border-amber-800/45 hover:border-amber-500 text-amber-950 shadow-sm'
                                      : 'bg-white border-slate-100 hover:border-emerald-300'
                              }`}
                            >
                              <span
                                className={`font-bold text-sm leading-relaxed ${
                                  isBlackGoldOverlay
                                    ? 'text-amber-100'
                                    : isInkOverlay
                                      ? 'text-white'
                                      : oF
                                        ? 'text-amber-950'
                                        : 'text-slate-700'
                                }`}
                              >
                                {safeChoiceText}
                              </span>
                            </button>
                          );
                        })(),
                      )}
                    </div>
                  )}
                </div>
              )}
              {isCommandsOpen && (
                <>
                  <div className={`w-64 shrink-0 flex flex-col ${overlaySidebar}`}>
                    {Object.keys(commandStructure).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCurrentCategory(cat)}
                        className={`w-full text-left px-6 py-4 text-xs font-bold ${currentCategory === cat ? overlayItemActive : overlayItemInactive}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div
                    className={`flex-1 p-8 overflow-y-auto ${isInkOverlay ? 'bg-black/15' : oF ? 'bg-amber-50/40' : 'bg-slate-50/50'}`}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      {commandStructure[currentCategory]?.map(cmdKey => (
                        <button
                          key={cmdKey}
                          onClick={() => setCustomInputValue(commandTemplates[cmdKey] || cmdKey)}
                          className={`w-full border p-5 text-left ${
                            isInkOverlay
                              ? 'bg-black/25 border-white/15 hover:border-white/30'
                              : oF
                                ? 'bg-[#fffdf8] border-amber-800/35 hover:border-amber-500'
                                : 'bg-white border-slate-200 hover:border-emerald-400'
                          }`}
                        >
                          <span
                            className={`block text-sm font-black ${isInkOverlay ? 'text-white' : oF ? 'text-amber-950' : 'text-slate-800'}`}
                          >
                            {cmdKey}
                          </span>
                          <span
                            className={`block text-[10px] line-clamp-2 ${isInkOverlay ? 'text-white/60' : oF ? 'text-amber-800/70' : 'text-slate-400'}`}
                          >
                            {commandTemplates[cmdKey]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div
              className={`h-24 border-t p-6 flex gap-4 shrink-0 items-center ${
                isBlackGoldOverlay
                  ? 'border-amber-900/40 bg-[#050505]'
                  : isInkOverlay
                    ? 'border-white/20 bg-black/15'
                    : oF
                      ? 'border-amber-800/35 bg-[#f4ecd8]'
                      : 'border-slate-200 bg-white'
              }`}
            >
              <input
                value={customInputValue}
                onChange={e => setCustomInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isAiProcessing && handleSendAction(e)}
                placeholder={isAiProcessing ? '正在接收数据流...' : '键入指令或点选上方逻辑...'}
                disabled={isAiProcessing}
                className={`flex-1 h-full px-6 text-sm font-bold shadow-inner ${overlayInput}`}
              />
              <button
                type="button"
                onClick={handleSendAction}
                disabled={isAiProcessing}
                className={`h-full px-12 font-black text-sm uppercase ${
                  isBlackGoldOverlay
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : isInkOverlay
                      ? 'bg-white text-black hover:bg-white/90'
                      : oF
                        ? 'bg-amber-600 text-white hover:bg-amber-500'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                } ${isAiProcessing ? 'opacity-50' : ''}`}
              >
                {isAiProcessing ? '传输中' : '发送'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isDecisionOpen && !isCommandsOpen && (
        <div className="absolute bottom-0 left-0 w-full z-40 flex flex-col items-center pb-2 pointer-events-none">
          {layoutEdit && (
            <div className="pointer-events-auto mb-2 max-w-[min(96vw,820px)] px-3 py-2 rounded-lg bg-cyan-950/95 text-cyan-50 text-[10px] font-bold border border-cyan-400/50 shadow-lg flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span>布局编辑中</span>
                <span className="opacity-80 font-normal text-[9px] flex-1 min-w-[180px]">
                  顶条拖整体 · 四角协调整体留白 · 蓝条调边距（Shift 左右/上下对称）· 小圆点多选底栏 · ┇ 拖移 / 滚轮缩放
                </span>
                <button
                  type="button"
                  className="ml-auto shrink-0 px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600 text-[10px]"
                  onClick={() => onUpdateGlobalSettings?.({ uiLayoutEditMode: false })}
                >
                  退出
                </button>
              </div>
              {onUpdateGlobalSettings && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-cyan-500/30 pt-2">
                  <span className="text-[9px] text-cyan-200/90 shrink-0">底栏</span>
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                    onClick={() => {
                      const row = bottomBarRowRef.current;
                      if (!row) return;
                      const n = new Set<BottomBarControlId>();
                      for (const bid of ALL_BAR_IDS) {
                        if (row.querySelector(`[data-layout-edit-slot="${bid}"]`)) n.add(bid);
                      }
                      setLayoutBarPick(n);
                    }}
                  >
                    全选可见
                  </button>
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                    onClick={() => setLayoutBarPick(new Set())}
                  >
                    清除多选
                  </button>
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                    onClick={alignBarsRowCenterX}
                  >
                    组水平居中
                  </button>
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                    onClick={alignBarsRowCenterY}
                  >
                    组垂直居中
                  </button>
                  <span className="text-[9px] text-cyan-200/90 shrink-0 ml-1">正文</span>
                  <button
                    type="button"
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      layoutTextPick
                        ? 'bg-amber-600/90 border-amber-300 text-white'
                        : 'bg-cyan-800/90 border-cyan-500/35 hover:bg-cyan-700'
                    }`}
                    onClick={() => setLayoutTextPick(v => !v)}
                  >
                    高亮正文区
                  </button>
                  {useInkDialogueLayout ? (
                    <>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                        onClick={centerFramedTextPaddingLR}
                      >
                        框内左右居中
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                        onClick={centerFramedTextPaddingTB}
                      >
                        框内上下居中
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                        onClick={resetFramedTextPadding}
                      >
                        正文留白重置
                      </button>
                    </>
                  ) : (
                    onUpdateDialogueBoxConfig && (
                      <>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                          onClick={centerGlassTextPaddingLR}
                        >
                          左右对称数值
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                          onClick={centerGlassTextPaddingTB}
                        >
                          上下对称数值
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-cyan-800/90 hover:bg-cyan-700 text-[9px] font-bold border border-cyan-500/35"
                          onClick={resetGlassTextPadding}
                        >
                          正文边距重置
                        </button>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          <div
            ref={dialogueLayoutShellRef}
            className={`relative mb-2 pointer-events-auto flex ${layoutEdit ? 'ring-2 ring-cyan-400/90 ring-offset-2 ring-offset-black/30 rounded-lg' : ''}`}
            style={
              useInkDialogueLayout
                ? {
                    width: '100%',
                    maxWidth: 'none',
                    marginLeft: '0',
                    marginBottom: '6px',
                    paddingLeft: '0',
                    paddingRight: '0',
                    transform: `translate(${boxConfig.offsetX ?? 0}px, ${-(boxConfig.offsetY ?? 0)}px) scale(${globalSettings?.inkDialogueScale ?? 1})`,
                    transformOrigin: 'center bottom',
                  }
                : {
                    width: `${boxConfig.width}%`,
                    maxWidth: '1100px',
                    transform: `translate(${boxConfig.offsetX ?? 0}px, ${-(boxConfig.offsetY ?? 0)}px)`,
                  }
            }
          >
            <div className="flex-1 relative">
              {layoutEdit && onUpdateDialogueBoxConfig && (
                <div
                  className="absolute -top-7 left-2 right-2 h-6 z-[80] flex items-center justify-center rounded bg-cyan-900/90 text-cyan-100 text-[10px] font-bold cursor-grab active:cursor-grabbing border border-cyan-500/40 select-none pointer-events-auto touch-none"
                  onPointerDown={e => {
                    const ox = boxConfig.offsetX ?? 0;
                    const oy = boxConfig.offsetY ?? 0;
                    bindPointerDrag(
                      e,
                      (tdx, tdy) => {
                        onUpdateDialogueBoxConfig({
                          ...boxConfig,
                          offsetX: ox + tdx,
                          offsetY: oy + tdy,
                        });
                      },
                      { cursor: 'grabbing' },
                    );
                  }}
                >
                  ⋮⋮ 拖动对话框整体
                </div>
              )}
              {currentScreen.speaker && (
                <>
                  {useInkDialogueLayout ? (
                    <></>
                  ) : (
                    <div className="absolute -top-[44px] left-0 z-50 flex items-stretch h-11">
                      <div className="w-5 shadow-lg" style={{ backgroundColor: speakerThemeColor }}></div>
                      <div className="w-2"></div>
                      <div
                        className={`px-12 flex items-center justify-center shadow-lg border-t-2 ${
                          globalSettings?.dialogueSkin === 'glass'
                            ? 'bg-white/10 backdrop-blur-xl border-white/20'
                            : ts.nameBox
                        }`}
                        style={{ clipPath: 'polygon(0 0, 75% 0, 100% 100%, 0 100%)' }}
                      >
                        <span
                          className={`text-lg tracking-[0.3em] uppercase whitespace-nowrap ${
                            globalSettings?.nameBoxBold ? 'font-black' : 'font-semibold'
                          } ${globalSettings?.nameBoxItalic ? 'italic' : ''} ${
                            globalSettings?.dialogueSkin === 'glass' || theme !== 'day'
                              ? 'text-[#fff6e8]'
                              : 'text-slate-900'
                          }`}
                          style={{
                            fontFamily: nameBoxFontResolved,
                            textShadow: nameBoxTextShadowStyle,
                          }}
                        >
                          {displaySpeakerName}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {(() => {
                const boxOpacity = globalSettings?.boxOpacity ?? 1;
                const bgNoBorder =
                  globalSettings?.dialogueSkin === 'glass'
                    ? 'bg-white/10 backdrop-blur-xl'
                    : ts.bg
                        .split(/\s+/g)
                        .filter(Boolean)
                        .filter(c => !c.startsWith('border-') && !c.startsWith('border[') && !c.startsWith('border-[#'))
                        .join(' ');
                return (
                  <div
                    data-tutorial-id="dialogue"
                    className={`w-full border-2 relative ${useInkDialogueLayout ? 'overflow-hidden border-0' : 'overflow-hidden'} ${
                      globalSettings?.dialogueSkin === 'glass' ? 'border-white/20' : ts.border
                    } ${theme === 'ink-jianghu' ? 'ink-jianghu-dialogue-border' : ''} ${isFantasyElegant ? 'fantasy-elegant-dialogue-border' : ''} ${
                      tutorialStepId === 'dialogue'
                        ? isFantasyElegant
                          ? 'ring-2 ring-amber-500 shadow-[0_0_28px_rgba(217,119,6,0.45)]'
                          : 'ring-2 ring-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.6)]'
                        : ''
                    }`}
                    style={
                      useInkDialogueLayout
                        ? { minHeight: '260px', height: 'auto' }
                        : { height: `${boxConfig.height}px` }
                    }
                  >
                    {/* 只给“背景层”应用透明度，文字层保持不透明 */}
                    {!useInkDialogueLayout && (
                      <div
                        aria-hidden
                        className={`absolute inset-0 pointer-events-none ${bgNoBorder}`}
                        style={{ opacity: boxOpacity }}
                      />
                    )}
                    {theme === 'ink-jianghu' && (
                      <>
                        <div
                          aria-hidden
                          className="ink-jianghu-single-frame"
                          style={{ backgroundImage: inkDialogueFrameBgImage }}
                        />
                        <div
                          aria-hidden
                          className="ink-jianghu-left-decor"
                          style={{ backgroundImage: inkLeftDecorBgImage }}
                        />
                        {displaySpeakerName && (
                          <div
                            className="ink-jianghu-name-vertical"
                            aria-label={`角色姓名-${displaySpeakerName}`}
                            style={{
                              ...framedNamePositionStyle,
                              fontFamily: nameBoxFontResolved,
                              fontWeight: globalSettings?.nameBoxBold ? 700 : undefined,
                              fontStyle: globalSettings?.nameBoxItalic ? 'italic' : undefined,
                              textShadow: nameBoxTextShadowStyle,
                            }}
                          >
                            {displaySpeakerName}
                          </div>
                        )}
                      </>
                    )}
                    {isFantasyElegant && (
                      <>
                        <div
                          aria-hidden
                          className="fantasy-elegant-single-frame"
                          style={{ backgroundImage: fantasyDialogueFrameBgImage }}
                        />
                        {displaySpeakerName && (
                          <div
                            className="fantasy-elegant-name-vertical"
                            aria-label={`角色姓名-${displaySpeakerName}`}
                            style={{
                              ...framedNamePositionStyle,
                              fontFamily: nameBoxFontResolved,
                              fontWeight: globalSettings?.nameBoxBold ? 700 : undefined,
                              fontStyle: globalSettings?.nameBoxItalic ? 'italic' : undefined,
                              textShadow: nameBoxTextShadowStyle,
                            }}
                          >
                            {displaySpeakerName}
                          </div>
                        )}
                      </>
                    )}
                    <div
                      className={`w-full h-full flex flex-col gap-4 relative z-10 ${
                        useInkDialogueLayout ? 'min-h-[260px] cursor-pointer' : 'flex-1 min-h-0 cursor-pointer'
                      }`}
                      style={
                        !useInkDialogueLayout
                          ? {
                              paddingTop: boxConfig.textPaddingTop ?? 40,
                              paddingRight: boxConfig.textPaddingRight ?? 32,
                              paddingBottom: boxConfig.textPaddingBottom ?? 8,
                              paddingLeft: boxConfig.textPaddingLeft ?? 32,
                            }
                          : undefined
                      }
                      onClick={handleBoxClick}
                    >
                      {useInkDialogueLayout ? (
                        <div className={`relative flex-1 min-h-0 ${textLayoutHighlightClass}`}>
                          <div
                            className={isFantasyElegant ? 'fantasy-elegant-content-clip' : 'ink-jianghu-content-clip'}
                            style={framedPaddingVars}
                          >
                            <div
                              className={`ink-jianghu-content-scroll leading-[2.2] tracking-[0.15em] font-bold dialogue-scrollbar-hidden ink-jianghu-dialogue-prose ${
                                globalSettings?.dialogueSkin === 'glass' ? 'dialogue-scrollbar-glass' : ''
                              }`}
                              style={{
                                fontSize: `${globalSettings?.fontSize || 18}px`,
                                color: textColor,
                                fontFamily: dialogueFontResolved,
                                textShadow: dialogueTextShadow,
                              }}
                            >
                              {splitByQuotedSpeech(displayedText).map((seg, i) => {
                                if (seg.type === 'speech')
                                  return (
                                    <span key={i} style={{ color: speechColor }}>
                                      "{seg.text}"
                                    </span>
                                  );
                                return splitByThought(seg.text).map((t, j) =>
                                  t.type === 'thought' ? (
                                    <span key={`${i}-${j}`} style={{ color: thoughtColor }}>
                                      *{t.text}*
                                    </span>
                                  ) : (
                                    <React.Fragment key={`${i}-${j}`}>{t.text}</React.Fragment>
                                  ),
                                );
                              })}
                            </div>
                          </div>
                          {layoutEdit && onUpdateGlobalSettings && (
                            <>
                              <div
                                className="absolute left-0 top-14 bottom-28 w-2 z-[95] cursor-ew-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="左留白（按住 Shift：左右对称）"
                                onPointerDown={e => {
                                  const g = globalSettingsRef.current;
                                  const bL = g?.framedDialoguePaddingLeft ?? 122;
                                  const bR = g?.framedDialoguePaddingRight ?? 88;
                                  const m0 = snapLayoutCoord(Math.round((bL + bR) / 2));
                                  bindPointerDrag(
                                    e,
                                    (tdx, _dy, last) => {
                                      if (last?.shiftKey) {
                                        const v = Math.max(28, snapLayoutCoord(m0 + tdx));
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingLeft: v,
                                          framedDialoguePaddingRight: v,
                                        });
                                      } else {
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingLeft: Math.max(28, bL + tdx),
                                        });
                                      }
                                    },
                                    { cursor: 'ew-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 top-14 bottom-28 w-2 z-[95] cursor-ew-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="右留白（按住 Shift：左右对称）"
                                onPointerDown={e => {
                                  const g = globalSettingsRef.current;
                                  const bL = g?.framedDialoguePaddingLeft ?? 122;
                                  const bR = g?.framedDialoguePaddingRight ?? 88;
                                  const m0 = snapLayoutCoord(Math.round((bL + bR) / 2));
                                  bindPointerDrag(
                                    e,
                                    (tdx, _dy, last) => {
                                      if (last?.shiftKey) {
                                        const v = Math.max(28, snapLayoutCoord(m0 - tdx));
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingLeft: v,
                                          framedDialoguePaddingRight: v,
                                        });
                                      } else {
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingRight: Math.max(28, bR - tdx),
                                        });
                                      }
                                    },
                                    { cursor: 'ew-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-12 right-12 top-0 h-2 z-[95] cursor-ns-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="上留白（按住 Shift：上下对称）"
                                onPointerDown={e => {
                                  const g = globalSettingsRef.current;
                                  const bT = g?.framedDialoguePaddingTop ?? 50;
                                  const bB = g?.framedDialoguePaddingBottom ?? 44;
                                  const m0 = snapLayoutCoord(Math.round((bT + bB) / 2));
                                  bindPointerDrag(
                                    e,
                                    (_dx, tdy, last) => {
                                      if (last?.shiftKey) {
                                        const v = Math.max(20, snapLayoutCoord(m0 + tdy));
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingTop: v,
                                          framedDialoguePaddingBottom: v,
                                        });
                                      } else {
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingTop: Math.max(20, bT + tdy),
                                        });
                                      }
                                    },
                                    { cursor: 'ns-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-12 right-12 bottom-20 h-2 z-[95] cursor-ns-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="下留白（按住 Shift：上下对称）"
                                onPointerDown={e => {
                                  const g = globalSettingsRef.current;
                                  const bT = g?.framedDialoguePaddingTop ?? 50;
                                  const bB = g?.framedDialoguePaddingBottom ?? 44;
                                  const m0 = snapLayoutCoord(Math.round((bT + bB) / 2));
                                  bindPointerDrag(
                                    e,
                                    (_dx, tdy, last) => {
                                      if (last?.shiftKey) {
                                        const v = Math.max(16, snapLayoutCoord(m0 - tdy));
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingTop: v,
                                          framedDialoguePaddingBottom: v,
                                        });
                                      } else {
                                        onUpdateGlobalSettings({
                                          framedDialoguePaddingBottom: Math.max(16, bB - tdy),
                                        });
                                      }
                                    },
                                    { cursor: 'ns-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-0 top-12 w-3.5 h-3.5 z-[96] cursor-nwse-resize touch-none rounded-br bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：左 + 上留白"
                                onPointerDown={e => {
                                  const bL = globalSettings?.framedDialoguePaddingLeft ?? 122;
                                  const bT = globalSettings?.framedDialoguePaddingTop ?? 50;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      onUpdateGlobalSettings({
                                        framedDialoguePaddingLeft: Math.max(28, bL + tdx),
                                        framedDialoguePaddingTop: Math.max(20, bT + tdy),
                                      });
                                    },
                                    { cursor: 'nwse-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 top-12 w-3.5 h-3.5 z-[96] cursor-nesw-resize touch-none rounded-bl bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：右 + 上留白"
                                onPointerDown={e => {
                                  const bR = globalSettings?.framedDialoguePaddingRight ?? 88;
                                  const bT = globalSettings?.framedDialoguePaddingTop ?? 50;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      onUpdateGlobalSettings({
                                        framedDialoguePaddingRight: Math.max(28, bR - tdx),
                                        framedDialoguePaddingTop: Math.max(20, bT + tdy),
                                      });
                                    },
                                    { cursor: 'nesw-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-0 bottom-[4.5rem] w-3.5 h-3.5 z-[96] cursor-nesw-resize touch-none rounded-tr bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：左 + 下留白"
                                onPointerDown={e => {
                                  const bL = globalSettings?.framedDialoguePaddingLeft ?? 122;
                                  const bB = globalSettings?.framedDialoguePaddingBottom ?? 44;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      onUpdateGlobalSettings({
                                        framedDialoguePaddingLeft: Math.max(28, bL + tdx),
                                        framedDialoguePaddingBottom: Math.max(16, bB - tdy),
                                      });
                                    },
                                    { cursor: 'nesw-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 bottom-[4.5rem] w-3.5 h-3.5 z-[96] cursor-nwse-resize touch-none rounded-tl bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：右 + 下留白"
                                onPointerDown={e => {
                                  const bR = globalSettings?.framedDialoguePaddingRight ?? 88;
                                  const bB = globalSettings?.framedDialoguePaddingBottom ?? 44;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      onUpdateGlobalSettings({
                                        framedDialoguePaddingRight: Math.max(28, bR - tdx),
                                        framedDialoguePaddingBottom: Math.max(16, bB - tdy),
                                      });
                                    },
                                    { cursor: 'nwse-resize' },
                                  );
                                }}
                              />
                            </>
                          )}
                        </div>
                      ) : (
                        <div className={`relative flex-1 min-h-0 ${textLayoutHighlightClass}`}>
                          <div
                            className={`leading-[2.2] tracking-[0.15em] h-full overflow-y-auto font-bold dialogue-scrollbar-hidden ${
                              globalSettings?.dialogueSkin === 'glass' ? 'dialogue-scrollbar-glass' : ''
                            }`}
                            style={{
                              fontSize: `${globalSettings?.fontSize || 18}px`,
                              color: textColor,
                              fontFamily: dialogueFontResolved,
                              textShadow: dialogueTextShadow,
                            }}
                          >
                            {splitByQuotedSpeech(displayedText).map((seg, i) => {
                              if (seg.type === 'speech')
                                return (
                                  <span key={i} style={{ color: speechColor }}>
                                    "{seg.text}"
                                  </span>
                                );
                              return splitByThought(seg.text).map((t, j) =>
                                t.type === 'thought' ? (
                                  <span key={`${i}-${j}`} style={{ color: thoughtColor }}>
                                    *{t.text}*
                                  </span>
                                ) : (
                                  <React.Fragment key={`${i}-${j}`}>{t.text}</React.Fragment>
                                ),
                              );
                            })}
                          </div>
                          {layoutEdit && onUpdateDialogueBoxConfig && (
                            <>
                              <div
                                className="absolute left-0 top-6 bottom-16 w-2 z-[95] cursor-ew-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="左内边距（Shift：左右对称）"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const L0 = bc0.textPaddingLeft ?? 32;
                                  const R0 = bc0.textPaddingRight ?? 32;
                                  const m0 = Math.round((L0 + R0) / 2);
                                  bindPointerDrag(
                                    e,
                                    (tdx, _dy, last) => {
                                      const cur = boxConfigRef.current;
                                      if (last?.shiftKey) {
                                        const v = Math.max(4, m0 + tdx);
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingLeft: v,
                                          textPaddingRight: v,
                                        });
                                      } else {
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingLeft: Math.max(4, L0 + tdx),
                                        });
                                      }
                                    },
                                    { cursor: 'ew-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 top-6 bottom-16 w-2 z-[95] cursor-ew-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="右内边距（Shift：左右对称）"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const L0 = bc0.textPaddingLeft ?? 32;
                                  const R0 = bc0.textPaddingRight ?? 32;
                                  const m0 = Math.round((L0 + R0) / 2);
                                  bindPointerDrag(
                                    e,
                                    (tdx, _dy, last) => {
                                      const cur = boxConfigRef.current;
                                      if (last?.shiftKey) {
                                        const v = Math.max(4, m0 - tdx);
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingLeft: v,
                                          textPaddingRight: v,
                                        });
                                      } else {
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingRight: Math.max(4, R0 - tdx),
                                        });
                                      }
                                    },
                                    { cursor: 'ew-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-8 right-8 top-0 h-2 z-[95] cursor-ns-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="上内边距（Shift：上下对称）"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const T0 = bc0.textPaddingTop ?? 40;
                                  const B0 = bc0.textPaddingBottom ?? 8;
                                  const m0 = Math.round((T0 + B0) / 2);
                                  bindPointerDrag(
                                    e,
                                    (_dx, tdy, last) => {
                                      const cur = boxConfigRef.current;
                                      if (last?.shiftKey) {
                                        const v = Math.max(4, m0 + tdy);
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingTop: v,
                                          textPaddingBottom: v,
                                        });
                                      } else {
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingTop: Math.max(4, T0 + tdy),
                                        });
                                      }
                                    },
                                    { cursor: 'ns-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-8 right-8 bottom-0 h-2 z-[95] cursor-ns-resize touch-none bg-cyan-400/25 hover:bg-cyan-400/50 rounded pointer-events-auto"
                                title="下内边距（Shift：上下对称）"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const T0 = bc0.textPaddingTop ?? 40;
                                  const B0 = bc0.textPaddingBottom ?? 8;
                                  const m0 = Math.round((T0 + B0) / 2);
                                  bindPointerDrag(
                                    e,
                                    (_dx, tdy, last) => {
                                      const cur = boxConfigRef.current;
                                      if (last?.shiftKey) {
                                        const v = Math.max(0, m0 - tdy);
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingTop: v,
                                          textPaddingBottom: v,
                                        });
                                      } else {
                                        onUpdateDialogueBoxConfig({
                                          ...cur,
                                          textPaddingBottom: Math.max(0, B0 - tdy),
                                        });
                                      }
                                    },
                                    { cursor: 'ns-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-0 top-0 w-3.5 h-3.5 z-[96] cursor-nwse-resize touch-none rounded-br bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：左 + 上内边距"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const L0 = bc0.textPaddingLeft ?? 32;
                                  const T0 = bc0.textPaddingTop ?? 40;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      const cur = boxConfigRef.current;
                                      onUpdateDialogueBoxConfig({
                                        ...cur,
                                        textPaddingLeft: Math.max(4, L0 + tdx),
                                        textPaddingTop: Math.max(4, T0 + tdy),
                                      });
                                    },
                                    { cursor: 'nwse-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 top-0 w-3.5 h-3.5 z-[96] cursor-nesw-resize touch-none rounded-bl bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：右 + 上内边距"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const R0 = bc0.textPaddingRight ?? 32;
                                  const T0 = bc0.textPaddingTop ?? 40;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      const cur = boxConfigRef.current;
                                      onUpdateDialogueBoxConfig({
                                        ...cur,
                                        textPaddingRight: Math.max(4, R0 - tdx),
                                        textPaddingTop: Math.max(4, T0 + tdy),
                                      });
                                    },
                                    { cursor: 'nesw-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute left-0 bottom-0 w-3.5 h-3.5 z-[96] cursor-nesw-resize touch-none rounded-tr bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：左 + 下内边距"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const L0 = bc0.textPaddingLeft ?? 32;
                                  const B0 = bc0.textPaddingBottom ?? 8;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      const cur = boxConfigRef.current;
                                      onUpdateDialogueBoxConfig({
                                        ...cur,
                                        textPaddingLeft: Math.max(4, L0 + tdx),
                                        textPaddingBottom: Math.max(0, B0 - tdy),
                                      });
                                    },
                                    { cursor: 'nesw-resize' },
                                  );
                                }}
                              />
                              <div
                                className="absolute right-0 bottom-0 w-3.5 h-3.5 z-[96] cursor-nwse-resize touch-none rounded-tl bg-cyan-300/35 hover:bg-cyan-300/65 border border-cyan-200/45 pointer-events-auto"
                                title="协同：右 + 下内边距"
                                onPointerDown={e => {
                                  const bc0 = boxConfigRef.current;
                                  const R0 = bc0.textPaddingRight ?? 32;
                                  const B0 = bc0.textPaddingBottom ?? 8;
                                  bindPointerDrag(
                                    e,
                                    (tdx, tdy) => {
                                      const cur = boxConfigRef.current;
                                      onUpdateDialogueBoxConfig({
                                        ...cur,
                                        textPaddingRight: Math.max(4, R0 - tdx),
                                        textPaddingBottom: Math.max(0, B0 - tdy),
                                      });
                                    },
                                    { cursor: 'nwse-resize' },
                                  );
                                }}
                              />
                            </>
                          )}
                        </div>
                      )}
                      {isAiProcessing && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/60">
                          <div className="w-10 h-10 border-4 border-current border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-bold text-white/90 animate-pulse">生成中…</span>
                        </div>
                      )}
                      {layoutEdit && onUpdateDialogueBoxConfig && onUpdateGlobalSettings && (
                        <div
                          className="absolute bottom-1 right-1 z-[120] w-9 h-9 rounded-br-lg cursor-nwse-resize touch-none bg-cyan-500/85 border border-cyan-100/80 flex items-end justify-end p-0.5 pointer-events-auto shadow"
                          title="拖拽缩放框体（水墨/奇幻：整体缩放；玻璃：宽与高）"
                          onPointerDown={e => {
                            if (useInkDialogueLayout) {
                              const s0 = globalSettings?.inkDialogueScale ?? 1;
                              bindPointerDrag(
                                e,
                                (_dx, tdy) => {
                                  onUpdateGlobalSettings({
                                    inkDialogueScale: Math.min(2.2, Math.max(0.35, s0 + tdy * 0.0025)),
                                  });
                                },
                                { cursor: 'nwse-resize' },
                              );
                            } else {
                              const w0 = boxConfig.width;
                              const h0 = boxConfig.height;
                              const shell = dialogueLayoutShellRef.current;
                              bindPointerDrag(
                                e,
                                (tdx, tdy) => {
                                  const pw = shell?.parentElement?.getBoundingClientRect().width || 800;
                                  const dw = (tdx / pw) * 100;
                                  onUpdateDialogueBoxConfig({
                                    ...boxConfig,
                                    width: Math.min(100, Math.max(36, w0 + dw)),
                                    height: Math.max(140, Math.min(760, h0 + tdy)),
                                  });
                                },
                                { cursor: 'nwse-resize' },
                              );
                            }
                          }}
                        >
                          <span className="text-[10px] font-black text-black/80 leading-none">⤡</span>
                        </div>
                      )}
                      {useInkDialogueLayout ? (
                        <button
                          type="button"
                          className={`${isFantasyElegant ? 'fantasy-elegant-back-button' : 'ink-jianghu-back-button'} ${isFirstPage ? 'is-disabled' : ''}`}
                          onClick={handlePrevClick}
                          disabled={isFirstPage}
                          aria-label="上一页"
                        >
                          <span
                            aria-hidden
                            className={isFantasyElegant ? 'fantasy-elegant-back-button-icon' : 'ink-jianghu-back-button-icon'}
                            style={{
                              backgroundImage: isFantasyElegant
                                ? fantasyPrevPageIconBg
                                : inkBackButtonBg,
                            }}
                          />
                        </button>
                      ) : (
                        <div
                          className={`absolute bottom-6 left-8 flex items-center gap-3 ${isFirstPage ? 'opacity-40' : ''}`}
                          onClick={handlePrevClick}
                        >
                          <span
                            className={`text-[11px] font-black ${isFirstPage ? 'cursor-default' : 'cursor-pointer opacity-30 hover:opacity-100'} ${ts.text}`}
                          >
                            ◄ PREV_PAGE
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-6 right-8 flex items-center gap-3 animate-pulse">
                        {/* 移除 Next Page/Signal 文本提示，仅保留点击区域与动画占位 */}
                      </div>
                        <div
                          className={`${
                            useInkDialogueLayout
                              ? `absolute left-0 right-0 flex items-center justify-end gap-2 pointer-events-auto ${
                                  isFantasyElegant ? 'fantasy-elegant-bottom-bar' : 'ink-jianghu-bottom-bar'
                                }`
                              : 'mt-auto pt-2 flex items-center justify-end gap-2 pointer-events-auto'
                          }`}
                          ref={bottomBarRowRef}
                        >
                        {barGrip(
                          'auto',
                          <ControlButton
                          icon={
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          }
                          label={isAuto ? '自动: ON' : '自动'}
                          active={isAuto}
                          onClick={onToggleAuto}
                          minimal
                          />
                        )}
                        {barGrip(
                          'skip',
                          <ControlButton
                          icon={
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                            </svg>
                          }
                          label={isSkipping ? '快进: ON' : '快进'}
                          active={isSkipping}
                          onClick={() => setIsSkipping(!isSkipping)}
                          minimal
                          />
                        )}
                        <div
                          className={`w-px h-8 mx-2 ${theme === 'ink-jianghu' ? 'bg-[#3d3832]/25' : isFantasyElegant ? 'bg-amber-800/25' : 'bg-white/10'}`}
                        />
                        {/* 底栏存档相关按钮已移到右侧导航栏，仅保留历史记录等控制键 */}
                        {barGrip(
                          'history',
                          <ControlButton
                          icon={
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-full h-full"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14 2z" />
                            </svg>
                          }
                          label="历史记录"
                          onClick={onToggleLog}
                          minimal
                          />
                        )}
                        {/* 底栏原“任务”按钮已移除，保留历史记录与隐藏界面等控件 */}
                        {barGrip(
                          'hide',
                          <ControlButton
                          icon={
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-full h-full"
                            >
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          }
                          label="隐藏界面"
                          onClick={onHideUI}
                          minimal
                          />
                        )}
                        <div
                          data-tutorial-id="choices-commands"
                          className="flex flex-col items-center pointer-events-auto"
                        >
                          {barGrip(
                            'choices',
                            <ControlButton
                            icon={
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="w-full h-full"
                              >
                                <path d="M4 6h9l3 4H7z" />
                                <path d="M4 14h6l3 4H7z" />
                              </svg>
                            }
                            label="剧情选项"
                            onClick={() => {
                              setIsDecisionOpen(true);
                              if (tutorialStepId === 'choices-commands' && onTutorialEvent)
                                onTutorialEvent('choices-commands');
                            }}
                            className={
                              tutorialStepId === 'choices-commands'
                                ? isFantasyElegant
                                  ? 'ring-2 ring-amber-500 rounded-xl'
                                  : 'ring-2 ring-emerald-400 rounded-xl'
                                : ''
                            }
                            minimal
                            />,
                          )}
                        </div>
                        {barGrip(
                          'regen',
                          <ControlButton
                          icon={
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              className={`w-full h-full ${isAiProcessing ? 'animate-spin' : ''}`}
                            >
                              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                              <path d="M3 3v5h5" />
                              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                              <path d="M16 21h5v-5" />
                            </svg>
                          }
                          label="重构剧情"
                          onClick={onRegenerate}
                          disabled={isAiProcessing}
                          minimal
                          />
                        )}
                        {onRandomNSFW &&
                          barGrip(
                            'nsfw',
                            <ControlButton
                            icon={
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="w-full h-full"
                              >
                                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" />
                                <path d="M14 14l1.586-1.586a2 2 0 012.828 0L20 14" />
                                <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7" />
                              </svg>
                            }
                            label="随机NSFW CG"
                            onClick={() => {
                              // 点击：优先打开上拉快速选择面板；若没有可用图集则直接随机一张
                              if (nsfwSets && nsfwSets.length > 0) {
                                setIsNsfwPickerOpen(true);
                              } else {
                                onRandomNSFW?.();
                              }
                            }}
                            onLongPress={() => {
                              // 长按：打开更大的详细选择界面；若外部未提供则退回为小面板
                              if (onOpenFullNsfwSelector) {
                                onOpenFullNsfwSelector();
                              } else {
                                setIsNsfwPickerOpen(true);
                              }
                            }}
                            colorClass="group-hover:text-red-400"
                            minimal
                            />,
                          )}
                        {(onOpenSpriteEdit || onModifySprite) &&
                          barGrip(
                            'sprite',
                            <ControlButton
                            icon={
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="w-full h-full"
                              >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            }
                            label="立绘/表情"
                            onClick={onOpenSpriteEdit || onModifySprite}
                            minimal
                            />,
                          )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {isNsfwPickerOpen && onRandomNSFW && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center pb-28 bg-transparent pointer-events-auto"
          onClick={() => setIsNsfwPickerOpen(false)}
        >
          <div
            className="mb-4 px-4 py-3 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-white/10 min-w-[260px] max-w-[90vw]"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-xs font-bold mb-1">选择 NSFW 图集</div>
            <div className="text-[10px] text-white/60 mb-2">
              点下面任意一行：直接从该图集里抽一张。想精细挑图，请长按底栏按钮打开大图界面。
            </div>
            {nsfwSets && nsfwSets.length > 0 ? (
              <>
                <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                  {nsfwSets.map(set => (
                    <button
                      key={set.id}
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5 hover:bg-pink-500/20 text-[11px] border border-white/10 hover:border-pink-400/70 transition-colors"
                      onClick={() => {
                        onRandomNsfwFromSet?.(set.id);
                        setIsNsfwPickerOpen(false);
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-bold truncate max-w-[160px]">{set.name || '未命名图集'}</span>
                        <span className="text-[10px] opacity-60">
                          {(set.folderName || '').trim() || '默认角色'} · {set.count} 张
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-pink-300">抽一张</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <button
                    type="button"
                    className="flex-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold border border-emerald-400/70"
                    onClick={() => {
                      onRandomNSFW();
                      setIsNsfwPickerOpen(false);
                    }}
                  >
                    任意图集补一张
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[11px] border border-white/20"
                    onClick={() => setIsNsfwPickerOpen(false)}
                  >
                    关闭
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] opacity-70 mb-2">
                  当前角色暂无可用 NSFW 图集，将直接从角色 NSFW CG 中随机一张。
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold border border-emerald-400/70"
                    onClick={() => {
                      onRandomNSFW();
                      setIsNsfwPickerOpen(false);
                    }}
                  >
                    补一张
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[11px] border border-white/20"
                    onClick={() => setIsNsfwPickerOpen(false)}
                  >
                    关闭
                  </button>
                </div>
              </>
            )}
            <div className="mt-2 text-[10px] opacity-60">
              提示：点击底栏按钮打开此快速列表，<span className="text-pink-300 font-semibold">长按</span>可打开更大的 CG
              选择界面。
            </div>
          </div>
        </div>
      )}
    </>
  );
};
