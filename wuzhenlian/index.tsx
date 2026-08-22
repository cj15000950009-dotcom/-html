import './tavernGlobalShim';
import { applyTavernHelperGlobalShim, waitForTavernChatApis } from './tavernGlobalShim';
import { isTavernHelperFnAvailable, tavernWaitGlobalInitialized } from './tavernRuntime';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

function onReady(fn: () => void) {
  // SillyTavern/Tavern Helper 环境：优先用 jQuery 的 ready（符合酒馆加载规范）
  if (typeof $ !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jq = $ as any;
      if (typeof jq === 'function') {
        jq(fn);
        return;
      }
    } catch {
      // fallthrough
    }
  }
  // 独立网页环境：无 jQuery 时兜底
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fn();
    return;
  }
  window.addEventListener('load', fn, { once: true });
}

// 等待 MVU 初始化后再挂载应用（符合酒馆卡运行规范）
onReady(() => {
  applyTavernHelperGlobalShim();
  void (async () => {
  console.log('🚀 开始初始化武侦连界面...');

  applyTavernHelperGlobalShim();
  const chatApiReady = await waitForTavernChatApis(12000);
  if (!chatApiReady) {
    console.warn('⚠️ 超时内未检测到 getChatMessages/getLastMessageId，界面仍将挂载；请确认酒馆助手已启用且脚本使用 import 加载武侦连前端加载器');
  }

  // 等待 MVU 全局变量初始化（带超时处理，避免无限等待）
  if (isTavernHelperFnAvailable('waitGlobalInitialized')) {
    try {
      console.log('⏳ 等待 MVU 初始化...');
      // 设置 3 秒超时，如果 MVU 未初始化则继续执行
      await Promise.race([
        tavernWaitGlobalInitialized('Mvu'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MVU 初始化超时')), 3000),
        ),
      ]);
      console.log('✅ MVU 初始化完成');
    } catch (error) {
      console.warn('⚠️ MVU 初始化失败或超时，继续加载界面:', error);
      // 即使 MVU 未初始化也继续加载界面
    }
  } else {
    console.warn('⚠️ waitGlobalInitialized 不可用，跳过 MVU 初始化');
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('❌ 找不到 root 元素');
    // 尝试创建 root 元素
    const body = document.body;
    if (body) {
      const newRoot = document.createElement('div');
      newRoot.id = 'root';
      body.appendChild(newRoot);
      console.log('✅ 已创建 root 元素');
      mountApp(newRoot);
    }
    return;
  }

  mountApp(rootElement);
  })();
});

function mountApp(rootElement: HTMLElement) {
  try {
    console.log('📦 开始挂载 React 应用...');
    console.log('📊 root 元素:', rootElement);
    console.log('📊 root 元素样式:', window.getComputedStyle(rootElement));

    /** 嵌在酒馆消息 iframe / 正则 iframe 内时：不要用 min-width:600 + 固定比例，否则父栏很窄会出现巨宽横向滚动条、看起来像「只有一条」 */
    let embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch {
      embedded = true;
    }
    if (embedded) {
      document.documentElement.classList.add('th-embedded');
      document.body.classList.add('th-embedded');
    } else {
      try {
        if (window.self === window.top) {
          document.documentElement.classList.add('th-luotianhu-top');
          document.body.classList.add('th-luotianhu-top');
        }
      } catch {
        /* ignore */
      }
    }

    rootElement.style.width = '100%';
    rootElement.style.boxSizing = 'border-box';
    if (embedded) {
      rootElement.style.height = '100%';
      rootElement.style.minWidth = '0';
      rootElement.style.maxWidth = '100%';
      rootElement.style.aspectRatio = 'auto';
      rootElement.style.minHeight = '100vh';
    } else {
      // 顶层窗口（罗天虎加载器 $.load 替换 body、或直接打开 dist）：必须铺满视口，否则 16:9 + height:100% 在 body 无高度时会压成一条，对话框/时间卡/轮盘像在「视口外」
      try {
        if (window.self === window.top) {
          document.documentElement.style.minHeight = '100vh';
          document.documentElement.style.height = '100%';
          document.body.style.minHeight = '100vh';
          document.body.style.height = '100vh';
          document.body.style.margin = '0';
          rootElement.style.minHeight = '100vh';
          rootElement.style.height = '100vh';
          rootElement.style.minWidth = '0';
          rootElement.style.maxWidth = '100%';
          rootElement.style.aspectRatio = 'auto';
          rootElement.style.position = 'relative';
          rootElement.style.overflow = 'hidden';
        } else {
          const minW = Math.min(600, document.documentElement.clientWidth || 600);
          rootElement.style.height = '100%';
          rootElement.style.minWidth = `${minW}px`;
          rootElement.style.minHeight = '400px';
          rootElement.style.aspectRatio = '16 / 9';
        }
      } catch {
        rootElement.style.height = '100%';
        rootElement.style.minHeight = '100vh';
        rootElement.style.aspectRatio = 'auto';
      }
    }
    
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log('✅ React 应用已挂载');
    
    // 延迟检查应用是否正常渲染（仅用于调试）
    setTimeout(() => {
      const appElement = document.querySelector('[class*="bg-slate"], [class*="w-full"], [class*="h-screen"]');
      if (!appElement) {
        console.warn('⚠️ 未找到应用元素，可能样式未加载或组件未渲染');
        // 检查是否有 React 错误边界捕获的错误
        const errorBoundary = document.querySelector('[data-react-error-boundary]');
        if (errorBoundary) {
          console.error('❌ React 错误边界捕获到错误');
        }
      } else {
        console.log('✅ 应用元素已找到，样式正常加载');
      }
    }, 2000);
  } catch (error) {
    console.error('❌ React 应用挂载失败:', error);
    // 显示错误信息
    rootElement.innerHTML = `
      <div style="padding: 20px; color: white; background: #1e293b; border-radius: 8px; margin: 20px;">
        <h2 style="color: #ef4444;">❌ 应用加载失败</h2>
        <p>错误信息: ${error instanceof Error ? error.message : String(error)}</p>
        <p style="margin-top: 10px; font-size: 12px; color: #94a3b8;">请检查浏览器控制台获取更多信息</p>
      </div>
    `;
  }
}