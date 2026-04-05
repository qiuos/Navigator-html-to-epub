/**
 * 航海志 - Content Script
 *
 * 注入到目标页面，提取内容并回传给 Popup/Service Worker
 */

import { extractContent } from '../modules/content-extractor.js';
import { extractMetadata } from '../utils/metadata.js';

(async function () {
  // 避免重复注入
  if (window.__navigatorExtracted) {
    console.log('[Navigator] 已提取过，使用缓存');
    chrome.runtime.sendMessage({
      type: 'CONTENT_EXTRACTED',
      data: window.__navigatorExtractedData,
    });
    return;
  }

  console.log('[Navigator] Content Script 已注入，开始提取...');

  try {
    // 提取元数据
    const metadata = extractMetadata(document);
    console.log('[Navigator] 元数据:', metadata);

    // 提取正文内容
    const content = await extractContent(document, window.location.href);
    console.log(
      `[Navigator] 内容提取完成: ${content.textLength} 字, ${content.imageCount} 张图片`
    );

    const result = {
      metadata,
      content,
      url: window.location.href,
    };

    // 缓存结果
    window.__navigatorExtracted = true;
    window.__navigatorExtractedData = result;

    // 发送给 Service Worker / Popup
    chrome.runtime.sendMessage({
      type: 'CONTENT_EXTRACTED',
      data: result,
    });
  } catch (error) {
    console.error('[Navigator] 内容提取失败:', error);
    chrome.runtime.sendMessage({
      type: 'CONTENT_EXTRACT_ERROR',
      error: error.message,
    });
  }
})();
