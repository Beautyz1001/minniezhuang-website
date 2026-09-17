import * as THREE from '../../works/js/lib/three.module.js';
import { GLTFLoader } from '../../works/js/lib/GLTFLoader.js';

const MODEL_URL = 'assets/easel-stool-scene.glb?v=webgl-1';
const FLOOR_LAMP_URL = 'assets/floor-lamp.glb?v=webgl-1';
const USER_ARTWORK_TEXTURE_URL = 'assets/user-portrait-texture.png?v=portrait-1';
const ARTWORK_MATERIAL_NAME = 'M_017746557a3f7700000059ff6553b2';
const VIEW_ROTATION_DEGREES = 40;
const CAMERA_VERTICAL_OFFSET = -.06;
const MODEL_SCREEN_LEFT_OFFSET = .40;
const THEME_RED = 0xe00000;
const SHADE_LIGHT_COLOR = 0xffd4ce;

export function createBreakScene(canvas, statusElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // 和 Works 电视场景同一浓度的内置距离雾（2026-09-15 用户要求对齐），
  // 颜色用 Break 自己纯黑的背景色，不是 Works 那个偏灰的 0x050606。
  scene.fog = new THREE.FogExp2(0x000000, .10);
  const composition = new THREE.Group();
  // Browser-only presentation adjustment. The saved Blender objects stay intact.
  composition.rotation.y = THREE.MathUtils.degToRad(VIEW_ROTATION_DEGREES);
  scene.add(composition);

  // A separate, vertical soft drop over the whole easel, lamp, and stool group.这个叫顶光2
  // Keeping it in this group makes its local position survive presentation rotation.
  const canvasFill = new THREE.SpotLight(THEME_RED, 18, 3.2, Math.PI * .22, .95, 2);
  canvasFill.name = 'top light 2';
  canvasFill.position.set(1.3, 3.3, .36);
  canvasFill.target.position.set(-.6, .25, .36);
  canvasFill.castShadow = true;
  canvasFill.shadow.mapSize.set(1024, 1024);
  canvasFill.shadow.camera.near = .05;
  canvasFill.shadow.camera.far = 3.4;
  canvasFill.shadow.bias = -.0015;
  canvasFill.shadow.radius = 4;
  composition.add(canvasFill, canvasFill.target);

  const easelLeftFill = new THREE.SpotLight(0x8291ad, 3, 3.2, Math.PI * .18, .65, 2);
  easelLeftFill.name = 'easel left environment fill';
  easelLeftFill.position.set(-2.0, 3, 1.54);
  easelLeftFill.target.position.set(-1.2, .55, 1.24);
  easelLeftFill.castShadow = true;
  easelLeftFill.shadow.mapSize.set(512, 512);
  easelLeftFill.shadow.camera.near = .05;
  easelLeftFill.shadow.camera.far = 3.4;
  easelLeftFill.shadow.bias = -.0015;
  easelLeftFill.shadow.radius = 4;
  scene.add(easelLeftFill, easelLeftFill.target);

  // A localized red fill from the viewer's right. Its world-space placement is
  // synchronized below, so the 40-degree presentation rotation cannot move it
  // behind the stool.
  const stoolRightFill = new THREE.SpotLight(THEME_RED, .85, 1.6, Math.PI * .22, .7, 2);
  stoolRightFill.name = 'stool right environment fill';
  // This is a soft side fill, not a hard key: do not let the stool seat
  // shadow the very legs this light is intended to reveal.
  stoolRightFill.castShadow = false;
  stoolRightFill.shadow.mapSize.set(512, 512);
  stoolRightFill.shadow.camera.near = .05;
  stoolRightFill.shadow.camera.far = 3.4;
  stoolRightFill.shadow.bias = -.0015;
  stoolRightFill.shadow.radius = 4;
  scene.add(stoolRightFill, stoolRightFill.target);

  const camera = new THREE.PerspectiveCamera(31, 1, .01, 100);
  // Blender is Z-up while glTF is Y-up. These positions are the saved Blender
  // composition converted into glTF coordinates: (x, z, -y).
  camera.position.set(3.35, 3.05, 6.7);
  const focus = new THREE.Vector3(-.72, .72, .38);
  camera.lookAt(focus);

  function syncEaselLeftFill() {
    // Canvas anchor in the model's native coordinates. Convert it after every
    // presentation transform, then derive the source from the camera's actual
    // screen-left/front direction so it always lights the visible canvas face.
    const canvasWorld = composition.localToWorld(new THREE.Vector3(-1.22, .55, 1.24));
    const screenLeft = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    screenLeft.y = 0;
    screenLeft.normalize().multiplyScalar(-.8);
    const towardCamera = camera.position.clone().sub(canvasWorld);
    towardCamera.y = 0;
    towardCamera.normalize().multiplyScalar(.75);
    easelLeftFill.position.copy(canvasWorld)
      .add(screenLeft)
      .add(towardCamera)
      .add(new THREE.Vector3(0, .75, 0));
    easelLeftFill.target.position.copy(canvasWorld);
  }

  function syncStoolRightFill() {
    // Aim between the stool feet and lower lamp pole. The source is kept low on
    // the viewer's right so its unchanged cone clears the easel before fading.
    const stoolLampWorld = composition.localToWorld(new THREE.Vector3(-.02, .22, -.16));
    const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    screenRight.y = 0;
    screenRight.normalize().multiplyScalar(.55);
    const towardCamera = camera.position.clone().sub(stoolLampWorld);
    towardCamera.y = 0;
    towardCamera.normalize().multiplyScalar(.9);
    stoolRightFill.position.copy(stoolLampWorld)
      .add(screenRight)
      .add(towardCamera)
      .add(new THREE.Vector3(0, .12, 0));
    stoolRightFill.target.position.copy(stoolLampWorld);
  }

  let model = null;
  let floorLamp = null;
  let floorLampUnavailable = false;
  let destroyed = false;
  const loader = new GLTFLoader();

  // 两个模型并行下载；不能让先完成的落地灯单独出现在加载画面里。
  // 仅在完整构图准备好（或灯确实加载失败）时才揭开 3D 画布。
  function revealCompleteComposition() {
    if (model && (floorLamp || floorLampUnavailable)) {
      canvas.classList.add('is-ready');
    }
  }

  function render() {
    if (!destroyed) renderer.render(scene, camera);
  }

  // ── 灯罩灯的不规律闪烁（2026-09-15 用户要求）────────────────────────
  // "灯罩灯"和"照亮灯杆的灯"（addRedLampLight 里的 redLight/spill/
  // poleFill 三盏）当成一个整体一起调，亮度都按各自的基础强度乘同一个
  // 系数，比例不变；发光灯泡贴图的 emissiveIntensity 也跟着同一个系数走，
  // 不然灯投出去的光在闪、灯泡本体却纹丝不动，会很假。
  let lampLights = null; // [{ light, base }]
  let lampBulbMaterial = null;
  const LAMP_BULB_BASE_EMISSIVE = 2.6;
  const LAMP_NORMAL_COLOR = new THREE.Color(SHADE_LIGHT_COLOR);
  let flickerRAF = 0;
  let flickerNextEventAt = 0;
  let flickerBurstEnd = -1;
  let flickerHoldUntil = 0;
  let flickerLevel = 1;
  let animActive = typeof document !== 'undefined' ? !document.hidden : true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { animActive = !document.hidden; });
  }

  // 开场先按写死的节奏闪几下（间隔有短有长），不是一进页面就用纯随机的
  // 节拍——那样开场那几下未必赶得上被看到。颜色永远是灯本来的暖色，不
  // 会闪红（2026-09-15 用户改定：红光反馈第一版太抢眼，改成下面的
  // triggerLampSwitchCue——切换项目时灯快速暗一下再弹回，不是变色）。
  // 每一项的 delay 是"上一下结束后，到这一下开始"要等多久。
  const LAMP_INTRO_BURSTS = [
    { delay: 0.15, duration: 0.12 },
    { delay: 0.30, duration: 0.16 },
    { delay: 0.55, duration: 0.10 },
    { delay: 1.10, duration: 0.30 },
    { delay: 0.18, duration: 0.09 },
  ];
  let lampIntroIndex = 0;
  flickerNextEventAt = LAMP_INTRO_BURSTS[0].delay;

  // 切换项目时的交互反馈：独立于上面的环境闪烁，是一次性、有明确触发源
  // 的动作（由 break.js 在项目真的换了的那一刻调用 triggerLampSwitchCue()），
  // 用绝对时间戳（performance.now()）而不是 et，因为它随时可能被触发，
  // 不跟着开场节奏走。2026-09-15 第二版：不再变红，改成灯快速暗下去
  // （压到基础亮度的 15%）、停顿一瞬、再弹回正常亮度——像灯自己眨了一下
  // 眼确认收到切换，颜色全程不变，比变红克制。
  // 2026-09-15 第三版：暗下去这一段调慢了（之前 112ms 太快，感觉像一次
  // 抖动而不是"暗下来"）——总时长拉长，往下压的那一段占比也加大。
  const SWITCH_CUE_DURATION_MS = 520;
  const SWITCH_CUE_DOWN_FRACTION = 0.5;    // 前 50%（约 260ms）：慢慢往下压
  const SWITCH_CUE_HOLD_FRACTION = 0.65;   // 到 65% 时间：压到最暗、停住
  const SWITCH_CUE_DIP_DEPTH = 0.85;       // 暗到基础亮度的 (1 - 0.85) = 15%
  let switchCueStartAt = -Infinity;
  let switchCueEndAt = -Infinity;

  function triggerLampSwitchCue() {
    switchCueStartAt = performance.now();
    switchCueEndAt = switchCueStartAt + SWITCH_CUE_DURATION_MS;
  }

  function switchCueLevel(p) {
    if (p < SWITCH_CUE_DOWN_FRACTION) {
      return 1 - SWITCH_CUE_DIP_DEPTH * (p / SWITCH_CUE_DOWN_FRACTION);
    }
    if (p < SWITCH_CUE_HOLD_FRACTION) {
      return 1 - SWITCH_CUE_DIP_DEPTH;
    }
    const up = (p - SWITCH_CUE_HOLD_FRACTION) / (1 - SWITCH_CUE_HOLD_FRACTION);
    return (1 - SWITCH_CUE_DIP_DEPTH) + SWITCH_CUE_DIP_DEPTH * up;
  }

  // 颜色始终是灯本来的暖色——红光反馈那版已经作废，现在只调亮度。
  function applyLampFlicker(multiplier) {
    if (lampLights) {
      lampLights.forEach(({ light, base }) => {
        light.intensity = base * multiplier;
        light.color.copy(LAMP_NORMAL_COLOR);
      });
    }
    if (lampBulbMaterial) {
      lampBulbMaterial.emissiveIntensity = LAMP_BULB_BASE_EMISSIVE * multiplier;
      lampBulbMaterial.emissive.copy(LAMP_NORMAL_COLOR);
      lampBulbMaterial.color.copy(LAMP_NORMAL_COLOR);
    }
  }

  // stepLampFlicker 接收的是"这个循环启动以来经过的秒数"（et），不是页面
  // 加载以来的绝对时间——这样开场那串固定节奏永远从 0 开始数，不会因为
  // GLTF 加载耗时不同而提前或推迟触发。
  // 每次闪烁事件内部"换一次亮度"的间隔范围——不再是固定的 30~100ms，
  // 每次事件开始时从这几档里随机挑一档，读起来才会"有时候快、有时候慢"，
  // 而不是每次闪烁的节奏都长得一样。
  const LAMP_FLICKER_PACES = [
    { min: 0.02, max: 0.05 },   // 急促、跳得很快
    { min: 0.05, max: 0.12 },   // 正常
    { min: 0.14, max: 0.30 },   // 慢下来，一顿一顿的
  ];
  let flickerPace = LAMP_FLICKER_PACES[1];

  function stepLampFlicker(et) {
    // 常态：很慢、很轻的呼吸感（几秒一个周期，肉眼刚好能感到"亮一点暗一点"）。
    const breathing = 1 + Math.sin(et * 0.5) * 0.035;

    if (et >= flickerNextEventAt) {
      flickerPace = LAMP_FLICKER_PACES[Math.floor(Math.random() * LAMP_FLICKER_PACES.length)];
      if (lampIntroIndex < LAMP_INTRO_BURSTS.length) {
        const burst = LAMP_INTRO_BURSTS[lampIntroIndex];
        lampIntroIndex += 1;
        flickerBurstEnd = et + burst.duration;
        const next = LAMP_INTRO_BURSTS[lampIntroIndex];
        flickerNextEventAt = flickerBurstEnd + (next ? next.delay : 1.2 + Math.random() * 5);
      } else {
        // 开场那串固定节奏播完，回到不规律的随机节拍：持续 150~500ms，
        // 下一次间隔 1.2~6.2s。
        flickerBurstEnd = et + 0.15 + Math.random() * 0.35;
        flickerNextEventAt = flickerBurstEnd + 1.2 + Math.random() * 5;
      }
    }

    let burstLevel = 1;
    if (et < flickerBurstEnd) {
      // 闪烁事件内部：按这次事件挑中的节奏换亮度（忽暗忽亮的快速跳变），
      // 模拟灯泡接触不良那种"闪一闪"，不是平滑渐变。
      if (et >= flickerHoldUntil) {
        flickerHoldUntil = et + flickerPace.min + Math.random() * (flickerPace.max - flickerPace.min);
        flickerLevel = Math.random() < 0.55
          ? 0.12 + Math.random() * 0.35   // 猛地暗下去
          : 0.85 + Math.random() * 0.5;   // 猛地亮一下
      }
      burstLevel = flickerLevel;
    }

    applyLampFlicker(breathing * burstLevel);
  }

  function startLampFlicker() {
    if (flickerRAF) return;
    let loopStartTime = null;
    const step = (now) => {
      flickerRAF = requestAnimationFrame(step);
      if (destroyed) return;
      if (!animActive) return; // 标签页切后台时不算、不渲染，省电
      if (loopStartTime === null) loopStartTime = now;
      stepLampFlicker((now - loopStartTime) / 1000);
      if (now < switchCueEndAt) {
        // 切换反馈盖在环境闪烁之上：快速暗下去、停顿、弹回，颜色不变。
        const p = Math.min(1, (now - switchCueStartAt) / SWITCH_CUE_DURATION_MS);
        applyLampFlicker(switchCueLevel(p));
      }
      render();
    };
    flickerRAF = requestAnimationFrame(step);
  }

  function addRedLampLight() {
    floorLamp.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(floorLamp);
    const size = bounds.getSize(new THREE.Vector3());
    const position = bounds.getCenter(new THREE.Vector3());
    // The upper sixth of the saved lamp is the shade. Place the source inside it.
    position.y = bounds.max.y - size.y * .16;
    floorLamp.worldToLocal(position);

    const redLight = new THREE.PointLight(SHADE_LIGHT_COLOR, 1.8, 1.65, 2);
    redLight.name = 'web red lamp light';
    redLight.position.copy(position);
    redLight.castShadow = true;
    redLight.shadow.mapSize.set(512, 512);
    redLight.shadow.bias = -.0008;
    redLight.shadow.camera.near = .03;
    redLight.shadow.camera.far = 1.9;

    // A focused downlight carries the soft warm-white spill from the lamp opening.
    // It avoids showing a literal bulb silhouette through the shade.
    const spill = new THREE.SpotLight(SHADE_LIGHT_COLOR, 1.7, 2.3, Math.PI * .27, .82, 2);
    spill.name = 'web red shade spill';
    spill.position.copy(position).add(new THREE.Vector3(0, -.04, 0));
    spill.castShadow = true;
    spill.shadow.mapSize.set(512, 512);
    spill.shadow.bias = -.0008;
    spill.target.position.copy(position).add(new THREE.Vector3(0, -1, 0));

    // A point source above a vertical pole mostly grazes its sides, so its
    // falloff is visible on the floor but not on the pole itself. This small
    // source sits inside the shade's lower rim on the viewer-facing side,
    // giving the viewer-facing side a real oblique hit without making the
    // metal shade translucent.
    const poleFill = new THREE.SpotLight(SHADE_LIGHT_COLOR, 1.0, 2.0, Math.PI * .19, .72, 2);
    poleFill.name = 'web red pole fill';
    poleFill.position.copy(position).add(new THREE.Vector3(0, -.04, .06));
    poleFill.castShadow = true;
    poleFill.shadow.mapSize.set(512, 512);
    poleFill.shadow.bias = -.0008;
    poleFill.target.position.copy(position).add(new THREE.Vector3(0, -.3, .014));

    floorLamp.add(redLight, spill, spill.target, poleFill, poleFill.target);

    lampLights = [
      { light: redLight, base: redLight.intensity },
      { light: spill, base: spill.intensity },
      { light: poleFill, base: poleFill.intensity },
    ];
  }

  function configureShadeGlow() {
    floorLamp.traverse((node) => {
      if (!node.isMesh) return;
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      const materials = sourceMaterials.map((source) => {
        if (/lamp shade/i.test(source.name)) {
          const shade = source.clone();
          shade.side = THREE.DoubleSide;
          shade.transparent = false;
          shade.opacity = 1;
          shade.color = new THREE.Color(0x71757c);
          shade.metalness = .92;
          shade.roughness = .24;
          shade.emissive = new THREE.Color(0x000000);
          shade.emissiveIntensity = 0;
          shade.needsUpdate = true;
          return shade;
        }
        if (/lamp bulb/i.test(source.name)) {
          const bulb = source.clone();
          bulb.color = new THREE.Color(SHADE_LIGHT_COLOR);
          bulb.emissive = new THREE.Color(SHADE_LIGHT_COLOR);
          // The source glTF's intensity of 7 is tone-mapped into yellow.
          bulb.emissiveIntensity = LAMP_BULB_BASE_EMISSIVE;
          bulb.needsUpdate = true;
          lampBulbMaterial = bulb;
          return bulb;
        }
        return source;
      });
      const isShade = sourceMaterials.some((material) => /lamp shade/i.test(material.name));
      if (isShade) {
        // The metal shade is now a real occluder: only its lower opening can
        // release the internal light into the scene.
        node.castShadow = true;
        node.receiveShadow = true;
      }
      node.material = Array.isArray(node.material) ? materials : materials[0];
    });
  }

  function applyUserArtworkTexture() {
    const artworkTexture = new THREE.TextureLoader().load(
      USER_ARTWORK_TEXTURE_URL,
      () => {
        // The original painting uses a shifted, repeating UV island: its U
        // values run from about -1 to 0 rather than 0 to 1. Reuse the loaded
        // material's texture settings below; clamping those UVs samples only
        // the dark edge of the replacement image.
        artworkTexture.colorSpace = THREE.SRGBColorSpace;

        model.traverse((node) => {
          if (!node.isMesh || !node.material) return;
          const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
          const materials = sourceMaterials.map((source) => {
            if (source.name !== ARTWORK_MATERIAL_NAME) return source;
            const sourceTexture = source.map;
            // Preserve the original texture's UV transform and repeat mode so
            // every corner of the new image remains registered to the canvas.
            artworkTexture.flipY = sourceTexture.flipY;
            artworkTexture.wrapS = sourceTexture.wrapS;
            artworkTexture.wrapT = sourceTexture.wrapT;
            artworkTexture.magFilter = sourceTexture.magFilter;
            artworkTexture.minFilter = sourceTexture.minFilter;
            artworkTexture.anisotropy = sourceTexture.anisotropy;
            artworkTexture.repeat.copy(sourceTexture.repeat);
            artworkTexture.offset.copy(sourceTexture.offset);
            artworkTexture.center.copy(sourceTexture.center);
            artworkTexture.rotation = sourceTexture.rotation;
            artworkTexture.channel = sourceTexture.channel;
            artworkTexture.matrixAutoUpdate = sourceTexture.matrixAutoUpdate;
            artworkTexture.matrix.copy(sourceTexture.matrix);
            artworkTexture.needsUpdate = true;

            const artworkMaterial = source.clone();
            artworkMaterial.map = artworkTexture;
            artworkMaterial.color.set(0xffffff);
            // The artwork deliberately contains a near-black suit and ground.
            // A small self-lit contribution keeps the face and painted texture
            // legible in this otherwise very dark gallery scene.
            artworkMaterial.emissiveMap = artworkTexture;
            artworkMaterial.emissive.set(0xffffff);
            artworkMaterial.emissiveIntensity = .16;
            artworkMaterial.needsUpdate = true;
            return artworkMaterial;
          });
          node.material = Array.isArray(node.material) ? materials : materials[0];
        });
        render();
      },
    );
  }

  function frameSavedComposition() {
    if (!model && !floorLamp) return;
    // Reset before measuring. The presentational offset is applied after the
    // camera is framed, so it reads as a left shift from the viewer's screen.
    composition.position.set(0, 0, 0);
    const bounds = new THREE.Box3();
    [model, floorLamp].filter(Boolean).forEach((root) => {
      root.traverse((node) => {
        if (!node.isMesh || /floor|ground/i.test(node.name)) return;
        bounds.expandByObject(node);
      });
    });
    if (bounds.isEmpty()) return;

    bounds.getCenter(focus);
    // Screen-space composition adjustment only: translate camera and its target
    // downward together so the viewing angle does not pitch.
    focus.y += CAMERA_VERTICAL_OFFSET;
    const size = bounds.getSize(new THREE.Vector3());
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * .5);
    const fitHeight = size.y * .5 / Math.tan(halfVerticalFov);
    const fitWidth = size.x * .5 / (Math.tan(halfVerticalFov) * camera.aspect);
    const distance = Math.max(fitHeight, fitWidth, size.z * .5) * 1.38;
    // Slightly side-on framing keeps the saved lamp visible behind the easel,
    // without moving any model object from its Blender position.
    const viewDirection = new THREE.Vector3(.82, .22, .53).normalize();
    camera.position.copy(focus).addScaledVector(viewDirection, distance);
    camera.near = Math.max(.01, distance / 100);
    camera.far = distance * 20;
    camera.lookAt(focus);
    camera.updateProjectionMatrix();

    const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    composition.position.copy(screenRight).multiplyScalar(MODEL_SCREEN_LEFT_OFFSET);
    composition.updateWorldMatrix(true, false);
    syncEaselLeftFill();
    syncStoolRightFill();
  }

  function resize() {
    const host = canvas.parentElement;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    frameSavedComposition();
    camera.updateProjectionMatrix();
    render();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  resize();

  loader.load(
    MODEL_URL,
    (gltf) => {
      if (destroyed) return;
      model = gltf.scene;
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) node.material.needsUpdate = true;
      });
      composition.add(model);
      applyUserArtworkTexture();
      frameSavedComposition();
      statusElement.textContent = 'WEBGL MODEL';
      render();
      revealCompleteComposition();
    },
    undefined,
    () => {
      statusElement.textContent = 'MODEL UNAVAILABLE';
      statusElement.classList.add('is-error');
    },
  );

  loader.load(
    FLOOR_LAMP_URL,
    (gltf) => {
      if (destroyed) return;
      floorLamp = gltf.scene;
      floorLamp.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) node.material.needsUpdate = true;
      });
      composition.add(floorLamp);
      frameSavedComposition();
      configureShadeGlow();
      addRedLampLight();
      render();
      startLampFlicker();
      revealCompleteComposition();
    },
    undefined,
    () => {
      // The main scene remains usable if the auxiliary lamp file cannot load.
      floorLampUnavailable = true;
      revealCompleteComposition();
    },
  );

  return {
    scene,
    camera,
    renderer,
    get model() { return model; },
    render,
    signalProjectSwitch: triggerLampSwitchCue,
    dispose() {
      destroyed = true;
      if (flickerRAF) cancelAnimationFrame(flickerRAF);
      resizeObserver.disconnect();
      renderer.dispose();
    },
  };
}
