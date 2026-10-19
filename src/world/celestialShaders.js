import * as THREE from "three";

// Procedural Realistic Lunar Surface Texture Generator (1024 x 512).
// Generates accurate selenographic features:
// - Basaltic dark maria (Imbrium, Procellarum, Serenitatis, Tranquillitatis, Crisium, etc.)
// - Anorthosite highlands with crater mottling
// - Iconic impact craters with dramatic radial ejecta ray systems (Tycho, Copernicus, Kepler, Aristarchus)
export function createRealisticMoonTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // 1. Base Anorthositic Highlands (Silvery Pearlescent Gray)
  const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0, "#bfc7d2");
  baseGrad.addColorStop(0.5, "#cbd3de");
  baseGrad.addColorStop(1, "#bcc4cf");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Micro-surface Mottling (Highland Terrain Noise)
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    data[i]     = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n + 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // Helper to draw soft organic lunar maria (dark volcanic basalt plains)
  const drawMare = (cx, cy, rx, ry, color1 = "rgba(50, 54, 62, 0.88)", color2 = "rgba(65, 70, 80, 0.5)") => {
    ctx.save();
    ctx.translate(cx * width, cy * height);
    ctx.scale(rx * width, ry * height);
    const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    radGrad.addColorStop(0, color1);
    radGrad.addColorStop(0.65, color2);
    radGrad.addColorStop(1, "rgba(80, 85, 95, 0)");
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 3. Iconic Lunar Basaltic Maria (Centered on Moon's Near-side at lon ~0.5)
  // Mare Imbrium (Sea of Rains)
  drawMare(0.44, 0.34, 0.13, 0.11, "rgba(42, 45, 52, 0.92)", "rgba(58, 63, 72, 0.6)");
  drawMare(0.41, 0.32, 0.08, 0.07, "rgba(38, 41, 48, 0.95)", "rgba(54, 58, 67, 0.5)");

  // Oceanus Procellarum (Ocean of Storms - sprawling western basalt expanse)
  drawMare(0.30, 0.44, 0.17, 0.22, "rgba(45, 48, 56, 0.88)", "rgba(62, 67, 76, 0.45)");
  drawMare(0.24, 0.38, 0.11, 0.14, "rgba(48, 52, 60, 0.82)", "rgba(65, 70, 80, 0.4)");
  drawMare(0.26, 0.54, 0.12, 0.15, "rgba(44, 48, 55, 0.85)", "rgba(60, 65, 74, 0.4)");

  // Mare Serenitatis (Sea of Serenity)
  drawMare(0.57, 0.36, 0.09, 0.09, "rgba(48, 52, 60, 0.90)", "rgba(66, 72, 82, 0.5)");

  // Mare Tranquillitatis (Sea of Tranquility - Apollo 11)
  drawMare(0.61, 0.46, 0.11, 0.10, "rgba(40, 44, 52, 0.93)", "rgba(58, 64, 73, 0.55)");

  // Mare Crisium (Sea of Crises - isolated eastern oval sea)
  drawMare(0.74, 0.39, 0.065, 0.075, "rgba(38, 42, 49, 0.95)", "rgba(55, 60, 70, 0.45)");

  // Mare Fecunditatis & Mare Nectaris
  drawMare(0.68, 0.56, 0.09, 0.09, "rgba(46, 50, 58, 0.85)", "rgba(64, 69, 78, 0.4)");
  drawMare(0.59, 0.60, 0.065, 0.065, "rgba(45, 49, 57, 0.85)", "rgba(62, 67, 76, 0.4)");

  // Mare Nubium & Mare Humorum (South-West)
  drawMare(0.41, 0.64, 0.095, 0.085, "rgba(44, 48, 56, 0.88)", "rgba(62, 68, 77, 0.45)");
  drawMare(0.31, 0.66, 0.06, 0.06, "rgba(42, 46, 54, 0.90)", "rgba(60, 65, 74, 0.4)");

  // 4. Iconic Impact Craters with Terraces & Radial Ejecta Ray Systems
  // Helper for impact craters
  const drawCrater = (x, y, radius, hasRays = false, rayCount = 12, rayLength = 180) => {
    const px = x * width;
    const py = y * height;

    // Ejecta Rays (High-albedo streaks radiating outward)
    if (hasRays) {
      ctx.save();
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const len = rayLength * (0.7 + Math.random() * 0.6);
        const rayGrad = ctx.createLinearGradient(
          px,
          py,
          px + Math.cos(angle) * len,
          py + Math.sin(angle) * len
        );
        rayGrad.addColorStop(0, "rgba(255, 255, 255, 0.65)");
        rayGrad.addColorStop(0.3, "rgba(240, 246, 255, 0.35)");
        rayGrad.addColorStop(1, "rgba(220, 230, 245, 0.0)");

        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = 1.8 + Math.random() * 2.0;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Crater Rim & Central Peak
    const rimGrad = ctx.createRadialGradient(px, py, radius * 0.3, px, py, radius);
    rimGrad.addColorStop(0, "#ffffff");
    rimGrad.addColorStop(0.5, "#484d56");
    rimGrad.addColorStop(0.85, "#ffffff");
    rimGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // Tycho Crater (Spectacular southern impact crater with 1,500km radial ray network)
  drawCrater(0.48, 0.76, 11, true, 22, 280);

  // Copernicus Crater (Terraced impact in Oceanus Procellarum with bright ejecta halo)
  drawCrater(0.38, 0.43, 10, true, 16, 140);

  // Kepler Crater (Western bright ray beacon)
  drawCrater(0.28, 0.44, 7, true, 12, 90);

  // Aristarchus Crater (The brightest localized feature on the lunar surface)
  drawCrater(0.22, 0.36, 6, true, 8, 60);

  // Plato Crater (Dark basalt-filled crater on the north rim of Mare Imbrium)
  drawMare(0.42, 0.23, 0.025, 0.018, "rgba(32, 35, 42, 0.95)", "rgba(45, 50, 60, 0.8)");

  // 5. Scatter Realistic Micro-Craters Across Highlands
  for (let i = 0; i < 300; i++) {
    const rx = Math.random();
    const ry = Math.random();
    // Concentrate more in highlands (outside maria)
    const size = 1.2 + Math.random() * 3.5;
    const px = rx * width;
    const py = ry * height;

    ctx.fillStyle = Math.random() > 0.4 ? "rgba(255, 255, 255, 0.5)" : "rgba(35, 40, 50, 0.45)";
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ========================================================================
// 1. REALISTIC RADIANT SUN DISC (Billboard Quad with Luminous Solar Core)
// ========================================================================
export function createSunShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunsetFactor: { value: 0.0 }, // 0 = midday pure white, 1 = sunset crimson
      uOpacity: { value: 1.0 },
    },
    // glsl
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // glsl
    fragmentShader: `
      uniform float uTime;
      uniform float uSunsetFactor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0; // 0.0 at center, 1.0 at outer edge

        if (dist >= 1.0) discard;

        // 1. Blinding White-Hot Photosphere Core Disc
        // Sharp yet softly anti-aliased edge
        float core = smoothstep(0.36, 0.28, dist);

        // 2. Chromosphere Limb Glow (Smooth Gaussian optical falloff)
        float limbGlow = exp(-pow(dist * 3.2, 2.0));

        // 3. Dynamic Micro-Rays (Gentle optical diffraction shimmer)
        float angle = atan(center.y, center.x);
        float t = uTime * 0.08;
        float ray1 = sin(angle * 8.0 + t) * 0.5 + 0.5;
        float ray2 = sin(angle * 16.0 - t * 1.4) * 0.5 + 0.5;
        float rays = (ray1 * 0.6 + ray2 * 0.4) * pow(max(0.0, 1.0 - dist), 2.5) * 0.35;

        // 4. Middle Corona Expansion
        float corona = pow(max(0.0, 1.0 - dist), 2.8) * 0.75;

        // 5. Chromatic Sunset / High Noon Color Blending
        // Midday: Blinding pure white core with warm platinum-gold corona
        vec3 middayCore = vec3(1.0, 1.0, 1.0);
        vec3 middayCorona = vec3(1.0, 0.94, 0.78);

        // Sunset: Fiery golden-amber core with rich crimson-orange flare
        vec3 sunsetCore = vec3(1.0, 0.68, 0.25);
        vec3 sunsetCorona = vec3(0.98, 0.28, 0.04);

        vec3 coreColor = mix(middayCore, sunsetCore, uSunsetFactor);
        vec3 coronaColor = mix(middayCorona, sunsetCorona, uSunsetFactor);

        // Composite final radiant emission
        vec3 finalColor = core * coreColor * 2.5 + (limbGlow + corona + rays) * coronaColor * 1.6;

        // Smooth cubic edge falloff to eliminate any clipping artifacts
        float alpha = (core + limbGlow * 0.8 + corona * 0.6 + rays) * smoothstep(1.0, 0.75, dist) * uOpacity;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

// ========================================================================
// 2. REALISTIC SUN CORONA & ATMOSPHERIC BLOOM (Wide Flare Quad)
// ========================================================================
export function createSunCoronaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunsetFactor: { value: 0.0 },
      uOpacity: { value: 1.0 },
    },
    // glsl
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // glsl
    fragmentShader: `
      uniform float uTime;
      uniform float uSunsetFactor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;

        if (dist >= 1.0) discard;

        // Wide volumetric atmospheric optical bloom falloff
        float bloom = pow(max(0.0, 1.0 - dist), 3.2);
        float outerHalo = pow(max(0.0, 1.0 - dist), 1.8) * 0.4;

        // Dynamic harmonic ray streamers
        float angle = atan(center.y, center.x);
        float t = uTime * 0.05;
        float ray = sin(angle * 6.0 + t) * sin(angle * 12.0 - t * 0.7);
        float rays = pow(max(0.0, ray), 2.0) * bloom * 0.4;

        // Chromatic transition
        vec3 dayColor = vec3(1.0, 0.90, 0.65);
        vec3 sunsetColor = vec3(1.0, 0.32, 0.05);
        vec3 col = mix(dayColor, sunsetColor, uSunsetFactor);

        float alpha = (bloom + outerHalo + rays) * smoothstep(1.0, 0.8, dist) * uOpacity;

        gl_FragColor = vec4(col * alpha * 1.4, alpha * 0.75);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

// ========================================================================
// 3. REALISTIC LUNAR SURFACE SHADER (Photorealistic Map + Regolith Scattering)
// ========================================================================
export function createMoonShaderMaterial(moonTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: moonTexture },
      uSunDirection: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
      uOpacity: { value: 1.0 },
    },
    // glsl
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    // glsl
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDirection;
      uniform float uOpacity;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDirection);
        vec3 V = normalize(cameraPosition - vWorldPosition);

        // 1. Lommel-Seeliger Law for Lunar Regolith Dust (Retro-Reflection / Opposition Effect)
        // Eliminates dark edges on the full moon, matching real astrophotography
        float NdotL = dot(N, L);
        float NdotV = max(0.001, dot(N, V));

        float sunLit = max(0.0, NdotL);
        float hapke = sunLit / (sunLit + NdotV + 0.08);

        // 2. High-Resolution Lunar Surface Map
        vec4 tex = texture2D(uMap, vUv);
        vec3 albedo = tex.rgb;

        // 3. Subtle Highlands Specular Sheen
        vec3 H = normalize(L + V);
        float specular = pow(max(0.0, dot(N, H)), 24.0) * 0.12 * albedo.r;

        // 4. Subtle Earthshine on the Shadowed Lunar Crescent (Pale Indigo-Blue)
        float darkSide = max(0.0, -NdotL);
        vec3 earthshine = vec3(0.04, 0.07, 0.12) * darkSide * 0.35;

        // 5. Final Surface Composition
        vec3 sunLightColor = vec3(1.0, 0.98, 0.95);
        vec3 finalColor = albedo * (hapke * sunLightColor * 1.95 + specular + earthshine);

        // Soft subtle lunar limb brightening
        float rim = pow(1.0 - NdotV, 4.0) * 0.14;
        finalColor += rim * vec3(0.85, 0.92, 1.0) * smoothstep(0.0, 0.2, sunLit);

        gl_FragColor = vec4(finalColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

// ========================================================================
// 4. REALISTIC ETHEREAL LUNAR ATMOSPHERIC HALO (Billboard Quad)
// ========================================================================
export function createMoonGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMoonGlowColor: { value: new THREE.Color(0xa5d8ff) },
      uNightFactor: { value: 1.0 },
      uOpacity: { value: 1.0 },
    },
    // glsl
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // glsl
    fragmentShader: `
      uniform vec3 uMoonGlowColor;
      uniform float uNightFactor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;

        if (dist >= 1.0) discard;

        // Soft ethereal lunar ice-crystal halo falloff
        float innerHaze = pow(max(0.0, 1.0 - dist), 3.2);
        float outerHalo = pow(max(0.0, 1.0 - dist), 1.6) * 0.45;
        float alpha = (innerHaze * 0.75 + outerHalo * 0.35) * uNightFactor * uOpacity * smoothstep(1.0, 0.8, dist);

        // Silvery-white center blending into pale ice-blue outer rim
        vec3 col = mix(uMoonGlowColor, vec3(0.92, 0.96, 1.0), pow(max(0.0, 1.0 - dist), 2.5));

        gl_FragColor = vec4(col * alpha * 1.4, alpha * 0.85);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}
