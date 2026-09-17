/* Works → Break 的导航转场配置。
   实际的遮幕生成/播放/预取逻辑在共用文件 site/shared/js/route-transition.js，
   参数和 Home 的 BREAK 入口保持一致（同款时长/缓动/预取列表、同样的
   从下向上离场方向），这样从任意页面点 BREAK 感受都是同一个动效。 */
(function () {
  if (!window.MZRouteTransition) return;

  window.MZRouteTransition.init([
    {
      selector: '.nav-links a[href="../break/break.html"]',
      arrival: 'break',
      scale: 'scaleY',
      origin: 'center bottom',
      duration: .85,
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
