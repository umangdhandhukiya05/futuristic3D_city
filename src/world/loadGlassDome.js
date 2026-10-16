import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";

let domeMixer = null;

export async function loadGlassDome(scene, physicsSystem = null) {
  const loader = getModelLoader();
  try {
    const gltf = await loader.loadAsync("/models/props/Glass-dome.glb");
    const domeRoot = gltf.scene;
    domeRoot.name = "City_Glass_Dome_Centerpiece";

    // 1. Precise Geometric Centering
    // The exported GLTF root node ("Glass_Dome_Root") contains a preset translation [150, 0, 140].
    // Resetting local translation to (0, 0, 0) centers the dome plaza symmetrically at origin.
    const mainNode = domeRoot.getObjectByName("Glass_Dome_Root") || domeRoot.children[0];
    if (mainNode) {
      mainNode.position.set(0, 0, 0);
    }

    // Compute bounding box to confirm alignment
    const box = new THREE.Box3().setFromObject(domeRoot);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Fine-tune offset so plaza is exactly centered horizontally at (0, 0, 0)
    domeRoot.position.x -= center.x;
    domeRoot.position.z -= center.z;
    // The GLTF model floor & pavement are modeled at Y = 0.70.
    // Offset by -0.68 so the pavement sits flush on the city ground plane at Y = 0.02,
    // grounding all border studs, pathways, plinths, and domes firmly on the terrain.
    domeRoot.position.y = -0.68;

    // 2. Material Processing & Sci-Fi Visual Polish
    domeRoot.traverse((obj) => {
      if (obj.isMesh) {
        const nameLower = (obj.name || "").toLowerCase();
        let mat = obj.material;

        // Detect glass canopy meshes (main dome & 4 mini corner domes)
        const isGlass = nameLower.includes("glass");

        if (isGlass) {
          // Clone and configure physical-looking transparent tinted dome glass
          const glassMat = (mat ? mat.clone() : new THREE.MeshPhysicalMaterial({
            color: 0x73b7e6,
          }));

          glassMat.transparent = true;
          glassMat.opacity = 0.38;
          glassMat.roughness = 0.08;
          glassMat.metalness = 0.12;
          // Crucial: depthWrite false lets the glowing inner core, lightning, and orbit rings show crisply without sorting glitches
          glassMat.depthWrite = false;
          glassMat.side = THREE.DoubleSide;

          obj.material = glassMat;
          obj.renderOrder = 10;
          obj.castShadow = false;
          obj.receiveShadow = true;
        } else {
          // Opaque architectural elements & neon emissives
          obj.castShadow = true;
          obj.receiveShadow = true;

          if (mat) {
            const mats = Array.isArray(mat) ? mat : [mat];
            mats.forEach((m) => {
              const mName = (m.name || "").toLowerCase();

              // Boost neon cyan emissives for glowing pathway strips, studs, core, and pylon orbs
              if (mName.includes("neon") || mName.includes("tower_neoncyan")) {
                m.emissive = new THREE.Color(0x00f0ff);
                m.emissiveIntensity = 2.8;
                m.toneMapped = false;
              } else if (mName.includes("neo_ray")) {
                // Electric lightning arcs and arc bridge beams
                m.emissive = new THREE.Color(0x22d3ee);
                m.emissiveIntensity = 3.5;
                m.toneMapped = false;
                m.side = THREE.DoubleSide;
              } else if (mName.includes("blue") || mName.includes("prop_blue")) {
                // Rotating planetary orbit rings
                m.emissive = new THREE.Color(0x3b82f6);
                m.emissiveIntensity = 2.2;
                m.toneMapped = false;
              }
            });
          }
        }
      }
    });

    // 3. Sci-Fi Cybernetic Interior & Satellite Lighting
    // Radiant core light emitting from inside the central glass sphere
    const corePointLight = new THREE.PointLight(0x00f0ff, 2.5, 40, 1.5);
    corePointLight.position.set(0, 14.5, 0);
    domeRoot.add(corePointLight);

    // 4. Initialize Animations (Pulsing Energy Cores & Spinning Gyroscopic Orbit Rings)
    if (gltf.animations && gltf.animations.length > 0) {
      domeMixer = new THREE.AnimationMixer(domeRoot);
      gltf.animations.forEach((clip) => {
        const action = domeMixer.clipAction(clip);
        action.play();
      });
    }

    scene.add(domeRoot);

    // Register centerpiece dome obstacle colliders
    if (physicsSystem) {
      // Central glass sphere & core pillars (radius ~ 4.5m, height ~ 8.0m)
      physicsSystem.addStaticBox(0, 4.0, 0, 4.5, 4.0, 4.5);

      // 4 Satellite dome plinths
      const satOffset = 13.5;
      const satH = 1.6;
      physicsSystem.addStaticBox(-satOffset, 2.0, -satOffset, satH, 2.0, satH);
      physicsSystem.addStaticBox(satOffset, 2.0, -satOffset, satH, 2.0, satH);
      physicsSystem.addStaticBox(-satOffset, 2.0, satOffset, satH, 2.0, satH);
      physicsSystem.addStaticBox(satOffset, 2.0, satOffset, satH, 2.0, satH);
    }

    return { domeRoot, mixer: domeMixer };
  } catch (error) {
    console.error("Error loading Glass Dome model:", error);
    return null;
  }
}

export function updateGlassDome(delta) {
  if (domeMixer) {
    domeMixer.update(delta);
  }
}
