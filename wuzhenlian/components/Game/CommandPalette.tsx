
import React, { useState, useEffect } from 'react';
import { ModalCloseX } from './ModalCloseX';

// Icons
const Icons = {
  Scroll: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Romance: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Profile: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Qi: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Sword: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>,
  Edit: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Plus: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: ({className}: {className?: string}) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
};

const CATEGORY_META_DATA: Record<string, { label: string, stamp: string, icon: React.ReactNode }> = {
  "剧情控制": { label: "剧情控制", stamp: "策", icon: <Icons.Scroll className="w-5 h-5" /> },
  "互动关系": { label: "互动关系", stamp: "缘", icon: <Icons.Romance className="w-5 h-5" /> },
  "心理状态": { label: "心理状态", stamp: "心", icon: <Icons.Profile className="w-5 h-5" /> },
  "系统指令": { label: "系统指令", stamp: "律", icon: <Icons.Qi className="w-5 h-5" /> },
  "编剧操作": { label: "编剧操作", stamp: "神", icon: <Icons.Sword className="w-5 h-5" /> }
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommandSelect: (cmdKey: string) => void;
  commandStructure: Record<string, string[]>;
  commandTemplates?: Record<string, string>;
  onUpdateStructure?: (newStructure: Record<string, string[]>) => void;
  onUpdateTemplates?: (newTemplates: Record<string, string>) => void;
  theme?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen, onClose, onCommandSelect, commandStructure, commandTemplates = {}, onUpdateStructure, onUpdateTemplates, theme = 'night'
}) => {
  const [currentCategory, setCurrentCategory] = useState<string>("剧情控制");
  const [isEditing, setIsEditing] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCmdName, setNewCmdName] = useState("");
  const [selectedCmdForEdit, setSelectedCmdForEdit] = useState<string | null>(null);
  const [editTemplateValue, setEditTemplateValue] = useState("");

  // Update selected edit template when selection changes
  useEffect(() => {
      if (selectedCmdForEdit && commandTemplates) {
          setEditTemplateValue(commandTemplates[selectedCmdForEdit] || "");
      }
  }, [selectedCmdForEdit, commandTemplates]);

  if (!isOpen) return null;

  // --- Styles ---
  const styles = {
      modalBg: theme === 'day' ? 'bg-slate-50 border-slate-200' : 
               theme === 'tech' ? 'bg-[#0B1120] border-cyan-500/30' :
               theme === 'military' ? 'bg-[#1a1c10] border-emerald-800' :
               'bg-[#1a1b1e] border-white/10',
      text: theme === 'day' ? 'text-slate-900' : 
            theme === 'tech' ? 'text-cyan-400' :
            theme === 'military' ? 'text-emerald-500' :
            'text-slate-200',
      header: theme === 'day' ? 'bg-white border-slate-200' : 
              theme === 'tech' ? 'bg-[#0f172a] border-cyan-500/20' :
              theme === 'military' ? 'bg-[#12140b] border-emerald-900' :
              'bg-[#141517] border-white/5',
      sidebar: theme === 'day' ? 'bg-slate-100 border-slate-200' : 
              theme === 'tech' ? 'bg-[#0f172a]/50 border-cyan-500/10' :
              theme === 'military' ? 'bg-[#12140b]/50 border-emerald-900/50' :
              'bg-black/20 border-white/5',
      itemActive: theme === 'day' ? 'bg-white border-l-4 border-l-emerald-500 shadow-sm' : 
                  theme === 'tech' ? 'bg-cyan-900/20 border-l-4 border-l-cyan-400' :
                  theme === 'military' ? 'bg-emerald-900/20 border-l-4 border-l-emerald-500' :
                  'bg-white/10 border-l-4 border-l-white',
      accent: theme === 'tech' ? 'text-cyan-400' : theme === 'military' ? 'text-emerald-500' : 'text-emerald-500',
      button: theme === 'tech' ? 'bg-cyan-900/30 text-cyan-400 hover:bg-cyan-800/50' : 
              theme === 'military' ? 'bg-emerald-900/30 text-emerald-500 hover:bg-emerald-800/50' : 
              'bg-white/10 hover:bg-white/20',
      input: theme === 'day' ? 'bg-white border-slate-300' : 'bg-black/30 border-white/20 text-white'
  };

  const handleAddCategory = () => {
      if (!newCatName.trim() || !onUpdateStructure) return;
      onUpdateStructure({ ...commandStructure, [newCatName]: [] });
      setNewCatName("");
  };

  const handleDeleteCategory = (cat: string) => {
      if (!confirm("Delete this category?") || !onUpdateStructure) return;
      const newStruct = { ...commandStructure };
      delete newStruct[cat];
      onUpdateStructure(newStruct);
      if (currentCategory === cat) setCurrentCategory(Object.keys(newStruct)[0] || "");
  };

  const handleAddCommand = () => {
      if (!newCmdName.trim() || !onUpdateStructure) return;
      const currentCmds = commandStructure[currentCategory] || [];
      if (currentCmds.includes(newCmdName)) return;
      
      onUpdateStructure({ 
          ...commandStructure, 
          [currentCategory]: [...currentCmds, newCmdName] 
      });
      
      // Init template
      if (onUpdateTemplates) {
          onUpdateTemplates({ ...commandTemplates, [newCmdName]: `[系统指令]: ${newCmdName}` });
      }
      setNewCmdName("");
  };

  const handleSaveTemplate = () => {
      if (!selectedCmdForEdit || !onUpdateTemplates) return;
      onUpdateTemplates({ ...commandTemplates, [selectedCmdForEdit]: editTemplateValue });
      setSelectedCmdForEdit(null);
  };

  const handleDeleteCommand = (cmd: string) => {
      if (!onUpdateStructure) return;
      const currentCmds = commandStructure[currentCategory] || [];
      onUpdateStructure({
          ...commandStructure,
          [currentCategory]: currentCmds.filter(c => c !== cmd)
      });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`relative w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border ${styles.modalBg} ${styles.text}`} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className={`h-16 border-b flex justify-between items-center px-6 shrink-0 ${styles.header}`}>
             <h2 className={`font-bold tracking-widest text-lg flex items-center gap-2 ${styles.accent}`}>
                 <span className="text-xl">⚡</span> 快捷指令 (Command Palette)
             </h2>
             <div className="flex items-center gap-4">
                 {onUpdateStructure && (
                     <button 
                        onClick={() => setIsEditing(!isEditing)} 
                        className={`text-xs font-bold px-4 py-2 rounded transition-all ${isEditing ? 'bg-yellow-500/20 text-yellow-500' : 'opacity-50 hover:opacity-100'}`}
                     >
                         {isEditing ? "退出编辑" : "编辑模式"}
                     </button>
                 )}
                 <ModalCloseX variant="inline" onClose={onClose} />
             </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            
            {/* Sidebar: Categories */}
            <div className={`w-64 border-r flex flex-col shrink-0 ${styles.sidebar}`}>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {Object.keys(commandStructure).map(cat => {
                        const meta = CATEGORY_META_DATA[cat] || { label: cat, stamp: cat[0], icon: null };
                        return (
                            <div 
                                key={cat}
                                onClick={() => setCurrentCategory(cat)}
                                className={`p-3 rounded border cursor-pointer transition-all flex items-center justify-between group ${currentCategory === cat ? styles.itemActive : 'border-transparent hover:bg-white/5 opacity-70'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded flex items-center justify-center font-black text-sm bg-black/20 ${styles.accent}`}>
                                        {meta.stamp}
                                    </div>
                                    <span className="font-bold text-sm">{cat}</span>
                                </div>
                                {isEditing && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10 p-1 rounded"
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {isEditing && (
                    <div className="p-3 border-t border-current/10">
                        <div className="flex gap-2">
                            <input 
                                value={newCatName} 
                                onChange={e => setNewCatName(e.target.value)}
                                className={`flex-1 px-2 py-1 text-xs rounded focus:outline-none ${styles.input}`}
                                placeholder="新分类..."
                            />
                            <button onClick={handleAddCategory} className="px-3 bg-current/20 hover:bg-current/40 rounded">
                                <Icons.Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Content: Commands Grid */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-black/10">
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {commandStructure[currentCategory]?.map(cmd => (
                            <div key={cmd} className="relative group">
                                <button 
                                    onClick={() => onCommandSelect(cmd)}
                                    className={`w-full text-left p-4 rounded border transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${styles.button} border-current/20 flex flex-col gap-1 h-full`}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        <span className={`font-black text-sm tracking-wide ${styles.accent}`}>{cmd}</span>
                                        {isEditing && (
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => setSelectedCmdForEdit(cmd)} className="text-yellow-500 hover:bg-yellow-500/10 p-1 rounded"><Icons.Edit className="w-3 h-3"/></button>
                                                <button onClick={() => handleDeleteCommand(cmd)} className="text-red-500 hover:bg-red-500/10 p-1 rounded"><Icons.Trash className="w-3 h-3"/></button>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] opacity-50 line-clamp-2 leading-relaxed">
                                        {commandTemplates[cmd] || "暂无模板"}
                                    </span>
                                </button>
                            </div>
                        ))}
                        
                        {isEditing && (
                            <div className={`p-4 rounded border border-dashed border-current/20 flex flex-col gap-2 items-center justify-center opacity-60 hover:opacity-100`}>
                                <input 
                                    value={newCmdName} 
                                    onChange={e => setNewCmdName(e.target.value)}
                                    className={`w-full px-2 py-1 text-xs rounded text-center focus:outline-none ${styles.input}`}
                                    placeholder="新指令名称..."
                                />
                                <button onClick={handleAddCommand} className="text-xs font-bold uppercase tracking-widest px-4 py-1 bg-current/10 hover:bg-current/30 rounded">
                                    + 添加
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Template Editor Overlay */}
            {selectedCmdForEdit && (
                <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className={`w-full max-w-lg p-6 rounded shadow-2xl border ${styles.header} ${styles.text}`}>
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <Icons.Edit className="w-4 h-4"/>
                            编辑模板: <span className={styles.accent}>{selectedCmdForEdit}</span>
                        </h3>
                        <textarea 
                            value={editTemplateValue}
                            onChange={e => setEditTemplateValue(e.target.value)}
                            className={`w-full h-40 p-3 text-xs font-mono rounded resize-none focus:outline-none focus:ring-1 focus:ring-current mb-4 ${styles.input}`}
                            placeholder="输入指令的具体Prompt..."
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setSelectedCmdForEdit(null)} className="px-4 py-2 text-xs font-bold opacity-60 hover:opacity-100">取消</button>
                            <button onClick={handleSaveTemplate} className={`px-6 py-2 rounded text-xs font-bold bg-current/20 hover:bg-current/40 ${styles.accent}`}>保存</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
