# Minnie Zhuang Personal Website

这是一个无构建工具的静态个人作品集。直接从本目录提供静态文件即可；Portal 实验页必须通过其专用本地服务器运行。

## 文件地图

| 区域 | 入口 | 负责内容 |
| --- | --- | --- |
| 正式工作区 | `site/` | 未来唯一的制作入口；目前 Home 已迁入 |
| Home | `site/home/` | 当前主站首页制作版本 |
| 预留页面 | `site/works/`、`site/break/`、`site/about/` | 未来分别独立开发，不读取 Home 代码 |
| 未来共享层 | `site/shared/` | 仅放真正跨页复用的代码、样式和素材 |
| 旧版存档 | `archive/v1-static-site/` | 初始四页及其依赖，冻结且不参与日常开发 |
| Home 正式首页 | `site/home/index.html` | 当前首页制作版本 |
| Home 样式 | `site/home/css/homepage-portal.css` | Home 专属布局与动画样式 |
| Home 场景 | `site/home/js/homepage-portal.js` | 标题量测、滚动进度与 CSS 场景状态 |
| Home 3D | `site/home/js/homepage-portal-3d.js` | Three.js 门洞、光池与雾 |
| Home 叙事 | `site/home/js/homepage-portal-scroll.js` | 门洞后的滚动内容与 ScrollTrigger |
| Portal 局部交互 | `homepage-portal-intro.js`、`homepage-portal-title-focus.js`、`homepage-portal-works.js` | 开场、标题跟焦、作品卡片 |

## 运行

主站可由任意静态服务器提供。Home 请在 `site/home/` 中运行：

```powershell
python dev-server.py
```

然后访问 `http://localhost:8788/`。该服务器会禁用缓存，便于确认脚本改动已经生效。

## 维护边界

- 设计与协作约束在 `CLAUDE.md`；Home 进度和专项约束在 `site/home/_internal/HANDOFF.md`。
- 修改 Portal 前必须阅读 `site/home/_internal/PITFALLS.md`。
- `site/home/js/lib/` 和 `site/home/assets/` 是本地依赖与素材；在没有确认引用关系前不删除、不改名。
- Portal 的脚本加载顺序是运行契约：场景状态 → Three.js → GSAP/Lenis → 滚动叙事 → 局部交互。
