
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { WorldInfoEntry, WorldInfoLogic, WorldInfoPosition } from '../../types';
import { TacticalButton } from '../ui/TacticalButton';

interface WorldInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: WorldInfoEntry[];
  onUpdateEntries: (entries: WorldInfoEntry[]) => void;
  theme?: string;
}

export const WorldInfoModal: React.FC<WorldInfoModalProps> = ({
  isOpen, onClose, entries, onUpdateEntries, theme = 'night'
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'order' | 'name' | 'active'>('order');
  const [activeTab, setActiveTab] = useState<'general' | 'advanced'>('general');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor State
  const [editName, setEditName] = useState('');
  const [editKeys, setEditKeys] = useState('');
  const [editSecondaryKeys, setEditSecondaryKeys] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editOrder, setEditOrder] = useState(100);
  const [editPosition, setEditPosition] = useState<WorldInfoPosition>('after_char');
  const [editLogic, setEditLogic] = useState<WorldInfoLogic>('AND_ANY');
  const [editConstant, setEditConstant] = useState(false);
  const [editCaseSensitive, setEditCaseSensitive] = useState(false);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sync editor when selection changes
  useEffect(() => {
    if (selectedId) {
      const entry = entries.find(e => e.id === selectedId);
      if (entry) {
        setEditName(entry.name || '未命名词条');
        setEditKeys(entry.keys.join(', '));
        setEditSecondaryKeys(entry.secondaryKeys?.join(', ') || '');
        setEditContent(entry.content);
        setEditOrder(entry.insertionOrder || 100);
        // Fix: Handle cases where position or logic might be numeric (imported from ST)
        setEditPosition((typeof entry.position === 'string' ? entry.position : 'after_char') as WorldInfoPosition);
        setEditLogic((typeof entry.selectiveLogic === 'string' ? entry.selectiveLogic : 'AND_ANY') as WorldInfoLogic);
        setEditConstant(!!entry.constant);
        setEditCaseSensitive(!!entry.caseSensitive);
        setHasUnsavedChanges(false);
      }
    } else {
        setEditName(''); setEditKeys(''); setEditSecondaryKeys(''); setEditContent('');
        setEditOrder(100); setEditPosition('after_char'); setEditLogic('AND_ANY');
        setEditConstant(false); setEditCaseSensitive(false);
        setHasUnsavedChanges(false);
    }
  }, [selectedId, entries]);

  // CRUD Operations
  const handleAdd = () => {
    const newEntry: WorldInfoEntry = {
      id: `wi_${Date.now()}`,
      name: '新建词条',
      keys: ['关键词'],
      content: '在此输入描述...',
      enabled: true,
      insertionOrder: 100,
      position: 'after_char'
    };
    onUpdateEntries([...entries, newEntry]);
    setSelectedId(newEntry.id);
  };

  const handleDuplicate = (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const entry = entries.find(e => e.id === id);
      if (!entry) return;
      
      const newEntry: WorldInfoEntry = {
          ...entry,
          id: `wi_${Date.now()}_copy`,
          name: `${entry.name} (副本)`,
          enabled: true
      };
      onUpdateEntries([...entries, newEntry]);
      setSelectedId(newEntry.id);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if(window.confirm('确认删除此词条？')) {
      const newEntries = entries.filter(en => en.id !== id);
      onUpdateEntries(newEntries);
      if (selectedId === id) setSelectedId(null);
    }
  };

  const handleClearAll = () => {
      if (window.confirm('警告：此操作将清空所有世界书词条且无法撤销。\n\n是否确认？')) {
          onUpdateEntries([]);
          setSelectedId(null);
      }
  };

  const handleToggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateEntries(entries.map(en => en.id === id ? { ...en, enabled: !en.enabled } : en));
  };

  const handleSaveEdit = () => {
    if (!selectedId) return;
    const parseKeys = (str: string) => str.split(/[,，]/).map(k => k.trim()).filter(k => k.length > 0);
    
    onUpdateEntries(entries.map(en => en.id === selectedId ? {
      ...en,
      name: editName,
      keys: parseKeys(editKeys),
      secondaryKeys: parseKeys(editSecondaryKeys),
      content: editContent,
      insertionOrder: editOrder,
      position: editPosition,
      selectiveLogic: editLogic,
      constant: editConstant,
      caseSensitive: editCaseSensitive
    } : en));
    setHasUnsavedChanges(false);
  };

  // Import / Export
  const handleExport = () => {
      const exportData = { entries: entries };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SpiritCommand_WorldInfo_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        let newEntries: WorldInfoEntry[] = [];

        const mapEntry = (item: any): WorldInfoEntry => ({
            id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: item.comment || item.name || item.key?.[0] || 'Imported',
            keys: Array.isArray(item.key) ? item.key : (item.keys ? item.keys : (item.key ? [item.key] : [])),
            secondaryKeys: item.secondary_keys || [],
            content: item.content || '',
            enabled: item.enabled !== false,
            insertionOrder: item.order || item.insertion_order || 100,
            position: item.position === 'before_char' ? 'before_char' : 'after_char',
            constant: !!item.constant,
            selectiveLogic: item.selectiveLogic || 'AND_ANY'
        });

        if (json.entries && !Array.isArray(json.entries)) {
           Object.values(json.entries).forEach((item: any) => newEntries.push(mapEntry(item)));
        } 
        else if (Array.isArray(json)) {
             newEntries = json.map(mapEntry);
        }
        else if (json.entries && Array.isArray(json.entries)) {
            newEntries = json.entries.map(mapEntry);
        }

        if (newEntries.length > 0) {
            onUpdateEntries([...entries, ...newEntries]);
            alert(`成功导入 ${newEntries.length} 条世界书词条。`);
        } else {
            alert("无法识别的文件格式。请使用 SillyTavern 兼容的 JSON 格式。");
        }
      } catch (err) {
        alert("JSON 解析失败");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredEntries = useMemo(() => {
      let result = entries.filter(e => 
          e.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          e.keys.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      if (sortBy === 'name') {
          result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else if (sortBy === 'order') {
          result.sort((a, b) => (a.insertionOrder || 0) - (b.insertionOrder || 0));
      } else if (sortBy === 'active') {
          result.sort((a, b) => (a.enabled === b.enabled) ? 0 : a.enabled ? -1 : 1);
      }
      return result;
  }, [entries, searchQuery, sortBy]);

  if (!isOpen) return null;

  const styles = {
      modalBg: theme === 'day' ? 'bg-slate-50 text-slate-900 border-slate-300' : 
               theme === 'tech' ? 'bg-[#0B1120] text-cyan-400 font-mono border-cyan-500/30' : 
               theme === 'military' ? 'bg-[#1a1c10] text-green-500 font-mono border-green-800' : 
               'bg-[#1a1b1e] text-slate-200 border-white/10',
      header: theme === 'day' ? 'bg-white border-slate-200' : 
              theme === 'tech' ? 'bg-[#0f172a] border-cyan-500/20' : 
              theme === 'military' ? 'bg-[#12140b] border-green-900' : 
              'bg-[#141517] border-white/5',
      sidebar: theme === 'day' ? 'bg-slate-100 border-slate-200' : 
               theme === 'tech' ? 'bg-[#0f172a]/50 border-cyan-500/10' : 
               theme === 'military' ? 'bg-[#12140b]/50 border-green-900/50' : 
               'bg-black/20 border-white/5',
      input: theme === 'day' ? 'bg-white border-slate-300' : 
             theme === 'tech' ? 'bg-black/40 border-cyan-500/30 text-cyan-200' : 
             theme === 'military' ? 'bg-black/40 border-green-700/50 text-green-200' : 
             'bg-black/20 border-white/10 text-white',
      itemActive: theme === 'day' ? 'bg-white border-l-4 border-l-military-500 shadow-sm' : 
                  theme === 'tech' ? 'bg-cyan-900/20 border-l-4 border-l-cyan-400' : 
                  theme === 'military' ? 'bg-green-900/20 border-l-4 border-l-green-500' : 
                  'bg-white/10 border-l-4 border-l-white',
      accent: theme === 'tech' ? 'text-cyan-400' : theme === 'military' ? 'text-green-500' : 'text-military-500',
      buttonPrimary: theme === 'tech' ? 'bg-cyan-700 hover:bg-cyan-600 text-white' : 
                     theme === 'military' ? 'bg-green-700 hover:bg-green-600 text-white' : 
                     'bg-military-600 hover:bg-military-500 text-white',
      tabActive: theme === 'day' ? 'bg-white border-b-2 border-military-500 font-bold' : 
                 theme === 'tech' ? 'bg-cyan-900/20 border-b-2 border-cyan-400' : 
                 'bg-white/5 border-b-2 border-white',
      tabInactive: 'opacity-50 hover:opacity-100'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border ${styles.modalBg}`} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className={`h-16 border-b flex justify-between items-center px-6 shrink-0 ${styles.header}`}>
             <h2 className={`font-bold tracking-widest text-lg flex items-center gap-2 ${styles.accent}`}>
                 <span className="text-xl">📖</span> 世界书 (World Info)
             </h2>
             <div className="flex gap-4 items-center">
                 <input 
                    type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange}
                 />
                 <button onClick={handleImportClick} className="opacity-60 hover:opacity-100 text-xs font-bold flex gap-2 items-center hover:text-current transition-colors">
                     <span>📥</span> 导入 JSON
                 </button>
                 <button onClick={handleExport} className="opacity-60 hover:opacity-100 text-xs font-bold flex gap-2 items-center hover:text-current transition-colors">
                     <span>📤</span> 导出
                 </button>
                 <button onClick={handleClearAll} className="opacity-40 hover:opacity-100 text-xs font-bold flex gap-2 items-center hover:text-red-500 transition-colors">
                     <span>🗑️</span> 清空
                 </button>
             </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            
            {/* Sidebar List */}
            <div className={`w-72 border-r flex flex-col shrink-0 ${styles.sidebar}`}>
                <div className="p-3 border-b border-current/10 space-y-3">
                    <div className="flex gap-2">
                        <input 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="搜索..."
                            className={`flex-1 px-3 py-2 rounded text-xs focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                        />
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className={`w-20 px-1 py-2 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                        >
                            <option value="order">序号</option>
                            <option value="name">名称</option>
                            <option value="active">启用</option>
                        </select>
                    </div>
                    <TacticalButton onClick={handleAdd} className="w-full justify-center py-2 text-xs">
                        + 新建词条
                    </TacticalButton>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredEntries.map(entry => (
                        <div 
                            key={entry.id}
                            onClick={() => setSelectedId(entry.id)}
                            className={`p-3 rounded border cursor-pointer transition-all group relative ${selectedId === entry.id ? styles.itemActive : 'border-transparent hover:bg-white/5 opacity-80'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-bold text-sm truncate flex-1 ${!entry.enabled && 'opacity-50 line-through'}`}>{entry.name || '未命名'}</span>
                                <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                                    {entry.constant && <span className="text-[10px] opacity-70 text-blue-400" title="常驻">🔵</span>}
                                    <button 
                                        onClick={(e) => handleToggle(entry.id, e)}
                                        className={`w-3 h-3 rounded-full border flex items-center justify-center ${entry.enabled ? 'bg-green-500 border-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-transparent border-current opacity-30'}`}
                                    ></button>
                                </div>
                            </div>
                            <div className="text-[10px] opacity-50 truncate font-mono flex gap-2 items-center">
                                <span className={`px-1 rounded text-[9px] border border-current opacity-50`}>#{entry.insertionOrder}</span>
                                <span className="truncate flex-1">[{entry.keys.join(', ')}]</span>
                            </div>
                            
                            {/* Hover Actions */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button onClick={(e) => handleDuplicate(entry.id, e)} className="p-1 hover:bg-white/20 rounded" title="复制">📋</button>
                                <button onClick={(e) => handleDelete(entry.id, e)} className="p-1 hover:bg-red-500/20 text-red-500 rounded" title="删除">🗑️</button>
                            </div>
                        </div>
                    ))}
                    {filteredEntries.length === 0 && (
                        <div className="text-center opacity-30 py-10 text-xs">未找到词条</div>
                    )}
                </div>
                <div className="p-2 border-t border-current/10 text-[10px] opacity-40 text-center">
                    数量：{filteredEntries.length}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {selectedId ? (
                    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Tab Bar */}
                        <div className="flex border-b border-current/10 px-6 shrink-0 justify-between items-center">
                            <div className="flex">
                                <button 
                                    onClick={() => setActiveTab('general')}
                                    className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'general' ? styles.tabActive : styles.tabInactive}`}
                                >
                                    基础信息
                                </button>
                                <button 
                                    onClick={() => setActiveTab('advanced')}
                                    className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'advanced' ? styles.tabActive : styles.tabInactive}`}
                                >
                                    高级逻辑
                                </button>
                            </div>
                            {hasUnsavedChanges && (
                                <div className="text-[10px] text-yellow-500 font-bold animate-pulse px-4">
                                    ● 未保存更改
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            
                            {/* GENERAL TAB */}
                            {activeTab === 'general' && (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex flex-col space-y-1">
                                            <label className="text-[10px] font-bold opacity-60 uppercase">词条名称 / 备注</label>
                                            <input 
                                                value={editName}
                                                onChange={e => { setEditName(e.target.value); setHasUnsavedChanges(true); }}
                                                className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold opacity-60 uppercase">主要关键词</label>
                                            <input 
                                                value={editKeys}
                                                onChange={e => { setEditKeys(e.target.value); setHasUnsavedChanges(true); }}
                                                className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                                placeholder="例如: 巨龙, 火焰, 山脉"
                                            />
                                            <div className="flex justify-between items-center text-[9px] opacity-40 pt-1">
                                                <span>逗号分隔。支持正则 /pattern/flags</span>
                                                <div className="flex items-center gap-1">
                                                    <input type="checkbox" checked={editCaseSensitive} onChange={e => { setEditCaseSensitive(e.target.checked); setHasUnsavedChanges(true); }} /> 区分大小写
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 space-y-1 flex flex-col min-h-[350px]">
                                            <label className="text-[10px] font-bold opacity-60 uppercase flex justify-between">
                                                <span>注入内容 (Lore Content)</span>
                                                <span className="opacity-50">{editContent.length} 字</span>
                                            </label>
                                            <textarea 
                                                value={editContent}
                                                onChange={e => { setEditContent(e.target.value); setHasUnsavedChanges(true); }}
                                                className={`flex-1 w-full p-4 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current resize-none font-mono leading-relaxed ${styles.input}`}
                                                placeholder="在此输入世界书设定内容..."
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ADVANCED TAB */}
                            {activeTab === 'advanced' && (
                                <div className="space-y-8 max-w-2xl">
                                    {/* Trigger Config */}
                                    <div className="space-y-4 p-5 border rounded border-current/10 bg-black/5">
                                        <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest border-b border-current/10 pb-2 mb-4">触发条件配置</h3>
                                        
                                        <div className="flex items-start gap-3 p-3 rounded bg-white/5 border border-white/5">
                                            <input type="checkbox" checked={editConstant} onChange={e => { setEditConstant(e.target.checked); setHasUnsavedChanges(true); }} className="mt-1 w-4 h-4" />
                                            <div>
                                                <div className="text-xs font-bold">常驻 (Constant) 🔵</div>
                                                <div className="text-[10px] opacity-50 mt-1 leading-normal">忽略关键词。在上下文允许时始终注入。</div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-2">
                                            <label className="text-[10px] font-bold opacity-60 uppercase">次级关键词 (过滤器)</label>
                                            <input 
                                                value={editSecondaryKeys}
                                                onChange={e => { setEditSecondaryKeys(e.target.value); setHasUnsavedChanges(true); }}
                                                className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                                placeholder="例如: 户外, 森林"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold opacity-60 uppercase">逻辑关系</label>
                                            <select 
                                                value={editLogic}
                                                onChange={e => { setEditLogic(e.target.value as WorldInfoLogic); setHasUnsavedChanges(true); }}
                                                className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                            >
                                                <option value="AND_ANY">AND ANY (主词 + 任意次词)</option>
                                                <option value="AND_ALL">AND ALL (主词 + 所有次词)</option>
                                                <option value="NOT_ANY">NOT ANY (主词 + 无次词)</option>
                                                <option value="NOT_ALL">NOT ALL (主词 + 非所有次词)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Insertion Config */}
                                    <div className="space-y-4 p-5 border rounded border-current/10 bg-black/5">
                                        <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest border-b border-current/10 pb-2 mb-4">插入位置设置</h3>
                                        
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold opacity-60 uppercase">插入顺序 (Order)</label>
                                                <input 
                                                    type="number"
                                                    value={editOrder}
                                                    onChange={e => { setEditOrder(parseInt(e.target.value)); setHasUnsavedChanges(true); }}
                                                    className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                                />
                                                <p className="text-[9px] opacity-40 pt-1">数值越大 = 越靠后 (优先级通常更高)</p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold opacity-60 uppercase">插入位置</label>
                                                <select 
                                                    value={editPosition}
                                                    onChange={e => { setEditPosition(e.target.value as WorldInfoPosition); setHasUnsavedChanges(true); }}
                                                    className={`w-full px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current ${styles.input}`}
                                                >
                                                    <option value="before_char">角色定义之前 (Before Char)</option>
                                                    <option value="after_char">角色定义之后 (After Char)</option>
                                                    <option value="an_top">作者注释顶部 (AN Top)</option>
                                                    <option value="an_bottom">作者注释底部 (AN Bottom)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-current/10 flex justify-between gap-4 shrink-0 bg-black/10">
                             <div className="flex gap-2">
                                 <button 
                                    onClick={(e) => selectedId && handleDuplicate(selectedId, e)}
                                    className="px-4 py-2 rounded border border-current/20 hover:bg-white/5 text-xs font-bold transition-colors"
                                 >
                                     复制
                                 </button>
                                 <button 
                                    onClick={(e) => selectedId && handleDelete(selectedId, e)}
                                    className="px-4 py-2 rounded border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold transition-colors"
                                 >
                                     删除
                                 </button>
                             </div>
                             <TacticalButton onClick={handleSaveEdit} className={`px-8 py-2 ${hasUnsavedChanges ? 'ring-2 ring-yellow-400' : ''}`}>
                                 {hasUnsavedChanges ? '保存更改' : '已保存'}
                             </TacticalButton>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center flex-col opacity-20 gap-4 select-none">
                        <span className="text-6xl">📖</span>
                        <span className="font-mono text-sm uppercase tracking-widest">请从左侧选择词条进行编辑</span>
                    </div>
                )}
            </div>

        </div>
      </div>
    </div>
  );
};
