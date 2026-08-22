
import React, { useState, useEffect, useRef } from 'react';
import { ModalCloseX } from './ModalCloseX';
import { SaveData } from '../../types';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  getCurrentState: () => any; // Returns the partial state needed for SaveData.state
  onLoadState: (data: any) => void;
  theme?: string;
  /** 当前聊天 ID，用于按聊天隔离存档 */
  chatId?: string;
  /** 图1 整合：快速存档/读取、自动存档、一键清除 */
  onQuickSave?: () => void;
  onQuickLoad?: () => void;
  autoSaveEnabled?: boolean;
  /** 传入新值则设置为该值，不传则切换 */
  onAutoSaveToggle?: (value?: boolean) => void;
  onClearAll?: () => void;
  /** 是否使用手机/窄视口布局（弹窗宽度） */
  isMobileLayout?: boolean;
}

const PAGES = 10;
const SLOTS_PER_PAGE = 6; // 2x3 Grid
const AUTO_SLOTS = 20;
const QUICK_SLOTS = 10;
// 旧逻辑会把常用图床 (postimg 等) 一并过滤，导致预览图全部消失。
// 当前版本不再区分「外部图床」，一律尝试展示，真正加载失败再由 <img onError> 隐藏。
function isExternalImageHost(_url: string): boolean {
    return false;
}

/** 从 state 解析立绘 URL：优先 stageSprites+customLibrary；若舞台上没有立绘，则不显示立绘 */
function resolveSpriteUrl(state: any): string {
    const lib = state.customLibrary || [];
    const sprites = state.stageSprites || [];
    const chars = state.characters || [];
    if (sprites.length > 0) {
        const s = sprites[0];
        const folder = lib.find((f: any) => String(f.id).toLowerCase() === String(s.characterId).toLowerCase() || (f.name || '').toLowerCase() === String(s.characterId).toLowerCase());
        if (!folder) {
            const char = chars.find((c: any) => c.id === s.characterId || c.name === s.characterId);
            return char?.avatarUrl || '';
        }
        const match = folder.sprites?.find((sp: any) => (sp.outfit || '') === (s.outfit || '') && (sp.expression || '') === (s.expression || ''))
            || folder.sprites?.find((sp: any) => sp.isFallback) || folder.sprites?.[0];
        if (match?.imageUrl) return match.imageUrl;
        const char = chars.find((c: any) => c.id === s.characterId || c.name === s.characterId);
        return char?.avatarUrl || '';
    }
    // 舞台上没有任何立绘时，不强行用头像占位，返回空字符串表示「无立绘」
    return '';
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ 
  isOpen, onClose, getCurrentState, onLoadState, theme = 'night', chatId,
  onQuickSave, onQuickLoad, autoSaveEnabled, onAutoSaveToggle, onClearAll, isMobileLayout
}) => {
  const STORAGE_PREFIX = `spirit_command_save_v2_${chatId || 'global'}_`;
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load');
  const [currentPage, setCurrentPage] = useState<number | 'auto' | 'quick'>('auto');
  const [saves, setSaves] = useState<Record<string, SaveData>>({});
  const [hoveredSaveKey, setHoveredSaveKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all saves metadata on open
  useEffect(() => {
    if (isOpen) {
      refreshSaves();
    } else {
      setHoveredSaveKey(null);
    }
  }, [isOpen]);

  const refreshSaves = () => {
      const loaded: Record<string, SaveData> = {};
      
      // Load Auto Saves (0-19)
      for (let i = 0; i < AUTO_SLOTS; i++) {
          const key = `auto_${i}`;
          const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
          if (raw) { try { loaded[key] = JSON.parse(raw); } catch(e) {} }
      }

      // Load Quick Saves (0-9)
      for (let i = 0; i < QUICK_SLOTS; i++) {
          const key = `quick_${i}`;
          const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
          if (raw) { try { loaded[key] = JSON.parse(raw); } catch(e) {} }
      }

      // Load Manual Pages
      for (let p = 1; p <= PAGES; p++) {
          for (let s = 0; s < SLOTS_PER_PAGE; s++) {
              const key = `p${p}_s${s}`;
              const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
              if (raw) {
                  try { loaded[key] = JSON.parse(raw); } catch(e) {}
              }
          }
      }
      setSaves(loaded);
  };

  const handleSave = (key: string, type: 'manual' | 'auto' | 'quick', slotId: number) => {
    try {
        const fullState = getCurrentState(); // From App.tsx
        const timestamp = Date.now();
        const dateString = new Date().toLocaleString('zh-CN', { hour12: false });

        // 预览：始终用背景图；CG与立绘状态由state单独保存
        const bgUrl = fullState.background?.url || '';
        const charUrl = fullState.currentCG?.url ? '' : resolveSpriteUrl(fullState);

        const newSave: SaveData = {
            meta: {
                id: `${Date.now()}`,
                slotId: slotId,
                type: type,
                timestamp,
                dateString,
                summary: fullState.chatHistory[fullState.currentLineIndex]?.text.substring(0, 40) + '...' || "No Text",
                locationName: fullState.background.name || "Unknown",
                version: 2
            },
            preview: { bgUrl, charUrl },
            state: {
                chatHistory: fullState.chatHistory,
                currentLineIndex: fullState.currentLineIndex,
                activeCharacterId: fullState.activeCharacterId,
                background: fullState.background,
                stageSprites: fullState.stageSprites,
                characters: fullState.characters,
                mode: fullState.mode,
                currentOutfit: fullState.currentOutfit || 'default',
                currentExpression: fullState.currentExpression || 'default',
                currentCG: fullState.currentCG
            },
            worldContext: {
                backgroundLibrary: fullState.backgroundLibrary,
                customLibrary: fullState.customLibrary,
                cgLibrary: fullState.cgLibrary,
                characterOverrides: fullState.avatarOverrides
            }
        };

        const serialized = JSON.stringify(newSave);
        // 预警：单存档超过400KB时提示
        if (serialized.length > 400_000) {
            console.warn(`[存档] 存档数据偏大 (${Math.round(serialized.length/1024)}KB)，建议清理旧存档或导出备份`);
        }
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
        setSaves(prev => ({ ...prev, [key]: newSave }));
    } catch (e) {
        alert("存档失败: LocalStorage 可能已满。建议导出并清除旧存档。");
        console.error(e);
    }
  };

  const handleLoad = (save: SaveData) => {
      // VALIDATION: Ensure save object and state exist
      if (!save || !save.state) {
          alert("无效存档：数据不完整。");
          return;
      }

      if (confirm(`读取存档？\n${save.meta.dateString}\n${save.meta.locationName}`)) {
          try {
              // Pass state and worldContext (if exists)
              onLoadState({ ...save.state, ...(save.worldContext || {}) });
          } catch (e) {
              console.error("Load failed:", e);
              alert("读取存档时发生错误，文件可能已损坏。");
          }
          onClose();
      }
  };

  const handleDelete = (key: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("确认删除此存档？")) {
          localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
          const newSaves = { ...saves };
          delete newSaves[key];
          setSaves(newSaves);
      }
  };

  const handleBulkExport = () => {
      if (Object.keys(saves).length === 0) { alert("无存档可导出。"); return; }
      const blob = new Blob([JSON.stringify(saves, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SpiritCommand_All_Saves_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (confirm(`是否覆盖当前所有浏览器存档？(包含 ${Object.keys(json).length} 个存档槽)`)) {
                  Object.keys(json).forEach(key => {
                      if (key.startsWith('auto') || key.startsWith('quick') || key.startsWith('p')) {
                          localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(json[key]));
                      }
                  });
                  refreshSaves();
                  alert("批量导入成功。");
              }
          } catch (err) { alert("导入失败：文件格式错误"); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  if (!isOpen) return null;

  const isMobile = isMobileLayout ?? false;

  // --- STYLES ---
  const isFantasyElegant = theme === 'fantasy-elegant';
  const styles = {
      modalBg: isFantasyElegant
        ? 'bg-[#faf6ee] text-amber-950 border border-amber-800/30'
        : theme === 'day'
          ? 'bg-slate-100 text-slate-900'
          : theme === 'tech'
            ? 'bg-[#0B1120] text-cyan-400 font-mono border border-cyan-500/30'
            : theme === 'military'
              ? 'bg-[#1a1c10] text-emerald-500 font-mono border border-emerald-800'
              : 'bg-[#121212] text-slate-200 border border-white/10',
      header: isFantasyElegant
        ? 'bg-[#f4ecd8] border-amber-800/25'
        : theme === 'day'
          ? 'bg-white border-slate-300'
          : theme === 'tech'
            ? 'bg-[#0f172a] border-cyan-500/20'
            : theme === 'military'
              ? 'bg-[#12140b] border-emerald-900'
              : 'bg-[#1e1e1e] border-white/5',
      slotBg: isFantasyElegant
        ? 'bg-[#fffdf8] border-amber-800/25 hover:border-amber-600 hover:bg-amber-50/80'
        : theme === 'day'
          ? 'bg-white border-slate-300 hover:border-emerald-500'
          : theme === 'tech'
            ? 'bg-[#0f172a] border-cyan-500/20 hover:border-cyan-400 hover:bg-cyan-900/20'
            : theme === 'military'
              ? 'bg-[#151910] border-emerald-800/50 hover:border-emerald-500 hover:bg-emerald-900/20'
              : 'bg-[#252525] border-white/10 hover:border-white/50',
      slotEmpty: isFantasyElegant
        ? 'bg-amber-50/60 border-dashed border-amber-700/35 opacity-60'
        : theme === 'day'
          ? 'bg-slate-200/50 border-dashed border-slate-300'
          : 'bg-white/5 border-dashed border-white/10 opacity-50',
      accent: theme === 'tech'
        ? 'text-cyan-400'
        : theme === 'military'
          ? 'text-emerald-500'
          : isFantasyElegant
            ? 'text-amber-800'
            : 'text-emerald-500',
      tabActive: isFantasyElegant
        ? 'bg-amber-700 text-white shadow-md'
        : theme === 'day'
          ? 'bg-emerald-600 text-white shadow-md'
          : theme === 'tech'
            ? 'bg-cyan-600 text-white shadow-[0_0_10px_cyan]'
            : theme === 'military'
              ? 'bg-emerald-700 text-white shadow-[0_0_10px_#10b981]'
              : 'bg-white text-black',
      tabInactive: isFantasyElegant
        ? 'bg-amber-100/80 hover:bg-amber-100 text-amber-900'
        : theme === 'day'
          ? 'bg-slate-200 hover:bg-slate-300'
          : 'bg-white/5 hover:bg-white/10',
  };
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
          background: 'linear-gradient(180deg, #fffdf8 0%, #f4ecd8 100%)',
          fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
        }
      : undefined;
  const inkTitleStyle = isInk ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;

  // Render Logic
  const renderSlots = () => {
      const slots = [];
      
      if (currentPage === 'auto') {
          // Render 20 Auto slots
          for (let i = 0; i < AUTO_SLOTS; i++) {
              const key = `auto_${i}`;
              const save = saves[key];
              slots.push(createSlot(key, save, `Auto ${String(i+1).padStart(2, '0')}`, 'auto', i));
          }
      } else if (currentPage === 'quick') {
          // Render 10 Quick slots
          for (let i = 0; i < QUICK_SLOTS; i++) {
              const key = `quick_${i}`;
              const save = saves[key];
              slots.push(createSlot(key, save, `Quick ${String(i+1).padStart(2, '0')}`, 'quick', i));
          }
      } else {
          // Numbered Pages (6 per page)
          for (let i = 0; i < SLOTS_PER_PAGE; i++) {
              const key = `p${currentPage}_s${i}`;
              const save = saves[key];
              const globalIndex = (currentPage - 1) * SLOTS_PER_PAGE + i + 1;
              slots.push(createSlot(key, save, `No. ${String(globalIndex).padStart(2, '0')}`, 'manual', i));
          }
      }
      return slots;
  };

  const createSlot = (key: string, save: SaveData | undefined, label: string, type: 'manual'|'auto'|'quick', idx: number) => (
      <SaveSlotItem 
        key={key} 
        save={save} 
        slotLabel={label}
        onClick={() => activeTab === 'save' ? handleSave(key, type, idx) : (save && handleLoad(save))}
        onDelete={(e: any) => handleDelete(key, e)}
        mode={activeTab}
        styles={styles}
        isEmpty={!save}
        theme={theme}
        titleStyle={inkTitleStyle}
        bodyStyle={
          isInk || isFantasyElegant ? { fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif' } : undefined
        }
        onMouseEnter={() => save && setHoveredSaveKey(key)}
        onMouseLeave={() => setHoveredSaveKey(null)}
      />
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`relative w-full ${isMobile ? 'max-w-[min(96vw,960px)] h-[94vh]' : 'max-w-5xl h-[86vh]'} rounded-xl shadow-2xl overflow-hidden flex flex-col ${styles.modalBg}`}
        onClick={e => e.stopPropagation()}
        style={inkPanelStyle}
      >
        
        {/* TOP BAR */}
        <div className={`h-16 px-6 border-b flex justify-between items-center gap-3 shrink-0 ${styles.header} relative z-20`}>
             <div className="flex items-center gap-8 min-w-0 shrink-0">
                 <h2 className={`font-black tracking-tighter text-2xl italic flex items-center gap-2 ${styles.accent}`} style={inkTitleStyle}>
                     存档<span className="opacity-30">/</span>读取 <span className="text-xs font-normal not-italic opacity-50 tracking-normal border border-current px-2 rounded">Ver.3.0</span>
                 </h2>
                 <div className="flex bg-black/20 p-1 rounded-lg">
                     <button onClick={() => setActiveTab('load')} className={`px-6 py-1.5 rounded font-bold text-sm tracking-widest transition-all ${activeTab === 'load' ? styles.tabActive : styles.tabInactive}`} style={inkTitleStyle}>读取 (LOAD)</button>
                     <button onClick={() => setActiveTab('save')} className={`px-6 py-1.5 rounded font-bold text-sm tracking-widest transition-all ${activeTab === 'save' ? styles.tabActive : styles.tabInactive}`} style={inkTitleStyle}>保存 (SAVE)</button>
                 </div>
             </div>
             <div className="flex items-center gap-3 flex-wrap justify-end min-w-0 flex-1">
                 {onAutoSaveToggle != null && (
                   <div className="flex items-center gap-2">
                     <span className="text-xs opacity-60">自动存档</span>
                     <button
                       onClick={() => onAutoSaveToggle(!autoSaveEnabled)}
                       className={`w-10 h-5 rounded-full flex items-center transition-colors ${autoSaveEnabled ? 'bg-emerald-500 justify-end' : 'bg-white/20 justify-start'}`}
                       title={autoSaveEnabled ? '点击关闭自动存档' : '点击开启自动存档'}
                     ><div className="w-4 h-4 rounded-full bg-white shadow mx-0.5" /></button>
                   </div>
                 )}
                <button onClick={handleBulkExport} className="opacity-60 hover:opacity-100 text-xs font-bold flex items-center gap-2 border-b border-transparent hover:border-current transition-all" style={inkTitleStyle}><span>📦</span> 批量导出</button>
                <button onClick={() => fileInputRef.current?.click()} className="opacity-60 hover:opacity-100 text-xs font-bold flex items-center gap-2 border-b border-transparent hover:border-current transition-all" style={inkTitleStyle}><span>📥</span> 导入</button>
                {onClearAll && <button onClick={() => { onClearAll(); refreshSaves(); }} className="opacity-60 hover:opacity-100 text-xs font-bold flex items-center gap-2 border-b border-transparent hover:border-red-400 text-red-400 hover:text-red-300 transition-all" style={inkTitleStyle}>一键清除</button>}
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
                 <ModalCloseX variant="inline" onClose={onClose} />
             </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">
            <div className={`w-28 shrink-0 flex flex-col items-center py-6 gap-2 border-r custom-scrollbar overflow-y-auto ${styles.header}`}>
                 <PageBtn label="AUTO" active={currentPage === 'auto'} onClick={() => setCurrentPage('auto')} styles={styles} titleStyle={inkTitleStyle} />
                 <PageBtn label="QUICK" active={currentPage === 'quick'} onClick={() => setCurrentPage('quick')} styles={styles} titleStyle={inkTitleStyle} />
                 <div className="w-12 h-px bg-current opacity-20 my-2"></div>
                 {Array.from({ length: PAGES }).map((_, i) => (
                     <PageBtn key={i} label={String(i + 1)} active={currentPage === i + 1} onClick={() => setCurrentPage(i + 1)} styles={styles} titleStyle={inkTitleStyle} />
                 ))}
            </div>
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-black/10">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                     {renderSlots()}
                 </div>
            </div>
        </div>

        {/* 图2: 大预览图固定在界面外右侧，不占用主布局 */}
        {isOpen && hoveredSaveKey && saves[hoveredSaveKey] && (
          <div className={`fixed right-0 top-0 bottom-0 w-96 z-[110] flex flex-col border-l shadow-2xl ${styles.header}`} onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-bold" style={inkTitleStyle}>存档预览</h3>
              <button onClick={() => setHoveredSaveKey(null)} className="text-lg leading-none p-1 rounded hover:bg-white/10 opacity-70 hover:opacity-100">×</button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-black/40 relative">
                <img src={saves[hoveredSaveKey].preview.bgUrl || ''} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {saves[hoveredSaveKey].preview.charUrl && (
                  <div className="absolute bottom-0 right-0 left-0 h-[70%] flex items-end justify-center">
                    <img src={saves[hoveredSaveKey].preview.charUrl} className="h-full w-auto object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]" alt="" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-1 text-xs">
                <div className="font-bold">{saves[hoveredSaveKey].meta.locationName}</div>
                <div className="opacity-70">{saves[hoveredSaveKey].meta.dateString}</div>
                <p className="line-clamp-2 opacity-80">"{saves[hoveredSaveKey].meta.summary}"</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PageBtn = ({ label, active, onClick, styles, titleStyle }: any) => (
    <button onClick={onClick} className={`w-20 h-12 rounded flex items-center justify-center font-black text-sm italic transition-all ${active ? styles.tabActive : styles.tabInactive}`} style={titleStyle}>{label}</button>
);

const SaveSlotItem = ({ save, slotLabel, onClick, onDelete, mode, styles, isEmpty, theme, onMouseEnter, onMouseLeave, titleStyle, bodyStyle }: any) => {
    const isSaveMode = mode === 'save';
    const [charImgError, setCharImgError] = React.useState(false);

    if (isEmpty) {
        return (
            <div onClick={isSaveMode ? onClick : undefined} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all group ${isSaveMode ? 'cursor-pointer hover:bg-white/5 hover:border-current opacity-60 hover:opacity-100' : 'opacity-30 cursor-not-allowed'} ${styles.slotEmpty}`}>
                <span className="text-2xl font-thin opacity-50">{isSaveMode ? '+' : '∅'}</span>
                <span className="font-mono font-bold text-[10px] uppercase tracking-widest" style={titleStyle}>{slotLabel}</span>
            </div>
        );
    }
    const hasChar = !!(save.preview.charUrl && save.preview.charUrl.trim()) && !charImgError;
    // 某些外链图床（如 postimg）在图片被删除时会返回蓝色「image not found」占位图，
    // 这里直接在存档预览中屏蔽这些主机的背景，避免出现刺眼的蓝屏。
    const bgUrl = (save.preview.bgUrl || '').trim();
    const isBadBgHost = /postimg\.cc|postimage\.org|postimages\.org/i.test(bgUrl);
    const hasBg = !!bgUrl && !isBadBgHost;
    return (
        <div onClick={onClick} className={`aspect-video rounded-lg border relative overflow-hidden group cursor-pointer transition-all hover:scale-[1.02] shadow-lg ${styles.slotBg}`}>
            <div className="absolute inset-0 bg-slate-900">{hasBg && <img src={save.preview.bgUrl} className="w-full h-full object-cover opacity-60 blur-[1px] group-hover:blur-0 transition-all duration-500" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}</div>
            {hasChar && <div className="absolute bottom-0 right-4 w-1/2 h-[90%] flex items-end justify-end"><img src={save.preview.charUrl} className="h-full w-auto object-contain drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]" alt="" onError={() => setCharImgError(true)} /></div>}
            <div className={`absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-black/90 via-black/60 to-transparent p-4 flex flex-col justify-between ${theme === 'day' ? 'text-white' : ''}`}>
                 <div>
                     <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-widest mb-2 bg-emerald-600`} style={titleStyle}>{slotLabel}</div>
                     <h3 className="text-sm font-bold truncate text-white/90 drop-shadow-md" style={titleStyle}>{save.meta.locationName}</h3>
                     <p className="text-[10px] font-mono opacity-70" style={bodyStyle}>{save.meta.dateString}</p>
                 </div>
                 <div className="mb-2"><p className="text-xs italic text-white/80 line-clamp-3 leading-relaxed border-l-2 border-white/30 pl-2" style={bodyStyle}>"{save.meta.summary}"</p></div>
            </div>
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={`px-6 py-2 rounded font-bold text-xs uppercase tracking-wider shadow-lg text-white bg-blue-600 hover:bg-blue-500`} style={titleStyle}>{isSaveMode ? '覆盖' : '读取'}</button>
                <button onClick={onDelete} className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-colors">🗑️</button>
            </div>
        </div>
    );
};
