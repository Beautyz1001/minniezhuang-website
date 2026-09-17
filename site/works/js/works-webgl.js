import * as THREE from './lib/three.module.js';

const canvas = document.getElementById('worksWebglTransition');

if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const loader = new THREE.TextureLoader();
    const cache = new Map();
    const uniforms = {
      uFrom: { value: null },
      uTo: { value: null },
      uFromSize: { value: new THREE.Vector2(1, 1) },
      uToSize: { value: new THREE.Vector2(1, 1) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uProgress: { value: 0 },
      uDirection: { value: 1 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uFrom;
        uniform sampler2D uTo;
        uniform vec2 uFromSize;
        uniform vec2 uToSize;
        uniform vec2 uResolution;
        uniform float uProgress;
        uniform float uDirection;

        vec2 coverUv(vec2 uv, vec2 imageSize) {
          float screenAspect = uResolution.x / uResolution.y;
          float imageAspect = imageSize.x / imageSize.y;
          if (screenAspect > imageAspect) {
            uv.y = (uv.y - .5) * imageAspect / screenAspect + .5;
          } else {
            uv.x = (uv.x - .5) * screenAspect / imageAspect + .5;
          }
          return uv;
        }

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          float fold = sin(uProgress * 3.14159265);
          vec2 centered = vUv - .5;
          float radius = length(centered);
          vec2 radial = radius > .0001 ? centered / radius : vec2(0.0);

          // A restrained lens-like compression: it is strongest only halfway through.
          vec2 fromUv = .5 + centered * (1.0 + .115 * fold);
          vec2 toUv = .5 + centered * (1.0 - .085 * fold);
          fromUv += radial * .018 * fold * (1.0 - radius);
          toUv -= radial * .014 * fold * (1.0 - radius);

          float axis = uDirection > 0.0 ? vUv.y : 1.0 - vUv.y;
          float grain = hash(floor(vUv * vec2(90.0, 54.0))) - .5;
          float contour = axis + sin(vUv.x * 8.0 + centered.y * 3.0) * .035 * fold + grain * .012 * fold;
          float threshold = mix(-.12, 1.12, uProgress);
          float reveal = smoothstep(threshold - .08, threshold + .08, contour);
          reveal = 1.0 - reveal;

          vec3 fromColor = texture2D(uFrom, coverUv(fromUv, uFromSize)).rgb;
          vec3 toColor = texture2D(uTo, coverUv(toUv, uToSize)).rgb;
          vec3 color = mix(fromColor, toColor, reveal);
          color *= 1.0 - .12 * fold;

          // A narrow soft seam reads as depth, then disappears completely.
          float seam = 1.0 - smoothstep(.0, .09, abs(contour - threshold));
          color += vec3(.035, .025, .055) * seam * fold;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      uniforms.uResolution.value.set(rect.width, rect.height);
    }

    function loadTexture(src) {
      if (!cache.has(src)) {
        cache.set(src, new Promise((resolve, reject) => {
          loader.load(src, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            resolve(texture);
          }, undefined, reject);
        }));
      }
      return cache.get(src);
    }

    async function transition(fromSrc, toSrc, direction) {
      const [fromTexture, toTexture] = await Promise.all([
        loadTexture(fromSrc),
        loadTexture(toSrc),
      ]);
      resize();
      uniforms.uFrom.value = fromTexture;
      uniforms.uTo.value = toTexture;
      uniforms.uFromSize.value.set(fromTexture.image.width, fromTexture.image.height);
      uniforms.uToSize.value.set(toTexture.image.width, toTexture.image.height);
      uniforms.uDirection.value = direction;
      uniforms.uProgress.value = 0;
      canvas.classList.add('is-active');

      return new Promise((resolve) => {
        gsap.to(uniforms.uProgress, {
          value: 1,
          duration: .9,
          ease: 'power3.inOut',
          onUpdate: () => renderer.render(scene, camera),
          onComplete: () => {
            canvas.classList.remove('is-active');
            resolve();
          },
        });
      });
    }

    window.addEventListener('resize', resize);
    window.WORKS_WEBGL = { transition, preload: loadTexture };
    loadTexture('projects/paradox-heaven/banner-display.jpg');
    loadTexture('projects/nba2k-online/banner-display.jpg');
  } catch (error) {
    console.warn('Works WebGL transition unavailable; using GSAP fallback.', error);
  }
}
