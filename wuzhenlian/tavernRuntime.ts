/**
 * 酒馆助手 API 在 ES module 中的可见性：
 * `globalThis.getChatMessages = fn` 不会为裸标识符 `getChatMessages` 建立词法绑定，
 * `typeof getChatMessages` 在模块里仍可能一直是 `'undefined'`。
 * 因此所有「是否可用」判断与调用必须通过 globalThis / TavernHelper 显式解析。
 *
 * @see @types/function/index.d.ts `Window.TavernHelper`
 */

/** 与前端实际用到的酒馆助手 API 对齐（函数） */
const TAVERN_HELPER_GLOBAL_KEYS = [
  'getChatMessages',
  'getLastMessageId',
  'createChatMessages',
  'getVariables',
  'generate',
  'generateRaw',
  'waitGlobalInitialized',
  'triggerSlash',
  'eventOn',
  'getWorldbookNames',
  'getWorldbook',
  'getCharWorldbookNames',
  'updateWorldbookWith',
  'updateVariablesWith',
  'getCurrentMessageId',
  'getScriptId',
] as const;

/** 从 TavernHelper 复制到 globalThis 的对象型全局（ES module 无法靠垫片获得「裸名」绑定，由 webpack ProvidePlugin 注入调用） */
const TAVERN_HELPER_OBJECT_KEYS = ['tavern_events'] as const;

function resolveTavernHelper(): Record<string, unknown> | null {
  const pick = (obj: unknown): Record<string, unknown> | null => {
    const th = (obj as Record<string, unknown> | null | undefined)?.TavernHelper;
    if (th && typeof th === 'object') return th as Record<string, unknown>;
    return null;
  };
  const g = pick(globalThis);
  if (g) return g;
  try {
    if (typeof window !== 'undefined') {
      const w = window as Window & { parent?: Window; top?: Window };
      const a = pick(w);
      if (a) return a;
      if (w.parent && w.parent !== w) {
        const b = pick(w.parent);
        if (b) return b;
      }
      if (w.top && w.top !== w) {
        const c = pick(w.top);
        if (c) return c;
      }
    }
  } catch {
    /* cross-origin parent/top */
  }
  return null;
}

export function applyTavernHelperGlobalShim(): void {
  try {
    const w = globalThis as unknown as Record<string, unknown>;
    if (typeof w.getChatMessages === 'function' && typeof w.getLastMessageId === 'function') return;
    const th = resolveTavernHelper();
    if (!th) return;

    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;

    for (const key of TAVERN_HELPER_GLOBAL_KEYS) {
      const v = th[key];
      if (typeof v !== 'function') continue;
      if (typeof w[key] === 'function') continue;
      const bound = (v as (...args: unknown[]) => unknown).bind(th);
      w[key] = bound;
      if (win && typeof win[key] !== 'function') {
        win[key] = bound;
      }
    }

    for (const key of TAVERN_HELPER_OBJECT_KEYS) {
      if (w[key] != null) continue;
      const v = th[key];
      if (v == null || typeof v !== 'object') continue;
      w[key] = v;
      if (win && win[key] == null) {
        win[key] = v;
      }
    }
  } catch (e) {
    console.warn('[武侦连] TavernHelper 全局垫片失败:', e);
  }
}

/** 供 webpack ProvidePlugin 生成的代理函数内部调用 */
export function resolveTavernHelperValue(key: string): unknown {
  applyTavernHelperGlobalShim();
  const w = globalThis as Record<string, unknown>;
  if (w[key] !== undefined && w[key] !== null) return w[key];
  const th = resolveTavernHelper();
  return th?.[key];
}

export function createTavernFunctionProxy(key: string): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const fn = getThFn(key);
    if (typeof fn !== 'function') {
      throw new ReferenceError(`[武侦连] 酒馆助手未提供 API: ${key}（请确认酒馆助手已启用，且界面由加载器 $.load 注入主页面）`);
    }
    const host = (globalThis as unknown as { TavernHelper?: object }).TavernHelper ?? globalThis;
    return fn.apply(host as object, args);
  };
}

/** 任意助手函数是否可用（勿用裸 typeof getChatMessages） */
export function isTavernHelperFnAvailable(key: string): boolean {
  return typeof getThFn(key) === 'function';
}

function getThFn(key: string): ((...args: unknown[]) => unknown) | undefined {
  applyTavernHelperGlobalShim();
  const g = globalThis as unknown as Record<string, unknown>;
  const direct = g[key];
  if (typeof direct === 'function') return direct as (...args: unknown[]) => unknown;
  const th = resolveTavernHelper();
  const v = th?.[key];
  return typeof v === 'function' ? (v as (...args: unknown[]) => unknown) : undefined;
}

/** 是否能在 globalThis / TavernHelper 上解析到聊天 API（勿用裸 `typeof getChatMessages`） */
export function isTavernChatApiAvailable(): boolean {
  return typeof getThFn('getChatMessages') === 'function' && typeof getThFn('getLastMessageId') === 'function';
}

export function tavernGetLastMessageId(): number | undefined {
  const fn = getThFn('getLastMessageId') as (() => number) | undefined;
  if (!fn) return undefined;
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** 与 @types/function/chat_message.d.ts 一致 */
export function tavernGetChatMessages(
  range: string | number,
  option?: { role?: 'all' | 'system' | 'assistant' | 'user'; include_swipes?: boolean },
): ReturnType<typeof getChatMessages> {
  const fn = getThFn('getChatMessages') as typeof getChatMessages | undefined;
  if (!fn) throw new Error('getChatMessages unavailable');
  const host = (globalThis as unknown as { TavernHelper?: object }).TavernHelper ?? globalThis;
  return fn.call(host as object, range, option) as ReturnType<typeof getChatMessages>;
}

/** 读取聊天楼层：失败或异常范围时返回空数组，避免整段解析中断 */
export function tavernGetChatMessagesSafe(
  range: string | number,
  option?: { role?: 'all' | 'system' | 'assistant' | 'user'; include_swipes?: boolean },
): Array<{ message?: string; swipes?: string[]; swipe_id?: number; message_id: number; role?: string }> {
  try {
    const fn = getThFn('getChatMessages') as typeof getChatMessages | undefined;
    if (!fn) return [];
    const host = (globalThis as unknown as { TavernHelper?: object }).TavernHelper ?? globalThis;
    const list = fn.call(host as object, range, option) as unknown[];
    return Array.isArray(list) ? (list as any[]) : [];
  } catch (e) {
    console.warn('[武侦连] getChatMessages 异常，已忽略:', range, option, e);
    return [];
  }
}

export function getTavernCreateChatMessagesFn(): typeof createChatMessages | undefined {
  const fn = getThFn('createChatMessages') as typeof createChatMessages | undefined;
  return typeof fn === 'function' ? fn : undefined;
}

export async function tavernCreateChatMessages(
  ...args: Parameters<typeof createChatMessages>
): Promise<Awaited<ReturnType<typeof createChatMessages>>> {
  const fn = getTavernCreateChatMessagesFn();
  if (!fn) throw new Error('createChatMessages unavailable');
  const host = (globalThis as unknown as { TavernHelper?: object }).TavernHelper ?? globalThis;
  return fn.apply(host as object, args) as Promise<Awaited<ReturnType<typeof createChatMessages>>>;
}

export async function waitForTavernChatApis(maxMs = 10000, step = 150): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    applyTavernHelperGlobalShim();
    if (isTavernChatApiAvailable()) return true;
    await new Promise(r => setTimeout(r, step));
  }
  applyTavernHelperGlobalShim();
  return isTavernChatApiAvailable();
}

export function isTavernWorldbookApiAvailable(): boolean {
  return isTavernHelperFnAvailable('getWorldbookNames') && isTavernHelperFnAvailable('getWorldbook');
}

export function isTavernEventApiAvailable(): boolean {
  const ev = resolveTavernHelperValue('tavern_events');
  return isTavernHelperFnAvailable('eventOn') && ev != null && typeof ev === 'object';
}

/** 安全获取当前消息楼层 ID，API 不可用时返回 undefined */
export function tavernGetCurrentMessageId(): number | undefined {
  const fn = getThFn('getCurrentMessageId') as (() => number) | undefined;
  if (!fn) return undefined;
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const NOOP_UNSUB = { stop: () => {} };

/** 安全订阅事件，API 不可用时返回 no-op 取消函数 */
export function tavernEventOn(
  event: string,
  handler: (...args: unknown[]) => void,
): { stop: () => void } {
  const fn = getThFn('eventOn') as ((e: string, h: (...args: unknown[]) => void) => { stop?: () => void }) | undefined;
  if (!fn) return NOOP_UNSUB;
  try {
    const ret = fn(event, handler);
    return ret && typeof ret.stop === 'function' ? ret : NOOP_UNSUB;
  } catch {
    return NOOP_UNSUB;
  }
}

/** 安全获取变量，API 不可用时返回空对象 */
export function tavernGetVariables(option: {
  type: 'message' | 'chat' | 'global' | 'character' | 'script';
  message_id?: number | 'latest';
  script_id?: string;
}): Record<string, unknown> {
  const fn = getThFn('getVariables') as ((opt: typeof option) => Record<string, unknown>) | undefined;
  if (!fn) return {};
  try {
    const ret = fn(option);
    return ret && typeof ret === 'object' ? ret : {};
  } catch {
    return {};
  }
}

/** 安全等待全局初始化，API 不可用时立即 resolve */
export function tavernWaitGlobalInitialized(name: string): Promise<unknown> {
  const fn = getThFn('waitGlobalInitialized') as ((n: string) => Promise<unknown>) | undefined;
  if (!fn) return Promise.resolve();
  try {
    return fn(name);
  } catch {
    return Promise.resolve();
  }
}
