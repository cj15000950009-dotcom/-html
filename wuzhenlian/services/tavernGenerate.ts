/**
 * 武侦连前端通过酒馆助手的 generate 与酒馆交互。
 * 接口定义见根目录 @types/function/generate.d.ts。
 * 入口 `tavernGlobalShim` 会把 `TavernHelper.generate` 同步到 `globalThis.generate`（主页面 $.load 注入时与「裸全局」行为对齐）。
 */

/** 检测是否可用 generate（优先裸全局，垫片会写入 globalThis） */
export function hasGenerate(): boolean {
  return typeof (typeof globalThis !== 'undefined' ? (globalThis as any).generate : undefined) === 'function';
}

/** 将酒馆/API 返回的错误转为用户可读提示 */
function toUserFacingError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes('forbidden') || lower.includes('403')) {
    return new Error('酒馆 API 返回 403。请检查连接与 API 密钥。');
  }
  if (lower.includes('timeout') || lower.includes('gateway') || lower.includes('504')) {
    return new Error('请求超时。请检查网络。');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return new Error('与酒馆连接失败。请确认本界面在酒馆「消息楼层」中加载。');
  }
  return new Error(`酒馆生成失败：${msg}`);
}

/**
 * 使用酒馆 generate 发送用户输入并获取 AI 回复。
 * 用户消息和 AI 回复会写入酒馆聊天，loadFromLatestMessage 可正确解析。
 */
export async function generateResponse(userInput: string): Promise<string> {
  const gen = typeof globalThis !== 'undefined' ? (globalThis as any).generate : undefined;
  if (typeof gen !== 'function') {
    throw new Error('请在酒馆消息楼层中加载本界面，以使用酒馆的生成功能。');
  }
  try {
    const result = await gen({
      user_input: userInput,
      max_chat_history: 'all',
    });
    return typeof result === 'string' ? result : '';
  } catch (e) {
    throw toUserFacingError(e);
  }
}
