import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";
import { trafficLightState } from "./loadSignals.js";
import { soundSystem } from "../systems/SoundSystem.js";

// Extracts unified triangular mesh vertex and index buffers from a 3D model hierarchy
// in the root group's local coordinate space for exact Rapier trimesh collision.
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

        // Base prototypes to extract exact 3D mesh collider geometry
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

        const carMeshData = extractVehicleMeshData(carProto);
        const busMeshData = extractVehicleMeshData(busProto);

        const carCoreBox = { hx: 0.95, hy: 0.85, hz: 0.45, cy: 0.85 };
        const busCoreBox = { hx: 2.70, hy: 1.50, hz: 0.85, cy: 1.50 };

        // Helper to instantiate a customized vehicle with individual paint color and exact mesh collider
        const createVehicleInstance = (cfg) => {
            const {
                id,
                name,
                type,
                gltfScene,
                scale,
                primaryColor,
                accentColor = null,
                axis,
                direction,
                laneCoord,
                startCoord,
                endCoord,
                yaw,
                approachAxis,
                junctions,
                initialProgress = 0,
                cruiseSpeed = 10.0,
            } = cfg;

            const wrapper = new THREE.Group();
            wrapper.name = `${name}_${primaryColor.toString(16)}`;
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

            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Shift model inside wrapper so wrapper origin (0,0,0) is at horizontal center and bottom of tires
            model.position.set(-center.x, -box.min.y, -center.z);
            wrapper.add(model);

            // Detect wheels for calibrated rotation
            const wheels = [];
            model.traverse((obj) => {
                if (obj.name && obj.name.toLowerCase().includes("wheel")) {
                    wheels.push(obj);
                }
            });

            // Calculate starting world coordinates
            const currentCoord = startCoord + direction * (Math.abs(endCoord - startCoord) * initialProgress);
            const posX = axis === "Z" ? laneCoord : currentCoord;
            const posZ = axis === "Z" ? currentCoord : laneCoord;

            wrapper.position.set(posX, 0.02, posZ);
            wrapper.rotation.y = yaw;

            // Attach exact 3D mesh collider to physically block character
            const meshData = type === "bus" ? busMeshData : carMeshData;
            const coreBox = type === "bus" ? busCoreBox : carCoreBox;

            let physicsBody = null;
            if (physicsSystem && typeof physicsSystem.addVehicleMeshCollider === "function") {
                const kin = physicsSystem.addVehicleMeshCollider(
                    posX,
                    0.02,
                    posZ,
                    yaw,
                    meshData.vertices,
                    meshData.indices,
                    coreBox
                );
                if (kin) {
                    physicsBody = kin.body;
                }
            }

            wrapper.userData = {
                id,
                type,
                axis,
                direction,
                laneCoord,
                startCoord,
                endCoord,
                coord: currentCoord,
                yaw,
                approachAxis,
                junctions,
                cruiseSpeed,
                currentSpeed: cruiseSpeed,
                targetSpeed: cruiseSpeed,
                wheels,
                physicsBody,
                respawnTimer: 0,
                heading: new THREE.Vector2(axis === "X" ? direction : 0, axis === "Z" ? direction : 0),
                stopDistanceAhead: type === "bus" ? 14.0 : 9.0,
                followDistanceAhead: type === "bus" ? 26.0 : 18.0,
            };

            vehiclesGroup.add(wrapper);
            activeVehicles.push(wrapper);
            return wrapper;
        };

        // -------------------------------------------------------------------------
        // CORRIDOR ROUTES: From Road A's end to Road B's end
        // - Wide 11.0m distance between opposite lanes (plenty of open clearance)
        // - Starts at Road A's end (+/-245m), drives across city, disappears at Road B's end (+/-245m)
        // - Respawns at Road A's end after a brief interval for continuous fresh traffic
        // - Obeys traffic signals at the 4 crossroads conjunctions (+/-60, +/-60)
        // -------------------------------------------------------------------------
        const vehicleConfigs = [
            // 1. Southbound on East Avenue (Along X = 54.5m, Z: -245 to +245) - Blue Bus
            {
                id: 0,
                name: "Bus_East_Southbound",
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0x0284c7,
                accentColor: 0x38bdf8,
                axis: "Z",
                direction: 1, // moving +Z
                laneCoord: 54.5,
                startCoord: -245,
                endCoord: 245,
                yaw: -Math.PI / 2,
                approachAxis: "NS",
                junctions: [
                    { center: -60, stopLine: -78 },
                    { center: 60, stopLine: 42 }
                ],
                initialProgress: 0.15,
                cruiseSpeed: 9.5,
            },

            // 2. Northbound on East Avenue (Along X = 65.5m, Z: +245 to -245) - Cyan Sports Car
            {
                id: 1,
                name: "Car_East_Northbound",
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0x00d4ff,
                accentColor: 0x00ffff,
                axis: "Z",
                direction: -1, // moving -Z
                laneCoord: 65.5,
                startCoord: 245,
                endCoord: -245,
                yaw: Math.PI / 2,
                approachAxis: "NS",
                junctions: [
                    { center: 60, stopLine: 78 },
                    { center: -60, stopLine: -42 }
                ],
                initialProgress: 0.60,
                cruiseSpeed: 10.5,
            },

            // 3. Southbound on West Avenue (Along X = -65.5m, Z: -245 to +245) - Sunset Orange Bus
            {
                id: 2,
                name: "Bus_West_Southbound",
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0xff5722,
                accentColor: 0xffd600,
                axis: "Z",
                direction: 1, // moving +Z
                laneCoord: -65.5,
                startCoord: -245,
                endCoord: 245,
                yaw: -Math.PI / 2,
                approachAxis: "NS",
                junctions: [
                    { center: -60, stopLine: -78 },
                    { center: 60, stopLine: 42 }
                ],
                initialProgress: 0.70,
                cruiseSpeed: 9.5,
            },

            // 4. Northbound on West Avenue (Along X = -54.5m, Z: +245 to -245) - Emerald Matrix Car
            {
                id: 3,
                name: "Car_West_Northbound",
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0x00e676,
                accentColor: 0x76ff03,
                axis: "Z",
                direction: -1, // moving -Z
                laneCoord: -54.5,
                startCoord: 245,
                endCoord: -245,
                yaw: Math.PI / 2,
                approachAxis: "NS",
                junctions: [
                    { center: 60, stopLine: 78 },
                    { center: -60, stopLine: -42 }
                ],
                initialProgress: 0.25,
                cruiseSpeed: 10.5,
            },

            // 5. Eastbound on North Avenue (Along Z = -54.5m, X: -245 to +245) - Futuristic Teal Bus
            {
                id: 4,
                name: "Bus_North_Eastbound",
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0x00b4d8,
                accentColor: 0x90e0ef,
                axis: "X",
                direction: 1, // moving +X
                laneCoord: -54.5,
                startCoord: -245,
                endCoord: 245,
                yaw: 0,
                approachAxis: "EW",
                junctions: [
                    { center: -60, stopLine: -78 },
                    { center: 60, stopLine: 42 }
                ],
                initialProgress: 0.35,
                cruiseSpeed: 9.5,
            },

            // 6. Westbound on North Avenue (Along Z = -65.5m, X: +245 to -245) - Velocity Crimson Car
            {
                id: 5,
                name: "Car_North_Westbound",
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0xff1744,
                accentColor: 0xff5252,
                axis: "X",
                direction: -1, // moving -X
                laneCoord: -65.5,
                startCoord: 245,
                endCoord: -245,
                yaw: Math.PI,
                approachAxis: "EW",
                junctions: [
                    { center: 60, stopLine: 78 },
                    { center: -60, stopLine: -42 }
                ],
                initialProgress: 0.80,
                cruiseSpeed: 10.5,
            },

            // 7. Eastbound on South Avenue (Along Z = 65.5m, X: -245 to +245) - Royal Blue Bus
            {
                id: 6,
                name: "Bus_South_Eastbound",
                type: "bus",
                gltfScene: gltfBus.scene,
                scale: BUS_SCALE,
                primaryColor: 0x1565c0,
                accentColor: 0x42a5f5,
                axis: "X",
                direction: 1, // moving +X
                laneCoord: 65.5,
                startCoord: -245,
                endCoord: 245,
                yaw: 0,
                approachAxis: "EW",
                junctions: [
                    { center: -60, stopLine: -78 },
                    { center: 60, stopLine: 42 }
                ],
                initialProgress: 0.85,
                cruiseSpeed: 9.5,
            },

            // 8. Westbound on South Avenue (Along Z = 54.5m, X: +245 to -245) - Cyber Taxi Amber Car
            {
                id: 7,
                name: "Car_South_Westbound",
                type: "car",
                gltfScene: gltfCar.scene,
                scale: CAR_SCALE,
                primaryColor: 0xffaa00,
                accentColor: 0xff9100,
                axis: "X",
                direction: -1, // moving -X
                laneCoord: 54.5,
                startCoord: 245,
                endCoord: -245,
                yaw: Math.PI,
                approachAxis: "EW",
                junctions: [
                    { center: 60, stopLine: 78 },
                    { center: -60, stopLine: -42 }
                ],
                initialProgress: 0.40,
                cruiseSpeed: 10.5,
            },
        ];

        vehicleConfigs.forEach((cfg) => createVehicleInstance(cfg));

        // -------------------------------------------------------------
        // Parked cars in Modern Building parking lot
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

// Updates vehicle positions, handles road conjunction traffic signals,
// headway collision avoidance, pedestrian safety, and speed-synchronized tire rotation.
export function updateVehicles(activeVehicles, delta, playerPos = null) {
    if (!activeVehicles || activeVehicles.length === 0) return;

    for (let i = 0; i < activeVehicles.length; i++) {
        const vi = activeVehicles[i];
        const dataI = vi.userData;

        // If vehicle is in respawn delay after disappearing at Road B's end
        if (dataI.respawnTimer > 0) {
            dataI.respawnTimer -= delta;
            if (dataI.respawnTimer <= 0) {
                // Respawn at Road A's start point
                dataI.coord = dataI.startCoord;
                dataI.currentSpeed = dataI.cruiseSpeed;
                dataI.targetSpeed = dataI.cruiseSpeed;
                vi.visible = true;

                const px = dataI.axis === "Z" ? dataI.laneCoord : dataI.coord;
                const pz = dataI.axis === "Z" ? dataI.coord : dataI.laneCoord;
                vi.position.set(px, 0.02, pz);
            } else {
                continue;
            }
        }

        let desiredSpeed = dataI.cruiseSpeed;
        const posI = vi.position;
        const headingI = dataI.heading;

        // 1. Traffic Signal Compliance at Road Conjunctions
        const isRedSignal = dataI.approachAxis === "NS" ? !trafficLightState.nsGreen : !trafficLightState.ewGreen;

        for (const junction of dataI.junctions) {
            const stopLine = junction.stopLine;
            // Calculate distance to conjunction stop line based on travel direction
            const distToStop = dataI.direction === 1 ? stopLine - dataI.coord : dataI.coord - stopLine;
            const isApproachingStop = distToStop > -3.0 && distToStop < 32.0;

            if (isApproachingStop && isRedSignal) {
                if (distToStop <= 1.5) {
                    desiredSpeed = 0;
                } else if (distToStop < 28.0) {
                    const t = Math.max(0, (distToStop - 1.5) / 26.5);
                    desiredSpeed = Math.min(desiredSpeed, dataI.cruiseSpeed * t * t);
                }
            }
        }

        // 2. Vehicle-to-Vehicle Collision Avoidance (Queueing behind stopped cars at signals)
        for (let j = 0; j < activeVehicles.length; j++) {
            if (i === j) continue;
            const vj = activeVehicles[j];
            const dataJ = vj.userData;

            if (!vj.visible || dataJ.respawnTimer > 0) continue;

            // Only check vehicles sharing the same road axis and lane coordinate
            if (dataI.axis === dataJ.axis && Math.abs(dataI.laneCoord - dataJ.laneCoord) < 1.0 && dataI.direction === dataJ.direction) {
                const forwardDist = dataI.direction * (dataJ.coord - dataI.coord);
                const extraBusMargin = dataJ.type === "bus" ? 4.0 : 0.0;
                const stopDist = dataI.stopDistanceAhead + extraBusMargin;
                const followDist = dataI.followDistanceAhead + extraBusMargin;

                if (forwardDist > 0 && forwardDist < followDist) {
                    if (forwardDist <= stopDist) {
                        desiredSpeed = 0;
                    } else {
                        const t = (forwardDist - stopDist) / (followDist - stopDist);
                        desiredSpeed = Math.min(desiredSpeed, Math.min(dataI.cruiseSpeed * t, dataJ.currentSpeed));
                    }
                }
            }
        }

        // 3. Pedestrian / Player Collision Avoidance
        if (playerPos && Math.abs(playerPos.y - posI.y) < 8.0) {
            const dx = playerPos.x - posI.x;
            const dz = playerPos.z - posI.z;
            const dist = Math.hypot(dx, dz);

            const forwardDot = dx * headingI.x + dz * headingI.y;
            const lateralDist = Math.abs(dx * (-headingI.y) + dz * headingI.x);

            const isBus = dataI.type === "bus";
            const forwardDanger = isBus ? 18.0 : 13.0;
            const closeDanger = isBus ? 7.0 : 5.0;

            if ((forwardDot > -2.0 && forwardDot < forwardDanger && lateralDist < 4.2) || dist < closeDanger) {
                desiredSpeed = 0;
                dataI.currentSpeed = 0;

                // Honk horn at pedestrian
                if (!dataI.lastPlayerHonk || Date.now() - dataI.lastPlayerHonk > 4000) {
                    dataI.lastPlayerHonk = Date.now();
                    soundSystem.playVehicleHorn(vi.position, isBus);
                }
            }
        }

        dataI.targetSpeed = desiredSpeed;

        // 4. Smooth Acceleration / Fast Responsive Braking
        if (dataI.targetSpeed < dataI.currentSpeed) {
            dataI.currentSpeed = Math.max(dataI.targetSpeed, dataI.currentSpeed - 24.0 * delta);
        } else {
            dataI.currentSpeed = Math.min(dataI.targetSpeed, dataI.currentSpeed + 6.0 * delta);
        }

        // Hard zero snap when stopping so vehicle and wheels are 100% stationary
        if (dataI.currentSpeed <= 0.05) {
            dataI.currentSpeed = 0;
        }

        // 5. Advance Vehicle Along Road
        const distDelta = dataI.currentSpeed * delta;
        dataI.coord += dataI.direction * distDelta;

        const posX = dataI.axis === "Z" ? dataI.laneCoord : dataI.coord;
        const posZ = dataI.axis === "Z" ? dataI.coord : dataI.laneCoord;

        vi.position.set(posX, 0.02, posZ);

        // 6. Check if Vehicle Reached Road B's End -> Disappear
        const reachedEnd = dataI.direction === 1 ? dataI.coord >= dataI.endCoord : dataI.coord <= dataI.endCoord;
        if (reachedEnd) {
            vi.visible = false;
            dataI.respawnTimer = 2.0 + Math.random() * 2.0; // Wait 2-4 seconds offscreen before starting next trip
            if (dataI.physicsBody) {
                dataI.physicsBody.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
            }
            continue;
        }

        // 7. Tire Animation: Calm, slow, and clear rolling speed; strictly 0 when stopped
        if (dataI.wheels && dataI.wheels.length > 0) {
            if (dataI.currentSpeed > 0.05) {
                // Reduced rolling rotation speed for smooth, distinct visual tire motion
                const rotAngle = (dataI.currentSpeed * delta) / 2.0;
                dataI.wheels.forEach((wheel) => {
                    wheel.rotation.z = (wheel.rotation.z - rotAngle) % (Math.PI * 2);
                });
            }
            // If currentSpeed <= 0.05, wheels DO NOT animate!
        }

        // 8. Synchronize Kinematic Rapier Mesh Collider
        if (dataI.physicsBody && vi.visible) {
            dataI.physicsBody.setNextKinematicTranslation({
                x: posX,
                y: 0.02,
                z: posZ,
            });
            dataI.physicsBody.setNextKinematicRotation({
                x: 0,
                y: Math.sin(dataI.yaw / 2),
                z: 0,
                w: Math.cos(dataI.yaw / 2),
            });
        }
    }
}
