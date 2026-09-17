/* Break 项目清单。用户于 2026-09-14 提供的六组正式封面与详情图均从此读取。 */

window.BREAK_DATA = [
  {
    slug: 'alone-in-kyoto',
    name: 'ALONE IN KYOTO',
    tags: ['GAME ENVIRONMENT', '3D', 'NARRATIVE DESIGN', 'UNREAL ENGINE'],
    company: 'Course Project · 3D Artist',
    summary: '以霓虹黑色电影式视觉重新构想京都街景，从概念设计、场景搭建到 Unreal Engine 实时渲染完成整体制作。重点探索空间构图、灯光氛围与环境叙事的表达。',
    // 真实素材（2026-09-10 用户提供，来自 C:\Users\think\Desktop\1Alone）。
    // 每页都是排好版的完整设计稿图，页面里已经带了标题/分节文字，
    // detail 层不用再叠加任何文字面板。
    cover: 'projects/alone-in-kyoto/cover.png',
    pages: [
      'projects/alone-in-kyoto/pages/01.png',
      'projects/alone-in-kyoto/pages/02.png',
      'projects/alone-in-kyoto/pages/03.png',
      'projects/alone-in-kyoto/pages/04.png',
    ],
  },
  {
    // 2026-09-15 从 Works 挪过来，和 THE CRAFTSMAN / FADING ONE 两个
    // GAME DEMO 项目放在一起；素材从 site/works/projects/bubble-delivery/ 复制。
    slug: 'bubble-delivery',
    name: 'BUBBLE DELIVERY',
    // 左侧模型旁标题要求强制一行显示，用不换行空格连住（同 identity-optics-lab
    // 那条 modelNameHtml 的做法，只影响这一处渲染，详情弹层标题不受影响）。
    modelNameHtml: 'BUBBLE&nbsp;DELIVERY',
    tags: ['GAME DEMO', '2D GAME', 'AUDIO INTERACTION', 'UNITY', 'PC'],
    company: 'Global Game Jam · Game Designer & Visual Artist',
    highlightCompany: true,
    summary: '为 Global Game Jam 制作的音量驱动平台跳跃解谜游戏，玩家通过声音强度控制角色，在 Bubble 主题关卡中完成探索与挑战。我担任游戏策划与美术设计，并在 Unity 中完成关卡搭建、玩法迭代与交互手感优化。',
    cover: 'projects/bubble-delivery/banner-display.jpg',
    pages: [
      'projects/bubble-delivery/pages/1.png',
      'projects/bubble-delivery/pages/2.png',
      'projects/bubble-delivery/pages/3.png',
      'projects/bubble-delivery/pages/4.png',
      'projects/bubble-delivery/pages/5.png',
    ],
  },
  {
    slug: 'demo-1',
    name: 'THE CRAFTSMAN',
    tags: ['GAME DEMO', '2D GAME', 'PUZZLE', 'LEVEL DESIGN', 'UNITY'],
    company: 'Global Game Jam · Game Designer & Visual Artist',
    highlightCompany: true,
    summary: '为 Global Game Jam 制作的 2D 平台解谜游戏，负责关卡设计、场景构成与整体美术表现。基于 Unity 完成 Demo，以环境交互与空间推进构成核心解谜体验。',
    cover: 'projects/demo-1/cover.png',
    pages: [
      'projects/demo-1/pages/01.png',
      'projects/demo-1/pages/02.png',
      'projects/demo-1/pages/03.png',
      'projects/demo-1/pages/04.png',
      'projects/demo-1/pages/05.png',
    ],
  },
  {
    slug: 'demo-2',
    name: 'FADING ONE',
    tags: ['GAME DEMO', '2D GAME', 'NARRATIVE DESIGN', 'PIXEL ART', 'UNITY'],
    company: 'Independent Game · Game Designer & Visual Artist',
    summary: '一款围绕记忆、感知与城市孤独展开的原创 2D 像素解谜游戏。从概念与叙事框架出发，完成场景设计与整体视觉世界观构建。',
    cover: 'projects/demo-2/cover.png',
    pages: [
      'projects/demo-2/pages/01.png',
      'projects/demo-2/pages/02.png',
      'projects/demo-2/pages/03.png',
      'projects/demo-2/pages/04.png',
    ],
  },
  {
    slug: 'the-new-identity-card',
    name: 'IDENTITY OPTICS LAB',
    // 左侧模型旁标题的容器较窄，自然换行会断成 "IDENTITY OPTICS" / "LAB"；
    // 用户要求固定断在 "IDENTITY" 之后。只用于这一处（break.js 的 modelName），
    // 详情弹层标题、aria-label 仍用上面的 name，不受影响。
    modelNameHtml: 'IDENTITY<br>OPTICS LAB',
    tags: ['INTERACTIVE INSTALLATION', 'GENERATIVE AI', 'SPECULATIVE DESIGN', 'SPATIAL EXPERIENCE'],
    company: 'Selected for European Exhibition · Installation Designer',
    highlightCompany: true,
    summary: '一件将"身份评估"转化为制度化仪式的互动空间装置，通过生成系统、投影与空间交互，探讨身份如何被测量、分类与建构。选入27年欧洲艺术装置展会。',
    cover: 'projects/the-new-identity-card/cover.png',
    pages: [
      'projects/the-new-identity-card/pages/01.png',
      'projects/the-new-identity-card/pages/02.png',
      'projects/the-new-identity-card/pages/03.png',
      'projects/the-new-identity-card/pages/04.png',
      'projects/the-new-identity-card/pages/05.png',
    ],
  },
  {
    slug: 'visual-1',
    name: 'JASON WAS BORN',
    tags: ['VISUAL IDENTITY', 'ART DIRECTION', 'GRAPHIC DESIGN', 'CAMPAIGN'],
    company: 'Original IP · Art Director & Visual Designer',
    summary: '围绕虚拟人格「Jason」构建的一套原创视觉身份，将个人态度转化为统一的视觉语言，并延展至主视觉、海报、数字媒介与实体物料。',
    cover: 'projects/visual-1/cover.png',
    pages: [
      'projects/visual-1/pages/01.png',
      'projects/visual-1/pages/02.png',
      'projects/visual-1/pages/03.png',
      'projects/visual-1/pages/04.png',
      'projects/visual-1/pages/05.png',
      'projects/visual-1/pages/06.png',
    ],
  },
];
