import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ModalCloseX } from './ModalCloseX';
import { isTavernHelperFnAvailable, tavernGetLastMessageId } from '../../tavernRuntime';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';

declare const getVariables: ((opt: { type: string; message_id?: number | 'latest'; script_id?: string }) => Record<string, any>) | undefined;
declare const getScriptId: (() => string) | undefined;

interface GameVariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  variables: any;
  onUpdate?: (key: string, value: any) => void;
  theme?: string;
  backgrounds?: { id: string; name: string; url: string }[];
  onSetBackground?: (bg: { name: string; url: string }) => void;
  rawResponse?: string;
}

type VarSource = 'global' | 'chat' | 'character' | 'message' | 'script';

interface VarBlock {
  data: Record<string, any> | null;
  error?: string;
}

const VAR_LABELS: Record<VarSource, string> = {
  global: '全局变量',
  chat: '聊天变量',
  character: '角色卡变量',
  message: '消息楼层变量',
  script: '脚本变量',
};

function isEmptyObj(obj: Record<string, any> | null): boolean {
  if (obj == null) return true;
  if (typeof obj !== 'object') return true;
  return Object.keys(obj).length === 0;
}

function VariableTree({ data, depth = 0, codeBg, isDay }: { data: any; depth?: number; codeBg: string; isDay?: boolean }) {
  const [collapsed, setCollapsed] = useState(depth > 0);
  const isObj = data !== null && typeof data === 'object' && !Array.isArray(data);
  const isArr = Array.isArray(data);
  const keyCls = isDay ? 'text-emerald-700' : 'text-emerald-400/90';
  const previewCls = isDay ? 'text-slate-600' : 'text-slate-400';
  const borderCls = isDay ? 'border-slate-300' : 'border-white/10';
  const numCls = isDay ? 'text-emerald-600' : 'text-emerald-400';
  const boolCls = isDay ? 'text-amber-600' : 'text-amber-400';

  if (data === null || data === undefined) {
    return <span className={isDay ? 'text-slate-500' : 'opacity-50'}>null</span>;
  }
  if (!isObj && !isArr) {
    const raw = typeof data === 'string' ? `"${data.replace(/"/g, '\\"')}"` : String(data);
    return <span className={typeof data === 'number' ? numCls : typeof data === 'boolean' ? boolCls : ''}>{raw}</span>;
  }

  const keys = Object.keys(data);
  const preview = isArr ? `[${data.length}]` : `{${keys.length}}`;

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className={`flex items-center gap-1 text-left ${isDay ? 'hover:bg-slate-200/80' : 'hover:opacity-80'}`}
      >
        <span className={isDay ? 'text-slate-500' : 'opacity-60'}>{collapsed ? '▶' : '▼'}</span>
        <span className={previewCls}>{preview}</span>
      </button>
      {!collapsed && (
        <div className={`pl-4 border-l mt-1 space-y-0.5 ${borderCls}`}>
          {(isArr ? data.map((v: any, i: number) => (
            <div key={i} className="flex gap-2">
              <span className={isDay ? 'text-slate-500 shrink-0' : 'opacity-50 shrink-0'}>[{i}]</span>
              <VariableTree data={v} depth={depth + 1} codeBg={codeBg} isDay={isDay} />
            </div>
          )) : keys.map(k => (
            <div key={k} className="flex gap-2 min-w-0">
              <span className={`${keyCls} shrink-0 truncate max-w-[180px]`} title={k}>"{k}"</span>
              <span className={isDay ? 'text-slate-500 shrink-0' : 'opacity-50 shrink-0'}>:</span>
              <div className="min-w-0 flex-1">
                <VariableTree data={data[k]} depth={depth + 1} codeBg={codeBg} isDay={isDay} />
              </div>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

export const GameVariablesModal: React.FC<GameVariablesModalProps> = ({
  isOpen, onClose, variables, onUpdate, theme = 'night', backgrounds = [], onSetBackground, rawResponse = ''
}) => {
  const [activeTab, setActiveTab] = useState<'variables' | 'thought_chain'>('variables');
  const [localText, setLocalText] = useState('');
  const [localSpeaker, setLocalSpeaker] = useState('');
  const [isSaved, setIsSaved] = useState(true);

  const [messageIdChoice, setMessageIdChoice] = useState<number | 'latest'>('latest');
  const [tavernVars, setTavernVars] = useState<Record<VarSource, VarBlock>>({
    global: { data: null },
    chat: { data: null },
    character: { data: null },
    message: { data: null },
    script: { data: null },
  });
  const [tavernLoading, setTavernLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setLocalText(variables.currentLineText || '');
      setLocalSpeaker(variables.activeCharacterId || '');
      setIsSaved(true);
    }
  }, [isOpen, variables.currentLineText, variables.activeCharacterId]);

  const fetchTavernVariables = useCallback(() => {
    if (!isTavernHelperFnAvailable('getVariables')) {
      setTavernVars(prev => ({
        ...prev,
        global: { data: null, error: '酒馆助手 getVariables 不可用' },
        chat: { data: null, error: '酒馆助手 getVariables 不可用' },
        character: { data: null, error: '酒馆助手 getVariables 不可用' },
        message: { data: null, error: '酒馆助手 getVariables 不可用' },
        script: { data: null, error: '酒馆助手 getVariables 不可用' },
      }));
      return;
    }
    setTavernLoading(true);
    const msgIdParam = messageIdChoice === 'latest' ? 'latest' as const : messageIdChoice;
    let scriptId: string | undefined;
    try {
      scriptId = typeof getScriptId === 'function' ? getScriptId() : undefined;
    } catch {
      scriptId = undefined;
    }

    const next: Record<VarSource, VarBlock> = {
      global: { data: null },
      chat: { data: null },
      character: { data: null },
      message: { data: null },
      script: { data: null },
    };

    try {
      next.global = { data: getVariables({ type: 'global' }) };
    } catch (e) {
      next.global = { data: null, error: String(e) };
    }
    try {
      next.chat = { data: getVariables({ type: 'chat' }) };
    } catch (e) {
      next.chat = { data: null, error: String(e) };
    }
    try {
      next.character = { data: getVariables({ type: 'character' }) };
    } catch (e) {
      next.character = { data: null, error: String(e) };
    }
    try {
      next.message = { data: getVariables({ type: 'message', message_id: msgIdParam }) };
    } catch (e) {
      next.message = { data: null, error: String(e) };
    }
    try {
      if (scriptId !== undefined) {
        next.script = { data: getVariables({ type: 'script', script_id: scriptId }) };
      } else {
        next.script = { data: null, error: '当前环境无 script_id（非脚本内）' };
      }
    } catch (e) {
      next.script = { data: null, error: String(e) };
    }

    setTavernVars(next);
    setTavernLoading(false);
  }, [messageIdChoice]);

  useEffect(() => {
    if (isOpen && activeTab === 'variables') {
      fetchTavernVariables();
    }
  }, [isOpen, activeTab, fetchTavernVariables]);

  const thoughtContent = useMemo(() => {
    const splitIndex = rawResponse.indexOf('<gal_engine_v2>');
    if (splitIndex === -1) return rawResponse;
    return rawResponse.substring(0, splitIndex).trim();
  }, [rawResponse]);

  if (!isOpen) return null;

  const isDay = theme === 'day';
  const isFantasyElegant = theme === 'fantasy-elegant';
  const styles = {
    modalBg: isFantasyElegant
      ? 'bg-[#faf6ee] text-amber-950 border-amber-800/30'
      : isDay
        ? 'bg-slate-50 text-slate-900 border-slate-200'
        : theme === 'tech'
          ? 'bg-[#0B1120] text-cyan-400 font-mono border-cyan-500/30'
          : theme === 'military'
            ? 'bg-[#1a1c10] text-green-500 font-mono border-green-800'
            : 'bg-[#1a1b1e] text-slate-200 border-white/10',
    header: isFantasyElegant
      ? 'bg-[#f4ecd8] border-amber-800/25'
      : isDay
        ? 'bg-white border-slate-200'
        : theme === 'tech'
          ? 'bg-[#0f172a] border-cyan-500/20'
          : theme === 'military'
            ? 'bg-[#12140b] border-green-900'
            : 'bg-[#141517] border-white/5',
    codeBg: isFantasyElegant
      ? 'bg-[#fffdf8] text-amber-950 border-amber-800/25'
      : isDay
        ? 'bg-slate-100 text-slate-800 border-slate-200'
        : theme === 'tech'
          ? 'bg-black/50 text-cyan-300 border-cyan-500/30'
          : theme === 'military'
            ? 'bg-black/50 text-green-400 border-green-700/50'
            : 'bg-black/30 text-slate-300',
    input: isFantasyElegant
      ? 'bg-white border-amber-800/30 text-amber-950'
      : isDay
        ? 'bg-white border-slate-300 text-slate-800'
        : theme === 'tech'
          ? 'bg-black/30 border-cyan-500/30 text-cyan-200'
          : theme === 'military'
            ? 'bg-black/30 border-green-700/50 text-green-200'
            : 'bg-black/30 border-white/10 text-white',
    accent: theme === 'tech'
      ? 'text-cyan-400'
      : theme === 'military'
        ? 'text-green-500'
        : isFantasyElegant
          ? 'text-amber-800'
          : isDay
            ? 'text-emerald-600'
            : 'text-emerald-400',
    tabActive:
      theme === 'military'
        ? 'bg-green-700 text-black border-green-500'
        : isFantasyElegant
          ? 'bg-amber-700 text-white border-amber-600'
          : 'bg-emerald-600 text-white',
    tabInactive: isFantasyElegant
      ? 'bg-transparent text-amber-900/55 hover:text-amber-950'
      : isDay
        ? 'bg-transparent text-slate-500 hover:text-slate-800'
        : 'bg-transparent text-white/50 hover:text-white',
    btnPrimary: isFantasyElegant
      ? 'bg-amber-700 text-white hover:bg-amber-600'
      : 'bg-emerald-600 text-white hover:bg-emerald-500',
    varSection: isFantasyElegant
      ? 'border-amber-800/20 bg-amber-50/60'
      : isDay
        ? 'border-slate-200 bg-slate-100'
        : 'border-white/10 bg-black/20',
    varSectionBorder: isFantasyElegant ? 'border-amber-800/20' : isDay ? 'border-slate-200' : 'border-white/10',
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
  const inkBodyStyle =
    isInk || isFantasyElegant
      ? { fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif' }
      : undefined;

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApplyChanges = () => {
    if (onUpdate) {
      onUpdate('currentLineText', localText);
      onUpdate('activeCharacterId', localSpeaker);
      setIsSaved(true);
    }
  };

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>, val: string) => {
    setter(val);
    setIsSaved(false);
  };

  const lastMsgId = tavernGetLastMessageId() ?? -1;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center ${isDay ? 'bg-black/40' : 'bg-black/80'} backdrop-blur-sm p-4`} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`relative w-full max-w-[min(96vw,960px)] md:max-w-6xl h-[95vh] md:h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border ${styles.modalBg}`}
        onClick={e => e.stopPropagation()}
        style={inkPanelStyle}
      >
        <div className={`h-14 border-b flex justify-between items-center px-6 shrink-0 ${styles.header}`}>
          <h2 className={`font-bold tracking-widest text-lg flex items-center gap-2 ${styles.accent}`} style={inkTitleStyle}>
            <span className="text-xl">🔢</span> 变量监控与思维链 (VAR_MONITOR)
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <button onClick={() => setActiveTab('variables')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-all rounded ${activeTab === 'variables' ? styles.tabActive : styles.tabInactive}`} style={inkTitleStyle}>变量状态</button>
              <button onClick={() => setActiveTab('thought_chain')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-all rounded ${activeTab === 'thought_chain' ? styles.tabActive : styles.tabInactive}`} style={inkTitleStyle}>思维链</button>
            </div>
            <ModalCloseX variant="inline" onClose={onClose} />
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4 md:p-6 gap-4">

          {activeTab === 'variables' && (
            <>
              {/* 当前剧情状态（可编辑） */}
              {onUpdate && (
                <div className={`rounded-lg border p-4 ${styles.codeBg} shrink-0`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black uppercase tracking-widest opacity-80" style={inkTitleStyle}>当前剧情状态（可编辑）</span>
                    <button
                      onClick={handleApplyChanges}
                      disabled={isSaved}
                      className={`px-4 py-2 text-xs font-bold rounded ${isSaved ? 'opacity-50 cursor-not-allowed' : `${styles.btnPrimary}`}`}
                      style={inkTitleStyle}
                    >
                      {isSaved ? '已同步' : '应用更改'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold opacity-60 uppercase block mb-1">当前文本</label>
                      <textarea value={localText} onChange={e => handleInputChange(setLocalText, e.target.value)} className={`w-full px-3 py-2 rounded text-sm font-mono resize-none border ${styles.input}`} rows={2} style={inkBodyStyle} />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold opacity-60 uppercase block mb-1">发言人 ID</label>
                        <input value={localSpeaker} onChange={e => handleInputChange(setLocalSpeaker, e.target.value)} className={`w-full px-3 py-2 rounded text-sm font-mono border ${styles.input}`} style={inkBodyStyle} />
                      </div>
                      {onSetBackground && backgrounds.length > 0 && (
                        <div>
                          <label className="text-[10px] font-bold opacity-60 uppercase block mb-1">背景</label>
                          <select
                            value={backgrounds.find(b => b.url === variables.backgroundUrl)?.url || ''}
                            onChange={e => { const bg = backgrounds.find(b => b.url === e.target.value); if (bg) onSetBackground(bg); }}
                            className={`w-full px-3 py-2 rounded text-sm font-mono border ${styles.input}`}
                            style={inkBodyStyle}
                          >
                            <option value="">选择...</option>
                            {backgrounds.map(bg => (<option key={bg.id} value={bg.url}>{bg.name}</option>))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 酒馆变量（按类型） */}
              <div className={`flex-1 flex flex-col min-h-0 rounded-lg border overflow-hidden ${styles.varSectionBorder}`}>
                <div className={`flex flex-wrap items-center gap-3 px-4 py-3 border-b shrink-0 ${styles.varSection}`}>
                  <span className={`text-xs font-black uppercase tracking-widest ${isDay ? 'text-emerald-600' : 'text-emerald-400/90'}`} style={inkTitleStyle}>酒馆变量（实时读取）</span>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="opacity-70">消息楼层</span>
                    <select
                      value={messageIdChoice === 'latest' ? 'latest' : String(messageIdChoice)}
                      onChange={e => setMessageIdChoice(e.target.value === 'latest' ? 'latest' : Number(e.target.value))}
                      className={`px-2 py-1 rounded border text-xs font-mono ${styles.input}`}
                    >
                      <option value="latest">最新 ({lastMsgId >= 0 ? lastMsgId : '—'})</option>
                      <option value="-1">-1</option>
                      <option value="-2">-2</option>
                      <option value="-3">-3</option>
                      {lastMsgId >= 0 && <option value={lastMsgId}>{lastMsgId}</option>}
                    </select>
                  </label>
                  <button
                    onClick={fetchTavernVariables}
                    disabled={tavernLoading}
                    className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    style={inkTitleStyle}
                  >
                    {tavernLoading ? '刷新中…' : '🔄 刷新全部'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {(['global', 'chat', 'character', 'message', 'script'] as VarSource[]).map(source => {
                    const block = tavernVars[source];
                    const key = `tavern_${source}`;
                    const isCollapsed = collapsedSections[key];
                    const hasData = !isEmptyObj(block.data);
                    const hasError = !!block.error;
                    return (
                      <div key={source} className={`rounded-lg border overflow-hidden ${styles.codeBg}`}>
                        <button
                          type="button"
                          onClick={() => toggleSection(key)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isDay ? 'hover:bg-slate-200/80' : 'hover:bg-white/5'}`}
                        >
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <span className="opacity-60">{isCollapsed ? '▶' : '▼'}</span>
                            {VAR_LABELS[source]}
                            {hasError && <span className="text-red-400 text-[10px] font-normal">({block.error})</span>}
                            {!hasError && hasData && <span className={`text-[10px] font-normal ${isDay ? 'text-emerald-600' : 'text-emerald-400/80'}`}>({Object.keys(block.data!).length} 键)</span>}
                            {!hasError && !hasData && <span className="opacity-50 text-[10px] font-normal">空</span>}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <div className={`px-4 pb-4 pt-1 border-t ${isDay ? 'border-slate-200' : 'border-white/5'}`}>
                            {block.error ? (
                              <pre className="text-red-400/90 text-[11px] whitespace-pre-wrap break-all">{block.error}</pre>
                            ) : hasData ? (
                              <VariableTree data={block.data} codeBg={styles.codeBg} isDay={isDay} />
                            ) : (
                              <div className="text-xs opacity-50">（无数据）</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 完整状态 JSON（折叠） */}
              <details className="shrink-0">
                <summary className="text-xs font-bold opacity-60 uppercase cursor-pointer py-2">完整状态 JSON（仅本界面状态）</summary>
                <div className={`rounded border p-3 overflow-auto max-h-48 font-mono text-[11px] custom-scrollbar ${styles.codeBg}`}>
                  <pre>{JSON.stringify(variables, null, 2)}</pre>
                </div>
              </details>
            </>
          )}

          {activeTab === 'thought_chain' && (
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-xs font-bold opacity-60 uppercase mb-2" style={inkTitleStyle}>思维链 (THOUGHT_CHAIN)</label>
              <div className={`flex-1 rounded border p-4 overflow-auto custom-scrollbar font-mono text-xs whitespace-pre-wrap min-h-0 ${styles.codeBg}`} style={inkBodyStyle}>
                {thoughtContent || '// 未检测到思维链'}
              </div>
              <p className="text-[10px] opacity-50 mt-2" style={inkBodyStyle}>
                来源：酒馆当前聊天最新一条助手消息。若有 <code className="opacity-80">&lt;gal_engine_v2&gt;</code> 则为标签前的内容，否则为整条消息。
              </p>
            </div>
          )}

          <div className="text-[10px] opacity-50 font-mono text-center shrink-0" style={inkBodyStyle}>变量监控 · 与当前图库/酒馆变量实时同步</div>
        </div>
      </div>
    </div>
  );
};
