import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';

// 自定义插件：拷贝 manifest & assets，移动 popup.html 到 dist 根目录
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // 拷贝 manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // 拷贝 assets (图标)
      const assetsDir = resolve(distDir, 'assets');
      if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
      ['icon-16.png', 'icon-48.png', 'icon-128.png'].forEach(icon => {
        const src = resolve(__dirname, 'assets', icon);
        if (existsSync(src)) {
          copyFileSync(src, resolve(assetsDir, icon));
        }
      });

      // 移动 popup.html 从 dist/src/popup/ 到 dist/ 并修正路径
      const htmlSrc = resolve(distDir, 'src/popup/popup.html');
      if (existsSync(htmlSrc)) {

        let html = readFileSync(htmlSrc, 'utf-8');
        // 修正路径：因为文件从 src/popup/ 移到了根目录
        html = html.replace(/\.\.\/\.\.\/popup\.js/g, './popup.js');
        html = html.replace(/\.\.\/\.\.\/assets\//g, './assets/');
        html = html.replace(/\.\.\/\.\.\/chunks\//g, './chunks/');
        writeFileSync(resolve(distDir, 'popup.html'), html);
        // 清理空目录
        try {
          rmSync(resolve(distDir, 'src'), { recursive: true });
        } catch {}
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [copyExtensionFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 使用 rollup 多入口
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        content: resolve(__dirname, 'src/content/content.js'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
    target: 'es2020',
    minify: false, // 调试时不压缩
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
