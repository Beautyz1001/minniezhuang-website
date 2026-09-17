/* ===== HERO 门洞 — Three.js 版 =====

   ─────────────────────────────────────────────────────────────
   这一层现在负责两件事：

   ① 门洞里面 —— 透过洞看到的那个世界（暂时还是 background.png 那张图）
   ② 门洞外面 —— 脚下那块地，以及打在地上的光

   ②是这次新加的，也是这个文件存在的理由。

   以前地上那块光斑是**画上去的**：我告诉 CSS "在这儿画个梯形，往下张开这么多度"。
   那个张开的角度是手调的两个数字，跟镜头走了多远没有任何物理关系——
   所以往前推的时候，门在走、地却在自己扭，两件事不同步。

   现在反过来：地上什么都不画。
   门后面放一盏灯，门是墙上的一个洞，洞前面铺一块地。
   光从洞里漏出来，打在地上，光斑**自己就出现了**。
   门一动，光斑必然跟着动——因为它本来就是光算出来的。

   ─────────────────────────────────────────────────────────────
   最重要的一条纪律：**门洞的位置和比例必须和 CSS 版本一模一样。**

   做法不是"随便摆个相机然后祈祷门刚好落对"，而是反过来解：
     · 门洞该出现在屏幕的哪个矩形里 —— 直接读 homepage-portal.js 算好的那一帧
       （window.__heroScene），一个数字都不自己重算。
     · 相机的视角 —— 由那一帧的"镜头到门的距离"反推出来，
       让门所在的那个平面在屏幕上正好是 1 像素 = 1 单位。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const HERO = document.getElementById('hero');
const CANVAS = document.getElementById('portal-canvas');
if (HERO && CANVAS) init();

function init() {

  /* ==============================================================
     旋钮 —— 要调光就调这里，别去改下面的公式
     ==============================================================

     房间和人的尺寸是**固定的**，单位是"一个屏幕高"。
     为什么不用"门高"当尺子？因为这套动画里的门不是一扇正常的门——
     它从一道细缝长成一整面墙。要是把人的身高绑在门高上，
     人就会越走越矮，脚下那块地也跟着一起缩，看着就很怪。

     真实世界里的情况是：房间不动、人不动，只有人在往前走。
     所以下面这些数字全程不变，只有"镜头离门多远"在变。          */

  const TUNE = {
    EYE:      0.22,   // 眼睛离地多高
    ROOM:     1.10,   // 灯在墙后面多远（门里那个房间的进深）。
                      //   越远，从门里漏出来的那束光越收敛、越像走廊
    /* 灯离地多高。这个值是"门洞高度的百分之多少"，不是固定长度——
       因为决定光能铺多远的，是**灯和门洞上沿谁高谁低**：
         灯高过门洞上沿 → 光只能斜着射出一小块，很快就够不着地了
         灯略低于上沿   → 贴着上沿出去的那几道光几乎平行于地面，能铺到很远
       所以灯必须始终卡在门洞高度的八成左右，光池才会一路铺到脚下。 */
    LAMP_Y:   0.80,
    LAMP_DX:  0.000,  // 两盏灯完全同位，消除左右异色光带
    MARGIN:   1.30,   // 灯的张角比"刚好罩住门洞"再宽多少
    PENUMBRA: 0.10,   // 灯口本身的柔和程度（要小，光斑的形状该由门洞决定，不是灯口）
    DECAY:    1.55,   // 光随距离衰减多快（2 = 完全真实；小一点光才传得远）
    SOFT:     18,     // 光斑边缘化开的程度（模拟灯不是一个点，而是有大小的）。
                      //   调太大墙根会往两边渗出一条淡淡的横光
    /* 门后两盏灯只负责地面投射：一盏偏红紫、一盏偏冷紫，混出参考图的紫色光池。 */
    RED:      { color: '#C30750', power: 0.40 }, // 地面光 A：Figma Hex
    PURPLE:   { color: '#7a28ff', power: 0.25 }, // 地面光 B：Figma Hex
    /* 门内高亮在镜头/视网膜上的溢光。它不是另一盏灯，不参与照亮地面：
       是门洞这个极亮开口在空气和镜头里产生的 Bloom，所以只能往洞外扩散。 */
    /* 门口溢光。color 是贴着门洞那一圈（保持原来的洋红，不动）；
       mid / far 是它往外散开时逐渐转向的色——真实的散射本来就会随距离偏色，
       光越走越远，短波长散得越开，所以由洋红转紫、再转靛蓝，最后没入黑。
       farRange：过渡拉多长（相对 radius 的倍数）。 */
    BLOOM:    { color: '#A4004D', mid: '#5B2A9E', far: '#1B1A56',
                farRange: 2.6, core: 0.78, radius: 25, falloff: 1.55 },
    /* ---------- 门洞亮度（要调门洞亮不亮，就调这一个数）----------
       1.00 = 素材原样；1.35 比原来亮一档；数字越大越亮。
       它是一个纯粹的曝光乘数，**只作用在门内那一个平面上**：
       地面光池、门口辉光、雾、墙一概不受影响（那几样各有各的旋钮）。
       颜色不会被改——洋红 #C30750 这套配色原样保留。
       上限提醒：门内最亮处现在的红通道大约到 202/255，
       乘到 1.6 左右红色就会撞顶，再往上门内会先泛粉、再发白。
       实时试：控制台敲 __portal3D.set({ DOOR_BRIGHT: 1.5 }) */
    DOOR_BRIGHT: 1.35,
    /* ---------- 正面那面墙 ----------
       两盏灯都在墙**后面**，所以墙朝我们这一面一点直射光都吃不到，
       不补光它就是纯黑。BOUNCE 是地上那块光斑往回弹的光——物理上确实存在，
       它从地面往上擦着墙走，于是墙是**下亮上暗**。
       这个梯度方向和洞口轮廓无关，所以贴着门洞的那种对称亮圈（门框）
       在这个结构里长不出来。

       RELIEF 是墙面**真实的几何起伏**（不是法线贴图）：顶点真的被推出高低差，
       掠射的光会自己产生明暗、自己投出阴影。波长很长，所以没有可辨认的重复。
       洞口附近会自动压回平的——否则洞口的顶点一动，门洞的屏幕位置就不再和
       CSS 版 1:1 对齐了，那是锁死的东西。

       CASING（门套）和 BASE（踢脚线）的尺寸绑在**门高**上，不是绑在"一屏高"上。
       这是本文件唯一这样做的地方，和上面 EYE/ROOM 的规矩相反，理由：
       它们是门的一部分，不是房间的一部分。这扇门会从一道细缝长成一整面墙，
       门套必须跟着长——否则一开始门套比门还宽，最后又细到看不见。 */
    WALL: {
      /* 2026-09-04：整套「可见墙」被用户否掉（见 PITFALLS）。关掉之后画面回到
         加墙之前的样子——挡光的那四块板照旧工作，光池一丝没变。
         代码先留着，等换一种照明思路时再用；确定不要了就整段删。 */
      enabled: false,
      color:  '#241d28',                        // 墙的本色：很暗的冷灰紫
      relief: 0.030,                            // 起伏幅度（一屏高的百分之多少）
      stain:  0.90,                             // 污渍强度：0 是干净的新墙
      /* 地面反弹光。它离墙比两盏主灯近得多，按距离衰减一算，同样的 power
         会比主灯亮十几倍，所以这里的数字看着小是正常的。
         dist/y/aim 都以「一屏高」为单位：离墙多远、离地多高、打在墙上多高。 */
      bounce: { color: '#b83a72', power: 0.075, dist: 0.35, y: 0.18, aim: 0.02, angle: 0.62 },
      casing: { width: 0.075, depth: 0.030 },   // 门套：占门高的比例（宽 / 凸出多少）
      base:   { height: 0.055, depth: 0.020 }   // 踢脚线：占门高的比例（高 / 凸出多少）
    },
    /* ---------- 打散光路 ----------
       地上那条光路原本是一块干净的梯形。这里在门后的光路上放几片**看不见的**
       遮挡物（只挡光、不上色，而且它们的位置会被门内画面盖住，永远不会露脸），
       让那两盏灯为它们投出真实的阴影，把光路切成一段一段。
       这不是"画"上去的断续：阴影的位置、透视、虚实都是灯算出来的，
       所以门一动、光一摆，断口必然跟着变。
       count = 0 就回到原来那块干净的梯形。
       2026-09-04：用户要求光池里不要出现阴影，count 已置 0（见 PITFALLS）。
       下面几个参数保留，只是当前不生效。 */
    BREAKUP: {
      count:     0,      // 几片遮挡物（0 = 光池干净，无断口）
      spread:    0.62,   // 它们铺在门后房间进深的多大范围里
      thickness: 0.055,  // 每片多厚（占门洞高度的比例）——决定断口多宽
      cover:     0.55    // 每片挡住多少（0 = 不挡，1 = 整条光路都被切断）
    },
    GRAIN:    0.30,
    BUMP:     1.05,
    /* 门前雾：参考 Overworld 的低频噪声漂移；慢到更像空气在流动，而非粒子特效。 */
    /* scale：雾用多高的分辨率画。雾是一层最高只有 31% 浓度的低频软薄纱，
       没有任何需要逐像素分辨的细节，按整屏设备像素算纯属浪费——实测它的
       耗时和像素数严格成正比（1.0 时 33ms，0.5 时 8ms），是整帧最大的开销。
       画在一张小图上再放大回来，肉眼看不出差别，但帧率是几倍的差距。 */
    /* speed：雾内部纹理翻涌的快慢。drift：整团雾横向漂移多快，
       单位是「每秒挪多少个屏幕高」——0.03 约等于每秒 20 像素。
       drift 是和门洞大小脱钩的，所以首屏门很小的时候也看得出在飘。
       follow：滚动时雾的纹理跟着门跑多少。1 = 完全跟随（会像整团雾跟着滚动条走），
       0 = 完全不跟。雾的形状始终跟着门，这里只管纹理。 */
    FOG:      { color: '#a6adc5', density: 0.78, speed: 0.14, drift: 0.030,
                follow: 0.15, scale: 0.5 },
    /* 鼠标只牵引门后的投光。灯从门洞中心向外的射线会随之摆动，
       但相机和地面材质保持静止。 */
    LIGHT_SWAY: {
      enabled:  false, // 暂停鼠标追随；恢复时改为 true，不需重写投光逻辑
      distance: 0.1,  // 鼠标摆到两侧时，灯在门后横向摆多远
      reach:    0.42,  // 侧摆时额外往门后退多远；越大，侧面的光池越能往前铺
      follow:   2    // 鼠标追随速度：越大越跟手；越小越有惯性、回正越慢
    }
  };

  /* ---------- 素材 ---------- */
  const IMG_SRC = 'assets/homepage/background-clean.png';

  /* 地面材质。texture2 是第二版素材（asphalt_track）。
     三张图都做过处理，别直接用原始 PNG：
       颜色 / 粗糙度 → 转成了 JPG（12.7 MB 一共压到 2.3 MB）
       法线         → 做了两道处理，所以文件名是 _nor_gl_flat_：
                      ① 原始文件是 DX 版本，绿通道方向和 WebGL 相反，已离线取反
                      ② 原图整体有一个极轻微的"倾斜"（绿通道从上到下 130→125）。
                         一张图平铺几十遍，每块的倾斜方向都一样、到边界又突然重来，
                         在几乎平行于地面的光照下就变成一条条横纹。
                         已经把这个大尺度分量减掉（高通），只留下颗粒本身。
                         **换新素材时这一步大概率还要再做一次。**
     换素材时如果拿到的还是 _nor_dx_，要么同样离线取反，
     要么把 normalScale 的 y 设成负数——否则地面的凹凸会整个反过来
     （坑看着像包）。 */
  const TEX_DIR = 'assets/homepage/texture/texture2/';
  const TEX = {
    map:          'asphalt_track_diff_1k.jpg',
    normalMap:    'asphalt_track_nor_gl_flat_1k.png',
    roughnessMap: 'asphalt_track_rough_1k.jpg'
  };

  /* 画面是否需要重画。静止时不重画，省电。 */
  let needsDraw = true;

  /* ---------- 光束转向 ----------
     不移动相机或地面，只让门后的灯以门洞中心为支点左右摆动。 */
  const lightAim = { targetX: 0, x: 0, lastTime: performance.now() };
  const setLightTarget = event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const rect = HERO.getBoundingClientRect();
    lightAim.targetX = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    needsDraw = true;
  };
  HERO.addEventListener('pointermove', setLightTarget, { passive: true });
  HERO.addEventListener('pointerleave', () => {
    lightAim.targetX = 0;
    needsDraw = true;
  }, { passive: true });

  function updateLightAim(door) {
    if (!TUNE.LIGHT_SWAY.enabled) {
      const wasMoving = Math.abs(lightAim.x) > 0.00002;
      lightAim.targetX = 0;
      lightAim.x = 0;
      return wasMoving;
    }
    const now = performance.now();
    const dt = Math.min((now - lightAim.lastTime) / 1000, 0.05);
    lightAim.lastTime = now;
    /* 靠近门时逐渐收回，避免贴近门口时光束显得像在被鼠标拖拽。 */
    const presence = 1 - THREE.MathUtils.smoothstep(door.w / 100, 0.18, 0.80);
    const follow = 1 - Math.exp(-TUNE.LIGHT_SWAY.follow * dt);
    const beforeX = lightAim.x;
    lightAim.x += (lightAim.targetX * presence - lightAim.x) * follow;
    return Math.abs(lightAim.x - beforeX) > 0.00002;
  }


  /* ==============================================================
     渲染器
     ==============================================================
     背景透明：canvas 只画门洞和地上的光，黑紫背景仍然由 CSS 负责。 */

  const renderer = new THREE.WebGLRenderer({
    canvas: CANVAS,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;                 // 清屏和裁切都要自己控制
  renderer.shadowMap.enabled = true;
  /* 投影不自动每帧重算，改由主循环在门或灯真的动了时手动点名重算（见 drawOnce）。 */
  renderer.shadowMap.autoUpdate = false;
  /* 阴影边缘要柔。现实里灯不是一个数学点、是有大小的，所以光斑边缘一定有半影；
     边一硬就像贴了张彩色纸。
     （试过 VSM，它糊得更漂亮，但在墙根那种"墙和地几乎贴在一起"的地方会漏光，
       漏出一条一像素宽的亮线横穿整个屏幕。PCF 糊得稍差，但干净。） */
  renderer.shadowMap.type = THREE.PCFShadowMap;

  /* 只供雾读取：复制已经画好的 canvas 光线，不改变门、辉光或地面的渲染路径。 */
  const fogLightFrame = new THREE.FramebufferTexture(1, 1);
  const loader = new THREE.TextureLoader();
  const redraw = () => { needsDraw = true; };



  /* ==============================================================
     门洞里面
     ============================================================== */

  const inside = new THREE.Scene();

  /* 这台相机负责门洞里面。视角每帧由 camDepth 反推（见 syncCamera）。 */
  const camIn = new THREE.PerspectiveCamera(50, 1, 1, 200000);

  let imgAspect = 1440 / 652;                 // 加载完才知道真值，先兜底
  const worldTex = loader.load(IMG_SRC, t => {
    imgAspect = t.image.width / t.image.height;
    redraw();
  });
  worldTex.colorSpace = THREE.SRGBColorSpace;

  /* 门内世界使用清掉人影的背景底片。粉紫只在 GPU 渲染时覆在这一个平面上：
     不碰门外 Bloom、地面或两盏投射灯。 */
  const worldColorUniforms = {
    // 这是直接色值；以后可以把 Figma 的 Hex 色号粘贴到这里。
    uPinkPurple: { value: new THREE.Color('#C30750') },
    uColorMix:   { value: 0 },
    /* 门内曝光。乘在转成 sRGB **之前**的线性亮度上，所以它是"多给多少光"，
       不是"把颜色调浅"——亮部先冲上去、暗部跟着抬一点，读起来是灯更亮，
       而不是整块贴纸被刷白。值由 TUNE.DOOR_BRIGHT 给。 */
    uExposure:   { value: TUNE.DOOR_BRIGHT }
  };
  const worldMaterial = new THREE.MeshBasicMaterial({ map: worldTex, toneMapped: false });
  worldMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, worldColorUniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform vec3 uPinkPurple;
       uniform float uColorMix;
       uniform float uExposure;
       void main() {`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <colorspace_fragment>',
      `float worldValue = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
       vec3 purpleWorld = uPinkPurple * min(worldValue * 1.3 + 0.040, 1.0);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, purpleWorld, uColorMix);
       gl_FragColor.rgb *= uExposure;
       #include <colorspace_fragment>`
    );
  };
  const worldPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    worldMaterial
  );
  inside.add(worldPlane);

  /* ==============================================================
     门口溢光（Bloom）
     ==============================================================
     这不是一圈画出来的门框。它以门洞四条边为唯一光源，只计算门洞**外侧**
     到边缘的距离：刚离开门洞最亮，随后按距离衰减；洞内完全不叠加，仍由
     门内世界本身负责发光。这样门缩放/移动时，溢光和四条边必定 1:1 咬合。 */
  const bloomScene = new THREE.Scene();
  const bloomCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bloomUniforms = {
    uRect:    { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, // center x/y, half width/height（屏幕比例）
    uColor:   { value: new THREE.Color(TUNE.BLOOM.color) },
    uMid:     { value: new THREE.Color(TUNE.BLOOM.mid) },
    uFar:     { value: new THREE.Color(TUNE.BLOOM.far) },
    uFarRange:{ value: TUNE.BLOOM.farRange },
    uCore:    { value: TUNE.BLOOM.core },
    uRadius:  { value: TUNE.BLOOM.radius },
    uFalloff: { value: TUNE.BLOOM.falloff },
    uSize:    { value: new THREE.Vector2(1, 1) },
    /* 与地面光池共用 lightAim.x；只移动辉光的颜色密度，不移动门洞边界。 */
    uColorOffset: { value: 0 }
  };
  const bloomMaterial = new THREE.ShaderMaterial({
    uniforms: bloomUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform vec4 uRect;
      uniform vec3 uColor, uMid, uFar;
      uniform float uCore, uRadius, uFalloff, uFarRange;
      uniform vec2 uSize;
      uniform float uColorOffset;
      void main(){
        vec2 p = vUv - uRect.xy;
        vec2 q = abs(p) - uRect.zw;
        /* q 的正值部分就是洞外；洞内不产生 Bloom。以像素计算距离，
           横竖屏下的光晕厚度才一致。 */
        float outside = max(q.x, q.y);
        if (outside <= 0.0) discard;
        vec2 dxy = max(q, 0.0) * uSize;
        float d = length(dxy);
        /* 只保留贴住门洞边缘的一层短、软衰减；不再使用会在门外汇成
           竖向光团的长尾。 */
        float edgeGlow = exp(-pow(d / max(uRadius, 0.001), 1.45));
        /* 色彩仍可与地面光池作极轻微的同向响应，但它被 edgeGlow
           限制在门框附近，绝不会形成独立光团。 */
        float colorCenter = uColorOffset * uRect.z * 0.92;
        float colorDensity = exp(-pow((p.x - colorCenter) / max(uRect.z * 2.8, 0.002), 2.0));
        float glow = uCore * edgeGlow * (0.94 + 0.10 * colorDensity);
        /* 溢光越往外走，颜色越偏冷：洋红 → 紫 → 靛蓝。
           贴着门洞那一圈仍是原来的洋红，一点没动；只有散开的部分变色。 */
        float t = clamp(d / max(uRadius * uFarRange, 0.001), 0.0, 1.0);
        vec3 tint = mix(uColor, uMid, smoothstep(0.00, 0.55, t));
        tint      = mix(tint,   uFar, smoothstep(0.42, 1.00, t));
        gl_FragColor = vec4(tint * glow, glow);
      }`
  });
  bloomScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bloomMaterial));

  /* ==============================================================
     门前静态雾

     这层使用与门洞完全相同的 renderer / canvas；它在门和地面绘制完成后
     才叠上去，文字仍在 canvas 外的 z-index: 6，所以始终处于雾前。
     画面外部的像素会直接 discard，绝不会形成一张压暗光影的整屏蒙版。
     ============================================================== */
  const fogScene = new THREE.Scene();
  const fogCopyOrigin = new THREE.Vector2(0, 0);
  /* 雾纹理的参照尺寸：页面在顶端时的门洞。见 syncFog。 */
  const fogAnchor = { x: 0.5, y: 0.5, w: 0.02, h: 0.05, ready: false };
  const fogUniforms = {
    tLight:   { value: fogLightFrame },
    uDoor:    { value: new THREE.Vector4(0.5, 0.5, 0.02, 0.05) },
    /* 被压过的门洞尺寸，只给雾的纹理用（见 fragmentShader 里的注释）。 */
    uTexRef:  { value: new THREE.Vector4(0.5, 0.5, 0.02, 0.05) },
    uColor:   { value: new THREE.Color(TUNE.FOG.color) },
    uDensity: { value: TUNE.FOG.density },
    /* 雾属于门前空气；镜头接近门洞时，沿用 Hero 已有的淡出节奏退出。 */
    uOpacity: { value: 1 },
    uFarPresence: { value: 1 },
    uTime:    { value: 0 },
    uSpeed:   { value: TUNE.FOG.speed },
    uDrift:   { value: TUNE.FOG.drift },
    uAspect:  { value: 1 }
  };
  const fogMaterial = new THREE.ShaderMaterial({
    uniforms: fogUniforms,
    transparent: true,
    /* 雾先画进一张自己的小图（fogRT），那张图是空的、雾是上面唯一的东西，
       所以这里不能再混色：混色会把 alpha 乘两遍，雾会凭空变淡。
       真正和画面叠加发生在下面的合成步骤里。 */
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tLight;
      uniform vec4 uDoor;
      uniform vec3 uColor;
      uniform vec4 uTexRef;
      uniform float uDensity, uOpacity, uFarPresence, uTime, uSpeed, uAspect, uDrift;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p){
        float n = 0.0, a = 0.56;
        for(int i = 0; i < 5; i++) { n += a * noise(p); p = p * 2.02 + 13.7; a *= 0.5; }
        return n;
      }
      /* 连续密度场：没有圆形粒子或格子轮廓。低频承载整片空气，中频风场
         把它卷曲、折叠，高频只侵蚀边界，因此读起来是雾而非一颗颗烟团。 */
      float fogVolume(vec2 p, float time){
        vec2 slowWind = vec2(-time * 0.19, time * 0.065);
        float carrier = fbm(p * 0.46 + slowWind);
        vec2 curl = vec2(
          fbm(p * 0.31 + vec2(time * 0.13, 2.7)),
          fbm(p * 0.31 + vec2(5.1, -time * 0.11))
        ) - 0.5;
        vec2 folded = p + curl * 1.35;
        float body = fbm(folded * 0.92 + slowWind * 1.6);
        float erosion = fbm(folded * 2.10 + vec2(-time * 0.33, time * 0.18));
        float density = carrier * 0.40 + body * 0.60 - (erosion - 0.5) * 0.24;
        return smoothstep(0.35, 0.69, density);
      }
      float lightRay(vec2 uv, vec2 source){
        vec2 ray = uv - source;
        float energy = 0.0;
        for(int i = 0; i < 6; i++){
          float stepT = (float(i) + 0.5) / 6.0;
          vec3 sampleLight = texture2D(tLight, source + ray * stepT).rgb;
          float sampleLum = dot(sampleLight, vec3(0.2126, 0.7152, 0.0722));
          energy += sampleLum * (1.0 - stepT);
        }
        return energy / 6.0;
      }
      void main(){
        vec3 transmittedLight = texture2D(tLight, vUv).rgb;
        vec2 p = (vUv - uDoor.xy) * vec2(uAspect, 1.0);
        float w = max(uDoor.z * uAspect, 0.012);
        float h = max(uDoor.w, 0.018);
        /* 两团尺度不同的空气相交：中心贴着门，较低的一团向观者铺开。 */
        float nearDoor = exp(-dot(p / vec2(w * 5.6, h * 3.9), p / vec2(w * 5.6, h * 3.9)));
        /* 地面方向：vUv 的 y 向上，因此 + 才是门洞下方。 */
        vec2 lowP = p + vec2(0.0, h * 0.70);
        float nearGround = exp(-dot(lowP / vec2(w * 13.5, h * 3.8), lowP / vec2(w * 13.5, h * 3.8)));
        float shape = nearDoor * 0.50 + nearGround * 0.38;

        /* 到此为止的都是雾的**形状**（哪里浓、哪里淡），它该跟着门走。
           下面开始是雾的**纹理**，它不该。门会从一道细缝长成整面墙，
           纹理坐标若也除以门宽，噪声图案会被拉伸几十倍——看上去就是
           整团雾跟着滚动条一起跑。uTexRef 是一份被压过的门洞尺寸，
           跟随程度由 TUNE.FOG.follow 决定；页面在顶端时它和 uDoor 完全相等，
           所以首屏的雾和以前一模一样，只有滚动过程中才会分开。 */
        vec2  pT   = (vUv - uTexRef.xy) * vec2(uAspect, 1.0);
        float wT   = max(uTexRef.z * uAspect, 0.012);
        float hT   = max(uTexRef.w, 0.018);
        vec2  lowT = pT + vec2(0.0, hT * 0.70);
        vec2 driftA = vec2(uTime * uSpeed, -uTime * uSpeed * 0.32);
        vec2 driftB = vec2(-uTime * uSpeed * 0.21, uTime * uSpeed * 0.57);
        vec2 warp = vec2(
          fbm(pT * vec2(1.70, 1.15) + driftB),
          fbm(pT * vec2(1.05, 1.95) - driftA)
        ) - 0.5;
        float detail = fbm(pT * vec2(3.00, 5.50) + warp * 0.82 + driftA * 1.35 + vec2(4.1, 7.3));
        /* 云团整体漂移。原来它只靠 fogVolume 内部那点风，而那点风是在
           「以门洞当尺子」的坐标里算的——门在首屏只有 21 像素，换算下来
           云团每秒才挪 3 像素，肉眼根本看不出来在动。
           这里先在屏幕坐标里推一段再换算，漂移速度就和门的大小无关了。 */
        vec2 pDrift = pT + vec2(uTime * uDrift, uTime * uDrift * -0.28);
        vec2 doorVolumeP = pDrift / vec2(wT * 5.1, hT * 4.0);
        float volume = fogVolume(doorVolumeP, uTime * uSpeed);
        float edgeErode = smoothstep(0.32, 0.72, detail);
        float baseCloud = shape * volume * mix(0.72, 1.0, edgeErode);

        /* 地面上：更宽的雾幕沿光池方向缓慢掠过。 */
        vec2 groundP = (lowT + vec2(uTime * uDrift * 0.72, 0.0)) / vec2(wT * 8.6, hT * 4.4);
        float groundVolume = fogVolume(groundP + vec2(3.8, -1.6), uTime * uSpeed * 0.88);
        float groundVeil = nearGround * groundVolume;

        /* 近景自动压低两股可读的运动，但不移除基础空气感。 */
        float motionFade = mix(0.18, 1.0, uFarPresence);
        float luminance = dot(transmittedLight, vec3(0.2126, 0.7152, 0.0722));
        /* 只读取已经存在的门内、Bloom 与地面光。沿光线回采样得到极弱的
           丁达尔散射，不凭空画一束灯，也不改变任何光的方向或颜色。 */
        float rayLight = lightRay(vUv, uDoor.xy);
        float scattering = smoothstep(0.006, 0.20, max(luminance, rayLight * 0.58));

        /* 只在光穿过的位置增强，不给整张画面加白雾。 */
        /* 基础空气保持很薄；真正可读的流动只在门光与地面光经过的位置出现。 */
        float fogAmount = baseCloud * 0.48 + groundVeil * 0.54 * motionFade;
        float alpha = fogAmount * uDensity * uOpacity;
        if (alpha < 0.003) discard;

        /* 暗处是有质感的冷灰体积，光穿过时才轻轻提亮。alpha 本身会让缓慢
           漂过的浓雾短暂遮住三类既有光源，散开后又自然露出。 */
        float fogAlpha = min(alpha * mix(0.42, 1.42, scattering), 0.31);
        vec3 fogColor = mix(uColor * 0.82, transmittedLight * 0.72 + uColor * 0.44, scattering);
        gl_FragColor = vec4(fogColor, fogAlpha);
      }`
  });
  fogScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fogMaterial));

  /* ---------- 雾的降分辨率画布 ----------
     雾按 TUNE.FOG.scale 的比例画进这张小图，再等比放大盖回主画面。
     线性过滤负责放大时的平滑；雾本身是低频软噪声，放大后与原分辨率
     肉眼无差。深度/模板缓冲都不需要——雾是最后一层，不参与前后遮挡。 */
  const fogRT = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer:   false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });

  /* 合成：把那张小图原样贴回画面。这里才做真正的透明叠加。
     只做一次纹理取样，不加任何颜色处理，保证和以前逐像素直接画的结果一致。 */
  const fogComposite = new THREE.Scene();
  const fogCompositeMaterial = new THREE.ShaderMaterial({
    uniforms: { tFog: { value: fogRT.texture } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D tFog;
      void main(){ gl_FragColor = texture2D(tFog, vUv); }`
  });
  fogComposite.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fogCompositeMaterial));

  /* ---------- 「上一帧的画面」还原 ----------
     门和灯没动时，地面光、门内、辉光算出来的结果和上一帧逐像素相同，重画纯属白烧
     （地面光一项就要 ~10ms）。fogLightFrame 里存的正好是「加雾之前」的整张画面，
     直接贴回来即可。它是从画布本身拷下来的，格式、颜色、透明度都和画布一致，
     贴回去是像素级还原——不经过任何颜色空间换算，因此门的观感一丝不会变。 */
  const sceneRestore = new THREE.Scene();
  const sceneRestoreMaterial = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: fogLightFrame } },
    blending: THREE.NoBlending,   // 整张覆盖，连透明度一起还原
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D tScene;
      void main(){ gl_FragColor = texture2D(tScene, vUv); }`
  });
  sceneRestore.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneRestoreMaterial));


  /* ==============================================================
     门洞外面：地 + 墙 + 两盏灯
     ============================================================== */

  const outside = new THREE.Scene();

  /* 这台相机和上面那台在同一个位置、同一个视角，
     唯一的差别是画面整体上下挪了一点点（见 syncFloorCamera 里的"地平线"）。
     为什么要挪：CSS 那扇门是**悬在屏幕偏上方**的，
     而一块真实的地面，它的地平线必须比门槛更高——否则那就不是地，是天花板。
     挪画面（而不是把相机转过去）能让所有竖线保持竖直，
     跟建筑摄影的移轴镜头是同一个道理。 */
  const camOut = new THREE.PerspectiveCamera(50, 1, 1, 200000);

  /* ---------- 地 ---------- */
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  floorGeo.rotateX(-Math.PI / 2);             // 立着的面放倒，变成地板

  const asphalt = {
    map:          loader.load(TEX_DIR + TEX.map, redraw),
    normalMap:    loader.load(TEX_DIR + TEX.normalMap, redraw),
    roughnessMap: loader.load(TEX_DIR + TEX.roughnessMap, redraw)
  };
  const asphaltTextures = Object.values(asphalt);
  asphalt.map.colorSpace = THREE.SRGBColorSpace;
  for (const t of asphaltTextures) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  /* 只有被光照到的地面才存在——具体怎么做的见下面 onBeforeCompile 里的注释 */
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
    ...asphalt,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  }));

  /* ---------- 打散平铺 ----------
     一张 1 米见方的柏油图铺满整条路，会平铺几十遍，
     人眼对"同一块图案重复出现"极其敏感，一眼就看出是贴图。

     做法：同一张图**采样两次**——第二次转个角度、换个比例、挪个位置——
     再用一张很缓慢起伏的噪声决定每个点更偏向哪一层。
     两层各自的重复周期不一样，叠在一起之后的周期长到看不出来了。
     代价是细节被轻微地"揉"了一下，但地面本来就该是脏的。 */
  const DETILE = `
    float dtHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float dtNoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(dtHash(i), dtHash(i + vec2(1.0, 0.0)), u.x),
                 mix(dtHash(i + vec2(0.0, 1.0)), dtHash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    const float DT_ANG = 1.13;                 // 第二层转多少弧度
    vec2 dtRot(vec2 p, float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c) * p; }
    vec2 dtUvB(vec2 uv){ return dtRot(uv * 0.71, DT_ANG) + vec2(0.37, 0.61); }
    float dtBlend(vec2 uv){ return smoothstep(0.32, 0.68, dtNoise(uv * 0.27)); }

    vec4 dtSample(sampler2D t, vec2 uv){
      return mix(texture2D(t, uv), texture2D(t, dtUvB(uv)), dtBlend(uv));
    }
    // 法线要特殊处理：第二层整张图转过 DT_ANG，它记录的凹凸方向也得跟着转
    vec4 dtSampleN(sampler2D t, vec2 uv){
      vec3 a = texture2D(t, uv).xyz * 2.0 - 1.0;
      vec3 b = texture2D(t, dtUvB(uv)).xyz * 2.0 - 1.0;
      b.xy = dtRot(b.xy, DT_ANG);
      vec3 n = normalize(mix(a, b, dtBlend(uv)));
      return vec4(n * 0.5 + 0.5, 1.0);
    }
  `;

  floor.material.onBeforeCompile = shader => {
    let f = DETILE + shader.fragmentShader;

    f = f.replace(/texture2D\(\s*map,\s*vMapUv\s*\)/g,                     'dtSample( map, vMapUv )');
    f = f.replace(/texture2D\(\s*roughnessMap,\s*vRoughnessMapUv\s*\)/g,   'dtSample( roughnessMap, vRoughnessMapUv )');
    f = f.replace(/texture2D\(\s*normalMap,\s*vNormalMapUv\s*\)/g,         'dtSampleN( normalMap, vNormalMapUv )');

    /* 这块地要能"只在被照亮的地方存在"，暗处必须让底下 CSS 的黑紫背景透出来。
       做法：把每个像素的**亮度**直接拿来当它的不透明度。
         全黑（没被照到） → 完全透明 → 看到的是网页背景
         很亮（光斑中心） → 不透明   → 看到的是被照亮的柏油路
       中间是平滑过渡，所以光斑边缘会自然而然地化开，不需要任何羽化参数。

       （试过"叠加混合"，不行：浏览器合成一张透明画布时，
         会把完全透明处的颜色一并丢掉，光斑整个消失。） */
    f = f.replace(
      '#include <colorspace_fragment>',
      `#include <colorspace_fragment>
       float lum = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
       gl_FragColor.a = clamp(lum, 0.0, 1.0);`
    );

    shader.fragmentShader = f;
  };
  floor.material.normalScale.set(TUNE.BUMP, TUNE.BUMP);
  floor.receiveShadow = true;
  outside.add(floor);

  /* ---------- 墙 ----------
     四块板拼出"一整面墙中间缺一个矩形"。它首要的作用仍然是**挡光**：
     光打在墙上过不去，只能从洞里漏出来，地上那块光斑因此天然就是门洞的形状。
     （以前它是完全看不见的 colorWrite:false，只挡光不上色；现在它同时也是
       一个真实的受光表面——见 TUNE.WALL 的注释。） */

  /* 墙面用到的噪声。和雾用的是同一套手法：低频、无重复周期。
     它只决定「哪里凹、哪里脏」，不参与算光——光是灯真的照出来的。 */
  const WALL_NOISE = `
    float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float wNoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
                 mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float wFbm(vec2 p){
      float n = 0.0, a = 0.55;
      for (int i = 0; i < 4; i++) { n += a * wNoise(p); p = p * 2.03 + 7.3; a *= 0.5; }
      return n;
    }
    /* 墙面的高度场。波长以「一屏高」为单位，所以窗口变了起伏比例不变。 */
    float wallHeight(vec2 wp, float unit){
      vec2 q = wp / unit;
      return (wFbm(q * 1.45) - 0.5) + (wFbm(q * 3.30) - 0.5) * 0.42;
    }
    /* 洞口附近把起伏压回 0。门洞的屏幕位置和 CSS 版 1:1 对齐是锁死的，
       洞口的顶点一旦被推动，投影出来的位置就会偏。
       顺带也符合现实：洞口那一圈本来就是做过找平的。 */
    float wallFlat(vec2 wp, vec4 door){
      vec2 c  = vec2(door.x + door.y, door.z + door.w) * 0.5;
      vec2 hs = vec2(door.y - door.x, door.w - door.z) * 0.5;
      vec2 d  = (abs(wp - c) - hs) / max(hs.y, 1.0);
      return smoothstep(0.0, 1.30, max(d.x, d.y));
    }
  `;

  /* 墙、门套、踢脚线共用的参数。 */
  const wallUniforms = {
    uDoorRect: { value: new THREE.Vector4(0, 0, 0, 0) },  // 门洞 l, r, b, t（世界坐标）
    uUnit:     { value: 1 },                              // 一屏高
    uFloorY:   { value: 0 },                              // 地面高度
    uRelief:   { value: TUNE.WALL.relief },
    uStain:    { value: TUNE.WALL.stain }
  };

  /* relief=true 的那份会真的推动顶点；门套和踢脚线是规整的构件，不推。 */
  function makeWallMaterial(relief) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(TUNE.WALL.color),
      roughness: 1,
      metalness: 0,
      /* 和地面同一套：没被照到的地方自动透明，透出底下 CSS 的黑紫背景。
         墙因此没有可见的边界，自己化进黑里，不需要任何羽化参数。 */
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    m.shadowSide = THREE.DoubleSide;
    m.customProgramCacheKey = () => (relief ? 'wall-relief' : 'wall-trim');
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, wallUniforms);

      let v = shader.vertexShader;
      v = v.replace('void main() {', `
        uniform vec4 uDoorRect;
        uniform float uUnit, uRelief;
        varying vec3 vWallWorld;
        ${WALL_NOISE}
        void main() {`);

      /* 顶点真的被推出高低差。法线由高度场的斜率解析求出——
         这不是法线贴图：几何体本身动了，所以它会在阴影贴图里真的挡住自己。 */
      v = v.replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        vec4 wWorld4 = modelMatrix * vec4(position, 1.0);
        vWallWorld = wWorld4.xyz;
        ${relief ? `
        float wAmp = uRelief * uUnit;
        float wE   = uUnit * 0.03;
        #define WH(o) (wallHeight(wWorld4.xy + (o), uUnit) * wAmp * wallFlat(wWorld4.xy + (o), uDoorRect))
        float wH  = WH(vec2(0.0));
        float wHx = WH(vec2(wE, 0.0)) - WH(vec2(-wE, 0.0));
        float wHy = WH(vec2(0.0, wE)) - WH(vec2(0.0, -wE));
        vec3 wN = normalize(vec3(-wHx / (2.0 * wE), -wHy / (2.0 * wE), 1.0));
        /* 四块板各自被拉伸成不同的长宽，法线要按拉伸倍数反向补偿，
           经过 normalMatrix 之后才是我们要的那个世界方向。 */
        objectNormal = normalize(vec3(wN.x * length(modelMatrix[0].xyz),
                                      wN.y * length(modelMatrix[1].xyz),
                                      wN.z));
        ` : ''}
      `);
      if (relief) {
        /* 板子没有旋转、z 方向也没有缩放，所以局部 z 位移就是世界 z 位移。 */
        v = v.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.z += wH;
        `);
      }
      shader.vertexShader = v;

      let f = shader.fragmentShader;
      f = f.replace('void main() {', `
        uniform float uUnit, uFloorY, uStain;
        varying vec3 vWallWorld;
        ${WALL_NOISE}
        void main() {`);

      /* 脏。不是"算质感"，只是决定**哪一块更脏**——大块、软边、没有可辨认的图案。
         真实的墙脏得极不均匀：墙根一路往上洇，中间大片是干净的。
         均匀铺满的细节一定假，这是"贴图感"的根源之一。 */
      f = f.replace('#include <map_fragment>', `
        #include <map_fragment>
        vec2 wq = vWallWorld.xy / uUnit;
        float wStain = smoothstep(0.30, 0.86, wFbm(wq * 0.85));
        float wLow   = 1.0 - smoothstep(0.0, 0.62, (vWallWorld.y - uFloorY) / uUnit);
        float wDirt  = clamp(wStain * 0.62 + wLow * wLow * 0.75, 0.0, 1.0) * uStain;
        diffuseColor.rgb *= mix(1.0, 0.30, wDirt);
      `);
      /* 脏的地方更粗糙一点，掠射的光扫过去时会跟着变化。 */
      f = f.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - wDirt * 0.18, 0.35, 1.0);
      `);
      f = f.replace('#include <colorspace_fragment>', `
        #include <colorspace_fragment>
        float wLum = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
        gl_FragColor.a = clamp(wLum, 0.0, 1.0);
      `);
      shader.fragmentShader = f;
    };
    return m;
  }

  const wallMat = makeWallMaterial(true);
  const trimMat = makeWallMaterial(false);

  /* 墙拆成两层，这是性能上必须的分工：

     ① 挡光层：看不见的四块板，只负责投影。和改造前完全一样，
        所以地上那块光斑的形状一丝没变。
     ② 可见层：密网格，被推出真实起伏，只管好看，**不投影**。

     为什么必须拆：three.js 画阴影时用的是另一套简化材质，**不会**执行下面那段
     顶点位移。也就是说可见层那 13 万个三角形投出来的影子，和一块平板投出来的
     完全一样——却要让三盏灯各算一遍。实测这一项就要 30ms，买到的是零。
     代价是墙面的起伏不会自己给自己投影；它的立体感来自真实的法线和真实的
     轮廓位移（几何体确实动了），不来自自投影。门套和踢脚线是低面数的盒子，
     它们照常投影——那才是真正看得见的那条影子。 */
  const wallParts = [];                                   // ① 挡光层
  const wallSkin  = [];                                   // ② 可见层
  const blockerMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,        // 只投影，不参与画面，也不能挡住可见层
    side: THREE.DoubleSide
  });
  const wallGeo = new THREE.PlaneGeometry(1, 1, 128, 128);
  for (let i = 0; i < 4; i++) {
    const blocker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blockerMat);
    blocker.castShadow = true;
    blocker.material.shadowSide = THREE.DoubleSide;
    wallParts.push(blocker);
    outside.add(blocker);

    const skin = new THREE.Mesh(wallGeo, wallMat);
    skin.castShadow = false;
    skin.receiveShadow = true;
    wallSkin.push(skin);
    outside.add(skin);
  }

  /* ---------- 门套 / 踢脚线 ----------
     真的立体构件，不是画上去的一圈边。它们从墙面朝镜头凸出来，
     被地面反弹的光擦亮朝下那一面，再往墙上投出真实的影子——
     这条影子是法线贴图永远做不出来的东西。
     门套只有左、右、上三根：门槛就在地面上，底下没有线脚。 */
  const trimGeo = new THREE.BoxGeometry(1, 1, 1);
  const makeTrim = () => {
    const m = new THREE.Mesh(trimGeo, trimMat);
    m.castShadow = true;
    m.receiveShadow = true;
    outside.add(m);
    return m;
  };
  const casingParts = [makeTrim(), makeTrim(), makeTrim()];   // 左、右、上
  const baseParts   = [makeTrim(), makeTrim()];               // 门左边、门右边

  /* ---------- 地面反弹光 ----------
     地上那块光斑会把光弹回墙上。它贴着地面、从前方朝墙照，
     所以墙是下亮上暗，而且门套和踢脚线会被它从下往上打亮、往上投影。 */
  const bounce = new THREE.SpotLight(TUNE.WALL.bounce.color, 1, 0, 0.9, 0.9, 1.2);
  bounce.castShadow = true;
  bounce.shadow.mapSize.set(1024, 1024);       // 很柔的光，不需要高分辨率
  bounce.shadow.radius = 6;
  bounce.shadow.blurSamples = 12;
  outside.add(bounce);
  outside.add(bounce.target);

  /* ---------- 打散光路用的遮挡片 ----------
     和挡光的墙用同一种材质：只投影、不上色。它们待在门后的房间里，
     位置正好在门洞后方，所以即使朝它们看也只会看到门内画面（门内是另一套
     场景，画在后面），它们本身永远不会露脸。
     每片给一组固定的随机参数（只生成一次），免得每帧抖动。 */
  const breakParts = [];
  for (let i = 0; i < 8; i++) {                 // 池子开大一点，实际用几片看 TUNE
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blockerMat);
    m.castShadow = true;
    /* 位置必须是真随机的，不能按序号均匀铺开——均匀分布出来的断口
       间距相等、彼此平行，看着就是一副百叶窗。 */
    m.userData = {
      at:    Math.random(),                          // 在房间进深里的位置
      y:     Math.random() * 2 - 1,                  // 在门洞高度里的位置
      w:     0.45 + Math.random() * 1.15,            // 宽窄差距拉大
      thick: 0.35 + Math.random() * 1.5,             // 厚薄差距拉大
      tilt:  (Math.random() * 2 - 1) * 0.55          // 明显倾斜，断口才不平行
    };
    m.visible = false;
    breakParts.push(m);
    outside.add(m);
  }

  /* ---------- 两盏灯 ----------
     一红一紫，位置左右错开。错开是有意的：
     两团光在地上重叠的那一块会真的混出品红，
     而不是拿一个"品红色"直接刷上去。 */
  function makeLamp(spec) {
    const L = new THREE.SpotLight(spec.color, 1, 0, 0.5, TUNE.PENUMBRA, TUNE.DECAY);
    L.castShadow = true;
    L.shadow.mapSize.set(2048, 2048);
    L.shadow.radius = TUNE.SOFT;
    L.shadow.blurSamples = 16;
    outside.add(L);
    outside.add(L.target);
    return L;
  }
  const lampRed = makeLamp(TUNE.RED);
  const lampPurple = makeLamp(TUNE.PURPLE);
  const lamps = [lampRed, lampPurple];
  const lampConfig = [[lampRed, 'RED'], [lampPurple, 'PURPLE']];
  const mergedLampColor = new THREE.Color();
  const purpleLampColor = new THREE.Color();


  /* ==============================================================
     尺寸
     ============================================================== */

  let W = 0, H = 0;

  function resize() {
    /* 必须量 .hero 自己的尺寸，不能用 window.innerWidth——
       后者把右边的滚动条也算进去了（差十几个像素），门会整体偏一点。
       CSS 里那些百分比都是相对 .hero 算的，这里必须用同一把尺子。 */
    W = HERO.clientWidth;
    H = HERO.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    fogLightFrame.image.width = Math.round(W * renderer.getPixelRatio());
    fogLightFrame.image.height = Math.round(H * renderer.getPixelRatio());
    fogLightFrame.needsUpdate = true;
    /* 雾自己那张小图跟着一起缩放，比例由 TUNE.FOG.scale 决定。 */
    /* set() 里只传部分 FOG 参数时 scale 会缺失，兜个底，别把尺寸算成 NaN。 */
    const fogPR = renderer.getPixelRatio() * (TUNE.FOG.scale || 0.5);
    fogRT.setSize(Math.max(1, Math.round(W * fogPR)), Math.max(1, Math.round(H * fogPR)));
    camIn.aspect = camOut.aspect = W / H;
    /* 雾的参照尺寸**不要**在这里重记：它存的是视口百分比，本来就和窗口大小无关。
       在这里清掉的话，滚到一半时改窗口会把参照点重记成当前位置，
       follow 就彻底失效了。 */
    bloomUniforms.uSize.value.set(W, H);
    fogUniforms.uAspect.value = W / H;
    needsDraw = true;
  }
  window.addEventListener('resize', resize);
  resize();


  /* ==============================================================
     每一帧：把 CSS 那边的场景状态翻译成 3D
     ============================================================== */

  /* 门洞在屏幕上的矩形。坐标原点放在屏幕正中，y 轴向上，单位是像素。
     在"门所在的那个平面"上，1 像素正好等于 1 个空间单位，
     所以这几个数字可以直接当世界坐标用。 */
  function doorRect(door) {
    return {
      left:   door.clipL / 100 * W - W / 2,
      right:  (100 - door.clipR) / 100 * W - W / 2,
      top:    H / 2 - door.clipT / 100 * H,
      bottom: H / 2 - (100 - door.clipB) / 100 * H
    };
  }

  function syncCamera(door) {
    /* CSS 的 perspective 是这么定义的：镜头离画面 camDepth 那么远时，
       画面上 1px 就是屏幕上 1px。把这句话翻译成相机的视角就是下面这一行。
       （camDepth 每帧都在变小——镜头在往门口走——所以视角每帧都要重算。） */
    camIn.fov = camOut.fov = 2 * Math.atan((H / 2) / door.camDepth) * 180 / Math.PI;
    camIn.position.set(0, 0, 0);
    camIn.rotation.set(0, 0, 0);
    camIn.clearViewOffset();
    camIn.updateProjectionMatrix();
  }

  function syncInside(door, interior) {
    const GAP = -door.interiorZ;               // 门洞 → 门内世界的固定距离
    const D = door.camDepth + GAP;             // 镜头 → 门内世界
    const k = door.camDepth / D;               // 透视缩小系数（越远越小）

    /* 1) 图片按 object-fit: cover 铺满一整屏，得到它在屏幕上的基础尺寸 */
    let cw, ch;
    if (W / H > imgAspect) { cw = W; ch = W / imgAspect; }
    else                   { ch = H; cw = H * imgAspect; }

    /* 2) 两层缩放：对焦用的 worldScale，加上把"推远"补回来的 interiorScale。
          换算到 3D 里的实际尺寸时，透视的缩小刚好被距离抵消，所以 k 消掉了。 */
    const s = door.worldScale * door.interiorScale;
    worldPlane.scale.set(cw * s, ch * s, 1);

    /* 3) 位置。CSS 那边所有缩放都是围绕"灭点"P 做的——P 钉在门口附近，
          所以门内的房间是朝着门口退进去的，而不是朝屏幕正中退进去。 */
    const Px = door.pivotX / 100 * W - W / 2;
    const Py = H / 2 - door.cy / 100 * H;
    const iy = -(door.worldScale * (door.imgShift / 100 * H));   // 画面中心对准门洞中心

    const sTotal = door.interiorScale * k;
    const Cx = Px + (0  - Px) * sTotal;
    const Cy = Py + (iy - Py) * sTotal;

    worldPlane.position.set(Cx / k, Cy / k, -D);
    worldColorUniforms.uColorMix.value = interior.colorMix;
  }

  /* 门洞外面的一帧。这里是这次改动的核心。 */
  function syncOutside(door) {
    const R = doorRect(door);
    const A = door.camDepth;                   // 镜头到门（也就是到墙）的距离
    if (R.top <= R.bottom) return false;

    /* 空间的尺子：一个屏幕高。这些长度全程不变——房间不动、人不动，
       只有镜头在往前走。UNIT 只随窗口大小变，不随滚动变。 */
    const UNIT = H;
    const eye = TUNE.EYE * UNIT;               // 眼睛离地多高

    /* 地平线放在哪。
       地面在眼睛下方 eye 那么高，无限远处会收敛到"眼睛的水平高度"——
       那就是地平线。而门槛（地面的最远端，离镜头 A）必须落在屏幕上
       R.bottom 那个位置。两件事一联立，地平线的位置就唯一确定了：
           门槛的屏幕高度 = 地平线 − eye
       所以 地平线 = R.bottom + eye。
       做法是把整幅画面上下挪 c 像素，而不是把相机转过去（转了竖线就歪了）。 */
    const c = R.bottom + eye;
    camOut.position.set(0, 0, 0);
    camOut.rotation.set(0, 0, 0);
    camOut.setViewOffset(W, H, 0, c, W, H);    // 内部会自己 updateProjectionMatrix

    // 画面挪了 c，所以"屏幕高度"换算成"世界高度"要减掉 c
    const yOf = screenY => screenY - c;

    /* ---------- 地 ----------
       从墙后面一点，一直铺到镜头脚下（再往后一点，免得边缘穿帮） */
    /* 地**正好**铺到墙根为止，一丝一毫都不伸进房间里。
       伸进去的话，房间里那片被灯直射的地会紧贴着墙根；抗锯齿在墙和地相交的
       那一排像素上会混进一点点房间里的亮光，于是墙根会浮出一条横穿屏幕的亮线。
       现在墙后面根本没有地，也就无光可漏。 */
    const wallZ = -A;
    const zFar = wallZ;
    const zNear = 0.25 * UNIT;
    const depth = zNear - zFar;
    const halfW = (W / 2) * 1.3;

    floor.position.set(0, -eye, (zNear + zFar) / 2);
    floor.scale.set(halfW * 2, 1, depth);

    // 颗粒大小是固定的，所以镜头走近时颗粒跟着变大，就像真的走近一样
    const grain = TUNE.GRAIN * UNIT;
    for (const texture of asphaltTextures) texture.repeat.set(halfW * 2 / grain, depth / grain);

    /* ---------- 墙 ----------
       立在 z = -A 的平面上，中间留出门洞那个矩形。 */
    const hx = W * 4, hy = H * 4;              // 墙铺得足够大，边缘不进画面
    const l = R.left, r = R.right;
    const b = yOf(R.bottom), t = yOf(R.top);
    /* 挡光层铺满整面（它要负责挡光，形状一点不能变）；
       可见层只从**地平线往上**铺——地平线以下那截是埋在地里的，
       被地面盖得严严实实，却照样每个像素跑一遍完整光照，纯属白烧。 */
    const setQuad = (i, x0, x1, y0, y1) => {
      const blocker = wallParts[i];
      blocker.position.set((x0 + x1) / 2, (y0 + y1) / 2, wallZ);
      blocker.scale.set(x1 - x0, y1 - y0, 1);

      const skin = wallSkin[i];
      const sy0 = Math.max(y0, -eye);
      skin.visible = y1 - sy0 > 1e-3;      // 门槛以下那块整个在地里，不用画
      if (skin.visible) {
        /* 可见层整体往镜头挪开一段，挪的距离必须**大于起伏的最大深度**。
           两者原本严格共面，而起伏会把墙面往后推——凡是被推到挡光层背后的
           地方都会被判成阴影，于是整面墙浮出一层沿着等高线走的阶梯状噪点。
           挪够之后，最深的凹坑也仍然在挡光层前面，判断不再含糊。
           代价：门洞边缘的投影位置偏移约半个像素，看不出来。 */
        skin.position.set((x0 + x1) / 2, (sy0 + y1) / 2,
                          wallZ + (TUNE.WALL.relief * 1.15 + 0.004) * UNIT);
        skin.scale.set(x1 - x0, y1 - sy0, 1);
      }
    };
    setQuad(0, -hx, l,  -hy, hy);   // 洞左边
    setQuad(1, r,   hx, -hy, hy);   // 洞右边
    setQuad(2, l,   r,  -hy, b);    // 洞下边（门槛以下）
    setQuad(3, l,   r,   t,  hy);   // 洞上边（门楣以上）

    /* ---------- 灯 ----------
       在墙的后面。灯比门顶低，所以光会往前"趴"下来铺在地上，
       而不是直挺挺地射向天花板。 */
    const cx = (l + r) / 2;
    const cy2 = (b + t) / 2;                   // 门洞中心（世界坐标）
    /* 灯摆到侧面时略往门后退：射线更贴近地面，光池不会在两侧突然变短。 */
    const lampZ = -A - (TUNE.ROOM + Math.abs(lightAim.x) * TUNE.LIGHT_SWAY.reach) * UNIT;
    const lampY = -eye + TUNE.LAMP_Y * (t - b);   // 见 TUNE.LAMP_Y 的注释
    /* 两盏灯错开多少。上限是固定的，但门洞很窄的时候必须跟着收——
       否则两束光在地上完全分家，变成一块紫纸配一块橙纸并排放着。 */
    const dx = Math.min(TUNE.LAMP_DX * UNIT, 0.45 * (r - l));

    /* 鼠标左移时，灯在门后向右摆：穿过固定门洞后，地面上的近端光池向左转。
       门洞中心是固定支点，材质与相机都不参与移动。 */
    const sway = -lightAim.x * TUNE.LIGHT_SWAY.distance * UNIT;
    lampRed.position.set(cx - dx * 0.5 + sway, lampY, lampZ);
    // 两盏灯同位同向，只叠加成一束干净的洋红光。
    lampPurple.position.set(cx + dx * 0.5 + sway, lampY, lampZ);

    /* 每盏灯都**瞄准门洞本身**，张角刚好把门洞罩住、再放宽一点点。
       为什么不干脆开一个大张角：阴影是用一张固定分辨率的图算出来的，
       张角越大，这张图摊得越薄——门洞小的时候光斑边缘就会碎成马赛克。
       只罩住门洞，等于把所有精度都花在唯一有用的地方。 */
    for (const L of lamps) {
      L.target.position.set(cx, cy2, wallZ);
      L.target.updateMatrixWorld();

      const p = L.position;
      const ax = cx - p.x, ay = cy2 - p.y, az = wallZ - p.z;
      const aLen = Math.hypot(ax, ay, az);
      let maxAng = 0;
      for (const qx of [l, r]) for (const qy of [b, t]) {
        const vx = qx - p.x, vy = qy - p.y, vz = wallZ - p.z;
        const cos = (vx * ax + vy * ay + vz * az) / (Math.hypot(vx, vy, vz) * aLen);
        maxAng = Math.max(maxAng, Math.acos(Math.min(1, cos)));
      }
      L.angle = THREE.MathUtils.clamp(maxAng * TUNE.MARGIN, 0.02, 1.05);
    }

    /* 光的强度按距离平方衰减，而这里的距离是以"一个屏幕高"为单位的，
       所以强度也按同样的平方来换算，换个窗口大小亮度才不会变。

       现在 LAMP_DX=0，两盏灯的位置、朝向和光锥完全相同。分别渲染会让 GPU
       为同一组遮挡关系生成两张 2048² 阴影图；直接光照在线性空间可相加，
       所以合为一盏等效颜色的灯，画面不变、只需一张阴影图。若以后把
       LAMP_DX 调成非零，则立即自动回到原来的双灯路径。 */
    const sq = UNIT * UNIT;
    const shareLightPath = dx < 1e-6;
    if (shareLightPath) {
      mergedLampColor.set(TUNE.RED.color).multiplyScalar(TUNE.RED.power);
      purpleLampColor.set(TUNE.PURPLE.color).multiplyScalar(TUNE.PURPLE.power);
      lampRed.color.copy(mergedLampColor.add(purpleLampColor));
      lampRed.intensity = sq;
      lampPurple.visible = false;
    } else {
      lampRed.visible = true;
      lampPurple.visible = true;
      lampRed.color.set(TUNE.RED.color);
      lampPurple.color.set(TUNE.PURPLE.color);
      lampRed.intensity = TUNE.RED.power * sq;
      lampPurple.intensity = TUNE.PURPLE.power * sq;
    }

    for (const L of lamps) {
      L.shadow.camera.near = UNIT * 0.02;
      L.shadow.camera.far  = A + 4 * UNIT;
      L.shadow.normalBias  = UNIT * 0.004;
    }

    /* ---------- 打散光路 ----------
       把遮挡片摆在灯和门之间的光路上。它们越靠近灯，投出的阴影越大越糊；
       越靠近门，阴影越小越清楚——所以几片摆在不同深度，断口的虚实自然就不一样。
       尺寸绑在门洞上：门多大，断口相对光路就是同一个比例。 */
    const bk = TUNE.BREAKUP;
    const nBreak = Math.max(0, Math.min(bk.count, breakParts.length));
    const roomDepth = wallZ - lampZ;             // 灯到门的距离（正数）
    for (let i = 0; i < breakParts.length; i++) {
      const m = breakParts[i];
      if (i >= nBreak) { m.visible = false; continue; }
      m.visible = true;
      const u = m.userData;
      /* 沿光路铺开，spread 决定铺得多满 */
      const f = 0.12 + u.at * bk.spread;
      const z = lampZ + roomDepth * f;
      /* 该深度上，光锥的横截面有多大——遮挡片按它缩放，
         这样无论门多大、灯多远，挡住的比例都一样。 */
      const g = (z - lampZ) / roomDepth;
      const spanY = (t - b) * g;
      const spanX = (r - l) * g;
      m.position.set(
        cx + spanX * 0.5 * u.y * 0.35,
        cy2 + spanY * 0.62 * u.y,
        z
      );
      /* 宽度盖过整条光路，厚度决定断口有多宽 */
      m.scale.set(
        Math.max(spanX * (2.4 * u.w) * bk.cover, 1e-3),
        Math.max(spanY * bk.thickness * u.thick, 1e-3),
        1
      );
      m.rotation.z = u.tilt;
    }

    /* 可见墙整套关掉时，只留下那四块挡光板——画面与加墙之前完全一致。 */
    if (!TUNE.WALL.enabled) {
      for (const m of wallSkin)     m.visible = false;
      for (const m of casingParts)  m.visible = false;
      for (const m of baseParts)    m.visible = false;
      bounce.visible = false;
      bounce.intensity = 0;
      return R;
    }
    for (const m of casingParts) m.visible = true;
    for (const m of baseParts)   m.visible = true;
    bounce.visible = true;

    /* ---------- 门套 / 踢脚线 ----------
       尺寸绑在门高上（见 TUNE.WALL 的注释）：它们是门的一部分，
       门从细缝长成一整面墙，它们必须跟着长。 */
    const doorH = t - b;
    const cw = TUNE.WALL.casing.width  * doorH;   // 门套宽
    const cd = TUNE.WALL.casing.depth  * doorH;   // 门套凸出多少
    const bh = TUNE.WALL.base.height   * doorH;   // 踢脚线高
    const bd = TUNE.WALL.base.depth    * doorH;   // 踢脚线凸出多少

    /* 和上面的板一样：给两个对角，自己算中心和尺寸。 */
    const setBox = (m, x0, x1, y0, y1, z0, z1) => {
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.scale.set(Math.max(x1 - x0, 1e-4), Math.max(y1 - y0, 1e-4), Math.max(z1 - z0, 1e-4));
    };
    const zC = wallZ + cd, zB = wallZ + bd;
    setBox(casingParts[0], l - cw, l,      b, t,      wallZ, zC);   // 左
    setBox(casingParts[1], r,      r + cw, b, t,      wallZ, zC);   // 右
    setBox(casingParts[2], l - cw, r + cw, t, t + cw, wallZ, zC);   // 上：横跨两根竖的，压住转角
    /* 踢脚线顶在门套上收头——真实的踢脚线就是这么收的。门槛正好在地面上
       （b 恒等于 -eye），所以门洞底下不需要线脚。 */
    setBox(baseParts[0], -hx,    l - cw, -eye, -eye + bh, wallZ, zB);
    setBox(baseParts[1], r + cw, hx,     -eye, -eye + bh, wallZ, zB);

    /* 墙面 shader 要知道门洞在哪（洞口那圈起伏得压平，否则门洞的屏幕位置会偏）
       和地面在哪（墙根更脏）。 */
    wallUniforms.uDoorRect.value.set(l, r, b, t);
    wallUniforms.uUnit.value   = UNIT;
    wallUniforms.uFloorY.value = -eye;

    /* ---------- 地面反弹光 ----------
       贴着地面、从前方朝墙照，所以墙是下亮上暗——这个梯度方向和洞口轮廓
       无关，贴着门洞的对称亮圈（门框）在这个结构里长不出来。
       它跟着光池一起左右摆：光池偏到哪边，墙上那片亮就跟到哪边。 */
    const bo = TUNE.WALL.bounce;
    bounce.position.set(cx + sway * 0.6, -eye + bo.y * UNIT, wallZ + bo.dist * UNIT);
    bounce.target.position.set(cx + sway * 0.6, -eye + bo.aim * UNIT, wallZ);
    bounce.target.updateMatrixWorld();
    bounce.angle = bo.angle;
    bounce.intensity = bo.power * sq;
    bounce.shadow.camera.near = UNIT * 0.02;
    bounce.shadow.camera.far  = 4 * UNIT;
    bounce.shadow.normalBias  = UNIT * 0.004;

    return R;
  }

  /* 门洞：用 scissor（剪刀）把绘制范围限制在一个矩形里。
     这和 CSS 的 clip-path: inset(...) 是同一件事，边缘同样是硬的。 */
  function applyDoorScissor(door) {
    /* clip-* 是"从那条边往里裁掉多少（%）"。
       这里给的是 CSS 像素——three.js 内部会自己乘上屏幕倍率，不用我们乘。 */
    const left   = door.clipL / 100 * W;
    const right  = (100 - door.clipR) / 100 * W;
    const top    = door.clipT / 100 * H;
    const bottom = (100 - door.clipB) / 100 * H;

    /* 门槛那条线往下多画一个像素。
       为什么：地面的尽头是被那面看不见的墙"挡"出来的，也就是两个面在空间里
       相交的一条线。开了抗锯齿之后，正好压在这条线上的那一排像素只有一半
       被地面盖住，另一半是透明的——于是门底和光池之间会露出半个像素的黑缝，
       门离得越远越明显。让门洞往下多盖一个像素，缝就被压住了。 */
    const over = 1 / renderer.getPixelRatio();

    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom + over - top);
    // WebGL 的原点在左下角，CSS 在左上角，y 要翻过来
    renderer.setScissor(left, H - bottom - over, w, h);
    return w > 0 && h > 0;
  }

  function syncBloom(R) {
    bloomUniforms.uRect.value.set(
      (R.left + R.right) / (2 * W) + 0.5,
      (R.top + R.bottom) / (2 * H) + 0.5,
      (R.right - R.left) / (2 * W),
      (R.top - R.bottom) / (2 * H)
    );
    /* 与地面光池复用完全相同的鼠标状态；门洞轮廓保持原有 1:1 对齐。 */
    bloomUniforms.uColorOffset.value = lightAim.x;
  }

  function syncFog(door, opacity) {
    const R = doorRect(door);
    /* 门的中心与半宽高写入雾的屏幕坐标；雾的**形状**因此随门的既有滚动而移动。
       透明度来自主 Hero 的镜头节奏，避免雾跟着镜头进入门内世界。 */
    const cx = (R.left + R.right) / (2 * W) + 0.5;
    const cy = (R.top + R.bottom) / (2 * H) + 0.5;
    const hw = Math.max((R.right - R.left) / (2 * W), 0.002);
    const hh = Math.max((R.top - R.bottom) / (2 * H), 0.002);
    fogUniforms.uDoor.value.set(cx, cy, hw, hh);

    /* 雾的**纹理**只跟着门变一点点，否则滚动时整团雾会跟着跑（见 shader 注释）。
       参照点取页面在顶端时的门洞尺寸，第一帧记一次，改窗口再记一次。 */
    if (!fogAnchor.ready) {
      fogAnchor.x = cx; fogAnchor.y = cy; fogAnchor.w = hw; fogAnchor.h = hh;
      fogAnchor.ready = true;
    }
    const f = THREE.MathUtils.clamp(TUNE.FOG.follow, 0, 1);
    /* 位置线性插值；尺寸按倍率插值（门是成倍长大的，不是成段长大的）。
       f=0 完全不跟随，f=1 就是以前的行为。 */
    fogUniforms.uTexRef.value.set(
      fogAnchor.x + (cx - fogAnchor.x) * f,
      fogAnchor.y + (cy - fogAnchor.y) * f,
      fogAnchor.w * Math.pow(hw / fogAnchor.w, f),
      fogAnchor.h * Math.pow(hh / fogAnchor.h, f)
    );
    const doorWidth = (R.right - R.left) / W;
    /* 远景 = 1；门洞变大后，移动雾逐步收弱。 */
    fogUniforms.uFarPresence.value = 1 - THREE.MathUtils.smoothstep(doorWidth, 0.045, 0.18);
    fogUniforms.uOpacity.value = opacity;
  }

  /* ============================================================== 
     主循环
     ============================================================== */

  let lastKey = '';

  function frame() {
    requestAnimationFrame(frame);
    drawOnce(false);
  }

  /* force=true 时无视"没变化就不画"的判断，强制画一帧。
     调试用：标签页切到后台时浏览器会暂停动画，截图会截到旧画面。 */
  function drawOnce(force) {
    const s = window.__heroScene;
    if (!s) return;                            // CSS 那边还没算出第一帧
    const door = s.door;

    const lightMoving = updateLightAim(door);
    /* 雾是自走动画：它由 uTime 推着漂，和门、鼠标动没动毫无关系。
       下面这个"没变化就不画"的省电判断只认门和灯，若不把雾算进来，
       页面静止时整块画布会停画、雾被冻住，等下一次偶然重画时 uTime 已经
       跳过一大段——看上去就是每隔一会儿卡一帧。只要雾还看得见就逐帧画；
       镜头进门、雾淡出后（fog≈0）省电逻辑照旧生效。 */
    const fogAnimating = s.atmos.fog > 0.002;
    const key = `${door.camDepth}|${door.cy}|${door.clipL}|${door.clipT}|${door.worldScale}|${s.atmos.fog}`;
    /* 门/灯这一侧到底有没有变。雾自己在漂不算——它不影响投影。 */
    const sceneChanged = key !== lastKey || needsDraw || force || lightMoving;
    if (!sceneChanged && !fogAnimating) return;
    /* 阴影贴图只在门或灯真的动了时才重算。两张 2048×2048 的投影每帧重画一遍，
       在门没动的那些帧里算的是和上一帧一模一样的结果，纯属白烧。 */
    renderer.shadowMap.needsUpdate = sceneChanged;
    lastKey = key;
    needsDraw = false;
    fogUniforms.uTime.value = performance.now() * 0.001;

    renderer.setScissorTest(false);
    renderer.clear();                          // 先把整块画布擦干净

    if (sceneChanged) {
      syncCamera(door);

      /* ① 门外：地上的光。整屏画，不裁切——光本来就该漫到门外面去 */
      const R = syncOutside(door);
      if (R) renderer.render(outside, camOut);

      /* ② 门内：只画在门洞那个矩形里 */
      renderer.clearDepth();                   // 两个场景各算各的前后关系，互不干扰
      if (applyDoorScissor(door)) {
        syncInside(door, s.interior);
        renderer.setScissorTest(true);
        renderer.render(inside, camIn);
        renderer.setScissorTest(false);
      }

      /* ③ 门内最亮的边缘向洞外溢出；整屏绘制，但 shader 会丢弃洞内和远处像素。 */
      if (R) syncBloom(R);
      renderer.clearDepth();
      renderer.render(bloomScene, bloomCamera);

      /* 把「加雾之前」的整张画面存下来。雾要靠它来读既有的光，
         同时它也是下面那些「门没动」的帧直接复用的底图。
         雾已经看不见时（镜头进了门）这张底图没人用，不必白拷。 */
      if (fogAnimating) {
        if (R) syncFog(door, s.atmos.fog);
        renderer.copyFramebufferToTexture(fogCopyOrigin, fogLightFrame);
      }
    } else {
      /* 门和灯都没动，只有雾在漂：①②③ 的结果与上一帧完全相同，
         直接把存好的底图贴回来，省掉整套重画。 */
      renderer.render(sceneRestore, bloomCamera);
    }

    /* ④ 雾覆盖回同一张透明 canvas。它读取的是上面那张底图里真实存在的光，
       所以只有穿过空气的既有光会散射，雾团本身则能短暂遮住它们。
       雾先画在自己那张缩小的图上（整帧最大的一笔开销由此减到四分之一），
       再原样放大贴回来；取样的仍是全分辨率底图，散射读到的光一点没变。 */
    if (fogAnimating) {
      renderer.setRenderTarget(fogRT);
      renderer.clear();
      renderer.render(fogScene, bloomCamera);
      renderer.setRenderTarget(null);
      renderer.clearDepth();
      renderer.render(fogComposite, bloomCamera);
    }

  }
  requestAnimationFrame(frame);


  /* ==============================================================
     开关
     ==============================================================
     加上这个 class，CSS 那扇门和那块光池才隐藏、canvas 才显示。
     出任何问题（比如显卡不支持 WebGL）就不会加，页面自动退回 CSS 版本。
     控制台里敲 __portal3D.off() / .on() 可以随时两版对比。 */

  const on  = () => HERO.classList.add('portal-3d');
  const off = () => HERO.classList.remove('portal-3d');

  window.__portal3D = {
    on, off, TUNE, renderer, camIn, camOut, inside, outside,
    /* draw() 强制重画一帧（截图用）；draw(false) 走主循环那条真实路径，
       门没动时会复用底图——排查性能时用它才量得准。 */
    draw: (force = true) => drawOnce(force),
    /* 调参用：__portal3D.set({ LAMP_Y: 0.5 }) 改完立刻重画 */
    set: patch => {
      if (patch.LIGHT_SWAY) Object.assign(TUNE.LIGHT_SWAY, patch.LIGHT_SWAY);
      /* WALL 里还套着 bounce/casing/base，逐层合并，
         这样 set({WALL:{stain:0.4}}) 不会把其余几项抹成 undefined。 */
      if (patch.WALL) {
        for (const k of ['bounce', 'casing', 'base']) {
          if (patch.WALL[k]) { Object.assign(TUNE.WALL[k], patch.WALL[k]); delete patch.WALL[k]; }
        }
        Object.assign(TUNE.WALL, patch.WALL);
      }
      /* FOG 同理：set({FOG:{drift:0.05}}) 不能把 density/speed 抹成 undefined，
         否则浓度算出 NaN，整团雾会直接消失。 */
      if (patch.FOG) Object.assign(TUNE.FOG, patch.FOG);
      if (patch.BLOOM) Object.assign(TUNE.BLOOM, patch.BLOOM);
      if (patch.BREAKUP) Object.assign(TUNE.BREAKUP, patch.BREAKUP);
      const { LIGHT_SWAY, WALL, FOG, BLOOM, BREAKUP, ...rest } = patch;
      Object.assign(TUNE, rest);
      applyTune();
      drawOnce(true);
    },
    resize
  };

  function applyTune() {
    floor.material.normalScale.set(TUNE.BUMP, TUNE.BUMP);
    worldColorUniforms.uExposure.value = TUNE.DOOR_BRIGHT;
    bloomUniforms.uColor.value.set(TUNE.BLOOM.color);
    bloomUniforms.uMid.value.set(TUNE.BLOOM.mid);
    bloomUniforms.uFar.value.set(TUNE.BLOOM.far);
    bloomUniforms.uFarRange.value = TUNE.BLOOM.farRange;
    bloomUniforms.uCore.value = TUNE.BLOOM.core;
    bloomUniforms.uRadius.value = TUNE.BLOOM.radius;
    bloomUniforms.uFalloff.value = TUNE.BLOOM.falloff;
    fogUniforms.uColor.value.set(TUNE.FOG.color);
    fogUniforms.uDensity.value = TUNE.FOG.density;
    fogUniforms.uSpeed.value = TUNE.FOG.speed;
    fogUniforms.uDrift.value = TUNE.FOG.drift;
    wallUniforms.uRelief.value = TUNE.WALL.relief;
    wallUniforms.uStain.value  = TUNE.WALL.stain;
    wallMat.color.set(TUNE.WALL.color);
    trimMat.color.set(TUNE.WALL.color);
    bounce.color.set(TUNE.WALL.bounce.color);
    /* 改了雾的分辨率就得重新分配那张小图，所以走一遍 resize。 */
    /* set() 里只传部分 FOG 参数时 scale 会缺失，兜个底，别把尺寸算成 NaN。 */
    const fogPR = renderer.getPixelRatio() * (TUNE.FOG.scale || 0.5);
    fogRT.setSize(Math.max(1, Math.round(W * fogPR)), Math.max(1, Math.round(H * fogPR)));
    for (const [L, key] of lampConfig) {
      const spec = TUNE[key];
      L.color.set(spec.color);
      L.penumbra = TUNE.PENUMBRA;   // 张角每帧自动算，不在这里设
      L.decay = TUNE.DECAY;
      L.shadow.radius = TUNE.SOFT;
    }
  }

  if (new URLSearchParams(location.search).get('3d') !== '0') on();
}
