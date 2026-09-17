// Works 卡片交互。后续只需要在下方填写每个项目的视频地址与详情页地址。
(function () {
  const section = document.querySelector('.home-works');
  if (!section) return;

  /* 键必须和 HTML 里的 data-work-id 一一对应，改一边就要改另一边。
     2026-09-08 随文案更新，把四个和项目对不上的早期占位 id 全部改成真名：
       open-field   → youdao-dictionary
       fold-memory  → fantasy-westward-journey
       soft-signal  → bubble-delivery
       inner-orbit  → nba2k-online
     现在五个键和页面上的五个项目一一对应。 */
  const previewSources = Object.freeze({
    'paradox-heaven': '',
    'bubble-delivery': '',
    'nba2k-online': '',
    'youdao-dictionary': '',
    'fantasy-westward-journey': '',
    'trace': ''
  });
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function navigateToDetail(card) {
    const destination = card.dataset.detailUrl;
    if (destination) window.location.assign(destination);
  }

  section.querySelectorAll('.work-item').forEach(card => {
    const workId = card.dataset.workId;
    const frame = card.querySelector('.work-image-wrap');
    const strip = card.querySelector('.work-strip');
    const video = card.querySelector('.work-preview-video');
    const previewSource = previewSources[workId];

    if (canHover && frame && video && previewSource) {
      video.src = previewSource;

      frame.addEventListener('pointerenter', () => {
        video.play()
          .then(() => card.classList.add('is-previewing'))
          .catch(error => console.warn(`Preview video could not play for ${workId}.`, error));
      });

      frame.addEventListener('pointerleave', () => {
        card.classList.remove('is-previewing');
        video.pause();
        video.currentTime = 0;
      });
    }

    // 项目图片／图带是卡片级入口；标题保留 HTML 原生链接。
    if (strip) {
      strip.setAttribute('role', 'link');
      strip.setAttribute('tabindex', '0');
      strip.setAttribute('aria-label', card.getAttribute('aria-label') || '查看项目详情');

      strip.addEventListener('click', () => navigateToDetail(card));
      strip.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        navigateToDetail(card);
      });
    }
  });
})();
