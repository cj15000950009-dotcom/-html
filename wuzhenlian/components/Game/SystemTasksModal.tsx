import React, { useMemo, useState, useEffect } from 'react';
import type { SystemTask } from '../../types';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { ModalCloseX } from './ModalCloseX';

interface SystemTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: SystemTask[];
  theme?: string;
  /** 弹窗形态：modal 大型界面；popover 小型弹窗（显示本次任务完整内容） */
  variant?: 'modal' | 'popover';
  /** 大型界面：点击缩小按钮时调用，切换为小型弹窗 */
  onOpenSmallPopover?: () => void;
}

type SystemTab = 'tasks' | 'inventory';

const isDay = (t: string) => t === 'day';

export const SystemTasksModal: React.FC<SystemTasksModalProps> = ({ isOpen, onClose, tasks, theme = 'night', variant = 'modal', onOpenSmallPopover }) => {
  const [activeTab, setActiveTab] = useState<SystemTab>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  /** 小型弹窗：任务列表是否折叠（默认折叠） */
  const [taskListCollapsedPopover, setTaskListCollapsedPopover] = useState(true);
  /** 大型界面：任务列表是否折叠（默认展开） */
  const [taskListCollapsedModal, setTaskListCollapsedModal] = useState(false);
  const isPopover = variant === 'popover';

  // 小型弹窗拖拽 & 最小化状态（仅在 variant === 'popover' 时实际生效）
  const [dragState, setDragState] = useState<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id);
    } else if (tasks.length > 0 && selectedTaskId && !tasks.find(t => t.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [isOpen, tasks, selectedTaskId]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('tasks');
      setTaskListCollapsedPopover(true);
      setTaskListCollapsedModal(false);
    }
  }, [isOpen]);

  // 小弹窗打开/关闭时重置拖拽与最小化状态
  useEffect(() => {
    if (!isPopover) return;
    if (!isOpen) {
      setPosition({ x: 0, y: 0 });
      setIsMinimized(false);
      setDragState(null);
    }
  }, [isOpen, isPopover]);

  // 拖拽逻辑：仅在小弹窗且正在拖拽时生效
  useEffect(() => {
    if (!isPopover) return;
    if (!dragState?.dragging) return;
    const handleMove = (e: MouseEvent) => {
      const nextX = e.clientX - dragState.offsetX;
      const nextY = e.clientY - dragState.offsetY;
      // 限制拖拽范围，避免面板一下子跑到很下面
      const maxOffsetY = window.innerHeight * 0.3;
      const minOffsetY = -window.innerHeight * 0.3;
      setPosition({
        x: nextX,
        y: Math.min(Math.max(nextY, minOffsetY), maxOffsetY),
      });
    };
    const handleUp = () => {
      setDragState(prev => (prev ? { ...prev, dragging: false } : null));
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState, isPopover]);

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPopover) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    setDragState({
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    });
    e.preventDefault();
  };

  const showCollapseToggle = isPopover ? tasks.length > 1 : activeTab === 'tasks';
  const listCollapsed = isPopover ? taskListCollapsedPopover : (activeTab === 'tasks' && taskListCollapsedModal);
  const setListCollapsed = isPopover ? setTaskListCollapsedPopover : setTaskListCollapsedModal;

  const day = isDay(theme);
  const styles = {
    modalBg:
      theme === 'day'
        ? 'bg-slate-50'
        : theme === 'tech'
          ? 'bg-[#050816]'
          : theme === 'fantasy-elegant'
            ? 'bg-[#faf6ee]'
            : theme === 'ink-jianghu'
              ? 'bg-black'
              : theme === 'black-gold'
                ? 'bg-[#050505]'
                : 'bg-slate-950',
    headerAccent:
      theme === 'ink-jianghu'
        ? 'text-white'
        : theme === 'fantasy-elegant'
          ? 'text-amber-900'
          : theme === 'black-gold'
            ? 'text-amber-300'
            : theme === 'tech'
              ? 'text-cyan-400'
              : 'text-emerald-400',
    pillActive:
      theme === 'ink-jianghu'
        ? 'bg-white text-black'
        : theme === 'fantasy-elegant'
          ? 'bg-amber-700 text-white'
          : theme === 'black-gold'
            ? 'bg-amber-500 text-black'
            : 'bg-emerald-500 text-white',
    pillInactive:
      theme === 'fantasy-elegant'
        ? 'bg-amber-100/80 text-amber-900/80 hover:bg-amber-200/90'
        : day
          ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80'
          : 'bg-white/5 text-white/60 hover:bg-white/10',
    contentText:
      theme === 'fantasy-elegant' ? 'text-amber-950' : day ? 'text-slate-800' : 'text-white/80',
    contentMuted:
      theme === 'fantasy-elegant' ? 'text-amber-900/70' : day ? 'text-slate-600' : 'text-white/60',
    contentHeading:
      theme === 'fantasy-elegant' ? 'text-amber-900/85' : day ? 'text-slate-700' : 'text-white/70',
    border: theme === 'fantasy-elegant' ? 'border-amber-800/25' : day ? 'border-slate-200' : 'border-white/10',
  };
  const inkBgStyle =
    theme === 'ink-jianghu'
      ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.52)), url(${inkJianghuExternalUrls.baseBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
        }
      : theme === 'fantasy-elegant'
        ? {
            background: 'linear-gradient(180deg, #fffdf8 0%, #f4ecd8 100%)',
            fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
          }
        : undefined;
  const inkTitleStyle = theme === 'ink-jianghu' ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : tasks[0] ?? null),
    [tasks, selectedTaskId],
  );

  // 从任务奖励里提取“系统背包”道具列表
  const inventory = useMemo(() => {
    const map = new Map<string, { name: string; from: string[] }>();
    const splitReward = (raw: string) => {
      if (!raw) return [] as string[];
      return raw
        .split(/[\n,，、;]/)
        .map(s => s.trim())
        .filter(Boolean);
    };
    tasks.forEach(t => {
      splitReward(t.reward).forEach(name => {
        if (!map.has(name)) {
          map.set(name, { name, from: [t.title || '未知任务'] });
        } else {
          const cur = map.get(name)!;
          if (!cur.from.includes(t.title)) cur.from.push(t.title || '未知任务');
        }
      });
    });
    return Array.from(map.values());
  }, [tasks]);

  if (!isOpen) return null;

  // 小型弹窗：默认显示在对话框上方，可拖拽，并可最小化为悬浮球
  if (isPopover) {
    const taskCountLabel = tasks.length > 0 ? `共 ${tasks.length} 条` : '暂无任务';

    return (
      <div
        className={
          `fixed inset-0 z-[105] pointer-events-none flex ` +
          (isMinimized ? 'items-center justify-start px-4' : 'items-start justify-center pt-[80px] px-4')
        }
      >
        <div
          className={`pointer-events-auto flex ${isMinimized ? 'w-auto h-auto' : 'w-full max-w-[420px] max-h-[55vh]'}`}
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          onClick={e => e.stopPropagation()}
        >
          {isMinimized ? (
            // 悬浮球：只显示圆形图标，固定在左侧中部，不遮挡时间卡
            <button
              type="button"
              className={`flex items-center justify-center w-11 h-11 rounded-full shadow-lg border-2 ${
                day ? 'bg-white/90 border-emerald-400 text-slate-800' : 'bg-slate-900/95 border-emerald-400 text-white'
              }`}
              onClick={e => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
              title="点击还原系统任务面板"
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-[11px] font-bold text-black">
                任
              </span>
            </button>
          ) : (
            <div
              className={`w-full max-w-[420px] max-h-[75vh] rounded-xl shadow-2xl border ${styles.border} ${styles.modalBg} flex flex-col overflow-hidden`}
              style={inkBgStyle}
            >
              {/* 顶部小标题条（仅图标 + 计数 + 折叠/关闭） */}
              <div
                className={`px-4 py-3 border-b ${styles.border} flex items-center justify-between gap-2 shrink-0`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span
                    className={`text-[12px] font-bold truncate ${theme === 'fantasy-elegant' ? 'text-amber-950' : day ? 'text-slate-800' : 'text-white'}`}
                    style={inkTitleStyle}
                  >
                    系统任务{tasks.length > 0 ? ` · 共 ${tasks.length} 条` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className={`p-1 rounded ${styles.pillInactive}`}
                    onClick={e => {
                      e.stopPropagation();
                      setIsMinimized(true);
                    }}
                    title="最小化为悬浮球"
                    aria-label="最小化"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  {showCollapseToggle && (
                    <button
                      type="button"
                      className={`p-1 rounded ${styles.pillInactive}`}
                      onClick={() => setListCollapsed(prev => !prev)}
                      title={listCollapsed ? '展开列表' : '折叠列表'}
                      aria-label={listCollapsed ? '展开列表' : '折叠列表'}
                    >
                      {listCollapsed ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      )}
                    </button>
                  )}
                  <ModalCloseX variant="inline" onClose={onClose} />
                </div>
              </div>

              {/* 内容：可展开的列表 + 详情 */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                {/* 列表（默认折叠）：只展示档位 / 名称 / 完成状态 */}
                {!listCollapsed && (
                  <div className={`w-full md:w-[40%] border-b md:border-b-0 md:border-r ${styles.border} flex flex-col min-h-0`}>
                    <div className={`px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${styles.contentMuted} shrink-0`}>
                      当前任务
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2 min-h-0">
                      {tasks.map(t => {
                        const isActive = selectedTask?.id === t.id;
                        const gradeMatch = (t.difficulty || '').match(/^\s*([A-Z0-9]+)/i);
                        const difficulty = gradeMatch ? `${gradeMatch[1]}级` : '—';
                        const finished = !!t.raw && /已完成|完成任务|任务完成/.test(t.raw);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] transition-all min-w-0 ${
                              isActive
                                ? 'border-emerald-400 bg-emerald-500/10 text-slate-900'
                                : day
                                ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-800'
                                : 'border-white/10 bg-slate-900/90 hover:bg-slate-800 text-slate-100'
                            }`}
                            onClick={() => setSelectedTaskId(t.id)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                                {difficulty}
                              </span>
                              <span
                                className={`text-[10px] font-semibold ${
                                  finished ? 'text-emerald-500' : 'text-slate-400'
                                }`}
                              >
                                {finished ? '已完成' : '进行中'}
                              </span>
                            </div>
                            <div className="text-[12px] font-bold truncate">
                              {t.title || '未命名任务'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 详情：min-h-0 保证内容区可滚动，奖励/惩罚长文完整显示 */}
                <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${day ? 'bg-slate-100/50' : 'bg-slate-950/40'}`}>
              <div className={`px-4 py-3 border-b ${styles.border} flex items-center justify-between shrink-0`}>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className={`text-[11px] uppercase tracking-[0.25em] ${styles.contentMuted}`}>任务详情</div>
                  <div className={`text-sm font-bold break-words min-w-0 ${day ? 'text-slate-800' : 'text-white'}`}>
                        {selectedTask?.title || '暂无任务'}
                      </div>
                    </div>
                  </div>
                  <div className={`flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2 text-[12px] ${styles.contentText} min-h-0`}>
                    {selectedTask ? (
                      <>
                        <DetailRow label="任务类别" value={selectedTask.category} day={day} />
                        <DetailRow label="任务名称" value={selectedTask.title} day={day} />
                        <DetailRow label="任务目标" value={selectedTask.goal} multiline day={day} />
                        <DetailRow label="截止时间" value={selectedTask.deadline} day={day} />
                        <DetailRow label="难度等级" value={selectedTask.difficulty} day={day} />
                        <DetailRow label="任务奖励" value={selectedTask.reward} multiline day={day} valueColor="reward" />
                        <DetailRow label="任务惩罚" value={selectedTask.penalty} multiline day={day} valueColor="penalty" />
                      </>
                    ) : (
                      <div className={`text-sm ${styles.contentMuted}`}>当前没有进行中的系统任务。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 大型界面：完整任务面板
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 md:p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[min(96vw,960px)] md:max-w-5xl h-[92vh] md:h-[84vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl border ${styles.border} ${styles.modalBg}`}
        onClick={e => e.stopPropagation()}
        style={inkBgStyle}
      >
        {/* 顶部标题 & 标签页 */}
        <div className={`px-4 py-2.5 md:px-5 md:py-3 border-b ${styles.border} flex items-center justify-between gap-2 flex-shrink-0`}>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className={`text-[10px] font-black tracking-[0.35em] uppercase ${styles.headerAccent}`} style={inkTitleStyle}>
              SYSTEM · TASKS
            </div>
            <div
              className={`text-sm md:text-base font-bold flex items-center gap-2 ${theme === 'fantasy-elegant' ? 'text-amber-950' : day ? 'text-slate-800' : 'text-white'}`}
              style={inkTitleStyle}
            >
              <span>系统任务</span>
              {tasks.length > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    theme === 'fantasy-elegant'
                      ? 'bg-amber-200/80 text-amber-900'
                      : day
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-white/10 text-white/70'
                  }`}
                >
                  共 {tasks.length} 条
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenSmallPopover && (
              <button
                type="button"
                className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${styles.pillInactive}`}
                onClick={onOpenSmallPopover}
                title="切换为小型弹窗"
              >
                小型
              </button>
            )}
            <div className={`hidden md:flex items-center gap-1 rounded-full px-1 py-0.5 text-[10px] ${day ? 'bg-slate-200/80 text-slate-600' : 'bg-white/5 text-white/60'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>正文中使用 {'<xitong>...</xitong>'} 触发系统任务</span>
            </div>
            <ModalCloseX variant="inline" onClose={onClose} />
          </div>
        </div>

        {/* 二级菜单 */}
        <div className={`px-4 pt-2 flex items-center gap-2 border-b ${styles.border}`}>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              activeTab === 'tasks' ? styles.pillActive : styles.pillInactive
            }`}
            onClick={() => setActiveTab('tasks')}
          >
            系统任务
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              activeTab === 'inventory' ? styles.pillActive : styles.pillInactive
            }`}
            onClick={() => setActiveTab('inventory')}
          >
            系统背包
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {activeTab === 'tasks' && (
            <>
              {/* 左侧：任务列表（可折叠，折叠时保留窄条以便展开） */}
              <div
                className={`flex flex-col border-b md:border-b-0 md:border-r ${styles.border} shrink-0 ${
                  listCollapsed ? 'w-12 md:w-12' : 'w-full md:w-[28%]'
                }`}
              >
                <div className={`px-2 py-2 flex items-center gap-1 shrink-0 ${styles.border} border-b min-w-0 ${listCollapsed ? 'justify-center' : 'justify-between'}`}>
                  {!listCollapsed && (
                    <span className={`text-[10px] uppercase tracking-[0.2em] ${styles.contentMuted} truncate`}>
                      当前任务列表
                    </span>
                  )}
                  {showCollapseToggle && (
                    <button
                      type="button"
                      className={`p-1.5 rounded shrink-0 ${styles.pillInactive}`}
                      onClick={() => setListCollapsed(prev => !prev)}
                      title={listCollapsed ? '展开列表' : '折叠列表'}
                      aria-label={listCollapsed ? '展开列表' : '折叠列表'}
                    >
                      {listCollapsed ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                      )}
                    </button>
                  )}
                </div>
                {!listCollapsed && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2 min-h-0">
                    {tasks.length === 0 && (
                      <div className={`px-4 py-6 text-center text-sm ${styles.contentMuted}`}>
                        当前没有进行中的系统任务。<br />
                        正文中使用 {'<xitong>...</xitong>'} 可生成任务条目，至少需要【任务名称】或等价字段。
                      </div>
                    )}
                    {tasks.map(task => {
                      const isActive = selectedTask?.id === task.id;
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
                          onClick={() => setSelectedTaskId(task.id)}
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
                )}
              </div>

              {/* 右侧：任务详情 */}
              <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${day ? 'bg-slate-100/50' : 'bg-slate-950/40'}`}>
                <div className={`px-4 py-3 border-b ${styles.border} flex items-center justify-between flex-shrink-0`}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className={`text-[11px] uppercase tracking-[0.25em] ${styles.contentMuted}`}>
                      任务详情
                    </div>
                    <div className={`text-sm md:text-base font-bold break-words min-w-0 ${day ? 'text-slate-800' : 'text-white'}`}>
                      {selectedTask?.title || '暂无选中任务'}
                    </div>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-2 text-[12px] min-h-0 ${styles.contentText}`}>
                  {selectedTask ? (
                    <>
                      <DetailRow label="任务类别" value={selectedTask.category} day={day} />
                      <DetailRow label="任务名称" value={selectedTask.title} day={day} />
                      <DetailRow label="任务目标" value={selectedTask.goal} multiline day={day} />
                      <DetailRow label="截止时间" value={selectedTask.deadline} day={day} />
                      <DetailRow label="难度等级" value={selectedTask.difficulty} day={day} />
                      <DetailRow label="任务奖励" value={selectedTask.reward} multiline day={day} valueColor="reward" />
                      <DetailRow label="任务惩罚" value={selectedTask.penalty} multiline day={day} valueColor="penalty" />
                    </>
                  ) : (
                    <div className={`text-sm ${styles.contentMuted}`}>
                      请选择左侧的一条任务查看详情。
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'inventory' && (
            <div className={`flex-1 flex flex-col px-5 py-4 text-sm space-y-3 overflow-y-auto custom-scrollbar ${styles.contentText}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs font-semibold mb-1 ${styles.contentHeading}`}>系统背包</div>
                  <p className={`text-[11px] ${styles.contentMuted}`}>
                    此处根据所有任务中的【任务奖励】字段自动汇总，展示可能获得的实物 / 技能。
                  </p>
                </div>
              </div>
              {inventory.length === 0 ? (
                <div className={`mt-4 text-center text-[13px] ${styles.contentMuted}`}>
                  当前任务尚未提供任何具体奖励条目。请在任务模板的【任务奖励】里写入道具或技能名。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {inventory.map(item => (
                    <div
                      key={item.name}
                      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1 ${day ? 'border-slate-200 bg-slate-100/80' : 'border-white/15 bg-white/5'}`}
                    >
                      <div className={`text-[12px] font-semibold truncate ${day ? 'text-slate-800' : 'text-white'}`}>{item.name}</div>
                      <div className={`text-[10px] ${styles.contentMuted}`}>
                        来源任务：
                        {item.from.join(' / ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string; multiline?: boolean; day?: boolean; valueColor?: 'reward' | 'penalty' }> = ({ label, value, multiline, day, valueColor }) => {
  const has = value && value.trim().length > 0;
  const labelCls = day ? 'text-[11px] font-semibold text-slate-600' : 'text-[11px] font-semibold text-white/60';
  const valueClsBase = has ? (day ? 'text-slate-800' : 'text-white/85') : (day ? 'text-slate-400 italic' : 'text-white/35 italic');
  const valueClsColor =
    valueColor === 'reward' && has
      ? (day ? 'text-emerald-600' : 'text-emerald-400')
      : valueColor === 'penalty' && has
      ? (day ? 'text-red-600' : 'text-red-400')
      : valueClsBase;
  const dividerCls = day ? 'h-px bg-slate-200 mt-1' : 'h-px bg-white/5 mt-1';
  const valueWrap = 'break-words min-w-0 whitespace-pre-wrap';
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className={labelCls}>{label}</span>
      {multiline ? (
        <p className={`text-[12px] leading-relaxed ${valueWrap} ${valueClsColor}`}>
          {has ? value : '未指定'}
        </p>
      ) : (
        <span className={`text-[12px] ${valueWrap} ${valueClsColor}`}>
          {has ? value : '未指定'}
        </span>
      )}
      <div className={dividerCls} />
    </div>
  );
};

