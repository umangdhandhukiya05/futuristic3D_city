import * as THREE from "three";
import "./style.css";

import { createScene } from "./world/createScene.js";
import { getModelLoader } from "./world/modelLoader.js";
import { DayNightSystem } from "./systems/DayNightSystem.js";
import { PhysicsSystem } from "./systems/PhysicsSystem.js";
import { PlayerController } from "./systems/PlayerController.js";
import { BuildingDoorSystem } from "./systems/BuildingDoorSystem.js";
import { createLand } from "./world/createLand.js";
import { createEnvironment } from "./world/createEnvironment.js";
import { loadRoads } from "./world/loadRoads.js";
import { loadBuilding } from "./world/loadBuilding.js";
import { loadStreetLamps } from "./world/loadStreetLamps.js";
import { loadBenches } from "./world/loadBenches.js";
import { loadSignals } from "./world/loadSignals.js";
import { loadVehicles, updateVehicles } from "./world/loadVehicles.js";
import { loadGlassDome, updateGlassDome } from "./world/loadGlassDome.js";

const container = document.querySelector("#app") || document.querySelector("#root") || document.body;

const { scene, camera, renderer, sunlight, ambientLight, moonlight } = createScene(container);
getModelLoader(renderer);

const dayNightSystem = new DayNightSystem({
  scene,
  camera,
  renderer,
  sunlight,
  ambientLight,
  moonlight,
  container,
  initialTime: 9.0, // Start at 09:00 crisp morning
  cycleDuration: 120.0, // 120 real-world seconds per full 24h day
});

createLand(scene);
createEnvironment(scene);

// Movement tuning constants
const WALK_SPEED = 8.0;
const SPRINT_SPEED = 14.0;
const PLAYER_HEIGHT = 2.15;

// Player starting spawn position in the central pedestrian plaza
const spawnPos = new THREE.Vector3(0, PLAYER_HEIGHT, 24);

// Initialize Rapier Physics System (gravity, ground collider, kinematic character controller, boundary walls)
const physicsSystem = await PhysicsSystem.create({
  initialPosition: spawnPos,
  playerHeight: PLAYER_HEIGHT,
  capsuleRadius: 0.40,
  walkSpeed: WALK_SPEED,
  sprintSpeed: SPRINT_SPEED,
  jumpSpeed: 5.5,
  groundSize: 500,
});

// Initialize Player Controller (TPP robot character, FPP camera, mouse look, procedural locomotion)
const playerController = new PlayerController({
  scene,
  camera,
  physicsSystem,
  domElement: renderer.domElement,
  initialMode: "tpp", // Default to TPP with the robot model visible as requested
  onModeChange: (mode) => updateHudView(mode),
});

// Initialize Building Door System (interactive front doors for common-house and house)
const doorSystem = new BuildingDoorSystem({
  physicsSystem,
  playerController,
  domContainer: container,
});

// Load and setup the robot character model
await playerController.loadRobotModel("/models/character/robot_charcter.glb");

// HUD Elements Creation
const hudContainer = document.createElement("div");
hudContainer.className = "camera-hud";
hudContainer.innerHTML = `
  <span class="hud-label">VIEW MODE:</span>
  <button id="btn-top" class="hud-btn">[1] Top View</button>
  <button id="btn-fps" class="hud-btn">[2] First Person</button>
  <button id="btn-tpp" class="hud-btn active">[3] Third Person (TPP)</button>
  <button id="btn-iso" class="hud-btn">[4] Isometric</button>
`;
container.appendChild(hudContainer);

const instructions = document.createElement("div");
instructions.className = "city-instructions";
instructions.style.display = "block";
container.appendChild(instructions);

const btnTop = document.getElementById("btn-top");
const btnFps = document.getElementById("btn-fps");
const btnTpp = document.getElementById("btn-tpp");
const btnIso = document.getElementById("btn-iso");

// Function to update HUD active state and instructions text
function updateHudView(mode) {
  btnTop.classList.toggle("active", mode === "top");
  btnFps.classList.toggle("active", mode === "fpp");
  btnTpp.classList.toggle("active", mode === "tpp");
  btnIso.classList.toggle("active", mode === "isometric");

  if (mode === "tpp") {
    instructions.textContent = "STEP 2 CONTROLLER (TPP) | Click — Mouse Look | WASD — Walk | Shift — Run | Space — Jump | E — Door | H — Hi-Five | Scroll — Zoom | [V] Camera";
  } else if (mode === "fpp") {
    instructions.textContent = "STEP 2 CONTROLLER (FPP) | Click — Mouse Look | WASD — Move | Shift — Sprint | Space — Jump | E — Door | [3] Third Person | [V] Camera";
  } else if (mode === "top") {
    instructions.textContent = "TOP OVERVIEW | WASD / Arrows — Pan | Scroll / Q / E — Zoom | [3] TPP Robot | [2] First Person";
  } else if (mode === "isometric") {
    instructions.textContent = "ISOMETRIC VIEW | [3] TPP Robot | [2] First Person | [1] Top View | [4] Isometric";
  }
}

// Initial HUD text setting
updateHudView("tpp");

// Click handlers for HUD buttons
btnTop.addEventListener("click", () => playerController.setViewMode("top"));
btnFps.addEventListener("click", () => playerController.setViewMode("fpp"));
btnTpp.addEventListener("click", () => playerController.setViewMode("tpp"));
btnIso.addEventListener("click", () => playerController.setViewMode("isometric"));

// Keyboard Input Manager
const keys = new Set();

window.addEventListener("keydown", (event) => {
  // Key 1: Top View
  if (event.code === "Digit1" || event.code === "Numpad1") {
    playerController.setViewMode("top");
    return;
  }
  // Key 2: First Person
  if (event.code === "Digit2" || event.code === "Numpad2") {
    playerController.setViewMode("fpp");
    return;
  }
  // Key 3: Third Person (TPP)
  if (event.code === "Digit3" || event.code === "Numpad3") {
    playerController.setViewMode("tpp");
    return;
  }
  // Key 4: Isometric View
  if (event.code === "Digit4" || event.code === "Numpad4") {
    playerController.setViewMode("isometric");
    return;
  }
  // Key V: Cycle Views
  if (event.code === "KeyV") {
    playerController.cycleViewMode();
    return;
  }

  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

const clock = new THREE.Clock();

let activeVehicles = [];

// Load roads, buildings, street lamps, benches, glass dome & vehicles
try {
  await loadRoads(scene, physicsSystem);
  await loadBuilding(scene, physicsSystem, doorSystem); // Registers building & hollow house colliders
  await loadStreetLamps(scene, physicsSystem);
  await loadBenches(scene, physicsSystem);
  await loadSignals(scene, physicsSystem);
  await loadGlassDome(scene, physicsSystem);
  const vehicleData = await loadVehicles(scene, physicsSystem);
  if (vehicleData && vehicleData.activeVehicles) {
    activeVehicles = vehicleData.activeVehicles;
  }
} catch (error) {
  console.error("Error loading city assets:", error);
}

// Register newly loaded city materials for dynamic day/night emissive lighting (streetlamps, windows)
dayNightSystem.refreshMaterials();

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  // Update day/night celestial cycle and atmosphere
  dayNightSystem.update(delta);

  // Update vehicle traffic along road circuit with pedestrian & vehicle collision avoidance
  const characterPos = playerController?.robotGroup?.position || (physicsSystem ? physicsSystem.getPlayerPosition() : null);
  updateVehicles(activeVehicles, delta, characterPos);

  // Update glass dome animation mixer (pulsating energy core & gyroscopic orbit rings)
  updateGlassDome(delta);

  // Update Player Controller (capsule physics, WASD, mouse look, robot procedural locomotion, camera)
  playerController.update(delta, keys);

  // Update Interactive Building Doors & Proximity Prompts
  doorSystem.update(delta, physicsSystem.getPlayerPosition(), keys);

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
