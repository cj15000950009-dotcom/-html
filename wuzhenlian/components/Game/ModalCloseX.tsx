import React from 'react';

type ModalCloseXProps = {
  onClose: () => void;
  /** corner：贴在面板右上角；inline：用于标题栏 flex 内 */
  variant?: 'corner' | 'inline';
};

const baseClass =
  'z-[220] flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-red-600 bg-red-600 text-lg font-black leading-none text-white shadow-lg transition hover:bg-red-500 hover:border-red-500';

export const ModalCloseX: React.FC<ModalCloseXProps> = ({ onClose, variant = 'corner' }) => (
  <button
    type="button"
    aria-label="关闭"
    onClick={e => {
      e.stopPropagation();
      onClose();
    }}
    className={variant === 'corner' ? `${baseClass} absolute top-3 right-3` : baseClass}
  >
    ×
  </button>
);
