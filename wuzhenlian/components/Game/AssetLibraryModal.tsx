import React, { useEffect, useMemo, useRef, useState } from 'react';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import {
  BackgroundFolder,
  BackgroundItem,
  CGFolder,
  CGItem,
  CGSet,
  CustomFolder,
  CustomSprite,
  type GlobalSettings,
} from '../../types';

/** 与主界面 CG 层一致：图库/图集预览共用 */
type CgDisplaySettingsSlice = Pick<
  GlobalSettings,
  'cgFitMode' | 'cgCoverAnchor' | 'cgOffsetX' | 'cgOffsetY'
>;

const DEFAULT_CG_DISPLAY: CgDisplaySettingsSlice = {
  cgFitMode: 'cover',
  cgCoverAnchor: 'top',
  cgOffsetX: 0,
  cgOffsetY: 0,
};

/** JSON 中 cgLibrary 须为 CGFolder[]；部分导出文件误写成单个文件夹对象，此处一并兼容 */
function normalizeCgLibraryImportPayload(raw: unknown): CGFolder[] | null {
  if (raw == null) return null;
  const patchFolder = (f: any): CGFolder => ({
    ...f,
    items: Array.isArray(f?.items)
      ? f.items.map((it: CGItem) => ({ ...it, keywords: Array.isArray(it.keywords) ? it.keywords : [] }))
      : [],
    sets: Array.isArray(f?.sets) ? f.sets : [],
  });
  if (Array.isArray(raw)) return raw.map(patchFolder);
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as CGFolder).items)) {
    return [patchFolder(raw)];
  }
  return null;
}

function CgGalleryPreviewImg({
  item,
  settings,
  runtimeTall,
  onDetectTallAspect,
  className = '',
}: {
  item: { id: string; url: string; name?: string; isVertical?: boolean };
  settings: CgDisplaySettingsSlice;
  runtimeTall?: boolean;
  onDetectTallAspect?: (id: string) => void;
  className?: string;
}) {
  const isVert = !!item.isVertical || !!runtimeTall;
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalHeight > img.naturalWidth) {
      onDetectTallAspect?.(item.id);
    }
  };
  if (isVert) {
    return (
      <img
        src={item.url}
        alt={item.name || ''}
        className={`max-w-full max-h-full object-contain ${className}`}
        onLoad={handleLoad}
      />
    );
  }
  const cover = settings.cgFitMode === 'cover';
  return (
    <img
      src={item.url}
      alt={item.name || ''}
      className={`${cover ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'} ${className}`}
      style={{
        transform: `translate(${settings.cgOffsetX ?? 0}px, ${settings.cgOffsetY ?? 0}px)`,
        objectPosition: cover
          ? { top: 'center top', center: 'center center', bottom: 'center bottom' }[
              settings.cgCoverAnchor ?? 'top'
            ]
          : undefined,
      }}
      onLoad={handleLoad}
    />
  );
}
import { TacticalButton } from '../ui/TacticalButton';
import { ModalCloseX } from './ModalCloseX';

// 表情预设：分组 + 同义词列表（选中分组后右侧出现可点击标签）
const EXPRESSION_PRESET_GROUPS: { id: string; label: string; items: string[] }[] = [
  { id: 'neutral', label: '正常 / 微笑', items: ['正常', '默认', '待机', '微笑', '温和', '放松'] },
  { id: 'happy', label: '高兴', items: ['开心', '高兴', '愉快', '大笑', '爽朗', '露齿笑'] },
  { id: 'angry', label: '生气', items: ['生气', '愤怒', '瞪眼', '皱眉', '训斥', '不满'] },
  { id: 'shy', label: '害羞 / 尴尬', items: ['害羞', '脸红', '不好意思', '尴尬', '回避视线', '局促'] },
  { id: 'surprised', label: '惊讶', items: ['惊讶', '吃惊', '震惊', '张嘴', '愣住'] },
  { id: 'tease', label: '调戏 / 色气', items: ['好色', '调戏', '捉弄', '戏弄', '坏笑', '不怀好意', '猥琐'] },
  { id: 'tense', label: '紧张 / 忍耐', items: ['紧张', '忍耐', '咬牙', '憋着', '吃力', '强忍', '咬唇'] },
  { id: 'sad', label: '难过 / 伤心', items: ['难过', '悲伤', '心酸', '委屈', '要哭', '含泪'] },
  { id: 'climax', label: '高潮 / 射精', items: ['高潮', '射精', '喘息', '失神', '颤抖', '性高潮'] },
  { id: 'cold', label: '冷漠 / 冷静', items: ['冷漠', '冷淡', '严肃', '冷静', '面无表情'] },
];

/** 立绘图片：加载失败时显示柔和占位符，避免蓝底「image not found」 */
function SpriteImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src?.trim()) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-slate-600/50 text-slate-400/80 text-[10px] ${className || ''}`}
        title="图片加载失败"
      >
        暂无预览
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setErr(true)} />;
}

interface AssetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Characters
  customLibrary: CustomFolder[];
  onUpdateCustomLibrary: (lib: CustomFolder[]) => void;
  // Backgrounds
  backgroundLibrary: BackgroundFolder[];
  onUpdateBackgroundLibrary: (lib: BackgroundFolder[]) => void;
  onSetBackground: (bg: { name: string; url: string }) => void;
  currentBackgroundUrl: string;
  defaultBackgroundId?: string | null;
  onSetDefaultBackground?: (id: string | null) => void;
  // CGs
  cgLibrary: CGFolder[];
  onUpdateCgLibrary: (lib: CGFolder[]) => void;
  onSetCG: (cg: CGItem | null) => void;
  currentCG: CGItem | null;
  // Global
  theme?: string;
  isAuthorMode?: boolean;
  onForceSave?: () => void;
  /** 是否使用手机/窄视口布局（弹窗宽度） */
  isMobileLayout?: boolean;
  /** 与系统设置「CG&立绘」一致，图集/素材池预览与主界面同步 */
  cgDisplaySettings?: Partial<CgDisplaySettingsSlice>;
}

export const AssetLibraryModal: React.FC<AssetLibraryModalProps> = ({
  isOpen,
  onClose,
  customLibrary,
  onUpdateCustomLibrary,
  backgroundLibrary,
  onUpdateBackgroundLibrary,
  onSetBackground,
  currentBackgroundUrl,
  defaultBackgroundId,
  onSetDefaultBackground,
  cgLibrary,
  onUpdateCgLibrary,
  onSetCG,
  currentCG,
  theme = 'night',
  isAuthorMode = false,
  onForceSave,
  isMobileLayout,
  cgDisplaySettings,
}) => {
  const cgDisplay = useMemo(
    () => ({
      cgFitMode: cgDisplaySettings?.cgFitMode ?? DEFAULT_CG_DISPLAY.cgFitMode,
      cgCoverAnchor: cgDisplaySettings?.cgCoverAnchor ?? DEFAULT_CG_DISPLAY.cgCoverAnchor,
      cgOffsetX: cgDisplaySettings?.cgOffsetX ?? DEFAULT_CG_DISPLAY.cgOffsetX,
      cgOffsetY: cgDisplaySettings?.cgOffsetY ?? DEFAULT_CG_DISPLAY.cgOffsetY,
    }),
    [
      cgDisplaySettings?.cgFitMode,
      cgDisplaySettings?.cgCoverAnchor,
      cgDisplaySettings?.cgOffsetX,
      cgDisplaySettings?.cgOffsetY,
    ],
  );

  /** 与主界面一致：加载后根据宽高比将横图误判为竖图（仅影响预览样式） */
  const [cgTallAspectById, setCgTallAspectById] = useState<Record<string, boolean>>({});
  const markCgTallAspect = (id: string) => {
    setCgTallAspectById(prev => (prev[id] ? prev : { ...prev, [id]: true }));
  };
  const [activeTab, setActiveTab] = useState<'character' | 'background' | 'cg' | 'triggers'>('character');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Character Logic State ---
  const [charFolderId, setCharFolderId] = useState<string | null>(null);
  const [isCharImportOpen, setIsCharImportOpen] = useState(false);
  const [charImportText, setCharImportText] = useState('');
  const [selectedSprite, setSelectedSprite] = useState<CustomSprite | null>(null); // 选中的立绘用于预览
  const [selectedCharSpriteIds, setSelectedCharSpriteIds] = useState<string[]>([]);
  const [batchCharOutfit, setBatchCharOutfit] = useState('');
  const [isCharMultiSelectMode, setIsCharMultiSelectMode] = useState(false);
  // 合集：通过名称区分（名字以「合集」开头）；支持在合集内部先看角色列表，再看角色的立绘
  const [collectionCharFilter, setCollectionCharFilter] = useState<string | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('新建合集');
  // 角色拖拽到合集（文件夹级别拖拽）
  const [draggingCharFolderId, setDraggingCharFolderId] = useState<string | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  // 重命名状态
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  // 表情预设分组：选中分组后右侧显示可点击的预设词
  const [activeExpressionPresetGroupId, setActiveExpressionPresetGroupId] = useState<string>('');

  // --- Background Logic State ---
  const [bgFolderId, setBgFolderId] = useState<string | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState(currentBackgroundUrl);
  const [bgPreviewName, setBgPreviewName] = useState('');
  const [selectedBgForPreview, setSelectedBgForPreview] = useState<BackgroundItem | null>(null);
  const [bgEditId, setBgEditId] = useState<string | null>(null);
  const [bgInputName, setBgInputName] = useState('');
  const [bgInputUrl, setBgInputUrl] = useState('');
  const [isBgImportOpen, setIsBgImportOpen] = useState(false);
  const [bgImportText, setBgImportText] = useState('');
  const [draggedBgId, setDraggedBgId] = useState<string | null>(null);
  const [draggedBgFolderId, setDraggedBgFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [bgSidebarHidden, setBgSidebarHidden] = useState(false); // 背景 tab 侧栏是否隐藏（图2 风格 + 可折叠）
  const [bgLocationSearch, setBgLocationSearch] = useState(''); // 背景 tab 主区「搜索地点」（军营报道员风格）

  // --- CG Logic State ---
  const [cgFolderId, setCgFolderId] = useState<string | null>(null);
  const [cgEditId, setCgEditId] = useState<string | null>(null);
  const [cgInputName, setCgInputName] = useState('');
  const [cgInputUrl, setCgInputUrl] = useState('');
  const [cgInputTriggerContent, setCgInputTriggerContent] = useState('');
  const [cgInputCgTagId, setCgInputCgTagId] = useState('');
  const [cgInputNsfw, setCgInputNsfw] = useState(false);
  const [cgInputIsVertical, setCgInputIsVertical] = useState(false);
  const [isCgImportOpen, setIsCgImportOpen] = useState(false);
  const [cgImportText, setCgImportText] = useState('');
  const [cgSetId, setCgSetId] = useState<string | null>(null);
  const [isCgPoolPickerOpen, setIsCgPoolPickerOpen] = useState(false);
  const [selectedCgForPreview, setSelectedCgForPreview] = useState<CGItem | null>(null);
  const [cgSidebarHidden, setCgSidebarHidden] = useState(false); // CG 图 tab 侧栏是否隐藏
  const [cgSortDropdownOpen, setCgSortDropdownOpen] = useState(false); // 素材排序下拉是否展开

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cgSortDropdownRef = useRef<HTMLDivElement>(null);
  const charSortDropdownRef = useRef<HTMLDivElement>(null);

  // 批量导入状态（用于按钮「导入中…」反馈）
  const [isCharImporting, setIsCharImporting] = useState(false);
  const [isBgImporting, setIsBgImporting] = useState(false);
  const [isCgImporting, setIsCgImporting] = useState(false);
  // 服饰组内交互：重命名 & 复制表情的小面板状态
  const [renamingOutfitKey, setRenamingOutfitKey] = useState<string | null>(null);
  const [renamingOutfitValue, setRenamingOutfitValue] = useState('');
  const [copySourceOutfitKey, setCopySourceOutfitKey] = useState<string | null>(null);
  // 立绘排序下拉（不要复用 CG 的 dropdown 状态）
  const [charSortDropdownOpen, setCharSortDropdownOpen] = useState(false);
  // 合集视图：重命名某个角色分组（修改 sprites[].characterName）
  const [editingCollectionCharName, setEditingCollectionCharName] = useState<string | null>(null);
  const [editingCollectionCharValue, setEditingCollectionCharValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setBgPreviewUrl(currentBackgroundUrl);
      setSearchQuery('');
      // 从图库中查找当前背景的名称
      const normalizeUrl = (u: string) =>
        String(u || '')
          .trim()
          .split('?')[0];
      const target = normalizeUrl(currentBackgroundUrl);
      const found = target
        ? backgroundLibrary.flatMap(f => f.items).find(b => normalizeUrl(b.url) === target) || null
        : null;
      setBgPreviewName(found?.name ?? (currentBackgroundUrl ? '当前背景' : ''));
      setSelectedBgForPreview(found ?? null);
    }
  }, [isOpen, currentBackgroundUrl, backgroundLibrary]);

  const resolvedBgForDefault = useMemo(() => {
    if (selectedBgForPreview) return selectedBgForPreview;
    const normalizeUrl = (u: string) =>
      String(u || '')
        .trim()
        .split('?')[0];
    const target = normalizeUrl(currentBackgroundUrl);
    if (!target) return null;
    return (backgroundLibrary || []).flatMap(f => f.items).find(b => normalizeUrl(b.url) === target) || null;
  }, [selectedBgForPreview, currentBackgroundUrl, backgroundLibrary]);

  // 打开图库或切换 tab 时，若当前分类未选文件夹且该分类有文件夹，则自动选中第一个，避免出现“请选择…”的空状态
  const charFoldersAvailable = useMemo(() => (customLibrary || []).filter(f => f && !f.disabled), [customLibrary]);
  const bgFoldersAvailable = useMemo(
    () => (backgroundLibrary || []).filter(f => f && !f.disabled),
    [backgroundLibrary],
  );
  const cgFoldersAvailable = useMemo(() => (cgLibrary || []).filter(f => f && !f.disabled), [cgLibrary]);
  useEffect(() => {
    if (!isOpen) return;
    // 立绘库：不再自动选中第一个角色，默认展示角色网格
    // if (activeTab === 'character' && !charFolderId && charFoldersAvailable.length > 0) {
    //     setCharFolderId(charFoldersAvailable[0].id);
    // }
    if (activeTab === 'background' && !bgFolderId && bgFoldersAvailable.length > 0) {
      setBgFolderId(bgFoldersAvailable[0].id);
    }
    if (activeTab === 'cg' && !cgFolderId && cgFoldersAvailable.length > 0) {
      setCgFolderId(cgFoldersAvailable[0].id);
      setCgSetId(null);
    }
  }, [
    isOpen,
    activeTab,
    charFolderId,
    bgFolderId,
    cgFolderId,
    charFoldersAvailable,
    bgFoldersAvailable,
    cgFoldersAvailable,
  ]);

  // 切换 Tab / 文件夹 时清空立绘多选与批量输入
  useEffect(() => {
    setSelectedCharSpriteIds([]);
    setBatchCharOutfit('');
    setIsCharMultiSelectMode(false);
  }, [isOpen, activeTab, charFolderId]);

  // 点击页面其他区域关闭「素材排序」下拉
  useEffect(() => {
    if (!cgSortDropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (cgSortDropdownRef.current && !cgSortDropdownRef.current.contains(e.target as Node)) {
        setCgSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [cgSortDropdownOpen]);

  // 点击页面其他区域关闭「立绘排序」下拉
  useEffect(() => {
    if (!charSortDropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (charSortDropdownRef.current && !charSortDropdownRef.current.contains(e.target as Node)) {
        setCharSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [charSortDropdownOpen]);

  // --- TRIGGER WORD SUMMARY ---
  const triggerSummary = useMemo(() => {
    const lines: string[] = [];

    // Helper: collect unique values
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    // --- Character / Sprite IDs ---
    const charNames = uniq((customLibrary || []).filter(f => f && !f.disabled).map(f => (f.name || '').trim()));

    // --- Background names ---
    const bgNames = uniq(
      (backgroundLibrary || [])
        .filter(f => f && !f.disabled)
        .flatMap(f => (f.items || []).map(b => (b.name || '').trim())),
    );

    // --- CG 图集触发词（名称、触发内容、图集 cg id；兼容旧数据中的 keywords）---
    const cgSetTriggerWords = uniq(
      (cgLibrary || [])
        .filter(f => f && !f.disabled)
        .flatMap(folder =>
          (folder.sets || []).flatMap((s: CGSet) => {
            const name = (s.name || '').trim();
            const tc = (s.triggerContent || '').trim();
            const tid = (s.cgTagId || '').trim();
            const kws = (s.keywords || []).map((k: string) => (k || '').trim()).filter(Boolean);
            return [name, tc, tid, ...kws].filter(Boolean);
          }),
        ),
    );

    const cgSetTriggerLines: string[] = [];
    (cgLibrary || [])
      .filter(f => f && !f.disabled)
      .forEach(folder => {
        (folder.sets || []).forEach((s: CGSet) => {
          const id = String(s.cgTagId || '').trim();
          const trig = String(s.triggerContent || '').trim();
          if (!id && !trig) return;
          const setName = String(s.name || '').trim() || '（未命名图集）';
          const n = (s.itemIds || []).length;
          if (id && trig) {
            cgSetTriggerLines.push(
              `图集「${setName}」（${n} 张）：触发描述【${trig}】；可同时使用 <cg id=${id}> 或管道第三列 CG:${id}。`,
            );
          } else if (id) {
            cgSetTriggerLines.push(
              `图集「${setName}」（${n} 张）：正文可写 <cg id=${id}> 或管道第三列 CG:${id} 播放该图集。`,
            );
          } else {
            cgSetTriggerLines.push(`图集「${setName}」（${n} 张）：正文中出现触发描述「${trig}」时可播放该图集。`);
          }
        });
      });

    // --- 单张 CG：触发内容 + cg id 句式（供模型在正文写 <cg id=…>）---
    const cgSingleTriggerLines: string[] = [];
    (cgLibrary || [])
      .filter(f => f && !f.disabled)
      .forEach(folder => {
        (folder.items || []).forEach((item: CGItem) => {
          const id = String(item.cgTagId || item.keywords?.[0] || '').trim();
          const trig = String(item.triggerContent || '').trim();
          if (!id && !trig) return;
          const trigDisp = trig || '（请填写触发内容）';
          const idDisp = id || '（请填写 cg id）';
          const url = String(item.url || '').trim();
          cgSingleTriggerLines.push(
            `当触发【${trigDisp}】时，在正文增加<cg id=${idDisp}>的标签，并触发对应的cg图【${url}】`,
          );
        });
      });

    // --- 实际立绘配对（服饰×表情）：仅导出图库中存在的组合，避免「服饰列表×表情列表」笛卡尔积误导模型 ---
    const pairListByChar = new Map<string, Array<{ o: string; e: string }>>();
    (customLibrary || [])
      .filter(f => f && !f.disabled)
      .forEach(folder => {
        const char = (folder.name || '').trim();
        if (!char) return;
        const list = pairListByChar.get(char) || [];
        (folder.sprites || []).forEach(s => {
          const o = (s.outfit || '').trim();
          const e = (s.expression || '').trim();
          if (!o || !e) return;
          if (!list.some(p => p.o === o && p.e === e)) list.push({ o, e });
        });
        if (list.length > 0) pairListByChar.set(char, list);
      });
    pairListByChar.forEach(list => {
      list.sort((a, b) => a.o.localeCompare(b.o, 'zh-CN') || a.e.localeCompare(b.e, 'zh-CN'));
    });

    lines.push('【Spirit Command 触发词总览】');
    lines.push('（本页面内容会随图库变化实时更新，可直接一键复制用于世界书或提示词。）');
    lines.push('');

    // Characters
    lines.push('一、合法角色名（立绘ID）：');
    if (charNames.length === 0) {
      lines.push('- （当前暂无角色文件夹）');
    } else {
      charNames.forEach(name => lines.push(`- ${name}`));
    }
    lines.push('');

    // Backgrounds
    lines.push('二、合法背景名：');
    if (bgNames.length === 0) {
      lines.push('- （当前暂无背景场景）');
    } else {
      bgNames.forEach(name => lines.push(`- ${name}`));
    }
    lines.push('');

    // CG 图集触发词（不再导出单张 CG 名称，防止越过图集直接触发）
    lines.push('三、合法 CG 图集触发名（含图集名、触发内容、图集 cg id；旧存档中的额外关键词仍会列出）：');
    if (cgSetTriggerWords.length === 0) {
      lines.push('- （当前暂无 CG 图集）');
    } else {
      cgSetTriggerWords.forEach(name => lines.push(`- ${name}`));
    }
    lines.push('');

    lines.push('三-A、CG 图集触发说明（字段与单张 CG 的「触发内容」「cg id」一致）：');
    if (cgSetTriggerLines.length === 0) {
      lines.push('- （当前暂无填写「触发内容」或「cg id」的图集）');
    } else {
      cgSetTriggerLines.forEach(t => lines.push(t));
    }
    lines.push('');

    lines.push('三-B、CG 单张触发说明（正文可写 <cg id=编号>，或与管道第三列 CG:编号 等效）：');
    if (cgSingleTriggerLines.length === 0) {
      lines.push('- （当前暂无填写「触发内容」或「cg id」的单张 CG）');
    } else {
      cgSingleTriggerLines.forEach(t => lines.push(t));
    }
    lines.push('');

    // 立绘：仅列出「服饰|表情」实际存在的配对（对应管道符第4、5段）；勿将未列出的服饰与表情交叉组合
    lines.push('四、合法立绘组合（服饰 outfit × 表情 expression，仅下列实际存在的配对）：');
    lines.push(
      '（说明：第4段服饰与第5段表情必须同时命中下列同一组配对；下列未出现的「服饰+表情」组合在图库中不存在，禁止编造。）',
    );
    if (pairListByChar.size === 0) {
      lines.push('- （当前暂无立绘或缺少服饰+表情标注）');
    } else {
      Array.from(pairListByChar.keys())
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .forEach(char => {
          const pairs = pairListByChar.get(char) || [];
          const compact = pairs.map(p => `${p.o}|${p.e}`).join(', ');
          lines.push(`- ${char}: ${compact}`);
        });
    }

    return lines.join('\n');
  }, [customLibrary, backgroundLibrary, cgLibrary]);

  const [copiedTrigger, setCopiedTrigger] = useState(false);
  const [writingTrigger, setWritingTrigger] = useState(false);

  const handleCopyTriggerSummary = async () => {
    try {
      await navigator.clipboard.writeText(triggerSummary);
      setCopiedTrigger(true);
      setTimeout(() => setCopiedTrigger(false), 1500);
    } catch {
      setCopiedTrigger(false);
    }
  };

  /** 一键写入世界书时的条目名与头部说明（写入内容 = 头部 + 触发词总览） */
  const VN_ENTRY_NAME = '【VN_合法组合说明】';
  const VN_WRITE_HEADER = `#VN_合法组合说明：
所有 VN 行必须为：\${角色名/旁白}|\${背景图片}|\${CG图片}|\${角色立绘的服饰}|\${角色立绘的表情/动作}|\${对白或场景描述}
【触发词总览】：
`;

  /** 将触发词总览一键写入当前角色卡的主世界书 */
  const handleWriteTriggerToWorldbook = async () => {
    if (!triggerSummary.trim()) return;
    if (typeof getCharWorldbookNames !== 'function' || typeof updateWorldbookWith !== 'function') {
      if (typeof toastr !== 'undefined') {
        toastr.error('酒馆助手接口不可用，无法写入世界书', '触发词清单');
      }
      return;
    }
    try {
      setWritingTrigger(true);
      const charWorldbooks = getCharWorldbookNames('current');
      const worldbookName = charWorldbooks?.primary;
      if (!worldbookName) {
        if (typeof toastr !== 'undefined') {
          toastr.error('当前角色卡没有绑定主世界书', '触发词清单');
        }
        return;
      }
      const contentToWrite = VN_WRITE_HEADER + triggerSummary;
      await updateWorldbookWith(worldbookName, (entries: any[]) => {
        const next = [...entries];
        const idx = next.findIndex(e => (e?.name || '').trim() === VN_ENTRY_NAME);
        if (idx >= 0) {
          next[idx] = { ...next[idx], content: contentToWrite };
          return next;
        }
        next.push({
          name: VN_ENTRY_NAME,
          content: contentToWrite,
        });
        return next;
      });
      if (typeof toastr !== 'undefined') {
        toastr.success(`已写入世界书「${VN_ENTRY_NAME}」条目`, '触发词清单');
      }
    } catch (e) {
      console.error('[AssetLibrary] 写入触发词总览到世界书失败', e);
      if (typeof toastr !== 'undefined') {
        toastr.error('写入世界书失败，请查看 Console 日志', '触发词清单');
      }
    } finally {
      setWritingTrigger(false);
    }
  };

  // --- STYLES ---
  const ts = {
    modalBg:
      theme === 'day'
        ? 'bg-slate-50 text-slate-900 border-slate-300'
        : theme === 'fantasy-elegant'
          ? 'bg-[#faf6ee]/98 text-amber-950 border-amber-800/30'
          : theme === 'ink-jianghu'
            ? 'bg-black/70 text-white border-white/15'
            : 'bg-[#0f172a] text-slate-200 border-white/10',
    header:
      theme === 'day'
        ? 'bg-white border-slate-200'
        : theme === 'fantasy-elegant'
          ? 'bg-[#f4ecd8] border-amber-800/25'
          : theme === 'ink-jianghu'
            ? 'bg-black/35 border-white/10'
            : 'bg-[#1e293b] border-white/5',
    sidebar:
      theme === 'day'
        ? 'bg-slate-100 border-slate-200'
        : theme === 'fantasy-elegant'
          ? 'bg-[#f8efd8] border-amber-800/25'
          : theme === 'ink-jianghu'
            ? 'bg-black/40 border-white/10'
            : 'bg-[#020617] border-white/5',
    content:
      theme === 'day'
        ? 'bg-slate-50'
        : theme === 'fantasy-elegant'
          ? 'bg-[#fffdf8]'
          : theme === 'ink-jianghu'
            ? 'bg-black/55'
            : 'bg-[#0f172a]',
    item:
      theme === 'day'
        ? 'bg-white border-slate-200 hover:border-emerald-500'
        : theme === 'fantasy-elegant'
          ? 'bg-[#fffdf8] border-amber-800/20 hover:border-amber-600'
          : theme === 'ink-jianghu'
            ? 'bg-black/30 border-white/10 hover:border-white/20'
            : 'bg-[#1e293b] border-white/5 hover:border-emerald-500',
    itemActive:
      theme === 'day'
        ? 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 font-bold'
        : theme === 'fantasy-elegant'
          ? 'bg-amber-100 border-l-4 border-amber-700 text-amber-950 font-bold shadow-[inset_0_0_0_1px_rgba(180,83,9,0.12)]'
          : theme === 'ink-jianghu'
            ? 'bg-white/10 border-l-4 border-white/50 text-white font-bold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'bg-emerald-500/25 border-l-4 border-emerald-400 text-emerald-100 font-bold shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]',
    input:
      theme === 'day'
        ? 'bg-white border-slate-300 text-slate-900'
        : theme === 'fantasy-elegant'
          ? 'bg-white border-amber-800/25 text-amber-950'
          : theme === 'ink-jianghu'
            ? 'bg-black/40 border-white/15 text-white'
            : 'bg-[#020617] border-white/10 text-white',
    accentText:
      theme === 'ink-jianghu'
        ? 'text-white'
        : theme === 'fantasy-elegant'
          ? 'text-amber-900'
          : theme === 'military'
            ? 'text-emerald-500'
            : 'text-emerald-400',
    tabActive:
      theme === 'day'
        ? 'bg-emerald-600 text-white'
        : theme === 'fantasy-elegant'
          ? 'bg-amber-700 text-white'
          : theme === 'ink-jianghu'
            ? 'bg-white/90 text-black'
            : 'bg-emerald-600 text-white',
    tabInactive:
      theme === 'day'
        ? 'text-slate-500 hover:bg-slate-200'
        : theme === 'fantasy-elegant'
          ? 'text-amber-900/65 hover:bg-amber-100/80'
          : theme === 'ink-jianghu'
            ? 'text-white/70 hover:bg-white/5'
            : 'text-slate-400 hover:bg-white/5',
  };

  // --- HELPER FUNCTIONS ---

  // Generic Folder Toggles
  const toggleFolderDisabled = (type: 'char' | 'bg' | 'cg', folderId: string) => {
    if (type === 'char') {
      onUpdateCustomLibrary(customLibrary.map(f => (f.id === folderId ? { ...f, disabled: !f.disabled } : f)));
    } else if (type === 'bg') {
      onUpdateBackgroundLibrary(backgroundLibrary.map(f => (f.id === folderId ? { ...f, disabled: !f.disabled } : f)));
    } else if (type === 'cg') {
      onUpdateCgLibrary(cgLibrary.map(f => (f.id === folderId ? { ...f, disabled: !f.disabled } : f)));
    }
  };

  // Character Helpers
  const addCharFolder = () => {
    const id = `f_${Date.now()}`;
    onUpdateCustomLibrary([...customLibrary, { id, name: '新角色', sprites: [], spriteFolderKind: 'fullbody' }]);
    setCharFolderId(id);
  };
  const updateCharFolder = (id: string, name: string) => {
    onUpdateCustomLibrary(
      customLibrary.map(f => {
        if (f.id !== id) return f;
        const nextName = name;
        // 合集文件夹只改自己的名称，不动内部角色名
        const isCollection =
          String(f.id || '')
            .trim()
            .toLowerCase()
            .startsWith('collection_') || (f.name || '').trim().startsWith('合集');
        if (isCollection) {
          return { ...f, name: nextName };
        }
        const oldName = (f.name || '').trim();
        const patchedSprites = (f.sprites || []).map(s => {
          const cur = (s.characterName || '').trim();
          if (!cur || cur === oldName) {
            return { ...s, characterName: nextName };
          }
          return s;
        });
        return { ...f, name: nextName, sprites: patchedSprites };
      }),
    );
  };
  const deleteCharFolder = (id: string) => {
    if (confirm('确认删除该文件夹？')) {
      onUpdateCustomLibrary(customLibrary.filter(f => f.id !== id));
      if (charFolderId === id) setCharFolderId(null);
    }
  };
  /** 该角色文件夹在舞台上的显示方式：全身中央 / 头像左下角叠在对话框上 */
  const setCharFolderSpriteKind = (folderId: string, kind: 'fullbody' | 'avatar') => {
    onUpdateCustomLibrary(customLibrary.map(f => (f.id === folderId ? { ...f, spriteFolderKind: kind } : f)));
  };
  const addSprite = () => {
    if (!charFolderId) return;
    const folder = customLibrary.find(f => f.id === charFolderId);
    const baseName = (folder?.name || '未知角色').trim() || '未知角色';
    // 在合集内部按某个角色视图下新增立绘时，优先使用当前角色名作为 characterName
    const characterName = (collectionCharFilter || '').trim() || baseName;
    const newSprite: CustomSprite = {
      id: `s_${Date.now()}`,
      characterName,
      outfit: '常服',
      expression: '默认',
      imageUrl: 'https://via.placeholder.com/300x600',
      isFallback: false,
      avatarScale: 1,
      avatarX: 0,
      avatarY: 0,
    };
    onUpdateCustomLibrary(
      customLibrary.map(f => (f.id === charFolderId ? { ...f, sprites: [...f.sprites, newSprite] } : f)),
    );
  };
  const updateSprite = (sid: string, field: keyof CustomSprite, val: any) => {
    if (!charFolderId) return;
    onUpdateCustomLibrary(
      customLibrary.map(f =>
        f.id === charFolderId ? { ...f, sprites: f.sprites.map(s => (s.id === sid ? { ...s, [field]: val } : s)) } : f,
      ),
    );
  };
  const deleteSprite = (sid: string) => {
    if (!charFolderId) return;
    onUpdateCustomLibrary(
      customLibrary.map(f => (f.id === charFolderId ? { ...f, sprites: f.sprites.filter(s => s.id !== sid) } : f)),
    );
  };
  const updateCharSpritesBatch = (ids: string[], field: keyof CustomSprite, val: any) => {
    if (!charFolderId || ids.length === 0) return;
    onUpdateCustomLibrary(
      customLibrary.map(f =>
        f.id === charFolderId
          ? {
              ...f,
              sprites: f.sprites.map(s => (ids.includes(s.id) ? { ...s, [field]: val } : s)),
            }
          : f,
      ),
    );
  };
  const sortCurrentCharFolderByOutfit = () => {
    if (!charFolderId) return;
    onUpdateCustomLibrary(
      customLibrary.map(f => {
        if (f.id !== charFolderId) return f;
        const sorted = [...f.sprites].sort((a, b) => {
          const outfitA = (a.outfit || '未分类').trim();
          const outfitB = (b.outfit || '未分类').trim();
          if (outfitA === '未分类' && outfitB !== '未分类') return 1;
          if (outfitB === '未分类' && outfitA !== '未分类') return -1;
          const primary = outfitA.localeCompare(outfitB, 'zh-CN');
          if (primary !== 0) return primary;
          const exprA = (a.expression || '').trim();
          const exprB = (b.expression || '').trim();
          return exprA.localeCompare(exprB, 'zh-CN');
        });
        return { ...f, sprites: sorted };
      }),
    );
  };

  const sortCurrentCharFolderByOriginal = () => {
    if (!charFolderId) return;
    onUpdateCustomLibrary(
      customLibrary.map(f => {
        if (f.id !== charFolderId) return f;
        const withIndex = f.sprites.map((s, idx) => ({ s, idx }));
        const getKey = (id: string | undefined, fallbackIdx: number) => {
          if (!id) return fallbackIdx;
          const m = id.match(/(\d+)(?:_(\d+))?$/);
          if (!m) return fallbackIdx;
          const t = parseInt(m[1], 10);
          const k = m[2] !== undefined ? parseInt(m[2], 10) : 0;
          if (Number.isNaN(t)) return fallbackIdx;
          return t * 1_000 + (Number.isNaN(k) ? 0 : k);
        };
        withIndex.sort((a, b) => {
          const ka = getKey(a.s.id, a.idx);
          const kb = getKey(b.s.id, b.idx);
          return ka - kb;
        });
        return { ...f, sprites: withIndex.map(x => x.s) };
      }),
    );
  };

  const sortCurrentCharFolderByExpression = () => {
    if (!charFolderId) return;
    onUpdateCustomLibrary(
      customLibrary.map(f => {
        if (f.id !== charFolderId) return f;
        const sorted = [...f.sprites].sort((a, b) => {
          const exprA = (a.expression || '').trim();
          const exprB = (b.expression || '').trim();

          // 尝试解析形如 "导入_1" / "导入_2" 的前缀 + 数字，按数字排序
          const regex = /^(.*?)(\d+)$/;
          const ma = exprA.match(regex);
          const mb = exprB.match(regex);
          if (ma && mb && ma[1] === mb[1]) {
            const na = parseInt(ma[2], 10);
            const nb = parseInt(mb[2], 10);
            if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
              return na - nb;
            }
          }

          const primary = exprA.localeCompare(exprB, 'zh-CN');
          if (primary !== 0) return primary;
          const outfitA = (a.outfit || '未分类').trim();
          const outfitB = (b.outfit || '未分类').trim();
          return outfitA.localeCompare(outfitB, 'zh-CN');
        });
        return { ...f, sprites: sorted };
      }),
    );
  };
  const normalizeOutfitKey = (name?: string | null) => {
    const key = (name || '未分类').trim();
    return key || '未分类';
  };
  const copyExpressionsBetweenOutfits = (sourceOutfit: string, targetOutfit: string) => {
    if (!charFolderId) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('请先选择一个角色文件夹', '服饰表情复制');
      }
      return;
    }
    const folder = customLibrary.find(f => f.id === charFolderId);
    if (!folder) {
      if (typeof toastr !== 'undefined') {
        toastr.error('未找到当前角色文件夹', '服饰表情复制');
      }
      return;
    }
    const srcKey = normalizeOutfitKey(sourceOutfit);
    const dstKey = normalizeOutfitKey(targetOutfit);
    if (srcKey === dstKey) {
      if (typeof toastr !== 'undefined') {
        toastr.info('源服饰与目标服饰相同，无需复制', '服饰表情复制');
      }
      return;
    }
    const sprites = folder.sprites || [];
    const sourceSprites = sprites.filter(s => normalizeOutfitKey(s.outfit) === srcKey);
    if (sourceSprites.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning(`服饰「${sourceOutfit}」没有任何立绘，无法复制表情`, '服饰表情复制');
      }
      return;
    }
    const targetSprites = sprites.filter(s => normalizeOutfitKey(s.outfit) === dstKey);
    if (targetSprites.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning(`服饰「${targetOutfit}」没有立绘，无法接收表情，请先导入图片`, '服饰表情复制');
      }
      return;
    }
    if (sourceSprites.length !== targetSprites.length) {
      const ok = window.confirm(
        `源服饰（${sourceSprites.length} 张）与目标服饰（${targetSprites.length} 张）数量不一致。\n仍然按序号复制表情？`,
      );
      if (!ok) return;
    }

    const srcList = sourceSprites;
    const targetIds = targetSprites.map(s => s.id);

    const updatedSprites = sprites.map(s => {
      if (normalizeOutfitKey(s.outfit) !== dstKey) return s;
      const idx = targetIds.indexOf(s.id);
      if (idx === -1) return s;
      const srcRef = srcList[Math.min(idx, srcList.length - 1)];
      if (!srcRef) return s;
      return {
        ...s,
        expression: srcRef.expression,
        isFallback: !!srcRef.isFallback,
      };
    });

    onUpdateCustomLibrary(customLibrary.map(f => (f.id === charFolderId ? { ...f, sprites: updatedSprites } : f)));
    if (typeof toastr !== 'undefined') {
      toastr.success(`已将「${sourceOutfit}」的表情复制到「${targetOutfit}」`, '服饰表情复制');
    }
  };

  const renameCollectionCharacter = (collectionFolderId: string, oldName: string, newName: string) => {
    const src = (oldName || '').trim() || '未命名角色';
    const dst = (newName || '').trim();
    if (!dst || src === dst) return;
    onUpdateCustomLibrary(
      customLibrary.map(f => {
        if (f.id !== collectionFolderId) return f;
        const nextSprites = (f.sprites || []).map(s => {
          const key = (s.characterName || '未命名角色').trim() || '未命名角色';
          if (key !== src) return s;
          return { ...s, characterName: dst };
        });
        return { ...f, sprites: nextSprites };
      }),
    );
    if (typeof toastr !== 'undefined') {
      toastr.success(`已将合集内角色「${src}」重命名为「${dst}」`, '角色合集');
    }
  };
  const handleCharBatchImport = () => {
    if (!charFolderId) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('请先选择一个角色文件夹再导入立绘', '批量导入立绘');
      }
      return;
    }
    const raw = charImportText.trim();
    if (!raw) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到任何链接，请先粘贴图片链接', '批量导入立绘');
      }
      return;
    }
    const urls = raw
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    if (urls.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到有效的图片链接', '批量导入立绘');
      }
      return;
    }
    setIsCharImporting(true);
    try {
      const folder = customLibrary.find(f => f.id === charFolderId);
      const now = Date.now();
      const newSprites: CustomSprite[] = urls.map((url, idx) => ({
        id: `imp_${now}_${idx}`,
        characterName: folder?.name || '未知角色',
        outfit: '批量导入',
        expression: `导入_${idx + 1}`,
        imageUrl: url,
        isFallback: false,
        avatarScale: 1,
        avatarX: 0,
        avatarY: 0,
      }));
      onUpdateCustomLibrary(
        customLibrary.map(f => (f.id === charFolderId ? { ...f, sprites: [...f.sprites, ...newSprites] } : f)),
      );
      setCharImportText('');
      setIsCharImportOpen(false);
      if (typeof toastr !== 'undefined') {
        toastr.success(`已导入 ${newSprites.length} 张立绘`, '批量导入立绘');
      }
    } finally {
      setIsCharImporting(false);
    }
  };

  // 设置某张立绘为该服饰的默认立绘：同一角色内，同一 outfit 只允许一个 isFallback=true
  const setCharSpriteAsDefault = (spriteId: string) => {
    if (!charFolderId) return;
    const folder = customLibrary.find(f => f.id === charFolderId);
    if (!folder) return;
    const targetSprite = folder.sprites.find(s => s.id === spriteId);
    if (!targetSprite) return;
    const outfitKey = targetSprite.outfit || '未分类';

    onUpdateCustomLibrary(
      customLibrary.map(f =>
        f.id === charFolderId
          ? {
              ...f,
              sprites: f.sprites.map(s => {
                const key = s.outfit || '未分类';
                if (key === outfitKey) {
                  // 同一服饰组内只保留一个默认
                  return { ...s, isFallback: s.id === spriteId };
                }
                return s;
              }),
            }
          : f,
      ),
    );
  };

  // 设置某张立绘为该角色文件夹的封面（整库角色列表中的预览图）
  const setCharSpriteAsFolderCover = (spriteId: string) => {
    if (!charFolderId) return;
    const folder = customLibrary.find(f => f.id === charFolderId);
    if (!folder) return;
    onUpdateCustomLibrary(
      customLibrary.map(f =>
        f.id === charFolderId
          ? {
              ...f,
              sprites: f.sprites.map(s => ({
                ...s,
                isFolderCover: s.id === spriteId,
              })),
            }
          : f,
      ),
    );
  };

  const toggleCharSpriteSelection = (sid: string) => {
    setSelectedCharSpriteIds(prev => (prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]));
  };

  const clearCharSelection = () => {
    setSelectedCharSpriteIds([]);
  };

  const applyBatchCharOutfit = () => {
    const val = batchCharOutfit.trim();
    if (!val || selectedCharSpriteIds.length === 0) return;
    updateCharSpritesBatch(selectedCharSpriteIds, 'outfit', val);
  };

  // Background Helpers
  const addBgFolder = () => {
    const id = `bgf_${Date.now()}`;
    onUpdateBackgroundLibrary([...backgroundLibrary, { id, name: '新场景集', items: [] }]);
    setBgFolderId(id);
  };
  const updateBgFolder = (id: string, name: string) =>
    onUpdateBackgroundLibrary(backgroundLibrary.map(f => (f.id === id ? { ...f, name } : f)));
  const deleteBgFolder = (id: string) => {
    if (confirm('Delete BG Folder?')) {
      onUpdateBackgroundLibrary(backgroundLibrary.filter(f => f.id !== id));
      if (bgFolderId === id) setBgFolderId(null);
    }
  };

  const addBg = () => {
    if (!bgFolderId) return;
    const newBg: BackgroundItem = {
      id: `bg_${Date.now()}`,
      name: '新场景',
      url: 'https://via.placeholder.com/1920x1080',
    };
    onUpdateBackgroundLibrary(
      backgroundLibrary.map(f => (f.id === bgFolderId ? { ...f, items: [...f.items, newBg] } : f)),
    );
    setBgEditId(newBg.id);
    setBgInputName(newBg.name);
    setBgInputUrl(newBg.url);
  };

  const saveBg = () => {
    if (!bgFolderId || !bgEditId) return;
    onUpdateBackgroundLibrary(
      backgroundLibrary.map(f =>
        f.id === bgFolderId
          ? {
              ...f,
              items: f.items.map(b => (b.id === bgEditId ? { ...b, name: bgInputName, url: bgInputUrl } : b)),
            }
          : f,
      ),
    );
    setBgEditId(null);
  };

  const deleteBg = (id: string) => {
    if (!bgFolderId) return;
    if (confirm('确认删除该背景？'))
      onUpdateBackgroundLibrary(
        backgroundLibrary.map(f => (f.id === bgFolderId ? { ...f, items: f.items.filter(b => b.id !== id) } : f)),
      );
  };

  const sortCurrentBgFolderByName = () => {
    if (!bgFolderId) return;
    onUpdateBackgroundLibrary(
      backgroundLibrary.map(f => {
        if (f.id !== bgFolderId) return f;
        const sorted = [...f.items].sort((a, b) => {
          const nameA = (a.name || '').trim();
          const nameB = (b.name || '').trim();
          if (!nameA && nameB) return 1; // 无名的排在后面
          if (!nameB && nameA) return -1;
          return nameA.localeCompare(nameB, 'zh-CN');
        });
        return { ...f, items: sorted };
      }),
    );
  };

  // 移动背景到其他文件夹
  const moveBgToFolder = (bgId: string, sourceFolderId: string, targetFolderId: string) => {
    if (sourceFolderId === targetFolderId) return; // 同一文件夹，无需移动
    const sourceFolder = backgroundLibrary.find(f => f.id === sourceFolderId);
    const targetFolder = backgroundLibrary.find(f => f.id === targetFolderId);
    if (!sourceFolder || !targetFolder) return;

    const bgItem = sourceFolder.items.find(b => b.id === bgId);
    if (!bgItem) return;

    // 从源文件夹移除，添加到目标文件夹
    onUpdateBackgroundLibrary(
      backgroundLibrary.map(f => {
        if (f.id === sourceFolderId) {
          return { ...f, items: f.items.filter(b => b.id !== bgId) };
        } else if (f.id === targetFolderId) {
          return { ...f, items: [...f.items, bgItem] };
        }
        return f;
      }),
    );

    // 如果当前查看的是源文件夹，且移动后为空，可以选择切换到目标文件夹
    if (bgFolderId === sourceFolderId && sourceFolder.items.length === 1) {
      setBgFolderId(targetFolderId);
    }
  };

  const handleBgBatchImport = () => {
    if (!bgFolderId) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('请先选择一个场景集再导入背景', '批量导入背景');
      }
      return;
    }
    const raw = bgImportText.trim();
    if (!raw) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到任何链接，请先粘贴图片链接', '批量导入背景');
      }
      return;
    }
    const urls = raw
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    if (urls.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到有效的图片链接', '批量导入背景');
      }
      return;
    }
    setIsBgImporting(true);
    try {
      const now = Date.now();
      const newBgs = urls.map((url, i) => ({ id: `bg_imp_${now}_${i}`, name: `导入_${i + 1}`, url }));
      onUpdateBackgroundLibrary(
        backgroundLibrary.map(f => (f.id === bgFolderId ? { ...f, items: [...f.items, ...newBgs] } : f)),
      );
      setBgImportText('');
      setIsBgImportOpen(false);
      if (typeof toastr !== 'undefined') {
        toastr.success(`已导入 ${newBgs.length} 张背景图片`, '批量导入背景');
      }
    } finally {
      setIsBgImporting(false);
    }
  };

  // CG Helpers
  const addCgFolder = () => {
    const id = `cgf_${Date.now()}`;
    onUpdateCgLibrary([...cgLibrary, { id, name: '新CG集', items: [] }]);
    setCgFolderId(id);
  };
  const updateCgFolder = (id: string, name: string) =>
    onUpdateCgLibrary(cgLibrary.map(f => (f.id === id ? { ...f, name } : f)));
  const deleteCgFolder = (id: string) => {
    if (confirm('确认删除该CG集？')) {
      onUpdateCgLibrary(cgLibrary.filter(f => f.id !== id));
      if (cgFolderId === id) setCgFolderId(null);
    }
  };

  // CG Set / Album Helpers（图集在文件夹内）
  const addCgSet = () => {
    if (!cgFolderId) return;
    const id = `cgs_${Date.now()}`;
    const next: CGSet = { id, name: '新图集', itemIds: [], keywords: [], mode: 'sequence', nsfw: false };
    onUpdateCgLibrary(cgLibrary.map(f => (f.id === cgFolderId ? { ...f, sets: [...(f.sets || []), next] } : f)));
    setCgSetId(id);
  };
  const deleteCgSet = (folderId: string, setId: string) => {
    if (!confirm('确认删除该CG图集？')) return;
    onUpdateCgLibrary(
      cgLibrary.map(f => (f.id === folderId ? { ...f, sets: (f.sets || []).filter(s => s.id !== setId) } : f)),
    );
    if (cgSetId === setId) setCgSetId(null);
  };
  const updateCgSet = (folderId: string, setId: string, patch: Partial<CGSet>) => {
    onUpdateCgLibrary(
      cgLibrary.map(f =>
        f.id === folderId ? { ...f, sets: (f.sets || []).map(s => (s.id === setId ? { ...s, ...patch } : s)) } : f,
      ),
    );
  };
  const addCgToSet = (folderId: string, setId: string, cgId: string) => {
    const folder = cgLibrary.find(f => f.id === folderId);
    const target = folder?.sets?.find(s => s.id === setId);
    if (!target || target.itemIds.includes(cgId)) return;
    updateCgSet(folderId, setId, { itemIds: [...target.itemIds, cgId] });
  };
  const removeCgFromSet = (folderId: string, setId: string, cgId: string) => {
    const folder = cgLibrary.find(f => f.id === folderId);
    const target = folder?.sets?.find(s => s.id === setId);
    if (!target) return;
    updateCgSet(folderId, setId, { itemIds: target.itemIds.filter(id => id !== cgId) });
  };
  const moveCgInSet = (folderId: string, setId: string, from: number, to: number) => {
    const folder = cgLibrary.find(f => f.id === folderId);
    const target = folder?.sets?.find(s => s.id === setId);
    if (!target) return;
    const arr = [...target.itemIds];
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    updateCgSet(folderId, setId, { itemIds: arr });
  };
  const sortCgInSet = (folderId: string, setId: string, by: 'nsfw' | 'vertical' | 'name' | 'time') => {
    const folder = cgLibrary.find(f => f.id === folderId);
    const target = folder?.sets?.find(s => s.id === setId);
    if (!target || target.itemIds.length === 0) return;
    const map = new Map<string, CGItem>();
    cgLibrary.forEach(f => f.items.forEach(i => map.set(i.id, i)));
    const sorted = [...target.itemIds].sort((a, b) => {
      const itemA = map.get(a);
      const itemB = map.get(b);
      if (by === 'name') {
        const nameA = (itemA?.name || '').toLowerCase();
        const nameB = (itemB?.name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'zh-CN');
      }
      if (by === 'time') {
        const numA = itemA?.id ? parseInt((itemA.id.match(/\d{10,}/) || ['0'])[0], 10) : 0;
        const numB = itemB?.id ? parseInt((itemB.id.match(/\d{10,}/) || ['0'])[0], 10) : 0;
        return numB - numA; // 新 → 旧
      }
      const valA = by === 'nsfw' ? (itemA?.nsfw ? 1 : 0) : itemA?.isVertical ? 1 : 0;
      const valB = by === 'nsfw' ? (itemB?.nsfw ? 1 : 0) : itemB?.isVertical ? 1 : 0;
      return valB - valA;
    });
    updateCgSet(folderId, setId, { itemIds: sorted });
  };
  const sortCgFolderItems = (folderId: string, by: 'nsfw' | 'vertical' | 'name' | 'time') => {
    const folder = cgLibrary.find(f => f.id === folderId);
    if (!folder || folder.items.length === 0) return;
    const sorted = [...folder.items].sort((a, b) => {
      if (by === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'zh-CN');
      }
      if (by === 'time') {
        const numA = a.id ? parseInt((a.id.match(/\d{10,}/) || ['0'])[0], 10) : 0;
        const numB = b.id ? parseInt((b.id.match(/\d{10,}/) || ['0'])[0], 10) : 0;
        return numB - numA; // 新 → 旧
      }
      const valA = by === 'nsfw' ? (a.nsfw ? 1 : 0) : a.isVertical ? 1 : 0;
      const valB = by === 'nsfw' ? (b.nsfw ? 1 : 0) : b.isVertical ? 1 : 0;
      return valB - valA;
    });
    onUpdateCgLibrary(cgLibrary.map(f => (f.id === folderId ? { ...f, items: sorted } : f)));
  };

  const addCgItem = () => {
    if (!cgFolderId) return;
    const newItem: CGItem = {
      id: `cg_${Date.now()}`,
      name: '新CG',
      url: 'https://via.placeholder.com/1920x1080',
      keywords: [],
      nsfw: false,
      isVertical: false,
    };
    onUpdateCgLibrary(cgLibrary.map(f => (f.id === cgFolderId ? { ...f, items: [...f.items, newItem] } : f)));
    // Auto enter edit mode
    setCgEditId(newItem.id);
    setCgInputName(newItem.name);
    setCgInputUrl(newItem.url);
    setCgInputTriggerContent('');
    setCgInputCgTagId('');
    setCgInputNsfw(false);
    setCgInputIsVertical(false);
  };

  const saveCgItem = () => {
    if (!cgFolderId || !cgEditId) return;
    const tag = cgInputCgTagId.trim();
    const keywords = tag ? [tag] : [];
    const tc = cgInputTriggerContent.trim();
    onUpdateCgLibrary(
      cgLibrary.map(f =>
        f.id === cgFolderId
          ? {
              ...f,
              items: f.items.map(i =>
                i.id === cgEditId
                  ? {
                      ...i,
                      name: cgInputName,
                      url: cgInputUrl,
                      keywords,
                      cgTagId: tag || undefined,
                      triggerContent: tc || undefined,
                      nsfw: cgInputNsfw,
                      isVertical: cgInputIsVertical,
                    }
                  : i,
              ),
            }
          : f,
      ),
    );
    setCgEditId(null);
  };

  const deleteCgItem = (itemId: string) => {
    if (!cgFolderId) return;
    onUpdateCgLibrary(
      cgLibrary.map(f => (f.id === cgFolderId ? { ...f, items: f.items.filter(i => i.id !== itemId) } : f)),
    );
  };

  const handleApplyCG = (cg: CGItem) => {
    onSetCG(cg);
    onClose(); // Optional: close after selection
  };

  const handleCgBatchImport = () => {
    if (!cgFolderId) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('请先选择一个 CG 集再导入图片', '批量导入 CG');
      }
      return;
    }
    const raw = cgImportText.trim();
    if (!raw) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到任何链接，请先粘贴图片链接', '批量导入 CG');
      }
      return;
    }
    const urls = raw
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    if (urls.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有检测到有效的图片链接', '批量导入 CG');
      }
      return;
    }
    setIsCgImporting(true);
    try {
      const now = Date.now();
      const newItems: CGItem[] = urls.map((url, i) => ({
        id: `cgi_${now}_${i}`,
        name: `导入_${i + 1}`,
        url,
        keywords: [],
        nsfw: false,
        isVertical: false,
      }));
      onUpdateCgLibrary(cgLibrary.map(f => (f.id === cgFolderId ? { ...f, items: [...f.items, ...newItems] } : f)));
      setCgImportText('');
      setIsCgImportOpen(false);
      if (typeof toastr !== 'undefined') {
        toastr.success(`已导入 ${newItems.length} 张 CG`, '批量导入 CG');
      }
    } finally {
      setIsCgImporting(false);
    }
  };

  // --- DATA IO ---
  // Robust Full Backup
  const handleBackupDatabase = () => {
    const fullDB = {
      type: 'SPIRIT_COMMAND_FULL_DB',
      version: '3.4',
      timestamp: Date.now(),
      customLibrary: customLibrary,
      backgroundLibrary: backgroundLibrary,
      cgLibrary: cgLibrary,
    };
    const blob = new Blob([JSON.stringify(fullDB, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `武侦连_图库_完整备份_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const charImportFileRef = useRef<HTMLInputElement | null>(null);
  const bgImportFileRef = useRef<HTMLInputElement | null>(null);
  const cgImportFileRef = useRef<HTMLInputElement | null>(null);

  const handleExportCharactersOnly = () => {
    const payload = { type: 'SPIRIT_COMMAND_CHAR_LIB', version: '3.4', timestamp: Date.now(), customLibrary };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `武侦连_立绘库_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportBackgroundsOnly = () => {
    const payload = { type: 'SPIRIT_COMMAND_BG_LIB', version: '3.4', timestamp: Date.now(), backgroundLibrary };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `武侦连_背景库_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCgOnly = () => {
    const payload = { type: 'SPIRIT_COMMAND_CG_LIB', version: '3.4', timestamp: Date.now(), cgLibrary };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `武侦连_CG库_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCharactersOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        let nextLibrary = customLibrary;

        if (Array.isArray(json)) {
          // 立绘合集：将数组视为若干角色文件夹，合并为一个合集文件夹
          // 同时确保每张立绘都带有 characterName（若原本没有，则用文件夹名补上），
          // 以便在「合集视图」中按角色名正确分组显示。
          const mergedSprites: CustomSprite[] = [];
          json.forEach((folder: any) => {
            const folderName = (folder?.name || '').trim() || '未命名角色';
            if (Array.isArray(folder?.sprites)) {
              folder.sprites.forEach((raw: any) => {
                const sprite: CustomSprite = {
                  ...raw,
                  characterName: (raw?.characterName || '').trim() || folderName,
                };
                mergedSprites.push(sprite);
              });
            }
          });
          if (mergedSprites.length === 0) {
            throw new Error('JSON 根为数组，但未找到任何 sprites');
          }
          const baseNameRaw = (file.name || '导入合集').replace(/\.json$/i, '');
          const baseName = baseNameRaw.includes('淫乱军营') ? '合集·淫乱军营' : `合集·${baseNameRaw}`;
          const newId = `collection_${Date.now()}`;
          const collectionFolder: CustomFolder = {
            id: newId,
            name: baseName,
            sprites: mergedSprites,
          };
          nextLibrary = [...customLibrary, collectionFolder];
          // 自动选中新建的合集并清空搜索，方便用户看到
          setSearchQuery('');
          setCharFolderId(newId);
        } else {
          const nextCustom = Array.isArray(json?.customLibrary)
            ? json.customLibrary
            : Array.isArray(json?.characters)
              ? json.characters
              : null;
          if (!nextCustom) throw new Error('JSON 中没有合法的 customLibrary / characters 字段');
          nextLibrary = nextCustom;
        }

        onUpdateCustomLibrary(nextLibrary);
        if (typeof toastr !== 'undefined') {
          toastr.success('已导入立绘库 / 立绘合集', '导入立绘');
        }
      } catch (err) {
        console.error('[AssetLibrary] 导入立绘库失败', err);
        if (typeof toastr !== 'undefined') {
          toastr.error('导入立绘失败，请检查文件格式', '导入立绘');
        }
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImportBackgroundsOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const nextBg = Array.isArray(json?.backgroundLibrary)
          ? json.backgroundLibrary
          : Array.isArray(json?.backgrounds)
            ? json.backgrounds
            : null;
        if (!nextBg) throw new Error('JSON 中没有合法的 backgroundLibrary / backgrounds 字段');
        onUpdateBackgroundLibrary(nextBg);
        if (typeof toastr !== 'undefined') {
          toastr.success('已导入背景库（backgroundLibrary）', '导入背景');
        }
      } catch (err) {
        console.error('[AssetLibrary] 导入背景库失败', err);
        if (typeof toastr !== 'undefined') {
          toastr.error('导入背景失败，请检查文件格式', '导入背景');
        }
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImportCgOnly = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const nextCg =
          normalizeCgLibraryImportPayload(json?.cgLibrary) ?? normalizeCgLibraryImportPayload(json?.cgs);
        if (!nextCg || nextCg.length === 0) throw new Error('JSON 中没有合法的 cgLibrary / cgs 字段（须为文件夹数组或单个含 items 的文件夹对象）');
        onUpdateCgLibrary(nextCg);
        if (typeof toastr !== 'undefined') {
          toastr.success('已导入 CG 库（cgLibrary）', '导入 CG');
        }
      } catch (err) {
        console.error('[AssetLibrary] 导入 CG 库失败', err);
        if (typeof toastr !== 'undefined') {
          toastr.error('导入 CG 失败，请检查文件格式', '导入 CG');
        }
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 合集判定与创建：合集本质是文件夹；判定规则：id 以 collection_ 开头 或 名称以「合集」开头
  const isCollectionFolder = (f: CustomFolder | undefined | null) => {
    const id = String(f?.id || '')
      .trim()
      .toLowerCase();
    const name = (f?.name || '').trim();
    return id.startsWith('collection_') || (!!name && name.startsWith('合集'));
  };

  /** 将某个角色文件夹的立绘「移动」到合集文件夹中（源文件夹立绘会被清空） */
  const mergeFolderIntoCollection = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const source = customLibrary.find(f => f.id === sourceId);
    const target = customLibrary.find(f => f.id === targetId);
    if (!source || !target) return;
    const sourceName = (source.name || '未命名角色').trim() || '未命名角色';
    const next: CustomFolder[] = [];
    customLibrary.forEach(f => {
      if (f.id === targetId) {
        // 在目标合集末尾追加所有立绘
        const patchedSprites = (source.sprites || []).map(s => ({
          ...s,
          characterName: (s.characterName || '').trim() || sourceName,
        }));
        next.push({ ...f, sprites: [...(f.sprites || []), ...patchedSprites] });
      } else if (f.id === sourceId) {
        // 源角色文件夹被视为「搬空后删除」，不再保留空壳
        return;
      } else {
        next.push(f);
      }
    });
    onUpdateCustomLibrary(next);
    if (typeof toastr !== 'undefined') {
      const moved = source.sprites?.length ?? 0;
      toastr.success(`已将「${source.name}」的 ${moved} 张立绘移动到「${target.name}」`, '角色合集');
    }
  };

  /** 解散整个合集：将合集内的每个角色分组拆成独立角色文件夹，合集本身被删除 */
  const disbandCollectionFolder = (collectionId: string) => {
    const folder = customLibrary.find(f => f.id === collectionId);
    if (!folder || !isCollectionFolder(folder)) return;
    const sprites = folder.sprites || [];
    if (sprites.length === 0) {
      // 空合集，直接删除
      onUpdateCustomLibrary(customLibrary.filter(f => f.id !== collectionId));
      if (typeof toastr !== 'undefined') {
        toastr.info('空合集已删除', '角色合集');
      }
      return;
    }
    const byChar = sprites.reduce<Record<string, CustomSprite[]>>((acc, s) => {
      const key = (s.characterName || '未命名角色').trim() || '未命名角色';
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {});
    const timestamp = Date.now();
    const newFolders: CustomFolder[] = Object.keys(byChar).map((name, idx) => ({
      id: `f_${timestamp}_${idx}`,
      name,
      sprites: byChar[name],
    }));
    const next: CustomFolder[] = [];
    customLibrary.forEach(f => {
      if (f.id === collectionId) return; // 跳过原合集
      next.push(f);
    });
    next.push(...newFolders);
    onUpdateCustomLibrary(next);
    setCharFolderId(null);
    setCollectionCharFilter(null);
    if (typeof toastr !== 'undefined') {
      toastr.success(`合集「${folder.name}」已解散为 ${newFolders.length} 个角色文件夹`, '角色合集');
    }
  };

  const createCharCollectionFolder = (nameInput: string) => {
    const raw = (nameInput || '').trim();
    if (!raw) return;
    const id = `collection_${Date.now()}`;
    const baseName = raw.startsWith('合集') ? raw : `合集·${raw}`;
    const next = [...customLibrary, { id, name: baseName, sprites: [] }];
    onUpdateCustomLibrary(next);
    setSearchQuery('');
    setCharFolderId(id);
    setCollectionCharFilter(null);
    if (typeof toastr !== 'undefined') {
      toastr.success(`已新建合集「${baseName}」`, '角色合集');
    }
  };

  /** 将当前合集中的单个角色「抽离」出来，变成普通角色文件夹 */
  const extractCurrentCharFromCollection = () => {
    if (!currentCharFolderIsCollection || !collectionCharFilter) return;
    const folder = currentCharFolder;
    if (!folder) return;
    const key = collectionCharFilter.trim() || '未命名角色';
    const sprites = folder.sprites || [];
    const moving: CustomSprite[] = [];
    const remaining: CustomSprite[] = [];
    sprites.forEach(s => {
      const name = (s.characterName || '未命名角色').trim();
      if (name === key) {
        moving.push(s);
      } else {
        remaining.push(s);
      }
    });
    if (moving.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('该角色在合集内没有可移动的立绘', '角色合集');
      }
      return;
    }
    const newId = `f_${Date.now()}`;
    const newFolder: CustomFolder = {
      id: newId,
      name: key,
      sprites: moving,
    };
    const next = customLibrary.map(f => (f.id === folder.id ? { ...f, sprites: remaining } : f));
    next.push(newFolder);
    onUpdateCustomLibrary(next);
    setCharFolderId(newId);
    setCollectionCharFilter(null);
    setSelectedSprite(null);
    if (typeof toastr !== 'undefined') {
      toastr.success(`已将「${key}」从合集「${folder.name}」移出为独立角色`, '角色合集');
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // Case 1: Full Gallery Restore
        if (json.type === 'SPIRIT_COMMAND_FULL_DB') {
          if (
            confirm(
              `检测到完整图库备份 (${new Date(json.timestamp).toLocaleString()})。\n该操作将覆盖当前的【所有】立绘、背景和CG数据。\n是否继续？`,
            )
          ) {
            // Robust check for property names to support older backups
            const newChars = json.customLibrary || json.characters || json.sprites;
            const newBgs = json.backgroundLibrary || json.backgrounds;
            const newCgs = json.cgLibrary || json.cgs;
            const newCgSets = json.cgSets; // legacy

            if (newChars) onUpdateCustomLibrary(newChars);
            // Handle BG Migration if needed (from Array<Item> to Array<Folder>)
            if (newBgs) {
              if (Array.isArray(newBgs) && newBgs.length > 0 && !('items' in newBgs[0])) {
                onUpdateBackgroundLibrary([{ id: 'migrated_restore', name: '恢复备份', items: newBgs }]);
              } else {
                onUpdateBackgroundLibrary(newBgs);
              }
            }
            if (newCgs) {
              const normCg = normalizeCgLibraryImportPayload(newCgs);
              if (normCg && normCg.length > 0) onUpdateCgLibrary(normCg);
            }
            if (Array.isArray(newCgSets) && newCgSets.length > 0) {
              const lib = cgLibrary.length ? cgLibrary : [{ id: 'cg_import', name: '导入', items: [], sets: [] }];
              onUpdateCgLibrary(lib.map((f, i) => (i === 0 ? { ...f, sets: [...(f.sets || []), ...newCgSets] } : f)));
            }

            alert('图库已完整恢复');
          }
          return;
        }

        // Case 1.5: CG Pack { cgLibrary, cgSets? }
        if (activeTab === 'cg' && (json.cgLibrary || json.cgSets)) {
          const normalizedLib = normalizeCgLibraryImportPayload(json.cgLibrary);
          let lib = normalizedLib && normalizedLib.length > 0 ? normalizedLib : cgLibrary;
          if (Array.isArray(json.cgSets) && json.cgSets.length > 0 && lib.length > 0) {
            lib = lib.map((f, i) => (i === 0 ? { ...f, sets: [...(f.sets || []), ...json.cgSets] } : f));
          }
          onUpdateCgLibrary(lib.length ? lib : cgLibrary);
          alert('CG 数据导入成功');
          onClose();
          return;
        }

        // Case 2: Array Import (Append to Current Tab)
        if (Array.isArray(json)) {
          if (activeTab === 'character') {
            onUpdateCustomLibrary([...customLibrary, ...json]);
            alert('成功：已将数据追加到角色库');
          } else if (activeTab === 'background') {
            // Check structure
            if (json.length > 0 && !('items' in json[0])) {
              // Flat list import -> wrap or append? If appending to folders... no, it's append folders.
              alert('导入格式为旧版背景列表，请手动创建文件夹并导入图片链接。');
            } else {
              onUpdateBackgroundLibrary([...backgroundLibrary, ...json]);
              alert('成功：已将数据追加到背景库');
            }
          } else if (activeTab === 'cg') {
            onUpdateCgLibrary([...cgLibrary, ...json]);
            alert('成功：已将数据追加到CG库');
          }
        } else {
          alert("错误：无法识别的文件格式。请确保是 'SPIRIT_COMMAND_FULL_DB' 备份或标准数组格式。");
        }
      } catch (err) {
        alert('严重错误：JSON 解析失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- FILTERING ---
  const filteredCharFolders = customLibrary.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentCharFolder = customLibrary.find(f => f.id === charFolderId);
  const currentCharFolderIsCollection = isCollectionFolder(currentCharFolder);

  const filteredBgFolders = backgroundLibrary.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentBgFolder = backgroundLibrary.find(f => f.id === bgFolderId);
  const filteredBgItems = useMemo(() => {
    const items = currentBgFolder?.items ?? [];
    if (!bgLocationSearch.trim()) return items;
    const q = bgLocationSearch.toLowerCase().trim();
    return items.filter(b => b.name.toLowerCase().includes(q));
  }, [currentBgFolder?.items, bgLocationSearch]);

  const filteredCgFolders = cgLibrary.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentCgFolder = cgLibrary.find(f => f.id === cgFolderId);
  const currentCgSet = currentCgFolder?.sets?.find(s => s.id === cgSetId) || null;

  const cgIdToItem = (() => {
    const map = new Map<string, CGItem>();
    cgLibrary.forEach(folder => folder.items.forEach(item => map.set(item.id, item)));
    return map;
  })();

  const [showHelp, setShowHelp] = useState(false);

  // --- RENDER HEADER ---
  const renderHeader = () => (
    <div className={`h-16 border-b flex justify-between items-center px-6 shrink-0 ${ts.header}`}>
      <h2
        className={`font-bold tracking-widest text-lg flex items-center gap-2 ${ts.accentText}`}
        style={inkTitleStyle}
      >
        <span className="text-xl">🖼️</span> 图库
      </h2>
      <div className="flex h-full items-end gap-1 px-4">
        {[
          { id: 'character', label: '立绘' },
          { id: 'background', label: '背景' },
          { id: 'cg', label: 'CG图' },
          { id: 'triggers', label: '触发词' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSearchQuery('');
            }}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-t transition-all ${activeTab === tab.id ? ts.tabActive : ts.tabInactive}`}
            style={inkTitleStyle}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowHelp(true)}
          className="text-xs font-bold opacity-70 hover:opacity-100 flex items-center gap-1 bg-white/5 px-2 py-1 rounded hover:bg-white/10"
          title="查看图库功能说明"
        >
          ❔ 界面说明
        </button>
        {onForceSave && (
          <button
            onClick={onForceSave}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold flex gap-1 shadow-md hover:scale-105 transition-transform"
            title="立即将当前内存中的修改写入浏览器缓存"
          >
            <span>💾</span> 强制保存
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('警告：此操作将清空所有数据！(Reset all to default?)')) {
              onUpdateCustomLibrary([]);
              onUpdateBackgroundLibrary([]);
              onUpdateCgLibrary([]);
            }
          }}
          className="text-red-500 hover:text-red-400 text-xs font-bold border border-red-500/30 px-2 py-1 rounded"
        >
          ↻ 重置
        </button>
        <div className="h-6 w-px bg-white/10 mx-1"></div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-bold opacity-60 hover:opacity-100 flex gap-1 bg-white/5 px-2 py-1 rounded hover:bg-white/10"
        >
          📥 导入 JSON
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJson} />
        <input
          type="file"
          ref={charImportFileRef}
          className="hidden"
          accept=".json"
          onChange={handleImportCharactersOnly}
        />
        <input
          type="file"
          ref={bgImportFileRef}
          className="hidden"
          accept=".json"
          onChange={handleImportBackgroundsOnly}
        />
        <input type="file" ref={cgImportFileRef} className="hidden" accept=".json" onChange={handleImportCgOnly} />

        <button
          onClick={handleBackupDatabase}
          className="text-xs font-bold opacity-60 hover:opacity-100 flex gap-1 bg-white/5 px-2 py-1 rounded hover:bg-white/10"
          title="导出完整图库（立绘、背景、CG）"
        >
          📤 导出 JSON
        </button>
        <ModalCloseX variant="inline" onClose={onClose} />
      </div>
    </div>
  );

  if (!isOpen) return null;

  const isMobile = isMobileLayout ?? false;
  const inkBgStyle =
    theme === 'ink-jianghu'
      ? {
          backgroundImage: `url(${inkJianghuExternalUrls.baseBg})`,
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
  const inkTitleStyle =
    theme === 'ink-jianghu' ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full ${isMobile ? 'max-w-[min(96vw,960px)] h-[94vh]' : 'max-w-[min(98vw,1240px)] h-[86vh]'} rounded-xl shadow-2xl overflow-hidden flex flex-col border ${ts.modalBg}`}
        onClick={e => e.stopPropagation()}
        style={inkBgStyle}
      >
        {renderHeader()}

        {showHelp && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowHelp(false)}
          >
            <div
              className="max-w-3xl w-full bg-slate-950/95 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden text-slate-100 text-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-3 border-b border-emerald-500/40 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-emerald-400">ASSET GUIDE</div>
                  <div className="text-base font-bold mt-1">图库界面说明</div>
                </div>
                <button className="text-xs text-slate-400 hover:text-slate-100" onClick={() => setShowHelp(false)}>
                  关闭
                </button>
              </div>
              <div className="px-5 py-4 space-y-3 text-[13px] leading-relaxed">
                <p className="text-emerald-300 font-semibold">立绘（角色立绘）</p>
                <p>在「立绘」页签中，每个角色文件夹下面可以新增多张立绘图片。每张立绘卡片上：</p>
                <ul className="list-disc list-inside space-y-1 text-slate-200">
                  <li>最上方的「设为默认」用于指定该服饰下的默认立绘；VN 文本中写该角色名字时，会优先使用默认立绘。</li>
                  <li>
                    下方三个输入框依次是：<b>服饰</b>（如「西装」「便服」）、<b>表情/动作</b>（如「开心」「生气」）、
                    <b>图片链接</b>。
                  </li>
                  <li>
                    在管道格式 <code>孙卫东|锁务室|null|作训服|严肃|对白</code>{' '}
                    中，第三列服饰、第四列表情会去匹配这里的「服饰 / 表情」字段以切换立绘。
                  </li>
                </ul>
                <p className="text-emerald-300 font-semibold mt-3">背景</p>
                <p>「背景」页签中管理所有可选场景背景：</p>
                <ul className="list-disc list-inside space-y-1 text-slate-200">
                  <li>
                    背景的<b>名称</b>需要与你正文或事件表中的「场景 / 地点」保持一致，例如「酒吧」「公寓卧室」。
                  </li>
                  <li>时间卡的 VISUAL 按钮会根据最新正文里的场景名，在这里查找同名背景并切换。</li>
                </ul>
                <p className="text-emerald-300 font-semibold mt-3">CG 图</p>
                <p>「CG 图」页签中：</p>
                <ul className="list-disc list-inside space-y-1 text-slate-200">
                  <li>
                    素材池保存所有单张 CG；可填「触发内容」「cg id」、NSFW、竖版；正文可写{' '}
                    <code className="text-emerald-200/90">&lt;cg id=编号&gt;</code> 或管道第三列{' '}
                    <code className="text-emerald-200/90">CG:编号</code>。
                  </li>
                  <li>图集（Set）用于组合多张 CG：顺序模式会按顺序播放，随机模式则随机抽取一张。</li>
                  <li>
                    图集可填「触发内容」「cg id」，并可勾选 NSFW 标记整集；管道或事件表中的 CG
                    字段会优先匹配图集，再匹配单张 CG。
                  </li>
                </ul>
                <p className="text-[11px] text-slate-400 mt-2">
                  提示：修改完成后可使用右上角「强制保存」按钮，将当前图库完整写入浏览器缓存。
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
          <div
            className={`flex-1 min-w-0 flex overflow-hidden ${ts.content}`}
            onClick={() => {
              setSelectedSprite(null);
              setSelectedBgForPreview(null);
              setSelectedCgForPreview(null);
            }}
          >
          {/* --- CHARACTERS TAB --- */}
          {activeTab === 'character' && (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/20">
                {currentCharFolder ? (
                  currentCharFolderIsCollection && !collectionCharFilter ? (
                    // 合集：第一层先按角色名分组，显示为角色卡片
                    <div className="space-y-6">
                      <div className="flex justify-between items-center pb-4 border-b border-white/10">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              setCharFolderId(null);
                              setSelectedSprite(null);
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold hover:bg-white/10 transition-colors ${ts.accentText}`}
                            title="返回角色列表"
                          >
                            ← 返回
                          </button>
                          <span className={`text-xl font-black px-1 ${ts.accentText}`}>{currentCharFolder.name}</span>
                          <span className="text-xs opacity-50 font-mono">
                            {currentCharFolder.sprites.length} 张立绘 · 合集视图
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const byChar = (currentCharFolder.sprites || []).reduce<Record<string, CustomSprite[]>>(
                          (acc, s) => {
                            const key = (s.characterName || '未命名角色').trim();
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(s);
                            return acc;
                          },
                          {},
                        );
                        const charNames = Object.keys(byChar);
                        if (charNames.length === 0) {
                          return <div className="text-center text-xs opacity-60 py-10">该合集下暂无任何角色立绘。</div>;
                        }
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {charNames.map(name => {
                              const list = byChar[name];
                              const preview =
                                list.find(s => s.isFolderCover) || list.find(s => s.isFallback) || list[0];
                              const isEditing = editingCollectionCharName === name;
                              return (
                                <div
                                  key={name || 'unnamed'}
                                  className={`group relative p-3 rounded-xl border-2 cursor-pointer transition-all hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 ${ts.item}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setCollectionCharFilter(name);
                                    setSelectedSprite(null);
                                  }}
                                >
                                  <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-slate-700/40 relative">
                                    {preview?.imageUrl ? (
                                      <SpriteImg
                                        src={preview.imageUrl}
                                        alt={name}
                                        className="w-full h-full object-cover object-top"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                        无预览
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {isEditing ? (
                                      <div
                                        className="flex items-center gap-1 w-full"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <input
                                          value={editingCollectionCharValue}
                                          onChange={e => setEditingCollectionCharValue(e.target.value)}
                                          className={`flex-1 min-w-0 px-2 py-1 rounded border text-xs ${ts.input}`}
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              renameCollectionCharacter(
                                                currentCharFolder.id,
                                                name,
                                                editingCollectionCharValue,
                                              );
                                              setEditingCollectionCharName(null);
                                            } else if (e.key === 'Escape') {
                                              setEditingCollectionCharName(null);
                                            }
                                          }}
                                          onBlur={() => {
                                            renameCollectionCharacter(
                                              currentCharFolder.id,
                                              name,
                                              editingCollectionCharValue,
                                            );
                                            setEditingCollectionCharName(null);
                                          }}
                                        />
                                        <button
                                          type="button"
                                          className="w-7 h-7 rounded flex items-center justify-center text-[12px] bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
                                          title="保存"
                                          onClick={() => {
                                            renameCollectionCharacter(
                                              currentCharFolder.id,
                                              name,
                                              editingCollectionCharValue,
                                            );
                                            setEditingCollectionCharName(null);
                                          }}
                                        >
                                          ✓
                                        </button>
                                        <button
                                          type="button"
                                          className="w-7 h-7 rounded flex items-center justify-center text-[12px] border border-white/20 text-slate-200 hover:bg-white/10 shrink-0"
                                          title="取消"
                                          onClick={() => setEditingCollectionCharName(null)}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="text-xs font-bold truncate flex-1">{name}</div>
                                        <button
                                          type="button"
                                          className="text-[11px] opacity-60 hover:opacity-100 px-1 shrink-0"
                                          title="重命名该角色（仅影响此合集内分组）"
                                          onClick={e => {
                                            e.stopPropagation();
                                            setEditingCollectionCharName(name);
                                            setEditingCollectionCharValue(name);
                                          }}
                                        >
                                          ✏️
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-[10px] opacity-60">{list.length} 张立绘</div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-3 pb-4 border-b border-white/10">
                        <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              if (currentCharFolderIsCollection && collectionCharFilter) {
                                // 合集内部从某个角色的立绘视图返回到角色列表
                                setCollectionCharFilter(null);
                                setSelectedSprite(null);
                              } else {
                                setCharFolderId(null);
                                setSelectedSprite(null);
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold hover:bg-white/10 transition-colors ${ts.accentText}`}
                            title={
                              currentCharFolderIsCollection && collectionCharFilter
                                ? '返回合集内角色列表'
                                : '返回角色列表'
                            }
                          >
                            ← 返回
                          </button>
                          <input
                            value={currentCharFolder.name}
                            onChange={e => updateCharFolder(currentCharFolder.id, e.target.value)}
                            className={`text-xl font-black bg-transparent border-b border-transparent hover:border-white/30 focus:border-emerald-500 focus:outline-none px-1 ${ts.input}`}
                          />
                          <span className="text-xs opacity-50 font-mono">
                            {currentCharFolder.sprites.length} 张立绘
                            {currentCharFolderIsCollection && collectionCharFilter
                              ? ` · 当前角色：${collectionCharFilter}`
                              : ''}
                          </span>
                          {currentCharFolder.disabled && (
                            <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">
                              已禁用
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          {currentCharFolderIsCollection && collectionCharFilter && (
                            <button
                              onClick={extractCurrentCharFromCollection}
                              className="px-3 py-2 text-[11px] rounded border border-emerald-400/70 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 font-bold"
                              title="将该角色从当前合集移出，变成独立角色文件夹"
                            >
                              移出为角色
                            </button>
                          )}
                          <button
                            onClick={addSprite}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-md"
                          >
                            + 新成立绘
                          </button>
                          <button
                            onClick={() => setIsCharImportOpen(true)}
                            className="px-4 py-2 border border-white/20 hover:bg-white/10 text-xs font-bold rounded"
                          >
                            批量导入
                          </button>
                          <button
                            onClick={() => {
                              setIsCharMultiSelectMode(prev => {
                                const next = !prev;
                                if (!next) {
                                  setSelectedCharSpriteIds([]);
                                }
                                return next;
                              });
                            }}
                            className={`px-4 py-2 text-xs font-bold rounded border transition-colors ${
                              isCharMultiSelectMode
                                ? 'bg-emerald-500 text-white border-emerald-400'
                                : 'border-white/20 text-slate-100 hover:bg-white/10'
                            }`}
                            title="进入多选模式后，可直接点击立绘进行多选"
                          >
                            {isCharMultiSelectMode ? '多选中（点击退出）' : '多选模式'}
                          </button>
                          <div className="relative" ref={charSortDropdownRef}>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                排序
                              </span>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setCharSortDropdownOpen(prev => !prev);
                                }}
                                className="px-3 py-2 text-[11px] rounded-md border border-slate-300/70 bg-white/10 hover:bg-white/15 text-slate-100 flex items-center justify-between gap-2 min-w-[84px]"
                                title="按服饰 / 表情 / 初始顺序排序立绘"
                              >
                                <span>选择</span>
                                <span className="text-[10px] opacity-80">▼</span>
                              </button>
                            </div>
                            {charSortDropdownOpen && (
                              <div
                                className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-300/40 bg-white text-[12px] shadow-2xl z-100 overflow-hidden"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border-b border-slate-200">
                                  选择排序方式
                                </div>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2.5 hover:bg-slate-100 text-slate-800 flex items-center justify-between"
                                  onClick={() => {
                                    sortCurrentCharFolderByOriginal();
                                    setCharSortDropdownOpen(false);
                                  }}
                                >
                                  <span className="font-bold">初始顺序</span>
                                  <span className="text-[10px] text-slate-500">导入顺序</span>
                                </button>
                                <div className="h-px bg-slate-200" />
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2.5 hover:bg-slate-100 text-slate-800 flex items-center justify-between"
                                  onClick={() => {
                                    sortCurrentCharFolderByOutfit();
                                    setCharSortDropdownOpen(false);
                                  }}
                                >
                                  <span className="font-bold">按服饰排序</span>
                                  <span className="text-[10px] text-slate-500">outfit</span>
                                </button>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2.5 hover:bg-slate-100 text-slate-800 flex items-center justify-between"
                                  onClick={() => {
                                    sortCurrentCharFolderByExpression();
                                    setCharSortDropdownOpen(false);
                                  }}
                                >
                                  <span className="font-bold">按表情排序</span>
                                  <span className="text-[10px] text-slate-500">expression</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={handleExportCharactersOnly}
                            className="px-3 py-2 rounded text-[11px] font-bold border border-white/20 bg-white/5 hover:bg-white/10 opacity-80 hover:opacity-100 flex items-center gap-1"
                            title="仅导出立绘角色库为 JSON 文件"
                          >
                            📤 导出立绘
                          </button>
                        </div>
                      </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className={`text-[11px] font-bold shrink-0 ${ts.accentText}`}>立绘类型</span>
                          <button
                            type="button"
                            onClick={() => setCharFolderSpriteKind(currentCharFolder.id, 'fullbody')}
                            className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                              (currentCharFolder.spriteFolderKind ?? 'fullbody') === 'fullbody'
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : 'border-white/20 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            全身·舞台中央
                          </button>
                          <button
                            type="button"
                            onClick={() => setCharFolderSpriteKind(currentCharFolder.id, 'avatar')}
                            className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                              currentCharFolder.spriteFolderKind === 'avatar'
                                ? 'bg-amber-600 text-white border-amber-500'
                                : 'border-white/20 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            头像·左下角（叠在对话框上）
                          </button>
                          <span className="text-[10px] opacity-55 max-w-[min(100%,320px)] leading-snug">
                            决定管道里该角色显示在舞台中央还是左下角头像层。「系统设置 → 视觉校准」可微调头像位置。
                          </span>
                        </div>
                      </div>

                      {isCharImportOpen && (
                        <div className="p-4 border border-emerald-500/30 bg-emerald-900/10 rounded animate-in fade-in">
                          <textarea
                            value={charImportText}
                            onChange={e => setCharImportText(e.target.value)}
                            className={`w-full h-32 p-2 text-xs font-mono rounded ${ts.input}`}
                            placeholder="请粘贴图片链接，每行一个..."
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setIsCharImportOpen(false)} className="px-3 py-1 text-xs opacity-60">
                              取消
                            </button>
                            <button
                              onClick={handleCharBatchImport}
                              disabled={isCharImporting}
                              className={`px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded ${isCharImporting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-500'}`}
                            >
                              {isCharImporting ? '导入中…' : '导入'}
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedCharSpriteIds.length > 0 && (
                        <div className="mt-3 p-3 border border-emerald-500/30 bg-emerald-900/10 rounded-lg flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                          <div className="text-xs font-bold">
                            已选中 <span className="text-emerald-400">{selectedCharSpriteIds.length}</span> 张立绘
                          </div>
                          <div className="flex flex-1 flex-col sm:flex-row gap-2 items-start sm:items-center">
                            <span className="text-[10px] uppercase tracking-widest opacity-60">批量服饰</span>
                            <div className="flex gap-2 w-full">
                              <input
                                value={batchCharOutfit}
                                onChange={e => setBatchCharOutfit(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className={`flex-1 text-xs px-2 py-1 rounded border ${ts.input}`}
                                placeholder="输入服饰名，应用到所有选中立绘"
                              />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  applyBatchCharOutfit();
                                }}
                                className="px-3 py-1 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                应用
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  clearCharSelection();
                                }}
                                className="px-3 py-1 rounded text-[10px] font-bold border border-white/30 text-slate-200 hover:bg-white/5"
                              >
                                清空选择
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (!currentCharFolder) return;
                                  const sourceSprites =
                                    currentCharFolderIsCollection && collectionCharFilter
                                      ? (currentCharFolder.sprites || []).filter(
                                          s => (s.characterName || '未命名角色').trim() === collectionCharFilter,
                                        )
                                      : currentCharFolder.sprites || [];
                                  const allIds = sourceSprites.map(s => s.id).filter(Boolean);
                                  setSelectedCharSpriteIds(allIds);
                                }}
                                className="px-3 py-1 rounded text-[10px] font-bold border border-emerald-400/70 text-emerald-300 hover:bg-emerald-500/20"
                              >
                                全选当前文件夹
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const sourceSprites =
                          currentCharFolderIsCollection && collectionCharFilter
                            ? (currentCharFolder?.sprites || []).filter(
                                s => (s.characterName || '未命名角色').trim() === collectionCharFilter,
                              )
                            : currentCharFolder?.sprites || [];
                        const byOutfit = sourceSprites.reduce<Record<string, CustomSprite[]>>((acc, s) => {
                          const key = (s.outfit || '未分类').trim();
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(s);
                          return acc;
                        }, {});
                        const outfitKeys = Object.keys(byOutfit);
                        return (
                          <div className="space-y-8">
                            {outfitKeys.map(outfitName => (
                              <div key={outfitName}>
                                <div className="flex items-center justify-between mb-3 px-1">
                                  <h3 className={`text-xs font-black uppercase tracking-widest ${ts.accentText}`}>
                                    {outfitName}
                                  </h3>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="text-[10px] px-2 py-0.5 rounded border border-red-400/60 text-red-300 hover:bg-red-500/10"
                                      title="删除此服饰组中的所有立绘"
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (!charFolderId) return;
                                        if (
                                          !window.confirm(
                                            `确定删除服饰组「${outfitName}」下的所有立绘？此操作不可撤销。`,
                                          )
                                        )
                                          return;
                                        const removeIds = new Set(byOutfit[outfitName].map(s => s.id));
                                        onUpdateCustomLibrary(
                                          customLibrary.map(f =>
                                            f.id === charFolderId
                                              ? {
                                                  ...f,
                                                  sprites: f.sprites.filter(s => !removeIds.has(s.id)),
                                                }
                                              : f,
                                          ),
                                        );
                                      }}
                                    >
                                      删除组
                                    </button>
                                    <button
                                      type="button"
                                      className="text-[10px] px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 hover:bg-amber-500/10"
                                      title="清除此服饰组中多余的相同图片（按 URL 去重，保留每张图的第一条）"
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (!charFolderId) return;
                                        const groupSprites = byOutfit[outfitName];
                                        const seen = new Set<string>();
                                        const keepIds = new Set<string>();
                                        const removeIds = new Set<string>();
                                        groupSprites.forEach(s => {
                                          const url = (s.imageUrl || '').trim();
                                          if (!url) {
                                            // 没有 URL 的立绘保留，由用户自行处理
                                            keepIds.add(s.id);
                                            return;
                                          }
                                          if (seen.has(url)) {
                                            removeIds.add(s.id);
                                          } else {
                                            seen.add(url);
                                            keepIds.add(s.id);
                                          }
                                        });
                                        if (removeIds.size === 0) return;
                                        if (
                                          !window.confirm(
                                            `检测到 ${removeIds.size} 张重复图片，将清除多余副本（保留每个 URL 的第一张）。确定继续？`,
                                          )
                                        )
                                          return;
                                        onUpdateCustomLibrary(
                                          customLibrary.map(f =>
                                            f.id === charFolderId
                                              ? {
                                                  ...f,
                                                  sprites: f.sprites.filter(s => !removeIds.has(s.id)),
                                                }
                                              : f,
                                          ),
                                        );
                                      }}
                                    >
                                      清理重名
                                    </button>
                                    <div className="relative flex items-center gap-2">
                                      <button
                                        type="button"
                                        className="text-[10px] px-2 py-0.5 rounded border border-sky-400/60 text-sky-200 hover:bg-sky-500/10"
                                        title="将当前服饰组的表情名、顺序和默认立绘配置复制到另一服饰组"
                                        onClick={e => {
                                          e.stopPropagation();
                                          if (!currentCharFolder) return;
                                          const otherOutfits = outfitKeys.filter(name => name !== outfitName);
                                          if (otherOutfits.length === 0) {
                                            if (typeof toastr !== 'undefined') {
                                              toastr.warning('当前角色没有其他服饰可复制到', '服饰表情复制');
                                            }
                                            return;
                                          }
                                          setCopySourceOutfitKey(prev => (prev === outfitName ? null : outfitName));
                                        }}
                                      >
                                        复制表情到…
                                      </button>
                                      {copySourceOutfitKey === outfitName && (
                                        <div
                                          className="absolute top-full right-0 mt-1 z-50 rounded-lg border border-sky-400/80 bg-slate-900 text-[11px] shadow-xl px-3 py-2 min-w-[180px] text-slate-50"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          <div className="mb-1 text-[10px] opacity-80 whitespace-nowrap">
                                            选择目标服饰：
                                          </div>
                                          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                                            {outfitKeys
                                              .filter(name => name !== outfitName)
                                              .map(name => (
                                                <button
                                                  key={name}
                                                  type="button"
                                                  className="w-full text-left px-2 py-1 rounded hover:bg-sky-500/60 hover:text-white"
                                                  onClick={() => {
                                                    copyExpressionsBetweenOutfits(outfitName, name);
                                                    setCopySourceOutfitKey(null);
                                                  }}
                                                >
                                                  {name}
                                                </button>
                                              ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="relative">
                                      {renamingOutfitKey === outfitName ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                          <input
                                            className={`w-28 px-1 py-0.5 rounded border text-[10px] ${ts.input}`}
                                            value={renamingOutfitValue}
                                            autoFocus
                                            onChange={e => setRenamingOutfitValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                const trimmed = renamingOutfitValue.trim();
                                                const currentName = outfitName === '未分类' ? '' : outfitName;
                                                if (trimmed && trimmed !== currentName) {
                                                  const ids = byOutfit[outfitName].map(s => s.id).filter(Boolean);
                                                  updateCharSpritesBatch(ids, 'outfit', trimmed);
                                                }
                                                setRenamingOutfitKey(null);
                                              } else if (e.key === 'Escape') {
                                                setRenamingOutfitKey(null);
                                              }
                                            }}
                                          />
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-600 text-white hover:bg-emerald-500"
                                            onClick={() => {
                                              const trimmed = renamingOutfitValue.trim();
                                              const currentName = outfitName === '未分类' ? '' : outfitName;
                                              if (trimmed && trimmed !== currentName) {
                                                const ids = byOutfit[outfitName].map(s => s.id).filter(Boolean);
                                                updateCharSpritesBatch(ids, 'outfit', trimmed);
                                              }
                                              setRenamingOutfitKey(null);
                                            }}
                                          >
                                            确定
                                          </button>
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 rounded text-[10px] border border-white/30 text-slate-200 hover:bg-white/10"
                                            onClick={() => setRenamingOutfitKey(null)}
                                          >
                                            取消
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          className="text-[10px] px-2 py-0.5 rounded border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10"
                                          title="修改此服饰组名称，应用到所有同名立绘"
                                          onClick={e => {
                                            e.stopPropagation();
                                            const currentName = outfitName === '未分类' ? '' : outfitName;
                                            setRenamingOutfitKey(outfitName);
                                            setRenamingOutfitValue(currentName);
                                          }}
                                        >
                                          重命名服饰
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 gap-4">
                                  {byOutfit[outfitName].map(sprite => {
                                    const isSelected = selectedSprite?.id === sprite.id;
                                    const isMultiSelected = selectedCharSpriteIds.includes(sprite.id);
                                    const highlightClass = isCharMultiSelectMode
                                      ? isMultiSelected
                                        ? 'ring-2 ring-emerald-500 border-emerald-500/50'
                                        : ts.item
                                      : isSelected
                                        ? 'ring-2 ring-emerald-500 border-emerald-500/50'
                                        : ts.item;
                                    const hasFolderCover = sourceSprites.some(s => s.isFolderCover);
                                    const showStarAlways = !!sprite.isFolderCover;
                                    return (
                                      <div
                                        key={sprite.id}
                                        onClick={e => {
                                          e.stopPropagation();
                                          if (isCharMultiSelectMode) {
                                            toggleCharSpriteSelection(sprite.id);
                                          } else {
                                            setSelectedSprite(sprite);
                                          }
                                        }}
                                        className={`p-2.5 rounded-lg border-2 group relative hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-200 cursor-pointer ${highlightClass} ${sprite.isFallback ? 'border-emerald-500/40' : ''}`}
                                      >
                                        <div className="aspect-[2/3] rounded overflow-hidden mb-2 relative bg-slate-700/40">
                                          <SpriteImg
                                            src={sprite.imageUrl}
                                            alt=""
                                            className="w-full h-full object-cover object-top"
                                          />
                                          <div
                                            onClick={e => {
                                              e.stopPropagation();
                                              setCharSpriteAsDefault(sprite.id);
                                            }}
                                            className={`absolute top-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer text-[9px] font-bold transition-all ${
                                              sprite.isFallback
                                                ? 'bg-emerald-500 text-white shadow-lg'
                                                : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white backdrop-blur-sm'
                                            }`}
                                            title="设为该服饰的默认立绘"
                                          >
                                            {sprite.isFallback ? <span>默认立绘 ✓</span> : <span>设为默认</span>}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={e => {
                                              e.stopPropagation();
                                              setCharSpriteAsFolderCover(sprite.id);
                                            }}
                                            className={`absolute top-1.5 right-1.5 text-[14px] font-bold text-yellow-300 drop-shadow ${
                                              showStarAlways
                                                ? ''
                                                : hasFolderCover
                                                  ? 'opacity-0 group-hover:opacity-100 transition-opacity'
                                                  : 'opacity-80 hover:opacity-100 transition-opacity'
                                            }`}
                                            title="设为角色封面（角色列表预览图）"
                                          >
                                            ★
                                          </button>
                                          <button
                                            onClick={e => {
                                              e.stopPropagation();
                                              deleteSprite(sprite.id);
                                            }}
                                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg translate-x-[-1.75rem]"
                                            title="删除"
                                          >
                                            ✕
                                          </button>
                                          {isCharMultiSelectMode && (
                                            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 text-white/80 px-1.5 py-0.5 rounded text-[9px]">
                                              <span className="w-3 h-3 rounded border border-white/60 bg-black/40 flex items-center justify-center">
                                                {isMultiSelected ? '✓' : ''}
                                              </span>
                                              <span>{isMultiSelected ? '已选' : '可选'}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="space-y-0.5">
                                          <input
                                            value={sprite.outfit || ''}
                                            onChange={e => updateSprite(sprite.id, 'outfit', e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            className={`w-full text-[10px] font-bold px-0.5 py-0.5 rounded bg-black/10 border border-transparent focus:border-emerald-500/50 focus:outline-none ${ts.input}`}
                                            placeholder="服饰（例如：西装）"
                                            title={sprite.outfit || ''}
                                          />
                                          <div className="flex flex-col gap-1 w-full">
                                            <input
                                              value={sprite.expression || ''}
                                              onChange={e => updateSprite(sprite.id, 'expression', e.target.value)}
                                              onClick={e => e.stopPropagation()}
                                              className={`w-full min-w-0 text-[10px] px-1 py-0.5 rounded bg-black/10 border border-transparent focus:border-emerald-500/50 focus:outline-none opacity-90 min-h-[22px] ${ts.input}`}
                                              placeholder="表情/动作（可多种，用逗号 , 分隔）"
                                              title={sprite.expression || ''}
                                            />
                                            <div className="flex flex-wrap items-center gap-1 w-full">
                                              <select
                                                value={activeExpressionPresetGroupId}
                                                onChange={e => setActiveExpressionPresetGroupId(e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                className={`text-[9px] px-1.5 py-0.5 rounded bg-black/20 border border-transparent hover:border-emerald-500/50 cursor-pointer shrink-0 min-w-[72px] ${ts.input}`}
                                              >
                                                <option value="">预设分组</option>
                                                {EXPRESSION_PRESET_GROUPS.map(g => (
                                                  <option key={g.id} value={g.id}>
                                                    {g.label}
                                                  </option>
                                                ))}
                                              </select>
                                              {activeExpressionPresetGroupId &&
                                                EXPRESSION_PRESET_GROUPS.find(
                                                  g => g.id === activeExpressionPresetGroupId,
                                                )?.items.map(preset => (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={e => {
                                                      e.stopPropagation();
                                                      const current = sprite.expression || '';
                                                      const parts = current
                                                        ? current
                                                            .split(/[,，]/)
                                                            .map(s => s.trim())
                                                            .filter(Boolean)
                                                        : [];
                                                      if (parts.includes(preset)) return;
                                                      const next = parts.length
                                                        ? `${parts.join(',')},${preset}`
                                                        : preset;
                                                      updateSprite(sprite.id, 'expression', next);
                                                    }}
                                                    className="px-2 py-0.5 rounded text-[10px] font-medium border border-emerald-500/80 bg-emerald-700/90 hover:bg-emerald-600 text-white shadow-sm transition-colors shrink-0"
                                                  >
                                                    {preset}
                                                  </button>
                                                ))}
                                            </div>
                                          </div>
                                          <input
                                            value={sprite.imageUrl}
                                            onChange={e => updateSprite(sprite.id, 'imageUrl', e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            className={`w-full text-[9px] px-1 py-0.5 rounded bg-black/20 border border-transparent focus:border-emerald-500/50 focus:outline-none opacity-50 focus:opacity-100 ${ts.input}`}
                                            placeholder="图片链接"
                                            title={sprite.imageUrl}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
                      <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜索角色..."
                        className={`flex-1 max-w-xs px-3 py-2 text-xs rounded border focus:outline-none ${ts.input}`}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => charImportFileRef.current?.click()}
                          className="px-3 py-1.5 text-[11px] rounded border border-white/20 bg-white/5 hover:bg-white/10 flex items-center gap-1"
                          title="仅导入立绘库 JSON（不会影响背景和 CG）"
                        >
                          📥 导入立绘
                        </button>
                        <button
                          onClick={handleExportCharactersOnly}
                          className="px-3 py-1.5 text-[11px] rounded border border-white/20 bg-white/5 hover:bg-white/10 flex items-center gap-1"
                          title="仅导出立绘库 JSON（不会包含背景和 CG）"
                        >
                          📤 导出立绘
                        </button>
                        <TacticalButton onClick={addCharFolder} className="shrink-0 justify-center py-2 text-xs">
                          + 新建角色
                        </TacticalButton>
                        <button
                          onClick={() => {
                            setIsCreatingCollection(prev => !prev);
                            setNewCollectionName('新建合集');
                          }}
                          className="shrink-0 px-3 py-2 text-[11px] rounded border border-emerald-500/40 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-200 font-bold whitespace-nowrap"
                          title="新建一个角色合集（文件夹），用于汇总多名角色的立绘"
                        >
                          📚 合集
                        </button>
                      </div>
                    </div>
                    {isCreatingCollection && (
                      <div className="mt-3 mb-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-900/10 text-xs text-slate-100 flex flex-col gap-2">
                        <div className={`font-black uppercase tracking-widest text-[11px] ${ts.accentText}`}>
                          新建角色合集
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <input
                            value={newCollectionName}
                            onChange={e => setNewCollectionName(e.target.value)}
                            placeholder="例如：淫乱军营合集"
                            className={`flex-1 px-3 py-1.5 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400/60 ${ts.input}`}
                          />
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => {
                                const name = newCollectionName.trim();
                                if (!name) return;
                                createCharCollectionFolder(name);
                                setIsCreatingCollection(false);
                                setNewCollectionName('新建合集');
                              }}
                              className="px-3 py-1.5 rounded bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500"
                            >
                              确定
                            </button>
                            <button
                              onClick={() => {
                                setIsCreatingCollection(false);
                                setNewCollectionName('新建合集');
                              }}
                              className="px-3 py-1.5 rounded border border-white/20 text-[11px] font-bold hover:bg-white/10"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                        <div className="text-[10px] opacity-70">
                          创建后点击该合集，可先按角色查看内部的立绘，再点具体角色进入立绘编辑界面。
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {filteredCharFolders.map(f => {
                        const sprites = f.sprites || [];
                        const defSpr =
                          sprites.find(s => s.isFolderCover) || sprites.find(s => s.isFallback) || sprites[0];
                        const isCollection = isCollectionFolder(f);
                        const isDragOver = dragOverCollectionId === f.id;
                        // 合集预览：抽取若干角色的封面立绘，用于拼贴预览
                        const collectionPreviewByChar: Record<string, CustomSprite> = {};
                        if (isCollection) {
                          sprites.forEach(s => {
                            const key = (s.characterName || '未命名角色').trim();
                            if (!collectionPreviewByChar[key] && s.imageUrl) {
                              collectionPreviewByChar[key] = s;
                            }
                          });
                        }
                        const collectionPreviewList = isCollection
                          ? Object.values(collectionPreviewByChar).slice(0, 4)
                          : [];
                        return (
                          <div
                            key={f.id}
                            draggable={!isCollection}
                            onClick={e => {
                              e.stopPropagation();
                              setCharFolderId(f.id);
                              setSelectedSprite(null);
                              setCollectionCharFilter(null);
                            }}
                            onDragStart={e => {
                              if (isCollection) return;
                              setDraggingCharFolderId(f.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggingCharFolderId(null);
                              setDragOverCollectionId(null);
                            }}
                            onDragOver={e => {
                              if (!isCollection) return;
                              if (!draggingCharFolderId || draggingCharFolderId === f.id) return;
                              e.preventDefault();
                              setDragOverCollectionId(f.id);
                            }}
                            onDrop={e => {
                              if (!isCollection) return;
                              if (!draggingCharFolderId || draggingCharFolderId === f.id) return;
                              e.preventDefault();
                              mergeFolderIntoCollection(draggingCharFolderId, f.id);
                              setDraggingCharFolderId(null);
                              setDragOverCollectionId(null);
                            }}
                            className={`group relative p-3 rounded-xl border-2 cursor-pointer transition-all hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 ${ts.item} ${f.disabled ? 'opacity-50 grayscale' : ''} ${isCollection ? 'border-dashed border-emerald-400/60 bg-emerald-900/10' : ''} ${isDragOver ? 'ring-2 ring-emerald-400 bg-emerald-500/10' : ''}`}
                          >
                            <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-slate-700/40 relative">
                              {isCollection ? (
                                collectionPreviewList.length > 0 ? (
                                  <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1 p-1">
                                    {collectionPreviewList.map((spr, idx) => (
                                      <div
                                        key={spr.id || idx}
                                        className="relative rounded-md overflow-hidden bg-slate-800/60"
                                      >
                                        <SpriteImg
                                          src={spr.imageUrl}
                                          alt={spr.characterName || ''}
                                          className="w-full h-full object-cover object-top"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                    合集暂无预览
                                  </div>
                                )
                              ) : defSpr?.imageUrl ? (
                                <SpriteImg
                                  src={defSpr.imageUrl}
                                  alt=""
                                  className="w-full h-full object-cover object-top"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                  暂无
                                </div>
                              )}
                              <div
                                className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={e => e.stopPropagation()}
                              >
                                {isCollection && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-md">
                                    合集
                                  </span>
                                )}
                                <button
                                  onClick={() => toggleFolderDisabled('char', f.id)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${f.disabled ? 'bg-green-500/80 text-white' : 'bg-black/60 text-slate-300 hover:bg-black/80'}`}
                                  title={f.disabled ? '启用' : '禁用'}
                                >
                                  {f.disabled ? '👁️' : '🚫'}
                                </button>
                                <button
                                  onClick={() => deleteCharFolder(f.id)}
                                  className="w-7 h-7 rounded-full bg-red-600/80 text-white flex items-center justify-center text-xs hover:bg-red-500/90"
                                  title="删除角色"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {editingFolderId === f.id ? (
                              <div
                                className="mt-1 flex items-center gap-1 max-w-full"
                                onClick={e => e.stopPropagation()}
                              >
                                <input
                                  value={editingFolderName}
                                  onChange={e => setEditingFolderName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      const nextName = editingFolderName.trim() || f.name || '';
                                      updateCharFolder(f.id, nextName);
                                      setEditingFolderId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingFolderId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    const nextName = editingFolderName.trim() || f.name || '';
                                    updateCharFolder(f.id, nextName);
                                    setEditingFolderId(null);
                                  }}
                                  className="flex-1 min-w-0 max-w-[68%] px-2 py-1 rounded border border-purple-300/60 bg-black/30 text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded flex items-center justify-center text-[12px] bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
                                  onClick={() => {
                                    const nextName = editingFolderName.trim() || f.name || '';
                                    updateCharFolder(f.id, nextName);
                                    setEditingFolderId(null);
                                  }}
                                  title="保存"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded flex items-center justify-center text-[12px] border border-white/30 text-slate-200 hover:bg-white/10 shrink-0"
                                  onClick={() => setEditingFolderId(null)}
                                  title="取消"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="mt-1 flex items-center gap-1">
                                <div className="text-xs font-bold truncate flex-1">{f.name}</div>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setEditingFolderId(f.id);
                                    setEditingFolderName(f.name || '');
                                  }}
                                  className="text-[11px] opacity-60 hover:opacity-100 px-1"
                                  title="重命名"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                            <div className="text-[10px] opacity-60">{f.sprites?.length ?? 0} 张立绘</div>
                            {!isCollection && (
                              <div
                                className={`mt-1 inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  (f.spriteFolderKind ?? 'fullbody') === 'avatar'
                                    ? 'bg-amber-600/90 text-white'
                                    : 'bg-slate-600/80 text-white/95'
                                }`}
                              >
                                {(f.spriteFolderKind ?? 'fullbody') === 'avatar' ? '头像立绘' : '全身立绘'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- BACKGROUNDS TAB：军营报道员风格 + 图2 侧栏（可隐藏）--- */}
          {activeTab === 'background' && (
            <div className="flex-1 flex overflow-hidden relative">
              {/* 侧栏：可隐藏，保留图2 场景集列表 */}
              {!bgSidebarHidden && (
                <div
                  className={`w-64 border-r flex flex-col shrink-0 transition-all ${ts.sidebar}`}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="p-3 border-b border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/90">场景集</span>
                    <button
                      onClick={() => setBgSidebarHidden(true)}
                      className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                      title="隐藏侧栏"
                    >
                      ◀
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="搜索场景集..."
                      className={`w-full px-3 py-2 text-xs rounded border focus:outline-none ${ts.input}`}
                    />
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <button
                        onClick={() => bgImportFileRef.current?.click()}
                        className="px-2.5 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5"
                        title="仅导入背景库 JSON（不会影响立绘和 CG）"
                      >
                        <span className="text-xs">📥</span>
                        <span>导入背景</span>
                      </button>
                      <button
                        onClick={handleExportBackgroundsOnly}
                        className="px-2.5 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5"
                        title="仅导出背景库 JSON（不会包含立绘和 CG）"
                      >
                        <span className="text-xs">📤</span>
                        <span>导出背景</span>
                      </button>
                    </div>
                    <TacticalButton onClick={addBgFolder} className="w-full justify-center py-2 text-xs">
                      + 新建场景集
                    </TacticalButton>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredBgFolders.map(f => (
                      <div
                        key={f.id}
                        onClick={() => setBgFolderId(f.id)}
                        onDragOver={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (draggedBgId && draggedBgFolderId !== f.id) setDragOverFolderId(f.id);
                        }}
                        onDragLeave={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverFolderId(null);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (draggedBgId && draggedBgFolderId && draggedBgFolderId !== f.id)
                            moveBgToFolder(draggedBgId, draggedBgFolderId, f.id);
                          setDraggedBgId(null);
                          setDraggedBgFolderId(null);
                          setDragOverFolderId(null);
                        }}
                        className={`p-3 rounded cursor-pointer flex justify-between items-center group relative transition-all ${bgFolderId === f.id ? ts.itemActive : ts.item} ${f.disabled ? 'opacity-50 grayscale' : ''} ${dragOverFolderId === f.id && draggedBgId ? 'ring-2 ring-emerald-500 bg-emerald-500/20' : ''}`}
                      >
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold truncate ${f.disabled ? 'line-through' : ''}`}>
                            {f.name}
                          </span>
                          <span className="text-[9px] opacity-60">{f.items?.length ?? 0} 张背景</span>
                        </div>
                        {dragOverFolderId === f.id && draggedBgId && (
                          <span className="text-xs text-emerald-500 font-bold">松开移动</span>
                        )}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 absolute right-2">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const name = window.prompt('重命名场景集：', f.name);
                              if (name && name.trim()) updateBgFolder(f.id, name.trim());
                            }}
                            className="p-1 rounded hover:bg-white/10 text-slate-400"
                            title="重命名场景集"
                          >
                            ✎
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              toggleFolderDisabled('bg', f.id);
                            }}
                            className={`p-1 rounded hover:bg-white/10 ${f.disabled ? 'text-green-500' : 'text-slate-400'}`}
                            title={f.disabled ? '启用场景集' : '禁用场景集'}
                          >
                            {f.disabled ? '👁️' : '🚫'}
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              deleteBgFolder(f.id);
                            }}
                            className="text-red-500 hover:bg-red-500/20 p-1 rounded"
                            title="删除场景集"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bgSidebarHidden && (
                <div
                  className="shrink-0 border-r border-white/10 flex flex-col items-center py-2 px-1 bg-black/20"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => setBgSidebarHidden(false)}
                    className="p-2 rounded hover:bg-white/10 text-emerald-500 hover:text-emerald-400 transition-colors text-xs font-bold"
                    title="展开侧栏"
                  >
                    ▶
                  </button>
                </div>
              )}

              {/* 主内容区：军营报道员风格（大预览 + 工具栏 + 网格） */}
              <div className="flex-1 flex flex-col overflow-hidden bg-black/20 min-w-0">
                {/* 军营风格：全宽大预览区 Current_Selection + [ 名称 ] + 立即部署 */}
                <div className="relative w-full h-56 shrink-0 overflow-hidden border-b border-white/10 bg-black/40 group">
                  <img
                    src={bgPreviewUrl || 'https://via.placeholder.com/1920x1080?text=No+Selection'}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                    alt=""
                    onError={e => {
                      // 若当前 URL 加载失败，降级显示占位图，避免空白预览
                      e.currentTarget.src = 'https://via.placeholder.com/1920x1080?text=Load+Error';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center p-6">
                    {bgEditId ? (
                      <div
                        className={`w-full max-w-md p-6 border border-white/10 backdrop-blur-xl rounded-lg shadow-2xl ${ts.modalBg}`}
                      >
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                            编辑场景
                          </span>
                          <button onClick={() => setBgEditId(null)} className="text-xs opacity-60 hover:opacity-100">
                            取消
                          </button>
                        </div>
                        <div className="space-y-3">
                          <input
                            value={bgInputName}
                            onChange={e => setBgInputName(e.target.value)}
                            className={`w-full p-2 text-sm rounded border ${ts.input}`}
                            placeholder="名称"
                          />
                          <input
                            value={bgInputUrl}
                            onChange={e => setBgInputUrl(e.target.value)}
                            className={`w-full p-2 text-sm rounded border ${ts.input}`}
                            placeholder="URL"
                          />
                        </div>
                        <button
                          onClick={saveBg}
                          className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded"
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className={`text-[10px] font-black px-3 py-1 uppercase tracking-widest text-white rounded ${
                            theme === 'ink-jianghu' ? 'bg-white/10' : 'bg-emerald-500/90'
                          }`}
                        >
                          Current Selection
                        </span>
                        <span className={`text-2xl font-black tracking-wider ${ts.accentText}`}>
                          [ {bgPreviewName || '未选场景'} ]
                        </span>
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                          <button
                            onClick={() => onSetBackground({ name: bgPreviewName, url: bgPreviewUrl })}
                            className={`px-4 py-2 text-xs font-bold rounded shadow-lg ${
                              theme === 'ink-jianghu'
                                ? 'bg-white/90 hover:bg-white text-black'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            立即部署 (DEPLOY)
                          </button>
                          <button
                            disabled={!resolvedBgForDefault}
                            onClick={e => {
                              e.stopPropagation();
                              if (!resolvedBgForDefault) return;
                              onSetDefaultBackground?.(resolvedBgForDefault.id);
                            }}
                            className={`px-4 py-2 text-white text-xs font-bold rounded shadow-lg border ${
                              resolvedBgForDefault && String(resolvedBgForDefault.id) === String(defaultBackgroundId)
                                ? theme === 'ink-jianghu'
                                  ? 'bg-white/15 border-white/40'
                                  : 'bg-emerald-600/80 border-emerald-400'
                                : 'bg-white/10 hover:bg-white/20 border-white/15'
                            } ${!resolvedBgForDefault ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {resolvedBgForDefault && String(resolvedBgForDefault.id) === String(defaultBackgroundId)
                              ? '默认背景 ✓'
                              : '设为默认背景'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 工具栏：搜索地点、文本批量导入、+ 新增场景、按名称排序 */}
                <div className={`shrink-0 p-3 border-b border-white/10 flex gap-3 items-center flex-wrap ${ts.header}`}>
                  <input
                    value={bgLocationSearch}
                    onChange={e => setBgLocationSearch(e.target.value)}
                    placeholder="搜索地点..."
                    className={`flex-1 min-w-[140px] max-w-xs px-3 py-2 text-xs rounded border focus:outline-none ${ts.input}`}
                  />
                  <div className="flex-1 min-w-0" />
                  <button
                    onClick={() => setIsBgImportOpen(true)}
                    className="px-4 py-2 border border-white/20 hover:bg-white/10 text-xs font-bold rounded"
                  >
                    文本批量导入
                  </button>
                  {currentBgFolder && (
                    <>
                      <button
                        onClick={addBg}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded"
                      >
                        + 新增地点
                      </button>
                      <button
                        onClick={sortCurrentBgFolderByName}
                        className="px-4 py-2 border border-emerald-500/40 hover:bg-emerald-500/10 text-xs font-bold rounded text-emerald-300"
                        title="按地点名称排序一次（无名称的排在最后）"
                      >
                        按名称排序
                      </button>
                    </>
                  )}
                </div>

                {/* 批量导入浮层 */}
                {isBgImportOpen && (
                  <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur p-4">
                    <div className={`w-full max-w-lg rounded-lg shadow-2xl p-6 border border-white/10 ${ts.modalBg}`}>
                      <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-emerald-500">
                        批量导入 (每行一个 URL)
                      </h3>
                      <textarea
                        value={bgImportText}
                        onChange={e => setBgImportText(e.target.value)}
                        className={`w-full h-40 p-3 text-xs font-mono rounded border ${ts.input}`}
                        placeholder="粘贴图片链接，每行一个..."
                      />
                      <div className="flex justify-end gap-2 mt-4">
                        <button
                          onClick={() => setIsBgImportOpen(false)}
                          className="px-4 py-2 text-xs opacity-60 hover:opacity-100"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleBgBatchImport}
                          disabled={isBgImporting}
                          className={`px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded ${isBgImporting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-500'}`}
                        >
                          {isBgImporting ? '导入中…' : '导入'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 军营风格：地点网格 grid-cols-2 md:4 lg:5 aspect-video 底部名称 */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {currentBgFolder ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 pb-8">
                      {filteredBgItems.map((bg, idx) => (
                        <div
                          key={`${currentBgFolder.id}-${bg.id}-${idx}`}
                          draggable
                          onDragStart={e => {
                            setDraggedBgId(bg.id);
                            setDraggedBgFolderId(currentBgFolder.id);
                            e.dataTransfer.effectAllowed = 'move';
                            const el = document.createElement('div');
                            el.style.cssText =
                              'width:120px;height:68px;border-radius:4px;overflow:hidden;border:2px solid #10b981;position:absolute;top:-999px';
                            const img = document.createElement('img');
                            img.src = bg.url;
                            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
                            el.appendChild(img);
                            document.body.appendChild(el);
                            e.dataTransfer.setDragImage(el, 60, 34);
                            setTimeout(() => document.body.removeChild(el), 0);
                          }}
                          onDragEnd={() => {
                            setDraggedBgId(null);
                            setDraggedBgFolderId(null);
                            setDragOverFolderId(null);
                          }}
                          onClick={() => {
                            setBgPreviewUrl(bg.url);
                            setBgPreviewName(bg.name);
                            setSelectedBgForPreview(bg);
                          }}
                          className={`group relative aspect-video rounded overflow-hidden border cursor-pointer transition-all shadow-sm ${bgPreviewUrl === bg.url ? 'ring-2 ring-emerald-500 border-emerald-500/50' : ts.item} ${draggedBgId === bg.id ? 'opacity-50' : ''}`}
                        >
                          <img
                            src={bg.url}
                            alt={bg.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={e => {
                              e.currentTarget.src = 'https://via.placeholder.com/300x200?text=Error';
                            }}
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 backdrop-blur-sm">
                            <span className="text-[10px] font-bold block truncate uppercase tracking-tight text-white">
                              {bg.name}
                            </span>
                          </div>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setBgEditId(bg.id);
                                setBgInputName(bg.name);
                                setBgInputUrl(bg.url);
                              }}
                              className="bg-blue-600 text-white p-1.5 rounded text-[10px]"
                            >
                              ✎
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (confirm('确认删除该场景？')) deleteBg(bg.id);
                              }}
                              className="bg-red-600 text-white p-1.5 rounded text-[10px]"
                            >
                              ✕
                            </button>
                          </div>
                          {draggedBgId === bg.id && (
                            <div className="absolute inset-0 bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                              <span className="text-xs font-bold text-emerald-500 bg-white/90 px-2 py-1 rounded">
                                拖拽中
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center opacity-40 text-sm">
                      请从侧栏选择一个场景集（或点击 ▶ 展开侧栏）
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- CGs TAB：图集在文件夹内，武侦连 为子文件夹 --- */}
          {activeTab === 'cg' && (
            <div className="flex-1 flex overflow-hidden">
              {/* 侧栏：素材库列表，可隐藏/展开 */}
              {!cgSidebarHidden && (
                <div
                  className={`w-64 border-r flex flex-col shrink-0 ${ts.sidebar}`}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="p-3 border-b border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/90">素材库</span>
                    <button
                      onClick={() => setCgSidebarHidden(true)}
                      className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white text-xs"
                      title="隐藏侧栏"
                    >
                      ◀
                    </button>
                  </div>
                  <div className="p-4 pt-3 space-y-3">
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="搜索素材库..."
                      className={`w-full px-3 py-2 text-xs rounded border focus:outline-none ${ts.input}`}
                    />
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <button
                        onClick={() => cgImportFileRef.current?.click()}
                        className="px-2.5 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5"
                        title="仅导入 CG 库 JSON（不会影响立绘和背景）"
                      >
                        <span className="text-xs">📥</span>
                        <span>导入 CG</span>
                      </button>
                      <button
                        onClick={handleExportCgOnly}
                        className="px-2.5 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5"
                        title="仅导出 CG 库 JSON（不会包含立绘和背景）"
                      >
                        <span className="text-xs">📤</span>
                        <span>导出 CG</span>
                      </button>
                    </div>
                    <TacticalButton onClick={addCgFolder} className="w-full justify-center py-2 text-xs">
                      + 新建素材库
                    </TacticalButton>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredCgFolders.map(f => (
                      <div
                        key={f.id}
                        onClick={() => {
                          setCgFolderId(f.id);
                          setCgSetId(null);
                          setSelectedCgForPreview(null);
                        }}
                        className={`p-3 rounded-r cursor-pointer flex justify-between items-center group relative ${cgFolderId === f.id ? ts.itemActive : ts.item} ${f.disabled ? 'opacity-50 grayscale' : ''}`}
                      >
                        <span className={`text-xs font-bold truncate ${f.disabled ? 'line-through' : ''}`}>
                          📂 {f.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 mr-10 text-right">
                          <span className="text-[9px] opacity-50">({f.items?.length ?? 0} 张CG)</span>
                          <span className="text-[9px] opacity-50">({(f.sets || []).length} 图集)</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 absolute right-2">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              toggleFolderDisabled('cg', f.id);
                            }}
                            className={`p-1 rounded hover:bg-white/10 ${f.disabled ? 'text-green-500' : 'text-slate-400'}`}
                          >
                            {f.disabled ? '👁️' : '🚫'}
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              deleteCgFolder(f.id);
                            }}
                            className="text-red-500 hover:bg-red-500/20 p-1 rounded"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cgSidebarHidden && (
                <div
                  className="shrink-0 border-r border-white/10 flex flex-col items-center py-2 px-1 bg-black/20"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => setCgSidebarHidden(false)}
                    className="p-2 rounded hover:bg-white/10 text-emerald-500 hover:text-emerald-400 text-xs font-bold"
                    title="展开素材库侧栏"
                  >
                    ▶
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/20">
                {currentCgSet && cgFolderId ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b border-white/10">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setCgSetId(null)}
                          className="text-emerald-500 hover:text-emerald-400 text-sm font-bold"
                        >
                          ← 返回
                        </button>
                        <span className="text-[10px] font-black text-emerald-500 uppercase">
                          📁 {currentCgFolder?.name} / {currentCgSet.name}
                        </span>
                        <input
                          value={currentCgSet.name}
                          onChange={e => updateCgSet(cgFolderId, currentCgSet.id, { name: e.target.value })}
                          className={`text-xl font-black bg-transparent border-b border-transparent hover:border-white/30 focus:border-emerald-500 focus:outline-none px-1 ${ts.input}`}
                        />
                        <span className="text-xs opacity-50 font-mono">{(currentCgSet.itemIds || []).length} 张CG</span>
                        {currentCgSet.nsfw && (
                          <span className="text-[9px] font-black text-white bg-red-600/90 px-1.5 py-0.5 rounded shrink-0">
                            NSFW
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsCgPoolPickerOpen(true)}
                          className="px-4 py-2 border border-white/20 hover:bg-white/10 text-xs font-bold rounded"
                        >
                          + 从本文件夹添加
                        </button>
                        <button
                          onClick={() => deleteCgSet(cgFolderId, currentCgSet.id)}
                          className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold rounded"
                        >
                          删除图集
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold opacity-50 uppercase">触发内容</label>
                          <input
                            value={currentCgSet.triggerContent ?? ''}
                            onChange={e =>
                              updateCgSet(cgFolderId, currentCgSet.id, { triggerContent: e.target.value })
                            }
                            className={`w-full p-2 text-xs rounded border ${ts.input}`}
                            placeholder="例如：张承岳给user口交"
                          />
                          <p className="text-[9px] opacity-45 leading-snug">
                            叙事侧说明「何时」触发图集；与单张 CG 的「触发内容」相同。图集内 CG 不会单独被正文匹配。
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold opacity-50 uppercase">cg id</label>
                          <input
                            value={currentCgSet.cgTagId ?? ''}
                            onChange={e => updateCgSet(cgFolderId, currentCgSet.id, { cgTagId: e.target.value })}
                            className={`w-full p-2 text-xs rounded border ${ts.input}`}
                            placeholder="cg图的编号，例如：0001"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold opacity-60 uppercase">图集类型</label>
                          <select
                            value={currentCgSet.mode || 'sequence'}
                            onChange={e =>
                              updateCgSet(cgFolderId, currentCgSet.id, {
                                mode: e.target.value as 'sequence' | 'random',
                              })
                            }
                            className={`w-full p-2 text-xs rounded border ${ts.input}`}
                          >
                            <option value="sequence">顺序图集（点击依次播放）</option>
                            <option value="random">随机图集（触发时随机一张）</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-red-400">
                          <input
                            type="checkbox"
                            checked={currentCgSet.nsfw === true}
                            onChange={e => updateCgSet(cgFolderId, currentCgSet.id, { nsfw: e.target.checked })}
                            className="w-4 h-4"
                          />{' '}
                          NSFW（整图集标记；随机 NSFW 图集时整集图片均参与）
                        </label>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold opacity-60 uppercase">文件列表（CG）</span>
                          {currentCgSet.itemIds.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <button
                                onClick={() => sortCgInSet(cgFolderId, currentCgSet.id, 'nsfw')}
                                className="px-2 py-1 text-[9px] border rounded hover:bg-white/10"
                              >
                                按 NSFW
                              </button>
                              <button
                                onClick={() => sortCgInSet(cgFolderId, currentCgSet.id, 'vertical')}
                                className="px-2 py-1 text-[9px] border rounded hover:bg-white/10"
                              >
                                按竖版
                              </button>
                              <button
                                onClick={() => sortCgInSet(cgFolderId, currentCgSet.id, 'name')}
                                className="px-2 py-1 text-[9px] border rounded hover:bg-white/10"
                              >
                                按名称
                              </button>
                              <button
                                onClick={() => sortCgInSet(cgFolderId, currentCgSet.id, 'time')}
                                className="px-2 py-1 text-[9px] border rounded hover:bg-white/10"
                              >
                                按时间
                              </button>
                            </div>
                          )}
                        </div>
                        {currentCgSet.itemIds.length > 0 ? (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {currentCgSet.itemIds.map((id, idx) => {
                              const item = cgIdToItem.get(id);
                              return (
                                <div
                                  key={`${id}_${idx}`}
                                  className={`flex items-center gap-2 p-2 rounded border ${ts.item}`}
                                >
                                  <div className="w-10 h-7 rounded overflow-hidden border border-white/10 bg-black/30 shrink-0 relative">
                                    {item?.url ? <img src={item.url} className="w-full h-full object-cover" /> : null}
                                    {item?.nsfw && (
                                      <span className="absolute bottom-0 left-0 right-0 text-[6px] bg-red-600/90 text-white text-center">
                                        NSFW
                                      </span>
                                    )}
                                    {item?.isVertical && (
                                      <span className="absolute top-0 right-0 text-[6px] bg-blue-600/90 text-white px-0.5">
                                        竖
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 text-[10px] font-bold truncate">
                                    {item?.name || `（已丢失）${id}`}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    {item && (
                                      <button
                                        onClick={() => {
                                          setCgEditId(item.id);
                                          setCgInputName(item.name || '');
                                          setCgInputUrl(item.url);
                                          setCgInputTriggerContent(item.triggerContent ?? '');
                                          setCgInputCgTagId(item.cgTagId ?? item.keywords?.[0] ?? '');
                                          setCgInputNsfw(!!item.nsfw);
                                          setCgInputIsVertical(!!item.isVertical);
                                        }}
                                        className="px-2 py-1 text-[10px] border rounded hover:bg-white/10"
                                        title="编辑该 CG"
                                      >
                                        ✎
                                      </button>
                                    )}
                                    <button
                                      onClick={() => moveCgInSet(cgFolderId, currentCgSet.id, idx, idx - 1)}
                                      className="px-2 py-1 text-[10px] border rounded hover:bg-white/10 disabled:opacity-30"
                                      disabled={idx === 0}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      onClick={() => moveCgInSet(cgFolderId, currentCgSet.id, idx, idx + 1)}
                                      className="px-2 py-1 text-[10px] border rounded hover:bg-white/10 disabled:opacity-30"
                                      disabled={idx === currentCgSet.itemIds.length - 1}
                                    >
                                      ↓
                                    </button>
                                    <button
                                      onClick={() => removeCgFromSet(cgFolderId, currentCgSet.id, id)}
                                      className="px-2 py-1 text-[10px] bg-red-600/80 hover:bg-red-500 text-white rounded"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs opacity-40">（空）点击「从本文件夹添加」将 CG 加入本图集</div>
                        )}
                      </div>
                    </div>
                    {/* 图集预览：塞入图集的 CG 在此显示，点击可在右侧预览 */}
                    <div className="space-y-2 rounded-lg border-2 border-emerald-500/30 bg-black/30 p-4">
                      <span className="text-[9px] font-bold opacity-60 uppercase">预览（点击图片可放大）</span>
                      {currentCgSet.itemIds.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {currentCgSet.itemIds.map(id => {
                            const item = cgIdToItem.get(id);
                            if (!item?.url) return null;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setSelectedCgForPreview(item)}
                                className={`rounded-lg overflow-hidden border-2 transition-all text-left hover:border-emerald-400 hover:ring-2 hover:ring-emerald-400/50 ${selectedCgForPreview?.id === item.id ? 'border-emerald-400 ring-2 ring-emerald-400/50' : 'border-white/20'} ${ts.item}`}
                              >
                                <div
                                  className={`relative w-full overflow-hidden bg-black/40 ${item.isVertical ? 'aspect-[3/4]' : 'aspect-video'}`}
                                >
                                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                                    <CgGalleryPreviewImg
                                      item={item}
                                      settings={cgDisplay}
                                      runtimeTall={!!cgTallAspectById[item.id]}
                                      onDetectTallAspect={markCgTallAspect}
                                    />
                                  </div>
                                </div>
                                <div className="p-1.5 text-[10px] font-bold truncate">{item.name || '（未命名）'}</div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs opacity-40">
                          暂无图片，请点击「从本文件夹添加」将 CG 加入本图集
                        </div>
                      )}
                    </div>
                  </div>
                ) : currentCgFolder ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b border-white/10 gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1 flex-nowrap">
                        <span className="text-[10px] font-black text-emerald-500 uppercase whitespace-nowrap shrink-0">
                          📂 {currentCgFolder.name}
                        </span>
                        <input
                          value={currentCgFolder.name}
                          onChange={e => updateCgFolder(currentCgFolder.id, e.target.value)}
                          className={`text-xl font-black bg-transparent border-b border-transparent hover:border-white/30 focus:border-emerald-500 focus:outline-none px-1 min-w-0 flex-1 ${ts.input}`}
                        />
                        <span className="text-xs opacity-50 font-mono whitespace-nowrap shrink-0">
                          {currentCgFolder.items.length} 张CG · {(currentCgFolder.sets || []).length} 个图集
                        </span>
                      </div>
                      <div className="flex flex-nowrap gap-2 items-center shrink-0">
                        <TacticalButton onClick={addCgSet} className="py-2 text-xs whitespace-nowrap">
                          + 新建图集
                        </TacticalButton>
                        <button
                          onClick={addCgItem}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-md whitespace-nowrap"
                        >
                          + 新增 CG
                        </button>
                        <button
                          onClick={() => setIsCgImportOpen(true)}
                          className="px-4 py-2 border border-white/20 hover:bg-white/10 text-xs font-bold rounded whitespace-nowrap"
                        >
                          批量导入
                        </button>
                        {currentCgFolder.items.length > 0 && (
                          <div className="relative flex items-center gap-2 whitespace-nowrap" ref={cgSortDropdownRef}>
                            <span className="text-[10px] opacity-50">|</span>
                            <span className="text-[9px] opacity-60 uppercase">素材排序</span>
                            <button
                              onClick={() => setCgSortDropdownOpen(open => !open)}
                              className="px-3 py-1.5 text-[9px] border rounded hover:bg-white/10 flex items-center gap-1"
                            >
                              选择 <span className="opacity-60">▼</span>
                            </button>
                            {cgSortDropdownOpen && (
                              <div
                                className={`absolute top-full left-0 mt-1 py-1 min-w-[140px] rounded border shadow-lg z-50 ${theme === 'day' ? 'bg-white border-slate-200' : 'bg-[#1e293b] border-white/10'}`}
                              >
                                <button
                                  onClick={() => {
                                    sortCgFolderItems(currentCgFolder.id, 'nsfw');
                                    setCgSortDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/10 rounded"
                                >
                                  NSFW 在前
                                </button>
                                <button
                                  onClick={() => {
                                    sortCgFolderItems(currentCgFolder.id, 'vertical');
                                    setCgSortDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/10 rounded"
                                >
                                  竖版 在前
                                </button>
                                <button
                                  onClick={() => {
                                    sortCgFolderItems(currentCgFolder.id, 'name');
                                    setCgSortDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/10 rounded"
                                >
                                  按名称 A→Z
                                </button>
                                <button
                                  onClick={() => {
                                    sortCgFolderItems(currentCgFolder.id, 'time');
                                    setCgSortDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/10 rounded"
                                >
                                  按时间（新→旧）
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 图集作为子文件夹 */}
                    <div className="p-4 border border-white/10 rounded">
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">
                        📁 图集（点击进入）
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {(currentCgFolder.sets || []).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setCgSetId(s.id);
                            }}
                            className={`p-4 rounded border cursor-pointer hover:border-emerald-500 transition-all min-w-[120px] text-left w-full sm:w-auto relative ${ts.item}`}
                          >
                            {s.nsfw && (
                              <span className="absolute top-2 right-2 text-[8px] font-black text-white bg-red-600/90 px-1.5 py-0.5 rounded">
                                NSFW
                              </span>
                            )}
                            <div className="text-sm font-bold truncate pr-10">📁 {s.name}</div>
                            <div className="text-[10px] opacity-60">{(s.itemIds || []).length} 张CG</div>
                          </button>
                        ))}
                        {(currentCgFolder.sets || []).length === 0 && (
                          <div className="text-xs opacity-50">暂无图集，点击「新建图集」创建</div>
                        )}
                      </div>
                    </div>

                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      素材池（CG 可加入上图集）
                    </div>

                    {isCgImportOpen && (
                      <div className="p-4 border border-emerald-500/30 bg-emerald-900/10 rounded animate-in fade-in">
                        <textarea
                          value={cgImportText}
                          onChange={e => setCgImportText(e.target.value)}
                          className={`w-full h-32 p-2 text-xs font-mono rounded ${ts.input}`}
                          placeholder="请粘贴CG链接，每行一个..."
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setIsCgImportOpen(false)} className="px-3 py-1 text-xs opacity-60">
                            取消
                          </button>
                          <button
                            onClick={handleCgBatchImport}
                            disabled={isCgImporting}
                            className={`px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded ${isCgImporting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-500'}`}
                          >
                            {isCgImporting ? '导入中…' : '导入'}
                          </button>
                        </div>
                      </div>
                    )}

                    {currentCG && (
                      <div className="mb-4 p-3 border border-emerald-500/30 bg-emerald-500/5 rounded flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <img src={currentCG.url} className="w-16 h-10 object-cover rounded border border-white/10" />
                          <div>
                            <div className="text-[9px] font-black text-red-500 uppercase tracking-widest">
                              当前显示的CG
                            </div>
                            <div className="text-xs font-bold text-white">{currentCG.name}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => onSetCG(null)}
                          className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded"
                        >
                          关闭当前 CG
                        </button>
                      </div>
                    )}

                    {/* 素材池：仅展示“未加入任何图集”的 CG，其余 CG 在上方图集明细中管理 */}
                    {(() => {
                      const usedIds = new Set<string>();
                      (currentCgFolder.sets || []).forEach(s => {
                        (s.itemIds || []).forEach(id => usedIds.add(id));
                      });
                      const poolItems = (currentCgFolder.items || []).filter(cg => !usedIds.has(cg.id));
                      return (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                          {poolItems.map(cg => (
                            <div
                              key={cg.id}
                              className={`aspect-[3/4] rounded-lg overflow-hidden border shadow-md group relative cursor-pointer transition-all ${selectedCgForPreview?.id === cg.id ? 'ring-2 ring-emerald-500 border-transparent' : currentCG?.id === cg.id ? 'ring-2 ring-red-500 border-transparent' : ts.item}`}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCgForPreview(cg);
                              }}
                            >
                              <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black/30">
                                <CgGalleryPreviewImg
                                  item={cg}
                                  settings={cgDisplay}
                                  runtimeTall={!!cgTallAspectById[cg.id]}
                                  onDetectTallAspect={markCgTallAspect}
                                  className="group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                              {cg.nsfw && (
                                <span className="absolute top-1.5 left-1.5 z-10 text-[8px] font-black text-white bg-red-600/90 px-1.5 py-0.5 rounded">
                                  NSFW
                                </span>
                              )}
                              {cg.isVertical && (
                                <span className="absolute top-1.5 right-1.5 z-10 text-[8px] font-black text-white bg-blue-600/90 px-1.5 py-0.5 rounded">
                                  竖版
                                </span>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 pointer-events-none border-t border-white/5">
                                <span className="text-[10px] font-bold block truncate text-white">{cg.name}</span>
                              </div>
                              <div className="absolute top-9 left-1.5 right-1.5 flex justify-between items-center gap-1 opacity-0 group-hover:opacity-100 z-20 pointer-events-none">
                                <div className="flex gap-1 min-w-0 pointer-events-auto">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleApplyCG(cg);
                                    }}
                                    className="bg-green-600 text-white px-2 py-1 text-[9px] font-bold rounded shrink-0"
                                  >
                                    显示
                                  </button>
                                  {(currentCgFolder?.sets || []).length > 0 && (
                                    <select
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => {
                                        const sid = e.target.value;
                                        if (sid) {
                                          addCgToSet(currentCgFolder!.id, sid, cg.id);
                                          e.target.value = '';
                                        }
                                      }}
                                      className="bg-emerald-600 text-white px-2 py-1 text-[9px] font-bold rounded border-0 cursor-pointer max-w-[72px] min-w-0"
                                    >
                                      <option value="">+图集</option>
                                      {(currentCgFolder!.sets || []).map(s => (
                                        <option key={s.id} value={s.id}>
                                          +{s.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0 pointer-events-auto">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      setCgEditId(cg.id);
                                      setCgInputName(cg.name);
                                      setCgInputUrl(cg.url);
                                      setCgInputTriggerContent(cg.triggerContent ?? '');
                                      setCgInputCgTagId(cg.cgTagId ?? cg.keywords?.[0] ?? '');
                                      setCgInputNsfw(!!cg.nsfw);
                                      setCgInputIsVertical(!!cg.isVertical);
                                    }}
                                    className="bg-blue-600 text-white p-1 rounded text-[9px]"
                                    title="编辑"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      deleteCgItem(cg.id);
                                    }}
                                    className="bg-red-600 text-white p-1 rounded text-[9px]"
                                    title="删除"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {poolItems.length === 0 && (
                            <div className="col-span-full text-xs opacity-40">
                              （当前素材池中的 CG 已全部加入上方某个图集，或素材池为空）
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full opacity-30 text-sm">
                    请选择左侧的图集或素材库
                  </div>
                )}
              </div>

              {isCgPoolPickerOpen && currentCgSet && (
                <div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                  onClick={() => setIsCgPoolPickerOpen(false)}
                >
                  <div
                    className={`w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col rounded shadow-2xl border ${ts.modalBg}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="p-4 border-b border-white/10">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-500">
                        从素材库选择 CG 添加到图集
                      </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 md:grid-cols-5 gap-3">
                      {(currentCgFolder?.items || []).map(cg => {
                        const inSet = currentCgSet.itemIds.includes(cg.id);
                        return (
                          <div
                            key={cg.id}
                            onClick={() => {
                              if (!inSet) {
                                addCgToSet(currentCgFolder!.id, currentCgSet.id, cg.id);
                              }
                            }}
                            className={`relative rounded overflow-hidden border cursor-pointer transition-all ${cg.isVertical ? 'aspect-[3/4]' : 'aspect-video'} ${inSet ? 'opacity-50 cursor-default ring-1 ring-emerald-500' : 'hover:ring-2 hover:ring-emerald-500'} ${ts.item}`}
                          >
                            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black/30">
                              <CgGalleryPreviewImg
                                item={cg}
                                settings={cgDisplay}
                                runtimeTall={!!cgTallAspectById[cg.id]}
                                onDetectTallAspect={markCgTallAspect}
                              />
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 text-[9px] truncate text-white">
                              {cg.name}
                            </div>
                            {inSet && (
                              <span className="absolute top-1 right-1 bg-emerald-600 text-white text-[8px] px-1 rounded">
                                已添加
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(currentCgFolder?.items || []).length === 0 && (
                      <div className="p-8 text-center text-sm opacity-60">素材库为空，请先新建素材库并添加 CG</div>
                    )}
                  </div>
                </div>
              )}

              {cgEditId && (
                <div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                  onClick={() => setCgEditId(null)}
                >
                  <div
                    className={`relative w-[500px] max-w-[calc(100vw-2rem)] p-6 pt-12 rounded shadow-2xl border ${ts.modalBg}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="absolute top-3 right-3 z-10">
                      <ModalCloseX variant="inline" onClose={() => setCgEditId(null)} />
                    </div>
                    <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-emerald-500 pr-10">
                      编辑CG详情
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold opacity-50 uppercase">名称</label>
                        <input
                          value={cgInputName}
                          onChange={e => setCgInputName(e.target.value)}
                          className={`w-full p-2 text-xs rounded border ${ts.input}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold opacity-50 uppercase">链接</label>
                        <input
                          value={cgInputUrl}
                          onChange={e => setCgInputUrl(e.target.value)}
                          className={`w-full p-2 text-xs rounded border ${ts.input}`}
                        />
                      </div>
                      <div className="flex gap-4 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-red-400">
                          <input
                            type="checkbox"
                            checked={cgInputNsfw}
                            onChange={e => setCgInputNsfw(e.target.checked)}
                            className="w-4 h-4"
                          />{' '}
                          NSFW
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-400">
                          <input
                            type="checkbox"
                            checked={cgInputIsVertical}
                            onChange={e => setCgInputIsVertical(e.target.checked)}
                            className="w-4 h-4"
                          />{' '}
                          竖版
                        </label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold opacity-50 uppercase">触发内容</label>
                        <input
                          value={cgInputTriggerContent}
                          onChange={e => setCgInputTriggerContent(e.target.value)}
                          className={`w-full p-2 text-xs rounded border ${ts.input}`}
                          placeholder="例如：张承岳给user口交"
                        />
                        <p className="text-[9px] opacity-45 leading-snug">
                          叙事侧用于说明「何时」触发；写入触发词清单时会生成完整句式供模型参考。
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold opacity-50 uppercase">cg id</label>
                        <input
                          value={cgInputCgTagId}
                          onChange={e => setCgInputCgTagId(e.target.value)}
                          className={`w-full p-2 text-xs rounded border ${ts.input}`}
                          placeholder="cg图的编号，例如：0001"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                      <button
                        onClick={() => setCgEditId(null)}
                        className="px-4 py-2 text-xs opacity-60 hover:opacity-100"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveCgItem}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- TRIGGERS TAB：触发词总览（与立绘/背景/CG 同级） --- */}
          {activeTab === 'triggers' && (
            <div className="flex-1 flex overflow-hidden min-h-0">
              <div className={`w-80 border-r flex flex-col shrink-0 ${ts.sidebar}`}>
                <div className="p-6 space-y-4">
                  <div className="text-xs font-black tracking-[0.25em] uppercase text-emerald-400 flex items-center gap-2">
                    <span className="text-lg">✶</span>
                    Trigger_Index
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-70">
                    本页自动汇总当前图库中的
                    <span className="text-emerald-400 mx-1">角色立绘、背景图、CG图</span>
                    所有可用的名字 / 服饰 / 表情，适合直接复制到 世界书、提示词或说明文档中使用。
                  </p>
                  <div className="space-y-2 text-[11px] opacity-60">
                    <div>· 当你在图库中增删立绘、背景或 CG 时，这里的列表会实时更新。</div>
                    <div>· 建议将这里的内容整体复制，作为「合法触发词白名单」。</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col p-6 md:p-8 overflow-hidden min-h-0">
                <div className="flex-1 min-h-0 flex flex-col bg-black/30 rounded-xl border border-white/10 shadow-inner backdrop-blur-sm">
                  <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold tracking-[0.25em] uppercase text-emerald-400">
                        Trigger_Words_Overview
                      </span>
                      <span className="text-[11px] opacity-60 mt-1">可一键复制的触发词清单，与当前图库实时同步</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyTriggerSummary}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold tracking-widest uppercase hover:bg-emerald-500 shadow-md hover:shadow-emerald-500/40 transition-all flex items-center gap-2"
                      >
                        <span>📋</span>
                        {copiedTrigger ? '已复制' : '一键复制'}
                      </button>
                      <button
                        onClick={handleWriteTriggerToWorldbook}
                        disabled={writingTrigger}
                        className="px-4 py-2 rounded-lg bg-amber-600 disabled:bg-amber-900/60 disabled:cursor-not-allowed text-white text-xs font-bold tracking-widest uppercase hover:bg-amber-500 shadow-md hover:shadow-amber-500/40 transition-all flex items-center gap-2"
                      >
                        <span>📝</span>
                        {writingTrigger ? '写入中…' : '一键写入'}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 p-4 md:p-5 overflow-hidden">
                    <textarea
                      value={triggerSummary}
                      readOnly
                      className="w-full h-full min-h-[200px] bg-black/60 border border-white/10 rounded-lg p-4 text-[11px] md:text-xs leading-relaxed font-mono text-emerald-100 resize-none custom-scrollbar focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {(selectedSprite || selectedCgForPreview) && (
            <aside
              className="w-full max-h-[40vh] md:max-h-none md:w-[280px] shrink-0 flex flex-col bg-white border-t md:border-t-0 md:border-l border-slate-200 text-slate-800 relative z-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3 border-b border-slate-200 flex justify-between items-center gap-2 shrink-0">
                <h3 className="text-sm font-bold text-slate-800">预览</h3>
                <ModalCloseX
                  variant="inline"
                  onClose={() => {
                    setSelectedSprite(null);
                    setSelectedCgForPreview(null);
                  }}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-3 bg-white min-h-0">
                {selectedSprite && (
                  <div className="space-y-4 pointer-events-none select-none">
                    <div className="aspect-[3/4] bg-slate-100 rounded overflow-hidden">
                      <img src={selectedSprite.imageUrl} className="w-full h-full object-cover object-top" alt="" />
                    </div>
                    <div className="space-y-2 text-sm text-slate-800">
                      <div className="font-bold text-slate-800">
                        {currentCharFolder?.name || selectedSprite.characterName || '—'} ·{' '}
                        {selectedSprite.outfit || '未设置'}
                      </div>
                      <div className="text-slate-600">{selectedSprite.expression || '未设置'}</div>
                      {selectedSprite.isFallback && (
                        <div className="text-emerald-600 font-bold text-xs">✓ 默认立绘</div>
                      )}
                    </div>
                  </div>
                )}
                {selectedCgForPreview && (
                  <div className="space-y-4">
                    <div
                      className={`rounded overflow-hidden bg-slate-100 pointer-events-none select-none relative ${selectedCgForPreview.isVertical ? 'aspect-[3/4]' : 'aspect-video'}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                        <CgGalleryPreviewImg
                          item={selectedCgForPreview}
                          settings={cgDisplay}
                          runtimeTall={!!cgTallAspectById[selectedCgForPreview.id]}
                          onDetectTallAspect={markCgTallAspect}
                        />
                      </div>
                    </div>
                    <div className="text-xs font-bold truncate text-slate-800 pointer-events-none select-none">
                      {selectedCgForPreview.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyCG(selectedCgForPreview);
                        setSelectedCgForPreview(null);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded pointer-events-auto"
                    >
                      显示
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
