/**
 * 尽早把 TavernHelper 上的方法挂到 globalThis（部分环境仍依赖 window 上的裸全局）。
 * 武侦连前端主包为 ES module，裸名 `getChatMessages` 等由 webpack ProvidePlugin 从 `tavernGlobalProvide.ts` 注入。
 */
import { applyTavernHelperGlobalShim, waitForTavernChatApis, isTavernChatApiAvailable } from './tavernRuntime';

applyTavernHelperGlobalShim();

export { applyTavernHelperGlobalShim, waitForTavernChatApis, isTavernChatApiAvailable };
