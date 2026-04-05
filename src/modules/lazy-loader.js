/**
 * 航海志 - 懒加载内容收集模块
 */

export async function scrollAndCollect(options = {}) {
  const {
    contentSelector,
    scrollStep = 500,
    maxIterations = 100,
    settleDelay = 200,
    maxTime = 60000,
  } = options;

  console.log('[Navigator] 懒加载收集启动');
  const startTime = Date.now();

  // 等待内容容器
  let contentContainer = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    contentContainer = document.querySelector(contentSelector);
    if (contentContainer) break;
    await delay(500);
  }

  if (!contentContainer) {
    console.warn('[Navigator] 未找到内容容器:', contentSelector);
    return null;
  }

  let scrollContainer = findScrollContainer(contentContainer);

  // 去重用
  const collectedIds = new Set();
  const accumulator = document.createElement('div');

  let iteration = 0;
  let lastCount = 0;
  let stagnantCount = 0;

  // 初始捕获
  captureBlocks(contentContainer, collectedIds, accumulator);
  console.log(`[Navigator] 初始: ${collectedIds.size} 块`);

  while (iteration < maxIterations) {
    if (Date.now() - startTime > maxTime) {
      console.log('[Navigator] 超时停止');
      break;
    }

    const currentCount = captureBlocks(contentContainer, collectedIds, accumulator);

    const scrollTop = scrollContainer.scrollTop ?? window.scrollY;
    const scrollHeight = scrollContainer.scrollHeight ?? document.documentElement.scrollHeight;
    const clientHeight = scrollContainer.clientHeight ?? window.innerHeight;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 50;

    if (atBottom) {
      console.log('[Navigator] 到达底部');
      break;
    }

    if (currentCount === lastCount) {
      stagnantCount++;
      if (stagnantCount >= 8) break;
    } else {
      stagnantCount = 0;
    }
    lastCount = currentCount;

    scrollContainer.scrollBy({ top: scrollStep, behavior: 'instant' });
    await delay(settleDelay);
    iteration++;
  }

  captureBlocks(contentContainer, collectedIds, accumulator);

  const textContent = accumulator.textContent || '';
  const images = accumulator.querySelectorAll('img');

  console.log(`[Navigator] 完成: ${collectedIds.size} 块, ${textContent.length} 字`);

  return {
    html: accumulator.innerHTML,
    textLength: textContent.trim().length,
    imageCount: images.length,
  };
}

function findScrollContainer(contentEl) {
  let parent = contentEl.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight + 100) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

/**
 * 捕获所有带 data-block-id 的块
 */
function captureBlocks(container, collectedIds, accumulator) {
  const blocks = container.querySelectorAll('[data-block-id]');

  blocks.forEach(block => {
    const blockId = block.getAttribute('data-block-id');
    if (blockId && !collectedIds.has(blockId)) {
      collectedIds.add(blockId);
      accumulator.appendChild(block.cloneNode(true));
    }
  });

  return collectedIds.size;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
