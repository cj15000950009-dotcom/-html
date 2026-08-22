import type { GlobalSettings } from './types';

/** 阅读设定中三处字体下拉的共用选项（value 为 CSS font-family 首段） */
export const FONT_FAMILY_SELECT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '"Noto Sans SC"', label: '系统默认黑体' },
  { value: '"Chakra Petch"', label: '战术等宽体' },
  { value: '"KaiTi","STKaiti","楷体","Noto Serif SC","Source Han Serif SC",serif', label: '楷体 / 正文' },
  { value: '"SimSun","Songti SC","STSong","Noto Serif SC",serif', label: '宋体 / 古籍' },
  { value: '"HanYiShangWeiShouShuW"', label: '汉仪尚巍手书（标题风）' },
];

export function dialogueFontOf(s: GlobalSettings): string {
  return s.dialogueFontFamily ?? s.fontFamily ?? '"Noto Sans SC", sans-serif';
}

export function nameBoxFontOf(s: GlobalSettings): string {
  return s.nameBoxFontFamily ?? s.fontFamily ?? '"Noto Sans SC", sans-serif';
}

export function uiFontOf(s: GlobalSettings): string {
  return s.uiFontFamily ?? s.fontFamily ?? '"Noto Sans SC", sans-serif';
}

/**
 * 侧栏等装饰字：未设置 uiFontFamily 时，水墨主题仍用汉仪；否则与用户「整体界面字体」一致。
 */
export function navChromeFontOf(s: GlobalSettings, theme: string): string {
  if (s.uiFontFamily) return s.uiFontFamily;
  return theme === 'ink-jianghu' ? '"HanYiShangWeiShouShuW"' : (s.fontFamily ?? '"Noto Sans SC", sans-serif');
}
