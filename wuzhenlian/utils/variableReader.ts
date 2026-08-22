import { Schema } from '../schema';

/**
 * 从 MVU 变量框架读取游戏数据
 * 符合酒馆卡运行规范
 */

declare function getVariables(option: { type: 'message'; message_id: number | 'latest' }): Record<string, any>;
declare function waitGlobalInitialized<T>(global: 'Mvu' | string): Promise<T>;
declare function getCurrentMessageId(): number;

declare const Mvu: {
  getMvuData: (options: { type: 'message' | 'chat' | 'character' | 'global'; message_id?: number | 'latest' }) => {
    stat_data: Record<string, any>;
    display_data: Record<string, any>;
    delta_data: Record<string, any>;
  };
};

// MVU 初始化状态
let mvuInitialized: boolean = false;
let mvuInitPromise: Promise<void> | null = null;

/**
 * 确保 MVU 已初始化
 */
async function ensureMvuInitialized(): Promise<void> {
  if (mvuInitialized) {
    return;
  }

  if (mvuInitPromise) {
    return mvuInitPromise;
  }

  mvuInitPromise = (async () => {
    try {
      if (typeof waitGlobalInitialized !== 'undefined') {
        await Promise.race([
          waitGlobalInitialized('Mvu'),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('MVU 初始化超时')), 5000)),
        ]);
      }
      mvuInitialized = true;
      console.log('✅ MVU 初始化完成');
    } catch (error) {
      console.warn('⚠️ 等待 MVU 初始化失败或超时，继续使用空数据:', error);
      mvuInitialized = true;
    }
  })();

  return mvuInitPromise;
}

/**
 * 检查 stat_data 是否有实际内容（不是空对象）
 */
function hasStatDataContent(stat_data: any): boolean {
  if (!stat_data || typeof stat_data !== 'object') {
    return false;
  }
  return Object.keys(stat_data).length > 0;
}

/**
 * 从最新消息楼层读取 MVU 数据
 * 读取优先级：
 * 1. 最新楼层的 MVU 数据（通过 Mvu.getMvuData）
 * 2. 最新楼层的变量数据（通过 getVariables）
 * 3. 0层的 MVU 数据（作为初始化数据）
 */
async function getGameMvuData(): Promise<{ stat_data: Record<string, any>; display_data?: Record<string, any> }> {
  // 确保 MVU 已初始化
  await ensureMvuInitialized();

  // 获取当前消息楼层 ID
  let messageId: number | 'latest' = 'latest';
  try {
    if (typeof getCurrentMessageId !== 'undefined') {
      messageId = getCurrentMessageId();
    }
  } catch (err) {
    console.warn('⚠️ 无法获取当前消息楼层 ID，使用 latest', err);
  }

  // 优先尝试从 MVU 读取
  try {
    if (typeof Mvu !== 'undefined' && Mvu.getMvuData) {
      const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });
      if (mvuData && mvuData.stat_data && hasStatDataContent(mvuData.stat_data)) {
        console.log(`✅ [variableReader] 从消息楼层 ${messageId} 读取 MVU 数据成功`);
        return mvuData;
      }
    }
  } catch (err) {
    console.warn(`⚠️ [variableReader] 从消息楼层 ${messageId} 读取 MVU 数据失败:`, err);
  }

  // 退化：使用 getVariables 读取
  try {
    if (typeof getVariables !== 'undefined') {
      const variables = getVariables({ type: 'message', message_id: messageId });
      if (variables && variables.stat_data && hasStatDataContent(variables.stat_data)) {
        console.log(`✅ [variableReader] 从消息楼层 ${messageId} 读取变量数据（通过 getVariables）`);
        return {
          stat_data: variables.stat_data || {},
          display_data: variables?.display_data,
        };
      }
    }
  } catch (err) {
    console.warn(`⚠️ 无法获取消息楼层 ${messageId} 变量，尝试读取0层`, err);
  }

  // 如果最新楼层没有数据，尝试读取0层（用于初始化数据）
  try {
    if (typeof Mvu !== 'undefined' && Mvu.getMvuData) {
      const mvuData = Mvu.getMvuData({ type: 'message', message_id: 0 });
      if (mvuData && mvuData.stat_data && hasStatDataContent(mvuData.stat_data)) {
        console.log('✅ [variableReader] 从0层读取 MVU 数据（最新楼层无数据）');
        return mvuData;
      }
    }
  } catch (err) {
    console.warn('⚠️ Mvu.getMvuData(0) 失败', err);
  }

  try {
    if (typeof getVariables !== 'undefined') {
      const variables = getVariables({ type: 'message', message_id: 0 });
      if (variables && variables.stat_data && hasStatDataContent(variables.stat_data)) {
        console.log('✅ [variableReader] 从0层读取变量数据（通过 getVariables）');
        return {
          stat_data: variables.stat_data || {},
          display_data: variables?.display_data,
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ 无法获取0层变量，返回空对象', err);
  }

  console.warn('⚠️ 无法获取任何楼层的数据，返回空对象');
  return { stat_data: {} };
}

/**
 * 从最新消息楼层读取游戏数据（用于界面展示）
 */
export async function readGameData(): Promise<Schema> {
  const m = await getGameMvuData();
  const stat = m?.stat_data || {};

  console.log('🔍 [variableReader] stat_data 内容:', stat);

  try {
    // 使用 Schema 解析数据，如果数据不完整则使用默认值
    const parsed = Schema.parse(stat);
    console.log('✅ [variableReader] 解析结果:', parsed);
    return parsed;
  } catch (error) {
    console.warn('⚠️ [variableReader] Schema 解析失败，使用默认值:', error);
    // 返回默认的空结构
    return Schema.parse({});
  }
}
