import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";

// Calculate continuous 3D position and yaw orientation along the outer asphalt road lane
function getCircuitState(distance, R = 61.5, rCorner = 16.0) {
    const L_straight = 2 * (R - rCorner);
    const L_arc = (Math.PI / 2) * rCorner;
    const perimeter = 4 * (L_straight + L_arc);

    // Normalize distance into [0, perimeter)
    let d = ((distance % perimeter) + perimeter) % perimeter;

    let x, z, dx, dz;

    if (d < L_straight) {
        // 0. North straight (heading East +X)
        const progress = -(R - rCorner) + d;
        x = progress;
        z = -R;
        dx = 1;
        dz = 0;
    } else {
        d -= L_straight;
        if (d < L_arc) {
            // 1. NE corner arc
            const angle = -Math.PI / 2 + (d / L_arc) * (Math.PI / 2);
            const cx = R - rCorner;
            const cz = -(R - rCorner);
            x = cx + rCorner * Math.cos(angle);
            z = cz + rCorner * Math.sin(angle);
            dx = -Math.sin(angle);
            dz = Math.cos(angle);
        } else {
            d -= L_arc;
            if (d < L_straight) {
                // 2. East straight (heading South +Z)
                const progress = -(R - rCorner) + d;
                x = R;
                z = progress;
                dx = 0;
                dz = 1;
            } else {
                d -= L_straight;
                if (d < L_arc) {
                    // 3. SE corner arc
                    const angle = 0 + (d / L_arc) * (Math.PI / 2);
                    const cx = R - rCorner;
                    const cz = R - rCorner;
                    x = cx + rCorner * Math.cos(angle);
                    z = cz + rCorner * Math.sin(angle);
                    dx = -Math.sin(angle);
                    dz = Math.cos(angle);
                } else {
                    d -= L_arc;
                    if (d < L_straight) {
                        // 4. South straight (heading West -X)
                        const progress = (R - rCorner) - d;
                        x = progress;
                        z = R;
                        dx = -1;
                        dz = 0;
                    } else {
                        d -= L_straight;
                        if (d < L_arc) {
                            // 5. SW corner arc
                            const angle = Math.PI / 2 + (d / L_arc) * (Math.PI / 2);
                            const cx = -(R - rCorner);
                            const cz = R - rCorner;
                            x = cx + rCorner * Math.cos(angle);
                            z = cz + rCorner * Math.sin(angle);
                            dx = -Math.sin(angle);
                            dz = Math.cos(angle);
                        } else {
                            d -= L_straight;
                            if (d < L_straight) {
                                // 6. West straight (heading North -Z)
                                const progress = (R - rCorner) - d;
                                x = -R;
                                z = progress;
                                dx = 0;
                                dz = -1;
                            } else {
                                d -= L_straight;
                                // 7. NW corner arc
                                const angle = Math.PI + (d / L_arc) * (Math.PI / 2);
                                const cx = -(R - rCorner);
                                const cz = -(R - rCorner);
                                x = cx + rCorner * Math.cos(angle);
                                z = cz + rCorner * Math.sin(angle);
                                dx = -Math.sin(angle);
                                dz = Math.cos(angle);
                            }
                        }
                    }
                }
            }
        }
    }

    const yaw = -Math.atan2(dz, dx);
    return { x, z, yaw, perimeter, dx, dz };
}

/**
 * Extracts unified triangular mesh vertex and index buffers from a 3D model hierarchy
 * in the root group's local coordinate space for exact Rapier trimesh collision.
 *
 * @param {THREE.Group} rootGroup
 * @returns {{ vertices: Float32Array, indices: Uint32Array }}
 */
function extractVehicleMeshData(rootGroup) {
    rootGroup.updateMatrixWorld(true);
    const invRoot = rootGroup.matrixWorld.clone().invert();
    const allVertices = [];
    const allIndices = [];
    let vertexOffset = 0;

    rootGroup.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
            const geom = obj.geometry;
            const posAttr = geom.getAttribute("position");
            if (!posAttr) return;

            // Transform each vertex by the mesh's relative transform inside the root group
            const m = new THREE.Matrix4().multiplyMatrices(invRoot, obj.matrixWorld);
            const v = new THREE.Vector3();

            for (let i = 0; i < posAttr.count; i++) {
                v.fromBufferAttribute(posAttr, i);
                v.applyMatrix4(m);
                allVertices.push(v.x, v.y, v.z);
            }

            if (geom.index) {
                const indexAttr = geom.index;
                for (let i = 0; i < indexAttr.count; i++) {
                    allIndices.push(indexAttr.getX(i) + vertexOffset);
                }
            } else {
                for (let i = 0; i < posAttr.count; i++) {
                    allIndices.push(i + vertexOffset);
                }
            }

            vertexOffset += posAttr.count;
        }
    });

    return {
        vertices: new Float32Array(allVertices),
        indices: new Uint32Array(allIndices),
    };
}

export async function loadVehicles(scene, physicsSystem = null) {
    const loader = getModelLoader();
    const vehiclesGroup = new THREE.Group();
    vehiclesGroup.name = "City_Vehicles_Group";

    const activeVehicles = [];

    try {
        const [gltfCar, gltfBus] = await Promise.all([
            loader.loadAsync("/models/vehicle/city_car.glb"),
            loader.loadAsync("/models/vehicle/city_bus.glb")
        ]);

        const CAR_SCALE = 0.42;
        const BUS_SCALE = 0.45;

        // Asphalt road driving lane radius R = 61.5 (tile center is 60.0; outer driving lane is ~61.5)
        const R = 61.5;
        const rCorner = 16.0;
        const dummyState = getCircuitState(0, R, rCorner);
        const P = dummyState.perimeter;

        // Create base prototypes to extract exact 3D mesh collider geometry
        const createPrototype = (gltfScene, scale) => {
            const wrapper = new THREE.Group();
            const model = gltfScene.clone(true);
            model.scale.set(scale, scale, scale);
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            model.position.set(-center.x, -box.min.y, -center.z);
            wrapper.add(model);
            return wrapper;
        };

        const carProto = createPrototype(gltfCar.scene, CAR_SCALE);
        const busProto = createPrototype(gltfBus.scene, BUS_SCALE);

        // Precompute exact 3D mesh collider geometry buffers
        const carMeshData = extractVehicleMeshData(carProto);
        const busMeshData = extractVehicleMeshData(busProto);

        const carCoreBox = { hx: 0.95, hy: 0.85, hz: 0.45, cy: 0.85 };
        const busCoreBox = { hx: 2.70, hy: 1.50, hz: 0.85, cy: 1.50 };

        /**
         * Helper to instantiate a customized vehicle with individual paint color and exact mesh collider
         */
        const createVehicleInstance = ({
            type,
            gltfScene,
            scale,
            primaryColor,
            accentColor = null,
            startDistance = 0,
            cruiseSpeed = 10.5,
        }) => {
            const wrapper = new THREE.Group();
            wrapper.name = `${type}_${primaryColor.toString(16)}`;
            const model = gltfScene.clone(true);
            const pColor = new THREE.Color(primaryColor);
            const aColor = accentColor ? new THREE.Color(accentColor) : null;

            model.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material = obj.material.map((m) => m.clone());
                        } else {
                            obj.material = obj.material.clone();
                        }
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                            m.shadowSide = THREE.DoubleSide;
                            if (m.name === "Car_SilverPaint") {
                                m.color.copy(pColor);
                                m.metalness = 0.88;
                                m.roughness = 0.16;
                                m.clearcoat = 1.0;
                                m.clearcoatRoughness = 0.08;
                            } else if (m.name === "Car_Caliper") {
                                m.color.copy(pColor);
                            } else if (m.name === "Car_NeonBlue" && aColor) {
                                m.color.copy(aColor);
                                m.emissive.copy(aColor);
                                m.emissiveIntensity = 2.0;
                            }
                        });
                    }
                }
            });

            model.scale.set(scale, scale, scale);

            // Calculate bounding box of scaled model
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Shift model inside wrapper so wrapper origin (0,0,0) is at exact horizontal center and bottom of tires
            model.position.set(-center.x, -box.min.y, -center.z);
            wrapper.add(model);

            // Detect wheels for animated rotation
            const wheels = [];
            model.traverse((obj) => {
                if (obj.name && obj.name.toLowerCase().includes("wheel")) {
                    wheels.push(obj);
                }
            });

            const initState = getCircuitState(startDistance, R, rCorner);
            wrapper.position.set(initState.x, 0.02, initState.z);
            wrapper.rotation.y = initState.yaw;

            // Attach exact 3D mesh collider to physically block character from wheels, fenders, and doors
            const meshData = type === "bus" ? busMeshData : carMeshData;
            const coreBox = type === "bus" ? busCoreBox : carCoreBox;

            let physicsBody = null;
            if (physicsSystem && typeof physicsSystem.addVehicleMeshCollider === "function") {
                const kin = physicsSystem.addVehicleMeshCollider(
                    initState.x,
                    0.02,
                    initState.z,
                    initState.yaw,
                    meshData.vertices,
                    meshData.indices,
                    coreBox
                );
                if (kin) {
                    physicsBody = kin.body;
                }
            }

            wrapper.userData = {
                type,
                distance: startDistance,
                cruiseSpeed,
                currentSpeed: cruiseSpeed,
                targetSpeed: cruiseSpeed,
                R,
                rCorner,
                wheels,
                wheelRadius: type === "bus" ? 0.38 * 1.3 * scale : 0.38 * scale,
                physicsBody,
                stopDistanceAhead: type === "bus" ? 22.0 : 16.0,
                followDistanceAhead: type === "bus" ? 36.0 : 26.0,
            };

            vehiclesGroup.add(wrapper);
            activeVehicles.push(wrapper);
            return wrapper;
        };

        // -------------------------------------------------------------
        // FLEET SETUP: 4 Cars & 2 Buses with diverse vibrant colors
        // Evenly spaced along the 464.5m road circuit (interval ~77.4m)
        // -------------------------------------------------------------
        const vehicleConfigs = [
            // 1. Electric Cyan Car
            {
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0x00d4ff,
                accentColor: 0x00ffff,
                startDistance: 0 * (P / 6),
                cruiseSpeed: 10.5,
            },
            // 2. Metro Sapphire Blue Bus
            {
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0x0284c7,
                accentColor: 0x38bdf8,
                startDistance: 1 * (P / 6),
                cruiseSpeed: 10.5,
            },
            // 3. Velocity Crimson Red Car
            {
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0xff1744,
                accentColor: 0xff5252,
                startDistance: 2 * (P / 6),
                cruiseSpeed: 10.5,
            },
            // 4. Cyber Taxi Amber Car
            {
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0xffaa00,
                accentColor: 0xff9100,
                startDistance: 3 * (P / 6),
                cruiseSpeed: 10.5,
            },
            // 5. Neon Sunset Orange Bus
            {
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0xff5722,
                accentColor: 0xffd600,
                startDistance: 4 * (P / 6),
                cruiseSpeed: 10.5,
            },
            // 6. Emerald Matrix Green Car
            {
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0x00e676,
                accentColor: 0x76ff03,
                startDistance: 5 * (P / 6),
                cruiseSpeed: 10.5,
            },
        ];

        vehicleConfigs.forEach((cfg) => createVehicleInstance(cfg));

        // -------------------------------------------------------------
        // Helper to spawn stationary parked cars with exact mesh colliders
        // -------------------------------------------------------------
        const createParkedCar = (x, y, z, color) => {
            const car = gltfCar.scene.clone(true);
            const carColor = new THREE.Color(color);

            car.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material = obj.material.map((m) => m.clone());
                        } else {
                            obj.material = obj.material.clone();
                        }
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                            m.shadowSide = THREE.DoubleSide;
                            if (m.name === "Car_SilverPaint") {
                                m.color.copy(carColor);
                                m.metalness = 0.85;
                                m.roughness = 0.18;
                                m.clearcoat = 1.0;
                                m.clearcoatRoughness = 0.1;
                            }
                            if (m.name === "Car_Caliper") {
                                m.color.copy(carColor);
                            }
                        });
                    }
                }
            });

            car.scale.set(CAR_SCALE, CAR_SCALE, CAR_SCALE);
            const box = new THREE.Box3().setFromObject(car);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const wrapper = new THREE.Group();
            wrapper.name = `Parked_Car_${carColor.getHexString()}`;
            car.position.set(-center.x, -box.min.y, -center.z);
            wrapper.add(car);

            wrapper.position.set(x, y, z);
            wrapper.rotation.y = 0;

            vehiclesGroup.add(wrapper);

            // Add static 3D mesh collider so character can never walk through parked cars
            if (physicsSystem && typeof physicsSystem.addStaticVehicleMesh === "function") {
                physicsSystem.addStaticVehicleMesh(
                    x, y, z, 0,
                    carMeshData.vertices,
                    carMeshData.indices,
                    carCoreBox
                );
            }

            return wrapper;
        };

        // Parked Cars on the parking lot of Modern Building
        const SHIFT_X = 120;
        createParkedCar(-32 + SHIFT_X, -0.2, -26.0, 0xd61c2b);
        createParkedCar(-32 + SHIFT_X, -0.2, -20.0, 0xffff00);
        createParkedCar(-32 + SHIFT_X, -0.2, -32.0, 0x008000);

        scene.add(vehiclesGroup);
    } catch (error) {
        console.error("Error loading vehicle models:", error);
    }

    return { vehiclesGroup, activeVehicles };
}

/**
 * Update vehicle positions, detect pedestrian & vehicle collision risks, and rotate tires
 *
 * @param {Array<THREE.Group>} activeVehicles
 * @param {number} delta
 * @param {THREE.Vector3|null} playerPos
 */
export function updateVehicles(activeVehicles, delta, playerPos = null) {
    if (!activeVehicles || activeVehicles.length === 0) return;

    const P = activeVehicles[0].userData.P || 464.4955;

    // 1. Evaluate Traffic Headway & Pedestrian Proximity for each vehicle
    activeVehicles.forEach((v) => {
        const data = v.userData;
        let desiredSpeed = data.cruiseSpeed;

        // --- A. Vehicle-to-Vehicle Collision Avoidance ---
        // Find nearest vehicle ahead along the 1D circuit loop
        let minAheadGap = Infinity;
        let vehicleAhead = null;

        for (const other of activeVehicles) {
            if (other === v) continue;
            const gap = ((other.userData.distance - data.distance) % P + P) % P;
            if (gap > 0 && gap < minAheadGap) {
                minAheadGap = gap;
                vehicleAhead = other;
            }
        }

        if (minAheadGap < data.stopDistanceAhead) {
            // Immediate stop behind leading vehicle
            desiredSpeed = 0;
        } else if (minAheadGap < data.followDistanceAhead) {
            // Smoothly decelerate to match leading vehicle
            const t = (minAheadGap - data.stopDistanceAhead) / (data.followDistanceAhead - data.stopDistanceAhead);
            const aheadSpeed = vehicleAhead ? vehicleAhead.userData.currentSpeed : 0;
            desiredSpeed = Math.min(data.cruiseSpeed * t, aheadSpeed);
        }

        // --- B. Pedestrian / Character Collision Avoidance ("stop that thing") ---
        if (playerPos && Math.abs(playerPos.y - v.position.y) < 8.0) {
            const dx = playerPos.x - v.position.x;
            const dz = playerPos.z - v.position.z;
            const dist = Math.hypot(dx, dz);

            // Circuit tangent direction at vehicle's location
            const state = getCircuitState(data.distance, data.R, data.rCorner);
            const tdx = state.dx;
            const tdz = state.dz;

            // Project player position onto forward heading and lateral road axis
            const forwardDot = dx * tdx + dz * tdz;
            const latOffset = Math.abs(dx * (-tdz) + dz * tdx);

            const isBus = data.type === "bus";
            const forwardDangerDist = isBus ? 18.0 : 14.0;
            const closeDangerRadius = isBus ? 8.0 : 6.0;

            const isPlayerAheadInLane = forwardDot > -2.0 && forwardDot < forwardDangerDist && latOffset < 4.8;
            const isPlayerTooClose = dist < closeDangerRadius;

            if (isPlayerAheadInLane || isPlayerTooClose) {
                // Pedestrian is in front or near vehicle: vehicle stops immediately!
                desiredSpeed = 0;
                data.currentSpeed = 0; // Hard stop so vehicle never touches character
            }
        }

        data.targetSpeed = desiredSpeed;

        // --- C. Smooth Acceleration / Responsive Braking ---
        if (data.targetSpeed < data.currentSpeed) {
            // Fast responsive braking
            data.currentSpeed = Math.max(data.targetSpeed, data.currentSpeed - 24.0 * delta);
        } else {
            // Gentle acceleration back up to cruising speed
            data.currentSpeed = Math.min(data.targetSpeed, data.currentSpeed + 6.0 * delta);
        }

        // --- D. Position & Rotation along Circuit ---
        const distDelta = data.currentSpeed * delta;
        data.distance = (data.distance + distDelta) % P;

        const state = getCircuitState(data.distance, data.R, data.rCorner);
        v.position.set(state.x, 0.02, state.z);
        v.rotation.y = state.yaw;

        // --- E. Wheel Rotation ---
        if (data.wheels && data.wheels.length > 0 && data.currentSpeed > 0.01) {
            const rotAngle = distDelta / (data.wheelRadius || 0.16);
            data.wheels.forEach((wheel) => {
                wheel.rotation.z = (wheel.rotation.z - rotAngle) % (Math.PI * 2);
            });
        }

        // --- F. Synchronize Kinematic 3D Mesh Collider with Vehicle Motion ---
        if (data.physicsBody) {
            data.physicsBody.setNextKinematicTranslation({
                x: state.x,
                y: 0.02,
                z: state.z,
            });
            data.physicsBody.setNextKinematicRotation({
                x: 0,
                y: Math.sin(state.yaw / 2),
                z: 0,
                w: Math.cos(state.yaw / 2),
            });
        }
    });
}
