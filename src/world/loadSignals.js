import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";

// Global traffic light controller state for the city conjunctions:
// Alternates between North-South (NS) and East-West (EW) traffic.
export const trafficLightState = {
  nsGreen: true,
  ewGreen: false,
};

const signalsList = [];
let cycleTimer = 0;
const CYCLE_DURATION = 26.0; // seconds

// Updates traffic light cycle and animates emissive signals at road conjunctions
export function updateSignals(delta) {
  cycleTimer = (cycleTimer + delta) % CYCLE_DURATION;

  // 0s - 11s: NS is GREEN, EW is RED
  // 11s - 13s: Transitional All RED clearance
  // 13s - 24s: EW is GREEN, NS is RED
  // 24s - 26s: Transitional All RED clearance
  const nsGreen = cycleTimer < 11.0;
  const ewGreen = cycleTimer >= 13.0 && cycleTimer < 24.0;

  trafficLightState.nsGreen = nsGreen;
  trafficLightState.ewGreen = ewGreen;

  signalsList.forEach((item) => {
    const isGreen = item.approach === "NS" ? nsGreen : ewGreen;
    if (item.greenOn) item.greenOn.visible = isGreen;
    if (item.greenOff) item.greenOff.visible = !isGreen;
    if (item.redOn) item.redOn.visible = !isGreen;
    if (item.redOff) item.redOff.visible = isGreen;
  });
}

export async function loadSignals(scene, physicsSystem = null) {
  const loader = getModelLoader();
  try {
    const gltf = await loader.loadAsync("/models/props/signal.glb");
    const signalsGroup = new THREE.Group();
    signalsGroup.name = "City_Traffic_Signals_Group";

    // 1. Normalize Root Transform
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

    const createSignalInstance = (x, z, rotY, approach) => {
      const signal = template.clone(true);
      signal.position.set(x, SIDEWALK_Y, z);
      signal.scale.set(SIGNAL_SCALE, SIGNAL_SCALE, SIGNAL_SCALE);
      signal.rotation.y = rotY;

      // Find lamp nodes inside this cloned instance
      const greenOn = signal.getObjectByName("Traffic_Light_Lamp_Green_On");
      const greenOff = signal.getObjectByName("Traffic_Light_Lamp_Green_Off");
      const redOn = signal.getObjectByName("Traffic_Light_Lamp_Red_On");
      const redOff = signal.getObjectByName("Traffic_Light_Lamp_Red_Off");

      // Clone materials so each signal can toggle independently
      [greenOn, greenOff, redOn, redOff].forEach((lamp) => {
        if (lamp && lamp.material) {
          lamp.material = lamp.material.clone();
        }
      });

      signalsList.push({
        signal,
        approach, // "NS" | "EW"
        greenOn,
        greenOff,
        redOn,
        redOff,
      });

      signalsGroup.add(signal);

      // Register vertical signal post obstacle collider
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

    signalsList.length = 0; // Clear any existing registered signals

    junctions.forEach((j) => {
      // North approach: positioned on NW corner curb, faces North towards oncoming Southbound cars
      createSignalInstance(j.cx - 14.0, j.cz - 14.0, Math.PI, "NS");

      // East approach: positioned on NE corner curb, faces East towards oncoming Westbound cars
      createSignalInstance(j.cx + 14.0, j.cz - 14.0, Math.PI / 2, "EW");

      // South approach: positioned on SE corner curb, faces South towards oncoming Northbound cars
      createSignalInstance(j.cx + 14.0, j.cz + 14.0, 0, "NS");

      // West approach: positioned on SW corner curb, faces West towards oncoming Eastbound cars
      createSignalInstance(j.cx - 14.0, j.cz + 14.0, -Math.PI / 2, "EW");
    });

    // Initial state setup
    updateSignals(0);

    scene.add(signalsGroup);
    return signalsGroup;
  } catch (error) {
    console.error("Error loading traffic signal models:", error);
    return null;
  }
}
