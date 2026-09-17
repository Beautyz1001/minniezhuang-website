// 2026-09-15 新增：首页 Works 三卡精选轮播。
// 右侧三张卡片中间大、两侧缩小+模糊；滚轮/点击切换时左侧文字栏同步换内容。
// 文字模板保持全站统一的四行顺序：标签 → 项目名 → 公司·角色 → 一句话简介。
//
// 2026-09-16 重写为"滚动量连续驱动"（参考 21st.dev 的 circular-split-roll
// 组件，GSAP ScrollTrigger pin + scrub 手法）。之前是"滚一下跳一张卡"的
// 离散版本（那版的踩坑记录、锁定点计算方式等历史细节已经整段删除，
// 不再需要——这版用 ScrollTrigger 自己的 pin 机制，不用再手写"该不该锁""该
// 停在哪""放行了会不会又锁回去"这些判断，pin 本身就管好了）。
//
// 现在的模型：轨道中点撞到视口中点时 pin 住（`start: 'center center'`），
// 之后每多滚 `SCROLL_PER_CARD` 像素，卡片位置往下一张挪一点——不是滚一下
// 跳一张，是连续跟手，卡片的横向位置、模糊、暗度全部是当前滚动进度的
// 连续函数。滚够 `(卡片数-1) × SCROLL_PER_CARD` 时自动解除 pin，滚动接着
// 往下走；反向滚动同理，ScrollTrigger 的 pin 天然对称，不用另写倒退逻辑。
(function () {
  const root = document.getElementById('worksCarousel');
  if (!root) return;

  const track = document.getElementById('wcTrack');
  const cards = Array.from(root.querySelectorAll('.wc-card'));
  const tagsEl = document.getElementById('wcTags');
  const titleEl = document.getElementById('wcTitle');
  const creditEl = document.getElementById('wcCredit');
  const summaryEl = document.getElementById('wcSummary');
  const infoEl = document.querySelector('.works-carousel-info');

  // 数据顺序和 HTML 里三张卡片一一对应（data-index 0/1/2）。
  const DATA = [
    {
      tags: ['GENERATIVE AI', 'GAME UX', 'GAMEPLAY DESIGN', 'MOBILE'],
      title: 'PARADOX HEAVEN',
      credit: 'SJTU Design Campus · Product Manager',
      highlightCompany: true,
      summary: 'AI-native mobile RPG reimagining tabletop play through generative interaction.',
    },
    {
      tags: ['ONLINE GAME', 'GAME UX', 'INTERACTION DESIGN', 'PC'],
      title: 'NBA2K ONLINE',
      credit: 'Tencent Games · Interaction Design',
      highlightCompany: true,
      summary: 'Interaction design across core systems for a live PC basketball game.',
    },
    {
      tags: ['MMORPG', 'GAME UX', 'INTERACTION DESIGN', 'AI TOOLING', 'PC'],
      title: 'FANTASY WESTWARD JOURNEY',
      credit: 'NetEase Games · Experience Design',
      highlightCompany: true,
      summary: 'Game UX and interaction design for a live PC MMORPG.',
    },
    {
      // 与 Works 详情页的 shanghai-1924 项目保持一致；详情页数据见
      // site/works/js/works-data.js，标签 / 名称 / 身份不要在 Home 另写一套。
      tags: ['VR', 'IMMERSIVE EXPERIENCE', 'DIGITAL HERITAGE', 'EXHIBITION'],
      title: 'SHANGHAI1924',
      credit: 'Xuhui Gov./SJTU Design Campus · Lead Producer',
      highlightCompany: true,
      summary: 'A VR piece about what people carry when they leave.',
    },
  ];

  let active = 0;
  // 只有开了连续跟手（桌面 + 非 reduce-motion，见文件末尾）时才会被赋值成
  // 真正的 ScrollTrigger 实例；否则维持 null，goTo() 走离散瞬切兜底。
  let pinST = null;
  // 轮播滚动会在静止鼠标下方移动卡片；默认空函数让桌面 VIEW 提示按需接管复核。
  let refreshCardCursor = () => {};

  const infoTargets = [tagsEl, titleEl, creditEl, summaryEl];

  // 2026-09-16 改用 site/works（Works 详情页电视场景）里项目切换的原效果，
  // 见 site/works/js/works.js 的 updateCopy()：换项目时不分"先退场再进场"，
  // 内容直接换掉，紧接着让这组元素整体从 { y:40, 半透明, 暗（brightness .15）}
  // 补间到 { y:0, 全透明度, 正常亮度 }，同一批元素一起动、不错开
  // （没有 stagger）。数值（1.45s / power3.out）也照抄，不是我自己调的。
  function renderInfo(index, { animate = true } = {}) {
    const item = DATA[index];

    function applyContent() {
      tagsEl.innerHTML = item.tags.map(t => `<li>${t}</li>`).join('');
      // hover 的 scale 不能直接加在 titleEl 自己身上：进场时 gsap 会给它
      // 内联写 transform（translateY），内联样式会盖掉 CSS 里 :hover 的
      // transform，缩放动画会被吃掉。缩放挪到内层 span 上，跟 gsap 动的
      // 外层元素分开，两条 transform 互不冲突。
      titleEl.innerHTML = `<span class="wc-title-inner">${item.title}</span>`;
      /* 公司/机构用白色，角色仍沿用信用行的灰色；和 Works 详情页
         `.credit-company` 的语义与拆分方式一致。之后增加 NetEase Youdao
         等项目时，只要设 `highlightCompany: true` 就会自动沿用。 */
      if (item.highlightCompany && item.credit.includes(' · ')) {
        const [company, role] = item.credit.split(' · ');
        const companyEl = document.createElement('span');
        companyEl.className = 'credit-company';
        companyEl.textContent = company;
        creditEl.replaceChildren(companyEl, document.createTextNode(` · ${role}`));
      } else {
        creditEl.textContent = item.credit;
      }
      summaryEl.textContent = item.summary;
    }

    if (!window.gsap || !animate) {
      applyContent();
      return;
    }

    gsap.killTweensOf(infoTargets);
    // 2026-09-16 加：换项目时旧文字先往上滑走、渐隐，
    // 内容换掉之后再从下方渐显进入——原来是内容瞬间替换、只有进场那半。
    // ⚠⚠ 退场必须用 fromTo，不能用 to：用 gsap.getTweensOf() 直接查过
    // tween 对象——用 .to() 时它的起点是"元素当前的 opacity"，如果上一轮
    // 被 killTweensOf 打断时正好停在接近 0 的地方，这一轮退场就变成
    // "从 0 到 0"：progress 从 0 走到 1（tween 真的在跑），但画面上的
    // opacity 全程都是 0，肉眼看到的就是文字直接消失、没有淡出过程。
    // fromTo 显式指定起点是 1，不管上一轮留下什么状态，这一轮退场永远
    // 从"完全可见"开始淡出，不会再吃到残留状态。
    gsap.timeline({ overwrite: 'auto' })
      .fromTo(infoTargets, { y: 0, opacity: 1 }, { y: -40, opacity: 0, duration: .45, ease: 'sine.in' })
      .call(applyContent)
      .fromTo(infoTargets,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.45, ease: 'power3.out' });
  }

  // 离散兜底用：直接把 --offset 摆到整数位，没有连续跟手时（窄屏/
  // reduce-motion）卡片就是简单的瞬切 + CSS transition。
  function renderCards() {
    cards.forEach((card, i) => {
      const offset = i - active;
      card.classList.toggle('is-active', offset === 0);
      card.style.setProperty('--offset', offset);
      card.setAttribute('aria-selected', offset === 0 ? 'true' : 'false');
    });
    refreshCardCursor();
  }

  function goTo(index) {
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    if (clamped === active) return;
    if (pinST) {
      // 连续跟手模式：点击/键盘/拖拽不直接跳，而是把页面滚到那张卡对应的
      // 滚动位置，交给 pin 的 onUpdate 用同一套连续插值把卡片带过去——
      // 点击和滚轮翻页走的是同一条动画路径，手感统一。
      const progress = clamped / (cards.length - 1);
      const targetY = pinST.start + (pinST.end - pinST.start) * progress;
      if (window.__lenis) {
        window.__lenis.scrollTo(targetY, { duration: .8, easing: t => 1 - Math.pow(1 - t, 3) });
      } else {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
      return;
    }
    active = clamped;
    renderInfo(active);
    renderCards();
  }

  // 首张文案必须先写入 DOM，供首屏进入触发器量取；不能在这里直接播，
  // 因为脚本加载时 Works 还在视口外，动画会在用户看见它之前结束。
  renderInfo(active, { animate: false });
  renderCards();

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const index = Number(card.dataset.index);
      if (index === active) {
        const slug = card.dataset.project;
        if (slug && window.__homeWorksDetail) window.__homeWorksDetail.open(slug);
      } else {
        goTo(index);
      }
    });
  });

  // 只给「此刻可直接打开详情」的居中卡片一个跟手的 VIEW 提示。它是鼠标
  // 的交互线索，不替代按钮语义；触屏和减少动态偏好下完全不创建这层元素。
  const supportsCardCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceCardCursorMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (supportsCardCursor && !reduceCardCursorMotion && window.gsap) {
    const gsap = window.gsap;
    const cardCursor = document.createElement('span');
    cardCursor.className = 'wc-card-cursor';
    cardCursor.textContent = 'VIEW';
    cardCursor.setAttribute('aria-hidden', 'true');
    document.body.append(cardCursor);

    gsap.set(cardCursor, { xPercent: -50, yPercent: -50 });
    const moveCursorX = gsap.quickTo(cardCursor, 'x', { duration: .18, ease: 'power3.out' });
    const moveCursorY = gsap.quickTo(cardCursor, 'y', { duration: .18, ease: 'power3.out' });
    let pointerX = null;
    let pointerY = null;
    const hideCardCursor = () => {
      cardCursor.classList.remove('is-visible');
      document.documentElement.classList.remove('wc-card-cursor-active');
    };
    const showCardCursor = event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      const isEntering = !cardCursor.classList.contains('is-visible');
      if (isEntering) {
        // 先同步到当前鼠标，再让 CSS 的 opacity transition 显示；第一次和
        // 之后每次重进都不会从上一次坐标或 (0, 0) 滑过来。
        gsap.set(cardCursor, { x: event.clientX, y: event.clientY });
      } else {
        moveCursorX(event.clientX);
        moveCursorY(event.clientY);
      }
      cardCursor.classList.add('is-visible');
      document.documentElement.classList.add('wc-card-cursor-active');
      refreshCardCursor();
    };

    let cursorRefreshFrame = 0;
    // Lenis 在滚轮松开后仍会继续惯性推进页面，但不保证每一帧都派发原生
    // scroll。只在 VIEW 可见期间持续逐帧比较卡片边界与静止鼠标坐标；卡片
    // 无论横向或纵向移开都会隐藏，然后立刻停止这个循环。
    const trackCardCursor = () => {
      cursorRefreshFrame = 0;
      if (!cardCursor.classList.contains('is-visible') || pointerX === null || pointerY === null) return;
      const activeCard = cards.find(card => card.classList.contains('is-active'));
      if (!activeCard) { hideCardCursor(); return; }
      const rect = activeCard.getBoundingClientRect();
      const isOverActiveCard =
        pointerX >= rect.left && pointerX <= rect.right &&
        pointerY >= rect.top && pointerY <= rect.bottom;
      if (!isOverActiveCard) hideCardCursor();
      else cursorRefreshFrame = requestAnimationFrame(trackCardCursor);
    };
    refreshCardCursor = () => {
      if (!cursorRefreshFrame) cursorRefreshFrame = requestAnimationFrame(trackCardCursor);
    };
    // 轮播固定前后，卡片会跟随整页做竖直滚动，这一段没有 ScrollTrigger 的
    // onUpdate；必须监听真实 scroll，才能在静止鼠标下卡片从上/下移走时收起。
    window.addEventListener('scroll', refreshCardCursor, { passive: true });

    cards.forEach(card => {
      card.addEventListener('pointerenter', event => {
        if (card.classList.contains('is-active')) showCardCursor(event);
      });
      card.addEventListener('pointermove', event => {
        if (card.classList.contains('is-active')) showCardCursor(event);
        else hideCardCursor();
      });
      card.addEventListener('pointerleave', hideCardCursor);
      // 点击详情后立刻收起提示，避免它停留在即将出现的详情层上。
      card.addEventListener('click', hideCardCursor);
    });
  }

  // 标题文字也能点，效果和点当前居中卡片一样——直接开当前项目的详情弹窗，
  // 不需要先居中（标题本来就只显示 active 那张卡的内容）。
  titleEl.addEventListener('click', () => {
    const slug = cards[active]?.dataset.project;
    if (slug && window.__homeWorksDetail) window.__homeWorksDetail.open(slug);
  });

  // 标题 hover 只动内层 span：外层 titleEl 正由 renderInfo() 负责项目切换时的
  // 进出场位移，混在同一层会互相覆盖 transform。这里是一点“镜头靠近”的横向
  // 推进和极轻的横向张力；红色竖线由 CSS 挂在外层标题上，互不抢 transform。
  const supportsTitleHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceTitleMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (supportsTitleHover && !reduceTitleMotion) {
    const setTitleHover = hovering => {
      const titleInner = titleEl.querySelector('.wc-title-inner');
      if (!titleInner) return;

      if (!window.gsap) return;

      gsap.killTweensOf(titleInner);
      gsap.to(titleInner, hovering
        ? { x: 7, scaleX: 1.015, duration: .52, ease: 'power3.out', overwrite: 'auto' }
        : { x: 0, scaleX: 1, duration: .38, ease: 'sine.out', overwrite: 'auto' });
    };

    titleEl.addEventListener('pointerenter', () => setTitleHover(true));
    titleEl.addEventListener('pointerleave', () => setTitleHover(false));
  }

  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(active + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(active - 1); }
  });

  // 触屏/鼠标拖拽切换（横向拖动一段距离算一次翻页）。
  let dragStartX = null;
  track.addEventListener('pointerdown', event => { dragStartX = event.clientX; });
  track.addEventListener('pointerup', event => {
    if (dragStartX === null) return;
    const diff = event.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(diff) < 40) return;
    goTo(active + (diff < 0 ? 1 : -1));
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduceMotion.matches && window.gsap && window.ScrollTrigger) {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);

    /* 原来 `infoFirstRender` 让第一张直接显示，因而只有换卡才有渐隐。
       这里先把首张放到与换卡入场相同的起始状态，等轮播真正进入视口才播放；
       所以四张卡的文字都有一致的渐显出场，而不会在页面加载时提前播完。 */
    gsap.set(infoTargets, { autoAlpha: 0, y: 40 });
    ScrollTrigger.create({
      trigger: root,
      start: 'top 78%',
      once: true,
      onEnter: () => gsap.to(infoTargets, {
        autoAlpha: 1,
        y: 0,
        duration: 1.05,
        ease: 'power3.out'
      })
    });
  }

  if (!reduceMotion.matches && window.innerWidth >= 992 && window.gsap && window.ScrollTrigger) {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);
    // 关掉离散兜底那条 CSS transition，见 homepage-portal.css 里
    // `.wc-track--scrub .wc-card` 的注释——scrub 期间 --offset 逐帧连续变化，
    // 再叠一层 transition 会互相打架。
    track.classList.add('wc-track--scrub');

    // 每张卡对应多少像素的滚动距离——决定"划多远换一张"的节奏。
    const SCROLL_PER_CARD = 480;
    const CARD_STEP = 1 / (cards.length - 1);
    /* 磁吸区扩大到每张卡行程的 ±28%（约 ±134px）：比默认的半段行程仍窄，
       但进入一张卡的展示区就会明显被拉到正中，而不是轻易滑过去。 */
    const SNAP_RADIUS = CARD_STEP * .28;
    const snapToNearbyCard = progress => {
      // 开启 inertia 后，ScrollTrigger 传进来的可能是按滚速预估的落点；
      // 先夹回这段轮播的有效进度，防止快速滚动时预估值越过首尾。
      const bounded = Math.max(0, Math.min(1, progress));
      const target = Math.round(bounded / CARD_STEP) * CARD_STEP;
      return Math.abs(bounded - target) <= SNAP_RADIUS ? target : bounded;
    };

    let renderedIndex = active; // 上一次已经渲染过文字/is-active 的那张，用来判断"越过半张"要不要换字

    // 2026-09-16 修：真正的根因找到了——用 gsap.getTweensOf() 直接查过
    // wcTitle 身上的 tween，快速滚动跨两张以上卡片时，每跨过一张
    // renderInfo() 就会 killTweensOf 打断上一条、重开一条新的退场/进场，
    // 退场永远没机会跑完就被下一次打断，肉眼看到的就是文字一直卡在
    // 全透明、只有内容在跳，动效等于没播过。
    // 改法：文字的动效单独做一个小防抖（120ms），只有滚动/跨卡真的停下来
    // 之后才触发那一套退场→换字→进场；--offset 驱动的图片位移、is-active
    // 高亮都还是原来逐帧实时更新，不受影响，只有文字动效延后到"稳定了才播"。
    let renderInfoTimer = null;

    function applyProgress(rawProgress) {
      const progress = Math.max(0, Math.min(cards.length - 1, rawProgress));
      cards.forEach((card, i) => card.style.setProperty('--offset', i - progress));
      const nearest = Math.round(progress);
      if (nearest !== renderedIndex) {
        renderedIndex = nearest;
        active = nearest;
        cards.forEach((card, i) => {
          card.classList.toggle('is-active', i === nearest);
          card.setAttribute('aria-selected', i === nearest ? 'true' : 'false');
        });
        clearTimeout(renderInfoTimer);
        renderInfoTimer = setTimeout(() => renderInfo(nearest), 120);
      }
      refreshCardCursor();
    }

    pinST = ScrollTrigger.create({
      trigger: root,
      start: 'center center',
      end: () => `+=${(cards.length - 1) * SCROLL_PER_CARD}`,
      pin: true,
      pinSpacing: true,
      // 给卡片留一点点追随感，但仍远低于早先 .45s 的明显滞后。
      scrub: .13,
      invalidateOnRefresh: true,
      onUpdate: self => applyProgress(self.progress * (cards.length - 1)),
      // 靠近单卡正中时才贴合。默认等分 snap 会在每张卡的一整段半区间内
      // 都强行吸附，范围太大、还会等较久；这里用限定半径 + 零等待，
      // 让磁吸“到点立刻开始”，但以一段连续、渐进的行程贴到正中，
      // 而不是咔一下跳到选中态。
      snap: {
        snapTo: snapToNearbyCard,
        delay: 0,
        // power2.out 一开始就有明确位移，仍会在终点柔和收住；比 sine.inOut
        // 那种慢起步更快给出“已经吸住”的反馈。
        duration: { min: .28, max: .42 },
        ease: 'power2.out',
        // 保留滚轮余势并顺势接到目标点，避免“先刹停一拍，再开始吸附”。
        inertia: true
      }
    });

    /* carousel.js 在 homepage-portal-scroll.js 之后加载。pin 创建时会插入一段
       spacer，把后面的 BREAK 整体推下去；若不在此刷新，BREAK 的逐行入场仍用
       创建 pin 之前的旧坐标，会在用户真正看见文字前提前播完。 */
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }
})();
