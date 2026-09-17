import { createBreakScene } from './break-scene.js';

// 2026-09-14 全量重做：交互手感（弹簧滚动、拖拽回弹、滚轮阈值、详情弹层的
// clip-path 开合、图带拖拽/滚轮、PREV·NEXT 预加载切换）逐条照搬
// site/works/js/works.js，只做必要的改名和左右方向镜像（见 break.css 顶部注释）。
// 3D 模型场景本身（createBreakScene）完全不动，不属于这次搬运范围。
//
// 2026-09-15（第三次修正，取代克隆卡方案）：用户发现克隆卡会让同一张图片
// 存在两份 DOM/<img>，要求"机制上还是这 6 张图片循环，不要新加载，
// 离开画面的卡片跑到另一端去，但视觉上不能看到跳跃"。做法：不再用克隆卡，
// 画廊只有这 6 个真实 <article>；每张卡自己的竖直位置不再由父级 track 的
// 一个 translateY 统一决定，而是各自用「和当前弹簧值 springY 的最短环形距离」
// 算出来（下面 renderCards 里的取模折叠）。这样任何一张卡的位置都是关于
// springY 的周期函数，越过循环边界时数值本身就是连续的——不需要在某个时刻
// 把 DOM 节点搬到另一端，也就没有"看得见的跳跃"这回事。

(() => {
  const DATA = window.BREAK_DATA || [];
  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gallery = document.getElementById('breakGallery');
  const modelCanvas = document.getElementById('breakModelCanvas');
  const modelStatus = document.getElementById('breakModelStatus');
  const modelName = document.getElementById('breakModelName');
  const modelTags = document.getElementById('breakModelTags');
  const modelCredit = document.getElementById('breakModelCredit');
  const modelCopy = document.getElementById('breakModelCopy');
  const routeVeil = document.getElementById('breakRouteVeil');
  const detail = document.getElementById('breakDetail');
  const detailStage = document.getElementById('breakDetailStage');
  const detailPages = document.getElementById('breakDetailPages');
  const detailName = document.getElementById('breakDetailName');
  const detailDesc = document.getElementById('breakDetailDesc');
  const detailLinks = document.getElementById('breakDetailLinks');
  const closeBtn = document.getElementById('breakClose');
  const navPrev = document.getElementById('breakNavPrev');
  const navNext = document.getElementById('breakNavNext');

  // 3D 场景是静态的画架/凳子/落地灯装置，和"当前选中哪个项目"无关，
  // 不像 Works 的电视场景那样要随项目换内容——原样创建一次即可。
  // 留着返回值是为了拿 signalProjectSwitch()：切换项目时给灯一下反馈。
  const breakScene = createBreakScene(modelCanvas, modelStatus);

  if (!DATA.length) return;

  const N = DATA.length;
  const PROJECT_SWITCH_DURATION = 1.45;
  const PROJECT_SWITCH_EASE = 'power3.out';
  const cards = [];
  let currentIndex = 0;
  // trackIndex：不再被夹在 [0, N) 或 [REAL_START, REAL_END] 里，是一个
  // 可以无限增减的整数——它只表示"从初始位置数，一共走了几步"，
  // 真正显示第几个项目由 currentIndex = ((trackIndex % N) + N) % N 决定。
  let trackIndex = 0;
  let channelExpanded = true;
  let detailOpen = false;

  const numbered = (index) => String(index + 1).padStart(2, '0');

  const track = document.createElement('div');
  track.className = 'break-gallery-track';
  gallery.appendChild(track);

  DATA.forEach((project, index) => {
    const card = document.createElement('article');
    card.className = 'break-gallery-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `查看 ${project.name} 项目详情`);
    card.innerHTML = `<img class="break-gallery-card-image" src="${project.cover}" alt="" draggable="false">`;
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

  const galleryIndex = document.createElement('div');
  galleryIndex.className = 'break-gallery-index';
  galleryIndex.setAttribute('aria-hidden', 'true');
  galleryIndex.innerHTML = `
    <span class="break-gallery-index-current"></span>
    <span class="break-gallery-index-line"><i></i></span>`;
  gallery.appendChild(galleryIndex);
  const galleryIndexCurrent = galleryIndex.querySelector('.break-gallery-index-current');
  const galleryIndexLine = galleryIndex.querySelector('.break-gallery-index-line');
  const galleryIndexMarker = galleryIndexLine.querySelector('i');

  function updateIndexProgress(index) {
    const trackHeight = galleryIndexLine.clientHeight;
    const segmentHeight = trackHeight / N;
    galleryIndexMarker.style.height = `${segmentHeight}px`;
    galleryIndexMarker.style.top = `${segmentHeight * index}px`;
    galleryIndexCurrent.style.top = `${segmentHeight * (index + 0.5)}px`;
  }

  // 弹簧参数和 Works 完全一致，手感必须一样。
  const SPRING = { stiffness: 260, damping: 34, mass: 0.9 };
  const REST_DELTA = 0.05;
  const REST_SPEED = 0.05;

  let trackTargetY = 0;
  let springY = 0;
  let springV = 0;
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
    // gap 写在 CSS 变量 --channel-gap 里（clamp()），用一个隐藏探针元素
    // 把它转成真实像素，不在 JS 里另写一份数字，避免两处的间距各改各的。
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
    nameInner.className = 'break-model-name-inner';
    nameInner.innerHTML = project.modelNameHtml || project.name;
    modelName.replaceChildren(nameInner);
    modelName.setAttribute('aria-label', `查看 ${project.name} 项目详情`);
    modelTags.innerHTML = (project.tags || []).map((tag) => `<li>${tag}</li>`).join('');
    if (project.highlightCompany && project.company && project.company.includes(' · ')) {
      const [companyPart, rolePart] = project.company.split(' · ');
      modelCredit.innerHTML = `<span class="credit-company">${companyPart}</span> · ${rolePart}`;
    } else {
      modelCredit.textContent = project.company || '';
    }

    if (!gsap || reduceMotion) return;
    gsap.killTweensOf(modelCopy.children);
    gsap.fromTo(
      modelCopy.children,
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
    const titleInner = modelName.querySelector('.break-model-name-inner');
    if (!titleInner || !gsap || reduceMotion) return;
    gsap.killTweensOf(titleInner);
    gsap.to(titleInner, hovering
      ? { x: 7, scaleX: 1.015, duration: .52, ease: 'power3.out', overwrite: 'auto' }
      : { x: 0, scaleX: 1, duration: .38, ease: 'sine.out', overwrite: 'auto' });
  }

  modelName.addEventListener('pointerenter', () => setTitleHover(true));
  modelName.addEventListener('pointerleave', () => setTitleHover(false));
  modelName.addEventListener('click', () => openDetail(currentIndex));
  modelName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(currentIndex);
    }
  });

  let hasSelectedOnce = false;

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
      updateIndexProgress(currentIndex);
      updateTrackPosition();
      updateCopy(DATA[currentIndex]);
      // 页面刚加载时的第一次"选中"不算切换，不闪；从第二次开始才是
      // 用户真的换了项目，给灯一下红光反馈。
      if (hasSelectedOnce) breakScene.signalProjectSwitch();
      hasSelectedOnce = true;
    }
  }

  // 环上两个逻辑序号之间最短的带符号距离（负数＝往上、正数＝往下），
  // selectProject 找最短跳转路径要用。
  function shortestDelta(from, to) {
    let d = (from - to) % N;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    return d;
  }

  // 按逻辑项目号跳转（点击某张卡、PREV/NEXT、初始加载都走这条）。
  // 不是直接把 trackIndex 设成 0..N-1 的原始值，而是找一条从当前 trackIndex
  // 出发、方向和距离都最短的路——否则比如正好绕了三圈之后点第 1 张卡，
  // 会诡异地整个转三圈转回去。
  function selectProject(index, options) {
    const targetProjectIndex = ((index % N) + N) % N;
    const delta = shortestDelta(targetProjectIndex, currentIndex);
    applyTrackIndex(trackIndex + delta, options);
  }

  // 按轨道位置走一步（±1）——滚轮/拖拽用这条，trackIndex 会自然无限增减，
  // 视觉上第 6 项之后接回第 1 项，folded 取模保证过程连续。
  function stepTrack(direction) {
    applyTrackIndex(trackIndex + direction);
  }

  function fillDetail() {
    const project = DATA[currentIndex];
    detailPages.innerHTML = project.pages
      .map((src, index) => `<img class="break-detail-page" src="${src}" alt="${project.name} 第${index + 1}页" decoding="async">`)
      .join('');
    detailPages.scrollTop = 0;
    pagesScrollTarget = 0;
    if (pagesScrollRaf) { cancelAnimationFrame(pagesScrollRaf); pagesScrollRaf = null; }
    detailName.textContent = project.name;
    detailDesc.textContent = project.summary || '';
    detailLinks.innerHTML = (project.links || [])
      .map(link => `<a class="break-detail-link" href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`)
      .join('');
  }

  // 开合动画和 Works 逐帧一致，见 works.js 里对这套 clip-path 的详细注释。
  const DETAIL_SEED = 'inset(50% 30.0001% 50.0002% 30.0003%)';
  const DETAIL_FULL = 'inset(0% 0.0001% 0.0002% 0.0003%)';

  function openDetail(index = currentIndex) {
    selectProject(index);
    fillDetail();
    detailOpen = true;
    detail.setAttribute('aria-hidden', 'false');
    detail.classList.add('is-visible');

    if (!gsap || reduceMotion) return;
    gsap.set(detail, { autoAlpha: 1, clipPath: DETAIL_SEED });

    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(detail, { clipPath: DETAIL_FULL, duration: .72, ease: 'expo.inOut' })
      .addLabel('rise')
      .fromTo(detailStage, {
        y: () => {
          const contentTop = detailPages.getBoundingClientRect().top;
          const contentBottom = detail.querySelector('.break-detail-info').getBoundingClientRect().bottom;
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

    if (!gsap || reduceMotion) {
      detail.classList.remove('is-visible');
      return;
    }
    gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        detail.classList.remove('is-visible');
        gsap.set(detail, { clearProps: 'clipPath' });
      },
    })
      .to(detail, { clipPath: DETAIL_SEED, duration: .56, ease: 'expo.inOut' })
      .to(detail, { autoAlpha: 0, duration: .14, ease: 'power1.in' });
  }

  const WHEEL_THRESHOLD = 60;
  const WHEEL_COOLDOWN = 420;
  let wheelAcc = 0;
  let wheelUntil = 0;

  document.addEventListener('wheel', (event) => {
    if (detailOpen || window.matchMedia('(max-width: 900px)').matches) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    event.preventDefault();
    const now = event.timeStamp;
    if (now < wheelUntil) return;
    wheelAcc += delta;
    if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;
    stepTrack(Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelUntil = now + WHEEL_COOLDOWN;
  }, { passive: false });

  const DRAG_CLICK_THRESHOLD = 6;
  const DRAG_THROW = 0.12;

  let galleryPressed = false;
  let galleryDragging = false;
  let galleryDragSuppressClick = false;
  let galleryDragStartY = 0;
  let galleryDragBaseY = 0;
  let galleryDragMoved = 0;
  let dragLastY = 0;
  let dragLastT = 0;
  let dragVelocity = 0;

  // 无限循环没有首尾，拖拽不用回弹（DRAG_ELASTIC/dragBounds 这套已经没意义，
  // 删掉了）——往哪个方向都能一直拖下去。
  function nearestIndexTo(y) {
    return Math.round((centerAnchor - y) / cardStep);
  }

  gallery.addEventListener('pointerdown', (event) => {
    if (detailOpen) return;
    galleryPressed = true;
    galleryDragging = false;
    galleryDragStartY = event.clientY;
    galleryDragBaseY = springY;
    galleryDragMoved = 0;
    dragLastY = event.clientY;
    dragLastT = event.timeStamp;
    dragVelocity = 0;
    stopSpring();
  });

  gallery.addEventListener('pointermove', (event) => {
    if (!galleryPressed) return;
    galleryDragMoved = event.clientY - galleryDragStartY;

    if (!galleryDragging && Math.abs(galleryDragMoved) >= DRAG_CLICK_THRESHOLD) {
      galleryDragging = true;
      gallery.setPointerCapture(event.pointerId);
    }
    if (!galleryDragging) return;

    const dt = (event.timeStamp - dragLastT) / 1000;
    if (dt > 0) {
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
      trackTargetY = targetYFor(trackIndex);
      startSpring();
      return;
    }

    galleryDragSuppressClick = true;
    const thrown = springY + dragVelocity * DRAG_THROW;
    const next = nearestIndexTo(thrown);
    springV = dragVelocity;
    if (next === trackIndex) {
      trackTargetY = targetYFor(trackIndex);
      startSpring();
    } else {
      applyTrackIndex(next);
    }
  }

  gallery.addEventListener('pointerup', endGalleryDrag);
  gallery.addEventListener('pointercancel', endGalleryDrag);

  function preloadProjectImages(project, timeoutMs = 1500) {
    const decodes = project.pages.map((src) => {
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

  let switchToken = 0;
  async function slideToProject(direction, rawNextIndex) {
    const nextIndex = ((rawNextIndex % N) + N) % N;
    const project = DATA[nextIndex];
    const token = ++switchToken;
    await preloadProjectImages(project);
    if (token !== switchToken) return;

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
      .addLabel('rise')
      .to(detailStage, { yPercent: 0, duration: project.enterDuration || 1.33, ease: 'expo.out' }, 'rise')
      .to(detailStage, { autoAlpha: 1, duration: project.enterDuration || 1.33, ease: 'sine.out' }, 'rise');
  }

  closeBtn.addEventListener('click', closeDetail);
  navPrev.addEventListener('click', () => slideToProject(-1, currentIndex - 1));
  navNext.addEventListener('click', () => slideToProject(1, currentIndex + 1));

  const WHEEL_FORCE = 2.4;
  const PAGES_EASE = 0.16;
  let pagesScrollTarget = 0;
  let pagesScrollRaf = null;

  // 2026-09-15 改定：图带从横向滚动（贴右 + row-reverse 的负数 scrollLeft
  // 区间，见旧版注释）换成竖直滚动、贴右侧固定列——现在是普通的 flex
  // column，scrollTop 区间正常是 [0, max]，不用再处理任何取反的坑。
  function pagesMaxScroll() {
    return Math.max(0, detailPages.scrollHeight - detailPages.clientHeight);
  }

  function runPagesScrollLoop() {
    if (pagesScrollRaf) return;
    const step = () => {
      const current = detailPages.scrollTop;
      const diff = pagesScrollTarget - current;
      if (Math.abs(diff) < 0.5) {
        detailPages.scrollTop = pagesScrollTarget;
        pagesScrollRaf = null;
        return;
      }
      detailPages.scrollTop = current + diff * PAGES_EASE;
      pagesScrollRaf = requestAnimationFrame(step);
    };
    pagesScrollRaf = requestAnimationFrame(step);
  }

  detailPages.addEventListener('wheel', (event) => {
    event.preventDefault();
    pagesScrollTarget = Math.min(pagesMaxScroll(), Math.max(0, pagesScrollTarget + event.deltaY * WHEEL_FORCE));
    runPagesScrollLoop();
  }, { passive: false });

  let dragStartY = 0;
  let dragStartScroll = 0;
  let dragging = false;
  detailPages.addEventListener('pointerdown', (event) => {
    dragging = true;
    if (pagesScrollRaf) { cancelAnimationFrame(pagesScrollRaf); pagesScrollRaf = null; }
    dragStartY = event.clientY;
    dragStartScroll = detailPages.scrollTop;
    pagesScrollTarget = detailPages.scrollTop;
    detailPages.classList.add('is-dragging');
    detailPages.setPointerCapture(event.pointerId);
  });
  detailPages.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const next = dragStartScroll - (event.clientY - dragStartY);
    detailPages.scrollTop = Math.max(0, Math.min(pagesMaxScroll(), next));
    pagesScrollTarget = detailPages.scrollTop;
  });
  detailPages.addEventListener('pointerup', () => {
    dragging = false;
    detailPages.classList.remove('is-dragging');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetail();
  });

  measureGeometry();
  selectProject(currentIndex, { expandChannel: true });

  // 从 Home/Works 点 BREAK 跳过来时，遮幕还盖着屏幕——趁这段时间把当前
  // 可见的画廊封面图解码好，遮幕滑走时就不会再有"图还没到"的空白闪烁。
  // 最多等 900ms 兜底，和 Works 那边的同款预加载逻辑保持一致。
  // 3D 模型（画架/凳子/落地灯）本身的异步加载不在这次处理范围内，
  // 照旧显示/隐藏它自己的 "LOADING MODEL" 状态文字。
  function preloadVisibleCovers() {
    const imgs = [...gallery.querySelectorAll('.break-gallery-card-image')];
    const decodes = imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    return Promise.all(decodes);
  }

  async function playBreakRouteReveal() {
    if (!document.documentElement.classList.contains('break-route-armed')) return;
    if (!gsap || reduceMotion || !routeVeil) {
      document.documentElement.classList.remove('break-route-armed');
      return;
    }
    await Promise.race([
      preloadVisibleCovers(),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    gsap.to(routeVeil, {
      yPercent: -100,
      duration: 1.05,
      ease: 'expo.inOut',
      overwrite: 'auto',
      onComplete: () => {
        document.documentElement.classList.remove('break-route-armed');
        gsap.set(routeVeil, { clearProps: 'transform,willChange' });
      },
    });
  }

  playBreakRouteReveal();
})();
