/* Works 项目清单——banner、详情弹层、左侧索引条共用这一份。
   每个项目的封面与详情页都存放在自己的 projects/<slug>/ 目录；pages 的
   顺序就是详情页的阅读顺序。 */

window.WORKS_DATA = [
  {
    slug: 'paradox-heaven',
    name: 'PARADOX HEAVEN',
    nameZh: '悖论乡',
    tags: ['GENERATIVE AI', 'PRODUCT STRATEGY', 'GAME UX', 'GAMEPLAY DESIGN', 'MOBILE'],
    company: 'SJTU Design Campus · Product Manager',
    summary: '一款将传统跑团重构为 AI 协作体验的移动端 RPG，通过 LLM 实现实时文字与语音主持，并支持玩家生成符合个人偏好的 NPC，降低新手门槛并提升玩法自由度。作为 PM 并完成移动端 UX 设计及完整代码实现。',
    links: [
      { label: 'DEMO DISPLAY', url: 'https://www.bilibili.com/video/BV16VjEz5Eiu' },
      { label: 'VISUAL REEL', url: 'https://www.bilibili.com/video/BV1kMjEzmEXZ' },
    ],
    cover: 'projects/paradox-heaven/banner-display.jpg',
    thumb: 'projects/paradox-heaven/thumb.jpg',
    pages: [
      'projects/paradox-heaven/pages/1.png',
      'projects/paradox-heaven/pages/2.png',
      'projects/paradox-heaven/pages/3.png',
      'projects/paradox-heaven/pages/4.png',
      'projects/paradox-heaven/pages/5.png',
      'projects/paradox-heaven/pages/6.png',
      'projects/paradox-heaven/pages/7.png',
    ],
  },
  {
    slug: 'nba2k-online',
    name: 'NBA2K ONLINE',
    nameZh: 'NBA2K Online',
    tags: ['GAME UX', 'ONLINE GAME', 'INTERACTION DESIGN', 'PC'],
    company: 'Tencent Games · Interaction Design',
    highlightCompany: true,
    summary: '腾讯游戏实习期间的精选交互设计案例，涵盖 NBA2KOL2/3 的 UI 系统、交互规范、AI 辅助工作流及功能方案落地。通过多个实际项目，展示我如何将复杂需求转化为可复用、可交付的设计方案。',
    // 只有这个项目的详情页图片需要点击放大/拖动查看（原图分辨率极高，
    // 其他项目的图不需要，见 works.js 里 fillDetail() 对这个开关的判断）。
    enableImageZoom: true,
    cover: 'projects/nba2k-online/banner-display.jpg',
    thumb: 'projects/nba2k-online/thumb.jpg',
    // 原图是设计稿导出的巨幅 PNG（17~72MB/张，共 306MB），画廊只需要一个
    // 看得清内容的尺寸，不需要原始像素——所以每一页拆成 src（压缩过的
    // thumb/*.jpg，画廊和图带渲染用这个）和 full（原图，只有点击放大时
    // 才加载，见 works.js 的 fillDetail()/openLightbox()）。
    pages: [
      { src: 'projects/nba2k-online/pages/thumb/1背包.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/1背包.png' },
      { src: 'projects/nba2k-online/pages/thumb/2街头生涯模式.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/2街头生涯模式.png' },
      { src: 'projects/nba2k-online/pages/thumb/3组队 好友 聊天.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/3组队 好友 聊天.png' },
      { src: 'projects/nba2k-online/pages/thumb/4系统设置.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/4系统设置.png' },
      { src: 'projects/nba2k-online/pages/thumb/5赛事选择.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/5赛事选择.png' },
      { src: 'projects/nba2k-online/pages/thumb/6详情对比.jpg', full: 'https://media.minniezhuang.com/works/projects/nba2k-online/pages/6详情对比.png' },
      { src: 'projects/nba2k-online/pages/thumb/7快捷战术.jpg', full: 'projects/nba2k-online/pages/7快捷战术.png' },
    ],
  },
  {
    slug: 'fantasy-westward-journey',
    name: 'FANTASY WESTWARD JOURNEY',
    nameZh: '梦幻西游',
    // 只影响详情页 PREV/NEXT 切换进来那一下的时长（默认 1.33s，这里单独调慢）。
    enterDuration: 1.5,
    tags: ['GAME UX', 'MMORPG', 'INTERACTION DESIGN', 'AI TOOLING', 'PC'],
    company: 'NetEase Games · Experience Design',
    highlightCompany: true,
    summary: '网易游戏实习期间的产品与交互设计案例合集，涵盖生成式 UI 工具、UGC 流程、活动专题及跨产品设计体系。通过多个项目呈现我从需求拆解、交互设计到最终交付，以及利用 AI 提升设计效率与一致性的完整过程。',
    cover: 'projects/fantasy-westward-journey/banner-display.jpg',
    thumb: 'projects/fantasy-westward-journey/thumb.jpg',
    pages: [
      'projects/fantasy-westward-journey/pages/1.png',
      'projects/fantasy-westward-journey/pages/2.png',
      'projects/fantasy-westward-journey/pages/3.png',
      'projects/fantasy-westward-journey/pages/4.png',
      'projects/fantasy-westward-journey/pages/5.png',
      'projects/fantasy-westward-journey/pages/6.png',
      'projects/fantasy-westward-journey/pages/7.png',
      'projects/fantasy-westward-journey/pages/8.png',
    ],
  },
  {
    slug: 'youdao-dictionary',
    name: 'YOUDAO DICTIONARY',
    nameZh: '有道词典',
    tags: ['EDTECH', 'GROWTH OPERATIONS', 'CONVERSION OPTIMIZATION', 'MOBILE'],
    company: 'NetEase Youdao · Product Operations',
    highlightCompany: true,
    summary: '网易有道实习期间的产品视觉与增长优化案例合集，涵盖转化路径重构、商业视觉设计与竞品研究。通过多个实际项目，展示我如何结合产品逻辑与视觉执行，提升信息效率、用户体验与商业转化。',
    cover: 'projects/youdao-dictionary/banner-display.jpg',
    thumb: 'projects/youdao-dictionary/thumb.jpg',
    // 2026-09-13：原 1-8.png 全部其实是梦幻西游的，已挪回
    // fantasy-westward-journey/pages/，这里暂时只能用 45-48 这四张顶上。
    pages: [
      'projects/youdao-dictionary/pages/45.png',
      'projects/youdao-dictionary/pages/46.png',
      'projects/youdao-dictionary/pages/47.png',
      'projects/youdao-dictionary/pages/48.png',
    ],
  },
  {
    // 2026-09-15 从 Break 挪过来（用户判断这是接的活，算 Works）；
    // 素材从 site/break/projects/shanghai-1924/ 复制。thumb 复用 cover——
    // 没有另外裁过的缩略图，画廊卡片本来就是 object-fit:cover，直接用同一张图即可。
    slug: 'shanghai-1924',
    name: 'SHANGHAI1924',
    nameZh: '上海1924',
    tags: ['VR', 'IMMERSIVE EXPERIENCE', 'DIGITAL HERITAGE', 'EXHIBITION'],
    company: 'Xuhui Gov./SJTU Design Campus · Lead Producer',
    highlightCompany: true,
    summary: '为上海武康大楼百年纪念打造的沉浸式 VR 展览，与徐汇区文旅局合作。通过历史空间数字复原与实时空间叙事，重现建筑百年记忆并完成线下公众展出。',
    cover: 'projects/shanghai-1924/cover.png',
    thumb: 'projects/shanghai-1924/cover.png',
    pages: [
      'projects/shanghai-1924/pages/01.png',
      'projects/shanghai-1924/pages/02.png',
      'projects/shanghai-1924/pages/03.png',
      'projects/shanghai-1924/pages/04.png',
      'projects/shanghai-1924/pages/05.png',
      'projects/shanghai-1924/pages/06.png',
      'projects/shanghai-1924/pages/07.png',
    ],
  },
];
