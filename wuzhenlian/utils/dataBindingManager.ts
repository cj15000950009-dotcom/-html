/**
 * 数据绑定管理器：按领域分发 MVU 更新，避免在单一 effect 中写满所有同步逻辑。
 * 借鉴「数据键 → 更新函数」映射，MVU 变化时只通知对应 key，由注册的 updater 负责刷新 UI。
 */

export type BindingKey = '世界状态' | '角色' | '背景' | 'CG';

type Updater = (payload: unknown) => void;

const bindings = new Map<BindingKey, Set<Updater>>();

/**
 * 注册某个领域的数据更新回调；返回取消注册函数。
 */
export function bindData(key: BindingKey, updater: Updater): () => void {
  if (!bindings.has(key)) bindings.set(key, new Set());
  bindings.get(key)!.add(updater);
  return () => {
    bindings.get(key)?.delete(updater);
  };
}

/**
 * 通知某领域数据已更新，会执行该 key 下所有已注册的 updater。
 */
export function notifyDataChanged(key: BindingKey, payload?: unknown): void {
  bindings.get(key)?.forEach((fn) => fn(payload));
}
