/**
 * 航海志 - F1: 智能内容提取模块
 *
 * 基于文本密度 + DOM结构分析的启发式算法
 * 参考 Readability.js 的核心思路
 */

import {
  getTextLength,
  getLinkTextLength,
  getClassIdString,
  isJunkElement,
  isContentCandidate,
} from '../utils/dom-utils.js';
import { findSiteRule, applyRule } from './site-rules.js';

/**
 * 提取页面主要内容
 * @param {Document} doc - 当前页面的 DOM Document
 * @param {string} url - 当前页面 URL
 * @returns {{ html: string, textLength: number, imageCount: number }}
 */
export function extractContent(doc, url) {
  // Phase 0: 克隆文档，避免修改原始页面
  const clonedDoc = doc.cloneNode(true);

  // Phase 1: 尝试使用内置规则
  const rule = findSiteRule(url);
  if (rule) {
    console.log(`[Navigator] 使用内置规则: ${rule.name}`);
    const ruleContent = applyRule(clonedDoc, rule);
    if (ruleContent) {
      const cleaned = cleanupElement(ruleContent);
      return buildResult(cleaned);
    }
    console.log(`[Navigator] 规则提取失败，回退到通用算法`);
  }

  // Phase 2: 通用启发式算法
  return genericExtract(clonedDoc);
}

/**
 * 通用启发式内容提取算法
 */
function genericExtract(doc) {
  // Step 1: 清理垃圾元素
  removeJunkElements(doc);

  // Step 2: 查找候选元素并计算分数
  const candidates = scoreCandidates(doc);

  // Step 3: 选择最高分元素
  if (candidates.length === 0) {
    // 兜底：使用 body
    const body = doc.body || doc.querySelector('body');
    if (body) {
      return buildResult(cleanupElement(body));
    }
    return { html: '<p>无法提取内容</p>', textLength: 0, imageCount: 0 };
  }

  // 选择得分最高的
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Step 4: 扩展边界 - 合并相邻的高分兄弟元素
  const expanded = expandBoundary(best.element, candidates);

  // Step 5: 精细清理
  const cleaned = cleanupElement(expanded);

  return buildResult(cleaned);
}

/**
 * Step 1: 移除垃圾元素
 */
function removeJunkElements(doc) {
  // 移除 script, style, noscript 等
  const removeSelectors = [
    'script', 'style', 'noscript', 'link[rel="stylesheet"]',
    'iframe', 'embed', 'object',
    'nav', 'footer',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '[aria-hidden="true"]',
    '.ad, .ads, .advertisement, .adsbygoogle',
    '.social-share, .share-buttons, .social-buttons',
    '.comments, .comment-area, #comments, #disqus_thread',
    '.sidebar, #sidebar, .aside',
    '.popup, .modal, .overlay, .cookie-notice',
    '.newsletter, .subscribe',
  ];

  removeSelectors.forEach(selector => {
    try {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    } catch {
      // 选择器不合法就跳过
    }
  });

  // 使用启发式检测获取更多干扰元素
  const allElements = doc.querySelectorAll('*');
  allElements.forEach(el => {
    if (isJunkElement(el)) {
      // 不要移除包含大量文本的"误判"元素
      const textLen = getTextLength(el);
      const linkLen = getLinkTextLength(el);
      if (textLen < 200 || linkLen > textLen * 0.5) {
        el.remove();
      }
    }
  });
}

/**
 * Step 2: 为候选元素计算分数
 */
function scoreCandidates(doc) {
  const candidates = [];
  const blockElements = doc.querySelectorAll(
    'div, section, article, main, td, .post, .entry, .content'
  );

  blockElements.forEach(el => {
    const textLen = getTextLength(el);
    const linkTextLen = getLinkTextLength(el);

    // 跳过文本太少的
    if (textLen < 50) return;

    // 计算基础分数：(文本长度 - 链接文本长度) / 总长度
    const textDensity = textLen > 0 ? (textLen - linkTextLen) / textLen : 0;

    // 如果链接文本占比太高，跳过（可能是导航/目录）
    if (linkTextLen > textLen * 0.6) return;

    // 权重系数
    let weight = getTagWeight(el);

    // 加分项
    const classId = getClassIdString(el);
    if (isContentCandidate(el)) weight += 25;

    // 段落数量加分
    const paragraphs = el.querySelectorAll('p');
    const paragraphBonus = Math.min(paragraphs.length * 3, 30);

    // 图片数量小幅加分
    const images = el.querySelectorAll('img');
    const imageBonus = Math.min(images.length * 2, 10);

    // 嵌套深度惩罚
    let depth = 0;
    let parent = el.parentElement;
    while (parent && parent !== doc.body) {
      depth++;
      parent = parent.parentElement;
    }
    const depthPenalty = depth > 8 ? (depth - 8) * 5 : 0;

    // 最终分数
    const score =
      textDensity * textLen * 0.1 +
      weight +
      paragraphBonus +
      imageBonus -
      depthPenalty;

    if (score > 10) {
      candidates.push({ element: el, score, textLen });
    }
  });

  return candidates;
}

/**
 * 获取标签的权重
 */
function getTagWeight(el) {
  const tag = el.tagName.toLowerCase();
  const weights = {
    article: 50,
    main: 40,
    section: 15,
    div: 5,
    td: 3,
  };

  let weight = weights[tag] || 5;

  // 根据 class / id 调整
  const classId = getClassIdString(el);
  if (/article|post|entry|content|text|body|story|main/i.test(classId)) {
    weight += 25;
  }
  if (/nav|menu|sidebar|ad|social|comment|footer|header/i.test(classId)) {
    weight -= 25;
  }

  return weight;
}

/**
 * Step 4: 扩展边界 - 合并相邻的高分兄弟元素
 */
function expandBoundary(bestElement, candidates) {
  const parent = bestElement.parentElement;
  if (!parent) return bestElement;

  // 创建一个容器来收集内容
  const container = bestElement.ownerDocument.createElement('div');
  container.innerHTML = bestElement.innerHTML;

  // 检查兄弟元素
  const siblings = Array.from(parent.children);
  const bestIndex = siblings.indexOf(bestElement);

  for (let i = 0; i < siblings.length; i++) {
    if (i === bestIndex) continue;
    const sibling = siblings[i];
    const sibTextLen = getTextLength(sibling);
    const sibLinkLen = getLinkTextLength(sibling);

    // 合并条件：文本较多且链接占比低
    if (sibTextLen > 80 && sibLinkLen < sibTextLen * 0.3) {
      // 判断是否与最佳元素属于同类
      if (
        sibling.tagName === bestElement.tagName ||
        sibling.tagName.toLowerCase() === 'p' ||
        sibling.tagName.toLowerCase() === 'blockquote'
      ) {
        if (i < bestIndex) {
          container.insertBefore(
            sibling.cloneNode(true),
            container.firstChild
          );
        } else {
          container.appendChild(sibling.cloneNode(true));
        }
      }
    }
  }

  return container;
}

/**
 * Step 5: 精细清理
 * 只保留内容相关的HTML标签
 */
function cleanupElement(el) {
  const clone = el.cloneNode(true);

  // 保留的标签白名单
  const allowedTags = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'pre', 'code',
    'blockquote', 'figure', 'figcaption',
    'img', 'picture', 'source',
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'br', 'hr', 'span', 'sup', 'sub',
    'div', // 保留 div 作为容器
  ]);

  // 移除不允许的标签（保留其子内容）
  const walk = (node) => {
    const children = Array.from(node.childNodes);
    children.forEach(child => {
      if (child.nodeType === 1) { // ELEMENT_NODE
        const tag = child.tagName.toLowerCase();
        if (!allowedTags.has(tag)) {
          // 用子元素替换
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
          child.remove();
        } else {
          // 清除属性（只保留关键属性）
          cleanAttributes(child);
          walk(child);
        }
      }
    });
  };

  walk(clone);

  // 移除空元素
  removeEmptyElements(clone);

  return clone;
}

/**
 * 清除元素的无关属性
 */
function cleanAttributes(el) {
  const tag = el.tagName.toLowerCase();

  // 保留的属性映射
  const keepAttrs = {
    img: ['src', 'data-src', 'alt', 'title', 'width', 'height', 'srcset'],
    a: ['href', 'title'],
    source: ['srcset', 'type', 'media'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    code: ['class'], // 保留语言标记
    pre: ['class'],
  };

  const allowed = keepAttrs[tag] || [];
  const attrs = Array.from(el.attributes);
  attrs.forEach(attr => {
    if (!allowed.includes(attr.name)) {
      el.removeAttribute(attr.name);
    }
  });
}

/**
 * 移除空元素
 */
function removeEmptyElements(root) {
  const elements = root.querySelectorAll('*');
  // 反向遍历，从最深的子元素开始
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    const tag = el.tagName.toLowerCase();

    // 跳过自闭合标签
    if (['img', 'br', 'hr', 'source'].includes(tag)) continue;

    // 如果没有文本也没有子元素，移除
    if (!el.textContent.trim() && !el.querySelector('img, br, hr')) {
      el.remove();
    }
  }
}

/**
 * 构建返回结果
 */
function buildResult(element) {
  const html = element.innerHTML || element.outerHTML || '';
  const textContent = element.textContent || '';
  const images = element.querySelectorAll('img');

  return {
    html,
    textLength: textContent.trim().length,
    imageCount: images.length,
  };
}
