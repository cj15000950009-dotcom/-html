
import React, { useState, useEffect, useRef } from 'react';
import { ExternalApiConfig } from '../../types';
import { testApiConnection, fetchAvailableModels } from '../../services/geminiService';
import { ModalCloseX } from './ModalCloseX';

interface ExternalLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
  initialConfig?: ExternalApiConfig;
  onSaveConfig?: (config: ExternalApiConfig) => void;
}

export const ExternalLinkModal: React.FC<ExternalLinkModalProps> = ({ 
  isOpen, onClose, theme = 'night', 
  initialConfig = { 
      provider: 'openai', 
      baseUrl: 'https://api.spw.cool/v1', 
      apiKey: '', 
      modelId: 'gemini-2.0-flash-exp',
      headers: '{}' 
  },
  onSaveConfig 
}) => {
  const [config, setConfig] = useState<ExternalApiConfig>(initialConfig);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string>('系统待命...');
  const [modelList, setModelList] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (isOpen) {
          const saved = localStorage.getItem('spirit_command_external_api');
          if (saved) {
              try { 
                  const parsed = JSON.parse(saved);
                  // Ensure we use the safe default if the loaded model is one of the broken ones
                  if (parsed.modelId === 'gemini-3-pro-preview' || parsed.modelId === 'gemini-3-flash-preview') {
                      parsed.modelId = 'gemini-2.0-flash-exp';
                  }
                  setConfig(parsed);
              } catch (e) {}
          }
          setModelList([]);
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const styles = {
      modalBg: 'bg-[#020617] border border-tactical-green/30 text-white font-sans',
      header: 'bg-black/60 border-b border-tactical-green/10',
      input: 'bg-black/40 border border-tactical-green/20 text-tactical-green font-mono focus:border-tactical-green focus:ring-0 focus:outline-none placeholder:text-white/10',
      label: 'text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2',
      accent: 'text-tactical-green',
      buttonPrimary: 'bg-tactical-green text-slate-950 font-black hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]',
      buttonSecondary: 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all'
  };

  const handleSave = () => {
      const sanitizedConfig = {
          ...config,
          baseUrl: config.baseUrl.replace(/\/$/, '')
      };
      localStorage.setItem('spirit_command_external_api', JSON.stringify(sanitizedConfig));
      if (onSaveConfig) onSaveConfig(sanitizedConfig);
      onClose();
  };

  const handleTestConnection = async () => {
      setTestStatus('testing');
      setLog(`正在建立通讯链路...\n目标协议: ${config.provider.toUpperCase()}\n模型指纹: ${config.modelId}`);
      
      const result = await testApiConnection(config);
      
      if (result.success) {
          setTestStatus('success');
          setLog(`[SUCCESS] 握手成功。响应回执: ${result.message}`);
          
          setLog(prev => prev + `\n[SYSTEM] 正在检索该端点支持的模型列表...`);
          const models = await fetchAvailableModels(config);
          if (models.length > 0) {
              setModelList(models);
              setLog(prev => prev + `\n[SYSTEM] 成功获取 ${models.length} 个可用模型。`);
          } else {
               setLog(prev => prev + `\n[SYSTEM] 端点未返回动态模型列表，将沿用手动输入的 ID。`);
          }
      } else {
          setTestStatus('error');
          setLog(`[FAILURE] 连接失败: ${result.message}`);
      }
  };

  const handleProviderChange = (newProvider: 'gemini' | 'openai' | 'custom') => {
      let newModel = config.modelId;
      if (newProvider === 'gemini') newModel = 'gemini-2.0-flash-exp';
      if (newProvider === 'openai') newModel = 'gpt-4o';
      
      let newBaseUrl = config.baseUrl;
      if (newProvider === 'openai') newBaseUrl = 'https://api.openai.com/v1';
      if (newProvider === 'gemini') newBaseUrl = 'https://generativelanguage.googleapis.com';
      if (newProvider === 'custom') newBaseUrl = 'https://api.spw.cool/v1';

      setConfig({ ...config, provider: newProvider, modelId: newModel, baseUrl: newBaseUrl });
      setModelList([]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`w-full max-w-2xl rounded-lg shadow-[0_20px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col border ${styles.modalBg} clip-tactical-box`} onClick={e => e.stopPropagation()}>
        
        {/* 头部标题 */}
        <div className={`h-16 flex justify-between items-center px-8 shrink-0 ${styles.header}`}>
             <h2 className={`font-black tracking-[0.4em] text-sm flex items-center gap-3 ${styles.accent} italic`}>
                 <span className="w-2 h-2 bg-tactical-green shadow-[0_0_8px_#10b981]"></span>
                 API 连接配置 // CORE LINKAGE
             </h2>
             <ModalCloseX variant="inline" onClose={onClose} />
        </div>

        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
            
            {/* 系统状态监控 */}
            <div className={`p-5 bg-black/60 border border-tactical-green/10 font-mono text-[11px] leading-relaxed h-36 overflow-y-auto whitespace-pre-wrap ${
                testStatus === 'error' ? 'text-red-400 border-red-500/20' : 
                testStatus === 'success' ? 'text-tactical-green border-tactical-green/20' : 
                'text-white/40'
            }`}>
                <span className="opacity-20 block border-b border-white/5 pb-1 mb-2 tracking-widest uppercase">/ SYSTEM_LOG /</span>
                {log}
            </div>

            {/* 补全来源 */}
            <div className="space-y-4">
                <label className={styles.label}>聊天补全来源 (HANDSHAKE PROVIDER)</label>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { id: 'gemini', label: 'GEMINI (官方)' },
                        { id: 'openai', label: 'OPENAI (官方)' },
                        { id: 'custom', label: '自定义 (兼容)' }
                    ].map(p => (
                        <button
                            key={p.id}
                            onClick={() => handleProviderChange(p.id as any)}
                            className={`py-4 px-4 border text-[11px] font-black tracking-widest uppercase transition-all ${
                                config.provider === p.id 
                                ? `border-tactical-green bg-tactical-green/10 text-tactical-green shadow-[0_0_15px_rgba(16,185,129,0.1)]` 
                                : 'border-white/5 bg-white/5 text-white/30 hover:text-white hover:border-white/20'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 配置字段 */}
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className={styles.label}>端点地址 (BASE URL)</label>
                    <input 
                        value={config.baseUrl}
                        onChange={e => setConfig({...config, baseUrl: e.target.value})}
                        className={`w-full px-6 py-4 text-xs ${styles.input}`}
                        placeholder="https://api.openai.com/v1"
                    />
                    <p className="text-[9px] text-white/20 pt-1 italic tracking-wider">系统在调用时会自动追加 /chat/completions 后缀</p>
                </div>

                <div className="space-y-2">
                    <label className={styles.label}>鉴权密钥 (API KEY)</label>
                    <input 
                        type="password"
                        value={config.apiKey}
                        onChange={e => setConfig({...config, apiKey: e.target.value})}
                        className={`w-full px-6 py-4 text-xs ${styles.input}`}
                        placeholder="sk-••••••••••••••••••••••••••••••••"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className={styles.label}>模型选择 (自动获取)</label>
                        <select 
                            onChange={e => e.target.value && setConfig({...config, modelId: e.target.value})}
                            className={`w-full px-4 py-4 text-xs ${styles.input} appearance-none cursor-pointer`}
                            value={config.modelId}
                        >
                            <option value="" disabled className="bg-[#020617]">
                                {modelList.length > 0 ? "--- 选定模型库 ---" : "--- 无可用模型 ---"}
                            </option>
                            {modelList.map(m => <option key={m} value={m} className="bg-[#020617]">{m}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className={styles.label}>模型 ID (手动输入)</label>
                        <input 
                            value={config.modelId}
                            onChange={e => setConfig({...config, modelId: e.target.value})}
                            className={`w-full px-6 py-4 text-xs ${styles.input}`}
                            placeholder="gpt-4o / gemini-2.0-flash-exp..."
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className={styles.label}>自定义请求头 (CUSTOM HEADERS - JSON)</label>
                    <textarea 
                        value={config.headers}
                        onChange={e => setConfig({...config, headers: e.target.value})}
                        className={`w-full h-20 px-6 py-4 text-xs ${styles.input} resize-none`}
                        placeholder='{"X-Provider": "MyProxy"}'
                    />
                </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-4 pt-6">
                <button 
                    onClick={handleTestConnection}
                    className={`flex-1 py-4 text-[11px] uppercase tracking-[0.3em] font-black ${styles.buttonSecondary}`}
                >
                    发起测试连接
                </button>
                <button 
                    onClick={handleSave}
                    className={`flex-[1.5] py-4 text-[11px] uppercase tracking-[0.5em] ${styles.buttonPrimary} clip-tactical-sm`}
                >
                    确认协议部署
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
