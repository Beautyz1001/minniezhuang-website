# Portal 交接文档 — Hero 门洞改用 Three.js

> 正式首页文件是 `site/home/index.html`（本文件在 `site/home/_internal/` 下），文中相对路径均以 `site/home/` 为准。
> 开工前先读 `AGENTS.md`（全局规则）+ 本文件「长期背景」（本实验规则）+「当前状态」（进度）。
>
>
> **⚠ 这份文档怎么维护（2026-09-09 用户重申，之前违反过）**
>
> **它的唯一用途是：新开一个对话框时，一眼看懂「现在是什么样、还差什么、下一步做什么」。**
> 它**不是**改动日志。
>
> 1. **「当前状态」每次整体覆写，不许把新一轮续在后面。**
>    一旦开始按轮次往下堆，文档就会长到没人读，而且**旧描述会和新现状打架**——
>    曾经堆到 1800 多行，里面还留着「聚到屏幕中心再散开」「01 Works」这些早被推翻的写法，
>    新对话读到会当成现状。
> 2. **新决定直接覆盖旧决定，旧的那条删掉，不要保留"曾经打算怎么做"。**
>    需要追溯"为什么不能那样做"时看 `PITFALLS.md`——那份才是只增不删的。
> 3. **实现细节写在代码注释里，这里只写结论和指路。** 同一个数字不要在两处各写一遍，
>    否则改了一处另一处就成了假信息。
> 4. 两份文档的分工：**本文件＝现状**（会被覆盖）；**`PITFALLS.md`＝否决记录**
>    （只增不删，改动前先查，避免重蹈覆辙）。

---

## 长期背景（几乎不变，仅在实验方向本质调整时更新）

### 为什么用 Three.js 而不是 CSS

把 Hero **只有门那一层**从 CSS 换成 Three.js。参考图里的泛光是 HDR Bloom（渲染出超过1.0的亮度，再提取/模糊/叠回），CSS 没有灯、没有相机、没有后期，做不出这个质感——用 CSS 手绘光影已连续失败五次（见 `PITFALLS.md`）。**Three.js 不是"更花哨"，是介质选对了。**

### 已锁定的决策（不要再问用户）

| 项目 | 决定 |
|---|---|
| 门内的世界 | 暂用 `assets/homepage/background.png`，做成门后一块发光的面 |
| 光的颜色 | 红+紫两盏灯，位置错开混出品红；强度随 camera.z 微调 |
| 地面贴图 | 已下载，GL 版本（不是DX），见「素材清单」 |
| 架构 | 新文件 `js/homepage-portal-3d.js`；`homepage-portal.js` 只加约5行把 camera.z 递出去 |
| 三方库 | three.js 下载到 `js/lib/`，不走CDN |
| 排版/导航/背景 | 一行都不动 |

### 门洞屏幕几何（1:1 复刻的地基，锁定值，别改）

用户要求门洞位置比例必须和 CSS 版一模一样。门洞用视口百分比定义（`--clip-*`），所以要反推相机位置/墙的尺寸，而不是随便放相机再凑。

实测数据（2026-08-23，视口1536×639，数值为百分比，与窗口无关）：

| camera.z | clip-top | clip-right | clip-bottom | clip-left | 门洞中心高度 | --cam-depth |
|---|---|---|---|---|---|---|
| 0.00 | 36.85% | 49.10% | 53.65% | 49.30% | 41.6% | 2400px |
| 0.25 | 35.00% | 48.30% | 50.60% | 48.50% | 42.2% | 2040px |
| 0.50 | 28.35% | 42.50% | 36.15% | 42.70% | 46.1% | 1436px |
| 0.75 |  7.20% | 17.80% |  8.00% | 18.00% | 49.6% | 1024px |
| 1.00 |  0%    |  0%    |  0%    |  0%    | 50.0% |  900px |

公式在 `js/homepage-portal.js` 的 `DOOR` 常量和 `doorState()` 里，**不要改动**——Phase 2 已锁定的视觉。

### 图层架构（canvas 只替换三层）

```
z-index 100  .site-nav        导航            ← CSS 不动
z-index 6    .hero-text       大标题+小字      ← CSS 不动（字体测量逻辑一行不改）
z-index 5    .vignette        暗角            ← CSS 不动
z-index 4    .fog             雾              ← CSS 不动（以后可能挪进3D）
─────────────────────────────────────────────
z-index 2    .door            门              ← ★ 换成 canvas
z-index 1    .door-glow       门口辉光        ← ★ 换成 canvas
z-index 1    .light-pool      地面光池        ← ★ 换成 canvas
─────────────────────────────────────────────
z-index 0    .hero-bg/.bg-purple  黑紫背景     ← CSS 不动
```

canvas透明背景，插在z-index 1~2。**已知风险**：Bloom在透明背景上有时会出问题，若真出问题可把黑紫背景也搬进3D场景，但要告诉用户。**回滚方式**：删canvas和script，取消那三层CSS注释即可。

### 光的实现细节（都是踩坑后定下来的，别随便改）

根因回顾：光池曾经是手画的梯形（`slope = lerp(0.52, 0.09, t)`），和镜头距离没有物理关系，滚动时对不齐。现改为：地上不画任何东西，门后两盏灯（红/紫）透过看不见的门洞照在柏油地上，光斑自己出现，门一动光斑必然跟着动。

1. **两台相机**：`camIn`画门洞内部（和CSS逐像素对齐，不能动）；`camOut`画门外的地，把画面上下挪 `c = 门槛+眼高` 像素（移轴镜头原理，避免"转相机"导致竖线歪）。
2. **地面不透明度=自身亮度**。未被照到处全透明，让CSS黑紫背景透出——试过叠加混合会导致透明处颜色被一并丢掉。
3. **墙不可见**（`colorWrite: false`）只挡光；地要多伸进墙一点、墙要往镜头挪一丝，否则墙根漏一条一像素亮线。
4. **阴影用PCF不用VSM**——VSM在"墙地贴近"处必漏光。
5. **灯的张角每帧自动算**，只够罩住门洞再宽30%，张角太大阴影贴图会摊薄导致边缘马赛克。
6. **灯高=0.8×门洞高**（唯一不能用固定长度的量），过高光射不到地，略低于上沿才能贴地铺开。
7. **其余长度都固定**（以"一屏高"为单位）：眼高、房间进深、双灯间距、地面颗粒大小——若把眼高绑到门高上会导致"人越走越矮"。

**门槛缝bug修法**：地正好铺到墙根（`zFar = wallZ`），门洞裁切范围往下多放一像素（`applyDoorScissor`里的`over`）。

### 主循环的省电结构（2026-09-04 定，改动前务必看懂）

整帧在 Intel 核显上原本要 53ms（19fps）。开销分布：**雾 33ms、地面光+阴影 13ms**，
门内和辉光加起来不到 1ms。三条规则撑着现在的帧率，破坏任何一条都会立刻卡回去：

1. **雾是自走动画，必须逐帧画。** 它靠 `uTime` 漂，和门、鼠标动不动无关。
   `drawOnce()` 里那个「没变化就不画」的判断**必须**把 `fogAnimating` 算进去，
   否则页面静止时画布停画、雾被冻住，下次重画时 `uTime` 已跳过一大段——
   看上去就是每隔几秒卡一帧。**以后再往 canvas 加任何自己会动的东西，都要同样处理。**
2. **雾画在半分辨率的小图上**（`fogRT`，比例 `TUNE.FOG.scale`，默认 0.5）再放大贴回。
   雾的耗时和像素数严格成正比，它又是最高只有 31% 浓度的低频软薄纱，没有需要
   逐像素分辨的细节。实测与全分辨率相比平均差 0.0065/255，肉眼不可分辨。
   注意 `fogMaterial` 因此必须是 `NoBlending`（小图上它是唯一的东西，
   再混色会把 alpha 乘两遍导致雾变淡），真正的叠加发生在 `fogComposite`。
3. **门没动的帧复用底图。** `fogLightFrame` 存的是「加雾之前」的整张画面，
   门和灯没动时地面光/门内/辉光的结果与上一帧逐像素相同，直接用 `sceneRestore`
   贴回来，省掉整套重画。阴影贴图同理，由 `shadowMap.needsUpdate = sceneChanged`
   手动点名重算（`autoUpdate` 已关）。
   **为什么用 `fogLightFrame` 而不是新开一张 RenderTarget**：它是从画布本身拷下来的，
   格式和颜色空间与画布一致，贴回去是像素级还原（实测 1691 万子像素只有 48 个
   差 1/255）。换成普通 RenderTarget 会掉进 three.js 的线性/sRGB 转换坑，
   门的颜色会被悄悄改掉。

结果：静止帧 53→12ms（80fps 上下），滚动帧 53→30ms。滚动时所有东西都在变，
只能全量重画；若还嫌不够，唯一的旋钮是把 `TUNE.FOG.scale` 再调小。

### 正面那面墙（2026-09-04 加，两个坑都踩过一遍）

墙**拆成两层**，不能合并：
- **挡光层**：看不见的四块低面数板，只负责投影。和加墙之前完全一样，地上光斑形状因此没变。
- **可见层**：128×128 的密网格，顶点被真实推出起伏，`castShadow = false`。

1. **可见层不投影，是故意的。** three.js 画阴影时用的是另一套简化材质，**不执行**顶点位移——
   13 万个三角形投出来的影子和一块平板完全一样，却要三盏灯各算一遍。买到的是零。
   真正看得见的那条影子来自门套和踢脚线（低面数盒子，照常投影）。
2. **可见层必须比挡光层往镜头挪，且挪的距离要大于起伏的最大深度**
   （代码里是 `relief * 1.15 + 0.004` 个屏高）。挪不够的话，被起伏推到挡光层背后的
   区域会被判成阴影，整面墙浮出一层沿等高线走的**阶梯状噪点**。这个现象出现过两次。
3. **可见层只从地平线往上铺。** 地平线以下那截埋在地里、被地面完全盖住，
   却照样每个像素跑完整光照——白烧 7ms。
4. **反弹光的方向决定踢脚线是不是一条假亮线。** 光若从前方水平打向墙，
   踢脚线正对镜头的面会被正面照亮，变成一条横穿全屏的均匀亮线，像漏光。
   必须从下方或上方斜着打，踢脚线才会读成一条暗带加一条细高光。
5. **墙面不用法线贴图**（用户明确否过："法线太假、贴图感非常重"）。
   立体感来自真几何起伏 + 大尺度污渍，两者都是低频、无重复周期的。

### 换地面素材的三道工序（跳过任何一步都会出问题）

1. **压缩**：颜色/粗糙度转JPG(质量90)，法线转24bpp PNG（压缩会出杂讯）。
2. **法线DX/GL**：DX版（文件名带`_nor_dx_`）绿通道方向和WebGL相反，需离线取反或`normalScale.y`设负数，拿错会导致坑变包、光影反转。
3. **去掉法线大尺度倾斜（高通）**：扫描类法线图整体常带极轻微倾斜，平铺后会在几乎平行地面的光照下浮出横纹。做法：整图做大半径（96px）环绕式模糊，原图减去它再加回127.5。

**贴图感**：同一张图在着色器里采样两次（第二次转1.13弧度、缩0.71倍），用缓慢噪声决定每点偏向哪层（见`homepage-portal-3d.js`的`DETILE`），法线第二层要把凹凸方向一起转。

### 素材清单

```
assets/homepage/
├── background.png                    1440×652  门内世界（暂用）
├── reference/
│   ├── 1.png 2.png                             小小梦魇2截图（光的参考）
│   └── video.mp4                     21秒      ★还没拆帧研究
└── texture/
    ├── asphalt_02_nor_gl_1k.png      法线，必须留PNG
    ├── asphalt_02_diff_1k.png        颜色，转JPG可压缩
    └── asphalt_02_rough_1k.png       粗糙度，转JPG可压缩
```

贴图尺寸别太大（用户明确交代过）。`video.mp4`是最重要的未开发资源，Chrome已接通可跳帧截图研究。

### Portal专属调试技巧

- `dev-server.py`带禁止缓存，**不要**用`python -m http.server`（会缓存js模块，改完刷新还是旧代码）。
- 控制台命令：`__portal3D.off()`/`.on()` 切换2D/3D版对比；`?3d=0`同效果。
- `__portal3D.draw()` 强制重画（截图用）；`draw(false)` 走主循环那条真实路径，
  门没动时会复用底图——**量性能必须用 `draw(false)`**，用 `draw()` 量到的是全量重画。
- 标签页切后台后动画会暂停，截图前先敲 `__portal3D.draw()`。
- 跳滚动进度并强制重画：
  ```js
  const pw = document.querySelector('.pin-wrap'), d = pw.offsetHeight - innerHeight;
  window.__go = async z => { scrollTo(0, pw.offsetTop + z*d);
    await new Promise(r => setTimeout(r, 250)); __portal3D.draw(); };
  ```
- 改光参数立即生效：`__portal3D.set({ LAMP_Y: 0.7, RED: { color: 0xff2606, power: 0.4 } })`

---

## 当前状态（覆写，不追加）

> 最后更新：2026-09-17

### 任意页面点 BREAK 都触发同款转场（第一版，等用户验收，紧接下面两条）

延续"任意页面点 WORKS"那次的做法，这次对齐 BREAK：新增入口是 Home 的
"View all"（空间装置段末尾那条 N6，`a.view-all[href="../break/break.html"]`）
和 Works 导航栏的 BREAK 链接（新建 `site/works/js/works-route-transition.js`，
和 `index.html` 一样引入共用的 `site/shared/js/route-transition.js`）。
Home 导航栏的 BREAK（原有入口）参数也一起换成这次的新节奏，不再是旧的
`.58s power4.inOut`。

**刻意保留的差异**：BREAK 的遮幕方向沿用项目里已经定好的"从下向上离场/揭示"
语言（`scaleY` / `center bottom`，和 Works 的横向 `scaleX` 不同），这次没有改成横向；
统一换成的新缓动是 `.85s expo.inOut`（离场）和 `1.05s expo.inOut`（Break 侧
`break.js` 里揭示遮幕的 `yPercent -100`，原来是 `.76s power4.inOut`）。

**没有动的地方**：Break 页里那个 `GLTFLoader` 异步加载的 3D 模型
（画架/凳子/落地灯，`break-scene.js`）不属于这次范围，没有给它接入"素材备好
再揭示"的门槛——只对画廊封面图（`.break-gallery-card-image`）做了和 Works
一样的解码预加载（900ms 兜底）。模型该显示 "LOADING MODEL" 还是照旧显示。

已验证：Home 的 View all(N6)、Works 导航 BREAK、Home 导航 BREAK 三个入口
分别测过，落地 break.html 后 3D 模型和画廊封面都已就绪、控制台无报错；
顺带回归了 Home 导航 WORKS 没受影响。**这是用户要求的"先出一版给我验收"**，
还没有进一步动作，等用户看完实际效果反馈再往下走。

### 任意页面点 WORKS 都触发同款转场（刚完成，紧接上一条）

用户要求"无论什么界面点右上角 WORKS 都要有跳转动画，包括页面里的 View all"。
排查后确认的入口清单：Home 导航栏 WORKS（已有）、Home 的 Works 段 "View all"
（原来没有动画，纯跳转）、Break 导航栏 WORKS（原来整个 Break 页没有离场遮幕逻辑）。
Works 页自己的 "WORKS" 是当前页高亮按钮不是链接；Break 没有指向 Works 的
View all；`site/about/` 还没建。

做法（用户选定"抽共用脚本"而不是两页各写一份）：
- 新增 `site/shared/js/route-transition.js`：把原来写死在 Home 那份文件里的
  "生成黑幕 → 播放 → 预取资源 → 跳转"逻辑整个搬过来，改成
  `window.MZRouteTransition.init(destinations)`，destinations 只描述
  "选择器 / arrival 标记 / 缩放方向与原点 / 时长缓动 / 预取列表"。
- `site/home/js/homepage-route-transition.js` 现在只剩配置：WORKS 目的地的
  `selector` 同时匹配导航链接和 `a.view-all[href="../works/works.html"]`，
  两个入口共用同一份参数；BREAK 目的地配置原样保留（`.58s power4.inOut`，没有 prefetch）。
- 新增 `site/break/js/break-route-transition.js`：只声明 Break 导航栏的 WORKS
  一个入口，参数（`.85s power3.inOut` + 同一份 prefetch 列表）和 Home 的 WORKS
  完全一致，保证从哪个页面点都是同一个观感。
- 两个页面的 HTML 都在 gsap 加载之后插入 `<script src="../shared/js/route-transition.js">`
  + 各自的配置脚本；`dev-server.py` 已经把 `/shared/` 映射到 `site/shared/`，
  不需要额外改服务器配置。
- 已验证：Home 导航 WORKS、Home 的 View all、Break 导航 WORKS 三个入口分别真实
  点击/派发点击事件测试，均正确设置 `sessionStorage` 的 arrival 标记、正确插入
  6 条 prefetch link、正确在动画播完后跳到 works.html 并完整揭示（电视屏+画廊+
  文字都到位），控制台无报错；顺带回归验证了 Home 导航 BREAK 没有被这次重构
  影响，行为和参数都不变。

### Home→Works 转场动效优化（刚完成）

用户反馈原来的转场"节奏太快/太机械"，改动范围仅限 `site/home/js/homepage-route-transition.js`
里 WORKS 那条黑幕动画的时长/缓动，和 `site/works/js/works.js` 的 `playWorksIntro()`
时间轴（各元素 duration/ease/错开时间点）。Home→Break 转场未动（duration/ease 保持原值）。

- Home 侧黑幕覆盖：`.58s power4.inOut` → `.85s power3.inOut`。
- Works 侧入场时间轴整体拉长、缓动统一换成站内已用过的 `expo.out`/`expo.inOut`
  语言（原是 `power3.out`/`power4.inOut` 混用），各层错开的起始时间点也重新分布，
  让电视屏→画廊→导航→文字更像依次揭示而不是同时发生。遮幕滑开（route arrival 独有）
  从 `.78s power4.inOut` 延到 `1.05s expo.inOut`。
- **顺带实现了用户追加的要求**："借用动画的时间加载内容，素材备好再揭示"：
  1. Home 点击 WORKS 时，黑幕覆盖的同时用 `<link rel="prefetch">` 预取 Works 页的
     文档/CSS/JS（不含图片，图片列表在 `works-data.js` 里，未跟着硬编码进 Home，
     避免两处数据打架）。只对 WORKS 生效，Break 没有这个逻辑。
  2. Works 页只有在“路由跳转过来”（黑幕还盖着屏幕）时，`playWorksIntro()` 才会
     先 `await` 一个就绪信号——画廊可见封面图解码完 + 电视预览模型
     `createTelevisionPreview` 加载完（走 `tvReady` promise，加载失败也会
     resolve，不会卡死），最多等 900ms 兜底，然后才开始播放揭示动画。
     直接刷新/直接访问 Works 页没有黑幕遮挡，逻辑不变、立即播放。
- 已验证：真实点击 Home 的 WORKS 完整走了一遍，落地页电视屏、画廊、文字都已就绪
  显示，无控制台报错；`works-tv` 的 `createScreenAtmosphere` 参数本身**没有改动**
（[[works-tv-screen-light-1-locked]] 未被触碰，只是改了它入场揭示的时间点）。
- 未做的：真实滚轮/更细粒度的中间帧慢放没有再逐帧核对（工具截图的网络往返比动画
  本身长，抓不到中间帧），已改为验证最终落地帧 + 控制台无报错；如果用户实际感受
  还是不对，需要具体反馈是哪一段（例如"电视屏出现太晚""画廊张开太慢"）再调数值。

### 顶部导航跨页预览已接通（2026-09-16）

Home、Works、Break 的右上角菜单现在都使用同一组正式目标：`WORKS` 指向
`site/works/works.html`、`BREAK` 指向 `site/break/break.html`、`ABOUT` 指向
Home 页脚的 `#contact`。`dev-server.py` 保留 Home 的短预览地址，同时显式映射
`/home/`、`/works/`、`/break/` 与 `/shared/` 到 `site/`，所以跨页链接在本地预览和
上线后的目录结构中都能工作。菜单结构、展开动画和各页视觉均未改。

### ⚠ 原 VR 段（BELONGINGS）位置已改放 GAME DEMOS 内容（2026-09-16）

代码里 `class="home-vr"` / `id="vr-title"` 这一段（HTML 里大段"VR段"注释、
CSS `.vr-*` 选择器）**类名和注释还是旧的**，但标题已改成 `GAME DEMOS`
（`js/`不涉及，纯文案+字号改动，55px→60px）。

**BELONGINGS（VR 项目）这次只挪了文档，代码和内容都还没动**——用户明确
"暂时不管 BELONGINGS，只先改文档"。也就是说：
- 这一段目前展示的是游戏 demo 相关内容（标题 `GAME DEMOS`），
  标签栏（`GAME DEMO`/`2D GAME`/…）、简介、附图、CTA 等**其余原 VR 段内容尚未替换**，
  暂时还是 BELONGINGS 的占位文字/图片，只是标题变了——**内容和标题目前不匹配**，
  下次改这一段时注意。
- **BELONGINGS 项目未来放哪里、要不要搬到 Home 别处，还没定**，
  不要假设它已经被删除或已经移走。
- 下面「BREAK 项目间距（已锁定）」里写的"VR"是**历史间距记录**，
  指的就是这一个 DOM 位置（现在装 GAME DEMOS 内容），数值本身没变，
  只是名字和实际内容对不上了。

### 现在在做什么

Home 的**排版归并**、**Works 段 `W O R K S` 动效**、**Works slogan 出血**、
**黑底渐变起点上移**都已告一段落。Works 精选轮播左侧的项目标题现有一条
仅在鼠标设备生效的 GSAP hover：标题轻微向右推进并横向拉紧，同时显出一条和顶部 HOME
同构、位于文字左侧的细红竖线（距字 4px、高度随一／两行标题自适应）；标签／公司／简介
不再压暗，且减少动态偏好下不播放。
当前可直接打开详情的居中卡片另有一个桌面 `VIEW` 跟手提示（General Sans、13px、500；
略放大的黑色轻圆角底框）。Home 内所有 `VIEW` 入口（Works 居中卡片、Kyoto 大图、
JASON 两张小卡片、IDENTITY CARD）都不能只依赖 `pointerleave`：卡片可被 Lenis/GSAP
在静止鼠标下带离。它们显示时会按动画帧用最后的鼠标坐标核对自身实际矩形；坐标离开即
收起，并立即停止核对。首次进入先用 `gsap.set()` 无感定位在鼠标处，再交给现有 CSS
opacity transition 淡入；`quickTo` 只在已显示后跟随，不能与入场动画同时写 transform。Home 的卡片与标题入口，以及 Works
总览页项目卡片，统一使用 Works 详情的同一套 GSAP 镜头：全屏裁切展开后，内容按可见高度
的一半从下方升入（1.33s）；关闭反向收束，Home 退场完成后才清空图带。ALONE IN KYOTO 的标题复用相同
的推进＋左侧红线 hover；标题和右侧大图都是详情入口（右图在桌面显示 `VIEW` 跟手提示），
点击会在 Home 中打开 Break 正式数据里的 Kyoto 四页详情，关闭／Esc 后恢复首页滚动。Works 与 BREAK / GAME DEMOS
底部复用的 `View all` 行（含编号）也已切到 slogan 的 General Sans；其中 `View all`
链接字号为 30px，编号保持原字号。以上均不改电影院缩放、卡片尺寸或轮播切换逻辑。

GAME DEMOS 的标题、分隔线和简介现由 `.vr-heading` 作为一个视觉组整体下移 30px；标签、图片、卡片堆叠及项目间距不变。
其中主标题字号现为 110px。
其下的 “A series of Global Game Jam demos and indie games.” 现使用 slogan 的 General Sans，字号为 22px。
该段标签、标题、分隔线和说明文字的入场现同步开始（无 stagger 或等待），以 2s 的 `expo.out` 平滑推入；只改这一段，不影响 Break 共用的其它文字入场。

Home 的普通文本继承 `body { cursor: default; }`，悬停不再显示 I 形文字选择光标；已有的链接、项目入口、`VIEW` 跟手提示及拖拽区域仍由各自选择器保留原光标。

左上 logo 与右上导航现在由 `.site-nav` 整体复用滚动中 `WORKS` / `BREAK` 的
`mix-blend-mode: difference`（不能挂在其子文字上，fixed 导航自己的层叠上下文会隔绝底图）。
logo 与当前页文字保持品牌 `--red`，展开项保持原有灰白；整组经过黑底、图片或红光时仍随底层像素自动变色。布局、展开逻辑、链接和状态竖线的交互／几何均未改。

Showreel 中的 `( Step inside )` 短标记现为 22px；同组下方叙述句维持原字号。

GAME DEMOS 卡片组右侧的当前项目标题已复用 Kyoto 的 GSAP 推进和左侧红线 hover。标题会随最前方卡片更新，点击后以同款详情阅读器打开该项目在 `BREAK_DATA` 中的正式详情图，关闭／Esc 后恢复首页滚动；卡片拖拽与切换逻辑未改。

三张 GAME DEMOS 堆叠卡片在桌面鼠标悬停时显示黑底 `DRAG` 跟手提示，取代普通光标以提示可拖动或点击切换；它与 Home 的 `VIEW` 使用同款逻辑：首次进入先 `gsap.set()` 无跳转定位，后续以 `quickTo` 跟随，且可见期间逐帧核对卡片真实边界，滚动把卡片从静止鼠标下移走时会立即收起。该提示不改变卡片原有行为。

空间装置段底部的两张飘浮小卡片现为 `JASON WAS BORN` 的入口：桌面悬停显示 `VIEW` 跟手提示，点击任一张均打开其六页正式视觉项目详情，关闭／Esc 后恢复首页滚动；原有两张卡片的滚动漂移与位置不变。

空间装置 `THE NEW IDENTITY CARD` 自身仅在进入该段的第一个 `100svh` 视口提供 `VIEW` 与正式详情入口；往下滚动后的装置主体没有该入口，底部两张 JASON 小卡片仍各自保留 `VIEW`。

顶部菜单的 `ABOUT` 现在精确定位到页脚 slogan 的原始触发线（`.home-footer` 顶部位于视口 40%）；抵达后会明确重播 slogan 的遮罩推入，避免长距离定位跨过 ScrollTrigger 而直接显示终态。继续向下才到 wordmark 与落款。


### 黑底渐变起点上移 100px，不影响 WORKS 位置（刚完成）

用户："黑底板开始渐变的地方往上调 100px，现在有点靠后。" 确认过要求"只改黑幕，
不能带动 WORKS 内容一起挪"（黑幕起点原来和 WORKS 内容共用同一个变量）。

做法：把共用变量拆成两个——`.home-works` 的 padding-top 继续用
`--inner-entry-gap`（90px，没变）；新增 `--curtain-entry-gap`（90 → -10，
专供 `js/homepage-portal-scroll.js` 的 `syncShowreelExitGap()` 算
`.inner-world`（黑色渐变画在它身上）的 margin-top）。
这样 `.inner-world` 自己上移了 100，但 `.home-works` 是它的第一个子元素、
中间没有间隔，若不补偿会跟着一起上移——所以在 `.inner-world` 上又加了
`padding-top: 100px` 精确抵消（用 padding 不用 margin，不会跟父级的巨大负
margin-top 塌陷）。`.inner-world` 没有 border，`background-origin` 默认
`padding-box`，这条 padding 不会把渐变的起点往下推。

已验证：`.inner-world.top` 从 3772.8 → 3672.8（精确 -100）；`.home-works`/
`WORKS`/slogan/卡片区的位置和加这条之前一模一样（不受影响）；WORKS 吸顶和
三趟散开聚拢动效仍正常；控制台无报错。

### Works slogan（`Selected work across…`）：右边出血 + 下移 30px（刚完成）

用户要求"右对齐出血"，随后又分三次追加下移（30px、50px、50px，`margin-top` 现在合计 **130px**）。
做法：`margin-right: calc(-1 * var(--edge))` 把右边推出 `.home-works` 的内边距、
贴到视口可见区右边（`document.documentElement.clientWidth`，不是含滚动条的 `innerWidth`）；
`margin-top` 负责下移。宽度和字号没动。

⚠ **副作用**：这句原来的左边和 Break 段那句叙述字对齐（同为 944.7）、
顶边和 `W O R K S` 吸顶前的初始位置对齐（同为 3994.9）——出血后**两条对齐关系都被打破**
（左边变成 1005.5，顶边变成 4024.9）。用户只点名了出血和下移，这两条旧对齐关系
**没有人要求恢复**，如果要恢复需要重新问怎么处理三者的关系。

⚠ 实测无横向滚动条（`scrollWidth === clientWidth`），出血没有撑出视口。

**第一张卡和 slogan 的垂直间距为 120px**（原 200px；最新一次用户要求在 110px 的基础上增加 10px）。
改的是 `.works-intro` 的 `margin-bottom` 里那个常量（`200px` → `120px`）。
⚠ **这个常量是唯一决定该间距的量**：`.works-intro` 的 `transform: translateY(...)`
和 `margin-bottom` 里的 `+ var(--works-heading-offset) + 20px` 两两抵消，
slogan 自己再加多少 `margin-top` 都不影响这段间距（它是 intro 里最高的元素，
撑高 intro 本身，grid 位置和 intro 可见下边缘按同样的量一起下移，相减抵消）。
**以后再调这段间距，只改这一个常量**，不要去动 slogan 的 margin-top。

### BREAK 开场与 Works「View all」的间距（刚完成）

桌面端将 BREAK 标签和右侧叙述字作为一个整体，与上方 `View all` 的间距保持 **280px**。
`.home-break-open` 以负 margin 抵消上方 `.home-works` 的响应式底部留白后保留 `padding-top: 280px`；其底部留白为 **120px**，因此 BREAK 整体与下一段电影院视频的间距等于 Works slogan → 首张卡片的 120px。BREAK 内部两栏关系和窄屏原有响应式留白均未改动。

### BREAK 左侧五字母动效（已接入，2026-09-17 五次定稿，当前生效版本）

`js/homepage-portal-scroll.js` 的 `setupBreakWord()`：**钉住区间和动效区间是
两个独立的触发点**，别合并成一个：

- **钉住**（position:fixed，贴 logo 下方）从 `.home-break-open` 顶部触顶就
  开始——用户原话"break 要像 works 一样，遇到 logo 就开始 pin"。字母一碰到
  logo（BREAK 开篇滚到视口顶部）就立刻钉住，和 Works 的字一进
  `.home-works` 就吸顶是同一回事，**不用等电影院**。钉住后字先保持静止
  （原样"BREAK"，不动），直到下面第二点触发才动。
- **动效**（左→右→左两趟）仍然要等电影院播完、`.home-cinema` 底边离开
  视口顶部才开始跑，落在"电影院之后 → View all"这一段——这条没变。

⚠ 这条来回改了三次，根因这次才真正定位到：
1. 最早钉住绑在 `.home-break-open` 顶部时，被判定为"远远地就吸附到 logo"
   的 bug，改成绑到 `.home-cinema` 顶部；
2. 但那样又不对——用户澄清本意是"像 Works 一样碰到 logo 就 pin"，改回
   `.home-break-open` 顶部；
3. 用户又反馈"有一次明显的跳变/闪烁"——这次真正找到根因：`.home-break-open`
   有 `padding-top: 280px`，字在里面又是 `position:absolute; top:0` 贴在
   `.break-intro` 顶边，也就是字的自然位置比 section 顶边低 280px。用
   `trigger: openSection, start: 'top top'` 时，触发那一刻字的自然位置其实
   还在屏幕下方约 280px 处，一下子被摁到 `top:68px`，凭空跳了约 212px——
   这才是"跳变"的真正原因，不是触发时机本身的问题。

**当前生效写法**：`trigger` 直接换成 `wordWrap`（字自己），
`start: 'top ${pinTopPx}px'`（即 `'top 68px'`）——触发条件变成"字的自然
顶边滚到屏幕 68px 处"，这一刻自然位置和钉住目标在数学上完全重合，
`position:fixed` 切换时零跳变，效果上等价于 Works 用的原生
`position:sticky`（BREAK 做不到用真 sticky，但把触发点算准了效果一致）。
实测验证：scrollY 6424 时自然 `rectTop=90`（未钉），scrollY 6558 时已钉住
在 `top:68px`，中间没有跳变，控制台无报错。**以后如果还要调这段，思路是
"触发点必须让自然位置和钉住目标重合"，不是简单换绑哪个 section。**

两趟（不是三趟）：左→右→左，逻辑照抄 `setupWorks()` 的 gatherX 算法、
power2.inOut、scale .2、LETTER_DELAY .06，终点停在**左边**（贴 `View all`），
不是右边。最终贴在 `View all` 上方 5px 一起划出画面（GAP 已从 10 改成 5）。

⚠ 吸顶手法和 Works 不同：Works 靠 `position: sticky`（`.home-works` 一个 section
就把轮播区整个包住，够用）；BREAK 的五字母中间隔着电影院/VR/装置图好几个独立
section，sticky 的 containing block 撑不了这么长，改用「进入区间时切
position:fixed 手动钉住，退出区间清空内联样式复原文档流」来模拟同样的吸顶效果。
钉住时的 `top` **直接复用 Works 的公式** `--works-sticky-top + --works-heading-offset
+ 10px`（=68px，桌面端固定值），不是按进入区间那一刻测到的位置现算。

⚠ **中途向右摆动的距离要和 Works 对齐**（用户点名"右边应该和 works 滚到右边哪里
对齐"）：根因是 `.break-sticky-word` 原本是 `.break-intro` 两栏 grid 里 42.9%
宽的第一个格子，够不到内容区真正的右边缘；Works 的字不在任何窄列里，铺的是
整行宽度。已在 CSS 里把 `.break-sticky-word` 桌面端改成 `position:absolute`
铺满 `.break-intro` 整行，`.home-break-open .break-lead` 相应显式钉在
`grid-column: 2`（因为它是 `.break-intro` 里唯一还在文档流里的格子，不显式
指定会被自动塞进第一格）。这条在改终点从右到左之后依然保留——终点变了，
但中途向右甩开的那一趟摆幅仍然要够到和 Works 一样远，观感才一致。

⚠ 实测验证：字母最终 `left` 和 `View all` 的 `left` 完全相等
（61.0 ≈ 60.8），字与 `View all` 的视觉间距收敛到个位数像素（约 10.6px 框对框，
换算成看得见的字形间距落在 5px 量级，和 Works 当年"10px 设置→17.6px 框差"
是同一种量法误差，不是 bug）。

⚠ 只在桌面端跑（`innerWidth >= 992`，同 Works）；窄屏 CSS 把 `.break-sticky-word`
写回 `position:static; justify-content:flex-start`，保持原来的静态左对齐、
不影响 `.break-lead` 的文档流位置。

### 空间装置底部的项目出口（刚完成）

最后一个空间装置 `THE NEW IDENTITY CARD` 图片之后、页脚之前，新增了与 Works 完全同款的 `View more` 箭头链接，右侧计数为 `( N6 )`；链接暂指向 Break 总览页。

### BREAK 项目间距（已锁定）

`ALONE IN KYOTO` → VR 的桌面端间距实测为 **200px**；VR → 空间装置 `THE NEW IDENTITY CARD` 已同步设为 **200px**。窄屏不套用这条固定间距。

同属 `ALONE IN KYOTO` 的电影院画面 → 下方项目标题字段，桌面端间距为 **60px**；仅覆盖 `.home-break-gallery` 的顶部留白，项目图片与后续项目不受影响。

`ALONE IN KYOTO` 的左侧人物/机器人图组与右侧大图仅作视觉下移 **40px**（`top: 40px`）；不参与文档流，因此标题字段、VR 起点和项目间距均不移动。

`ALONE IN KYOTO` 的项目说明现为「A self-directed world-building study in atmosphere and spatial narrative.」；保留既有的 Jaldi 17px、1.45 行高，和 Works 项目说明一致。

**WORKS + slogan + 卡片区（连同 Break/VR/Footer 等后续所有板块）整体上移了 150px**，
缩短和上面缩小视频的空白（用户要求"当一个整体上移"，不是只挪 WORKS 一个字）。

⚠⚠ **这条改了三版才对，中间第二版上线后一度把 WORKS 的吸顶动效弄坏了**
（用户发现后紧急要求修复），完整踩坑记录见 `PITFALLS.md`。**最终生效的做法**：

- `.works-sticky-word`（WORKS 字本身）：`margin-top` 减 150、`margin-bottom` 加回
  150（净位移不变，只挪它自己的初始位置）。
- `.works-intro`（slogan 所在的兄弟元素）：直接 `margin-top: -150px`。
  `.home-works` 有非零 `padding-top`，父子之间**不会**发生外边距塌陷，
  这条 margin 会正常参与文档流，把 `.works-grid` 和后面的 Break/VR/Footer
  一起带着上移。

⚠⚠ **`.home-works` 本身绝对不能加 `transform` 或看起来能达到同样效果的
`margin-top`，两条路都已验证走不通**：
1. 直接给 `.home-works` 加 `margin-top: -150px`——**无效**。它是 `.inner-world`
   的第一个子元素，`.inner-world` 自己有一条 JS 算出来的巨大负
   `margin-top`（抵消门洞 pin 高度，实测 -2115.92px），两者发生**外边距塌陷**，
   塌陷取更负的那个，`-150` 直接被吃掉。`overflow: clip` 挡不住这种塌陷
   （原以为能挡住，实测作废）。
2. 改用 `transform: translateY(-150px)` + `margin-bottom: -150px`——数值上是对的
   （间距缩短、内部关系不变、渐变没动），**但会让 `.works-sticky-word` 的
   `position: sticky` 整个失效**：祖先元素只要有 `transform`，就会给它建立
   新的 containing block，sticky 元素找不到"最近的滚动容器"，吸顶行为直接消失。
   **`position: sticky` 元素的任何祖先都不能有 transform，这条是硬规则。**

⚠ **黑色底图渐变（`--inner-surface`）没受影响**：它画在 `.inner-world`
自己身上，这两条 margin 都没碰 `.home-works`/`.inner-world` 本身，实测
`.inner-world` 的盒子位置和之前一致。

已验证（真实滚轮，多个滚动位置交叉验证）：`WORKS` 的吸顶效果**正常**——
滚动经过时 `getBoundingClientRect().top` 在多个不同 scrollY 下保持不变（钉住）；
往回滚会正确回到左聚拢起始状态（61/84/103/119/134）；`.works-intro`/slogan/
第一张卡的相对间距（WORKS-到-slogan 130、slogan-到-首卡 120）分毫不差；
`WORKS` 到视频底边的距离从 311.6 降到 **161.6**（精确 -150）；Break 段位置
也整体上移了；首屏门洞/大标题/渐变过渡视觉不变；控制台无报错。

### Works 段 `W O R K S` 动效

参考站 noth.in。整段行为：**初始位置**在左内容线（原 `Work` 标签已被它取代、
桌面端隐藏）→ 随滚动**来回三趟**（左聚拢→右→左→右），**每趟中途缩到 0.2 再回 1**
→ 第三趟停在右边 → 段尾贴到 `( N5 )` **上方 5px** 一起滑出画面。

⚠ 上面 Works slogan 出血之后，`W O R K S` 初始位置和 slogan 顶边**不再对齐**
（这是"顶边和 slogan 对齐"那次调整之后、这次出血之前才有的关系，现已打破，
没人要求维持）。

⚠ **实现细节和踩过的坑全写在代码注释里，改之前先读**：
`js/homepage-portal-scroll.js` 的 `setupWorks()`、
`css/homepage-portal.css` 的 `.works-sticky-word`（`justify-content: flex-end`
是**动效终点**不是版式；`--works-word-drop` 的算法；窄屏必须写回的两条）。

⚠ **窄屏（≤991px）不跑这套动效**，五字母静态铺开、`Work` 标签保留。**没在窄屏实测过。**

### 排版归并（四步已完成，都仍有效）

按与参考站 noth.in 的四维实测对照做，影响排序 ①大小写 ②行高 ③字重 ④字号：

- **字号**：五档写在 `:root`（`--t-display`/`--t-lead`/`--t-big`/`--t-body`/`--t-label`），
  写法 27 种 → 14 种。**以后写字号一律引用变量，不要写数字。**
- **行高**：正文档统一 1.45、大句子档统一 1.2，12 种 → 9 种。
- **大小写**：17px 正文档和 38.4px 大链接档已 100% 混排（句首大写）。
- **明度**：查完**决定不动**——文字层级本来就是干净的三档（实白/.62/.32）。**别再拿这维开工。**

⚠ **永远保持大写**：Bebas Neue 所有大字（无小写字形，改混排会掉后备字体）、
12px 标签全家（大写＝标签档）、`THE ART OF MZ` 与左上 logo、首屏 eyebrow、碎裂小字。

### 下一步（都要先问用户）

1. **24px 大句子档那四句长句仍是全大写**（首屏 slogan、Works slogan、
   `IMAGES HOLD A MOMENT…`、`A VR PIECE ABOUT…`）。这是大小写归并的最后一块，
   **会明显改变整站气质**。
2. **字重缺中间档**：`Jaldi` 只有 400/700，参考站一半层级靠 500 撑。该问的是
   「正文字族要不要换一个字重齐全的」（Manrope / Inter / Archivo，都没试过）。
   ⚠ 换字族＝全站每行字宽都变，Works 文字栏、导航对齐、VR 段「限死一屏」全要重测。
3. **`W O R K S` 动效起点**：初始位置下移后，动效在字母**还没吸顶时**就开始了
   （提前 154px，原来 22px）。参考站规格是「吸顶后才开始」。要对齐就把 `start` 后推，
   代价是三趟的滚动区间被压缩。

### 未验证 / 已知的账

- **Works 段只有 30fps**（那一段本来就有的）。嫌疑最大是 `W O R K S` 的
  `mix-blend-mode: difference` 整屏合成。**要治需单独立项**，
  且 PITFALLS [2026-09-07] 记着上次动 hero 把首页搞没了。
- **窄屏基本没实测**：首屏碎裂小字、`View all`、收起式导航、`W O R K S` 都没量过。
- **收起式导航真机触屏没测过**（CSS 通路验过，真实手指点击没有）。
- **VR 段「限死一屏」是硬约束**：改任何影响它高度的东西都要重测
  （`.vr-content` 高 = 视口高、`overflows: false`）。
- **站内不一致**：只有 Works 的 `View all` 换成箭头，BREAK 的 `VIEW MORE`
  和页脚链接仍是「红下划线 + 悬停变红」。要统一得单独开一次（用户知情）。
- **待压的视频**：首屏 `视频1.mp4` **54 MB**、电影院段那条 **24 MB**。
- 其余旧账：有道／网易互娱项目名仍是占位、「公司·职称」是浏览器合成的伪斜体、
  PARADOX 那格滑动幅度是 ±2.8% 不是 ±6%（取景所迫，改回去只需把 `top`
  从 −8.75% 收到 −5% 并删掉 `data-slide`）。

### ⚠ 三条会影响每次工作的铁律（完整版见 PITFALLS）

1. **验证滚动效果只能发真实滚轮事件。** 滚动被 Lenis 接管，`window.scrollTo`
   驱动不了它，用它量出来的全是假的。
2. **布局随滚动变化，不要用一个滚动位置的快照推算另一个位置的几何。**
   要哪一处的数就滚到那一处量；补偿之前先实测「现状是不是已经满足」。
3. **量动效要把整条 `transform` matrix 一起记**（位移／缩放／旋转），
   只记位置会把"过渡态"读成"终点"。而且要**滚到动效彻底停下**再下结论。

---

## Works 段：还没做的那一条

> 四条图带里 **第 1、2、4 条已完成**，形态和文字栏都已落地，看代码即可。
> 这里只留**第 3 条**的规格和四条共用的硬规则。

### 第 3 条（网易）没做，且不能照搬参考站

- **它是「一条带子里两个独立项目」**：`OPEN FIELD` 和 `FOLD MEMORY` 各要一栏完整文字，
  `Company` 都写网易，但算两个条目。用户原话"分为两个部分，左右文字分开，
  **是算两个项目虽然一个公司**"。
- **现状已经天然成立**：CSS 里 `nth-child(4)` 占 1–5 列、`nth-child(5)` 占 7–13 列，
  同在 `grid-row: 3` 左右并排。顺序不动这条就成立。
- ⚠ **参考站 #5 是三张图配一个项目**，我们是两张图配两个项目，数量和结构双重不匹配。
  且 #5 最窄那格比例约 0.48，现有 `4.2netease.jpg`（0.88）放进去要裁掉一半宽。
  **必须单独聊，不是照搬能解决的。**

### 四条共用的硬规则（仍然有效）

- **展示顺序不要改**：`PARADOX HEAVEN` → `NBA2K ONLINE` →
  `OPEN FIELD ｜ FOLD MEMORY` → `BUBBLE DELIVERY`。
- **图带高度恒定、缝宽统一**；文字栏放旁边还是放下面，**由图带占多宽决定**
  （占一半宽→旁边；半幅或满宽→下面）。缝宽一旦各不相同，"自由切割"就变成新的随意性。
- **文字栏四行、顺序锁死**：标签 → 项目名 → 公司·职称（灰色斜体）→ 项目简介。
  四条共用，不要为某一条另写版式。
- **自由度只留一个**：图带在左还是在右（四条交替，可含一条满宽）。
  每张卡的特例比例、额外内缩、自由跨列，全部删。
- ⚠ **单位用 `cqw` 不用 `vw`**：`vw` 含滚动条，实测内容宽是 **1399.2** 而不是 1414，差 15。

### 动效（以这里为准，旧记录已作废）

| | 动作 | 处理 |
|---|---|---|
| A | 整张卡跟着滚动上下漂（**外框在动**） | **删掉**。破坏对齐的元凶，规整感靠边框对齐建立 |
| B | 图片在框里上下走（**外框钉死**） | **保留**，用户唯一点名要留的 |

- 幅度统一 **框高的 ±6%**。⚠ 6% 是**选的不是量的**，参考站的图在框里根本不动，
  这个动作是本站自己的东西，用户看了效果可直接改这个数。
- ⚠ **卡片入场特效整条路线已被否**（淡入／擦入／逐格错开全部作废，
  见 PITFALLS [2026-09-09]）。**早期文档里"改成参考站那种淡入"那句作废。**
  重做前必须先问用户。
