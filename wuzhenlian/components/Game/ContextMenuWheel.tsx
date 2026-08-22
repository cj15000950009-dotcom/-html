import React, { useState, useEffect, useRef } from 'react';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';

interface ContextMenuWheelProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onOpenModal: (modal: string) => void;
  onOpenChoices?: () => void;
  /** 回到主界面（关闭所有弹窗等） */
  onBackToMain?: () => void;
  /** 为 true 时在轮盘中显示档案、事件表 */
  developerMode?: boolean;
  theme?: string;
  quickMenuItems?: Array<{ id: string; label: string; icon: React.ReactNode; onClick: () => void }>;
}

// 统一风格的轮盘图标（线性、圆角、currentColor）
const WheelIconHome = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L12 3l9 8" />
    <path d="M5 11v9h14v-9" />
  </svg>
);

const WheelIconSave = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3h11l3 3v13H5z" />
    <path d="M9 3v6h6V3" />
    <path d="M9 18h6" />
  </svg>
);

const WheelIconGallery = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M10 10l2.5 3 2-2 3.5 5H6z" />
    <circle cx="9" cy="8" r="1.4" />
  </svg>
);

const WheelIconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.62V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1-1.62 1.8 1.8 0 0 0-2 .36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.62-1H3a2 2 0 1 1 0-4h.09a1.8 1.8 0 0 0 1.62-1 1.8 1.8 0 0 0-.36-2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 2 .36H9a1.8 1.8 0 0 0 1-1.62V3a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1 1.62 1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.62 1H21a2 2 0 1 1 0 4h-.09a1.8 1.8 0 0 0-1.62 1z" />
  </svg>
);

const WheelIconChoices = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h9l3 4H7z" />
    <path d="M4 14h6l3 4H7z" />
  </svg>
);

const WheelIconTimeline = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="12" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="M8 6h6a4 4 0 0 1 4 4v2" />
    <path d="M8 18h8" />
  </svg>
);

const WheelIconDossier = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h6l2 3h8v11H4z" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
);

const WheelIconVarMonitor = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M7 12l2.5-3L13 15l2.5-4L17 12" />
  </svg>
);

/** 纯圆形径向菜单：8 扇形 + 中心全屏键，无外框 */
export const ContextMenuWheel: React.FC<ContextMenuWheelProps> = ({
  isOpen,
  onClose,
  position,
  onToggleFullscreen,
  isFullscreen,
  onOpenModal,
  onOpenChoices,
  onBackToMain,
  developerMode = false,
  theme = 'night',
  quickMenuItems = []
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHoveredId(null);
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDay = theme === 'day';
  const isBlackGold = theme === 'black-gold';
  const isInk = theme === 'ink-jianghu';
  const isFantasyElegant = theme === 'fantasy-elegant';
  const styles = {
    // 背景：白日 = 白色大理石质感；奇境 = 深色金边大理石；其它 = 深蓝玻璃
    bg: isDay
      ? 'radial-gradient(circle at 20% 0%, rgba(255,255,255,1) 0, rgba(248,250,252,1) 35%, rgba(241,245,249,1) 60%, rgba(226,232,240,1) 100%), \
         repeating-linear-gradient(135deg, rgba(148,163,184,0.08) 0, rgba(148,163,184,0.08) 1px, transparent 1px, transparent 6px)'
      : isFantasyElegant
        ? 'radial-gradient(circle at 20% 0%, rgba(255,253,248,1) 0, rgba(250,246,238,1) 40%, rgba(244,236,216,1) 100%), \
           repeating-linear-gradient(135deg, rgba(180,83,9,0.06) 0, rgba(180,83,9,0.06) 1px, transparent 1px, transparent 6px)'
      : isInk
      ? 'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.16) 0, rgba(15,23,42,1) 45%, rgba(0,0,0,1) 100%), \
         repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 7px)'
      : isBlackGold
      ? 'radial-gradient(circle at 15% 0%, rgba(30,64,175,0.4) 0, rgba(15,23,42,1) 50%, rgba(3,7,18,1) 100%), \
         repeating-linear-gradient(145deg, rgba(251,191,36,0.18) 0, rgba(251,191,36,0.18) 1px, transparent 1px, transparent 7px)'
      : 'radial-gradient(circle at 50% 50%, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.96) 55%, rgba(15,23,42,1) 100%)',
    shadow: isDay
      ? '0 0 0 1px rgba(0,0,0,0.08), 0 25px 50px -12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)'
      : isFantasyElegant
        ? '0 0 0 1px rgba(146,64,14,0.2), 0 25px 50px -12px rgba(120,53,15,0.18), inset 0 1px 0 rgba(255,255,255,0.9)'
      : isInk
      ? '0 0 0 1px rgba(255,255,255,0.15), 0 0 0 2px rgba(0,0,0,0.15), 0 25px 50px -12px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.12)'
      : isBlackGold
      ? '0 0 0 1px rgba(250,204,21,0.3), 0 0 0 2px rgba(15,23,42,0.9), 0 25px 50px -12px rgba(0,0,0,0.85), inset 0 1px 0 rgba(250,250,250,0.15)'
      : '0 0 0 1px rgba(255,255,255,0.15), 0 0 0 2px rgba(0,0,0,0.1), 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
    segmentFill: isDay
      ? 'rgba(0,0,0,0.03)'
      : isFantasyElegant
        ? 'rgba(180,83,9,0.06)'
        : isInk
          ? 'rgba(255,255,255,0.04)'
          : isBlackGold
            ? 'rgba(17,24,39,0.85)'
            : 'rgba(255,255,255,0.04)',
    segmentStroke: isDay
      ? 'rgba(0,0,0,0.08)'
      : isFantasyElegant
        ? 'rgba(146,64,14,0.22)'
        : isInk
          ? 'rgba(255,255,255,0.18)'
          : isBlackGold
            ? 'rgba(251,191,36,0.45)'
            : 'rgba(255,255,255,0.12)',
    segmentHoverFill: isInk
      ? 'rgba(255,255,255,0.24)'
      : isFantasyElegant
        ? 'rgba(217,119,6,0.2)'
        : isBlackGold
          ? 'rgba(251,191,36,0.45)'
          : 'rgba(16,185,129,0.35)',
    segmentHoverStroke: isInk
      ? 'rgba(255,255,255,0.7)'
      : isFantasyElegant
        ? 'rgba(180,83,9,0.55)'
        : isBlackGold
          ? 'rgba(251,191,36,0.85)'
          : 'rgba(16,185,129,0.7)',
    iconColor: isDay
      ? 'text-slate-700'
      : isFantasyElegant
        ? 'text-amber-900'
        : isInk
          ? 'text-white/90'
          : isBlackGold
            ? 'text-amber-100'
            : 'text-white/90',
    iconHoverColor: isInk ? 'text-white' : isFantasyElegant ? 'text-amber-700' : isBlackGold ? 'text-amber-300' : 'text-emerald-500',
    labelColor: isDay
      ? 'text-slate-500'
      : isFantasyElegant
        ? 'text-amber-800/85'
        : isInk
          ? 'text-white/70'
          : isBlackGold
            ? 'text-amber-300/80'
            : 'text-white/60',
    labelHoverColor: isInk ? 'text-white' : isFantasyElegant ? 'text-amber-700' : isBlackGold ? 'text-amber-300' : 'text-emerald-500',
    emptyColor: isDay ? 'text-slate-300' : isFantasyElegant ? 'text-amber-900/25' : isInk ? 'text-white/30' : 'text-white/30',
    inkTextShadow: isInk ? '0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.55)' : 'none',
    inkIconFilter: isInk ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 6px rgba(0,0,0,0.55))' : 'none',
  };

  /** 「主界面」扇区：与中心全屏键同系绿色，便于识别 */
  const homeAccent = {
    icon: isDay ? 'text-emerald-700' : isFantasyElegant ? 'text-amber-700' : 'text-emerald-400',
    iconHover: isDay ? 'text-emerald-600' : isFantasyElegant ? 'text-amber-600' : 'text-emerald-300',
    label: isDay ? 'text-emerald-600' : isFantasyElegant ? 'text-amber-800' : 'text-emerald-400',
    labelHover: isDay ? 'text-emerald-500' : isFantasyElegant ? 'text-amber-700' : 'text-emerald-300',
  };

  const defaultSlotsAll = [
    { id: 'choices', label: '选项', icon: <WheelIconChoices />, onClick: () => onOpenChoices?.() },
    { id: 'home', label: '主界面', icon: <WheelIconHome />, onClick: () => onBackToMain?.() },
    { id: 'saveLoad', label: '存档', icon: <WheelIconSave />, onClick: () => onOpenModal('saveLoad') },
    { id: 'assets', label: '图库', icon: <WheelIconGallery />, onClick: () => onOpenModal('assets') },
    { id: 'dossier', label: '档案', icon: <WheelIconDossier />, onClick: () => onOpenModal('dossier') },
    { id: 'schedule', label: '事件表', icon: <WheelIconTimeline />, onClick: () => onOpenModal('schedule') },
    { id: 'settings', label: '设置', icon: <WheelIconSettings />, onClick: () => onOpenModal('settings') },
  ];
  const defaultSlots = developerMode
    ? defaultSlotsAll
    : defaultSlotsAll.filter(s => s.id !== 'dossier' && s.id !== 'schedule');

  const allSlots = [...defaultSlots, ...quickMenuItems.slice(0, 4)];

  const slotAngles = [-90, -45, 0, 45, 90, 135, 180, 225];
  const wheelSize = 240;

  const runSlot = (slot: { onClick: () => void } | null) => {
    if (slot) {
      slot.onClick();
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-200 pointer-events-auto"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="relative rounded-full flex items-center justify-center select-none overflow-hidden"
        style={{
          width: wheelSize,
          height: wheelSize,
          opacity: mounted ? 1 : 0,
          transform: `scale(${mounted ? 1 : 0.8})`,
          transition: 'opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          background: isInk ? 'transparent' : styles.bg,
          backdropFilter: isInk ? 'none' : 'blur(20px) saturate(1.2)',
          WebkitBackdropFilter: isInk ? 'none' : 'blur(20px) saturate(1.2)',
          boxShadow: styles.shadow,
        }}
      >
        {isInk && (
          <>
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                backgroundImage: `url(${inkJianghuExternalUrls.quickWheelBg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'brightness(0.42) contrast(1.05)',
              }}
            />
            <div className="absolute inset-0 rounded-full bg-black/45 pointer-events-none" />
          </>
        )}
        {/* 外圈细刻度 + 扇形 */}
        <svg
          width={wheelSize}
          height={wheelSize}
          className="absolute inset-0 z-[1]"
          viewBox={`0 0 ${wheelSize} ${wheelSize}`}
        >
          {/* 外圈刻度 */}
          {Array.from({ length: 40 }).map((_, i) => {
            const cx = wheelSize / 2;
            const cy = wheelSize / 2;
            const outerR = wheelSize / 2 - 3;
            const innerR = outerR - (i % 5 === 0 ? 6 : 3);
            const rad = ((i * 9) - 90) * (Math.PI / 180);
            const x1 = cx + innerR * Math.cos(rad);
            const y1 = cy + innerR * Math.sin(rad);
            const x2 = cx + outerR * Math.cos(rad);
            const y2 = cy + outerR * Math.sin(rad);
            return (
              <line
                key={`tick_${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isBlackGold ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.18)'}
                strokeWidth={i % 5 === 0 ? 1.3 : 0.7}
                strokeLinecap="round"
              />
            );
          })}

          {/* 8 扇形 */}
          {slotAngles.map((angle, idx) => {
            const slot = allSlots[idx] ?? null;
            const isHover = slot && hoveredId === slot.id;
            const startAngle = (angle - 90 - 22.5) * (Math.PI / 180);
            const endAngle = (angle - 90 + 22.5) * (Math.PI / 180);
            const cx = wheelSize / 2;
            const cy = wheelSize / 2;
            const outerR = wheelSize / 2 - 2;
            const innerR = 40;
            const x1o = cx + outerR * Math.cos(startAngle);
            const y1o = cy + outerR * Math.sin(startAngle);
            const x2o = cx + outerR * Math.cos(endAngle);
            const y2o = cy + outerR * Math.sin(endAngle);
            const x1i = cx + innerR * Math.cos(endAngle);
            const y1i = cy + innerR * Math.sin(endAngle);
            const x2i = cx + innerR * Math.cos(startAngle);
            const y2i = cy + innerR * Math.sin(startAngle);
            const d = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x2i} ${y2i} Z`;
            return (
              <path
                key={slot?.id ?? `seg_${idx}`}
                d={d}
                fill={isHover ? styles.segmentHoverFill : styles.segmentFill}
                stroke={isHover ? styles.segmentHoverStroke : styles.segmentStroke}
                strokeWidth={1}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => slot && setHoveredId(slot.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => runSlot(slot)}
              />
            );
          })}
        </svg>

        {/* 内圈描边 */}
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            borderRadius: '9999px',
            boxShadow: isBlackGold
              ? 'inset 0 0 0 1px rgba(249,250,251,0.18)'
              : 'inset 0 0 0 1px rgba(148,163,184,0.35)',
          }}
        />

        {/* 8 个图标 + 标签 */}
        {slotAngles.map((angle, idx) => {
          const slot = allSlots[idx] ?? null;
          const angleRad = (angle - 90) * (Math.PI / 180);
          const r = wheelSize * 0.34;
          const x = wheelSize / 2 + Math.cos(angleRad) * r;
          const y = wheelSize / 2 + Math.sin(angleRad) * r;
          const isHover = slot && hoveredId === slot.id;
          const isHome = slot?.id === 'home';
          return (
            <div
              key={slot?.id ?? `icon_${idx}`}
              className="absolute z-[1] flex flex-col items-center justify-center pointer-events-none"
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
            >
              {slot ? (
                <>
                  <span
                    className={`mb-1 text-[17px] drop-shadow-sm [&_svg]:current ${
                      isHome
                        ? isHover
                          ? homeAccent.iconHover
                          : homeAccent.icon
                        : isHover
                          ? styles.iconHoverColor
                          : styles.iconColor
                    }`}
                    style={{ filter: styles.inkIconFilter }}
                  >
                    {slot.icon}
                  </span>
                  <span
                    className={`text-[9px] font-semibold tracking-[0.08em] mt-0.5 ${
                      isHome
                        ? isHover
                          ? homeAccent.labelHover
                          : homeAccent.label
                        : isHover
                          ? styles.labelHoverColor
                          : styles.labelColor
                    }`}
                    style={{ textShadow: styles.inkTextShadow }}
                  >
                    {slot.label}
                  </span>
                </>
              ) : (
                <span className={`text-sm ${styles.emptyColor}`}>+</span>
              )}
            </div>
          );
        })}

        {/* 中心全屏键 */}
        <button
          type="button"
          onMouseEnter={() => setHoveredId('fullscreen')}
          onMouseLeave={() => setHoveredId(null)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFullscreen();
            onClose();
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 z-[2]"
          style={{
            background: isBlackGold
              ? hoveredId === 'fullscreen'
                ? 'rgba(251,191,36,0.8)'
                : 'rgba(251,191,36,0.55)'
              : hoveredId === 'fullscreen'
              ? 'rgba(16,185,129,0.6)'
              : 'rgba(16,185,129,0.35)',
            border: isBlackGold ? '2px solid rgba(250,204,21,0.9)' : '2px solid rgba(16,185,129,0.6)',
            color: isBlackGold ? '#1f2933' : '#a7f3d0',
            boxShadow: isBlackGold
              ? '0 0 28px rgba(250,204,21,0.7), inset 0 1px 0 rgba(255,255,255,0.15)'
              : '0 0 24px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
            textShadow: styles.inkTextShadow,
          }}
          title="全屏"
        >
          {isFullscreen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 10h4m0 0V6m0 4-5-5m17 5h-4m0 0V6m0 4 5-5M4 14h4m0 0v4m0-4-5 5m17-5h-4m0 0v4m0-4 5 5" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          )}
        </button>
      </div>
    </div>
  );
};
