
import { GoogleGenAI } from "@google/genai";
import { CHARACTERS, SILLY_TAVERN_WORLD_INFO } from "../constants";
import { CharacterId, GeminiMessage, ExternalApiConfig, WorldInfoEntry, Character } from "../types";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- RETRY LOGIC ---
async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const msg = (e.message || JSON.stringify(e)).toLowerCase();
      
      // Error classification
      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("limit");
      const isNetwork = msg.includes("xhr error") || msg.includes("rpc failed") || msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnreset");
      const isServer = msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("overloaded") || msg.includes("internal") || msg.includes("model_not_found");

      if (isQuota) {
        // Strict rate limit handling (e.g. 4 req/min) requires longer wait
        const delay = 15000 + (Math.random() * 5000); // Wait 15-20s
        console.warn(`[GeminiService] Rate limited (429). Retrying in ${Math.round(delay/1000)}s... Error:`, msg);
        await wait(delay);
        continue;
      }

      if (isNetwork || isServer) {
        // Exponential backoff for network/server errors
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`[GeminiService] Attempt ${i + 1} failed (${isNetwork ? 'Network' : 'Server'}). Retrying in ${delay}ms...`, msg);
        await wait(delay);
        continue;
      }
      
      throw e; // Rethrow non-retryable errors
    }
  }
  throw lastError;
}

// SDK Helper
const generateWithSDK = async (
    modelId: string, 
    systemInstruction: string, 
    history: GeminiMessage[], 
    userMessage: string,
    jsonMode: boolean = false,
    apiKey?: string
): Promise<string> => {
    // Always create a new instance to ensure the latest API key is used and to reset client state if needed
    const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
    
    const contents = history.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));
    
    // Only add user message if it's not empty (it might be empty for continuation)
    if (userMessage) {
        contents.push({ role: 'user', parts: [{ text: userMessage }] });
    }

    const config: any = {
        systemInstruction: systemInstruction,
    };
    
    if (jsonMode) {
        config.responseMimeType = "application/json";
    }

    // Wrap the generation call with retry logic
    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: contents,
            config: config
        });
        return response.text || "";
    });
}

const fetchOpenAICompatible = async (config: ExternalApiConfig, messages: any[], jsonMode: boolean = false): Promise<string> => {
  let endpoint = config.baseUrl.replace(/\/$/, '');
  if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.endsWith('/v1') ? `${endpoint}/chat/completions` : `${endpoint}/v1/chat/completions`;
  }
  const effectiveKey = config.apiKey || process.env.API_KEY || '';

  const body: any = {
    model: config.modelId,
    messages: messages,
    temperature: 0.7,
    max_tokens: 4000, 
    stream: false
  };

  if (jsonMode) {
      body.response_format = { type: "json_object" };
  }

  // Wrap the fetch call with retry logic
  return withRetry(async () => {
      try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${effectiveKey}`,
              ...JSON.parse(config.headers || '{}')
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`API Error ${response.status}: ${errorText}`);
          }
          const data = await response.json();
          return data.choices?.[0]?.message?.content || "";
      } catch (e: any) {
          console.error("API Call Failed:", e);
          throw e; 
      }
  });
};

export const testApiConnection = async (config: ExternalApiConfig): Promise<{ success: boolean; message: string }> => {
  try {
    if (config.provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: config.apiKey || process.env.API_KEY || '' });
        const response = await ai.models.generateContent({
            model: config.modelId,
            contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
        });
        return { success: true, message: "Gemini SDK Connected: " + (response.text ? "OK" : "No Output") };
    }
    const res = await fetchOpenAICompatible(config, [{ role: 'user', content: 'Ping' }]);
    return { success: true, message: `OK (Response len: ${res.length})` };
  } catch (e: any) { 
      return { success: false, message: e.message || "Unknown Connection Error" }; 
  }
};

export const fetchAvailableModels = async (config: ExternalApiConfig): Promise<string[]> => {
    if (config.provider === 'gemini') return ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    try {
        const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
            headers: { 'Authorization': `Bearer ${config.apiKey || process.env.API_KEY}` }
        });
        const data = await res.json();
        return data.data?.map((m: any) => m.id) || [];
    } catch { return []; }
};

export const generatePlotSuggestions = async (
    _legacyApiKey: string,
    history: GeminiMessage[],
    prompt: string,
    externalConfig?: ExternalApiConfig
): Promise<string[]> => {
    // ENHANCED PROMPT: Forcefully request strictly 6 options if user asks for it.
    const instruction = `
    [SYSTEM COMMAND]: Generate strictly 6 distinct plot choices based on the prompt below.
    Format: Plain text, one option per line. No numbering, no markdown bullets.
    
    User Prompt:
    ${prompt || `生成3-4个剧情选项 (Action/Dialog Options)。格式: 每行一个纯文本选项，无编号/Markdown。禁止脚本指令。`}
    `;
    
    try {
        let text = "";
        if (externalConfig?.provider === 'gemini') {
            // Use user-defined model or safer fallback
            const modelId = externalConfig.modelId || 'gemini-2.0-flash-exp'; 
            text = await generateWithSDK(modelId, instruction, history, "", false, externalConfig.apiKey);
        } else {
            const messages = [
                { role: 'system', content: instruction },
                ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
            ];
            text = await fetchOpenAICompatible(externalConfig!, messages);
        }
        return text.split('\n')
            .map(l => l.trim().replace(/^[\d\.\-\)\*]+\s*/, ''))
            .filter(l => l.length > 0 && !l.startsWith('<') && !l.startsWith('[') && !l.includes('gal_engine'));
    } catch(e) { return ["继续剧情", "加快进度"]; }
};

// -------------------------------------------------------------------------
// SillyTavern Logic Emulation
// -------------------------------------------------------------------------

// 宏替换工具：处理 {{user}} 和 {{char}}
const processMacros = (text: string, charName: string, userName: string = '玩家'): string => {
    if (!text) return '';
    let processed = text;
    // Standard macros
    processed = processed.replace(/{{user}}/gi, userName);
    processed = processed.replace(/{{char}}/gi, charName);
    // Common variants
    processed = processed.replace(/<user>/gi, userName);
    processed = processed.replace(/<char>/gi, charName);
    return processed;
};

// 扫描世界书条目并构建额外的 Prompt 上下文
const scanWorldInfo = (entries: WorldInfoEntry[], userMessage: string, historyText: string): string[] => {
    const triggeredContent: string[] = [];
    const combinedText = (historyText + '\n' + userMessage).toLowerCase();

    entries.forEach(entry => {
        if (!entry.enabled) return;

        let shouldTrigger = false;

        // 1. 常驻 (Constant) / 蓝灯
        if (entry.constant) {
            shouldTrigger = true;
        } 
        // 2. 关键词触发 (Key) / 绿灯
        else if (entry.keys.length > 0) {
            // 简单的关键词匹配 (OR logic by default for keys array)
            const hasMatch = entry.keys.some(key => {
                // 如果 key 是正则表达式字符串 (e.g. "/regex/")
                if (key.startsWith('/') && key.endsWith('/')) {
                    try {
                        const regex = new RegExp(key.slice(1, -1), 'i');
                        return regex.test(combinedText);
                    } catch { return false; }
                }
                return combinedText.includes(key.toLowerCase());
            });
            if (hasMatch) shouldTrigger = true;
        }

        if (shouldTrigger) {
            triggeredContent.push(entry.content);
        }
    });

    return triggeredContent;
};

export const generateCharacterResponse = async (
  _legacyApiKey: string, 
  history: GeminiMessage[],
  characterId: CharacterId,
  userMessage: string,
  externalConfig?: ExternalApiConfig,
  playerName: string = '玩家' // New Parameter
): Promise<string> => {
  const char = CHARACTERS[characterId];
  
  // 1. 准备基础 Prompt
  let systemInstruction = `
    当前角色: ${char.name} (${char.role})。
    用户角色: ${playerName} (User)。
  `;

  // 2. 扫描并注入世界书内容
  // OPTIMIZATION: Reduce history scan depth for world info to save processing time
  const recentHistoryText = history.slice(-3).map(m => m.text).join('\n');
  const worldInfoContent = scanWorldInfo(SILLY_TAVERN_WORLD_INFO, userMessage, recentHistoryText);
  const processedWorldInfo = worldInfoContent.map(content => processMacros(content, char.name, playerName));

  if (processedWorldInfo.length > 0) {
      systemInstruction += `\n\n### 附加指令与世界观 (World Info) ###\n${processedWorldInfo.join('\n\n')}`;
  }

  // 3. 强制性输出格式提示
  // Simplified instructions for robustness
  systemInstruction += `\n\n写作目标：详尽描写1500字。严守“五感摄像机”。默认输出必须包裹在 <gal_engine_v2> 标签。`;

  if (externalConfig?.provider === 'gemini') {
      return await generateWithSDK(externalConfig.modelId, systemInstruction, history, userMessage, false, externalConfig.apiKey);
  }

  const messages = [
      { role: 'system', content: systemInstruction },
      ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: userMessage }
  ];

  return await fetchOpenAICompatible(externalConfig!, messages);
};

// 新增：分析角色状态并更新档案
export type CharacterUpdate = {
    description?: string;
    psychological?: string;
    kinks?: string;
    stats?: {
        power?: number;
        trust?: number;
        sync?: number;
    };
};

export type CharacterUpdates = Record<string, CharacterUpdate>;

export const analyzeCharacterStatus = async (
    history: GeminiMessage[],
    activeCharacters: Character[],
    worldInfoEntries: WorldInfoEntry[],
    externalConfig: ExternalApiConfig,
    playerName: string
): Promise<CharacterUpdates> => {
    // Optimize: Less context
    const recentHistory = history.slice(-5).map(m => `${m.role === 'user' ? playerName : '剧情'}: ${m.text}`).join('\n');
    const worldInfoContext = scanWorldInfo(worldInfoEntries, "analysis", recentHistory).join('\n');

    const knownCharactersSummary = activeCharacters.map(c => {
        const base = `${c.id} / ${c.name}`;
        const desc = c.description || '';
        return desc ? `${base}：${desc}` : base;
    }).join('\n');

    const systemPrompt = `
你是武侦连锁务室的「人物档案分析模块」，需要根据世界书与最近剧情，为所有角色生成/更新档案 JSON。

### 参考世界观 (World Info)
${worldInfoContext.substring(0, 800)}...

### 已知角色一览
${knownCharactersSummary}

### 最近剧情 (Recent Log)
${recentHistory.substring(0, 2000)}

### 任务
1. 对于上方「已知角色一览」中的每个角色，生成或更新一份档案：
   - description: 人物概要，50-150 字。如该角色目前 description 为空或明显与剧情不符，请重新写一份。
   - psychological: 最新心理状态与对指挥官的情感/动机，50 字左右。
   - kinks: 机密/弱点/敏感点（如无重要信息可留空）。
   - stats: { power, trust, sync } 三个 0-100 数值，若不确定可保留原值或估计趋势。

2. 如果最近剧情中出现了重要但未在列表中的角色（例如新 NPC 或代号），可以为 TA 额外创建一条记录：
   - 以「稳定可复用的 ID 或称呼」作为 JSON 的 key，例如角色代号或姓名。
   - 同样填写 description / psychological / kinks / stats。

### 输出格式
- 只返回一个「扁平 JSON 对象」，形如：
  {
    "角色ID或名字": {
      "description": "……",
      "psychological": "……",
      "kinks": "……",
      "stats": { "power": 0-100, "trust": 0-100, "sync": 0-100 }
    },
    "另一个角色ID": { … }
  }
- 不要输出任何解释性文字，只输出合法 JSON。
    `;

    try {
        let jsonStr = "";
        if (externalConfig.provider === 'gemini') {
            const fastModelId = externalConfig.modelId || 'gemini-2.0-flash-exp';
            jsonStr = await generateWithSDK(fastModelId, systemPrompt, [], "Update Dossier", true, externalConfig.apiKey);
        } else {
            jsonStr = await fetchOpenAICompatible(
                externalConfig,
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: "生成/更新人物档案 JSON" }
                ],
                true
            );
        }
        
        const cleanedJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);
    } catch (e) {
        console.error("Dossier analysis failed:", e);
        return {};
    }
};
