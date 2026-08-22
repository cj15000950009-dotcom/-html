import React, { useEffect, useRef, useState } from 'react';
import { ModalCloseX } from './ModalCloseX';
import { DialogueLine, CharacterId } from '../../types';
import { CHARACTERS } from '../../constants';
import { cleanTextForDisplay } from '../../utils/messageParser';
import { isTavernChatApiAvailable, tavernGetChatMessages, tavernGetLastMessageId } from '../../tavernRuntime';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';

interface HistoryLogProps {
  isOpen: boolean;
  onClose: () => void;
  history: DialogueLine[];
  theme?: string;
  /** 是否使用手机/窄视口布局（决定弹窗最大宽度） */
  isMobileLayout?: boolean;
}

type LogEntry = { id: string; speakerLabel: string; text: string };

export const HistoryLog: React.FC<HistoryLogProps> = ({ isOpen, onClose, history, theme = 'night', isMobileLayout }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tavernEntries, setTavernEntries] = useState<LogEntry[]>([]);

  // 优先从酒馆助手读取聊天消息，解析 <maintext> 仅显示角色名+正文（不显示背景/CG/服饰/表情）
  useEffect(() => {
    if (!isOpen || !isTavernChatApiAvailable()) {
      setTavernEntries([]);
      return;
    }
    try {
      const lastId = tavernGetLastMessageId();
      if (lastId == null || lastId < 0) {
        setTavernEntries([]);
        return;
      }
      const range = `0-${lastId}`;
      const msgs = tavernGetChatMessages(range, { role: 'all' });
      const entries: LogEntry[] = (msgs || []).map((m, idx) => ({
        id: `tavern_${idx}_${m.message_id}_${m.role}`,
        speakerLabel: m.role === 'user' ? '指挥官' : m.role === 'system' ? '系统' : (m.name && m.name.trim() ? m.name.trim() : '助手'),
        text: m.message || '',
      }));
      setTavernEntries(entries);
    } catch {
      setTavernEntries([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, tavernEntries.length]);

  if (!isOpen) return null;

  const displayList: LogEntry[] = tavernEntries.length > 0
    ? tavernEntries
    : history.map((line, idx) => ({
        id: line.id || `hist_${idx}`,
        speakerLabel: line.speakerId === CharacterId.PLAYER ? '指挥官' : line.speakerId === CharacterId.SYSTEM ? '系统' : (CHARACTERS[line.speakerId as keyof typeof CHARACTERS]?.name || line.speakerId),
        text: line.text,
      }));

  const isFantasyElegant = theme === 'fantasy-elegant';
  const styles = {
      bg: isFantasyElegant
        ? 'bg-[#fffdf8]/98 text-amber-950 border-amber-800/30'
        : theme === 'day'
          ? 'bg-white/95 text-slate-900'
          : 'bg-slate-950/95 text-slate-200',
      header: isFantasyElegant
        ? 'border-amber-800/25 bg-[#f4ecd8]/95'
        : theme === 'day'
          ? 'border-slate-200 bg-slate-50/90'
          : 'border-white/10 bg-black/40',
      item: isFantasyElegant
        ? 'border-amber-800/15 hover:bg-amber-50/70'
        : theme === 'day'
          ? 'border-slate-100 hover:bg-slate-50'
          : 'border-white/5 hover:bg-white/5',
      name: isFantasyElegant ? 'text-amber-900' : theme === 'day' ? 'text-slate-900' : 'text-white',
      accent: theme === 'tech'
        ? 'text-cyan-400'
        : isFantasyElegant
          ? 'text-amber-800'
          : theme === 'day'
            ? 'text-emerald-600'
            : 'text-emerald-400',
      footer: isFantasyElegant ? 'from-amber-100/90' : theme === 'day' ? 'from-slate-200/80' : 'from-black/20'
  };
  const isInk = theme === 'ink-jianghu';
  const inkPanelStyle = isInk
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.52)), url(${inkJianghuExternalUrls.baseBg})`,
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

  const isMobile = isMobileLayout ?? false;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col backdrop-blur-sm animate-in fade-in duration-200 p-4" onClick={onClose}>
        <div className={`absolute inset-0 ${theme === 'day' ? 'bg-black/40' : 'bg-black/60'}`} />
        
        <div 
            className={`relative w-full ${isMobile ? 'max-w-[min(96vw,960px)]' : 'max-w-5xl'} mx-auto h-full max-h-[92vh] rounded-xl shadow-2xl flex flex-col border border-white/10 overflow-hidden ${styles.bg}`} 
            onClick={e => e.stopPropagation()}
            style={inkPanelStyle}
        >
            {/* Header */}
            <div className={`h-16 border-b flex items-center justify-between px-8 shrink-0 backdrop-blur-md z-10 ${styles.header}`}>
                <h2 className={`text-xl font-bold tracking-widest flex items-center gap-2 ${styles.accent}`} style={inkTitleStyle}>
                    <span>📜</span> 剧情记录 (LOG)
                </h2>
                <ModalCloseX variant="inline" onClose={onClose} />
            </div>

            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6"
            >
                {displayList.map((line, idx) => {
                    const text = cleanTextForDisplay(line.text);
                    if (!text) return null;
                    const isSystem = line.speakerLabel === '系统';
                    const isNarrator = !line.speakerLabel || line.speakerLabel === '旁白';
                    return (
                        <div key={line.id} className={`flex flex-col gap-1 pb-4 border-b ${styles.item}`}>
                            {!isNarrator && (
                                <span className={`text-sm font-bold opacity-80 ${isSystem ? styles.accent : styles.name}`}>
                                    {line.speakerLabel}
                                </span>
                            )}
                            <p className={`leading-relaxed whitespace-pre-wrap ${isNarrator ? 'text-sm opacity-60 italic px-4' : 'text-base'}`}>
                                {text}
                            </p>
                        </div>
                    );
                })}
            </div>
            
            <div className={`h-8 bg-gradient-to-t ${styles.footer} to-transparent shrink-0 pointer-events-none`} />
        </div>
    </div>
  );
};
