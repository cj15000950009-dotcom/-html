import React from 'react';
import { ModalCloseX } from './ModalCloseX';
import { Choice } from '../../types';

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  choices: Choice[];
  onChoice: (text: string) => void;
  theme?: string;
  /** 是否使用手机/窄视口布局（决定弹窗最大宽度） */
  isMobileLayout?: boolean;
}

/** 选项弹窗：显示当前可选的对话选项 */
export const OptionsModal: React.FC<OptionsModalProps> = ({
  isOpen,
  onClose,
  choices,
  onChoice,
  theme = 'night',
  isMobileLayout
}) => {
  if (!isOpen) return null;

  const isDark = theme !== 'day';
  const isMobile = isMobileLayout ?? false;

  const handleSelect = (choice: Choice) => {
    onChoice(choice.text);
    if (choice.action) choice.action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full ${isMobile ? 'max-w-[min(96vw,960px)]' : 'max-w-md'} rounded-2xl overflow-hidden`}
        style={{
          background: isDark
            ? 'linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98))'
            : 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95))',
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)'
            : '0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
        >
          <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
            选项
          </h2>
          <ModalCloseX variant="inline" onClose={onClose} />
        </div>

        {/* 选项列表 */}
        <div className="p-4 max-h-80 overflow-y-auto">
          {choices.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-slate-400'}`}>
              暂无可用选项
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {choices.map((choice, idx) => (
                <button
                  key={choice.id || idx}
                  type="button"
                  onClick={() => handleSelect(choice)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-150 ${
                    isDark
                      ? 'bg-white/5 hover:bg-emerald-500/20 text-white/90 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40'
                      : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300'
                  }`}
                  style={{
                    boxShadow: isDark
                      ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.8)',
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isDark ? 'bg-emerald-500/30 text-emerald-300' : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="flex-1">{choice.text}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
