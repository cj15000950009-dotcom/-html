
import React from 'react';
import { StageSprite, Character, CustomFolder } from '../../types';

interface DebugTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  stageSprites: StageSprite[];
  onUpdateStageSprites: (sprites: StageSprite[]) => void;
  backgrounds: { id: string; name: string; url: string }[];
  currentBackground: string;
  onSetBackground: (bg: { name: string; url: string }) => void;
  availableCharacters: Character[]; 
  customLibrary: CustomFolder[]; 
  theme?: string;
  currentLineText?: string;
  onUpdateCurrentLineText?: (text: string) => void;
}

export const DebugTestModal: React.FC<DebugTestModalProps> = ({
  isOpen, onClose, stageSprites, onUpdateStageSprites, backgrounds, currentBackground,
  onSetBackground, availableCharacters, currentLineText = '', onUpdateCurrentLineText
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col justify-end p-8" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-5xl mx-auto h-[50vh] bg-slate-950/30 border-t-2 border-x-2 border-tactical-green shadow-[0_-20px_60px_rgba(0,0,0,0.8)] rounded-t-lg pointer-events-auto animate-in slide-in-from-bottom-10 overflow-hidden flex flex-col clip-tactical-box" onClick={e => e.stopPropagation()}>
        
        {/* 标题栏 - 半透明处理 */}
        <div className="h-14 border-b border-tactical-green/20 flex justify-between items-center px-8 shrink-0 bg-black/40">
             <h2 className="text-xs font-black tracking-[0.4em] text-tactical-green uppercase italic flex items-center gap-2">
                 <span className="w-2 h-2 bg-tactical-green animate-pulse shadow-[0_0_8px_#10b981]"></span>
                 战术数据调制中心 (DATA MODULATION)
             </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10 bg-black/20">
             
             {/* 剧情与脚本 */}
             <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-white/40 tracking-[0.5em] border-b border-tactical-green/10 pb-2 uppercase italic">脚本与剧情注入</h3>
                 <div className="space-y-2">
                     <label className="text-[10px] font-bold text-tactical-green opacity-60 uppercase">当前行文本内容</label>
                     <textarea
                        value={currentLineText}
                        onChange={(e) => onUpdateCurrentLineText && onUpdateCurrentLineText(e.target.value)}
                        className="w-full h-24 bg-slate-950/60 border border-tactical-green/30 p-4 text-xs text-white focus:outline-none focus:border-tactical-green resize-none shadow-inner"
                     />
                 </div>
             </div>

             {/* 环境部署 */}
             <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-white/40 tracking-[0.5em] border-b border-tactical-green/10 pb-2 uppercase italic">环境与背景控制</h3>
                 <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-2">
                         <label className="text-[10px] font-bold text-tactical-green opacity-60 uppercase">地理坐标背景</label>
                         <select 
                            value={backgrounds.find(b => b.url === currentBackground)?.url || ''}
                            onChange={(e) => {
                                const bg = backgrounds.find(b => b.url === e.target.value);
                                if (bg) onSetBackground(bg);
                            }}
                            className="w-full bg-slate-950/60 border border-tactical-green/30 px-3 py-2 text-xs text-white focus:outline-none focus:border-tactical-green"
                         >
                             {backgrounds.map(bg => <option key={bg.id} value={bg.url}>{bg.name}</option>)}
                         </select>
                     </div>
                 </div>
             </div>

             {/* 实时立绘调制 */}
             <div className="space-y-6">
                 <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black text-white/40 tracking-[0.5em] border-b border-tactical-green/10 pb-2 flex-1 uppercase italic">实时立绘部署</h3>
                    <button 
                        onClick={() => {
                            const newSprite: StageSprite = { instanceId: `inst_${Date.now()}`, characterId: availableCharacters[0]?.id || 'Unknown', outfit: '体能服', expression: '默认', x: 0, y: 0, scale: 1, zIndex: stageSprites.length + 1 };
                            onUpdateStageSprites([...stageSprites, newSprite]);
                        }} 
                        className="ml-4 px-4 py-1.5 bg-tactical-green text-slate-950 font-black text-[10px] tracking-widest hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95"
                    >
                        + 部署立绘
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {stageSprites.map((sprite) => (
                         <div key={sprite.instanceId} className="p-5 bg-slate-950/40 border border-tactical-green/20 rounded relative group shadow-lg">
                             <button onClick={() => onUpdateStageSprites(stageSprites.filter(s => s.instanceId !== sprite.instanceId))} className="absolute top-4 right-4 text-red-500 text-[10px] font-black hover:text-red-400">移除</button>
                             <div className="space-y-4">
                                 <div>
                                     <label className="text-[9px] font-black text-white/40 block mb-1 uppercase tracking-tighter">选择角色</label>
                                     <select value={sprite.characterId} onChange={(e) => onUpdateStageSprites(stageSprites.map(s => s.instanceId === sprite.instanceId ? { ...s, characterId: e.target.value } : s))} className="w-full bg-slate-900 border border-tactical-green/10 text-[11px] py-1 text-white focus:outline-none focus:border-tactical-green">
                                         {availableCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                     </select>
                                 </div>
                                 <div className="space-y-3">
                                     <Slider label="水平位移" value={sprite.x} min={-600} max={600} onChange={v => onUpdateStageSprites(stageSprites.map(s => s.instanceId === sprite.instanceId ? { ...s, x: v } : s))} />
                                     <Slider label="垂直位移" value={sprite.y} min={-300} max={300} onChange={v => onUpdateStageSprites(stageSprites.map(s => s.instanceId === sprite.instanceId ? { ...s, y: v } : s))} />
                                     <Slider label="缩放倍率" value={sprite.scale} min={0.5} max={2.5} step={0.05} onChange={v => onUpdateStageSprites(stageSprites.map(s => s.instanceId === sprite.instanceId ? { ...s, scale: v } : s))} />
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
        </div>
        
        {/* 面板底部装饰线 */}
        <div className="h-1 bg-gradient-to-r from-transparent via-tactical-green/50 to-transparent shrink-0" />
      </div>
    </div>
  );
};

const Slider = ({ label, value, min, max, step = 1, onChange }: any) => (
    <div className="flex items-center gap-3">
        <label className="text-[9px] font-black text-white/30 w-16 uppercase">{label}</label>
        <div className="flex-1 relative flex items-center h-4">
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value))} 
                className="w-full h-0.5 bg-tactical-green/20 accent-tactical-green appearance-none cursor-pointer hover:bg-tactical-green/40 transition-colors" 
            />
        </div>
        <span className="text-[9px] font-mono text-tactical-green w-8 text-right drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">{value}</span>
    </div>
);
