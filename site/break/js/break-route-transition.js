/* Break → Works 的导航转场配置。
   实际的遮幕生成/播放/预取逻辑在共用文件 site/shared/js/route-transition.js，
   参数和 Home 的 WORKS 入口保持一致（同款时长/缓动/预取列表），
   这样从任意页面点 WORKS 感受都是同一个动效。 */
(function () {
  if (!window.MZRouteTransition) return;

  window.MZRouteTransition.init([
    {
      selector: '.nav-links a[href="../works/works.html"]',
      arrival: 'works',
      scale: 'scaleX',
      origin: 'right center',
      duration: .85,
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
  ]);
})();
