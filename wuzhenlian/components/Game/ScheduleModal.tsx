
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ModalCloseX } from './ModalCloseX';
import { isTavernHelperFnAvailable } from '../../tavernRuntime';
import { BackgroundItem, CGFolder, Character, WorldInfoEntry } from '../../types';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { matchCgItemQuery, matchCgSetQuery } from '../../utils/cgMatch';

declare const getVariables: ((opt: { type: 'chat' | 'global' | 'character' }) => Record<string, any>) | undefined;

interface TimelineEvent {
  id: string;
  phase: string;
  chapter: number;
  name: string;
  nameList: string[];
  time: Date | null;
  timeRaw: string;
  location: string;
  backgroundHint: string;
  cgKeyword: string;
  characters: string;
  summary: string;
  impact: string;
  precondition: string;
  sourceEntry: string;
  order: number;
}

interface EventConditionState {
  met: boolean;
  missing: string[];
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
  onTimeJump?: (date: string, context: string) => void;
  worldInfoEntries?: WorldInfoEntry[];
  currentGameDate?: Date;
  backgrounds?: BackgroundItem[];
  cgLibrary?: CGFolder[];
  characters?: Character[];
  onReloadEventTable?: () => void;
  /** 世界书拉取中，用于更新按钮 loading 态 */
  eventTableLoading?: boolean;
  /** 是否使用手机/窄视口布局（弹窗宽度） */
  isMobileLayout?: boolean;
}

const CH_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function extractField(block: string, key: string): string {
  const reg = new RegExp(`【${key}】\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*【|$)`);
  return block.match(reg)?.[1]?.trim() || '';
}

function cleanBracketList(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  // 情况1：事件名称形如「[身份暴露]“落到我手里了”」，方括号只是前缀标签，后面还有标题
  // 此时应该完整保留原文，不去掉左括号
  if (/^\[[^\]]+\][^\]]/.test(s)) {
    return [s];
  }
  // 情况2：纯列表写法，如「[事件一, 事件二]」或「事件一, 事件二」
  const trimmed = s.replace(/^\[|\]$/g, '');
  if (!trimmed) return [];
  return trimmed.split(/[,，、|]/).map(t => t.trim()).filter(Boolean);
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.replace(/[\[\]]/g, '').trim();
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2})[:：](\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4] || 0);
  const min = Number(m[5] || 0);
  const dt = new Date(y, mon, d, h, min);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseChapter(phase: string, fallback: number): number {
  const m = phase.match(/(\d+)/);
  return m ? Number(m[1]) : fallback;
}

function formatDate(dt: Date | null): string {
  if (!dt) return '未设置时间';
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, '0');
  const d = `${dt.getDate()}`.padStart(2, '0');
  const h = `${dt.getHours()}`.padStart(2, '0');
  const min = `${dt.getMinutes()}`.padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${min}`;
}

function jumpDateString(dt: Date): string {
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const h = `${dt.getHours()}`.padStart(2, '0');
  const min = `${dt.getMinutes()}`.padStart(2, '0');
  return `${y}年${m}月${d}日 ${h}:${min}`;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  theme = 'night',
  onTimeJump,
  worldInfoEntries = [],
  currentGameDate = new Date(),
  backgrounds = [],
  cgLibrary = [],
  characters = [],
  onReloadEventTable,
  eventTableLoading = false,
  isMobileLayout,
}) => {
  const isFantasyElegant = theme === 'fantasy-elegant';
  const isDay = theme === 'day';
  const accentClass = theme === 'tech'
    ? 'text-cyan-400'
    : isFantasyElegant
      ? 'text-amber-800'
      : isDay
        ? 'text-emerald-600'
        : 'text-emerald-400';
  const skin = useMemo(() => {
    if (isFantasyElegant) {
      return {
        overlay: 'bg-black/35',
        container: 'bg-[#faf6ee] border-amber-800/30 text-[#3d2e18]',
        header: 'border-amber-800/25 bg-[#f0e6d4]/95',
        topBar: 'border-amber-800/25 bg-[#f4ecd8]/90',
        timeCard: 'border-amber-800/25 bg-[#fffdf8]',
        progressTrack: 'bg-amber-200/60',
        progressFill: 'from-amber-600 to-amber-400',
        timelineTrack: 'from-amber-300/50 via-amber-500/35 to-amber-300/50',
        sidebar: 'bg-[#f8efd8] border-amber-800/25',
        sidebarCard: 'border-amber-800/20 bg-[#fffdf8]',
        chapterLabel: 'text-amber-800',
        chapterLine: 'bg-amber-600/45',
        chapterDone: 'bg-amber-700 text-white',
        btnUpdate:
          'border-amber-600/40 bg-amber-100/80 hover:bg-amber-200/90 text-amber-950',
        btnClose: 'bg-red-600/90 hover:bg-red-500 text-white',
        navBorder: 'border-amber-800/25 bg-[#f4ecd8]',
        navBtn: 'border-amber-700/30 bg-white/80 hover:bg-white text-amber-950',
        navBtnCurrent: 'border-amber-500 bg-amber-100 ring-amber-500/40 text-amber-900',
        emptyHint: 'border-amber-800/25 bg-amber-50/80 text-amber-900/80',
        randomSection: 'border-amber-800/25 bg-amber-100/50',
        randomDot: 'border-amber-700/40 bg-amber-50',
        randomDotActive: 'border-amber-600 bg-amber-200',
      };
    }
    return {
      overlay: isDay ? 'bg-black/40' : 'bg-black/75',
      container: isDay ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#0d111a] border-white/10 text-slate-100',
      header: isDay ? 'border-slate-200 bg-white/80' : 'border-white/10 bg-black/30',
      topBar: isDay ? 'border-slate-200 bg-slate-100/80' : 'border-white/10 bg-black/20',
      timeCard: isDay ? 'border-slate-200 bg-white' : 'border-white/15 bg-white/5',
      progressTrack: isDay ? 'bg-slate-200' : 'bg-white/10',
      progressFill: isDay ? 'from-emerald-500 to-teal-500' : 'from-emerald-500 to-cyan-400',
      timelineTrack: isDay ? 'from-slate-300 via-emerald-400/50 to-slate-300' : 'from-white/20 via-emerald-400/40 to-white/20',
      sidebar: isDay ? 'bg-slate-100 border-slate-200' : 'bg-[#111826] border-white/10',
      sidebarCard: isDay ? 'border-slate-200 bg-white' : 'border-white/15 bg-white/5',
      chapterLabel: isDay ? 'text-amber-600' : 'text-yellow-300',
      chapterLine: isDay ? 'bg-amber-400/60' : 'bg-yellow-500/40',
      chapterDone: 'bg-orange-500 text-black',
      btnUpdate: isDay ? 'border-emerald-500/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700' : 'border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200',
      btnClose: isDay ? 'bg-red-500/90 hover:bg-red-500 text-white' : 'bg-red-600/90 hover:bg-red-500',
      navBorder: isDay ? 'border-slate-200 bg-slate-100' : 'border-white/10 bg-black/20',
      navBtn: isDay ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700' : 'border-white/20 bg-white/5 hover:bg-white/10 text-white',
      navBtnCurrent: isDay ? 'border-amber-400 bg-amber-50 ring-amber-400/50 text-amber-700' : 'border-yellow-400 bg-yellow-500/20 text-yellow-300 ring-yellow-400/50',
      emptyHint: isDay ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/20 bg-white/[0.03]',
      randomSection: isDay ? 'border-slate-200 bg-slate-100/60' : 'border-white/10 bg-white/[0.04]',
      randomDot: isDay ? 'border-slate-300 bg-slate-200' : 'border-white/20 bg-white/10',
      randomDotActive: isDay ? 'border-amber-400 bg-amber-100' : 'border-amber-400/60 bg-amber-500/20',
    };
  }, [isDay, isFantasyElegant]);
  const isInk = theme === 'ink-jianghu';
  const inkPanelStyle = isInk
    ? {
        backgroundImage: `url(${inkJianghuExternalUrls.baseBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
      }
    : isFantasyElegant
      ? {
          background: 'linear-gradient(180deg, #fffdf8 0%, #f4ecd8 55%, #ede4cf 100%)',
          fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
        }
      : undefined;
  const inkTitleStyle = isInk ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;
  const inkBodyStyle = isInk ? { fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif' } : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragState = useRef({ down: false, startX: 0, startScroll: 0 });
  const chapterNavRef = useRef<HTMLDivElement>(null);
  const [variableSnapshot, setVariableSnapshot] = useState<Record<string, any>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const sourceEntries = worldInfoEntries.filter(e => {
      if (e.enabled === false || e.disable === true) return false;
      const name = (e.name || e.comment || '').toLowerCase();
      const keys = (e.keys || []).join(',').toLowerCase();
      const content = (e.content || '').toLowerCase();
      return name.includes('事件表') || keys.includes('事件表') || content.includes('<event>') || content.includes('【事件名称】');
    });

    const result: TimelineEvent[] = [];
    let seq = 0;
    sourceEntries.forEach(entry => {
      const blocks = [...(entry.content || '').matchAll(/<event>([\s\S]*?)<\/event>/g)].map(m => m[1]);
      const fallbackBlocks = blocks.length > 0 ? blocks : ((entry.content || '').includes('【事件名称】') ? [entry.content || ''] : []);
      fallbackBlocks.forEach(block => {
        const phase = extractField(block, '主线阶段');
        const nameRaw = extractField(block, '事件名称');
        const names = cleanBracketList(nameRaw);
        const timeRaw = extractField(block, '触发时间') || extractField(block, '事件时间');
        const time = parseDate(timeRaw);
        const cgKeyword = extractField(block, 'cg事件');
        const location = extractField(block, '事件地点');
        const bgHintMatch = location.match(/背景\\s*([^）)\\]]+)/);
        const backgroundHint = bgHintMatch?.[1]?.trim() || '';
        const chapter = parseChapter(phase, seq + 1);
        const summary = extractField(block, '事件概况');

        // 若完全空白（无阶段、无名称、无时间、无地点且无概况），则跳过该事件点
        if (!phase && !nameRaw && !timeRaw && !location && !summary) {
          return;
        }

        const fallbackName = summary.split(/[。！!？?]/)[0]?.trim() || `事件 ${seq + 1}`;
        result.push({
          id: `timeline_${entry.id}_${seq}`,
          phase: phase || `${chapter}.0`,
          chapter,
          name: names[0] || fallbackName,
          nameList: names,
          time,
          timeRaw: timeRaw || '',
          location,
          backgroundHint,
          cgKeyword,
          characters: extractField(block, '登场角色'),
          summary,
          impact: extractField(block, '变量影响'),
          precondition: extractField(block, '触发条件') || extractField(block, '前置条件'),
          sourceEntry: entry.name || entry.comment || '事件表',
          order: seq++,
        });
      });
    });

    const sorted = result.sort((a, b) => {
      const ta = a.time ? a.time.getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.time ? b.time.getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return a.order - b.order;
    });

    // 二次清洗：
    // 1) 丢弃没有时间的占位事件点
    // 2) 仅保留主线阶段形如 "数字.数字" 的正式阶段（过滤掉 1.0-n.m 这类模板)
    // 3) 同一阶段 + 同一时间如有重复，只保留第一条
    const final: TimelineEvent[] = [];
    const seen = new Set<string>();
    sorted.forEach(ev => {
      if (!ev.time) return;
      if (!/^\d+\.\d+$/.test(ev.phase.trim())) return;
      const key = `${ev.phase}__${ev.time.getTime()}`;
      if (seen.has(key)) return;
      seen.add(key);
      final.push(ev);
    });
    return final;
  }, [worldInfoEntries]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isTavernHelperFnAvailable('getVariables')) {
      setVariableSnapshot({});
      return;
    }
    const snap: Record<string, any> = {};
    try {
      snap.chat = getVariables({ type: 'chat' });
    } catch {
      snap.chat = {};
    }
    try {
      snap.global = getVariables({ type: 'global' });
    } catch {
      snap.global = {};
    }
    try {
      snap.character = getVariables({ type: 'character' });
    } catch {
      snap.character = {};
    }
    setVariableSnapshot(snap);
  }, [isOpen, worldInfoEntries.length]);

  const cgItemMap = useMemo(() => {
    const map = new Map<string, { name: string; url: string; keywords: string[] }>();
    cgLibrary.forEach(folder => {
      if (folder.disabled) return;
      folder.items.forEach(item => map.set(item.id, { name: item.name, url: item.url, keywords: item.keywords || [] }));
    });
    return map;
  }, [cgLibrary]);

  const getEventImage = useMemo(() => {
    return (event: TimelineEvent): string => {
      const cgRaw = event.cgKeyword.replace(/^cg\s*/i, '').trim().toLowerCase();
      if (cgRaw) {
        for (const folder of cgLibrary) {
          if (folder.disabled) continue;
          const direct = folder.items.find(item => matchCgItemQuery(item, cgRaw));
          if (direct) return direct.url;

          const set = (folder.sets || []).find(s => matchCgSetQuery(s, cgRaw));
          if (set && set.itemIds.length > 0) {
            const first = cgItemMap.get(set.itemIds[0]);
            if (first?.url) return first.url;
          }
        }
      }

      const bgNeedles = [event.backgroundHint, event.location]
        .map(s => s.toLowerCase())
        .filter(Boolean);
      for (const needle of bgNeedles) {
        const bg = backgrounds.find(b => {
          const n = b.name.toLowerCase();
          return n === needle || n.includes(needle) || needle.includes(n);
        });
        if (bg?.url) return bg.url;
      }
      return '';
    };
  }, [backgrounds, cgLibrary, cgItemMap]);

  const renderedEvents = useMemo(() => {
    const deepGet = (obj: any, path: string) => {
      return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
    };

    const resolveCharStat = (exprLeft: string): number | undefined => {
      const statNameMap: Record<string, keyof Character['stats']> = {
        好感度: 'trust',
        信任度: 'trust',
        直男程度: 'power',
        战力: 'power',
        性欲值: 'sync',
        同步度: 'sync',
      };
      const statKey = Object.keys(statNameMap).find(k => exprLeft.includes(k));
      if (!statKey) return undefined;
      const char = characters.find(c => exprLeft.includes(c.name) || exprLeft.includes(String(c.id)));
      if (!char) return undefined;
      return char.stats?.[statNameMap[statKey]];
    };

    const evalCond = (event: TimelineEvent): EventConditionState => {
      const raw = (event.precondition || '').trim();
      if (!raw) return { met: true, missing: [] };
      const terms = raw.split(/[，,；;\n]/).map(s => s.trim()).filter(Boolean);
      const missing: string[] = [];

      terms.forEach(term => {
        const cmp = term.match(/^(.+?)(>=|<=|==|=|>|<)(-?\d+(?:\.\d+)?)$/);
        if (cmp) {
          const leftRaw = cmp[1].trim();
          const op = cmp[2];
          const right = Number(cmp[3]);

          let leftVal: any = resolveCharStat(leftRaw);
          if (leftVal === undefined) {
            leftVal = deepGet(variableSnapshot.chat, leftRaw) ?? deepGet(variableSnapshot.character, leftRaw) ?? deepGet(variableSnapshot.global, leftRaw);
          }
          if (typeof leftVal !== 'number') {
            missing.push(`${leftRaw} 缺失`);
            return;
          }
          let ok = false;
          if (op === '>=') ok = leftVal >= right;
          else if (op === '<=') ok = leftVal <= right;
          else if (op === '>') ok = leftVal > right;
          else if (op === '<') ok = leftVal < right;
          else ok = leftVal === right;
          if (!ok) missing.push(`${leftRaw} 需 ${op}${right} (当前 ${leftVal})`);
          return;
        }

        const exists = term.match(/^(.+?)(存在|已解锁|已完成)$/);
        if (exists) {
          const key = exists[1].trim();
          const val = deepGet(variableSnapshot.chat, key) ?? deepGet(variableSnapshot.character, key) ?? deepGet(variableSnapshot.global, key);
          if (val === undefined || val === null || val === false) {
            missing.push(`${key} 未满足`);
          }
          return;
        }
      });

      return { met: missing.length === 0, missing };
    };

    return timelineEvents.map(e => ({ ...e, image: getEventImage(e), condition: evalCond(e) }));
  }, [timelineEvents, getEventImage, variableSnapshot, characters]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEvent = useMemo(() => renderedEvents.find(e => e.id === selectedId) || null, [renderedEvents, selectedId]);
  const [activeSubTab, setActiveSubTab] = useState<'timeline' | 'random'>('timeline');

  const currentIndex = useMemo(() => {
    if (renderedEvents.length === 0) return -1;
    let idx = -1;
    renderedEvents.forEach((e, i) => {
      if (e.time && e.time.getTime() <= currentGameDate.getTime()) idx = i;
    });
    return idx;
  }, [renderedEvents, currentGameDate]);

  const nextEvent = currentIndex + 1 < renderedEvents.length ? renderedEvents[currentIndex + 1] : null;
  const progress = renderedEvents.length > 0 ? Math.max(0, Math.min(100, ((currentIndex + 1) / renderedEvents.length) * 100)) : 0;

  const chapterList = useMemo(() => {
    return Array.from(new Set(renderedEvents.map(e => e.chapter))).sort((a, b) => a - b);
  }, [renderedEvents]);

  // 章节导航：
  // - 当章节总数≤5 时：全部显示（方便小量事件精确跳转）
  // - 否则：仅展示第1章、每5章一个标记，以及最后一章，避免过密
  const chapterNavList = useMemo(() => {
    if (chapterList.length === 0) return [];
    const last = chapterList[chapterList.length - 1];
    // 少量章节时，全部展示
    if (chapterList.length <= 5) return chapterList;
    const nav: number[] = [];
    chapterList.forEach(ch => {
      if (ch === 1 || ch % 5 === 0) nav.push(ch);
    });
    if (!nav.includes(last)) nav.push(last);
    return nav;
  }, [chapterList]);

  const chapterGroups = useMemo(() => {
    const groups: Array<{ chapter: number; events: typeof renderedEvents }> = [];
    chapterList.forEach(ch => {
      groups.push({ chapter: ch, events: renderedEvents.filter(e => e.chapter === ch) });
    });
    return groups;
  }, [chapterList, renderedEvents]);

  // 图4: 事件详情仅点击事件点才打开，不在打开弹窗时自动选中
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      setSelectedId(null);
      wasOpenRef.current = true;
    }
    if (renderedEvents.length > 0) {
      const id = renderedEvents[Math.max(0, currentIndex)].id;
      setTimeout(() => {
        cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 60);
    }
  }, [isOpen, renderedEvents, currentIndex]);

  // 弹窗入场动效：先渲染再过渡到可见
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setModalVisible(true), 20);
      return () => clearTimeout(t);
    }
    setModalVisible(false);
    return undefined;
  }, [isOpen]);

  // 键盘：Esc 关闭，← → 切换选中事件
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const idx = renderedEvents.findIndex(ev => ev.id === selectedId);
        if (idx < 0) return;
        const next = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
        if (next >= 0 && next < renderedEvents.length) {
          e.preventDefault();
          setSelectedId(renderedEvents[next].id);
          cardRefs.current[renderedEvents[next].id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, renderedEvents, selectedId]);

  const currentChapter = useMemo(() => {
    if (currentIndex < 0 || renderedEvents.length === 0) return null;
    return renderedEvents[currentIndex]?.chapter ?? null;
  }, [renderedEvents, currentIndex]);

  if (!isOpen) return null;

  const onJumpToEvent = (event: TimelineEvent) => {
    if (!event.time || !onTimeJump) return;
    const context = `${event.name}｜${event.summary || event.location || event.phase}`;
    onTimeJump(jumpDateString(event.time), context);
    onClose();
  };

  const onJumpChapter = (chapter: number) => {
    const target = renderedEvents.find(e => e.chapter === chapter);
    if (!target) return;
    setSelectedId(target.id);
    cardRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const onMouseDownTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    dragState.current.down = true;
    dragState.current.startX = e.clientX;
    dragState.current.startScroll = scrollRef.current.scrollLeft;
  };

  const onMouseMoveTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.down || !scrollRef.current) return;
    const delta = e.clientX - dragState.current.startX;
    scrollRef.current.scrollLeft = dragState.current.startScroll - delta;
  };

  const onMouseUpTrack = () => {
    dragState.current.down = false;
  };

  const renderTimelineTab = () => (
    <div className="flex-1 min-w-0 flex">
      <div key="timeline" className={`flex-1 min-w-0 flex flex-col border-r ${isDay ? 'border-slate-300' : 'border-white/10'}`}>
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 overflow-x-auto overflow-y-hidden scroll-smooth timeline-h-scrollbar cursor-grab active:cursor-grabbing relative ${isDay ? 'timeline-texture-bg-day' : 'timeline-texture-bg'}`}
          onMouseDown={onMouseDownTrack}
          onMouseMove={onMouseMoveTrack}
          onMouseUp={onMouseUpTrack}
          onMouseLeave={onMouseUpTrack}
          onWheel={e => {
            if (!scrollRef.current) return;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              scrollRef.current.scrollLeft += e.deltaY;
            }
          }}
        >
          <div className="min-w-max min-h-full px-6 py-4 flex flex-col relative z-10">
            {/* 时间轴意象：横向轨道线（委托标题下方、图钉/照片上方），单行左右滚动 */}
            <div
              className="absolute left-0 right-0 top-[72px] h-1.5 z-10 rounded-full pointer-events-none shadow-sm"
              style={{
                background: isDay
                  ? 'linear-gradient(to right, rgb(203 213 225), rgba(52, 211, 153, 0.5), rgb(203 213 225))'
                  : 'linear-gradient(to right, rgba(255,255,255,0.2), rgba(52, 211, 153, 0.4), rgba(255,255,255,0.2))',
              }}
              aria-hidden
            />
            {renderedEvents.length === 0 && (
              <div className={`w-[700px] h-[280px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-3 text-center px-8 ${skin.emptyHint}`}>
                <p className="text-sm opacity-80">暂无事件数据</p>
                <p className="text-xs opacity-60 max-w-md">请在世界书词条中加入 <code className={`px-1.5 py-0.5 rounded ${isDay ? 'bg-slate-200' : 'bg-white/10'}`}>&lt;event&gt;…&lt;/event&gt;</code>，或点击顶部「更新」从酒馆世界书读取。</p>
              </div>
            )}
            {/* 单行：所有事件点横向排列、纵向撑满，可左右滚动 */}
            <div className="flex items-stretch gap-6 flex-1 min-h-0">
              {renderedEvents.map((event, idx) => {
                // 当前时间严格“超过”该事件点，才视为已完成
                const timeReached = event.time ? event.time.getTime() < currentGameDate.getTime() : idx < currentIndex;
                const selected = selectedId === event.id;
                const conditionMet = event.condition.met;
                const prevChapter = idx > 0 ? renderedEvents[idx - 1].chapter : null;
                const showChapterLabel = prevChapter !== event.chapter;
                const displayName = event.name;
                return (
                  <div key={event.id} className="shrink-0 w-[260px] flex flex-col items-center min-h-0">
                    {showChapterLabel && (
                      <div className="mb-1.5 flex items-center gap-2 self-start shrink-0">
                        <div className="text-xs font-black tracking-widest text-emerald-400" style={inkTitleStyle}>第{CH_NUM[event.chapter] || event.chapter}章</div>
                        <div className="h-px w-12 bg-emerald-500/50" />
                 </div>
                    )}
                    {/* 顶部标题：显示事件名称，突出主线阶段 */}
                    <div className="text-[14px] font-black truncate max-w-[260px] mb-1.5 shrink-0 text-emerald-100/95" title={displayName} style={inkTitleStyle}>
                      委托 {displayName}
             </div>
                    <div className="relative pt-6 flex-1 min-h-0 flex flex-col w-full">
                      {/* 图钉：红色圆形，中间高光，钉在背景上 */}
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-11 h-11 rounded-full z-10 shrink-0" title="图钉" aria-hidden style={{ background: 'linear-gradient(135deg, #f87171 0%, #ef4444 50%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset -2px -2px 4px rgba(0,0,0,0.2)' }}>
                        <div className="absolute top-[18%] left-[18%] w-2.5 h-2.5 rounded-full bg-white/90" />
        </div>
                      {/* 拍立得相框：白边、内阴影凹陷、底部投影浮起、底部较宽白边 */}
                      <div
                        ref={el => { cardRefs.current[event.id] = el; }}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(event.id); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelectedId(event.id); } }}
                        className={`relative flex-1 min-h-[240px] min-w-0 w-full bg-white rounded-xl cursor-pointer transition-all duration-200 flex flex-col overflow-hidden ${selected ? 'ring-4 ring-emerald-400 scale-[1.02]' : 'hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'} ${!conditionMet ? 'grayscale opacity-75' : timeReached ? '' : 'opacity-95'}`}
                        style={{ boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.08), 0 0 0 6px white, 0 0 0 8px #f5f5f4, 0 12px 24px rgba(0,0,0,0.3)' }}
                      >
                        {/* COMPLETED 胶带：橙红、斜面浮雕感、边缘高光 */}
                        {timeReached && (
                          <div className="absolute left-0 top-3 z-20 shrink-0" title="时间线已到达" style={{ transform: 'rotate(-18deg)' }}>
                            <div className="text-[11px] font-black text-white tracking-wider px-4 py-1.5" style={{ background: 'linear-gradient(180deg, #fb923c 0%, #ef4444 35%, #dc2626 70%, #b91c1c 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.1)' }}>
                              COMPLETED
                            </div>
                          </div>
                        )}
                        {/* 照片区域：浅灰底或立绘 */}
                        <div className="flex-1 min-h-0 bg-slate-200 overflow-hidden flex items-center justify-center p-1">
                          {event.image ? (
                            <img src={event.image} alt="" className="w-full h-full object-cover rounded-md" />
                          ) : (
                            <div className="text-sm text-slate-500">无图像</div>
                          )}
                        </div>
                        {/* 底部较宽白边：主线阶段 + 日期 */}
                        <div className="py-3 px-3 flex flex-col gap-1.5 shrink-0 bg-white border-t border-slate-100/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-stone-700" style={inkTitleStyle}>【主线阶段】{event.phase}</span>
                            <span className="text-[10px] tracking-[0.2em] uppercase text-stone-400">MAIN</span>
                          </div>
                          <div className="text-[11px] text-stone-500 truncate" style={inkBodyStyle}>{formatDate(event.time)}</div>
                            </div>
                        </div>
                    </div>
                    {/* 图1：底部的条件勾行整体删除，不在卡片下方占位 */}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
        {/* 章节选择栏：横向滚动 + 左右箭头 + 高亮选中 + 自动居中 */}
        <div className={`shrink-0 border-t py-3 backdrop-blur-md ${isDay ? 'bg-slate-900/30 border-slate-600/40' : 'bg-black/50 border-white/10'}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => chapterNavRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border border-white/20 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-emerald-400 hover:border-emerald-400/50 transition-colors"
              aria-label="上一页"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div
              ref={chapterNavRef}
              className="flex-1 min-w-0 flex gap-3 overflow-x-auto overflow-y-hidden timeline-chapter-scrollbar scroll-smooth"
              role="tablist"
              aria-label="章节导航"
              style={{ scrollPaddingLeft: 16, scrollPaddingRight: 16, scrollSnapType: 'x mandatory' }}
            >
              {chapterNavList.map(ch => {
                const isCurrent = currentChapter === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    onClick={() => onJumpChapter(ch)}
                    className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all duration-200 min-w-[5rem] flex items-center justify-center gap-2 ${
                      isCurrent
                        ? 'border-2 border-emerald-400 bg-emerald-500 text-white shadow-lg shadow-emerald-400/30'
                        : 'border border-white/20 bg-black/40 backdrop-blur-sm text-emerald-100/90 hover:bg-black/50 hover:border-emerald-400/30'
                    }`}
                    style={{ scrollSnapAlign: 'center', ...(inkTitleStyle || {}) }}
                  >
                    <span className="w-px h-3 bg-current/40" aria-hidden />
                    <span>第{CH_NUM[ch] || ch}章</span>
                    <span className="w-px h-3 bg-current/40" aria-hidden />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => chapterNavRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border border-white/20 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-emerald-400 hover:border-emerald-400/50 transition-colors"
              aria-label="下一页"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                                </div>
      <div className={`shrink-0 flex flex-col transition-[width] duration-300 ease-out ${selectedId ? 'w-[480px]' : 'w-0 overflow-hidden'}`} onClick={e => e.stopPropagation()}>
        {selectedEvent ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar" key={selectedEvent.id}>
            {/* 收集册 · 白日风格 */}
            <div className={`flex-1 min-h-full flex flex-col overflow-hidden rounded-l-lg ${isDay ? 'bg-white border-l border-slate-200' : 'bg-slate-100/90 border-l border-slate-300'}`}>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col min-h-full p-5">
                  <div className="text-[10px] font-medium tracking-widest text-slate-400 uppercase mb-1">事件详情 · 收集册</div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-4">{selectedEvent.name}</h3>
                  {selectedEvent.image ? (
                    <div className="rounded-lg overflow-hidden border border-slate-200 mb-5 shadow-sm">
                      <div className="aspect-[4/3] bg-slate-100">
                        <img src={selectedEvent.image} alt="" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  ) : null}
                  <dl className="space-y-2 text-sm text-slate-700 mb-5 pb-5 border-b border-slate-200">
                    <div className="flex"><dt className="w-20 shrink-0 text-slate-500">【主线阶段】</dt><dd>{selectedEvent.phase}</dd></div>
                    <div className="flex"><dt className="w-14 shrink-0 text-slate-500">时间</dt><dd>{formatDate(selectedEvent.time)}</dd></div>
                    <div className="flex"><dt className="w-14 shrink-0 text-slate-500">地点</dt><dd>{selectedEvent.location || '—'}</dd></div>
                    <div className="flex"><dt className="w-14 shrink-0 text-slate-500">角色</dt><dd className="min-w-0">{selectedEvent.characters || '—'}</dd></div>
                  </dl>
                  <section className="mb-5">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">事件概况</h4>
                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap text-justify indent-6">{selectedEvent.summary || '（未填写概况）'}</p>
                  </section>
                  <section className="mb-5">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">变量影响</h4>
                    <p className="text-sm text-slate-700">{selectedEvent.impact || '—'}</p>
                  </section>
                  <section className="mb-6">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">触发条件</h4>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedEvent.condition.met ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {selectedEvent.condition.met ? '已达成' : '未达成'}
                    </span>
                    {!selectedEvent.condition.met && selectedEvent.condition.missing.length > 0 && (
                      <ul className="mt-2 text-xs text-slate-600 space-y-1 pl-4 list-disc">
                        {selectedEvent.condition.missing.map((miss, idx) => (
                          <li key={`${selectedEvent.id}_miss_${idx}`}>{miss}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <div className="mt-auto pt-2 space-y-3">
                                    <button 
                      type="button"
                      onClick={() => { if (selectedEvent.time) onJumpToEvent(selectedEvent); }}
                      disabled={!selectedEvent.time || !onTimeJump}
                      className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDay ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                    >
                      跳转到该事件
                                    </button>
                    <p className="text-[10px] text-slate-400 text-center">来源词条：{selectedEvent.sourceEntry}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <p className="text-sm opacity-70 mb-1">点击左侧时间轴上的事件卡片</p>
            <p className="text-xs opacity-55">可在此查看事件详情、概况与跳转</p>
          </div>
                                    )}
                                </div>
                            </div>
  );

  const isMobile = isMobileLayout ?? false;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-200 ${modalVisible ? `${skin.overlay} backdrop-blur-sm` : 'bg-transparent backdrop-blur-none pointer-events-none'}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="事件表"
    >
      <div
        className={`relative w-full ${isMobile ? 'max-w-[min(96vw,960px)] h-[94vh]' : 'max-w-6xl h-[86vh]'} rounded-xl shadow-2xl overflow-hidden border flex flex-col transition-all duration-200 ${skin.container} ${modalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}
        onClick={e => e.stopPropagation()}
        style={inkPanelStyle}
      >
        <div className={`h-12 shrink-0 px-4 border-b flex items-center justify-between ${skin.header}`}>
          <h2 className={`text-lg font-black tracking-widest uppercase flex items-center gap-2 ${accentClass}`} style={inkTitleStyle}>
            <span>🗂️</span> 事件表 // EVENT_TIMELINE
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className={`inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold rounded border transition-colors ${isDay ? 'border-slate-300 text-slate-600 hover:border-emerald-500 hover:text-emerald-700' : 'border-white/20 text-slate-300 hover:border-emerald-400/50 hover:text-emerald-300'}`}
              style={inkTitleStyle}
              title="查看事件表说明"
            >
              ❔ 说明
            </button>
            <button
              type="button"
              onClick={() => onReloadEventTable?.()}
              disabled={eventTableLoading}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded border disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 ${skin.btnUpdate}`}
              style={inkTitleStyle}
              title="读取世界书【事件表】并刷新"
            >
              {eventTableLoading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  读取中…
                </>
              ) : (
                '更新'
              )}
            </button>
            <ModalCloseX variant="inline" onClose={onClose} />
          </div>
        </div>

        <div className={`shrink-0 px-4 py-2.5 border-b flex flex-wrap items-center gap-3 ${skin.topBar}`}>
          <div className={`rounded-lg border px-3 py-2 min-w-0 ${skin.timeCard}`}>
            <div className="text-[10px] uppercase tracking-widest opacity-70" style={inkTitleStyle}>当前时间</div>
            <div className={`text-xl font-black leading-tight ${isDay ? 'text-emerald-600' : 'text-emerald-300'}`}>
              {`${`${currentGameDate.getHours()}`.padStart(2, '0')}:${`${currentGameDate.getMinutes()}`.padStart(2, '0')}`}
            </div>
            <div className="text-[11px] opacity-80" style={inkBodyStyle}>{`${currentGameDate.getFullYear()}/${`${currentGameDate.getMonth() + 1}`.padStart(2, '0')}/${`${currentGameDate.getDate()}`.padStart(2, '0')}`}</div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] uppercase tracking-widest opacity-70 mb-0.5" style={inkTitleStyle}>主线进度</div>
            <div className={`h-1.5 rounded-full overflow-hidden ${skin.progressTrack}`}>
              <div className={`h-full bg-gradient-to-r ${skin.progressFill}`} style={{ width: `${progress}%` }} />
                                </div>
            <div className="mt-0.5 text-[11px] opacity-80 truncate" style={inkBodyStyle}>
              已到达：{currentIndex >= 0 ? renderedEvents[currentIndex]?.name : '尚未进入主线事件'}{nextEvent ? ` ｜ 下一事件：${nextEvent.name}` : ' ｜ 主线已到末尾'}
                                    </div>
                                </div>
          <div className="text-[11px] opacity-70 shrink-0" style={inkBodyStyle}>事件点：{renderedEvents.length}</div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                activeSubTab === 'timeline'
                  ? isDay ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-500/90 text-white border-emerald-400'
                  : isDay ? 'border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-600' : 'border-white/15 text-slate-300 hover:border-emerald-400 hover:text-emerald-300'
              }`}
              onClick={() => setActiveSubTab('timeline')}
              style={inkTitleStyle}
            >
              事件时间轴
            </button>
                                    <button 
              type="button"
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                activeSubTab === 'random'
                  ? isDay ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-500/90 text-white border-emerald-400'
                  : isDay ? 'border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-600' : 'border-white/15 text-slate-300 hover:border-emerald-400 hover:text-emerald-300'
              }`}
              onClick={() => setActiveSubTab('random')}
              style={inkTitleStyle}
            >
              随机事件点
                                    </button>
                                </div>
                            </div>

        {showHelp && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowHelp(false)}>
            <div className={`max-w-3xl w-full rounded-2xl shadow-2xl overflow-hidden ${isDay ? 'bg-white border border-slate-200 text-slate-800' : 'bg-slate-900/95 border border-emerald-500/40 text-slate-100'}`} onClick={e => e.stopPropagation()}>
              <div className={`px-5 py-3 border-b flex items-center justify-between ${isDay ? 'border-slate-200 bg-slate-50' : 'border-emerald-500/40'}`}>
                <div>
                  <div className={`text-[11px] font-mono uppercase tracking-[0.3em] ${isDay ? 'text-emerald-600' : 'text-emerald-400'}`} style={inkTitleStyle}>EVENT GUIDE</div>
                  <div className="text-base font-bold mt-1" style={inkTitleStyle}>事件表说明</div>
                </div>
                <button className={`text-xs ${isDay ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-100'}`} onClick={() => setShowHelp(false)}>关闭</button>
              </div>
              <div className="px-5 py-4 space-y-3 text-[13px] leading-relaxed">
                <p className={`font-semibold ${isDay ? 'text-emerald-700' : 'text-emerald-300'}`}>事件表作用</p>
                <p>事件表从世界书中读取 <code className="px-1 py-0.5 rounded bg-black/10">{'<event>...</event>'}</code> 块，展示主线与委托事件的时间轴。点击事件卡片可跳转剧情时间。</p>
                <p className={`font-semibold mt-3 ${isDay ? 'text-emerald-700' : 'text-emerald-300'}`}>事件格式</p>
                <p>在世界书词条中，每个事件需包含以下字段（用【】包裹）：</p>
                <ul className="list-disc list-inside space-y-1 opacity-90">
                  <li><b>【事件名称】</b>：事件标题</li>
                  <li><b>【触发时间】</b> 或 <b>【事件时间】</b>：精确到分钟的绝对时间，如 2026/08/10 22:38</li>
                  <li><b>【主线阶段】</b>：用于分章，如 1.0、2.0</li>
                  <li><b>【事件地点】</b>：可附带背景提示</li>
                  <li><b>【事件概况】</b>：简短描述</li>
                  <li><b>【cg事件】</b>：可选，用于关联 CG 图</li>
                  <li><b>【前置条件】</b>：可选，决定事件是否可跳转</li>
                </ul>
                <p className={`font-semibold mt-3 ${isDay ? 'text-emerald-700' : 'text-emerald-300'}`}>界面操作</p>
                <ul className="list-disc list-inside space-y-1 opacity-90">
                  <li>顶部可切换「事件时间轴」与「随机事件点」视图</li>
                  <li>底部章节导航可快速跳转到对应章节</li>
                  <li>点击「更新」可重新读取世界书中的事件表数据</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex" onClick={() => setSelectedId(null)}>
          {activeSubTab === 'timeline' ? renderTimelineTab() : activeSubTab === 'random' ? (
          <div key="random" className="flex-1 min-w-0 flex overflow-y-auto">
            <div className={`flex-1 p-6 ${skin.randomSection}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {renderedEvents.filter(e => !e.time).map(event => {
                  const selected = selectedId === event.id;
                  const blocked = !event.condition.met;
                  return (
                    <div
                      key={event.id}
                      ref={el => { cardRefs.current[event.id] = el; }}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(event.id); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelectedId(event.id); } }}
                      className={`rounded-xl border p-3 cursor-pointer transition-all duration-200 ${selected ? 'ring-2 ring-yellow-400 scale-[1.02]' : 'hover:scale-[1.02]'} ${blocked ? 'grayscale opacity-70' : ''} ${skin.sidebarCard}`}
                    >
                      <div className="aspect-[4/3] bg-slate-200 overflow-hidden rounded-lg mb-2">
                        {event.image ? (
                          <img src={event.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">无图像</div>
                        )}
                      </div>
                      <div className="text-sm font-black truncate">{event.name}</div>
                      <div className="text-xs opacity-60 mt-1">{event.location || '未设置地点'}</div>
                      <div className="mt-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${event.condition.met ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {event.condition.met ? '条件达成' : '条件未达成'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {renderedEvents.filter(e => !e.time).length === 0 && (
                <div className={`w-full min-h-[200px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-3 text-center px-8 ${skin.emptyHint}`}>
                  <p className="text-sm opacity-80">暂无随机事件点</p>
                  <p className="text-xs opacity-60">随机事件点指未设置时间的事件，将在时间轴中显示</p>
                </div>
              )}
            </div>
            <div className={`shrink-0 overflow-y-auto custom-scrollbar transition-[width,padding] duration-300 ease-out ${skin.sidebar} ${selectedId ? 'w-[360px] p-4' : 'w-0 overflow-hidden p-0'}`} onClick={e => e.stopPropagation()}>
              {selectedEvent && !selectedEvent.time ? (
                <div className="space-y-4 transition-opacity duration-200" key={selectedEvent.id}>
                  <div className={`rounded-xl border p-3 ${skin.sidebarCard}`}>
                    <div className="text-xs uppercase tracking-widest opacity-70">事件详情</div>
                    <div className="text-lg font-black mt-1">{selectedEvent.name}</div>
                  </div>
                  {selectedEvent.image ? (
                    <div className={`rounded-lg overflow-hidden border ${skin.sidebarCard}`}>
                      <div className={`aspect-[16/9] ${isDay ? 'bg-slate-200' : 'bg-black/20'}`}>
                        <img src={selectedEvent.image} alt="" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  ) : null}
                  <div className={`rounded-xl border p-3 space-y-2 text-sm ${skin.sidebarCard}`}>
                    <div><span className="opacity-60">阶段：</span>{selectedEvent.phase}</div>
                    <div><span className="opacity-60">时间：</span>{formatDate(selectedEvent.time)}</div>
                    <div><span className="opacity-60">地点：</span>{selectedEvent.location || '未填'}</div>
                    <div><span className="opacity-60">角色：</span>{selectedEvent.characters || '未填'}</div>
                  </div>
                  <div className={`rounded-xl border p-3 ${skin.sidebarCard}`}>
                    <div className="text-xs uppercase opacity-60 mb-2">事件概况</div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.summary || '未填写概况'}</div>
                        </div>
                  <div className={`rounded-xl border p-3 ${selectedEvent.condition.met ? (isDay ? 'border-emerald-400/50 bg-emerald-50' : 'border-emerald-500/30 bg-emerald-500/10') : (isDay ? 'border-red-400/50 bg-red-50' : 'border-red-500/30 bg-red-500/10')}`}>
                    <div className="text-xs uppercase opacity-70 mb-1">触发条件状态</div>
                    <div className="text-sm font-bold">{selectedEvent.condition.met ? '已达成' : '未达成'}</div>
                    {!selectedEvent.condition.met && selectedEvent.condition.missing.length > 0 && (
                      <ul className="mt-2 text-xs space-y-1">
                        {selectedEvent.condition.missing.map((miss, idx) => (
                          <li key={`${selectedEvent.id}_miss_${idx}`}>- {miss}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-[10px] opacity-50">来源词条：{selectedEvent.sourceEntry}</div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <p className="text-sm opacity-70 mb-1">点击左侧卡片</p>
                  <p className="text-xs opacity-55">可在此查看随机事件点详情</p>
                </div>
            )}
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
