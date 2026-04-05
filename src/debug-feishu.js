/**
 * 飞书 DOM 诊断 v2 - 查找内容丢失原因
 */
(function () {
  const r = {};

  // 1. contenteditable 元素详情
  const ce = document.querySelector('[contenteditable="true"]');
  if (ce) {
    r['contenteditable'] = {
      tag: ce.tagName,
      class: ce.className.slice(0, 100),
      textLength: (ce.textContent || '').length,
      childrenCount: ce.children.length,
      innerHTML_length: (ce.innerHTML || '').length,
      parentId: ce.parentElement?.id,
      parentClass: ce.parentElement?.className?.slice(0, 80),
    };

    // 前 3 个子元素
    r['contenteditable前3子元素'] = Array.from(ce.children).slice(0, 3).map((c, i) => ({
      index: i,
      tag: c.tagName,
      class: c.className.slice(0, 60),
      childrenCount: c.children.length,
      textLength: (c.textContent || '').length,
      textPreview: (c.textContent || '').slice(0, 80).replace(/\n/g, ' '),
    }));
  }

  // 2. data-block-id 有多少在 contenteditable 内
  const allBlocks = document.querySelectorAll('[data-block-id]');
  const blocksInside = ce ? ce.querySelectorAll('[data-block-id]') : [];
  r['blocks分布'] = {
    全部dataBlockId: allBlocks.length,
    在contenteditable内: blocksInside.length,
    在contenteditable外: allBlocks.length - blocksInside.length,
  };

  // 3. editor-container 详情
  const ec = document.querySelector('.editor-container');
  if (ec) {
    r['editor-container'] = {
      tag: ec.tagName,
      textLength: (ec.textContent || '').length,
      childrenCount: ec.children.length,
      isContentEditable: ec.getAttribute('contenteditable'),
      parentClass: ec.parentElement?.className?.slice(0, 80),
    };
  }

  // 4. body 各级子元素文本分布
  const body = document.body;
  r['body直接子元素'] = Array.from(body.children).map((c, i) => ({
    index: i,
    tag: c.tagName,
    class: c.className.slice(0, 50),
    textLength: (c.textContent || '').length,
  }));

  // 5. 表格是否在 contenteditable 内
  const table = document.querySelector('table');
  if (table) {
    r['表格位置'] = {
      在contenteditable内: !!table.closest('[contenteditable="true"]'),
      在editorContainer内: !!table.closest('.editor-container'),
      表格textLength: (table.textContent || '').length,
    };
  }

  chrome.runtime.sendMessage({ type: 'FEISHU_DIAG', data: r });
})();
