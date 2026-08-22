import React, { useState, useEffect, useRef } from 'react';
import { inkJianghuExternalUrls } from '../../skins/inkJianghuExternalUrls';

interface DraggableFullscreenButtonProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  theme?: string;
}

export const DraggableFullscreenButton: React.FC<DraggableFullscreenButtonProps> = ({
  isFullscreen,
  onToggleFullscreen,
  theme = 'night'
}) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, pageX: 0, pageY: 0 });
  const didDragRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 从localStorage加载位置
  useEffect(() => {
    const saved = localStorage.getItem('fullscreen_button_position');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        // 确保位置在可视区域内
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        setPosition({
          x: Math.min(Math.max(20, pos.x), maxX),
          y: Math.min(Math.max(20, pos.y), maxY)
        });
      } catch (e) {
        console.warn('无法加载全屏按钮位置', e);
      }
    }
  }, []);

  // 保存位置到localStorage
  const savePosition = (x: number, y: number) => {
    localStorage.setItem('fullscreen_button_position', JSON.stringify({ x, y }));
  };

  // 处理鼠标按下
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    didDragRef.current = false;
    setIsDragging(true);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pageX: e.clientX,
        pageY: e.clientY
      });
    }
    e.preventDefault();
  };

  // 处理鼠标移动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = Math.abs(e.clientX - dragStart.pageX);
      const dy = Math.abs(e.clientY - dragStart.pageY);
      if (dx > 4 || dy > 4) didDragRef.current = true;
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // 限制在可视区域内
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      const constrainedX = Math.min(Math.max(20, newX), maxX);
      const constrainedY = Math.min(Math.max(20, newY), maxY);
      
      setPosition({ x: constrainedX, y: constrainedY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        savePosition(position.x, position.y);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, position]);

  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      setPosition(prev => ({
        x: Math.min(prev.x, maxX),
        y: Math.min(prev.y, maxY)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const accentColor =
    theme === 'black-gold'
      ? 'text-amber-300'
      : theme === 'ink-jianghu'
        ? 'text-white'
        : theme === 'fantasy-elegant'
          ? 'text-amber-700'
          : theme === 'military'
            ? 'text-green-500'
            : theme === 'tech'
              ? 'text-cyan-400'
              : 'text-emerald-500';
  const bgColor =
    theme === 'black-gold'
      ? 'bg-[#050505]/95'
      : theme === 'ink-jianghu'
        ? 'bg-black/70'
        : theme === 'fantasy-elegant'
          ? 'bg-[#fffdf8]/95'
          : theme === 'day'
            ? 'bg-white/90'
            : 'bg-black/80';
  const borderColor =
    theme === 'black-gold'
      ? 'border-amber-500/70'
      : theme === 'ink-jianghu'
        ? 'border-white/20'
        : theme === 'fantasy-elegant'
          ? 'border-amber-700/50'
          : theme === 'military'
            ? 'border-green-500/50'
            : theme === 'tech'
              ? 'border-cyan-500/50'
              : 'border-emerald-500/50';

  const handleClick = () => {
    if (!didDragRef.current) onToggleFullscreen();
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={`fixed z-[200] w-12 h-12 rounded-full ${bgColor} ${borderColor} border-2 flex items-center justify-center shadow-lg hover:shadow-xl transition-all cursor-move hover:scale-110 ${isDragging ? 'scale-105 opacity-80' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        ...(theme === 'ink-jianghu'
          ? {
              backgroundImage: `url(${inkJianghuExternalUrls.baseBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : {}),
      }}
      title={isFullscreen ? '退出全屏' : '进入全屏'}
    >
      {isFullscreen ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={accentColor}>
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={accentColor}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      )}
    </button>
  );
};
