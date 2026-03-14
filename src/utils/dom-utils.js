/**
 * 航海志 - DOM 工具函数
 */

/**
 * 获取元素的纯文本长度（不含子元素中的链接文本）
 */
export function getTextLength(el) {
  return (el.textContent || '').trim().length;
}

/**
 * 获取元素内所有链接文字的总长度
 */
export function getLinkTextLength(el) {
  const links = el.querySelectorAll('a');
  let total = 0;
  links.forEach(a => {
    total += (a.textContent || '').trim().length;
  });
  return total;
}

/**
 * 获取元素的 class 和 id 组合字符串（用于匹配规则）
 */
export function getClassIdString(el) {
  const className = el.className || '';
  const classStr = typeof className === 'string' ? className : '';
  return `${classStr} ${el.id || ''}`.toLowerCase();
}

/**
 * 检测元素是否可能是干扰元素
 */
export function isJunkElement(el) {
  const tag = el.tagName.toLowerCase();

  // 脚本和样式
  const removeTags = [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'form', 'button', 'input', 'select', 'textarea',
    'nav', 'footer', 'header',
  ];
  if (removeTags.includes(tag)) return true;

  // 检测 class / id 模式
  const classId = getClassIdString(el);
  const junkPatterns = [
    /comment/i, /sidebar/i, /side-bar/i, /widget/i,
    /footer/i, /header/i, /nav/i, /menu/i, /breadcrumb/i,
    /share/i, /social/i, /related/i, /recommend/i,
    /ad[-_]?/i, /advert/i, /banner/i, /sponsor/i,
    /popup/i, /modal/i, /overlay/i, /cookie/i,
    /subscribe/i, /newsletter/i, /signup/i,
    /toc/i, /table-of-contents/i,
    /author-bio/i, /byline/i,
  ];

  return junkPatterns.some(pattern => pattern.test(classId));
}

/**
 * 检测元素是否是内容容器的候选
 */
export function isContentCandidate(el) {
  const tag = el.tagName.toLowerCase();
  const classId = getClassIdString(el);

  const positivePatterns = [
    /article/i, /content/i, /post/i, /entry/i,
    /text/i, /body/i, /main/i, /story/i,
  ];

  if (['article', 'main'].includes(tag)) return true;
  return positivePatterns.some(pattern => pattern.test(classId));
}

/**
 * 清理HTML字符串中的多余空白
 */
export function cleanWhitespace(html) {
  return html
    .replace(/\n\s*\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 安全获取元素属性
 */
export function getAttr(el, attr) {
  try {
    return el.getAttribute(attr) || '';
  } catch {
    return '';
  }
}
