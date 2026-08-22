
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CustomFolder, CustomSprite } from '../../types';

// 表情预设：分组 + 同义词列表
const EXPRESSION_PRESET_GROUPS: { id: string; label: string; items: string[] }[] = [
  {
    id: 'neutral',
    label: '正常 / 微笑',
    items: ['正常', '默认', '待机', '微笑', '温和', '放松'],
  },
  {
    id: 'happy',
    label: '高兴',
    items: ['开心', '高兴', '愉快', '大笑', '爽朗', '露齿笑'],
  },
  {
    id: 'angry',
    label: '生气',
    items: ['生气', '愤怒', '瞪眼', '皱眉', '训斥', '不满'],
  },
  {
    id: 'shy',
    label: '害羞 / 尴尬',
    items: ['害羞', '脸红', '不好意思', '尴尬', '回避视线', '局促'],
  },
  {
    id: 'surprised',
    label: '惊讶',
    items: ['惊讶', '吃惊', '震惊', '张嘴', '愣住'],
  },
  {
    id: 'tease',
    label: '调戏 / 色气',
    items: ['好色', '调戏', '捉弄', '戏弄', '坏笑', '不怀好意', '猥琐'],
  },
  {
    id: 'tense',
    label: '紧张 / 忍耐',
    items: ['紧张', '忍耐', '咬牙', '憋着', '吃力', '强忍', '咬唇'],
  },
  {
    id: 'sad',
    label: '难过 / 伤心',
    items: ['难过', '悲伤', '心酸', '委屈', '要哭', '含泪'],
  },
  {
    id: 'climax',
    label: '高潮 / 射精',
    items: ['高潮', '射精', '喘息', '失神', '颤抖', '性高潮'],
  },
  {
    id: 'cold',
    label: '冷漠 / 冷静',
    items: ['冷漠', '冷淡', '严肃', '冷静', '面无表情'],
  },
];

interface CharacterLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customLibrary: CustomFolder[];
  onUpdateLibrary: (lib: CustomFolder[]) => void;
  theme?: string;
}

export const CharacterLibraryModal: React.FC<CharacterLibraryModalProps> = ({
  isOpen, onClose, customLibrary, onUpdateLibrary, theme = 'night'
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByMode, setGroupByMode] = useState<'outfit' | 'expression'>('outfit'); // 分类模式：按服饰或按表情
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<string[]>([]);
  const [batchOutfit, setBatchOutfit] = useState('');
  
  // Batch Import State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  // 当前选中的表情预设分组
  const [activeExpressionPresetGroupId, setActiveExpressionPresetGroupId] = useState<string>('');
  
  // JSON Import/Export
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when folder changes
  useEffect(() => {
      setSearchQuery('');
      setIsImportOpen(false);
      setSelectedSpriteIds([]);
      setBatchOutfit('');
  }, [currentFolderId]);

  // Helpers
  const addFolder = () => {
    const newId = `custom_${Date.now()}`;
    onUpdateLibrary([
      ...customLibrary,
      { id: newId, name: '新角色', sprites: [], spriteFolderKind: 'fullbody' },
    ]);
  };
  const setFolderSpriteKind = (folderId: string, kind: 'fullbody' | 'avatar') => {
    onUpdateLibrary(customLibrary.map(f => (f.id === folderId ? { ...f, spriteFolderKind: kind } : f)));
  };
      const deleteFolder = (id: string, e: React.MouseEvent) => { e.stopPropagation(); if (confirm('确认删除该文件夹？')) { onUpdateLibrary(customLibrary.filter(f => f.id !== id)); if (currentFolderId === id) setCurrentFolderId(null); } };
  const updateFolderName = (id: string, newName: string) => { onUpdateLibrary(customLibrary.map(f => f.id === id ? {...f, name: newName} : f)); };
  
  const addSprite = () => { 
      if (!currentFolderId) return; 
      const newSprite: CustomSprite = { 
          id: `sprite_${Date.now()}`, 
          characterName: customLibrary.find(f => f.id === currentFolderId)?.name || '未知角色', 
          outfit: '常服', 
          expression: '默认', 
          imageUrl: 'https://via.placeholder.com/300x600?text=No+Image', 
          isFallback: false, 
          avatarScale: 3.0, 
          avatarX: 5, 
          avatarY: 2 
      }; 
      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? { ...f, sprites: [...f.sprites, newSprite] } : f)); 
  };

  const handleBatchImport = () => {
      if (!currentFolderId || !importText.trim()) return;
      
      const urls = importText.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length === 0) return;

      const folder = customLibrary.find(f => f.id === currentFolderId);
      const charName = folder?.name || '未知角色';
      
      const newSprites: CustomSprite[] = urls.map((url, idx) => ({
          id: `sprite_${Date.now()}_${idx}`,
          characterName: charName,
          outfit: '批量导入',
          expression: `导入_${idx + 1}`,
          imageUrl: url,
          isFallback: false,
          avatarScale: 3.0, 
          avatarX: 5, 
          avatarY: 2
      }));

      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? { ...f, sprites: [...f.sprites, ...newSprites] } : f));
      setImportText('');
      setIsImportOpen(false);
      alert(`成功导入 ${newSprites.length} 张图片`);
  };

  const handleExportLibrary = () => {
      const blob = new Blob([JSON.stringify(customLibrary, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SpiritCommand_CharacterLibrary_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (Array.isArray(json)) {
                  onUpdateLibrary([...customLibrary, ...json]); // Append
                  alert("角色库导入成功 (Library Imported)");
              } else {
                  alert("格式错误：必须是数组");
              }
          } catch (err) { alert("JSON 解析失败"); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const updateSprite = (spriteId: string, field: keyof CustomSprite, value: any) => { 
      if (!currentFolderId) return; 
      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? { ...f, sprites: f.sprites.map(s => s.id === spriteId ? { ...s, [field]: value } : s) } : f)); 
  };

  const updateMultipleSprites = (ids: string[], field: keyof CustomSprite, value: any) => {
      if (!currentFolderId || !ids.length) return;
      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? {
          ...f,
          sprites: f.sprites.map(s => ids.includes(s.id) ? { ...s, [field]: value } : s)
      } : f));
  };

  const deleteSprite = (spriteId: string) => { 
      if (!currentFolderId) return; 
      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? { ...f, sprites: f.sprites.filter(s => s.id !== spriteId) } : f)); 
  };

  // Set selected sprite as default for its outfit group (isFallback = true), unset others in the same outfit
  const setAsDefault = (spriteId: string) => {
      if (!currentFolderId) return;
      const folder = customLibrary.find(f => f.id === currentFolderId);
      if (!folder) return;
      
      const targetSprite = folder.sprites.find(s => s.id === spriteId);
      if (!targetSprite) return;
      
      // 根据当前分类模式确定分组键
      const groupKey = groupByMode === 'outfit' ? targetSprite.outfit : targetSprite.expression;
      
      onUpdateLibrary(customLibrary.map(f => f.id === currentFolderId ? {
          ...f,
          sprites: f.sprites.map(s => {
              // 如果是按服饰分类，则同一服饰组内只能有一个默认
              // 如果是按表情分类，则同一表情组内只能有一个默认
              const spriteGroupKey = groupByMode === 'outfit' ? s.outfit : s.expression;
              if (spriteGroupKey === groupKey) {
                  return { ...s, isFallback: s.id === spriteId };
              }
              return s;
          })
      } : f));
  };

  const currentFolder = customLibrary.find(f => f.id === currentFolderId);
  
  const groupedSprites = useMemo(() => {
    if (!currentFolder) return {};
    const groups: Record<string, CustomSprite[]> = {};
    let filteredSprites = currentFolder.sprites;
    if (searchQuery) { const q = searchQuery.toLowerCase(); filteredSprites = filteredSprites.filter(s => s.expression.toLowerCase().includes(q) || s.outfit.toLowerCase().includes(q)); }
    filteredSprites.forEach(sprite => { 
      const key = groupByMode === 'outfit' ? (sprite.outfit || '未分类') : (sprite.expression || '未分类');
      if (!groups[key]) groups[key] = []; 
      groups[key].push(sprite); 
    });
    return groups;
  }, [currentFolder, searchQuery, groupByMode]);

  const sortedOutfitKeys = useMemo(() => {
      return Object.keys(groupedSprites);
  }, [groupedSprites]);

  const filteredFolders = useMemo(() => { 
      if (!searchQuery || currentFolderId) return customLibrary; 
      return customLibrary.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())); 
  }, [customLibrary, searchQuery, currentFolderId]);

  const toggleSpriteSelection = (spriteId: string) => {
      setSelectedSpriteIds(prev => prev.includes(spriteId) ? prev.filter(id => id !== spriteId) : [...prev, spriteId]);
  };

  const clearSelection = () => {
      setSelectedSpriteIds([]);
  };

  const applyBatchOutfit = () => {
      if (!batchOutfit.trim() || selectedSpriteIds.length === 0) return;
      updateMultipleSprites(selectedSpriteIds, 'outfit', batchOutfit.trim());
  };

  const manualSortCurrentFolder = () => {
      if (!currentFolderId) return;
      onUpdateLibrary(customLibrary.map(f => {
          if (f.id !== currentFolderId) return f;
          const sorted = [...f.sprites].sort((a, b) => {
              const keyA = (groupByMode === 'outfit' ? a.outfit : a.expression) || '';
              const keyB = (groupByMode === 'outfit' ? b.outfit : b.expression) || '';
              const primary = keyA.localeCompare(keyB, 'zh-CN');
              if (primary !== 0) return primary;
              const otherA = (groupByMode === 'outfit' ? a.expression : a.outfit) || '';
              const otherB = (groupByMode === 'outfit' ? b.expression : b.outfit) || '';
              return otherA.localeCompare(otherB, 'zh-CN');
          });
          return { ...f, sprites: sorted };
      }));
  };

  if (!isOpen) return null;

  const styles = {
      bg:
        theme === 'day'
          ? 'bg-slate-100 text-slate-900 border-slate-300'
          : theme === 'fantasy-elegant'
            ? 'bg-[#faf6ee] text-amber-950 border-amber-800/30'
            : theme === 'tech'
              ? 'bg-[#0B1120] text-cyan-400 border-cyan-500/30 font-mono'
              : theme === 'military'
                ? 'bg-[#1a1c10] text-green-500 border-green-800 font-mono'
                : 'bg-[#1a1b1e] text-slate-200 border-white/10',
      headerBg:
        theme === 'day'
          ? 'bg-white border-slate-200'
          : theme === 'fantasy-elegant'
            ? 'bg-[#f4ecd8] border-amber-800/25'
            : theme === 'tech'
              ? 'bg-[#0f172a] border-cyan-500/20'
              : theme === 'military'
                ? 'bg-[#12140b] border-green-900'
                : 'bg-[#141517] border-white/5',
      cardBg:
        theme === 'day'
          ? 'bg-white border-slate-200 hover:border-military-500'
          : theme === 'fantasy-elegant'
            ? 'bg-[#fffdf8] border-amber-800/25 hover:border-amber-600'
            : theme === 'tech'
              ? 'bg-cyan-950/20 border-cyan-500/30 hover:border-cyan-400'
              : theme === 'military'
                ? 'bg-green-950/20 border-green-800/50 hover:border-green-500'
                : 'bg-[#25262b] border-white/5 hover:border-military-500',
      inputBg:
        theme === 'day'
          ? 'bg-slate-100 border-slate-300'
          : theme === 'fantasy-elegant'
            ? 'bg-white border-amber-800/25 text-amber-950'
            : theme === 'tech'
              ? 'bg-black/40 border-cyan-500/30 text-cyan-200'
              : theme === 'military'
                ? 'bg-black/40 border-green-700/50 text-green-200'
                : 'bg-[#141517] border-white/5',
      accent:
        theme === 'fantasy-elegant'
          ? 'text-amber-800'
          : theme === 'military'
            ? 'text-green-500'
            : theme === 'tech'
              ? 'text-cyan-400'
              : 'text-military-500',
      accentBg:
        theme === 'fantasy-elegant'
          ? 'bg-amber-700'
          : theme === 'military'
            ? 'bg-green-600'
            : theme === 'tech'
              ? 'bg-cyan-600'
              : 'bg-military-500',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`w-[90vw] h-[85vh] max-w-7xl rounded-xl shadow-2xl overflow-hidden flex flex-col border ${styles.bg}`} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className={`h-16 border-b flex justify-between items-center px-6 shrink-0 ${styles.headerBg}`}>
             <h2 className={`font-bold tracking-widest text-lg flex items-center gap-2 ${styles.accent}`}>
                 <span className="text-xl">📚</span> 角色立绘库
             </h2>
             <div className="flex items-center gap-2">
                 <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold opacity-60 hover:opacity-100 flex items-center gap-1">
                     📥 导入库
                 </button>
                 <button onClick={handleExportLibrary} className="text-xs font-bold opacity-60 hover:opacity-100 flex items-center gap-1">
                     📤 导出库
                 </button>
                 <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJson} />
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
             {/* Navigation Bar */}
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-current/10">
                  <div className="flex items-center gap-4 flex-1">
                     {/* Back Button */}
                     {currentFolderId && (
                         <button 
                            onClick={() => { setCurrentFolderId(null); setSearchQuery(''); }}
                            className={`px-4 py-2 rounded font-bold text-sm uppercase flex items-center gap-2 transition-all hover:scale-105 ${theme === 'day' ? 'bg-white border shadow-sm' : 'bg-white/10 hover:bg-white/20'}`}
                         >
                             <span>⬅</span> 返回
                         </button>
                     )}
                     
                     {/* Breadcrumbs */}
                     <div className={`px-4 py-2 rounded font-mono font-bold text-lg flex items-center gap-2 ${theme === 'day' ? 'bg-slate-200/50' : 'bg-black/20'}`}>
                         <button onClick={() => { setCurrentFolderId(null); setSearchQuery(''); }} className="hover:underline opacity-60 hover:opacity-100">根目录</button>
                         {currentFolder && (
                             <>
                                <span className="opacity-30">/</span>
                                <span className={styles.accent}>{currentFolder.name}</span>
                             </>
                         )}
                     </div>
                  </div>

                  <div className="flex gap-4 items-center flex-wrap">
                  {currentFolderId && currentFolder && (
                    <div className="flex items-center gap-2 border border-current/20 rounded px-2 py-1">
                      <span className="text-[10px] font-bold opacity-60">立绘类型</span>
                      <button
                        type="button"
                        onClick={() => setFolderSpriteKind(currentFolder.id, 'fullbody')}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          (currentFolder.spriteFolderKind ?? 'fullbody') === 'fullbody'
                            ? `${styles.accentBg} text-white`
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        全身·舞台
                      </button>
                      <button
                        type="button"
                        onClick={() => setFolderSpriteKind(currentFolder.id, 'avatar')}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          currentFolder.spriteFolderKind === 'avatar'
                            ? `${styles.accentBg} text-white`
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        头像·左下
                      </button>
                    </div>
                  )}
                  {currentFolderId && (
                          <>
                              <div className="flex items-center gap-2">
                                  <label className="text-[10px] uppercase font-bold opacity-60">分类方式:</label>
                                  <div className="flex gap-1 border border-current/30 rounded p-0.5">
                                      <button 
                                        onClick={() => setGroupByMode('outfit')}
                                        className={`px-2 py-1 text-[10px] font-bold transition-all ${groupByMode === 'outfit' ? `${styles.accentBg} text-white` : 'opacity-60 hover:opacity-100'}`}
                                      >
                                          按服饰
                                      </button>
                                      <button 
                                        onClick={() => setGroupByMode('expression')}
                                        className={`px-2 py-1 text-[10px] font-bold transition-all ${groupByMode === 'expression' ? `${styles.accentBg} text-white` : 'opacity-60 hover:opacity-100'}`}
                                      >
                                          按表情
                                      </button>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2">
                                  <label className="text-[10px] uppercase font-bold opacity-60">分组顺序:</label>
                                  <button 
                                    onClick={manualSortCurrentFolder}
                                    className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${theme === 'day' ? 'bg-white hover:bg-slate-100' : 'bg-white/10 hover:bg-white/20'}`}
                                  >
                                      按当前名称排序一次
                                  </button>
                              </div>
                          </>
                      )}
                      <input 
                           value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                           className={`border rounded-full pl-4 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-current w-40 md:w-64 ${styles.inputBg}`}
                           placeholder="搜索角色或文件夹..."
                      />
                  </div>
             </div>

             {/* FOLDER VIEW */}
             {!currentFolderId ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <button onClick={addFolder} className={`aspect-[3/4] border border-dashed rounded flex flex-col items-center justify-center opacity-60 hover:opacity-100 transition-all ${styles.cardBg}`}>
                        <span className="text-3xl font-thin">+</span>
                        <span className="text-xs font-bold uppercase mt-2">新建角色</span>
                    </button>
                    {filteredFolders.map(folder => {
                        // Priority Preview: '头像' > Default (Fallback) > First Sprite
                        const portraitSprite = folder.sprites.find(s => s.outfit === '头像');
                        const defaultSprite = folder.sprites.find(s => s.isFallback);
                        const previewUrl = portraitSprite?.imageUrl || defaultSprite?.imageUrl || folder.sprites[0]?.imageUrl;
                        
                        return (
                            <div key={folder.id} onClick={() => { setCurrentFolderId(folder.id); setSearchQuery(''); }} className={`aspect-[3/4] border rounded p-3 cursor-pointer transition-all group relative ${styles.cardBg}`}>
                                <div className="w-full h-2/3 bg-black/20 rounded mb-2 overflow-hidden relative">
                                    {previewUrl ? 
                                        <img src={previewUrl} className="w-full h-full object-cover object-top" /> 
                                        : <div className="w-full h-full flex items-center justify-center opacity-50">空</div>
                                    }
                                    {portraitSprite && <div className="absolute top-1 right-1 bg-yellow-500/80 text-[9px] text-black px-1 rounded font-bold">头像</div>}
                                    {defaultSprite && !portraitSprite && <div className="absolute top-1 left-1 bg-green-500/80 text-[9px] text-black px-1 rounded font-bold">默认</div>}
                                </div>
                                <input 
                                    value={folder.name} onClick={e => e.stopPropagation()} 
                                    onChange={e => updateFolderName(folder.id, e.target.value)}
                                    className="bg-transparent text-sm font-bold w-full focus:outline-none border-b border-transparent focus:border-current"
                                />
                                <div className="text-[10px] opacity-60 mt-1">{folder.sprites.length} 张立绘</div>
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      (folder.spriteFolderKind ?? 'fullbody') === 'avatar'
                                        ? 'bg-amber-600/90 text-white'
                                        : 'bg-black/40 text-white/90'
                                    }`}
                                  >
                                    {(folder.spriteFolderKind ?? 'fullbody') === 'avatar' ? '头像立绘' : '全身立绘'}
                                  </span>
                                  <span className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      className="text-[9px] px-1 py-0.5 rounded border border-current/30 opacity-80 hover:opacity-100"
                                      onClick={() => setFolderSpriteKind(folder.id, 'fullbody')}
                                    >
                                      全身
                                    </button>
                                    <button
                                      type="button"
                                      className="text-[9px] px-1 py-0.5 rounded border border-current/30 opacity-80 hover:opacity-100"
                                      onClick={() => setFolderSpriteKind(folder.id, 'avatar')}
                                    >
                                      头像
                                    </button>
                                  </span>
                                </div>
                                <button onClick={(e) => deleteFolder(folder.id, e)} className="absolute top-2 right-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded p-1">✕</button>
                            </div>
                        );
                    })}
                </div>
             ) : (
                 /* SPRITE VIEW */
                 <div className="flex flex-col pb-10">
                     <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-stretch">
                         <div className="flex gap-2">
                             <button onClick={addSprite} className={`px-6 py-2 border border-dashed rounded hover:opacity-100 opacity-80 transition-all flex items-center justify-center min-w-[120px] ${styles.cardBg}`}>
                                <span className="mr-2">+</span><span className="text-xs font-bold uppercase">单张新增</span>
                             </button>
                             <button onClick={() => setIsImportOpen(true)} className={`px-6 py-2 border border-dashed rounded hover:opacity-100 opacity-80 transition-all flex items-center justify-center min-w-[120px] ${styles.cardBg}`}>
                                <span className="mr-2">📥</span><span className="text-xs font-bold uppercase">批量导入</span>
                             </button>
                         </div>
                         {selectedSpriteIds.length > 0 && (
                             <div className={`mt-2 md:mt-0 md:ml-auto border rounded px-4 py-3 text-xs flex flex-col gap-2 ${styles.cardBg}`}>
                                 <div className="font-bold">
                                     已选中 <span className={styles.accent}>{selectedSpriteIds.length}</span> 张立绘
                                 </div>
                                 <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                                     <div className="flex items-center gap-1">
                                         <span className="text-[10px] uppercase opacity-60">批量服饰</span>
                                     </div>
                                     <div className="flex gap-2 w-full">
                                         <input
                                           value={batchOutfit}
                                           onChange={e => setBatchOutfit(e.target.value)}
                                           className={`flex-1 text-xs px-2 py-1 rounded focus:outline-none ${styles.inputBg}`}
                                           placeholder="输入服饰名，应用到所有选中立绘"
                                         />
                                         <button
                                           onClick={applyBatchOutfit}
                                           className={`px-3 py-1 rounded text-[10px] font-bold text-white ${styles.accentBg}`}
                                         >
                                             应用
                                         </button>
                                         <button
                                           onClick={clearSelection}
                                           className="px-3 py-1 rounded text-[10px] font-bold border border-current/40 opacity-70 hover:opacity-100"
                                         >
                                             清空选择
                                         </button>
                                     </div>
                                 </div>
                             </div>
                         )}
                     </div>
                     
                     {/* BATCH IMPORT MODAL OVERLAY */}
                     {isImportOpen && (
                        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur p-4">
                            <div className={`w-full max-w-lg rounded-lg shadow-2xl p-6 border ${styles.bg}`}>
                                <h3 className="text-lg font-bold mb-2">批量导入图片</h3>
                                <p className="text-xs opacity-60 mb-4">请粘贴图片URL链接，每行一个。导入后将自动生成默认名称。</p>
                                <textarea 
                                    value={importText}
                                    onChange={e => setImportText(e.target.value)}
                                    className={`w-full h-48 p-3 text-xs font-mono rounded border mb-4 focus:outline-none focus:ring-1 ${styles.inputBg}`}
                                    placeholder={`https://example.com/image1.png\nhttps://example.com/image2.jpg\n...`}
                                />
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setIsImportOpen(false)} className="px-4 py-2 rounded border opacity-60 hover:opacity-100 text-xs font-bold">取消</button>
                                    <button onClick={handleBatchImport} className={`px-6 py-2 rounded text-white text-xs font-bold ${styles.accentBg}`}>开始导入</button>
                                </div>
                            </div>
                        </div>
                     )}

                     <div className="space-y-8">
                         {sortedOutfitKeys.length === 0 ? <div className="text-center opacity-50 py-10">暂无内容</div> : sortedOutfitKeys.map(outfit => (
                             <div key={outfit} className="space-y-3">
                                 <h4 className={`text-xs font-bold uppercase tracking-widest border-b pb-1 flex justify-between ${styles.accent} border-current opacity-70`}>
                                     <span>{outfit}</span><span className="font-mono">{groupedSprites[outfit].length}</span>
                                 </h4>
                                 <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                     {groupedSprites[outfit].map(sprite => (
                                         <div key={sprite.id} 
                                            className={`border rounded p-2 flex flex-col gap-2 relative group transition-all hover:border-current/50 ${styles.cardBg} ${sprite.outfit === '头像' ? 'ring-1 ring-yellow-500/50' : ''} ${sprite.isFallback ? 'ring-1 ring-green-500/50 bg-green-500/5' : ''}`}
                                         >
                                             <div className="w-full aspect-square bg-black/20 rounded overflow-hidden relative">
                                                 <img src={sprite.imageUrl} className="w-full h-full object-cover object-top" loading="lazy" />
                                                 
                                                 {/* Default Sprite Checkbox / Toggle */}
                                                 <div 
                                                    onClick={(e) => { e.stopPropagation(); setAsDefault(sprite.id); }}
                                                    className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-all ${sprite.isFallback ? 'bg-green-600 text-white shadow-md' : 'bg-black/60 text-white/50 hover:text-white hover:bg-black/80'}`}
                                                    title={groupByMode === 'outfit' ? `设为该服饰的默认立绘` : `设为该表情的默认立绘`}
                                                 >
                                                     <div className={`w-3 h-3 border rounded-sm flex items-center justify-center ${sprite.isFallback ? 'border-white bg-white/20' : 'border-current'}`}>
                                                         {sprite.isFallback && <span className="text-[8px] font-bold">✓</span>}
                                                     </div>
                                                     <span className="text-[9px] font-bold">默认</span>
                                                 </div>

                                                 {/* Delete Button */}
                                                 <button onClick={(e) => { e.stopPropagation(); deleteSprite(sprite.id); }} className="absolute top-2 right-2 bg-red-500/80 text-white w-6 h-6 rounded flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity z-20 shadow-lg">✕</button>
                                                 {sprite.outfit === '头像' && <div className="absolute bottom-0 inset-x-0 bg-yellow-600 text-black text-[9px] font-bold text-center py-0.5">仅头像</div>}
                                             </div>
                                             
                                             {/* Sprite Inputs */}
                                             <div className="space-y-1">
                                                 <div className="flex items-center gap-1">
                                                     <label className="text-[9px] font-bold opacity-50 w-8 shrink-0 text-right">角色名</label>
                                                     <input value={sprite.characterName} onChange={e => updateSprite(sprite.id, 'characterName', e.target.value)} className={`text-xs px-2 py-1 rounded focus:outline-none w-full ${styles.inputBg}`} placeholder="角色名" />
                                                 </div>
                                                 <div className="flex items-center gap-1">
                                                     <label className="text-[9px] font-bold opacity-50 w-8 shrink-0 text-right">服装</label>
                                                     <input value={sprite.outfit} onChange={e => updateSprite(sprite.id, 'outfit', e.target.value)} className={`text-xs px-2 py-1 rounded focus:outline-none w-full ${styles.inputBg}`} placeholder="服装" />
                                                 </div>
                                                 <div className="flex items-start gap-1">
                                                   <div className="flex items-center gap-1 w-8 shrink-0 justify-end pt-1">
                                                     <label className="text-[9px] font-bold opacity-50">表情</label>
                                                   </div>
                                                   <div className="flex-1 flex flex-col gap-1">
                                                     <div className="flex gap-1">
                                                       <input
                                                         value={sprite.expression}
                                                         onChange={e => updateSprite(sprite.id, 'expression', e.target.value)}
                                                         className={`text-xs px-2 py-1 rounded focus:outline-none w-full ${styles.inputBg}`}
                                                         placeholder="表情 (可多种，用逗号 , 分隔)"
                                                       />
                                                       <select
                                                         value={activeExpressionPresetGroupId}
                                                         onChange={e => setActiveExpressionPresetGroupId(e.target.value)}
                                                         className={`text-[9px] px-1.5 py-1 rounded min-w-[90px] cursor-pointer ${styles.inputBg}`}
                                                       >
                                                         <option value="">预设分组</option>
                                                         {EXPRESSION_PRESET_GROUPS.map(group => (
                                                           <option key={group.id} value={group.id}>{group.label}</option>
                                                         ))}
                                                       </select>
                                                     </div>
                                                     {activeExpressionPresetGroupId && (
                                                       <div className="flex flex-wrap gap-1">
                                                         {EXPRESSION_PRESET_GROUPS
                                                           .find(g => g.id === activeExpressionPresetGroupId)
                                                           ?.items.map(preset => (
                                                             <button
                                                               key={preset}
                                                               type="button"
                                                               onClick={() => {
                                                                 const current = sprite.expression || '';
                                                                 const parts = current
                                                                   ? current.split(',').map(s => s.trim()).filter(Boolean)
                                                                   : [];
                                                                 if (parts.includes(preset)) return;
                                                                 const next = parts.length ? `${parts.join(',')},${preset}` : preset;
                                                                 updateSprite(sprite.id, 'expression', next);
                                                               }}
                                                               className="px-2 py-0.5 rounded-full text-[9px] font-bold border border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100 transition-colors"
                                                             >
                                                               {preset}
                                                             </button>
                                                           ))}
                                                       </div>
                                                     )}
                                                   </div>
                                                 </div>
                                                 <input value={sprite.imageUrl} onChange={e => updateSprite(sprite.id, 'imageUrl', e.target.value)} className={`text-[10px] px-2 py-1 rounded focus:outline-none w-full opacity-50 focus:opacity-100 transition-opacity mt-1 ${styles.inputBg}`} placeholder="图片链接" />
                                             </div>
                                             <div
                                               className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/40 text-white/80 px-1.5 py-0.5 rounded text-[9px] cursor-pointer"
                                               onClick={e => {
                                                   e.stopPropagation();
                                                   toggleSpriteSelection(sprite.id);
                                               }}
                                             >
                                                 <input
                                                   type="checkbox"
                                                   checked={selectedSpriteIds.includes(sprite.id)}
                                                   readOnly
                                                   className="w-3 h-3 rounded border border-white/60 bg-black/40"
                                                 />
                                                 <span>多选</span>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};
