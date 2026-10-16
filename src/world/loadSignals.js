import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";

export async function loadSignals(scene, physicsSystem = null) {
  const loader = getModelLoader();
  try {
    const gltf = await loader.loadAsync("/models/props/signal.glb");
    const signalsGroup = new THREE.Group();
    signalsGroup.name = "City_Traffic_Signals_Group";

    // 1. Normalize Root Transform
    // The exported model contains an arbitrary world offset, rotation, and scale on Traffic_Light_Root.
    // Resetting these aligns the pole vertical axis to (0, 0, 0) with base at Y = 0 and lamps facing +Z.
    const rootNode = gltf.scene.getObjectByName("Traffic_Light_Root") || gltf.scene.children[0];
    if (rootNode) {
      rootNode.position.set(0, 0, 0);
      rootNode.rotation.set(0, 0, 0);
      rootNode.scale.set(1, 1, 1);
    }

    // 2. Enhance Materials & Neon Emissives
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;

        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            const mName = (m.name || "").toLowerCase();
            if (mName === "prop_green") {
              m.emissive = new THREE.Color(0x00ff88);
              m.emissiveIntensity = 3.5;
              m.toneMapped = false;
            } else if (mName === "prop_red") {
              m.emissive = new THREE.Color(0xff1e38);
              m.emissiveIntensity = 3.5;
              m.toneMapped = false;
            } else if (mName === "prop_blue") {
              m.emissive = new THREE.Color(0x00f0ff);
              m.emissiveIntensity = 2.5;
              m.toneMapped = false;
            } else {
              m.shadowSide = THREE.DoubleSide;
            }
          });
        }
      }
    });

    // Proportional scale matching 5.6m street lamps and vehicles
    const SIGNAL_SCALE = 2.0;
    const SIDEWALK_Y = 0.42;

    const template = new THREE.Group();
    template.add(gltf.scene);

    const createSignalInstance = (x, z, rotY) => {
      const signal = template.clone(true);
      signal.position.set(x, SIDEWALK_Y, z);
      signal.scale.set(SIGNAL_SCALE, SIGNAL_SCALE, SIGNAL_SCALE);
      signal.rotation.y = rotY;

      signalsGroup.add(signal);

      // Register vertical signal post obstacle collider (radius ~ 0.35m, height ~ 6.0m)
      if (physicsSystem) {
        physicsSystem.addStaticBox(x, 3.0, z, 0.35, 3.0, 0.35);
      }

      return signal;
    };

    // 3. Place 4 Traffic Signals per 4-Way Crossroad Junction (1 on each corner curb)
    const junctions = [
      { name: "NE", cx: 60, cz: -60 },
      { name: "NW", cx: -60, cz: -60 },
      { name: "SE", cx: 60, cz: 60 },
      { name: "SW", cx: -60, cz: 60 },
    ];

    junctions.forEach((j) => {
      // North approach: positioned on NW corner curb, faces North towards oncoming cars
      createSignalInstance(j.cx - 14.0, j.cz - 14.0, Math.PI);

      // East approach: positioned on NE corner curb, faces East towards oncoming cars
      createSignalInstance(j.cx + 14.0, j.cz - 14.0, Math.PI / 2);

      // South approach: positioned on SE corner curb, faces South towards oncoming cars
      createSignalInstance(j.cx + 14.0, j.cz + 14.0, 0);

      // West approach: positioned on SW corner curb, faces West towards oncoming cars
      createSignalInstance(j.cx - 14.0, j.cz + 14.0, -Math.PI / 2);
    });

    scene.add(signalsGroup);
    return signalsGroup;
  } catch (error) {
    console.error("Error loading traffic signal models:", error);
    return null;
  }
}
