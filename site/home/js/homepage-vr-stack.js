// ===== GAME DEMOS 卡片堆叠：复刻 ayushmxxn/serenity-ui 的 SwipeCards 组件 =====
// 源码地址（2026-09-16 拉取核对过）：
// https://github.com/ayushmxxn/serenity-ui/blob/main/app/components/serenity/swipe-card.tsx
// 那边是 React + framer-motion，这里用纯 Pointer Events + inline transform 照参数复刻：
// 只是"弹簧物理"用 CSS transition 近似，不是逐帧对照。
(function () {
  var root = document.querySelector('.vr-game-stack');
  if (!root) return;

  // 数值对应原组件的 defaultSettings，没有改动。
  var STACK_ROTATION = 5;      // 每往后一层多转的角度
  var STACK_SCALE = 0.035;     // 每往后一层缩小的比例
  var SWIPE_THRESHOLD = 120;   // 拖拽距离超过它才真正切到最底层
  var DRAG_ELASTIC = 0.5;      // 拖拽阻尼：手指移动多远，卡片只跟着走这个比例（橡皮筋感）
  var TILT_STRENGTH = 25;      // 拖拽时的 3D 倾斜角度上限
  var TILT_RANGE = 200;        // 拖拽多少像素时倾斜到满

  var order = Array.from(root.querySelectorAll('img'));
  var infoTags = document.querySelector('.vr-stack-info .work-tags');
  var infoTitle = document.querySelector('.vr-stack-info .vr-stack-title');
  var infoCredit = document.querySelector('.vr-stack-info .vr-stack-credit');
  var dragging = false;
  var hovering = false;
  var startX = 0;
  var startY = 0;
  var dx = 0; // 阻尼后的可视位移
  var dy = 0;
  var rawDX = 0; // 手指的真实位移，用来判定是否超过切换阈值
  var rawDY = 0;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function render() {
    order.forEach(function (img, i) {
      img.style.zIndex = order.length - i;
      var rot = i * STACK_ROTATION;
      var scale = 1 - i * STACK_SCALE;
      var tx = 0, ty = 0, tiltX = 0, tiltY = 0;
      if (i === 0) {
        tx = dx;
        ty = dy;
        tiltX = clamp(-TILT_STRENGTH * (dy / TILT_RANGE), -TILT_STRENGTH, TILT_STRENGTH);
        tiltY = clamp(TILT_STRENGTH * (dx / TILT_RANGE), -TILT_STRENGTH, TILT_STRENGTH);
        if (hovering && !dragging) scale *= 1.03;
      }
      img.style.transform =
        'translate(' + tx + 'px, ' + ty + 'px) ' +
        'rotateX(' + tiltX + 'deg) rotateY(' + tiltY + 'deg) ' +
        'rotateZ(' + rot + 'deg) scale(' + scale + ')';
    });
  }

  function updateInfo() {
    if (!infoTags || !infoTitle || !infoCredit) return;
    var front = order[0];
    var tags = (front.dataset.tags || '').split(',').filter(Boolean);
    infoTags.innerHTML = tags.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var titleInner = infoTitle.querySelector('.break-title-inner');
    if (titleInner) titleInner.textContent = front.dataset.title || '';
    else infoTitle.textContent = front.dataset.title || '';
    infoTitle.dataset.projectSlug = front.dataset.slug || '';
    infoTitle.setAttribute('aria-label', '查看 ' + (front.dataset.title || '游戏 Demo') + ' 项目详情');
    var credit = front.dataset.credit || '';
    // 和 Break 总览页同一条规则（break.js 的 highlightCompany）：赛事名单独标白，
    // 只在 data-highlight="true" 的项目（Global Game Jam 那两条）生效。
    if (front.dataset.highlight === 'true' && credit.indexOf(' · ') !== -1) {
      var parts = credit.split(' · ');
      infoCredit.innerHTML = '<span class="credit-company">' + parts[0] + '</span> · ' + parts[1];
    } else {
      infoCredit.textContent = credit;
    }
  }

  function bindFrontHover() {
    order.forEach(function (img) {
      img.onmouseenter = null;
      img.onmouseleave = null;
    });
    var front = order[0];
    front.onmouseenter = function () { hovering = true; render(); };
    front.onmouseleave = function () { hovering = false; render(); };
  }

  function advance() {
    order.push(order.shift());
    dx = 0; dy = 0;
    bindFrontHover();
    updateInfo();
    render();
  }

  render();
  bindFrontHover();
  updateInfo();

  root.addEventListener('pointerdown', function (e) {
    var img = e.target.closest('img');
    if (!img || img !== order[0]) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    img.setPointerCapture(e.pointerId);
    img.classList.add('is-dragging');
  });

  root.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    rawDX = e.clientX - startX;
    rawDY = e.clientY - startY;
    dx = rawDX * DRAG_ELASTIC;
    dy = rawDY * DRAG_ELASTIC;
    render();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    order[0].classList.remove('is-dragging');
    var dist = Math.hypot(rawDX, rawDY);
    // 拖够距离＝原组件的判定；几乎没动（<4px）当成一次点击，同样触发切换，
    // 方便鼠标用户不用真的拖一段。两者共用同一个 endDrag，不会重复触发。
    var shouldAdvance = Math.abs(rawDX) > SWIPE_THRESHOLD || Math.abs(rawDY) > SWIPE_THRESHOLD || dist < 4;
    rawDX = 0; rawDY = 0;
    if (shouldAdvance) {
      advance();
    } else {
      dx = 0; dy = 0; // 没拖够距离，弹簧一样弹回中心
      render();
    }
  }

  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // 键盘可达：聚焦这组卡片后按回车/空格也能切换。
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
  });
})();
