# Navigator - HTML to EPUB Converter

一个浏览器扩展，用于将网页内容转换为EPUB电子书格式。

## 功能特性

- 📖 **一键转换**：将当前网页快速转换为EPUB格式
- 🖼️ **智能图片处理**：自动下载并嵌入网页图片
- 📝 **内容提取**：智能识别并提取网页正文内容
- 🎨 **样式保留**：保留基本的文本格式和样式
- 🌐 **多站点支持**：针对常用网站优化内容提取规则

## 安装

### 开发模式安装

1. **构建扩展**
   ```bash
   npm install
   npm run build
   ```

2. **在Chrome中加载**
   - 打开 `chrome://extensions/`
   - 开启右上角的「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择项目的 `dist` 目录

### Firefox安装

1. **构建扩展**
   ```bash
   npm install
   npm run build
   ```

2. **在Firefox中加载**
   - 打开 `about:debugging#/runtime/this-firefox`
   - 点击「临时载入附加组件」
   - 选择 `dist` 目录中的 `manifest.json`

## 使用方法

### 基本使用

1. **打开目标网页**
   - 在浏览器中打开您想要保存的网页

2. **点击扩展图标**
   - 点击浏览器工具栏中的Navigator图标

3. **设置EPUB信息**
   - 在弹出窗口中，您可以编辑：
     - **书名**：EPUB电子书的标题
     - **作者**：作者名称
     - **语言**：内容语言（默认：zh-CN）

4. **开始转换**
   - 点击「转换为EPUB」按钮
   - 等待处理完成（图片较多时可能需要一些时间）

5. **保存文件**
   - 转换完成后，EPUB文件会自动下载

### 快捷键

- 暂无（后续版本会添加）

## 支持的网站

扩展针对以下网站进行了优化：

- 微信公众号
- 知乎专栏
- 简书
- 掘金
- Medium
- 其他通用网页（通用提取模式）

## 技术架构

```
Navigator/
├── src/
│   ├── background/       # 后台服务
│   │   └── service-worker.js
│   ├── content/          # 内容脚本
│   │   └── content.js
│   ├── modules/          # 核心模块
│   │   ├── content-extractor.js  # 内容提取
│   │   ├── epub-generator.js     # EPUB生成
│   │   ├── image-processor.js    # 图片处理
│   │   └── site-rules.js         # 站点规则
│   ├── popup/            # 弹出窗口UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── utils/            # 工具函数
│       ├── dom-utils.js
│       └── metadata.js
├── assets/               # 扩展图标
├── manifest.json         # 扩展清单
├── vite.config.js        # Vite配置
└── package.json          # 项目配置
```

## 依赖库

- **EPUB.js**：EPUB文件生成库（CDN加载）
- **jszip**：ZIP压缩库（EPUB格式基础）

## 开发

### 环境要求

- Node.js 16+
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

## 注意事项

1. **跨域限制**
   - 部分网站的图片可能因跨域限制无法下载
   - 扩展会尽力处理，但某些情况下图片可能无法嵌入

2. **内容提取**
   - 自动提取基于通用规则，可能无法完美识别所有网页结构
   - 对于特殊网站，可以添加专门的提取规则

3. **文件大小**
   - 包含大量图片的EPUB文件可能较大
   - 建议在网络良好时使用

## 更新日志

### v0.1 (2026-03-14)

- 初始版本发布
- 基本的网页转EPUB功能
- 智能内容提取
- 图片处理和嵌入
- 多站点规则支持

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

- GitHub: [qiuos/Navigator-html-to-epub](https://github.com/qiuos/Navigator-html-to-epub)
