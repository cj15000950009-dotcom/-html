import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BACKGROUNDS,
    CHARACTERS,
    DEFAULT_CGS,
    DEFAULT_CUSTOM_LIBRARY,
    INITIAL_COMMAND_STRUCTURE,
    INITIAL_COMMAND_TEMPLATES,
    INITIAL_SCRIPT,
    isAllowedSpriteFolder,
    SILLY_TAVERN_WORLD_INFO,
} from './constants';
import { navChromeFontOf, uiFontOf } from './fontSettings';
import { useMvuData } from './hooks/useMvuData';
import { useViewportMobileLayout } from './hooks/useViewportMobileLayout';
import { analyzeCharacterStatus, generateCharacterResponse, generatePlotSuggestions } from './services/geminiService';
import { generateResponse, hasGenerate } from './services/tavernGenerate';
import {
    BackgroundFolder,
    CGFolder,
    CGItem,
    CGSet,
    Character,
    CharacterId,
    CustomFolder,
    DialogueLine,
    ExternalApiConfig,
    DialogueBoxLayoutConfig,
    GlobalSettings,
    SaveData,
    StageSprite,
    SystemTask,
    WorldInfoEntry,
} from './types';
import { bindData, notifyDataChanged } from './utils/dataBindingManager';
import { matchCgItemQuery, matchCgSetInProse, matchCgSetQuery } from './utils/cgMatch';
import {
    extractStructuredBodyForTavernDialogue,
    isPipeDelimitedDialogueBlock,
    loadFromLatestMessage,
    matchBackgroundInLibrary,
    parseChineseTimeToHourMinute,
    parseGalEngineSync,
    parseInfoSegment,
    parseMaintext,
    parseOptions,
    parsePipeDelimitedDialogueLines,
} from './utils/messageParser';
import { normalizeStageSpritesForAvatarFolder } from './utils/spriteFolder';

// Components
import inkNavFontUrl from './assets/fonts/HanYiShangWeiShouShuW.ttf';
import { AssetLibraryModal } from './components/Game/AssetLibraryModal';
import { CharacterInfoPanel } from './components/Game/CharacterInfoPanel';
import { CharacterSprite } from './components/Game/CharacterSprite';
import { CommandPalette } from './components/Game/CommandPalette';
import { ContextMenuWheel } from './components/Game/ContextMenuWheel';
import { DialogueBox } from './components/Game/DialogueBox';
import { Dossier } from './components/Game/Dossier';
import { DraggableFullscreenButton } from './components/Game/DraggableFullscreenButton';
import { ExternalLinkModal } from './components/Game/ExternalLinkModal';
import { GameVariablesModal } from './components/Game/GameVariablesModal';
import { HistoryLog } from './components/Game/HistoryLog';
import { OptionsModal } from './components/Game/OptionsModal';
import { SaveLoadModal } from './components/Game/SaveLoadModal';
import { ScheduleModal } from './components/Game/ScheduleModal';
import { SettingsModal } from './components/Game/SettingsModal';
import { SpritePickerModal } from './components/Game/SpritePickerModal';
import { SystemTasksModal } from './components/Game/SystemTasksModal';
import { inkJianghuExternalUrls } from './skins/inkJianghuExternalUrls';

const KAITI_STACK = '"KaiTi","STKaiti","楷体","Noto Serif SC","Source Han Serif SC",serif';
const SONGTI_STACK = '"SimSun","Songti SC","STSong","Noto Serif SC",serif';

const DEFAULT_SETTINGS: GlobalSettings = {
  theme: 'ink-jianghu',
  worldMode: 'reality',
  fontSize: 19,
  fontFamily: SONGTI_STACK,
  nameBoxFontFamily: KAITI_STACK,
  dialogueFontFamily: SONGTI_STACK,
  uiFontFamily: KAITI_STACK,
  nameBoxBold: false,
  nameBoxItalic: false,
  nameBoxTextShadowEnabled: true,
  typingSpeed: 15,
  autoInterval: 2,
  minPageDisplaySeconds: 4,
  boxOpacity: 0.85,
  topBarTransparent: true,
  volume: 0.5,
  bgmEnabled: true,
  enableStoryChoices: true,
  authorMode: false,
  enableNovelMode: false,
  plotGenPrompt: `基于当前语境，严格生成以下6个后续选项，每行一个，不要带编号：
1.生成推动剧情向最合理的情况发展的选项1（50字内）
2.生成剧情转折的选项1（50字内）
3.生成剧情转折的选项2（50字内）
4.生成将剧情逐渐推向nsfw的选项1（50字内）
5.生成其他势力或其他人（非user）的单一视角描写的选项（70字内）
6.生成快速推进或时间转换的选项（50字内）`,
  cgFitMode: 'cover',
  cgCoverAnchor: 'top',
  cgOffsetX: 0,
  cgOffsetY: 0,
  cgCloseMode: 'click',
  cgManualCloseOnly: false,
  dialogueSkin: 'glass',
  dialogueTextShadowEnabled: true,
  dialogueTextShadowSize: 2,
  inkDialogueFrameStyle: 'day',
  autoSaveEnabled: false,
  breathingEnabled: true,
  breathingScale: 1.015,
  breathingDuration: 2.5,
  spriteAnimationEnabled: true,
  spriteEnterAnimation: 'sprite-enter-fade-in',
  spriteExitAnimation: 'sprite-exit-fade-out',
  colors: { dialogue: '#e2e8f0', narrator: '#94a3b8', thought: '#10b981', system: '#e2e8f0', speech: '#f97316' },
  quickMenuCustomItems: [] as Array<{ id: string; label: string; modalKey: string }>,
  notificationDuration: 2,
  showTutorial: true,
  showFloatingFullscreen: true,
  matchMobileLayout: false,
  spriteInfoTrigger: 'dblclick',
  showTimeCard: true,
  timeCardOffsetX: 32,
  timeCardOffsetY: 32,
  timeCardScale: 1,
  spritesExitOnBackgroundChange: true,
  implicitSpriteEnterWhenPipeOmits: false,
  spriteAutoExitFromDialogueKeywords: false,
  developerMode: false,
  inkDialogueScale: 1,
  avatarPortraitOffsetX: 0,
  avatarPortraitOffsetY: 0,
  avatarPortraitScale: 1,
  avatarPortraitNudgeX: 0,
  avatarPortraitNudgeY: 0,
  framedDialoguePaddingTop: 50,
  framedDialoguePaddingRight: 88,
  framedDialoguePaddingBottom: 44,
  framedDialoguePaddingLeft: 122,
  framedNameOffsetLeftPx: 0,
  framedNameOffsetTopPx: 0,
  framedNameAreaHeightPx: 170,
  framedNameWritingMode: 'vertical',
  uiLayoutEditMode: false,
};

/** 换背景时「全员退场」再切图再入场的时长（与 global.css 中最长 sprite-exit-* 大致对齐） */
const BG_SPRITE_EXIT_TRANSITION_MS = 880;

/** 剧情同步用：槽位 instanceId  multiset 一致则视为「同一批人在台上」，仅换背景时不应走全员退场（否则同角会先出场再进场） */
function sameStageSpriteRoster(a: StageSprite[], b: StageSprite[]): boolean {
  if (a.length !== b.length) return false;
  const sig = (arr: StageSprite[]) =>
    [...arr]
      .map(s => String(s.instanceId || ''))
      .sort()
      .join('\x1e');
  return sig(a) === sig(b);
}

/** 立绘/舞台角色名匹配：全角空格、首尾空白、大小写 */
function normSpriteKey(s: string | undefined | null): string {
  return (
    String(s ?? '')
      .replace(/\u3000/g, ' ')
      // 允许管道中出现如「靖-武帝 / 萧-让」的破折号：立绘匹配时忽略 '-' 等符号
      .replace(/[-‐‑‒–—]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

type SpriteVisibleEntry = { sprite: StageSprite; char: Character; effectiveUrl: string };

/** 在多条立绘中选出「当前说话」对应的一条；用于单立绘模式与头像层（头像层始终只保留一条） */
function pickPrimaryStageSpriteInstanceId(
  visible: SpriteVisibleEntry[],
  activeSpeakerName: string | null | undefined,
  currentSpeaker: Character | null | undefined,
): string | null {
  if (visible.length === 0) return null;
  if (visible.length === 1) return visible[0].sprite.instanceId;
  const activeTrim = (activeSpeakerName || '').trim();
  if (activeTrim) {
    const an = normSpriteKey(activeTrim);
    const byActive = visible.find(({ sprite, char }) => {
      const sid = normSpriteKey(String(sprite.characterId || ''));
      return (
        sid === an ||
        normSpriteKey(char.name) === an ||
        normSpriteKey(String(char.id)) === an
      );
    });
    if (byActive) return byActive.sprite.instanceId;
  }
  if (currentSpeaker) {
    const speakerId = String(currentSpeaker.id || '').trim();
    const speakerName = (currentSpeaker.name || '').trim();
    const lowerId = speakerId.toLowerCase();
    const found = visible.find(({ sprite }) => {
      const sid = String(sprite.characterId || '').trim();
      const lower = sid.toLowerCase();
      return (
        lower === lowerId ||
        sid === speakerName ||
        normSpriteKey(sid) === normSpriteKey(speakerName) ||
        sid === '主角' ||
        sid === '玩家' ||
        lower === 'user' ||
        lower === '{{user}}'
      );
    });
    if (found) return found.sprite.instanceId;
  }
  let best = visible[0].sprite;
  let bestZ = best.zIndex ?? 0;
  for (const { sprite } of visible) {
    const z = sprite.zIndex ?? 0;
    if (z > bestZ) {
      best = sprite;
      bestZ = z;
    }
  }
  return best.instanceId;
}

/** 奇幻典雅主题：无具体说话人时不显示立绘（与竖排姓名一致） */
function isNarrationOnlySpeakerName(raw: string): boolean {
  const t = String(raw ?? '').trim();
  if (!t) return true;
  const n = normSpriteKey(t);
  if (n === normSpriteKey('旁白')) return true;
  if (n === 'narrator' || n === 'system') return true;
  if (n === normSpriteKey('系统')) return true;
  return false;
}

type TutorialStepId =
  | 'platform-choice'
  | 'dialogue'
  | 'save-button'
  | 'choices-commands'
  | 'sidebar-toggle'
  | 'settings'
  | 'assets'
  | 'schedule'
  | 'timecard';

const TUTORIAL_STEPS: Array<{
  id: TutorialStepId;
  title: string;
  description: string;
  targetSelector?: string;
  advanceOnTargetClick?: boolean;
}> = [
  {
    id: 'platform-choice',
    title: '步骤 1：选择游玩设备（PC / 手机）',
    description:
      '窄窗口（宽≤768 或高≤736）会自动使用横屏 16:9 手机布局。此处可选：在宽屏电脑上是否也强制同款布局；之后可在「系统设置 > 界面选项 > 手机版」中修改。',
  },
  {
    id: 'dialogue',
    title: '步骤 2：对话框（正文区域）',
    description: '屏幕正中偏下的长条区域就是对话框，所有剧情分页文本都会在这里显示。点击对话框空白处可以翻到下一分页。',
    targetSelector: '[data-tutorial-id="dialogue"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'save-button',
    title: '步骤 3：存档入口（存储/读取）',
    description: '底栏右侧的「存储/读取」按钮可以打开完整存档界面，用来手动保存或读取进度。',
    targetSelector: '[data-tutorial-id="save-button"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'choices-commands',
    title: '步骤 4：剧情选项与指令框',
    description:
      '底栏的「剧情选项」按钮会打开选项/指令面板。其中有「选项」和「指令」两个页签：选项页可选择预设剧情分支；指令页可选用预设指令填入底部输入框并发送，方便快速调用各类功能。',
    targetSelector: '[data-tutorial-id="choices-commands"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'sidebar-toggle',
    title: '步骤 5：打开战术侧边栏',
    description: '屏幕最右侧有一条细长竖条，把鼠标移过去并点击，可以展开战术侧边栏，后面的步骤都会用到里面的按钮。',
    targetSelector: '[data-tutorial-id="sidebar-toggle"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'assets',
    title: '步骤 6：图库（立绘 / 背景 / CG）',
    description: '战术侧边栏展开后，点击里面的「图库 · Gallery_Center」按钮，可以管理立绘、背景和 CG 图集。',
    targetSelector: '[data-tutorial-id="assets"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'schedule',
    title: '步骤 7：事件表',
    description: '同一个侧边栏里的「事件表 · Event_Timeline」按钮可以打开事件时间轴，用来规划和跳转剧情进度。',
    targetSelector: '[data-tutorial-id="schedule"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'settings',
    title: '步骤 8：系统设置',
    description:
      '仍然在战术侧边栏中，点击「系统设置 · System」按钮：阅读设定里可改主题、字体与对话框皮肤；视觉校准里调对话框大小与舞台预览；「CG&立绘」里调 CG 铺满与立绘相关选项；界面选项里还有新手指引等开关。',
    targetSelector: '[data-tutorial-id="settings"]',
    advanceOnTargetClick: true,
  },
  {
    id: 'timecard',
    title: '步骤 9：左上角时间卡 & VISUAL',
    description:
      '左上角时间卡显示当前时间与地点。卡片底部的 VISUAL 按钮会根据最新正文的「角色|场景|null|null|null|对白」自动切换背景，例如场景为「酒吧」时切换到同名背景。',
    targetSelector: '[data-tutorial-id="timecard"]',
  },
];

/** 武侦连专用 CG 库 localStorage key，与其它角色卡隔离，避免对话误触发别卡 CG */
const CG_LIB_STORAGE_KEY = 'spirit_command_cg_lib_v1_武侦连';

// Formatting Helper
const formatGameTime = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const week = weekDays[date.getDay()];

  return {
    fullRaw: `${y}/${m}/${d} ${hh}:${mm}`,
    time: `${hh}:${mm}`,
    date: `${m}-${d}`,
    week: week,
    year: y,
    isNight: date.getHours() >= 18 || date.getHours() < 6,
  };
};

const App: React.FC = () => {
  useEffect(() => {
    const styleId = 'ink-jianghu-nav-font-face';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face {
  font-family: "HanYiShangWeiShouShuW";
  src: url("${inkNavFontUrl}") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}`;
    document.head.appendChild(style);
  }, []);

  // MVU 变量数据（符合酒馆卡运行规范）
  const { data: mvuData, isLoading: mvuLoading, refreshData: refreshMvuData, updateData } = useMvuData();

  // View Mode: Now defaults to 'game'
  const [viewMode, setViewMode] = useState<'game'>('game');

  const [chatHistory, setChatHistory] = useState<DialogueLine[]>(INITIAL_SCRIPT);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAuto, setIsAuto] = useState(false);
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextWheelOpen, setContextWheelOpen] = useState(false);
  const [contextWheelPos, setContextWheelPos] = useState({ x: 0, y: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const [infoCharacter, setInfoCharacter] = useState<Character | null>(null);
  const [infoAnchor, setInfoAnchor] = useState<{ left: number; right: number; top: number; bottom: number } | null>(
    null,
  );

  // UI States
  const [showVisualStatus, setShowVisualStatus] = useState(true); // Default to show visual info
  const [showTimeCode, setShowTimeCode] = useState(false); // New: Show raw time code
  const [isStatusCardCollapsed, setIsStatusCardCollapsed] = useState(false); // NEW: Local collapse state
  const [showCommandInterface, setShowCommandInterface] = useState(false); // New: Controls DialogueBox command mode
  const [showChoicesInterface, setShowChoicesInterface] = useState(false); // New: Controls DialogueBox choices mode

  // Warning Modal State
  const [showReturnWarning, setShowReturnWarning] = useState(false);

  // GAME TIME SYSTEM
  // 从 MVU 读取时间，如果没有则使用默认值
  const parseTimeFromMvu = useCallback((timeStr: string | undefined): Date => {
    if (!timeStr) return new Date(2028, 5, 4, 8, 0);
    // 解析格式：YYYY-MM-DD HH:mm
    const match = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    }
    return new Date(2028, 5, 4, 8, 0);
  }, []);

  // 默认开始时间：2028/06/04 08:00
  const [gameDate, setGameDate] = useState<Date>(new Date(2028, 5, 4, 8, 0));
  const [timeData, setTimeData] = useState(formatGameTime(gameDate));

  const [calendarEvents, setCalendarEvents] = useState<Record<string, string>>({});
  const [nextEvent, setNextEvent] = useState<{ date: Date; text: string } | null>(null);

  const [statusInfo, setStatusInfo] = useState('正常');

  // --- NOTIFICATION & LOG SYSTEM ---
  const [notifications, setNotifications] = useState<{ id: number; text: string }[]>([]);
  const [variableLogs, setVariableLogs] = useState<{ time: string; text: string }[]>([]);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  /** 避免同毫秒 id 重复导致 React key 冲突、定时器误删 */
  const notificationIdRef = useRef(0);

  const addNotification = useCallback((text: string) => {
    const id = ++notificationIdRef.current;
    setNotifications(prev => [...prev, { id, text }]);
    setVariableLogs(prev =>
      [{ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text }, ...prev].slice(0, 30),
    );
    const raw = globalSettingsRef.current?.notificationDuration ?? 2;
    const sec = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseFloat(String(raw));
    const safeSec = Number.isFinite(sec) && sec > 0 ? sec : 2;
    const durationMs = Math.min(60_000, Math.max(800, Math.round(safeSec * 1000)));
    window.setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, durationMs);
  }, []);

  // 仅写入 SYSTEM_LOGS，不弹出右上角 toast 的 MVU 变更日志
  const addMvuLog = (text: string) => {
    setVariableLogs(prev =>
      [{ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text }, ...prev].slice(0, 30),
    );
  };

  // 监听 MVU 变量变化，把好感值/性欲值/直男程度的变动写入 SYSTEM_LOGS
  useEffect(() => {
    (async () => {
      try {
        if (
          typeof waitGlobalInitialized !== 'function' ||
          typeof eventOn !== 'function' ||
          typeof Mvu === 'undefined'
        ) {
          return;
        }

        await waitGlobalInitialized('Mvu');

        const getNested = (obj: any, path: string, fallback: any) => {
          if (!obj) return fallback;
          const parts = path.split('.');
          let cur: any = obj;
          for (const key of parts) {
            if (cur && typeof cur === 'object' && key in cur) {
              cur = cur[key];
            } else {
              return fallback;
            }
          }
          return cur ?? fallback;
        };

        const handler = (newVariables: unknown, oldVariables: unknown) => {
          try {
            const newRoles = getNested(newVariables as any, 'stat_data.角色', {}) || {};
            const oldRoles = getNested(oldVariables as any, 'stat_data.角色', {}) || {};

            Object.keys(newRoles).forEach(roleKey => {
              const newRole = (newRoles as any)[roleKey] ?? {};
              const oldRole = (oldRoles as any)[roleKey] ?? {};

              (
                [
                  { field: '好感值', label: '好感值' },
                  { field: '性欲值', label: '性欲值' },
                  { field: '直男程度', label: '直男程度' },
                ] as const
              ).forEach(({ field, label }) => {
                const newVal = Number((newRole as any)[field]);
                const oldValRaw = (oldRole as any)[field];
                const oldVal = typeof oldValRaw === 'number' ? oldValRaw : 0;

                if (!Number.isFinite(newVal)) return;
                if (newVal === oldVal) return;

                const delta = newVal - oldVal;
                const sign = delta > 0 ? `+${delta}` : `${delta}`;
                addMvuLog(`MVU：${roleKey} 的${label} ${sign}（${oldVal} → ${newVal}）`);
              });
            });
          } catch (error) {
            console.error('[MVU] 记录变量变化日志时出错', error);
          }
        };

        eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, handler);
      } catch (error) {
        console.error('[MVU] 初始化变量变化监听失败', error);
      }
    })();

    return () => {
      // 此处不强制解除事件监听，避免缺少类型定义导致报错
    };
  }, []);

  // --- INITIALIZATION WITH PERSISTENCE ---
  // 武侦连使用独立 localStorage 键，不与军营报道员等其它项目混用角色/头像数据
  const CHAR_OVERRIDES_KEY = 'spirit_command_武侦连_char_overrides_v1';
  const [characters, setCharacters] = useState<Character[]>(() => {
    const defaults = Object.values(CHARACTERS);
    try {
      const saved = localStorage.getItem(CHAR_OVERRIDES_KEY);
      if (saved) {
        const overrides = JSON.parse(saved);
        return defaults.map(c => {
          const ov = overrides[c.id];
          if (!ov) return c;
          // 旧存档可能把 avatarUrl 存为空字符串；保留默认占位头像，避免空白
          const merged = { ...c, ...ov };
          if (!merged.avatarUrl || !merged.avatarUrl.trim()) {
            merged.avatarUrl = c.avatarUrl;
          }
          return merged;
        });
      }
    } catch {}
    return defaults;
  });

  const [backgroundLibrary, setBackgroundLibrary] = useState<BackgroundFolder[]>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_bg_lib_v2'); // New key for folders
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Check if it's already folders (has 'items')
          if ('items' in parsed[0]) {
            return parsed;
          }
        }
      }

      // Fallback or migration check from v1
      const savedV1 = localStorage.getItem('spirit_command_bg_lib_v1');
      if (savedV1) {
        const parsedV1 = JSON.parse(savedV1);
        if (Array.isArray(parsedV1)) {
          return [{ id: 'bg_folder_default', name: '默认场景', items: parsedV1, disabled: false }];
        }
      }

      // Default
      return [{ id: 'bg_folder_default', name: '默认场景', items: BACKGROUNDS, disabled: false }];
    } catch {
      return [{ id: 'bg_folder_default', name: '默认场景', items: BACKGROUNDS, disabled: false }];
    }
  });

  // Memoize flattened backgrounds for consumers expecting a list (only enabled folders)
  const flattenedBackgrounds = useMemo(() => {
    return backgroundLibrary.filter(f => !f.disabled).flatMap(f => f.items);
  }, [backgroundLibrary]);

  // 统一迁移：为「陈刚」立绘补充更丰富的表情关键词（兼容从军营立绘库复制/批量导入的情况）
  const migrateChenGangSprites = (lib: CustomFolder[]): CustomFolder[] => {
    const expressionMap: Record<string, string> = {
      '好色,捉弄,调戏': '好色,捉弄,调戏,坏笑,起哄',
      '玩笑,吐舌头': '玩笑,吐舌头,顽皮,打趣',
      大笑: '大笑,爽朗,开怀,哈哈',
      '惊讶,慌张': '惊讶,慌张,错愕,被抓包',
      '尴尬,回避': '尴尬,回避,心虚,不敢对视',
      '好胜,骄傲': '好胜,骄傲,得意,逞强',
      微笑: '微笑,温和,放松',
      生气: '生气,暴躁,发火',
      生闷气: '生闷气,郁闷,别扭,有心事',
      玩笑: '玩笑,吐舌头,打趣,装无辜',
      '沉思,常态': '沉思,常态,若有所思,平静',
      '站立,常态': '站立,常态,放松,待机',
      '兴奋,射精': '兴奋,射精,高潮,失控',
      '高潮,喘息': '高潮,喘息,余韵,气喘吁吁',
      '爽,双人': '爽,双人,满足,贴近',
    };
    return lib.map(folder => {
      return {
        ...folder,
        sprites: (folder.sprites || []).map(sprite => {
          // 只迁移角色名为「陈刚」的立绘
          if ((sprite.characterName || '').trim() !== '陈刚') return sprite;
          const rawExp = (sprite.expression || '').trim();
          // 跳过已经是长串关键词的或导入占位的
          if (!rawExp || /^导入[_\d]/.test(rawExp) || rawExp.includes('，')) return sprite;
          const mapped = expressionMap[rawExp];
          if (!mapped) return sprite;
          return { ...sprite, expression: mapped };
        }),
      };
    });
  };

  const [customLibrary, setCustomLibrary] = useState<CustomFolder[]>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_lib_v6');
      if (saved) {
        const parsed = JSON.parse(saved);
        const arr = Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CUSTOM_LIBRARY;
        const filtered = arr.filter((f: CustomFolder) => isAllowedSpriteFolder(f));
        if (filtered.length === 0) return DEFAULT_CUSTOM_LIBRARY;
        return migrateChenGangSprites(filtered);
      }
      return DEFAULT_CUSTOM_LIBRARY;
    } catch (e) {
      return DEFAULT_CUSTOM_LIBRARY;
    }
  });

  // --- RUNTIME CHARACTER MERGE (auto include gallery sprite folders) ---
  // 目标：用户在「图库→立绘」里新增文件夹后，无需改代码即可在舞台上显示立绘。
  const runtimeCharacters = useMemo<Character[]>(() => {
    const normalizeName = (s: string) => (s || '').trim();
    const norm = (s: string) => normalizeName(s).toLowerCase();

    const existingByName = new Map<string, Character>();
    const existingById = new Map<string, Character>();
    characters.forEach(c => {
      existingByName.set(norm(c.name), c);
      existingById.set(norm(String(c.id)), c);
    });

    const hashColor = (seed: string) => {
      // 简单可重复的颜色哈希，避免每次刷新变色
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      const hue = h % 360;
      return `hsl(${hue} 70% 55%)`;
    };

    const pickFolderPreview = (folder: CustomFolder) => {
      const sprites = folder.sprites || [];
      const portrait = sprites.find(s => s.outfit === '头像');
      const fallback = sprites.find(s => s.isFallback);
      const first = sprites[0];
      return portrait?.imageUrl || fallback?.imageUrl || first?.imageUrl || '';
    };

    const extras: Character[] = [];
    (customLibrary || [])
      .filter(f => f && !f.disabled)
      .forEach(folder => {
        const name = normalizeName(folder.name);
        if (!name) return;

        // 特殊映射：user/{{user}} 视为玩家角色（避免出现两个“玩家”）
        const n = norm(name);
        if (n === 'user' || n === '{{user}}' || n === '主角' || n === '玩家') return;

        // 已存在则跳过
        if (existingByName.has(n) || existingById.has(n)) return;

        const preview = pickFolderPreview(folder);
        extras.push({
          id: name, // 让 stageSprites 的 characterId 直接按 name/id 命中
          name,
          role: '',
          description: '',
          avatarUrl: preview,
          themeColor: hashColor(name),
          tags: [],
          stats: { power: 0, trust: 0, sync: 0 },
        });
      });

    // 让 “主角” 名称别名也能命中 Player（但不新增角色）
    const player = characters.find(c => c.id === CharacterId.PLAYER) || characters[0];
    const patched = characters.map(c => (c.id === CharacterId.PLAYER ? { ...c, name: c.name || 'user' } : c));
    return [...patched, ...extras];
  }, [characters, customLibrary]);

  /** 立绘选择器：改为显示当前剧本中所有可用角色（含图库扩展角色） */
  const spritePickerCharacters = useMemo(() => {
    return runtimeCharacters;
  }, [runtimeCharacters]);

  const [cgLibrary, setCgLibrary] = useState<CGFolder[]>(() => {
    try {
      const saved = localStorage.getItem(CG_LIB_STORAGE_KEY);
      let lib: CGFolder[] = DEFAULT_CGS;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0].items) {
          lib = [
            {
              id: 'migrated_cg_folder',
              name: '默认图集',
              items: parsed.map((item: any) => ({ ...item, keywords: item.keywords || [] })),
            },
          ];
        } else {
          lib = parsed.map((f: any) => ({ ...f, sets: f.sets || [] }));
        }
      }
      // Migration: 将旧的全局 cgSets 并入所属文件夹（按 itemIds 归属，每个 set 归入包含其 item 最多的文件夹）
      try {
        const oldSets = localStorage.getItem('spirit_command_cg_sets_v1'); // 旧全局 key，仅迁移时读一次
        if (oldSets) {
          const legacySets: CGSet[] = JSON.parse(oldSets);
          if (Array.isArray(legacySets) && legacySets.length > 0) {
            const folderSets: CGSet[][] = lib.map(() => []);
            legacySets.forEach(s => {
              let bestIdx = -1,
                bestCount = 0;
              lib.forEach((f, i) => {
                const c = (s.itemIds || []).filter(id => f.items.some(it => it.id === id)).length;
                if (c > bestCount) {
                  bestCount = c;
                  bestIdx = i;
                }
              });
              if (bestIdx >= 0) folderSets[bestIdx].push(s);
            });
            lib = lib.map((f, i) => ({ ...f, sets: [...(f.sets || []), ...folderSets[i]] }));
            localStorage.removeItem('spirit_command_cg_sets_v1');
          }
        }
      } catch (_) {}
      return lib;
    } catch {
      return DEFAULT_CGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CG_LIB_STORAGE_KEY, JSON.stringify(cgLibrary));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('CG 图库存储空间不足');
        addNotification('存储空间不足：CG 图库未保存');
      }
    }
  }, [cgLibrary]);

  const [worldInfoEntries, setWorldInfoEntries] = useState<WorldInfoEntry[]>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_world_info');
      return saved ? JSON.parse(saved) : SILLY_TAVERN_WORLD_INFO;
    } catch {
      return SILLY_TAVERN_WORLD_INFO;
    }
  });

  const [commandStructure, setCommandStructure] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_structure');
      return saved ? JSON.parse(saved) : INITIAL_COMMAND_STRUCTURE;
    } catch {
      return INITIAL_COMMAND_STRUCTURE;
    }
  });
  const [commandTemplates, setCommandTemplates] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_templates');
      return saved ? JSON.parse(saved) : INITIAL_COMMAND_TEMPLATES;
    } catch {
      return INITIAL_COMMAND_TEMPLATES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('spirit_command_structure', JSON.stringify(commandStructure));
      localStorage.setItem('spirit_command_templates', JSON.stringify(commandTemplates));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('指令结构存储空间不足');
        addNotification('存储空间不足：指令配置未保存');
      }
    }
  }, [commandStructure, commandTemplates]);

  useEffect(() => {
    try {
      localStorage.setItem('spirit_command_world_info', JSON.stringify(worldInfoEntries));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('世界信息存储空间不足，跳过保存');
        addNotification('存储空间不足：世界信息未保存');
      } else {
        console.error('保存世界信息失败', e);
      }
    }
  }, [worldInfoEntries]);

  useEffect(() => {
    const overrides: Record<string, any> = {};
    characters.forEach(c => {
      overrides[c.id] = {
        avatarUrl: c.avatarUrl,
        avatarScale: c.avatarScale,
        avatarOffsetY: c.avatarOffsetY,
        themeColor: c.themeColor,
        stats: c.stats,
        description: c.description,
        psychological: c.psychological,
        kinks: c.kinks,
      };
    });
    try {
      localStorage.setItem(CHAR_OVERRIDES_KEY, JSON.stringify(overrides));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('角色覆盖存储空间不足');
      }
    }
  }, [characters]);

  // 酒馆 user 人设：从酒馆读取当前用户名称 (name1)，覆盖 PLAYER 的显示名，避免使用军营报道员等其它设定
  useEffect(() => {
    const applyTavernUserName = () => {
      const w =
        typeof window !== 'undefined'
          ? (window as unknown as { SillyTavern?: { name1?: string } }).SillyTavern
          : undefined;
      const name1 = w?.name1?.trim();
      if (name1) setCharacters(prev => prev.map(c => (c.id === CharacterId.PLAYER ? { ...c, name: name1 } : c)));
    };
    applyTavernUserName();
    const t1 = setTimeout(applyTavernUserName, 500);
    const t2 = setTimeout(applyTavernUserName, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleUpdateBackgroundLibrary = (newLib: BackgroundFolder[]) => {
    setBackgroundLibrary(newLib);
    try {
      localStorage.setItem('spirit_command_bg_lib_v2', JSON.stringify(newLib));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('背景图库存储空间不足，未写入 localStorage');
        addNotification('存储空间不足：部分背景场景仅在本次会话中生效');
      } else {
        console.error('保存背景图库失败', e);
      }
    }
  };

  // --- FORCE SAVE HANDLER ---
  const handleForceSave = () => {
    try {
      localStorage.setItem('spirit_command_lib_v6', JSON.stringify(customLibrary));
      localStorage.setItem('spirit_command_bg_lib_v2', JSON.stringify(backgroundLibrary));
      localStorage.setItem(CG_LIB_STORAGE_KEY, JSON.stringify(cgLibrary));
      localStorage.setItem('spirit_command_settings', JSON.stringify(globalSettings));
      localStorage.setItem('spirit_command_dialogue_box_config', JSON.stringify(dialogueBoxConfig));
      localStorage.setItem('spirit_command_sprite_config', JSON.stringify(spriteConfig));
      // cgSets 已并入 cgLibrary[].sets
      localStorage.setItem('spirit_command_world_info', JSON.stringify(worldInfoEntries));
      addNotification('图库已强制保存 (Force Saved)');
    } catch (e) {
      console.error('Force Save Failed', e);
      addNotification('保存失败：存储空间不足');
    }
  };

  const [apiConfig, setApiConfig] = useState<ExternalApiConfig>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_external_api');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.modelId === 'gemini-3-pro-preview' || parsed.modelId === 'gemini-3-flash-preview') {
          return { ...parsed, modelId: 'gemini-2.0-flash-exp' };
        }
        if (parsed.provider === 'openai' && !parsed.apiKey) {
          return { ...parsed, provider: 'gemini' };
        }
        return parsed;
      }
      return {
        provider: 'gemini',
        baseUrl: 'https://api.spw.cool/v1',
        apiKey: '',
        modelId: 'gemini-2.0-flash-exp',
        headers: '{}',
      };
    } catch (e) {
      return {
        provider: 'gemini',
        baseUrl: 'https://api.spw.cool/v1',
        apiKey: '',
        modelId: 'gemini-2.0-flash-exp',
        headers: '{}',
      };
    }
  });

  // 当前聊天 ID（按酒馆规则：不同聊天文件的存档应互相隔离）
  const getInitialChatId = () => {
    try {
      const anyWin = window as unknown as { SillyTavern?: { getCurrentChatId?: () => string } };
      const cid = anyWin.SillyTavern?.getCurrentChatId?.();
      return cid || 'global';
    } catch {
      return 'global';
    }
  };
  const [chatId, setChatId] = useState<string>(() => getInitialChatId());

  // 监听酒馆聊天切换，防止串档/丢档
  useEffect(() => {
    const checkChatId = () => {
      try {
        const anyWin = window as unknown as { SillyTavern?: { getCurrentChatId?: () => string } };
        const cid = anyWin.SillyTavern?.getCurrentChatId?.() || 'global';
        setChatId(prev => {
          if (prev !== cid) {
            console.log(`[存档] 聊天切换: ${prev} → ${cid}`);
            lastAutoSavedMessageIdRef.current = undefined;
            return cid;
          }
          return prev;
        });
      } catch { /* ignore */ }
    };
    const interval = setInterval(checkChatId, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- 世界模式切换：现实 / 奇境 ---
  const enterFantasyWorld = () => {
    setGlobalSettings(prev => {
      const next: GlobalSettings = {
        ...prev,
        worldMode: 'fantasy',
        theme: 'black-gold',
      };
      try {
        localStorage.setItem('spirit_command_settings', JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  const exitFantasyWorld = () => {
    setGlobalSettings(prev => {
      const fallbackTheme: GlobalSettings['theme'] = prev.theme === 'black-gold' ? 'ink-jianghu' : prev.theme;
      const next: GlobalSettings = {
        ...prev,
        worldMode: 'reality',
        theme: fallbackTheme,
      };
      try {
        localStorage.setItem('spirit_command_settings', JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_settings');
      if (saved) {
        const parsed = JSON.parse(saved) as GlobalSettings;
        const inferredWorldMode: 'reality' | 'fantasy' =
          parsed.worldMode || (parsed.theme === 'black-gold' ? 'fantasy' : 'reality');
        return { ...DEFAULT_SETTINGS, ...parsed, worldMode: inferredWorldMode };
      }
    } catch (e) {
      /* ignore */
    }
    return DEFAULT_SETTINGS;
  });

  // 当前是否处于「奇境」黑金主题
  const isFantasyWorld = globalSettings.worldMode === 'fantasy' || globalSettings.theme === 'black-gold';

  // 暴露给外部脚本 / ST 指令调用
  (window as any).enterFantasyWorld = enterFantasyWorld;
  (window as any).exitFantasyWorld = exitFantasyWorld;

  // 设置（含自动存档）每次变更都立即写入 localStorage，避免新楼层/刷新后丢失
  useEffect(() => {
    try {
      localStorage.setItem('spirit_command_settings', JSON.stringify(globalSettings));
    } catch (e) {
      /* ignore */
    }
  }, [globalSettings]);

  const viewportMobileLayout = useViewportMobileLayout();
  const matchMobileLayoutEffective = viewportMobileLayout || (globalSettings.matchMobileLayout ?? false);

  // 新手指引状态：是否显示、多步骤分页索引与聚光灯位置
  const [isTutorialVisible, setIsTutorialVisible] = useState<boolean>(() => globalSettings.showTutorial ?? true);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number>(0);
  const [tutorialSpotlight, setTutorialSpotlight] = useState<{ cx: number; cy: number; radius: number } | null>(null);

  const currentTutorialStep =
    isTutorialVisible && (globalSettings.showTutorial ?? true)
      ? TUTORIAL_STEPS[Math.min(tutorialStepIndex, TUTORIAL_STEPS.length - 1)]
      : null;

  // 某些步骤需要侧边栏处于展开状态（否则目标按钮不存在于 DOM 中）
  const tutorialNeedsSidebar =
    !!currentTutorialStep &&
    (currentTutorialStep.id === 'assets' ||
      currentTutorialStep.id === 'schedule' ||
      currentTutorialStep.id === 'settings');

  const [currentBackground, setCurrentBackground] = useState(() => {
    const defaultBg =
      BACKGROUNDS && BACKGROUNDS.length > 0 && BACKGROUNDS[0]?.url ? BACKGROUNDS[0] : { name: '默认', url: '' };
    const bg = { name: defaultBg.name, url: defaultBg.url || '' };
    console.log('🎨 初始化背景:', bg);
    return bg;
  });
  const [backgroundLoadError, setBackgroundLoadError] = useState(false);
  const backgroundManualLockRef = useRef(false);

  // 初始化时检查背景 URL
  useEffect(() => {
    if (!currentBackground.url) {
      console.warn('⚠️ 初始背景 URL 为空，尝试使用默认背景');
      const fallback = BACKGROUNDS.find(b => b?.url) || { name: '默认', url: '' };
      if (fallback.url) {
        setCurrentBackground(fallback);
      } else {
        setBackgroundLoadError(true);
        console.warn('⚠️ 所有背景 URL 都不可用，将显示纯色背景');
      }
    }
  }, []);
  const [currentCG, setCurrentCG] = useState<CGItem | null>(null); // NEW: CG State
  const [cgPlayback, setCgPlayback] = useState<null | { setId: string; index: number; items: CGItem[] }>(null);
  const displayedCG = cgPlayback ? cgPlayback.items[cgPlayback.index] || null : currentCG;
  /** 长按随机 NSFW 按钮后打开的详细选择界面开关 */
  const [isNsfwGalleryOpen, setIsNsfwGalleryOpen] = useState(false);
  /** 按图片实际宽高自动检测竖版（height>width），未勾选 isVertical 时也避免被 cover 裁剪 */
  const [cgDetectedVertical, setCgDetectedVertical] = useState<Record<string, boolean>>({});
  const [inputValue, setInputValue] = useState('');
  const [stageSprites, setStageSprites] = useState<StageSprite[]>([]);
  /** 背景切换后强制立绘 remount，使入场动画重新播放 */
  const [spriteEnterNonce, setSpriteEnterNonce] = useState(0);
  /** 换背景：先播全员退场，再应用 pending 背景与立绘 */
  const [bgSpriteTransition, setBgSpriteTransition] = useState<null | {
    phase: 'exiting';
    exitingSprites: StageSprite[];
    pendingBg: { name: string; url: string };
    pendingSprites: StageSprite[];
  }>(null);
  /** 被手动关闭立绘的角色（使用 id / name 记录），直到该角色再次说话才解除 */
  const [hiddenSpriteCharacters, setHiddenSpriteCharacters] = useState<string[]>([]);
  /** 解析自 <xitong> 的系统任务列表 */
  const [systemTasks, setSystemTasks] = useState<SystemTask[]>([]);
  /** 当前姓名框里显示的说话人名字（由 DialogueBox 通过 onSyncGameState 传入） */
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null);
  const [dialogueBoxConfig, setDialogueBoxConfig] = useState<DialogueBoxLayoutConfig>(() => {
    try {
      const saved = localStorage.getItem('spirit_command_dialogue_box_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.width != null && parsed?.height != null) {
          return {
            width: parsed.width,
            height: parsed.height,
            offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0,
            offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0,
            textPaddingTop: typeof parsed.textPaddingTop === 'number' ? parsed.textPaddingTop : undefined,
            textPaddingRight: typeof parsed.textPaddingRight === 'number' ? parsed.textPaddingRight : undefined,
            textPaddingBottom: typeof parsed.textPaddingBottom === 'number' ? parsed.textPaddingBottom : undefined,
            textPaddingLeft: typeof parsed.textPaddingLeft === 'number' ? parsed.textPaddingLeft : undefined,
          };
        }
      }
    } catch (e) {
      /* ignore */
    }
    return { width: 90, height: 320, offsetX: 0, offsetY: 0 };
  });

  useEffect(() => {
    try {
      localStorage.setItem('spirit_command_dialogue_box_config', JSON.stringify(dialogueBoxConfig));
    } catch {
      /* ignore */
    }
  }, [dialogueBoxConfig]);

  const [spriteConfig, setSpriteConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('spirit_command_sprite_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.scale != null && parsed?.x != null && parsed?.y != null) return parsed;
      }
    } catch (e) {
      /* ignore */
    }
    return { scale: 1, x: 0, y: 0 };
  });
  /** 从酒馆最新 assistant 楼层解析的 <maintext>，有值时正文框优先显示 */
  const [tavernMaintext, setTavernMaintext] = useState<string | null>(null);
  /** 酒馆最新 assistant 的完整消息原文（用于解析 <xitong>，因 xitong 在 maintext 之外） */
  const [tavernFullMessage, setTavernFullMessage] = useState<string | null>(null);
  /** 从酒馆最新 assistant 楼层解析的 <option>/<options>，有值时作为选项显示 */
  const [tavernOptions, setTavernOptions] = useState<Choice[] | null>(null);
  const syncGameStateRef = useRef<(d: { background?: string; sprites?: StageSprite[]; info?: string }) => void>(
    () => {},
  );
  /** 上次自动存档对应的楼层（messageId），仅当楼层更新时才自动存档，分页切换不触发 */
  const lastAutoSavedMessageIdRef = useRef<number | undefined>(undefined);
  const pendingBgRef = useRef<{ name: string; url: string } | null>(null);
  const bgDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageSpritesRef = useRef<StageSprite[]>([]);
  /** 底栏立绘选择器「应用」：合并进后续 DialogueBox 同步；换条正文/翻分屏时在 handleSyncGameState 内清空 */
  type ManualSpriteEntry = { outfit: string; expression: string; manualAvatarUrl: string };
  const manualSpriteByCharRef = useRef<Map<string, ManualSpriteEntry>>(new Map());
  const lastDialogueRawFingerprintRef = useRef<string | undefined>(undefined);
  const lastDialogueScreenIndexRef = useRef<number | null>(null);
  const currentBackgroundRef = useRef(currentBackground);
  const globalSettingsRef = useRef(globalSettings);
  const gameDateRef = useRef<Date>(new Date(2028, 5, 4, 8, 0));

  useEffect(() => {
    stageSpritesRef.current = stageSprites;
  }, [stageSprites]);
  useEffect(() => {
    currentBackgroundRef.current = currentBackground;
  }, [currentBackground]);
  useEffect(() => {
    globalSettingsRef.current = globalSettings;
  }, [globalSettings]);
  useEffect(
    () => () => {
      if (bgDebounceTimerRef.current) clearTimeout(bgDebounceTimerRef.current);
    },
    [],
  );

  const [modals, setModals] = useState({
    settings: false,
    dossier: false,
    assets: false,
    saveLoad: false,
    history: false,
    variables: false,
    schedule: false,
    commands: false,
    options: false,
    externalLink: false,
    spritePicker: false,
    systemTasks: false, // 大型界面任务面板（导航栏打开）
  });
  /** 小型弹窗任务面板（正文 <xitong> 触发或由大型面板的按键打开） */
  const [showSystemTasksPopover, setShowSystemTasksPopover] = useState(false);
  /** 小型弹窗：记录“用户手动关闭”的任务签名，避免同任务翻页时反复自动弹出 */
  const latestSystemTasksSigRef = useRef<string>('');
  const dismissedSystemTasksSigRef = useRef<string>('');

  const toggleModal = (key: keyof typeof modals) => setModals(prev => ({ ...prev, [key]: !prev[key] }));

  const closeAllModals = () => {
    setModals({
      settings: false,
      dossier: false,
      assets: false,
      saveLoad: false,
      history: false,
      variables: false,
      schedule: false,
      commands: false,
      options: false,
      externalLink: false,
      spritePicker: false,
      systemTasks: false,
    });
  };

  const resolveQuickWheelIcon = (modalKey: string): React.ReactNode => {
    switch (modalKey) {
      case 'schedule':
        return <IconSchedule />;
      case 'assets':
        return <IconLib />;
      case 'settings':
        return <IconSettings />;
      case 'variables':
        return <IconVar />;
      case 'dossier':
        return <IconDossier />;
      case 'saveLoad':
        return <span className="text-base">💾</span>;
      case 'history':
        return <span className="text-base">📜</span>;
      case 'commands':
        return <span className="text-base">⚡</span>;
      default:
        return <span className="text-base">★</span>;
    }
  };

  const handleBackToMainScreen = () => {
    closeAllModals();
    setShowChoicesInterface(false);
    setShowCommandInterface(false);
    setIsUiHidden(false);
  };

  // --- TIME & EVENTS LOGIC ---
  const loadCalendarEvents = () => {
    try {
      const saved = localStorage.getItem('spirit_command_calendar_events');
      if (saved) {
        const events = JSON.parse(saved);
        setCalendarEvents(events);
        calculateNextEvent(gameDate, events);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadCalendarEvents();
  }, []);

  // 自动战斗驱动：打开战斗且 autoMode=true 时，定时自动选择技能并执行回合
  // 战斗系统已移除

  /** 判断是否为事件表相关词条（与 ScheduleModal 过滤逻辑一致） */
  const isEventTableEntry = useCallback((e: WorldInfoEntry) => {
    if (e.enabled === false || e.disable === true) return false;
    const name = (e.name || e.comment || '').toLowerCase();
    const keys = (e.keys || []).join(',').toLowerCase();
    const content = (e.content || '').toLowerCase();
    return (
      name.includes('事件表') ||
      keys.includes('事件表') ||
      content.includes('<event>') ||
      content.includes('【事件名称】')
    );
  }, []);

  /** 判断世界书词条是否为事件表相关（词条名称或内容匹配） */
  const isEventTableWorldbookEntry = useCallback((entry: { name?: string; content?: string }) => {
    const name = (entry.name || '').toLowerCase();
    const content = (entry.content || '').toLowerCase();
    return name.includes('事件表') || content.includes('<event>') || content.includes('【事件名称】');
  }, []);

  /** 将世界书词条转为 WorldInfoEntry */
  const toWorldInfoEntry = useCallback(
    (entry: {
      uid?: number;
      name?: string;
      enabled?: boolean;
      content?: string;
      strategy?: { type?: string; keys?: (string | RegExp)[]; keys_secondary?: { keys?: (string | RegExp)[] } };
    }): WorldInfoEntry => ({
      id: `wi_evt_${entry.uid ?? Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uid: entry.uid,
      name: entry.name ?? '事件表',
      enabled: entry.enabled !== false,
      keys: (entry.strategy?.keys ?? [])
        .map((k: string | RegExp) => (typeof k === 'string' ? k : (k as RegExp).source))
        .filter(Boolean),
      secondaryKeys: (entry.strategy?.keys_secondary?.keys ?? [])
        .map((k: string | RegExp) => (typeof k === 'string' ? k : (k as RegExp).source))
        .filter(Boolean),
      content: entry.content ?? '',
      insertionOrder: 0,
      constant: entry.strategy?.type === 'constant',
    }),
    [],
  );

  const [eventTableLoading, setEventTableLoading] = useState(false);

  /** 从酒馆世界书词条中读取【事件表】（事件表是词条名，不是世界书名） */
  const handleReloadEventTable = useCallback(async () => {
    if (typeof getWorldbookNames !== 'function' || typeof getWorldbook !== 'function') {
      addNotification('酒馆助手接口不可用');
      return;
    }
    setEventTableLoading(true);
    try {
      const worldbookNames = getWorldbookNames();
      if (!worldbookNames.length) {
        addNotification('酒馆中暂无世界书，请先创建世界书并添加【事件表】词条');
        return;
      }
      const allConverted: WorldInfoEntry[] = [];
      for (const wbName of worldbookNames) {
        try {
          const raw = await getWorldbook(wbName);
          const matching = raw.filter((e: { name?: string; content?: string }) => isEventTableWorldbookEntry(e));
          allConverted.push(...matching.map((e: Parameters<typeof toWorldInfoEntry>[0]) => toWorldInfoEntry(e)));
        } catch (e) {
          console.warn('读取世界书失败:', wbName, e);
        }
      }
      if (!allConverted.length) {
        addNotification('未在世界书词条中找到【事件表】或包含 <event> 的词条');
        return;
      }
      setWorldInfoEntries(prev => {
        const nonEvent = prev.filter(e => !isEventTableEntry(e));
        return [...nonEvent, ...allConverted];
      });
      addNotification(`事件表已从酒馆世界书读取（${allConverted.length} 个词条）`);
    } catch (e) {
      console.error('reload event table from tavern failed', e);
      addNotification('事件表更新失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEventTableLoading(false);
    }
  }, [isEventTableEntry, isEventTableWorldbookEntry, toWorldInfoEntry]);

  // 初始化时尝试从酒馆读取事件表（仅在酒馆助手可用时执行，延迟以等待就绪）
  useEffect(() => {
    if (typeof getWorldbookNames !== 'function' || typeof getWorldbook !== 'function') return;
    const t = setTimeout(() => handleReloadEventTable(), 800);
    return () => clearTimeout(t);
  }, [handleReloadEventTable]);

  useEffect(() => {
    if (!mvuData || mvuLoading) return;
    notifyDataChanged('世界状态', mvuData);
  }, [mvuData, mvuLoading]);

  // Update time data when gameDate changes
  useEffect(() => {
    gameDateRef.current = gameDate;
    setTimeData(formatGameTime(gameDate));
    calculateNextEvent(gameDate, calendarEvents);
  }, [gameDate, calendarEvents]);

  const calculateNextEvent = (current: Date, events: Record<string, string>) => {
    let closest: { date: Date; text: string } | null = null;
    let minDiff = Infinity;

    Object.entries(events).forEach(([key, text]) => {
      // Key format: YYYY-M-D
      const [y, m, d] = key.split('-').map(Number);
      const eventDate = new Date(y, m, d, 8, 0);

      // Try to extract time
      const timeMatch = text.match(/(\d{2})[:：](\d{2})/);
      if (timeMatch) {
        eventDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]));
      }

      const diff = eventDate.getTime() - current.getTime();
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        closest = { date: eventDate, text: text };
      }
    });
    setNextEvent(closest);
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const performSave = (type: 'auto' | 'quick' | 'manual', slotId: number = 0) => {
    const timestamp = Date.now();
    const dateString = new Date().toLocaleString('zh-CN', { hour12: false });

    const saveData: SaveData = {
      meta: {
        id: `${timestamp}`,
        slotId: slotId,
        type: type,
        timestamp,
        dateString,
        summary: chatHistory[currentLineIndex]?.text.substring(0, 40) + '...' || '存档',
        locationName: currentBackground.name || 'Unknown',
        version: 2,
      },
      preview: {
        bgUrl: currentBackground.url,
        charUrl: displayedCG
          ? ''
          : stageSprites.length > 0
            ? characters.find(c => c.id === stageSprites[0].characterId)?.avatarUrl || ''
            : characters.find(c => c.id === CharacterId.PLAYER)?.avatarUrl || '',
      },
      state: {
        chatHistory,
        currentLineIndex,
        activeCharacterId:
          characters.find(c => c.id === chatHistory[currentLineIndex]?.speakerId)?.id || CharacterId.PLAYER,
        background: currentBackground,
        stageSprites,
        characters,
        mode: 'story',
        currentOutfit: 'default',
        currentExpression: 'default',
        currentCG: displayedCG,
      },
      worldContext: {
        backgroundLibrary,
        customLibrary,
        cgLibrary,
        characterOverrides: {},
      },
    };

    try {
      const prefix = getSavePrefix();
      let key = '';
      let ptrKey: string | undefined;
      let nextIdx: number | undefined;
      let maxSlots: number | undefined;
      if (type === 'manual') {
        key = `${prefix}p1_s${slotId}`;
      } else if (type === 'auto') {
        maxSlots = 20;
        ptrKey = `sc_auto_ptr_${chatId}`;
        nextIdx = parseInt(localStorage.getItem(ptrKey) || localStorage.getItem('sc_auto_ptr') || '0');
        key = `${prefix}auto_${nextIdx}`;
      } else if (type === 'quick') {
        maxSlots = 10;
        ptrKey = `sc_quick_ptr_${chatId}`;
        nextIdx = parseInt(localStorage.getItem(ptrKey) || localStorage.getItem('sc_quick_ptr') || '0');
        key = `${prefix}quick_${nextIdx}`;
      }

      localStorage.setItem(key, JSON.stringify(saveData));

      // 存档成功后才递增指针
      if (ptrKey !== undefined && nextIdx !== undefined && maxSlots !== undefined) {
        localStorage.setItem(ptrKey, ((nextIdx + 1) % maxSlots).toString());
        if (type === 'quick') {
          addNotification(`快速存档成功 (Slot ${nextIdx + 1})`);
        }
      }
    } catch (e) {
      console.error('Save failed', e);
      alert('存档失败：存储空间不足，建议导出并清除旧存档');
    }
  };

  const performLoad = (type: 'auto' | 'quick') => {
    try {
      if (type === 'quick') {
        const ptrKey = `sc_quick_ptr_${chatId}`;
        const currentPtr = parseInt(localStorage.getItem(ptrKey) || localStorage.getItem('sc_quick_ptr') || '0');
        const lastIdx = (currentPtr - 1 + 10) % 10;
        const prefix = getSavePrefix();
        const key = `${prefix}quick_${lastIdx}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const data: SaveData = JSON.parse(saved);
          handleLoadGameSuccess({ ...data.state, ...data.worldContext });
          addNotification(`已读取最新的快速存档 (${data.meta.dateString})`);
        } else {
          alert('没有找到快速存档记录。');
        }
      }
    } catch (e) {
      alert('读档失败：文件损坏');
    }
  };

  const getSavePrefix = () => `spirit_command_save_v2_${chatId}_`;

  const handleClearAllSaves = () => {
    if (!confirm('确认清除所有存档？此操作不可恢复。')) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(getSavePrefix())) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    addNotification('已清除所有存档');
  };

  const handleExportSaves = () => {
    const loaded: Record<string, SaveData> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(getSavePrefix())) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            loaded[k.replace(getSavePrefix(), '')] = JSON.parse(raw);
          } catch (_) {}
        }
      }
    }
    if (Object.keys(loaded).length === 0) {
      addNotification('无存档可导出');
      return;
    }
    const blob = new Blob([JSON.stringify(loaded, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SpiritCommand_All_Saves_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addNotification('已导出存档');
  };

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const handleImportSaves = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const keys = Object.keys(json);
        if (keys.length === 0) {
          addNotification('文件中无有效存档');
          return;
        }
        if (!confirm(`是否覆盖当前所有存档？(将导入 ${keys.length} 个存档)`)) return;
        keys.forEach(key => {
          if (
            key.startsWith('auto_') ||
            key.startsWith('quick_') ||
            /^p\d+_s\d+$/.test(key) ||
            key.startsWith(getSavePrefix())
          ) {
            const k = key.startsWith(getSavePrefix()) ? key : getSavePrefix() + key;
            try {
              localStorage.setItem(k, JSON.stringify(json[key]));
            } catch (_) {}
          }
        });
        addNotification('已导入存档');
      } catch (_) {
        addNotification('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 自动存档：仅当「楼层」更新（新 assistant 正文）时存档，同一楼内的分页切换不触发
  useEffect(() => {
    if (!globalSettings.autoSaveEnabled || viewMode !== 'game' || chatHistory.length === 0) return;
    if (typeof loadFromLatestMessage !== 'function') return;
    const result = loadFromLatestMessage();
    if (result.messageId === undefined) return;
    if (lastAutoSavedMessageIdRef.current === result.messageId) return;
    lastAutoSavedMessageIdRef.current = result.messageId;
    performSave('auto');
  }, [globalSettings.autoSaveEnabled, viewMode, chatHistory.length, tavernMaintext]);

  const toggleFullscreen = async () => {
    const isMobileLayout = matchMobileLayoutEffective;
    const orientationApi = (screen as any)?.orientation;

    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        // 手机版进入全屏后，尝试锁定横屏；不支持时静默降级。
        if (isMobileLayout && orientationApi?.lock) {
          try {
            await orientationApi.lock('landscape');
          } catch (e) {
            console.warn('横屏锁定失败（设备或浏览器不支持）:', e);
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      try {
        await document.exitFullscreen();
      } finally {
        // 退出全屏后恢复方向锁（若浏览器支持）。
        try {
          orientationApi?.unlock?.();
        } catch (e) {
          console.warn('方向解锁失败（可忽略）:', e);
        }
      }
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 定期从酒馆最新 assistant 消息解析正文与选项；监听 MESSAGE_RECEIVED/MESSAGE_UPDATED 立即刷新
  // 同时从正文 <gal_engine_v2>[Info|时间|地点] 解析时间并同步 gameDate（酒馆助手 getChatMessages + 解析函数）
  const refreshTavernDisplay = useCallback(() => {
    if (typeof getLastMessageId === 'undefined' || typeof getChatMessages === 'undefined') return;
    try {
      const result = loadFromLatestMessage();
      setTavernMaintext(result.maintext || null);
      setTavernFullMessage(result.fullMessage || null);
      setTavernOptions(
        result.options.length > 0 ? result.options.map(o => ({ id: o.id, text: o.text, nextSceneId: '' })) : null,
      );
      // 从最新消息正文解析 [Info|时间|地点] 并同步界面时间
      const fullMessage = result.fullMessage;
      if (fullMessage) {
        const sync = parseGalEngineSync(fullMessage);
        if (sync?.info) {
          const { timeStr } = parseInfoSegment(sync.info);
          if (timeStr) {
            const hm = parseChineseTimeToHourMinute(timeStr);
            if (hm) {
              setGameDate(prev => {
                const next = new Date(prev);
                next.setHours(hm.hour, hm.minute, 0, 0);
                if (Math.abs(next.getTime() - prev.getTime()) > 60000) return next;
                return prev;
              });
            }
          }
        }
      }
      // 不再在轮询时同步 background/sprites：避免每 2 秒用「最后一行」覆盖当前分屏背景，导致背景频繁切换
      // 背景与立绘由 DialogueBox 根据当前分屏负责同步
    } catch (e) {
      setTavernMaintext(null);
      setTavernFullMessage(null);
      setTavernOptions(null);
    }
  }, []);

  useEffect(() => {
    if (typeof getLastMessageId === 'undefined' || typeof getChatMessages === 'undefined') {
      setTavernMaintext(null);
      setTavernOptions(null);
      return;
    }
    refreshTavernDisplay();
    const interval = setInterval(refreshTavernDisplay, 2000);
    return () => clearInterval(interval);
  }, [refreshTavernDisplay]);

  // 监听酒馆消息事件，收到新消息或消息更新时立即刷新正文/选项（避免等待轮询）
  useEffect(() => {
    if (typeof eventOn === 'undefined' || typeof tavern_events === 'undefined') return;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        refreshTavernDisplay();
        pendingTimer = null;
      }, 400);
    };
    const unsubReceived = eventOn(tavern_events.MESSAGE_RECEIVED, handler);
    const unsubUpdated = eventOn(tavern_events.MESSAGE_UPDATED, handler);
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      unsubReceived?.stop?.();
      unsubUpdated?.stop?.();
    };
  }, [refreshTavernDisplay]);

  const currentLine = chatHistory[currentLineIndex] || { id: '0', speakerId: CharacterId.NARRATOR, text: '' };
  const currentSpeaker = characters.find(c => c.id === currentLine.speakerId);
  const playerCharacter = characters.find(c => c.id === CharacterId.PLAYER);
  // 对话框优先酒馆解析的正文（须保留管道符，供立绘/背景解析）；否则从完整楼层原文结构化提取；否则当前行
  const dialogueText = (() => {
    if (tavernMaintext != null && tavernMaintext !== '') return tavernMaintext;
    if (tavernFullMessage?.trim()) {
      const structured = extractStructuredBodyForTavernDialogue(tavernFullMessage);
      if (structured.trim()) return structured;
      const fromMain = parseMaintext(tavernFullMessage);
      if (fromMain.trim()) return fromMain;
    }
    const raw = currentLine.text;
    if (raw && (raw.includes('<maintext>') || raw.includes('<option') || raw.includes('<sum>'))) {
      const parsed = parseMaintext(raw);
      if (parsed) return parsed;
    }
    return raw || '';
  })();
  // 用于 <xitong> 解析的原文：酒馆模式用完整消息（xitong 在 maintext 外），否则用当前行原文
  const rawMessageForXitong = tavernFullMessage ?? currentLine.text;
  const dialogueChoices = tavernOptions ?? currentLine.choices;

  // 从当前楼层原始文本兜底解析 [YYYY/MM/DD HH:mm] 或 [YYYY-MM-DD HH:mm] 时间戳，同步左上角时间卡
  useEffect(() => {
    const source = (currentLine.text || '') + '\n' + (tavernMaintext || '');
    if (!source) return;
    const m = source.match(/[\[【](\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})[\]】]/);
    if (!m) return;
    const [, y, mth, d, hh, mm] = m;
    const parsed = new Date(
      parseInt(y, 10),
      parseInt(mth, 10) - 1,
      parseInt(d, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
    );
    if (isNaN(parsed.getTime())) return;
    if (Math.abs(parsed.getTime() - gameDateRef.current.getTime()) > 60000) {
      setGameDate(parsed);
    }
  }, [currentLine.text, tavernMaintext]);

  // --- SMART SPRITE MATCHING LOGIC ---
  const SPRITE_DEBUG = false;
  /** 用角色在立绘库中定位文件夹：name/id 交叉匹配 + 规范化，避免「剧本用中文名、文件夹用英文名」导致整人消失 */
  const resolveSpriteFolderForChar = useCallback(
    (char: Character): CustomFolder | undefined => {
      const lib = customLibrary || [];
      const nk = normSpriteKey(char.name);
      const ik = normSpriteKey(String(char.id));
      if (char.id === CharacterId.PLAYER) {
        return lib.find(
          f =>
            !f.disabled &&
            (f.id === 'Player' ||
              normSpriteKey(f.name) === 'user' ||
              f.name === '{{user}}' ||
              normSpriteKey(f.name) === normSpriteKey('主角') ||
              normSpriteKey(f.name) === normSpriteKey('玩家') ||
              normSpriteKey(f.name) === nk ||
              normSpriteKey(String(f.id)) === ik),
        );
      }
      return lib.find(
        f =>
          !f.disabled &&
          (normSpriteKey(f.name) === nk ||
            normSpriteKey(String(f.id)) === ik ||
            normSpriteKey(f.name) === ik ||
            normSpriteKey(String(f.id)) === nk),
      );
    },
    [customLibrary],
  );

  /** 舞台/预览一律优先用立绘库图片，避免使用其他项目（如军营报道员）的头像 */
  const getEffectiveAvatarUrl = (char: Character) => {
    const folder = resolveSpriteFolderForChar(char);
    const nk = normSpriteKey(char.name);
    const ik = normSpriteKey(String(char.id));
    if (!folder || folder.disabled) {
      if (SPRITE_DEBUG) console.log(`[App] 立绘库: 角色"${char.name}"未找到对应文件夹或已禁用`);
      // 无立绘库资源则不在舞台显示（禁止用头像 URL 冒充立绘）
      return '';
    }
    if (!folder.sprites || folder.sprites.length === 0) {
      if (SPRITE_DEBUG) console.log(`[App] 立绘库: 角色"${char.name}"对应文件夹无立绘，不回落至头像`);
      return ''; // 有文件夹但无立绘：不显示军营报道员等外部头像
    }

    // 匹配逻辑：与 stageSprites.characterId 宽松对齐（全角空格、大小写、name/id 交叉）
    const stageInstance = stageSprites.find(s => {
      const sid = normSpriteKey(String(s.characterId ?? ''));
      return sid === nk || sid === ik;
    });

    if (stageInstance) {
      const targetExpr = (stageInstance.expression || '').toLowerCase().trim();
      let targetOutfit = (stageInstance.outfit || '').toLowerCase().trim();
      if (targetOutfit === '默认') targetOutfit = '常服';
      // 表情等价映射：常见同义词统一，提升匹配率
      const exprAliasMap: Record<string, string[]> = {
        '默认': ['微笑', '常服', '常态', '平静'],
        '微笑': ['默认', '常态', '温和'],
        '常态': ['默认', '微笑', '平静'],
        '常服': ['默认'],
      };
      const targetExprAliases = exprAliasMap[targetExpr] || [];
      if (SPRITE_DEBUG)
        console.log(`[App] 立绘匹配: 角色"${char.name}", 目标表情="${targetExpr}", 目标服装="${targetOutfit}"`);

      let bestSprite = null;
      let bestScore = 0;

      folder.sprites.forEach(s => {
        let score = 0;
        const sExprRaw = (s.expression || '').toLowerCase().trim();
        let sOutfit = (s.outfit || '').toLowerCase().trim();
        if (sOutfit === '默认') sOutfit = '常服';
        // 表情同义词展开后也视为命中
        const sExprSet = new Set([sExprRaw, ...(exprAliasMap[sExprRaw] || [])]);

        // 表情匹配
        if (targetExpr && sExprRaw) {
          if (sExprRaw === targetExpr || targetExprAliases.some(a => sExprSet.has(a))) {
            score += 10;
          } else if (sExprRaw.includes(targetExpr) || targetExpr.includes(sExprRaw)) {
            score += 5;
          } else {
            const targetWords = targetExpr.split(/[\s\-_，。]+/).filter(w => w.length > 0);
            const spriteWords = sExprRaw.split(/[\s\-_，。]+/).filter(w => w.length > 0);
            const commonWords = targetWords.filter(w => spriteWords.some(sw => sw.includes(w) || w.includes(sw)));
            if (commonWords.length > 0) {
              score += commonWords.length * 2;
            } else if (targetExpr.length >= 2 && sExprRaw.length >= 2) {
              const overlap = [...targetExpr].filter(c => sExprRaw.includes(c)).length;
              if (overlap > 0) score += overlap;
            }
          }
        }

        // 服装匹配：默认与常服等价，条件宽松
        if (targetOutfit && sOutfit) {
          if (sOutfit === targetOutfit) {
            score += 3;
          } else if (sOutfit.includes(targetOutfit) || targetOutfit.includes(sOutfit)) {
            score += 2;
          } else {
            const targetWords = targetOutfit.split(/[\s\-_，。]+/).filter(Boolean);
            const spriteWords = sOutfit.split(/[\s\-_，。]+/).filter(Boolean);
            const commonWords = targetWords.filter(w => spriteWords.some(sw => sw.includes(w) || w.includes(sw)));
            if (commonWords.length > 0) {
              score += commonWords.length;
            } else if (targetOutfit.length >= 2 && sOutfit.length >= 2) {
              const overlap = [...targetOutfit].filter(c => sOutfit.includes(c)).length;
              if (overlap > 0) score += overlap;
            }
          }
        }

        // 如果目标表情和服装都为空，优先使用默认立绘
        if (!targetExpr && !targetOutfit && s.isFallback) {
          score += 5;
        }

        // 默认立绘优先级降低（除非没有其他匹配）
        if (s.isFallback && bestScore > 0) {
          score -= 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestSprite = s;
        }
      });

      // 要求正分才采用；否则 fallback 或空
      if (bestSprite && bestScore > 0) {
        if (SPRITE_DEBUG)
          console.log(
            `[App] 立绘匹配: 分数=${bestScore}, 表情="${bestSprite.expression}", 服装="${bestSprite.outfit}"`,
          );
        return bestSprite.imageUrl;
      }

      // 正分未命中时，尝试 fallback
      const fallbackSprite = folder.sprites.find(s => s.isFallback);
      if (fallbackSprite) {
        if (SPRITE_DEBUG)
          console.log(`[App] 立绘匹配: 表情/服装未命中，回退到 fallback"${fallbackSprite.expression}"`);
        return fallbackSprite.imageUrl;
      }

      // 无 fallback 且完全未匹配：返回空，上层将不渲染该立绘
      if (SPRITE_DEBUG)
        console.warn(`[App] 立绘匹配: 角色"${char.name}"无匹配立绘（表情=${targetExpr}, 服装=${targetOutfit}），图库可能缺少对应素材`);
      return '';
    }
    if (SPRITE_DEBUG)
      console.log(`[App] 立绘匹配: 角色"${char.name}"在stageSprites中未找到实例`);
    const defaultSprite = folder.sprites.find(s => s.isFallback) || folder.sprites[0];
    return defaultSprite?.imageUrl ?? '';
  };

  /** 预览优先用立绘库立绘；有立绘库文件夹时不用角色头像，避免显示军营报道员等外部头像 */
  const previewSpriteUrl = useMemo(() => {
    const char = currentSpeaker || characters[0];
    if (!char) return null;
    const folder = resolveSpriteFolderForChar(char);
    if (!folder?.sprites?.length) {
      if (char.id !== CharacterId.PLAYER) return null;
      const luoFolder = customLibrary.find(f => f.name === '孙卫东' || f.id === 'SunWeidong');
      const first = luoFolder?.sprites?.[0];
      return first?.imageUrl ?? null;
    }
    const defaultSprite = folder.sprites.find(s => s.isFallback) || folder.sprites[0];
    return defaultSprite?.imageUrl ?? null;
  }, [currentSpeaker, characters, resolveSpriteFolderForChar, customLibrary]);
  const previewCharacter = useMemo(() => {
    const char = currentSpeaker || characters[0];
    if (!char) return null;
    const folder = resolveSpriteFolderForChar(char);
    const hasLibraryFolder = !!(folder && !folder.disabled);
    const url = previewSpriteUrl ?? (hasLibraryFolder ? '' : char.avatarUrl);
    if (url == null && !hasLibraryFolder) return null;
    return { ...char, avatarUrl: url ?? '' };
  }, [currentSpeaker, characters, previewSpriteUrl, resolveSpriteFolderForChar]);

  /** 设置页实时预览：仅用立绘库图片，禁止用头像。优先孙卫东立绘，否则立绘库随便一张 */
  const defaultPreviewCharacter = useMemo(() => {
    const luo = characters.find(c => c.id === 'SunWeidong' || c.name === '孙卫东') || characters[0];
    if (!luo) return null;
    let url: string | null = null;
    const luoFolder = customLibrary.find(f => f.name === '孙卫东' || f.id === 'SunWeidong');
    if (luoFolder?.sprites?.length) {
      const o = (v: string) => (v || '').toLowerCase().trim();
      const preferred = luoFolder.sprites.find(
        s =>
          (o(s.outfit).includes('常服') || o(s.outfit) === '常服') &&
          (o(s.expression).includes('微笑') || o(s.expression) === '微笑'),
      );
      url =
        preferred?.imageUrl ??
        luoFolder.sprites.find(s => s.isFallback)?.imageUrl ??
        luoFolder.sprites[0]?.imageUrl ??
        null;
    }
    if (!url) {
      for (const f of customLibrary) {
        if (f.disabled || !f.sprites?.length) continue;
        url = f.sprites.find(s => s.isFallback)?.imageUrl ?? f.sprites[0]?.imageUrl ?? null;
        if (url) break;
      }
    }
    if (!url) return null;
    return { ...luo, avatarUrl: url };
  }, [characters, customLibrary]);

  const applyBackgroundDebounced = useCallback((bg: { name: string; url: string }) => {
    pendingBgRef.current = bg;
    if (bgDebounceTimerRef.current) clearTimeout(bgDebounceTimerRef.current);
    bgDebounceTimerRef.current = setTimeout(() => {
      bgDebounceTimerRef.current = null;
      const p = pendingBgRef.current;
      pendingBgRef.current = null;
      if (!p) return;
      // 若用户通过界面手动锁定了背景，则忽略自动切换
      if (backgroundManualLockRef.current) {
        console.info('背景已被手动锁定，忽略自动背景切换至:', p.name);
        return;
      }
      const gs = globalSettingsRef.current;
      const exitOnBg = gs.spritesExitOnBackgroundChange !== false;
      const animOn = gs.spriteAnimationEnabled !== false;
      const urlChanges = p.url !== currentBackgroundRef.current.url;
      const hasSprites = stageSpritesRef.current.length > 0;
      if (urlChanges && exitOnBg && hasSprites) {
        if (!animOn) {
          setCurrentBackground({ name: p.name, url: p.url });
          if (p.name !== currentBackgroundRef.current.name) addNotification(`移动至: ${p.name}`);
          setSpriteEnterNonce(n => n + 1);
          return;
        }
        setBgSpriteTransition({
          phase: 'exiting',
          exitingSprites: [...stageSpritesRef.current],
          pendingBg: { name: p.name, url: p.url },
          pendingSprites: stageSpritesRef.current.map(s => ({ ...s })),
        });
        return;
      }
      setCurrentBackground(prev => {
        if (prev.url === p.url) return prev;
        addNotification(`移动至: ${p.name}`);
        return { name: p.name, url: p.url };
      });
    }, 450);
  }, []);

  /** 换背景编排：退场动画结束后再切背景并换上 pending 立绘，随后靠 spriteEnterNonce 触发入场 */
  useEffect(() => {
    const tr = bgSpriteTransition;
    if (!tr || tr.phase !== 'exiting') return;
    const t = setTimeout(() => {
      setCurrentBackground(tr.pendingBg);
      const prev = currentBackgroundRef.current;
      if (prev.url !== tr.pendingBg.url) {
        addNotification(`移动至: ${tr.pendingBg.name}`);
      }
      setStageSprites(tr.pendingSprites);
      setSpriteEnterNonce(n => n + 1);
      setBgSpriteTransition(null);
    }, BG_SPRITE_EXIT_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [bgSpriteTransition]);

  // 数据绑定：世界状态（时间/背景）在 applyBackgroundDebounced 定义之后注册，避免初始化顺序报错
  useEffect(() => {
    const unWorld = bindData('世界状态', (payload: unknown) => {
      const data = payload as { 世界?: { 当前时间?: string; 当前地点?: string } } | null;
      if (!data?.世界) return;
      if (data.世界.当前时间) {
        const newDate = parseTimeFromMvu(data.世界.当前时间);
        if (Math.abs(newDate.getTime() - gameDateRef.current.getTime()) > 60000) {
          setGameDate(newDate);
        }
      }
      if (data.世界.当前地点) {
        const loc = (data.世界.当前地点 || '').trim();
        const matchedBg = flattenedBackgrounds.find(bg => bg.name === loc);
        if (matchedBg) applyBackgroundDebounced({ name: matchedBg.name, url: matchedBg.url });
      }
    });
    return () => {
      unWorld();
    };
  }, [parseTimeFromMvu, flattenedBackgrounds, applyBackgroundDebounced]);

  const handleSyncGameState = useCallback(
    (data: {
      background?: string;
      sprites?: StageSprite[];
      info?: string;
      dossierUpdates?: { name: string; field: string; value: string }[];
      speakerName?: string;
      systemTasks?: SystemTask[];
      currentPageHasTasks?: boolean;
      dialogueScreenIndex?: number;
      dialogueRawFingerprint?: string;
    }) => {
      const filterStageSprites = (sprites: StageSprite[]): StageSprite[] => {
        if (!hiddenSpriteCharacters.length) return sprites;
        const hidden = new Set(hiddenSpriteCharacters);
        return sprites.filter(s => {
          const key1 = String(s.characterId);
          const key2 = String((s as any).name || (s as any).characterName || '');
          return !hidden.has(key1) && (!key2 || !hidden.has(key2));
        });
      };

      const consumeSpritesForSync = (incoming: StageSprite[]): StageSprite[] => {
        const fp = data.dialogueRawFingerprint;
        const si = data.dialogueScreenIndex;
        if (fp !== undefined && fp !== lastDialogueRawFingerprintRef.current) {
          manualSpriteByCharRef.current.clear();
          lastDialogueRawFingerprintRef.current = fp;
          lastDialogueScreenIndexRef.current = typeof si === 'number' ? si : null;
        } else if (typeof si === 'number' && lastDialogueScreenIndexRef.current !== si) {
          manualSpriteByCharRef.current.clear();
          lastDialogueScreenIndexRef.current = si;
        }
        const map = manualSpriteByCharRef.current;
        if (!map.size) return incoming;
        return incoming.map(s => {
          const k = normSpriteKey(String(s.characterId ?? ''));
          const o = map.get(k);
          if (!o) return s;
          return {
            ...s,
            outfit: o.outfit,
            expression: o.expression,
            ...(o.manualAvatarUrl ? { manualAvatarUrl: o.manualAvatarUrl } : {}),
          };
        });
      };

      const applySyncedSprites = (sprites: StageSprite[]) =>
        normalizeStageSpritesForAvatarFolder(filterStageSprites(sprites), customLibrary, runtimeCharacters);

      const spritesFromDialogue =
        data.sprites !== undefined ? consumeSpritesForSync(data.sprites as StageSprite[]) : undefined;

      const pendingSprites = applySyncedSprites(
        spritesFromDialogue ?? stageSpritesRef.current.map(s => ({ ...s })),
      );

      let nextBg: { name: string; url: string } | null = null;
      if (data.background) {
        const bg = matchBackgroundInLibrary(data.background, flattenedBackgrounds);
        if (bg) nextBg = { name: bg.name, url: bg.url };
      }

      const gs = globalSettingsRef.current;
      const exitOnBg = gs.spritesExitOnBackgroundChange !== false;
      const animOn = gs.spriteAnimationEnabled !== false;
      const bgUrlChanges = !!(nextBg && nextBg.url !== currentBackgroundRef.current.url);
      const hasSprites = stageSpritesRef.current.length > 0;

      if (bgUrlChanges && exitOnBg && hasSprites) {
        if (bgDebounceTimerRef.current) {
          clearTimeout(bgDebounceTimerRef.current);
          bgDebounceTimerRef.current = null;
        }
        pendingBgRef.current = null;

        if (!animOn) {
          setCurrentBackground(nextBg!);
          if (nextBg!.url !== currentBackgroundRef.current.url) {
            addNotification(`移动至: ${nextBg!.name}`);
          }
          if (spritesFromDialogue !== undefined) {
            setBgSpriteTransition(null);
            setStageSprites(() => pendingSprites);
          }
        } else {
          const exiting = stageSpritesRef.current;
          // 对话框同一帧：只换场景图、L/C/R 槽位上仍是同一批 instanceId（常见：旁白先切「金銮殿内」再同页靖武帝）
          // 若仍走全员退场，会先播退场再 nonce 重挂载 → 靖武帝「入场→出场→再入场」
          if (sameStageSpriteRoster(exiting, pendingSprites)) {
            setCurrentBackground(nextBg!);
            if (nextBg!.url !== currentBackgroundRef.current.url) {
              addNotification(`移动至: ${nextBg!.name}`);
            }
            if (spritesFromDialogue !== undefined) {
              setBgSpriteTransition(null);
              setStageSprites(() => pendingSprites);
            }
          } else {
            setBgSpriteTransition({
              phase: 'exiting',
              exitingSprites: [...exiting],
              pendingBg: nextBg!,
              pendingSprites,
            });
          }
        }
      } else {
        if (nextBg && nextBg.url !== currentBackgroundRef.current.url) {
          // 禁止走 applyBackgroundDebounced：分页常见「上一页只写场景、下一页才写立绘」。
          // 若延迟 450ms 再切背景，触发时 ref 上可能已有新页立绘 → 误判为换景+台上有人 → 全员退场再入场（靖武帝连播两次入场）。
          if (backgroundManualLockRef.current) {
            console.info('背景已被手动锁定，忽略对话框同步至:', nextBg.name);
          } else {
            if (bgDebounceTimerRef.current) {
              clearTimeout(bgDebounceTimerRef.current);
              bgDebounceTimerRef.current = null;
            }
            pendingBgRef.current = null;
            setCurrentBackground(prev => {
              if (prev.url === nextBg.url) return prev;
              addNotification(`移动至: ${nextBg.name}`);
              return { name: nextBg.name, url: nextBg.url };
            });
          }
        }
        if (spritesFromDialogue !== undefined) {
          setBgSpriteTransition(null);
          setStageSprites(() => pendingSprites);
        }
      }

      if (typeof data.speakerName === 'string') {
        const name = data.speakerName.trim();
        setActiveSpeakerName(name || null);
        if (name) {
          // 说话时自动解除该角色的“关闭立绘”限制
          setHiddenSpriteCharacters(prev => {
            const char = characters.find(c => c.name === name || String(c.id) === name);
            const idKey = char ? String(char.id) : null;
            return prev.filter(k => k !== name && (!idKey || k !== idKey));
          });
        }
      }

      // <xitong> 系统任务同步：按 id 去重；仅“新签名任务 + 当前页标记为首次任务页”时自动打开小号弹窗
      if (data.systemTasks && data.systemTasks.length > 0) {
        const sig = data.systemTasks
          .map(t => t.id)
          .filter(Boolean)
          .sort()
          .join('|');
        latestSystemTasksSigRef.current = sig;
        setSystemTasks(prev => {
          const map = new Map<string, SystemTask>();
          prev.forEach(t => map.set(t.id, t));
          data.systemTasks!.forEach(t => map.set(t.id, t));
          return Array.from(map.values());
        });
        // 仅当：1) 有新任务签名；2) 当前页被 DialogueBox 标记为“首次任务页”时，自动打开小号系统任务弹窗
        if (sig && dismissedSystemTasksSigRef.current !== sig && data.currentPageHasTasks) {
          setShowSystemTasksPopover(true);
        }
      }

      // CG 同步：VN 格式中 gametext 第三列会通过 info 传入 "CG:名称" 或 "CG:"（无图时）
      if (data.info != null && data.info.startsWith('CG:')) {
        let cgNameOrKeyword = data.info.slice(3).trim();
        const inlineTag = cgNameOrKeyword.match(/^<cg\s+id\s*=\s*([^>\s]+)\s*>$/i);
        if (inlineTag) cgNameOrKeyword = inlineTag[1].trim();
        if (!cgNameOrKeyword) {
          if (!globalSettings.cgManualCloseOnly) {
            setCurrentCG(null);
            setCgPlayback(null);
          }
        } else {
          // 先尝试匹配“CG 图集”，条件宽松：精确、包含、关键词、子串均可
          let matchedSet: CGSet | null = null;
          const cgKw = cgNameOrKeyword.toLowerCase();
          for (const folder of cgLibrary) {
            if (folder.disabled) continue;
            matchedSet = (folder.sets || []).find(s => matchCgSetQuery(s, cgNameOrKeyword)) || null;
            if (matchedSet) break;
          }
          if (matchedSet) {
            const enabledFolders = cgLibrary.filter(f => !f.disabled);
            const idMap = new Map<string, CGItem>();
            enabledFolders.forEach(f => f.items.forEach(i => idMap.set(i.id, i)));
            const items = (matchedSet.itemIds || []).map(id => idMap.get(id)).filter(Boolean) as CGItem[];
            if (items.length > 0) {
              const mode = matchedSet.mode || 'sequence';
              if (mode === 'random') {
                const rand = items[Math.floor(Math.random() * items.length)];
                setCurrentCG(rand);
                setCgPlayback(null);
              } else {
                setCgPlayback({ setId: matchedSet.id, index: 0, items });
                setCurrentCG(items[0]);
              }
            } else {
              if (!globalSettings.cgManualCloseOnly) {
                setCgPlayback(null);
                setCurrentCG(null);
              }
              addNotification(`图集「${matchedSet.name}」为空或图片已丢失`);
            }
            return;
          }
          for (const folder of cgLibrary) {
            if (folder.disabled) continue;
            const found = folder.items.find(cg => matchCgItemQuery(cg, cgNameOrKeyword));
            if (found) {
              setCurrentCG(found);
              setCgPlayback(null);
              break;
            }
          }
        }
      } else if (data.info) {
        setStatusInfo(data.info);
        // Parse time from Info if present "下午 15:00"
        const timeMatch = data.info.match(/(\d{1,2})[:：](\d{2})/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1]);
          const m = parseInt(timeMatch[2]);
          const newDate = new Date(gameDate);
          newDate.setHours(h, m);
          if (newDate.getTime() > gameDate.getTime() + 1000) {
            // Only update if time moves forward significantly
            setGameDate(newDate);
          }
        }
      }

      if (data.dossierUpdates && data.dossierUpdates.length > 0) {
        setCharacters(prevChars => {
          const newChars = [...prevChars];
          data.dossierUpdates!.forEach(update => {
            const charIndex = newChars.findIndex(c => c.name === update.name || c.id === update.name);
            if (charIndex > -1) {
              const char = { ...newChars[charIndex], stats: { ...newChars[charIndex].stats } };
              const val = update.value;
              const field = update.field.toLowerCase();
              if (field === 'trust') char.stats.trust = parseInt(val) || char.stats.trust;
              else if (field === 'power') char.stats.power = parseInt(val) || char.stats.power;
              else if (field === 'sync') char.stats.sync = parseInt(val) || char.stats.sync;
              else if (field === 'psychological') char.psychological = val;
              else if (field === 'kinks') char.kinks = val;
              else if (field === 'description') char.description = val;

              newChars[charIndex] = char;

              if (['trust', 'power', 'sync'].includes(field)) {
                const fieldMap: any = { trust: '好感值', power: '直男程度', sync: '性欲值' };
                addNotification(`${char.name} ${fieldMap[field] || field} 更新: ${val}`);
              }
            }
          });
          return newChars;
        });
      }
    },
    [
      flattenedBackgrounds,
      applyBackgroundDebounced,
      gameDate,
      cgLibrary,
      globalSettings.cgManualCloseOnly,
      hiddenSpriteCharacters,
      characters,
      customLibrary,
      runtimeCharacters,
    ],
  );

  /** 手动从最新正文重新解析背景图（时间卡「同步地点」：优先管道正文场景列，再 gal_engine） */
  const handleResyncBackgroundFromText = () => {
    backgroundManualLockRef.current = false;
    if (typeof getLastMessageId === 'undefined' || typeof getChatMessages === 'undefined') {
      addNotification('酒馆助手接口不可用，无法从正文读取背景');
      return;
    }
    try {
      const result = loadFromLatestMessage();
      const full = result.fullMessage || '';
      if (!full.trim()) {
        addNotification('未读取到最新助手消息正文');
        return;
      }

      const pipeBody = (extractStructuredBodyForTavernDialogue(full) || parseMaintext(full) || '').trim();

      if (pipeBody && isPipeDelimitedDialogueBlock(pipeBody)) {
        const lines = parsePipeDelimitedDialogueLines(pipeBody);
        const lastWithLocation = [...lines].reverse().find(l => l.location);
        if (lastWithLocation?.location) {
          const bg = matchBackgroundInLibrary(lastWithLocation.location, flattenedBackgrounds);
          if (bg) {
            handleSyncGameState({ background: lastWithLocation.location });
            addNotification(`已从管道正文同步背景: ${bg.name}`);
            return;
          }
          addNotification(
            `正文场景「${lastWithLocation.location}」在背景库中未匹配到图片，将尝试 gal_engine / 请检查图库名称是否一致`,
          );
        }
      }

      const sync = parseGalEngineSync(full);
      if (sync?.background) {
        const bg = matchBackgroundInLibrary(sync.background, flattenedBackgrounds);
        if (bg) {
          handleSyncGameState({ background: sync.background });
          addNotification(`已从 gal_engine 同步背景: ${bg.name}`);
          return;
        }
        addNotification(`gal_engine 场景「${sync.background}」在背景库中无匹配条目`);
        return;
      }

      addNotification('正文中未找到可用场景（管道「场景」列或 [Background|…]），或背景库缺少对应条目');
    } catch (e) {
      console.error('手动从正文同步背景失败:', e);
      addNotification('从正文同步背景失败，请查看 Console 日志');
    }
  };

  /** 手动从最新正文重新解析立绘（时间卡「同步立绘」：优先管道正文，再 Stand_L/C/R） */
  const handleResyncSpritesFromText = () => {
    manualSpriteByCharRef.current.clear();
    lastDialogueRawFingerprintRef.current = undefined;
    lastDialogueScreenIndexRef.current = null;
    if (typeof getLastMessageId === 'undefined' || typeof getChatMessages === 'undefined') {
      addNotification('酒馆助手接口不可用，无法从正文读取立绘');
      return;
    }
    try {
      const result = loadFromLatestMessage();
      const full = result.fullMessage || '';
      if (!full.trim()) {
        addNotification('未读取到最新助手消息正文');
        return;
      }

      const pipeBody = (extractStructuredBodyForTavernDialogue(full) || parseMaintext(full) || '').trim();

      if (pipeBody && isPipeDelimitedDialogueBlock(pipeBody)) {
        const lines = parsePipeDelimitedDialogueLines(pipeBody);
        const posToX = (p: 'left' | 'center' | 'right') => (p === 'left' ? -220 : p === 'right' ? 220 : 0);
        const slotOrder = (n: number): Array<'left' | 'center' | 'right'> => {
          if (n <= 1) return ['center'];
          if (n === 2) return ['left', 'right'];
          return ['left', 'center', 'right'];
        };
        const isActor = (sp: string) => {
          const s = (sp || '').trim();
          return !!s && s !== '旁白' && !/^narrator$/i.test(s);
        };
        const actorLines = lines.filter(l => isActor(l.speaker));
        const uniqueSpeakers: (typeof lines)[number][] = [];
        const seen = new Set<string>();
        for (const l of actorLines) {
          const k = normSpriteKey(l.speaker);
          if (!seen.has(k)) {
            seen.add(k);
            uniqueSpeakers.push(l);
          }
        }
        const take = uniqueSpeakers.slice(-3);
        if (take.length > 0) {
          const slots = slotOrder(take.length);
          const ts = Date.now();
          const spritesFromPipe: StageSprite[] = take.map((l, i) => ({
            instanceId: `manual_sync_${ts}_${i}`,
            characterId: (l.speaker || '').trim(),
            outfit: (l.outfit || '常服').trim(),
            expression: (l.expression || '默认').trim(),
            x: posToX(slots[i]),
            y: 0,
            scale: 1,
            zIndex: 20 + i,
            ...(l.enterAnimation ? { enterAnimation: l.enterAnimation } : {}),
            ...(l.exitAnimation ? { exitAnimation: l.exitAnimation } : {}),
          }));
          handleSyncGameState({ sprites: spritesFromPipe });
          addNotification(`已从管道正文同步 ${take.length} 名角色立绘`);
          return;
        }
      }

      const sync = parseGalEngineSync(full);
      if (sync?.sprites && sync.sprites.length > 0) {
        const posToX = (p: 'left' | 'center' | 'right') => (p === 'left' ? -220 : p === 'right' ? 220 : 0);
        const spritesFromSync: StageSprite[] = sync.sprites.map((s, i) => ({
          instanceId: `manual_sync_${Date.now()}_${i}`,
          characterId: s.characterId,
          outfit: s.outfit || '常服',
          expression: s.expression || '默认',
          x: posToX(s.pos),
          y: 0,
          scale: 1,
          zIndex: 20 + i,
        }));
        handleSyncGameState({ sprites: spritesFromSync });
        addNotification('已从 gal_engine Stand 槽同步立绘');
        return;
      }

      addNotification('正文中未找到可同步的立绘（管道角色行或 [Stand_L|…] 等）');
    } catch (e) {
      console.error('手动从正文同步立绘失败:', e);
      addNotification('从正文同步立绘失败，请查看 Console 日志');
    }
  };

  useEffect(() => {
    syncGameStateRef.current = handleSyncGameState;
  }, [handleSyncGameState]);

  const handleDossierRefresh = async () => {
    if (isAiProcessing) return;
    setIsAiProcessing(true);
    try {
      const playerName = playerCharacter?.name || '玩家';

      // 1. 基于聊天记录收集实际出现过的说话人，自动补全到 characters
      const historySlice = chatHistory.slice(0, currentLineIndex + 1);
      const speakerMap = new Map<string, { id: string; name: string }>();

      historySlice.forEach(line => {
        const rawId = String(line.speakerId || '');
        if (!rawId) return;
        if (rawId === CharacterId.SYSTEM || rawId === CharacterId.NARRATOR) return;

        if (speakerMap.has(rawId)) return;

        const defaultChar = (CHARACTERS as Record<string, Character>)[rawId];
        const displayName = defaultChar?.name || rawId;
        speakerMap.set(rawId, { id: rawId, name: displayName });
      });

      const existingById = new Set(characters.map(c => String(c.id)));
      const autoNewCharacters: Character[] = [];
      speakerMap.forEach(({ id, name }) => {
        if (existingById.has(id)) return;
        const base = (CHARACTERS as Record<string, Character>)[id];
        autoNewCharacters.push({
          id,
          name: base?.name || name,
          role: base?.role || '',
          description: '',
          avatarUrl: base?.avatarUrl || '',
          themeColor: base?.themeColor || '#64748b',
          tags: base?.tags || [],
          stats: { power: 0, trust: 0, sync: 0 },
          psychological: '',
          kinks: '',
        });
      });

      const charactersForAnalysis = autoNewCharacters.length > 0 ? [...characters, ...autoNewCharacters] : characters;

      const updates = await analyzeCharacterStatus(
        historySlice.map(m => ({
          role: m.speakerId === CharacterId.PLAYER ? 'user' : 'model',
          text: m.text,
        })),
        charactersForAnalysis,
        worldInfoEntries,
        apiConfig,
        playerName,
      );

      if (Object.keys(updates).length > 0 || autoNewCharacters.length > 0) {
        setCharacters(prev => {
          const prevIds = new Set(prev.map(c => String(c.id)));

          // 先把“自动从聊天中发现的新 NPC”补进来
          const chatDerivedExtras = autoNewCharacters.filter(c => !prevIds.has(String(c.id)));
          const baseList = chatDerivedExtras.length > 0 ? [...prev, ...chatDerivedExtras] : prev;

          const usedKeys = new Set<string>();
          const updatedList = baseList.map(c => {
            const byId = updates[c.id];
            const byName = updates[c.name];
            const update = byId || byName;
            if (byId) usedKeys.add(String(c.id));
            if (byName) usedKeys.add(c.name);
            if (!update) return c;
            return {
              ...c,
              description: update.description || c.description,
              psychological: update.psychological || c.psychological,
              kinks: update.kinks || c.kinks,
              stats: { ...c.stats, ...(update.stats || {}) },
            };
          });

          const updatedIds = new Set(updatedList.map(c => String(c.id)));
          const newFromUpdates: Character[] = [];

          Object.entries(updates).forEach(([key, update]) => {
            if (usedKeys.has(key)) return;
            const base = (CHARACTERS as Record<string, Character>)[key];
            const id = String(base?.id || key);
            if (updatedIds.has(id)) return;
            newFromUpdates.push({
              id,
              name: base?.name || key,
              role: base?.role || '',
              description: update.description || base?.description || '',
              avatarUrl: base?.avatarUrl || '',
              themeColor: base?.themeColor || '#64748b',
              tags: base?.tags || [],
              stats: {
                power: update.stats?.power ?? base?.stats.power ?? 0,
                trust: update.stats?.trust ?? base?.stats.trust ?? 0,
                sync: update.stats?.sync ?? base?.stats.sync ?? 0,
              },
              psychological: update.psychological || (base as any)?.psychological || '',
              kinks: update.kinks || (base as any)?.kinks || '',
            });
          });

          return newFromUpdates.length > 0 ? [...updatedList, ...newFromUpdates] : updatedList;
        });

        // 可选：将数值同步回 MVU stat_data
        if (updateData && Object.keys(updates).length > 0) {
          try {
            await updateData(current => {
              const currentRoles = (current as any).角色 || {};
              const nextRoles: any = { ...currentRoles };

              Object.entries(updates).forEach(([key, update]) => {
                if (!update.stats) return;
                const id = String(key);
                const existing = nextRoles?.[id] || { 好感值: 0, 性欲值: 0, 直男程度: 0 };
                const next = { ...existing };
                if (typeof update.stats?.trust === 'number') next.好感值 = update.stats.trust;
                if (typeof update.stats?.sync === 'number') next.性欲值 = update.stats.sync;
                if (typeof update.stats?.power === 'number') next.直男程度 = update.stats.power;
                (nextRoles as any)[id] = next;
              });

              return { 角色: nextRoles };
            });
          } catch (e) {
            console.error('同步 MVU 数值失败:', e);
          }
        }

        addNotification('档案已根据剧情更新');
      } else {
        addNotification('未检测到显著变化');
      }
    } catch (e) {
      console.error(e);
      alert('分析失败 (Failed)');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleTimeJump = (dateStr: string, context: string) => {
    // ... (existing implementation)
    const prompt = `[系统指令: 时间跳跃]\n检测到时间轴变动。\n目标时间：${dateStr}\n当前事件上下文：${context}\n\n请忽略之前的线性剧情，直接转场到上述时间点，并开始描写该事件的具体发展。请注意环境、氛围与角色状态的变化。`;
    setInputValue(prompt);
    setModals(prev => ({ ...prev, schedule: false }));
    setShowCommandInterface(true);

    const timeMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{2}:\d{2})/);
    if (timeMatch) {
      const [_, y, m, d, hm] = timeMatch;
      const [h, min] = hm.split(':').map(Number);
      setGameDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d), h, min));
    }
  };

  const handleJumpToNextEvent = () => {
    // ... (existing implementation)
    if (!nextEvent) return;
    const { date, text } = nextEvent;
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;

    const cleanText =
      text
        .replace(/触发时间.*/, '')
        .trim()
        .split('\n')[0] || '下一事件';

    handleTimeJump(dateStr, cleanText);
  };

  const handleRefreshChoices = async () => {
    if (isAiProcessing) return;
    const line = chatHistory[currentLineIndex];
    if (!line || line.speakerId === CharacterId.PLAYER) return;

    let embeddedOptions: { id: string; text: string }[] = [];
    const hasTavern = typeof getChatMessages === 'function' && typeof getLastMessageId === 'function';
    if (hasTavern) {
      const result = loadFromLatestMessage();
      if (result.options.length > 0) {
        embeddedOptions = result.options;
        addNotification('已从酒馆最新消息解析选项');
      }
    }
    if (embeddedOptions.length === 0) {
      embeddedOptions = parseOptions(line.text || '');
      if (embeddedOptions.length > 0) addNotification('已从消息中重新解析选项');
    }
    if (embeddedOptions.length > 0) {
      const formattedChoices = embeddedOptions.map((opt, i) => ({
        id: `emb_refresh_${Date.now()}_${i}`,
        text: opt.text,
        nextSceneId: '',
      }));
      setChatHistory(prev =>
        prev.map((l, idx) => (idx === currentLineIndex ? { ...l, choices: formattedChoices } : l)),
      );
    } else {
      const fallback = ['继续剧情', '加快进度', '转入日常场景', '结束当前场景'];
      const formattedChoices = fallback.map((t, i) => ({ id: `fb_${Date.now()}_${i}`, text: t, nextSceneId: '' }));
      setChatHistory(prev =>
        prev.map((l, idx) => (idx === currentLineIndex ? { ...l, choices: formattedChoices } : l)),
      );
      addNotification('未检测到 <option>，使用默认选项');
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || inputValue;
    if (!textToSend.trim() || isAiProcessing) return;

    setInputValue('');
    setIsAiProcessing(true);
    const newUserLine: DialogueLine = { id: `u_${Date.now()}`, speakerId: CharacterId.PLAYER, text: textToSend };
    const historyWithUser = [...chatHistory, newUserLine];
    setChatHistory(historyWithUser);
    setCurrentLineIndex(historyWithUser.length - 1);

    try {
      let responseText: string;
      if (hasGenerate()) {
        // 使用酒馆 generate：先写入用户消息，再触发生成；refresh: 'affected' 避免重新载入整个聊天导致退出全屏
        if (typeof createChatMessages === 'function') {
          await createChatMessages([{ role: 'user', message: textToSend }], { refresh: 'affected' });
        }
        responseText = await generateResponse(textToSend);
        const lastId = typeof getLastMessageId === 'function' ? getLastMessageId() : -1;
        const lastMsg = lastId >= 0 && typeof getChatMessages === 'function' ? getChatMessages(lastId)[0] : null;
        const needAssistant = responseText && (!lastMsg || (lastMsg.role !== 'assistant' && lastMsg.role !== 'model'));
        if (needAssistant && typeof createChatMessages === 'function') {
          await createChatMessages([{ role: 'assistant', message: responseText }], { refresh: 'affected' });
        }
      } else {
        const playerName = playerCharacter?.name || '玩家';
        const apiHistory = chatHistory.map(m => ({
          role: m.speakerId === CharacterId.PLAYER ? ('user' as const) : ('model' as const),
          text: m.text,
        }));
        responseText = await generateCharacterResponse(
          '',
          apiHistory,
          currentSpeaker?.id || CharacterId.SUN_WEIDONG,
          textToSend,
          apiConfig,
          playerName,
        );
        // 外部 API 时需将用户消息与 AI 回复写入酒馆聊天，否则酒馆不会产生新楼层（@types/function/chat_message.d.ts）
        if (responseText && typeof createChatMessages === 'function') {
          try {
            await createChatMessages(
              [
                { role: 'user', message: textToSend },
                { role: 'assistant', message: responseText },
              ],
              { refresh: 'affected' },
            );
          } catch (e) {
            console.warn('写入酒馆聊天失败:', e);
          }
        }
      }

      if (!responseText || !responseText.trim()) {
        throw new Error('AI 响应为空');
      }

      const aiLineId = `ai_${Date.now()}`;
      const partialAiLine: DialogueLine = {
        id: aiLineId,
        speakerId: currentSpeaker?.id || CharacterId.SUN_WEIDONG,
        text: responseText,
        choices: [],
      };

      const finalHistory = [...historyWithUser, partialAiLine];
      setChatHistory(finalHistory);
      setCurrentLineIndex(finalHistory.length - 1);

      const embeddedOptions = parseOptions(responseText);
      if (embeddedOptions.length > 0) {
        const formattedChoices = embeddedOptions.map((opt, i) => ({
          id: `emb_${Date.now()}_${i}`,
          text: opt.text,
          nextSceneId: '',
        }));

        setChatHistory(prev =>
          prev.map(line => (line.id === aiLineId ? { ...line, choices: formattedChoices } : line)),
        );
        addNotification('已解析文内选项');
      } else {
        // 没有 <option> 时，不再调用外部 API，直接给出默认 4 选项
        const fallback = ['继续剧情', '加快进度', '转入日常场景', '结束当前场景'];
        const formattedChoices = fallback.map((t, i) => ({ id: `c_${Date.now()}_${i}`, text: t, nextSceneId: '' }));
        setChatHistory(prev =>
          prev.map(line => (line.id === aiLineId ? { ...line, choices: formattedChoices } : line)),
        );
      }

      // CG Trigger Logic: 图集在文件夹内，仅由图集关键词触发；放入图集的 CG 不能单独触发
      const lowerResp = responseText.toLowerCase();
      const enabledCgFolders = cgLibrary.filter(f => !f.disabled);
      const cgIdMap = new Map<string, CGItem>();
      enabledCgFolders.forEach(f => f.items.forEach(i => cgIdMap.set(i.id, i)));
      const itemIdsInAnySet = new Set<string>();
      enabledCgFolders.forEach(f =>
        (f.sets || []).forEach(s => (s.itemIds || []).forEach(id => itemIdsInAnySet.add(id))),
      );

      // 1) 图集触发（优先），条件宽松：名称/关键词包含、子串、单字重叠均可
      let triggeredSet: CGSet | null = null;
      for (const folder of enabledCgFolders) {
        for (const set of folder.sets || []) {
          if (matchCgSetInProse(set, lowerResp)) {
            triggeredSet = set;
            break;
          }
        }
        if (triggeredSet) break;
      }
      if (triggeredSet) {
        const items = (triggeredSet.itemIds || []).map(id => cgIdMap.get(id)).filter(Boolean) as CGItem[];
        if (items.length > 0) {
          setCgPlayback({ setId: triggeredSet.id, index: 0, items });
          setCurrentCG(items[0]);
          addNotification(`解锁图集: ${triggeredSet.name}`);
        } else {
          if (!globalSettings.cgManualCloseOnly) {
            setCgPlayback(null);
            setCurrentCG(null);
          }
          addNotification(`图集「${triggeredSet.name}」为空或图片已丢失`);
        }
      } else {
        // 2) 单张 CG 触发：未在图集中的 CG，名称或关键词任一命中即可；条件宽松
        const findTriggeredCG = () => {
          for (const folder of enabledCgFolders) {
            const found = folder.items.find(cg => {
              if (itemIdsInAnySet.has(cg.id)) return false;
              if (
                cg.name &&
                lowerResp.includes(cg.name.toLowerCase())
              )
                return true;
              return (
                Array.isArray(cg.keywords) &&
                cg.keywords.some(
                  k =>
                    k &&
                    lowerResp.includes(k.toLowerCase()),
                )
              );
            });
            if (found) return found;
          }
          return null;
        };
        const triggeredCG = findTriggeredCG();
        if (triggeredCG) {
          setCurrentCG(triggeredCG);
          setCgPlayback(null);
          addNotification(`解锁CG: ${triggeredCG.name}`);
        }
      }
    } catch (e) {
      console.error('发送消息失败:', e);
      addNotification(`错误: ${e instanceof Error ? e.message : '发送失败，请重试'}`);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleRegenerate = async () => {
    if (isAiProcessing || chatHistory.length === 0) return;
    const lastMsg = chatHistory[chatHistory.length - 1];
    const isUserMsg = lastMsg.speakerId === CharacterId.PLAYER;

    if (hasGenerate() && typeof triggerSlash === 'function') {
      // 使用酒馆 /continue 重写最后一条 AI 消息
      if (isUserMsg) {
        addNotification('最后一条是用户消息，无需重构');
        return;
      }
      setIsAiProcessing(true);
      try {
        await triggerSlash('/continue await=true');
        const result = loadFromLatestMessage();
        if (result.maintext && result.messageId !== undefined) {
          const msgToDisplay = result.fullMessage || result.maintext;
          const formattedChoices = result.options.map(opt => ({ id: opt.id, text: opt.text, nextSceneId: '' }));
          const currentLine = chatHistory[chatHistory.length - 1];
          const speakerForUpdate =
            characters.find(c => c.id === currentLine.speakerId) ||
            characters.find(c => c.id === CharacterId.SUN_WEIDONG);
          setChatHistory(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].speakerId !== CharacterId.PLAYER) {
              next[next.length - 1] = { ...next[next.length - 1], text: msgToDisplay, choices: formattedChoices };
            }
            return next;
          });
          addNotification('已从酒馆获取重构结果');
        }
      } catch (e) {
        console.error(e);
        addNotification(`重构失败: ${e instanceof Error ? e.message : '未知错误'}`);
      } finally {
        setIsAiProcessing(false);
      }
      return;
    }

    let historyForGen = [...chatHistory];
    let userPrompt = '';
    if (!isUserMsg) {
      historyForGen.pop();
      if (historyForGen.length > 0) {
        const prev = historyForGen[historyForGen.length - 1];
        if (prev.speakerId === CharacterId.PLAYER) {
          userPrompt = prev.text;
          historyForGen.pop();
        } else {
          userPrompt = '继续剧情';
        }
      } else {
        userPrompt = '游戏开始';
      }
    } else {
      userPrompt = lastMsg.text;
      historyForGen.pop();
    }
    setIsAiProcessing(true);
    if (!isUserMsg) {
      setChatHistory(prev => prev.slice(0, -1));
      setCurrentLineIndex(prev => prev - 1);
    }
    try {
      const apiHistory = historyForGen.map(m => ({
        role: m.speakerId === CharacterId.PLAYER ? ('user' as const) : ('model' as const),
        text: m.text,
      }));
      const playerName = playerCharacter?.name || '玩家';
      const responseText = await generateCharacterResponse(
        '',
        apiHistory,
        currentSpeaker?.id || CharacterId.SUN_WEIDONG,
        userPrompt,
        apiConfig,
        playerName,
      );

      const aiLineId = `ai_${Date.now()}`;
      const partialAiLine: DialogueLine = {
        id: aiLineId,
        speakerId: currentSpeaker?.id || CharacterId.SUN_WEIDONG,
        text: responseText,
        choices: [],
      };

      let newUiHistory = [...historyForGen];
      if (
        isUserMsg ||
        (!isUserMsg && chatHistory.length > 1 && chatHistory[chatHistory.length - 2].speakerId === CharacterId.PLAYER)
      ) {
        newUiHistory.push({ id: `u_${Date.now()}`, speakerId: CharacterId.PLAYER, text: userPrompt });
      }
      newUiHistory.push(partialAiLine);
      setChatHistory(newUiHistory);
      setCurrentLineIndex(newUiHistory.length - 1);

      const embeddedOptions = parseOptions(responseText);
      if (embeddedOptions.length > 0) {
        const formattedChoices = embeddedOptions.map((opt, i) => ({
          id: `emb_${Date.now()}_${i}`,
          text: opt.text,
          nextSceneId: '',
        }));

        setChatHistory(prev =>
          prev.map(line => (line.id === aiLineId ? { ...line, choices: formattedChoices } : line)),
        );
        addNotification('已解析文内选项');
      } else {
        const historyForOptions = [
          ...historyForGen,
          { role: 'user' as const, text: userPrompt },
          { role: 'model' as const, text: responseText },
        ];
        const choicesText = await generatePlotSuggestions(
          '',
          historyForOptions as any,
          globalSettings.plotGenPrompt,
          apiConfig,
        );
        const formattedChoices = choicesText.map((t, i) => ({ id: `c_${Date.now()}_${i}`, text: t, nextSceneId: '' }));

        setChatHistory(prev =>
          prev.map(line => (line.id === aiLineId ? { ...line, choices: formattedChoices } : line)),
        );
      }
    } catch (e) {
      console.error(e);
      alert('重新生成失败，请检查 API 配置或网络连接。');
      setChatHistory(chatHistory);
    } finally {
      setIsAiProcessing(false);
    }
  };

  /** 所有可用 NSFW CG 列表（用于随机、详细选择界面等，不限制当前角色） */
  const nsfwGalleryItems = useMemo(() => {
    const result: { item: CGItem; folderName: string }[] = [];
    cgLibrary.forEach(folder => {
      if (folder.disabled) return;
      const folderName = (folder.name || '').trim();
      if (!folderName) return;
      folder.items.forEach(item => {
        if (item.nsfw) {
          result.push({ item, folderName });
        }
      });
    });
    return result;
  }, [cgLibrary]);

  /** 所有可用 NSFW 图集摘要（用于底栏上拉快速选择 & 长按大界面二级菜单） */
  const nsfwSetsAll = useMemo(() => {
    const summaries: { id: string; name: string; count: number; folderName?: string }[] = [];
    cgLibrary.forEach(folder => {
      if (folder.disabled) return;
      const folderName = (folder.name || '').trim();
      if (!folderName) return;
      (folder.sets || []).forEach(set => {
        const allItems = set.itemIds.map(id => folder.items.find(i => i.id === id)).filter((i): i is CGItem => !!i);
        if (allItems.length > 0) {
          const nsfwItems = allItems.filter(i => i.nsfw);
          const usableCount = set.nsfw
            ? allItems.length
            : nsfwItems.length > 0
              ? nsfwItems.length
              : allItems.length;
          summaries.push({
            id: set.id,
            name: set.name || folderName,
            count: usableCount,
            folderName,
          });
        }
      });
    });
    return summaries;
  }, [cgLibrary]);

  /** NSFW 大界面中用于切换角色的二级菜单（根据 CG 文件夹名） */
  const nsfwCharacters = useMemo(
    () => Array.from(new Set(nsfwGalleryItems.map(g => g.folderName))).sort(),
    [nsfwGalleryItems],
  );
  const [nsfwCharFilter, setNsfwCharFilter] = useState<string | 'ALL'>('ALL');

  const filteredNsfwGalleryItems = useMemo(
    () => (nsfwCharFilter === 'ALL' ? nsfwGalleryItems : nsfwGalleryItems.filter(g => g.folderName === nsfwCharFilter)),
    [nsfwGalleryItems, nsfwCharFilter],
  );

  /** 不同角色对应的 NSFW 图集列表（用于大界面顶部“图集触发”二级菜单） */
  const nsfwSetsByCharacter = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; folderName?: string }[]>();
    cgLibrary.forEach(folder => {
      if (folder.disabled) return;
      const folderName = (folder.name || '').trim();
      if (!folderName) return;
      const setsForFolder: { id: string; name: string; count: number; folderName?: string }[] = [];
      (folder.sets || []).forEach(set => {
        const allItems = set.itemIds.map(id => folder.items.find(i => i.id === id)).filter((i): i is CGItem => !!i);
        if (allItems.length > 0) {
          const nsfwItems = allItems.filter(i => i.nsfw);
          const usableCount = set.nsfw
            ? allItems.length
            : nsfwItems.length > 0
              ? nsfwItems.length
              : allItems.length;
          setsForFolder.push({
            id: set.id,
            name: set.name || folderName,
            count: usableCount,
            folderName,
          });
        }
      });
      if (setsForFolder.length > 0) {
        map.set(folderName, setsForFolder);
      }
    });
    return map;
  }, [cgLibrary]);

  const handleRandomNSFW = () => {
    if (nsfwGalleryItems.length === 0) {
      addNotification('暂无可用 NSFW CG');
      return;
    }

    const randomEntry = nsfwGalleryItems[Math.floor(Math.random() * nsfwGalleryItems.length)];
    setCgPlayback(null);
    setCurrentCG(randomEntry.item);
    addNotification(`随机福利: [${randomEntry.folderName}] ${randomEntry.item.name}`);
  };

  /** 从指定图集随机/顺序播放一张 NSFW CG（用于底栏上拉列表） */
  const handleRandomNsfwFromSet = (setId: string) => {
    let targetSet: CGSet | null = null;
    let folderForSet: CGFolder | null = null;
    let itemsInSet: CGItem[] = [];

    for (const folder of cgLibrary) {
      if (folder.disabled) continue;
      const set = (folder.sets || []).find(s => s.id === setId);
      if (!set) continue;
      const itemsAll = set.itemIds.map(id => folder.items.find(i => i.id === id)).filter((i): i is CGItem => !!i);
      if (itemsAll.length === 0) continue;
      // 图集勾选 NSFW 时整集参与；否则优先单张勾选 NSFW，无则退回整套
      const items = set.nsfw ? itemsAll : itemsAll.filter(i => i.nsfw);
      itemsInSet = items.length > 0 ? items : itemsAll;
      targetSet = set;
      folderForSet = folder;
      break;
    }

    if (!targetSet || !folderForSet || itemsInSet.length === 0) {
      addNotification('该图集暂无可用 NSFW CG');
      return;
    }

    const mode: 'sequence' | 'random' = targetSet.mode || 'sequence';
    if (mode === 'sequence') {
      setCgPlayback({ setId: targetSet.id, index: 0, items: itemsInSet });
      setCurrentCG(itemsInSet[0]);
      addNotification(`图集「${targetSet.name || folderForSet.name}」(${itemsInSet.length} 张)`);
    } else {
      const item = itemsInSet[Math.floor(Math.random() * itemsInSet.length)];
      setCgPlayback(null);
      setCurrentCG(item);
      addNotification(`随机图集「${targetSet.name || folderForSet.name}」: ${item.name}`);
    }
  };

  const handleLoadGameSuccess = (loadedState: any) => {
    if (!loadedState) return alert('无效的存档数据 (Empty)');
    try {
      // ... (existing chat history load)
      let safeHistory = loadedState.chatHistory;
      if (!safeHistory || !Array.isArray(safeHistory) || safeHistory.length === 0) {
        safeHistory = [
          {
            id: 'fallback_load',
            speakerId: CharacterId.NARRATOR,
            text: '<gal_engine_v2>[Background|报道室][Speaker|系统][Dialog|检测到存档数据异常，已执行紧急恢复协议。][Info|系统恢复|COMPLETE]</gal_engine_v2>',
          },
        ];
      }
      setChatHistory(safeHistory);

      let safeIndex = typeof loadedState.currentLineIndex === 'number' ? loadedState.currentLineIndex : 0;
      if (safeIndex < 0) safeIndex = 0;
      if (safeIndex >= safeHistory.length) safeIndex = safeHistory.length - 1;
      setCurrentLineIndex(safeIndex);

      let bg = loadedState.background;
      if (typeof bg === 'string') {
        bg = { name: '未知地点', url: bg };
      } else if (!bg || !bg.url) {
        bg = { name: '报道室', url: BACKGROUNDS[0].url };
      }
      setCurrentBackground(bg);

      if (loadedState.currentCG) setCurrentCG(loadedState.currentCG);
      else setCurrentCG(null);
      setCgPlayback(null);

      let nextLibrary = customLibrary;
      if (Array.isArray(loadedState.customLibrary)) {
        nextLibrary = loadedState.customLibrary.filter((f: CustomFolder) => isAllowedSpriteFolder(f));
        setCustomLibrary(nextLibrary);
      }

      let nextCharacters = characters;
      if (Array.isArray(loadedState.characters)) {
        const mergedChars = loadedState.characters.map((lc: any) => {
          const defaultChar = Object.values(CHARACTERS).find(c => c.id === lc.id);
          if (defaultChar) {
            const merged = { ...defaultChar, ...lc };
            // 旧存档可能把 avatarUrl 存为空字符串；保留默认占位头像
            if (!merged.avatarUrl || !String(merged.avatarUrl).trim()) {
              merged.avatarUrl = defaultChar.avatarUrl;
            }
            return merged;
          }
          return lc;
        });
        nextCharacters = mergedChars;
        setCharacters(mergedChars);
      }

      const rawSprites: StageSprite[] = Array.isArray(loadedState.stageSprites) ? loadedState.stageSprites : [];
      setStageSprites(normalizeStageSpritesForAvatarFolder(rawSprites, nextLibrary, nextCharacters));

      // Updated Background Loading Logic
      if (Array.isArray(loadedState.backgroundLibrary)) {
        if (loadedState.backgroundLibrary.length > 0 && !('items' in loadedState.backgroundLibrary[0])) {
          // Migration: Wrap legacy items into folder
          setBackgroundLibrary([
            {
              id: 'migrated_bg_load',
              name: '存档背景',
              items: loadedState.backgroundLibrary,
            },
          ]);
        } else {
          setBackgroundLibrary(loadedState.backgroundLibrary);
        }
      }

      // Handle CG Library Load
      if (Array.isArray(loadedState.cgLibrary)) {
        if (loadedState.cgLibrary.length > 0 && !loadedState.cgLibrary[0].items) {
          // Legacy item list -> wrap in default folder
          setCgLibrary([
            {
              id: 'migrated_cg_load',
              name: '存档图集',
              items: loadedState.cgLibrary.map((item: any) => ({ ...item, keywords: item.keywords || [] })),
            },
          ]);
        } else {
          setCgLibrary(loadedState.cgLibrary);
        }
      }

      // cgSets 已并入 cgLibrary[].sets，旧存档中的 cgSets 会在首次加载时由 cgLibrary 迁移逻辑处理

      setModals({
        settings: false,
        dossier: false,
        assets: false,
        saveLoad: false,
        history: false,
        variables: false,
        schedule: false,
        commands: false,
        options: false,
        externalLink: false,
        spritePicker: false,
        systemTasks: false,
      });

      setTimeout(() => {
        setIsUiHidden(false);
        setIsNavExpanded(false);
        setViewMode('game');
      }, 50);

      // 读档后重置自动存档楼层标记，避免新楼层到来前的依赖变化被跳过
      lastAutoSavedMessageIdRef.current = undefined;
    } catch (e) {
      console.error('Critical Load Game Error', e);
      alert('严重错误：存档数据损坏，无法读取。');
      setViewMode('game');
    }
  };

  const handleVariableUpdate = (key: string, value: any) => {
    if (key === 'currentLineText') {
      const newHistory = [...chatHistory];
      if (newHistory[currentLineIndex]) {
        newHistory[currentLineIndex] = { ...newHistory[currentLineIndex], text: value };
        setChatHistory(newHistory);
      }
    } else if (key === 'activeCharacterId') {
      const newHistory = [...chatHistory];
      if (newHistory[currentLineIndex]) {
        newHistory[currentLineIndex] = { ...newHistory[currentLineIndex], speakerId: value };
        setChatHistory(newHistory);
      }
    }
  };

  const recalcTutorialSpotlight = useCallback(() => {
    if (!currentTutorialStep || !currentTutorialStep.targetSelector) {
      setTutorialSpotlight(null);
      return;
    }
    if (typeof document === 'undefined') return;
    const el = document.querySelector(currentTutorialStep.targetSelector) as HTMLElement | null;
    if (!el) {
      setTutorialSpotlight(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    let cx = rect.left + rect.width / 2;
    let cy = rect.top + rect.height / 2;
    // 对侧边栏按钮做一点偏移，让高亮圈更贴近图标和文字
    if (
      currentTutorialStep.id === 'assets' ||
      currentTutorialStep.id === 'schedule' ||
      currentTutorialStep.id === 'settings'
    ) {
      cx = rect.left + rect.width * 0.35;
    }
    if (currentTutorialStep.id === 'sidebar-toggle') {
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }
    let radius = Math.max(rect.width, rect.height) / 2 + 40;
    // 侧边栏按钮用更小半径，避免圈到相邻项（如事件表/图库互相遮挡）
    if (
      currentTutorialStep.id === 'assets' ||
      currentTutorialStep.id === 'schedule' ||
      currentTutorialStep.id === 'settings'
    ) {
      radius = rect.height / 2 + 20;
    }
    setTutorialSpotlight({ cx, cy, radius });
  }, [currentTutorialStep]);

  useEffect(() => {
    if (!isTutorialVisible || !(globalSettings.showTutorial ?? true)) {
      setTutorialSpotlight(null);
      return;
    }
    recalcTutorialSpotlight();
  }, [isTutorialVisible, globalSettings.showTutorial, tutorialStepIndex, isNavExpanded, recalcTutorialSpotlight]);

  // 当进入需要侧边栏的步骤时，自动展开侧边栏，并在动画结束后重新计算高亮位置
  useEffect(() => {
    if (!isTutorialVisible || !(globalSettings.showTutorial ?? true)) return;
    if (!tutorialNeedsSidebar) return;
    if (isNavExpanded) return;
    setIsNavExpanded(true);
    const t = setTimeout(() => {
      recalcTutorialSpotlight();
    }, 450);
    return () => clearTimeout(t);
  }, [isTutorialVisible, globalSettings.showTutorial, tutorialNeedsSidebar, isNavExpanded, recalcTutorialSpotlight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => recalcTutorialSpotlight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalcTutorialSpotlight]);

  const handleTutorialEvent = (id: TutorialStepId) => {
    if (!isTutorialVisible || !(globalSettings.showTutorial ?? true)) return;
    const step = currentTutorialStep;
    // 需要侧边栏的步骤，确保先展开侧边栏再计算高亮
    if (step && (step.id === 'assets' || step.id === 'schedule' || step.id === 'settings')) {
      if (!isNavExpanded) {
        setIsNavExpanded(true);
        // 展开动画结束后重新计算一次位置
        setTimeout(() => recalcTutorialSpotlight(), 350);
      }
    }
    if (step && step.id === id && step.advanceOnTargetClick) {
      setTutorialStepIndex(prev => Math.min(prev + 1, TUTORIAL_STEPS.length - 1));
    }
  };

  const getVisualInfo = () => {
    const activeSprite =
      stageSprites.find(s => s.characterId === currentSpeaker?.id || s.characterId === currentSpeaker?.name) ||
      stageSprites[0];
    if (activeSprite) return `${activeSprite.outfit} | ${activeSprite.expression}`;
    return '无数据 (NO_DATA)';
  };

  const activeStageSprite = useMemo(() => {
    if (!currentSpeaker) return undefined;
    return stageSprites.find(s => s.characterId === currentSpeaker.id || s.characterId === currentSpeaker.name);
  }, [currentSpeaker, stageSprites]);

  // Handle manual sprite update from picker（支持在弹窗内选择要修改的角色）
  const handleApplySpriteChange = (character: Character, outfit: string, expression: string) => {
    const updatedSprites = [...stageSprites];
    const charId = String(character.id || character.name || '').trim();
    const charName = String(character.name || '').trim();
    const charIdNorm = normSpriteKey(charId);
    const charNameNorm = normSpriteKey(charName);
    const existingIdx = updatedSprites.findIndex(s => {
      const sidNorm = normSpriteKey(String(s.characterId || ''));
      return sidNorm === charIdNorm || sidNorm === charNameNorm;
    });
    const folder = resolveSpriteFolderForChar(character);
    const pickedSprite =
      folder?.sprites?.find(s => (s.outfit || '') === outfit && (s.expression || '') === expression) ||
      folder?.sprites?.find(
        s => (s.outfit || '').includes(outfit || '') && (s.expression || '').includes(expression || ''),
      ) ||
      folder?.sprites?.find(s => s.isFallback) ||
      folder?.sprites?.[0];
    const manualAvatarUrl = pickedSprite?.imageUrl || '';

    if (existingIdx >= 0) {
      // 统一收敛到稳定的 character.id，避免 name/id 混用导致后续渲染匹配失败
      updatedSprites[existingIdx] = {
        ...updatedSprites[existingIdx],
        characterId: charId,
        outfit,
        expression,
        // 手动应用时直接锁定图片 URL，保证舞台立即可见
        ...(manualAvatarUrl ? { manualAvatarUrl } : {}),
      };
    } else {
      updatedSprites.push({
        instanceId: `manual_add_${Date.now()}`,
        characterId: charId,
        outfit,
        expression,
        x: 0,
        y: 0,
        scale: 1,
        zIndex: 20,
        ...(manualAvatarUrl ? { manualAvatarUrl } : {}),
      });
    }

    setStageSprites(normalizeStageSpritesForAvatarFolder(updatedSprites, customLibrary, runtimeCharacters));
    const entry: ManualSpriteEntry = {
      outfit,
      expression,
      manualAvatarUrl: (manualAvatarUrl || '').trim(),
    };
    manualSpriteByCharRef.current.set(charIdNorm, entry);
    if (charNameNorm && charNameNorm !== charIdNorm) {
      manualSpriteByCharRef.current.set(charNameNorm, entry);
    }
    addNotification(`立绘更新: ${character.name} - ${outfit} / ${expression}`);
  };

  const theme = globalSettings.theme || 'ink-jianghu';
  const accentColor =
    theme === 'black-gold'
      ? 'text-amber-400'
      : theme === 'tech'
        ? 'text-cyan-400'
        : theme === 'ink-jianghu'
          ? 'text-zinc-300'
          : theme === 'fantasy-elegant'
            ? 'text-amber-700'
            : theme === 'military'
              ? 'text-emerald-500'
              : 'text-emerald-500';
  const currentSidebarStyle =
    theme === 'black-gold'
      ? 'bg-[#050505]/95 text-amber-200 border-amber-600/40 shadow-[0_0_40px_rgba(245,158,11,0.35)] backdrop-blur-md'
      : theme === 'ink-jianghu'
        ? 'bg-black/88 text-zinc-200 border-white/15 shadow-[0_0_36px_rgba(255,255,255,0.06)] backdrop-blur-md'
        : theme === 'fantasy-elegant'
          ? 'bg-[#faf6ee]/95 text-amber-950 border-amber-800/35 shadow-[0_0_32px_rgba(180,83,9,0.2)] backdrop-blur-md'
          : theme === 'day'
            ? 'bg-white/95 text-slate-900 border-slate-300 shadow-xl'
            : 'bg-slate-900/95 text-emerald-400 border-emerald-500/30 shadow-2xl backdrop-blur-md';

  const navChromeFont = navChromeFontOf(globalSettings, theme);

  const NavButton = ({
    label,
    subLabel,
    icon,
    onClick,
    variant = 'normal',
    keepExpanded,
    tutorialId,
  }: {
    label: string;
    subLabel: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'normal' | 'danger';
    keepExpanded?: boolean;
    tutorialId?: TutorialStepId;
  }) => (
    <button
      data-tutorial-id={tutorialId}
      onClick={() => {
        onClick();
        if (tutorialId) handleTutorialEvent(tutorialId);
        if (!keepExpanded) setIsNavExpanded(false);
      }}
      className={`w-full px-5 py-4 transition-all border-r-[3px] border-transparent group flex items-center gap-4 pointer-events-auto text-left ${variant === 'danger' ? 'hover:bg-red-500/10 hover:border-red-500' : `hover:bg-current/10 hover:border-current`} ${tutorialId && currentTutorialStep?.id === tutorialId ? (theme === 'ink-jianghu' ? 'ring-2 ring-white/60 animate-pulse shadow-[0_0_20px_rgba(255,255,255,0.28)]' : theme === 'fantasy-elegant' ? 'ring-2 ring-amber-500 animate-pulse shadow-[0_0_22px_rgba(245,158,11,0.45)]' : 'ring-2 ring-emerald-400 animate-pulse shadow-[0_0_24px_rgba(16,185,129,0.7)]') : ''}`}
    >
      <div
        className={`flex-1 flex flex-col items-start text-left min-w-0 transition-all duration-500 ${isNavExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
      >
        <span
          className={`text-[18px] font-black tracking-[0.25em] transition-all ${variant === 'danger' ? 'text-red-400 group-hover:text-red-500' : 'opacity-90 group-hover:opacity-100'}`}
          style={{ fontFamily: navChromeFont, fontWeight: theme === 'ink-jianghu' ? 400 : undefined }}
        >
          {label}
        </span>
        <span
          className={`text-[11px] font-mono font-black tracking-[0.25em] uppercase transition-all italic mt-1 ${variant === 'danger' ? 'text-red-900 group-hover:text-red-600' : 'opacity-40 group-hover:opacity-80'}`}
          style={{ fontFamily: navChromeFont, fontWeight: theme === 'ink-jianghu' ? 400 : undefined }}
        >
          {subLabel}
        </span>
      </div>
      <div
        className={`w-10 shrink-0 flex items-center justify-center transition-all duration-500 scale-[1.4] ${isNavExpanded ? 'opacity-100' : 'opacity-0 scale-50'} group-hover:scale-[1.6] ${variant === 'danger' ? 'text-red-500' : accentColor}`}
      >
        {icon}
      </div>
    </button>
  );

  const matchMobile = matchMobileLayoutEffective;
  const singleSpriteMode = globalSettings.singleSpriteOnMobile ?? false;
  const containerStyle: React.CSSProperties = matchMobile
    ? { minHeight: '360px', minWidth: '320px', aspectRatio: '16 / 9' } // 手机/窄视口：横屏 16:9
    : { minHeight: '450px', minWidth: '600px', aspectRatio: '16 / 9' };

  return (
    <div
      className={`relative w-full max-w-full min-h-full overflow-x-hidden overflow-y-auto font-sans select-none touch-manipulation ${theme === 'fantasy-elegant' ? 'bg-[#f0e6d4]' : theme === 'day' ? 'bg-slate-200' : 'bg-slate-950'}`}
      style={{ ...containerStyle, fontFamily: uiFontOf(globalSettings) }}
      onContextMenu={e => {
        e.preventDefault();
        setContextWheelPos({ x: e.clientX, y: e.clientY });
        setContextWheelOpen(true);
      }}
      onTouchStart={e => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const pos = { x: t.clientX, y: t.clientY };
        touchStartPosRef.current = pos;
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          setContextWheelPos(pos);
          setContextWheelOpen(true);
        }, 500);
      }}
      onTouchMove={e => {
        if (longPressTimerRef.current && e.touches.length === 1) {
          const t = e.touches[0];
          const dx = Math.abs(t.clientX - touchStartPosRef.current.x);
          const dy = Math.abs(t.clientY - touchStartPosRef.current.y);
          if (dx > 10 || dy > 10) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
    >
      {/* Layer 1: Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          minHeight: '100%',
          backgroundColor: backgroundLoadError ? (theme === 'day' ? '#cbd5e1' : '#020617') : 'transparent',
        }}
      >
        {currentBackground.url && (
          <img
            src={currentBackground.url}
            className="w-full h-full object-cover transition-all duration-1000 scale-100"
            alt="bg"
            style={{ minHeight: '100%' }}
            onError={e => {
              setBackgroundLoadError(true);
              const fallback = flattenedBackgrounds.find(b => b.url) || BACKGROUNDS.find(b => b.url);
              if (fallback && currentBackground.url !== fallback.url) {
                setCurrentBackground({ name: fallback.name, url: fallback.url });
                setBackgroundLoadError(false);
              } else {
                // 如果所有背景都加载失败，至少显示背景色
                console.warn('背景图片加载失败:', currentBackground.url);
              }
            }}
            onLoad={() => setBackgroundLoadError(false)}
          />
        )}
      </div>

      {/* Layer 2: Sprites (Only if no CG) — 按 sprite.x 决定左/中/右，页边距防止立绘裁到画面外 */}
      {!displayedCG && (
        <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
          {/* 内层安全区：立绘的 left:% 相对此盒，避免 px 与 absolute+vw 各算各的导致裁边 */}
          <div
            className="absolute bottom-0 top-0 flex justify-center items-end pb-32"
            style={{
              boxSizing: 'border-box',
              left: 'clamp(12px, 5vw, 80px)',
              right: 'clamp(12px, 5vw, 80px)',
            }}
          >
            {(() => {
              const spritesForStage = (
                bgSpriteTransition?.phase === 'exiting' ? bgSpriteTransition.exitingSprites : stageSprites
              ).filter(s => (s.layer ?? 'stage') !== 'avatar');
              const isBgExitPhase = bgSpriteTransition?.phase === 'exiting';
              // 先根据角色与立绘资源过滤一遍，得到“实际能渲染的精灵列表”
              const visibleBase = spritesForStage
                .map(sprite => {
                  const stageId = String(sprite.characterId || '').trim();
                  const stageLower = stageId.toLowerCase();
                  const player = runtimeCharacters.find(c => c.id === CharacterId.PLAYER) || runtimeCharacters[0];
                  const sidNorm = normSpriteKey(stageId);
                  let char: Character | undefined =
                    stageLower === 'user' || stageLower === '{{user}}' || stageId === '主角' || stageId === '玩家'
                      ? player
                      : runtimeCharacters.find(
                          c => normSpriteKey(c.name) === sidNorm || normSpriteKey(String(c.id)) === sidNorm,
                        );
                  // 仅存在于立绘库、未合并进 runtimeCharacters 的 NPC：用 stageId 命中文件夹后合成最小 Character
                  if (!char) {
                    const lib = customLibrary || [];
                    const hit = lib.find(
                      f =>
                        !f.disabled &&
                        f.sprites &&
                        f.sprites.length > 0 &&
                        (normSpriteKey(f.name) === sidNorm || normSpriteKey(String(f.id)) === sidNorm),
                    );
                    if (hit) {
                      const n = hit.name.trim() || stageId;
                      char = {
                        id: (hit.id || n) as CharacterId,
                        name: n,
                        role: '',
                        description: '',
                        avatarUrl: '',
                        themeColor: '#888',
                        tags: [],
                        stats: { power: 0, trust: 0, sync: 0 },
                      };
                    }
                  }
                  if (!char) return null;
                  const forcedUrl = String(sprite.manualAvatarUrl || '').trim();
                  const effectiveUrl = forcedUrl || getEffectiveAvatarUrl(char);
                  if (!effectiveUrl) return null;
                  return { sprite, char, effectiveUrl };
                })
                .filter((e): e is { sprite: StageSprite; char: Character; effectiveUrl: string } => !!e);

              if (visibleBase.length === 0) return null;

              let visible = visibleBase;
              if (theme === 'fantasy-elegant') {
                const nameFromActive = (activeSpeakerName || '').trim();
                const nameFromCurrent = currentSpeaker ? String(currentSpeaker.name || '').trim() : '';
                const speakerRaw = nameFromActive || nameFromCurrent;
                if (isNarrationOnlySpeakerName(speakerRaw)) return null;
                const sn = normSpriteKey(speakerRaw);
                visible = visibleBase.filter(({ sprite, char }) => {
                  const sid = normSpriteKey(String(sprite.characterId || ''));
                  return sid === sn || normSpriteKey(char.name) === sn || normSpriteKey(String(char.id)) === sn;
                });
                if (visible.length === 0) return null;
              }

              // 单立绘模式：在“可见精灵”里挑主立绘（与头像层共用同一套优先级）
              const primaryInstanceId = singleSpriteMode
                ? pickPrimaryStageSpriteInstanceId(visible, activeSpeakerName, currentSpeaker)
                : null;

              const finalList =
                singleSpriteMode && primaryInstanceId
                  ? visible.filter(v => v.sprite.instanceId === primaryInstanceId)
                  : visible;

              // 如果只剩 1 个人，强制位置为居中；如果 2 个人，按 x 排序后强制左/右；如果 3 个人，按 x 排序后强制左/中/右
              return finalList.map(({ sprite, char, effectiveUrl }) => {
                let position: 'left' | 'center' | 'right' = 'center';
                const count = finalList.length;
                if (count === 1) {
                  position = 'center';
                } else if (count === 2) {
                  const [a, b] = finalList;
                  const firstIsLeft = a.sprite.x <= b.sprite.x;
                  if (sprite.instanceId === a.sprite.instanceId) {
                    position = firstIsLeft ? 'left' : 'right';
                  } else {
                    position = firstIsLeft ? 'right' : 'left';
                  }
                } else if (count === 3) {
                  const ordered = [...finalList].sort((a, b) => a.sprite.x - b.sprite.x);
                  const idx = ordered.findIndex(v => v.sprite.instanceId === sprite.instanceId);
                  if (idx === 0) position = 'left';
                  else if (idx === 1) position = 'center';
                  else position = 'right';
                } else {
                  // 4 人及以上极少出现，保持原有阈值逻辑作为兜底
                  position = sprite.x < -100 ? 'left' : sprite.x > 100 ? 'right' : 'center';
                }
                // 单人 / 双人 / 三人场景：忽略脚本里的原始 X，仅使用全局微调（spriteConfig.x），保证等间距布局
                const useCenteredLayout = finalList.length <= 3;
                const rawX = (useCenteredLayout ? 0 : sprite.x) + spriteConfig.x;
                const rawY = sprite.y + spriteConfig.y;
                const sideGapOffset = useCenteredLayout ? 0 : position === 'left' ? -80 : position === 'right' ? 80 : 0;
                const clampedX = Math.max(-260, Math.min(260, rawX + sideGapOffset));
                // 垂直位移限制为 ±400px，避免立绘完全离开画面
                const clampedY = Math.max(-400, Math.min(400, rawY));
                const isActive = currentSpeaker
                  ? char.id === currentSpeaker.id ||
                    char.name === currentSpeaker.name ||
                    (!!activeSpeakerName && char.name === activeSpeakerName)
                  : !!activeSpeakerName
                    ? char.name === activeSpeakerName
                    : sprite.zIndex >= 25;

                // 单人 / 两人 / 三人统一保持原始大小，避免人物被压扁
                // （四人及以上极少出现，如需可在此再做整体缩放）
                const multiScaleFactor = finalList.length <= 3 ? 1 : 0.85;

                // 入场类名与退场类名必须拆分：sprite-exit-* 只能走 exitAnimationClass，否则会打在入场节点上且根本不播退场
                const animOff =
                  globalSettings?.spriteAnimationEnabled === false;
                const enterAnimationClassResolved =
                  animOff || isBgExitPhase
                    ? undefined
                    : sprite.enterAnimation ||
                      (globalSettings?.implicitSpriteEnterWhenPipeOmits === true && !sprite.exitAnimation
                        ? globalSettings.spriteEnterAnimation
                        : undefined);

                const exitAnimationClassResolved =
                  animOff
                    ? undefined
                    : isBgExitPhase
                      ? globalSettings.spriteExitAnimation || 'sprite-exit-fade-out'
                      : sprite.exitAnimation || undefined;

                return (
                  <CharacterSprite
                    key={`${sprite.instanceId}-${spriteEnterNonce}`}
                    character={{ ...char, avatarUrl: effectiveUrl }}
                    isActive={!!isActive}
                    position={position}
                    config={{
                      x: clampedX,
                      y: clampedY,
                      scale: sprite.scale * spriteConfig.scale * multiScaleFactor,
                    }}
                    zIndex={sprite.zIndex}
                    breathingEnabled={
                      !exitAnimationClassResolved && (globalSettings?.breathingEnabled ?? true)
                    }
                    breathingScale={globalSettings?.breathingScale ?? 1.015}
                    breathingDuration={globalSettings?.breathingDuration ?? 2.5}
                    enterAnimationClass={enterAnimationClassResolved}
                    exitAnimationClass={exitAnimationClassResolved}
                    infoTrigger={globalSettings.spriteInfoTrigger ?? 'dblclick'}
                    onImageError={() => {
                      setStageSprites(prev => prev.filter(s => s.instanceId !== sprite.instanceId));
                      addNotification(`立绘加载失败: ${char.name}`);
                    }}
                    onRequestInfo={(c, anchor) => {
                      if (
                        (globalSettings.spriteInfoTrigger ?? 'dblclick') === 'dblclick' &&
                        infoCharacter &&
                        infoCharacter.id === c.id
                      ) {
                        setInfoCharacter(null);
                        setInfoAnchor(null);
                      } else {
                        setInfoCharacter(c);
                        setInfoAnchor(anchor);
                      }
                    }}
                  />
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Layer 3: CG (Highest Z-Index for visual) */}
      {displayedCG && (
        <div
          className="absolute inset-0 z-15 pointer-events-auto animate-in fade-in duration-700 bg-black/90 flex items-center justify-center"
          onClick={() => {
            // 图集播放：点击切下一张；播完后再关闭
            if (cgPlayback && cgPlayback.items.length > 0) {
              setCgPlayback(prev => {
                if (!prev) return prev;
                const nextIndex = prev.index + 1;
                if (nextIndex < prev.items.length) {
                  const nextItem = prev.items[nextIndex];
                  setCurrentCG(nextItem);
                  return { ...prev, index: nextIndex };
                }
                setCurrentCG(null);
                return null;
              });
              return;
            }
            if (globalSettings.cgCloseMode !== 'dblclick') {
              setCurrentCG(null);
              setCgPlayback(null);
            }
          }}
        >
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {cgPlayback &&
              cgPlayback.items.length > 1 &&
              (() => {
                // 仅当图集为顺序播放时显示左右翻页（mode 未设置时默认顺序）
                const setMode = (() => {
                  const setId = cgPlayback.setId;
                  for (const folder of cgLibrary) {
                    const found = folder.sets?.find(s => s.id === setId);
                    if (found) return found.mode || 'sequence';
                  }
                  return 'sequence';
                })();
                if (setMode !== 'sequence') return null;
                const canPrev = cgPlayback.index > 0;
                const canNext = cgPlayback.index < cgPlayback.items.length - 1;
                const goPrev = () => {
                  setCgPlayback(prev => {
                    if (!prev) return prev;
                    const nextIndex = Math.max(0, prev.index - 1);
                    const nextItem = prev.items[nextIndex];
                    if (nextItem) setCurrentCG(nextItem);
                    return { ...prev, index: nextIndex };
                  });
                };
                const goNext = () => {
                  setCgPlayback(prev => {
                    if (!prev) return prev;
                    const nextIndex = prev.index + 1;
                    if (nextIndex < prev.items.length) {
                      const nextItem = prev.items[nextIndex];
                      setCurrentCG(nextItem);
                      return { ...prev, index: nextIndex };
                    }
                    return prev;
                  });
                };
                return (
                  <>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (canPrev) goPrev();
                      }}
                      disabled={!canPrev}
                      className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center border border-white/20 backdrop-blur bg-black/40 text-white transition-all ${
                        canPrev ? 'hover:bg-black/60 hover:scale-110' : 'opacity-30 cursor-not-allowed'
                      }`}
                      title="上一张"
                    >
                      <svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (canNext) goNext();
                      }}
                      disabled={!canNext}
                      className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center border border-white/20 backdrop-blur bg-black/40 text-white transition-all ${
                        canNext ? 'hover:bg-black/60 hover:scale-110' : 'opacity-30 cursor-not-allowed'
                      }`}
                      title="下一张"
                    >
                      <svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 text-white/60 text-[11px] font-black tracking-widest pointer-events-none">
                      {cgPlayback.index + 1} / {cgPlayback.items.length}
                    </div>
                  </>
                );
              })()}
            <img
              src={displayedCG.url}
              onLoad={e => {
                const img = e.currentTarget;
                if (img.naturalHeight > img.naturalWidth) {
                  setCgDetectedVertical(prev => ({ ...prev, [displayedCG.id]: true }));
                }
              }}
              className={`transition-all duration-500 ${
                displayedCG.isVertical || cgDetectedVertical[displayedCG.id]
                  ? 'max-w-full max-h-full object-contain'
                  : globalSettings.cgFitMode === 'cover'
                    ? 'w-full h-full object-cover'
                    : 'max-w-full max-h-full object-contain'
              }`}
              style={
                displayedCG.isVertical || cgDetectedVertical[displayedCG.id]
                  ? undefined
                  : ({
                      transform: `translate(${globalSettings.cgOffsetX ?? 0}px, ${globalSettings.cgOffsetY ?? 0}px)`,
                      objectPosition:
                        globalSettings.cgFitMode === 'cover'
                          ? { top: 'center top', center: 'center center', bottom: 'center bottom' }[
                              globalSettings.cgCoverAnchor ?? 'top'
                            ]
                          : undefined,
                    } as React.CSSProperties)
              }
              alt="CG"
              onError={() => {
                setCurrentCG(null);
                setCgPlayback(null);
                addNotification('CG 图片加载失败，已关闭');
              }}
              onDoubleClick={() => {
                if (globalSettings.cgCloseMode === 'dblclick') {
                  setCurrentCG(null);
                  setCgPlayback(null);
                }
              }}
            />

            {globalSettings.cgCloseMode === 'click' && (
              <button
                className="absolute top-8 right-8 z-50 bg-red-600/80 hover:bg-red-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 backdrop-blur-md transition-all hover:scale-110"
                onClick={e => {
                  e.stopPropagation();
                  setCurrentCG(null);
                  setCgPlayback(null);
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}

            {globalSettings.cgCloseMode === 'dblclick' && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30 text-xs font-black tracking-[0.5em] animate-pulse pointer-events-none">
                DOUBLE_CLICK_TO_CLOSE
              </div>
            )}
          </div>
        </div>
      )}

      {/* NSFW CG 详细选择大界面（长按随机 NSFW 按钮时打开） */}
      {isNsfwGalleryOpen && (
        <div className="absolute inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center">
          <div
            className={`relative w-[96vw] max-w-5xl h-[82vh] rounded-3xl border shadow-[0_20px_80px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden ${
              theme === 'ink-jianghu' ? 'border-white/20 bg-black/85 text-zinc-100' : 'border-white/15 bg-slate-900/95'
            }`}
            style={
              theme === 'ink-jianghu'
                ? {
                    backgroundImage: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${inkJianghuExternalUrls.baseBg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
                  }
                : undefined
            }
          >
            <div
              className={`flex items-center justify-between px-6 py-3 border-b ${theme === 'ink-jianghu' ? 'border-white/20 bg-black/35' : 'border-white/10 bg-gradient-to-r from-pink-600/40 via-purple-700/30 to-slate-900/80'}`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold tracking-widest uppercase ${theme === 'ink-jianghu' ? 'text-zinc-100' : 'text-pink-200'}`}
                    style={{ fontFamily: navChromeFont, fontWeight: theme === 'ink-jianghu' ? 400 : undefined }}
                  >
                    NSFW CG 选择
                  </span>
                </div>
                {/* 不同角色的二级菜单 */}
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  <button
                    type="button"
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                      nsfwCharFilter === 'ALL'
                        ? 'bg-pink-500 text-white border-pink-300'
                        : 'bg-white/5 text-white/70 border-white/20 hover:bg-white/10'
                    }`}
                    onClick={() => setNsfwCharFilter('ALL')}
                  >
                    全部角色
                  </button>
                  {nsfwCharacters.map(name => (
                    <button
                      key={name}
                      type="button"
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        nsfwCharFilter === name
                          ? 'bg-pink-500 text-white border-pink-300'
                          : 'bg-white/5 text-white/70 border-white/20 hover:bg-white/10'
                      }`}
                      onClick={() => setNsfwCharFilter(name)}
                    >
                      {name || '未命名角色'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/10 hover:bg-white/20 text-white border border-white/30"
                onClick={() => setIsNsfwGalleryOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3 space-y-3">
              {/* 图集触发区域：支持按当前筛选角色触发整个图集 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-white/80">图集触发</span>
                  <span className="text-[10px] text-white/50">点击图集名可直接按顺序/随机播放整套 CG</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(nsfwCharFilter === 'ALL' ? nsfwSetsAll : nsfwSetsByCharacter.get(nsfwCharFilter) || []).map(set => (
                    <button
                      key={set.id}
                      type="button"
                      className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-pink-500/25 border border-white/15 hover:border-pink-400/70 text-[11px] text-white flex items-center gap-2"
                      onClick={() => handleRandomNsfwFromSet(set.id)}
                    >
                      <span className="font-semibold truncate max-w-[120px]">{set.name || '未命名图集'}</span>
                      <span className="text-[10px] text-pink-200/90">{set.count} 张</span>
                    </button>
                  ))}
                  {(nsfwCharFilter === 'ALL' ? nsfwSetsAll : nsfwSetsByCharacter.get(nsfwCharFilter) || []).length ===
                    0 && (
                    <span className="text-[10px] text-white/45">
                      当前筛选下暂无 NSFW 图集，可在图库中为该角色添加图集。
                    </span>
                  )}
                </div>
              </div>

              {/* 单张 CG 选择区域 */}
              {filteredNsfwGalleryItems.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-center text-sm text-white/70">
                  当前筛选下暂无可用 NSFW CG。请在立绘/CG 资源库中为该角色添加 NSFW 图像。
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredNsfwGalleryItems.map(({ item, folderName }) => (
                    <button
                      key={item.id}
                      type="button"
                      className="group relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 hover:border-pink-400/70 hover:shadow-[0_0_28px_rgba(244,114,182,0.75)] transition-all"
                      onClick={() => {
                        setCgPlayback(null);
                        setCurrentCG(item);
                        setIsNsfwGalleryOpen(false);
                        addNotification(`选择 NSFW CG: ${item.name}`);
                      }}
                    >
                      <div className="aspect-[4/3] w-full bg-slate-800/80 overflow-hidden">
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={() => {
                            addNotification(`CG 加载失败: ${item.name}`);
                          }}
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pt-4 pb-2">
                        <div className="text-[11px] font-bold text-pink-100 truncate">{item.name || '未命名 CG'}</div>
                        <div className="text-[10px] text-white/65 truncate">{folderName || '默认角色'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isUiHidden && (
        <div
          className="absolute inset-0 z-[100] cursor-pointer"
          onClick={() => setIsUiHidden(false)}
          title="点击任意处恢复界面"
        />
      )}

      <div
        className={`absolute inset-0 z-20 transition-all duration-500 pointer-events-none ${!isUiHidden ? 'opacity-100' : 'opacity-0'}`}
      >
        <DialogueBox
          speaker={currentSpeaker}
          characters={runtimeCharacters}
          text={dialogueText}
          rawMessageForXitong={rawMessageForXitong}
          onNext={() => currentLineIndex < chatHistory.length - 1 && setCurrentLineIndex(prev => prev + 1)}
          onBack={() => currentLineIndex > 0 && setCurrentLineIndex(prev => prev - 1)}
          customInputValue={inputValue}
          setCustomInputValue={setInputValue}
          onSendMessage={handleSendMessage}
          onRegenerate={handleRegenerate}
          globalSettings={globalSettings}
          isAiProcessing={isAiProcessing}
          isAuto={isAuto}
          onToggleAuto={() => setIsAuto(!isAuto)}
          onToggleLog={() => toggleModal('history')}
          onHideUI={() => setIsUiHidden(true)}
          onQuickSave={() => toggleModal('saveLoad')}
          onQuickLoad={() => toggleModal('saveLoad')}
          onQuickSaveAction={() => performSave('quick')}
          onQuickLoadAction={() => performLoad('quick')}
          onOpenSaveLoad={() => toggleModal('saveLoad')}
          autoSaveEnabled={globalSettings.autoSaveEnabled}
          onAutoSaveToggle={value =>
            setGlobalSettings(prev => ({
              ...prev,
              autoSaveEnabled: value !== undefined ? value : !prev.autoSaveEnabled,
            }))
          }
          onClearSaves={handleClearAllSaves}
          onExportSaves={handleExportSaves}
          onImportSaves={handleImportSaves}
          choices={dialogueChoices}
          onChoice={t => setInputValue(t)}
          boxConfig={dialogueBoxConfig}
          onUpdateDialogueBoxConfig={setDialogueBoxConfig}
          onUpdateGlobalSettings={patch =>
            setGlobalSettings(prev => ({
              ...prev,
              ...patch,
              bottomBarControlLayout:
                patch.bottomBarControlLayout != null
                  ? { ...(prev.bottomBarControlLayout || {}), ...patch.bottomBarControlLayout }
                  : prev.bottomBarControlLayout,
            }))
          }
          onRefreshChoices={handleRefreshChoices}
          commandStructure={commandStructure}
          commandTemplates={commandTemplates}
          onUpdateCommandStructure={setCommandStructure}
          onUpdateCommandTemplates={setCommandTemplates}
          onSyncGameState={handleSyncGameState}
          onToggleSystemTasksPopover={() => setShowSystemTasksPopover(prev => !prev)}
          backgroundLibrary={flattenedBackgrounds}
          onOpenCommandPalette={() => toggleModal('commands')}
          onOpenSpriteEdit={() => toggleModal('spritePicker')}
          forceOpenCommands={showCommandInterface}
          onCloseCommand={() => setShowCommandInterface(false)}
          forceOpenChoices={showChoicesInterface}
          onCloseChoices={() => setShowChoicesInterface(false)}
          onRandomNSFW={handleRandomNSFW}
          nsfwSets={nsfwSetsAll}
          onRandomNsfwFromSet={handleRandomNsfwFromSet}
          onOpenFullNsfwSelector={() => setIsNsfwGalleryOpen(true)}
          onModifySprite={() => toggleModal('spritePicker')}
          tutorialStepId={currentTutorialStep?.id}
          onTutorialEvent={handleTutorialEvent}
          customLibrary={customLibrary}
        />

        {/* 头像立绘层：叠在对话框之上（全身层仍在 Layer2） */}
        {!displayedCG && (
          <div className="absolute inset-0 z-[45] pointer-events-none overflow-hidden">
            <div
              className="absolute bottom-0 top-0 flex justify-center items-end pb-32"
              style={{
                boxSizing: 'border-box',
                left: 'clamp(12px, 5vw, 80px)',
                right: 'clamp(12px, 5vw, 80px)',
              }}
            >
              {(() => {
                const spritesForAvatar = (
                  bgSpriteTransition?.phase === 'exiting' ? bgSpriteTransition.exitingSprites : stageSprites
                ).filter(s => s.layer === 'avatar');
                if (spritesForAvatar.length === 0) return null;
                const visibleBase = spritesForAvatar
                  .map(sprite => {
                    const stageId = String(sprite.characterId || '').trim();
                    const stageLower = stageId.toLowerCase();
                    const player = runtimeCharacters.find(c => c.id === CharacterId.PLAYER) || runtimeCharacters[0];
                    const sidNorm = normSpriteKey(stageId);
                    let char: Character | undefined =
                      stageLower === 'user' || stageLower === '{{user}}' || stageId === '主角' || stageId === '玩家'
                        ? player
                        : runtimeCharacters.find(
                            c => normSpriteKey(c.name) === sidNorm || normSpriteKey(String(c.id)) === sidNorm,
                          );
                    if (!char) {
                      const lib = customLibrary || [];
                      const hit = lib.find(
                        f =>
                          !f.disabled &&
                          f.sprites &&
                          f.sprites.length > 0 &&
                          (normSpriteKey(f.name) === sidNorm || normSpriteKey(String(f.id)) === sidNorm),
                      );
                      if (hit) {
                        const n = hit.name.trim() || stageId;
                        char = {
                          id: (hit.id || n) as CharacterId,
                          name: n,
                          role: '',
                          description: '',
                          avatarUrl: '',
                          themeColor: '#888',
                          tags: [],
                          stats: { power: 0, trust: 0, sync: 0 },
                        };
                      }
                    }
                    if (!char) return null;
                    const forcedUrl = String(sprite.manualAvatarUrl || '').trim();
                    const effectiveUrl = forcedUrl || getEffectiveAvatarUrl(char);
                    if (!effectiveUrl) return null;
                    return { sprite, char, effectiveUrl };
                  })
                  .filter((e): e is { sprite: StageSprite; char: Character; effectiveUrl: string } => !!e);
                if (visibleBase.length === 0) return null;
                let visible = visibleBase;
                if (theme === 'fantasy-elegant') {
                  const nameFromActive = (activeSpeakerName || '').trim();
                  const nameFromCurrent = currentSpeaker ? String(currentSpeaker.name || '').trim() : '';
                  const speakerRaw = nameFromActive || nameFromCurrent;
                  if (isNarrationOnlySpeakerName(speakerRaw)) return null;
                  const sn = normSpriteKey(speakerRaw);
                  visible = visibleBase.filter(({ sprite, char }) => {
                    const sid = normSpriteKey(String(sprite.characterId || ''));
                    return sid === sn || normSpriteKey(char.name) === sn || normSpriteKey(String(char.id)) === sn;
                  });
                  if (visible.length === 0) return null;
                }
                // 头像层始终最多 1 个；全身层仍可按槽位多人（由 singleSpriteOnMobile 控制单人）
                const avatarPrimaryId = pickPrimaryStageSpriteInstanceId(
                  visible,
                  activeSpeakerName,
                  currentSpeaker,
                );
                const finalList = avatarPrimaryId
                  ? visible.filter(v => v.sprite.instanceId === avatarPrimaryId)
                  : [];
                const isBgExitPhase = bgSpriteTransition?.phase === 'exiting';
                if (finalList.length === 0) return null;
                return finalList.map(({ sprite, char, effectiveUrl }) => {
                  const isActive = currentSpeaker
                    ? char.id === currentSpeaker.id ||
                      char.name === currentSpeaker.name ||
                      (!!activeSpeakerName && char.name === activeSpeakerName)
                    : !!activeSpeakerName
                      ? char.name === activeSpeakerName
                      : sprite.zIndex >= 25;
                  const animOffAv =
                    globalSettings?.spriteAnimationEnabled === false;
                  const enterAnimationClassResolvedAv =
                    animOffAv || isBgExitPhase
                      ? undefined
                      : sprite.enterAnimation ||
                        (globalSettings?.implicitSpriteEnterWhenPipeOmits === true && !sprite.exitAnimation
                          ? globalSettings.spriteEnterAnimation
                          : undefined);
                  const exitAnimationClassResolvedAv =
                    animOffAv
                      ? undefined
                      : isBgExitPhase
                        ? globalSettings.spriteExitAnimation || 'sprite-exit-fade-out'
                        : sprite.exitAnimation || undefined;
                  return (
                    <CharacterSprite
                      key={`avatar-${sprite.instanceId}-${spriteEnterNonce}`}
                      character={{ ...char, avatarUrl: effectiveUrl }}
                      isActive={!!isActive}
                      position="center"
                      placement="avatarCorner"
                      avatarCornerExtras={{
                        offsetX: globalSettings.avatarPortraitOffsetX ?? 0,
                        offsetY: globalSettings.avatarPortraitOffsetY ?? 0,
                        scale: globalSettings.avatarPortraitScale ?? 1,
                      }}
                      config={{
                        x: globalSettings.avatarPortraitNudgeX ?? 0,
                        y: globalSettings.avatarPortraitNudgeY ?? 0,
                        scale: sprite.scale,
                      }}
                      zIndex={sprite.zIndex}
                      breathingEnabled={false}
                      enterAnimationClass={enterAnimationClassResolvedAv}
                      exitAnimationClass={exitAnimationClassResolvedAv}
                      infoTrigger={globalSettings.spriteInfoTrigger ?? 'dblclick'}
                      onImageError={() => {
                        setStageSprites(prev => prev.filter(s => s.instanceId !== sprite.instanceId));
                        addNotification(`头像立绘加载失败: ${char.name}`);
                      }}
                      onRequestInfo={(c, anchor) => {
                        if (
                          (globalSettings.spriteInfoTrigger ?? 'dblclick') === 'dblclick' &&
                          infoCharacter &&
                          infoCharacter.id === c.id
                        ) {
                          setInfoCharacter(null);
                          setInfoAnchor(null);
                        } else {
                          setInfoCharacter(c);
                          setInfoAnchor(anchor);
                        }
                      }}
                    />
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* STATUS CARD */}
        {globalSettings.showTimeCard !== false && (
          <div
            className="absolute z-20 animate-in fade-in slide-in-from-left-4 duration-500 pointer-events-auto origin-top-left"
            style={{
              top: globalSettings.timeCardOffsetY ?? 32,
              left: globalSettings.timeCardOffsetX ?? 32,
              transform: `scale(${globalSettings.timeCardScale ?? 1})`,
            }}
          >
            {!isStatusCardCollapsed ? (
              <div
                data-tutorial-id="timecard"
                className={`responsive-panel flex flex-col max-w-[288px] w-full min-w-[220px] min-h-[156px] h-[156px] rounded-[24px] overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] transition-all duration-300 ease-out relative ${
                  theme === 'ink-jianghu'
                    ? 'bg-[#efefef] border border-black/20'
                    : theme === 'fantasy-elegant'
                      ? 'bg-[#fffdf8] border border-amber-800/40'
                      : isFantasyWorld
                        ? 'bg-[#050505]/95 border border-amber-900/40'
                        : 'bg-white/10 backdrop-blur-xl border border-white/20'
                } ${currentTutorialStep?.id === 'timecard' ? (theme === 'fantasy-elegant' ? 'ring-2 ring-amber-500 shadow-[0_0_26px_rgba(245,158,11,0.45)]' : 'ring-2 ring-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.7)]') : ''}`}
                style={
                  theme === 'ink-jianghu'
                    ? {
                        backgroundImage: `url(${inkJianghuExternalUrls.timeCardBg})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundSize: '100% 100%',
                      }
                    : undefined
                }
              >
                <div
                  className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl ${
                    theme === 'fantasy-elegant' ? 'bg-amber-400/20' : isFantasyWorld ? 'bg-amber-500/10' : 'bg-white/5'
                  }`}
                ></div>
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>

                <div
                  className={`relative flex flex-col w-full h-full min-h-0 p-4 z-10 ${
                    theme === 'ink-jianghu'
                      ? 'text-black'
                      : theme === 'fantasy-elegant'
                        ? 'text-amber-950'
                        : isFantasyWorld
                          ? 'text-amber-100'
                          : 'text-white'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 min-h-0 flex-1">
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-90 drop-shadow-md min-w-0">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className={`w-3 h-3 drop-shadow-sm ${
                            theme === 'ink-jianghu'
                              ? 'text-black/70'
                              : theme === 'fantasy-elegant'
                                ? 'text-amber-700'
                                : isFantasyWorld
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="truncate max-w-[120px] drop-shadow-md">{currentBackground.name}</span>
                      </div>
                      <div
                        className={`font-black leading-none mt-1.5 tracking-tight drop-shadow-xl ${
                          theme === 'ink-jianghu' || theme === 'fantasy-elegant'
                            ? 'text-[34px] ' + (theme === 'ink-jianghu' ? 'text-black' : 'text-amber-950')
                            : 'text-[42px]'
                        } ${
                          theme === 'ink-jianghu' || theme === 'fantasy-elegant'
                            ? ''
                            : `text-transparent bg-clip-text ${
                                isFantasyWorld
                                  ? 'bg-gradient-to-b from-amber-100 to-amber-300'
                                  : 'bg-gradient-to-b from-white to-white/80'
                              }`
                        }`}
                      >
                        {timeData.time}
                      </div>
                      {showVisualStatus && (
                        <div
                          className={`text-[8px] opacity-85 font-bold mt-1 leading-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                            theme === 'ink-jianghu'
                              ? 'text-black/85'
                              : theme === 'fantasy-elegant'
                                ? 'text-amber-900'
                                : isFantasyWorld
                                  ? 'text-amber-200'
                                  : 'text-emerald-100'
                          }`}
                          title={currentCG ? `CG: ${currentCG.name}` : getVisualInfo()}
                        >
                          {currentCG ? `CG: ${currentCG.name}` : getVisualInfo()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <div
                        className={`${theme === 'ink-jianghu' ? 'text-black' : theme === 'fantasy-elegant' ? 'text-amber-950' : ''} text-xl font-bold drop-shadow-md`}
                      >
                        {timeData.date}
                      </div>
                      <div
                        className={`${theme === 'ink-jianghu' ? 'text-black/90' : theme === 'fantasy-elegant' ? 'text-amber-900' : ''} text-xs font-medium opacity-90`}
                      >
                        {timeData.week}
                      </div>
                      <div
                        className={`${theme === 'ink-jianghu' ? 'text-black/70' : theme === 'fantasy-elegant' ? 'text-amber-800' : ''} text-[10px] opacity-60 font-mono mt-1`}
                      >
                        {timeData.year}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex flex-nowrap items-center justify-between gap-1 shrink-0 pt-2 mt-auto border-t whitespace-nowrap leading-none ${
                      theme === 'ink-jianghu' ? 'border-black/20' : 'border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleResyncBackgroundFromText();
                        handleTutorialEvent('timecard');
                      }}
                      className={`min-w-0 flex-1 truncate text-center text-[8px] font-bold transition-colors rounded-sm py-0.5 ${
                        theme === 'ink-jianghu'
                          ? 'text-black/70 hover:text-black hover:bg-black/5'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      同步地点
                    </button>
                    <div
                      className={`w-px h-2.5 shrink-0 self-center ${theme === 'ink-jianghu' ? 'bg-black/25' : 'bg-white/20'}`}
                    />
                    <button
                      type="button"
                      onClick={handleResyncSpritesFromText}
                      className={`min-w-0 flex-1 truncate text-center text-[8px] font-bold transition-colors rounded-sm py-0.5 ${
                        theme === 'ink-jianghu'
                          ? 'text-black/70 hover:text-black hover:bg-black/5'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      同步立绘
                    </button>
                    <div
                      className={`w-px h-2.5 shrink-0 self-center ${theme === 'ink-jianghu' ? 'bg-black/25' : 'bg-white/20'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setIsStatusCardCollapsed(true)}
                      className={`min-w-0 flex-1 truncate text-center text-[8px] font-bold transition-colors rounded-sm py-0.5 ${
                        theme === 'ink-jianghu'
                          ? 'text-black/70 hover:text-black hover:bg-black/5'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      收起
                    </button>
                  </div>
                </div>

                {showTimeCode && (
                  <div
                    className={`absolute inset-0 z-50 backdrop-blur-md flex flex-col items-center justify-center text-center animate-in fade-in duration-200 ${theme === 'ink-jianghu' ? 'bg-white/90' : 'bg-black/80'}`}
                  >
                    <span
                      className={`text-[10px] font-mono mb-2 tracking-widest ${theme === 'ink-jianghu' ? 'text-black/70' : 'text-emerald-500'}`}
                    >
                      时间戳
                    </span>
                    <span
                      className={`text-lg font-mono font-bold tracking-widest ${theme === 'ink-jianghu' ? 'text-black' : 'text-white'}`}
                    >
                      {timeData.fullRaw}
                    </span>
                    <button
                      onClick={() => setShowTimeCode(false)}
                      className={`mt-4 text-[9px] border px-4 py-1 rounded ${
                        theme === 'ink-jianghu'
                          ? 'text-black/75 hover:text-black border-black/25 hover:bg-black/5'
                          : 'text-white/80 hover:text-white border-white/20 hover:bg-white/10'
                      }`}
                    >
                      关闭
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsStatusCardCollapsed(false)}
                className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 ${
                  theme === 'ink-jianghu'
                    ? 'bg-transparent backdrop-blur-none border-none text-white'
                    : 'bg-white/10 backdrop-blur-md border border-white/20 text-white'
                }`}
                title="展开状态面板"
              >
                {theme === 'ink-jianghu' ? (
                  <span
                    aria-hidden
                    className="w-10 h-10 block"
                    style={{
                      backgroundImage: `url(${inkJianghuExternalUrls.timeCardCollapsedIcon})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      backgroundSize: 'contain',
                    }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8" />
                    <path d="M8 12h8" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}

        <CharacterInfoPanel
          character={infoCharacter}
          mvuData={mvuData ?? null}
          isOpen={!!infoCharacter}
          anchor={infoAnchor}
          skin={globalSettings.infoPanelSkin ?? 'classic'}
          theme={globalSettings.theme}
          worldInfoEntries={worldInfoEntries}
          cgLibrary={cgLibrary}
          onInsertText={setInputValue}
          systemTasks={systemTasks}
          onClose={() => {
            setInfoCharacter(null);
            setInfoAnchor(null);
          }}
          onCloseSprite={ch => {
            if (!ch) return;
            const idKey = String(ch.id);
            const nameKey = (ch.name || '').trim();
            // 记录为“手动关闭立绘”的角色，后续同步 sprite 时会被过滤
            setHiddenSpriteCharacters(prev => {
              const next = new Set(prev);
              if (idKey) next.add(idKey);
              if (nameKey) next.add(nameKey);
              return Array.from(next);
            });
            const targetIds = new Set<string>([idKey, nameKey]);
            setStageSprites(prev =>
              normalizeStageSpritesForAvatarFolder(
                prev.filter(s => !targetIds.has(String(s.characterId)) && !targetIds.has(String((s as any).name || ''))),
                customLibrary,
                runtimeCharacters,
              ),
            );
            addNotification(`已关闭立绘：${ch.name}`);
          }}
          onEditAppearance={ch => {
            if (!ch) return;
            // 打开立绘编辑界面；内部会按角色名匹配
            toggleModal('spritePicker');
          }}
          onUpdateThemeColor={(id, color) => {
            setCharacters(prev => {
              const next = prev.map(c => (c.id === id ? { ...c, themeColor: color } : c));
              return next;
            });
            setInfoCharacter(prev => (prev && prev.id === id ? { ...prev, themeColor: color } : prev));
          }}
        />

        {/* VARIABLE LOG WIDGET */}
        <div
          className={`responsive-panel absolute bottom-8 left-8 z-[60] pointer-events-auto transition-all duration-300 ${isLogExpanded ? 'max-w-[320px] w-full min-w-[200px] h-auto' : 'w-10 h-10'}`}
          onMouseEnter={() => setIsLogExpanded(true)}
          onMouseLeave={() => setIsLogExpanded(false)}
        >
          {isLogExpanded ? (
            <div
              className={`backdrop-blur-md p-4 rounded shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
                theme === 'day'
                  ? 'bg-white/95 text-slate-900 border border-slate-300'
                  : theme === 'black-gold'
                    ? 'bg-[#050505]/95 text-amber-100 border border-amber-600/40 shadow-[0_0_30px_rgba(245,158,11,0.35)]'
                    : theme === 'ink-jianghu'
                      ? 'bg-black/86 text-zinc-100 border border-white/15 shadow-[0_0_24px_rgba(255,255,255,0.1)]'
                      : 'bg-black/80 text-white border border-emerald-500/30'
              }`}
              style={
                theme === 'ink-jianghu'
                  ? {
                      backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${inkJianghuExternalUrls.baseBg})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }
                  : undefined
              }
            >
              <div
                className={`flex items-center justify-between mb-3 border-b pb-2 ${
                  theme === 'day'
                    ? 'border-slate-200'
                    : theme === 'black-gold'
                      ? 'border-amber-700/40'
                      : theme === 'ink-jianghu'
                        ? 'border-white/15'
                        : 'border-emerald-500/20'
                }`}
              >
                <span
                  className={`text-xs font-black uppercase tracking-widest ${
                    theme === 'black-gold'
                      ? 'text-amber-400'
                      : theme === 'ink-jianghu'
                        ? 'text-zinc-200'
                        : theme === 'day'
                          ? 'text-emerald-600'
                          : 'text-emerald-500'
                  }`}
                >
                  SYSTEM_LOGS
                </span>
                <div
                  className={`w-2 h-2 animate-pulse rounded-full ${
                    theme === 'black-gold' ? 'bg-amber-400' : theme === 'ink-jianghu' ? 'bg-zinc-300' : 'bg-emerald-500'
                  }`}
                ></div>
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                {variableLogs.length > 0 ? (
                  variableLogs.map((log, idx) => (
                    <div key={idx} className="text-[10px] font-mono opacity-80 leading-tight flex gap-2">
                      <span
                        className={
                          theme === 'black-gold'
                            ? 'text-amber-300/80 shrink-0'
                            : theme === 'ink-jianghu'
                              ? 'text-zinc-400 shrink-0'
                              : theme === 'day'
                                ? 'text-slate-500 shrink-0'
                                : 'opacity-50 shrink-0'
                        }
                      >
                        [{log.time}]
                      </span>
                      <span
                        className={
                          idx === 0
                            ? theme === 'black-gold'
                              ? 'text-amber-100 font-bold'
                              : theme === 'ink-jianghu'
                                ? 'text-zinc-100 font-bold'
                                : theme === 'day'
                                  ? 'text-slate-900 font-bold'
                                  : 'text-white font-bold'
                            : theme === 'black-gold'
                              ? 'text-amber-200/90'
                              : theme === 'ink-jianghu'
                                ? 'text-zinc-300'
                                : theme === 'day'
                                  ? 'text-slate-700'
                                  : 'text-white/70'
                        }
                      >
                        {log.text}
                      </span>
                    </div>
                  ))
                ) : (
                  <div
                    className={`text-[10px] italic text-center py-4 ${theme === 'day' ? 'text-slate-400' : 'opacity-30'}`}
                  >
                    无记录
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              className={`w-10 h-10 flex items-center justify-center rounded transition-all ${
                theme === 'ink-jianghu'
                  ? 'bg-transparent border-none shadow-none outline-none ring-0'
                  : theme === 'day'
                    ? 'bg-white/90 border border-slate-300 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-400'
                    : theme === 'black-gold'
                      ? 'bg-[#050505]/95 border border-amber-600/60 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.35)] hover:bg-amber-500 hover:text-black'
                      : 'bg-emerald-900/20 border border-emerald-500/50 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-600 hover:text-black'
              }`}
            >
              {theme === 'ink-jianghu' ? (
                <span
                  aria-hidden
                  className="w-10 h-10 block"
                  style={{
                    backgroundImage: `url(${inkJianghuExternalUrls.systemLogIcon})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: 'contain',
                  }}
                />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* 主内容面板：档案等内嵌显示 */}
        {isNavExpanded && modals.dossier && (
          <div
            className={`fixed inset-y-0 left-0 z-[55] flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 ${
              theme === 'day'
                ? 'bg-white/95 border-r border-slate-300'
                : theme === 'ink-jianghu'
                  ? 'bg-black/88 border-r border-white/15'
                  : 'bg-slate-900/95 border-r border-emerald-500/20'
            }`}
            style={{
              right: 'min(320px, 85vw)',
              ...(theme === 'ink-jianghu'
                ? {
                    backgroundImage: `url(${inkJianghuExternalUrls.baseBg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }
                : {}),
            }}
          >
            <div className="flex-1 min-h-0 flex flex-col">
              <Dossier
                isOpen={true}
                onClose={() => toggleModal('dossier')}
                embedded
                characters={spritePickerCharacters}
                customLibrary={customLibrary}
                onUpdateAvatar={(id, url, scale, offsetY) =>
                  setCharacters(prev =>
                    prev.map(c =>
                      c.id === id ? { ...c, avatarUrl: url, avatarScale: scale, avatarOffsetY: offsetY } : c,
                    ),
                  )
                }
                onUpdateThemeColor={(id, color) =>
                  setCharacters(prev => prev.map(c => (c.id === id ? { ...c, themeColor: color } : c)))
                }
                onUpdateCharacterData={(id, data) =>
                  setCharacters(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)))
                }
                onDeleteCharacter={id => {
                  if (id === CharacterId.NARRATOR || id === CharacterId.SYSTEM || id === CharacterId.PLAYER) {
                    addNotification('无法删除系统角色');
                    return;
                  }
                  setCharacters(prev => prev.filter(c => c.id !== id));
                  addNotification('角色已删除');
                }}
                onRefreshDossier={handleDossierRefresh}
                isRefreshing={isAiProcessing}
                theme={globalSettings.theme}
              />
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div
          className={`responsive-panel fixed top-0 right-0 h-full z-[60] flex flex-col justify-center transition-all duration-500 ease-out pointer-events-none ${isNavExpanded ? `max-w-[320px] w-full min-w-[200px] backdrop-blur-md border-l ${currentSidebarStyle}` : 'w-10'}`}
        >
          {theme === 'ink-jianghu' && isNavExpanded && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${inkJianghuExternalUrls.navLongOverlay})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                opacity: 0.28,
                mixBlendMode: 'screen',
              }}
            />
          )}
          <button
            data-tutorial-id="sidebar-toggle"
            onClick={() => {
              setIsNavExpanded(!isNavExpanded);
              handleTutorialEvent('sidebar-toggle');
            }}
            className="absolute top-1/2 -left-4 -translate-y-1/2 w-8 h-32 flex flex-col items-center justify-center transition-all group pointer-events-auto z-[70]"
          >
            <div
              className={`w-[2px] h-full transition-all rounded-full relative ${theme === 'day' ? 'bg-slate-400/30 group-hover:bg-slate-600' : 'bg-white/10 group-hover:bg-white/30'}`}
            >
              <div
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[4px] h-12 shadow-[0_0_20px_currentColor] transition-all ${isNavExpanded ? 'h-full scale-y-110 opacity-80' : 'opacity-40'} ${accentColor} bg-current`}
              />
            </div>
          </button>
          <div
            className={`flex flex-col w-full h-full overflow-hidden transition-opacity duration-300 ${isNavExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          >
            <div className="px-10 mt-12 mb-8 border-b border-current/10 pb-6 flex items-center justify-end gap-4">
              <div className="text-right">
                <h4
                  className={`text-[11px] font-black uppercase tracking-[0.4em] italic ${accentColor}`}
                  style={{ fontFamily: navChromeFont, fontWeight: theme === 'ink-jianghu' ? 400 : undefined }}
                >
                  Tactical_Command
                </h4>
                <span
                  className="text-[8px] font-mono opacity-30 uppercase tracking-[0.2em]"
                  style={{ fontFamily: navChromeFont, fontWeight: theme === 'ink-jianghu' ? 400 : undefined }}
                >
                  System_Interface_V3
                </span>
              </div>
            </div>
            <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar">
              <div className="pb-6 pt-6 px-4 border-t border-current/5 flex flex-col items-stretch space-y-4">
                {(globalSettings.developerMode ?? false) && (
                  <NavButton
                    icon={<IconDossier />}
                    label="档案"
                    subLabel="Dossier"
                    onClick={() => toggleModal('dossier')}
                  />
                )}
                {(globalSettings.developerMode ?? false) && (
                  <NavButton
                    icon={<IconSchedule />}
                    label="事件表"
                    subLabel="Event_Timeline"
                    onClick={() => toggleModal('schedule')}
                    tutorialId="schedule"
                  />
                )}
                <NavButton
                  icon={<IconLib />}
                  label="图库"
                  subLabel="Gallery_Center"
                  onClick={() => toggleModal('assets')}
                  tutorialId="assets"
                />
                <NavButton
                  icon={<IconEnterFS />}
                  label="存储 / 读取"
                  subLabel="Save_Load"
                  onClick={() => toggleModal('saveLoad')}
                />
                {(globalSettings.developerMode ?? false) && (
                  <NavButton
                    icon={<IconVar />}
                    label="系统任务"
                    subLabel="System_Quests"
                    onClick={() => toggleModal('systemTasks')}
                  />
                )}
                <div className="mx-4 my-4 h-px bg-gradient-to-r from-transparent via-current/20 to-transparent" />
                <NavButton
                  icon={<IconVar />}
                  label="变量监控"
                  subLabel="State_Monitor"
                  onClick={() => toggleModal('variables')}
                />
                <NavButton
                  icon={<IconSettings />}
                  label="系统设置"
                  subLabel="Terminal_Settings"
                  onClick={() => toggleModal('settings')}
                  tutorialId="settings"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL NOTIFICATION TOAST */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
        {notifications.map(note => (
          <div
            key={note.id}
            className={`px-6 py-2 rounded shadow-[0_5px_15px_rgba(0,0,0,0.3)] animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3 backdrop-blur-sm ${
              theme === 'black-gold'
                ? 'bg-amber-600/95 text-black border border-amber-400/70'
                : theme === 'ink-jianghu'
                  ? 'bg-black/90 text-zinc-100 border border-white/20'
                  : 'bg-emerald-600/90 text-white border border-emerald-400/30'
            }`}
          >
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            <span className="text-xs font-black tracking-wide uppercase">{note.text}</span>
          </div>
        ))}
      </div>

      {/* --- MODALS --- */}
      <SettingsModal
        isOpen={modals.settings}
        onClose={() => toggleModal('settings')}
        modalCompactLayout={matchMobileLayoutEffective}
        viewportAutoMobile={viewportMobileLayout}
        settings={globalSettings}
        onUpdateSettings={s => {
          setGlobalSettings(s);
          localStorage.setItem('spirit_command_settings', JSON.stringify(s));
        }}
        spriteConfig={spriteConfig}
        onUpdateSpriteConfig={c => {
          setSpriteConfig(c);
          localStorage.setItem('spirit_command_sprite_config', JSON.stringify(c));
        }}
        dialogueBoxConfig={dialogueBoxConfig}
        onUpdateDialogueBoxConfig={c => {
          setDialogueBoxConfig(c);
          localStorage.setItem('spirit_command_dialogue_box_config', JSON.stringify(c));
        }}
        apiConfig={apiConfig}
        onUpdateApiConfig={cfg => {
          setApiConfig(cfg);
          localStorage.setItem('spirit_command_external_api', JSON.stringify(cfg));
        }}
        previewBackgroundUrl={currentBackground.url}
        previewCharacter={(previewCharacter?.avatarUrl ? previewCharacter : null) || defaultPreviewCharacter}
        customLibrary={customLibrary}
        spriteFolderKindCharacters={spritePickerCharacters}
        previewCgUrl={displayedCG?.url}
        chatHistory={chatHistory}
      />

      <Dossier
        isOpen={modals.dossier}
        onClose={() => toggleModal('dossier')}
        characters={spritePickerCharacters}
        customLibrary={customLibrary}
        onUpdateAvatar={(id, url, scale, offsetY) =>
          setCharacters(prev =>
            prev.map(c => (c.id === id ? { ...c, avatarUrl: url, avatarScale: scale, avatarOffsetY: offsetY } : c)),
          )
        }
        onUpdateThemeColor={(id, color) =>
          setCharacters(prev => prev.map(c => (c.id === id ? { ...c, themeColor: color } : c)))
        }
        onUpdateCharacterData={(id, data) =>
          setCharacters(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)))
        }
        onDeleteCharacter={id => {
          // 禁止删除NARRATOR、SYSTEM、PLAYER
          if (id === CharacterId.NARRATOR || id === CharacterId.SYSTEM || id === CharacterId.PLAYER) {
            addNotification('无法删除系统角色');
            return;
          }
          setCharacters(prev => prev.filter(c => c.id !== id));
          addNotification('角色已删除');
        }}
        onRefreshDossier={handleDossierRefresh}
        isRefreshing={isAiProcessing}
        theme={globalSettings.theme}
      />

      <AssetLibraryModal
        isOpen={modals.assets}
        onClose={() => toggleModal('assets')}
        customLibrary={customLibrary}
        onUpdateCustomLibrary={l => {
          const filtered = l.filter(f => isAllowedSpriteFolder(f));
          setCustomLibrary(filtered);
          localStorage.setItem('spirit_command_lib_v6', JSON.stringify(filtered));
        }}
        backgroundLibrary={backgroundLibrary}
        onUpdateBackgroundLibrary={handleUpdateBackgroundLibrary}
        onSetBackground={bg => {
          backgroundManualLockRef.current = true;
          setBackgroundLoadError(false);
          setCurrentBackground(bg);
          addNotification(`背景已切换为: ${bg.name}`);
        }}
        currentBackgroundUrl={currentBackground.url}
        cgLibrary={cgLibrary}
        onUpdateCgLibrary={cgs => {
          setCgLibrary(cgs);
          localStorage.setItem(CG_LIB_STORAGE_KEY, JSON.stringify(cgs));
        }}
        onSetCG={cg => {
          setCurrentCG(cg);
          setCgPlayback(null);
        }}
        currentCG={displayedCG}
        theme={globalSettings.theme}
        isAuthorMode={globalSettings.authorMode}
        onForceSave={handleForceSave}
        isMobileLayout={matchMobileLayoutEffective}
        cgDisplaySettings={{
          cgFitMode: globalSettings.cgFitMode,
          cgCoverAnchor: globalSettings.cgCoverAnchor,
          cgOffsetX: globalSettings.cgOffsetX,
          cgOffsetY: globalSettings.cgOffsetY,
        }}
      />

      <input type="file" ref={importFileInputRef} accept=".json" className="hidden" onChange={handleImportFileChange} />

      <SaveLoadModal
        isOpen={modals.saveLoad}
        onClose={() => toggleModal('saveLoad')}
        getCurrentState={() => ({
          chatHistory,
          currentLineIndex,
          activeCharacterId: currentSpeaker?.id,
          background: currentBackground,
          stageSprites,
          mode: 'story',
          characters,
          backgroundLibrary,
          customLibrary,
          cgLibrary,
          avatarOverrides: {},
          currentCG: displayedCG,
        })}
        onLoadState={handleLoadGameSuccess}
        theme={globalSettings.theme}
        chatId={chatId}
        onQuickSave={() => performSave('quick')}
        onQuickLoad={() => performLoad('quick')}
        autoSaveEnabled={globalSettings.autoSaveEnabled}
        onAutoSaveToggle={value =>
          setGlobalSettings(prev => ({ ...prev, autoSaveEnabled: value !== undefined ? value : !prev.autoSaveEnabled }))
        }
        onClearAll={handleClearAllSaves}
        isMobileLayout={matchMobileLayoutEffective}
      />

      <HistoryLog
        isOpen={modals.history}
        onClose={() => toggleModal('history')}
        history={chatHistory.slice(0, currentLineIndex + 1)}
        theme={globalSettings.theme}
        isMobileLayout={matchMobileLayoutEffective}
      />

      <GameVariablesModal
        isOpen={modals.variables}
        onClose={() => toggleModal('variables')}
        theme={globalSettings.theme}
        variables={{
          activeCharacterId: currentSpeaker?.id || 'None',
          currentLineText: currentLine.text,
          backgroundUrl: currentBackground.url,
          stageSprites: stageSprites,
          characterStats: characters.map(c => ({ name: c.name, stats: c.stats })),
          currentCG: currentCG ? currentCG.name : 'None',
        }}
        onUpdate={handleVariableUpdate}
        backgrounds={flattenedBackgrounds} // Use flattened here
        onSetBackground={bg => {
          backgroundManualLockRef.current = true;
          setBackgroundLoadError(false);
          setCurrentBackground(bg);
          addNotification(`背景已切换为: ${bg.name}`);
        }}
        rawResponse={(() => {
          if (typeof getLastMessageId !== 'function' || typeof getChatMessages !== 'function') return currentLine.text;
          try {
            const lastId = getLastMessageId();
            if (lastId < 0) return currentLine.text;
            const msgs = getChatMessages(lastId, { role: 'assistant' });
            const m = msgs?.[0];
            return (m?.message ?? currentLine.text) || '';
          } catch {
            return currentLine.text;
          }
        })()}
      />

      <ScheduleModal
        isOpen={modals.schedule}
        onClose={() => toggleModal('schedule')}
        theme={globalSettings.theme}
        onTimeJump={handleTimeJump}
        worldInfoEntries={worldInfoEntries}
        currentGameDate={gameDate}
        backgrounds={flattenedBackgrounds}
        cgLibrary={cgLibrary}
        characters={characters}
        onReloadEventTable={handleReloadEventTable}
        eventTableLoading={eventTableLoading}
        isMobileLayout={matchMobileLayoutEffective}
      />

      <CommandPalette
        isOpen={modals.commands}
        onClose={() => toggleModal('commands')}
        onCommandSelect={cmd => {
          setInputValue(commandTemplates[cmd] || cmd);
          toggleModal('commands');
        }}
        commandStructure={commandStructure}
        commandTemplates={commandTemplates}
        onUpdateStructure={setCommandStructure}
        onUpdateTemplates={setCommandTemplates}
        theme={globalSettings.theme}
      />

      <OptionsModal
        isOpen={modals.options}
        onClose={() => toggleModal('options')}
        choices={dialogueChoices}
        onChoice={t => setInputValue(t)}
        theme={globalSettings.theme}
        isMobileLayout={matchMobileLayoutEffective}
      />

      {modals.externalLink && (
        <ExternalLinkModal
          isOpen={modals.externalLink}
          onClose={() => toggleModal('externalLink')}
          initialConfig={apiConfig}
          onSaveConfig={setApiConfig}
        />
      )}

      {/* 大型界面任务面板（导航栏打开） */}
      <SystemTasksModal
        isOpen={modals.systemTasks}
        onClose={() => toggleModal('systemTasks')}
        tasks={systemTasks}
        theme={globalSettings.theme}
        onOpenSmallPopover={() => {
          setModals(prev => ({ ...prev, systemTasks: false }));
          setShowSystemTasksPopover(true);
        }}
      />

      {/* 小型弹窗任务面板（正文 <xitong> 触发，仅简要提示+打开大型界面按钮） */}
      <SystemTasksModal
        variant="popover"
        isOpen={showSystemTasksPopover}
        onClose={() => {
          dismissedSystemTasksSigRef.current = latestSystemTasksSigRef.current;
          setShowSystemTasksPopover(false);
        }}
        tasks={systemTasks}
        theme={globalSettings.theme}
      />

      {/* 新手指引：分页 + 聚光灯遮罩 */}
      {isTutorialVisible && (globalSettings.showTutorial ?? true) && currentTutorialStep && (
        <>
          <div
            className="fixed inset-0 z-180 pointer-events-none"
            style={
              tutorialSpotlight
                ? {
                    background: `radial-gradient(circle at ${tutorialSpotlight.cx}px ${tutorialSpotlight.cy}px, transparent ${tutorialSpotlight.radius}px, rgba(255,255,255,0.85) ${tutorialSpotlight.radius + 40}px)`,
                  }
                : { backgroundColor: 'rgba(255,255,255,0.85)' }
            }
          />
          <div className="fixed inset-0 z-190 flex items-end md:items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[720px] mx-4 mb-6 md:mb-0 rounded-2xl border border-emerald-600/50 bg-white/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.15)] overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-emerald-600">TUTORIAL</div>
                  <div className="text-lg font-bold text-slate-800 mt-1">新手指引</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="px-3 py-1.5 text-[11px] rounded border border-slate-300 text-slate-600 hover:bg-slate-200 transition-colors"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? '退出全屏' : '全屏'}
                  </button>
                  <button
                    className="text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
                    onClick={() => setIsTutorialVisible(false)}
                  >
                    本局跳过
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 text-[13px] leading-relaxed text-slate-700 space-y-3">
                <p className="text-[11px] text-emerald-600 font-mono uppercase">
                  Step {tutorialStepIndex + 1} / {TUTORIAL_STEPS.length}
                </p>
                <h3 className="text-[16px] font-bold text-slate-800">{currentTutorialStep.title}</h3>
                <p className="text-[13px] text-slate-700 opacity-95">{currentTutorialStep.description}</p>
                <p className="text-[11px] text-slate-500">
                  {currentTutorialStep.id === 'platform-choice'
                    ? '手机真机或窄浏览器会自动横屏 16:9 布局；下面按钮决定宽屏电脑是否也强制同款布局，可随时在「系统设置 > 界面选项」里改。'
                    : '当前步骤对应的界面元素会在画面中用亮圈高亮出来，跟着高亮区域点击即可进入下一步。'}
                </p>
                {currentTutorialStep.id === 'platform-choice' && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      className="flex-1 px-3 py-2 text-[12px] rounded border border-slate-300 text-slate-700 bg-white hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                      onClick={() => {
                        setGlobalSettings(prev => ({ ...prev, matchMobileLayout: false }));
                        setTutorialStepIndex(i => Math.min(TUTORIAL_STEPS.length - 1, i + 1));
                      }}
                    >
                      我主要在电脑端游玩
                    </button>
                    <button
                      className="flex-1 px-3 py-2 text-[12px] rounded border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      onClick={() => {
                        setGlobalSettings(prev => ({ ...prev, matchMobileLayout: true }));
                        setTutorialStepIndex(i => Math.min(TUTORIAL_STEPS.length - 1, i + 1));
                      }}
                    >
                      我主要在手机端游玩
                    </button>
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50">
                <div className="text-[11px] text-slate-500">
                  随时可在 <span className="font-mono text-emerald-600">系统设置 &gt; 新手指引</span> 中重新打开本教程。
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <button
                    className="px-3 py-1.5 text-[11px] rounded border border-slate-300 text-slate-600 hover:bg-slate-200 transition-colors"
                    onClick={() => setIsTutorialVisible(false)}
                  >
                    稍后再看
                  </button>
                  <button
                    disabled={tutorialStepIndex === 0}
                    className={`px-3 py-1.5 text-[11px] rounded border border-slate-300 text-slate-600 hover:bg-slate-200 transition-colors ${tutorialStepIndex === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => setTutorialStepIndex(i => Math.max(0, i - 1))}
                  >
                    上一步
                  </button>
                  <button
                    className="px-4 py-1.5 text-[11px] rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors"
                    onClick={() => {
                      if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
                        setIsTutorialVisible(false);
                      } else {
                        setTutorialStepIndex(i => Math.min(TUTORIAL_STEPS.length - 1, i + 1));
                      }
                    }}
                  >
                    {tutorialStepIndex >= TUTORIAL_STEPS.length - 1 ? '完成' : '下一步'}
                  </button>
                  <button
                    className="px-3 py-1.5 text-[11px] rounded border border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
                    onClick={() => {
                      setGlobalSettings(prev => ({ ...prev, showTutorial: false }));
                      setIsTutorialVisible(false);
                    }}
                  >
                    不再显示
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <SpritePickerModal
        isOpen={modals.spritePicker}
        onClose={() => toggleModal('spritePicker')}
        theme={theme}
        characters={spritePickerCharacters}
        currentCharacter={currentSpeaker}
        currentOutfit={activeStageSprite?.outfit}
        currentExpression={activeStageSprite?.expression}
        customLibrary={customLibrary}
        onApply={handleApplySpriteChange}
        onUpdateSpriteFolderKind={(folderId, kind) => {
          setCustomLibrary(prev => prev.map(f => (f.id === folderId ? { ...f, spriteFolderKind: kind } : f)));
        }}
      />

      {/* 右键圆形快捷轮盘：全屏键居中，选项/存档/图库/系统设置 */}
      <ContextMenuWheel
        isOpen={contextWheelOpen}
        onClose={() => setContextWheelOpen(false)}
        position={contextWheelPos}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        developerMode={globalSettings.developerMode ?? false}
        onBackToMain={handleBackToMainScreen}
        onOpenModal={key => {
          toggleModal(key as keyof typeof modals);
          setContextWheelOpen(false);
        }}
        onOpenChoices={() => {
          setShowChoicesInterface(true);
          setContextWheelOpen(false);
        }}
        theme={globalSettings.theme}
        quickMenuItems={(globalSettings.quickMenuCustomItems ?? []).map((item, index) => ({
          id: item.id || `custom_${index}`,
          label: item.label,
          icon: resolveQuickWheelIcon(item.modalKey),
          onClick: () => {
            toggleModal(item.modalKey as keyof typeof modals);
          },
        }))}
      />

      {(globalSettings.showFloatingFullscreen ?? true) && !isUiHidden && (
        <DraggableFullscreenButton
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          theme={globalSettings.theme}
        />
      )}
    </div>
  );
};

const IconDossier = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 5h6l2 3h8v11H4z" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
);

const IconLib = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M10 10l2.5 3 2-2 3.5 5H6z" />
    <circle cx="9" cy="8" r="1.4" />
  </svg>
);

const IconSettings = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.62V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1-1.62 1.8 1.8 0 0 0-2 .36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.62-1H3a2 2 0 1 1 0-4h.09a1.8 1.8 0 0 0 1.62-1 1.8 1.8 0 0 0-.36-2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 2 .36H9a1.8 1.8 0 0 0 1-1.62V3a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1 1.62 1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.62 1H21a2 2 0 1 1 0 4h-.09a1.8 1.8 0 0 0-1.62 1z" />
  </svg>
);

const IconVar = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M7 12l2.5-3L13 15l2.5-4L17 12" />
  </svg>
);

// 导航栏「存储 / 读取」：软盘样式图标
const IconEnterFS = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 3h11l3 3v13H5z" />
    <path d="M9 3v6h6V3" />
    <path d="M9 18h6" />
  </svg>
);
const IconExitFS = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M4 10h4m0 0V6m0 4-5-5m17 5h-4m0 0V6m0 4 5-5M4 14h4m0 0v4m0-4-5 5m17-5h-4m0 0v4m0-4 5 5" />
  </svg>
);
const IconSchedule = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="12" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="M8 6h6a4 4 0 0 1 4 4v2" />
    <path d="M8 18h8" />
  </svg>
);

export default App;
