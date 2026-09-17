import * as THREE from './lib/three.module.js';
import { GLTFLoader } from './lib/GLTFLoader.js';


const MODEL_URL = 'assets/television/television.glb?v=ground-microrelief-1';


function applyDuotoneDistortion(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;
  const shadow = [12, 1, 3];
  const mid = [214, 18, 16];
  const warmHighlight = [255, 251, 244];
  const coolHighlight = [232, 250, 247];
  const temp = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    let cr;
    let cg;
    let cb;
    if (lum < 0.42) {
      const k = Math.pow(lum / 0.42, 0.7);
      cr = shadow[0] + (mid[0] - shadow[0]) * k;
      cg = shadow[1] + (mid[1] - shadow[1]) * k;
      cb = shadow[2] + (mid[2] - shadow[2]) * k;
    } else {
      const k = Math.pow((lum - 0.42) / 0.58, 0.5);
      cr = mid[0] + (warmHighlight[0] - mid[0]) * k;
      cg = mid[1] + (warmHighlight[1] - mid[1]) * k;
      cb = mid[2] + (warmHighlight[2] - mid[2]) * k;
    }
    const coolness = Math.max(0, (b - r) / 255) * lum * 0.85;
    cr += (coolHighlight[0] - cr) * coolness;
    cg += (coolHighlight[1] - cg) * coolness;
    cb += (coolHighlight[2] - cb) * coolness;
    const brightnessBoost = 1.28;
    cr *= brightnessBoost;
    cg *= brightnessBoost;
    cb *= brightnessBoost;
    const noise = (Math.random() - 0.5) * 18;
    temp[i] = cr + noise;
    temp[i + 1] = cg + noise;
    temp[i + 2] = cb + noise;
    temp[i + 3] = src[i + 3];
  }

  const shift = Math.max(1, Math.round(width * 0.0022));
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      const xr = Math.min(width - 1, Math.max(0, x - shift));
      const xb = Math.min(width - 1, Math.max(0, x + shift));
      src[i] = temp[row + xr * 4];
      src[i + 1] = temp[i + 1];
      src[i + 2] = temp[row + xb * 4 + 2];
      src[i + 3] = temp[i + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}


function drawCover(context, emissionContext, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  emissionContext.save();
  emissionContext.clearRect(0, 0, width, height);
  emissionContext.filter = 'brightness(1.22) contrast(1.12) saturate(1.05)';
  emissionContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  emissionContext.restore();
  applyDuotoneDistortion(emissionContext, width, height);

  context.save();
  context.drawImage(emissionContext.canvas, 0, 0);
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = .44;
  context.filter = 'blur(21px) brightness(1.34) saturate(1.03)';
  context.drawImage(emissionContext.canvas, 0, 0);
  context.restore();
}


function createContactShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(
    size * .5, size * .5, 0,
    size * .5, size * .5, size * .5,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, .62)');
  gradient.addColorStop(.55, 'rgba(0, 0, 0, .34)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


function drawCrtFrame(context, width, height) {
  const lines = Math.ceil(height / 4);
  context.fillStyle = 'rgba(3, 8, 9, .22)';
  for (let line = 0; line < lines; line += 1) {
    context.fillRect(0, line * 4, width, 1);
  }

  const gradient = context.createRadialGradient(width * .5, height * .46, height * .04, width * .5, height * .5, width * .72);
  gradient.addColorStop(0, 'rgba(225, 255, 255, .07)');
  gradient.addColorStop(.75, 'rgba(0, 0, 0, .02)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, .24)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}


function getWeightedScreenColor(context, width, height, fallback) {
  try {
    const pixels = context.getImageData(0, 0, width, height).data;
    const sampleStep = 8;
    let red = 0;
    let green = 0;
    let blue = 0;
    let totalWeight = 0;

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const offset = (y * width + x) * 4;
        const pixelRed = pixels[offset] / 255;
        const pixelGreen = pixels[offset + 1] / 255;
        const pixelBlue = pixels[offset + 2] / 255;
        const luminance = pixelRed * .2126 + pixelGreen * .7152 + pixelBlue * .0722;
        if (luminance < .045) continue;

        const weight = Math.pow(luminance, 1.65);
        red += pixelRed * weight;
        green += pixelGreen * weight;
        blue += pixelBlue * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight < .001) return fallback.clone();
    red /= totalWeight;
    green /= totalWeight;
    blue /= totalWeight;
    const peak = Math.max(red, green, blue, .001);
    return new THREE.Color()
      .setRGB(red / peak, green / peak, blue / peak)
      .convertSRGBToLinear()
      .lerp(new THREE.Color(0xd7f1f2), .30);
  } catch {
    return fallback.clone();
  }
}


function getScreenEmissionPose(mesh, camera) {
  const positions = mesh.geometry.getAttribute('position');
  const normals = mesh.geometry.getAttribute('normal');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    center.add(point);
    vertexNormal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize();
    normal.add(vertexNormal);
  }

  center.multiplyScalar(1 / positions.count);
  normal.normalize();
  if (normal.dot(camera.position.clone().sub(center)) < 0) normal.negate();

  const bounds = new THREE.Box3().setFromObject(mesh);
  const upReference = new THREE.Vector3(0, 1, 0);
  const right = upReference.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  return {
    center,
    normal,
    right,
    up,
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
  };
}


function patchMaterialWithScreenLightField(material, surfaceMode, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vScreenLightWorldPosition;\nvarying vec3 vScreenLightWorldNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvScreenLightWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvScreenLightWorldNormal = normalize(mat3(modelMatrix) * normal);',
      );

    const lightFieldFunctions = `
varying vec3 vScreenLightWorldPosition;
varying vec3 vScreenLightWorldNormal;
uniform vec3 uScreenLightPosition;
uniform vec3 uScreenLightForward;
uniform vec3 uScreenLightRight;
uniform vec3 uScreenLightUp;
uniform vec3 uScreenLightColor;
uniform float uScreenLightWidth;
uniform float uScreenLightHeight;
uniform float uGroundLightStrength;
uniform vec3 uGroundNearColor;
uniform float uGroundNearStrength;

float screenLightHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float screenLightNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(screenLightHash(cell), screenLightHash(cell + vec2(1.0, 0.0)), local.x),
    mix(screenLightHash(cell + vec2(0.0, 1.0)), screenLightHash(cell + vec2(1.0, 1.0)), local.x),
    local.y
  );
}

float screenLightFbm(vec2 point) {
  float value = screenLightNoise(point) * 0.58;
  value += screenLightNoise(point * 2.07 + 7.4) * 0.28;
  value += screenLightNoise(point * 4.13 + 19.1) * 0.14;
  return value;
}
`;

    const cabinetField = `
vec3 screenLightDelta = vScreenLightWorldPosition - uScreenLightPosition;
float screenLightX = dot(screenLightDelta, uScreenLightRight);
float screenLightY = dot(screenLightDelta, uScreenLightUp);
float screenLightDepth = abs(dot(screenLightDelta, uScreenLightForward));
vec2 screenLightHalfSize = vec2(uScreenLightWidth, uScreenLightHeight) * 0.50;
float screenLightCornerRadius = min(screenLightHalfSize.x, screenLightHalfSize.y) * 0.26;
vec2 screenLightCornerDelta = abs(vec2(screenLightX, screenLightY)) - screenLightHalfSize + screenLightCornerRadius;
float screenLightContourDistance = min(max(screenLightCornerDelta.x, screenLightCornerDelta.y), 0.0)
  + length(max(screenLightCornerDelta, 0.0)) - screenLightCornerRadius;
float screenLightOutsideDistance = max(screenLightContourDistance, 0.0);
float screenLightEdgeWidth = max(uScreenLightWidth * 0.052, 0.001);
float screenLightHorizontalSpan = 1.0 - smoothstep(
  screenLightHalfSize.x * 0.66,
  screenLightHalfSize.x * 1.18,
  abs(screenLightX)
);
float screenLightVerticalSpan = 1.0 - smoothstep(
  screenLightHalfSize.y * 0.62,
  screenLightHalfSize.y * 1.18,
  abs(screenLightY)
);
float screenLightTopEdge = exp(-abs(screenLightY - screenLightHalfSize.y) / screenLightEdgeWidth)
  * screenLightHorizontalSpan;
float screenLightBottomEdge = exp(-abs(screenLightY + screenLightHalfSize.y) / screenLightEdgeWidth)
  * screenLightHorizontalSpan;
float screenLightLeftEdge = exp(-abs(screenLightX + screenLightHalfSize.x) / screenLightEdgeWidth)
  * screenLightVerticalSpan;
float screenLightRightEdge = exp(-abs(screenLightX - screenLightHalfSize.x) / screenLightEdgeWidth)
  * screenLightVerticalSpan;
float screenLightFourEdges = min(
  screenLightTopEdge + screenLightBottomEdge + screenLightLeftEdge + screenLightRightEdge,
  1.0
);
float screenLightCornerBlend = smoothstep(0.68, 1.0, abs(screenLightX) / screenLightHalfSize.x)
  * smoothstep(0.64, 1.0, abs(screenLightY) / screenLightHalfSize.y);
float screenLightTightWrap = exp(-screenLightOutsideDistance / max(uScreenLightWidth * 0.075, 0.001));
float screenLightSoftWrap = exp(-screenLightOutsideDistance / max(uScreenLightWidth * 0.20, 0.001));
float screenLightRimGroup = screenLightFourEdges * (1.0 + screenLightCornerBlend * 0.14);
float screenLightDepthFade = exp(-screenLightDepth / max(uScreenLightWidth * 0.16, 0.001));
vec3 screenLightDirection = normalize(uScreenLightPosition - vScreenLightWorldPosition);
float screenLightFacing = pow(max(dot(normalize(vScreenLightWorldNormal), screenLightDirection), 0.0), 1.4);
float screenLightLowerLip = mix(1.28, 0.74, smoothstep(-uScreenLightHeight * 0.58, uScreenLightHeight * 0.58, screenLightY));
float screenLightCabinet = (screenLightRimGroup * 0.86 + screenLightTightWrap * 0.22 + screenLightSoftWrap * 0.09)
  * screenLightDepthFade * screenLightFacing * screenLightLowerLip;
totalEmissiveRadiance += uScreenLightColor * screenLightCabinet * (vec3(0.035) + diffuseColor.rgb * 0.28);
`;

    const groundField = `
vec3 screenLightDelta = vScreenLightWorldPosition - uScreenLightPosition;
float screenLightX = dot(screenLightDelta, uScreenLightRight);
float screenLightForwardDepth = dot(screenLightDelta, uScreenLightForward);
float screenLightDepth = max(screenLightForwardDepth, 0.0);
float screenLightDown = max(-dot(screenLightDelta, uScreenLightUp), 0.0);
float screenLightForwardGate = smoothstep(-uScreenLightHeight * 0.06, uScreenLightHeight * 0.18, screenLightForwardDepth);
float screenLightFloorGate = smoothstep(uScreenLightHeight * 0.08, uScreenLightHeight * 0.9, screenLightDown);
vec2 screenLightNoiseUv = vec2(screenLightX, screenLightDepth) / max(uScreenLightWidth, 0.001);
float screenLightReach = exp(-screenLightDepth / max(uScreenLightHeight * 0.82, 0.001));
float screenLightRoadVariation = screenLightFbm(screenLightNoiseUv * 1.15 + vec2(2.3, 8.7));
float screenLightPuddleVariation = screenLightFbm(screenLightNoiseUv * 3.35 + vec2(17.2, 3.6));
float screenLightSpread = uScreenLightWidth * (0.42 + screenLightDepth * 0.30)
  * mix(0.78, 1.18, screenLightRoadVariation);
float screenLightSide = 1.0 - smoothstep(screenLightSpread * 0.56, screenLightSpread, abs(screenLightX));
float screenLightFragments = smoothstep(0.40, 0.76, screenLightPuddleVariation);
float screenLightPool = screenLightForwardGate * screenLightReach * screenLightSide * screenLightSide * screenLightFloorGate;
screenLightPool *= mix(0.10, 1.0, screenLightFragments);
totalEmissiveRadiance += uScreenLightColor * screenLightPool * (0.055 + screenLightRoadVariation * 0.06) * uGroundLightStrength;
totalEmissiveRadiance += uGroundNearColor * screenLightPool * (0.065 + screenLightRoadVariation * 0.09) * uGroundNearStrength;
`;

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${lightFieldFunctions}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${surfaceMode === 'ground' ? groundField : cabinetField}`,
      );
  };
  material.customProgramCacheKey = () => `crt-screen-light-field-${surfaceMode}-3`;
  material.needsUpdate = true;
}


function applyScreenLightField(object, surfaceMode, uniforms) {
  const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
  const patchedMaterials = sourceMaterials.map((sourceMaterial) => {
    const material = sourceMaterial.clone();
    patchMaterialWithScreenLightField(material, surfaceMode, uniforms);
    return material;
  });
  object.material = Array.isArray(object.material) ? patchedMaterials : patchedMaterials[0];
}


// 屏幕光1（用户命名，2026-09-11 确认锁定）：屏幕向外扩散的光晕，不要再改。
function createScreenAtmosphere(pose, color) {
  const halfWidth = pose.width * 3.5;
  const halfHeight = pose.height * 3.6;
  const origin = pose.center.clone().addScaledVector(pose.normal, 0.05);
  const corners = [
    origin.clone().addScaledVector(pose.right, -halfWidth).addScaledVector(pose.up, -halfHeight),
    origin.clone().addScaledVector(pose.right, halfWidth).addScaledVector(pose.up, -halfHeight),
    origin.clone().addScaledVector(pose.right, halfWidth).addScaledVector(pose.up, halfHeight),
    origin.clone().addScaledVector(pose.right, -halfWidth).addScaledVector(pose.up, halfHeight),
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((corner) => corner.toArray()), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtmosphereColor: { value: color.clone() },
    },
    vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

`,
    fragmentShader: `
varying vec2 vUv;
uniform vec3 uAtmosphereColor;

float roundedBoxDistance(vec2 point, vec2 halfSize, float radius) {
  vec2 delta = abs(point) - halfSize + radius;
  return min(max(delta.x, delta.y), 0.0) + length(max(delta, 0.0)) - radius;
}

void main() {
  vec2 point = (vUv - 0.5) * 2.0;
  float distanceFromScreen = roundedBoxDistance(point, vec2(0.1429, 0.1389), 0.0446);
  float scatteredLight = exp(-max(distanceFromScreen, 0.0) * 7.5);
  float lowerBias = mix(1.16, 0.66, smoothstep(0.0, 1.0, vUv.y));
  float alpha = scatteredLight * lowerBias * 0.12;
  gl_FragColor = vec4(uAtmosphereColor, alpha);
}
`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return { mesh, material, geometry };
}

export function createTelevisionPreview(canvas) {
  const host = canvas.parentElement;
  const groundLightLayer = 1;
  const cabinetFillLayer = 2;
  const enableCabinetScreenLight = true;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050606, .19);

  const ambientLight = new THREE.DirectionalLight(0x8a7368, 0.14);
  ambientLight.position.set(.4, 1.5, 3.1);
  ambientLight.target.position.set(-.05, .28, .05);
  ambientLight.castShadow = true;
  ambientLight.shadow.mapSize.set(1024, 1024);
  ambientLight.shadow.camera.near = .5;
  ambientLight.shadow.camera.far = 8;
  ambientLight.shadow.camera.left = -2;
  ambientLight.shadow.camera.right = 2;
  ambientLight.shadow.camera.top = 2;
  ambientLight.shadow.camera.bottom = -2;
  ambientLight.shadow.bias = -0.0015;
  ambientLight.shadow.radius = 4;
  scene.add(ambientLight);
  scene.add(ambientLight.target);


  const camera = new THREE.PerspectiveCamera(31, 1, .05, 40);
  camera.layers.enable(groundLightLayer);
  camera.layers.enable(cabinetFillLayer);
const restingCamera = new THREE.Vector3(.32, 1.2, 3.8);
const cameraTarget = new THREE.Vector3(-.05, .31, .02);
  camera.position.copy(restingCamera);
  camera.lookAt(cameraTarget);

  const mediaCanvas = document.createElement('canvas');
  mediaCanvas.width = 1024;
  mediaCanvas.height = 640;
  const mediaContext = mediaCanvas.getContext('2d', { alpha: false });
  const emissionCanvas = document.createElement('canvas');
  emissionCanvas.width = mediaCanvas.width;
  emissionCanvas.height = mediaCanvas.height;
  const emissionContext = emissionCanvas.getContext('2d', { alpha: true });
  mediaContext.fillStyle = '#071012';
  mediaContext.fillRect(0, 0, mediaCanvas.width, mediaCanvas.height);
  drawCrtFrame(mediaContext, mediaCanvas.width, mediaCanvas.height);

  // 屏闪（2026-09-12 用户要求，参考 lightinthedarkness.it）：屏幕平时是静态的，
  // 每换一个项目才画一次。要让它偶尔抽一下，就得先把「干净画面」另存一份，
  // 闪的那几帧拿它当底重画，闪完再还原——否则一闪就把原画面破坏掉了。
  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = mediaCanvas.width;
  cleanCanvas.height = mediaCanvas.height;
  const cleanContext = cleanCanvas.getContext('2d', { alpha: false });
  function cacheCleanScreen() {
    cleanContext.drawImage(mediaCanvas, 0, 0);
  }
  cacheCleanScreen();

  // 2026-09-12 用户改定：原来"持续循环屏闪"太刺眼，拆成两件独立的事——
  // 1. SWITCH_GLITCH：只在切换项目那一下播一次（撕裂+绿色），播完就停，
  //    不再自己重复。由 setProject 调用 triggerSwitchGlitch() 触发。
  // 2. IDLE_GREEN：平时偶尔（间隔比屏闪稀疏得多）整屏切到绿色调，停一下
  //    再切回来，不做撕裂——参考站那种"故障感"，是更轻的效果。
  // 两者共用 restoreCleanScreen；同一时刻只会有一个在跑（切换时优先）。
  let screenFlickerStrength = 0;

  function restoreCleanScreen() {
    mediaContext.drawImage(cleanCanvas, 0, 0);
    screenFlickerStrength = 0;
    screenTexture.needsUpdate = true;
  }

  const SWITCH_GLITCH = {
    BURST_MIN: 450,
    BURST_MAX: 750,
    endAt: 0,
    active: false,
  };

  function triggerSwitchGlitch(now) {
    SWITCH_GLITCH.active = true;
    SWITCH_GLITCH.endAt = now + SWITCH_GLITCH.BURST_MIN
      + Math.random() * (SWITCH_GLITCH.BURST_MAX - SWITCH_GLITCH.BURST_MIN);
    IDLE_GREEN.active = false; // 切换的动静盖过静止时的绿屏，避免两个效果叠在一起
    IDLE_GREEN.visible = false;
    IDLE_GREEN.nextAt = 0; // 每次换项目后，静止频闪的计时从头开始。
  }

  // 一帧屏闪：干净画面打底，横向撕成几条错位的带子，再压一层绿色色偏。
  function drawSwitchGlitchFrame() {
    const width = mediaCanvas.width;
    const height = mediaCanvas.height;
    mediaContext.globalAlpha = 1;
    mediaContext.globalCompositeOperation = 'source-over';
    mediaContext.drawImage(cleanCanvas, 0, 0);

    // 横向撕裂：随机几条带子整体左右错位，模拟信号不同步。
    const sliceCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sliceCount; i += 1) {
      const sliceY = Math.random() * height;
      const sliceH = height * (0.02 + Math.random() * 0.09);
      const shift = (Math.random() - 0.5) * width * 0.10;
      mediaContext.drawImage(
        cleanCanvas,
        0, sliceY, width, sliceH,
        shift, sliceY, width, sliceH,
      );
    }

    // 绿色色偏：参考站那种屏闪偏绿，用叠加而不是覆盖，保留画面内容。
    mediaContext.globalCompositeOperation = 'lighter';
    const greenFlashAlpha = 0.30 + Math.random() * 0.22;
    screenFlickerStrength = 0.15;
    mediaContext.globalAlpha = greenFlashAlpha;
    mediaContext.fillStyle = '#18c74e';
    mediaContext.fillRect(0, 0, width, height);

    // 偶尔整屏过曝一下，让屏闪有「跳一下」的力度，而不是只有色偏。
    if (Math.random() < 0.40) {
      mediaContext.globalAlpha = 0.14 + Math.random() * 0.18;
      mediaContext.fillStyle = '#9dffc4';
      mediaContext.fillRect(0, 0, width, height);
    }

    mediaContext.globalAlpha = 1;
    mediaContext.globalCompositeOperation = 'source-over';
    screenTexture.needsUpdate = true;
  }

  // 静止时偶尔的双脉冲故障：两次短闪之间让画面归零，再换一组错位带闪第二次。
  // 触发间隔不变；每次换项目会重新开始计时。
  const IDLE_GREEN = {
    GAP_MIN: 3000,
    GAP_MAX: 6500,
    FLASH_COUNT: 2,
    FLASH_MS: 110,
    FLASH_GAP_MS: 80,
    direction: 1, // 1=往右错，-1=往左错；每次触发翻转
    nextAt: 0,
    startAt: 0,
    active: false,
    visible: false,
  };

  function scheduleNextIdleGreen(now) {
    IDLE_GREEN.nextAt = now + IDLE_GREEN.GAP_MIN
      + Math.random() * (IDLE_GREEN.GAP_MAX - IDLE_GREEN.GAP_MIN);
  }

  // 双脉冲的每一帧都换一批错位带，白绿渐变只落在错位区域，保留内容可读性。
  function drawIdleGreenFrame(pulseIndex) {
    const width = mediaCanvas.width;
    const height = mediaCanvas.height;

    mediaContext.globalAlpha = 1;
    mediaContext.globalCompositeOperation = 'source-over';
    mediaContext.drawImage(cleanCanvas, 0, 0);

    const direction = IDLE_GREEN.direction * (pulseIndex % 2 === 0 ? 1 : -1);
    const sliceCount = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < sliceCount; i += 1) {
      const sliceY = Math.random() * height;
      const sliceH = height * (0.012 + Math.random() * 0.072);
      const shift = direction * width * (0.020 + Math.random() * 0.085)
        * (Math.random() < 0.22 ? -0.55 : 1);
      mediaContext.drawImage(
        cleanCanvas,
        0, sliceY, width, sliceH,
        shift, sliceY, width, sliceH,
      );

      const bandGradient = mediaContext.createLinearGradient(0, sliceY, width, sliceY + sliceH);
      bandGradient.addColorStop(0, 'rgba(24, 199, 78, 0.10)');
      bandGradient.addColorStop(0.36, 'rgba(157, 255, 196, 0.32)');
      bandGradient.addColorStop(0.64, 'rgba(24, 199, 78, 0.40)');
      bandGradient.addColorStop(1, 'rgba(238, 255, 243, 0.12)');
      mediaContext.globalCompositeOperation = 'lighter';
      mediaContext.fillStyle = bandGradient;
      mediaContext.fillRect(0, sliceY, width, sliceH);
      mediaContext.globalCompositeOperation = 'source-over';
    }

    screenFlickerStrength = 0.15;
    IDLE_GREEN.visible = true;
    mediaContext.globalAlpha = 1;
    mediaContext.globalCompositeOperation = 'source-over';
    screenTexture.needsUpdate = true;
  }

  function updateGlitch(now) {
    if (SWITCH_GLITCH.active) {
      if (now >= SWITCH_GLITCH.endAt) {
        SWITCH_GLITCH.active = false;
        restoreCleanScreen();
      } else {
        drawSwitchGlitchFrame();
      }
      return;
    }

    if (IDLE_GREEN.nextAt === 0) {
      scheduleNextIdleGreen(now);
      return;
    }
    if (IDLE_GREEN.active) {
      const slotDuration = IDLE_GREEN.FLASH_MS + IDLE_GREEN.FLASH_GAP_MS;
      const elapsed = now - IDLE_GREEN.startAt;
      const pulseIndex = Math.floor(elapsed / slotDuration);
      if (pulseIndex >= IDLE_GREEN.FLASH_COUNT) {
        IDLE_GREEN.active = false;
        IDLE_GREEN.visible = false;
        restoreCleanScreen();
        scheduleNextIdleGreen(now);
      } else if (elapsed % slotDuration < IDLE_GREEN.FLASH_MS) {
        drawIdleGreenFrame(pulseIndex);
      } else if (IDLE_GREEN.visible) {
        IDLE_GREEN.visible = false;
        restoreCleanScreen();
      }
      return;
    }
    if (now >= IDLE_GREEN.nextAt) {
      IDLE_GREEN.active = true;
      IDLE_GREEN.direction *= -1; // 方向交替：这次往左，下次往右
      IDLE_GREEN.startAt = now;
      drawIdleGreenFrame(0);
    }
  }

  const screenTexture = new THREE.CanvasTexture(mediaCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.flipY = false;
  screenTexture.minFilter = THREE.LinearFilter;
  screenTexture.magFilter = THREE.LinearFilter;
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: screenTexture,
    color: 0xd6ffff,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  let active = !document.hidden;
  // 2026-09-13：详情页弹窗打开时，电视这套 WebGL 场景被完全遮住却仍在每帧渲染，
  // 是画廊页常驻掉帧（实测静止时都只有 ~22fps）的主因之一。弹窗打开/关闭
  // 由 works.js 调用 setPaused() 控制这个独立的开关，不复用 `active`——
  // `active` 是跟 visibilitychange 绑定的，标签页切回前台时会被自动设回
  // true，如果弹窗还开着会被误唤醒。
  let modalPaused = false;
  let disposed = false;
  let screenMesh = null;
  let screenAtmosphere = null;
  let groundSpotLight = null;
  let backlight = null;
  let cabinetFillLight = null;
  let cabinetTopLight = null;
  const groundLightNeutralColor = new THREE.Color(0xc3d2d5);
  const idleGreenGroundColor = new THREE.Color(0x2c8e4c);
  const groundSpotBaseIntensity = 1.62;
  const groundFieldBaseStrength = 0.21;
  const groundNearBaseStrength = 0.65;
  // 地面用的色：屏幕主色是整屏平均值，实测是 #f4ded7 这种几乎发白的淡粉
  // （大片过曝的白把红稀释了），直接拿来点灯地面只会是白的。
  // 所以先把它的色相提取出来、饱和度拉起来、亮度压下去，再给地面用。
  // 不动 uScreenLightColor 本身——屏幕光1 和机框染色都依赖它，且屏幕光1 已锁定。
  const groundTintColor = new THREE.Color();
  const groundTintHsl = { h: 0, s: 0, l: 0 };
  const screenLightUniforms = {
    uScreenLightPosition: { value: new THREE.Vector3() },
    uScreenLightForward: { value: new THREE.Vector3(0, 0, 1) },
    uScreenLightRight: { value: new THREE.Vector3(1, 0, 0) },
    uScreenLightUp: { value: new THREE.Vector3(0, 1, 0) },
    uScreenLightColor: { value: new THREE.Color(0xd7f1f2) },
    uScreenLightWidth: { value: 1 },
    uScreenLightHeight: { value: 1 },
    uGroundLightStrength: { value: groundFieldBaseStrength },
    uGroundNearColor: { value: new THREE.Color(0xbfdde2) },
    uGroundNearStrength: { value: groundNearBaseStrength },
  };
  const targetScreenLightColor = screenLightUniforms.uScreenLightColor.value.clone();

  function resize() {
    const rect = host.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }

  function setProject(project) {
    const fallbackLightColor = new THREE.Color(project.previewColor.hex)
      .lerp(new THREE.Color(0xd7f1f2), .58);
    targetScreenLightColor.copy(fallbackLightColor);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (disposed) return;
      mediaContext.fillStyle = '#071012';
      mediaContext.fillRect(0, 0, mediaCanvas.width, mediaCanvas.height);
      drawCover(mediaContext, emissionContext, image, mediaCanvas.width, mediaCanvas.height);
      drawCrtFrame(mediaContext, mediaCanvas.width, mediaCanvas.height);
      cacheCleanScreen();
      screenTexture.needsUpdate = true;
      targetScreenLightColor.copy(getWeightedScreenColor(
        emissionContext,
        emissionCanvas.width,
        emissionCanvas.height,
        fallbackLightColor,
      ));
      triggerSwitchGlitch(performance.now());
    };
    image.src = project.cover;
    image.onerror = () => {
      mediaContext.fillStyle = '#071012';
      mediaContext.fillRect(0, 0, mediaCanvas.width, mediaCanvas.height);
      drawCrtFrame(mediaContext, mediaCanvas.width, mediaCanvas.height);
      cacheCleanScreen();
      screenTexture.needsUpdate = true;
      triggerSwitchGlitch(performance.now());
    };

    screenMaterial.color.set(0xffffff);
    host.style.setProperty('--screen-rgb', project.previewColor.css);
  }

  const loader = new GLTFLoader();
  const modelReady = new Promise((resolve, reject) => {
    loader.load(MODEL_URL, (gltf) => {
      const model = gltf.scene;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = object.name !== 'pitted_concrete_floor';
        object.receiveShadow = true;
        if (object.name === 'CRT_television_body' && enableCabinetScreenLight) {
          applyScreenLightField(object, 'cabinet', screenLightUniforms);
          object.layers.enable(cabinetFillLayer);
        } else if (object.name === 'pitted_concrete_floor') {
          object.layers.enable(groundLightLayer);
        }
      });
      screenMesh = model.getObjectByName('CRT_screen_replaceable');
      if (!screenMesh || !screenMesh.isMesh) {
        reject(new Error('Television screen mesh was not found in the GLB.'));
        return;
      }
      const cabinetMesh = model.getObjectByName('CRT_television_body');
      const forwardOffset = .20;
      const clockwiseTurn = THREE.MathUtils.degToRad(-5);
      screenMesh.position.z += forwardOffset;
      cabinetMesh.position.z += forwardOffset;
      screenMesh.rotation.y = clockwiseTurn;
      cabinetMesh.rotation.y = clockwiseTurn;
      screenMesh.material = screenMaterial;
      screenMesh.renderOrder = 1;
      scene.add(model);
      model.updateMatrixWorld(true);

      const cabinetFootprint = new THREE.Box3().setFromObject(cabinetMesh);
      const footprintCenter = cabinetFootprint.getCenter(new THREE.Vector3());
      const footprintSize = cabinetFootprint.getSize(new THREE.Vector3());
      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(footprintSize.x * 1.7, footprintSize.z * 2.1),
        new THREE.MeshBasicMaterial({
          map: createContactShadowTexture(),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.rotation.z = clockwiseTurn;
      contactShadow.position.set(footprintCenter.x, cabinetFootprint.min.y + .003, footprintCenter.z);
      contactShadow.renderOrder = 0;
      scene.add(contactShadow);

      const emission = getScreenEmissionPose(screenMesh, camera);
      screenLightUniforms.uScreenLightPosition.value.copy(emission.center);
      screenLightUniforms.uScreenLightForward.value.copy(emission.normal);
      screenLightUniforms.uScreenLightRight.value.copy(emission.right);
      screenLightUniforms.uScreenLightUp.value.copy(emission.up);
      screenLightUniforms.uScreenLightWidth.value = emission.width;
      screenLightUniforms.uScreenLightHeight.value = emission.height;

      cabinetFillLight = new THREE.DirectionalLight(0x9ca7aa, 0.2);
      cabinetFillLight.name = '前景灯';
      cabinetFillLight.layers.set(cabinetFillLayer);
      cabinetFillLight.position.copy(footprintCenter)
        .addScaledVector(emission.right, -4)
        .addScaledVector(emission.up, 3)
        .addScaledVector(emission.normal, 5);
      cabinetFillLight.target.position.copy(footprintCenter);
      cabinetFillLight.castShadow = false;
      scene.add(cabinetFillLight);
      scene.add(cabinetFillLight.target);

      cabinetTopLight = new THREE.SpotLight(
        0xaebcc0,
        5.5,
        10,
        THREE.MathUtils.degToRad(34),
        1,
        1.5,
      );
      cabinetTopLight.name = '顶光';
      cabinetTopLight.layers.set(cabinetFillLayer);
      cabinetTopLight.position.copy(footprintCenter)
        .addScaledVector(emission.up, 6);
      cabinetTopLight.target.position.copy(footprintCenter)
        .addScaledVector(emission.up, 0.25);
      cabinetTopLight.castShadow = false;
      scene.add(cabinetTopLight);
      scene.add(cabinetTopLight.target);

      screenAtmosphere = createScreenAtmosphere(
        emission,
        screenLightUniforms.uScreenLightColor.value,
      );
      scene.add(screenAtmosphere.mesh);

      groundSpotLight = new THREE.SpotLight(
        groundLightNeutralColor,
        groundSpotBaseIntensity,
        2.55,
        THREE.MathUtils.degToRad(40),
        1,
        2,
      );
      groundSpotLight.name = '地面光1';
      groundSpotLight.layers.set(groundLightLayer);
      const screenForward = emission.normal.clone().setY(0).normalize();
      const groundLightBodyClearance = 0.30;
      const spotlightDirection = new THREE.Vector3(0, -Math.cos(Math.PI / 4), 0)
        .addScaledVector(screenForward, Math.sin(Math.PI / 4));
      groundSpotLight.position.copy(emission.center)
        .addScaledVector(screenForward, groundLightBodyClearance);
      groundSpotLight.position.y = cabinetFootprint.max.y;
      groundSpotLight.target.position.copy(groundSpotLight.position)
        .addScaledVector(spotlightDirection, groundSpotLight.distance);
      groundSpotLight.castShadow = false;
      scene.add(groundSpotLight);
      scene.add(groundSpotLight.target);

      const backlightHeight = 0.5;
      const cabinetCenterDepth = footprintCenter.dot(emission.normal);
      const cabinetRearDepth = Math.min(
        ...[
          new THREE.Vector3(cabinetFootprint.min.x, cabinetFootprint.min.y, cabinetFootprint.min.z),
          new THREE.Vector3(cabinetFootprint.min.x, cabinetFootprint.min.y, cabinetFootprint.max.z),
          new THREE.Vector3(cabinetFootprint.min.x, cabinetFootprint.max.y, cabinetFootprint.min.z),
          new THREE.Vector3(cabinetFootprint.min.x, cabinetFootprint.max.y, cabinetFootprint.max.z),
          new THREE.Vector3(cabinetFootprint.max.x, cabinetFootprint.min.y, cabinetFootprint.min.z),
          new THREE.Vector3(cabinetFootprint.max.x, cabinetFootprint.min.y, cabinetFootprint.max.z),
          new THREE.Vector3(cabinetFootprint.max.x, cabinetFootprint.max.y, cabinetFootprint.min.z),
          new THREE.Vector3(cabinetFootprint.max.x, cabinetFootprint.max.y, cabinetFootprint.max.z),
        ].map((corner) => corner.dot(emission.normal)),
      );
      backlight = new THREE.PointLight(0xb9c4c7, 2, 4, 1.2);
      backlight.name = '背光';
      backlight.position.copy(footprintCenter)
        .addScaledVector(emission.normal, cabinetRearDepth - cabinetCenterDepth - 2)
        .addScaledVector(emission.right, -0.30)
        .addScaledVector(emission.up, backlightHeight);
      backlight.castShadow = true;
      backlight.shadow.mapSize.set(512, 512);
      backlight.shadow.camera.near = 0.05;
      backlight.shadow.camera.far = 5;
      backlight.shadow.bias = -0.001;
      scene.add(backlight);
      resolve();
    }, undefined, reject);
  });

  document.addEventListener('visibilitychange', () => { active = !document.hidden; });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  let previousFrameTime = performance.now();
  function render(frameTime = performance.now()) {
    if (disposed) return;
    requestAnimationFrame(render);
    if (!active || modalPaused) return;

    const deltaSeconds = Math.min((frameTime - previousFrameTime) / 1000, .1);
    previousFrameTime = frameTime;
    const colorBlend = 1 - Math.exp(-deltaSeconds * 3.2);
    screenLightUniforms.uScreenLightColor.value.lerp(targetScreenLightColor, colorBlend);
    if (screenAtmosphere) {
      screenAtmosphere.material.uniforms.uAtmosphereColor.value.copy(screenLightUniforms.uScreenLightColor.value);
    }
    updateGlitch(frameTime);
    // 地面光跟随屏幕颜色（2026-09-12 用户要求）：屏幕偏红地面就泛红，换项目会跟着变。
    // 先把屏幕主色调成「看得出颜色」的版本（见 groundTintColor 处的说明）。
    // ⚠ 饱和度必须原样保留，不能统一拉高。实测各项目的屏幕主色饱和度：
    // PARADOX 0.72、FANTASY 0.65（彩色）；有道 0.27、BUBBLE 0.29（白屏）。
    // 源头本身就区分好了——白屏的项目地面就该偏白，彩色的才泛色。
    // 之前用「×3.2 + 0.22」一律顶到 0.86，把白屏项目也染成了彩色，是错的。
    // 地面原来发灰的真正原因是亮度太高（l 有 0.79~0.93），压 l 就够了。
    screenLightUniforms.uScreenLightColor.value.getHSL(groundTintHsl);
    groundTintColor.setHSL(
      groundTintHsl.h,
      groundTintHsl.s,
      Math.min(groundTintHsl.l, 0.55),
    );
    if (groundSpotLight) {
      groundSpotLight.color.copy(groundTintColor).lerp(groundLightNeutralColor, 0.16);
      if (IDLE_GREEN.visible) {
        groundSpotLight.color.lerp(idleGreenGroundColor, 0.36);
      }
      const groundFlickerMultiplier = 1 + screenFlickerStrength;
      groundSpotLight.intensity = groundSpotBaseIntensity * groundFlickerMultiplier;
      screenLightUniforms.uGroundLightStrength.value = groundFieldBaseStrength * groundFlickerMultiplier;
      screenLightUniforms.uGroundNearStrength.value = groundNearBaseStrength * groundFlickerMultiplier;
    }
    // 近地那层光原本是写死的冷蓝色，不跟屏幕联动，会把地面拉回偏蓝。
    screenLightUniforms.uGroundNearColor.value
      .copy(groundTintColor)
      .lerp(groundLightNeutralColor, 0.24);
    if (IDLE_GREEN.visible) {
      screenLightUniforms.uGroundNearColor.value.lerp(idleGreenGroundColor, 0.36);
    }
    renderer.render(scene, camera);
  }
  render();

  return modelReady.then(() => ({
    setProject,
    // 暂停期间 render() 整帧跳过，updateGlitch 也停摆，但 IDLE_GREEN.nextAt 是用真实
    // 时钟（performance.now()）算的、没人去挪它——弹窗开着的这几秒/几分钟一过，
    // 恢复时 frameTime 早就超过了那个早就该触发的 nextAt，第一帧立刻补一次屏闪，
    // 观感就是"关闭详情页=触发一次屏闪"，和正常循环的节奏对不上。
    // 恢复时重新排一次表（用当下时间起算），让它接回正常的随机间隔循环，
    // 而不是清算暂停期间欠下的那一下。
    setPaused(value) {
      const wasPaused = modalPaused;
      modalPaused = !!value;
      if (wasPaused && !modalPaused) {
        scheduleNextIdleGreen(performance.now());
      }
    },
    // 2026-09-13 用户要求：关闭详情弹窗那一下要有一次屏闪，作为"回到电视机"的反馈。
    // 直接复用切换项目那套撕裂+绿色闪烁（triggerSwitchGlitch），它自己会把
    // IDLE_GREEN.nextAt 清零；闪完之后 updateGlitch 会用那一刻的时间重新排下一次
    // 随机屏闪，所以这次"主动触发"的闪不会打乱之后的循环节奏。
    flash() {
      if (modalPaused) return;
      triggerSwitchGlitch(performance.now());
    },
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      renderer.dispose();
      screenTexture.dispose();
      screenMaterial.dispose();
      if (screenAtmosphere) {
        screenAtmosphere.geometry.dispose();
        screenAtmosphere.material.dispose();
      }
      if (groundSpotLight) {
        scene.remove(groundSpotLight);
        scene.remove(groundSpotLight.target);
      }
      if (backlight) {
        scene.remove(backlight);
      }
      if (cabinetFillLight) {
        scene.remove(cabinetFillLight);
        scene.remove(cabinetFillLight.target);
      }
      if (cabinetTopLight) {
        scene.remove(cabinetTopLight);
        scene.remove(cabinetTopLight.target);
      }
    },
  }));
}
