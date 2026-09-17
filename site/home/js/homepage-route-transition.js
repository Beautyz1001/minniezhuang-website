/* Home → Works / Break 的导航转场配置。
   实际的遮幕生成/播放/预取逻辑在共用文件 site/shared/js/route-transition.js，
   这里只声明"这个页面有哪些入口指向哪里"。WORKS 的 selector 同时覆盖导航栏
   链接和 Works 段末尾的 "View all"；BREAK 同理覆盖导航栏链接和空间装置段
   末尾的 "View all"（N6）——同一目的地的多个入口共用同一份效果与预取列表。 */
(function () {
  if (!window.MZRouteTransition) return;

  window.MZRouteTransition.init([
    {
      selector: '.nav-links a[href="../works/works.html"], a.view-all[href="../works/works.html"]',
      arrival: 'works',
      scale: 'scaleX',
      origin: 'right center',
      duration: .45,
      ease: 'power3.inOut',
      prefetch: [
        '../works/works.html',
        '../works/css/works.css',
        '../works/js/lib/gsap.min.js',
        '../works/js/works-data.js',
        '../works/js/works-nav.js',
        '../works/js/works.js?v=works-route-transition-1',
      ],
    },
    {
      selector: '.nav-links a[href="../break/break.html"], a.view-all[href="../break/break.html"]',
      arrival: 'break',
      scale: 'scaleY',
      origin: 'center bottom',
      duration: .45,
      ease: 'expo.inOut',
      prefetch: [
        '../break/break.html',
        '../break/css/break.css?v=break-route-transition-1',
        '../works/js/lib/gsap.min.js',
        '../break/js/break-nav.js?v=works-parity-1',
        '../break/js/break-data.js?v=works-parity-1',
        '../break/js/break.js?v=break-route-transition-1',
      ],
    },
  ]);
})();
