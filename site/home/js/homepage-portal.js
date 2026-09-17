// ===== HOMEPAGE PORTAL — 场景状态 =====
// 两件互不相干的事，各自独立：
//   1) 文字排版实测——让小字和大标题的左边严格对齐、标题正好铺满一行
//   2) 滚动特效——把滚动进度换算成 0~1 的数字 p，再实时改一批 CSS 变量


/* ===== 1. 文字排版实测 =====
   不靠人手猜偏移量。用一块看不见的画布把字「画」一遍，
   量出每个字母墨迹的真实边界，再把差值写回 CSS 变量。
   这样 AN CREATIVE DEVELOPER 的 A 和 MINNIE 的 M 永远在同一条竖线上。 */

(function () {
  const heroText = document.querySelector('.hero-text');
  const eyebrow  = document.querySelector('.eyebrow');
  if (!heroText || !eyebrow) return;

  const TITLE_TEXT = 'MINNIE ZHUANG';
  const PROBE = 400;                       // 量测用的字号，最后按比例缩回真实字号
  const ctx = document.createElement('canvas').getContext('2d');

  // 量一段文字的整体信息（宽度、字母高度、行盒基线）
  function probe(text, font) {
    ctx.font = font;
    const m = ctx.measureText(text);
    return {
      adv:      m.width,                    // 排版宽度（含首尾的字体自带空白）
      capTop:   m.actualBoundingBoxAscent,  // 基线往上到字母顶部
      fontAsc:  m.fontBoundingBoxAscent,
      fontDesc: m.fontBoundingBoxDescent
    };
  }

  /* 单个字母左右两侧那圈「字体自带的空白」有多宽。
     浏览器给的边界数值和它实际画出来的差了两三个像素，
     所以这里干脆把字母真的画到一块画布上，逐列去找第一个有颜色的像素——
     画布和网页用的是同一套渲染，量出来的就是眼睛看到的。 */
  function sideBearings(ch, font) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    const adv = g.measureText(ch).width;
    const pad = Math.ceil(PROBE * 0.5);
    c.width  = Math.ceil(adv) + pad * 2;
    c.height = Math.ceil(PROBE * 2);
    g.font = font;                          // 改画布尺寸会清空设置，必须重设
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    g.fillText(ch, pad, PROBE * 1.4);

    const d = g.getImageData(0, 0, c.width, c.height).data;
    let min = c.width, max = -1;
    for (let y = 0; y < c.height; y++) {
      const row = y * c.width * 4;
      for (let x = 0; x < c.width; x++) {
        if (d[row + x * 4 + 3] >= 128) {    // 半覆盖为界，正好是笔画的几何边缘
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
    }
    if (max < 0) return { left: 0, right: 0 };
    return { left: min - pad, right: (pad + adv) - (max + 1) };
  }

  // line-height:1 时，行盒底部往上多少才是基线
  function baseUp(p, size) {
    const halfLeading = (size - p.fontAsc - p.fontDesc) / 2;
    return size - (halfLeading + p.fontAsc);
  }

  /* 这些数值只跟字体本身有关，跟字号、窗口宽度都无关（等比例缩放而已），
     所以量一次存起来。窗口每拖动一下都重画一遍字太浪费了。 */
  let metrics = null;

  function measureFonts() {
    const titleFont = `400 ${PROBE}px "Bebas Neue", sans-serif`;
    const ecs = getComputedStyle(eyebrow);
    const eyebrowFont = `${ecs.fontWeight} ${PROBE}px ${ecs.fontFamily}`;
    const t = probe(TITLE_TEXT, titleFont);

    return {
      titleAdv:      t.adv,
      titleCap:      t.capTop,
      titleBaseUp:   baseUp(t, PROBE),
      titleLeft:     sideBearings(TITLE_TEXT[0], titleFont).left,
      titleRight:    sideBearings(TITLE_TEXT.at(-1), titleFont).right,
      eyebrowLeft:   sideBearings('A', eyebrowFont).left,
      eyebrowBaseUp: baseUp(probe('A', eyebrowFont), PROBE)
    };
  }

  function layoutText() {
    const cs = getComputedStyle(heroText);
    const avail = heroText.clientWidth
                - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;

    if (!metrics) metrics = measureFonts();
    const m = metrics;

    // 标题字号：让 M 的左边到 G 的右边正好等于可用宽度。
    // 整行墨迹宽度 = 排版总宽 - 首字母左空白 - 末字母右空白
    const size = avail * PROBE / (m.titleAdv - m.titleLeft - m.titleRight);
    const k = size / PROBE;                 // 从量测字号缩回真实字号的比例
    const titleBaseUp = m.titleBaseUp * k;

    const out = (name, px) => heroText.style.setProperty(name, `${px.toFixed(2)}px`);
    out('--title-size', size);
    out('--title-ink-left', m.titleLeft * k);
    out('--title-base-up', titleBaseUp);
    out('--title-cap-top', size - titleBaseUp - m.titleCap * k);   // 行盒顶 → 字母顶部

    // 小字的字号是跟着窗口走的，所以缩放比例要单独算
    const ek = parseFloat(getComputedStyle(eyebrow).fontSize) / PROBE;
    out('--eyebrow-ink-left', m.eyebrowLeft * ek);
    out('--eyebrow-base-up', m.eyebrowBaseUp * ek);
  }

  window.addEventListener('resize', layoutText);
  layoutText();
  // 字体是网络加载的，加载完之后所有尺寸都变了，缓存作废、重量一次
  if (document.fonts) document.fonts.ready.then(() => { metrics = null; layoutText(); });
})();


/* ===== 2. 场景驱动 =====

   ┌──────────────────────────────────────────────────────────┐
   │  滚动位置                                                 │
   │     ↓  readCamera()                                       │
   │  Camera State   相机在空间里的状态（目前只有「前进距离」） │
   │     ↓  buildScene()                                       │
   │  Scene State    这一帧每样东西该长什么样（纯数字，不碰 DOM）│
   │     ↓  render()                                           │
   │  CSS Variables  写到 #hero 上                             │
   │     ↓                                                     │
   │  现有 CSS 渲染器                                          │
   └──────────────────────────────────────────────────────────┘

   ⚠️ 这一层只是把「谁来驱动」换掉：所有公式、时间窗、量化精度
      都和 demo baseline 完全一样，输出的 CSS 变量逐位相同。
      唯一的差别是删掉了近场辉光（.door-bloom）那组变量。

   性能约束照旧：只做 clip-path 裁切 / transform / opacity 三类改动，
   不改宽高（会重排）、不改 blur 值（会每帧重算滤镜）。 */

(function () {
  const hero = document.getElementById('hero');
  const pinWrap = document.querySelector('.pin-wrap');
  if (!hero || !pinWrap) return;

  /* ---------- 数学工具 ---------- */
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const ease = t => t * t * (3 - 2 * t);      // 慢进慢出

  /* ---------- 场景常量 ----------
     门的初始位置以 CSS 里的 --door-x / --door-top 为准，这里不再抄一份数字 */
  const rootStyle = getComputedStyle(document.documentElement);
  const DOOR_X   = parseFloat(rootStyle.getPropertyValue('--door-x'));
  const DOOR_TOP = parseFloat(rootStyle.getPropertyValue('--door-top'));

  const DOOR = {
    x:    DOOR_X,
    W0:   1.4,     W1: 112,    // 初始尺寸对齐 HOMEPAGE.png；终点不变
    H0:   7.1,      H1: 118,
    CY0:  DOOR_TOP, CY1: 50     // 门的垂直中心：起点 / 终点（%）
  };

  /* ---------- 空间：门 与 门内世界之间的距离（Phase 3.1） ----------
     以前门内那张画和门洞是**贴在一起**的，所以门放大时画面等比例跟着放大，
     看着就像"照片被拉大"。现在两者之间隔了一段固定的距离 GAP：

         镜头 ──── CAM ────► 门洞平面 ── GAP ──► 门内世界

     镜头往前走时 CAM 变小、GAP 不变，于是门内的东西相对门洞越来越小——
     换句话说，越走近门口，看到的房间就越多。这正是真实走向一扇门时的感觉。

     想要纵深更明显就把 GAP 调大，想更收敛就调小。这是唯一的旋钮。 */
  const SPACE = {
    CAM0: 2400,   // 起点：镜头离门很远（长焦感，压缩、克制）
    CAM1:  900,   // 终点：镜头几乎贴到门口
    GAP:   1000,  // 门洞 → 门内世界的固定距离

    /* 镜头偏离门轴多远（视口宽 %）。0 = 正对门轴。
       挪开一点，门内世界在靠近过程中会跟着横向滑动一点点（视差）；
       末尾（滚动到底）时不受影响，永远与 Phase 2 重合。
       目前保持 0——纯几何，不产生任何多余的画面元素。 */
    OFF_X: 0
  };

  // 补偿系数：按「镜头贴到门口那一刻」标定，
  // 保证滚动到底时门内构图和 Phase 2 逐像素一致（差异只留在门洞还是细缝的前半段）
  const INTERIOR_SCALE = (SPACE.CAM1 + SPACE.GAP) / SPACE.CAM1;

  /* ---------- 时间窗 CUE ----------
     各条视觉行为的起止点，统一用 camera.z 表达。数值与 baseline 一致。
     以后要调节奏，改这一张表就够了，不用满代码去找散落的数字。 */
  const CUE = {
    text:     [0,    0.58],   // 文字向两边退场
    eyebrow:  [0.46, 0.66],   // 小字淡出
    approach: [0,    0.97],   // 镜头前进（门放大）
    focus:    [0.24, 0.84],   // 由虚到实的对焦
    glow:     [0.55, 0.95],   // 远场光晕淡出
    pool:     [0.46, 0.90],   // 地面光池淡出
    interiorColor: [0.00, 0.72], // 门洞起始粉紫，靠近后回到原图
    fog:      [0.45, 0.88],   // 雾淡出
    vignette: [0.50, 1.00]    // 暗角淡出
  };
  const cue = (z, k) => ease(seg(z, CUE[k][0], CUE[k][1]));


  /* ==============================================================
     第一层：Camera State
     ============================================================== */

  /* 滚动位置 → 0~1 的进度。门洞仍在原来的 220vh 内走完；
     pin-wrap 后加的长度只用于让最终画面留在后方，不参与相机计算。 */
  function scrollProgress() {
    const dist = window.innerHeight * 2.2;
    return dist > 0 ? clamp01((window.scrollY - pinWrap.offsetTop) / dist) : 0;
  }

  /* p → camera.z。现在是恒等映射（z === p），所以滚动手感和 demo 完全一致。
     以后想改镜头的前进节奏，只要改这一个函数。 */
  const cameraZFromScroll = p => p;

  /* 相机状态：
       z      统一的「前进距离」。0 = Hero 初始状态，1 = 序列终点。
       travel z 经过缓动后的实际推进量。门和光都读它（就是原来的 tDoor）。 */
  const camera = { z: 0, travel: 0 };

  function readCamera() {
    camera.z = cameraZFromScroll(scrollProgress());
    camera.travel = cue(camera.z, 'approach');
    return camera;
  }


  /* ==============================================================
     第二层：Scene State —— 只算数字，不碰 DOM
     ============================================================== */

  /* 门：镜头往前推，门在画面里等比变大
     （人匀速走向一扇门时，门在视网膜上的大小就是成倍成倍地涨） */
  function doorState(cam) {
    const t = cam.travel;
    const focus = cue(cam.z, 'focus');

    const w  = DOOR.W0 * Math.pow(DOOR.W1 / DOOR.W0, t);
    const h  = DOOR.H0 * Math.pow(DOOR.H1 / DOOR.H0, t);
    const cy = lerp(DOOR.CY0, DOOR.CY1, ease(t));   // 门的垂直中心

    // 镜头到门的距离，随前进量按几何级数缩短
    const camDepth = SPACE.CAM0 * Math.pow(SPACE.CAM1 / SPACE.CAM0, t);

    return {
      w, h, cy,
      halfW:  w / 2,
      bottom: cy + h / 2,                 // 门槛所在的高度
      // 裁切开门：上/右/下/左各要裁掉多少（不改宽高，所以不触发重排）
      clipT: Math.max(0, cy - h / 2),
      clipB: Math.max(0, 100 - cy - h / 2),
      clipL: Math.max(0, DOOR.x - w / 2),
      clipR: Math.max(0, 100 - DOOR.x - w / 2),
      imgShift: cy - 50,                  // 把门内画面的中心挪到门洞中心
      // 对焦：远处虚，走近实（两张图交叉淡入，不重算 blur）
      focus,
      worldScale: lerp(1.12, 1, focus),

      /* 空间关系：镜头到门的距离
         （和门洞的放大一样是成倍成倍地变，两者节奏才对得上） */
      camDepth,
      interiorZ: -SPACE.GAP,              // 门内世界固定落在门洞后面这么远
      interiorScale: INTERIOR_SCALE,
      pivotX: DOOR.x + SPACE.OFF_X        // 灭点：门的位置往旁边挪开 OFF_X
    };
  }

  /* 光：全部从「门」推出来，不另起一套坐标。
         Camera → Door → Light
     光池的上边就是门槛、宽度就是门宽，所以门一动，光必然跟着动。 */
  function lightState(cam, door) {
    const t = cam.travel;

    // 地面光池：往镜头方向按透视张开。
    // 门远（走廊长）时光扇得很开，门推到眼前时几乎就是门那么宽
    const slope  = lerp(0.52, 0.09, t);
    const spread = door.halfW + slope * Math.max(0, 100 - door.bottom);

    // 远场光晕：门越近，「溢出门框那一圈」占的比例反而越小
    const spillX = lerp(6.2,  2.4, t);          // 横向溢出（视口宽度 %）
    const spillY = lerp(11.5, 4.5, t);          // 纵向溢出（视口高度 %）

    return {
      pool: {
        top: door.bottom,                       // 上边贴门槛
        x1:  DOOR.x - door.halfW,               // 门槛左角
        x2:  DOOR.x + door.halfW,               // 门槛右角
        x3:  DOOR.x + spread,                   // 屏幕最下方，光扇开后的右边
        x4:  DOOR.x - spread,                   // 同上，左边
        // 羽化范围略窄于梯形本身，边缘才会散成半影而不是一条斜直线
        fade: spread * 0.95,
        hotW: door.halfW + 5,                   // 门槛处那块热点也跟着门宽走
        opacity: 1 - cue(cam.z, 'pool')
      },
      glow: {
        w: door.w * 0.5 + spillX,
        h: door.h * 0.5 + spillY,
        opacity: 1 - cue(cam.z, 'glow')
      }
    };
  }

  /* 前景文字：向两边退场，同时被那层钉在屏幕上的暗部遮罩一点点吃掉 */
  function textState(cam) {
    const t = cue(cam.z, 'text');
    return {
      leftX:    t * -62,
      rightX:   t *  62,
      eyebrowX: t * -40,
      inkEdge:  t *  52,             // 暗部从屏幕两边往里推进的距离（%）
      red:      lerp(224, 96, t),    // 残留的字整体再压暗一档
      eyebrowOpacity: 1 - cue(cam.z, 'eyebrow')
    };
  }

  /* 大气：雾和暗角 */
  function atmosState(cam) {
    return {
      fog: 1 - cue(cam.z, 'fog'),
      // 暗角留一点点，末尾四角还是压着的
      vignette: 1 - 0.7 * cue(cam.z, 'vignette')
    };
  }

  /* 门内世界的颜色只作用在透过门洞看到的那张图上。
     首页远看时是粉紫；镜头推进时平滑退回原图，抵达背景界面时不留任何染色。 */
  function interiorState(cam) {
    return { colorMix: 1 - cue(cam.z, 'interiorColor') };
  }

  function buildScene(cam) {
    const door = doorState(cam);
    return {
      door,
      light: lightState(cam, door),   // 光依赖门，顺序不能反
      interior: interiorState(cam),
      text:  textState(cam),
      atmos: atmosState(cam)
    };
  }


  /* ==============================================================
     第三层：render —— 把 Scene State 写成 CSS 变量
     这是整段代码里唯一碰 DOM 的地方。
     ============================================================== */

  // 数值量化：只保留必要精度，避免每帧都触发新的样式计算
  const q = (v, step) => Math.round(v / step) * step;
  const pct = (k, v, step = 0.05) => hero.style.setProperty(k, `${q(v, step)}%`);
  const num = (k, v, step = 0.01) => hero.style.setProperty(k, String(q(v, step)));
  const vw  = (k, v, step = 0.1)  => hero.style.setProperty(k, `${q(v, step)}vw`);
  const px  = (k, v, step = 1)    => hero.style.setProperty(k, `${q(v, step)}px`);

  function render(scene) {
    const { door, light, text, atmos } = scene;

    /* --- 前景文字 --- */
    vw ('--left-x',    text.leftX);
    vw ('--right-x',   text.rightX);
    vw ('--eyebrow-x', text.eyebrowX);
    pct('--ink-e',     text.inkEdge, 0.2);
    hero.style.setProperty('--title-rgb', `${q(text.red, 2)} 0 0`);
    num('--eyebrow-opacity', text.eyebrowOpacity);

    /* --- 门 --- */
    pct('--clip-t',     door.clipT);
    pct('--clip-b',     door.clipB);
    pct('--clip-l',     door.clipL);
    pct('--clip-r',     door.clipR);
    pct('--door-top',   door.cy);
    pct('--img-shift',  door.imgShift);
    num('--focus',      door.focus);
    num('--world-scale', door.worldScale, 0.002);

    /* --- 门 与 门内世界 的空间关系（Phase 3.1） --- */
    px ('--cam-depth',      door.camDepth, 4);
    px ('--interior-z',     door.interiorZ);
    num('--interior-scale', door.interiorScale, 0.001);
    pct('--pivot-x',        door.pivotX);

    /* --- 地面光池 --- */
    pct('--pool-top',     light.pool.top);
    pct('--pool-x1',      light.pool.x1);
    pct('--pool-x2',      light.pool.x2);
    pct('--pool-x3',      light.pool.x3);
    pct('--pool-x4',      light.pool.x4);
    pct('--pool-fade',    light.pool.fade);
    pct('--pool-hot-w',   light.pool.hotW);
    num('--pool-opacity', light.pool.opacity);

    /* --- 远场光晕 --- */
    pct('--glow-w',       light.glow.w);
    pct('--glow-h',       light.glow.h);
    num('--glow-opacity', light.glow.opacity);

    /* --- 雾 / 暗角 --- */
    num('--fog-opacity',      atmos.fog);
    num('--vignette-opacity', atmos.vignette);
  }


  /* ==============================================================
     驱动：滚动 → 相机 → 场景 → 渲染
     ============================================================== */

  let ticking = false;

  function update() {
    const scene = buildScene(readCamera());
    render(scene);
    /* 把这一帧算好的场景状态挂出去，供 3D 层（homepage-portal-3d.js）读取。
       只读、不参与 CSS 渲染——所以 3D 层永远不可能和 CSS 版本算出不同的门洞。 */
    window.__heroScene = scene;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });

  window.addEventListener('resize', update);
  update();

  /* 留一个只读的观察窗口，方便在控制台里看当前相机状态（不参与渲染）。
     用法：在浏览器控制台敲 __heroCamera 就能看到 z 和 travel。 */
  window.__heroCamera = camera;

  /* 调试用：强制立刻重算一帧。
     浏览器在标签页切到后台时会暂停动画，滚动完这里不会自己更新，
     截图就会截到旧画面。控制台里敲 __heroUpdate() 可以手动推一帧。 */
  window.__heroUpdate = update;
})();
