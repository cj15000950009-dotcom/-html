
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TacticalButton } from '../ui/TacticalButton';
import { BackgroundItem } from '../../types';

interface BackgroundSettingsProps {
  isOpen: boolean; onClose: () => void; onSetBackground: (bg: { name: string, url: string }) => void;
  currentBackground: string; backgroundLibrary: BackgroundItem[]; onUpdateLibrary: (bgs: BackgroundItem[]) => void;
  defaultBackgroundId?: string | null; onSetDefaultBackground?: (id: string | null) => void;
  theme?: string;
}

export const BackgroundSettings: React.FC<BackgroundSettingsProps> = ({ 
  isOpen, onClose, onSetBackground, currentBackground, backgroundLibrary, onUpdateLibrary, defaultBackgroundId, onSetDefaultBackground, theme = 'night'
}) => {
  const [previewUrl, setPreviewUrl] = useState(currentBackground);
  const [previewName, setPreviewName] = useState('当前位置');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editId, setEditId] = useState<string | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPreviewUrl(currentBackground);
      const found = backgroundLibrary.find(b => b.url === currentBackground);
      setPreviewName(found ? found.name : '未知区域');
      setEditId(null); setInputName(''); setInputUrl(''); setSearchQuery(''); setIsImportOpen(false);
    }
  }, [isOpen, currentBackground, backgroundLibrary]);

  useEffect(() => { if (inputUrl) setPreviewUrl(inputUrl); }, [inputUrl]);

  const filteredLibrary = useMemo(() => {
      if (!searchQuery) return backgroundLibrary;
      return backgroundLibrary.filter(bg => bg.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [backgroundLibrary, searchQuery]);

  if (!isOpen) return null;

  const handleSelect = (bg: BackgroundItem) => { setPreviewUrl(bg.url); setPreviewName(bg.name); };
  
  const handleConfirm = () => { 
    onSetBackground({ name: previewName, url: previewUrl }); 
    onClose(); 
  };

  const handleAddLocation = () => {
    const newBg: BackgroundItem = { 
        id: `bg_${Date.now()}`, 
        name: '新场景', 
        url: 'https://via.placeholder.com/1920x1080?text=No+Background' 
    };
    onUpdateLibrary([...backgroundLibrary, newBg]);
    setEditId(newBg.id);
    setInputName(newBg.name);
    setInputUrl(newBg.url);
  };

  const handleSaveEdit = () => {
    if (!inputName || !inputUrl || !editId) return;
    onUpdateLibrary(backgroundLibrary.map(bg => bg.id === editId ? { ...bg, name: inputName, url: inputUrl } : bg));
    setEditId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确认从战术图库中移除该场景记录？')) {
        onUpdateLibrary(backgroundLibrary.filter(bg => bg.id !== id));
        if (editId === id) setEditId(null);
    }
  };

  const handleBatchImport = () => {
      if (!importText.trim()) return;
      const urls = importText.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length === 0) return;
      const newBgs: BackgroundItem[] = urls.map((url, idx) => ({ 
          id: `bg_import_${Date.now()}_${idx}`, 
          name: `导入场景 ${backgroundLibrary.length + idx + 1}`, 
          url: url 
      }));
      onUpdateLibrary([...backgroundLibrary, ...newBgs]);
      setImportText(''); setIsImportOpen(false);
  };

  // JSON Import/Export Logic
  const handleExportLibrary = () => {
      const blob = new Blob([JSON.stringify(backgroundLibrary, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SpiritCommand_Locations_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleImportLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (Array.isArray(json)) {
                  // Validate basic structure
                  const validItems = json.filter((item: any) => item.name && item.url);
                  if (validItems.length > 0) {
                      // Merge strategy: Append with new IDs to avoid conflict, or keep as is?
                      // Let's replace IDs to be safe but keep data
                      const imported = validItems.map((item: any, idx) => ({
                          ...item,
                          id: item.id || `bg_imp_${Date.now()}_${idx}`
                      }));
                      onUpdateLibrary([...backgroundLibrary, ...imported]);
                      alert(`成功导入 ${imported.length} 个地点数据。`);
                  } else {
                      alert("文件格式有效但未包含有效的地点数据。");
                  }
              } else {
                  alert("格式错误：必须是数组 (Invalid Format)");
              }
          } catch (err) { alert("JSON 解析失败 (Parse Error)"); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
      <div className={`w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col h-[90vh] bg-[#020617] border border-tactical-green/20 pointer-events-auto clip-tactical-box`} onClick={e => e.stopPropagation()}>
        <div className={`h-14 border-b border-tactical-green/10 flex justify-between items-center px-8 shrink-0 bg-black/40`}>
            <div className="flex items-center gap-6">
                <h2 className="font-black text-[11px] tracking-[0.4em] text-tactical-green italic flex items-center gap-3 uppercase">
                    <span className="w-2 h-2 bg-tactical-green animate-pulse"></span>
                    地理环境地理管理 (LOCATIONS_MOD)
                </h2>
                <div className="h-4 w-px bg-tactical-green/20"></div>
                <div className="flex gap-4">
                    <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold text-white/40 hover:text-white flex items-center gap-2 transition-colors">
                        <span>📥</span> 导入库
                    </button>
                    <button onClick={handleExportLibrary} className="text-[10px] font-bold text-white/40 hover:text-white flex items-center gap-2 transition-colors">
                        <span>📤</span> 导出库
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportLibrary} />
                </div>
            </div>
        </div>

        {/* 顶部预览与编辑区 */}
        <div className="relative w-full h-64 shrink-0 overflow-hidden border-b border-tactical-green/10 bg-black">
             <img src={previewUrl || ''} className="w-full h-full object-cover opacity-60" alt="Preview" />
             <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40"></div>
             
             {/* 实时编辑面板 */}
             <div className="absolute inset-0 flex items-center justify-center p-8">
                 {editId ? (
                    <div className="w-full max-w-xl bg-black/80 backdrop-blur-xl p-8 border border-tactical-green/40 clip-tactical-sm animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-tactical-green/10 pb-4">
                            <span className="text-[10px] font-black text-tactical-green tracking-[0.2em] uppercase italic">编辑场景参数 // DATA_MODIFY</span>
                            <button onClick={() => setEditId(null)} className="text-white/20 hover:text-white text-xs">取消</button>
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-white/40 uppercase">场景标注 (LABEL)</label>
                                <input value={inputName} onChange={e => setInputName(e.target.value)} className="w-full bg-slate-900/60 border border-tactical-green/30 px-4 py-3 text-sm text-white focus:border-tactical-green focus:outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-white/40 uppercase">资源路径 (URL)</label>
                                <input value={inputUrl} onChange={e => setInputUrl(e.target.value)} className="w-full bg-slate-900/60 border border-tactical-green/30 px-4 py-3 text-sm text-white focus:border-tactical-green focus:outline-none" />
                            </div>
                        </div>
                        <button onClick={handleSaveEdit} className="w-full mt-6 py-3 bg-tactical-green text-slate-950 font-black text-[11px] tracking-[0.4em] uppercase hover:bg-emerald-400 transition-all clip-tactical-sm">提交数据同步</button>
                    </div>
                 ) : (
                    <div className="absolute bottom-10 left-10 flex flex-col gap-1">
                        <div className="bg-tactical-green text-slate-950 text-[10px] font-black px-4 py-1.5 uppercase italic tracking-widest shadow-lg clip-tactical-sm w-fit">Current_Selection</div>
                        <span className="text-white text-3xl font-black tracking-[0.2em] drop-shadow-lg uppercase">[ {previewName} ]</span>
                    </div>
                 )}
             </div>
        </div>

        {/* 工具栏 */}
        <div className="p-4 flex gap-4 border-b border-tactical-green/10 bg-black/40 shrink-0">
             <input 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="flex-1 bg-black/60 border border-tactical-green/20 px-6 py-3 text-xs text-white focus:border-tactical-green focus:outline-none transition-all" 
                placeholder="键入关键词筛选地理数据..." 
             />
             <button onClick={handleAddLocation} className="px-8 bg-tactical-green/10 border border-tactical-green/30 text-tactical-green font-black text-[10px] tracking-widest uppercase hover:bg-tactical-green hover:text-slate-950 transition-all clip-tactical-sm">新增单个场景</button>
             <button onClick={() => setIsImportOpen(true)} className="px-8 bg-white/5 border border-white/10 text-white/60 font-black text-[10px] tracking-widest uppercase hover:bg-white/10 hover:text-white transition-all clip-tactical-sm">文本批量导入</button>
        </div>

        {/* 背景列表 */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#010409]">
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredLibrary.map((bg) => (
                    <div 
                        key={bg.id} 
                        onClick={() => handleSelect(bg)} 
                        className={`group relative aspect-video rounded-sm overflow-hidden border transition-all cursor-pointer ${previewUrl === bg.url ? 'border-tactical-green shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/5 hover:border-white/20'}`}
                    >
                        <img src={bg.url} alt={bg.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-60 group-hover:opacity-100" />
                        <div className="absolute inset-x-0 bottom-0 bg-black/80 p-3 border-t border-tactical-green/10 backdrop-blur-md">
                            <span className="text-[10px] text-white font-black block truncate uppercase tracking-tighter">{bg.name}</span>
                        </div>
                        
                        {/* 操作悬浮窗 */}
                        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setEditId(bg.id); setInputName(bg.name); setInputUrl(bg.url); }}
                                className="bg-tactical-green/20 hover:bg-tactical-green text-tactical-green hover:text-slate-950 p-2 rounded transition-all"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button 
                                onClick={(e) => handleDelete(bg.id, e)}
                                className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded transition-all"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                ))}
             </div>
        </div>

        {/* 批量导入 Overlay */}
        {isImportOpen && (
            <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-[130] flex items-center justify-center p-8 animate-in zoom-in-95 duration-200">
                <div className="w-full max-w-lg space-y-6">
                    <h3 className="text-tactical-green text-sm font-black uppercase tracking-[0.4em] italic">批量注入地理数据 // BATCH_IMPORT</h3>
                    <textarea 
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        className="w-full h-48 bg-slate-950 border border-tactical-green/20 p-5 text-xs text-tactical-green font-mono focus:border-tactical-green focus:outline-none resize-none leading-relaxed"
                        placeholder="请粘贴背景图片直链，每行一条..."
                    />
                    <div className="flex gap-4">
                        <button onClick={() => setIsImportOpen(false)} className="px-8 py-3 text-[10px] font-black text-white/30 hover:text-white uppercase tracking-widest">取消</button>
                        <button onClick={handleBatchImport} className="flex-1 py-3 bg-tactical-green text-slate-950 font-black text-[11px] tracking-[0.4em] uppercase hover:bg-emerald-400 transition-all clip-tactical-sm">确认注入图库</button>
                    </div>
                </div>
            </div>
        )}

        <div className="p-4 border-t border-tactical-green/10 flex justify-end gap-6 bg-black/40 shrink-0">
            <button onClick={handleConfirm} className="px-20 py-3 bg-tactical-green text-slate-950 font-black text-[11px] tracking-[0.5em] uppercase hover:bg-emerald-400 transition-all clip-tactical-sm shadow-[0_0_20px_rgba(16,185,129,0.2)]">部署环境映射 (DEPLOY)</button>
        </div>
      </div>
    </div>
  );
};
