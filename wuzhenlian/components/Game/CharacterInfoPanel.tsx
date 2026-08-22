import React, { useEffect, useMemo, useState } from 'react';
import { Character, CharacterId, CGFolder, WorldInfoEntry, SystemTask } from '../../types';
import { generateDefaultAvatar } from '../../constants';
import type { Schema } from '../../schema';
import { matchCgItemQuery, matchCgSetQuery } from '../../utils/cgMatch';

interface CharacterInfoPanelProps {
  character: Character | null;
  mvuData: Schema | null;
  isOpen: boolean;
  onClose: () => void;
  /** 面板锚点：立绘的 DOMRect */
  anchor?: { left: number; right: number; top: number; bottom: number } | null;
  /** 界面皮肤：经典浮窗 / 资料卡 */
  skin?: 'classic' | 'dossier';
  /** 主题，用于轻微调色 */
  theme?: string;
  /** 世界书事件表 / 角色事件词条，用于解析角色事件 */
  worldInfoEntries?: WorldInfoEntry[];
  /** CG 图库，用于从关键字中推断预览图 */
  cgLibrary?: CGFolder[];
  /** 将文本写入对话输入框 */
  onInsertText?: (text: string) => void;
  /** 从舞台上移除当前角色立绘 */
  onCloseSprite?: (character: Character) => void;
  /** 打开当前角色的立绘 / 服饰 / 表情配置界面 */
  onEditAppearance?: (character: Character) => void;
  /** 更新角色代表色 */
  onUpdateThemeColor?: (id: Character['id'], color: string) => void;
  /** 当前解析出的系统任务列表，用于“系统”角色的任务面板视图 */
  systemTasks?: SystemTask[];
}

interface RoleEvent {
  id: string;
  name: string;
  description: string;
  favorReq?: number;
  desireReq?: number;
  straightReq?: number;
  cgKeyword?: string;
}

function extractField(block: string, key: string): string {
  const reg = new RegExp(`【${key}】\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*【|$)`);
  return block.match(reg)?.[1]?.trim() || '';
}

function cleanBracketList(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  if (/^\[[^\]]+\][^\]]/.test(s)) {
    return [s];
  }
  const trimmed = s.replace(/^\[|\]$/g, '');
  if (!trimmed) return [];
  return trimmed.split(/[,，、|]/).map(t => t.trim()).filter(Boolean);
}

function parseNumberLike(raw: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/-?\d+/);
  if (!m) return undefined;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : undefined;
}

export const CharacterInfoPanel: React.FC<CharacterInfoPanelProps> = ({
  character,
  mvuData,
  isOpen,
  onClose,
  anchor,
  skin = 'classic',
  theme = 'day',
  worldInfoEntries,
  cgLibrary,
  onInsertText,
  onCloseSprite,
  onEditAppearance,
  onUpdateThemeColor,
  systemTasks = [],
}) => {
  const visible = isOpen && !!character;
  if (!visible && !character) return null;

  // 系统任务：选中项（用于“系统”角色的任务面板视图；同时支持 classic / dossier）
  const [selectedSystemTaskId, setSelectedSystemTaskId] = useState<string | null>(null);
  useEffect(() => {
    if (!character) return;
    if (character.id !== CharacterId.SYSTEM) return;
    if (systemTasks.length === 0) {
      setSelectedSystemTaskId(null);
      return;
    }
    setSelectedSystemTaskId(prev => {
      if (!prev) return systemTasks[0].id;
      return systemTasks.some(t => t.id === prev) ? prev : systemTasks[0].id;
    });
  }, [character, systemTasks]);

  const selectedSystemTask = useMemo(() => {
    if (systemTasks.length === 0) return null;
    if (!selectedSystemTaskId) return systemTasks[0] ?? null;
    return systemTasks.find(t => t.id === selectedSystemTaskId) ?? systemTasks[0] ?? null;
  }, [systemTasks, selectedSystemTaskId]);

  const roleStats =
    (mvuData as any)?.角色?.[String(character.id)] ||
    (mvuData as any)?.角色?.[character.name] ||
    null;

  // 从 MVU 读取初始数值（好感值 / 性欲值 / 直男程度），否则回退到角色自身的 stats
  const favorFromMvu = typeof roleStats?.好感值 === 'number' ? roleStats.好感值 : undefined;
  const desireFromMvu = typeof roleStats?.性欲值 === 'number' ? roleStats.性欲值 : undefined;
  const powerFromMvu = typeof roleStats?.直男程度 === 'number' ? roleStats.直男程度 : undefined;

  const favor = favorFromMvu ?? character.stats?.trust ?? 0;
  const desire = desireFromMvu ?? character.stats?.sync ?? 0;
  const power = powerFromMvu ?? character.stats?.power ?? 0;

  // 身份：优先从概要正文中提炼首句，保持与档案面板一致，避免写死的 role
  const deriveIdentityFromDescription = (desc: string | undefined): string => {
    if (!desc || !desc.trim()) return '';
    const t = desc.trim();
    const end = Math.min(
      ...['。', '.', '\n'].map(ch => {
        const idx = t.indexOf(ch);
        return idx < 0 ? Number.POSITIVE_INFINITY : idx;
      }),
    );
    const first = end !== Number.POSITIVE_INFINITY ? t.slice(0, end).trim() : t;
    return first.length > 24 ? first.slice(0, 24) + '…' : first;
  };

  const identity = deriveIdentityFromDescription(character.description) || '—';
  const kink = (character as any).kinks || '—';
  const isPlayer = character.id === CharacterId.PLAYER;
  const isSystem = character.id === CharacterId.SYSTEM;

  // 直男程度的文字分级：低 / 中 / 高
  const straightLabel = (() => {
    const v = Math.max(0, Math.min(100, power));
    if (v >= 70) return '高';
    if (v >= 40) return '中';
    return '低';
  })();
  const relation = '—';
  const like = kink;

  const [activeTab, setActiveTab] = useState<'profile' | 'events'>('profile');

  const roleEvents = useMemo<RoleEvent[]>(() => {
    if (!character || !worldInfoEntries || worldInfoEntries.length === 0) return [];
    const charName = (character.name || '').trim();
    const charId = String(character.id || '').trim();
    const charLower = charName.toLowerCase();

    const sources = worldInfoEntries.filter(e => {
      const name = (e.name || e.comment || '').toLowerCase();
      const content = (e.content || '').toLowerCase();
      return name.includes('角色事件') || content.includes('<role-event>');
    });

    const events: RoleEvent[] = [];
    sources.forEach(entry => {
      const content = entry.content || '';
      const matches = [...content.matchAll(/<role-event>([\s\S]*?)<\/role-event>/g)];
      const blocks = matches.length > 0 ? matches.map(m => m[1]) : [content];

      blocks.forEach((block, idx) => {
        const rawRole = extractField(block, '角色') || extractField(block, '角色名');
        const roles = cleanBracketList(rawRole || '');
        if (roles.length > 0) {
          const match = roles.some(r => {
            const name = r.trim();
            if (!name) return false;
            const lower = name.toLowerCase();
            return (
              lower === charLower ||
              lower === charId.toLowerCase() ||
              charLower.includes(lower) ||
              lower.includes(charLower)
            );
          });
          if (!match) return;
        }

        const name =
          extractField(block, '事件名称') ||
          extractField(block, '名称') ||
          `事件 ${events.length + 1}`;
        const favorReq = parseNumberLike(extractField(block, '好感值'));
        const desireReq = parseNumberLike(extractField(block, '性欲值'));
        const straightReq = parseNumberLike(extractField(block, '直男程度'));
        const cgKeyword =
          extractField(block, '触发cg') ||
          extractField(block, 'cg事件') ||
          extractField(block, 'CG事件');

        const textField =
          extractField(block, '事件文本') ||
          extractField(block, '触发文本') ||
          extractField(block, '事件概况');

        const desc = textField && textField.trim()
          ? textField.trim()
          : block.trim();

        events.push({
          id: `${entry.id}_${idx}`,
          name,
          description: desc,
          favorReq,
          desireReq,
          straightReq,
          cgKeyword,
        });
      });
    });

    return events;
  }, [character, worldInfoEntries]);

  const findCgUrl = useMemo(() => {
    if (!cgLibrary || cgLibrary.length === 0) {
      return (_keyword?: string) => '';
    }
    return (keyword?: string): string => {
      if (!keyword) return '';
      const raw = keyword.trim();
      if (!raw) return '';
      for (const folder of cgLibrary) {
        if (folder.disabled) continue;
        for (const item of folder.items) {
          if (matchCgItemQuery(item, raw)) return item.url;
        }
        for (const set of folder.sets || []) {
          if (matchCgSetQuery(set, raw)) {
            const firstId = set.itemIds[0];
            const first = folder.items.find(it => it.id === firstId);
            if (first?.url) return first.url;
          }
        }
      }
      return '';
    };
  }, [cgLibrary]);

  let panelStyle: React.CSSProperties = {};
  const panelWidth = 280;
  const defaultTop = 120;

  if (typeof window !== 'undefined') {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;

    const rect = anchor ?? { left: vw / 2 - 100, right: vw / 2 + 100, top: defaultTop, bottom: defaultTop + 240 };
    const centerX = (rect.left + rect.right) / 2;
    const placeRight = centerX <= vw / 2;

    let left = placeRight ? rect.right + 16 : rect.left - panelWidth - 16;
    let top = rect.top;

    left = Math.max(16, Math.min(vw - panelWidth - 16, left));
    top = Math.max(16, Math.min(vh - 220, top));

    panelStyle = { position: 'absolute', left, top };
  } else {
    panelStyle = { position: 'absolute', right: 40, top: defaultTop };
  }

  if (!visible && skin === 'dossier') return null;

  if (skin === 'dossier') {
    const isTech = theme === 'tech' || theme === 'tech-blue' || theme === 'tech-white';
    const isFantasyElegant = theme === 'fantasy-elegant';
    const primaryColor = character.themeColor || (isFantasyElegant ? '#d97706' : isTech ? '#22d3ee' : '#10b981'); // 代表色
    const highlightColor = '#fb923c'; // 橙色高亮

    const renderBar = (label: string, value: number, colorClass: string) => {
      const safe = Math.max(0, Math.min(100, value));
      return (
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] text-slate-500">
            <span className="font-semibold">{label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: `${safe}%` }}
            />
            <span
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono"
              style={{ color: highlightColor }}
            >
              {Math.round(safe)}%
            </span>
          </div>
        </div>
      );
    };

    // 特殊分支：系统角色 → 用档案皮肤展示系统任务视图，而不是普通人物档案
    if (isSystem) {
      const day = theme === 'day' || theme === 'tech-white' || theme === 'fantasy-elegant';
      const styles = {
        contentText: day ? 'text-slate-800' : 'text-white/80',
        contentMuted: day ? 'text-slate-500' : 'text-white/60',
        border: day ? 'border-slate-200' : 'border-white/15',
      };

      return (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div
            className="pointer-events-auto w-full max-w-5xl h-[80vh] bg-slate-950/90 md:bg-slate-50 rounded-[32px] shadow-[0_30px_120px_rgba(15,23,42,0.65)] overflow-hidden flex flex-col md:flex-row relative animate-in fade-in slide-in-from-bottom-4 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部标题 */}
            <div className="absolute left-8 top-6 md:top-7">
              <div
                className="text-[11px] font-black uppercase tracking-[0.35em]"
                style={{ color: primaryColor }}
              >
                SYSTEM · TASKS
              </div>
              <div className={`mt-1 text-[18px] md:text-[22px] font-black tracking-wide ${day ? 'text-slate-900' : 'text-white'}`}>
                系统任务面板
              </div>
              <div className={`mt-0.5 text-[11px] ${styles.contentMuted}`}>
                点击左侧任务查看详情；任务源自剧情中的 {'<xitong>...</xitong>'} 模板。
              </div>
            </div>

            {/* 关闭按钮 */}
            <div className="absolute right-6 top-5 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  day
                    ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 内容区域：左侧任务列表 + 右侧详情 */}
            <div className="flex-1 flex flex-col md:flex-row mt-20 md:mt-16 border-t md:border-t-0 md:border-l min-h-0"
              style={{ borderColor: day ? '#e5e7eb' : 'rgba(148,163,184,0.4)' }}
            >
              {/* 左侧列表 */}
              <div className={`w-full md:w-[32%] border-b md:border-b-0 md:border-r ${styles.border} flex flex-col min-h-0`}>
                <div className={`px-4 py-2 text-[10px] uppercase tracking-[0.2em] ${styles.contentMuted} shrink-0`}>
                  当前任务列表
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2 min-h-0">
                  {systemTasks.length === 0 && (
                    <div className={`px-4 py-6 text-center text-sm ${styles.contentMuted}`}>
                      当前没有解析出的系统任务。<br />
                      当剧情文本中出现 {'<xitong>...</xitong>'} 模板时，会在此生成任务。
                    </div>
                  )}
                  {systemTasks.map(task => {
                    const isActive = selectedSystemTask?.id === task.id;
                    const gradeMatch = (task.difficulty || '').match(/^\s*([A-Z0-9]+)/i);
                    const difficulty = gradeMatch ? `${gradeMatch[1]}级` : '—';
                    const finished = !!task.raw && /已完成|完成任务|任务完成/.test(task.raw);
                    const baseClass = day
                      ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-800'
                      : 'border-white/10 bg-slate-900/90 hover:bg-slate-800 text-slate-100';
                    const activeClass = day
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-emerald-400 bg-emerald-500/10 text-white';
                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] transition-all min-w-0 ${
                          isActive ? activeClass : baseClass
                        }`}
                        onClick={() => setSelectedSystemTaskId(task.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
                            {difficulty}
                          </span>
                          <span className="flex-1 truncate font-bold text-[11px]">
                            {task.title || '未命名任务'}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              finished ? 'text-emerald-500' : day ? 'text-slate-500' : 'text-white/70'
                            }`}
                          >
                            {finished ? '已完成' : '进行中'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 右侧详情 */}
              <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${day ? 'bg-slate-100/60' : 'bg-slate-950/40'}`}>
                <div className={`px-5 py-3 border-b ${styles.border} flex items-center justify-between shrink-0`}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className={`text-[11px] uppercase tracking-[0.25em] ${styles.contentMuted}`}>
                      任务详情
                    </div>
                    <div className={`text-sm md:text-base font-bold break-words min-w-0 ${day ? 'text-slate-800' : 'text-white'}`}>
                      {selectedSystemTask?.title || '暂无选中任务'}
                    </div>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-2 text-[12px] min-h-0 ${styles.contentText}`}>
                  {selectedSystemTask ? (
                    <>
                      <div>
                        <div className="text-[11px] font-semibold mb-0.5">任务类别</div>
                        <div>{selectedSystemTask.category || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold mb-0.5">任务目标</div>
                        <div className="whitespace-pre-wrap">{selectedSystemTask.goal || '—'}</div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] font-semibold mb-0.5">截止时间</div>
                          <div>{selectedSystemTask.deadline || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold mb-0.5">难度等级</div>
                          <div>{selectedSystemTask.difficulty || '—'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold mb-0.5">任务奖励</div>
                        <div className="whitespace-pre-wrap text-emerald-500">{selectedSystemTask.reward || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold mb-0.5">任务惩罚</div>
                        <div className="whitespace-pre-wrap text-rose-500">{selectedSystemTask.penalty || '—'}</div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.contentMuted}>当前没有选中的任务。</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 普通角色：使用原有档案视图
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="pointer-events-auto w-full max-w-4xl h-[80vh] bg-slate-50 rounded-[32px] shadow-[0_30px_120px_rgba(15,23,42,0.65)] overflow-hidden flex relative animate-in fade-in slide-in-from-bottom-4 duration-300"
          onClick={e => e.stopPropagation()}
        >
          {/* 左侧代表色竖条 */}
          <div
            className="absolute inset-y-0 left-0 w-3"
            style={{ background: primaryColor }}
          />

          {/* 右侧银色活页孔洞 */}
          <div className="absolute right-3 top-10 bottom-10 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-gradient-to-b from-slate-100 to-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.9),0_0_6px_rgba(148,163,184,0.8)]"
              />
            ))}
          </div>

          {/* 顶部回形针装饰 */}
          <div className="absolute left-24 -top-3 rotate-6">
            <div className="w-10 h-6 rounded-full border-2 border-slate-300 bg-gradient-to-b from-slate-100 to-slate-300 shadow-[0_3px_6px_rgba(15,23,42,0.35)]" />
          </div>

          {/* 左侧：信息区 */}
          <div className="flex-1 pl-10 pr-6 py-8 ml-6 border-r border-slate-200 bg-white/90 relative">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              {/* 关闭当前界面的立绘（高亮显示，提示本场景不再出现） */}
              <button
                type="button"
                onClick={() => onCloseSprite && onCloseSprite(character)}
                className="px-3 h-8 rounded-full text-[11px] font-semibold flex items-center gap-1.5 bg-red-500 text-white shadow-[0_4px_18px_rgba(248,113,113,0.55)] hover:bg-red-600 hover:shadow-[0_6px_22px_rgba(248,113,113,0.75)] border border-red-400/80 transition-colors"
                title="关闭本角色立绘：本场景内不会再出现，直到他再次说话。"
              >
                <span className="inline-flex w-3 h-3 rounded-full bg-white/90 text-[9px] items-center justify-center text-red-500 font-black">
                  ×
                </span>
                <span>关闭立绘</span>
              </button>
              {/* 关闭面板 */}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 h-full flex flex-col">
              {/* 顶部标题 */}
              <div>
                <div
                  className="text-[11px] font-black uppercase tracking-[0.35em]"
                  style={{ color: primaryColor }}
                >
                  Subject
                  <span className="ml-1 text-slate-400">· dossier</span>
                </div>
                <div className="mt-1 text-[22px] font-black tracking-wide text-slate-900 flex items-baseline gap-2">
                  {character.name}
                  <span className="text-[11px] font-mono text-slate-400">{String(character.id)}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {identity === '—' ? '等待根据剧情生成身份概要…' : identity}
                </div>
              </div>

              {/* 顶部二级菜单：档案 / 角色事件 */}
              <div className="mt-4 flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all border ${
                    activeTab === 'profile'
                      ? 'bg-slate-900 text-slate-50 border-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.45)]'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  角色档案
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('events')}
                  className={`relative px-3 py-1 rounded-md text-[11px] font-semibold transition-all border shadow-sm ${
                    activeTab === 'events'
                      ? 'bg-amber-100 text-slate-800 -rotate-1 shadow-[0_6px_15px_rgba(15,23,42,0.35)]'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  style={
                    activeTab === 'events'
                      ? { backgroundColor: `${primaryColor}1a`, borderColor: `${primaryColor}88`, color: primaryColor }
                      : undefined
                  }
                >
                  角色事件
                </button>
                <button
                  type="button"
                  onClick={() => onEditAppearance && onEditAppearance(character)}
                  className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                >
                  外观设置…
                </button>
              </div>

              {/* 主体内容区域：根据二级菜单切换 */}
              {activeTab === 'profile' && (
                <>
                  {/* 关键标签 & 数值条：Player 不展示数值，与 NPC 做出区分 */}
                  {!isPlayer && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                        <span
                          className="px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50"
                          style={{ color: primaryColor, borderColor: primaryColor + '55' }}
                        >
                          CORE SUBJECT
                        </span>
                        <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                          TRUST <span style={{ color: highlightColor }}>{Math.round(favor)}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                          SYNC <span style={{ color: highlightColor }}>{Math.round(desire)}</span>
                        </span>
                      </div>

                      <div className="mt-2 space-y-3">
                        {renderBar('直男程度', power, 'bg-purple-500')}
                        {renderBar('好感值', favor, 'bg-blue-600')}
                        {renderBar('性欲值', desire, 'bg-pink-500')}
                      </div>
                    </>
                  )}

                  {/* 文本介绍 */}
                  <div className="mt-4 flex-1 overflow-y-auto pr-2 space-y-3 text-[12px] leading-relaxed text-slate-700">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">人物概要</div>
                      <div className="whitespace-pre-wrap">
                        {character.description && character.description.trim()
                          ? character.description
                          : '（暂无概要，可在档案页通过 AI 刷新生成。）'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">心理侧写</div>
                      <div className="whitespace-pre-wrap font-mono text-[11px] text-slate-600">
                        {character.psychological && character.psychological.trim()
                          ? character.psychological
                          : '（暂无心理侧写。）'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">机密 / 喜好</div>
                      <div className="whitespace-pre-wrap font-mono text-[11px] text-slate-600">
                        {kink && kink !== '—' ? kink : '（暂无公开情报。）'}
                      </div>
                    </div>
                    {/* 外观设置：代表色 */}
                    <div className="pt-2 border-t border-dashed border-slate-200 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-semibold text-slate-400">代表色</div>
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={e => onUpdateThemeColor && onUpdateThemeColor(character.id, e.target.value)}
                          className="w-8 h-4 rounded cursor-pointer border border-slate-300"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400">
                        代表色会同步到姓名框、资料卡等界面，用于区分角色。
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'events' && (
                <div className="mt-4 flex-1 overflow-y-auto pr-2 space-y-3 text-[12px] leading-relaxed text-slate-700 scroll-smooth scrollbar-thin scrollbar-thumb-slate-300/80 scrollbar-track-transparent">
                  {roleEvents.length === 0 && (
                    <div className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-2 bg-slate-50/60">
                      （世界书中尚未配置【角色事件】词条，或当前角色没有匹配的事件块。）
                    </div>
                  )}
                  {roleEvents.map(ev => {
                    const favorOk = ev.favorReq == null || favor >= ev.favorReq;
                    const desireOk = ev.desireReq == null || desire >= ev.desireReq;
                    const straightOk = ev.straightReq == null || power >= ev.straightReq;
                    const unlocked = favorOk && desireOk && straightOk;
                    const cgUrl = findCgUrl(ev.cgKeyword);
                    return (
                      <div
                        key={ev.id}
                        className={`group flex gap-3 items-center rounded-xl border px-3 py-2 transition-all duration-150 ${
                          unlocked
                            ? 'bg-white border-slate-200 shadow-[0_6px_18px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.18)] cursor-pointer'
                            : 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-default'
                        }`}
                        onClick={() => {
                          if (!unlocked) return;
                          if (onInsertText) {
                            onInsertText(ev.description);
                          }
                          onClose();
                        }}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="font-semibold text-[12px] truncate">{ev.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                            <span
                              className={`px-1.5 py-0.5 rounded-full border ${
                                unlocked
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-300 bg-slate-100 text-slate-400'
                              }`}
                            >
                              {unlocked ? '可触发' : '未达标'}
                            </span>
                            {ev.favorReq != null && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                                好感值 ≥ {ev.favorReq}
                              </span>
                            )}
                            {ev.desireReq != null && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                                性欲值 ≥ {ev.desireReq}
                              </span>
                            )}
                            {ev.straightReq != null && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                                直男程度 ≥ {ev.straightReq}
                              </span>
                            )}
                            {ev.cgKeyword && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                                CG：{ev.cgKeyword}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 group-hover:line-clamp-4">
                            {ev.description}
                          </div>
                        </div>
                        {cgUrl && (
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
                            <img
                              src={cgUrl}
                              alt={ev.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={!unlocked}
                          onClick={() => {
                            if (!unlocked) return;
                            if (onInsertText) {
                              onInsertText(ev.description);
                            }
                            onClose();
                          }}
                          className={`ml-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors shrink-0 ${
                            unlocked
                              ? 'border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              : 'border-slate-300 text-slate-400 bg-slate-100 cursor-default'
                          }`}
                        >
                          跳转
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：立绘区 */}
          <div className="w-[40%] h-full relative bg-gradient-to-b from-slate-100 to-slate-200 overflow-hidden flex items-end justify-center">
            <div className="absolute inset-0 opacity-40 pointer-events-none" />
            <div className="relative h-[90%] flex items-end justify-center">
              <img
                src={character.avatarUrl}
                alt={character.name}
                className="max-h-full w-auto object-contain drop-shadow-[0_30px_60px_rgba(15,23,42,0.7)]"
                onError={e => { e.currentTarget.src = generateDefaultAvatar(character.name, character.themeColor || '#64748b'); }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // classic 模式：原有浮窗
  if (isSystem) {
    const day = theme === 'day' || theme === 'tech-white' || theme === 'fantasy-elegant';
    const borderCls = day ? 'border-slate-200' : 'border-white/15';
    const bgCls = day ? 'bg-white/95' : 'bg-slate-950/85';
    const headBgCls = day ? 'bg-slate-50' : 'bg-white/5';
    const textCls = day ? 'text-slate-900' : 'text-white';
    const mutedCls = day ? 'text-slate-500' : 'text-white/60';

    const grade = (raw: string) => {
      const m = (raw || '').match(/^\s*([A-Z0-9]+)/i);
      return m ? `${m[1]}级` : '—';
    };

    return (
      <div className="absolute inset-0 z-40" onClick={onClose}>
        <div
          className={`pointer-events-auto w-[320px] rounded-3xl shadow-[0_24px_80px_rgba(15,23,42,0.45)] border overflow-hidden transform transition-all duration-250 ease-out ${
            visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'
          } ${borderCls} ${bgCls}`}
          style={panelStyle}
          onClick={e => e.stopPropagation()}
        >
          <div className={`px-5 py-4 border-b ${borderCls} flex items-center justify-between ${headBgCls}`}>
            <div className="min-w-0">
              <div className={`text-xs font-semibold ${mutedCls}`}>系统任务</div>
              <div className={`text-base font-bold truncate ${textCls}`}>
                系统 · {systemTasks.length > 0 ? `共 ${systemTasks.length} 条` : '暂无任务'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                day ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              aria-label="关闭"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className={`text-[11px] uppercase tracking-[0.2em] ${mutedCls}`}>任务列表</div>
            <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {systemTasks.length === 0 ? (
                <div className={`text-sm ${mutedCls}`}>当前没有解析出的系统任务。</div>
              ) : (
                systemTasks.map(t => {
                  const active = selectedSystemTask?.id === t.id;
                  const finished = !!t.raw && /已完成|完成任务|任务完成/.test(t.raw);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedSystemTaskId(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-2xl border text-[12px] transition-colors ${
                        active
                          ? day
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : 'border-emerald-400 bg-emerald-500/10 text-white'
                          : day
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/90'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            day ? 'bg-emerald-500/10 text-emerald-600' : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {grade(t.difficulty)}
                        </span>
                        <span className="flex-1 truncate font-semibold">{t.title || '未命名任务'}</span>
                        <span className={`text-[10px] font-semibold ${finished ? 'text-emerald-500' : mutedCls}`}>
                          {finished ? '已完成' : '进行中'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className={`pt-2 border-t ${borderCls}`}>
              <div className={`text-[11px] uppercase tracking-[0.2em] ${mutedCls}`}>详情</div>
              <div className={`mt-2 text-sm font-bold ${textCls}`}>
                {selectedSystemTask?.title || '暂无选中任务'}
              </div>
              <div className={`mt-2 space-y-2 text-[12px] ${day ? 'text-slate-700' : 'text-white/80'}`}>
                <div>
                  <div className={`text-[11px] font-semibold ${mutedCls}`}>目标</div>
                  <div className="whitespace-pre-wrap">{selectedSystemTask?.goal || '—'}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold ${mutedCls}`}>截止</div>
                    <div className="truncate">{selectedSystemTask?.deadline || '—'}</div>
                  </div>
                  <div className="min-w-0 text-right">
                    <div className={`text-[11px] font-semibold ${mutedCls}`}>类别</div>
                    <div className="truncate">{selectedSystemTask?.category || '—'}</div>
                  </div>
                </div>
                <div>
                  <div className={`text-[11px] font-semibold ${mutedCls}`}>奖励</div>
                  <div
                    className={
                      day
                        ? 'whitespace-pre-wrap text-emerald-600'
                        : 'whitespace-pre-wrap text-emerald-400'
                    }
                  >
                    {selectedSystemTask?.reward || '—'}
                  </div>
                </div>
                <div>
                  <div className={`text-[11px] font-semibold ${mutedCls}`}>惩罚</div>
                  <div
                    className={
                      day
                        ? 'whitespace-pre-wrap text-red-600'
                        : 'whitespace-pre-wrap text-red-400'
                    }
                  >
                    {selectedSystemTask?.penalty || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-40"
      onClick={onClose}
    >
      <div
        className={`pointer-events-auto w-[280px] rounded-3xl bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.45)] border border-slate-200 overflow-hidden transform transition-all duration-250 ease-out ${
          visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'
        }`}
        style={panelStyle}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="text-xs font-semibold" style={{ color: character.themeColor || '#64748b' }}>角色情报</div>
            <div className="text-base font-bold" style={{ color: character.themeColor || '#111827' }}>{character.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCloseSprite && onCloseSprite(character)}
              className="px-2 h-7 rounded-full text-[11px] font-semibold text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              关闭立绘
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3 text-xs text-slate-700">
          {/* 二级菜单：信息 / 角色事件 */}
          <div className="flex gap-2 mb-2 items-center">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                activeTab === 'profile'
                  ? 'bg-slate-900 text-slate-50 border-slate-900'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
            >
              角色情报
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                activeTab === 'events'
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
            >
              角色事件
            </button>
            <button
              type="button"
              onClick={() => onEditAppearance && onEditAppearance(character)}
              className="ml-auto px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              外观设置…
            </button>
          </div>

          {activeTab === 'profile' && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-400">身份</span>
                <span className="text-sm font-medium text-slate-900">{identity}</span>
              </div>

              {/* NPC：显示数值面板；Player：只保留基础信息 */}
              {!isPlayer && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">直男程度</div>
                      <div className="mt-0.5 inline-flex px-2 py-1 rounded-full bg-slate-100 text-[11px] font-medium text-slate-700">
                        {straightLabel}（{Math.round(Math.max(0, Math.min(100, power)))} / 100）
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">关系</div>
                      <div className="mt-0.5 inline-flex px-2 py-1 rounded-full bg-slate-100 text-[11px] font-medium text-slate-700">
                        {relation}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">好感值</div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden relative">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, favor))}%` }}
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-orange-400">
                          {Math.round(favor)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1">性欲值</div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden relative">
                        <div
                          className="h-full rounded-full bg-pink-500 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, desire))}%` }}
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-orange-400">
                          {Math.round(desire)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1">喜好</div>
                <div className="inline-flex flex-wrap gap-1">
                  <span className="px-2 py-1 rounded-full bg-emerald-50 text-[11px] font-medium text-emerald-700 border border-emerald-100">
                    {like}
                  </span>
                </div>
              </div>
              {/* 外观设置：代表色 */}
              <div className="pt-2 mt-2 border-t border-dashed border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-semibold text-slate-400">代表色</div>
                  <input
                    type="color"
                    value={character.themeColor || '#10b981'}
                    onChange={e => onUpdateThemeColor && onUpdateThemeColor(character.id, e.target.value)}
                    className="w-7 h-4 rounded cursor-pointer border border-slate-300"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'events' && (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scroll-smooth scrollbar-thin scrollbar-thumb-slate-300/80 scrollbar-track-transparent">
              {roleEvents.length === 0 && (
                <div className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-2 bg-slate-50/60">
                  （世界书中尚未配置【角色事件】词条，或当前角色没有匹配的事件块。）
                </div>
              )}
              {roleEvents.map(ev => {
                const favorOk = ev.favorReq == null || favor >= ev.favorReq;
                const desireOk = ev.desireReq == null || desire >= ev.desireReq;
                const straightOk = ev.straightReq == null || power >= ev.straightReq;
                const unlocked = favorOk && desireOk && straightOk;
                return (
                  <div
                    key={ev.id}
                    className={`rounded-xl border px-3 py-2 space-y-1 transition-all duration-150 ${
                      unlocked
                        ? 'bg-white border-slate-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
                        : 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-default'
                    }`}
                    onClick={() => {
                      if (!unlocked) return;
                      if (onInsertText) {
                        onInsertText(ev.description);
                      }
                      onClose();
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-[12px] truncate">{ev.name}</div>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          unlocked
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-400/70'
                            : 'bg-slate-100 text-slate-400 border border-slate-300'
                        }`}
                      >
                        {unlocked ? '可触发' : '未达标'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
                      {ev.favorReq != null && (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                          好感值 ≥ {ev.favorReq}
                        </span>
                      )}
                      {ev.desireReq != null && (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                          性欲值 ≥ {ev.desireReq}
                        </span>
                      )}
                      {ev.straightReq != null && (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100">
                          直男程度 ≥ {ev.straightReq}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 line-clamp-2">
                      {ev.description}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={() => {
                          if (!unlocked) return;
                          if (onInsertText) {
                            onInsertText(ev.description);
                          }
                          onClose();
                        }}
                        className={`mt-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                          unlocked
                            ? 'border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'border-slate-300 text-slate-400 bg-slate-100 cursor-default'
                        }`}
                      >
                        跳转
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

