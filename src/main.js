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

const container = document.querySelector("#app") || document.body;

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

// Camera HUD Elements Creation
const hudContainer = document.createElement("div");
hudContainer.className = "camera-hud";
hudContainer.innerHTML = `
  <div class="hud-label-chip">
    <span class="hud-pulse-dot"></span>
    <span class="hud-label">VIEW</span>
  </div>
  <button id="btn-top" class="hud-btn"><span class="key-tag">1</span> Top View</button>
  <button id="btn-fps" class="hud-btn"><span class="key-tag">2</span> First Person</button>
  <button id="btn-tpp" class="hud-btn active"><span class="key-tag">3</span> Third Person</button>
  <button id="btn-iso" class="hud-btn"><span class="key-tag">4</span> Isometric</button>
`;
container.appendChild(hudContainer);

// Modern Interactive Suggestion & Controls Dock
const suggestionContainer = document.createElement("div");
suggestionContainer.className = "suggestion-dock";
suggestionContainer.innerHTML = `
  <button id="btn-suggestion-toggle" class="suggestion-btn active" title="Toggle Controls & Hints">
    <span class="sugg-glow"></span>
    <span class="sugg-icon">💡</span>
    <span class="sugg-title">SUGGESTIONS</span>
    <span class="sugg-badge">CONTROLS</span>
    <span class="sugg-toggle-arrow">▼</span>
  </button>
  <div id="suggestion-panel" class="suggestion-panel">
    <div id="suggestion-chips" class="suggestion-chips"></div>
  </div>
`;
container.appendChild(suggestionContainer);

const btnTop = document.getElementById("btn-top");
const btnFps = document.getElementById("btn-fps");
const btnTpp = document.getElementById("btn-tpp");
const btnIso = document.getElementById("btn-iso");

const btnSuggestionToggle = document.getElementById("btn-suggestion-toggle");
const suggestionPanel = document.getElementById("suggestion-panel");
const suggestionChips = document.getElementById("suggestion-chips");

let suggestionsOpen = true;
btnSuggestionToggle?.addEventListener("click", () => {
  suggestionsOpen = !suggestionsOpen;
  btnSuggestionToggle.classList.toggle("active", suggestionsOpen);
  suggestionPanel?.classList.toggle("collapsed", !suggestionsOpen);
});

// Function to update HUD active state and suggestion chips
function updateHudView(mode) {
  btnTop.classList.toggle("active", mode === "top");
  btnFps.classList.toggle("active", mode === "fpp");
  btnTpp.classList.toggle("active", mode === "tpp");
  btnIso.classList.toggle("active", mode === "isometric");

  if (!suggestionChips) return;

  if (mode === "tpp") {
    suggestionChips.innerHTML = `
      <div class="sugg-chip"><kbd>WASD</kbd><span>Walk</span></div>
      <div class="sugg-chip"><kbd>Shift</kbd><span>Sprint</span></div>
      <div class="sugg-chip"><kbd>Space</kbd><span>Jump</span></div>
      <div class="sugg-chip"><kbd>🖱️ Click</kbd><span>Look</span></div>
      <div class="sugg-chip primary"><kbd>E</kbd><span>Open Door</span></div>
      <div class="sugg-chip"><kbd>H</kbd><span>Hi-Five</span></div>
      <div class="sugg-chip"><kbd>Scroll</kbd><span>Zoom</span></div>
      <div class="sugg-chip"><kbd>V</kbd><span>Cam View</span></div>
      <div class="sugg-chip accent"><kbd>L</kbd><span>Day/Night</span></div>
      <div class="sugg-chip"><kbd>T</kbd><span>+1.5h</span></div>
    `;
  } else if (mode === "fpp") {
    suggestionChips.innerHTML = `
      <div class="sugg-chip"><kbd>WASD</kbd><span>Move</span></div>
      <div class="sugg-chip"><kbd>Shift</kbd><span>Sprint</span></div>
      <div class="sugg-chip"><kbd>Space</kbd><span>Jump</span></div>
      <div class="sugg-chip"><kbd>🖱️ Click</kbd><span>Look</span></div>
      <div class="sugg-chip primary"><kbd>E</kbd><span>Open Door</span></div>
      <div class="sugg-chip"><kbd>3</kbd><span>TPP Robot</span></div>
      <div class="sugg-chip"><kbd>V</kbd><span>Cam View</span></div>
      <div class="sugg-chip accent"><kbd>L</kbd><span>Day/Night</span></div>
      <div class="sugg-chip"><kbd>T</kbd><span>+1.5h</span></div>
    `;
  } else if (mode === "top") {
    suggestionChips.innerHTML = `
      <div class="sugg-chip"><kbd>WASD / Arrows</kbd><span>Pan Camera</span></div>
      <div class="sugg-chip"><kbd>Scroll / Q / E</kbd><span>Zoom</span></div>
      <div class="sugg-chip primary"><kbd>3</kbd><span>TPP Robot</span></div>
      <div class="sugg-chip"><kbd>2</kbd><span>First Person</span></div>
      <div class="sugg-chip accent"><kbd>L</kbd><span>Day/Night</span></div>
    `;
  } else if (mode === "isometric") {
    suggestionChips.innerHTML = `
      <div class="sugg-chip"><kbd>WASD / Arrows</kbd><span>Orbit</span></div>
      <div class="sugg-chip"><kbd>Scroll</kbd><span>Zoom</span></div>
      <div class="sugg-chip primary"><kbd>3</kbd><span>TPP Robot</span></div>
      <div class="sugg-chip"><kbd>2</kbd><span>First Person</span></div>
      <div class="sugg-chip"><kbd>1</kbd><span>Top View</span></div>
      <div class="sugg-chip accent"><kbd>L</kbd><span>Day/Night</span></div>
    `;
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
