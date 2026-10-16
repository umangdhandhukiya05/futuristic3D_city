import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadRoads(scene) {
  const loader = getModelLoader();
  try {
    const [straightGltf, junctionGltf] = await Promise.all([
      loader.loadAsync("/models/road/straight_road.glb"),
      loader.loadAsync("/models/road/road_junction.glb"),
    ]);

    const roadGroup = new THREE.Group();
    roadGroup.name = "City_Road_Network";

    // Road scaling factor to match building & character proportions
    const ROAD_SCALE = 0.5;

    // Create centered wrapper for any GLTF model so origin (0,0,0) is exact geometric center
    const createCenteredTemplate = (gltfScene) => {
      const wrapper = new THREE.Group();
      const model = gltfScene.clone(true);
      
      const box = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Shift mesh geometry to center
      model.position.x -= center.x;
      model.position.z -= center.z;

      wrapper.add(model);

      const size = new THREE.Vector3(
        (box.max.x - box.min.x) * ROAD_SCALE,
        (box.max.y - box.min.y) * ROAD_SCALE,
        (box.max.z - box.min.z) * ROAD_SCALE
      );

      return { wrapper, size };
    };

    const straightData = createCenteredTemplate(straightGltf.scene);
    const junctionData = createCenteredTemplate(junctionGltf.scene);

    // Determine grid step size from scaled straight piece bounding dimensions
    const tileSize = Math.max(straightData.size.x, straightData.size.z) || 15;

    // Helper to instantiate and place road piece on grid
    const addRoad = (templateWrapper, x, z, rotY = 0) => {
      const clone = templateWrapper.clone(true);
      clone.position.set(x, 0.02, z);
      clone.rotation.y = rotY;
      clone.scale.set(ROAD_SCALE, ROAD_SCALE, ROAD_SCALE);
      clone.traverse((obj) => {
        if (obj.isMesh) {
          obj.receiveShadow = true;
          obj.castShadow = true;
        }
      });
      roadGroup.add(clone);
      return clone;
    };

    // 4x4 Grid layout offsets (junctions at -1.5 * tileSize and +1.5 * tileSize)
    const posMax = tileSize * 1.5;
    const posHalf = tileSize * 0.5;

    // Detect if straight_road runs along X or Z by default
    const straightAxisIsZ = straightData.size.z > straightData.size.x;
    const rotHorizontal = straightAxisIsZ ? Math.PI / 2 : 0;
    const rotVertical = straightAxisIsZ ? 0 : Math.PI / 2;

    // 1. ROAD JUNCTIONS (4 Crossroad intersections at corners to allow expanding the city)
    // Top-Left (North-West)
    addRoad(junctionData.wrapper, -posMax, -posMax, 0);

    // Top-Right (North-East)
    addRoad(junctionData.wrapper, posMax, -posMax, 0);

    // Bottom-Right (South-East)
    addRoad(junctionData.wrapper, posMax, posMax, 0);

    // Bottom-Left (South-West)
    addRoad(junctionData.wrapper, -posMax, posMax, 0);

    // 2. STRAIGHT ROADS (4 Sides of the Square Loop)
    // Top Side (North: Z = -posMax)
    addRoad(straightData.wrapper, -posHalf, -posMax, rotHorizontal);
    addRoad(straightData.wrapper, posHalf, -posMax, rotHorizontal);

    // Bottom Side (South: Z = posMax)
    addRoad(straightData.wrapper, -posHalf, posMax, rotHorizontal);
    addRoad(straightData.wrapper, posHalf, posMax, rotHorizontal);

    // Left Side (West: X = -posMax)
    addRoad(straightData.wrapper, -posMax, -posHalf, rotVertical);
    addRoad(straightData.wrapper, -posMax, posHalf, rotVertical);

    // Right Side (East: X = posMax)
    addRoad(straightData.wrapper, posMax, -posHalf, rotVertical);
    addRoad(straightData.wrapper, posMax, posHalf, rotVertical);

    // 3. EXTENDED STRAIGHT ROADS (Extending outward from the 4 crossroad junctions to plane boundary)
    // Ground plane size = 500 (bounds: -250 to 250). Straight tiles fit up to 240 without exceeding plane.
    const planeHalf = 250;
    const extSteps = [];
    for (let step = posMax + tileSize; step + tileSize / 2 <= planeHalf; step += tileSize) {
      extSteps.push(step);
    }
    // Resulting steps: [100, 140, 180, 220] (spans from -240 to +240)

    extSteps.forEach((step) => {
      // North extensions (from NW & NE junctions going North towards Z = -250)
      addRoad(straightData.wrapper, -posMax, -step, rotVertical);
      addRoad(straightData.wrapper, posMax, -step, rotVertical);

      // South extensions (from SW & SE junctions going South towards Z = +250)
      addRoad(straightData.wrapper, -posMax, step, rotVertical);
      addRoad(straightData.wrapper, posMax, step, rotVertical);

      // West extensions (from NW & SW junctions going West towards X = -250)
      addRoad(straightData.wrapper, -step, -posMax, rotHorizontal);
      addRoad(straightData.wrapper, -step, posMax, rotHorizontal);

      // East extensions (from NE & SE junctions going East towards X = +250)
      addRoad(straightData.wrapper, step, -posMax, rotHorizontal);
      addRoad(straightData.wrapper, step, posMax, rotHorizontal);
    });

    // Consolidate all 28 road tiles into just 5 material-batched meshes
    const matGroups = {};
    roadGroup.updateMatrixWorld(true);
    roadGroup.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const mat = obj.material;
        const matKey = mat ? (mat.uuid || mat.name) : "default";
        if (!matGroups[matKey]) {
          matGroups[matKey] = { material: mat, geoms: [] };
        }
        const geom = obj.geometry.clone();
        geom.applyMatrix4(obj.matrixWorld);
        matGroups[matKey].geoms.push(geom);
      }
    });

    const optimizedRoadGroup = new THREE.Group();
    optimizedRoadGroup.name = "City_Road_Network_Optimized";
    for (const [, data] of Object.entries(matGroups)) {
      const merged = mergeGeometries(data.geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, data.material);
        optimizedRoadGroup.add(mesh);
      }
    }

    scene.add(optimizedRoadGroup);
    return optimizedRoadGroup;
  } catch (error) {
    console.error("Error loading road models:", error);
  }
}
