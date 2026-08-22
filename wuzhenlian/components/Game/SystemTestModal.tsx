import React, { useState, useEffect } from 'react';

interface CalendarScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
}

export const CalendarScheduleModal: React.FC<CalendarScheduleModalProps> = ({ isOpen, onClose, theme = 'night' }) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'schedule'>('schedule');
  const [date, setDate] = useState(new Date());

  // Storyline Event State
  const [events, setEvents] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<{year: number, month: number, day: number} | null>(null);
  const [eventInput, setEventInput] = useState('');

  // Load events on open
  useEffect(() => {
    if (isOpen) {
        const saved = localStorage.getItem('spirit_command_calendar_events');
        if (saved) {
            try { setEvents(JSON.parse(saved)); } catch (e) { console.error("Failed to load calendar events"); }
        }
    }
  }, [isOpen]);

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
      accent: theme === 'tech' ? 'text-cyan-400' : theme === 'military' ? 'text-green-500' : 'text-military-500',
      dayCell: theme === 'day' ? 'hover:bg-slate-200' : theme === 'tech' ? 'hover:bg-cyan-900/30' : theme === 'military' ? 'hover:bg-green-900/30' : 'hover:bg-white/10',
      today: theme === 'tech' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-100' : theme === 'military' ? 'bg-green-900/50 border-green-500 text-green-100' : 'bg-slate-700 text-white',
      eventIndicator: theme === 'day' ? 'bg-military-100 text-military-800' : theme === 'tech' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-500/30' : theme === 'military' ? 'bg-green-900/40 text-green-300 border border-green-500/30' : 'bg-white/10 text-white/80',
      tabActive: theme === 'day' ? 'bg-slate-200 border-b-2 border-military-500 font-bold' : 
                 theme === 'tech' ? 'bg-cyan-900/20 border-b-2 border-cyan-400 text-cyan-200' : 
                 theme === 'military' ? 'bg-green-900/20 border-b-2 border-green-500 text-green-200' : 
                 'bg-white/10 border-b-2 border-white',
      tabInactive: 'opacity-60 hover:opacity-100 hover:bg-white/5',
      input: theme === 'day' ? 'bg-white border-slate-300' : theme === 'tech' ? 'bg-black/50 border-cyan-500/50' : theme === 'military' ? 'bg-black/50 border-green-700/50' : 'bg-black/20 border-white/10'
  };

  // Calendar Logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  
  const prevMonth = () => setDate(new Date(year, month - 1, 1));
  const nextMonth = () => setDate(new Date(year, month + 1, 1));
  const setToday = () => setDate(new Date());
  // Simplified Chinese Month Names
  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

  // Event Logic
  const getKey = (y: number, m: number, d: number) => `${y}-${m}-${d}`;

  // --- AUTOMATIC EVENT GENERATION LOGIC ---
  const getAutoEvent = (y: number, m: number, d: number) => {
      const realMonth = m + 1; // 1-12
      const dayOfWeek = new Date(y, m, d).getDay(); // 0-6
      const tags: string[] = [];

      // 1. Specific Holidays & Dates
      if (realMonth === 10 && d === 1) return "🇨🇳 国庆节 (全旅放假)";
      if (realMonth === 3 && d === 1) return "🧣 退伍季 (老兵离队)";
      if (realMonth === 9 && d === 1) return "🧣 退伍季 (老兵离队)";
      // Approximate Spring Festival (Lore Years)
      if ((y === 2028 && realMonth === 1 && d === 26) || (y === 2029 && realMonth === 2 && d === 13)) return "🧧 春节";

      // 2. Weekly Routine (Higher Priority than Training Ranges for display clarity)
      if (dayOfWeek === 4) tags.push("📘 政治教育"); // Thursday
      if (dayOfWeek === 6 || dayOfWeek === 0) tags.push("🏖️ 休息/外出"); // Sat/Sun

      // 3. Seasonal Training Ranges
      // Sea Training: July - August
      const isSea = (realMonth === 7 || realMonth === 8);
      // Field Training: August - November
      const isField = (realMonth >= 8 && realMonth <= 11);
      
      if (isSea && isField && realMonth === 8) tags.push("⛺ 驻训/海训交接");
      else if (isSea) tags.push("🌊 海训");
      else if (isField) tags.push("⛺ 野外驻训");

      // Recruit Training: Mar-Jun & Sep-Dec
      const isSpringRecruits = (realMonth >= 3 && realMonth <= 6);
      const isAutumnRecruits = (realMonth >= 9 && realMonth <= 12);
      
      if (isSpringRecruits) tags.push("⭐ 新兵(春)");
      if (isAutumnRecruits) tags.push("⭐ 新兵(秋)");

      if (tags.length === 0) return null;
      return tags.join(" / ");
  };

  const getCombinedEvent = (y: number, m: number, d: number) => {
      const key = getKey(y, m, d);
      if (events[key]) return { text: events[key], type: 'manual' };
      
      const auto = getAutoEvent(y, m, d);
      if (auto) return { text: auto, type: 'auto' };
      
      return null;
  };
  
  const handleDayClick = (day: number) => {
      const key = getKey(year, month, day);
      const existing = events[key];
      const auto = getAutoEvent(year, month, day);
      
      setEventInput(existing || (auto ? `[系统: ${auto}] ` : ''));
      setSelectedDate({ year, month, day });
  };

  const handleSaveEvent = () => {
      if (!selectedDate) return;
      const key = getKey(selectedDate.year, selectedDate.month, selectedDate.day);
      const newEvents = { ...events };
      
      if (eventInput.trim()) {
          newEvents[key] = eventInput.trim();
      } else {
          delete newEvents[key];
      }
      
      setEvents(newEvents);
      localStorage.setItem('spirit_command_calendar_events', JSON.stringify(newEvents));
      setSelectedDate(null);
  };

  const handleDeleteEvent = () => {
      if (!selectedDate) return;
      const key = getKey(selectedDate.year, selectedDate.month, selectedDate.day);
      const newEvents = { ...events };
      delete newEvents[key];
      setEvents(newEvents);
      localStorage.setItem('spirit_command_calendar_events', JSON.stringify(newEvents));
      setSelectedDate(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[85vh] border ${styles.modalBg}`} onClick={e => e.stopPropagation()}>
        
        {/* Header with Tabs */}
        <div className={`h-16 border-b flex justify-between items-center px-6 shrink-0 ${styles.header}`}>
             <div className="flex items-center gap-6 h-full">
                 <h2 className={`font-bold tracking-widest text-lg flex items-center gap-2 mr-4 ${styles.accent}`}>
                     <span className="text-xl">📅</span> 日程管理系统
                 </h2>
                 <div className="flex h-full">
                     <button 
                        onClick={() => setActiveTab('schedule')}
                        className={`px-6 h-full flex items-center text-sm tracking-widest uppercase transition-all ${activeTab === 'schedule' ? styles.tabActive : styles.tabInactive}`}
                     >
                        日常周程
                     </button>
                     <button 
                        onClick={() => setActiveTab('calendar')}
                        className={`px-6 h-full flex items-center text-sm tracking-widest uppercase transition-all ${activeTab === 'calendar' ? styles.tabActive : styles.tabInactive}`}
                     >
                        系统日历
                     </button>
                 </div>
             </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
            
            {/* SCHEDULE TAB */}
            {activeTab === 'schedule' && (
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="max-w-4xl mx-auto space-y-8">
                        
                        {/* Header Section */}
                        <div className={`p-6 border-l-4 rounded-r-lg bg-opacity-10 ${theme === 'military' ? 'border-green-600 bg-green-900' : 'border-slate-500 bg-slate-500'}`}>
                            <h3 className="text-xl font-bold mb-2">类型：显性规则 // MANDATORY ROUTINE</h3>
                            <p className="opacity-80 leading-relaxed">
                                定义：所有官兵都必须严格遵守的日常作息时间表，是公开的、强制执行的命令。
                                <br/>
                                <span className="text-sm italic opacity-60">“明天开始严格执行新的作息时间，任何人不得违反！” —— 连长</span>
                            </p>
                        </div>

                        {/* Scope & Core */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className={`p-5 border rounded ${styles.header}`}>
                                <h4 className={`text-sm font-bold uppercase tracking-widest mb-3 ${styles.accent}`}># 适用范围</h4>
                                <ul className="list-disc list-inside text-sm space-y-2 opacity-80">
                                    <li>对象：合成一营全体官兵</li>
                                    <li>场景：磐石营区·武装侦察连的所有日常工作与生活</li>
                                </ul>
                            </div>
                            <div className={`p-5 border rounded ${styles.header}`}>
                                <h4 className={`text-sm font-bold uppercase tracking-widest mb-3 ${styles.accent}`}># 核心描述</h4>
                                <p className="text-sm leading-relaxed opacity-80">
                                    以周为单位，严格规定每日从起床到熄灯的所有节点。通过高度统一的作息与勤务轮换，锻造部队的纪律性与战斗力。
                                </p>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div>
                            <h4 className={`text-sm font-bold uppercase tracking-widest mb-4 border-b border-current pb-2 ${styles.accent}`}># 每日作息流程</h4>
                            <div className="space-y-0 relative">
                                {/* Vertical Line */}
                                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-current opacity-20"></div>
                                
                                {[
                                    { time: '早上', text: '出早操、打扫卫生整理内务、吃早饭。' },
                                    { time: '上午', text: '分专业差异化训练。' },
                                    { time: '中午', text: '吃午饭、午休、午觉。' },
                                    { time: '下午', text: '科目训练。' },
                                    { time: '傍晚', text: '全员高强度体能训练，随后晚饭。' },
                                    { time: '晚上', text: '夜间训练/学习。周三晚休息，周五晚观影。之后准时熄灯。' },
                                ].map((item, idx) => (
                                    <div key={idx} className="flex gap-4 items-start relative mb-6 last:mb-0">
                                        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 bg-opacity-100 z-10 ${theme === 'day' ? 'bg-white' : 'bg-black'} ${styles.accent} border-current`}>
                                            {item.time}
                                        </div>
                                        <div className={`flex-1 p-3 rounded text-sm border opacity-90 ${styles.header}`}>
                                            {item.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 p-3 border border-dashed rounded text-sm opacity-70">
                                💡 补充：周三晚上和周末休息，周四白天上教育政治课程。
                            </div>
                        </div>

                        {/* Duty Rotation */}
                        <div>
                            <h4 className={`text-sm font-bold uppercase tracking-widest mb-4 border-b border-current pb-2 ${styles.accent}`}># 勤务轮换制度</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className={`p-4 border rounded ${styles.header}`}>
                                    <div className="text-xl mb-2">👁️ 岗哨</div>
                                    <div className="text-xs opacity-70 leading-relaxed">
                                        按排班表派出，每班2小时，24小时不间断。高度警惕，枯燥且考验意志。
                                    </div>
                                </div>
                                <div className={`p-4 border rounded ${styles.header}`}>
                                    <div className="text-xl mb-2">🧹 连值</div>
                                    <div className="text-xs opacity-70 leading-relaxed">
                                        每日一人。负责杂务、传达命令、检查卫生、应对突发。拥有临时处置权。
                                    </div>
                                </div>
                                <div className={`p-4 border rounded ${styles.header}`}>
                                    <div className="text-xl mb-2">🍳 帮厨</div>
                                    <div className="text-xs opacity-70 leading-relaxed">
                                        按周轮换一个班。协助炊事班。暂停训练，体力消耗大但能“改善伙食”。
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Exceptions */}
                        <div className={`p-5 rounded border ${styles.header} opacity-80`}>
                            <h4 className={`text-sm font-bold uppercase tracking-widest mb-2 ${styles.accent}`}># 特殊说明</h4>
                            <ul className="list-disc list-inside text-sm space-y-2">
                                <li><strong className="text-current">勤务影响：</strong>岗哨需补觉，帮厨随炊事班作息。暂时脱离集体为私下交流创造条件。</li>
                                <li><strong className="text-current">User特权：</strong>执行任务时可脱离集体训练，深入各单位，成为信息交汇点。</li>
                            </ul>
                        </div>

                    </div>
                </div>
            )}

            {/* CALENDAR TAB */}
            {activeTab === 'calendar' && (
                <div className="absolute inset-0 overflow-y-auto p-8 custom-scrollbar flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-full max-w-4xl">
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={prevMonth} className="px-4 py-2 border border-current rounded opacity-60 hover:opacity-100 transition-all font-mono">&lt; 上月</button>
                            <div className="text-center">
                                <div className="text-3xl font-black tracking-tighter">{year}</div>
                                <div className={`text-xl font-mono tracking-widest ${styles.accent}`}>{monthNames[month]}</div>
                            </div>
                            <button onClick={nextMonth} className="px-4 py-2 border border-current rounded opacity-60 hover:opacity-100 transition-all font-mono">下月 &gt;</button>
                        </div>

                        <div className="grid grid-cols-7 mb-2 border-b border-current/20 pb-2">
                            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                                <div key={d} className="text-center text-xs font-bold opacity-50 font-mono tracking-widest">{d}</div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                            {days.map((day, idx) => {
                                const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                                const eventData = day ? getCombinedEvent(year, month, day) : null;
                                
                                let cellStyle = styles.dayCell;
                                if (eventData?.text.includes("休息") || eventData?.text.includes("春节") || eventData?.text.includes("国庆")) {
                                    cellStyle = theme === 'military' ? 'bg-green-900/20 hover:bg-green-900/40' : 'bg-emerald-900/20 hover:bg-emerald-900/30';
                                } else if (eventData?.text.includes("政治")) {
                                    cellStyle = theme === 'military' ? 'bg-yellow-900/10 hover:bg-yellow-900/30' : 'bg-amber-900/20 hover:bg-amber-900/30';
                                }

                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => day && handleDayClick(day)}
                                        className={`aspect-[4/5] md:aspect-square border rounded p-2 flex flex-col justify-between transition-all relative group cursor-pointer
                                            ${day ? cellStyle : 'opacity-0 pointer-events-none'} 
                                            ${isToday ? styles.today + ' border-current' : 'border-current/10'}
                                            ${eventData?.type === 'manual' ? 'ring-1 ring-inset ring-current/50' : ''}
                                        `}
                                    >
                                        {day && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <span className={`text-sm font-bold font-mono ${isToday ? '' : 'opacity-70'}`}>{day}</span>
                                                    {eventData?.type === 'manual' && <div className={`w-2 h-2 rounded-full ${styles.accent} opacity-80 animate-pulse`}></div>}
                                                </div>
                                                
                                                {eventData && (
                                                    <div className={`mt-1 text-[9px] leading-tight p-1 rounded overflow-hidden line-clamp-4 md:line-clamp-3 opacity-90 ${eventData.type === 'manual' ? styles.eventIndicator : 'opacity-70 font-mono text-[8px] uppercase tracking-tighter'}`}>
                                                        {eventData.text}
                                                    </div>
                                                )}
                                                
                                                {!eventData && (
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-xl opacity-30">+</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 flex justify-center gap-4 text-[10px] opacity-60 font-mono uppercase">
                             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500/50"></div> 休息 / 节假日</div>
                             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500/50"></div> 政治教育</div>
                             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-current opacity-50"></div> 训练 / 勤务</div>
                             <button onClick={setToday} className="ml-4 hover:underline hover:opacity-100">返回今日 (Today)</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* EVENT EDITOR MODAL */}
            {selectedDate && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                     <div className={`w-full max-w-md p-6 rounded-lg shadow-2xl border ${styles.header}`}>
                         <h3 className={`text-lg font-bold mb-4 font-mono flex items-center gap-2 ${styles.accent}`}>
                             <span>✏️</span> 
                             {selectedDate.year}.{String(selectedDate.month+1).padStart(2,'0')}.{String(selectedDate.day).padStart(2,'0')} 
                             <span className="text-xs opacity-50 ml-auto">事件记录</span>
                         </h3>
                         
                         <div className="mb-4">
                             <label className="text-xs font-bold opacity-60 uppercase mb-2 block">主线剧情 / 事件详情</label>
                             <textarea 
                                value={eventInput}
                                onChange={(e) => setEventInput(e.target.value)}
                                className={`w-full h-32 p-3 rounded text-sm focus:outline-none focus:ring-1 focus:ring-current resize-none ${styles.input}`}
                                placeholder="输入该日期的主线剧情或事件记录..."
                                autoFocus
                             />
                             <p className="text-[10px] opacity-50 mt-2">
                                 * 手动记录将覆盖默认的系统日程显示。
                             </p>
                         </div>

                         <div className="flex justify-between items-center gap-4">
                             <button 
                                onClick={handleDeleteEvent}
                                className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/30 transition-colors"
                             >
                                清空
                             </button>
                             <div className="flex gap-2">
                                <button 
                                    onClick={() => setSelectedDate(null)}
                                    className="px-4 py-2 text-xs font-bold opacity-70 hover:opacity-100 hover:bg-white/10 rounded border border-transparent transition-colors"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={handleSaveEvent}
                                    className={`px-6 py-2 text-xs font-bold text-white rounded shadow-lg transition-transform active:scale-95 ${theme === 'military' ? 'bg-green-600 hover:bg-green-500' : theme === 'tech' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-military-500 hover:bg-military-400'}`}
                                >
                                    保存记录
                                </button>
                             </div>
                         </div>
                     </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};