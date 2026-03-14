/**
 * 航海志 - Service Worker (Background Script)
 *
 * 处理消息通信和下载管理
 */

// 监听来自 Popup 和 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Navigator SW] 收到消息:', message.type);

  switch (message.type) {
    case 'EXTRACT_CONTENT':
      handleExtractContent(sender.tab?.id, sendResponse);
      return true; // 异步响应

    case 'DOWNLOAD_EPUB':
      handleDownloadEpub(message.data, sendResponse);
      return true;

    case 'FETCH_IMAGE':
      handleFetchImage(message.url, sendResponse);
      return true;

    default:
      sendResponse({ error: '未知消息类型' });
      return false;
  }
});

/**
 * 注入 Content Script 并提取内容
 */
async function handleExtractContent(tabId, sendResponse) {
  try {
    if (!tabId) {
      sendResponse({ error: '无法获取当前标签页' });
      return;
    }

    // 注入 content script
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

    // content script 执行完毕后会通过消息返回结果
    sendResponse({ success: true, injected: true });
  } catch (error) {
    console.error('[Navigator SW] 注入失败:', error);
    sendResponse({ error: `内容脚本注入失败: ${error.message}` });
  }
}

/**
 * 下载 EPUB 文件
 */
async function handleDownloadEpub(data, sendResponse) {
  try {
    const { blob, filename } = data;

    // 创建下载 URL
    const url = URL.createObjectURL(blob);

    // 使用 chrome.downloads API
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
    });

    sendResponse({ success: true, downloadId });

    // 延迟释放 URL
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error('[Navigator SW] 下载失败:', error);
    sendResponse({ error: `下载失败: ${error.message}` });
  }
}

/**
 * 代理图片下载（解决跨域问题）
 */
async function handleFetchImage(url, sendResponse) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      sendResponse({ error: `HTTP ${response.status}` });
      return;
    }

    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = () => {
      sendResponse({
        success: true,
        data: reader.result,
        mime: blob.type,
      });
    };
    reader.onerror = () => {
      sendResponse({ error: '读取失败' });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// 安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Navigator SW] 插件已安装/更新:', details.reason);
});
