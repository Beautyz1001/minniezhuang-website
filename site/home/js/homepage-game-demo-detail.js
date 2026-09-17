/* Home / GAME DEMOS 标题交互。
   详情内容直接读取 site/break/js/break-data.js；卡片切换后标题会打开当前项目的正式详情。 */

(() => {
  'use strict';

  const title = document.getElementById('gameDemoDetailTrigger');
  const overlay = document.getElementById('homeGameDemoDetail');
  const stage = document.getElementById('homeGameDemoDetailStage');
  const pages = document.getElementById('homeGameDemoDetailPages');
  const name = document.getElementById('homeGameDemoDetailName');
  const desc = document.getElementById('homeGameDemoDetailDesc');
  const close = document.getElementById('homeGameDemoDetailClose');
  const gsap = window.gsap;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!title || !overlay || !stage || !pages || !name || !desc || !close) return;

  // 与 Kyoto 完全同款：外层 CSS 管左侧红线，GSAP 只推动内层文字。
  if (supportsHover && !reduceMotion && gsap) {
    const titleInner = title.querySelector('.break-title-inner');
    const setTitleHover = hovering => {
      if (!titleInner) return;
      gsap.killTweensOf(titleInner);
      gsap.to(titleInner, hovering
        ? { x: 7, scaleX: 1.015, duration: .52, ease: 'power3.out', overwrite: 'auto' }
        : { x: 0, scaleX: 1, duration: .38, ease: 'sine.out', overwrite: 'auto' });
    };
    title.addEventListener('pointerenter', () => setTitleHover(true));
    title.addEventListener('pointerleave', () => setTitleHover(false));
  }

  let isOpen = false;
  let priorFocus = null;
  let pagesTarget = 0;
  let pagesRaf = 0;

  const stopPagesScroll = () => {
    if (!pagesRaf) return;
    cancelAnimationFrame(pagesRaf);
    pagesRaf = 0;
  };
  const pagesMaxScroll = () => Math.max(0, pages.scrollHeight - pages.clientHeight);
  const runPagesScroll = () => {
    if (pagesRaf) return;
    const step = () => {
      const delta = pagesTarget - pages.scrollTop;
      if (Math.abs(delta) < .5) {
        pages.scrollTop = pagesTarget;
        pagesRaf = 0;
        return;
      }
      pages.scrollTop += delta * .16;
      pagesRaf = requestAnimationFrame(step);
    };
    pagesRaf = requestAnimationFrame(step);
  };

  const currentProject = () => (window.BREAK_DATA || []).find(item => item.slug === title.dataset.projectSlug);
  const fillDetail = project => {
    pages.innerHTML = project.pages
      .map((src, index) => `<img class="home-break-detail-page" src="../break/${src}" alt="${project.name} 第${index + 1}页" decoding="async">`)
      .join('');
    pages.scrollTop = 0;
    pagesTarget = 0;
    name.textContent = project.name;
    desc.textContent = project.summary || '';
    overlay.setAttribute('aria-label', `${project.name} 项目详情`);
    close.setAttribute('aria-label', `关闭 ${project.name} 项目详情`);
  };

  const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
  const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';

  const openDetail = () => {
    const project = currentProject();
    if (isOpen || !project) return;
    isOpen = true;
    priorFocus = document.activeElement;
    fillDetail(project);
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-visible');
    if (window.__lenis) window.__lenis.stop();
    close.focus({ preventScroll: true });

    if (!gsap || reduceMotion) return;
    gsap.killTweensOf([overlay, stage]);
    gsap.set(overlay, { autoAlpha: 1, clipPath: DETAIL_SEED });
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(overlay, { clipPath: DETAIL_FULL, duration: .72, ease: 'expo.inOut' })
      .fromTo(stage, { y: 54, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: 1.08,
        ease: 'expo.out',
      }, '-=.26');
  };

  const closeDetail = () => {
    if (!isOpen) return;
    isOpen = false;
    if (gsap) gsap.killTweensOf([overlay, stage]);
    overlay.setAttribute('aria-hidden', 'true');
    stopPagesScroll();
    if (window.__lenis) window.__lenis.start();

    const finish = () => {
      overlay.classList.remove('is-visible');
      if (gsap) gsap.set([overlay, stage], { clearProps: 'clipPath,opacity,visibility,transform' });
      if (priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus({ preventScroll: true });
    };
    if (!gsap || reduceMotion) {
      finish();
      return;
    }
    gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: finish })
      .to(overlay, { clipPath: DETAIL_SEED, duration: .56, ease: 'expo.inOut' })
      .to(overlay, { autoAlpha: 0, duration: .14, ease: 'power1.in' });
  };

  title.addEventListener('click', openDetail);
  close.addEventListener('click', closeDetail);
  document.addEventListener('keydown', event => {
    if (isOpen && event.key === 'Escape') closeDetail();
  });
  pages.addEventListener('wheel', event => {
    event.preventDefault();
    pagesTarget = Math.min(pagesMaxScroll(), Math.max(0, pagesTarget + event.deltaY * 2.4));
    runPagesScroll();
  }, { passive: false });

  let dragStartY = 0;
  let dragStartScroll = 0;
  let dragging = false;
  pages.addEventListener('pointerdown', event => {
    dragging = true;
    stopPagesScroll();
    dragStartY = event.clientY;
    dragStartScroll = pages.scrollTop;
    pagesTarget = pages.scrollTop;
    pages.classList.add('is-dragging');
    pages.setPointerCapture(event.pointerId);
  });
  pages.addEventListener('pointermove', event => {
    if (!dragging) return;
    const next = dragStartScroll - (event.clientY - dragStartY);
    pages.scrollTop = Math.min(pagesMaxScroll(), Math.max(0, next));
    pagesTarget = pages.scrollTop;
  });
  const stopDragging = () => {
    dragging = false;
    pages.classList.remove('is-dragging');
  };
  pages.addEventListener('pointerup', stopDragging);
  pages.addEventListener('pointercancel', stopDragging);
})();
