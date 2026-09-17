/* ======================================================================
   首屏：加载 → 入场
   ======================================================================

   整段是一个连续的动作，不是"加载动画 + 入场动画"两截：

     1. 黑场里，门洞将要出现的那个位置上，一条洋红在从中间往两边长。
        整幕就这一条，没有别的东西——连百分比数字都去掉了：
        条有多长已经把进度说清楚了，再放一行数字是同一件事说两遍。
     2. 走满之后先收成一个点，再从那个点开成门洞的形状——**它就是门洞**。
        位置和尺寸都是按门洞的真实几何算的，所以这不是"像"，是同一个矩形。
     3. 黑幕撤掉。房间显形（还是暗的）。
     4. 真的门在同一个位置亮起来，进度条那块矩形同时淡出，
        观众看到的是"这块矩形通电了"。
     5. 标题从正中间往两边展开，两端最后浮现。
     6. 小字、导航到位。

   为什么用 canvas 整层的不透明度当"灯"：门外的背景本来就是接近纯黑的，
   一层接近黑的底 + 逐渐显形的光，物理上就等于这盏灯从暗到亮。
   真去动 3D 里的灯要每帧重画整个场景（滚动时实测 30ms 一帧），
   开场这几秒会掉到 30fps，反而不丝滑。合成层的不透明度是免费的。

   **进度是真的。** 它不是一条定时跑完的假进度：三个真实信号
   （字体就绪 / window.load / 3D 初始化完成）到齐了，条才会走满。
   中间的长度是平滑估算——没有办法预先知道总字节数，这一点必须诚实。
   两条护栏：最短 MIN_MS（东西都在缓存里时不至于一闪而过，那样读不出是加载），
   最长 MAX_MS（有资源卡住也不能把页面永远锁在黑场里）。

   与滚动动画的分工见 css/homepage-portal.css 里「入场动画」那段注释：
   这里只碰 canvas 的 opacity、.title-row 的 transform / filter、
   以及小字自己的 --intro-eyebrow-y / filter。滚动那一套用的通道一个没碰。

   三种情况整段跳过（加载和入场一起跳，不能只跳一半）：
     · 用户在系统里关掉了动画效果（prefers-reduced-motion）
     · 打开时页面不在顶部（刷新前滚到一半，再放开场就很怪）
     · GSAP 没加载出来
   ====================================================================== */

(function () {
  'use strict';

  /* 标题入场的两个起点。主角是"从中间往两边展开"（遮罩，见 CSS 里的
     .title-row.intro-reveal），下面这两个只是给展开加一点镜头味道的配角，
     不能盖过展开本身——所以模糊量比单做合焦那版小一半多。

     模糊按标题实际字号折算，不是固定像素：标题字号随视口变（1440 宽时约 300px），
     写死 20px 会在窄屏糊成一团、在宽屏几乎看不出来。 */
  const TITLE_BLUR_RATIO = 0.032;   // 字高的 3.2%
  const TITLE_SCALE_FROM = 1.022;   // 失焦的东西看起来会大一点，合焦时收回来

  /* 加载条的两条时间护栏，和它的尺寸（按参考图定的）。 */
  /* 调试：加 ?intro=slow 把加载那一幕拉长到 8 秒，方便截图看细节。
     本地全在缓存里时加载只要几百毫秒，正常速度下根本截不到那一帧。
     和 ?3d=0 一样，只是个开发用的开关，不影响正常访问。 */
  const SLOW = new URLSearchParams(location.search).get('intro') === 'slow';

  const MIN_MS   = SLOW ? 8000 : 1500;  // 最短停留：都在缓存里时也要看得清是在加载
  const MAX_MS   = SLOW ? 12000 : 6000; // 最长等待：有东西卡住也得放行，不能锁死页面
  const BAR_T    = 2.5;             // 条有多粗（px）
  const BAR_W    = () => Math.min(200, Math.max(120, innerWidth * 0.12));
  /* 光晕比条本身大多少倍。横向只多一点点（光稍微溢出两端），
     纵向要大得多——一条细亮线的晕本来就主要在上下。
     这两个数一起决定"发光"有多明显；再往上调就从"发光"变成"糊了"。 */
  const GLOW_X   = 1.10;
  const GLOW_Y   = 7;

  /* 整个 canvas 图层从多大开始放。
     这个数**同时决定了"点"有多大**——两者必须是同一个数，见下面的解释。
     调小 → 从更小的一点长起，动作更大；调到 1 就没有放大这回事了。 */
  const CANVAS_SCALE_FROM = 0.19;

  /* 门洞长出来之后，隔多久文字才开始出现（秒，相对入场时间轴起点）。
     门洞的放大要 1.9 秒，这个值就是"门站稳了再让文字来"的那口气。
     调小 → 文字追得紧，两件事糊在一起；调大 → 门洞独处更久。
     小字和导航都挂在它后面（+0.3 / +0.65），改一个数整组跟着挪。 */
  const TITLE_AT = 1.55;

  const root = document.documentElement;
  const disarm = () => root.classList.remove('intro-armed');

  /* <head> 里那行内联脚本没跑（比如这个文件被单独引用），就什么都不做。 */
  if (!root.classList.contains('intro-armed')) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || window.scrollY > 4 || !window.gsap) { disarm(); return; }

  const hero   = document.getElementById('hero');
  const veil   = document.querySelector('.intro-veil');
  const canvas = document.getElementById('portal-canvas');
  const nav    = document.querySelector('.site-nav');
  const eyebrow = document.querySelector('.eyebrow');
  const titleRow = document.querySelector('.title-row');
  const loader = document.querySelector('.intro-loader');
  const bar    = document.querySelector('.loader-bar');
  const glow   = document.querySelector('.loader-glow');

  if (!veil || !titleRow || !loader) { disarm(); return; }

  /* ==================================================================
     门洞的真实几何
     ==================================================================
     进度条要"变成门洞"，就不能自己编一个矩形。
     `homepage-portal.js` 每帧把门洞的四条边写成 --clip-* （百分比）挂在 .hero 上，
     页面在顶部时那就是门洞此刻的位置。这里只读，不写。
     读不到就退回锁定表里 camera.z = 0 那一行的数值。 */
  function doorBox() {
    const cs = hero ? getComputedStyle(hero) : null;
    const v = (k, fallback) => {
      const raw = cs && parseFloat(cs.getPropertyValue(k));
      return Number.isFinite(raw) ? raw : fallback;
    };
    const t = v('--clip-t', 36.85), b = v('--clip-b', 53.65);
    const l = v('--clip-l', 49.30), r = v('--clip-r', 49.10);
    /* 量 .hero 自己的宽高，不能用 innerWidth/innerHeight——后者把滚动条也算进去了
       （差十几个像素）。3D 那边也是这么量的，两边必须用同一把尺子，
       否则"点"和门洞会差出零点几个像素，放大之后就看得见了。 */
    const W = hero ? hero.clientWidth  : innerWidth;
    const H = hero ? hero.clientHeight : innerHeight;
    return {
      w: Math.max(2, W * (100 - l - r) / 100),
      h: Math.max(2, H * (100 - t - b) / 100)
    };
  }

  /* ==================================================================
     真实的加载信号
     ==================================================================
     三件事，到齐才算 100。每件事的权重一样——这里没有字节数可以称重，
     所以按"里程碑"数，而不是假装在按进度百分比走。 */
  let done = 0;
  const TOTAL = 3;
  const bump = () => { done++; };

  /* ① 字体。标题字号是量出来的，字体没到位量的是回退字体的宽度。 */
  (document.fonts && document.fonts.ready
    ? document.fonts.ready
    : Promise.resolve()).then(bump);

  /* ② 页面所有子资源（图片、脚本、贴图）。 */
  if (document.readyState === 'complete') bump();
  else window.addEventListener('load', bump, { once: true });

  /* ③ 3D 初始化完成。它是 module，什么时候跑完不确定，只能轮询。
        轮询间隔放长一点——这段时间画面是静止的黑场，不需要抢这几毫秒。 */
  (function wait3D() {
    if (window.__portal3D) return bump();
    setTimeout(wait3D, 60);
  })();

  requestAnimationFrame(runLoader);

  /* ==================================================================
     第一幕：加载
     ================================================================== */
  function runLoader() {
    const gsap = window.gsap;
    const box  = doorBox();
    const t0   = performance.now();

    /* 盒子就是门洞那么大，靠两个 scale 把它拉成一条线。
       之后"变成门洞"只需要把两个 scale 收回 1——全程只有合成，不重排。

       **长度本身就是进度**：没有轨道、没有填充层，光有多长就是加载到哪儿了。
       所以 scaleX 由进度算出来，从 SEED（中间一个小点）长到 barMax。 */
    const barMax = BAR_W();
    /* 把"想要多少像素宽"换算成 scaleX。盒子本身是门洞那么大，所以
       scaleX = 目标宽度 / 门洞宽度。粗细同理，全程是 BAR_T，直到最后开成门。 */
    const sx = px => px / box.w;
    const sy = px => px / box.h;
    const spanX = p => sx(BAR_T + (barMax - BAR_T) * p);

    bar.style.width  = box.w + 'px';
    bar.style.height = box.h + 'px';
    /* xPercent/yPercent 由 GSAP 和 scale 一起合成，
       所以这两行既把进度条钉在锚点正中，又不会和缩放打架。 */
    gsap.set(bar, {
      xPercent: -50, yPercent: -50,
      scaleX: spanX(0), scaleY: sy(BAR_T)
    });
    /* 光晕跟条同一个盒子、同一个锚点，只是缩放各自乘一个倍数。 */
    glow.style.width  = box.w + 'px';
    glow.style.height = box.h + 'px';
    gsap.set(glow, {
      xPercent: -50, yPercent: -50,
      scaleX: spanX(0) * GLOW_X, scaleY: sy(BAR_T) * GLOW_Y
    });
    gsap.set(loader, { opacity: 1 });
    gsap.set(veil,   { opacity: 1, visibility: 'visible' });
    gsap.set(canvas, { opacity: 0 });
    disarm();

    /* 加载还没走完用户就滚了：整段开场作废，直接把页面交出去。
       不能只跳过入场——进度条变门洞那一下是按"页面在顶部"算的几何，
       页面一滚门就移位了，再演下去矩形会落在错的地方。 */
    let aborted = false;
    function abort() {
      if (aborted) return;
      aborted = true;
      gsap.killTweensOf([shown, bar, glow, loader, veil, canvas]);
      /* 第二幕已经建好了（就等着播），作废时要连它和它写下的起始状态一起收干净，
         否则标题会永远停在"透明 + 模糊"的入场起点上，页面等于是空的。 */
      if (introTl) introTl.kill();
      titleRow.classList.remove('intro-reveal');
      gsap.set([nav, eyebrow, titleRow], { clearProps: 'all' });
      /* canvas 的不透明度是加载那一步按到 0 的，作废时必须还回去，
         否则 3D 那一层会一直是隐形的。 */
      gsap.set(canvas, { clearProps: 'opacity' });
      loader.remove();
      veil.remove();
      window.removeEventListener('wheel', abort);
      window.removeEventListener('touchstart', abort);
    }
    window.addEventListener('wheel', abort, { passive: true });
    window.addEventListener('touchstart', abort, { passive: true });

    /* 显示值追着真实进度走。用一个补间去追，而不是直接跳——
       信号是一件一件到的（0 → 1/3 → 2/3 → 1），直接赋值会看到条一格一格蹦。 */
    const shown = { p: 0 };
    const render = () => {
      gsap.set(bar,  { scaleX: spanX(shown.p) });
      gsap.set(glow, { scaleX: spanX(shown.p) * GLOW_X });
    };
    render();

    let settling = false;
    (function tick() {
      if (aborted) return;
      const elapsed = performance.now() - t0;
      const allIn   = done >= TOTAL;
      const timeout = elapsed >= MAX_MS;

      /* 东西还没到齐时，最高只让它爬到 0.92：
         100 必须真的意味着"好了"，不能先冲到 100 再干等。 */
      let target = allIn ? 1 : Math.min(0.92, done / TOTAL + 0.08);

      /* 到齐了但还没到最短时长，就先卡在 0.97 匀速磨一会儿，
         等时间够了再走完最后三格。 */
      if (allIn && elapsed < MIN_MS) target = 0.97;

      if (Math.abs(target - shown.p) > 0.001) {
        gsap.to(shown, {
          p: target,
          duration: 0.55,
          ease: 'power1.out',
          onUpdate: render,
          overwrite: true
        });
      }

      if (!settling && ((allIn && elapsed >= MIN_MS) || timeout)) {
        settling = true;
        gsap.to(shown, {
          p: 1, duration: 0.4, ease: 'power2.out',
          onUpdate: render, overwrite: true, onComplete: morph
        });
        return;
      }
      setTimeout(tick, 100);
    })();

    /* ---------- 收成一个点 ----------
       这一段**只做收拢**。点长成门是第二幕的第一个动作，不在这里。

       **收到多小是算出来的，不是挑的。**
       之前收到 4×4，而门洞第一帧是 12×26——差三到六倍。
       两个不同大小的东西交叉淡出，无论曲线怎么调都会读成"断"，
       因为观众看到的本来就是"一个点没了，另一个地方出现了一扇门"。

       现在收到的尺寸 = 门洞在 CANVAS_SCALE_FROM 那一刻的尺寸，
       也就是**第二幕第一帧的门洞本身**。点和门从此是同一个矩形，
       接下来两者一起放大、一个淡出一个淡入，几何上完全重合，没有可断的地方。 */
    function morph() {
      if (aborted) return;
      window.removeEventListener('wheel', abort);
      window.removeEventListener('touchstart', abort);

      /* 收完立刻放第二幕。这里不能再 requestAnimationFrame 一次：
         多等一帧就是一次可见的停顿。 */
      const tl = gsap.timeline({ onComplete: () => introTl.play() });
      window.__loader = tl;

      /* 走满之后先停 0.22 秒，让"满了"这件事被看见，再开始收。

         缓动从 power3.in 换成 power2.inOut：加速撞进终点会在那一帧留下一个硬折角，
         下一秒又反向冲出去，读起来就是"顿一下"。现在是**减速停住**，
         停稳了再往外长——收和放之间是一次呼吸，不是一次碰撞。 */
      tl.to(bar, {
        scaleX: CANVAS_SCALE_FROM,
        scaleY: CANVAS_SCALE_FROM,
        duration: 0.6,
        ease: 'power2.inOut'
      }, 0.22);

      /* 光晕跟着一起收，并且在收的过程中褪掉。
         它是"细亮线的晕"，门洞不需要它——门洞自己的辉光是 3D 画出来的，
         留着会在门口糊一圈假的。 */
      tl.to(glow, {
        scaleX: CANVAS_SCALE_FROM * GLOW_X,
        scaleY: CANVAS_SCALE_FROM * 1.6,
        duration: 0.6,
        ease: 'power2.inOut'
      }, 0.22);
      tl.to(glow, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 0.3);
    }

    /* ==================================================================
       第二幕：入场（在黑场里就建好，暂停等着）
       ==================================================================
       **为什么要提前建：**
       这里面有几件很贵的事——量标题字号（会强制一次布局，标题是整屏最大的
       元素）、给标题挂 will-change 把它提成 GPU 图层、装上遮罩。
       原来这些都发生在"点"收完的那一帧，于是每次都在交接处丢帧，
       看着就是收成点之后卡一下再继续。

       现在全部挪到黑场里做：那时候画面是静止的，丢帧也没人看得见。
       交接时只剩一件事——play()，零成本。 */
    const introTl = buildIntro();

    function buildIntro() {
      /* 字号是 JS 量出来写进 CSS 变量的，所以只能在这里读——写死没有意义。 */
      const titlePx = parseFloat(getComputedStyle(titleRow).fontSize) || 300;
      const TITLE_BLUR_FROM = Math.round(titlePx * TITLE_BLUR_RATIO);

      /* canvas 缩放的支点必须是**门洞中心**，不是画布中心。
         支点放错的话，门会一边长大一边横着漂过去，
         那就不是"从这个点长出来"，是"从别处飞过来"。
         直接用门洞自己的那两个 CSS 变量，门洞位置以后调了这里自动跟。 */
      const hcs = hero ? getComputedStyle(hero) : null;
      const originX = (hcs && hcs.getPropertyValue('--door-x').trim()) || '50.1%';
      const originY = (hcs && hcs.getPropertyValue('--door-top').trim()) || '41.6%';
      gsap.set(canvas, {
        transformOrigin: `${originX} ${originY}`,
        scale: CANVAS_SCALE_FROM
      });

      gsap.set(nav,    {
        opacity: 0, y: -24, clipPath: 'inset(0 0 100% 0)',
        filter: 'blur(6px) brightness(1.25)'
      });
      gsap.set(eyebrow, {
        '--intro-eyebrow-y': '10px',
        filter: 'blur(6px) opacity(0)'
      });
      titleRow.classList.add('intro-reveal');
      gsap.set(titleRow, {
        '--intro-r': 0,
        y: 18,
        scale: TITLE_SCALE_FROM,
        transformOrigin: '50% 50%',
        filter: `blur(${TITLE_BLUR_FROM}px) brightness(1.25) opacity(0)`,
        /* 标题是整屏最大的一块东西，模糊半径又每帧都在变，浏览器没法缓存结果。
           先告诉它"这一层的滤镜要动"，它会把这行字单独提成一个 GPU 图层，
           每帧只重跑一次模糊，而不是连带把底下的画面一起重画。
           动画结束由 clearProps 一并清掉——will-change 长期挂着会白占显存。 */
        willChange: 'filter, transform, mask-image'
      });

    /* 开场没播完用户就开始滚了，说明他不想看。
       直接跳到终点，而不是硬拦着——拦滚动比让动画被打断更糟。 */
    function unbindSkip() {
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchstart', skip);
      window.removeEventListener('keydown', skip);
    }
    function skip() { tl.progress(1); }

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: 'power2.out' },
      onStart() {
        window.addEventListener('wheel', skip, { passive: true });
        window.addEventListener('touchstart', skip, { passive: true });
        window.addEventListener('keydown', skip);
      },
      onComplete() {
        unbindSkip();
        /* 收尾要干净：动画留下的行内样式全部清掉，让这些元素回到
           样式表说了算的状态，滚动动画接手时不会撞上残留的 transform。 */
        gsap.set([canvas, nav, titleRow], { clearProps: 'all' });
        gsap.set(eyebrow, { clearProps: 'all' });
        /* 遮罩挂在 class 上，class 摘掉标题才算真的回到样式表状态——
           留着的话标题会永远顶着一层 mask，白白多一道合成。 */
        titleRow.classList.remove('intro-reveal');
        veil.remove();
        loader.remove();
      }
    });

    /* ---- 从"点"长出来的，必须是真的那个空间，不是一块方块 ----

       之前是：那个点先撑成一个扁平的洋红矩形，再和真门交叉淡出。
       生硬的根源就在这儿——**门出现了两次**，而且第一次是个假的：
       一块纯色方块没有雾、没有地上的光池，它撑开的时候画面里什么都没发生。

       现在改成：点原地交棒给 canvas，**放大的是整个 canvas 图层**。
       这一层里装着雾、门、地上的光池、门口的辉光——它们本来就画在一起，
       所以一放大就是同步长出来的，不需要我去"对齐"任何东西。
       而且缩放的是一张已经画好的贴图，纯合成，不用重画 3D，一帧都不掉。

       两条曲线分开：
         · 不透明度走得早、收得快 → 先浮起来的是**雾**（它面积最大、最柔，
           在低不透明度下最先被眼睛捕捉到），空间先成立。
         · 缩放走得慢、拖得长 → 门和光池随后慢慢长到位。
       顺序就是"雾气出现 → 慢慢放大成门洞"。 */
    /* 第一幕收住的那个"点"，尺寸正好等于此刻的门洞。
       所以这两条 scale 必须**同参数**——同起点、同时长、同曲线。
       只要它们一致，那块洋红矩形和底下真正的门在每一帧都严丝合缝地重合，
       淡入淡出就完全看不出来。任何一个改了，断裂感立刻回来。 */
    /* 必须用 fromTo + immediateRender:false，不能用 to：
       这条时间轴是在**加载还没走完**的时候建好的，那会儿条还是长长的一根。
       用 to 的话 GSAP 会在建好的那一刻就把"当前宽度"记成起点，
       于是真正播放时条会先跳回满宽再缩回来——一个很显眼的闪跳。
       写死起点，什么时候建、什么时候播都不影响。 */
    const GROW = { duration: 1.9, ease: 'power2.out', immediateRender: false };
    tl.fromTo(canvas,
      { scale: CANVAS_SCALE_FROM },
      { scale: 1, ...GROW }, 0);
    tl.fromTo(bar,
      { scaleX: CANVAS_SCALE_FROM, scaleY: CANVAS_SCALE_FROM },
      { scaleX: 1, scaleY: 1, ...GROW }, 0);

    /* 真的门亮起来。它一亮，那块死板的纯色矩形就该走了——
       两条曲线在中间交叉，总亮度基本是平的。 */
    tl.to(canvas, { opacity: 1, duration: 1.2, ease: 'sine.out' }, 0);
    tl.to(loader, { opacity: 0, duration: 0.85, ease: 'sine.inOut' }, 0.1);

    /* 黑幕跟着一起撤。 */
    tl.to(veil, { opacity: 0, duration: 0.8, ease: 'power1.out' }, 0);

    /* ③ 标题：从正中间往两边展开。这是这一段的主角。
       先亮起来的是画面正中那一小块（正好在 MINNIE 和 ZHUANG 中间的空当上），
       然后光往左右推开，两端的字最后浮出来。
       为什么两端最后到：整行有一个屏幕那么宽，最外面那两个字母走的路最长，
       它们落位的那一下就是整段开场的收尾。

       缓动用 power2.out：前段推得快，后段慢慢够到两端。
       用 expo 的话两边几乎是同时到的，就看不出"从中间展开"了。 */
    tl.to(titleRow, {
      '--intro-r': 1,
      duration: 2.2,
      ease: 'power2.out'
    }, TITLE_AT);

    /* 配角：一点点合焦。让展开的边缘看着像"从虚里长出来"，
       而不是一块遮罩在平移。三条曲线刻意不一样——
       模糊用 power3（后段咬住，合上那一下要软），缩放用 expo（前段冲、后段稳），
       亮度收得最快，不然红字一直发飘。
       量都压得很小：这一层要是抢戏，"从中间展开"就读不出来了。 */
    tl.to(titleRow, {
      filter: 'blur(0px) brightness(1) opacity(1)',
      duration: 1.67,
      ease: 'power3.out'
    }, TITLE_AT);
    tl.to(titleRow, { scale: 1, duration: 2.11, ease: 'expo.out' }, TITLE_AT);
    tl.to(titleRow, { y: 0, duration: 1.76, ease: 'expo.out' }, TITLE_AT);

    /* 小字跟着一起合焦，但比标题早一点点到位、模糊量小得多。
       同一个镜头里的两样东西，不该各对各的焦。 */
    tl.to(eyebrow, {
      '--intro-eyebrow-y': '0px',
      filter: 'blur(0px) opacity(1)',
      duration: 1.4,
      ease: 'power3.out'
    }, TITLE_AT + 0.3);
    tl.to(nav, {
      opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)',
      filter: 'blur(0px) brightness(1)',
      duration: 2.2, ease: 'power2.out'
    }, TITLE_AT);

      /* 调试用：控制台 __intro.pause().progress(0.4) 可以停在任意一帧看构图。
         和 __portal3D 一样，只是个把手，不参与逻辑。 */
      window.__intro = tl;
      return tl;
    }
  }
})();
