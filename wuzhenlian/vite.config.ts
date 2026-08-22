import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** 构建收尾：把 dist/index.html 的 `<script type="module" crossorigin>` 改成普通 `<script defer>`，
 *  使产物支持 file:// 协议直接双击打开（module 脚本在 file:// 下会被浏览器 CORS 拦截）。 */
function fileProtocolHtmlFix(): Plugin {
  return {
    name: 'file-protocol-html-fix',
    closeBundle() {
      const htmlPath = path.resolve(__dirname, 'dist/index.html');
      if (!fs.existsSync(htmlPath)) return;
      const html = fs.readFileSync(htmlPath, 'utf-8');
      const fixed = html.replace(
        /<script type="module" crossorigin src="(\.\/assets\/[^"]+)"><\/script>/,
        '<script defer src="$1"></script>',
      );
      if (fixed !== html) {
        fs.writeFileSync(htmlPath, fixed, 'utf-8');
        console.log('[file-protocol-html-fix] dist/index.html script 已改为普通 <script defer>，支持 file:// 直接打开');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // 相对路径：让 dist/ 可用 file:// 双击 index.html 直接打开，也可随意部署到任意子目录
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), fileProtocolHtmlFix()],
      build: {
        // 打成 IIFE 而非 ES module：避免 file:// 双击打开时 module 脚本被浏览器 CORS 拦截
        rollupOptions: {
          output: {
            format: 'iife',
            inlineDynamicImports: true,
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
