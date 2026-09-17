/* Works 项目详情弹窗（Home 专用）——只服务 Works 轮播那四张精选卡片。
   点开的四个项目和图片直接读 window.WORKS_DATA（site/works/js/works-data.js
   原样引用，见 index.html 的 <script> 顺序），内容只有一份。
   PREV/NEXT 只在这四张之间循环，不含 Works 页里第五个项目（YOUDAO DICTIONARY）。 */

(() => {
  'use strict';

  const SLUGS = ['paradox-heaven', 'nba2k-online', 'fantasy-westward-journey', 'shanghai-1924'];
  const ASSET_BASE = '../works/'; // works-data.js 里的路径是相对 site/works/ 写的

  const overlay  = document.getElementById('homeWorksDetail');
  const stage    = document.getElementById('homeWorksDetailStage');
  const pagesEl  = document.getElementById('homeDetailPages');
  const nameZhEl = document.getElementById('homeDetailNameZh');
  const descEl   = document.getElementById('homeDetailDesc');
  const linksEl  = document.getElementById('homeDetailLinks');
  const closeBtn = document.getElementById('homeWorksClose');
  const prevBtn  = document.getElementById('homeNavPrev');
  const nextBtn  = document.getElementById('homeNavNext');
  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!overlay || !stage || !pagesEl || !window.WORKS_DATA) return;

  const projects = SLUGS
    .map(slug => window.WORKS_DATA.find(p => p.slug === slug))
    .filter(Boolean);
  if (!projects.length) return;

  let current = 0;
  let isOpen = false;
  let clearTimer = null;

  // pages 数组里每一项可能是字符串，也可能是 { src, full }（NBA2K 那种
  // 带高清大图的写法）——画廊只需要 src，逻辑照抄 works.js 的 pageSrc()。
  const pageSrc = page => (typeof page === 'string' ? page : page.src);

  function fill(index) {
    const project = projects[index];
    pagesEl.innerHTML = project.pages
      .map((page, i) => `<img class="home-works-detail-page" src="${ASSET_BASE}${pageSrc(page)}" alt="${project.name} 第${i + 1}页" decoding="async">`)
      .join('');
    pagesEl.scrollLeft = 0;
    pagesScrollTarget = 0;
    nameZhEl.textContent = project.nameZh || project.name;
    descEl.textContent = project.summary || '';
    linksEl.innerHTML = (project.links || [])
      .map(link => `<a class="home-works-detail-link" href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`)
      .join('');
    updateNavState();
  }

  // 第一个项目 PREV / 最后一个项目 NEXT 变灰不可点，不再首尾循环。
  function updateNavState() {
    const atFirst = current === 0;
    const atLast = current === projects.length - 1;
    prevBtn.disabled = atFirst;
    nextBtn.disabled = atLast;
  }

  function openDetail(slug) {
    const index = projects.findIndex(p => p.slug === slug);
    if (index < 0) return;
    current = index;
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    fill(current);
    overlay.setAttribute('aria-hidden', 'false');
    isOpen = true;
    // 锁住背景 Lenis 滚动，和 homepage-portal-carousel.js 里轮播区域锁定视口
    // 用的是同一套 API，弹窗打开期间滚轮只驱动图带，不驱动首页背景。
    if (window.__lenis) window.__lenis.stop();
    overlay.classList.add('is-visible');

    // 与 Works 总览页详情严格同一套开场：先扩开全屏裁切，再让图带、说明和外链
    // 作为一个 stage 从画面下方升入。位移量按当下可见内容高度的半数计算，
    // 不写死像素，因此不同视口与所有 Home 入口都会保留同一镜头比例。
    if (!gsap || reduceMotion) return;
    const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
    const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';
    gsap.killTweensOf([overlay, stage]);
    gsap.set(overlay, { autoAlpha: 1, clipPath: DETAIL_SEED });
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(overlay, { clipPath: DETAIL_FULL, duration: .72, ease: 'expo.inOut' })
      .addLabel('rise')
      .fromTo(stage, {
        y: () => {
          const contentTop = pagesEl.getBoundingClientRect().top;
          const contentBottom = overlay.querySelector('.home-works-detail-info').getBoundingClientRect().bottom;
          return (contentBottom - contentTop) * .5;
        },
      }, {
        y: 0,
        duration: 1.33,
        ease: 'expo.out',
      }, 'rise')
      .fromTo(stage, { autoAlpha: 0 }, {
        autoAlpha: 1,
        duration: 1.33,
        ease: 'sine.out',
      }, 'rise');
  }

  function closeDetail() {
    if (!isOpen) return;
    isOpen = false;
    if (gsap) gsap.killTweensOf([overlay, stage]);
    overlay.setAttribute('aria-hidden', 'true');
    stopPagesScrollLoop();
    if (window.__lenis) window.__lenis.start();

    const finish = () => {
      overlay.classList.remove('is-visible');
      if (gsap) gsap.set([overlay, stage], { clearProps: 'clipPath,opacity,visibility,transform' });
      // 等退场完成才清空图带，避免关闭途中先露出空白。
      clearTimer = setTimeout(() => { pagesEl.innerHTML = ''; }, 0);
    };
    if (!gsap || reduceMotion) {
      finish();
      return;
    }
    const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
    gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: finish })
      .to(overlay, { clipPath: DETAIL_SEED, duration: .56, ease: 'expo.inOut' })
      .to(overlay, { autoAlpha: 0, duration: .14, ease: 'power1.in' });
  }

  function step(delta) {
    const next = current + delta;
    if (next < 0 || next >= projects.length) return;
    current = next;
    fill(current);
  }

  closeBtn.addEventListener('click', closeDetail);
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  // 滚轮驱动图带横向滚动，逻辑照抄 site/works/js/works.js 的同名实现
  // （lerp 追赶 scrollLeft，避免原生 scroll-behavior:smooth 在高频滚轮下打架）。
  const WHEEL_FORCE = 2.4;
  const PAGES_EASE = 0.16;
  let pagesScrollTarget = 0;
  let pagesScrollRaf = null;

  function stopPagesScrollLoop() {
    if (!pagesScrollRaf) return;
    cancelAnimationFrame(pagesScrollRaf);
    pagesScrollRaf = null;
  }

  function pagesMaxScroll() {
    return Math.max(0, pagesEl.scrollWidth - pagesEl.clientWidth);
  }

  function runPagesScrollLoop() {
    if (pagesScrollRaf) return;
    const step = () => {
      const current = pagesEl.scrollLeft;
      const diff = pagesScrollTarget - current;
      if (Math.abs(diff) < 0.5) {
        pagesEl.scrollLeft = pagesScrollTarget;
        pagesScrollRaf = null;
        return;
      }
      pagesEl.scrollLeft = current + diff * PAGES_EASE;
      pagesScrollRaf = requestAnimationFrame(step);
    };
    pagesScrollRaf = requestAnimationFrame(step);
  }

  pagesEl.addEventListener('wheel', event => {
    event.preventDefault();
    pagesScrollTarget = Math.min(pagesMaxScroll(), Math.max(0, pagesScrollTarget + event.deltaY * WHEEL_FORCE));
    runPagesScrollLoop();
  }, { passive: false });

  document.addEventListener('keydown', event => {
    if (!isOpen) return;
    if (event.key === 'Escape') closeDetail();
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
  });

  window.__homeWorksDetail = { open: openDetail, close: closeDetail };
})();
