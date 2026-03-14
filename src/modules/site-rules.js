/**
 * 航海志 - 内置网站规则库
 * 针对常见网站优化内容提取精度
 */

const siteRules = [
  // ========== 技术社区 ==========
  {
    name: 'Medium',
    match: (url) => /medium\.com/.test(url),
    selectors: {
      content: 'article',
      title: 'h1',
      remove: [
        '[data-testid="headerSocialActions"]',
        '.pw-subtitle-paragraph',
        '.speechify-ignore',
        '[aria-label="responses"]',
        '.metabar',
      ],
    },
  },
  {
    name: 'Dev.to',
    match: (url) => /dev\.to/.test(url),
    selectors: {
      content: '#article-body',
      title: '#main-title',
      remove: [
        '.crayons-article__header__meta',
        '.crayons-reaction',
        '#comments',
        '.crayons-article__aside',
      ],
    },
  },
  {
    name: 'GitHub README',
    match: (url) => /github\.com.*/.test(url),
    selectors: {
      content: '#readme .markdown-body, .markdown-body',
      title: '[itemprop="name"] a, .js-issue-title',
      remove: [
        '.github-header-actions',
        '.file-navigation',
        '.repository-content > :not(#readme)',
      ],
    },
  },
  {
    name: 'CSS-Tricks',
    match: (url) => /css-tricks\.com/.test(url),
    selectors: {
      content: '.article-content, .entry-content',
      title: '.article-article h1, .entry-title',
      remove: [
        '.article-aside',
        '.widget',
        '#comments',
        '.ad',
      ],
    },
  },

  // ========== 中文网站 ==========
  {
    name: '微信公众号',
    match: (url) => /mp\.weixin\.qq\.com/.test(url),
    selectors: {
      content: '#js_content',
      title: '#activity-name, .rich_media_title',
      remove: [
        '#js_profile_qrcode',
        '#js_pc_qr_code',
        '.rich_media_tool',
        '.reward_qrcode_area',
        '.read-more__area',
        '.profile_inner',
        '#js_tags'
      ],
    },
  },
  {
    name: '知乎',
    match: (url) => /zhihu\.com/.test(url),
    selectors: {
      content: '.Post-RichTextContainer, .RichContent-inner',
      title: '.Post-Title, .QuestionHeader-title',
      remove: [
        '.ContentItem-actions',
        '.Post-topicsAndReviewer',
        '.RichContent-actions',
        '.CornerAnimay498',
        '.Reward',
        '.Post-SideActions',
        '.Comments-container',
      ],
    },
  },
  {
    name: '掘金',
    match: (url) => /juejin\.(cn|im)/.test(url),
    selectors: {
      content: '.article-content, .markdown-body',
      title: '.article-title',
      remove: [
        '.article-suspended-panel',
        '.article-end',
        '.recommended-area',
        '.comment-box',
        '.sidebar',
      ],
    },
  },
  {
    name: 'SegmentFault',
    match: (url) => /segmentfault\.com/.test(url),
    selectors: {
      content: '.article__content, .fmt',
      title: '.article__title h1',
      remove: [
        '.article__operation',
        '.article__tags',
        '#comment-area',
        '.widget',
      ],
    },
  },

  // ========== 新闻网站 ==========
  {
    name: 'BBC',
    match: (url) => /bbc\.(com|co\.uk)/.test(url),
    selectors: {
      content: 'article, [data-component="text-block"]',
      title: '#main-heading, h1',
      remove: [
        '[data-component="links-block"]',
        '[data-component="topic-list"]',
        '.ssrcss-1q0x1qg-Paragraph',
        'figure[data-component="image-block"] figcaption',
      ],
    },
  },
  {
    name: 'CNN',
    match: (url) => /cnn\.com/.test(url),
    selectors: {
      content: '.article__content, .zn-body__paragraph',
      title: '.pg-headline, h1.headline__text',
      remove: [
        '.el__embedded',
        '.zn-body__footer',
        '.cn-carousel-large-strip',
      ],
    },
  },
  {
    name: '澎湃新闻',
    match: (url) => /thepaper\.cn/.test(url),
    selectors: {
      content: '.news_txt, .newsDetail_content',
      title: 'h1.news_title, h1',
      remove: [
        '.news_about',
        '.comment_area',
        '.news_relation',
        '.news_tip',
      ],
    },
  },
];

/**
 * 根据 URL 查找匹配的规则
 * @param {string} url
 * @returns {Object|null}
 */
export function findSiteRule(url) {
  return siteRules.find(rule => rule.match(url)) || null;
}

/**
 * 使用规则提取内容
 * @param {Document} doc
 * @param {Object} rule
 * @returns {Element|null}
 */
export function applyRule(doc, rule) {
  // 先移除干扰元素
  if (rule.selectors.remove) {
    rule.selectors.remove.forEach(selector => {
      try {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        console.warn(`[Navigator] 移除失败: ${selector}`, e);
      }
    });
  }

  // 提取内容
  if (rule.selectors.content) {
    const selectors = rule.selectors.content.split(',').map(s => s.trim());
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el && el.textContent.trim().length > 100) {
        return el;
      }
    }
  }

  return null;
}

export default siteRules;
