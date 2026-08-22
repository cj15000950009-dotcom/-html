
import React, { useState, useEffect } from 'react';

interface TitleScreenProps {
  onStartGame: () => void;
  onOpenLoad: () => void;
  onOpenSettings: () => void;
  onOpenLibrary: () => void; 
  onOpenBackgrounds: () => void; 
  onOpenWorldInfo: () => void;
  onOpenDossier: () => void;
  isAuthorMode?: boolean;
  theme?: string;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenLoad,
  onOpenSettings,
  onOpenLibrary,
  onOpenBackgrounds,
  onOpenWorldInfo,
  onOpenDossier,
  isAuthorMode = false,
  theme = 'military'
}) => {
  const [titleText, setTitleText] = useState("武侦连纪律锁");

  useEffect(() => {
      const savedTitle = localStorage.getItem('spirit_command_title_text');
      if (savedTitle) setTitleText(savedTitle);
  }, []);

  const handleTitleChange = (newTitle: string) => {
      setTitleText(newTitle);
      localStorage.setItem('spirit_command_title_text', newTitle);
  };

  const styles = {
      accent: theme === 'tech' ? 'text-cyan-400' : theme === 'military' ? 'text-emerald-500' : 'text-emerald-500',
      border: theme === 'tech' ? 'border-cyan-500' : theme === 'military' ? 'border-emerald-500' : 'border-emerald-500',
      btnPrimary: theme === 'tech' ? 'bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]' : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]',
      btnSecondary: theme === 'tech' ? 'hover:text-white border-transparent hover:border-cyan-500' : 'hover:text-white border-transparent hover:border-emerald-500'
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-[#020617] z-0"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_80%)] z-0 pointer-events-none"></div>
      
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`, backgroundSize: '60px 60px' }}>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-20 w-full max-w-5xl animate-in fade-in zoom-in-95 duration-700">
        
        <div className="text-center space-y-8 group relative mt-10">
            <div className={`flex items-center justify-center gap-4 opacity-80 mb-2 ${styles.accent}`}>
                <span className="text-[10px] font-mono tracking-[0.6em] uppercase">Tactical Neural Interface</span>
            </div>
            
            {isAuthorMode ? (
                <input 
                    value={titleText}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className={`text-7xl md:text-9xl font-black text-white tracking-tighter bg-transparent text-center border-b border-transparent hover:border-white/30 focus:outline-none transition-all w-full`}
                    style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
                />
            ) : (
                <h1 className={`text-7xl md:text-9xl font-black text-white tracking-tighter`} style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}>
                    {titleText}
                </h1>
            )}
            
            {isAuthorMode && <div className={`absolute -right-8 top-1/2 text-[10px] opacity-50 pointer-events-none ${styles.accent}`}>✎</div>}

            <p className={`text-sm md:text-base font-bold tracking-[0.8em] uppercase inline-block ${styles.accent} opacity-60`}>
                Project: Soul Command
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-32 gap-y-8 w-full px-12 pt-10">
            <div className="flex flex-col gap-6 items-end">
                <MenuButton onClick={onStartGame} label="开始行动" sub="INITIATE_OP" primary styles={styles} />
                <MenuButton onClick={onOpenLoad} label="读取记录" sub="LOAD_DATA" styles={styles} />
                <MenuButton onClick={onOpenSettings} label="系统配置" sub="SYSTEM_CONFIG" styles={styles} />
            </div>

            <div className={`flex flex-col gap-6 items-start border-l pl-12 relative ${styles.border} border-opacity-20`}>
                <div className={`absolute -left-[1px] top-0 h-16 w-[1px] shadow-[0_0_10px_currentColor] ${styles.border} bg-current ${styles.accent}`}></div>
                <div className={`text-[10px] font-mono opacity-50 uppercase tracking-widest mb-1 ${styles.accent}`}>Gallery Access</div>
                <MenuButton onClick={onOpenDossier} label="档案 (Dossier)" sub="PERSONNEL_DB" small styles={styles} />
                <MenuButton onClick={onOpenWorldInfo} label="世界书 (Lore)" sub="WORLD_INFO" small styles={styles} />
                <MenuButton onClick={onOpenLibrary} label="资产图库 (Assets)" sub="SPRITE_&_LOCS" small styles={styles} />
            </div>
        </div>

        <div className="absolute -bottom-20 text-[9px] text-white/20 font-mono text-center tracking-widest uppercase flex flex-col items-center gap-2">
            <div>Version 3.2.0 // Stable Connection</div>
            <div className="mt-1">Copyright © 73rd Brigade Tactical Command</div>
        </div>

      </div>
    </div>
  );
};

const MenuButton = ({ label, sub, onClick, primary = false, small = false, styles }: any) => (
    <button 
        onClick={onClick}
        className={`group relative flex items-center justify-between transition-all duration-300
            ${small ? 'w-60 py-3' : 'w-72 py-5'}
            ${primary 
                ? `${styles.btnPrimary} text-white clip-tactical-sm` 
                : `bg-white/5 hover:bg-white/10 text-slate-300 border-b ${styles.btnSecondary} shadow-lg`
            }
        `}
    >
        <div className={`flex flex-col items-start ${!primary && 'pl-4'} ${primary && 'pl-10'}`}>
            <span className={`${small ? 'text-sm' : 'text-xl'} font-black tracking-widest italic`}>{label}</span>
            <span className="text-[9px] font-mono opacity-50 tracking-[0.2em]">{sub}</span>
        </div>
        {primary && <div className="pr-6 text-xl animate-pulse">►</div>}
        {!primary && <div className={`opacity-0 group-hover:opacity-100 transition-opacity pr-4 ${styles.accent}`}>●</div>}
    </button>
);
