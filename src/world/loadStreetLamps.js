import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadStreetLamps(scene, physicsSystem = null) {
  const loader = getModelLoader();
  try {
    const gltf = await loader.loadAsync("/models/props/street-lamp.glb");
    const lampsGroup = new THREE.Group();
    lampsGroup.name = "City_Street_Lamps_Group";

    // Group meshes by material and center geometry around the vertical pole base
    const matGroups = {};
    const POLE_BASE_X = 20.654;
    const POLE_BASE_Z = 52.793;
    const MIN_BASE_Y = 0.289;

    // 1. Lamp Head Light Bulb Material (ONLY this glows at night)
    const bulbMaterial = new THREE.MeshStandardMaterial({
      name: "Street_Lamp_Bulb_Mat",
      color: new THREE.Color(0xffffff),
      emissive: new THREE.Color(0x38bdf8), // Radiant cyan-blue street light
      emissiveIntensity: 0.1, // Controlled dynamically by DayNightSystem (boosts to 3.5 at night)
      roughness: 0.1,
      metalness: 0.1,
      toneMapped: false,
    });

    // 2. Realistic Brushed Metal Pole (Non-emissive solid steel)
    const steelMaterial = new THREE.MeshStandardMaterial({
      name: "Street_Lamp_Steel_Mat",
      color: new THREE.Color(0x525961),
      roughness: 0.35,
      metalness: 0.85,
      emissive: new THREE.Color(0x000000),
    });

    // 3. Matte Industrial Dark Alloy for Base, Shell, and Bolts (Non-emissive)
    const darkMaterial = new THREE.MeshStandardMaterial({
      name: "Street_Lamp_Dark_Mat",
      color: new THREE.Color(0x1a1e24),
      roughness: 0.6,
      metalness: 0.5,
      emissive: new THREE.Color(0x000000),
    });

    // 4. Subtle Dark Anodized Trim Rings on Pole & Base (Non-emissive)
    const accentMaterial = new THREE.MeshStandardMaterial({
      name: "Street_Lamp_Accent_Mat",
      color: new THREE.Color(0x18242b),
      roughness: 0.45,
      metalness: 0.75,
      emissive: new THREE.Color(0x000000),
    });

    gltf.scene.updateMatrixWorld(true);

    gltf.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const objName = obj.name || "";
        const matName = (obj.material && obj.material.name) || "";

        let targetKey;
        let targetMat;

        // ONLY the lamp head lens and front indicator light are the glowing bulb
        const isBulb = objName.includes("Head_Lens") || objName.includes("Head_Front_Light");

        if (isBulb) {
          targetKey = "Bulb";
          targetMat = bulbMaterial;
        } else if (matName === "Prop_Steel") {
          targetKey = "Steel";
          targetMat = steelMaterial;
        } else if (matName === "Prop_Dark" || matName === "Prop_Body") {
          targetKey = "Dark";
          targetMat = darkMaterial;
        } else {
          // Rings on pole and base (formerly Prop_Blue) - kept as dark sleek metallic trim
          targetKey = "Accent";
          targetMat = accentMaterial;
        }

        if (!matGroups[targetKey]) {
          matGroups[targetKey] = { material: targetMat, geoms: [] };
        }

        const clonedGeom = obj.geometry.clone();
        clonedGeom.applyMatrix4(obj.matrixWorld);
        clonedGeom.translate(-POLE_BASE_X, -MIN_BASE_Y, -POLE_BASE_Z);
        matGroups[targetKey].geoms.push(clonedGeom);
      }
    });

    // Create an ultra-performant 4-mesh template:
    // 1. Street_Lamp_Bulb (the glowing light emitter at the head)
    // 2. Street_Lamp_Steel (brushed steel pole and structure)
    // 3. Street_Lamp_Dark (dark metal base and bolts)
    // 4. Street_Lamp_Accent (dark anodized trim rings)
    const template = new THREE.Group();
    for (const [key, data] of Object.entries(matGroups)) {
      const merged = mergeGeometries(data.geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, data.material);
        mesh.name = `Street_Lamp_${key}`;
        mesh.castShadow = (key !== "Bulb");
        mesh.receiveShadow = true;
        template.add(mesh);
      }
    }

    const LAMP_SCALE = 0.38;
    const SIDEWALK_Y = 0.42;
    // Default orientation of lamp head arm in template coordinates (-160.8 degrees)
    const BASE_ARM_ANGLE = -2.80638;

    const createLampInstance = (x, z, targetAngle) => {
      const lamp = template.clone(true);
      lamp.position.set(x, SIDEWALK_Y, z);
      lamp.scale.set(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE);
      lamp.rotation.y = BASE_ARM_ANGLE - targetAngle;

      lamp.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      lampsGroup.add(lamp);

      // Register vertical pole obstacle collider (radius ~ 0.30m, height ~ 5m)
      if (physicsSystem) {
        physicsSystem.addStaticBox(x, 2.5, z, 0.3, 2.5, 0.3);
      }

      return lamp;
    };

    const straightOffsets = [-30, -10, 10, 30];

    // 1. NORTH ROAD (Z_center = -60)
    straightOffsets.forEach((x, i) => {
      // Outer sidewalk (facing South +Z towards road)
      createLampInstance(x, -76.5, Math.PI / 2, i % 2 === 0);
      // Inner sidewalk (facing North -Z towards road)
      createLampInstance(x, -43.5, -Math.PI / 2, i % 2 === 1);
    });

    // 2. SOUTH ROAD (Z_center = +60)
    straightOffsets.forEach((x, i) => {
      // Inner sidewalk (facing South +Z towards road)
      createLampInstance(x, 43.5, Math.PI / 2, i % 2 === 0);
      // Outer sidewalk (facing North -Z towards road)
      createLampInstance(x, 76.5, -Math.PI / 2, i % 2 === 1);
    });

    // 3. WEST ROAD (X_center = -60)
    straightOffsets.forEach((z, i) => {
      // Outer sidewalk (facing East +X towards road)
      createLampInstance(-76.5, z, 0, i % 2 === 0);
      // Inner sidewalk (facing West -X towards road)
      createLampInstance(-43.5, z, Math.PI, i % 2 === 1);
    });

    // 4. EAST ROAD (X_center = +60)
    straightOffsets.forEach((z, i) => {
      // Inner sidewalk (facing East +X towards road)
      createLampInstance(43.5, z, 0, i % 2 === 0);
      // Outer sidewalk (facing West -X towards road)
      createLampInstance(76.5, z, Math.PI, i % 2 === 1);
    });

    // 5. FOUR INTERSECTION CORNERS
    // NE intersection outer corner
    createLampInstance(76.5, -76.5, (-3 * Math.PI) / 4, true);
    // NW intersection outer corner
    createLampInstance(-76.5, -76.5, -Math.PI / 4, true);
    // SE intersection outer corner
    createLampInstance(76.5, 76.5, (3 * Math.PI) / 4, true);
    // SW intersection outer corner
    createLampInstance(-76.5, 76.5, Math.PI / 4, true);

    // 6. EXTENDED ROADS STREET LAMPS (along all 8 branches up to road end at 240)
    const extOffsets = [95, 115, 135, 155, 175, 195, 215, 235];
    const negExtOffsets = extOffsets.map((v) => -v);

    // North extensions (Z negative)
    negExtOffsets.forEach((z) => {
      createLampInstance(-76.5, z, 0);
      createLampInstance(76.5, z, Math.PI);
    });

    // South extensions (Z positive)
    extOffsets.forEach((z) => {
      createLampInstance(-76.5, z, 0);
      createLampInstance(76.5, z, Math.PI);
    });

    // West extensions (X negative)
    negExtOffsets.forEach((x) => {
      createLampInstance(x, -76.5, Math.PI / 2);
      createLampInstance(x, 76.5, -Math.PI / 2);
    });

    // East extensions (X positive)
    extOffsets.forEach((x) => {
      createLampInstance(x, -76.5, Math.PI / 2);
      createLampInstance(x, 76.5, -Math.PI / 2);
    });

    scene.add(lampsGroup);
    return lampsGroup;
  } catch (error) {
    console.error("Error loading street lamps:", error);
  }
}
