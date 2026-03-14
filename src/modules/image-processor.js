/**
 * 航海志 - F2: 图片本地化与优化模块
 *
 * 负责发现、下载、压缩页面图片并嵌入EPUB
 */

/**
 * 处理内容中的所有图片
 * @param {string} html - 提取的HTML内容
 * @param {string} pageUrl - 原始页面URL
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<{ html: string, images: Array<{id: string, data: Blob, mime: string}> }>}
 */
export async function processImages(html, pageUrl, onProgress = () => {}) {
  // 创建临时DOM解析HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;

  // Step 1: 发现所有图片
  const imgElements = discoverImages(container);
  console.log(`[Navigator] 发现 ${imgElements.length} 张图片`);

  if (imgElements.length === 0) {
    return { html, images: [] };
  }

  // Step 2: 逐一处理
  const images = [];
  let processed = 0;

  for (const img of imgElements) {
    try {
      const result = await processOneImage(img, pageUrl);
      if (result) {
        images.push(result);
        // 更新DOM中的src
        img.element.setAttribute('src', `images/${result.id}`);
        // 移除srcset避免冲突
        img.element.removeAttribute('srcset');
        img.element.removeAttribute('data-src');
      } else {
        // 加载失败，移除图片
        img.element.remove();
      }
    } catch (err) {
      console.warn(`[Navigator] 图片处理失败: ${img.src}`, err);
      img.element.remove();
    }

    processed++;
    onProgress(processed, imgElements.length);
  }

  return {
    html: container.innerHTML,
    images,
  };
}

/**
 * Step 1: 发现所有图片
 */
function discoverImages(container) {
  const results = [];
  const imgs = container.querySelectorAll('img');

  imgs.forEach(img => {
    // 获取真实URL
    const src = getBestImageSrc(img);
    if (!src) return;

    // 过滤极小图片（拿不到实际尺寸就先保留）
    const width = parseInt(img.getAttribute('width'), 10);
    const height = parseInt(img.getAttribute('height'), 10);
    if (width && width < 50) return;
    if (height && height < 50) return;

    // 过滤 data URI (base64 的太小图片经常是 tracking pixel)
    if (src.startsWith('data:') && src.length < 200) return;

    results.push({ element: img, src });
  });

  return results;
}

/**
 * 获取图片最佳URL
 */
function getBestImageSrc(img) {
  // 优先级: data-src > srcset > src
  let src = img.getAttribute('data-src') || '';

  // 尝试从 srcset 中选择合适的版本
  if (!src) {
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      src = pickBestFromSrcset(srcset);
    }
  }

  if (!src) {
    src = img.getAttribute('src') || '';
  }

  // 清理 URL
  src = src.trim();

  // 跳过空的和纯占位符
  if (!src || src === '#' || src.startsWith('javascript:')) return '';

  return src;
}

/**
 * 从 srcset 中选择最接近 800px 宽度的版本
 */
function pickBestFromSrcset(srcset) {
  const parts = srcset.split(',').map(s => s.trim());
  let best = '';
  let bestDiff = Infinity;

  const TARGET_WIDTH = 800;

  parts.forEach(part => {
    const [url, descriptor] = part.split(/\s+/);
    if (!url) return;

    let width = TARGET_WIDTH; // 默认
    if (descriptor) {
      const match = descriptor.match(/(\d+)w/);
      if (match) {
        width = parseInt(match[1], 10);
      }
    }

    const diff = Math.abs(width - TARGET_WIDTH);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = url;
    }
  });

  return best;
}

/**
 * 处理单张图片
 */
async function processOneImage(imgInfo, pageUrl) {
  let { src } = imgInfo;

  // 处理 data URI
  if (src.startsWith('data:')) {
    return handleDataUri(src);
  }

  // 补全相对路径
  try {
    src = new URL(src, pageUrl).href;
  } catch {
    return null;
  }

  // 下载图片
  let blob;
  try {
    const response = await fetchWithTimeout(src, 5000);
    if (!response.ok) return null;
    blob = await response.blob();
  } catch (err) {
    console.warn(`[Navigator] 图片下载失败: ${src}`, err.message);
    return null;
  }

  // 检测格式
  const mime = blob.type || guessMimeType(src);
  const ext = getExtension(mime);

  // 生成唯一ID
  const id = `${generateId()}.${ext}`;

  // 优化（JPEG/PNG 压缩，限制宽度）
  if (mime === 'image/jpeg' || mime === 'image/png') {
    const optimized = await optimizeImage(blob, mime);
    return { id, data: optimized, mime };
  }

  // WebP/GIF 保留原格式
  return { id, data: blob, mime };
}

/**
 * 处理 data URI 图片
 */
function handleDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1];
  const base64 = match[2];
  const ext = getExtension(mime);
  const id = `${generateId()}.${ext}`;

  // base64 → Blob
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mime });

  return { id, data: blob, mime };
}

/**
 * 图片压缩优化
 * 目标：质量 75%，最大宽度 800px
 */
async function optimizeImage(blob, mime) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const MAX_WIDTH = 800;
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      // 如果本来就小于最大宽度，不缩放
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      // 使用 Canvas 压缩
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (compressedBlob) => {
          URL.revokeObjectURL(url);
          resolve(compressedBlob || blob); // 压缩失败保留原图
        },
        mime === 'image/png' ? 'image/png' : 'image/jpeg',
        0.75
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob); // 加载失败保留原图
    };

    img.src = url;
  });
}

/**
 * 带超时的 fetch，并配置无 Referrer 绕过常见防盗链
 */
function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    signal: controller.signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer', // 绕过图片防盗链
  }).finally(() => clearTimeout(timeoutId));
}

/**
 * 猜测 MIME 类型
 */
function guessMimeType(url) {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const mimeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * MIME → 扩展名
 */
function getExtension(mime) {
  const extMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return extMap[mime] || 'jpg';
}

/**
 * 生成短 UUID
 */
function generateId() {
  return 'img_' + Math.random().toString(36).substring(2, 10);
}
