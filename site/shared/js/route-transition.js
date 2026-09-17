/* 通用"离场遮幕"跳转转场：Home / Break 等页面共用。
   点击本页面里指向某个目的地的入口（可以是导航栏链接，也可以是页面内的
   "View all"）时，播放一层覆盖全屏的遮幕再真正跳转；目的地页面自己消费
   sessionStorage 里的一次性标记接力揭示（各自页面的入场逻辑不归这份文件管）。
   不改链接的 href；只在普通左键/键盘激活时接管，保留新标签、修饰键与
   减少动态效果偏好的浏览器原生行为。

   用法：各页面自己一个小配置文件，调用
     window.MZRouteTransition.init([
       { selector, arrival, scale, origin, duration, ease, prefetch? },
       ...
     ]);
   selector 可以匹配同一个目的地下的多个入口（写成逗号分隔的选择器）。 */
window.MZRouteTransition = (function () {
  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isPlainNavigation(event) {
    return event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey
      && !event.defaultPrevented;
  }

  // 借用遮幕盖满这段时间，让浏览器提前把目标页的文档/脚本/样式请求出去，
  // 真正跳转时它们大概率已经在缓存里，省掉一段"白屏等加载"。
  function prefetchDestination(hrefs) {
    if (!hrefs) return;
    hrefs.forEach((href) => {
      if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
      const hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.href = href;
      document.head.appendChild(hint);
    });
  }

  function init(destinations) {
    if (!gsap || reduceMotion) return;
    let isLeaving = false;

    destinations.forEach(({ selector, arrival, scale, origin, duration, ease, prefetch }) => {
      document.querySelectorAll(selector).forEach((link) => {
        link.addEventListener('click', (event) => {
          if (isLeaving || !isPlainNavigation(event)) return;
          event.preventDefault();
          isLeaving = true;

          try {
            sessionStorage.setItem('mz-route-arrival', arrival);
          } catch (_) {
            // 存储受限时仍照常跳页，只缺少目标页的衔接标记。
          }

          prefetchDestination(prefetch);

          const veil = document.createElement('div');
          veil.setAttribute('aria-hidden', 'true');
          veil.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:1000',
            'pointer-events:auto',
            'background:#050606',
            `transform:${scale}(0)`,
            `transform-origin:${origin}`,
            'will-change:transform',
          ].join(';');
          document.body.appendChild(veil);

          gsap.to(veil, {
            [scale]: 1,
            duration,
            ease,
            overwrite: 'auto',
            onComplete: () => window.location.assign(link.href),
          });
        });
      });
    });
  }

  return { init };
})();
