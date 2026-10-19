import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getModelLoader } from "./modelLoader.js";

export async function loadBuilding(scene, physicsSystem = null, doorSystem = null) {
    if (doorSystem?.setScene) {
        doorSystem.setScene(scene);
    }

    // Local interior lighting presets for virtual rig illumination (60+ FPS, zero WebGL shader lag)
    const COMMON_HOUSE_LOCAL_LIGHTS = [
        { pos: new THREE.Vector3(0.0, 3.4, 0.5), color: 0xffeedd, range: 16.0, intensity: 45 },
        { pos: new THREE.Vector3(0.0, 8.8, -3.5), color: 0xffeedd, range: 16.0, intensity: 42 },
    ];

    const HOUSE_LOCAL_LIGHTS = [
        { pos: new THREE.Vector3(0.0, 3.4, -4.5), color: 0xffeedd, range: 18.0, intensity: 50 },
    ];

    const OFFICE_LOCAL_LIGHTS = [
        // 1. Dedicated Office Reception & Entrance Lobby Area (direct illumination over reception counter & brand wall)
        { pos: new THREE.Vector3(0.0, 2.7 * 1.6, 9.5 * 1.6), color: 0xfff3e0, range: 18.0 * 1.6, intensity: 60 },
        // 2. Open Workspace & Meeting Area (rear office zone behind partition wall)
        { pos: new THREE.Vector3(0.0, 2.7 * 1.6, -3.0 * 1.6), color: 0xffeedd, range: 20.0 * 1.6, intensity: 52 },
    ];

    const loader = getModelLoader();
    const buildingsGroup = new THREE.Group();
    buildingsGroup.name = "City_Buildings_Group";

    // Helper to process, scale (0.5), merge geometries by material (drastically cutting draw calls), and center horizontally at Y = 0
    const createBuildingWrapper = (gltfScene, scale = 0.5, buildingType = "solid") => {
        const model = gltfScene.clone(true);
        model.scale.set(scale, scale, scale);
        model.updateMatrixWorld(true);

        const matGroups = {};
        let commonHousePlasterMat = null;
        let houseConcreteMat = null;

        // Keep all building Blender meshes visible, but skip embedded static cars, boolean cutters, and interactive doors
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

                // 1. Exclude all Blender Boolean Cutter tool helper meshes (e.g., NormalHouse_Door_Front_Cutter)
                if (fullIdent.includes("cutter")) {
                    return;
                }

                // Enhance 3D brand logo, text signage, and wall lettering (ZIGNUTS, TECHNOLAB, etc.)
                if (nameLower.includes("text") || nameLower.includes("logo")) {
                    obj.material = obj.material.clone();
                    obj.material.side = THREE.DoubleSide;
                    if (nameLower.includes("zignuts")) {
                        obj.material.name = "Zignuts_Brand_Text";
                        obj.material.color = new THREE.Color(0x0088ff);
                        obj.material.emissive = new THREE.Color(0x0077ff);
                        obj.material.emissiveIntensity = 1.0;
                        obj.material.toneMapped = false;
                    } else if (nameLower.includes("technolab")) {
                        obj.material.name = "Zignuts_Technolab_Text";
                        obj.material.color = new THREE.Color(0xe0f2fe);
                        obj.material.emissive = new THREE.Color(0x38bdf8);
                        obj.material.emissiveIntensity = 0.8;
                        obj.material.toneMapped = false;
                    } else if (nameLower.includes("logo_text") || nameLower.includes("logo_subtitle") || nameLower.includes("logo_icon")) {
                        obj.material.name = "Zignuts_Logo_Signage";
                        if (!matName.includes("white")) {
                            obj.material.color = new THREE.Color(0x0088ff);
                            obj.material.emissive = new THREE.Color(0x0066cc);
                            obj.material.emissiveIntensity = 0.8;
                        } else {
                            obj.material.emissive = new THREE.Color(0xffffff);
                            obj.material.emissiveIntensity = 0.5;
                        }
                        obj.material.toneMapped = false;
                    }
                }

                // 2. Separate interactive door meshes so they remain animated and distinct
                if (buildingType === "common-house" && (fullIdent.includes("door_front_leaf") || fullIdent.includes("front_leaf"))) {
                    return; // Skip from static merge
                }
                if (buildingType === "house" && (parentName === "house_door" || nameLower === "house_door" || nameLower.startsWith("house_door_1") || nameLower.startsWith("house_door_2") || nameLower.startsWith("house_door_handle"))) {
                    return; // Skip from static merge
                }
                if (buildingType === "office" && (parentName.includes("door_hinge") || nameLower.includes("door_hinge") || nameLower.includes("door_glass") || nameLower.includes("door_leaf") || parentName.includes("door_leaf"))) {
                    return; // Skip interactive office door from static merge
                }

                // 3. For house.glb: House_Ground_Floor_Front_R is a solid wall that spans straight across the doorway.
                // We capture its concrete material and skip the solid block; doorway cutout wall sections are created below.
                if (buildingType === "house" && nameLower.includes("ground_floor_front_r")) {
                    houseConcreteMat = obj.material;
                    return;
                }

                // 4. For common-house.glb: NormalHouse_Wall_Front_Ground has solid triangles across the doorway.
                // We carve out the doorway opening by filtering out triangles spanning across the door region (x >= 0.30 in local coords).
                if (buildingType === "common-house" && nameLower.includes("wall_front_ground")) {
                    commonHousePlasterMat = obj.material;
                    const geom = obj.geometry.clone();
                    const posAttr = geom.getAttribute("position");
                    const indexAttr = geom.getIndex();
                    if (posAttr && indexAttr) {
                        const indices = indexAttr.array;
                        const newIndices = [];
                        for (let i = 0; i < indices.length; i += 3) {
                            const iA = indices[i], iB = indices[i + 1], iC = indices[i + 2];
                            const minX = Math.min(posAttr.getX(iA), posAttr.getX(iB), posAttr.getX(iC));
                            if (minX >= 0.30) {
                                continue; // Drop solid triangles covering the doorway and right wall
                            }
                            newIndices.push(iA, iB, iC);
                        }
                        geom.setIndex(newIndices);
                    }
                    geom.applyMatrix4(obj.matrixWorld);
                    const mat = obj.material;
                    const matKey = mat ? (mat.uuid || mat.name || "default") : "default";
                    if (!matGroups[matKey]) {
                        matGroups[matKey] = { material: mat, geoms: [] };
                    }
                    matGroups[matKey].geoms.push(geom);
                    return;
                }

                // Enhance interior materials of common-house to match architectural render / Image 4
                if (buildingType === "common-house" && obj.material) {
                    const applyMatTuning = (m) => {
                        if (!m) return;
                        const mName = (m.name || "").toLowerCase();
                        if (mName.includes("floor_wood")) {
                            // Warm architectural wood plank tone matching reference image
                            m.color.setHex(0xb58d67);
                            m.roughness = 0.45;
                        } else if (mName.includes("stairs_concrete")) {
                            // Distinct step concrete tone giving crisp step visibility from top and bottom
                            m.color.setHex(0xdcd7ce);
                            m.roughness = 0.70;
                        } else if (mName.includes("stairs_rail")) {
                            // Dark architectural steel railing
                            m.color.setHex(0x23272e);
                            m.roughness = 0.35;
                        } else if (mName.includes("plaster")) {
                            // Soft warm interior plaster off-white avoiding flat blinding white wash
                            m.color.setHex(0xf4f1ea);
                            m.roughness = 0.85;
                        }
                    };
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(applyMatTuning);
                    } else {
                        applyMatTuning(obj.material);
                    }
                }

                // 5. For common-house.glb: Carve out the stairwell rectangular opening in NormalHouse_Floor_Upper_Balcony
                // so the staircase is completely visible from bottom-to-top and top-to-bottom with proper rim trim faces
                if (buildingType === "common-house" && nameLower.includes("floor_upper_balcony")) {
                    const origGeom = obj.geometry.clone();
                    origGeom.applyMatrix4(obj.matrixWorld);

                    const pos = origGeom.getAttribute("position");
                    const idx = origGeom.getIndex();
                    const nor = origGeom.getAttribute("normal");
                    const uv = origGeom.getAttribute("uv");

                    // Triangles 26 & 27 (solid bottom ceiling) and 40 & 41 (solid top floor) span across the stairwell
                    const skipTriangles = new Set([26, 27, 40, 41]);
                    const newPositions = [];
                    const newNormals = [];
                    const newUVs = [];
                    const newIndices = [];
                    let vCount = 0;

                    for (let i = 0; i < idx.count; i += 3) {
                        const triIdx = i / 3;
                        if (skipTriangles.has(triIdx)) continue;

                        for (let j = 0; j < 3; j++) {
                            const vIdx = idx.getX(i + j);
                            newPositions.push(pos.getX(vIdx), pos.getY(vIdx), pos.getZ(vIdx));
                            newNormals.push(nor ? nor.getX(vIdx) : 0, nor ? nor.getY(vIdx) : 1, nor ? nor.getZ(vIdx) : 0);
                            newUVs.push(uv ? uv.getX(vIdx) : 0, uv ? uv.getY(vIdx) : 0);
                            newIndices.push(vCount++);
                        }
                    }

                    // Helper to add a quad with scaled texture coordinates
                    const addQuad = (p1, p2, p3, p4, normal, uvScale = 0.2) => {
                        const quadPositions = [
                            p1[0], p1[1], p1[2],
                            p2[0], p2[1], p2[2],
                            p3[0], p3[1], p3[2],
                            p1[0], p1[1], p1[2],
                            p3[0], p3[1], p3[2],
                            p4[0], p4[1], p4[2],
                        ];
                        for (let k = 0; k < 6; k++) {
                            newPositions.push(quadPositions[k * 3], quadPositions[k * 3 + 1], quadPositions[k * 3 + 2]);
                            newNormals.push(normal[0], normal[1], normal[2]);
                            newUVs.push(quadPositions[k * 3] * uvScale, quadPositions[k * 3 + 2] * uvScale);
                            newIndices.push(vCount++);
                        }
                    };

                    // Exact scaled coordinates for common-house upper floor slab (scale 0.25)
                    const xMin = -82.158, xCut = -75.45, xMax = -61.908;
                    const zMin = -8.229, zCut = -4.075, zMax = 11.025;
                    const yBot = 5.2465, yTop = 5.75;

                    // 1. North Floor Slab (z: zCut to zMax, spanning full width xMin to xMax)
                    // Top face (+Y)
                    addQuad([xMin, yTop, zMax], [xMax, yTop, zMax], [xMax, yTop, zCut], [xMin, yTop, zCut], [0, 1, 0]);
                    // Bottom ceiling face (-Y)
                    addQuad([xMin, yBot, zCut], [xMax, yBot, zCut], [xMax, yBot, zMax], [xMin, yBot, zMax], [0, -1, 0]);

                    // 2. East Floor Slab beside stairs (z: zMin to zCut, x: xCut to xMax)
                    // Top face (+Y)
                    addQuad([xCut, yTop, zCut], [xMax, yTop, zCut], [xMax, yTop, zMin], [xCut, yTop, zMin], [0, 1, 0]);
                    // Bottom ceiling face (-Y)
                    addQuad([xCut, yBot, zMin], [xMax, yBot, zMin], [xMax, yBot, zCut], [xCut, yBot, zCut], [0, -1, 0]);

                    // 3. Inner Stairwell Rim Faces (wooden side-trim enclosing the cut slab edges)
                    // East rim face at x = xCut (facing into stair opening -X)
                    addQuad([xCut, yTop, zMin], [xCut, yTop, zCut], [xCut, yBot, zCut], [xCut, yBot, zMin], [-1, 0, 0]);
                    // North rim face at z = zCut (facing into stair opening -Z)
                    addQuad([xCut, yTop, zCut], [xMin, yTop, zCut], [xMin, yBot, zCut], [xCut, yBot, zCut], [0, 0, -1]);

                    const carvedGeom = new THREE.BufferGeometry();
                    carvedGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(newPositions), 3));
                    carvedGeom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(newNormals), 3));
                    carvedGeom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(newUVs), 2));
                    carvedGeom.setIndex(newIndices);

                    const mat = obj.material;
                    const matKey = mat ? (mat.uuid || mat.name || "default") : "default";
                    if (!matGroups[matKey]) {
                        matGroups[matKey] = { material: mat, geoms: [] };
                    }
                    matGroups[matKey].geoms.push(carvedGeom);
                    origGeom.dispose();
                    return;
                }

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
            // Normalize attributes so mergeGeometries never fails due to missing UVs/normals across meshes sharing a material
            if (data.geoms.length > 1) {
                const allAttrNames = new Set();
                data.geoms.forEach((g) => {
                    Object.keys(g.attributes).forEach((name) => allAttrNames.add(name));
                });

                data.geoms.forEach((g) => {
                    allAttrNames.forEach((attrName) => {
                        if (!g.attributes[attrName]) {
                            const count = g.attributes.position.count;
                            let itemSize = 3;
                            if (attrName === "uv" || attrName === "uv2") itemSize = 2;
                            else if (attrName.includes("tangent")) itemSize = 4;
                            g.setAttribute(attrName, new THREE.BufferAttribute(new Float32Array(count * itemSize), itemSize));
                        }
                    });
                });
            }

            const merged = mergeGeometries(data.geoms, false);
            const isEnterable = buildingType === "common-house" || buildingType === "house" || buildingType === "office";
            if (merged) {
                const mat = data.material;
                if (mat && isEnterable) {
                    mat.shadowSide = THREE.DoubleSide;
                    if (mat.isMeshStandardMaterial) {
                        mat.envMapIntensity = 0.05;
                    }
                }
                const mesh = new THREE.Mesh(merged, mat);
                const isGlass = mat && (mat.transparent || (mat.name && mat.name.toLowerCase().includes("glass")));
                mesh.castShadow = !isGlass;
                mesh.receiveShadow = true;
                mergedContainer.add(mesh);
            } else {
                // Fallback: If merge fails for any reason, add meshes individually so nothing is ever dropped!
                data.geoms.forEach((g) => {
                    const mat = data.material;
                    if (mat && isEnterable) {
                        mat.shadowSide = THREE.DoubleSide;
                        if (mat.isMeshStandardMaterial) {
                            mat.envMapIntensity = 0.05;
                        }
                    }
                    const mesh = new THREE.Mesh(g, mat);
                    const isGlass = mat && (mat.transparent || (mat.name && mat.name.toLowerCase().includes("glass")));
                    mesh.castShadow = !isGlass;
                    mesh.receiveShadow = true;
                    mergedContainer.add(mesh);
                });
            }
        }

        // Compute exact 3D bounding box of building structure to center horizontally and align base to ground level (Y = 0)
        const box = new THREE.Box3().setFromObject(mergedContainer);
        if (box.isEmpty()) {
            console.warn(`[loadBuilding] Model for ${buildingType} is empty.`);
            const emptyGroup = new THREE.Group();
            emptyGroup.userData.buildingType = buildingType;
            return emptyGroup;
        }

        const center = new THREE.Vector3();
        box.getCenter(center);

        const wrapper = new THREE.Group();
        mergedContainer.position.set(-center.x, -box.min.y, -center.z);
        wrapper.add(mergedContainer);
        wrapper.userData.buildingType = buildingType;

        // Attach live interactive door components and doorway wall segments aligned with the centered wrapper
        if (buildingType === "common-house") {
            // Add right wall segment and lintel segment with doorway opening (x: 3.35 to 5.65, y: 0.50 to 4.53) completely clear
            const plasterMat = (Array.isArray(commonHousePlasterMat) ? commonHousePlasterMat[0] : commonHousePlasterMat)
                || new THREE.MeshStandardMaterial({ color: 0xefefef, roughness: 0.8 });

            // Right wall segment of front wall (spans from x: 5.95 to east wall at x: 10.60, closing corner gap)
            const rightWall = new THREE.Mesh(new THREE.BoxGeometry(4.65, 6.00, 0.20), plasterMat);
            rightWall.position.set(8.275, 3.00, 7.72);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            wrapper.add(rightWall);

            // Lintel wall segment above front door (spans from x: 3.70 to x: 6.05, y: 4.50 to 6.00)
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.50, 0.20), plasterMat);
            lintel.position.set(4.875, 5.25, 7.72);
            lintel.castShadow = true;
            lintel.receiveShadow = true;
            wrapper.add(lintel);

            const doorLeaf = model.getObjectByName("NormalHouse_Door_Front_Leaf");
            if (doorLeaf) {
                const leafWorldPos = new THREE.Vector3();
                doorLeaf.getWorldPosition(leafWorldPos);

                const doorPivot = new THREE.Group();
                doorPivot.name = "NormalHouse_Door_Front_Pivot";
                // Place pivot at exact hinge position relative to centered building
                doorPivot.position.set(
                    leafWorldPos.x - center.x,
                    leafWorldPos.y - box.min.y,
                    leafWorldPos.z - center.z
                );

                const doorClone = doorLeaf.clone(true);
                doorClone.position.set(0, 0, 0);
                doorClone.scale.set(scale, scale, scale);
                doorPivot.add(doorClone);
                wrapper.add(doorPivot);
            }

            // Extract exact 3D triangular mesh geometry for all interior furniture, props, and stairs
            const allVertices = [];
            const allIndices = [];
            let vertexOffset = 0;
            const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);

            model.traverse((obj) => {
                if (obj.isMesh && obj.geometry) {
                    const nameLower = (obj.name || "").toLowerCase();
                    const parentName = (obj.parent && obj.parent.name || "").toLowerCase();
                    const fullIdent = `${nameLower} ${parentName}`;

                    // Exclude cutters, structural walls, floors, roofs, floor rugs/mats, interactive door leaf, ceiling pendants
                    if (fullIdent.includes("cutter")) return;
                    if (nameLower.startsWith("normalhouse_wall_") ||
                        nameLower.startsWith("normalhouse_walls_") ||
                        nameLower.startsWith("normalhouse_floor_") ||
                        nameLower.startsWith("normalhouse_roof")) return;
                    if (fullIdent.includes("rug") || fullIdent.includes("mat")) return;
                    if (fullIdent.includes("door_front_leaf") || fullIdent.includes("front_leaf")) return;
                    if (fullIdent.includes("bar_pendants")) return;

                    const geom = obj.geometry.clone();
                    geom.applyMatrix4(obj.matrixWorld);

                    const pos = geom.getAttribute("position");
                    const idxAttr = geom.getIndex();
                    if (!pos || pos.count < 3) return;

                    const baseIndex = vertexOffset;
                    for (let i = 0; i < pos.count; i++) {
                        allVertices.push(
                            pos.getX(i) + offset.x,
                            pos.getY(i) + offset.y,
                            pos.getZ(i) + offset.z
                        );
                    }
                    vertexOffset += pos.count;

                    if (idxAttr) {
                        for (let i = 0; i < idxAttr.count; i++) {
                            allIndices.push(baseIndex + idxAttr.getX(i));
                        }
                    } else {
                        for (let i = 0; i < pos.count; i++) {
                            allIndices.push(baseIndex + i);
                        }
                    }
                }
            });

            wrapper.userData.interiorMeshData = {
                vertices: new Float32Array(allVertices),
                indices: new Uint32Array(allIndices),
            };
        } else if (buildingType === "house") {
            // Add surrounding wall segments around front doorway (doorway opening x: 6.50 to 10.60, y: 0.40 to 5.45 is completely clear)
            const concreteMat = (Array.isArray(houseConcreteMat) ? houseConcreteMat[0] : houseConcreteMat)
                || new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.7 });

            // Left wall segment
            const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.20, 6.00, 1.50), concreteMat);
            leftWall.position.set(5.90, 3.40, 2.95);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            wrapper.add(leftWall);

            // Right wall segment
            const rightWall = new THREE.Mesh(new THREE.BoxGeometry(2.70, 6.00, 1.50), concreteMat);
            rightWall.position.set(11.95, 3.40, 2.95);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            wrapper.add(rightWall);

            // Lintel segment above door (doorway below Y = 5.45 is completely open)
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.10, 0.95, 1.50), concreteMat);
            lintel.position.set(8.55, 5.925, 2.95);
            lintel.castShadow = true;
            lintel.receiveShadow = true;
            wrapper.add(lintel);

            const doorObj = model.getObjectByName("House_Door");
            if (doorObj) {
                const leafWorldPos = new THREE.Vector3();
                doorObj.getWorldPosition(leafWorldPos);

                const doorPivot = new THREE.Group();
                doorPivot.name = "House_Door_Pivot";
                doorPivot.position.set(
                    leafWorldPos.x - center.x,
                    leafWorldPos.y - box.min.y,
                    leafWorldPos.z - center.z
                );

                const dClone = doorObj.clone(true);
                dClone.position.set(0, 0, 0);
                dClone.scale.set(scale, scale, scale);
                doorPivot.add(dClone);

                wrapper.add(doorPivot);
            }
        } else if (buildingType === "office") {
            const doorPivot = model.getObjectByName("Door_Hinge_Pivot");
            if (doorPivot) {
                const pivotWorldPos = new THREE.Vector3();
                doorPivot.getWorldPosition(pivotWorldPos);

                const doorPivotClone = doorPivot.clone(true);
                doorPivotClone.name = "Office_Door_Pivot";
                doorPivotClone.position.set(
                    pivotWorldPos.x - center.x,
                    pivotWorldPos.y - box.min.y,
                    pivotWorldPos.z - center.z
                );
                doorPivotClone.scale.set(scale, scale, scale);

                doorPivotClone.traverse((obj) => {
                    if (obj.isMesh) {
                        const isGlass = obj.material && (obj.material.transparent || (obj.material.name && obj.material.name.toLowerCase().includes("glass")));
                        obj.castShadow = !isGlass;
                        obj.receiveShadow = true;
                    }
                });

                wrapper.add(doorPivotClone);
            }

            // Exterior architectural sign illumination to spotlight the ZIGNUTS TECHNOLAB wall signage at night
            const exteriorSignLight = new THREE.PointLight(0x00f0ff, 45, 12 * scale);
            exteriorSignLight.position.set(-7.0 * scale, 2.2 * scale, -2.5 * scale);
            mergedContainer.add(exteriorSignLight);

            // Extract exact 3D triangular mesh geometry for all office desks, chairs, meeting rooms, dividers, and reception
            const officeVertices = [];
            const officeIndices = [];
            let officeVertexOffset = 0;
            const officeOffset = new THREE.Vector3(-center.x, -box.min.y, -center.z);

            model.traverse((obj) => {
                if (obj.isMesh && obj.geometry) {
                    const nameLower = (obj.name || "").toLowerCase();
                    const parentName = (obj.parent && obj.parent.name || "").toLowerCase();
                    const fullIdent = `${nameLower} ${parentName}`;

                    // Exclude outer structural perimeter walls, floors, ceilings, interactive entrance door, and 2D text
                    if (nameLower.startsWith("floor_") || nameLower.startsWith("ceiling_")) return;
                    if (nameLower.startsWith("wall_") || parentName.startsWith("wall_")) return;
                    if (nameLower.startsWith("door_") || fullIdent.includes("doorleaf") || fullIdent.includes("doorhinge") || fullIdent.includes("door_trim")) return;
                    if (fullIdent.includes("light") || fullIdent.includes("fan") || fullIdent.includes("baffle")) return;
                    if (fullIdent.includes("logo") || fullIdent.includes("text") || fullIdent.includes("mural") || fullIdent.includes("quote")) return;
                    if (fullIdent.includes("cam_") || fullIdent.includes("skirting")) return;

                    const geom = obj.geometry.clone();
                    geom.applyMatrix4(obj.matrixWorld);

                    const pos = geom.getAttribute("position");
                    const idxAttr = geom.getIndex();
                    if (!pos || pos.count < 3) return;

                    const baseIndex = officeVertexOffset;
                    for (let i = 0; i < pos.count; i++) {
                        officeVertices.push(
                            pos.getX(i) + officeOffset.x,
                            pos.getY(i) + officeOffset.y,
                            pos.getZ(i) + officeOffset.z
                        );
                    }
                    officeVertexOffset += pos.count;

                    if (idxAttr) {
                        for (let i = 0; i < idxAttr.count; i++) {
                            officeIndices.push(baseIndex + idxAttr.getX(i));
                        }
                    } else {
                        for (let i = 0; i < pos.count; i++) {
                            officeIndices.push(baseIndex + i);
                        }
                    }
                }
            });

            wrapper.userData.interiorMeshData = {
                vertices: new Float32Array(officeVertices),
                indices: new Uint32Array(officeIndices),
            };
        }

        wrapper.userData.scale = scale;
        return wrapper;
    };

    try {
        const [gltfModern, gltfMedium, gltfSky, gltfHouse, gltfCommonHouse, gltfOffice] = await Promise.all([
            loader.loadAsync("/models/building/modern_building.glb"),
            loader.loadAsync("/models/building/medium-building.glb"),
            loader.loadAsync("/models/building/skyScraper_model.glb"),
            loader.loadAsync("/models/building/house.glb"),
            loader.loadAsync("/models/building/common-house.glb"),
            loader.loadAsync("/models/building/zignuts_office.glb")
        ]);

        // Create optimized building templates (0.5 scale for skyscrapers/houses, 0.25 scale for common-house, 1.6 scale for zignuts-office)
        const templateModern = createBuildingWrapper(gltfModern.scene, 0.5, "solid");
        const templateHouse = createBuildingWrapper(gltfHouse.scene, 0.5, "house");
        const templateSky = createBuildingWrapper(gltfSky.scene, 0.5, "solid");
        const templateMedium = createBuildingWrapper(gltfMedium.scene, 0.5, "solid");
        const templateCommonHouse = createBuildingWrapper(gltfCommonHouse.scene, 0.25, "common-house");
        const templateOffice = createBuildingWrapper(gltfOffice.scene, 1.6, "office");

        // Helper to place and orient buildings
        const placeBuilding = (template, x, z, rotY = 0, scale = 1.0) => {
            const clone = template.clone(true);
            clone.position.set(x, 0, z);
            clone.rotation.y = rotY;
            if (scale !== 1.0) {
                clone.scale.set(scale, scale, scale);
            }
            buildingsGroup.add(clone);

            const bType = template.userData.buildingType;

            if (physicsSystem) {
                if (bType === "common-house") {
                    // Exact 3D triangular mesh collider for all interior furniture, props, and staircase
                    if (template.userData.interiorMeshData) {
                        const { vertices, indices } = template.userData.interiorMeshData;
                        let v = vertices;
                        if (scale !== 1.0) {
                            v = new Float32Array(vertices.length);
                            for (let i = 0; i < vertices.length; i++) v[i] = vertices[i] * scale;
                        }
                        physicsSystem.addStaticMesh(x, 0, z, rotY, v, indices);
                    }

                    // Hollow interior colliders for common-house envelope (scale 0.25: floor & porch at Y = 0.50m)
                    const commonHouseWalls = [
                        // 1. Entire house foundation slab and surrounding porch (surface at exact visual floor Y = 0.50m)
                        { x: 0, y: 0.25, z: -1.0, hx: 10.6, hy: 0.25, hz: 11.0 },

                        // 2. Front entrance approach step from street level (Y = 0) up to porch (Y = 0.50m)
                        { x: 4.5, y: 0.125, z: 10.8, hx: 3.0, hy: 0.125, hz: 0.8 },

                        // 3. Interior room walls
                        // North back wall
                        { x: 0, y: 3.25, z: -11.5, hx: 10.1, hy: 2.75, hz: 0.2 },
                        // West left wall
                        { x: -10.1, y: 3.25, z: -1.9, hx: 0.2, hy: 2.75, hz: 9.6 },
                        // East right wall
                        { x: 10.1, y: 3.25, z: -1.9, hx: 0.2, hy: 2.75, hz: 9.6 },
                        // South front wall (left of door: x = -10.1 to 3.7)
                        { x: -3.2, y: 3.25, z: 7.72, hx: 6.9, hy: 2.75, hz: 0.2 },
                        // South front wall (right of door: x = 5.9 to 10.6, meets east wall at 10.6)
                        { x: 8.25, y: 3.25, z: 7.72, hx: 2.35, hy: 2.75, hz: 0.2 },
                        // Lintel above door (door height is from Y = 0.5 to Y = 4.5, lintel from 4.5 to 6.0)
                        { x: 4.85, y: 5.25, z: 7.72, hx: 1.15, hy: 0.75, hz: 0.2 },
                        // Ground floor interior divider wall (between hallway and living/kitchen, z = -0.49 to 7.67)
                        { x: -3.08, y: 3.00, z: 3.59, hx: 0.10, hy: 3.00, hz: 4.08 },

                        // 4. Second Floor Slab (stairwell cutout at x: -10.1 to -3.45, z: -11.5 to -7.3)
                        // South & central main upper floor (surface at Y = 6.00m)
                        { x: 0, y: 5.95, z: 0.2, hx: 10.1, hy: 0.05, hz: 7.5 },
                        // North-East upper floor (beside stairwell opening)
                        { x: 3.325, y: 5.95, z: -9.4, hx: 6.775, hy: 0.05, hz: 2.1 },
                        // South upper balcony floor (extends from Z = 7.7m to 12.0m)
                        { x: 0, y: 5.95, z: 9.85, hx: 10.1, hy: 0.05, hz: 2.15 },

                        // 5. Second Floor Perimeter Walls, Interior Dividing Wall & Railings
                        // Upper North back wall
                        { x: 0, y: 8.75, z: -11.5, hx: 10.1, hy: 2.75, hz: 0.2 },
                        // Upper West left wall
                        { x: -10.1, y: 8.75, z: -1.9, hx: 0.2, hy: 2.75, hz: 9.6 },
                        // Upper East right wall
                        { x: 10.1, y: 8.75, z: -1.9, hx: 0.2, hy: 2.75, hz: 9.6 },
                        // Upper South front wall with double balcony door opening (X = -1.25 to 2.75)
                        { x: -5.675, y: 8.75, z: 7.7, hx: 4.425, hy: 2.75, hz: 0.2 },
                        { x: 6.425, y: 8.75, z: 7.7, hx: 3.675, hy: 2.75, hz: 0.2 },
                        { x: 0.75, y: 10.825, z: 7.7, hx: 2.0, hy: 0.675, hz: 0.2 },
                        // Upper interior dividing wall (behind lounge bookshelf & master wardrobe, x: -9.65 to 6.13, z = -5.70)
                        { x: -1.76, y: 8.98, z: -5.70, hx: 7.89, hy: 3.00, hz: 0.11 },
                        // Upper Balcony Railings (matching visual railing height and perimeter)
                        { x: 0, y: 7.25, z: 12.0, hx: 10.1, hy: 1.25, hz: 0.1 },
                        { x: -10.1, y: 7.25, z: 9.85, hx: 0.1, hy: 1.25, hz: 2.15 },
                        { x: 10.1, y: 7.25, z: 9.85, hx: 0.1, hy: 1.25, hz: 2.15 },
                        // Second floor stairwell guardrail (prevents falling back into stairwell)
                        { x: -6.775, y: 6.5, z: -7.3, hx: 3.325, hy: 0.5, hz: 0.1 },

                        // 6. Roof ceiling above second floor (height Y = 12.0m matching roof underside)
                        { x: 0, y: 12.0, z: -1.9, hx: 10.1, hy: 0.1, hz: 9.6 },
                    ];
                    physicsSystem.addHollowBuilding(x, 0, z, rotY, commonHouseWalls);

                    const doorGroup = clone.getObjectByName("NormalHouse_Door_Front_Pivot");
                    if (doorSystem && doorGroup) {
                        const doorCol = physicsSystem.addDoorwayCollider(
                            x, 0, z, rotY,
                            4.85, 2.45, 7.72,
                            1.05, 1.95, 0.2
                        );
                        doorSystem.registerDoor({
                            id: `door_common_${doorSystem.doors.length + 1}`,
                            buildingType: "common-house",
                            buildingGroup: clone,
                            doorGroup: doorGroup,
                            doorCollider: doorCol,
                            openAngle: -Math.PI / 2, // swings inward into room
                            closedAngle: 0,
                            localHingePos: doorGroup.position.clone(),
                            localInteriorBounds: new THREE.Box3(
                                new THREE.Vector3(-9.75, 0.4, -11.25),
                                new THREE.Vector3(9.75, 12.2, 7.5)
                            ),
                            localLights: COMMON_HOUSE_LOCAL_LIGHTS,
                        });
                    }
                } else if (bType === "house") {
                    // Hollow interior colliders and exterior terrace/sidewalk slab for house.glb
                    const houseWalls = [
                        // 1. Entire house foundation slab, front terrace paving, and sidewalk (surface at Y = 0.55m)
                        { x: 0, y: 0.275, z: 0, hx: 19.2, hy: 0.275, hz: 16.7 },

                        // 2. Approach perimeter step from street level (Y = 0) up to sidewalk slab (Y = 0.55m)
                        { x: 0, y: 0.14, z: 17.5, hx: 19.2, hy: 0.14, hz: 0.8 },

                        // 3. Interior room walls (North back wall)
                        { x: -0.7, y: 3.5, z: -13.3, hx: 14.0, hy: 3.0, hz: 0.3 },
                        // West left wall
                        { x: -14.7, y: 3.5, z: -4.8, hx: 0.3, hy: 3.0, hz: 8.5 },
                        // East right wall
                        { x: 13.3, y: 3.5, z: -4.8, hx: 0.3, hy: 3.0, hz: 8.5 },
                        // South front wall (left of door: x = -14.7 to 6.5)
                        { x: -4.1, y: 3.5, z: 3.65, hx: 10.6, hy: 3.0, hz: 0.3 },
                        // South front wall (right of door: x = 10.6 to 13.3)
                        { x: 11.95, y: 3.5, z: 3.65, hx: 1.35, hy: 3.0, hz: 0.3 },
                        // Lintel above door (door is Y = 0.55 to 5.1, lintel from 5.1 to 6.5)
                        { x: 8.55, y: 5.8, z: 3.65, hx: 1.75, hy: 0.7, hz: 0.3 },
                        // Ceiling
                        { x: -0.7, y: 6.5, z: -4.8, hx: 14.0, hy: 0.1, hz: 8.5 },

                        // 4. Exterior architectural columns supporting front canopy (Z = 6.6)
                        { x: -7.0, y: 3.4, z: 6.6, hx: 0.45, hy: 3.0, hz: 0.45 },
                        { x: -0.5, y: 3.4, z: 6.6, hx: 0.45, hy: 3.0, hz: 0.45 },
                        { x: 5.5, y: 3.4, z: 6.6, hx: 0.45, hy: 3.0, hz: 0.45 },
                        { x: 12.0, y: 3.4, z: 6.6, hx: 0.45, hy: 3.0, hz: 0.45 },
                        { x: 16.0, y: 3.4, z: 6.6, hx: 0.45, hy: 3.0, hz: 0.45 },

                        // 5. Exterior decorative bollards lining walkway
                        { x: 4.8, y: 1.0, z: 11.2, hx: 0.3, hy: 0.6, hz: 2.2 },
                        { x: 12.2, y: 1.0, z: 11.2, hx: 0.3, hy: 0.6, hz: 2.2 },
                    ];
                    physicsSystem.addHollowBuilding(x, 0, z, rotY, houseWalls);

                    const doorGroup = clone.getObjectByName("House_Door_Pivot");
                    if (doorSystem && doorGroup) {
                        const doorCol = physicsSystem.addDoorwayCollider(
                            x, 0, z, rotY,
                            8.55, 2.825, 3.65,
                            1.75, 2.275, 0.2
                        );
                        doorSystem.registerDoor({
                            id: `door_house_${doorSystem.doors.length + 1}`,
                            buildingType: "house",
                            buildingGroup: clone,
                            doorGroup: doorGroup,
                            doorCollider: doorCol,
                            openAngle: -Math.PI / 2, // swings inward
                            closedAngle: 0,
                            localHingePos: doorGroup.position.clone(),
                            localInteriorBounds: new THREE.Box3(
                                new THREE.Vector3(-14.0, 0.4, -13.0),
                                new THREE.Vector3(13.0, 6.0, 2.7)
                            ),
                            localLights: HOUSE_LOCAL_LIGHTS,
                        });
                    }
                } else if (bType === "office") {
                    const osc = template.userData.scale || 1.6;
                    // Hollow interior colliders for Zignuts Office scaled to match building scale
                    const officeWalls = [
                        // 1. Floor & Ceiling Slabs
                        { x: 0, y: 0.00 * osc, z: 0, hx: 6.70 * osc, hy: 0.05 * osc, hz: 13.20 * osc },
                        { x: 0, y: 3.35 * osc, z: 0, hx: 6.70 * osc, hy: 0.10 * osc, hz: 13.20 * osc },

                        // 2. Perimeter Walls
                        // North Back Wall (Z = -13.10)
                        { x: 0, y: 1.70 * osc, z: -13.10 * osc, hx: 6.70 * osc, hy: 1.65 * osc, hz: 0.20 * osc },
                        // South Front Wall (Z = +13.10)
                        { x: 0, y: 1.70 * osc, z: 13.10 * osc, hx: 6.70 * osc, hy: 1.65 * osc, hz: 0.20 * osc },
                        // East Right Wall (X = +6.60)
                        { x: 6.60 * osc, y: 1.70 * osc, z: 0, hx: 0.20 * osc, hy: 1.65 * osc, hz: 13.20 * osc },

                        // West Left Wall (doorway opening at Z: 6.53 to 7.77, Y: 0.05 to 2.52)
                        // Section North of entrance door
                        { x: -6.60 * osc, y: 1.70 * osc, z: -3.31 * osc, hx: 0.20 * osc, hy: 1.65 * osc, hz: 9.84 * osc },
                        // Section South of entrance door
                        { x: -6.60 * osc, y: 1.70 * osc, z: 10.46 * osc, hx: 0.20 * osc, hy: 1.65 * osc, hz: 2.69 * osc },
                        // Lintel above entrance door
                        { x: -6.60 * osc, y: 2.935 * osc, z: 7.15 * osc, hx: 0.20 * osc, hy: 0.415 * osc, hz: 0.62 * osc },

                        // 3. Internal Partition Wall (Z = 6.00m, central opening X: [-1.33, 1.33])
                        { x: -3.99 * osc, y: 1.70 * osc, z: 6.00 * osc, hx: 2.66 * osc, hy: 1.65 * osc, hz: 0.10 * osc },
                        { x: 3.99 * osc, y: 1.70 * osc, z: 6.00 * osc, hx: 2.66 * osc, hy: 1.65 * osc, hz: 0.10 * osc },
                        { x: 0, y: 3.075 * osc, z: 6.00 * osc, hx: 1.33 * osc, hy: 0.275 * osc, hz: 0.10 * osc },
                    ];
                    physicsSystem.addHollowBuilding(x, 0, z, rotY, officeWalls);

                    // Exact 3D triangular mesh collider for all office desks, chairs, workstations, meeting rooms, and reception
                    if (template.userData.interiorMeshData) {
                        const { vertices, indices } = template.userData.interiorMeshData;
                        let v = vertices;
                        if (scale !== 1.0) {
                            v = new Float32Array(vertices.length);
                            for (let i = 0; i < vertices.length; i++) v[i] = vertices[i] * scale;
                        }
                        physicsSystem.addStaticMesh(x, 0, z, rotY, v, indices);
                    }

                    const doorGroup = clone.getObjectByName("Office_Door_Pivot");
                    if (doorSystem && doorGroup) {
                        const doorCol = physicsSystem.addDoorwayCollider(
                            x, 0, z, rotY,
                            -6.65 * osc, 1.285 * osc, 7.15 * osc,
                            0.20 * osc, 1.235 * osc, 0.62 * osc
                        );
                        doorSystem.registerDoor({
                            id: `door_office_${doorSystem.doors.length + 1}`,
                            buildingType: "office",
                            buildingGroup: clone,
                            doorGroup: doorGroup,
                            doorCollider: doorCol,
                            openAngle: -Math.PI / 2, // swings open matching Blender action
                            closedAngle: 0,
                            localHingePos: doorGroup.position.clone(),
                            localInteriorBounds: new THREE.Box3(
                                new THREE.Vector3(-6.4 * osc, 0.0, -13.0 * osc),
                                new THREE.Vector3(6.5 * osc, 3.6 * osc, 13.0 * osc)
                            ),
                            localLights: OFFICE_LOCAL_LIGHTS,
                        });
                    }
                } else {
                    // Standard solid box collider for skyscrapers and commercial towers
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
        // Zignuts Office placed in this compartment with 1.6x increased scale
        placeBuilding(templateOffice, 182.0, 0, 0);

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


