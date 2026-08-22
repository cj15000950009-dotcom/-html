import { useCallback, useEffect, useState } from 'react';
import { Schema } from '../schema';
import { readGameData } from '../utils/variableReader';

declare function getCurrentMessageId(): number;
declare function updateVariablesWith(
  updater: (variables: Record<string, any>) => Record<string, any> | Promise<Record<string, any>>,
  option: { type: 'message'; message_id: number | 'latest' },
): Record<string, any> | Promise<Record<string, any>>;
declare const tavern_events: {
  MESSAGE_UPDATED: string;
  MESSAGE_RECEIVED: string;
};
type EventOnReturn = {
  stop: () => void;
};
declare function eventOn(event: string, handler: (message_id: number) => void): EventOnReturn;

/**
 * React Hook 用于管理 MVU 变量数据
 * 符合酒馆卡运行规范
 */
export function useMvuData() {
  const [data, setData] = useState<Schema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 刷新数据
  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const gameData = await readGameData();
      setData(gameData);
      setError(null);
    } catch (err) {
      console.error('❌ [useMvuData] 读取数据失败:', err);
      setError(err instanceof Error ? err : new Error('未知错误'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 更新数据
  const updateData = useCallback(
    async (updater: (current: Schema) => Partial<Schema>) => {
      try {
        let messageId: number | 'latest' = 'latest';
        try {
          if (typeof getCurrentMessageId !== 'undefined') {
            messageId = getCurrentMessageId();
          }
        } catch (err) {
          console.warn('⚠️ 无法获取当前消息楼层 ID，使用 latest', err);
        }

        if (typeof updateVariablesWith !== 'undefined') {
          await updateVariablesWith(
            variables => {
              const currentData = data || Schema.parse({});
              const updates = updater(currentData);
              const newData = { ...currentData, ...updates };
              const parsed = Schema.parse(newData);

              // 确保 stat_data 存在
              if (!variables.stat_data) {
                variables.stat_data = {};
              }

              // 更新 stat_data
              Object.assign(variables.stat_data, parsed);

              return variables;
            },
            { type: 'message', message_id: messageId },
          );

          // 刷新数据
          await refreshData();
        }
      } catch (err) {
        console.error('❌ [useMvuData] 更新数据失败:', err);
        setError(err instanceof Error ? err : new Error('更新失败'));
      }
    },
    [data, refreshData],
  );

  // 初始化时加载数据
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 监听消息更新事件
  useEffect(() => {
    if (typeof eventOn === 'undefined' || typeof tavern_events === 'undefined') {
      console.warn('⚠️ 事件系统不可用，跳过事件监听');
      return;
    }

    let pendingRefreshTimer: number | null = null;

    // 监听消息更新事件
    const unsubscribeUpdated = eventOn(tavern_events.MESSAGE_UPDATED, (message_id: number) => {
      console.log('🔄 消息已更新，刷新游戏数据:', message_id);

      // 清除之前的延迟刷新定时器
      if (pendingRefreshTimer !== null) {
        clearTimeout(pendingRefreshTimer);
        pendingRefreshTimer = null;
      }

      // 延迟刷新，确保 replaceMvuData 完全完成且数据已写入
      pendingRefreshTimer = window.setTimeout(async () => {
        await refreshData();
      }, 300);
    });

    // 监听消息接收事件
    const unsubscribeReceived = eventOn(tavern_events.MESSAGE_RECEIVED, async (message_id: number) => {
      console.log('📨 收到新消息:', message_id);
      // 延迟刷新，等待 MESSAGE_UPDATED 事件
      setTimeout(() => {
        refreshData();
      }, 1000);
    });

    // 清理函数
    return () => {
      if (pendingRefreshTimer !== null) {
        clearTimeout(pendingRefreshTimer);
      }
      // eventOn 返回的是 { stop: () => void } 对象，需要调用 stop 方法
      if (unsubscribeUpdated && typeof unsubscribeUpdated.stop === 'function') {
        unsubscribeUpdated.stop();
      }
      if (unsubscribeReceived && typeof unsubscribeReceived.stop === 'function') {
        unsubscribeReceived.stop();
      }
    };
  }, [refreshData]);

  return {
    data,
    isLoading,
    error,
    refreshData,
    updateData,
  };
}
