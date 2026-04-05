/**
 * 航海志 - Popup 主控制器
 *
 * 管理整个交互流程：
 * 1. 加载 → 注入 Content Script 提取内容
 * 2. 预览 → 显示元数据，用户可编辑
 * 3. 转换 → 处理图片 → 生成 EPUB → 下载
 */

import { processImages } from '../modules/image-processor.js';
import { generateEpub, getEpubFilename } from '../modules/epub-generator.js';

// ========================================
// 状态管理
// ========================================
const state = {
  metadata: null,
  content: null,
  url: '',
  phase: 'loading', // loading | preview | converting | success | error
};

// ========================================
// DOM 元素引用
// ========================================
const $ = (id) => document.getElementById(id);

const areas = {
  status: $('status-area'),
  preview: $('preview-area'),
  progress: $('progress-area'),
  success: $('success-area'),
  error: $('error-area'),
  history: $('history-area'),
};

const inputs = {
  title: $('input-title'),
  author: $('input-author'),
  date: $('input-date'),
};

const stats = {
  words: $('stat-words'),
  images: $('stat-images'),
};

const progress = {
  bar: $('progress-bar'),
  percent: $('progress-percent'),
  steps: {
    extract: $('step-extract'),
    images: $('step-images'),
    epub: $('step-epub'),
  },
};

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('[Navigator Popup] 初始化');

  $('btn-convert').addEventListener('click', startConversion);
  $('btn-retry').addEventListener('click', retryConversion);
  $('btn-open-folder').addEventListener('click', openDownloadFolder);
  
  // 历史记录事件绑定
  $('btn-history').addEventListener('click', showHistoryPanel);
  $('btn-history-close').addEventListener('click', () => {
    // 飞书诊断页面返回诊断，否则按内容状态
    const isFeishu = state.url && (/\.feishu\.cn/.test(state.url) || /\.larksuite\.com/.test(state.url));
    if (isFeishu) {
      showPhase('diagnostic');
    } else if (state.content) {
      showPhase('preview');
    } else {
      showPhase('loading');
    }
  });

  // 监听来自 Content Script 的消息
  chrome.runtime.onMessage.addListener(handleMessage);

  // 获取当前标签页并注入 Content Script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showError('无法获取当前标签页');
      return;
    }

    // 检查是否是可以操作的页面
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showError('无法在浏览器内部页面使用航海志');
      return;
    }

    state.url = tab.url;

    // 注入 Content Script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    console.log('[Navigator Popup] Content Script 已注入');
  } catch (error) {
    console.error('[Navigator Popup] 初始化失败:', error);
    showError(`初始化失败: ${error.message}`);
  }
}

// ========================================
// 消息处理
// ========================================
function handleMessage(message) {
  console.log('[Navigator Popup] 收到消息:', message.type);

  switch (message.type) {
    case 'CONTENT_EXTRACTED':
      onContentExtracted(message.data);
      break;
    case 'CONTENT_EXTRACT_ERROR':
      showError(`内容提取失败: ${message.error}`);
      break;
    case 'FEISHU_DIAG':
      onFeishuDiag(message.data);
      break;
  }
}

/**
 * 飞书诊断结果
 */
function onFeishuDiag(data) {
  const el = $('diagnostic-content');
  if (!el) return;
  el.textContent = JSON.stringify(data.sections, null, 2);
}

/**
 * 内容提取完成
 */
function onContentExtracted(data) {
  state.metadata = data.metadata;
  state.content = data.content;
  state.url = data.url;

  inputs.title.value = state.metadata.title;
  inputs.author.value = state.metadata.author;
  inputs.date.value = state.metadata.publishDate;

  // 统计
  stats.words.textContent = formatNumber(state.content.textLength);
  stats.images.textContent = state.content.imageCount;

  // 封面图
  if (state.metadata.coverImage) {
    const coverPreview = $('cover-preview');
    const coverImg = $('cover-img');
    coverImg.src = state.metadata.coverImage;
    coverImg.onerror = () => coverPreview.classList.add('hidden');
    coverPreview.classList.remove('hidden');
  }

  showPhase('preview');
}

// ========================================
// 转换流程
// ========================================
async function startConversion() {
  console.log('[Navigator Popup] 开始转换');

  // 收集用户编辑后的元数据
  const title = inputs.title.value.trim() || '未命名文章';
  const author = inputs.author.value.trim() || '未知';
  const date = inputs.date.value || new Date().toISOString().split('T')[0];

  showPhase('converting');
  updateProgress(5, 'extract');

  try {
    // ---- 阶段1: 内容已提取（之前完成的） ----
    completeStep('extract');
    updateProgress(20, 'images');

    // ---- 阶段2: 处理图片 ----
    let processedHtml = state.content.html;
    let images = [];

    if (state.content.imageCount > 0) {
      const result = await processImages(
        state.content.html,
        state.url,
        (current, total) => {
          const imgProgress = 20 + Math.round((current / total) * 40);
          updateProgress(imgProgress, 'images');
        }
      );
      processedHtml = result.html;
      images = result.images;
    }

    completeStep('images');
    updateProgress(65, 'epub');

    // ---- 阶段3: 生成 EPUB ----
    // 下载封面图
    let coverBlob = null;
    if (state.metadata.coverImage) {
      try {
        const response = await fetch(state.metadata.coverImage);
        if (response.ok) {
          coverBlob = await response.blob();
        }
      } catch {
        // 封面下载失败不阻塞
      }
    }

    updateProgress(75, 'epub');

    const epubBlob = await generateEpub({
      title,
      author,
      date,
      language: state.metadata.language,
      description: state.metadata.description,
      html: processedHtml,
      images,
      coverImage: coverBlob,
      sourceUrl: state.url,
    });

    updateProgress(90, 'epub');

    // ---- 阶段4: 下载 ----
    // 确保后缀并清理非法路径字符
    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || '未命名文件';
    const filename = `${cleanTitle}.epub`;

    // 使用 chrome.downloads API
    const url = URL.createObjectURL(epubBlob);
    
    // 使用 Promise 封装下载，提供回退方案
    await new Promise((resolve) => {
      chrome.downloads.download({
        url,
        filename,
        saveAs: false,
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.warn('[Navigator] downloads API 失败，尝试回退...', chrome.runtime.lastError.message);
          // 回退：创建 A 标签进行下载
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        resolve();
      });
    });

    // 保存记录到历史
    saveToHistory(title, date, filename, state.url);

    // 延迟释放
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    completeStep('epub');
    updateProgress(100, 'epub');

    // 显示成功
    setTimeout(() => {
      $('success-filename').textContent = filename;
      showPhase('success');
    }, 500);

  } catch (error) {
    console.error('[Navigator Popup] 转换失败:', error);
    showError(`转换过程中发生错误: ${error.message}`);
  }
}

function retryConversion() {
  if (state.content) {
    showPhase('preview');
  } else {
    // 重新加载
    window.close();
  }
}

async function openDownloadFolder() {
  try {
    await chrome.downloads.showDefaultFolder();
  } catch {
    // 某些浏览器不支持
  }
}

// ========================================
// UI 更新
// ========================================
function showPhase(phase) {
  state.phase = phase;

  // 隐藏所有区域
  Object.values(areas).forEach(el => el.classList.add('hidden'));
  $('diagnostic-area')?.classList.add('hidden');

  // 显示对应区域
  switch (phase) {
    case 'loading':
      areas.status.classList.remove('hidden');
      break;
    case 'preview':
      areas.preview.classList.remove('hidden');
      break;
    case 'converting':
      areas.progress.classList.remove('hidden');
      resetProgress();
      break;
    case 'success':
      areas.success.classList.remove('hidden');
      break;
    case 'error':
      areas.error.classList.remove('hidden');
      break;
    case 'history':
      areas.history.classList.remove('hidden');
      break;
    case 'diagnostic':
      $('diagnostic-area').classList.remove('hidden');
      break;
  }
}

function updateProgress(percent, activeStep) {
  progress.bar.style.width = `${percent}%`;
  progress.percent.textContent = `${percent}%`;

  // 更新步骤状态
  if (activeStep) {
    Object.entries(progress.steps).forEach(([key, el]) => {
      if (key === activeStep) {
        el.classList.add('active');
        el.classList.remove('done');
      }
    });
  }
}

function completeStep(stepName) {
  const step = progress.steps[stepName];
  if (step) {
    step.classList.remove('active');
    step.classList.add('done');

    // 激活连接线
    const connector = step.nextElementSibling;
    if (connector && connector.classList.contains('step-connector')) {
      connector.classList.add('active');
    }
  }
}

function resetProgress() {
  progress.bar.style.width = '0%';
  progress.percent.textContent = '0%';

  Object.values(progress.steps).forEach(step => {
    step.classList.remove('active', 'done');
  });

  document.querySelectorAll('.step-connector').forEach(conn => {
    conn.classList.remove('active');
  });
}

function showError(message) {
  $('error-message').textContent = message;
  showPhase('error');
}

// ========================================
// 工具函数
// ========================================
function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    return num.toLocaleString();
  }
  return String(num);
}

// ========================================
// 历史记录功能
// ========================================
async function saveToHistory(title, date, filename, sourceUrl) {
  try {
    const { navigatorHistory = [] } = await chrome.storage.local.get('navigatorHistory');
    const newRecord = {
      id: Date.now(),
      title,
      date,
      filename,
      sourceUrl,
      timestamp: new Date().getTime()
    };
    
    // 只保留最近 20 条
    const newHistory = [newRecord, ...navigatorHistory].slice(0, 20);
    await chrome.storage.local.set({ navigatorHistory: newHistory });
  } catch (err) {
    console.warn('[Navigator] 保存历史记录失败:', err);
  }
}

async function showHistoryPanel() {
  showPhase('history');
  
  const listEl = $('history-list');
  const emptyEl = $('history-empty');
  listEl.innerHTML = '';
  
  try {
    const { navigatorHistory = [] } = await chrome.storage.local.get('navigatorHistory');
    
    if (navigatorHistory.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    
    emptyEl.classList.add('hidden');
    
    navigatorHistory.forEach(record => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const readableDate = new Date(record.timestamp).toLocaleString();
      
      item.innerHTML = `
        <div class="history-item-title">${escapeHtml(record.title)}</div>
        <div class="history-item-meta">
          <span>文件: ${escapeHtml(record.filename)}</span>
          <br>
          <span style="opacity: 0.7">${readableDate}</span>
        </div>
      `;
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error('[Navigator] 读取历史记录失败:', err);
    emptyEl.classList.remove('hidden');
    emptyEl.textContent = '读取记录失败';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
