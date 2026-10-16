import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import {
  createRealisticMoonTexture,
  createSunShaderMaterial,
  createSunCoronaMaterial,
  createMoonShaderMaterial,
  createMoonGlowMaterial,
} from "../world/celestialShaders.js";

/**
 * 24-Hour Keyframe Table for Smooth Astronomical and Atmospheric Interpolation.
 * Seamlessly loops from 24:00 back to 00:00 without discontinuities.
 */
const KEYFRAMES = [
  {
    hour: 0.0, // Midnight
    name: "NIGHT",
    badge: "🌙 Midnight",
    fog: "#040711",
    turbidity: 2.0,
    rayleigh: 0.5,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.8,
    exposure: 0.68,
    sunColor: "#ff9040",
    sunIntensity: 0.0,
    moonIntensity: 0.38,
    hemiSky: "#121a2d",
    hemiGround: "#040812",
    hemiIntensity: 0.38,
    envIntensity: 0.12,
    nightFactor: 1.0,
    starOpacity: 0.95,
  },
  {
    hour: 4.5, // Late Night
    name: "LATE_NIGHT",
    badge: "🌌 Deep Night",
    fog: "#050914",
    turbidity: 2.2,
    rayleigh: 0.6,
    mieCoefficient: 0.0025,
    mieDirectionalG: 0.8,
    exposure: 0.68,
    sunColor: "#ff8030",
    sunIntensity: 0.0,
    moonIntensity: 0.34,
    hemiSky: "#131b2e",
    hemiGround: "#050914",
    hemiIntensity: 0.4,
    envIntensity: 0.15,
    nightFactor: 0.95,
    starOpacity: 0.95,
  },
  {
    hour: 5.5, // Pre-Dawn Blue Hour
    name: "PRE_DAWN",
    badge: "🌌 Pre-Dawn",
    fog: "#111827",
    turbidity: 4.5,
    rayleigh: 1.8,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.82,
    exposure: 0.74,
    sunColor: "#ff7a29",
    sunIntensity: 0.3,
    moonIntensity: 0.22,
    hemiSky: "#272e59",
    hemiGround: "#0d1322",
    hemiIntensity: 0.55,
    envIntensity: 0.3,
    nightFactor: 0.75,
    starOpacity: 0.6,
  },
  {
    hour: 6.5, // Golden Sunrise / Dawn
    name: "SUNRISE",
    badge: "🌄 Sunrise",
    fog: "#6b21a8",
    turbidity: 8.5,
    rayleigh: 3.8,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.84,
    exposure: 0.88,
    sunColor: "#ff9138",
    sunIntensity: 2.0,
    moonIntensity: 0.05,
    hemiSky: "#fb923c",
    hemiGround: "#431407",
    hemiIntensity: 0.95,
    envIntensity: 0.7,
    nightFactor: 0.3,
    starOpacity: 0.1,
  },
  {
    hour: 7.5, // Early Morning
    name: "EARLY_MORNING",
    badge: "🌤️ Early Morning",
    fog: "#60a5fa",
    turbidity: 3.5,
    rayleigh: 1.8,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.82,
    exposure: 0.95,
    sunColor: "#ffe5b4",
    sunIntensity: 2.6,
    moonIntensity: 0.0,
    hemiSky: "#93c5fd",
    hemiGround: "#1e293b",
    hemiIntensity: 1.15,
    envIntensity: 0.9,
    nightFactor: 0.0,
    starOpacity: 0.0,
  },
  {
    hour: 9.0, // Crisp Morning
    name: "MORNING",
    badge: "🌤️ Morning",
    fog: "#73b4e6",
    turbidity: 2.5,
    rayleigh: 1.3,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.82,
    exposure: 0.98,
    sunColor: "#fff4dd",
    sunIntensity: 2.9,
    moonIntensity: 0.0,
    hemiSky: "#a5d8ff",
    hemiGround: "#334155",
    hemiIntensity: 1.25,
    envIntensity: 0.95,
    nightFactor: 0.0,
    starOpacity: 0.0,
  },
  {
    hour: 12.0, // High Noon
    name: "HIGH_NOON",
    badge: "☀️ High Noon",
    fog: "#7db7e8",
    turbidity: 2.0,
    rayleigh: 1.0,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.82,
    exposure: 1.0,
    sunColor: "#ffffff",
    sunIntensity: 3.2,
    moonIntensity: 0.0,
    hemiSky: "#bae6fd",
    hemiGround: "#334155",
    hemiIntensity: 1.3,
    envIntensity: 1.0,
    nightFactor: 0.0,
    starOpacity: 0.0,
  },
  {
    hour: 15.5, // Late Afternoon
    name: "AFTERNOON",
    badge: "☀️ Afternoon",
    fog: "#68aae0",
    turbidity: 2.8,
    rayleigh: 1.4,
    mieCoefficient: 0.0038,
    mieDirectionalG: 0.82,
    exposure: 0.98,
    sunColor: "#fff0cb",
    sunIntensity: 2.9,
    moonIntensity: 0.0,
    hemiSky: "#7dd3fc",
    hemiGround: "#334155",
    hemiIntensity: 1.2,
    envIntensity: 0.95,
    nightFactor: 0.0,
    starOpacity: 0.0,
  },
  {
    hour: 17.2, // Golden Hour
    name: "GOLDEN_HOUR",
    badge: "🌇 Golden Hour",
    fog: "#b45309",
    turbidity: 6.8,
    rayleigh: 3.0,
    mieCoefficient: 0.0055,
    mieDirectionalG: 0.83,
    exposure: 0.95,
    sunColor: "#f59e0b",
    sunIntensity: 2.5,
    moonIntensity: 0.0,
    hemiSky: "#fb923c",
    hemiGround: "#451a03",
    hemiIntensity: 1.05,
    envIntensity: 0.85,
    nightFactor: 0.15,
    starOpacity: 0.0,
  },
  {
    hour: 18.3, // Sunset Touchdown
    name: "SUNSET",
    badge: "🌅 Sunset",
    fog: "#831843",
    turbidity: 9.5,
    rayleigh: 4.5,
    mieCoefficient: 0.007,
    mieDirectionalG: 0.85,
    exposure: 0.9,
    sunColor: "#ea580c",
    sunIntensity: 1.7,
    moonIntensity: 0.08,
    hemiSky: "#ea580c",
    hemiGround: "#3b0764",
    hemiIntensity: 0.88,
    envIntensity: 0.65,
    nightFactor: 0.45,
    starOpacity: 0.2,
  },
  {
    hour: 19.8, // Cyber Twilight / Dusk
    name: "TWILIGHT",
    badge: "🌆 Twilight",
    fog: "#3b0764",
    turbidity: 5.5,
    rayleigh: 2.2,
    mieCoefficient: 0.0045,
    mieDirectionalG: 0.82,
    exposure: 0.78,
    sunColor: "#c026d3",
    sunIntensity: 0.2,
    moonIntensity: 0.28,
    hemiSky: "#6b21a8",
    hemiGround: "#1e1b4b",
    hemiIntensity: 0.62,
    envIntensity: 0.4,
    nightFactor: 0.8,
    starOpacity: 0.7,
  },
  {
    hour: 21.5, // Cyber Night
    name: "NIGHT",
    badge: "🌙 Cyber Night",
    fog: "#050a16",
    turbidity: 2.2,
    rayleigh: 0.6,
    mieCoefficient: 0.0022,
    mieDirectionalG: 0.8,
    exposure: 0.68,
    sunColor: "#ff9040",
    sunIntensity: 0.0,
    moonIntensity: 0.38,
    hemiSky: "#141e33",
    hemiGround: "#040812",
    hemiIntensity: 0.4,
    envIntensity: 0.18,
    nightFactor: 1.0,
    starOpacity: 0.95,
  },
  {
    hour: 24.0, // Wrap to Midnight
    name: "NIGHT",
    badge: "🌙 Midnight",
    fog: "#040711",
    turbidity: 2.0,
    rayleigh: 0.5,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.8,
    exposure: 0.68,
    sunColor: "#ff9040",
    sunIntensity: 0.0,
    moonIntensity: 0.38,
    hemiSky: "#121a2d",
    hemiGround: "#040812",
    hemiIntensity: 0.38,
    envIntensity: 0.12,
    nightFactor: 1.0,
    starOpacity: 0.95,
  },
];

/**
 * Procedural Circular Soft Star Texture Generator (Single 32x32 Canvas Texture).
 */
function createStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.2, "rgba(235, 245, 255, 0.85)");
  gradient.addColorStop(0.5, "rgba(180, 210, 255, 0.3)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Production-Grade Day/Night System for Three.js Futuristic City.
 * Integrates:
 * - Three.js Sky Addon for physical atmospheric scattering
 * - Procedural Sun Disc with limb-darkening & solar corona flare
 * - Procedural Moon with maria topography, craters, earthshine & lunar halo
 * - Starfield particle dome with depth occlusion
 * - Directional sunlight (with shadow casting) & directional moonlight
 * - Smooth streetlight & building window emission transitions
 * - Configurable cycle duration, start time, pausing, speed scaling, and full HUD
 */
export class DayNightSystem {
  constructor({
    scene,
    camera,
    renderer,
    sunlight,
    ambientLight,
    moonlight,
    container,
    initialTime = 9.0,
    cycleDuration = 120.0,
    speed = 1.0,
    paused = false,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sunlight = sunlight;
    this.ambientLight = ambientLight;
    this.container = container || document.body;

    // Optional or existing moonlight
    if (moonlight) {
      this.moonlight = moonlight;
    } else {
      this.moonlight = new THREE.DirectionalLight(0x9cc8ff, 0.0);
      this.moonlight.position.set(-60, 100, -40);
      this.moonlight.castShadow = false;
      this.scene.add(this.moonlight);
      this.scene.add(this.moonlight.target);
    }

    // Virtual Time Settings
    this.timeOfDay = ((initialTime % 24) + 24) % 24;
    this.cycleDuration = Math.max(1.0, cycleDuration); // 120s = 1 full 24h day
    this.speed = Math.max(0.0, speed);
    this.isPaused = !!paused;
    this.totalTime = 0.0;

    // Pre-allocated math instances for garbage-free animation loop updates
    this._sunDir = new THREE.Vector3();
    this._moonDir = new THREE.Vector3();
    this._tempVec = new THREE.Vector3();
    this._cSky = new THREE.Color();
    this._cFog = new THREE.Color();
    this._cSun = new THREE.Color();
    this._cHemiSky = new THREE.Color();
    this._cHemiGnd = new THREE.Color();
    this._cFrom = new THREE.Color();
    this._cTo = new THREE.Color();

    // Orbit Radius: Celestial bodies are placed far in the sky dome (within camera.far = 1500)
    this.ORBIT_RADIUS = 680;
    this.LIGHT_DIST = 320;

    // Track dynamic emissive materials (street lamps, windows, signals)
    this.streetLightMaterials = [];
    this.buildingLightMaterials = [];

    // Create Sky, Celestial Bodies, and Starfield
    this._initSky();
    this._initCelestialGroup();
    this._initSun();
    this._initMoon();
    this._initStarfield();
    this._initUI();

    // Initial pass to collect already-existing materials in scene
    this.refreshMaterials();

    // Initial synchronization pass
    this.update(0);
  }

  // 1. Initialize Atmospheric Scattering via Three.js Sky Addon
  _initSky() {
    this.sky = new Sky();
    this.sky.name = "Atmospheric_Sky_Dome";
    this.sky.scale.setScalar(450000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;

    const uniforms = this.sky.material.uniforms;
    if (uniforms["turbidity"]) uniforms["turbidity"].value = 2.0;
    if (uniforms["rayleigh"]) uniforms["rayleigh"].value = 1.0;
    if (uniforms["mieCoefficient"]) uniforms["mieCoefficient"].value = 0.003;
    if (uniforms["mieDirectionalG"]) uniforms["mieDirectionalG"].value = 0.82;
    if (uniforms["showSunDisc"]) uniforms["showSunDisc"].value = 0.0; // Handled by custom high-fidelity sun mesh

    this.scene.add(this.sky);
  }

  // 2. Initialize Celestial Bodies Group (Centered on active camera each frame to eliminate parallax)
  _initCelestialGroup() {
    this.celestialGroup = new THREE.Group();
    this.celestialGroup.name = "Celestial_Bodies_Cosmos";
    this.scene.add(this.celestialGroup);
  }

  // 3. Initialize Sun (Radiant Photosphere Core Quad + Volumetric Atmospheric Bloom)
  _initSun() {
    this.sunGroup = new THREE.Group();
    this.sunGroup.name = "Celestial_Sun_Group";

    // Radiant Photosphere Core Disc (Size 36x36 at R = 680 gives sharp, brilliant celestial solar disc)
    const coreGeom = new THREE.PlaneGeometry(36, 36);
    this.sunMaterial = createSunShaderMaterial();
    this.sunMesh = new THREE.Mesh(coreGeom, this.sunMaterial);
    this.sunMesh.renderOrder = 2;
    this.sunGroup.add(this.sunMesh);

    // Radiant Volumetric Atmospheric Solar Bloom (Size 110x110 gives wide, cinematic sunset/day flare)
    const bloomGeom = new THREE.PlaneGeometry(110, 110);
    this.sunCoronaMaterial = createSunCoronaMaterial();
    this.sunCoronaMesh = new THREE.Mesh(bloomGeom, this.sunCoronaMaterial);
    this.sunCoronaMesh.renderOrder = 1;
    this.sunGroup.add(this.sunCoronaMesh);

    this.celestialGroup.add(this.sunGroup);
  }

  // 4. Initialize Moon (High-Resolution Lunar Surface Sphere + Ethereal Ice Halo)
  _initMoon() {
    this.moonGroup = new THREE.Group();
    this.moonGroup.name = "Celestial_Moon_Group";

    // Generate high-resolution authentic lunar surface map (Maria, Craters, Tycho Ray Network)
    this.moonTexture = createRealisticMoonTexture();

    // Lunar Surface Sphere (Radius 9.2 at distance 680 = ~1.55° authentic celestial angular size)
    const moonGeom = new THREE.SphereGeometry(9.2, 64, 64);
    this.moonMaterial = createMoonShaderMaterial(this.moonTexture);
    this.moonMesh = new THREE.Mesh(moonGeom, this.moonMaterial);
    this.moonMesh.rotation.y = Math.PI * 0.5; // Turn iconic near-side (Sea of Tranquility, Tycho rays) toward Earth
    this.moonMesh.rotation.z = 0.08;
    this.moonMesh.renderOrder = 2;
    this.moonGroup.add(this.moonMesh);

    // Ethereal Nocturnal Lunar Atmosphere & Ice-Crystal Glow (Size 38x38)
    const glowGeom = new THREE.PlaneGeometry(38, 38);
    this.moonGlowMaterial = createMoonGlowMaterial();
    this.moonGlowMesh = new THREE.Mesh(glowGeom, this.moonGlowMaterial);
    this.moonGlowMesh.renderOrder = 1;
    this.moonGroup.add(this.moonGlowMesh);

    this.celestialGroup.add(this.moonGroup);
  }

  // 5. Initialize Starfield Particle Dome (Strictly above horizon with Depth Occlusion)
  _initStarfield() {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radius = 740;

    const starHues = [
      new THREE.Color(0xffffff),
      new THREE.Color(0xdbeafe),
      new THREE.Color(0xffedd5),
      new THREE.Color(0x93c5fd),
      new THREE.Color(0xfef3c7),
    ];

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      // Distribute strictly across upper hemisphere (phi: 0 to ~78 degrees above ground)
      const phi = Math.acos(1.0 - v * 0.82);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = starHues[Math.floor(Math.random() * starHues.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.starTexture = createStarTexture();

    this.starMat = new THREE.PointsMaterial({
      map: this.starTexture,
      size: 4.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: true, // Prevents rendering through buildings or below ground
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    this.starfield = new THREE.Points(starGeom, this.starMat);
    this.starfield.name = "Celestial_Starfield";
    this.celestialGroup.add(this.starfield);
  }

  // 6. Refresh and Register City Emissive Materials for Dynamic Day/Night Lighting
  refreshMaterials(root = this.scene) {
    const streetMats = new Set();
    const buildingMats = new Set();

    root.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const meshName = (obj.name || "").toLowerCase();

        mats.forEach((mat) => {
          const matName = (mat.name || "").toLowerCase();

          // Detect Street Lamp Bulb / Light Emitter ONLY (not the metal pole or base)
          const isStreetLampBulb =
            matName === "street_lamp_bulb_mat" ||
            meshName === "street_lamp_bulb" ||
            matName.includes("street_lamp_bulb") ||
            (matName.includes("lamp") && (matName.includes("bulb") || matName.includes("lens")));

          // Detect Bench LED accent strip
          const isBenchLED = meshName.includes("bench") && matName.includes("prop_blue");

          if (isStreetLampBulb || isBenchLED) {
            if (!streetMats.has(mat)) {
              streetMats.add(mat);
              if (!mat.emissive || mat.emissive.getHex() === 0) {
                mat.emissive = new THREE.Color(0x38bdf8);
              }
              mat.toneMapped = false;
            }
          }

          // Detect Building Windows, Lobbies, and Cyberpunk Neon Beacons
          if (
            matName.includes("window") ||
            matName.includes("tower_warmlobby") ||
            matName.includes("house_interior_glow") ||
            matName.includes("mb_warmwindow") ||
            matName.includes("mb_beacon") ||
            matName.includes("tower_neoncyan") ||
            matName.includes("house_neon") ||
            matName.includes("glow")
          ) {
            if (!buildingMats.has(mat)) {
              buildingMats.add(mat);
              if (!mat.emissive || mat.emissive.getHex() === 0) {
                mat.emissive = new THREE.Color(0xffb84d);
              }
              mat.toneMapped = false;
            }
          }
        });
      }
    });

    this.streetLightMaterials = Array.from(streetMats);
    this.buildingLightMaterials = Array.from(buildingMats);
  }

  // 7. Initialize Glassmorphism HUD Controller Widget
  _initUI() {
    // Remove older widget if present
    const existingHud = document.querySelector(".day-night-hud");
    if (existingHud) {
      existingHud.remove();
    }

    this.hud = document.createElement("div");
    this.hud.className = "day-night-hud";
    this.hud.innerHTML = `
      <div class="dn-header">
        <div class="dn-clock-wrap">
          <span class="dn-clock" id="dn-clock-text">09:00</span>
          <span class="dn-badge" id="dn-badge-text">🌤️ Morning</span>
        </div>
        <button id="btn-dn-pause" class="dn-btn active" title="Toggle Auto-Cycle (Space / P)">⏸ Pause</button>
      </div>

      <div class="dn-slider-wrap">
        <input type="range" id="dn-time-slider" min="0" max="24" step="0.1" value="9.0" class="dn-slider" title="Scrub Time of Day" />
      </div>

      <div class="dn-controls">
        <button id="btn-dn-dawn" class="dn-btn" title="Jump to Sunrise (06:30)">🌅 Dawn</button>
        <button id="btn-dn-noon" class="dn-btn" title="Jump to High Noon (12:00)">☀️ Noon</button>
        <button id="btn-dn-sunset" class="dn-btn" title="Jump to Sunset (18:30)">🌇 Sunset</button>
        <button id="btn-dn-night" class="dn-btn" title="Jump to Cyber Night (22:00)">🌙 Night</button>
        <button id="btn-dn-speed" class="dn-btn dn-speed-btn" title="Cycle Animation Speed">1x</button>
      </div>
    `;

    this.container.appendChild(this.hud);

    this.clockEl = document.getElementById("dn-clock-text");
    this.badgeEl = document.getElementById("dn-badge-text");
    this.sliderEl = document.getElementById("dn-time-slider");
    this.pauseBtn = document.getElementById("btn-dn-pause");
    this.speedBtn = document.getElementById("btn-dn-speed");

    const btnDawn = document.getElementById("btn-dn-dawn");
    const btnNoon = document.getElementById("btn-dn-noon");
    const btnSunset = document.getElementById("btn-dn-sunset");
    const btnNight = document.getElementById("btn-dn-night");

    btnDawn?.addEventListener("click", () => this.setTime(6.5));
    btnNoon?.addEventListener("click", () => this.setTime(12.0));
    btnSunset?.addEventListener("click", () => this.setTime(18.3));
    btnNight?.addEventListener("click", () => this.setTime(22.0));

    this.pauseBtn?.addEventListener("click", () => {
      this.setPaused(!this.isPaused);
    });

    const speedSteps = [1.0, 2.0, 5.0, 10.0];
    this.speedBtn?.addEventListener("click", () => {
      const currIdx = speedSteps.findIndex((s) => Math.abs(s - this.speed) < 0.1);
      const nextIdx = (currIdx + 1) % speedSteps.length;
      this.setSpeed(speedSteps[nextIdx]);
    });

    this.sliderEl?.addEventListener("input", (e) => {
      const targetTime = parseFloat(e.target.value);
      this.setTime(targetTime);
    });

    // Keyboard Shortcuts:
    // [T]: Advance time by 1.5 hours
    // [L]: Toggle between Day (12:00) and Night (22:00)
    // [P]: Toggle pause/resume
    window.addEventListener("keydown", (e) => {
      // Ignore if user is typing in an input
      if (e.target && e.target.tagName === "INPUT") return;

      if (e.code === "KeyT") {
        this.setTime((this.timeOfDay + 1.5) % 24);
      } else if (e.code === "KeyL") {
        if (this.timeOfDay >= 6.0 && this.timeOfDay < 18.0) {
          this.setTime(22.0); // jump to night
        } else {
          this.setTime(12.0); // jump to day
        }
      } else if (e.code === "KeyP") {
        this.setPaused(!this.isPaused);
      }
    });
  }

  // Set explicit time of day [0, 24)
  setTime(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    this.update(0);
  }

  // Toggle or set paused state
  setPaused(paused) {
    this.isPaused = !!paused;
    if (this.pauseBtn) {
      this.pauseBtn.classList.toggle("active", !this.isPaused);
      this.pauseBtn.textContent = this.isPaused ? "▶ Play" : "⏸ Pause";
    }
  }

  // Set speed multiplier
  setSpeed(multiplier) {
    this.speed = Math.max(0.0, multiplier);
    if (this.speedBtn) {
      this.speedBtn.textContent = `${this.speed}x`;
    }
  }

  getTime() {
    return this.timeOfDay;
  }

  isPausedState() {
    return this.isPaused;
  }

  getSpeed() {
    return this.speed;
  }

  // Smooth interpolation between adjacent keyframes
  _interpolateState(hour) {
    let prev = KEYFRAMES[0];
    let next = KEYFRAMES[KEYFRAMES.length - 1];

    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      if (hour >= KEYFRAMES[i].hour && hour <= KEYFRAMES[i + 1].hour) {
        prev = KEYFRAMES[i];
        next = KEYFRAMES[i + 1];
        break;
      }
    }

    const span = next.hour - prev.hour;
    const factor = span === 0 ? 0 : (hour - prev.hour) / span;

    const lerpColor = (c1, c2, target) => {
      this._cFrom.set(c1);
      this._cTo.set(c2);
      target.copy(this._cFrom).lerp(this._cTo, factor);
    };

    lerpColor(prev.fog, next.fog, this._cFog);
    lerpColor(prev.sunColor, next.sunColor, this._cSun);
    lerpColor(prev.hemiSky, next.hemiSky, this._cHemiSky);
    lerpColor(prev.hemiGround, next.hemiGround, this._cHemiGnd);

    const lerpVal = (v1, v2) => v1 + (v2 - v1) * factor;

    return {
      fog: this._cFog,
      turbidity: lerpVal(prev.turbidity, next.turbidity),
      rayleigh: lerpVal(prev.rayleigh, next.rayleigh),
      mieCoefficient: lerpVal(prev.mieCoefficient, next.mieCoefficient),
      mieDirectionalG: lerpVal(prev.mieDirectionalG, next.mieDirectionalG),
      exposure: lerpVal(prev.exposure, next.exposure),
      sunColor: this._cSun,
      sunIntensity: lerpVal(prev.sunIntensity, next.sunIntensity),
      moonIntensity: lerpVal(prev.moonIntensity, next.moonIntensity),
      hemiSky: this._cHemiSky,
      hemiGround: this._cHemiGnd,
      hemiIntensity: lerpVal(prev.hemiIntensity, next.hemiIntensity),
      envIntensity: lerpVal(prev.envIntensity, next.envIntensity),
      nightFactor: lerpVal(prev.nightFactor, next.nightFactor),
      starOpacity: lerpVal(prev.starOpacity, next.starOpacity),
      badge: factor > 0.5 ? next.badge : prev.badge,
    };
  }

  // Animation Loop Update Method (Zero Garbage Collection)
  update(deltaTime = 0) {
    if (!this.isPaused && deltaTime > 0) {
      const hoursPerSecond = 24.0 / this.cycleDuration;
      this.timeOfDay = (this.timeOfDay + deltaTime * hoursPerSecond * this.speed) % 24.0;
    }

    if (deltaTime > 0) {
      this.totalTime += deltaTime;
    }

    // Keep celestial cosmos centered on active camera to eliminate parallax
    if (this.camera) {
      this.celestialGroup.position.copy(this.camera.position);
    }

    // 1. Calculate Unified Sun & Moon Orbit Coordinates
    // At hour = 6.0 (sunrise): angle = 0 -> East (+X)
    // At hour = 12.0 (high noon): angle = PI / 2 -> Zenith (+Y)
    // At hour = 18.0 (sunset): angle = PI -> West (-X)
    // At hour = 0.0 (midnight): angle = 3*PI/2 -> Nadir (-Y)
    const orbitAngle = ((this.timeOfDay - 6.0) / 24.0) * (Math.PI * 2);

    const sunX = -Math.cos(orbitAngle) * this.ORBIT_RADIUS;
    const sunY = Math.sin(orbitAngle) * this.ORBIT_RADIUS;
    const sunZ = Math.cos(orbitAngle) * 0.28 * this.ORBIT_RADIUS; // Authentic seasonal orbital tilt

    this._sunDir.set(sunX, sunY, sunZ).normalize();
    this._moonDir.set(-sunX, -sunY, -sunZ).normalize();

    this.sunGroup.position.set(sunX, sunY, sunZ);
    this.moonGroup.position.set(-sunX, -sunY, -sunZ);

    // Orient celestial billboards directly towards active camera for perfect circular symmetry from any view angle
    if (this.camera) {
      this.sunGroup.quaternion.copy(this.camera.quaternion);
      this.moonGlowMesh.quaternion.copy(this.camera.quaternion);
    }

    // 2. Synchronize Three.js Sky Atmospheric Shader
    if (this.sky) {
      const uniforms = this.sky.material.uniforms;
      // Preetham atmospheric scattering model scales sunPosition vector by 450,000
      uniforms["sunPosition"].value.copy(this._sunDir).multiplyScalar(450000);
    }

    // 3. Interpolate Atmospheric & Keyframe State
    const state = this._interpolateState(this.timeOfDay);

    // Apply Sky atmospheric parameters
    if (this.sky) {
      const uniforms = this.sky.material.uniforms;
      uniforms["turbidity"].value = state.turbidity;
      uniforms["rayleigh"].value = state.rayleigh;
      uniforms["mieCoefficient"].value = state.mieCoefficient;
      uniforms["mieDirectionalG"].value = state.mieDirectionalG;
    }

    // 4. Synchronize Directional Sunlight (Primary Shadow Caster)
    // When sun is above horizon, shadows match sun position and direction
    if (sunY > -15) {
      this.sunlight.position.set(
        this._sunDir.x * this.LIGHT_DIST,
        Math.max(this._sunDir.y * this.LIGHT_DIST, 12),
        this._sunDir.z * this.LIGHT_DIST
      );
      this.sunlight.target.position.set(0, 0, 0);
      this.sunlight.color.copy(state.sunColor);
      this.sunlight.intensity = state.sunIntensity;
      this.sunlight.castShadow = sunY > 0 && state.sunIntensity > 0.05;
    } else {
      this.sunlight.intensity = 0.0;
      this.sunlight.castShadow = false;
    }

    // 5. Synchronize Directional Moonlight (Subtle Nocturnal Illumination)
    const moonY = -sunY;
    if (moonY > -15) {
      this.moonlight.position.set(
        this._moonDir.x * this.LIGHT_DIST,
        Math.max(this._moonDir.y * this.LIGHT_DIST, 15),
        this._moonDir.z * this.LIGHT_DIST
      );
      this.moonlight.target.position.set(0, 0, 0);
      this.moonlight.color.setHex(0x9cc8ff);
      this.moonlight.intensity = state.moonIntensity;
    } else {
      this.moonlight.intensity = 0.0;
    }

    // 6. Synchronize Ambient Hemisphere Light
    if (this.ambientLight) {
      this.ambientLight.color.copy(state.hemiSky);
      this.ambientLight.groundColor.copy(state.hemiGround);
      this.ambientLight.intensity = state.hemiIntensity;
    }

    // 7. Synchronize Fog Color and Renderer Tone Mapping Exposure
    if (this.scene.fog) {
      this.scene.fog.color.copy(state.fog);
    }
    if (this.renderer) {
      this.renderer.toneMappingExposure = state.exposure;
    }

    // 8. Synchronize IBL Environment Reflection Intensity
    // Scales daytime reflections down at night so dark glass & metals don't reflect midday sky
    if (this.scene.environmentIntensity !== undefined) {
      this.scene.environmentIntensity = state.envIntensity;
    }

    // 9. Calculate Dynamic Horizon Fade & Sunset Chromatic Transition
    let sunsetFactor = 0.0;
    if (this.timeOfDay >= 16.5 && this.timeOfDay <= 19.8) {
      sunsetFactor = 1.0 - Math.min(1.0, Math.abs(this.timeOfDay - 18.3) / 1.5);
    } else if (this.timeOfDay >= 5.2 && this.timeOfDay <= 7.8) {
      sunsetFactor = 1.0 - Math.min(1.0, Math.abs(this.timeOfDay - 6.5) / 1.3);
    }
    sunsetFactor = Math.pow(Math.max(0.0, sunsetFactor), 1.4);

    // Smooth sun visibility & horizon fade
    const sunHorizonFade = THREE.MathUtils.clamp((sunY + 20) / 40, 0.0, 1.0);
    this.sunGroup.visible = sunY > -25;
    if (this.sunMaterial) {
      this.sunMaterial.uniforms.uTime.value = this.totalTime;
      this.sunMaterial.uniforms.uSunsetFactor.value = sunsetFactor;
      this.sunMaterial.uniforms.uOpacity.value = sunHorizonFade;
    }
    if (this.sunCoronaMaterial) {
      this.sunCoronaMaterial.uniforms.uTime.value = this.totalTime;
      this.sunCoronaMaterial.uniforms.uSunsetFactor.value = sunsetFactor;
      this.sunCoronaMaterial.uniforms.uOpacity.value = sunHorizonFade;
    }

    // Smooth moon visibility & horizon fade
    const moonHorizonFade = THREE.MathUtils.clamp((moonY + 20) / 40, 0.0, 1.0);
    this.moonGroup.visible = moonY > -25;
    if (this.moonMaterial) {
      // Light direction from moon toward sun in world space
      this.moonMaterial.uniforms.uSunDirection.value.copy(this._sunDir);
      this.moonMaterial.uniforms.uOpacity.value = moonHorizonFade;
    }
    if (this.moonGlowMaterial) {
      this.moonGlowMaterial.uniforms.uNightFactor.value = state.nightFactor;
      this.moonGlowMaterial.uniforms.uOpacity.value = moonHorizonFade;
    }

    // 10. Synchronize Starfield Opacity
    if (this.starMat) {
      this.starMat.opacity = state.starOpacity;
      this.starfield.visible = state.starOpacity > 0.01;
    }

    // 11. Synchronize Street Lamps and Building Window Illumination
    const lampIntensity = THREE.MathUtils.lerp(0.15, 2.8, Math.pow(state.nightFactor, 1.3));
    for (let i = 0; i < this.streetLightMaterials.length; i++) {
      this.streetLightMaterials[i].emissiveIntensity = lampIntensity;
    }

    const windowIntensity = THREE.MathUtils.lerp(0.0, 2.3, Math.pow(state.nightFactor, 1.5));
    for (let i = 0; i < this.buildingLightMaterials.length; i++) {
      this.buildingLightMaterials[i].emissiveIntensity = windowIntensity;
    }

    // 12. Update Glassmorphism HUD Clock & Controls
    if (this.clockEl) {
      const hours = Math.floor(this.timeOfDay);
      const minutes = Math.floor((this.timeOfDay - hours) * 60);
      const hh = String(hours).padStart(2, "0");
      const mm = String(minutes).padStart(2, "0");
      this.clockEl.textContent = `${hh}:${mm}`;
    }

    if (this.badgeEl) {
      this.badgeEl.textContent = state.badge;
    }

    // Synchronize slider thumb when not actively being dragged
    if (this.sliderEl && document.activeElement !== this.sliderEl) {
      this.sliderEl.value = this.timeOfDay.toFixed(1);
    }
  }
}
