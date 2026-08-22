
import React, { useState, useEffect } from 'react';
import { OPENING_SCENARIOS, GAME_BACKGROUND_LORE, CHARACTERS } from '../../constants';
import { DialogueLine, OpeningScenario } from '../../types';

interface GameSetupProps {
  onLaunch: (config: { playerName: string, openingPrompt: string, initialScript?: DialogueLine[] }) => void;
  onBack: () => void;
  defaultName?: string;
  isProcessing?: boolean;
  isAuthorMode?: boolean; 
}

export const GameSetup: React.FC<GameSetupProps> = ({ onLaunch, onBack, defaultName = "指挥官", isProcessing = false, isAuthorMode = false }) => {
  const [playerName, setPlayerName] = useState(defaultName);
  
  // Section: Lore & Background
  const [loreText, setLoreText] = useState(GAME_BACKGROUND_LORE);
  const [isEditingLore, setIsEditingLore] = useState(false);

  // Section: Preset Scenarios
  const [scenarios, setScenarios] = useState<OpeningScenario[]>(OPENING_SCENARIOS);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editScenarioData, setEditScenarioData] = useState<{label: string, description: string, prompt: string}>({ label: '', description: '', prompt: '' });
  
  // New: Selection State
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Section: Custom Operation
  const [customTarget, setCustomTarget] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [customPrompt, setCustomPrompt] = useState("请自由发挥，生成一个符合军事背景的开场。");

  // Load custom data
  useEffect(() => {
      // Load Custom Scenarios
      try {
          const savedScenarios = localStorage.getItem('spirit_command_custom_scenarios');
          if (savedScenarios) {
              const loaded = JSON.parse(savedScenarios);
              // Merge with default scenarios, preferring saved versions if IDs match (allows overriding defaults)
              const combined = [...OPENING_SCENARIOS];
              loaded.forEach((s: OpeningScenario) => {
                  const idx = combined.findIndex(def => def.id === s.id);
                  if (idx !== -1) combined[idx] = s;
                  else combined.push(s);
              });
              setScenarios(combined);
          }
      } catch (e) {}

      // Load Custom Lore
      try {
          const savedLore = localStorage.getItem('spirit_command_custom_lore');
          if (savedLore) setLoreText(savedLore);
      } catch(e) {}
  }, []);

  const handleSaveLore = () => {
      localStorage.setItem('spirit_command_custom_lore', loreText);
      setIsEditingLore(false);
  };

  const handleSelectScenario = (id: string) => {
      if (editingScenarioId) return;
      setSelectedScenarioId(id === selectedScenarioId ? null : id); // Toggle
  };

  const handleLaunchSelected = () => {
      if (!selectedScenarioId) return;
      const scenario = scenarios.find(s => s.id === selectedScenarioId);
      if (!scenario) return;

      if (scenario.initialScript && scenario.initialScript.length > 0) {
          onLaunch({ 
              playerName: playerName || "指挥官", 
              openingPrompt: "", 
              initialScript: scenario.initialScript 
          });
      } else {
          onLaunch({ 
              playerName: playerName || "指挥官", 
              openingPrompt: scenario.prompt 
          });
      }
  };

  const generateCustomPrompt = () => {
      let prompt = `时间：随机。地点：${customContext || '营区某处'}。`;
      prompt += `\n情境：${customContext ? `在${customContext}发生了一次偶遇。` : '一次例行的接触。'}`;
      if (customTarget) {
          const char = Object.values(CHARACTERS).find(c => c.id === customTarget);
          prompt += `\n交互对象：${char?.name || customTarget}。`;
      }
      prompt += `\n重点描写：${playerName}作为观测者介入该场景，描绘对方的生理特征与环境细节。`;
      setCustomPrompt(prompt);
  };

  // Scenario Editing Handlers
  const startEditingScenario = (scenario: OpeningScenario, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingScenarioId(scenario.id);
      setEditScenarioData({ label: scenario.label, description: scenario.description, prompt: scenario.prompt });
  };

  const saveScenarioEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editingScenarioId) return;
      
      const updatedScenarios = scenarios.map(s => 
          s.id === editingScenarioId ? { ...s, ...editScenarioData } : s
      );
      setScenarios(updatedScenarios);
      
      // Persist only the custom/modified ones
      const customOnes = updatedScenarios.filter(s => s.id.startsWith('custom_') || OPENING_SCENARIOS.some(def => def.id === s.id));
      localStorage.setItem('spirit_command_custom_scenarios', JSON.stringify(customOnes));
      
      setEditingScenarioId(null);
  };

  const cancelScenarioEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingScenarioId(null);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#020617] animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
      {/* Background FX */}
      <div className="absolute inset-0 opacity-10 pointer-events-none fixed" 
           style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="w-full max-w-7xl min-h-[90vh] flex flex-col md:flex-row gap-8 p-4 md:p-8 relative z-10">
        
        {/* Left Column: Identity & Intel (35%) */}
        <div className="w-full md:w-[35%] flex flex-col gap-6">
            
            {/* Identity Card */}
            <div className="bg-[#050a14] border border-tactical-green/30 p-6 clip-tactical-box shadow-lg relative group">
                <div className="absolute top-0 right-0 p-2 opacity-50">
                    <svg className="w-6 h-6 text-tactical-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                </div>
                <h3 className="text-sm font-black text-tactical-green uppercase tracking-[0.3em] mb-6">身份登记 // IDENTITY</h3>
                
                <div className="relative group/input perspective-1000 mb-6">
                    <div 
                        className="relative bg-[#020617] p-4 flex items-center gap-3 border border-white/20 shadow-[4px_4px_0_0_#10b981] transition-transform duration-300 group-hover/input:-translate-y-1"
                        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(2deg)' }}
                    >
                        <div className="absolute -top-3 left-4 bg-tactical-green text-black px-2 py-0.5 text-[9px] font-black tracking-widest border border-black uppercase shadow-sm z-20">
                            OPERATOR_ID
                        </div>
                        <input 
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            className="w-full bg-transparent border-b border-white/20 px-2 py-1 text-lg font-black text-white focus:outline-none focus:border-tactical-green transition-all font-mono placeholder-white/20"
                            placeholder="UNIDENTIFIED"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-white/50">
                    <div>
                        <span className="block text-tactical-green opacity-60 mb-1">UNIT</span>
                        合成一营 / 武装侦察连
                    </div>
                    <div>
                        <span className="block text-tactical-green opacity-60 mb-1">CLEARANCE</span>
                        Level 3 (Observer)
                    </div>
                </div>
            </div>

            {/* Background Briefing */}
            <div className="bg-[#050a14] border border-tactical-green/20 flex-1 flex flex-col clip-tactical-box shadow-lg">
                <div className="p-4 border-b border-tactical-green/10 flex justify-between items-center bg-black/20">
                    <h3 className="text-xs font-black text-white/70 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-tactical-green animate-pulse"></span>
                        战术背景简报 // BRIEFING
                    </h3>
                    {isAuthorMode && (
                        <button 
                            onClick={() => isEditingLore ? handleSaveLore() : setIsEditingLore(true)}
                            className="text-[9px] text-tactical-green border border-tactical-green/30 px-2 py-1 hover:bg-tactical-green hover:text-black transition-colors"
                        >
                            {isEditingLore ? "SAVE" : "EDIT"}
                        </button>
                    )}
                </div>
                <div className="flex-1 p-5 relative">
                    {isEditingLore ? (
                        <textarea 
                            value={loreText}
                            onChange={(e) => setLoreText(e.target.value)}
                            className="w-full h-full bg-black/30 text-xs text-tactical-green font-mono border border-tactical-green/30 p-2 focus:outline-none resize-none"
                        />
                    ) : (
                        <div className="text-xs text-white/60 leading-relaxed font-sans h-[300px] md:h-auto overflow-y-auto custom-scrollbar pr-2 whitespace-pre-wrap">
                            {loreText}
                        </div>
                    )}
                    {/* Decorative Scanline */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_50%,transparent_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                </div>
            </div>

            <button onClick={onBack} className="w-full py-4 border border-white/10 text-white/40 hover:text-white hover:bg-white/5 hover:border-white/30 transition-all text-xs font-black tracking-[0.3em] uppercase">
                &lt; 返回主标题 (ABORT)
            </button>
        </div>

        {/* Right Column: Operations (65%) */}
        <div className="w-full md:w-[65%] flex flex-col gap-8">
            
            {/* 1. Quick Entry (Presets) */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-xl font-black text-white italic tracking-[0.1em] flex items-center gap-3">
                        <span className="text-tactical-green text-2xl">⚡</span> 快速切入 (QUICK ENTRY)
                    </h3>
                    <span className="text-[10px] text-white/30 font-mono hidden md:block">SELECT PRESET TO LAUNCH</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto custom-scrollbar mb-4">
                    {scenarios.filter(s => !s.id.startsWith('custom_') || true).map((scenario) => (
                        <div
                            key={scenario.id}
                            onClick={() => handleSelectScenario(scenario.id)}
                            className={`group relative border p-5 text-left transition-all duration-300 overflow-hidden shadow-lg flex flex-col
                                ${editingScenarioId === scenario.id ? 'border-yellow-500/50 bg-[#1a1505]' : ''}
                                ${selectedScenarioId === scenario.id ? 'border-tactical-green bg-tactical-green/10 ring-1 ring-tactical-green' : 'bg-[#0a101d] border-tactical-green/20 hover:border-tactical-green/60 hover:bg-[#0f1825] cursor-pointer'}
                            `}
                        >
                            {editingScenarioId === scenario.id ? (
                                // Editing Mode
                                <div className="space-y-3 z-20 relative" onClick={e => e.stopPropagation()}>
                                    <input 
                                        value={editScenarioData.label} 
                                        onChange={e => setEditScenarioData({...editScenarioData, label: e.target.value})}
                                        className="w-full bg-black/40 text-sm font-black text-yellow-500 border border-yellow-500/30 px-2 py-1 focus:outline-none"
                                        placeholder="标题"
                                    />
                                    <textarea 
                                        value={editScenarioData.description}
                                        onChange={e => setEditScenarioData({...editScenarioData, description: e.target.value})}
                                        className="w-full bg-black/40 text-[10px] text-white/80 border border-yellow-500/30 px-2 py-1 focus:outline-none h-16 resize-none"
                                        placeholder="简述..."
                                    />
                                    <textarea 
                                        value={editScenarioData.prompt}
                                        onChange={e => setEditScenarioData({...editScenarioData, prompt: e.target.value})}
                                        className="w-full bg-black/40 text-[10px] text-white/60 font-mono border border-yellow-500/30 px-2 py-1 focus:outline-none h-24 resize-none"
                                        placeholder="系统Prompt指令..."
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={cancelScenarioEdit} className="text-[9px] px-3 py-1 bg-white/10 text-white hover:bg-white/20">取消</button>
                                        <button onClick={saveScenarioEdit} className="text-[9px] px-3 py-1 bg-yellow-600 text-black font-bold hover:bg-yellow-500">保存</button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode
                                <>
                                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full transition-all ${selectedScenarioId === scenario.id ? 'bg-tactical-green text-black' : 'bg-tactical-green/5 text-transparent group-hover:bg-tactical-green/20'}`}>
                                        <div className="absolute top-2 right-3 font-bold text-lg">✓</div>
                                    </div>
                                    <div className="relative z-10 flex-1">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className={`text-sm font-black tracking-widest uppercase transition-colors ${selectedScenarioId === scenario.id ? 'text-tactical-green' : 'text-white'}`}>{scenario.label}</h4>
                                            {scenario.initialScript && <span className="text-[9px] border border-white/10 px-1.5 py-0.5 text-white/40 rounded bg-black/40 mr-8">INSTANT</span>}
                                        </div>
                                        <p className="text-[11px] text-white/50 leading-relaxed group-hover:text-white/80 transition-colors line-clamp-3">
                                            {scenario.description}
                                        </p>
                                    </div>
                                    {isAuthorMode && (
                                        <button 
                                            onClick={(e) => startEditingScenario(scenario, e)}
                                            className="absolute top-2 right-2 text-[9px] text-white/20 hover:text-yellow-500 z-30 font-black tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            EDIT
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>

                <button 
                    onClick={handleLaunchSelected}
                    disabled={!selectedScenarioId || isProcessing}
                    className={`w-full py-4 bg-tactical-green text-black font-black text-sm uppercase tracking-[0.3em] hover:bg-emerald-400 transition-all clip-tactical-sm shadow-[0_0_30px_rgba(16,185,129,0.3)] relative overflow-hidden group shrink-0 ${(!selectedScenarioId || isProcessing) ? 'opacity-50 cursor-not-allowed bg-gray-700 text-white' : ''}`}
                >
                    {isProcessing ? (
                        <span className="flex items-center justify-center gap-3">
                            <span className="w-4 h-4 border-2 border-black/50 border-t-black rounded-full animate-spin"></span>
                            正在建立神经连接...
                        </span>
                    ) : (
                        <div className="relative z-10 flex items-center justify-center gap-2">
                            <span>{selectedScenarioId ? "确认接入 (INITIATE OPERATION)" : "请选择一个剧本"}</span>
                            {selectedScenarioId && <span className="group-hover:translate-x-1 transition-transform">►</span>}
                        </div>
                    )}
                </button>
            </div>

            {/* 2. Custom Operation (Collapsible or Secondary) */}
            <div className="bg-[#080c14] border border-white/10 p-4 relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/50 to-transparent"></div>
                
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-white/60 italic tracking-[0.1em] flex items-center gap-2">
                        <span className="text-blue-500 text-lg">◈</span> 自定义行动 (CUSTOM OP)
                    </h3>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <select 
                        value={customTarget} onChange={(e) => { setCustomTarget(e.target.value); generateCustomPrompt(); }}
                        className="bg-black/40 border border-white/10 text-white text-[10px] py-2 px-3 focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">-- 随机对象 --</option>
                        {Object.values(CHARACTERS).filter(c => c.id !== 'Player' && c.id !== 'Narrator' && c.id !== 'System').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <select 
                        value={customContext} onChange={(e) => { setCustomContext(e.target.value); generateCustomPrompt(); }}
                        className="bg-black/40 border border-white/10 text-white text-[10px] py-2 px-3 focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">-- 随机环境 --</option>
                        <option value="大操场">大操场</option>
                        <option value="澡堂">澡堂</option>
                        <option value="宿舍">宿舍</option>
                        <option value="医护室">医护室</option>
                    </select>
                </div>

                <div className="flex gap-2">
                    <input 
                        value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 px-3 py-2 text-[10px] text-white/80 focus:border-blue-500 focus:outline-none font-mono"
                        placeholder="Custom Prompt Override..."
                    />
                    <button 
                        onClick={() => onLaunch({ playerName: playerName || "指挥官", openingPrompt: customPrompt })}
                        disabled={isProcessing}
                        className="px-4 bg-blue-900/50 text-blue-300 border border-blue-500/30 text-[10px] font-bold hover:bg-blue-800 hover:text-white transition-all uppercase"
                    >
                        CUSTOM_START
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
