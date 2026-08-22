/**
 * 仅供 webpack ProvidePlugin 使用：把「酒馆助手全局 API」注入到各 TS 模块的裸标识符上，
 * 避免 ES module 词法作用域下 `typeof getChatMessages === 'undefined'` 恒为真。
 * eventOn、waitGlobalInitialized、getCurrentMessageId 使用安全封装，API 不可用时不会抛错。
 */
import {
  createTavernFunctionProxy,
  resolveTavernHelperValue,
  tavernEventOn,
  tavernGetCurrentMessageId,
  tavernGetVariables,
  tavernWaitGlobalInitialized,
} from './tavernRuntime';

export const getChatMessages = createTavernFunctionProxy('getChatMessages');
export const getLastMessageId = createTavernFunctionProxy('getLastMessageId');
export const createChatMessages = createTavernFunctionProxy('createChatMessages');
/** 安全封装：API 不可用时立即 resolve，不抛错 */
export const waitGlobalInitialized = (name: string) => tavernWaitGlobalInitialized(name);
export const generate = createTavernFunctionProxy('generate');
export const generateRaw = createTavernFunctionProxy('generateRaw');
export const triggerSlash = createTavernFunctionProxy('triggerSlash');
/** 安全封装：API 不可用时返回空对象，不抛错 */
export const getVariables = tavernGetVariables;
/** 安全封装：API 不可用时返回 no-op 取消函数，不抛错 */
export const eventOn = tavernEventOn;
export const getWorldbookNames = createTavernFunctionProxy('getWorldbookNames');
export const getWorldbook = createTavernFunctionProxy('getWorldbook');
export const getCharWorldbookNames = createTavernFunctionProxy('getCharWorldbookNames');
export const updateWorldbookWith = createTavernFunctionProxy('updateWorldbookWith');
export const updateVariablesWith = createTavernFunctionProxy('updateVariablesWith');
/** 安全封装：API 不可用时返回 undefined，不抛错 */
export const getCurrentMessageId = tavernGetCurrentMessageId;
export const getScriptId = createTavernFunctionProxy('getScriptId');

/** 延迟解析：与宿主注入时机对齐 */
export const tavern_events = new Proxy({} as Record<string | symbol, unknown>, {
  get(_, prop) {
    const ev = resolveTavernHelperValue('tavern_events') as Record<string | symbol, unknown> | null | undefined;
    if (ev == null) return undefined;
    return ev[prop as string];
  },
  has(_, prop) {
    const ev = resolveTavernHelperValue('tavern_events') as Record<string, unknown> | null | undefined;
    return ev != null && prop in ev;
  },
}) as any;
