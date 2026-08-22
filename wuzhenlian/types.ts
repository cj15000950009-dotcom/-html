export const CharacterId = {
  PLAYER: 'Player',
  SUN_WEIDONG: 'SunWeidong',
  GAO_MENG: 'GaoMeng',
  LUO_ZHENHAI: 'LuoZhenhai',
  QIN_ZHENG: 'QinZheng',
  HE_GUODONG: 'HeGuodong',
  LIN_ZHENGPING: 'LinZhengping',
  SHAO_KAI: 'ShaoKai',
  MENG_KAI: 'MengKai',
  MA_QIANG: 'MaQiang',
  FANG_XIAO: 'FangXiao',
  NARRATOR: 'Narrator',
  SYSTEM: 'System',
} as const;

export type CharacterId = (typeof CharacterId)[keyof typeof CharacterId] | string;

export interface Character {
  id: CharacterId;
  name: string;
  role: string;
  description: string;
  avatarUrl: string;
  themeColor: string;
  tags: string[];
  stats: {
    power: number; // 对应 军衔/职权
    trust: number; // 对应 信任度
    sync: number; // 对应 掌控/堕落度
  };
  psychological?: string; // 心理侧写
  kinks?: string; // 性癖/敏感点 (机密档案)
  // Display config for Dossier
  avatarScale?: number;
  avatarOffsetY?: number;
}

export interface DialogueLine {
  id: string;
  speakerId: CharacterId;
  text: string;
  emotion?: 'neutral' | 'angry' | 'happy' | 'shy' | 'serious';
  choices?: Choice[];
  bgmId?: string; // Explicit BGM override
}

export interface OpeningScenario {
  id: string;
  label: string;
  description: string;
  prompt: string;
  initialScript?: DialogueLine[]; // Pre-generated script for instant start
}

export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
  action?: () => void;
}

/** 底栏控制按钮 id，用于布局编辑中的位移/缩放存储 */
export type BottomBarControlId =
  | 'auto'
  | 'skip'
  | 'history'
  | 'hide'
  | 'choices'
  | 'regen'
  | 'nsfw'
  | 'sprite';

export interface BottomBarControlTransform {
  offsetXPx?: number;
  offsetYPx?: number;
  /** 相对默认大小的缩放，默认 1 */
  scale?: number;
}

/** 对话框外框与（玻璃主题）正文区内边距；存 localStorage `spirit_command_dialogue_box_config` */
export interface DialogueBoxLayoutConfig {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  /** 非水墨/奇幻框时正文区 padding px；未设置则用默认 p-8 等 */
  textPaddingTop?: number;
  textPaddingRight?: number;
  textPaddingBottom?: number;
  textPaddingLeft?: number;
}

export interface GlobalSettings {
  theme:
    | 'day'
    | 'night'
    | 'tech'
    | 'military'
    | 'tech-white'
    | 'tech-blue'
    | 'black-gold'
    | 'ink-jianghu'
    | 'fantasy-elegant'; // 奇幻典雅（宣纸黄 + 金，独立对话框 PNG）
  /** 现实 / 奇境 世界模式：影响整体配色与氛围 */
  worldMode?: 'reality' | 'fantasy';
  fontSize: number;
  /** 旧版存档兼容用；新界面已拆为三处字体，逻辑回退仍可读此字段 */
  fontFamily: string;
  /** 姓名框内文字字体 */
  nameBoxFontFamily?: string;
  /** 对话框正文字体 */
  dialogueFontFamily?: string;
  /** 侧栏、时间卡等整体界面字体 */
  uiFontFamily?: string;
  /** 姓名框：粗体 */
  nameBoxBold?: boolean;
  /** 姓名框：倾斜 */
  nameBoxItalic?: boolean;
  /** 姓名框：文字阴影（与对话框阴影设置独立） */
  nameBoxTextShadowEnabled?: boolean;
  typingSpeed: number;
  autoInterval: number;
  /**
   * 自动播放时，从进入该分页起算的最短停留时间（秒）。
   * 用于避免「一人一句独占一页」时打字很快结束、立绘几乎一闪而过。
   */
  minPageDisplaySeconds?: number;
  boxOpacity: number;
  topBarTransparent: boolean; // New setting
  volume: number; // 0.0 - 1.0
  bgmEnabled: boolean;
  enableStoryChoices: boolean; // New: Toggle Plot Choices
  plotGenPrompt: string; // New: Guidance for generating plot options
  authorMode: boolean; // NEW: Author Mode for editing static content
  enableNovelMode: boolean; // NEW: Consolidate history into chapters
  cgFitMode: 'cover' | 'contain'; // NEW: CG Display Mode
  /** Cover 模式下裁剪时优先保留的区域：top=顶部，center=居中，bottom=底部 */
  cgCoverAnchor?: 'top' | 'center' | 'bottom';
  cgOffsetX: number; // CG 水平位置偏移（像素）
  cgOffsetY: number; // CG 垂直位置偏移（像素）
  cgCloseMode: 'click' | 'dblclick'; // NEW: CG Close Mode
  /** CG 触发后仅手动关闭：开启时切行、新回复不会自动清除 CG，需用户点击关闭 */
  cgManualCloseOnly?: boolean;
  dialogueSkin: 'default' | 'glass'; // NEW: Dialogue Box Skin
  /** 对话文字阴影：开启/关闭 */
  dialogueTextShadowEnabled?: boolean;
  /** 对话文字阴影半径（px） */
  dialogueTextShadowSize?: number;
  /** 水墨江湖对话框底图样式：白日/中午/夜晚/深夜 */
  inkDialogueFrameStyle?: 'day' | 'noon' | 'night' | 'deep-night';
  autoSaveEnabled: boolean; // 是否开启自动存档
  /** 立绘呼吸动画：是否开启 */
  breathingEnabled?: boolean;
  /** 呼吸动画缩放幅度（如 1.015 表示 1%～1.5%） */
  breathingScale?: number;
  /** 呼吸动画周期（秒） */
  breathingDuration?: number;
  /** 是否启用立绘入场/出场动画（关闭后立绘无入场出场动画） */
  spriteAnimationEnabled?: boolean;
  /** 立绘入场动画类名（CSS），如 sprite-enter-slide-right、sprite-enter-fade-in */
  spriteEnterAnimation?: string;
  /** 立绘出场动画类名（CSS），如 sprite-exit-fade-out、sprite-exit-slide-left */
  spriteExitAnimation?: string;
  /**
   * 换背景图时是否先强制场上所有立绘播放退场动画，再切换背景并让新立绘播入场（默认开启）
   */
  spritesExitOnBackgroundChange?: boolean;
  /**
   * 管道正文未写第 7/8 段动画时，是否仍使用 `spriteEnterAnimation` 作为默认入场（默认关闭：未写则不播入场）
   */
  implicitSpriteEnterWhenPipeOmits?: boolean;
  /**
   * 是否根据对白里的「离开/走出」等词自动补 `sprite-exit-fade-out`（默认关闭：未写第 8 段则不自动退场）
   */
  spriteAutoExitFromDialogueKeywords?: boolean;
  colors: {
    dialogue: string;
    narrator: string;
    thought: string;
    /** 系统面板（<xitong>）文本颜色 */
    system?: string;
    /** 对话框中「带引号对白」的高亮颜色 */
    speech?: string;
  };
  /** 快捷轮盘自定义项：可在系统设置中添加其他界面到右键轮盘 */
  quickMenuCustomItems?: Array<{ id: string; label: string; modalKey: string }>;
  /** 通知显示时长（秒），如「移动至: 酒吧」等提示的停留时间 */
  notificationDuration?: number;
  /** 是否在进入游戏时显示新手指引（Tutorial Overlay） */
  showTutorial?: boolean;
  /** 是否显示可拖动的悬浮全屏按钮 */
  showFloatingFullscreen?: boolean;
  /** 宽屏上也强制使用手机/窄视口同款布局（横屏 16:9、触控优化等）；窄视口（宽≤768 或高≤736）时始终自动启用 */
  matchMobileLayout?: boolean;
  /** 立绘信息面板触发方式：双击立绘 / 悬浮立绘 */
  spriteInfoTrigger?: 'dblclick' | 'hover';
  /** 手机/窄视口布局时是否限制场上仅显示 1 个立绘，避免画面过于拥挤 */
  singleSpriteOnMobile?: boolean;
  /** 角色介绍界面皮肤：经典浮窗 / 资料卡 */
  infoPanelSkin?: 'classic' | 'dossier';
  /** 是否显示左上角时间卡 */
  showTimeCard?: boolean;
  /** 时间卡距左边缘（像素），默认与原先 top-8 left-8 一致 */
  timeCardOffsetX?: number;
  /** 时间卡距上边缘（像素） */
  timeCardOffsetY?: number;
  /** 时间卡整体缩放，1 为默认 */
  timeCardScale?: number;
  /**
   * 开发者模式：开启后在侧边栏/快捷轮盘显示「档案」「事件表」「系统任务」；关闭时隐藏（默认关闭）。
   */
  developerMode?: boolean;
  /** 水墨江湖主题：对话框 PNG 整体缩放，1 为默认 */
  inkDialogueScale?: number;
  /** 头像立绘：距左侧偏移 px（舞台左下角为锚点） */
  avatarPortraitOffsetX?: number;
  /** 头像立绘：距底部偏移 px */
  avatarPortraitOffsetY?: number;
  /** 头像立绘：相对管道缩放的额外倍率 */
  avatarPortraitScale?: number;
  /**
   * 头像立绘：内部 translate 微调 px（CharacterSprite 内层），与「全身立绘」所用的 spriteConfig.x/y 完全独立。
   */
  avatarPortraitNudgeX?: number;
  avatarPortraitNudgeY?: number;
  /** PNG 框（水墨/奇幻）：正文区内边距 */
  framedDialoguePaddingTop?: number;
  framedDialoguePaddingRight?: number;
  framedDialoguePaddingBottom?: number;
  framedDialoguePaddingLeft?: number;
  /** 姓名框相对默认位置的微调 px */
  framedNameOffsetLeftPx?: number;
  framedNameOffsetTopPx?: number;
  /** 姓名区域宽高（像素）；不设置高度时竖版用默认 170 */
  framedNameAreaWidthPx?: number;
  framedNameAreaHeightPx?: number;
  /** 姓名排版：竖排 / 横排 */
  framedNameWritingMode?: 'vertical' | 'horizontal';
  /**
   * 界面布局编辑模式：开启后可在主界面拖拽对话框整体/缩放框体、拖底栏图标与（水墨/奇幻）正文可视区边距。
   * 按 ESC 或到系统设置关闭。
   */
  uiLayoutEditMode?: boolean;
  /** 底栏各按钮相对默认位置的微调（像素平移与缩放） */
  bottomBarControlLayout?: Partial<Record<BottomBarControlId, BottomBarControlTransform>>;
}

export interface GameState {
  currentSceneId: string;
  dialogueHistory: DialogueLine[];
  currentSpeaker: CharacterId | null;
  activeSpirits: CharacterId[];
  apiKey: string;
  isSettingsOpen: boolean;
  isDossierOpen: boolean;
  background: string;
  settings: GlobalSettings;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

// Custom System Types
export interface CustomSprite {
  id: string;
  characterName: string; // Used for matching
  outfit: string; // Variable 1
  expression: string; // Variable 2
  imageUrl: string; // The visual
  isFallback?: boolean;
  /** 角色封面：用于角色列表卡片预览图 */
  isFolderCover?: boolean;
  avatarScale?: number;
  avatarX?: number;
  avatarY?: number;
}

export interface CustomFolder {
  id: string;
  name: string; // Folder Name (Display)
  sprites: CustomSprite[];
  disabled?: boolean; // NEW: Allow disabling folders
  /** 全身立绘（舞台中央）/ 头像立绘（左下角、叠在对话框上） */
  spriteFolderKind?: 'fullbody' | 'avatar';
}

// Render Instance on Stage
export interface StageSprite {
  instanceId: string;
  characterId: string;
  outfit: string;
  expression: string;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  /** 头像立绘：由立绘库文件夹类型决定；缺省为舞台全身立绘 */
  layer?: 'stage' | 'avatar';
  /** 立绘入场动画 CSS 类名（由剧情/AI 指定，未指定时使用默认淡入） */
  enterAnimation?: string;
  /** 立绘出场动画 CSS 类名（由剧情/AI 指定，未指定时使用默认淡出） */
  exitAnimation?: string;
  /** 底栏立绘选择器「应用」时锁定的图片 URL，优先于按服饰/表情在立绘库中匹配 */
  manualAvatarUrl?: string;
}

// Background Asset Type
export interface BackgroundItem {
  id: string;
  name: string;
  url: string;
  bgmId?: string;
}

export interface BackgroundFolder {
  id: string;
  name: string;
  items: BackgroundItem[];
  disabled?: boolean;
}

// CG Asset Type (Updated with folders and keywords)
export interface CGItem {
  id: string;
  name: string;
  url: string;
  /** 兼容旧数据：触发匹配仍可读此项 */
  keywords: string[];
  /** 叙事触发描述，如「张承岳给user口交」 */
  triggerContent?: string;
  /** CG 编号，正文/管道中可写 <cg id=此处> 或 CG:此处 触发 */
  cgTagId?: string;
  nsfw?: boolean;
  isVertical?: boolean;
}

export interface CGFolder {
  id: string;
  name: string;
  items: CGItem[];
  /** 图集作为子文件夹，嵌套在本文件夹内 */
  sets?: CGSet[];
  disabled?: boolean;
}

// CG Collection / Album (一套按顺序/随机播放的 CG)
export interface CGSet {
  id: string;
  name: string; // 图集显示名 / 仍可参与宽松匹配
  itemIds: string[]; // CGItem.id 按顺序排列
  keywords: string[]; // 可选：额外关键词（逗号导入），包含即触发
  mode?: 'sequence' | 'random'; // 顺序图集 / 随机图集
  /** 叙事侧触发描述（与单张 CG「触发内容」一致） */
  triggerContent?: string;
  /** 图集级编号：正文 &lt;cg id=此处&gt; 或管道 CG:此处 触发本图集 */
  cgTagId?: string;
  /** 整图集视为 NSFW（底栏随机 NSFW 图集时优先播放集中全部图片） */
  nsfw?: boolean;
}

/** 系统任务（由 <xitong> 模板解析而来） */
export interface SystemTask {
  id: string;
  /** 任务类别，如 日常任务 / 主线任务 等 */
  category: string;
  /** 任务名称 */
  title: string;
  /** 任务目标描述 */
  goal: string;
  /** 截止时间（文本形式，暂不强制具体格式） */
  deadline: string;
  /** 难度等级（文本，如 E~SSS） */
  difficulty: string;
  /** 任务奖励（可包含文字描述、道具名等） */
  reward: string;
  /** 任务惩罚说明 */
  penalty: string;
  /** 原始 <xitong> 块文本，便于调试或二次解析 */
  raw: string;
}

// External API Configuration
export interface ExternalApiConfig {
  provider: 'gemini' | 'openai' | 'custom';
  baseUrl: string;
  apiKey: string;
  modelId: string;
  headers: string; // JSON string for custom headers
}

// --- NEW SAVE SYSTEM TYPES ---
export interface SaveData {
  meta: {
    id: string; // unique ID
    slotId: number; // local storage slot index
    type: 'manual' | 'auto' | 'quick';
    timestamp: number;
    dateString: string;
    summary: string;
    locationName: string;
    playTime?: string; // Optional: formatted playtime
    version: number;
  };
  preview: {
    bgUrl: string;
    charUrl: string; // Main active character
  };
  state: {
    chatHistory: DialogueLine[];
    currentLineIndex: number;
    activeCharacterId: string;
    background: { name: string; url: string };
    stageSprites: StageSprite[];
    characters: Character[]; // Persist character stats updates
    // We store minimal config to restore context
    mode: 'story' | 'chat';
    currentOutfit: string;
    currentExpression: string;
    currentCG?: CGItem | null; // Added CG persistence
  };
  // Optional: Full context backup for portability
  worldContext?: {
    backgroundLibrary: BackgroundFolder[]; // Updated to Folders
    customLibrary: CustomFolder[];
    cgLibrary?: CGFolder[]; // Updated to Folders
    cgSets?: CGSet[]; // NEW: CG Sets / Albums
    characterOverrides: Record<string, any>;
    worldInfoEntries?: WorldInfoEntry[]; // Added for World Info persistence
  };
}

// --- WORLD INFO / LOREBOOK TYPES (Enhanced for SillyTavern Compatibility) ---

export type WorldInfoPosition = 'before_char' | 'after_char' | 'an_top' | 'an_bottom' | 'at_depth';
export type WorldInfoLogic = 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL';

export interface WorldInfoEntry {
  id: string;
  uid?: number; // ST specific
  name?: string; // Display name / Comment
  comment?: string; // ST specific
  enabled: boolean;
  disable?: boolean; // ST specific (inverse of enabled)

  // Trigger Logic
  keys: string[]; // Primary keywords (regex supported)
  key?: string[]; // ST specific alias
  secondaryKeys?: string[]; // Filter keywords (optional filters)
  keysecondary?: string[]; // ST specific alias
  selectiveLogic?: WorldInfoLogic | number; // Logic for secondary keys
  constant?: boolean; // If true, always inserted regardless of keys

  // Content & Sorting
  content: string;
  insertionOrder: number; // Higher number = inserted later/lower (higher priority usually)
  order?: number; // ST specific alias
  position?: WorldInfoPosition | number; // Where to insert in the prompt context

  // Advanced settings (implied or explicit)
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  useRegex?: boolean; // Hint for UI, logic should auto-detect usually
  excludeRecursion?: boolean;
  probability?: number;
}

export interface SillyTavernExport {
  entries: Record<string, WorldInfoEntry>;
}

// --- Tactical Map Types ---
export interface TacticalLocation {
  id: string;
  name: string;
  x: number;
  y: number;
  bgUrl?: string; // Optional background override
  description?: string;
}

export interface TacticalZone {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  locations: TacticalLocation[];
}
