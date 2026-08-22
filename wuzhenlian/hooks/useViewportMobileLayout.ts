import { useSyncExternalStore } from 'react';

/** 与 galgame 数据库界面插件一致的窄屏判定：宽度或视口高度较小时按手机布局处理 */
export const VIEWPORT_MOBILE_MEDIA_QUERY = '(max-width: 768px), (max-height: 736px)';

function subscribeMobileLayout(callback: () => void) {
  const mq = window.matchMedia(VIEWPORT_MOBILE_MEDIA_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getMobileLayoutSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(VIEWPORT_MOBILE_MEDIA_QUERY).matches;
}

/** 视口是否为「手机/窄屏」：用于自动启用横屏 16:9 主舞台与触控优化等 */
export function useViewportMobileLayout(): boolean {
  return useSyncExternalStore(subscribeMobileLayout, getMobileLayoutSnapshot, () => false);
}
