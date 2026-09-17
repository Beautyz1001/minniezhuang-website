/* Home / ALONE IN KYOTO 的局部交互。
   详情内容只读取 site/break/js/break-data.js 中的正式数据；这里不维护第二份文案或图片。 */

(() => {
  'use strict';

  const title = document.getElementById('kyoto-title');
  const imageTrigger = document.getElementById('kyotoDetailTrigger');
  const overlay = document.getElementById('homeKyotoDetail');
  const stage = document.getElementById('homeKyotoDetailStage');
  const pages = document.getElementById('homeKyotoDetailPages');
  const name = document.getElementById('homeKyotoDetailName');
  const desc = document.getElementById('homeKyotoDetailDesc');
  const close = document.getElementById('homeKyotoDetailClose');
  const gsap = window.gsap;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 与 Works 标题的 hover 同层级分工：外层 CSS 管红线，内层 GSAP 管 transform。
  if (title && supportsHover && !reduceMotion && gsap) {
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

  const project = (window.BREAK_DATA || []).find(item => item.slug === 'alone-in-kyoto');
  if (!imageTrigger || !overlay || !stage || !pages || !name || !desc || !close || !project) return;

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

  const fillDetail = () => {
    pages.innerHTML = project.pages
      .map((src, index) => `<img class="home-break-detail-page" src="../break/${src}" alt="${project.name} 第${index + 1}页" decoding="async">`)
      .join('');
    pages.scrollTop = 0;
    pagesTarget = 0;
    name.textContent = project.name;
    desc.textContent = project.summary || '';
  };

  const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
  const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';

  const openDetail = () => {
    if (isOpen) return;
    isOpen = true;
    priorFocus = document.activeElement;
    fillDetail();
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

  // 只在有悬停能力的桌面显示提示；quickTo 复用 tween，避免 pointermove 创建大量动画。
  if (supportsHover && !reduceMotion && gsap) {
    const cursor = document.createElement('span');
    cursor.className = 'kyoto-view-cursor';
    cursor.textContent = 'VIEW';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.append(cursor);
    gsap.set(cursor, { xPercent: -50, yPercent: -50 });
    const cursorX = gsap.quickTo(cursor, 'x', { duration: .18, ease: 'power3.out' });
    const cursorY = gsap.quickTo(cursor, 'y', { duration: .18, ease: 'power3.out' });
    let pointerX = null;
    let pointerY = null;
    let cursorFrame = 0;
    const hideCursor = () => {
      if (cursorFrame) cancelAnimationFrame(cursorFrame);
      cursorFrame = 0;
      cursor.classList.remove('is-visible');
      document.documentElement.classList.remove('kyoto-view-cursor-active');
    };
    // 卡片会随 Lenis/GSAP 在静止鼠标下移动；此时浏览器不会保证触发
    // pointerleave。提示显示期间直接用最后的鼠标坐标检查当前卡片边界。
    const trackCursor = () => {
      cursorFrame = 0;
      if (!cursor.classList.contains('is-visible')) return;
      const rect = imageTrigger.getBoundingClientRect();
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
      document.documentElement.classList.add('kyoto-view-cursor-active');
      if (!cursorFrame) cursorFrame = requestAnimationFrame(trackCursor);
    };
    imageTrigger.addEventListener('pointerenter', showCursor);
    imageTrigger.addEventListener('pointermove', showCursor);
    imageTrigger.addEventListener('pointerleave', hideCursor);
    imageTrigger.addEventListener('click', hideCursor);
  }

  imageTrigger.addEventListener('click', openDetail);
  title?.addEventListener('click', openDetail);
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
