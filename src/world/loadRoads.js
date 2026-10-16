import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadRoads(scene, physicsSystem = null) {
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

    // Register seamless physical sidewalk elevation colliders (surface at exact Y = 0.42)
    if (physicsSystem) {
      const SIDEWALK_HY = 0.21;
      const SW_HALF_WIDTH = 3.85; // Seamless coverage from curb (±12.60) to plaza border (±20.30)
      const INNER_POS = 43.85;
      const OUTER_POS = 76.45;

      // 1. Central square loop straight sidewalks (X or Z between -40 and +40)
      const loopStraightLen = 40;
      // North road (Z = -60)
      physicsSystem.addStaticBox(0, SIDEWALK_HY, -INNER_POS, loopStraightLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(0, SIDEWALK_HY, -OUTER_POS, loopStraightLen, SIDEWALK_HY, SW_HALF_WIDTH);
      // South road (Z = +60)
      physicsSystem.addStaticBox(0, SIDEWALK_HY, INNER_POS, loopStraightLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(0, SIDEWALK_HY, OUTER_POS, loopStraightLen, SIDEWALK_HY, SW_HALF_WIDTH);
      // West road (X = -60)
      physicsSystem.addStaticBox(-INNER_POS, SIDEWALK_HY, 0, SW_HALF_WIDTH, SIDEWALK_HY, loopStraightLen);
      physicsSystem.addStaticBox(-OUTER_POS, SIDEWALK_HY, 0, SW_HALF_WIDTH, SIDEWALK_HY, loopStraightLen);
      // East road (X = +60)
      physicsSystem.addStaticBox(INNER_POS, SIDEWALK_HY, 0, SW_HALF_WIDTH, SIDEWALK_HY, loopStraightLen);
      physicsSystem.addStaticBox(OUTER_POS, SIDEWALK_HY, 0, SW_HALF_WIDTH, SIDEWALK_HY, loopStraightLen);

      // 2. The 4 Crossroad Junction Corners (centered at X=±60, Z=±60)
      const junctionCorners = [
        // NW Junction (center: -60, -60)
        [-OUTER_POS, -OUTER_POS], [-OUTER_POS, -INNER_POS], [-INNER_POS, -OUTER_POS], [-INNER_POS, -INNER_POS],
        // NE Junction (center: +60, -60)
        [OUTER_POS, -OUTER_POS], [OUTER_POS, -INNER_POS], [INNER_POS, -OUTER_POS], [INNER_POS, -INNER_POS],
        // SE Junction (center: +60, +60)
        [OUTER_POS, OUTER_POS], [OUTER_POS, INNER_POS], [INNER_POS, OUTER_POS], [INNER_POS, INNER_POS],
        // SW Junction (center: -60, +60)
        [-OUTER_POS, OUTER_POS], [-OUTER_POS, INNER_POS], [-INNER_POS, OUTER_POS], [-INNER_POS, INNER_POS],
      ];
      junctionCorners.forEach(([cx, cz]) => {
        physicsSystem.addStaticBox(cx, SIDEWALK_HY, cz, SW_HALF_WIDTH, SIDEWALK_HY, SW_HALF_WIDTH);
      });

      // 3. Extended road branch sidewalks (extending out from ±80 to ±240, length = 160)
      const extBranchCenter = 160;
      const extBranchHalfLen = 80;

      // North extensions (going from Z = -80 to Z = -240)
      physicsSystem.addStaticBox(-OUTER_POS, SIDEWALK_HY, -extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(-INNER_POS, SIDEWALK_HY, -extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(INNER_POS, SIDEWALK_HY, -extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(OUTER_POS, SIDEWALK_HY, -extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);

      // South extensions (going from Z = +80 to Z = +240)
      physicsSystem.addStaticBox(-OUTER_POS, SIDEWALK_HY, extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(-INNER_POS, SIDEWALK_HY, extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(INNER_POS, SIDEWALK_HY, extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);
      physicsSystem.addStaticBox(OUTER_POS, SIDEWALK_HY, extBranchCenter, SW_HALF_WIDTH, SIDEWALK_HY, extBranchHalfLen);

      // West extensions (going from X = -80 to X = -240)
      physicsSystem.addStaticBox(-extBranchCenter, SIDEWALK_HY, -OUTER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(-extBranchCenter, SIDEWALK_HY, -INNER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(-extBranchCenter, SIDEWALK_HY, INNER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(-extBranchCenter, SIDEWALK_HY, OUTER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);

      // East extensions (going from X = +80 to X = +240)
      physicsSystem.addStaticBox(extBranchCenter, SIDEWALK_HY, -OUTER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(extBranchCenter, SIDEWALK_HY, -INNER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(extBranchCenter, SIDEWALK_HY, INNER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
      physicsSystem.addStaticBox(extBranchCenter, SIDEWALK_HY, OUTER_POS, extBranchHalfLen, SIDEWALK_HY, SW_HALF_WIDTH);
    }

    return optimizedRoadGroup;
  } catch (error) {
    console.error("Error loading road models:", error);
  }
}
