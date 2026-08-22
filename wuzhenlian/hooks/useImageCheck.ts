import { useState, useEffect } from 'react';

/**
 * 检查外链图片是否可加载。
 * 返回 true = 加载成功，false = 加载失败或超时。
 * 超时默认 8 秒（postimg.cc 偶尔慢）。
 */
export function useImageCheck(url: string, timeoutMs = 8000): boolean {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    if (!url) return;
    let done = false;
    const img = new Image();
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        setOk(false);
      }
    }, timeoutMs);
    img.onload = () => {
      if (!done) {
        done = true;
        setOk(true);
      }
      clearTimeout(timer);
    };
    img.onerror = () => {
      if (!done) {
        done = true;
        setOk(false);
      }
      clearTimeout(timer);
    };
    img.src = url;
    return () => {
      clearTimeout(timer);
    };
  }, [url, timeoutMs]);

  return ok;
}

/**
 * 批量检查多个外链图片，返回一个 Record<key, boolean>。
 * 适用于需要同时验证多个主题图片的场景。
 */
export function useImageChecks(urls: Record<string, string>, timeoutMs = 8000): Record<string, boolean> {
  const [results, setResults] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(urls);
    const newResults: Record<string, boolean> = {};

    entries.forEach(([key, url]) => {
      if (!url) {
        newResults[key] = true;
        return;
      }
      let done = false;
      const img = new Image();
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          newResults[key] = false;
          if (!cancelled) setResults(prev => ({ ...prev, [key]: false }));
        }
      }, timeoutMs);
      img.onload = () => {
        if (!done) {
          done = true;
          newResults[key] = true;
          if (!cancelled) setResults(prev => ({ ...prev, [key]: true }));
        }
        clearTimeout(timer);
      };
      img.onerror = () => {
        if (!done) {
          done = true;
          newResults[key] = false;
          if (!cancelled) setResults(prev => ({ ...prev, [key]: false }));
        }
        clearTimeout(timer);
      };
      img.src = url;
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(urls), timeoutMs]);

  return results;
}
