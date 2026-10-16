import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadBuilding(scene, physicsSystem = null) {
    const loader = getModelLoader();
    const buildingsGroup = new THREE.Group();
    buildingsGroup.name = "City_Buildings_Group";

    // Helper to process, scale (0.5), merge geometries by material (drastically cutting draw calls), and center horizontally at Y = 0
    const createBuildingWrapper = (gltfScene, scale = 0.5) => {
        const model = gltfScene.clone(true);
        model.scale.set(scale, scale, scale);
        model.updateMatrixWorld(true);

        const matGroups = {};

        // Keep all building Blender meshes (lawns, base slabs, trees, windows) visible, but skip embedded static cars
        model.traverse((obj) => {
            if (obj.isMesh && obj.geometry) {
                const nameLower = (obj.name || "").toLowerCase();
                const parentName = (obj.parent && obj.parent.name || "").toLowerCase();
                let matName = "";
                if (obj.material) {
                    matName = Array.isArray(obj.material)
                        ? obj.material.map(m => (m.name || "").toLowerCase()).join(" ")
                        : (obj.material.name || "").toLowerCase();
                }

                const fullIdent = `${nameLower} ${parentName} ${matName}`;

                // Compute bounding size to catch un-named embedded cars in building lots
                const objBox = new THREE.Box3().setFromObject(obj);
                const size = new THREE.Vector3();
                objBox.getSize(size);

                const isEmbeddedCarByName = (
                    fullIdent.includes("car") ||
                    fullIdent.includes("vehic") ||
                    fullIdent.includes("auto") ||
                    fullIdent.includes("bus") ||
                    fullIdent.includes("sedan") ||
                    fullIdent.includes("suv") ||
                    fullIdent.includes("hatch") ||
                    fullIdent.includes("wheel") ||
                    fullIdent.includes("tire") ||
                    fullIdent.includes("automobile")
                );

                // Detect small car-sized prop sitting on parking lot / driveway ground
                const isCarSizedPropOnGround = (
                    size.y > 0.4 && size.y < 2.5 &&
                    size.x > 0.8 && size.x < 5.5 &&
                    size.z > 0.8 && size.z < 5.5 &&
                    objBox.min.y < 2.0 &&
                    !nameLower.startsWith("normalhouse") &&
                    !fullIdent.includes("tree") &&
                    !fullIdent.includes("plant") &&
                    !fullIdent.includes("door") &&
                    !fullIdent.includes("window") &&
                    !fullIdent.includes("roof") &&
                    !fullIdent.includes("wall") &&
                    !fullIdent.includes("table") &&
                    !fullIdent.includes("chair") &&
                    !fullIdent.includes("sofa") &&
                    !fullIdent.includes("bed") &&
                    !fullIdent.includes("desk") &&
                    !fullIdent.includes("furniture") &&
                    !fullIdent.includes("furn") &&
                    !fullIdent.includes("stair") &&
                    !fullIdent.includes("mat") &&
                    !fullIdent.includes("rug") &&
                    !fullIdent.includes("lamp") &&
                    !fullIdent.includes("shelf") &&
                    !fullIdent.includes("console") &&
                    !fullIdent.includes("unit") &&
                    !fullIdent.includes("bar") &&
                    !fullIdent.includes("cabinet")
                );

                if (isEmbeddedCarByName || isCarSizedPropOnGround) {
                    return; // Skip embedded cars from geometry merge
                }

                const mat = obj.material;
                const matKey = mat ? (mat.uuid || mat.name || "default") : "default";
                if (!matGroups[matKey]) {
                    matGroups[matKey] = { material: mat, geoms: [] };
                }

                const geom = obj.geometry.clone();
                geom.applyMatrix4(obj.matrixWorld);
                matGroups[matKey].geoms.push(geom);
            }
        });

        // Merge sub-meshes into a handful of consolidated meshes per building
        const mergedContainer = new THREE.Group();
        for (const [, data] of Object.entries(matGroups)) {
            const merged = mergeGeometries(data.geoms, false);
            if (merged) {
                const mat = data.material;
                const mesh = new THREE.Mesh(merged, mat);
                const isGlass = mat && (mat.transparent || (mat.name && mat.name.toLowerCase().includes("glass")));
                mesh.castShadow = !isGlass;
                mesh.receiveShadow = true;
                mergedContainer.add(mesh);
            }
        }

        // Compute exact 3D bounding box of building structure to center horizontally and align base to ground level (Y = 0)
        const box = new THREE.Box3().setFromObject(mergedContainer);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const wrapper = new THREE.Group();
        mergedContainer.position.set(-center.x, -box.min.y, -center.z);
        wrapper.add(mergedContainer);
        return wrapper;
    };

    try {
        const [gltfModern, gltfMedium, gltfSky, gltfHouse, gltfCommonHouse] = await Promise.all([
            loader.loadAsync("/models/building/modern_building.glb"),
            loader.loadAsync("/models/building/medium-building.glb"),
            loader.loadAsync("/models/building/skyScraper_model.glb"),
            loader.loadAsync("/models/building/house.glb"),
            loader.loadAsync("/models/building/common-house.glb")
        ]);

        // Create optimized building templates (0.5 scale)
        const templateModern = createBuildingWrapper(gltfModern.scene, 0.5);
        const templateHouse = createBuildingWrapper(gltfHouse.scene, 0.5);
        const templateSky = createBuildingWrapper(gltfSky.scene, 0.5);
        const templateMedium = createBuildingWrapper(gltfMedium.scene, 0.5);
        const templateCommonHouse = createBuildingWrapper(gltfCommonHouse.scene, 0.5);

        // Helper to place and orient buildings
        const placeBuilding = (template, x, z, rotY = 0, scale = 1.0) => {
            const clone = template.clone(true);
            clone.position.set(x, 0, z);
            clone.rotation.y = rotY;
            if (scale !== 1.0) {
                clone.scale.set(scale, scale, scale);
            }
            buildingsGroup.add(clone);

            if (physicsSystem) {
                clone.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(clone);
                const size = new THREE.Vector3();
                const center = new THREE.Vector3();
                box.getSize(size);
                box.getCenter(center);
                // Keep building collider slightly inset so player can walk cleanly on adjacent sidewalks
                const inset = 0.4;
                const hx = Math.max(0.5, (size.x - inset) / 2);
                const hy = Math.max(1.0, size.y / 2);
                const hz = Math.max(0.5, (size.z - inset) / 2);
                physicsSystem.addStaticBox(center.x, center.y, center.z, hx, hy, hz);
            }

            return clone;
        };

        // ========================================================
        // 1. EAST BLOCK (Center: X = +120, Z = 0)
        // ========================================================
        placeBuilding(templateModern, 115, -25.8, 0);
        placeBuilding(templateHouse, 143.35, 20.82, Math.PI / 2);
        placeBuilding(templateSky, 95.7, 24.75, 0);
        placeBuilding(templateMedium, 148.45, -30, Math.PI / 2);
        placeBuilding(templateMedium, 148.45, -8.35, Math.PI / 2);
        placeBuilding(templateCommonHouse, 190.0, -25.8, Math.PI / 2);

        // ========================================================
        // 2. WEST BLOCK (Center: X = -120, Z = 0)
        // ========================================================
        placeBuilding(templateModern, -115, 25.8, Math.PI);
        placeBuilding(templateHouse, -143.35, -20.82, -Math.PI / 2);
        placeBuilding(templateSky, -95.7, -24.75, Math.PI);
        placeBuilding(templateMedium, -148.45, 30, -Math.PI / 2);
        placeBuilding(templateMedium, -148.45, 8.35, -Math.PI / 2);
        placeBuilding(templateCommonHouse, -190.0, 25.8, -Math.PI / 2);

        // ========================================================
        // 3. NORTH BLOCK (Center: X = 0, Z = -120)
        // ========================================================
        placeBuilding(templateModern, -25.8, -115, Math.PI / 2);
        placeBuilding(templateHouse, 20.82, -143.35, Math.PI);
        placeBuilding(templateSky, 24.75, -95.7, Math.PI / 2);
        placeBuilding(templateMedium, -30, -148.45, 0);
        placeBuilding(templateMedium, -8.35, -148.45, 0);
        placeBuilding(templateCommonHouse, -25.8, -190.0, Math.PI);

        // ========================================================
        // 4. SOUTH BLOCK (Center: X = 0, Z = +120)
        // ========================================================
        placeBuilding(templateModern, 25.8, 115, -Math.PI / 2);
        placeBuilding(templateHouse, -20.82, 143.35, 0);
        placeBuilding(templateSky, -24.75, 95.7, -Math.PI / 2);
        placeBuilding(templateMedium, 30, 148.45, Math.PI);
        placeBuilding(templateMedium, 8.35, 148.45, Math.PI);
        placeBuilding(templateCommonHouse, 25.8, 190.0, 0);

        // ========================================================
        // 5. CORNER BLOCKS
        // ========================================================
        // 5.1 North-East (NE) Corner (X > 80, Z < -80):
        placeBuilding(templateSky, 95.0, -95.5, 1.571);
        placeBuilding(templateSky, 90.5, -170.5, -3.142, 0.7);
        placeBuilding(templateModern, 165.0, -94.0, 0.000);
        placeBuilding(templateHouse, 96.5, -136.5, 1.571);
        placeBuilding(templateCommonHouse, 160.0, -145.0, -Math.PI / 2);

        // 5.2 North-West (NW) Corner (X < -80, Z < -80):
        placeBuilding(templateSky, -95.5, -95.0, 0.000);
        placeBuilding(templateSky, -170.5, -90.5, 1.570, 0.7);
        placeBuilding(templateModern, -94.0, -165.0, -1.571);
        placeBuilding(templateHouse, -136.5, -96.5, 0.000);
        placeBuilding(templateCommonHouse, -145.0, -160.0, -Math.PI);

        // 5.3 South-West (SW) Corner (X < -80, Z > 80):
        placeBuilding(templateSky, -95.0, 95.5, -1.571);
        placeBuilding(templateSky, -90.5, 170.5, 0.000, 0.7);
        placeBuilding(templateModern, -165.0, 94.0, 3.142);
        placeBuilding(templateHouse, -96.5, 136.5, -1.571);
        placeBuilding(templateCommonHouse, -160.0, 145.0, Math.PI / 2);

        // 5.4 South-East (SE) Corner (X > 80, Z > 80):
        placeBuilding(templateSky, 95.5, 95.0, -3.141);
        placeBuilding(templateSky, 170.5, 90.5, -1.571, 0.7);
        placeBuilding(templateModern, 94.0, 165.0, 1.571);
        placeBuilding(templateHouse, 136.5, 96.5, -3.141);
        placeBuilding(templateCommonHouse, 145.0, 160.0, 0);

        buildingsGroup.traverse((obj) => {
            if (obj.isMesh && obj.visible) {
                const mat = obj.material;
                const isGlass = mat && (mat.transparent || (mat.name && mat.name.toLowerCase().includes("glass")));
                obj.castShadow = !isGlass;
                obj.receiveShadow = true;
            }
        });

        scene.add(buildingsGroup);
        return buildingsGroup;
    } catch (error) {
        console.error("Error loading building models:", error);
    }
}


