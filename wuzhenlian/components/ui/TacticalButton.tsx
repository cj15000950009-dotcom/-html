
import React from 'react';

interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  active?: boolean;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({ 
  children, 
  variant = 'primary', 
  active = false,
  className = '', 
  ...props 
}) => {
  // Fresh Military Style: Teal/Slate based, cleaner, less "heavy"
  const baseStyles = "relative font-mono uppercase tracking-widest text-xs font-bold py-2.5 px-6 transition-all duration-200 clip-chamfer-sm group overflow-hidden";
  
  const variants = {
    primary: `bg-emerald-600/90 text-white hover:bg-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] border border-transparent ${active ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : ''}`,
    secondary: `bg-slate-800/80 text-slate-300 border border-slate-600 hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-800`,
    danger: `bg-red-900/50 text-red-200 border border-red-700/50 hover:bg-red-800/80 hover:border-red-500`,
    ghost: `bg-transparent text-slate-400 hover:text-emerald-400 hover:bg-white/5 border border-transparent`
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
      {/* Subtle shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
    </button>
  );
};
