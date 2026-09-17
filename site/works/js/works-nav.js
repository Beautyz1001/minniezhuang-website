/* 顶部导航：触屏上的「点一下展开」。和 site/home 的 js/homepage-portal-nav.js
   逻辑一致，独立成一份文件，不引用 Home 的脚本。
   鼠标设备完全不走这里——菜单靠 CSS 的 :hover 开，这段脚本不掺和；
   只有没有悬停能力的设备（手机/平板）才把 .is-open 挂上去。 */
(function () {
  const menu = document.querySelector('.nav-menu');
  if (!menu) return;

  const toggle = menu.querySelector('.nav-current');
  if (!toggle) return;

  const noHover = window.matchMedia('(hover: none)');

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  toggle.addEventListener('click', function (e) {
    if (!noHover.matches) return;
    e.preventDefault();
    setOpen(!menu.classList.contains('is-open'));
  });

  document.addEventListener('click', function (e) {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(e.target)) return;
    setOpen(false);
  });

  noHover.addEventListener('change', function () { setOpen(false); });
})();
