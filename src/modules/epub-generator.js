/**
 * 航海志 - F3: EPUB 生成模块
 *
 * 使用 JSZip 手动构建 EPUB 3.0（兼容 2.0）文件
 * EPUB 本质上是一个 ZIP 包，包含特定目录结构和 XML 文件
 */

import JSZip from 'jszip';

/**
 * 生成 EPUB 文件
 * @param {Object} options
 * @param {string} options.title - 书名
 * @param {string} options.author - 作者
 * @param {string} options.date - 出版日期 (YYYY-MM-DD)
 * @param {string} options.language - 语言代码
 * @param {string} options.description - 描述
 * @param {string} options.html - HTML 内容
 * @param {Array} options.images - 图片数组 [{id, data, mime}]
 * @param {Blob|null} options.coverImage - 封面图片
 * @param {string} options.sourceUrl - 来源URL
 * @returns {Promise<Blob>} EPUB 文件 Blob
 */
export async function generateEpub(options) {
  const {
    title = '未命名文章',
    author = '未知',
    date = new Date().toISOString().split('T')[0],
    language = 'zh-CN',
    description = '',
    html,
    images = [],
    coverImage = null,
    sourceUrl = '',
  } = options;

  const bookId = `navigator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const zip = new JSZip();

  // ========================================
  // 1. mimetype (必须是第一个文件，无压缩)
  // ========================================
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // ========================================
  // 2. META-INF/container.xml
  // ========================================
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // ========================================
  // 3. 构建目录结构 (TOC)
  // ========================================
  const toc = buildToc(html);

  // ========================================
  // 4. 拆分章节（如果有多个 H1）
  // ========================================
  const chapters = splitChapters(html, toc);

  // ========================================
  // 5. 样式表
  // ========================================
  zip.file('OEBPS/styles/style.css', generateStylesheet());

  // ========================================
  // 6. 图片文件
  // ========================================
  const imageItems = [];
  for (const img of images) {
    const path = `OEBPS/images/${img.id}`;
    const buffer = await blobToArrayBuffer(img.data);
    zip.file(path, buffer);
    imageItems.push({
      id: img.id.replace(/\./g, '_'),
      href: `images/${img.id}`,
      mime: img.mime,
    });
  }

  // 封面图
  let coverImageItem = null;
  if (coverImage) {
    try {
      const coverBuffer = await blobToArrayBuffer(coverImage);
      zip.file('OEBPS/images/cover.jpg', coverBuffer);
      coverImageItem = {
        id: 'cover-image',
        href: 'images/cover.jpg',
        mime: 'image/jpeg',
      };
    } catch (e) {
      console.warn('[Navigator] 封面图处理失败', e);
    }
  }

  // ========================================
  // 7. 章节 XHTML 文件
  // ========================================
  const chapterItems = [];
  chapters.forEach((chapter, i) => {
    const filename = `chapter_${i + 1}.xhtml`;
    const xhtml = wrapXhtml(chapter.title, chapter.html, language);
    zip.file(`OEBPS/${filename}`, xhtml);
    chapterItems.push({
      id: `chapter_${i + 1}`,
      href: filename,
      title: chapter.title,
    });
  });

  // ========================================
  // 8. 封面页
  // ========================================
  const coverXhtml = generateCoverPage(title, author, date, sourceUrl, coverImageItem);
  zip.file('OEBPS/cover.xhtml', coverXhtml);

  // ========================================
  // 9. content.opf (OPF 包文件)
  // ========================================
  const opf = generateOpf({
    bookId,
    title,
    author,
    date,
    language,
    description,
    coverImageItem,
    imageItems,
    chapterItems,
  });
  zip.file('OEBPS/content.opf', opf);

  // ========================================
  // 10. toc.ncx (EPUB 2.0 目录)
  // ========================================
  const ncx = generateNcx(bookId, title, chapterItems);
  zip.file('OEBPS/toc.ncx', ncx);

  // ========================================
  // 11. toc.xhtml (EPUB 3.0 目录)
  // ========================================
  const tocXhtml = generateTocXhtml(title, chapterItems, language);
  zip.file('OEBPS/toc.xhtml', tocXhtml);

  // ========================================
  // 12. 生成 ZIP/EPUB 文件
  // ========================================
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return blob;
}

/**
 * 解析 HTML 构建目录
 */
function buildToc(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const headings = doc.querySelectorAll('h1, h2, h3');
  const toc = [];

  headings.forEach((h, i) => {
    const level = parseInt(h.tagName.charAt(1), 10);
    toc.push({
      id: `heading_${i}`,
      level,
      text: h.textContent.trim(),
    });
    // 给标题添加 id 以便链接
    h.setAttribute('id', `heading_${i}`);
  });

  return toc;
}

/**
 * 按 H1 拆分章节
 */
function splitChapters(html, toc) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;

  // 检查是否有多个 H1
  const h1s = container.querySelectorAll('h1');

  if (h1s.length <= 1) {
    // 单章节
    return [
      {
        title: h1s.length === 1 ? h1s[0].textContent.trim() : '正文',
        html: container.innerHTML,
      },
    ];
  }

  // 多章节：按 H1 拆分
  const chapters = [];
  let currentChapter = null;
  const children = Array.from(container.childNodes);

  children.forEach(node => {
    if (node.nodeType === 1 && node.tagName === 'H1') {
      if (currentChapter) {
        chapters.push(currentChapter);
      }
      currentChapter = {
        title: node.textContent.trim(),
        html: node.outerHTML,
      };
    } else {
      if (!currentChapter) {
        currentChapter = { title: '正文', html: '' };
      }
      if (node.nodeType === 1) {
        currentChapter.html += node.outerHTML;
      } else if (node.nodeType === 3 && node.textContent.trim()) {
        currentChapter.html += `<p>${escapeXml(node.textContent.trim())}</p>`;
      }
    }
  });

  if (currentChapter) {
    chapters.push(currentChapter);
  }

  return chapters.length > 0
    ? chapters
    : [{ title: '正文', html: container.innerHTML }];
}

/**
 * 包装章节为标准 XHTML
 */
function wrapXhtml(title, html, language) {
  // 清理 HTML 以确保 XHTML 兼容
  const cleanedHtml = cleanForXhtml(html);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}" lang="${language}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  ${cleanedHtml}
</body>
</html>`;
}

/**
 * 清理 HTML 使其兼容 XHTML
 */
function cleanForXhtml(html) {
  return html
    // 自动闭合所有标准 HTML5 的 Void Elements (自闭合标签)，兼容带属性的情况（如 <br class="..">）
    .replace(/<(img|br|hr|input|source|meta|link|col|area|base|param|track|wbr)\b([^>]*?)>/gi, (match, tag, attrs) => {
      // 如果标签结尾已经带有斜杠（如 <br/> 或 <img src="X" />），则直接跳过
      if (attrs.trim().endsWith('/')) return match;
      // 否则强制补充闭合斜杠
      return `<${tag}${attrs}/>`;
    })
    // 移除不支持或不安全的内联属性
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+onclick="[^"]*"/gi, '')
    .replace(/\s+onload="[^"]*"/gi, '')
    .replace(/\s+onerror="[^"]*"/gi, '')
    .replace(/\s+data-[a-zA-Z0-9_-]+="[^"]*"/gi, '') // 去除大量的系统/业务属性减小体积与干扰
    // 确保 XML 实体合规
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/gi, '&amp;');
}

/**
 * 生成 EPUB 样式表
 */
function generateStylesheet() {
  return `/* 航海志 Navigator - EPUB Stylesheet */

body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.8;
  margin: 1em;
  padding: 0;
  color: #333;
  text-align: justify;
}

h1 {
  font-size: 1.8em;
  margin: 1.5em 0 0.5em;
  text-align: left;
  color: #1a1a1a;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0.3em;
}

h2 {
  font-size: 1.4em;
  margin: 1.2em 0 0.4em;
  color: #2a2a2a;
}

h3 {
  font-size: 1.2em;
  margin: 1em 0 0.3em;
  color: #3a3a3a;
}

h4, h5, h6 {
  font-size: 1em;
  margin: 0.8em 0 0.3em;
  color: #4a4a4a;
}

p {
  margin: 0.8em 0;
  text-indent: 0;
}

a {
  color: #0066cc;
  text-decoration: underline;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}

figure {
  margin: 1.5em 0;
  text-align: center;
}

figcaption {
  font-size: 0.85em;
  color: #666;
  margin-top: 0.5em;
  font-style: italic;
}

blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid #ddd;
  color: #555;
  background: #f9f9f9;
}

pre {
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1em;
  overflow-x: auto;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.9em;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

code {
  font-family: "Courier New", Courier, monospace;
  background: #f4f4f4;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}

pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5em 0.8em;
  text-align: left;
}

th {
  background: #f0f0f0;
  font-weight: bold;
}

ul, ol {
  margin: 0.8em 0;
  padding-left: 2em;
}

li {
  margin: 0.3em 0;
}

dl {
  margin: 0.8em 0;
}

dt {
  font-weight: bold;
  margin-top: 0.5em;
}

dd {
  margin-left: 1.5em;
  margin-bottom: 0.5em;
}

hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 2em 0;
}

strong, b {
  font-weight: bold;
}

em, i {
  font-style: italic;
}

del, s {
  text-decoration: line-through;
}

sup {
  font-size: 0.75em;
  vertical-align: super;
}

sub {
  font-size: 0.75em;
  vertical-align: sub;
}

/* 封面页 */
.cover-page {
  text-align: center;
  padding: 3em 1em;
}

.cover-page h1 {
  font-size: 2em;
  border: none;
  margin-bottom: 0.5em;
  text-align: center;
}

.cover-page .meta {
  color: #666;
  font-size: 0.95em;
  margin: 0.3em 0;
}

.cover-page .source {
  font-size: 0.8em;
  color: #999;
  margin-top: 2em;
  word-break: break-all;
}

.cover-page img {
  max-width: 80%;
  margin: 2em auto;
}
`;
}

/**
 * 生成封面页 XHTML
 */
function generateCoverPage(title, author, date, sourceUrl, coverImageItem) {
  let coverImg = '';
  if (coverImageItem) {
    coverImg = `<img src="${coverImageItem.href}" alt="封面"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <div class="cover-page">
    ${coverImg}
    <h1>${escapeXml(title)}</h1>
    <p class="meta">作者：${escapeXml(author)}</p>
    <p class="meta">日期：${escapeXml(date)}</p>
    ${sourceUrl ? `<p class="source">来源：${escapeXml(sourceUrl)}</p>` : ''}
  </div>
</body>
</html>`;
}

/**
 * 生成 OPF (Open Packaging Format) 文件
 */
function generateOpf(opts) {
  const {
    bookId, title, author, date, language,
    description, coverImageItem, imageItems, chapterItems,
  } = opts;

  // manifest items
  let manifestItems = `
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles/style.css" media-type="text/css"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`;

  // 章节
  chapterItems.forEach(ch => {
    manifestItems += `
    <item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`;
  });

  // 图片
  imageItems.forEach(img => {
    manifestItems += `
    <item id="${img.id}" href="${img.href}" media-type="${img.mime}"/>`;
  });

  // 封面图
  if (coverImageItem) {
    manifestItems += `
    <item id="${coverImageItem.id}" href="${coverImageItem.href}" media-type="${coverImageItem.mime}" properties="cover-image"/>`;
  }

  // spine
  let spineItems = `
    <itemref idref="cover"/>`;
  chapterItems.forEach(ch => {
    spineItems += `
    <itemref idref="${ch.id}"/>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:date>${date}</dc:date>
    ${description ? `<dc:description>${escapeXml(description)}</dc:description>` : ''}
    <dc:publisher>航海志 Navigator</dc:publisher>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>${manifestItems}
  </manifest>
  <spine toc="ncx">${spineItems}
  </spine>
</package>`;
}

/**
 * 生成 NCX 目录 (EPUB 2.0 兼容)
 */
function generateNcx(bookId, title, chapterItems) {
  let navPoints = '';
  chapterItems.forEach((ch, i) => {
    navPoints += `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${ch.href}"/>
    </navPoint>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
}

/**
 * 生成 TOC XHTML (EPUB 3.0)
 */
function generateTocXhtml(title, chapterItems, language) {
  let items = '';
  chapterItems.forEach(ch => {
    items += `
      <li><a href="${ch.href}">${escapeXml(ch.title)}</a></li>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
<head>
  <meta charset="UTF-8"/>
  <title>目录</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>${items}
    </ol>
  </nav>
</body>
</html>`;
}

/**
 * XML 转义
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Blob → ArrayBuffer
 */
function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 获取下载文件名
 * 格式: {标题}__{YYYY-MM-DD}.epub
 */
export function getEpubFilename(title, date) {
  // 清理标题中不适合做文件名的字符
  const cleanTitle = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);

  return `${cleanTitle}__${date}.epub`;
}
