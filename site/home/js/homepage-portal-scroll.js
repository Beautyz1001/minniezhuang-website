// 门后首页的滚动叙事。只作用于 .inner-world，不参与门洞或 Three.js 相机计算。
(function () {
  const root = document.querySelector('.inner-world');
  if (!root || !window.gsap || !window.ScrollTrigger) return;

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups = [];
  let lenis = null;

  gsap.registerPlugin(ScrollTrigger);

  function splitRevealText(element) {
    if (!element) return [];
    const source = element.dataset.revealText || element.textContent.trim();
    element.textContent = '';
    return [...source].map(character => {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = character === ' ' ? '\u00a0' : character;
      element.appendChild(span);
      return span;
    });
  }

  function splitFallingText(element) {
    if (!element) return [];
    const source = element.dataset.fallingText || element.textContent.trim();
    element.textContent = '';
    const characters = [];
    source.split(' ').forEach((word, wordIndex, words) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'fall-word';
      [...word].forEach(character => {
        const charSpan = document.createElement('span');
        charSpan.className = 'fall-char';
        charSpan.textContent = character;
        wordSpan.appendChild(charSpan);
        characters.push(charSpan);
      });
      element.appendChild(wordSpan);
      if (wordIndex < words.length - 1) element.appendChild(document.createTextNode(' '));
    });
    return characters;
  }

  function setupLenis() {
    if (reduceMotion.matches || !window.Lenis) return;
    lenis = new window.Lenis({
      duration: 1.08,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.2
      /* 2026-09-15：原来这里有一条 `prevent: node => closest('.works-carousel-track')`，
         让鼠标停在卡片上时滚轮永远只切卡、不走页面滚动。后来改成"滚到轮播区域
         中点才锁定视口"（见 homepage-portal-carousel.js 文件末尾），这条按鼠标位置
         判断的规则和新的按滚动位置判断的规则会互相打架（实测过：鼠标停在卡片上
         时会绕开锁定判断、直接连续翻好几张）。已删除，统一交给新逻辑处理。 */
    });
    lenis.on('scroll', ScrollTrigger.update);
    /* 2026-09-15：暴露给 homepage-portal-carousel.js，用来在卡片轮播区域
       临时 stop()/start() 页面滚动（"锁定视口切卡"效果）。 */
    window.__lenis = lenis;
    const tick = time => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    cleanups.push(() => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenis = null;
    });
  }

  function syncShowreelExitGap() {
    const wrapper = document.querySelector('.pin-wrap');
    const stage = document.querySelector('.showreel-video-stage');
    const note = document.querySelector('.showreel-note');
    if (!wrapper || !stage || !note) return;

    if (window.innerWidth < 992) {
      root.style.removeProperty('margin-top');
      return;
    }

    /* 黑底以视频 / 小字最终底边为基准。
       ⚠ 2026-09-09：这里原来读 `--inner-entry-gap`，和 `.home-works` 的
       padding-top 共用一个数——用户要求把黑幕渐变起点往上调、但 Works 内容
       不要跟着动，所以拆成了专用的 `--curtain-entry-gap`（现在是 -10px，
       即 90 − 100）。`.home-works` 的 padding-top 继续用 `--inner-entry-gap`
       （没变），两者从这里开始各管各的，改一个不会影响另一个。 */
    const entryGap = Number.parseFloat(getComputedStyle(root).getPropertyValue('--curtain-entry-gap')) || 90;
    const stageTop = stage.getBoundingClientRect().top + window.scrollY;
    const finalBottom = stageTop + stage.offsetHeight - Number.parseFloat(getComputedStyle(note).bottom || 0);
    const wrapperTop = wrapper.getBoundingClientRect().top + window.scrollY;
    root.style.marginTop = `${finalBottom + entryGap - (wrapperTop + wrapper.offsetHeight)}px`;
  }

  function setupShowreelVideo() {
    const section = document.querySelector('.home-showreel');
    const stage = document.querySelector('.showreel-video-stage');
    const pin = document.querySelector('.showreel-video-pin');
    const media = document.querySelector('.showreel-media');
    const note = document.querySelector('.showreel-note');
    const copy = document.querySelector('.showreel-copy');

    /* 视频开关（2026-09-08）。⚠ 必须写在下面那条 return 之前：
       窄屏和「减少动态」下缩小动画不跑，但视频照样要播。
       视频是 preload="none" 的，所以真正开始下载的时刻就是这里第一次 play()。
       ⚠ play() 的 Promise 一定要 catch——切走再切回时偶尔会抛未处理异常。 */
    const video = media && media.querySelector('video');
    if (video && section) {
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: self => {
          if (self.isActive) video.play().catch(() => {});
          else video.pause();
        }
      });
    }

    if (!section || !stage || !pin || !media || !note || !copy || reduceMotion.matches || window.innerWidth < 992) return;

    /* 最大态和右下终点均以 slogan 标题的实际内容边界为准。 */
    const finalX = () => copy.getBoundingClientRect().right - pin.getBoundingClientRect().right;
    const finalY = () => -Number.parseFloat(getComputedStyle(note).bottom || 0);

    /* 固定由 CSS sticky 完成，时间轴只更新内部 transform。
       因此每个滚动位置都有唯一画面状态，不会在 pin / unpin 时额外跳一次。 */
    gsap.set(note, { y: () => window.innerHeight + note.offsetHeight });
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: stage,
        start: 'top top',
        end: 'bottom bottom',
        /* Lenis 是唯一的滚动缓冲层；时间轴直接映射其进度。 */
        scrub: true,
        invalidateOnRefresh: true,
        refreshPriority: -1
      }
    });

    timeline
      .addLabel('maximum', 0)
      .addLabel('shrink', .05)
      .to(media, {
        x: finalX,
        y: finalY,
        scale: 1 / 3,
        duration: .46,
        ease: 'none'
      }, 'shrink')
      .to(note, {
        y: 0,
        duration: .25,
        ease: 'none'
      }, 'shrink+=.21');
  }

  function setupWorks() {
    const section = root.querySelector('.home-works');
    if (!section) return;
    const intro = section.querySelector('.works-intro');
    const sloganLines = wrapLines(intro && intro.querySelector('.works-slogan'));
    const letters = gsap.utils.toArray('.works-sticky-word span', section);
    const items = gsap.utils.toArray('.work-item', section);

    /* Works 的这句 slogan 只在第一次进入视口时推入；播完后保持终态，
       不会因离开 / 回到此区而重新隐藏或重播。 */
    if (reduceMotion.matches) gsap.set(sloganLines, { yPercent: 0 });
    else setupOnceLineReveal(sloganLines, intro, 'top 60%');

    /* ── W O R K S 五字母：随四张轮播卡左→右→左，在 N5 上方最后再聚到右侧 ───
       用户原话："从左边聚拢状态，迁移到右边聚拢状态，迁移过去的过程中还会有收缩动效
       （就像我的初版方案那样是有收缩的，而不是平移）"。参考站 noth.in。

       ⚠ **作废过两版，别再改回去**：
       ① 最早的「聚到屏幕正中 + 缩到 0.2 再散回原位」——聚拢点没有参照物，见 PITFALLS；
       ② 第二版的「左聚拢 → 散开铺满整行」——**散开只是过渡态，不是终点**。
          第二版是我量参考站时只记了 left、漏了 transform 里的 scale 才得出的错误结论。

       参考站实测（视口 1536，真实滚轮，五个 `.works-word`）：

       | scrollY | left                          | scale |
       |---------|-------------------------------|-------|
       | 1700    | 19, 46, 67, 86, 105           | 1.0   | ← 左聚拢
       | 2600    | 30, 93, 376, 1143, 1459       | ~0.20 | ← 散最开时也缩到最小
       | 3000    | 1186, 1414, 1460, 1480, 1499  | 0.76→1| ← 回涨中
       | 3500    | 1409, 1439, 1461, 1480, 1499  | 1.0   | ← 右聚拢

       所以是三段式：**左聚拢（原大）→ 散开+缩到 0.2 →右聚拢（原大）**。
       中途那个横跨整屏的散开，是因为每个字母的 x 进度错开，不是它自己的终点。

       做法：CSS 的 `justify-content: flex-end` 已经把**布局态设成右聚拢**（= 终点），
       所以这里只需要给每个字母一个负 x 把它拉到左边聚拢，再随滚动插值回 0；
       scale 单独走一条 1 → .2 → 1 的曲线，和 x 并行。
       x 用 offsetLeft 算而不是 getBoundingClientRect：后者会把当前 transform
       算进去，scrub 中重算会自己叠加自己。 */
    if (!reduceMotion.matches && window.innerWidth >= 992 && letters.length) {
      const carousel = section.querySelector('#worksCarousel');
      const carouselCards = carousel ? carousel.querySelectorAll('.wc-card') : [];
      /* 与 carousel.js 的 SCROLL_PER_CARD 一一对应。四张卡有三段卡间行程，
         所以字母时间轴的起止点正好包住整个轮播 pin 区间。 */
      const carouselScrollDistance = () => Math.max(1, carouselCards.length - 1) * 480;
      const wordTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: carousel || section,
          start: carousel ? 'center center' : 'top top',
          end: carousel ? () => `+=${carouselScrollDistance()}` : '+=3100',
          /* 卡片自身是 .13s 的跟手，字母略慢一档但不再像旧版 3s 那样滞后。 */
          scrub: .24,
          invalidateOnRefresh: true
        }
      });
      const wordWrap = letters[0].parentElement;
      /* 两段完整占满四卡轮播：左→右、右→左。轮播结束时字回到左侧；
         最后一次左→右聚拢由下面 N5 区间单独负责，不能提前发生在卡片区。 */
      const LEGS = 2;
      const LETTER_DELAY = .06;
      letters.forEach((letter, index) => {
        /* 左聚拢时这个字母该在的位置 = 前面几个字母的宽度之和（紧挨成词，
           从 wrap 左边也就是内容线起算）；它自然待着的位置就是 `offsetLeft`
           ——`.works-sticky-word` 是 sticky、position 非 static，所以它本身就是
           这些 span 的 offsetParent，offsetLeft 已经是「相对 wrap 左边」，
           不要再减一次 wrap 自己的 offsetLeft（减了整组会右偏 61px）。 */
        const gatherX = () => {
          let acc = 0;
          for (let i = 0; i < index; i++) acc += letters[i].offsetWidth;
          return acc - letter.offsetLeft;
        };
        /* 靠后的字母 delay 更小 = 更早出发，和参考站 s 先归位一致。 */
        const delay = (letters.length - 1 - index) * LETTER_DELAY;

        /* 位移：每趟 1 个时间单位，终点在左右之间交替。
           leg 0: 左→右，leg 1: 右→左，leg 2: 左→右。 */
        wordTimeline.fromTo(letter,
          { x: gatherX },
          { x: 0, duration: 1, ease: 'power2.inOut' },
          delay);
        for (let leg = 1; leg < LEGS; leg++) {
          wordTimeline.to(letter,
            { x: leg % 2 ? gatherX : 0, duration: 1, ease: 'power2.inOut' },
            delay + leg);
        }

        /* 收缩：和位移并行的另一条曲线，**每趟各一次**，中点最小。
           两个半段各占那一趟的一半，所以「跑得最散」和「缩得最小」是同一刻
           （参考站就是这个关系）。 */
        wordTimeline.fromTo(letter,
          { scale: 1 },
          { scale: .2, duration: .5, ease: 'power2.in' },
          delay);
        wordTimeline.to(letter,
          { scale: 1, duration: .5, ease: 'power2.out' },
          delay + .5);
        for (let leg = 1; leg < LEGS; leg++) {
          wordTimeline.to(letter,
            { scale: .2, duration: .5, ease: 'power2.in' },
            delay + leg);
          wordTimeline.to(letter,
            { scale: 1, duration: .5, ease: 'power2.out' },
            delay + leg + .5);
        }
      });

      /* ── 停到 ( N5 ) 上方 10px，然后一起离场（2026-09-09 用户指定）────────
         用户原话："works 在 N5 上面 10px 的地方一起走"。
         不加这段的话两者是 53px（top 到 top），偏远。

         ⚠ **必须用运行时闭环，不能用静态坐标推算。** 上一版我按「页面刚加载时」量到的
         section 底 / outro 顶 算出一个固定补偿量，结果页面滚起来后布局变了
         （outro 的文档坐标从 7332 变成 7015），补偿量整个不成立，字母被提前推走 253px。
         现在改成每次滚动都读 `( N5 )` 的**当前真实位置**来定位，布局怎么变都对。

         取 min()：N5 还在下面很远时，`n5 - GAP` 是个很大的数，min 取「自然位置」——
         字母照常吸顶在 top 上，什么都不做；等 N5 升上来、`n5 - GAP` 比自然位置更高时，
         min 改取它，字母就被拉着跟 N5 一起走。**一个式子涵盖两个阶段，没有状态。** */
      const outro = root.querySelector('.works-outro');
      if (outro) {
        /* 5px 量的是**看得见的那两行字之间**，不是元素框之间。
           `.works-sticky-word` 框高 48 而字号只有 30，字靠框上沿，
           所以按框对框设这个数时，字与字会明显更远（10px 时实测是 17.6px）。
           这里改用字母的文字行框底边来定位：
           GAP = （字母行框底 − wrap 框顶）+ 5，1536 下约 45.4。
           两个 rect 都含当前位移，相减得到的是纯内部偏移，所以这个值本身是稳定的。 */
        const gapTarget = () => {
          const r = document.createRange();
          r.selectNodeContents(letters[0]);
          return (r.getBoundingClientRect().bottom
            - wordWrap.getBoundingClientRect().top) + 5;
        };
        const sync = () => {
          const cur = gsap.getProperty(wordWrap, 'y') || 0;
          /* 去掉自己已经加的位移，才是 sticky 给的「自然位置」。 */
          const natural = wordWrap.getBoundingClientRect().top - cur;
          const target = Math.min(natural,
            outro.getBoundingClientRect().top - gapTarget());
          gsap.set(wordWrap, { y: target - natural });
        };
        ScrollTrigger.create({
          trigger: outro,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: sync,
          onRefresh: sync
        });

        /* 四张卡滚完后，WORKS 先停在左侧。N5 从视口底部向上滚的这一整段，
           字母同步跑第三趟左→右聚拢；N5 到达 WORKS 下方时字刚好已在右侧，
           随后 y 闭环让两者保持间距、一起向上离场。 */
        const n5ExitTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: outro,
            start: 'top bottom',
            end: 'top 16%',
            scrub: .24,
            invalidateOnRefresh: true
          }
        });
        letters.forEach((letter, index) => {
          const delay = (letters.length - 1 - index) * LETTER_DELAY;
          n5ExitTimeline.to(letter, {
            x: 0,
            duration: 1,
            ease: 'power2.inOut'
          }, delay);
          n5ExitTimeline.fromTo(letter,
            { scale: 1 },
            { scale: .2, duration: .5, ease: 'power2.in' },
            delay);
          n5ExitTimeline.to(letter,
            { scale: 1, duration: .5, ease: 'power2.out' },
            delay + .5);
        });
      }
    }

    /* ⚠ 2026-09-08：`offsets`（整卡 y 视差的六个位移量）和 `masks`
       （clip-path 从某个角擦开的六种方向）两个数组已删除——
       五条卡现在全部走图带版式，这两套旧动效一个都不再使用。 */

    /* ── Works 卡片：**没有入场特效，这是用户 2026-09-09 的决定** ────────
       进场时唯一会动的是下面那段「图片在框内 ±6%」，那是旧有的、用户点名保留的。
       淡入、擦入**都不要**，见 `PITFALLS.md` [2026-09-09]。

       ⚠ 下面整段是当时对 distil.im 擦入效果的实测记录，**代码已整体删除，
       只留数据备查**。哪天要再做类似效果，这些数省得重量一遍；
       但**重做之前必须先问用户**——这个方向已经被否过一次。

       ── 以下为存档，无对应代码 ──────────────────────────────────────

       **它到底是什么**：每张图上有一个 `inset()` 裁切窗口，开场只露一条带子，
       然后张开到整张；图本身同时反向平移，所以读起来是"画面从某条边擦进来"，
       而不是"框在长大"。两条边**永远是 2:1**，谁的初始值大就从谁那头擦进来。

       **参考站九个格子的实测起始值**（1536×639，全部量到）：

         #1 The Library  左252  inset(25% 0 50%)     Y −95.9   从上往下
                         中252  inset(0 20% 0 10%)   X −25.2   从左往右
                         右252  inset(25% 0 50%)     Y −95.9   从上往下（video）
         #2 Ceremony     840    inset(0 10% 0 20%)   X +84.0   从右往左
         #3 Vestigios    1450   inset(50% 0 25%)     Y +95.9   从下往上
         #4 The Boat     840    inset(0 10% 0 20%)   X +84.0   从右往左
         #5 Lingo        三格   inset(50% 0 25%)     Y +95.9   三格都从下往上

       位移量换算成比例：**纵向 = 框高的 25%，横向 = 框宽的 10%**
       （95.88/383.5 = .25；25.17/251.7 = 84.02/840.2 = .10）。所以下面用比例写，
       不写死像素，窗口变了也不用重算。

       ★★ **最关键的一条：有一条边是钉死不动的（基准线）。** ★★
       上面那组 `inset` 是写在**被平移过的元素**身上的，**必须和位移合起来算**，
       才知道画面上究竟露出哪一块。以 #1 左格为例（框高 H=383.5）：
         裁切保留 [0.25H, 0.50H]，元素整体上移 0.25H
         → 落到画面上是 [0, 0.25H]，**上边正好贴住框顶**。
       收尾时裁切归零、位移归零 → [0, H]，上边**仍然是 0**。
       也就是说：**上边全程一动不动，下边从 25% 高一路推到底。**
       四条的结论一样，只是钉住的边不同：
         #1 左/右格 上边钉死 ｜ #1 中格 左边钉死
         #2 / #4    右边钉死 ｜ #3 / #5 下边钉死

       ⚠ **换算成"以框为基准"的等价写法**（下面 `WIPE_FROM` 用的就是这个）：
         从上往下 `inset(0 0 75%)`    + 图上移 25% 框高
         从下往上 `inset(75% 0 0)`    + 图下移 25% 框高
         从左往右 `inset(0 30% 0 0)`  + 图左移 10% 框宽
         从右往左 `inset(0 0 0 30%)`  + 图右移 10% 框宽
       （75% = 1 − 0.75k 推出来的，30% 同理 = 1 − 0.3k，不是拍的数）

       ⚠ **踩过的坑：把裁切和位移分开看。**
       我曾按字面把 `inset(25% 0 50%)` 直接写上去，结果带子**浮在框正中间**、
       两头同时往外张——四条边全在动，没有基准线；图又在里面自己滑，
       于是读成**两个互不相干的动作**（用户原话"感觉擦了两次"）。
       **这不是帧率问题，是几何错了。以后改这段，先算"画面上露出哪一块"，
       不要盯着 `inset` 的字面值。**

       **不是跟着滚动走的。** 把页面停死在一个位置完全不滚，裁切照样自己收完。
       ⚠ 这条是前三次全部测错的根源：我一直"边滚边采样"，把它当成滚动驱动去找，
       又只记录了透明度和位移、**唯独没记 `clip-path`**，所以三次都得出
       "参考站没有入场动画"的错误结论。**以后量任何入场效果，必须把
       `clip-path` / `mask` 一起记，并且要在"停住不滚"的条件下验一遍是不是时间驱动。**

       **节奏是量出来的**：每 61ms 剩余量乘 0.91 的指数衰减（半衰期 ≈0.45s），
       尾巴很长很软。下面的 ease 就是这条曲线本身（`1 - e^(-3.72p)`），
       ⚠ 只有 `WIPE_DURATION` 是选的——指数衰减理论上永不结束，
       2.4s 处剩余 2.4%，肉眼已看不出，取这里收尾。觉得慢就改这一个数。

       ⚠ **曲线必须除以 `1 - e^(-3.72)` 归一化，这不是洁癖。**
       GSAP 直接用 ease 的输出算插值，原式在 p=1 只走到 0.976，
       于是每张图会**永久残留约 1.2% 的裁切和几像素的偏移**——实测踩过一次。
       只要改 3.72（想换节奏），下面那个除数必须跟着一起改。

       **同一条里的几格是同时开始的**（实测三格首帧同时出现），不做错开。

       ⚠ 平移用 GSAP 的 `x` / `y`（像素分量），**不能用 `yPercent`**——
       下面那段"图片在框内 ±6%"占的就是 `yPercent`。GSAP 把
       `x / y / xPercent / yPercent` 存成独立分量再合成，两个补间各占一个才不打架。

       方向表（用户当时指定）：PARADOX 主图 down / 视频格 right、NBA2K left、
       有道 up、梦幻西游 up、BUBBLE up。
       四个方向的起点（已换算成"以框为基准"，各自钉死一条边）：
         down  inset(0% 0% 75%)     图上移 25% 框高
         up    inset(75% 0% 0%)     图下移 25% 框高
         right inset(0% 30% 0% 0%)  图左移 10% 框宽
         left  inset(0% 0% 0% 30%)  图右移 10% 框宽
       时长 2.4s；缓动是实测的指数衰减 `(1 - e^(-3.72p)) / (1 - e^(-3.72))`，
       **除数不能省**，否则终点差 2.4%，会永久残留裁切。

       ⚠ 遗留未解之谜（重做时会再撞上）：NBA2K 那一格**始终不触发**。
       触发器建得出来、start 算得对（4189 = 格子顶 4827 − 视口 638）、
       滚动确实跨过（格子顶 698 → 618），但 `onEnter` 就是不执行，
       裁切全程 `none`，其余五格正常。两种写法都试过，同样结果，根因未找到。
       ── 存档结束 ──────────────────────────────────────────────── */

    items.forEach(item => {
      const image = item.querySelector('.work-image');
      const strip = item.querySelector('.work-strip');
      if (!image || !strip) return;

      if (reduceMotion.matches) {
        gsap.set(strip, { opacity: 1 });
        return;
      }

      if (window.innerWidth >= 992) {
        /* 整张卡片的 y 视差：**已整体删除**。
           这一层是破坏对齐的元凶——规整感靠边框对齐建立，外框绝不因滚动而动。

           图片在框内的位移：**五条统一 ±6%**，用户唯一点名要保留的动效。
           做法是反过来定：先定死幅度，再让图片长到刚好够
           （CSS 里图片高度 = 框高 116%，验算写在那段注释里）。

           ⚠ 改 ±6 必须同步验算 CSS 那个 116%，两者绑死。
           ⚠ 但**不需要**再按素材比例逐卡重算了——旧版每张卡一个数
           （4 / −4、0、5.5 / −5.5、−5 / −20）的做法已作废：
           那是因为当年每张卡的框和图各有一套尺寸；
           现在框高统一、图统一 116%，余量自然一致。
           素材只要按各自格子的比例裁好，cover 就不会再额外裁。

           ⚠ 例外走 `data-slide`（2026-09-08 加）：某一格被单独调过取景、
           上下余量不再是标准的 8%时，在那张 img 上写 `data-slide="2.8"`。
           不写就是 6，其余四条完全不受影响。
           **这个数不许拍脑袋填**：它 = 该格图片在框外藏得较少的那一侧的余量 ÷ 图高，
           再留一点安全余量。填大了滚动时框的上下边会露出 --inner-purple 底色。 */
        /* ⚠ 不能写成 `parseFloat(...) || 6`：`data-slide="0"` 解析出来是 0，
           0 是假值，会被 `||` 悄悄换成 6，然后滚动时框边露出底色。
           取景取到"整张图铺满框"时 0 是合法值，必须显式判断。 */
        const raw = parseFloat(image.dataset.slide);
        const slide = Number.isFinite(raw) ? raw : 6;
        if (slide === 0) return;   /* 这一格没有余量，根本不建补间 */
        gsap.fromTo(image, { yPercent: slide }, {
          yPercent: -slide,
          ease: 'none',
          scrollTrigger: {
            trigger: item,
            start: 'top bottom',
            end: 'bottom center',
            scrub: 3
          }
        });
      }
    });
  }

  /* ── BREAK 段 `B R E A K` 五字母动效（2026-09-16 起，2026-09-17 四次定稿）──
     两趟：左→右→左，终点停在左边（贴 View all），逻辑照抄 `setupWorks()` 的
     gatherX 算法、power2.inOut、scale .2、LETTER_DELAY .06。

     ⚠ 钉住区间和动效区间是两个独立的触发点，别合并：
     - **钉住**（position:fixed，贴 logo 下方）从 `.home-break-open` 顶部
       触顶就开始——用户原话"break 要像 works 一样，遇到 logo 就开始
       pin"，即字母一碰到 logo（BREAK 开篇滚到视口顶部）就立刻钉住，和
       Works 的字一进 `.home-works` 就吸顶是同一回事，不用等电影院。
       钉住后字先保持静止（原样"BREAK"，不动），直到下面第 2 点触发才动。
     - **动效**（左→右→左两趟）仍然要等电影院播完、`.home-cinema` 底边
       离开视口顶部才开始跑，落在"电影院之后 → View all"这一段——这一条
       没变，用户只是要把"钉住"的时间点提前到碰到 logo 那一刻，不是要把
       动效也提前。 */
  function setupBreakWord() {
    if (reduceMotion.matches || window.innerWidth < 992) return;
    const openSection = root.querySelector('.home-break-open');
    const cinemaSection = root.querySelector('.home-cinema');
    const wordWrap = root.querySelector('.break-sticky-word');
    const outro = root.querySelector('.install-outro');
    if (!openSection || !cinemaSection || !wordWrap || !outro) return;
    const letters = gsap.utils.toArray('.break-sticky-word span', wordWrap);
    if (!letters.length) return;

    const LETTER_DELAY = .06;

    const wordTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: cinemaSection,
        start: 'bottom top',
        endTrigger: outro,
        end: 'top 16%',
        scrub: .24,
        invalidateOnRefresh: true
      }
    });

    letters.forEach((letter, index) => {
      /* 同 Works：左聚拢时这个字母该在的位置 = 前面几个字母宽度之和，
         从 offsetLeft 反推，不用 getBoundingClientRect（含 transform 会自己叠自己）。 */
      const gatherX = () => {
        let acc = 0;
        for (let i = 0; i < index; i++) acc += letters[i].offsetWidth;
        return acc - letter.offsetLeft;
      };
      const delay = (letters.length - 1 - index) * LETTER_DELAY;

      /* 两趟：左→右、右→左（终点，停在左边贴 View all），每趟中途缩到 .2
         再放大回 1，和 Works 同一套曲线，只是少一趟、终点从右改左。 */
      wordTimeline.fromTo(letter, { x: gatherX }, { x: 0, duration: 1, ease: 'power2.inOut' }, delay);
      wordTimeline.fromTo(letter, { scale: 1 }, { scale: .2, duration: .5, ease: 'power2.in' }, delay);
      wordTimeline.to(letter, { scale: 1, duration: .5, ease: 'power2.out' }, delay + .5);

      wordTimeline.to(letter, { x: gatherX, duration: 1, ease: 'power2.inOut' }, delay + 1);
      wordTimeline.to(letter, { scale: .2, duration: .5, ease: 'power2.in' }, delay + 1);
      wordTimeline.to(letter, { scale: 1, duration: .5, ease: 'power2.out' }, delay + 1.5);
    });

    /* 停到 View all 上方 5px、然后跟它一起离场——公式和 Works 的 N5 段一样，
       取 min(固定钉住的屏幕位置, outro 当前屏幕位置 − GAP)。钉住的屏幕位置
       直接复用 Works `.works-sticky-word` 的同一个公式
       （`--works-sticky-top + --works-heading-offset + 10px`），两个字的
       吸顶高度因此严格一致；GAP 从 10 改成 5（用户这次要求"距离 view all
       5px"）。 */
    const rootStyle = getComputedStyle(document.documentElement);
    const pinTopPx = parseFloat(rootStyle.getPropertyValue('--works-sticky-top')) +
      parseFloat(rootStyle.getPropertyValue('--works-heading-offset')) + 10;

    let pinned = false;
    const gapTarget = () => {
      const r = document.createRange();
      r.selectNodeContents(letters[0]);
      return (r.getBoundingClientRect().bottom - wordWrap.getBoundingClientRect().top) + 5;
    };
    const engage = () => {
      if (pinned) return;
      pinned = true;
      const left = wordWrap.getBoundingClientRect().left;
      gsap.set(wordWrap, { position: 'fixed', top: pinTopPx, left, margin: 0, width: wordWrap.offsetWidth, zIndex: 5 });
    };
    const release = () => {
      if (!pinned) return;
      gsap.set(wordWrap, { clearProps: 'position,top,left,margin,width,zIndex' });
      pinned = false;
    };
    const sync = () => {
      if (!pinned) return;
      const target = Math.min(pinTopPx, outro.getBoundingClientRect().top - gapTarget());
      gsap.set(wordWrap, { top: target });
    };

    /* ⚠ 2026-09-17 六次定稿：trigger 不能用 `openSection`（`.home-break-open`）。
       该 section 有 `padding-top: 280px`，字在里面又是 `position:absolute;
       top:0` 贴在 `.break-intro` 顶边——也就是说字的自然位置比 section 顶边
       低 280px。之前用 `trigger: openSection, start: 'top top'`，触发时机是
       "section 顶边碰到视口顶部"，但那一刻字的自然位置其实还在屏幕下方
       约 280px 处，一下子被摁到 `top:68px`，凭空跳了约 212px——这就是用户
       看到的"一次明显的跳变/闪烁"。
       改成直接拿字自己（`wordWrap`）当 trigger，`start: 'top ${pinTopPx}px'`
       ——也就是"字的自然顶边滚到屏幕 68px 处"才触发。这一刻字的自然位置
       和钉住目标位置（top:68px）在数学上完全重合，切换到 position:fixed
       时零跳变，和 CSS 原生 `position:sticky` 的连续性是同一个道理
       （Works 用的就是真正的 sticky，天生没有这个问题；BREAK 做不到用
       sticky，但把触发点算准了就能达到同样连续的视觉效果）。 */
    ScrollTrigger.create({
      trigger: wordWrap,
      start: `top ${pinTopPx}px`,
      endTrigger: outro,
      end: 'bottom top',
      onEnter: engage,
      onEnterBack: engage,
      onLeaveBack: release,
      onUpdate: sync,
      onRefresh: sync
    });
  }

  /* 图片的网络请求完成，不代表浏览器已经把它解码成可绘制位图。离屏图片常会
     被留到第一次进入视口才解码 / 上传纹理；那一下若正好撞上卡片的 clip-path
     入场和视差，就会造成一次明显掉帧。这里不改图片文件、不缩尺寸：只在首屏
     之后的空闲时间，按顺序把后续会出现的图片预先 decode。每次只处理一张，
     避免把解码任务堆到同一帧或额外抬高峰值内存。 */
  function warmScrollingImages() {
    const queue = [
      ...root.querySelectorAll('.work-image'),
      ...root.querySelectorAll('.showreel-media img, .studio-video-media img, .parallax-frame img, .cinema-camera img, .vr-bg img')
    ];
    let idleId = 0;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || queue.length === 0) return;
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(warmNext, { timeout: 1200 });
      } else {
        idleId = window.setTimeout(warmNext, 120);
      }
    };

    const warmNext = () => {
      if (cancelled) return;
      const image = queue.shift();
      if (!image) return;
      const decode = () => image.decode().catch(() => {}).finally(schedule);
      if (image.complete) decode();
      else {
        image.addEventListener('load', decode, { once: true });
        image.addEventListener('error', schedule, { once: true });
      }
    };

    const start = () => schedule();
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    cleanups.push(() => {
      cancelled = true;
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      window.removeEventListener('load', start);
    });
  }

  function setupWorksBackdrop() {
    const section = root.querySelector('.home-works');
    const outro = root.querySelector('.works-outro');
    const hero = document.querySelector('.hero');
    if (!section || !outro || !hero) return;

    const setBackdropActive = active => {
      root.classList.toggle('works-backdrop-active', active);
      hero.classList.toggle('works-backdrop-active', active);
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      // Works 一进入视口便盖上毛玻璃，避免首张卡出现未遮罩的过渡空档。
      start: 'top bottom',
      endTrigger: outro,
      end: 'bottom top',
      onToggle: self => setBackdropActive(self.isActive)
    });

    setBackdropActive(trigger.isActive);
    cleanups.push(() => {
      trigger.kill();
      setBackdropActive(false);
    });
  }

  function setupStudioVideo() {
    const section = root.querySelector('.home-studio-video');
    const media = root.querySelector('.studio-video-media');
    const image = media && media.querySelector('img');
    if (!section || !media || !image || reduceMotion.matches || window.innerWidth < 992) return;

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 2.5
      }
    });
    timeline.fromTo(media, { scale: 1 }, {
      scale: .72,
      ease: 'power4.inOut',
      duration: .55
    });
    timeline.to(media, {
      scale: .42,
      ease: 'power4.inOut',
      duration: .45
    });
    timeline.fromTo(image, { yPercent: -3, scale: 1.08 }, {
      yPercent: -13,
      scale: 1.16,
      ease: 'none',
      duration: 1
    }, 0);
  }

  /* BREAK 开场：ALONE IN KYOTO 整屏铺满 → 镜头往后拉 → 画面落回电影院银幕。

     这里只有**一个**变换，作用在 .cinema-camera 上，电影院和画面一起被推远。
     画面本身就是银幕那块矩形，所以两者的关系是写死在布局里的，不靠动画对齐——
     无论滚到哪一帧，画面都严丝合缝等于银幕。
     （PITFALLS 2026-09-05："做 A 变成 B 的衔接，先让两者几何上相等，再谈缓动。"
     这里更进一步：让它们从头到尾就是同一个矩形。）

     银幕在素材里的位置是实测出来的（5cinema.jpg，2048×1152，
     银幕四边 552.5 / 322 / 1496 / 785 像素，取亮度 50% 处）。
     **换电影院素材必须重测这四个数**，否则画面会落偏。

     overscan：画面往四周多铺 2 个素材像素。素材里那块银幕本身是亮白的，
     画面正好压到 50% 边界的话，四周会留下一条一两像素的白边，
     看上去像给画面描了个边。多盖 2px 把它压掉，代价是吃掉一丝黑色边框，
     肉眼看不出来。 */
  const CINEMA = {
    ratio: 2048 / 1152,
    left: 552.5 / 2048,
    right: 1496 / 2048,
    top: 322 / 1152,
    bottom: 785 / 1152,
    overscan: 2
  };

  function cinemaGeometry(stage) {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    /* 素材是 object-fit: cover 铺在舞台上的，先还原它实际被画成多大、偏了多少，
       银幕的位置才能从素材比例换算到屏幕坐标。 */
    const wide = W / H > CINEMA.ratio;
    const drawnW = wide ? W : H * CINEMA.ratio;
    const drawnH = wide ? W / CINEMA.ratio : H;
    const offsetX = (W - drawnW) / 2;
    const offsetY = (H - drawnH) / 2;

    /* 素材是等比缩放的，所以横竖用同一个系数把 overscan 换算到屏幕像素。 */
    const over = CINEMA.overscan * (drawnW / 2048);
    const x = offsetX + CINEMA.left * drawnW - over;
    const y = offsetY + CINEMA.top * drawnH - over;
    const w = (CINEMA.right - CINEMA.left) * drawnW + over * 2;
    const h = (CINEMA.bottom - CINEMA.top) * drawnH + over * 2;
    return { W, H, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  function setupCinema() {
    const section = root.querySelector('.home-cinema');
    const stage = section && section.querySelector('.cinema-stage');
    const camera = section && section.querySelector('.cinema-camera');
    const screen = section && section.querySelector('.cinema-screen');
    if (!section || !stage || !camera || !screen) return;

    /* 位置变量与缩放支点每次 refresh 重算：窗口比例一变，cover 的裁切就变，
       银幕在屏幕上的位置也跟着变。写死百分比只在 16:9 那一个比例下是对的。 */
    const layout = () => {
      const g = cinemaGeometry(stage);
      camera.style.setProperty('--screen-x', `${g.x}px`);
      camera.style.setProperty('--screen-y', `${g.y}px`);
      camera.style.setProperty('--screen-w', `${g.w}px`);
      camera.style.setProperty('--screen-h', `${g.h}px`);
      camera.style.transformOrigin = `${g.cx}px ${g.cy}px`;
      return g;
    };

    layout();
    ScrollTrigger.addEventListener('refreshInit', layout);
    cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', layout));

    /* 银幕里的视频（2026-09-08）：只在这一段进视口时播，离开就暂停。
       ⚠ 不要改成 HTML 里写 autoplay：这一段在页面很靠下的位置，
       一进页面就开播等于立刻下载 24 MB，首屏和 Works 段都要跟着抢带宽。
       这里用一条独立的 ScrollTrigger（不带 scrub），只做开关，每帧零开销。
       play() 返回的 Promise 在浏览器拦截自动播放时会 reject，必须 catch 掉，
       否则控制台会冒未处理的异常——视频是 muted，正常不会被拦，但换标签页
       回来那一下偶尔会。 */
    const video = screen.querySelector('video');
    if (video) {
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: self => {
          if (self.isActive) {
            const played = video.play();
            if (played && played.catch) played.catch(() => {});
          } else {
            video.pause();
          }
        }
      });
    }

    if (reduceMotion.matches || window.innerWidth < 992) return;

    /* 起点：把银幕推到刚好盖满整个视口，于是电影院被挤出画面，只剩影像本身。
       终点：变换归零，电影院回到 cover 的正常大小，画面落在银幕里。
       缩放全程线性——参考站实测就是线性（1.8→1 每一段等差），
       它读起来是匀速后退的镜头；加缓动会变成"先冲后停"。 */
    const from = () => {
      const g = cinemaGeometry(stage);
      return Math.max(g.W / g.w, g.H / g.h);
    };

    gsap.fromTo(camera, {
      scale: from,
      x: () => { const g = cinemaGeometry(stage); return g.W / 2 - g.cx; },
      y: () => { const g = cinemaGeometry(stage); return g.H / 2 - g.cy; }
    }, {
      scale: 1,
      x: 0,
      y: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        /* 固定交给 CSS sticky，时间轴只映射滚动位置；
           Lenis 是唯一的缓冲层，数值型 scrub 会让缩放追不上滚动。 */
        scrub: true,
        invalidateOnRefresh: true
      }
    });
  }

  function setupStudioParallax() {
    const statement = root.querySelector('[data-falling-text]');
    const fallingCharacters = splitFallingText(statement);

    if (!reduceMotion.matches && fallingCharacters.length) {
      gsap.fromTo(fallingCharacters, {
        yPercent: 0,
        rotation: 0,
        opacity: 1
      }, {
        yPercent: index => 170 + (index % 5) * 18,
        rotation: index => (index % 2 ? 1 : -1) * (3 + index % 4),
        opacity: .08,
        stagger: { each: .018, from: 'start' },
        ease: 'none',
        scrollTrigger: {
          trigger: statement.parentElement,
          start: 'top 52%',
          end: 'bottom 24%',
          scrub: 1.8
        }
      });
    }

    if (reduceMotion.matches || window.innerWidth < 992) return;

    gsap.utils.toArray('.parallax-frame', root).forEach(frame => {
      const image = frame.querySelector('img');
      if (!image) return;
      gsap.fromTo(image, { yPercent: -5 }, {
        yPercent: -20,
        ease: 'none',
        scrollTrigger: {
          trigger: frame,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 2.5
        }
      });
    });

  }

  /* BREAK 开篇的动效（2026-09-07）。CSS 那一段（.break-intro）里点名要有这个函数，
     它负责两件事：逐行的遮罩推入，和两个图框各自的视差。

     **机制是在参考站上实测确认的**：那边每一行都是 .line-mask-child-mask 包一层
     .line-child，静止时内层被往下推**整整一个行高**（实测 32.4 / 23.3 / 18.1px，
     正好等于各自字号的行高），越出的部分被外层的 overflow 裁掉。所以推入的行程
     就是 yPercent 100 → 0，不是某个拍脑袋的像素值。本地 CSS 的 .line / .line-inner
     就是同一套结构，这里只补内层和时间轴。

     ⚠ 下面 REVEAL 里的时长 / 间隔 / 缓动**不是实测值，是我取的**。参考站的动画依赖
     rAF，而这套 CDP 管道里标签一退到后台 rAF 就被冻结，动画根本不播，采样器只能采到
     一串静止的隐藏态（试过两次，都是 45 秒超时）。所以只有几何是量出来的，时序是选的。
     觉得快了慢了直接改这四个数，不影响别的东西。 */
  const REVEAL = {
    duration: .95,
    stagger: .085,
    ease: 'power3.out',
    /* BREAK 进入后先保留一拍，接近视口中部才推字。 */
    start: 'top 40%'
  };

  /* 内层是 JS 补的，不写在 HTML 里：这样即使脚本没跑，HTML 也还是一段正常的文字，
     不会因为缺了动画而空在那儿。BREAK 开篇和 VR 首屏共用。 */
  function wrapLines(scope) {
    if (!scope) return [];
    return gsap.utils.toArray('.line', scope).map(line => {
      const inner = document.createElement('span');
      inner.className = 'line-inner';
      while (line.firstChild) inner.appendChild(line.firstChild);
      line.appendChild(inner);
      return inner;
    });
  }

  /* 每次进入都重建补间：进入时强制隐藏再推入，离开时取消补间并隐藏。
     这不依赖同一条已完成 tween 的 reset，因此不会在第二次进入时停在终态。 */
  function setupRepeatingLineReveal(targets, trigger) {
    if (!targets.length || !trigger) return;

    const hide = () => {
      gsap.killTweensOf(targets);
      gsap.set(targets, { yPercent: 100 });
    };
    const play = () => {
      gsap.killTweensOf(targets);
      gsap.set(targets, { yPercent: 100 });
      gsap.to(targets, {
        yPercent: 0,
        duration: REVEAL.duration,
        stagger: REVEAL.stagger,
        ease: REVEAL.ease,
        overwrite: true
      });
    };

    hide();
    ScrollTrigger.create({
      trigger,
      start: REVEAL.start,
      end: 'top top',
      onEnter: play,
      onEnterBack: play,
      onLeave: hide,
      onLeaveBack: hide,
      /* 刷新时恰好位于可视区，也要有一次明确的进场。 */
      onRefresh: self => self.isActive ? play() : hide()
    });
  }

  /* 仅供页面两句主 slogan 使用：初次进入时播放一次，触发器随后销毁，
     所以无论继续往下、往上回滚或刷新布局，文字都会保留在最终位置。 */
  function setupOnceLineReveal(targets, trigger, start = REVEAL.start) {
    if (!targets.length || !trigger) return;

    gsap.set(targets, { yPercent: 100 });
    let revealTrigger;
    const playOnce = () => {
      revealTrigger && revealTrigger.kill();
      gsap.killTweensOf(targets);
      gsap.to(targets, {
        yPercent: 0,
        duration: REVEAL.duration,
        stagger: REVEAL.stagger,
        ease: REVEAL.ease,
        overwrite: true
      });
    };
    revealTrigger = ScrollTrigger.create({
      trigger,
      start,
      onEnter: playOnce,
      onEnterBack: playOnce
    });
  }

  /* 2026-09-16：footer 大 slogan 复刻 BREAK 开篇那句（.break-lead）的遮罩推入效果，
     同一套 wrapLines + setupOnceLineReveal，只是换了 trigger（.home-footer）。 */
  function setupFooterLead() {
    const footer = root.querySelector('.home-footer');
    if (!footer) return;
    const lines = wrapLines(footer.querySelector('.footer-cta h2'));
    if (reduceMotion.matches) {
      gsap.set(lines, { yPercent: 0 });
      return;
    }
    /* ABOUT 的长距离定位可能一步跨过 ScrollTrigger 的进入点。
       留一个只重播这句的入口，让导航抵达 slogan 后仍能看到完整推入。 */
    window.__homeFooterLead = {
      reveal() {
        gsap.killTweensOf(lines);
        gsap.set(lines, { yPercent: 100 });
        gsap.to(lines, {
          yPercent: 0,
          duration: REVEAL.duration,
          stagger: REVEAL.stagger,
          ease: REVEAL.ease,
          overwrite: true
        });
      }
    };
    setupOnceLineReveal(lines, footer);
  }

  /* ⚠ 2026-09-07：BREAK 被拆成两段，中间隔着整个电影院段——
     开篇（标签 + 两行字）排在电影院之前，两张图排在电影院之后。
     **两段都套着 .break-intro 这个网格**，所以这里不能再用
     `root.querySelector('.break-intro')` 去拿"那一个"容器：那样只会拿到开篇，
     两张图的推入和视差会整个丢掉。改成按各自的 section 取。 */
  function setupBreakIntro() {
    const opener = root.querySelector('.home-break-open');
    const gallery = root.querySelector('.home-break-gallery');
    if (!opener && !gallery) return;

    const shot = gallery && gallery.querySelector('.break-shot');
    const robotStage = gallery && gallery.querySelector('.break-robot-stage');
    /* 分成两组，各自等自己那一块进视口。拆开之后更加必须分开触发：
       两张图在电影院下面很远，跟着开篇一起播会在没人看的时候就演完。 */
    const breakLabelLines = wrapLines(opener && opener.querySelector('.break-label'));
    const breakLeadLines = wrapLines(opener && opener.querySelector('.break-lead'));
    const head = breakLabelLines.concat(breakLeadLines);
    /* 画廊那段也有自己的标题 + 介绍（项目介绍，排在两张图上面）。
       它和开篇是两段完全不同的内容，必须各自触发。 */
    const galleryHead = wrapLines(gallery && gallery.querySelector('.break-label'))
      .concat(wrapLines(gallery && gallery.querySelector('.break-lead')));
    const tail = [];

    if (reduceMotion.matches) {
      gsap.set([...head, ...galleryHead, ...tail], { yPercent: 0 });
      return;
    }

    /* BREAK 的主叙述句与 Works slogan 一样，只播放第一次入场；
       label 仍沿用原来的重复入场逻辑。 */
    setupRepeatingLineReveal(breakLabelLines, opener);
    setupOnceLineReveal(breakLeadLines, opener);
    setupRepeatingLineReveal(galleryHead, gallery);
    setupRepeatingLineReveal(tail, shot);

    /* 这四条是从 noth.in 的 Studio 区公开参数逐项重建的：
       左/右框分别上移 100/60px；框内图分别 -8% / +10%。
       每一层的 scrub 也保留原值，图框 1 / 2，图内均为 3。
       这两个框故意不带 .parallax-frame，否则会和 setupStudioParallax() 抢同一个 img。 */
    if (window.innerWidth < 992) return;

    const drift = (target, from, to, trigger, scrub) => {
      if (!target || !trigger) return;
      gsap.fromTo(target, from, {
        ...to,
        ease: 'none',
        scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub }
      });
    };

    if (!gallery) return;
    const wide = gallery.querySelector('.break-wide');
    drift(shot, { y: 0 }, { y: -100 }, shot, 1);
    drift(wide, { y: 0 }, { y: -60 }, wide, 2);
    /* 三张透明图（机器人 + 两段对白）必须作为同一个内层移动，
       才是原卡片的图内视差套在"整体"上，而不是各自漂浮。 */
    drift(robotStage, { yPercent: 0 }, { yPercent: -8 }, shot, 3);
    drift(wide && wide.querySelector('img'), { yPercent: 0 }, { yPercent: 10 }, wide, 3);
  }

  /* VR 项目首屏（2026-09-07）。参考 distil.im 的项目详情页首屏。

     三件事：底图视差、那条线随标题量宽、整组文字逐行推入。
     推入沿用 BREAK 开篇那套遮罩机制（REVEAL 常量共用），不是另起一套语言。 */
  function setupVrHero() {
    const section = root.querySelector('.home-vr');
    const content = section && section.querySelector('.vr-content');
    if (!section || !content) return;

    const title = content.querySelector('.vr-title');
    const rule = content.querySelector('.vr-rule');
    const image = section.querySelector('.vr-bg img');
    const cta = content.querySelector('.vr-cta');

    /* 那条线要停在标题右端。Bebas 的字宽随字号变，写死百分比换个视口就对不齐了，
       所以每次 refresh 都拿标题实际渲染出来的宽度重量一遍。

       ⚠ 必须用 Range 量**文字本身**的范围，不能量 .line-inner 的盒子——
       那一层是 display:block（遮罩需要），盒子永远是满宽的。
       第一版就是量的盒子，线拉满了整个内容宽，和参考图里"线停在标题右端"对不上。 */
    const measureRule = () => {
      if (!title || !rule) return;
      const inner = title.querySelector('.line-inner') || title.querySelector('.line') || title;
      const range = document.createRange();
      range.selectNodeContents(inner);
      const w = range.getBoundingClientRect().width;
      range.detach && range.detach();
      if (w > 0) content.style.setProperty('--vr-rule-w', Math.round(w) + 'px');
    };

    const heads = wrapLines(content);
    measureRule();
    ScrollTrigger.addEventListener('refreshInit', measureRule);
    cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', measureRule));

    if (reduceMotion.matches) {
      gsap.set(heads, { yPercent: 0 });
      return;
    }

    /* GAME DEMOS 的标签和文字是同一个信息组，取消逐行等待。
       统一从遮罩内平滑推入，分隔线与文字同步出现，避免读起来像分段加载。 */
    const VR_REVEAL = { duration: 2, ease: 'expo.out' };
    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 68%', once: true }
    });

    tl.fromTo(heads, { yPercent: 72 }, {
      yPercent: 0,
      duration: VR_REVEAL.duration,
      stagger: 0,
      ease: VR_REVEAL.ease
    });

    if (rule) {
      tl.fromTo(rule, { scaleX: 0 }, {
        scaleX: 1,
        duration: VR_REVEAL.duration,
        ease: VR_REVEAL.ease
      }, 0);
    }

    if (cta) {
      tl.fromTo(cta, { autoAlpha: 0, y: 18 }, {
        autoAlpha: 1,
        y: 0,
        duration: .6,
        ease: 'power2.out'
      }, '-=0.35');
    }

    /* 2026-09-15：底图改成 contain 后，靠 CSS 把图放大到 125%（实测最少
       123.85% 才够，这里留了安全余量）重新换出这段视差需要的余量，
       不再依赖原来 116% 高度那套机制。 */
    if (image && window.innerWidth >= 992) {
      gsap.fromTo(image, { yPercent: -12 }, {
        yPercent: -2,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 2.5
        }
      });
    }
  }

  function setupGlitch() {
    const section = root.querySelector('.home-glitch');
    const finalText = root.querySelector('[data-reveal-text]');
    if (!section || !finalText) return;

    const characters = splitRevealText(finalText);
    if (reduceMotion.matches) {
      gsap.set(characters, { opacity: 1 });
      return;
    }

    gsap.fromTo(characters, { opacity: .08 }, {
      opacity: 1,
      stagger: .012,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom 45%',
        scrub: 1.4
      }
    });
  }

  /* 空间装置那一段 —— 2026-09-08 按 noth.in `section.glitch` 实测重写。

     ⚠ 这次的参数不是"看着像"调出来的，是把参考站的 GSAP 配置直接读出来的
     （它没有 canvas，全是 DOM 补间，ScrollTrigger.getAll() 能拿到 vars）。
     实测环境 1150×687，段落高 1150px = 1.674 屏。原始记录见 HANDOFF。

     ★ 核心机制：**五条 ScrollTrigger 共用同一个起点（`top top`），但各自在不同的
       地方结束、各自有不同的 scrub。** 这就是"连续推进"的来源——不是一个接一个的
       分镜，是好几层被同一根滚动条拖着，只是快慢不同。

       层            结束点            scrub   动作
       ─────────────────────────────────────────────────────────
       小字碎裂      center 30%        2       逐字下坠 + 淡出
       底图变暗      center center     2       opacity 1 → .3
       图1 外框      bottom top        1.5     y +14.6svh → -43.7svh
       图2 外框      bottom top        3       y +14.6svh → -116.4svh
       两张图内层    bottom top        3       yPercent -8 / +10（起点 20% top）

     ⚠ 为什么这次不合成一条时间轴（推翻上一版的注释）：每层的 scrub 不同，
       而 scrub 是 ScrollTrigger 的属性、不是补间的属性——想要不同的拖滞就
       必须分开挂。这是"照搬"的必然代价，不是没想清楚。
       省下来的部分：底图和图片各自只有 1 条补间，真正贵的只有碎裂那 400 多条。

     ⚠ 碎裂的随机量用 `seeded()` 按字符序号算，不用 Math.random()：
       ScrollTrigger 在 refresh（改窗口尺寸）时会重算，随机数每次不同，字会跳位。
       参考站是构建时把随机值烘死的，效果等价。

     ⚠ 只动 transform 和 opacity，不碰 filter / text-shadow / 混合模式——
       那几样会让整块文字每帧重新栅格化，PITFALLS 里大标题那次就是栽在这上面。 */
  /* 用序号当种子的伪随机，同一个 index 永远得到同一个值。 */
  function seeded(index, salt) {
    const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* 把一个元素的文字拆成逐字 span（用于中间那句话的逐字点亮）。

     ⚠ 必须**先按词分组、词内再拆字**。逐字 span 是 inline-block，
       浏览器可以在任意两个 inline-block 之间断行——直接拆字会在单词中间断开
       （实测断成 "EVERY DOCU / MENT IS A DECISIO / N ABOUT"）。
       外面套一层 .install-word（也是 inline-block）就把断点限制回词与词之间。
     ⚠ 词之间放真正的空格文本节点，不放进 span：那才是可断行的位置。 */
  function splitStatementChars(element) {
    const source = element.textContent.trim().replace(/\s+/g, ' ');
    element.textContent = '';
    const characters = [];
    source.split(' ').forEach((word, index, words) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'install-word';
      [...word].forEach(character => {
        const span = document.createElement('span');
        span.className = 'install-char';
        span.textContent = character;
        wordSpan.appendChild(span);
        characters.push(span);
      });
      element.appendChild(wordSpan);
      if (index < words.length - 1) element.appendChild(document.createTextNode(' '));
    });
    return characters;
  }


  /* ---------- slogan 之前那一坨碎裂小字（2026-09-09 用户指定）----------

     节奏：进场淡入 → 滚一段距离 → 逐字碎掉 → 之后才轮到 slogan + 视频。

     碎裂的参数**和底部空间装置那段（setupInstall 的①）逐个对齐**，
     用户要求"和底部的那种做法对齐"：
       y random(40,160) / x random(-10,10) / rotation random(-20,20) / opacity 0
       duration random(.25,.7) / 起始位置 random(0,.6) / ease power2.in
     ⚠ ease 必须写在每条补间上。timeline 的 defaults 设成 'none' 会变成匀速下坠，
       读起来是"整行被推下去"而不是"碎了往下掉"——手感差别最大的一处。
     ⚠ 随机量用 seeded(index) 而不是 gsap.utils.random：ScrollTrigger refresh 时
       真随机数会重取、字会跳位。底部那段也是这么处理的。

     ⚠ 淡入和碎裂都做成**跟随滚动的 scrub**，不用 `once` + 回调。
       PITFALLS [2026-09-09] 记着：Works 那次用 `once` 触发时有一格
       死活不执行、根因至今没找到。scrub 每帧按滚动位置直接求值，没有那个失败模式。
     ⚠ 淡入作用在 `<p>` 上、碎裂作用在每个字符上，两者互不覆盖。 */
  function setupShowreelShards() {
    /* ⚠ 用 `document` 不用 `root`：`root` 是 `.inner-world`，
       而 `.home-showreel` **在它外面**（CSS 里那条注释写着这件事）。
       写成 `root.querySelector` 会静默取到 null、整个函数直接 return，
       页面不报错、字也不拆——实测踩过。`setupShowreelVideo()` 同理用的 document。 */
    /* 2026-09-09 用户改成两坨。下面一律按数组处理——以后加第三坨只改 HTML，
       这里一行都不用动。 */
    const shards = [...document.querySelectorAll('.showreel-shard')];
    if (!shards.length) return;

    const characters = [];
    const lines = shards.flatMap(shard => [...shard.querySelectorAll('.showreel-shard-line')]);
    lines.forEach(line => {
      const source = line.textContent;
      line.textContent = '';
      [...source].forEach(character => {
        const span = document.createElement('span');
        span.className = 'showreel-shard-char';
        /* ⚠ 空格必须用不换行空格 ` `，不能用普通空格。
           每个字符是一个 `inline-block`，普通空格落在 span 的首尾会被折叠成零宽，
           实测渲染出来是 `WHATDOIDO` —— 词全粘在一起。 */
        span.textContent = character === ' ' ? ' ' : character;
        line.appendChild(span);
        characters.push(span);
      });
    });

    /* 关了动画就直接给终态：字在原位、完全可见，不碎。 */
    if (reduceMotion.matches || !characters.length) {
      gsap.set(shards, { opacity: 1 });
      return;
    }

    /* ⚠ **触发点不能挂在这坨字自己身上。** 它是 `position: fixed`、
       在屏幕上永远不动，自己的位置提供不了任何进度信息。
       改成挂在 `.home-showreel` 上——那一段是随页面滚的，用它当尺子。

       ⚠ 起点是**实测**出来的，不是拍的：镜头推进到底（`--cam-depth` 收到 900px，
       即 camera z = 1）发生在滚动 1500 处；`.home-showreel` 文档顶在 1668、
       视口高 695，换算成"它的顶边落在视口 24% 处"。
       写成百分比而不是写死 1500，是为了换窗口高度时自己跟着走。
       量法：滚轮滚动 + 读 `.hero` 上的 `--cam-depth`（这个变量写在 .hero 上，
       不在 documentElement 上）。

       ⚠ **量这个站必须用真实滚轮事件。** 页面被 Lenis 接管，
       `window.scrollTo` 只动原生滚动条，Lenis 和 ScrollTrigger 完全不知道，
       量出来整站的动画都停在 0——这个坑今天吃了一整轮。 */
    const ruler = document.querySelector('.home-showreel');

    /* ① 进场 —— 从下方一点点滑上来 + 同时渐显，滑到位就**停在那儿不动了**。

       ⚠ **这一段是时间驱动，故意不跟滚动挂钩**（用户 2026-09-09 明确要求）。
       到了触发点就按自己的节奏播完，**滚轮滚多快都一样慢慢进来**，
       靠的是补间自己的 duration + ease，不是滚动位置。
       原来是 `scrub`（进度 = 滚动位置），滚得快时整段会被一口气拉完、
       等于没有进场动画——这正是要避开的。

       ⚠ 所以这里用 `ScrollTrigger.create` + `onEnter` 建补间，
       **不要**改回在 `gsap.fromTo` 的 vars 里塞 `scrollTrigger`，
       那样又会变成跟随滚动。`once: true`：只播一次，来回滚不重播。

       三个数是配套的，改一个要想另外两个：
       · `y: 28` —— 上滑的量。约等于这坨字四行总高 69px 的四成，
         够读出"滑上来"又不会变成"从屏幕外飞进来"。
       · `duration: 1.2` —— 整段的实际时长，和滚动速度无关。
       · `power3.out` —— 起步快、尾巴长，读起来是"带着惯性滑到位、慢慢停住"。
         用 `none` 会匀速然后硬生生截断，就是用户说的"生硬"。

       ⚠ 上滑用 `y` 作用在 `<p>` 上；碎裂的 `y` 作用在每个字符上，两者不同元素，
       不会互相覆盖。
       ⚠ 已知边界：碎裂仍是跟随滚动的，触发点比这里晚约 310px。
         如果有人以极快的速度一口气滚过这 310px（不到 1.2 秒），
         进场还没播完碎裂就开始了。正常滚动碰不到，先不为它加锁。 */
    /* ⚠ **起始态必须在这里显式设一次。**
       改成时间驱动之后，那句 `fromTo` 只在 `onEnter` 里才执行；
       在它执行之前没有任何人把这坨字设成透明，于是**页面一加载它就完整地挂在那儿**
       ——实测滚动 1000（触发点是 1459）时透明度已经是 1.00。踩过一次。

       ⚠ 代价是失败模式变了（对应 PITFALLS [2026-09-07]）：万一 `onEnter` 没跑，
       这坨字就一直不出现。可以接受——它是气氛文字，不出现只是少个效果；
       反过来"没滚到就先亮着"会直接破坏首屏，那个更糟。
       真正的内容（slogan / 导航 / 门洞）都不依赖这段。 */
    gsap.set(shards, { opacity: 0, y: 28 });

    /* ⚠ **不能用 `once: true`。** 那样进场只播一次、且永不反向：
       往回滚时碎裂（scrub）会被倒放、字符恢复可见，而整坨字的透明度还停在 1，
       于是它一路跟到首页顶上还挂着——它又是 `fixed` 钉在屏幕上的，格外显眼。
       实测就是这个现象，用户报为"往上滚这个字不消失，会出现在主页"。

       改成一进一出各管一边：`onEnter` 播进场，`onLeaveBack` 收回起始态。
       往回滚它就退场，再往下滚会重新进场一次——这也更自然。

       ⚠ 两条补间都要 `overwrite: true`：来回快速滚时，
       新的那条必须掐掉还没播完的旧的，否则两条同时改 opacity 会打架。
       ⚠ 退场比进场快（.4s vs 1.2s）：进场要"慢慢来"是效果，
       退场拖那么久会让人觉得它赖着不走。 */
    ScrollTrigger.create({
      trigger: ruler,
      start: 'top 30%',
      onEnter: () => {
        gsap.to(shards, {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: 'power3.out',
          overwrite: true
        });
      },
      onLeaveBack: () => {
        gsap.to(shards, {
          opacity: 0,
          y: 28,
          duration: .4,
          ease: 'power2.in',
          overwrite: true
        });
      }
    });

    /* ② 碎裂 —— 进场结束（5%）到开始碎（-15%）之间留一段**完全静止**的距离，
       约 140px 滚程。这段"停住不动"是必须留的：进场刚滑到位就接着碎，
       会读成一个连续动作，"钉住"那一下就没有了。

       ⚠ **终点必须赶在 slogan 升上来之前。** 这坨字是 fixed、钉在屏幕 43% 高度，
       而 slogan 会滚到同一条高度线上：`.showreel-copy` 文档顶 ≈ 2363，
       升到 43% 高度时滚动约 2088。原来终点写 -90%（≈2294）就晚了，
       实测碎片直接掉在 slogan 的字上、两行叠在一起。
       现在收在 -55%（≈2050），碎完 slogan 才进来，顺序才是用户要的。
       ⚠ 改这坨字的 `top`、或改 `.home-showreel` 的 `padding-top`，这个终点要重算。 */
    const shatter = gsap.timeline({
      scrollTrigger: {
        trigger: ruler,
        start: 'top -15%',
        end: 'top -55%',
        scrub: 2,
        invalidateOnRefresh: true
      }
    });

    characters.forEach((char, i) => {
      shatter.to(char, {
        y: 40 + seeded(i, 1) * 120,
        x: -10 + seeded(i, 2) * 20,
        rotation: -20 + seeded(i, 3) * 40,
        opacity: 0,
        duration: .25 + seeded(i, 4) * .45,
        ease: 'power2.in'
      }, seeded(i, 5) * .6);
    });
  }

  function setupInstall() {
    const section = root.querySelector('.home-install');
    if (!section) return;

    const characters = [];
    section.querySelectorAll('.shard-line').forEach(line => {
      const source = line.textContent;
      line.textContent = '';
      [...source].forEach(character => {
        const span = document.createElement('span');
        span.className = 'install-char';
        span.textContent = character === ' ' ? ' ' : character;
        line.appendChild(span);
        characters.push(span);
      });
    });

    const bg = section.querySelector('.install-bg');
    const statement = section.querySelector('.install-statement');
    const statementChars = statement ? splitStatementChars(statement) : [];
    const boxA = section.querySelector('.install-drift-1');
    const boxB = section.querySelector('.install-drift-2');

    if (reduceMotion.matches || !characters.length) {
      /* 关了动画就直接给终态：底图已暗、字留在原位、句子全亮、两张图停在静止位。 */
      gsap.set(bg, { opacity: .3 });
      gsap.set(statementChars, { opacity: 1 });
      gsap.set([boxA, boxB].filter(Boolean), { y: 0 });
      return;
    }

    /* ★ 下面①～④的每一个数字都是从参考站的脚本里读出来的原值，不是估的、也不是换算的。
       参考站用的是绝对像素，这里照搬绝对像素（不再按视口高缩放）——
       它的行程本来就和窗口高度无关。 */

    /* ① 小字碎裂 —— `top top` → `center 30%`，scrub 2。
       每个字符**一条独立补间**（不是 stagger）：
         y        random(40, 160)
         x        random(-10, 10)
         rotation random(-20, 20)
         opacity  0
         duration random(.25, .7)
         起始位置 random(0, .6)
         ease     power2.in
       ⚠ ease 必须写在每条补间上。把 timeline 的 defaults 设成 'none' 会变成匀速下坠，
         读起来是"整行被推下去"而不是"碎了往下掉"——手感差别最大的一处。
       ⚠ 随机量用 seeded(index) 代替 utils.random：ScrollTrigger refresh 时
         真随机数会重取、字会跳位。这是本站相对参考站唯一的改动，是必需的。 */
    const shatter = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'center 30%',
        scrub: 2,
        invalidateOnRefresh: true
      }
    });

    characters.forEach((char, i) => {
      shatter.to(char, {
        y: 40 + seeded(i, 1) * 120,
        x: -10 + seeded(i, 2) * 20,
        rotation: -20 + seeded(i, 3) * 40,
        opacity: 0,
        duration: .25 + seeded(i, 4) * .45,
        ease: 'power2.in'
      }, seeded(i, 5) * .6);
    });

    /* ② 底图变暗 —— `top top` → `center center`，scrub 2，`opacity: .3`，ease none。
       ⚠ 参考站**没有黑幕**，是底图自己变暗。起点不是 1 是 **.8**——
         那张图在 CSS 里常驻 opacity .8（本站同样写在 .install-bg 上），
         所以这条是 .8 → .3，GSAP 从当前值起算，这里不用写 from。
         盖一层黑布也能压暗，但那层黑迟早会和背景对不上、露出边；
         让图自己变暗，背后是什么颜色都对得上。
       ⚠ 结束点是段落中心过屏幕中心 —— 也就是**整段走到一半就已经全暗了**，
         后半段是留给两张图上浮的。 */
    gsap.to(bg, {
      opacity: .3,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'center center',
        scrub: 2
      }
    });

    /* ③ 中间那句话逐字点亮。
       ⚠ 这一条**不是量出来的**：参考站那句话没有挂 GSAP 补间，
         是它自己的脚本直接改每个字的 opacity，读不到参数。
         所以起止和节奏是我选的，觉得快了慢了直接改这里的 stagger 和 end。
       文案沿用本站自己的措辞，只借逐字点亮这个机制。 */
    if (statementChars.length) {
      gsap.fromTo(statementChars, { opacity: 0 }, {
        opacity: 1,
        ease: 'none',
        duration: .25,
        stagger: .6 / statementChars.length,
        scrollTrigger: {
          trigger: section,
          // 2026-09-16：用户要求这句话出现得更早——原来 'top top' 要等这一段
          // 完全顶到视口顶部才开始点亮，改成还没顶到顶（视口 65% 高度处）就先亮起来。
          // 2026-09-16：用户要求出现得再晚一点点，65% → 58%，这次再晚一些，58% → 45%。
          start: 'top 45%',
          // 原来 end: 'bottom top' 对应这一整段（图片撑起的高度，很长）才彻底点完，
          // 用户反馈"画面看着都已经收尾了，字还没读完"——提前到这段刚过一半就点完。
          // 2026-09-16：用户要求触发范围调到约 1600px。start 定在 scrollY≈9839，
          // 'bottom 86%' 对应 end≈11442，range≈1603px，接近目标值。
          end: 'bottom 86%',
          scrub: 2
        }
      });
    }

    /* ④ 两张图上浮 —— 这是整段最容易做错的一处。
       ⚠ 参考站的图**不是弹出来的，也不缩放**。它们一直都在，位置贴着段落底边，
         起点各自往下推 100px 藏在段外（段落 overflow:clip 会裁掉），靠往上飘进入画面。
       实测原值（绝对像素，和窗口高度无关）：
         图1  y 100 → -300   scrub 1.5
         图2  y 100 → -800   scrub 3
         两张都是 `top top` → `bottom top`、ease none。
       ⚠ 两张的行程差了 2.7 倍，所以读起来是"一近一远两个东西各自飘过"，
         而不是"一组图一起出现"。这个速度差是效果的全部，别把它们调成一样。
       ⚠ 外框动位移、图片在框内再各自反向错动一点（-8% / +10%，scrub 3，
         从 `20% top` 才开始），这一层才是"图片有厚度"的来源；只动外框会像两张贴纸。 */
    const drift = (box, boxEnd, boxScrub, innerPercent) => {
      if (!box) return;
      const inner = box.querySelector('img');
      gsap.fromTo(box,
        { y: 100 },
        {
          y: boxEnd,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom top',
            scrub: boxScrub,
            invalidateOnRefresh: true
          }
        });
      if (!inner) return;
      gsap.to(inner, {
        yPercent: innerPercent,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: '20% top',
          end: 'bottom top',
          scrub: 3
        }
      });
    };

    drift(boxA, -300, 1.5, -8);
    drift(boxB, -800, 3, 10);
  }

  function setupSoundToggle() {
    const button = root.querySelector('.sound-toggle');
    if (!button) return;
    const toggle = () => {
      const active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? 'SOUND ON' : 'SOUND';
    };
    button.addEventListener('click', toggle);
    cleanups.push(() => button.removeEventListener('click', toggle));
  }

  setupLenis();
  syncShowreelExitGap();
  ScrollTrigger.addEventListener('refreshInit', syncShowreelExitGap);
  cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', syncShowreelExitGap));
  const context = gsap.context(() => {
    setupShowreelVideo();
    setupWorksBackdrop();
    setupWorks();
    setupStudioVideo();
    setupStudioParallax();
    setupCinema();
    setupBreakIntro();
    setupBreakWord();
    setupVrHero();
    setupInstall();
    setupFooterLead();
    setupGlitch();
  }, root);
  /* ⚠ 这一条**故意放在 gsap.context 外面**。
     context 的作用域是 `root`（= `.inner-world`），而 `.home-showreel` 在它外面。
     放进去时实测：两条 ScrollTrigger 的 start/end 算得都对（1272→1537 / 1759→2245），
     但**不跟随滚动**——`progress` 卡死不动，只有手动 `ScrollTrigger.refresh()` 时
     才更新一次，于是整坨字要么一直不显、要么一直是终态。
     `setupSoundToggle()` / `warmScrollingImages()` 同样在 context 外面。 */
  setupShowreelShards();
  warmScrollingImages();
  setupSoundToggle();
  ScrollTrigger.refresh();
  cleanups.push(() => context.revert());

  window.addEventListener('pagehide', () => {
    cleanups.reverse().forEach(cleanup => cleanup());
  }, { once: true });
})();
