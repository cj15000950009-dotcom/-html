import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS } from '../../constants';
import { FONT_FAMILY_SELECT_OPTIONS, dialogueFontOf, nameBoxFontOf, uiFontOf } from '../../fontSettings';
import { fantasyElegantExternalUrls } from '../../skins/fantasyElegantExternalUrls';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { useImageCheck } from '../../hooks/useImageCheck';
import { isTavernChatApiAvailable, tavernGetChatMessages, tavernGetLastMessageId } from '../../tavernRuntime';
import { Character, CharacterId, Choice, CustomFolder, DialogueBoxLayoutConfig, DialogueLine, ExternalApiConfig, GlobalSettings } from '../../types';
import { fetchAvailableModels, testApiConnection } from '../../services/geminiService';
import { cleanTextForDisplay } from '../../utils/messageParser';
import { getSpriteFolderKind } from '../../utils/spriteFolder';
import { ModalCloseX } from './ModalCloseX';

/** 与主界面 16:9 舞台一致，用于视觉校准预览内按比例缩放 */
const PREVIEW_STAGE_W = 1920;
const PREVIEW_STAGE_H = 1080;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 设置窗口是否用窄版外壳（含视口自动窄屏） */
  modalCompactLayout?: boolean;
  /** 当前是否为窄视口自动判定（仅用于说明） */
  viewportAutoMobile?: boolean;
  settings: GlobalSettings;
  onUpdateSettings: (s: GlobalSettings) => void;
  spriteConfig: { scale: number; x: number; y: number };
  onUpdateSpriteConfig: (c: { scale: number; x: number; y: number }) => void;
  dialogueBoxConfig: DialogueBoxLayoutConfig;
  onUpdateDialogueBoxConfig: (c: DialogueBoxLayoutConfig) => void;
  currentLineChoices?: Choice[];
  onUpdateCurrentLineChoices?: (choices: Choice[]) => void;
  previewBackgroundUrl?: string;
  previewCharacter?: Character;
  /** 用于预览「头像立绘」：根据预览角色匹配立绘库文件夹类型 */
  customLibrary?: CustomFolder[];
  /** 与主界面 runtime 角色表一致，用于 id/显示名 与立绘库文件夹的交叉命中 */
  spriteFolderKindCharacters?: Character[];
  previewCgUrl?: string;
  apiConfig?: ExternalApiConfig;
  onUpdateApiConfig?: (config: ExternalApiConfig) => void;
  chatHistory?: DialogueLine[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  modalCompactLayout,
  viewportAutoMobile = false,
  settings,
  onUpdateSettings,
  spriteConfig,
  onUpdateSpriteConfig,
  dialogueBoxConfig,
  onUpdateDialogueBoxConfig,
  currentLineChoices = [],
  onUpdateCurrentLineChoices,
  previewBackgroundUrl,
  previewCharacter,
  customLibrary = [],
  spriteFolderKindCharacters,
  previewCgUrl,
  apiConfig,
  onUpdateApiConfig,
  chatHistory = [],
}) => {
  const [activeTab, setActiveTab] = useState<'display' | 'text' | 'novel' | 'wheel' | 'ui' | 'cgSprite' | 'api'>('text');
  const [novelLinesFromTavern, setNovelLinesFromTavern] = useState<Array<{ speakerLabel: string; text: string }>>([]);
  const previewSpriteRef = useRef<HTMLDivElement | null>(null);
  const displayPreviewRef = useRef<HTMLDivElement | null>(null);
  const [stagePreviewScale, setStagePreviewScale] = useState(0.35);

  // --- API 连接设置 ---
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [apiModelsLoading, setApiModelsLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // 与剧情记录一致：优先从酒馆助手拉取聊天消息，用于小说预览/导出
  useEffect(() => {
    if (!isOpen || !isTavernChatApiAvailable()) {
      setNovelLinesFromTavern([]);
      return;
    }
    try {
      const lastId = tavernGetLastMessageId();
      if (lastId == null || lastId < 0) {
        setNovelLinesFromTavern([]);
        return;
      }
      const msgs = tavernGetChatMessages(`0-${lastId}`, { role: 'all' });
      const entries = (msgs || []).map(m => ({
        speakerLabel:
          m.role === 'user'
            ? '指挥官'
            : m.role === 'system'
              ? '系统'
              : m.name && m.name.trim()
                ? m.name.trim()
                : '助手',
        text: m.message || '',
      }));
      setNovelLinesFromTavern(entries);
    } catch {
      setNovelLinesFromTavern([]);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || activeTab !== 'display') return;
    const el = displayPreviewRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const cw = el.clientWidth || 640;
      const ch = el.clientHeight || 360;
      const s = Math.min(cw / PREVIEW_STAGE_W, ch / PREVIEW_STAGE_H);
      setStagePreviewScale(Math.max(0.08, s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, activeTab]);

  /** 视觉校准实时预览：水墨对话框 PNG 与主界面一致 */
  const inkPreviewFrameUrl = useMemo(() => {
    const v = settings.inkDialogueFrameStyle ?? 'day';
    if (v === 'noon') return inkJianghuExternalUrls.dialogueFrameNoon;
    if (v === 'night') return inkJianghuExternalUrls.dialogueFrameNight;
    if (v === 'deep-night') return inkJianghuExternalUrls.dialogueFrameDeepNight;
    return inkJianghuExternalUrls.dialogueFrame;
  }, [settings.inkDialogueFrameStyle]);

  // 外链图片可达性检查：失败时降级为纯色渐变
  const inkPreviewFrameOk = useImageCheck(inkPreviewFrameUrl);
  const inkBaseBgOk = useImageCheck(inkJianghuExternalUrls.baseBg);
  const inkTimeCardOk = useImageCheck(inkJianghuExternalUrls.timeCardBg);
  const inkLeftDecorOk = useImageCheck(inkJianghuExternalUrls.leftDecor);
  const fantasyFrameOk = useImageCheck(fantasyElegantExternalUrls.dialogueFrame);
  const inkPreviewFrameBg = inkPreviewFrameOk
    ? `url("${inkPreviewFrameUrl}")`
    : 'linear-gradient(135deg, #4a4540 0%, #3a3530 100%)';
  const inkBaseBgImage = inkBaseBgOk
    ? `url(${inkJianghuExternalUrls.baseBg})`
    : 'linear-gradient(135deg, #1a1815 0%, #0f0e0c 100%)';
  const inkTimeCardBg = inkTimeCardOk
    ? `url(${inkJianghuExternalUrls.timeCardBg})`
    : 'none';
  const inkLeftDecorBg = inkLeftDecorOk
    ? `url("${inkJianghuExternalUrls.leftDecor}")`
    : 'none';
  const fantasyFrameBg = fantasyFrameOk
    ? `url("${fantasyElegantExternalUrls.dialogueFrame}")`
    : 'linear-gradient(135deg, #f4ecd8 0%, #e8dcc0 100%)';

  // 小说预览/导出：只显示 maintext 角色名+正文（与剧情记录相同逻辑）
  const novelPreviewText = useMemo(() => {
    const lines =
      novelLinesFromTavern.length > 0
        ? novelLinesFromTavern
        : chatHistory.map(line => ({
            speakerLabel:
              line.speakerId === CharacterId.PLAYER
                ? '指挥官'
                : line.speakerId === CharacterId.SYSTEM
                  ? '系统'
                  : CHARACTERS[line.speakerId as keyof typeof CHARACTERS]?.name || String(line.speakerId),
            text: line.text || '',
          }));

    if (lines.length === 0) return '暂无历史记录可供预览...';

    let content = '《武侦连纪律锁》\n\n';
    lines.forEach((line, index) => {
      const text = cleanTextForDisplay(line.text);
      if (!text) return;
      if (settings.enableNovelMode) {
        content += `\n\n第 ${index + 1} 章\n------------------\n`;
      }
      if (line.speakerLabel && line.speakerLabel !== '旁白') {
        content += `${line.speakerLabel}：${text}\n`;
      } else {
        content += `${text}\n`;
      }
    });
    return content;
  }, [novelLinesFromTavern, chatHistory, settings.enableNovelMode]);

  /** 须在 isOpen 早退之前：与 Rules of Hooks 一致 */
  const previewCharIdForFolder = String(previewCharacter?.id ?? previewCharacter?.name ?? '').trim();
  const previewAvatarUrlTrimmed = (previewCharacter?.avatarUrl || '').trim();
  /**
   * 预览图可能来自 defaultPreviewCharacter 在库中遍历到的「任意文件夹」，与 preview 角色 id 不一致时，
   * 仅用角色 id 会得到 fullbody，导致头像立绘分支永远不渲染。优先按当前预览图 URL 反查所在文件夹类型。
   */
  const previewSpriteFolderKind = useMemo((): 'fullbody' | 'avatar' => {
    const fromChar = getSpriteFolderKind(
      previewCharIdForFolder || 'unknown',
      customLibrary,
      spriteFolderKindCharacters,
    );
    if (!previewAvatarUrlTrimmed || !customLibrary.length) return fromChar;
    const urlEq = (a: string, b: string) => (a || '').trim() === (b || '').trim();
    for (const f of customLibrary) {
      if (f.disabled || !f.sprites?.length) continue;
      if (!f.sprites.some(s => urlEq(s.imageUrl, previewAvatarUrlTrimmed))) continue;
      return (f.spriteFolderKind ?? 'fullbody') === 'avatar' ? 'avatar' : 'fullbody';
    }
    return fromChar;
  }, [previewCharIdForFolder, customLibrary, spriteFolderKindCharacters, previewAvatarUrlTrimmed]);

  const handleExportNovel = () => {
    const blob = new Blob([novelPreviewText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Novel_Export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- API 连接逻辑 ---
  const effectiveApiConfig: ExternalApiConfig = apiConfig ?? {
    provider: 'gemini',
    baseUrl: 'https://api.spw.cool/v1',
    apiKey: '',
    modelId: 'gemini-2.0-flash-exp',
    headers: '{}',
  };
  const updateApi = (patch: Partial<ExternalApiConfig>) => {
    if (onUpdateApiConfig) onUpdateApiConfig({ ...effectiveApiConfig, ...patch });
  };
  const handleTestApiConnection = async () => {
    setApiTesting(true);
    setApiTestResult(null);
    try {
      const result = await testApiConnection(effectiveApiConfig);
      setApiTestResult(result);
    } catch (e: any) {
      setApiTestResult({ success: false, message: e?.message || String(e) });
    } finally {
      setApiTesting(false);
    }
  };
  const handleFetchApiModels = async () => {
    setApiModelsLoading(true);
    try {
      const models = await fetchAvailableModels(effectiveApiConfig);
      setApiModels(models || []);
    } catch {
      setApiModels([]);
    } finally {
      setApiModelsLoading(false);
    }
  };

  if (!isOpen) return null;

  // --- THEME STYLES ---
  const themeStyles = {
    day: {
      bg: 'bg-slate-50 border-slate-300 text-slate-800',
      sidebar: 'bg-white border-slate-200',
      header: 'bg-slate-100 border-slate-200 text-slate-700',
      content: 'bg-slate-50/50',
      accent: 'text-emerald-600',
      itemActive: 'bg-slate-200 border-emerald-500 text-emerald-800',
      itemInactive: 'text-slate-500 hover:bg-slate-100',
      input: 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500',
      buttonPrimary: 'bg-emerald-600 text-white hover:bg-emerald-500',
      buttonSecondary: 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100',
      boxBg: 'bg-white/95 border-slate-300 shadow-xl',
    },
    'ink-jianghu': {
      bg: 'bg-zinc-950/95 border-zinc-600/50 text-zinc-100',
      sidebar: 'bg-zinc-950/90 border-zinc-600/40 text-zinc-100',
      header: 'bg-zinc-900/95 border-zinc-600/45 text-zinc-50',
      content: 'bg-zinc-950/88',
      accent: 'text-emerald-300',
      controlLabel: 'text-zinc-200 opacity-95',
      itemActive:
        'bg-emerald-900/35 border-emerald-400/70 text-emerald-50 font-bold shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2)]',
      itemInactive: 'text-zinc-300 hover:bg-white/10 hover:text-white border-zinc-600/40',
      input: 'bg-zinc-900/90 border-zinc-500/50 text-zinc-50 placeholder:text-zinc-500 focus:border-emerald-500/60',
      buttonPrimary: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-bold',
      buttonSecondary: 'bg-zinc-800/80 border-zinc-500/50 text-zinc-200 hover:bg-zinc-700/90 hover:text-white',
      boxBg: 'bg-zinc-900/85 border-zinc-500/30 shadow-2xl',
    },
    night: {
      bg: 'bg-[#1a1b1e] border-white/10 text-slate-200',
      sidebar: 'bg-[#141517] border-white/5',
      header: 'bg-[#141517] border-white/5 text-slate-400',
      content: 'bg-[#1a1b1e]',
      accent: 'text-white',
      itemActive: 'bg-[#25262b] border-white text-white',
      itemInactive: 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
      input: 'bg-[#25262b] border-white/10 text-white focus:border-white/30',
      buttonPrimary: 'bg-white text-black hover:bg-gray-200',
      buttonSecondary: 'bg-transparent border-white/20 text-slate-400 hover:text-white',
      boxBg: 'bg-slate-950/90 border-white/10 shadow-2xl',
    },
    military: {
      bg: 'bg-[#1a1c10] border-emerald-800 text-emerald-500',
      sidebar: 'bg-[#0a0f05] border-emerald-900',
      header: 'bg-[#12140b] border-emerald-900 text-emerald-600',
      content: 'bg-[#1a1c10]/80',
      accent: 'text-emerald-400',
      itemActive: 'bg-emerald-900/20 border-emerald-500 text-emerald-400',
      itemInactive: 'text-emerald-800 hover:bg-emerald-900/10 hover:text-emerald-600',
      input: 'bg-[#0a0f05] border-emerald-800 text-emerald-400 focus:border-emerald-500',
      buttonPrimary: 'bg-emerald-700 text-black hover:bg-emerald-600',
      buttonSecondary: 'bg-transparent border-emerald-800 text-emerald-700 hover:text-emerald-500',
      boxBg: 'bg-[#0a0f05]/95 border-emerald-800/50 shadow-2xl',
    },
    tech: {
      bg: 'bg-[#0B1120] border-cyan-500/30 text-cyan-400',
      sidebar: 'bg-[#0f172a]/80 border-cyan-500/20',
      header: 'bg-[#0f172a] border-cyan-500/20 text-cyan-500',
      content: 'bg-[#0B1120]/50',
      accent: 'text-cyan-300',
      itemActive: 'bg-cyan-900/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.1)]',
      itemInactive: 'text-cyan-800 hover:bg-cyan-900/10 hover:text-cyan-500',
      input: 'bg-[#0f172a] border-cyan-500/30 text-cyan-300 focus:border-cyan-400',
      buttonPrimary: 'bg-cyan-600 text-black hover:bg-cyan-500',
      buttonSecondary: 'bg-transparent border-cyan-800 text-cyan-700 hover:text-cyan-500',
      boxBg: 'bg-[#0B1120]/95 border-cyan-500/30 shadow-2xl',
    },
    'tech-white': {
      bg: 'bg-white border-slate-200 text-slate-700',
      sidebar: 'bg-slate-50 border-slate-100',
      header: 'bg-slate-50 border-slate-200 text-slate-500',
      content: 'bg-white',
      accent: 'text-blue-600',
      itemActive: 'bg-blue-50 border-blue-500 text-blue-700',
      itemInactive: 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
      input: 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500',
      buttonPrimary: 'bg-blue-600 text-white hover:bg-blue-500',
      buttonSecondary: 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
      boxBg: 'bg-white/90 border-blue-200 shadow-xl',
    },
    'fantasy-elegant': {
      bg: 'bg-[#faf6ee] border-amber-800/35 text-[#3d2e18]',
      sidebar: 'bg-[#f4ecd8] border-amber-800/25',
      header: 'bg-[#f0e6d4] border-amber-800/30 text-amber-900/85',
      content: 'bg-[#faf6ee]',
      accent: 'text-amber-800',
      itemActive: 'bg-amber-100/90 border-amber-600 text-amber-950',
      itemInactive: 'text-amber-900/45 hover:bg-amber-100/50 hover:text-amber-950',
      input: 'bg-[#fffdf8] border-amber-800/30 text-[#3d2e18] focus:border-amber-600',
      buttonPrimary: 'bg-amber-600 text-white hover:bg-amber-500',
      buttonSecondary: 'bg-[#fffef9] border-amber-800/25 text-amber-900 hover:bg-amber-50',
      boxBg: 'bg-[#fffdf8]/95 border-amber-800/30 shadow-xl',
    },
    'tech-blue': {
      bg: 'bg-[#020617] border-blue-500/30 text-blue-200',
      sidebar: 'bg-[#0f172a] border-blue-500/20',
      header: 'bg-[#0f172a] border-blue-500/20 text-blue-400',
      content: 'bg-[#020617]',
      accent: 'text-cyan-400',
      itemActive: 'bg-blue-900/20 border-cyan-400 text-cyan-300',
      itemInactive: 'text-blue-800 hover:bg-blue-900/10 hover:text-blue-400',
      input: 'bg-[#0f172a] border-blue-500/30 text-blue-200 focus:border-cyan-400',
      buttonPrimary: 'bg-cyan-600 text-black hover:bg-cyan-500',
      buttonSecondary: 'bg-transparent border-blue-800 text-blue-600 hover:text-blue-400',
      boxBg: 'bg-[#020617]/95 border-blue-500/30 shadow-2xl',
    },
    'black-gold': {
      bg: 'bg-[#050505] border-amber-900/40 text-amber-100/80',
      sidebar: 'bg-[#0a0a0a] border-amber-900/20',
      header: 'bg-[#0a0a0a] border-amber-900/20 text-amber-600',
      content: 'bg-[#050505]',
      accent: 'text-amber-400',
      itemActive: 'bg-amber-900/10 border-amber-500 text-amber-400',
      itemInactive: 'text-amber-900/60 hover:bg-amber-900/10 hover:text-amber-600',
      input: 'bg-[#0a0a0a] border-amber-900/30 text-amber-100 focus:border-amber-500',
      buttonPrimary: 'bg-amber-600 text-black hover:bg-amber-500',
      buttonSecondary: 'bg-transparent border-amber-900/50 text-amber-700 hover:text-amber-500',
      boxBg: 'bg-[#050505]/95 border-amber-900/40 shadow-2xl',
    },
  };
  const ts = themeStyles[settings.theme as keyof typeof themeStyles] || themeStyles['night'];

  const uiThemeFamily =
    settings.theme === 'ink-jianghu' ? 'ink' : settings.theme === 'fantasy-elegant' ? 'fantasy' : 'tech';
  const useFramedDialoguePreview = settings.theme === 'ink-jianghu' || settings.theme === 'fantasy-elegant';

  const isMobileLayout = modalCompactLayout ?? settings.matchMobileLayout ?? false;

  /** 科技都市侧可选系统配色（不含水墨江湖） */
  const realityThemeOptions: Array<{ value: GlobalSettings['theme']; label: string }> = [
    { value: 'military', label: '🟢 战术绿 (Military)' },
    { value: 'tech', label: '🔵 科技蓝 (Classic)' },
    { value: 'day', label: '⚪ 白日 (Day)' },
    { value: 'night', label: '⚫ 夜间 (Night)' },
    { value: 'tech-white', label: '⬜ 实验室 (Tech White)' },
    { value: 'tech-blue', label: '🟦 深海 (Tech Blue)' },
    { value: 'black-gold', label: '🔸 黑金 (Black Gold)' },
  ];

  const quickItems = settings.quickMenuCustomItems ?? [];
  const quickWheelModalOptions: Array<{ value: string; label: string }> = [
    { value: 'schedule', label: '事件表' },
    { value: 'dossier', label: '档案' },
    { value: 'assets', label: '图库' },
    { value: 'saveLoad', label: '存档/读取' },
    { value: 'variables', label: '变量监控' },
    { value: 'history', label: '对话历史' },
    { value: 'commands', label: '选项/指令面板' },
    { value: 'settings', label: '系统设置' },
  ];
  const inkBgStyle =
    settings.theme === 'ink-jianghu'
      ? {
          backgroundImage: inkBaseBgImage,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
        }
      : undefined;
  const inkTitleStyle =
    settings.theme === 'ink-jianghu' ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full ${isMobileLayout ? 'max-w-[min(96vw,960px)] h-[95vh]' : 'max-w-6xl h-[92vh]'} rounded-xl shadow-2xl overflow-hidden flex border clip-tactical-box ${ts.bg}`}
        onClick={e => e.stopPropagation()}
        style={inkBgStyle}
      >
        <ModalCloseX onClose={onClose} />

        {/* 侧边导航 */}
        <div className={`${isMobileLayout ? 'w-32' : 'w-48'} border-r flex flex-col shrink-0 ${ts.sidebar}`}>
          <div className={`p-6 border-b ${ts.header}`}>
            <h2 className={`font-black tracking-widest text-sm italic ${ts.accent}`} style={inkTitleStyle}>
              系统设置中心
            </h2>
          </div>
          <div className="flex-1 py-4">
            <SidebarItem
              label="阅读设定"
              active={activeTab === 'text'}
              onClick={() => setActiveTab('text')}
              styles={ts}
            />
            <SidebarItem
              label="视觉校准"
              active={activeTab === 'display'}
              onClick={() => setActiveTab('display')}
              styles={ts}
            />
            <SidebarItem
              label="CG&立绘"
              active={activeTab === 'cgSprite'}
              onClick={() => setActiveTab('cgSprite')}
              styles={ts}
            />
            <SidebarItem label="界面选项" active={activeTab === 'ui'} onClick={() => setActiveTab('ui')} styles={ts} />
            <SidebarItem
              label="快捷轮盘"
              active={activeTab === 'wheel'}
              onClick={() => setActiveTab('wheel')}
              styles={ts}
            />
            <SidebarItem
              label="小说导出"
              active={activeTab === 'novel'}
              onClick={() => setActiveTab('novel')}
              styles={ts}
            />
            <SidebarItem
              label="API 连接"
              active={activeTab === 'api'}
              onClick={() => setActiveTab('api')}
              styles={ts}
            />
          </div>
        </div>

        {/* 内容区 */}
        <div className={`flex-1 flex flex-col relative min-h-0 ${ts.content}`}>
          <div className={`h-14 border-b flex justify-between items-center px-8 shrink-0 ${ts.header}`}>
            <h3 className={`text-sm font-black tracking-widest uppercase opacity-80`} style={inkTitleStyle}>
              {activeTab === 'text' && '文本与阅读体验 (TEXT & READING)'}
              {activeTab === 'display' && '渲染与视觉校准 (RENDER & CALIBRATION)'}
              {activeTab === 'cgSprite' && 'CG 与立绘 (CG & SPRITES)'}
              {activeTab === 'ui' && '界面选项 (UI OPTIONS)'}
              {activeTab === 'wheel' && '右键快捷轮盘 (QUICK WHEEL)'}
              {activeTab === 'novel' && '小说化集成 (NOVEL INTEGRATION)'}
              {activeTab === 'api' && 'API 连接 (API CONNECTION)'}
            </h3>
          </div>

          <div
            className={`flex-1 min-h-0 flex flex-col custom-scrollbar ${
              activeTab === 'display' ? 'overflow-hidden' : 'overflow-y-auto'
            } ${activeTab === 'display' || activeTab === 'cgSprite' ? 'px-5 py-3' : 'p-8'}`}
          >
            {activeTab === 'text' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* ... (Existing Font & Theme controls) ... */}
                <div className="space-y-6">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / 字体与渲染 /
                  </label>
                  <p className="text-[10px] opacity-55 leading-relaxed max-w-3xl">
                    姓名框、对话框正文、整体界面三处字体各自独立选择；旧存档若仅有「对话框正文字体」字段，会沿用其中的 fontFamily 作为回退。
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <ControlGroup label="姓名框文字字体" styles={ts}>
                      <select
                        value={nameBoxFontOf(settings)}
                        onChange={e =>
                          onUpdateSettings({ ...settings, nameBoxFontFamily: e.target.value })
                        }
                        className={`w-full px-3 py-2 text-xs focus:outline-none border ${ts.input}`}
                      >
                        {FONT_FAMILY_SELECT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </ControlGroup>
                    <ControlGroup label={`对话框正文字号: ${settings.fontSize}px`} styles={ts}>
                      <input
                        type="range"
                        min="14"
                        max="30"
                        value={settings.fontSize}
                        onChange={e => onUpdateSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup label="对话框正文字体" styles={ts}>
                      <select
                        value={dialogueFontOf(settings)}
                        onChange={e =>
                          onUpdateSettings({ ...settings, dialogueFontFamily: e.target.value })
                        }
                        className={`w-full px-3 py-2 text-xs focus:outline-none border ${ts.input}`}
                      >
                        {FONT_FAMILY_SELECT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </ControlGroup>
                    <ControlGroup label="姓名框样式" styles={ts}>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.nameBoxBold ?? false}
                            onChange={e => onUpdateSettings({ ...settings, nameBoxBold: e.target.checked })}
                            className="w-4 h-4"
                          />
                          粗体
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.nameBoxItalic ?? false}
                            onChange={e => onUpdateSettings({ ...settings, nameBoxItalic: e.target.checked })}
                            className="w-4 h-4"
                          />
                          倾斜
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.nameBoxTextShadowEnabled !== false}
                            onChange={e =>
                              onUpdateSettings({ ...settings, nameBoxTextShadowEnabled: e.target.checked })
                            }
                            className="w-4 h-4"
                          />
                          阴影
                        </label>
                      </div>
                    </ControlGroup>
                    <div className="md:col-span-2">
                      <ControlGroup label="整体界面字体（侧栏、时间卡等）" styles={ts}>
                        <select
                          value={uiFontOf(settings)}
                          onChange={e => onUpdateSettings({ ...settings, uiFontFamily: e.target.value })}
                          className={`w-full px-3 py-2 text-xs focus:outline-none border ${ts.input}`}
                        >
                          {FONT_FAMILY_SELECT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[9px] opacity-50 mt-1 leading-snug">
                          水墨主题侧栏标题在未设置「整体界面字体」时仍默认使用汉仪手书体。
                        </p>
                      </ControlGroup>
                    </div>
                  </div>
                </div>

                {/* COLOR SETTINGS */}
                <div className="space-y-6">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / 文本颜色 (TEXT COLORS) /
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <ControlGroup label="普通对话 (Dialogue)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.colors.dialogue}
                          onChange={e =>
                            onUpdateSettings({ ...settings, colors: { ...settings.colors, dialogue: e.target.value } })
                          }
                          className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono opacity-60">{settings.colors.dialogue}</span>
                      </div>
                    </ControlGroup>
                    <ControlGroup label="旁白/系统 (Narrator)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.colors.narrator}
                          onChange={e =>
                            onUpdateSettings({ ...settings, colors: { ...settings.colors, narrator: e.target.value } })
                          }
                          className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono opacity-60">{settings.colors.narrator}</span>
                      </div>
                    </ControlGroup>
                    <ControlGroup label="心理活动 (Thought)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.colors.thought}
                          onChange={e =>
                            onUpdateSettings({ ...settings, colors: { ...settings.colors, thought: e.target.value } })
                          }
                          className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono opacity-60">{settings.colors.thought}</span>
                      </div>
                    </ControlGroup>
                    <ControlGroup label="系统面板 (Xitong)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.colors.system ?? settings.colors.dialogue}
                          onChange={e =>
                            onUpdateSettings({ ...settings, colors: { ...settings.colors, system: e.target.value } })
                          }
                          className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono opacity-60">
                          {settings.colors.system ?? settings.colors.dialogue}
                        </span>
                      </div>
                    </ControlGroup>
                    <ControlGroup label="引号对白高亮 (Speech)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.colors.speech ?? '#f97316'}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              colors: { ...settings.colors, speech: e.target.value },
                            })
                          }
                          className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono opacity-60">{settings.colors.speech ?? '#f97316'}</span>
                      </div>
                    </ControlGroup>
                  </div>
                </div>

                <div className="space-y-6">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / 对话与自动播放 /
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ControlGroup label={`打字间隔 (ms，越小越快): ${settings.typingSpeed}`} styles={ts}>
                      <input
                        type="range"
                        min={5}
                        max={80}
                        step={1}
                        value={settings.typingSpeed}
                        onChange={e => onUpdateSettings({ ...settings, typingSpeed: parseInt(e.target.value, 10) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup label={`自动翻页：字出完后等待 (秒): ${settings.autoInterval}`} styles={ts}>
                      <input
                        type="range"
                        min={0.5}
                        max={15}
                        step={0.5}
                        value={settings.autoInterval}
                        onChange={e => onUpdateSettings({ ...settings, autoInterval: parseFloat(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup
                      label={`自动模式下每页最短停留 (秒): ${settings.minPageDisplaySeconds ?? 4}`}
                      styles={ts}
                    >
                      <input
                        type="range"
                        min={2}
                        max={20}
                        step={0.5}
                        value={settings.minPageDisplaySeconds ?? 4}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            minPageDisplaySeconds: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                      <p className="text-[10px] opacity-60 mt-1">
                        从进入该分页起算（含打字时间）。管道格式常「一人一句一页」，可避免立绘只出现一两秒就翻走。
                      </p>
                    </ControlGroup>
                    <ControlGroup
                      label={`对话文字阴影: ${(settings.dialogueTextShadowEnabled ?? true) ? '开启' : '关闭'} / 强度 ${settings.dialogueTextShadowSize ?? 2}px`}
                      styles={ts}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({
                              ...settings,
                              dialogueTextShadowEnabled: !(settings.dialogueTextShadowEnabled ?? true),
                            })
                          }
                          className={`px-3 py-2 border text-xs font-bold rounded ${(settings.dialogueTextShadowEnabled ?? true) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.dialogueTextShadowEnabled ?? true) ? '开启' : '关闭'}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={12}
                          step={1}
                          disabled={!(settings.dialogueTextShadowEnabled ?? true)}
                          value={settings.dialogueTextShadowSize ?? 2}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              dialogueTextShadowSize: parseInt(e.target.value, 10),
                            })
                          }
                          className="flex-1 h-1 opacity-50 hover:opacity-100 disabled:opacity-30"
                        />
                      </div>
                      <p className="text-[10px] opacity-60 mt-1">关闭后对话文字不再叠加阴影；可用滑杆调节阴影大小。</p>
                    </ControlGroup>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / UI 主题 (THEME) /
                  </label>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            worldMode: 'reality',
                            theme:
                              settings.theme === 'ink-jianghu'
                                ? 'day'
                                : settings.theme === 'fantasy-elegant'
                                  ? 'tech-white'
                                  : settings.theme,
                          })
                        }
                        className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${
                          uiThemeFamily === 'tech' ? ts.itemActive : ts.itemInactive
                        }`}
                      >
                        科技都市
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            worldMode: 'fantasy',
                            theme: 'ink-jianghu',
                          })
                        }
                        className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${
                          uiThemeFamily === 'ink' ? ts.itemActive : ts.itemInactive
                        }`}
                      >
                        水墨江湖
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            worldMode: 'reality',
                            theme: 'fantasy-elegant',
                          })
                        }
                        className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${
                          uiThemeFamily === 'fantasy' ? ts.itemActive : ts.itemInactive
                        }`}
                      >
                        奇幻典雅
                      </button>
                    </div>

                    {uiThemeFamily === 'tech' && (
                      <div className="space-y-3 rounded border border-current/10 p-3">
                        <div className="space-y-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-tighter opacity-80`}>系统配色</span>
                          <select
                            value={settings.theme}
                            onChange={e => {
                              const nextTheme = e.target.value as GlobalSettings['theme'];
                              onUpdateSettings({
                                ...settings,
                                theme: nextTheme,
                                worldMode: nextTheme === 'black-gold' ? 'fantasy' : 'reality',
                              });
                            }}
                            className={`w-full px-3 py-2 text-xs focus:outline-none border rounded ${ts.input}`}
                          >
                            {realityThemeOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-[9px] opacity-55 leading-snug">
                            科技都市系列配色；水墨江湖与奇幻典雅请在上方切换。
                          </p>
                        </div>
                        <div className="space-y-2 pt-1 border-t border-current/10">
                          <span className={`text-[10px] font-bold uppercase tracking-tighter opacity-80`}>
                            对话框皮肤
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => onUpdateSettings({ ...settings, dialogueSkin: 'default' })}
                              className={`flex-1 py-2 border text-xs font-bold rounded ${settings.dialogueSkin === 'default' ? ts.itemActive : ts.itemInactive}`}
                            >
                              默认
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateSettings({ ...settings, dialogueSkin: 'glass' })}
                              className={`flex-1 py-2 border text-xs font-bold rounded ${settings.dialogueSkin === 'glass' ? ts.itemActive : ts.itemInactive}`}
                            >
                              磨砂玻璃
                            </button>
                          </div>
                          <p className="text-[9px] opacity-55 leading-snug">
                            战术条或磨砂玻璃风格（奇幻典雅为独立 PNG 框，不受此项影响）。
                          </p>
                        </div>
                      </div>
                    )}

                    {uiThemeFamily === 'ink' && (
                      <div className="space-y-3 rounded border border-current/10 p-3">
                        <span className={`text-[10px] font-bold uppercase tracking-tighter opacity-80`}>
                          水墨对话框底图
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(
                            [
                              { v: 'day' as const, lab: '白日' },
                              { v: 'noon' as const, lab: '中午' },
                              { v: 'night' as const, lab: '夜晚' },
                              { v: 'deep-night' as const, lab: '深夜' },
                            ] as const
                          ).map(({ v, lab }) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() =>
                                onUpdateSettings({
                                  ...settings,
                                  inkDialogueFrameStyle: v,
                                })
                              }
                              className={`py-2 border text-[11px] font-bold rounded ${
                                (settings.inkDialogueFrameStyle ?? 'day') === v ? ts.itemActive : ts.itemInactive
                              }`}
                            >
                              {lab}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] opacity-55 leading-snug">
                          切换水墨框时段；与科技都市的「默认 / 磨砂玻璃」彼此独立。
                        </p>
                      </div>
                    )}

                    {uiThemeFamily === 'fantasy' && (
                      <div className="rounded border border-current/10 p-3 space-y-1">
                        <p className="text-[11px] font-bold leading-snug">奇幻典雅</p>
                        <p className="text-[9px] opacity-70 leading-relaxed">
                          以实验室白日布局为基底，宣纸黄与金色强调；对话框为奇幻 PNG
                          框。立绘仅在当前对白有具体说话人时显示（与竖排姓名一致）。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 gap-0">
                <div
                  ref={displayPreviewRef}
                  className={`relative w-full shrink-0 min-h-[220px] h-[min(44vh,460px)] max-h-[500px] bg-zinc-950 border overflow-hidden flex items-center justify-center clip-tactical-box ${ts.header}`}
                >
                  <div
                    className="relative shrink-0 overflow-hidden rounded-sm"
                    style={{
                      width: PREVIEW_STAGE_W * stagePreviewScale,
                      height: PREVIEW_STAGE_H * stagePreviewScale,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 origin-top-left"
                      style={{
                        width: PREVIEW_STAGE_W,
                        height: PREVIEW_STAGE_H,
                        transform: `scale(${stagePreviewScale})`,
                      }}
                    >
                      {previewBackgroundUrl && !previewCgUrl && (
                        <img
                          src={previewBackgroundUrl}
                          className="absolute inset-0 w-full h-full object-cover opacity-100 pointer-events-none"
                          alt=""
                        />
                      )}
                      {previewCgUrl && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                          <img
                            src={previewCgUrl}
                            className={`transition-all duration-300 ${settings.cgFitMode === 'cover' ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'}`}
                            style={{
                              transform: `translate(${settings.cgOffsetX ?? 0}px, ${settings.cgOffsetY ?? 0}px)`,
                              objectPosition:
                                settings.cgFitMode === 'cover'
                                  ? { top: 'center top', center: 'center center', bottom: 'center bottom' }[
                                      settings.cgCoverAnchor ?? 'top'
                                    ]
                                  : undefined,
                            }}
                            alt=""
                          />
                        </div>
                      )}
                      {!previewCgUrl && previewCharacter?.avatarUrl && previewSpriteFolderKind !== 'avatar' && (
                        <div
                          ref={previewSpriteRef}
                          className="absolute inset-0 z-[8] flex items-center justify-center pointer-events-none"
                        >
                          <div
                            className="h-[80%] flex items-end justify-center"
                            style={{
                              animation:
                                settings.breathingEnabled !== false
                                  ? `settings-preview-breathe ${settings.breathingDuration ?? 2.5}s ease-in-out infinite`
                                  : 'none',
                              transform: `translate(${spriteConfig.x}px, ${spriteConfig.y}px) scale(${spriteConfig.scale})`,
                            }}
                          >
                            <style>{`
                                            @keyframes settings-preview-breathe {
                                              0%, 100% { transform: translate(${spriteConfig.x}px, ${spriteConfig.y}px) scale(${spriteConfig.scale}); }
                                              50% { transform: translate(${spriteConfig.x}px, ${spriteConfig.y}px) scale(${spriteConfig.scale * (settings.breathingScale ?? 1.015)}); }
                                            }
                                          `}</style>
                            <img
                              src={previewCharacter.avatarUrl}
                              className="h-full w-auto object-contain object-bottom drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-all duration-300"
                              alt=""
                            />
                          </div>
                        </div>
                      )}

                      {settings.showTimeCard !== false ? (
                        <div
                          className="absolute z-[15] rounded-[18px] overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.28)] pointer-events-none flex flex-col justify-between p-2 min-w-[200px] max-w-[288px] w-[260px] min-h-[100px] border border-black/25"
                          style={{
                            top: settings.timeCardOffsetY ?? 32,
                            left: settings.timeCardOffsetX ?? 32,
                            transform: `scale(${settings.timeCardScale ?? 1})`,
                            transformOrigin: 'top left',
                            ...(settings.theme === 'ink-jianghu'
                              ? {
                                  backgroundImage: inkTimeCardBg,
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'center',
                                  backgroundSize: '100% 100%',
                                  color: '#0a0a0a',
                                }
                              : settings.theme === 'fantasy-elegant'
                                ? {
                                    background: 'rgba(255,253,248,0.96)',
                                    color: '#422006',
                                    borderColor: 'rgba(146,64,14,0.35)',
                                  }
                                : settings.theme === 'black-gold'
                                  ? {
                                      background: 'rgba(5,5,5,0.94)',
                                      color: '#fde68a',
                                      borderColor: 'rgba(245,158,11,0.35)',
                                    }
                                  : {
                                      background: 'rgba(255,255,255,0.12)',
                                      backdropFilter: 'blur(12px)',
                                      color: '#fff',
                                      borderColor: 'rgba(255,255,255,0.22)',
                                    }),
                          }}
                        >
                          <div className="flex justify-between gap-1 items-start">
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wide opacity-80 truncate">
                                当前场景
                              </div>
                              <div className="text-[36px] font-black leading-none mt-1 tracking-tight">08:30</div>
                            </div>
                            <div className="text-[12px] font-bold opacity-90 shrink-0 leading-tight text-right">
                              04-11
                              <div className="text-[10px] font-medium opacity-75">周六</div>
                            </div>
                          </div>
                          <div
                            className={`text-[8px] font-bold mt-1 pt-1 border-t flex justify-between gap-1 ${settings.theme === 'ink-jianghu' ? 'border-black/22' : settings.theme === 'fantasy-elegant' ? 'border-amber-900/18' : 'border-white/14'}`}
                          >
                            <span>同步地点</span>
                            <span>VISUAL</span>
                            <span>收起</span>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute top-4 left-4 z-[15] text-[11px] opacity-80 px-2 py-1 rounded border border-dashed border-white/35 bg-black/55 text-zinc-100 pointer-events-none">
                          时间卡已关闭
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 w-full z-[20] flex flex-col items-center pb-2 pointer-events-none">
                        <div
                          className="relative mb-2 flex justify-center pointer-events-none"
                          style={
                            useFramedDialoguePreview
                              ? {
                                  width: '100%',
                                  maxWidth: 'none',
                                  marginLeft: 0,
                                  marginBottom: '6px',
                                  paddingLeft: '12px',
                                  paddingRight: '12px',
                                  transform: `translate(${dialogueBoxConfig.offsetX ?? 0}px, ${-(dialogueBoxConfig.offsetY ?? 0)}px) scale(${settings.inkDialogueScale ?? 1})`,
                                  transformOrigin: 'center bottom',
                                }
                              : {
                                  width: `${dialogueBoxConfig.width}%`,
                                  maxWidth: '1100px',
                                  transform: `translate(${dialogueBoxConfig.offsetX ?? 0}px, ${-(dialogueBoxConfig.offsetY ?? 0)}px)`,
                                }
                          }
                        >
                          {useFramedDialoguePreview ? (
                            <div
                              className={`relative w-full border-0 overflow-visible ${settings.theme === 'fantasy-elegant' ? 'fantasy-elegant-dialogue-border' : 'ink-jianghu-dialogue-border'}`}
                              style={{ minHeight: 260, opacity: 1 }}
                            >
                              <div
                                aria-hidden
                                className="absolute left-1/2 -translate-x-1/2 bottom-0 z-[11] pointer-events-none"
                                style={{
                                  width: 'min(86%, 980px)',
                                  height: 236,
                                  backgroundImage:
                                    settings.theme === 'fantasy-elegant'
                                      ? fantasyFrameBg
                                      : inkPreviewFrameBg,
                                  backgroundSize: '100% 100%',
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'center',
                                }}
                              />
                              {settings.theme === 'ink-jianghu' && (
                                <div
                                  aria-hidden
                                  className="absolute z-[14] pointer-events-none"
                                  style={{
                                    left: 'calc(50% - min(43%, 490px) - 87px)',
                                    top: 68,
                                    width: 198,
                                    height: 198,
                                    transform: 'translateY(-50%)',
                                    backgroundImage: inkLeftDecorBg,
                                    backgroundSize: 'contain',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'center',
                                  }}
                                />
                              )}
                              <div
                                className="absolute z-[12] left-1/2 -translate-x-1/2 top-0 box-border overflow-hidden pointer-events-none ink-jianghu-dialogue-prose"
                                style={{
                                  width: 'min(86%, 980px)',
                                  height: 236,
                                  padding:
                                    settings.theme === 'fantasy-elegant'
                                      ? '50px 88px 44px 88px'
                                      : '50px 88px 44px 122px',
                                }}
                              >
                                <div className="h-full overflow-hidden text-sm font-bold leading-relaxed">
                                  <div
                                    style={{
                                      color: settings.colors.dialogue,
                                      fontSize: `${Math.max(14, Math.min(22, settings.fontSize ?? 18))}px`,
                                      fontFamily: dialogueFontOf(settings),
                                      textShadow:
                                        (settings.dialogueTextShadowEnabled ?? true)
                                          ? `0 0 ${settings.dialogueTextShadowSize ?? 2}px rgba(0,0,0,0.95), 0 1px ${Math.max(1, Math.round((settings.dialogueTextShadowSize ?? 2) / 2))}px rgba(0,0,0,0.85)`
                                          : 'none',
                                    }}
                                  >
                                    [ 战术系统校准中: 文本渲染测试 / CALIBRATING... ]
                                    <br />
                                    <span style={{ color: settings.colors.narrator }}>
                                      旁白颜色测试 // Narrator Color Check
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`w-full border-2 clip-tactical-box shadow-2xl p-3 flex flex-col justify-start overflow-hidden ${
                                settings.dialogueSkin === 'glass'
                                  ? 'bg-white/10 backdrop-blur-xl border-white/20'
                                  : ts.boxBg
                              }`}
                              style={{
                                height: `${dialogueBoxConfig.height}px`,
                                opacity: settings.boxOpacity,
                              }}
                            >
                              <div
                                className={`w-20 h-4 mb-2 clip-nameplate shrink-0 ${
                                  settings.theme === 'military'
                                    ? 'bg-emerald-600'
                                    : settings.theme === 'tech'
                                      ? 'bg-cyan-600'
                                      : settings.theme === 'day'
                                        ? 'bg-emerald-600'
                                        : settings.theme === 'fantasy-elegant'
                                          ? 'bg-amber-600'
                                          : 'bg-slate-600'
                                }`}
                              />
                              <div
                                className="text-sm font-bold leading-relaxed"
                                style={{
                                  color: settings.colors.dialogue,
                                  fontSize: `${Math.max(14, Math.min(22, settings.fontSize ?? 18))}px`,
                                  fontFamily: dialogueFontOf(settings),
                                  textShadow:
                                    (settings.dialogueTextShadowEnabled ?? true)
                                      ? `0 0 ${settings.dialogueTextShadowSize ?? 2}px rgba(0,0,0,0.95), 0 1px ${Math.max(1, Math.round((settings.dialogueTextShadowSize ?? 2) / 2))}px rgba(0,0,0,0.85)`
                                      : 'none',
                                }}
                              >
                                [ 战术系统校准中: 文本渲染测试 / CALIBRATING... ]
                                <br />
                                <span style={{ color: settings.colors.narrator }}>
                                  旁白颜色测试 // Narrator Color Check
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {!previewCgUrl && previewCharacter?.avatarUrl && previewSpriteFolderKind === 'avatar' && (
                        <div className="absolute inset-0 pointer-events-none z-[50]">
                          <div
                            className="absolute flex items-end justify-start"
                            style={{
                              left: `${40 + (settings.avatarPortraitOffsetX ?? 0)}px`,
                              bottom: `${88 + (settings.avatarPortraitOffsetY ?? 0)}px`,
                              height: '30%',
                              maxHeight: 360,
                              transform: `translate(${settings.avatarPortraitNudgeX ?? 0}px, ${settings.avatarPortraitNudgeY ?? 0}px) scale(${(settings.avatarPortraitScale ?? 1) * 0.92})`,
                              transformOrigin: 'left bottom',
                            }}
                          >
                            <img
                              src={previewCharacter.avatarUrl}
                              className="h-full w-auto max-w-[min(480px,42%)] object-contain object-bottom drop-shadow-[0_10px_28px_rgba(0,0,0,0.78)]"
                              alt=""
                            />
                          </div>
                          <div className="absolute top-2 right-2 z-[60] max-w-[min(92%,280px)] rounded bg-black/55 px-2 py-1 text-[10px] font-bold leading-snug text-amber-100/95 border border-amber-500/40">
                            预览：该角色立绘库为「头像立绘」，主图在左下角；下方滑条可微调位置。
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pt-3">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                  <div className="space-y-2 rounded border border-current/10 p-3">
                    <label className={`text-[10px] font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                      / 全身立绘（舞台三槽） /
                    </label>
                    <p className={`text-[10px] leading-snug opacity-60 ${ts.itemInactive}`}>
                      下列三项仅作用于舞台全身层，不影响左下角「头像立绘」。
                    </p>
                    <ControlGroup tight label={`垂直缩放: ${spriteConfig.scale.toFixed(2)}x`} styles={ts}>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={spriteConfig.scale}
                        onChange={e => onUpdateSpriteConfig({ ...spriteConfig, scale: parseFloat(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`水平位移 (X): ${spriteConfig.x}px`} styles={ts}>
                      <input
                        type="range"
                        min="-500"
                        max="500"
                        value={spriteConfig.x}
                        onChange={e => onUpdateSpriteConfig({ ...spriteConfig, x: parseInt(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`垂直位移 (Y): ${spriteConfig.y}px`} styles={ts}>
                      <input
                        type="range"
                        min="-400"
                        max="400"
                        value={spriteConfig.y}
                        onChange={e => onUpdateSpriteConfig({ ...spriteConfig, y: parseInt(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label="立绘呼吸动画" styles={ts}>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.breathingEnabled !== false}
                          onChange={e => onUpdateSettings({ ...settings, breathingEnabled: e.target.checked })}
                          className="rounded border-gray-500"
                        />
                        <span className="text-[11px]">开启呼吸动画</span>
                      </label>
                    </ControlGroup>
                    {settings.breathingEnabled !== false && (
                      <>
                        <ControlGroup
                          tight
                          label={`呼吸幅度: ${((settings.breathingScale ?? 1.015) * 100 - 100).toFixed(1)}%`}
                          styles={ts}
                        >
                          <input
                            type="range"
                            min="1"
                            max="1.04"
                            step="0.005"
                            value={settings.breathingScale ?? 1.015}
                            onChange={e =>
                              onUpdateSettings({ ...settings, breathingScale: parseFloat(e.target.value) })
                            }
                            className="w-full h-1 opacity-50 hover:opacity-100"
                          />
                        </ControlGroup>
                        <ControlGroup
                          tight
                          label={`呼吸周期: ${(settings.breathingDuration ?? 2.5).toFixed(1)} 秒`}
                          styles={ts}
                        >
                          <input
                            type="range"
                            min="1.5"
                            max="4"
                            step="0.1"
                            value={settings.breathingDuration ?? 2.5}
                            onChange={e =>
                              onUpdateSettings({ ...settings, breathingDuration: parseFloat(e.target.value) })
                            }
                            className="w-full h-1 opacity-50 hover:opacity-100"
                          />
                        </ControlGroup>
                      </>
                    )}
                    <p className="text-[9px] opacity-50 leading-snug pt-1">
                      立绘入场/退场、CG 显示与关闭方式等已移至侧边栏「{'CG&立绘'}」。
                    </p>
                  </div>
                  <div className="space-y-2 rounded border border-current/10 p-3">
                    <label className={`text-[10px] font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                      / 对话框 /
                    </label>
                    {useFramedDialoguePreview ? (
                      <ControlGroup
                        tight
                        label={`对话框大小: ${Math.round((settings.inkDialogueScale ?? 1) * 100)}%`}
                        styles={ts}
                      >
                        <input
                          type="range"
                          min={0.65}
                          max={1.35}
                          step={0.01}
                          value={settings.inkDialogueScale ?? 1}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              inkDialogueScale: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                        <p className="text-[9px] opacity-55 mt-1 leading-snug">
                          水墨 / 奇幻典雅为 PNG 框体，用整体缩放代替单独改宽/高。
                        </p>
                      </ControlGroup>
                    ) : (
                      <>
                        <ControlGroup tight label={`宽度: ${dialogueBoxConfig.width}%`} styles={ts}>
                          <input
                            type="range"
                            min="50"
                            max="100"
                            value={dialogueBoxConfig.width}
                            onChange={e =>
                              onUpdateDialogueBoxConfig({ ...dialogueBoxConfig, width: parseInt(e.target.value) })
                            }
                            className="w-full h-1 opacity-50 hover:opacity-100"
                          />
                        </ControlGroup>
                        <ControlGroup tight label={`高度: ${dialogueBoxConfig.height}px`} styles={ts}>
                          <input
                            type="range"
                            min="200"
                            max="450"
                            step="10"
                            value={dialogueBoxConfig.height}
                            onChange={e =>
                              onUpdateDialogueBoxConfig({ ...dialogueBoxConfig, height: parseInt(e.target.value) })
                            }
                            className="w-full h-1 opacity-50 hover:opacity-100"
                          />
                        </ControlGroup>
                      </>
                    )}
                    <ControlGroup tight label={`水平位移 (px): ${dialogueBoxConfig.offsetX ?? 0}`} styles={ts}>
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        value={dialogueBoxConfig.offsetX ?? 0}
                        onChange={e =>
                          onUpdateDialogueBoxConfig({
                            ...dialogueBoxConfig,
                            offsetX: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup
                      tight
                      label={`垂直位移 (px，正值上移): ${dialogueBoxConfig.offsetY ?? 0}`}
                      styles={ts}
                    >
                      <input
                        type="range"
                        min={-80}
                        max={120}
                        value={dialogueBoxConfig.offsetY ?? 0}
                        onChange={e =>
                          onUpdateDialogueBoxConfig({
                            ...dialogueBoxConfig,
                            offsetY: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    {!useFramedDialoguePreview && (
                      <ControlGroup tight label={`背景透明度: ${Math.round(settings.boxOpacity * 100)}%`} styles={ts}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.boxOpacity}
                          onChange={e => onUpdateSettings({ ...settings, boxOpacity: parseFloat(e.target.value) })}
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                    )}
                    <ControlGroup tight label={`通知显示时长: ${settings.notificationDuration ?? 2} 秒`} styles={ts}>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={settings.notificationDuration ?? 2}
                        onChange={e =>
                          onUpdateSettings({ ...settings, notificationDuration: parseInt(e.target.value, 10) })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDialogueBoxConfig({ width: 90, height: 320, offsetX: 0, offsetY: 0 });
                        onUpdateSettings({
                          ...settings,
                          boxOpacity: 0.85,
                          ...(useFramedDialoguePreview
                            ? {
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
                                framedNameAreaWidthPx: undefined,
                                framedNameWritingMode: 'vertical',
                              }
                            : {}),
                        });
                      }}
                      className={`w-full py-1.5 border text-[10px] font-bold ${ts.buttonSecondary}`}
                    >
                      {useFramedDialoguePreview ? '对话框恢复默认' : '对话框与透明度恢复默认'}
                    </button>
                  </div>
                  <div className="space-y-2 rounded border border-current/10 p-3">
                    <label className={`text-[10px] font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                      / 头像立绘（左下角，叠在对话框上） /
                    </label>
                    <p className="text-[9px] opacity-55 leading-snug">
                      在「图库 → 立绘」将文件夹设为「头像立绘」后走此层；场上始终只显示一个头像（当前说话人优先）。锚点偏移与内层微调、缩放均与左侧「全身立绘」设置独立。
                    </p>
                    <ControlGroup tight label={`水平偏移: ${settings.avatarPortraitOffsetX ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-120}
                        max={160}
                        value={settings.avatarPortraitOffsetX ?? 0}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            avatarPortraitOffsetX: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`垂直偏移: ${settings.avatarPortraitOffsetY ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-80}
                        max={120}
                        value={settings.avatarPortraitOffsetY ?? 0}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            avatarPortraitOffsetY: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`额外缩放: ${(settings.avatarPortraitScale ?? 1).toFixed(2)}×`} styles={ts}>
                      <input
                        type="range"
                        min={0.45}
                        max={1.6}
                        step={0.02}
                        value={settings.avatarPortraitScale ?? 1}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            avatarPortraitScale: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`内层微调 X: ${settings.avatarPortraitNudgeX ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        value={settings.avatarPortraitNudgeX ?? 0}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            avatarPortraitNudgeX: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`内层微调 Y: ${settings.avatarPortraitNudgeY ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        value={settings.avatarPortraitNudgeY ?? 0}
                        onChange={e =>
                          onUpdateSettings({
                            ...settings,
                            avatarPortraitNudgeY: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                  </div>
                  {useFramedDialoguePreview && (
                    <div className="space-y-2 rounded border border-current/10 p-3">
                      <label className={`text-[10px] font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                        / PNG 框：正文与姓名 /
                      </label>
                      <p className={`text-[10px] leading-snug opacity-60 ${ts.itemInactive}`}>
                        仅调节「水墨江湖 / 奇幻典雅」主题里 PNG 对话框内正文区域的留白，避免字贴住框边；与立绘、管道解析、退场动画无关。
                      </p>
                      <ControlGroup tight label={`正文上内边距: ${settings.framedDialoguePaddingTop ?? 50}px`} styles={ts}>
                        <input
                          type="range"
                          min={24}
                          max={90}
                          value={settings.framedDialoguePaddingTop ?? 50}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedDialoguePaddingTop: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`正文右: ${settings.framedDialoguePaddingRight ?? 88}px`} styles={ts}>
                        <input
                          type="range"
                          min={40}
                          max={140}
                          value={settings.framedDialoguePaddingRight ?? 88}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedDialoguePaddingRight: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`正文下: ${settings.framedDialoguePaddingBottom ?? 44}px`} styles={ts}>
                        <input
                          type="range"
                          min={20}
                          max={80}
                          value={settings.framedDialoguePaddingBottom ?? 44}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedDialoguePaddingBottom: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`正文左: ${settings.framedDialoguePaddingLeft ?? 122}px`} styles={ts}>
                        <input
                          type="range"
                          min={60}
                          max={180}
                          value={settings.framedDialoguePaddingLeft ?? 122}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedDialoguePaddingLeft: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`姓名区左微调: ${settings.framedNameOffsetLeftPx ?? 0}px`} styles={ts}>
                        <input
                          type="range"
                          min={-40}
                          max={80}
                          value={settings.framedNameOffsetLeftPx ?? 0}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedNameOffsetLeftPx: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`姓名区上微调: ${settings.framedNameOffsetTopPx ?? 0}px`} styles={ts}>
                        <input
                          type="range"
                          min={-20}
                          max={60}
                          value={settings.framedNameOffsetTopPx ?? 0}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedNameOffsetTopPx: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label={`姓名区高度: ${settings.framedNameAreaHeightPx ?? 170}px`} styles={ts}>
                        <input
                          type="range"
                          min={100}
                          max={220}
                          value={settings.framedNameAreaHeightPx ?? 170}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedNameAreaHeightPx: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup
                        tight
                        label={`姓名区宽度（0=自动）: ${settings.framedNameAreaWidthPx ?? 0}px`}
                        styles={ts}
                      >
                        <input
                          type="range"
                          min={0}
                          max={160}
                          value={settings.framedNameAreaWidthPx ?? 0}
                          onChange={e =>
                            onUpdateSettings({
                              ...settings,
                              framedNameAreaWidthPx: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-1 opacity-50 hover:opacity-100"
                        />
                      </ControlGroup>
                      <ControlGroup tight label="姓名排版" styles={ts}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`flex-1 py-1.5 border text-[10px] font-bold ${
                              (settings.framedNameWritingMode ?? 'vertical') === 'vertical'
                                ? ts.itemActive
                                : ts.itemInactive
                            }`}
                            onClick={() =>
                              onUpdateSettings({ ...settings, framedNameWritingMode: 'vertical' })
                            }
                          >
                            竖排
                          </button>
                          <button
                            type="button"
                            className={`flex-1 py-1.5 border text-[10px] font-bold ${
                              settings.framedNameWritingMode === 'horizontal' ? ts.itemActive : ts.itemInactive
                            }`}
                            onClick={() =>
                              onUpdateSettings({ ...settings, framedNameWritingMode: 'horizontal' })
                            }
                          >
                            横排
                          </button>
                        </div>
                      </ControlGroup>
                    </div>
                  )}
                  <div className="space-y-2 rounded border border-current/10 p-3">
                    <label className={`text-[10px] font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                      / 时间卡 /
                    </label>
                    <ControlGroup tight label="显示与布局" styles={ts}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ ...settings, showTimeCard: !(settings.showTimeCard ?? true) })
                          }
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${(settings.showTimeCard ?? true) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.showTimeCard ?? true) ? '显示' : '隐藏'}
                        </button>
                      </div>
                      <p className="text-[9px] opacity-60 mt-0.5 leading-snug">
                        关闭后主界面左上角时间卡与 VISUAL 区域隐藏。
                      </p>
                    </ControlGroup>
                    <ControlGroup tight label={`左距: ${settings.timeCardOffsetX ?? 32}px`} styles={ts}>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        value={settings.timeCardOffsetX ?? 32}
                        onChange={e => onUpdateSettings({ ...settings, timeCardOffsetX: parseInt(e.target.value, 10) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`上距: ${settings.timeCardOffsetY ?? 32}px`} styles={ts}>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        value={settings.timeCardOffsetY ?? 32}
                        onChange={e => onUpdateSettings({ ...settings, timeCardOffsetY: parseInt(e.target.value, 10) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup
                      tight
                      label={`缩放: ${((settings.timeCardScale ?? 1) * 100).toFixed(0)}%`}
                      styles={ts}
                    >
                      <input
                        type="range"
                        min={0.65}
                        max={1.35}
                        step={0.01}
                        value={settings.timeCardScale ?? 1}
                        onChange={e => onUpdateSettings({ ...settings, timeCardScale: parseFloat(e.target.value) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          timeCardOffsetX: 32,
                          timeCardOffsetY: 32,
                          timeCardScale: 1,
                        })
                      }
                      className={`w-full py-1.5 border text-[10px] font-bold ${ts.buttonSecondary}`}
                    >
                      时间卡布局恢复默认
                    </button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {activeTab === 'cgSprite' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-5xl mx-auto">
                <p className="text-[11px] opacity-60 leading-relaxed">
                  横版 CG 的铺满与偏移、关闭行为；立绘入场/退场与角色面板。舞台整体预览仍在「视觉校准」顶部。
                </p>

                {/* 原 max-h-[220px] 过扁，Cover 时纵向只剩一条；改为与主界面相近的可视高度 */}
                <div
                  className={`relative w-full min-h-[240px] h-[min(48vh,480px)] max-h-[480px] rounded border overflow-hidden ${ts.header}`}
                >
                  {previewCgUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <img
                        src={previewCgUrl}
                        alt=""
                        className={`max-h-full max-w-full ${settings.cgFitMode === 'cover' ? 'h-full w-full object-cover' : 'h-full w-full object-contain'}`}
                        style={{
                          transform: `translate(${settings.cgOffsetX ?? 0}px, ${settings.cgOffsetY ?? 0}px)`,
                          objectPosition:
                            settings.cgFitMode === 'cover'
                              ? { top: 'center top', center: 'center center', bottom: 'center bottom' }[
                                  settings.cgCoverAnchor ?? 'top'
                                ]
                              : undefined,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] opacity-45 px-4 text-center">
                      当前无 CG 预览图；触发 CG 或打开图库后返回此处可查看铺满/偏移效果。
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                  <section className="space-y-2 rounded border border-current/10 p-3">
                    <h4 className={`text-[10px] font-black tracking-widest uppercase opacity-70 ${ts.accent}`}>
                      / CG 显示 /
                    </h4>
                    <p className="text-[9px] opacity-55 leading-snug">仅对横版 CG 生效，竖版始终完整显示。</p>
                    <ControlGroup tight label="横版 CG 显示" styles={ts}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, cgFitMode: 'cover' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${settings.cgFitMode === 'cover' ? ts.itemActive : ts.itemInactive}`}
                        >
                          铺满 (Cover)
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, cgFitMode: 'contain' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${settings.cgFitMode === 'contain' ? ts.itemActive : ts.itemInactive}`}
                        >
                          完整 (Contain)
                        </button>
                      </div>
                    </ControlGroup>
                    {settings.cgFitMode === 'cover' && (
                      <ControlGroup tight label="Cover 裁剪锚点" styles={ts}>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ ...settings, cgCoverAnchor: 'top' })}
                            className={`flex-1 py-1.5 border text-[10px] font-bold ${(settings.cgCoverAnchor ?? 'center') === 'top' ? ts.itemActive : ts.itemInactive}`}
                          >
                            顶部优先
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ ...settings, cgCoverAnchor: 'center' })}
                            className={`flex-1 py-1.5 border text-[10px] font-bold ${(settings.cgCoverAnchor ?? 'top') === 'center' ? ts.itemActive : ts.itemInactive}`}
                          >
                            居中
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ ...settings, cgCoverAnchor: 'bottom' })}
                            className={`flex-1 py-1.5 border text-[10px] font-bold ${(settings.cgCoverAnchor ?? 'center') === 'bottom' ? ts.itemActive : ts.itemInactive}`}
                          >
                            底部优先
                          </button>
                        </div>
                      </ControlGroup>
                    )}
                    <ControlGroup tight label={`CG 水平偏移 (X): ${settings.cgOffsetX ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        value={settings.cgOffsetX ?? 0}
                        onChange={e => onUpdateSettings({ ...settings, cgOffsetX: parseInt(e.target.value, 10) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <ControlGroup tight label={`CG 垂直偏移 (Y): ${settings.cgOffsetY ?? 0}px`} styles={ts}>
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        value={settings.cgOffsetY ?? 0}
                        onChange={e => onUpdateSettings({ ...settings, cgOffsetY: parseInt(e.target.value, 10) })}
                        className="w-full h-1 opacity-50 hover:opacity-100"
                      />
                    </ControlGroup>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ ...settings, cgOffsetX: 0, cgOffsetY: 0 })}
                      className={`w-full py-1.5 border text-[10px] font-bold ${ts.buttonSecondary}`}
                    >
                      CG 偏移恢复默认
                    </button>
                  </section>

                  <section className="space-y-2 rounded border border-current/10 p-3">
                    <h4 className={`text-[10px] font-black tracking-widest uppercase opacity-70 ${ts.accent}`}>
                      / CG 交互 /
                    </h4>
                    <ControlGroup tight label="CG 关闭方式" styles={ts}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, cgCloseMode: 'click' })}
                          className={`flex-1 py-1.5 border text-[10px] font-bold ${settings.cgCloseMode === 'click' ? ts.itemActive : ts.itemInactive}`}
                        >
                          点击关闭按钮
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, cgCloseMode: 'dblclick' })}
                          className={`flex-1 py-1.5 border text-[10px] font-bold ${settings.cgCloseMode === 'dblclick' ? ts.itemActive : ts.itemInactive}`}
                        >
                          双击图片
                        </button>
                      </div>
                    </ControlGroup>
                    <ControlGroup tight label="CG 仅手动关闭" styles={ts}>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ ...settings, cgManualCloseOnly: !(settings.cgManualCloseOnly ?? false) })
                        }
                        className={`w-full py-1.5 border text-[11px] font-bold ${(settings.cgManualCloseOnly ?? false) ? ts.itemActive : ts.itemInactive}`}
                      >
                        {(settings.cgManualCloseOnly ?? false) ? '已开启' : '已关闭'}
                      </button>
                      <p className="text-[9px] opacity-55 mt-1 leading-snug">
                        开启后切行或新回复不会自动关 CG，需手动关闭。
                      </p>
                    </ControlGroup>
                  </section>

                  <section className="space-y-2 rounded border border-current/10 p-3 lg:col-span-2">
                    <h4
                      className={`text-[10px] font-black tracking-widest uppercase ${settings.theme === 'ink-jianghu' ? 'opacity-90' : 'opacity-70'} ${ts.accent}`}
                    >
                      / 角色面板 /
                    </h4>
                    <p className="text-[9px] opacity-60 leading-snug">
                      控制点击/悬浮立绘时打开的角色介绍：呼出方式与展示形态（浮窗或资料卡）。
                    </p>
                    <ControlGroup tight label="呼出方式" styles={ts}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, spriteInfoTrigger: 'dblclick' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${(settings.spriteInfoTrigger ?? 'dblclick') === 'dblclick' ? ts.itemActive : ts.itemInactive}`}
                        >
                          双击立绘
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, spriteInfoTrigger: 'hover' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${settings.spriteInfoTrigger === 'hover' ? ts.itemActive : ts.itemInactive}`}
                        >
                          鼠标悬浮
                        </button>
                      </div>
                    </ControlGroup>
                    <ControlGroup tight label="展示风格" styles={ts}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, infoPanelSkin: 'classic' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${(settings.infoPanelSkin ?? 'classic') === 'classic' ? ts.itemActive : ts.itemInactive}`}
                        >
                          经典浮窗
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, infoPanelSkin: 'dossier' })}
                          className={`flex-1 py-1.5 border text-[11px] font-bold ${(settings.infoPanelSkin ?? 'classic') === 'dossier' ? ts.itemActive : ts.itemInactive}`}
                        >
                          资料卡
                        </button>
                      </div>
                      <p className="text-[9px] opacity-55 mt-1 leading-snug">
                        经典浮窗贴立绘旁；资料卡为左文右图档案式全幅界面。
                      </p>
                    </ControlGroup>
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'ui' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-6">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / 界面选项 (UI OPTIONS) /
                  </label>
                  <p className="text-[11px] opacity-60 leading-relaxed">
                    新手指引、悬浮全屏键、手机/窄视口布局等。CG 与立绘相关选项请见「{'CG&立绘'}
                    」；主题与对话框皮肤在「阅读设定」。
                  </p>
                  <ControlGroup label="界面布局编辑模式" styles={ts}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ ...settings, uiLayoutEditMode: !(settings.uiLayoutEditMode ?? false) })
                        }
                        className={`flex-1 py-2 border text-xs font-bold ${(settings.uiLayoutEditMode ?? false) ? ts.itemActive : ts.itemInactive}`}
                      >
                        {(settings.uiLayoutEditMode ?? false) ? '已开启' : '已关闭'}
                      </button>
                    </div>
                    <p className="text-[10px] opacity-60 mt-1 leading-snug">
                      开启后主界面出现提示条：可拖对话框整体、右下角缩放框体与正文可视区边距；底栏各键左侧 ┇
                      可拖移、在其上滚轮缩放。按 ESC 或在此关闭。数据写入本地存储。
                    </p>
                  </ControlGroup>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ControlGroup label="新手指引 (Tutorial)" styles={ts}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            onUpdateSettings({ ...settings, showTutorial: !(settings.showTutorial ?? true) })
                          }
                          className={`flex-1 py-2 border text-xs font-bold ${(settings.showTutorial ?? true) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.showTutorial ?? true) ? '开启' : '关闭'}
                        </button>
                      </div>
                      <p className="text-[10px] opacity-60 mt-1">
                        控制是否在进入界面时自动弹出新手说明。关闭后仍可在此处重新开启。
                      </p>
                    </ControlGroup>
                    <ControlGroup label="悬浮全屏键" styles={ts}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            onUpdateSettings({
                              ...settings,
                              showFloatingFullscreen: !(settings.showFloatingFullscreen ?? true),
                            })
                          }
                          className={`flex-1 py-2 border text-xs font-bold ${(settings.showFloatingFullscreen ?? true) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.showFloatingFullscreen ?? true) ? '开启' : '关闭'}
                        </button>
                      </div>
                      <p className="text-[10px] opacity-60 mt-1">是否显示可拖动的悬浮全屏按钮，长按可拖动位置。</p>
                    </ControlGroup>
                    <ControlGroup label="开发者模式" styles={ts}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({
                              ...settings,
                              developerMode: !(settings.developerMode ?? false),
                            })
                          }
                          className={`flex-1 py-2 border text-xs font-bold ${(settings.developerMode ?? false) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.developerMode ?? false) ? '开启' : '关闭'}
                        </button>
                      </div>
                      <p className="text-[10px] opacity-60 mt-1">
                        开启后显示侧边栏与快捷轮盘中的「档案」「事件表」「系统任务」；关闭时隐藏。
                      </p>
                    </ControlGroup>
                    <ControlGroup label="手机版" styles={ts} labelClassName="text-red-500">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ ...settings, matchMobileLayout: !(settings.matchMobileLayout ?? false) })
                          }
                          className={`flex-1 py-2 border text-xs font-bold ${(settings.matchMobileLayout ?? false) ? ts.itemActive : ts.itemInactive}`}
                        >
                          {(settings.matchMobileLayout ?? false) ? '开' : '关'}
                        </button>
                      </div>
                      {viewportAutoMobile ? (
                        <p className={`text-[10px] mt-1 font-mono opacity-90 ${ts.accent}`}>
                          当前：窄视口 — 已自动启用横屏手机布局
                        </p>
                      ) : null}
                    </ControlGroup>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="md:col-span-2 max-w-xl">
                      <ControlGroup label="立绘数量限制" styles={ts}>
                        <p className="text-[10px] opacity-70 mb-2 leading-snug">手机/窄视口布局时是否仅显示 1 个立绘。</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings({
                                ...settings,
                                singleSpriteOnMobile: !(settings.singleSpriteOnMobile ?? false),
                              })
                            }
                            className={`flex-1 py-2 border text-xs font-bold ${(settings.singleSpriteOnMobile ?? false) ? ts.itemActive : ts.itemInactive}`}
                          >
                            {(settings.singleSpriteOnMobile ?? false) ? '已开启' : '已关闭'}
                          </button>
                        </div>
                      </ControlGroup>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'wheel' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-3">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / 右键快捷轮盘 (QUICK WHEEL) /
                  </label>
                  <p className="text-[11px] opacity-60 leading-relaxed">
                    右键唤出的快捷轮盘为径向菜单 (Radial Menu)，默认包含「选项 / 存档 / 图库 / 系统设置」四个基础功能。
                    下方可为轮盘新增额外功能槽位，8 个扇形围绕中心全屏键排列，鼠标悬停时对应扇形高亮，点击执行。
                  </p>
                </div>

                <div className="space-y-4">
                  {quickItems.length === 0 && (
                    <p className="text-[11px] opacity-60">当前没有自定义快捷项。点击下方「新增快捷项」开始配置。</p>
                  )}
                  {quickItems.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 items-center border rounded-lg px-4 py-3 bg-black/10"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-widest">显示名称</label>
                        <input
                          type="text"
                          value={item.label}
                          onChange={e => {
                            const next = [...quickItems];
                            next[index] = { ...item, label: e.target.value };
                            onUpdateSettings({ ...settings, quickMenuCustomItems: next });
                          }}
                          className={`w-full px-3 py-1.5 text-xs focus:outline-none border rounded ${ts.input}`}
                          placeholder="例如：事件表 / 档案"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-widest">指向界面</label>
                        <select
                          value={item.modalKey}
                          onChange={e => {
                            const next = [...quickItems];
                            next[index] = { ...item, modalKey: e.target.value };
                            onUpdateSettings({ ...settings, quickMenuCustomItems: next });
                          }}
                          className={`w-full px-3 py-1.5 text-xs focus:outline-none border rounded ${ts.input}`}
                        >
                          {quickWheelModalOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex md:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const next = quickItems.filter((_, i) => i !== index);
                            onUpdateSettings({ ...settings, quickMenuCustomItems: next });
                          }}
                          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-red-500/60 text-red-400 hover:bg-red-500/10 rounded"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (quickItems.length >= 8) return;
                      const next = [
                        ...quickItems,
                        { id: `wheel_${Date.now()}`, label: '新快捷项', modalKey: 'schedule' },
                      ];
                      onUpdateSettings({ ...settings, quickMenuCustomItems: next });
                    }}
                    className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest border rounded ${ts.buttonSecondary} ${quickItems.length >= 8 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={quickItems.length >= 8}
                  >
                    ＋ 新增快捷项
                  </button>
                  <p className="text-[10px] opacity-60 text-right">
                    建议总槽位不超过 8 个，以保证轮盘布局清晰。基础 4 个 + 自定义 {quickItems.length}{' '}
                    个。空槽位显示加号，可在设置中添加快捷项填充。
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'novel' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* NOVEL MODE SECTION */}
                <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                  / 小说化集成 (NOVEL INTEGRATION) /
                </label>
                <ControlGroup label="开启小说模式 (Novel Mode)" styles={ts}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={settings.enableNovelMode}
                          onChange={e => onUpdateSettings({ ...settings, enableNovelMode: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-gray-500 rounded-full peer peer-focus:ring-2 peer-focus:ring-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                      <span className="text-[10px] opacity-70">将历史记录视为连续的小说章节。每次生成视为一章。</span>
                    </div>
                    <button
                      onClick={handleExportNovel}
                      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${ts.buttonSecondary}`}
                    >
                      📥 导出为小说 (Export TXT)
                    </button>
                  </div>
                </ControlGroup>

                <div className="w-full h-px bg-current opacity-10 my-4"></div>

                <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                  / 文本预览 (PREVIEW) /
                </label>
                <div
                  className={`p-4 border font-mono text-[10px] leading-relaxed h-64 overflow-y-auto whitespace-pre-wrap ${ts.input}`}
                >
                  {novelPreviewText}
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-3xl">
                <div className="space-y-3">
                  <label className={`text-xs font-black opacity-60 tracking-widest uppercase ${ts.accent}`}>
                    / API 连接 (API CONNECTION) /
                  </label>
                  <p className="text-[11px] opacity-60 leading-relaxed">
                    配置生成剧情所用的 AI 接口。独立运行模式必须在此配置；嵌入酒馆（SillyTavern）
                    运行时自动走酒馆的连接，无需在此填写。修改后自动保存到本地。
                  </p>
                </div>

                <ControlGroup label="服务商 (Provider)" styles={ts}>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => updateApi({ provider: 'gemini' })}
                      className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${effectiveApiConfig.provider === 'gemini' ? ts.itemActive : ts.itemInactive}`}
                    >
                      Gemini 官方
                    </button>
                    <button
                      type="button"
                      onClick={() => updateApi({ provider: 'openai' })}
                      className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${effectiveApiConfig.provider === 'openai' ? ts.itemActive : ts.itemInactive}`}
                    >
                      OpenAI 兼容
                    </button>
                    <button
                      type="button"
                      onClick={() => updateApi({ provider: 'custom' })}
                      className={`px-3 py-2.5 text-xs font-black tracking-widest border rounded transition-colors ${effectiveApiConfig.provider === 'custom' ? ts.itemActive : ts.itemInactive}`}
                    >
                      自定义
                    </button>
                  </div>
                  <p className="text-[9px] opacity-55 mt-1 leading-snug">
                    Gemini 走官方 SDK（模型如 gemini-2.0-flash-exp）；OpenAI 兼容与自定义均走
                    /v1/chat/completions 接口（支持 Claude、DeepSeek、Kimi、GLM、Qwen 等任何 OpenAI 兼容网关）。
                  </p>
                </ControlGroup>

                <ControlGroup label="API Key" styles={ts}>
                  <div className="flex gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={effectiveApiConfig.apiKey}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={e => updateApi({ apiKey: e.target.value })}
                      placeholder="sk-... / AIza... / 留空则用构建时注入的 Key"
                      className={`w-full px-3 py-2 text-xs focus:outline-none border font-mono ${ts.input}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className={`shrink-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest border rounded ${ts.buttonSecondary}`}
                    >
                      {showApiKey ? '隐藏' : '显示'}
                    </button>
                  </div>
                  <p className="text-[9px] opacity-55 mt-1 leading-snug">Key 仅保存在本机 localStorage，不会上传到任何服务器。</p>
                </ControlGroup>

                {effectiveApiConfig.provider !== 'gemini' && (
                  <ControlGroup label="Base URL" styles={ts}>
                    <input
                      type="text"
                      value={effectiveApiConfig.baseUrl}
                      spellCheck={false}
                      onChange={e => updateApi({ baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className={`w-full px-3 py-2 text-xs focus:outline-none border font-mono ${ts.input}`}
                    />
                  </ControlGroup>
                )}

                <ControlGroup label="模型 (Model)" styles={ts}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={effectiveApiConfig.modelId}
                      spellCheck={false}
                      onChange={e => updateApi({ modelId: e.target.value })}
                      placeholder="gemini-2.0-flash-exp / gpt-4o / claude-... / deepseek-chat"
                      className={`w-full px-3 py-2 text-xs focus:outline-none border font-mono ${ts.input}`}
                    />
                    <button
                      type="button"
                      onClick={handleFetchApiModels}
                      disabled={apiModelsLoading}
                      className={`shrink-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest border rounded ${apiModelsLoading ? 'opacity-50 cursor-wait' : ''} ${ts.buttonSecondary}`}
                    >
                      {apiModelsLoading ? '获取中…' : '获取模型列表'}
                    </button>
                  </div>
                  {apiModels.length > 0 && (
                    <select
                      value={effectiveApiConfig.modelId}
                      onChange={e => updateApi({ modelId: e.target.value })}
                      className={`w-full px-3 py-2 text-xs focus:outline-none border mt-2 ${ts.input}`}
                    >
                      {apiModels.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </ControlGroup>

                {effectiveApiConfig.provider !== 'gemini' && (
                  <ControlGroup label="自定义 Headers (JSON)" styles={ts}>
                    <textarea
                      value={effectiveApiConfig.headers}
                      rows={3}
                      spellCheck={false}
                      onChange={e => updateApi({ headers: e.target.value })}
                      placeholder='{"X-API-Key": "..."}'
                      className={`w-full px-3 py-2 text-xs focus:outline-none border font-mono resize-y ${ts.input}`}
                    />
                  </ControlGroup>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestApiConnection}
                    disabled={apiTesting}
                    className={`px-6 py-2.5 text-xs font-black uppercase tracking-widest border rounded transition-all ${apiTesting ? 'opacity-60 cursor-wait' : ''} ${ts.buttonPrimary}`}
                  >
                    {apiTesting ? '连接测试中…' : '🔌 测试连接'}
                  </button>
                  {apiTestResult && (
                    <div
                      className={`mt-3 px-4 py-3 border rounded text-[11px] font-mono leading-relaxed break-all ${
                        apiTestResult.success
                          ? 'border-emerald-500/50 text-emerald-500'
                          : 'border-red-500/50 text-red-400'
                      }`}
                    >
                      {apiTestResult.success ? '✅ 连接成功：' : '❌ 连接失败：'}
                      {apiTestResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SidebarItem = ({ label, active, onClick, styles }: any) => (
  <button
    onClick={onClick}
    className={`w-full text-right px-8 py-4 transition-all text-xs font-black tracking-widest border-r-4 ${active ? styles.itemActive : styles.itemInactive}`}
  >
    {label}
  </button>
);

const ControlGroup = ({ label, children, styles, tight, labelClassName }: any) => (
  <div className={tight ? 'space-y-1' : 'space-y-2'}>
    <label
      className={`${tight ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase tracking-tighter ${labelClassName ?? styles.controlLabel ?? 'opacity-50'}`}
    >
      {label}
    </label>
    {children}
  </div>
);
