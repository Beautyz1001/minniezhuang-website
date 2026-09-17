/* GAME DEMOS 卡片堆叠的桌面拖拽提示。卡片本身的拖拽与切换仍由 homepage-vr-stack.js 管理。 */
(() => {
  'use strict';
  const stack = document.querySelector('.vr-game-stack');
  const gsap = window.gsap;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stack || !gsap || !supportsHover || reduceMotion) return;

  const cursor = document.createElement('span');
  cursor.className = 'game-demo-drag-cursor';
  cursor.textContent = 'DRAG';
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
    document.documentElement.classList.remove('game-demo-drag-cursor-active');
  };

  // 和 Home 的 VIEW 一样：Lenis 或段内动画把卡片从静止鼠标下移走时，
  // pointerleave 不一定发生。提示可见时逐帧核对真实边界，离开即收起。
  const trackCursor = () => {
    cursorFrame = 0;
    if (!cursor.classList.contains('is-visible') || pointerX === null || pointerY === null) return;
    const rect = stack.getBoundingClientRect();
    const isInside = pointerX >= rect.left && pointerX <= rect.right &&
      pointerY >= rect.top && pointerY <= rect.bottom;
    if (!isInside) { hideCursor(); return; }
    cursorFrame = requestAnimationFrame(trackCursor);
  };

  const showCursor = event => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    const isEntering = !cursor.classList.contains('is-visible');
    // 先同步定位，再由现有 CSS opacity transition 显示，避免从上次位置滑入。
    if (isEntering) {
      gsap.set(cursor, { x: event.clientX, y: event.clientY });
    } else {
      cursorX(event.clientX);
      cursorY(event.clientY);
    }
    cursor.classList.add('is-visible');
    document.documentElement.classList.add('game-demo-drag-cursor-active');
    if (!cursorFrame) cursorFrame = requestAnimationFrame(trackCursor);
  };
  stack.addEventListener('pointerenter', showCursor);
  stack.addEventListener('pointermove', showCursor);
  stack.addEventListener('pointerleave', hideCursor);
})();
