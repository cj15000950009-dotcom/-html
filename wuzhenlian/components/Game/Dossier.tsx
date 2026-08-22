
import React, { useState, useEffect, useMemo } from 'react';
import { Character, CustomFolder, CharacterId } from '../../types';
import { generateDefaultAvatar } from '../../constants';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';
import { ModalCloseX } from './ModalCloseX';

const StatBar: React.FC<{ label: string; value: number; color: string; onValueChange?: (v: number) => void }> = ({ label, value, color, onValueChange }) => {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => setLocal(value), [value]);
  const clamped = Math.min(100, Math.max(0, local));
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold opacity-70 w-20 shrink-0 text-right">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-black/10 rounded-full overflow-hidden">
          <div className={`h-full ${color} transition-all duration-500 rounded-full`} style={{ width: `${clamped}%` }} />
        </div>
        {onValueChange ? (
          editing ? (
            <input
              type="number"
              min={0}
              max={100}
              value={local}
              onChange={e => setLocal(Number(e.target.value))}
              onBlur={() => { onValueChange(clamped); setEditing(false); }}
              className="w-12 text-right text-xs font-mono bg-white/80 border border-slate-300 rounded px-1 py-0.5"
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-[10px] font-mono w-10 text-right opacity-70 hover:opacity-100" title="点击编辑">
              {value}%
            </button>
          )
        ) : (
          <span className="text-[10px] font-mono opacity-60 w-10 text-right">{value}%</span>
        )}
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; hint?: string; titleStyle?: React.CSSProperties; bodyStyle?: React.CSSProperties }> = ({ title, hint, titleStyle, bodyStyle }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <h3 className="text-xs font-bold opacity-70 tracking-widest border-b border-current pb-2 uppercase flex-1" style={titleStyle}>{title}</h3>
    {hint && <span className="text-[9px] opacity-50 uppercase" style={bodyStyle}>{hint}</span>}
  </div>
);

interface DossierProps {
  isOpen: boolean;
  onClose: () => void;
  characters?: Character[];
  customLibrary?: CustomFolder[];
  onUpdateAvatar?: (id: string, url: string, scale?: number, offsetY?: number) => void;
  onUpdateThemeColor?: (id: string, color: string) => void;
  onUpdateCharacterData?: (id: string, data: Partial<Character>) => void;
  onDeleteCharacter?: (id: string) => void;
  onRefreshDossier?: () => void;
  isRefreshing?: boolean;
  theme?: string;
}

export const Dossier: React.FC<DossierProps> = ({
  isOpen, onClose, characters = [], customLibrary = [], onUpdateAvatar, onUpdateThemeColor, onUpdateCharacterData, onDeleteCharacter, onRefreshDossier, isRefreshing = false, theme = 'night'
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contentTab, setContentTab] = useState<'summary' | 'psych' | 'classified'>('summary');

  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [editScale, setEditScale] = useState(1);
  const [editOffsetY, setEditOffsetY] = useState(0);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPsych, setEditPsych] = useState('');
  const [editKinks, setEditKinks] = useState('');
  const [editStats, setEditStats] = useState({ power: 0, trust: 0, sync: 0 });

  const allowedCharsFilter = (c: Character) =>
    c.id !== CharacterId.SYSTEM && c.id !== CharacterId.NARRATOR;

  const allowedCharacters = useMemo(() => characters.filter(allowedCharsFilter), [characters]);
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return allowedCharacters;
    const q = searchQuery.trim().toLowerCase();
    return allowedCharacters.filter(c =>
      c.name.toLowerCase().includes(q) || (c.role || '').toLowerCase().includes(q) || (c.id || '').toString().toLowerCase().includes(q)
    );
  }, [allowedCharacters, searchQuery]);

  useEffect(() => {
    if (isOpen && allowedCharacters.length > 0 && !selectedId) {
      setSelectedId(allowedCharacters[0].id);
    } else if (isOpen && allowedCharacters.length > 0 && selectedId && !allowedCharacters.find(c => c.id === selectedId)) {
      setSelectedId(allowedCharacters[0].id);
    }
  }, [isOpen, allowedCharacters, selectedId]);

  useEffect(() => {
    setIsEditingAvatar(false);
    setIsEditingDetails(false);
  }, [selectedId]);

  useEffect(() => {
    const selectedChar = allowedCharacters.find(c => c.id === selectedId);
    if (selectedChar) {
      if (isEditingAvatar) {
        setInputUrl(selectedChar.avatarUrl);
        setEditScale(selectedChar.avatarScale ?? 1);
        setEditOffsetY(selectedChar.avatarOffsetY ?? 0);
      }
      if (isEditingDetails) {
        setEditDescription(selectedChar.description ?? '');
        setEditPsych(selectedChar.psychological ?? '');
        setEditKinks(selectedChar.kinks ?? '');
        setEditStats(selectedChar.stats ? { ...selectedChar.stats } : { power: 0, trust: 0, sync: 0 });
      }
    }
  }, [isEditingAvatar, isEditingDetails, selectedId, characters, allowedCharacters]);

  const handleSaveDetails = () => {
    if (selectedId && onUpdateCharacterData) {
      onUpdateCharacterData(selectedId, {
        description: editDescription,
        psychological: editPsych,
        kinks: editKinks,
        stats: editStats
      });
    }
    setIsEditingDetails(false);
  };

  const handleCopy = (text: string) => {
    if (text && navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  const isFantasyElegant = theme === 'fantasy-elegant';
  const styles = {
    modalBg: isFantasyElegant
      ? 'bg-[#faf6ee] border-amber-800/30'
      : theme === 'day'
        ? 'bg-slate-50'
        : theme === 'tech'
          ? 'bg-[#0f172a]'
          : theme === 'military'
            ? 'bg-slate-900 border-emerald-500/30'
            : theme === 'ink-jianghu'
              ? 'bg-black/80 border-white/20'
              : 'bg-slate-900',
    sidebarBg: isFantasyElegant
      ? 'bg-[#f4ecd8] border-amber-800/25 text-amber-950'
      : theme === 'day'
        ? 'bg-white border-slate-200 text-slate-800'
        : theme === 'tech'
          ? 'bg-[#0B1120] border-cyan-500/20 text-cyan-400'
          : theme === 'military'
            ? 'bg-slate-950 border-emerald-500/30 text-emerald-400'
            : theme === 'ink-jianghu'
              ? 'bg-black/35 border-white/20 text-white'
              : 'bg-slate-900 border-slate-700 text-slate-300',
    sidebarHeader: isFantasyElegant
      ? 'bg-[#ede4cf] border-amber-800/25'
      : theme === 'day'
        ? 'bg-slate-50 border-slate-200'
        : theme === 'tech'
          ? 'bg-cyan-950/30 border-cyan-500/30'
          : theme === 'military'
            ? 'bg-emerald-950/30 border-emerald-500/30'
            : theme === 'ink-jianghu'
              ? 'bg-black/20 border-white/20'
              : 'bg-slate-950 border-slate-700',
    itemActive: isFantasyElegant
      ? 'bg-amber-700 text-white'
      : theme === 'day'
        ? 'bg-emerald-500 text-white'
        : theme === 'tech'
          ? 'bg-cyan-600 text-white'
          : theme === 'military'
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-600 text-white',
    contentBg: isFantasyElegant ? 'bg-[#fffdf8] text-amber-950' : 'bg-white text-slate-900',
    profileCard: isFantasyElegant ? 'bg-amber-50/80 border-amber-800/20' : 'bg-slate-50/80 border-slate-200',
    accent: isFantasyElegant ? 'text-amber-800' : theme === 'tech' ? 'text-cyan-500' : 'text-emerald-500',
    statBar: theme === 'military' ? 'bg-emerald-600' : theme === 'tech' ? 'bg-cyan-600' : 'bg-emerald-600',
    statBar2: theme === 'military' ? 'bg-emerald-500' : theme === 'tech' ? 'bg-cyan-500' : 'bg-emerald-500',
    statBar3: theme === 'military' ? 'bg-emerald-400' : theme === 'tech' ? 'bg-cyan-400' : 'bg-red-500',
  };

  const selectedChar = allowedCharacters.find(c => c.id === selectedId);
  const isPlayer = selectedChar?.id === CharacterId.PLAYER;
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
    isInk || isFantasyElegant ? { fontFamily: '"SimSun","Songti SC","STSong","Noto Serif SC",serif' } : undefined;

  const displayUrl = isEditingAvatar ? inputUrl : selectedChar?.avatarUrl ?? '';
  const displayScale = isEditingAvatar ? editScale : (selectedChar?.avatarScale ?? 1);
  const displayOffsetY = isEditingAvatar ? editOffsetY : (selectedChar?.avatarOffsetY ?? 0);

  const contentTabs = [
    { id: 'summary' as const, label: '概要', key: 'summary' },
    { id: 'psych' as const, label: '心理侧写', key: 'psych' },
    { id: 'classified' as const, label: '机密', key: 'classified' },
  ];

  /** 从概要正文推导简短身份（首句或前若干字），用于展示替代瞎编的 role */
  const deriveRoleFromDescription = (desc: string): string => {
    if (!desc || !desc.trim()) return '';
    const t = desc.trim();
    const end = Math.min(t.indexOf('。'), t.indexOf('.'), t.indexOf('\n'));
    const first = end > 0 ? t.slice(0, end).trim() : t;
    return first.length > 24 ? first.slice(0, 24) + '…' : first;
  };

  const displayRole = (char: Character) =>
    deriveRoleFromDescription(char.description ?? '') || '—';

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 md:p-4" onClick={onClose}>
      <div
        className={`relative w-full max-w-[min(96vw,960px)] md:max-w-6xl h-[92vh] md:h-[84vh] rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/20 ${styles.modalBg}`}
        onClick={e => e.stopPropagation()}
        style={inkPanelStyle}
      >
        <ModalCloseX onClose={onClose} />

        {/* 左侧：人员列表 */}
        <div className={`w-full md:w-72 flex flex-col shrink-0 border-r ${styles.sidebarBg}`}>
          <div className={`p-4 border-b ${styles.sidebarHeader}`}>
            <h2 className={`font-bold tracking-widest text-base flex items-center gap-2 ${styles.accent}`} style={inkTitleStyle}>
              <span className="w-2.5 h-2.5 rounded-sm bg-current animate-pulse" />
              档案
            </h2>
            <p className="text-[9px] opacity-60 mt-1 font-mono uppercase" style={inkBodyStyle}>Dossier</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索姓名 / 身份..."
                className="w-full px-3 py-2 text-xs rounded-md bg-black/20 border border-white/10 focus:border-current focus:outline-none placeholder:opacity-50"
              />
              {onRefreshDossier && (
                <button
                  onClick={e => { e.stopPropagation(); onRefreshDossier(); }}
                  disabled={isRefreshing}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-white/10 hover:bg-white/10 transition-all ${isRefreshing ? 'animate-spin opacity-80' : 'opacity-70 hover:opacity-100'}`}
                  title="根据剧情刷新人物状态"
                >
                  ↻
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {filteredCharacters.map(char => (
              <div
                key={char.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border-l-2 transition-all ${selectedId === char.id ? styles.itemActive + ' border-transparent' : 'border-transparent hover:bg-white/5'}`}
              >
                <button type="button" onClick={() => setSelectedId(char.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className={`w-11 h-11 rounded-lg overflow-hidden border shrink-0 ${selectedId === char.id ? 'border-white/50' : 'border-transparent opacity-70'}`}>
                    <img
                      src={char.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover object-top"
                      style={{ transform: `scale(${char.avatarScale ?? 1}) translateY(${(char.avatarOffsetY ?? 0)}%)`, transformOrigin: 'center top' }}
                      onError={e => { e.currentTarget.src = generateDefaultAvatar(char.name, char.themeColor || '#64748b'); }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{char.name}</div>
                    <div className="text-[10px] opacity-70 truncate">{displayRole(char)}</div>
                    {char.id !== CharacterId.PLAYER && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10">信 {char.stats?.trust ?? 0}%</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10">同 {char.stats?.sync ?? 0}%</span>
                      </div>
                    )}
                  </div>
                </button>
                {onDeleteCharacter && char.id !== CharacterId.PLAYER && char.id !== CharacterId.NARRATOR && char.id !== CharacterId.SYSTEM && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`确定删除「${char.name}」？`)) {
                        onDeleteCharacter(char.id);
                        if (selectedId === char.id && filteredCharacters.length > 1) {
                          const idx = filteredCharacters.findIndex(c => c.id === char.id);
                          setSelectedId(filteredCharacters[idx === 0 ? 1 : idx - 1].id);
                        }
                      }
                    }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-white/50 hover:bg-red-500/30 hover:text-red-400 transition-colors"
                    title="删除"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {filteredCharacters.length === 0 && (
              <div className="p-6 text-center text-sm opacity-60">
                {searchQuery.trim() ? '无匹配人员' : '暂无角色档案'}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：详情 */}
        <div className={`flex-1 flex flex-col min-h-0 relative ${styles.contentBg}`}>
          {selectedChar ? (
            <>
              {/* 顶部：姓名、身份、主题色、编辑 */}
              <div className={`shrink-0 relative border-b p-4 md:p-6 flex flex-wrap justify-between items-end gap-4 ${styles.profileCard}`}>
                <div className="flex-1 min-w-0 pr-12">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-baseline gap-3 flex-wrap" style={inkTitleStyle}>
                    {selectedChar.name}
                    <span className="text-sm font-mono font-normal text-slate-500" style={inkBodyStyle}>{selectedChar.id}</span>
                  </h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs font-bold text-white px-2 py-1 rounded uppercase ${styles.accent} bg-current`}>{displayRole(selectedChar)}</span>
                    {(selectedChar.tags || []).map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded border border-slate-300 text-slate-500">#{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {onUpdateThemeColor && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 uppercase">主题色</span>
                      <input
                        type="color"
                        value={selectedChar.themeColor?.startsWith('#') ? selectedChar.themeColor : '#0ea5e9'}
                        onChange={e => onUpdateThemeColor(selectedChar.id, e.target.value)}
                        className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                      />
                    </div>
                  )}
                  {onUpdateCharacterData && (
                    <button
                      type="button"
                      onClick={() => (isEditingDetails ? handleSaveDetails() : setIsEditingDetails(true))}
                      className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded border transition-all ${isEditingDetails ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {isEditingDetails ? '保存' : '编辑档案'}
                    </button>
                  )}
                </div>
              </div>

              {/* 内容区：立绘 + 指标 + 分页正文 */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
                {isRefreshing && (
                  <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                      <span className="text-xs font-bold text-slate-500 uppercase">刷新中…</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row gap-6 p-4 md:p-6 overflow-y-auto flex-1 min-h-0">
                  {/* 立绘 + 核心指标 */}
                  <div className="flex flex-col md:w-64 shrink-0 gap-4">
                    <div className="aspect-[3/4] max-h-[320px] md:max-h-none bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative group shrink-0">
                      <img
                        src={displayUrl}
                        alt=""
                        className="w-full h-full object-cover object-top transition-transform duration-100"
                        style={{ transform: `scale(${displayScale}) translateY(${displayOffsetY}%)`, transformOrigin: 'center top' }}
                        onError={e => { e.currentTarget.src = generateDefaultAvatar(selectedChar?.name || '?', selectedChar?.themeColor || '#64748b'); }}
                      />
                      {isEditingAvatar && (
                        <div className="absolute inset-0 bg-slate-900/95 p-4 flex flex-col gap-3 overflow-y-auto" onClick={() => setIsEditingAvatar(false)}>
                          <div className="flex justify-between items-center text-white" onClick={e => e.stopPropagation()}>
                            <span className="text-xs font-bold">编辑立绘</span>
                          </div>
                          <input value={inputUrl} onChange={e => setInputUrl(e.target.value)} onClick={e => e.stopPropagation()} className="w-full bg-black/30 border border-white/20 px-2 py-1.5 text-xs text-white rounded" placeholder="图片 URL" />
                          <div className="grid grid-cols-2 gap-2 text-white text-xs" onClick={e => e.stopPropagation()}>
                            <div>
                              <label className="block opacity-70 mb-1">缩放</label>
                              <input type="range" min="0.5" max="3" step="0.1" value={editScale} onChange={e => setEditScale(parseFloat(e.target.value))} className="w-full" />
                            </div>
                            <div>
                              <label className="block opacity-70 mb-1">Y 偏移</label>
                              <input type="range" min="-50" max="50" step="1" value={editOffsetY} onChange={e => setEditOffsetY(Number(e.target.value))} className="w-full" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); if (onUpdateAvatar && selectedId) onUpdateAvatar(selectedId, inputUrl, editScale, editOffsetY); setIsEditingAvatar(false); }}
                            className="w-full py-2 bg-white text-slate-900 text-xs font-bold rounded"
                          >
                            保存
                          </button>
                        </div>
                      )}
                      {onUpdateAvatar && !isEditingAvatar && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button type="button" onClick={() => setIsEditingAvatar(true)} className="px-4 py-2 bg-white/90 text-slate-900 text-xs font-bold rounded hover:bg-emerald-500 hover:text-white">
                            编辑立绘
                          </button>
                        </div>
                      )}
                    </div>
                    {!isPlayer && (
                      <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <SectionHeader title="核心指标" titleStyle={inkTitleStyle} bodyStyle={inkBodyStyle} />
                        <div className="space-y-4">
                          <StatBar label="直男程度" value={isEditingDetails ? editStats.power : selectedChar.stats?.power ?? 0} color="bg-purple-500" onValueChange={isEditingDetails ? v => setEditStats(s => ({ ...s, power: v })) : undefined} />
                          <StatBar label="好感值" value={isEditingDetails ? editStats.trust : selectedChar.stats?.trust ?? 0} color="bg-blue-600" onValueChange={isEditingDetails ? v => setEditStats(s => ({ ...s, trust: v })) : undefined} />
                          <StatBar label="性欲值" value={isEditingDetails ? editStats.sync : selectedChar.stats?.sync ?? 0} color="bg-pink-500" onValueChange={isEditingDetails ? v => setEditStats(s => ({ ...s, sync: v })) : undefined} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 分页：概要 / 心理侧写 / 机密 */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex gap-1 border-b border-slate-200 mb-4">
                      {contentTabs.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setContentTab(t.id)}
                          className={`px-4 py-2 text-xs font-bold uppercase transition-all border-b-2 -mb-px ${contentTab === t.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                          style={inkTitleStyle}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                      {contentTab === 'summary' && (
                        <section>
                          <SectionHeader title="人物概要" hint={onUpdateCharacterData ? '可点击「编辑档案」后修改' : undefined} titleStyle={inkTitleStyle} bodyStyle={inkBodyStyle} />
                          {isEditingDetails ? (
                            <textarea
                              value={editDescription}
                              onChange={e => setEditDescription(e.target.value)}
                              className="w-full h-40 p-4 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          ) : (
                            <div className="flex gap-2 group">
                              <div className="flex-1 p-4 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                                {selectedChar.description || '（暂无概要）'}
                              </div>
                              {selectedChar.description && (
                                <button type="button" onClick={() => handleCopy(selectedChar.description)} className="shrink-0 self-start p-2 rounded border border-slate-200 opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-500" title="复制">
                                  📋
                                </button>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                      {contentTab === 'psych' && (
                        <section>
                          <SectionHeader title="心理侧写" titleStyle={inkTitleStyle} bodyStyle={inkBodyStyle} />
                          {isEditingDetails ? (
                            <textarea
                              value={editPsych}
                              onChange={e => setEditPsych(e.target.value)}
                              className="w-full h-40 p-4 border border-slate-300 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          ) : (
                            <div className="flex gap-2 group">
                              <div className={`flex-1 p-4 rounded-lg border-l-4 font-mono text-sm leading-relaxed whitespace-pre-wrap ${theme === 'tech' ? 'bg-cyan-50 border-cyan-500 text-cyan-900' : 'bg-emerald-50 border-emerald-500 text-emerald-900'}`}>
                                {selectedChar.psychological || '（暂无数据）'}
                              </div>
                              {selectedChar.psychological && (
                                <button type="button" onClick={() => handleCopy(selectedChar.psychological!)} className="shrink-0 self-start p-2 rounded border border-slate-200 opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-500" title="复制">
                                  📋
                                </button>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                      {contentTab === 'classified' && (
                        <section>
                          <SectionHeader title="机密档案" hint="Eyes Only" titleStyle={inkTitleStyle} bodyStyle={inkBodyStyle} />
                          {isEditingDetails ? (
                            <textarea
                              value={editKinks}
                              onChange={e => setEditKinks(e.target.value)}
                              className="w-full h-40 p-4 border border-red-200 rounded-lg font-mono text-sm resize-none bg-red-50 focus:ring-2 focus:ring-red-500 focus:outline-none"
                            />
                          ) : (
                            <div className="flex gap-2 group">
                              <div className="flex-1 p-4 rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm leading-relaxed whitespace-pre-wrap font-mono relative">
                                {selectedChar.kinks || '（无）'}
                                <span className="absolute top-2 right-2 text-4xl opacity-10 select-none">⚠</span>
                              </div>
                              {selectedChar.kinks && (
                                <button type="button" onClick={() => handleCopy(selectedChar.kinks!)} className="shrink-0 self-start p-2 rounded border border-slate-200 opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-500" title="复制">
                                  📋
                                </button>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              请在左侧选择人员
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
