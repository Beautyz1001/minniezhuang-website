(() => {
  const DATA = window.WORKS_DATA;
  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gallery = document.getElementById('worksGallery');
  const televisionCanvas = document.getElementById('televisionCanvas');
  const televisionName = document.getElementById('televisionName');
  const televisionTags = document.getElementById('televisionTags');
  const televisionCredit = document.getElementById('televisionCredit');
  const televisionCopy = document.getElementById('televisionCopy');
  const worksStage = document.getElementById('worksStage');
  const galleryPane = document.querySelector('.works-gallery-pane');
  const televisionPane = document.getElementById('televisionPane');
  const siteNav = document.querySelector('.site-nav');
  const routeVeil = document.getElementById('worksRouteVeil');
  const detail = document.getElementById('worksDetail');
  const detailStage = document.getElementById('detailStage');
  const detailPages = document.getElementById('detailPages');
  const detailName = document.getElementById('detailName');
  const detailNameZh = document.getElementById('detailNameZh');
  const detailDesc = document.getElementById('detailDesc');
  const detailLinks = document.getElementById('detailLinks');
  const closeBtn = document.getElementById('worksClose');
  const navPrev = document.getElementById('navPrev');
  const navNext = document.getElementById('navNext');
  const lightbox = document.getElementById('worksLightbox');
  const lightboxScroll = document.getElementById('lightboxScroll');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');

  const colors = [
    { css: '111, 174, 181', hex: '#6faeb5' },
    { css: '234, 166, 76', hex: '#eaa64c' },
    { css: '118, 137, 184', hex: '#7689b8' },
    { css: '188, 89, 64', hex: '#bc5940' },
    { css: '120, 202, 193', hex: '#78cac1' },
  ];

  const N = DATA.length;
  const PROJECT_SWITCH_DURATION = 1.45;
  const PROJECT_SWITCH_EASE = 'power3.out';
  const cards = [];
  let currentIndex = 0;
  // trackIndex：不再被夹在克隆卡的坐标范围里，是一个可以无限增减的整数，
  // 只表示"从初始位置数，一共走了几步"；currentIndex = ((trackIndex%N)+N)%N
  // 才是真正显示第几个项目（见下面 2026-09-15 的说明）。
  let trackIndex = 0;
  let channelExpanded = true;
  let detailOpen = false;
  let television = null;
  let introPending = document.documentElement.classList.contains('works-intro-armed');

  const numbered = (index) => String(index + 1).padStart(2, '0');
  const track = document.createElement('div');
  track.className = 'gallery-track';
  gallery.appendChild(track);

  DATA.forEach((project, index) => {
    project.previewColor = colors[index % colors.length];
    const card = document.createElement('article');
    card.className = 'gallery-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `查看 ${project.name} 项目详情`);
    card.style.setProperty('--card-rgb', project.previewColor.css);
    card.innerHTML = `<img class="gallery-card-image" src="${project.cover}" alt="" draggable="false">`;
    const cover = card.querySelector('.gallery-card-image');
    const revealCover = () => {
      if (cover.decode) cover.decode().then(() => cover.classList.add('is-ready')).catch(() => {});
      else cover.classList.add('is-ready');
    };
    if (cover.complete) revealCover();
    else cover.addEventListener('load', revealCover, { once: true });
    card.addEventListener('click', () => {
      if (galleryDragSuppressClick) { galleryDragSuppressClick = false; return; }
      if (index === currentIndex) openDetail(index);
      else selectProject(index);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (index === currentIndex) openDetail(index);
        else selectProject(index);
      }
    });
    track.appendChild(card);
    cards.push(card);
  });

  // 2026-09-15：不再用"首尾各接 2 张克隆卡"实现循环——那样同一张图会
  // 存在两份 <img>（DOM 上更多、浏览器要多解码一次），改成 Break 现在这套：
  // 只有这 N 张真实卡，机制上是取模循环（currentIndex），视觉位置则是
  // 每张卡各自算"离当前弹簧值最短的环形距离"（见下面 renderCards）。
  // 任何一张卡的屏幕位置都是关于 springY 的连续周期函数，越过循环边界时
  // 数值本身连续——不需要把 DOM 节点搬到另一端，也就没有看得见的跳跃。
  const galleryIndex = document.createElement('div');
  galleryIndex.className = 'gallery-index';
  galleryIndex.setAttribute('aria-hidden', 'true');
  galleryIndex.innerHTML = `
    <span class="gallery-index-current"></span>
    <span class="gallery-index-line"><i></i></span>
    <span class="gallery-index-total">${numbered(DATA.length - 1)}</span>`;
  gallery.appendChild(galleryIndex);
  const galleryIndexCurrent = galleryIndex.querySelector('.gallery-index-current');
  const galleryIndexLine = galleryIndex.querySelector('.gallery-index-line');
  const galleryIndexMarker = galleryIndexLine.querySelector('i');
  const galleryIndexTotal = galleryIndex.querySelector('.gallery-index-total');

  function updateIndexProgress(index) {
    const trackHeight = galleryIndexLine.clientHeight;
    const segmentHeight = trackHeight / DATA.length;
    galleryIndexMarker.style.height = `${segmentHeight}px`;
    galleryIndexMarker.style.top = `${segmentHeight * index}px`;
    galleryIndexCurrent.style.top = `${segmentHeight * (index + 0.5)}px`;
    galleryIndexTotal.classList.toggle('is-hidden', index === DATA.length - 1);
  }

  // ── 轨道运动：真实弹簧，不是时长补间 ────────────────────────────────
  // 参考组件（crafterui/hero-carousel）用 framer-motion 的
  // spring{stiffness:260, damping:34, mass:0.9} 驱动一个 motion value，
  // 而不是给元素挂一条定长补间。差别不在手感的"软硬"，在于**中途可打断**：
  // 补间只知道"起点→终点+已走过多少时间"，拖拽从补间中途接手时读到的是
  // 补间的目标值；弹簧存的是**当前位置 + 当前速度**，所以拖拽接手时读到的是
  // 真实位置，松手又能把速度交还给弹簧，接缝处一帧跳变都没有。
  // ζ = 34 / (2*sqrt(260*0.9)) = 1.11 > 1 → 过阻尼，不回弹，只是平滑落位。
  const SPRING = { stiffness: 260, damping: 34, mass: 0.9 };
  const REST_DELTA = 0.05;   // px
  const REST_SPEED = 0.05;   // px/s

  let trackTargetY = 0;
  let springY = 0;           // 轨道当前位置（弹簧的"真实位置"）
  let springV = 0;           // 轨道当前速度 px/s
  let springRAF = 0;
  let springLastT = 0;

  // 几何量：每张卡的高度固定不变（展开只改宽度），配合卡间距算出
  // "循环一整圈"对应多少像素（cardStep），resize 时重新量一遍。
  let cardHeight = 0;
  let cardStep = 0;
  let loopSpan = 0; // cardStep * N，折叠取模用
  let centerAnchor = 0;

  function measureGeometry() {
    centerAnchor = gallery.clientHeight / 2;
    cardHeight = cards[0].getBoundingClientRect().height;
    // 间距写在 CSS 变量 --channel-gap 里（clamp()），用一个隐藏探针元素
    // 把它转成真实像素，不在 JS 里另写一份数字，避免两处间距各改各的。
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:1px;height:var(--channel-gap);';
    gallery.appendChild(probe);
    const gapPx = probe.getBoundingClientRect().height;
    probe.remove();
    cardStep = cardHeight + gapPx;
    loopSpan = cardStep * N;
  }

  // 每张真实卡的竖直位置：以"如果是一条首尾相接的无限长队列，这张卡第 i
  // 号槽位在哪"为基准（i*cardStep + springY），再把这个值折进以
  // centerAnchor 为中心、宽度一个循环（loopSpan）的窗口里。springY 本身
  // 不需要被夹住——它是一条连续变化的弹簧曲线；折叠运算保证每张卡的屏幕
  // 位置永远连续，不会出现"这一帧还在底部，下一帧突然跳到顶部"的瞬移。
  function renderCards() {
    cards.forEach((card, i) => {
      const raw = i * cardStep + springY;
      const folded = raw - loopSpan * Math.round((raw - centerAnchor) / loopSpan);
      card.style.transform = `translateY(${folded - cardHeight / 2}px)`;
    });
  }

  function springStep(now) {
    springRAF = 0;
    // 固定子步长积分（1/120s），保证不同帧率下手感一致；
    // 一帧最多补 64ms，避免切后台回来时一次积分爆炸。
    const dt = Math.min((now - springLastT) / 1000, 0.064);
    springLastT = now;

    const h = 1 / 120;
    let remaining = dt;
    while (remaining > 0) {
      const s = Math.min(h, remaining);
      remaining -= s;
      const a = (-SPRING.stiffness * (springY - trackTargetY) - SPRING.damping * springV) / SPRING.mass;
      springV += a * s;
      springY += springV * s;
    }

    if (Math.abs(springY - trackTargetY) < REST_DELTA && Math.abs(springV) < REST_SPEED) {
      springY = trackTargetY;
      springV = 0;
      renderCards();
      return;
    }
    renderCards();
    springRAF = requestAnimationFrame(springStep);
  }

  function startSpring() {
    if (springRAF) return;
    springLastT = performance.now();
    springRAF = requestAnimationFrame(springStep);
  }

  function stopSpring() {
    if (!springRAF) return;
    cancelAnimationFrame(springRAF);
    springRAF = 0;
  }

  // 让 trackIndex 号槽位居中所需要的 springY——纯公式，不用再去读某张卡
  // 当前实际渲染在哪（它们本来就是按这条公式反推出来的）。
  function targetYFor(idx) {
    return centerAnchor - idx * cardStep;
  }

  function updateTrackPosition() {
    trackTargetY = targetYFor(trackIndex);
    if (reduceMotion) {
      springY = trackTargetY;
      springV = 0;
      stopSpring();
      renderCards();
    } else {
      startSpring();
    }
  }

  window.addEventListener('resize', () => {
    measureGeometry();
    updateIndexProgress(currentIndex);
    updateTrackPosition();
  });

  function updateCopy(project) {
    const nameInner = document.createElement('span');
    nameInner.className = 'television-name-inner';
    nameInner.textContent = project.name;
    televisionName.replaceChildren(nameInner);
    televisionName.setAttribute('aria-label', `查看 ${project.name} 项目详情`);
    televisionTags.innerHTML = project.tags.map((tag) => `<li>${tag}</li>`).join('');
    if (project.highlightCompany && project.company.includes(' · ')) {
      const [companyPart, rolePart] = project.company.split(' · ');
      televisionCredit.innerHTML = `<span class="credit-company">${companyPart}</span> · ${rolePart}`;
    } else {
      televisionCredit.textContent = project.company;
    }
    document.documentElement.style.setProperty('--screen-rgb', project.previewColor.css);

    if (!gsap || reduceMotion || introPending) return;
    gsap.killTweensOf(televisionCopy.children);
    gsap.fromTo(
      televisionCopy.children,
      { y: 40, autoAlpha: 0, filter: 'brightness(.15)' },
      {
        y: 0,
        autoAlpha: 1,
        filter: 'brightness(1)',
        duration: PROJECT_SWITCH_DURATION,
        ease: PROJECT_SWITCH_EASE,
        overwrite: 'auto',
      },
    );
  }

  function setTitleHover(hovering) {
    const titleInner = televisionName.querySelector('.television-name-inner');
    if (!titleInner || !gsap || reduceMotion) return;
    gsap.killTweensOf(titleInner);
    gsap.to(titleInner, hovering
      ? { x: 7, scaleX: 1.015, duration: .52, ease: 'power3.out', overwrite: 'auto' }
      : { x: 0, scaleX: 1, duration: .38, ease: 'sine.out', overwrite: 'auto' });
  }

  televisionName.addEventListener('pointerenter', () => setTitleHover(true));
  televisionName.addEventListener('pointerleave', () => setTitleHover(false));
  televisionName.addEventListener('click', () => openDetail(currentIndex));
  televisionName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(currentIndex);
    }
  });

  /* 画廊页的首次入场：不动卡片的布局或轨道计算，只打开各自既有的视觉层。
     项目切换仍由 updateCopy() 接管，因此进入结束后与原交互完全相同。 */
  async function playWorksIntro() {
    if (!introPending) return;
    introPending = false;
    const root = document.documentElement;
    const isRouteArrival = root.classList.contains('works-route-armed');
    const copyParts = [...televisionCopy.children];
    const finish = () => {
      root.classList.remove('works-intro-armed');
      root.classList.remove('works-route-armed');
      if (gsap) gsap.set([siteNav, galleryPane, televisionPane, ...copyParts], {
        clearProps: 'clipPath,opacity,visibility,transform,willChange'
      });
      if (gsap && routeVeil) gsap.set(routeVeil, { clearProps: 'transform,willChange' });
    };

    if (!gsap || reduceMotion || !worksStage || !galleryPane || !televisionPane || !siteNav) {
      finish();
      return;
    }

    // 页面立即开始入场；每张封面各自等解码完成才淡入，避免整页为慢图
    // 停住，也不会出现半张作品。

    const timeline = gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: finish })
      .set([siteNav, galleryPane, televisionPane, ...copyParts], { willChange: 'transform,opacity,clip-path' })
      .to(televisionPane, { autoAlpha: 1, scale: 1, duration: 1.3, ease: 'expo.out' }, .05)
      .to(galleryPane, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'expo.inOut' }, .35)
      .to(siteNav, { autoAlpha: 1, y: 0, duration: .85, ease: 'expo.out' }, .75)
      .to(copyParts, { autoAlpha: 1, y: 0, duration: 1, stagger: .09, ease: 'expo.out' }, .95);

    if (isRouteArrival && routeVeil) {
      timeline.to(routeVeil, {
        xPercent: 100,
        duration: 1.05,
        ease: 'expo.inOut',
        overwrite: 'auto',
      }, .1);
    }
  }

  function applyTrackIndex(nextTrackIndex, { expandChannel = true } = {}) {
    const nextProjectIndex = ((nextTrackIndex % N) + N) % N;
    const nextExpanded = channelExpanded || expandChannel;
    const selectionChanged = nextTrackIndex !== trackIndex || !cards[nextProjectIndex].classList.contains('is-active');
    if (!selectionChanged && nextExpanded === channelExpanded) return;
    trackIndex = nextTrackIndex;
    currentIndex = nextProjectIndex;
    channelExpanded = nextExpanded;
    cards.forEach((card, i) => {
      card.classList.toggle('is-active', i === currentIndex);
      card.classList.toggle('is-expanded', channelExpanded && i === currentIndex);
    });
    if (selectionChanged) {
      galleryIndexCurrent.textContent = numbered(currentIndex);
      updateIndexProgress(currentIndex);
      updateTrackPosition();
      updateCopy(DATA[currentIndex]);
      television?.setProject(DATA[currentIndex]);
    }
  }

  // 环上两个逻辑序号之间最短的带符号距离（负数＝往上、正数＝往下）。
  function shortestDelta(from, to) {
    let d = (from - to) % N;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    return d;
  }

  // 按逻辑项目号（0..N-1）直接跳转——点击某张卡、PREV/NEXT、初始加载都走
  // 这条。不是直接把 trackIndex 设成 0..N-1 的原始值，而是找一条从当前
  // trackIndex 出发、方向和距离都最短的路——否则绕了几圈之后点第 1 张卡，
  // 会诡异地整个转好几圈转回去。
  function selectProject(index, options) {
    const targetProjectIndex = ((index % N) + N) % N;
    const delta = shortestDelta(targetProjectIndex, currentIndex);
    applyTrackIndex(trackIndex + delta, options);
  }

  // 按轨道位置走一步（±1）——滚轮/拖拽用这条，trackIndex 会自然无限增减，
  // 视觉上最后一项之后接回第一项，folded 取模保证过程连续。
  function stepTrack(direction) {
    applyTrackIndex(trackIndex + direction);
  }

  // pages 里每一项可以是纯字符串（正常项目），也可以是 { src, full }
  // （NBA2K：src 是压缩过的画廊缩略图，full 是原始高分辨率图，只有点击
  // 放大时才需要加载）。这两个小工具统一取值，其余地方不用关心是哪种。
  function pageSrc(page) { return typeof page === 'string' ? page : page.src; }
  function pageFull(page) { return typeof page === 'string' ? page : (page.full || page.src); }

  function fillDetail() {
    const project = DATA[currentIndex];
    detailPages.innerHTML = project.pages
      .map((page, index) => `<img class="works-detail-page" src="${pageSrc(page)}" data-full="${pageFull(page)}" alt="${project.name} 第${index + 1}页" decoding="async">`)
      .join('');
    detailPages.scrollLeft = 0;
    pagesScrollTarget = 0;
    if (pagesScrollRaf) { cancelAnimationFrame(pagesScrollRaf); pagesScrollRaf = null; }
    detailName.textContent = project.name;
    detailNameZh.textContent = project.nameZh || '';
    detailDesc.textContent = project.summary;
    detailLinks.innerHTML = (project.links || [])
      .map(link => `<a class="works-detail-link" href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`)
      .join('');
  }

  // 详情页入场/退场：照 ning-h.com 实测的动作复刻。
  // 实测结论（不是推测，是把它的开场逐帧截下来看到的）：
  //   屏幕正中先出现一个**居中的窄扁黑块**——它不是贯穿全屏的线，
  //   左右两侧留着大片空白，宽度只有视口的四成上下；随后这个块
  //   **上下左右四个方向同时张开**，长成铺满视口的详情页。
  //   块的颜色就是详情页自己的背景，没有额外的亮线元素。
  // 所以这里用 clip-path: inset() 的四个边一起收放：
  //   起手 上下各 50%（高度压到 0）、左右各 30%（只留中间 40% 宽），
  //   终点 四边全 0（满屏）。用遮罩而不是缩放，内容不会被拉伸变形。
  //
  // ⚠ 这两个值**必须各自写满四个边、而且用同一种写法**，不能让浏览器
  // 把它简写（`inset(50% 30%)` / `inset(0%)`）。GSAP 插值 clip-path 是
  // 按字符串里数字出现的顺序逐个配对的：一端解析成两个数、另一端解析成
  // 一个数时，配不上的那几个边会被当成 0，结果就是只有上边和右边在动、
  // 下边和左边一开始就是 0 —— 画面上表现为**从左下角展开**，而不是居中。
  // 这个 bug 实际出现过，中间帧实测到 `inset(42.7% 25.6% 0% 0%)`。
  // 用 0.0001% 而不是 0%，是为了让终点值也保持四个独立的数字、
  // 不被引擎折叠成 `inset(0%)`，视觉上和 0 没有任何区别。
  // 四个边各自错开一个微不可见的零头，浏览器就无法把它折叠成两值/一值写法，
  // GSAP 才能把四个边一一对应地插值。肉眼上 50% 和 50.0001% 没有区别。
  const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
  const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';

  function openDetail(index = currentIndex) {
    selectProject(index);
    fillDetail();
    detailOpen = true;
    detail.setAttribute('aria-hidden', 'false');
    detail.classList.add('is-visible');
    // 详情页盖住整个屏幕后，电视 WebGL 场景被完全遮挡却仍在每帧渲染，
    // 是画廊页常驻掉帧的主因（实测静止时都只有 ~22fps）；打开详情页时暂停它，
    // 关闭时恢复。
    television?.setPaused(true);

    if (!gsap || reduceMotion) return;
    // 起手就是屏幕正中那个居中的窄扁块
    gsap.set(detail, { autoAlpha: 1, clipPath: DETAIL_SEED });

    gsap.timeline({ defaults: { overwrite: 'auto' } })
      // ① 黑底的屏幕先自己张开、铺满视口
      .to(detail, { clipPath: DETAIL_FULL, duration: .72, ease: 'expo.inOut' })

      // ② 屏幕铺满之后，图片和文字作为**一整块**从下方升上来。
      //    2026-09-13 直接读了 ning-h.com 的源码（wp-content/themes/ning25/
      //    js/utility.js 的 showProjectModal()），不再是逐帧采样反解的近似值：
      //      gsap.set('.project-container', { opacity: 0, yPercent: 50 });
      //      tl.to('.project-container', { opacity: 1, yPercent: 0,
      //        stagger: .03, duration: 1, ease: 'expo.out' });
      //    真实参数是 **`yPercent: 50`**——位移量＝内容块自身可视高度的一半，
      //    是个相对值，不是固定像素。之前"逐帧反解出 300px"是巧合：
      //    那次测的视口下内容块高度约 600px，一半正好 300px，
      //    把它当固定像素写死、泛化到其他视口宽高就是错的。
      //    `.works-detail-stage` 是 `inset:0` 撑满整个弹窗（为了让内部两个
      //    absolute 定位的子元素坐标不变），它自身高度＝整个视口，不能直接
      //    套 CSS 的 `yPercent:50`（会移动半个视口高，量级不对）。
      //    所以在开场那一刻用 JS 实测"图带顶边到文字底边"这段真实可视高度，
      //    取一半作为像素位移量，和参考站 `yPercent:50` 的效果完全等价，
      //    不用把冻结的绝对定位布局改成流式布局。
      //    参考站是零间隔顺序执行（这条 tween 紧跟在屏幕铺满之后，中间没有
      //    额外等待）。图片与文字驱动的是**同一个包裹层
      //    `.works-detail-stage`**，不是各自一条 tween——两者必须读成一整块升起。
      //
      //    2026-09-13 用户要求"速度再慢 1/3、渐显效果更明显"——这一步开始
      //    偏离 ning-h.com 的原始数值（duration:1、位移和渐显同曲线），
      //    按用户的手感调整：
      //    ① 时长 1 → 1.33（慢 1/3）。
      //    ② **位移和渐显拆成两条独立 tween**，不再共用一条曲线：位移仍是
      //       `expo.out`（先快后刹停，形状不变）；渐显换成 `sine.out`
      //       （平缓、没有 expo 那种"一开始就冲到大半透明度"的急促感）。
      //       两条都挂在同一个 `rise` 标签上同时起步、同时长，
      //       所以看起来仍是**一个整体**在动，只是"淡入"这个动作能被
      //       单独看出来，不再被位移的曲线带着走。
      .addLabel('rise')
      .fromTo(detailStage, {
        y: () => {
          const contentTop = detailPages.getBoundingClientRect().top;
          const contentBottom = detail.querySelector('.works-detail-info').getBoundingClientRect().bottom;
          return (contentBottom - contentTop) * 0.5;
        },
      }, {
        y: 0,
        duration: 1.33,
        ease: 'expo.out',
      }, 'rise')
      .fromTo(detailStage, { autoAlpha: 0 }, {
        autoAlpha: 1,
        duration: 1.33,
        ease: 'sine.out',
      }, 'rise');
  }

  function closeDetail() {
    if (!detailOpen) return;
    detailOpen = false;
    detail.setAttribute('aria-hidden', 'true');
    television?.setPaused(false);

    if (!gsap || reduceMotion) {
      detail.classList.remove('is-visible');
      television?.flash();
      return;
    }
    gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        detail.classList.remove('is-visible');
        gsap.set(detail, { clearProps: 'clipPath' });
      },
    })
      // 四个方向同时收回那个居中的窄扁块
      .to(detail, { clipPath: DETAIL_SEED, duration: .56, ease: 'expo.inOut' })
      // 窗口收得差不多了（撕裂框缩回中心那一刻）再让电视闪一下，
      // 而不是刚点关闭、弹窗还铺满全屏时就闪——那时候画面都被弹窗挡着，看不见。
      .call(() => television?.flash())
      // 块本身再熄灭
      .to(detail, { autoAlpha: 0, duration: .14, ease: 'power1.in' });
  }

  // ── 滚轮：累积到阈值才走一格，冷却 420ms ──────────────────────────────
  // 原来是"一个滚轮事件 = 跳一格，然后硬锁 1500ms"，锁住期间的输入全被丢掉，
  // 所以连续滚会明显顿。参考组件的做法是把 delta **累积**起来，
  // 攒够 WHEEL_THRESHOLD 才提交一格，提交后清零并冷却 WHEEL_COOLDOWN。
  // 于是轻拨一下不动、正常滚一下刚好一格、猛滚则连续走格，量与手感挂钩。
  const WHEEL_THRESHOLD = 60;
  const WHEEL_COOLDOWN = 420;
  let wheelAcc = 0;
  let wheelUntil = 0;

  document.addEventListener('wheel', (event) => {
    if (detailOpen || window.matchMedia('(max-width: 900px)').matches) return;

    // 触控板会报两个轴，取绝对值更大的那个
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    // 首尾循环（用户明确要求恢复到修改前的行为）：selectProject 内部用取模
    // 做循环，第5张往下滚会自动回到第1张，这里不再拦截、不再把手势还给页面。
    event.preventDefault();
    const now = event.timeStamp;
    if (now < wheelUntil) return;
    wheelAcc += delta;
    if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;
    stepTrack(Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelUntil = now + WHEEL_COOLDOWN;
  }, { passive: false });

  // ── 拖拽：跟手、松手按甩出速度就近吸附 ──────────────────────
  // 1. 按下时从**弹簧的当前位置**接手（不是从 trackTargetY 接手，
  //    若上一次动画还没停，按下那一刻画面会先跳到终点）。
  // 2. 无限循环没有首尾，不用回弹，往哪个方向都能一直拖下去。
  // 3. 松手用 位置 + 速度×DRAG_THROW 找最近的卡，所以甩一下可以跨多张；
  //    同时把指针速度交还给弹簧，接缝处没有跳变。
  const DRAG_CLICK_THRESHOLD = 6;   // 小于这个位移仍算点击
  const DRAG_THROW = 0.12;          // 速度权重，单位秒

  let galleryPressed = false;       // 鼠标/触摸按下到抬起之间，不管是不是真的拖拽
  let galleryDragging = false;      // 越过阈值、真正开始拖拽（此时才抓 pointer capture）
  let galleryDragSuppressClick = false;
  let galleryDragStartY = 0;
  let galleryDragBaseY = 0;
  let galleryDragMoved = 0;
  let dragLastY = 0;
  let dragLastT = 0;
  let dragVelocity = 0;             // px/s

  // 无限循环没有首尾，拖拽不用回弹（DRAG_ELASTIC/dragBounds 这套已经没
  // 意义，删掉了）——往哪个方向都能一直拖下去。
  function nearestIndexTo(y) {
    return Math.round((centerAnchor - y) / cardStep);
  }

  gallery.addEventListener('pointerdown', (event) => {
    if (detailOpen) return;
    galleryPressed = true;
    galleryDragging = false;         // 还不确定是不是真拖拽，先不抓 capture
    galleryDragStartY = event.clientY;
    galleryDragBaseY = springY;      // 从真实位置接手，不是从目标值
    galleryDragMoved = 0;
    dragLastY = event.clientY;
    dragLastT = event.timeStamp;
    dragVelocity = 0;
    stopSpring();
  });

  gallery.addEventListener('pointermove', (event) => {
    if (!galleryPressed) return;
    galleryDragMoved = event.clientY - galleryDragStartY;

    // 越过阈值这一刻才真正判定为拖拽，也只在这一刻才抓 pointer capture。
    // ⚠ 这是修复"点击已选中的卡不再跳转详情页"的关键：setPointerCapture
    // 一旦调用，浏览器不仅会把后续 pointermove/pointerup 的 target 改写成
    // 抓取者（gallery），连随后派生的 click 事件的 target 也会被一并改写。
    // click 的 target 变成 gallery（卡片的祖先）之后，冒泡路径完全跳过了
    // 卡片自己的 click 监听器——不管点击多精确，卡片永远收不到这次 click。
    // 真实点击几乎不可能是零位移（手抖/触控板噪声/系统合成的移动都会带一点点），
    // 之前"按下就立刻抓 capture"等于让几乎每次点击都被这个坑绊一下。
    // 现在延后到真正拖出阈值才抓，纯点击自始至终不会调用 setPointerCapture，
    // click 事件的 target 也就不会被改写，能正常落在被点的那张卡上。
    if (!galleryDragging && Math.abs(galleryDragMoved) >= DRAG_CLICK_THRESHOLD) {
      galleryDragging = true;
      gallery.setPointerCapture(event.pointerId);
    }
    if (!galleryDragging) return;

    const dt = (event.timeStamp - dragLastT) / 1000;
    if (dt > 0) {
      // 和上一帧混合，抹掉单帧抖动，但保留甩动的方向和量级
      const instant = (event.clientY - dragLastY) / dt;
      dragVelocity = dragVelocity * 0.2 + instant * 0.8;
      dragLastY = event.clientY;
      dragLastT = event.timeStamp;
    }

    springY = galleryDragBaseY + galleryDragMoved;
    renderCards();
  });

  function endGalleryDrag() {
    if (!galleryPressed) return;
    galleryPressed = false;
    const wasDragging = galleryDragging;
    galleryDragging = false;

    if (!wasDragging) {
      // 从没越过阈值——从没抓过 capture，click 事件会正常落在被点的卡上，
      // 交给卡片自己的处理器（选中 / 开详情）。这里只需要把因为按下而
      // 停掉的弹簧续上（多数情况下它本来就已经停在目标点，这一下无副作用）。
      trackTargetY = targetYFor(trackIndex);
      startSpring();
      return;
    }

    galleryDragSuppressClick = true;
    const thrown = springY + dragVelocity * DRAG_THROW;
    const next = nearestIndexTo(thrown);
    springV = dragVelocity;          // 把手上的速度交给弹簧，衔接不断
    if (next === trackIndex) {
      trackTargetY = targetYFor(trackIndex);
      startSpring();
    } else {
      applyTrackIndex(next);
    }
  }

  gallery.addEventListener('pointerup', endGalleryDrag);
  gallery.addEventListener('pointercancel', endGalleryDrag);

  // 2026-09-13：切换项目卡顿的根因实测是解码——悖论乡那 7 张 7000px 大图
  // 并行解码就要 ~400~600ms，是纯 CPU 开销，缓存热了也省不掉这段时间，
  // 之前几版（滑动/收缩再张开）都是让动画和这段解码同时发生，撞上了才卡。
  // 改成拆成两步：先在背后把下一个项目的图预加载 + 解码完（这期间画面
  // 完全不动，还停在当前项目，没有任何退出/跳转的动作），解码好了
  // （或最多等 1.5 秒兜底）才换内容、播一个简单的淡入淡出——这时候图已经
  // 解码完了，淡入淡出这种纯透明度动画本身合成成本很低，不会再卡。
  function preloadProjectImages(project, timeoutMs = 1500) {
    const decodes = project.pages.map((page) => {
      const src = pageSrc(page);
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img.decode().catch(() => {});
    });
    return Promise.race([
      Promise.all(decodes),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // 图已经在背后解码完了才会走到这一步，所以这里的 transform 动画不会再撞上
  // 解码成本——用回之前认可的上下滑动：NEXT 时新内容从下面升上来，PREV 反过来
  // 从上面下来，方向和"前进/后退"对应。
  let switchToken = 0;
  async function slideToProject(direction, nextIndex) {
    const project = DATA[((nextIndex % DATA.length) + DATA.length) % DATA.length];
    const token = ++switchToken;
    await preloadProjectImages(project);
    if (token !== switchToken) return; // 等待期间用户又点了别的，这次结果作废

    if (!gsap || reduceMotion) {
      selectProject(nextIndex);
      fillDetail();
      return;
    }
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(detailStage, { yPercent: -100 * direction, opacity: 0, duration: .32, ease: 'power2.in' })
      .call(() => {
        selectProject(nextIndex);
        fillDetail();
        gsap.set(detailStage, { yPercent: 100 * direction, autoAlpha: 0 });
      })
      // 切进来的结构和 openDetail 的"rise"完全一致：位移和淡入拆成两条独立
      // 曲线（不是同一条 tween 共用同一个缓动），位移 expo.out（先快后收），
      // 淡入 sine.out（平缓，没有 expo 那种一开始冲到大半透明度的急促感），
      // 两条同时起步、同时长，读起来仍是一个整体在动。
      .addLabel('rise')
      .to(detailStage, { yPercent: 0, duration: project.enterDuration || 1.33, ease: 'expo.out' }, 'rise')
      .to(detailStage, { autoAlpha: 1, duration: project.enterDuration || 1.33, ease: 'sine.out' }, 'rise');
  }

  closeBtn.addEventListener('click', closeDetail);
  navPrev.addEventListener('click', () => slideToProject(-1, currentIndex - 1));
  navNext.addEventListener('click', () => slideToProject(1, currentIndex + 1));

  // 原生 `scroll-behavior: smooth` 在滚轮高频触发时会自己打架（每次 scrollLeft +=
  // 都重新起一次动画，打断上一次没走完的），越滚越卡。改成自己接管：滚轮只更新一个
  // "目标位置" pagesScrollTarget，每帧用 lerp 让真实 scrollLeft 追上目标，
  // 丝滑感来自这个追赶的缓动，而不是浏览器自带的 smooth。
  const WHEEL_FORCE = 2.4; // 滚轮力度倍数，越大滚同样距离挪得越多
  const PAGES_EASE = 0.16; // 追赶速度，越大越快贴上目标（越不"丝滑"）
  let pagesScrollTarget = 0;
  let pagesScrollRaf = null;

  function pagesMaxScroll() {
    return Math.max(0, detailPages.scrollWidth - detailPages.clientWidth);
  }

  function runPagesScrollLoop() {
    if (pagesScrollRaf) return;
    const step = () => {
      const current = detailPages.scrollLeft;
      const diff = pagesScrollTarget - current;
      if (Math.abs(diff) < 0.5) {
        detailPages.scrollLeft = pagesScrollTarget;
        pagesScrollRaf = null;
        return;
      }
      detailPages.scrollLeft = current + diff * PAGES_EASE;
      pagesScrollRaf = requestAnimationFrame(step);
    };
    pagesScrollRaf = requestAnimationFrame(step);
  }

  detailPages.addEventListener('wheel', (event) => {
    event.preventDefault();
    pagesScrollTarget = Math.min(pagesMaxScroll(), Math.max(0, pagesScrollTarget + event.deltaY * WHEEL_FORCE));
    runPagesScrollLoop();
  }, { passive: false });

  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragging = false;
  // 点图片放大：不能靠原生 click 事件——pointerdown 一开始就对 detailPages
  // 调用了 setPointerCapture，这会把随后的 click 事件 target 重定向到
  // detailPages 自己，冒泡路径跳过图片，click 监听器永远收不到（和
  // PITFALLS [2026-09-13] 画廊卡片那次是同一个坑）。改成手动判定：按下时
  // 记住按在哪张图上，抬起时若水平位移没过阈值，直接当成点击处理，不依赖
  // 浏览器派生的 click。
  let pageClickTarget = null;
  let pageDragMoved = 0;
  detailPages.addEventListener('pointerdown', (event) => {
    dragging = true;
    pageClickTarget = event.target.closest('.works-detail-page');
    pageDragMoved = 0;
    if (pagesScrollRaf) { cancelAnimationFrame(pagesScrollRaf); pagesScrollRaf = null; }
    dragStartX = event.clientX;
    dragStartScroll = detailPages.scrollLeft;
    pagesScrollTarget = detailPages.scrollLeft;
    detailPages.classList.add('is-dragging');
    detailPages.setPointerCapture(event.pointerId);
  });
  detailPages.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    pageDragMoved = Math.abs(event.clientX - dragStartX);
    detailPages.scrollLeft = dragStartScroll - (event.clientX - dragStartX);
    pagesScrollTarget = detailPages.scrollLeft;
  });
  detailPages.addEventListener('pointerup', () => {
    dragging = false;
    detailPages.classList.remove('is-dragging');
    if (pageClickTarget && pageDragMoved < DRAG_CLICK_THRESHOLD && DATA[currentIndex].enableImageZoom) {
      openLightbox(pageClickTarget.dataset.full || pageClickTarget.src, pageClickTarget.alt);
    }
    pageClickTarget = null;
  });

  function openLightbox(src, alt) {
    lightboxImg.classList.remove('is-zoomed');
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightboxScroll.scrollTop = 0;
    lightboxScroll.scrollLeft = 0;
    lightbox.setAttribute('aria-hidden', 'false');
    lightbox.classList.add('is-visible');
  }

  function closeLightbox() {
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.classList.remove('is-visible');
    lightboxImg.classList.remove('is-zoomed');
    lightboxImg.src = '';
  }

  // 图本身原图分辨率极高（部分是几千到三万多像素的整页设计稿），
  // 铺满宽度还是看不清细节，所以再加一级「点图放大」：第一次点先适配
  // 宽度，再点一次放到接近原始像素（不超过原图，避免比原图还糊的假放大），
  // 放大/缩小都以鼠标点的那个位置为锚点，让同一个点留在鼠标下面，
  // 不会"点哪放大了却看着别的地方"。
  const ZOOM_SCALE = 2.4; // 相对"适配宽度"再放大的倍数
  function toggleLightboxZoom(event) {
    const beforeRect = lightboxImg.getBoundingClientRect();
    const fracX = (event.clientX - beforeRect.left) / beforeRect.width;
    const fracY = (event.clientY - beforeRect.top) / beforeRect.height;

    const zoomingIn = !lightboxImg.classList.contains('is-zoomed');
    if (zoomingIn) {
      const naturalWidth = lightboxImg.naturalWidth || beforeRect.width * ZOOM_SCALE;
      const zoomWidth = Math.min(naturalWidth, beforeRect.width * ZOOM_SCALE);
      lightboxImg.style.setProperty('--zoom-width', `${zoomWidth}px`);
    }
    lightboxImg.classList.toggle('is-zoomed', zoomingIn);

    requestAnimationFrame(() => {
      const afterRect = lightboxImg.getBoundingClientRect();
      const targetX = afterRect.left + fracX * afterRect.width;
      const targetY = afterRect.top + fracY * afterRect.height;
      lightboxScroll.scrollLeft += targetX - event.clientX;
      lightboxScroll.scrollTop += targetY - event.clientY;
    });
  }

  // 放大后要能拖着看（不止靠滚动条）。和画廊/图带那两处一样的坑：不能靠
  // 原生 click 来切换缩放，得自己用位移阈值分「点击」和「拖拽」——
  // 越过阈值才当拖拽（这时才 setPointerCapture），没越过阈值就当点击，
  // 在 pointerup 里手动调用缩放切换。
  let lightboxPressed = false;
  let lightboxDragging = false;
  let lightboxDragStartX = 0;
  let lightboxDragStartY = 0;
  let lightboxScrollStartX = 0;
  let lightboxScrollStartY = 0;
  let lightboxDragMoved = 0;

  lightboxImg.addEventListener('pointerdown', (event) => {
    lightboxPressed = true;
    lightboxDragging = false;
    lightboxDragStartX = event.clientX;
    lightboxDragStartY = event.clientY;
    lightboxScrollStartX = lightboxScroll.scrollLeft;
    lightboxScrollStartY = lightboxScroll.scrollTop;
    lightboxDragMoved = 0;
  });
  lightboxImg.addEventListener('pointermove', (event) => {
    if (!lightboxPressed) return;
    const dx = event.clientX - lightboxDragStartX;
    const dy = event.clientY - lightboxDragStartY;
    lightboxDragMoved = Math.hypot(dx, dy);
    if (!lightboxDragging && lightboxDragMoved >= DRAG_CLICK_THRESHOLD) {
      lightboxDragging = true;
      lightboxImg.setPointerCapture(event.pointerId);
      lightboxImg.classList.add('is-panning');
    }
    if (!lightboxDragging) return;
    lightboxScroll.scrollLeft = lightboxScrollStartX - dx;
    lightboxScroll.scrollTop = lightboxScrollStartY - dy;
  });
  function endLightboxPress(event) {
    if (!lightboxPressed) return;
    lightboxPressed = false;
    const wasDragging = lightboxDragging;
    lightboxDragging = false;
    lightboxImg.classList.remove('is-panning');
    if (!wasDragging) toggleLightboxZoom(event);
  }
  lightboxImg.addEventListener('pointerup', endLightboxPress);
  lightboxImg.addEventListener('pointercancel', endLightboxPress);
  lightboxClose.addEventListener('click', closeLightbox);
  // 点大图本身是放大/缩小，只有点空白背景才关闭。
  lightboxScroll.addEventListener('click', (event) => {
    if (event.target === lightboxScroll) closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (lightbox.classList.contains('is-visible')) { closeLightbox(); return; }
    closeDetail();
  });

  measureGeometry();
  selectProject(currentIndex, { expandChannel: true });

  // tvReady 只用来告诉入场时间轴"电视预览是不是已经能看了"，不影响这里
  // 加载失败时的兜底逻辑（fallback 类照加、television 照样留 null）。
  let resolveTvReady;
  const tvReady = new Promise((resolve) => { resolveTvReady = resolve; });

  import('./works-tv.js?v=tv-pause-on-detail-1')
    .then(({ createTelevisionPreview }) => createTelevisionPreview(televisionCanvas))
    .then((preview) => {
      television = preview;
      television.setProject(DATA[currentIndex]);
      // 电视模型是异步加载的，若加载完成时详情页已经开着，要补上暂停。
      if (detailOpen) television.setPaused(true);
      resolveTvReady();
    })
    .catch((error) => {
      console.warn('Television model could not load; falling back to the project gallery.', error);
      document.getElementById('televisionPane').classList.add('is-fallback');
      resolveTvReady();
    });

  playWorksIntro();
})();
