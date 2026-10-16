import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadBenches(scene) {
  const loader = getModelLoader();
  try {
    const gltf = await loader.loadAsync("/models/props/benches.glb");
    const benchesGroup = new THREE.Group();
    benchesGroup.name = "City_Benches_Group";

    // Group meshes by material and center geometry around the base origin
    const matGroups = {};
    const BENCH_CENTER_X = 31.783;
    const BENCH_BASE_Y = 0.97525;
    const BENCH_CENTER_Z = 52.527;

    gltf.scene.updateMatrixWorld(true);

    gltf.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const mat = obj.material;
        const matName = mat.name || "default";

        if (!matGroups[matName]) {
          const matClone = mat.clone();
          matClone.shadowSide = THREE.DoubleSide;

          // Boost sci-fi neon blue glow on armrest LED strips and back plate
          if (matName === "Prop_Blue") {
            matClone.emissive = new THREE.Color(0x1ac8ff);
            matClone.emissiveIntensity = 2.5;
            matClone.toneMapped = false;
          }

          matGroups[matName] = { material: matClone, geoms: [] };
        }

        const clonedGeom = obj.geometry.clone();
        clonedGeom.applyMatrix4(obj.matrixWorld);
        clonedGeom.translate(-BENCH_CENTER_X, -BENCH_BASE_Y, -BENCH_CENTER_Z);
        matGroups[matName].geoms.push(clonedGeom);
      }
    });

    // Create an ultra-performant 3-mesh template (1 per material)
    const template = new THREE.Group();
    for (const [name, data] of Object.entries(matGroups)) {
      const merged = mergeGeometries(data.geoms, false);
      const mesh = new THREE.Mesh(merged, data.material);
      mesh.name = `Bench_${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      template.add(mesh);
    }

    const BENCH_SCALE = 0.24;

    const createBenchInstance = (x, y, z, rotY = 0) => {
      const bench = template.clone(true);
      bench.position.set(x, y, z);
      bench.scale.set(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
      bench.rotation.y = rotY;

      bench.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      benchesGroup.add(bench);
      return bench;
    };

    // Raised terrace benches in front of modern buildings in each cardinal block
    // 1. East Block (facing North avenue)
    createBenchInstance(112.0, 0.5, -13.5, 0);
    createBenchInstance(102.0, 0.5, -13.5, 0);

    // 2. West Block (facing South avenue)
    createBenchInstance(-112.0, 0.5, 13.5, Math.PI);
    createBenchInstance(-102.0, 0.5, 13.5, Math.PI);

    // 3. North Block (facing East avenue)
    createBenchInstance(-13.5, 0.5, -112.0, Math.PI / 2);
    createBenchInstance(-13.5, 0.5, -102.0, Math.PI / 2);

    // 4. South Block (facing West avenue)
    createBenchInstance(13.5, 0.5, 112.0, -Math.PI / 2);
    createBenchInstance(13.5, 0.5, 102.0, -Math.PI / 2);

    scene.add(benchesGroup);
    return benchesGroup;
  } catch (error) {
    console.error("Error loading benches:", error);
  }
}
