import * as THREE from "three";
import { getModelLoader } from "./modelLoader.js";

// Calculate continuous 3D position and yaw orientation along the outer asphalt road lane
export function getCircuitState(distance, R = 61.5, rCorner = 16.0) {
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
    return { x, z, yaw, perimeter };
}

export async function loadVehicles(scene) {
    const loader = getModelLoader();
    const vehiclesGroup = new THREE.Group();
    vehiclesGroup.name = "City_Vehicles_Group";

    const activeVehicles = [];

    try {
        const [gltfCar, gltfBus] = await Promise.all([
            loader.loadAsync("/models/vehicle/city_car.glb"),
            loader.loadAsync("/models/vehicle/city_bus.glb")
        ]);

        const createVehicle = (gltfScene, scale = 0.42) => {
            const wrapper = new THREE.Group();
            const model = gltfScene.clone(true);
            model.scale.set(scale, scale, scale);

            model.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            // Calculate bounding box of scaled model
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Shift model inside wrapper so wrapper origin (0,0,0) is at exact horizontal center and bottom of tires
            model.position.set(-center.x, -box.min.y, -center.z);

            wrapper.add(model);
            return wrapper;
        };

        const carTemplate = createVehicle(gltfCar.scene, 0.42);
        const busTemplate = createVehicle(gltfBus.scene, 0.45);

        // Asphalt road driving lane radius R = 61.5 (tile center is 60.0; outer driving lane is ~61.5)
        const R = 61.5;
        const rCorner = 16.0;

        const dummyState = getCircuitState(0, R, rCorner);
        const P = dummyState.perimeter;

        // 1. Blue City Car (North Road, heading East)
        const CAR_SCALE = 0.42;
        const car1 = carTemplate.clone(true);
        const carWheels = [];
        car1.traverse((obj) => {
            if (obj.name && obj.name.toLowerCase().includes("wheel")) {
                carWheels.push(obj);
            }
        });
        car1.userData = {
            speed: 12,
            distance: 0,
            R,
            rCorner,
            wheels: carWheels,
            wheelRadius: 0.38 * CAR_SCALE,
        };
        vehiclesGroup.add(car1);
        activeVehicles.push(car1);

        // 2. City Bus (South Road, heading West - spaced halfway across loop)
        const BUS_SCALE = 0.45;
        const bus1 = busTemplate.clone(true);
        const busWheels = [];
        bus1.traverse((obj) => {
            if (obj.name && obj.name.toLowerCase().includes("wheel")) {
                busWheels.push(obj);
            }
        });
        bus1.userData = {
            speed: 10,
            distance: P / 3,
            R,
            rCorner,
            wheels: busWheels,
            wheelRadius: 0.38 * 1.3 * BUS_SCALE,
        };
        vehiclesGroup.add(bus1);
        activeVehicles.push(bus1);

        // Helper to spawn a stationary parked car with customized color and position
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
            return wrapper;
        };

        // 3. Parked Cars on the parking side of Modern Building (shifted to right side box)
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

// Update vehicle positions and rotate all four tires for each moving vehicle
export function updateVehicles(activeVehicles, delta) {
    if (!activeVehicles || activeVehicles.length === 0) return;

    activeVehicles.forEach((v) => {
        const data = v.userData;
        const distDelta = data.speed * delta;
        data.distance += distDelta;

        const state = getCircuitState(data.distance, data.R, data.rCorner);
        v.position.set(state.x, 0.02, state.z);
        v.rotation.y = state.yaw;

        // Lazy-detect wheels if not already assigned
        if (!data.wheels) {
            data.wheels = [];
            v.traverse((obj) => {
                if (obj.name && obj.name.toLowerCase().includes("wheel")) {
                    data.wheels.push(obj);
                }
            });
        }

        // Rotate all four tires proportional to distance traveled
        if (data.wheels && data.wheels.length > 0) {
            const radius = data.wheelRadius || 0.16;
            const rotAngle = distDelta / radius;

            data.wheels.forEach((wheel) => {
                wheel.rotation.z = (wheel.rotation.z - rotAngle) % (Math.PI * 2);
            });
        }
    });
}

