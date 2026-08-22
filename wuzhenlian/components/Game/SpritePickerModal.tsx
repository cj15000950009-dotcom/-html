
import React, { useState, useEffect, useMemo } from 'react';
import { CustomFolder, CustomSprite, Character } from '../../types';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { ModalCloseX } from './ModalCloseX';

interface SpritePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  currentCharacter?: Character;
  currentOutfit?: string;
  currentExpression?: string;
  customLibrary: CustomFolder[];
  theme?: string;
  onApply: (character: Character, outfit: string, expression: string) => void;
  /** 点击「前往图库」时调用，用于打开立绘库/图库界面 */
  onOpenLibrary?: () => void;
  /** 修改当前立绘库文件夹为全身舞台 / 头像左下角 */
  onUpdateSpriteFolderKind?: (folderId: string, kind: 'fullbody' | 'avatar') => void;
}

export const SpritePickerModal: React.FC<SpritePickerModalProps> = ({
  isOpen,
  onClose,
  characters,
  currentCharacter,
  currentOutfit = '',
  currentExpression = '',
  customLibrary,
  theme = 'night',
  onApply,
  onOpenLibrary,
  onUpdateSpriteFolderKind,
}) => {
  const [selectedCharacter, setSelectedCharacter] = useState<Character | undefined>(currentCharacter ?? characters[0]);
  const [selectedOutfit, setSelectedOutfit] = useState(currentOutfit);
  const [selectedExpression, setSelectedExpression] = useState(currentExpression);
  /** 用户手动选择的立绘库文件夹（当角色无自动匹配时使用） */
  const [manualFolderId, setManualFolderId] = useState<string | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      // 若当前页无说话角色（如旁白），也要给“应用立绘”一个可用目标角色，避免点应用无效
      setSelectedCharacter(currentCharacter ?? characters[0]);
      setSelectedOutfit(currentOutfit);
      setSelectedExpression(currentExpression);
      setManualFolderId(null);
    }
  }, [isOpen, currentCharacter, currentOutfit, currentExpression, characters]);

  // Player/主角/User 对应立绘库中 id=Player 或 name 为 user/主角/玩家 的文件夹
  const playerFolder = useMemo(() => {
    const aliases = ['user', '{{user}}', '主角', '玩家'];
    for (const folder of customLibrary) {
      const fid = String(folder.id || '').trim().toLowerCase();
      const fname = (folder.name || '').trim().toLowerCase();
      if (fid === 'player') return folder;
      if (aliases.some(a => fname === a || fname === a.toLowerCase())) return folder;
    }
    return null;
  }, [customLibrary]);

  const targetFolder = useMemo(() => {
    const char = selectedCharacter || currentCharacter;
    if (!char) return null;
    const name = (char.name || '').trim().toLowerCase();
    const id = String(char.id || '').trim().toLowerCase();
    // Player/主角/User：优先用 playerFolder，否则直接按 name="user" 查找
    if (id === 'player' || ['主角', 'user', '玩家'].includes(name)) {
      if (playerFolder) return playerFolder;
      const byName = customLibrary.find(f => (f.name || '').trim().toLowerCase() === 'user');
      return byName || null;
    }
    // 1. 精确同名 / 同 ID 匹配
    let folder = customLibrary.find(f => {
      const fname = (f.name || '').trim().toLowerCase();
      const fid = String(f.id || '').trim().toLowerCase();
      return (!!name && fname === name) || (!!id && fid === id);
    });
    if (folder) return folder;
    // 2. 模糊包含匹配（防止前后多字，如「孙卫东(作训服)」）
    folder = customLibrary.find(f => {
      const fname = (f.name || '').trim().toLowerCase();
      return !!name && fname.includes(name);
    });
    return folder || null;
  }, [selectedCharacter, currentCharacter, customLibrary, playerFolder]);

  /** 有效文件夹：自动匹配的 targetFolder 或用户手动选择的立绘库文件夹 */
  const effectiveFolder = useMemo(() => {
    if (targetFolder) return targetFolder;
    if (manualFolderId) return customLibrary.find(f => String(f.id) === manualFolderId || String(f.name) === manualFolderId) || null;
    return null;
  }, [targetFolder, manualFolderId, customLibrary]);

  const sprites = useMemo(() => effectiveFolder?.sprites || [], [effectiveFolder]);

  type SortKey = 'outfit' | 'expression';
  const [sortBy, setSortBy] = useState<SortKey>('outfit');

  /** 按当前选择的排序方式（服饰优先 或 表情优先）排序 */
  const sortedSprites = useMemo(() => {
    return [...sprites].sort((a, b) => {
      if (sortBy === 'outfit') {
        const o = (a.outfit || '').localeCompare(b.outfit || '', 'zh-CN');
        if (o !== 0) return o;
        return (a.expression || '').localeCompare(b.expression || '', 'zh-CN');
      }
      const e = (a.expression || '').localeCompare(b.expression || '', 'zh-CN');
      if (e !== 0) return e;
      return (a.outfit || '').localeCompare(b.outfit || '', 'zh-CN');
    });
  }, [sprites, sortBy]);

  // Extract unique tags（排序后保持一致）
  const outfits = useMemo(() => Array.from(new Set(sprites.map(s => s.outfit).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'zh-CN')), [sprites]);
  const expressions = useMemo(() => Array.from(new Set(sprites.map(s => s.expression).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'zh-CN')), [sprites]);

  // Handle selection from grid
  const handleSelectSprite = (sprite: CustomSprite) => {
    setSelectedOutfit(sprite.outfit);
    setSelectedExpression(sprite.expression);
  };

  const isInk = theme === 'ink-jianghu';
  const inkPanelStyle = isInk
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.48)), url(${inkJianghuExternalUrls.baseBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif',
      }
    : undefined;
  const inkTitleStyle = isInk ? { fontFamily: '"HanYiShangWeiShouShuW"', fontWeight: 400 } : undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`relative w-full max-w-5xl max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border animate-in fade-in zoom-in-95 duration-200 ${
          isInk ? 'bg-black/85 border-white/20 text-white' : 'bg-white border-emerald-500/30'
        }`}
        onClick={e => e.stopPropagation()}
        style={inkPanelStyle}
      >
        
        {/* Header */}
        <div className={`h-14 border-b flex justify-between items-center px-6 shrink-0 ${isInk ? 'bg-black/35 border-white/20' : 'bg-emerald-50 border-emerald-100'}`}>
          <div className={`flex items-center gap-2 font-black tracking-widest text-sm uppercase ${isInk ? 'text-zinc-100' : 'text-emerald-800'}`} style={inkTitleStyle}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${isInk ? 'bg-zinc-200' : 'bg-emerald-500'}`}></span>
            立绘服饰与表情 (已连接角色库)
          </div>
          <ModalCloseX variant="inline" onClose={onClose} />
        </div>

        <div className={`p-8 flex-1 overflow-y-auto custom-scrollbar ${isInk ? 'bg-black/20' : 'bg-white'}`}>
          <div className="space-y-8">
            
            {/* Character Selector + Current Selection */}
            <div className="border border-emerald-500/30 rounded-lg p-6 relative">
              <h3 className="absolute -top-3 left-4 bg-white px-2 text-sm font-black text-emerald-700">
                选择角色
              </h3>
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-500 block mb-1">要修改立绘的角色</label>
                <select
                  value={(selectedCharacter || currentCharacter)?.id ?? ''}
                  onChange={e => {
                    const c = characters.find(ch => String(ch.id) === e.target.value);
                    if (c) setSelectedCharacter(c);
                  }}
                  className="w-full max-w-xs border-2 border-emerald-100 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  {characters.map(c => {
                    const isPlayer = String(c.id) === 'Player';
                    let label = c.name || (isPlayer ? '主角' : '');
                    if (isPlayer && playerFolder?.name) label = playerFolder.name;
                    if (isPlayer && (label === '主角' || !label)) label = '主角 (User)';
                    return <option key={String(c.id)} value={String(c.id)}>{label}</option>;
                  })}
                </select>
              </div>
              <div className="text-xs font-bold text-slate-500 mb-2">当前选择: {selectedCharacter?.name || currentCharacter?.name || '未知角色'}</div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">服饰</label>
                  <input 
                    value={selectedOutfit} 
                    onChange={e => setSelectedOutfit(e.target.value)}
                    className="w-full border-2 border-emerald-100 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="输入或选择服饰..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">表情</label>
                  <input 
                    value={selectedExpression} 
                    onChange={e => setSelectedExpression(e.target.value)}
                    className="w-full border-2 border-emerald-100 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="输入或选择表情..."
                  />
                </div>
              </div>
            </div>

            {/* Library Picker */}
            <div className="border border-emerald-500/30 rounded-lg p-6 relative bg-emerald-50/30 min-h-[400px]">
              <h3 className="absolute -top-3 left-4 bg-white px-2 text-sm font-black text-emerald-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                角色库中现有 (点击应用)
              </h3>

              {effectiveFolder ? (
                <div className="space-y-6 mt-2">
                  {onUpdateSpriteFolderKind && (
                    <div
                      className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${
                        isInk ? 'border-white/15 bg-black/25' : 'border-emerald-200 bg-white'
                      }`}
                    >
                      <span className={`text-[11px] font-bold shrink-0 ${isInk ? 'text-zinc-300' : 'text-emerald-800'}`}>
                        立绘类型（{effectiveFolder.name}）
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateSpriteFolderKind(effectiveFolder.id, 'fullbody')}
                        className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                          (effectiveFolder.spriteFolderKind ?? 'fullbody') === 'fullbody'
                            ? isInk
                              ? 'bg-white text-black border-white'
                              : 'bg-emerald-600 text-white border-emerald-600'
                            : isInk
                              ? 'border-white/25 text-zinc-200 hover:bg-white/10'
                              : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        全身·舞台
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSpriteFolderKind(effectiveFolder.id, 'avatar')}
                        className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                          effectiveFolder.spriteFolderKind === 'avatar'
                            ? isInk
                              ? 'bg-amber-500 text-black border-amber-400'
                              : 'bg-amber-600 text-white border-amber-500'
                            : isInk
                              ? 'border-white/25 text-zinc-200 hover:bg-white/10'
                              : 'border-slate-200 text-slate-600 hover:border-amber-300'
                        }`}
                      >
                        头像·左下角
                      </button>
                      <span className={`text-[10px] leading-snug max-w-md ${isInk ? 'text-zinc-400' : 'text-slate-500'}`}>
                        头像模式：对话中立绘叠在对话框左下角区域旁；可在「系统设置 → 视觉校准」调偏移与缩放。
                      </span>
                    </div>
                  )}
                  {/* Tags */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-bold text-slate-400 w-10">服饰:</span>
                      {outfits.map(tag => (
                        <button 
                          key={tag} 
                          onClick={() => setSelectedOutfit(tag)}
                          className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${selectedOutfit === tag ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-bold text-slate-400 w-10">表情:</span>
                      {expressions.map(tag => (
                        <button 
                          key={tag} 
                          onClick={() => setSelectedExpression(tag)}
                          className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${selectedExpression === tag ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full h-px bg-emerald-100"></div>

                  {/* Grid + 排序按钮 */}
                  <div>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-xs font-bold text-slate-400">缩略图</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSortBy('outfit')}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${sortBy === 'outfit' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
                        >
                          按服饰排序
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortBy('expression')}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${sortBy === 'expression' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
                        >
                          按表情排序
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400">点击应用该条服饰+表情</span>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                      {sortedSprites.map(sprite => {
                        const isActive = sprite.outfit === selectedOutfit && sprite.expression === selectedExpression;
                        return (
                          <div 
                            key={sprite.id} 
                            onClick={() => handleSelectSprite(sprite)}
                            className={`group relative aspect-[3/4] rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${isActive ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-lg scale-105 z-10' : 'border-slate-100 hover:border-emerald-300 hover:shadow-md'}`}
                          >
                            <img src={sprite.imageUrl} className="w-full h-full object-cover object-top bg-slate-100" loading="lazy" />
                            <div className={`absolute inset-x-0 bottom-0 p-1 text-[9px] font-bold text-center truncate transition-colors ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-900/80 text-white/80 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                              {sprite.expression}
                            </div>
                            {/* Outfit badge */}
                            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                {sprite.outfit}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[280px] text-slate-600 gap-4 p-6">
                  <span className="text-4xl">📂</span>
                  <span className="text-sm font-bold">该角色暂无自动关联的立绘库文件夹</span>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
                    <div className="w-full sm:flex-1">
                      <label className="text-xs font-bold text-slate-500 block mb-1">手动选择立绘库文件夹</label>
                      <select
                        value={manualFolderId ?? ''}
                        onChange={e => setManualFolderId(e.target.value || null)}
                        className="w-full border-2 border-emerald-200 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">— 选择文件夹 —</option>
                        {customLibrary.filter(f => !f.disabled).map(f => (
                          <option key={String(f.id)} value={String(f.id)}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    {onOpenLibrary && (
                      <button
                        type="button"
                        onClick={onOpenLibrary}
                        className="shrink-0 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-colors"
                      >
                        前往图库
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">或前往 [图库] 创建同名文件夹并添加立绘</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="h-20 border-t border-emerald-100 bg-emerald-50/50 flex items-center justify-end px-8 gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-lg border-2 border-emerald-200 text-emerald-700 font-black text-sm hover:bg-white hover:border-emerald-300 transition-all uppercase tracking-wider"
          >
            取消
          </button>
          <button 
            onClick={() => { 
              const char = selectedCharacter || currentCharacter || characters[0];
              if (char) onApply(char, selectedOutfit, selectedExpression);
              onClose(); 
            }}
            className="px-10 py-3 rounded-lg bg-emerald-600 text-white font-black text-sm hover:bg-emerald-500 shadow-lg hover:shadow-emerald-500/30 transition-all uppercase tracking-wider transform active:scale-95"
          >
            应用
          </button>
        </div>

      </div>
    </div>
  );
};
