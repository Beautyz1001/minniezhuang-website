/* ======================================================================
   首屏大标题 hover：跟焦（rack focus）
   ======================================================================

   为什么是"对焦"：
   PITFALLS [2026-09-04] 定过——**电影感来自镜头的物理行为（对焦、曝光、景深），
   不是几何遮罩**。入场动画最后落在"合焦"上就是这条。hover 走同一套语言的另一半：
   **跟焦**。光标进到大字这一带，镜头把焦点交给你；你指的地方是实的，两侧化开；
   光标移动，焦点被"拉"着跟过去。

   同一条 PITFALLS 也把"逐字翻出／字符错位"判为网页动效，所以这里**一个字母都不拆**，
   动的是整行的虚实。

   ---- 层次：为什么是「真的变虚 + 一份清晰的拷贝」 ----

   第一版做反了：真标题不动，上面盖一份**虚的**拷贝。结果底下那份清晰的
   从来没被藏掉，两层叠出来是「清晰的字 + 一圈红雾」——那是**辉光**，不是失焦。
   （模糊会把边缘的不透明度压低，所以虚的一层永远盖不住清晰的一层，
   这不是调参能解决的，是层次搞反了。）

   现在是反过来的：
     · **真标题整体变虚**（`filter: blur`，虚的程度由 --defocus-live 控制）。
     · 上面盖一份**清晰的拷贝**，只在焦点那个窗口里露出来（遮罩）。
   于是「该虚的地方，清晰的那份根本不在」，这才是真的景深。

   ---- 四条不能碰 ----

   1. **拷贝必须是 .title-row 的兄弟，不能是它的孩子。**
      父元素的 filter 会作用到所有后代——放进去的话拷贝会跟着一起虚，等于白做。
      它由 JS 按真标题量出来的矩形定位，所以两层严丝合缝。

   2. **模糊在真标题上（值稳定），遮罩在拷贝上（每帧在动）。**
      反过来的话，每帧变遮罩会让浏览器把整条效果链连模糊一起重跑——
      286px 的字上做模糊是这里最贵的一步。现在扫动过程中模糊值不变，
      那张虚图只栅格化一次；每帧变的只是一份清晰文字怎么被裁。

   3. **淡入淡出时模糊值要量化。** 模糊半径每变一次就要重栅格化一次整行。
      淡入那 0.2 秒里若逐帧连续变，就是十几次重栅格化，Intel 核显上会顿一下。
      量化成 2px 一档之后，整段淡入只有七八次。

   4. **焦点必须有迟滞。** 跟焦员拧的是一个有重量的环，焦点是被拉过去的。
      去掉 TAU，效果立刻变成一个跟着鼠标跑的放大镜——那是网页控件，不是镜头。
      另外失焦的边界是**横向的带，不是圆洞**：画面里所有字母离镜头一样远，
      焦点落在某处、向两侧衰减才读得出是景深；挖个圆洞会读成"有盏灯在照它"。

   静止时拷贝 visibility:hidden、真标题 filter:none，页面回到没有这个文件时的状态。

   调试把手：
     __titleFocus.set({ BLUR: 0.08, SPAN: 1.1, TAU: 0.45 })
     __titleFocus.off() / .on()
====================================================================== */

(() => {
  'use strict';

  const TUNE = {
    /* 失焦有多虚。单位 em（跟着字号缩放）。标题字号约 286px 时 0.05em ≈ 14px。
       太小读不出是"虚"，只像字脏了；太大整行糊成色块，名字的形都没了。 */
    BLUR: 0.05,

    /* 清晰窗口的半宽，单位 em。这是"景深"有多浅：
       小 = 浅景深，只有一两个字母是实的，戏剧性强；
       大 = 深景深，大半行都清楚，更含蓄。 */
    SPAN: 1.5,

    /* 窗口正中"完全清晰"那段占 SPAN 的比例，其余是过渡。
       0 = 只有一个点是实的（尖），1 = 硬边（假）。 */
    CORE: 0.35,

    /* 焦点追上光标的时间常数（秒）= 镜头的重量。
       0.3 能读出是被拉过去的；低于 0.1 就变成放大镜了。 */
    TAU: 0.3,

    /* 竖直方向的感应范围，单位 = 标题自身高度的倍数。
       光标飘到门那一带时就完全不生效。 */
    REACH_Y: 0.75,

    /* 整体淡入淡出的时间常数（秒）。比 TAU 快：
       焦点该是慢慢拉的，但"镜头开始工作"这件事本身要跟手。 */
    FADE: 0.18,

    /* 模糊值的量化档距（px）。见上面第 3 条。 */
    BLUR_STEP: 2
  };

  const root = document.documentElement;
  const hero = document.getElementById('hero');
  const titleRow = document.querySelector('.title-row');
  const heroText = document.querySelector('.hero-text');
  if (!hero || !titleRow || !heroText) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ---------- 那份清晰的拷贝 ----------
     带 title-row 类是为了继承同一套排版（字体/字号/行高/nowrap）；
     里面同样是 .word / .word-left / .word-right，样式表那两条 transform
     会照常作用在它身上，滚动一动两层同步走。
     位置由 JS 按真标题的矩形写死，所以两层重合到亚像素。 */
  const sharp = document.createElement('div');
  sharp.className = 'title-row title-sharp';
  sharp.setAttribute('aria-hidden', 'true');
  sharp.innerHTML = titleRow.innerHTML;
  heroText.appendChild(sharp);

  /* ---------- 状态 ---------- */
  let enabled = true, running = false, lastT = 0;
  let mx = -1e9, my = -1e9;
  let fx = 0.5;        // 焦点位置 0..1（相对标题行宽），带迟滞
  let amt = 0;         // 效果强度 0..1
  let box = null;      // 标题行矩形（相对 .hero-text），缓存
  let lastBlurPx = -1;

  function measure() {
    const a = titleRow.getBoundingClientRect();
    const b = heroText.getBoundingClientRect();
    box = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height,
            top: a.top, bottom: a.bottom, left: a.left };
    sharp.style.left   = box.x.toFixed(2) + 'px';
    sharp.style.top    = box.y.toFixed(2) + 'px';
    sharp.style.width  = box.w.toFixed(2) + 'px';
    sharp.style.height = box.h.toFixed(2) + 'px';
  }
  const remeasure = () => { box = null; };
  window.addEventListener('resize', remeasure);
  window.addEventListener('scroll', remeasure, { passive: true });
  if (document.fonts) document.fonts.ready.then(remeasure);

  /* 闸门：入场没在演、标题没顶着入场遮罩、滚动还没把两个词推开。
     最后一条读的是滚动自己写的 --left-x（行内样式，不触发布局）。
     入场用的也是 .title-row 的 filter，靠这道闸门保证两者永不同时在场。 */
  function gateOpen() {
    if (!enabled) return false;
    if (root.classList.contains('intro-armed')) return false;
    if (titleRow.classList.contains('intro-reveal')) return false;
    const lx = parseFloat(hero.style.getPropertyValue('--left-x'));
    return !(Math.abs(lx) > 0.3);
  }

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - (lastT || now)) / 1000));
    lastT = now;

    const open = gateOpen();
    if (open && !box) measure();

    let target = 0, targetX = fx;
    if (open && box && box.w > 0) {
      const reach = box.h * TUNE.REACH_Y;
      const dy = Math.max(0, Math.max(box.top - my, my - box.bottom));
      const f = Math.min(Math.max(1 - dy / reach, 0), 1);
      target = f * f * (3 - 2 * f);                   // smoothstep，边界要软
      targetX = Math.min(Math.max((mx - box.left) / box.w, -0.2), 1.2);
    }

    amt += (target - amt) * (1 - Math.exp(-dt / Math.max(0.016, TUNE.FADE)));
    /* 焦点只在效果亮着时才跟——否则光标在别处乱晃时焦点会在看不见的地方
       偷偷滑动，下次淡入就从一个莫名其妙的位置开始。 */
    if (target > 0.001) fx += (targetX - fx) * (1 - Math.exp(-dt / Math.max(0.016, TUNE.TAU)));

    if (amt < 0.002 && target === 0) {
      amt = 0; lastBlurPx = -1;
      titleRow.classList.remove('focus-on');
      titleRow.style.removeProperty('--defocus-live');
      sharp.style.removeProperty('opacity');
      sharp.style.removeProperty('--fx');
      running = false; lastT = 0;
      return;
    }

    titleRow.classList.add('focus-on');

    /* 模糊值量化：每变一次就要把整行重新栅格化一次（见文件头第 3 条）。 */
    const fs = parseFloat(getComputedStyle(titleRow).fontSize);
    const step = Math.max(0.5, TUNE.BLUR_STEP);
    const blurPx = Math.round(amt * TUNE.BLUR * fs / step) * step;
    if (blurPx !== lastBlurPx) {
      lastBlurPx = blurPx;
      titleRow.style.setProperty('--defocus-live', blurPx + 'px');
    }

    sharp.style.setProperty('--fx', (fx * 100).toFixed(2) + '%');
    sharp.style.opacity = amt.toFixed(3);
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running) return;
    running = true; lastT = 0;
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', ev => {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    mx = ev.clientX; my = ev.clientY;
    if (gateOpen()) wake();
  }, { passive: true });

  const bail = () => { mx = my = -1e9; if (amt > 0) wake(); };
  window.addEventListener('pointerleave', bail);
  window.addEventListener('blur', bail);
  window.addEventListener('scroll', () => { if (amt > 0) wake(); }, { passive: true });

  function applyTune() {
    const s = sharp.style;
    s.setProperty('--focus-span', TUNE.SPAN + 'em');
    s.setProperty('--focus-core', String(TUNE.CORE));
  }
  applyTune();

  window.__titleFocus = {
    TUNE,
    state: () => ({ enabled, running, amt, fx, blurPx: lastBlurPx, mx, my,
                    open: gateOpen(), box }),
    set(patch) { Object.assign(TUNE, patch); applyTune(); lastBlurPx = -1; wake(); return TUNE; },
    on()  { enabled = true; wake(); },
    off() { enabled = false; wake(); }
  };
})();
