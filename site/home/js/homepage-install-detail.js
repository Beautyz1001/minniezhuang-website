/* Home / THE NEW IDENTITY CARD 的首屏入口。详情读取 Break 正式数据。 */
(() => {
  'use strict';
  const trigger = document.getElementById('installDetailTrigger');
  const overlay = document.getElementById('homeInstallDetail');
  const stage = document.getElementById('homeInstallDetailStage');
  const pages = document.getElementById('homeInstallDetailPages');
  const name = document.getElementById('homeInstallDetailName');
  const desc = document.getElementById('homeInstallDetailDesc');
  const close = document.getElementById('homeInstallDetailClose');
  const gsap = window.gsap;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const project = (window.BREAK_DATA || []).find(item => item.slug === 'the-new-identity-card');
  if (!trigger || !overlay || !stage || !pages || !name || !desc || !close || !project) return;

  let isOpen = false, priorFocus = null, pagesTarget = 0, pagesRaf = 0;
  const stopPagesScroll = () => { if (pagesRaf) cancelAnimationFrame(pagesRaf); pagesRaf = 0; };
  const pagesMaxScroll = () => Math.max(0, pages.scrollHeight - pages.clientHeight);
  const runPagesScroll = () => {
    if (pagesRaf) return;
    const step = () => {
      const delta = pagesTarget - pages.scrollTop;
      if (Math.abs(delta) < .5) { pages.scrollTop = pagesTarget; pagesRaf = 0; return; }
      pages.scrollTop += delta * .16;
      pagesRaf = requestAnimationFrame(step);
    };
    pagesRaf = requestAnimationFrame(step);
  };
  const fillDetail = () => {
    pages.innerHTML = project.pages.map((src, index) => `<img class="home-break-detail-page" src="../break/${src}" alt="${project.name} 第${index + 1}页" decoding="async">`).join('');
    pages.scrollTop = 0; pagesTarget = 0;
    name.textContent = project.name; desc.textContent = project.summary || '';
  };
  const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
  const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';
  const openDetail = () => {
    if (isOpen) return;
    isOpen = true; priorFocus = document.activeElement; fillDetail();
    overlay.setAttribute('aria-hidden', 'false'); overlay.classList.add('is-visible');
    if (window.__lenis) window.__lenis.stop();
    close.focus({ preventScroll: true });
    if (!gsap || reduceMotion) return;
    gsap.killTweensOf([overlay, stage]); gsap.set(overlay, { autoAlpha: 1, clipPath: DETAIL_SEED });
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(overlay, { clipPath: DETAIL_FULL, duration: .72, ease: 'expo.inOut' })
      .fromTo(stage, { y: 54, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.08, ease: 'expo.out' }, '-=.26');
  };
  const closeDetail = () => {
    if (!isOpen) return;
    isOpen = false; if (gsap) gsap.killTweensOf([overlay, stage]);
    overlay.setAttribute('aria-hidden', 'true'); stopPagesScroll(); if (window.__lenis) window.__lenis.start();
    const finish = () => {
      overlay.classList.remove('is-visible');
      if (gsap) gsap.set([overlay, stage], { clearProps: 'clipPath,opacity,visibility,transform' });
      if (priorFocus?.focus) priorFocus.focus({ preventScroll: true });
    };
    if (!gsap || reduceMotion) { finish(); return; }
    gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: finish })
      .to(overlay, { clipPath: DETAIL_SEED, duration: .56, ease: 'expo.inOut' })
      .to(overlay, { autoAlpha: 0, duration: .14, ease: 'power1.in' });
  };

  if (supportsHover && !reduceMotion && gsap) {
    const cursor = document.createElement('span');
    cursor.className = 'install-view-cursor'; cursor.textContent = 'VIEW'; cursor.setAttribute('aria-hidden', 'true'); document.body.append(cursor);
    gsap.set(cursor, { xPercent: -50, yPercent: -50 });
    const cursorX = gsap.quickTo(cursor, 'x', { duration: .18, ease: 'power3.out' });
    const cursorY = gsap.quickTo(cursor, 'y', { duration: .18, ease: 'power3.out' });
    let pointerX = null, pointerY = null, cursorFrame = 0;
    const hideCursor = () => {
      if (cursorFrame) cancelAnimationFrame(cursorFrame);
      cursorFrame = 0;
      cursor.classList.remove('is-visible');
      document.documentElement.classList.remove('install-view-cursor-active');
    };
    // 不依赖 pointerleave：滚轮会移动卡片而不是移动鼠标。提示可见时持续
    // 比较最后鼠标坐标和卡片实际矩形，离开即收起，也不会留下空转动画帧。
    const trackCursor = () => {
      cursorFrame = 0;
      if (!cursor.classList.contains('is-visible')) return;
      const rect = trigger.getBoundingClientRect();
      const isInside = pointerX >= rect.left && pointerX <= rect.right &&
        pointerY >= rect.top && pointerY <= rect.bottom;
      if (!isInside) { hideCursor(); return; }
      cursorFrame = requestAnimationFrame(trackCursor);
    };
    const showCursor = event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      const isEntering = !cursor.classList.contains('is-visible');
      if (isEntering) {
        gsap.set(cursor, { x: event.clientX, y: event.clientY });
      } else {
        cursorX(event.clientX);
        cursorY(event.clientY);
      }
      cursor.classList.add('is-visible');
      document.documentElement.classList.add('install-view-cursor-active');
      if (!cursorFrame) cursorFrame = requestAnimationFrame(trackCursor);
    };
    trigger.addEventListener('pointerenter', showCursor);
    trigger.addEventListener('pointermove', showCursor);
    trigger.addEventListener('pointerleave', hideCursor);
    trigger.addEventListener('click', hideCursor);
  }
  trigger.addEventListener('click', openDetail);
  close.addEventListener('click', closeDetail);
  document.addEventListener('keydown', event => { if (isOpen && event.key === 'Escape') closeDetail(); });
  pages.addEventListener('wheel', event => {
    event.preventDefault();
    pagesTarget = Math.min(pagesMaxScroll(), Math.max(0, pagesTarget + event.deltaY * 2.4));
    runPagesScroll();
  }, { passive: false });
  let dragStartY = 0, dragStartScroll = 0, dragging = false;
  pages.addEventListener('pointerdown', event => {
    dragging = true; stopPagesScroll(); dragStartY = event.clientY; dragStartScroll = pages.scrollTop;
    pagesTarget = pages.scrollTop; pages.classList.add('is-dragging'); pages.setPointerCapture(event.pointerId);
  });
  pages.addEventListener('pointermove', event => {
    if (!dragging) return;
    pages.scrollTop = Math.min(pagesMaxScroll(), Math.max(0, dragStartScroll - (event.clientY - dragStartY)));
    pagesTarget = pages.scrollTop;
  });
  const stopDragging = () => { dragging = false; pages.classList.remove('is-dragging'); };
  pages.addEventListener('pointerup', stopDragging);
  pages.addEventListener('pointercancel', stopDragging);
})();
