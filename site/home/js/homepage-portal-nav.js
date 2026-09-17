/* 顶部导航：触屏上的「点一下展开」。
   ------------------------------------------------------------------
   鼠标设备完全不走这里——菜单是靠 CSS 的 :hover 开的，这段脚本一行都不掺和。
   只有**没有悬停能力**的设备（手机／平板）才把 .is-open 挂上去。

   为什么要判设备：触屏浏览器会在点击时"假装"有一次 hover，
   如果不判，第一次点会同时触发假 hover 和这里的 toggle，
   两个开关互相抵消，菜单看上去点不开。 */
(function () {
  const menu = document.querySelector('.nav-menu');
  if (!menu) return;

  const toggle = menu.querySelector('.nav-current');
  if (!toggle) return;
  const aboutLink = menu.querySelector('a[href="#contact"]');

  const noHover = window.matchMedia('(hover: none)');

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  toggle.addEventListener('click', function (e) {
    if (!noHover.matches) return;   // 鼠标设备上这个按钮不做事
    e.preventDefault();
    setOpen(!menu.classList.contains('is-open'));
  });

  // 点菜单外面就收起来。
  document.addEventListener('click', function (e) {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(e.target)) return;
    setOpen(false);
  });

  /* 从触屏切到鼠标（接了外接鼠标、或者窗口拖到另一块屏）时把手动展开的状态清掉。
     不清的话菜单会一直开着——鼠标设备上没有第二次"点击"去关它。 */
  noHover.addEventListener('change', function () { setOpen(false); });

  /* ABOUT 的落点是页脚 slogan 的触发线，不是页脚最后一行落款。
     因此进入时会停在 `.home-footer` 的 ScrollTrigger 起点，让已有的遮罩推入正常播放；
     用户再往下滚动，才抵达完整的 wordmark 与版权信息。 */
  if (aboutLink) {
    aboutLink.addEventListener('click', function (event) {
      const footer = document.getElementById('contact');
      if (!footer) return;

      event.preventDefault();
      setOpen(false);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (window.__lenis && !reduceMotion) {
        window.__lenis.scrollTo(footer, {
          /* 与 setupFooterLead 的 ScrollTrigger 起点完全一致：footer top 40%。 */
          offset: -window.innerHeight * .4,
          duration: 1.15,
          easing: t => 1 - Math.pow(1 - t, 3),
          onComplete: () => window.__homeFooterLead?.reveal()
        });
      } else {
        footer.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
    });
  }
})();
