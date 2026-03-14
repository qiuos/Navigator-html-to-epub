/**
 * 航海志 - 元数据提取工具
 */

/**
 * 从页面提取元数据
 * @param {Document} doc - DOM Document
 * @returns {Object} metadata
 */
export function extractMetadata(doc) {
  return {
    title: extractTitle(doc),
    author: extractAuthor(doc),
    publishDate: extractPublishDate(doc),
    description: extractDescription(doc),
    coverImage: extractCoverImage(doc),
    language: extractLanguage(doc),
    siteName: extractSiteName(doc),
  };
}

function extractTitle(doc) {
  // 优先级：og:title > <title> > 第一个 H1
  const ogTitle = getMetaContent(doc, 'property', 'og:title');
  if (ogTitle) return ogTitle;

  const titleEl = doc.querySelector('title');
  if (titleEl) {
    // 去掉网站名称后缀 (如 "文章标题 - 网站名")
    let title = titleEl.textContent.trim();
    const separators = [' - ', ' | ', ' – ', ' — ', ' :: ', ' · '];
    for (const sep of separators) {
      const idx = title.lastIndexOf(sep);
      if (idx > 0 && idx < title.length - 5) {
        title = title.substring(0, idx).trim();
        break;
      }
    }
    return title;
  }

  const h1 = doc.querySelector('h1');
  if (h1) return h1.textContent.trim();

  return '未命名文章';
}

function extractAuthor(doc) {
  return (
    getMetaContent(doc, 'name', 'author') ||
    getMetaContent(doc, 'property', 'article:author') ||
    getMetaContent(doc, 'name', 'twitter:creator') ||
    '未知'
  );
}

function extractPublishDate(doc) {
  const dateStr =
    getMetaContent(doc, 'property', 'article:published_time') ||
    getMetaContent(doc, 'name', 'publish_date') ||
    getMetaContent(doc, 'name', 'date') ||
    getMetaContent(doc, 'property', 'article:modified_time');

  if (dateStr) {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      }
    } catch {
      // 解析失败
    }
  }

  // 尝试从页面中找 <time> 元素
  const timeEl = doc.querySelector('time[datetime]');
  if (timeEl) {
    try {
      const date = new Date(timeEl.getAttribute('datetime'));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // 解析失败
    }
  }

  return new Date().toISOString().split('T')[0];
}

function extractDescription(doc) {
  return (
    getMetaContent(doc, 'property', 'og:description') ||
    getMetaContent(doc, 'name', 'description') ||
    ''
  );
}

function extractCoverImage(doc) {
  return (
    getMetaContent(doc, 'property', 'og:image') ||
    getMetaContent(doc, 'name', 'twitter:image') ||
    ''
  );
}

function extractLanguage(doc) {
  return doc.documentElement.lang || 'zh-CN';
}

function extractSiteName(doc) {
  return (
    getMetaContent(doc, 'property', 'og:site_name') ||
    ''
  );
}

/**
 * 获取 meta 标签的 content 值
 */
function getMetaContent(doc, attrName, attrValue) {
  const el = doc.querySelector(`meta[${attrName}="${attrValue}"]`);
  return el ? (el.getAttribute('content') || '').trim() : '';
}
