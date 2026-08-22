import React, { useState, useEffect, useRef } from 'react';
import { Character } from '../../types';

interface CharacterSpriteProps {
  character: Character;
  isActive: boolean;
  position: 'left' | 'center' | 'right';
  /** 舞台三槽位 / 左下角头像立绘（叠在对话框区域之上） */
  placement?: 'stage' | 'avatarCorner';
  /** 头像立绘：相对左下锚点的像素微调与额外缩放 */
  avatarCornerExtras?: { offsetX: number; offsetY: number; scale: number };
  config?: { scale: number; x: number; y: number };
  zIndex?: number;
  breathingEnabled?: boolean;
  breathingScale?: number;
  breathingDuration?: number;
  /** 入场动画 CSS 类名（如 sprite-enter-fade-in），由全局 spriteAnimationEnabled 等决定实际是否播放 */
  enterAnimationClass?: string;
  /** 退场动画（如换背景全员退场）；打在内部层，避免与外层 translateX(-50%) 冲突 */
  exitAnimationClass?: string;
  /** 请求显示角色介绍面板 */
  onRequestInfo?: (character: Character, anchor?: { left: number; right: number; top: number; bottom: number }) => void;
  /** 信息面板触发方式：双击 / 悬浮 */
  infoTrigger?: 'dblclick' | 'hover';
  /** 图片加载失败时回调，用于上层过滤该立绘并重算其他立绘位置 */
  onImageError?: () => void;
}

export const CharacterSprite: React.FC<CharacterSpriteProps> = ({
  character,
  isActive,
  position,
  placement = 'stage',
  avatarCornerExtras = { offsetX: 0, offsetY: 0, scale: 1 },
  config = { scale: 1, x: 0, y: 0 },
  zIndex: propZ = 10,
  breathingEnabled = true,
  breathingScale = 1.015,
  breathingDuration = 2.5,
  enterAnimationClass,
  exitAnimationClass,
  onRequestInfo,
  infoTrigger = 'dblclick',
  onImageError,
}) => {
  const [imgError, setImgError] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const prevUrlRef = useRef(character.avatarUrl);
  const spriteId = useRef(Math.random().toString(36).substr(2, 9));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImgError(false);
    setNaturalHeight(null);
  }, [character.avatarUrl]);

  useEffect(() => {
    if (character.avatarUrl !== prevUrlRef.current) {
      prevUrlRef.current = character.avatarUrl;
      setMounted(false);
      const t = setTimeout(() => setMounted(true), 80);
      return () => clearTimeout(t);
    }
  }, [character.avatarUrl]);

  // 没有立绘就不要渲染空白占位
  if (!character.avatarUrl?.trim()) return null;
  // 图片加载失败时也不显示占位符，直接隐藏（并通知上层以便重算位置）
  if (imgError) {
    return null;
  }

  /**
   * 必须用「包含块」的百分比，禁止用 vw：vw 相对浏览器视口，在 iframe / max-w 手机栏 / 横向滚动时
   * 会与舞台宽度错位，右侧立绘容易顶出画面。数值略向中线收拢，给宽图 + scale 留边。
   */
  const leftByPosition = (p: 'left' | 'center' | 'right') => {
    switch (p) {
      case 'left':
        return '30%';
      case 'right':
        return '70%';
      default:
        return '50%';
    }
  };

  const z = isActive ? Math.max(propZ, 25) : propZ;

  // 光影匹配：根据位置添加暖色滤镜（酒吧等暖光场景）
  const getWarmLightFilter = () => {
    if (position === 'right') {
      return 'drop-shadow(-8px 0 12px rgba(255, 200, 100, 0.3))';
    } else if (position === 'left') {
      return 'drop-shadow(8px 0 12px rgba(255, 200, 100, 0.3))';
    }
    return '';
  };

  // 多人时整体缩放由上层控制，这里不再因为说话与否额外放大，避免互相遮挡
  const isAvatarCorner = placement === 'avatarCorner';
  const baseScale = config.scale * (isAvatarCorner ? avatarCornerExtras.scale : 1);
  const breathScale = baseScale * (breathingEnabled && !isAvatarCorner ? breathingScale : 1);
  const isExitMode = !!exitAnimationClass;

  const handleInfo = () => {
    if (!onRequestInfo) return;
    let anchor;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      anchor = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }
    onRequestInfo(character, anchor);
  };

  const infoHandlers =
    infoTrigger === 'hover'
      ? {
          onMouseEnter: () => handleInfo(),
        }
      : {
          onDoubleClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            handleInfo();
          },
        };

  const spriteFigure = (
    <>
      {!imgError && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: '40%',
            height: '8vh',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)',
            filter: 'blur(8px)',
            transform: `scale(${config.scale})`,
            transformOrigin: 'center bottom',
            opacity: 0.5,
          }}
        />
      )}
      <div
        className={`relative w-auto ${breathingEnabled && !exitAnimationClass && !isAvatarCorner ? `breathing-sprite-${spriteId.current}` : ''}`}
        style={{
          height: naturalHeight != null && naturalHeight > 0 ? `${naturalHeight}px` : '100%',
          maxHeight: isAvatarCorner ? '36vh' : '85vh',
          transform: `scale(${baseScale})`,
          transformOrigin: isAvatarCorner
            ? 'bottom left'
            : position === 'left'
              ? 'bottom right'
              : position === 'right'
                ? 'bottom left'
                : 'bottom center',
        }}
      >
        <img
          src={character.avatarUrl}
          alt={character.name}
          className="h-full w-auto max-w-none object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
          onLoad={e => {
            const img = e.currentTarget;
            if (img.naturalHeight && img.naturalHeight > 0) setNaturalHeight(img.naturalHeight);
            if (!isAvatarCorner && img.naturalWidth && img.naturalHeight && img.naturalHeight > 0) {
              const ratio = img.naturalWidth / img.naturalHeight;
              if (ratio > 1.8) {
                setImgError(true);
                onImageError?.();
              }
            }
          }}
          onError={() => {
            setImgError(true);
            onImageError?.();
          }}
          style={{
            filter: getWarmLightFilter(),
          }}
        />
      </div>
    </>
  );

  return (
    <>
      {breathingEnabled && !isAvatarCorner && (
        <style>{`
          @keyframes breathing-${spriteId.current} {
            0%, 100% { transform: scale(${baseScale}); }
            50% { transform: scale(${breathScale}); }
          }
          .breathing-sprite-${spriteId.current} {
            animation: breathing-${spriteId.current} ${breathingDuration}s ease-in-out infinite;
          }
        `}</style>
      )}
      <div
        ref={containerRef}
        className={`absolute bottom-0 pointer-events-auto ${!isExitMode && mounted && enterAnimationClass ? enterAnimationClass : ''}`}
        style={{
          height: isAvatarCorner ? '40vh' : '85vh',
          zIndex: z,
          opacity: isExitMode ? 1 : enterAnimationClass ? (mounted ? undefined : 0) : mounted ? 1 : 0,
          left: isAvatarCorner ? `${16 + avatarCornerExtras.offsetX}px` : leftByPosition(position),
          // 整体上移一点，避免对白框遮挡腹部（头像立绘用左下锚点）
          transform: isAvatarCorner
            ? mounted
              ? 'translate(0, -8px)'
              : 'translate(0, 0)'
            : mounted
              ? `translateX(-50%) translateY(-32px)`
              : `translateX(-50%) translateY(0px)`,
          // 不论是否启用入场动画，都保留位移过渡（位置变化要平滑）
          transition: 'left 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease-out, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'left, transform',
        }}
      >
        {/* motion 层：负责平移（跨页位置变化要走 transition） */}
        <div
          className={`relative h-full w-auto flex items-end ${position === 'left' ? 'justify-end' : position === 'right' ? 'justify-start' : 'justify-center'}`}
          style={{
            transform: `translate(${config.x}px, ${config.y}px)`,
            transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), filter 0.25s ease',
            willChange: 'transform',
            // 说话方略微提亮+提饱和，避免“打灯过曝”；其他人明显压暗
            filter: `${isActive ? 'brightness(1.05) contrast(1.04) saturate(1.03)' : 'brightness(0.55) contrast(0.95) saturate(0.35) grayscale(0.25)'} ${getWarmLightFilter()}`,
          }}
          {...infoHandlers}
        >
          {exitAnimationClass ? (
            <div
              className={exitAnimationClass}
              style={{
                display: 'flex',
                height: '100%',
                width: 'max-content',
                alignItems: 'flex-end',
                flexDirection: 'row',
              }}
            >
              {spriteFigure}
            </div>
          ) : (
            spriteFigure
          )}
        </div>
      </div>
    </>
  );
};
