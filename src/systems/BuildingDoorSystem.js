import * as THREE from "three";
import { soundSystem } from "./SoundSystem.js";

// BuildingDoorSystem
// Manages all interactive doors and isolated interior room lighting for enterable buildings:
// - common-house.glb (2-Story Modern Villa)
// - house.glb (Single-Story Suburban House)
// - zignuts_office.glb (Zignuts Office Building)
// Performance-Optimized Virtual Light Rig Architecture:
// - Avoids cloning dozens of PointLights across the entire city (which causes severe WebGL shader lag).
// - Maintains exactly TWO scene-level interior PointLights dynamically anchored to the active building.
// - Constant light count prevents Three.js from recompiling materials/shaders at runtime.
// - Interior lights have tight distance bounds and quadratic falloff, completely isolating inside illumination from the exterior city.
export class BuildingDoorSystem {
  constructor(options = {}) {
    this.scene = options.scene || null;
    this.physicsSystem = options.physicsSystem;
    this.playerController = options.playerController || null;
    this.dayNightSystem = options.dayNightSystem || null;
    this.domContainer = options.domContainer || document.body;

    this.doors = [];
    this.activeDoor = null;
    this.currentInsideDoor = null;
    this.proximityThreshold = 3.8; // meters

    // Key debouncing
    this.eKeyPressedLastFrame = false;
    this.fKeyPressedLastFrame = false;

    // Interior state tracking
    this.isPlayerInside = false;

    // Reusable math vector
    this._tempVec = new THREE.Vector3();

    // Virtual Interior Lighting Rig (Only 2 lights for the entire application -> 60+ FPS performance)
    this.rigLight1 = new THREE.PointLight(0xffeedd, 0, 14, 2);
    this.rigLight1.name = "rig_interior_light_1";
    this.rigLight2 = new THREE.PointLight(0xffeedd, 0, 14, 2);
    this.rigLight2.name = "rig_interior_light_2";

    if (this.scene) {
      this.scene.add(this.rigLight1);
      this.scene.add(this.rigLight2);
    }

    this._createPromptUI();
  }

  // Sets or attaches the active Three.js scene.
  setScene(scene) {
    if (this.scene === scene) return;
    this.scene = scene;
    if (this.scene) {
      this.scene.add(this.rigLight1);
      this.scene.add(this.rigLight2);
    }
  }

  // Sets or updates the DayNightSystem reference.
  setDayNightSystem(dayNightSystem) {
    this.dayNightSystem = dayNightSystem;
  }

  // Creates the modern rectangular bottom-left action banner for door & lighting interactions.
  _createPromptUI() {
    this.promptEl = document.createElement("div");
    this.promptEl.id = "action-prompt";
    this.promptEl.className = "action-prompt hidden";
    this.promptEl.innerHTML = `
      <div id="prompt-door-chip" class="action-chip hidden">
        <div class="action-key-badge">E</div>
        <span id="prompt-door-text" class="action-text">OPEN DOOR</span>
      </div>
      <div id="prompt-light-chip" class="action-chip hidden">
        <div class="action-key-badge alt-key">F</div>
        <span id="prompt-light-text" class="action-text">TURN ON LIGHTS</span>
      </div>
    `;
    this.domContainer.appendChild(this.promptEl);

    this.doorChipEl = this.promptEl.querySelector("#prompt-door-chip");
    this.doorTextEl = this.promptEl.querySelector("#prompt-door-text");
    this.lightChipEl = this.promptEl.querySelector("#prompt-light-chip");
    this.lightTextEl = this.promptEl.querySelector("#prompt-light-text");

    // Click handler for door chip
    this.doorChipEl?.addEventListener("click", () => {
      if (this.activeDoor) {
        this.toggleDoor(this.activeDoor);
        if (this.doorTextEl) {
          this.doorTextEl.textContent = this.activeDoor.isOpen ? "CLOSE DOOR" : "OPEN DOOR";
        }
      }
    });

    // Click handler for light chip
    this.lightChipEl?.addEventListener("click", () => {
      const target = this.currentInsideDoor || this.activeDoor;
      if (target) {
        target.lightsOn = !target.lightsOn;
        target.manualLightOverride = true;
        if (this.lightTextEl) {
          this.lightTextEl.textContent = target.lightsOn ? "LIGHTS OFF" : "LIGHTS ON";
        }
      }
    });
  }

  // Registers an interactive door and building instance with local interior light positions.
  registerDoor(data) {
    const door = {
      id: data.id,
      buildingType: data.buildingType,
      buildingGroup: data.buildingGroup,
      doorGroup: data.doorGroup,
      doorCollider: data.doorCollider || null,
      openAngle: data.openAngle ?? -Math.PI / 2,
      closedAngle: data.closedAngle ?? 0,
      currentAngle: data.closedAngle ?? 0,
      targetAngle: data.closedAngle ?? 0,
      isOpen: false,
      localHingePos: data.localHingePos.clone(),
      localInteriorBounds: data.localInteriorBounds.clone(),
      worldInteriorBounds: new THREE.Box3(),
      worldDoorPos: new THREE.Vector3(),
      localLights: data.localLights || [],
      lightsOn: false,
      manualLightOverride: false,
      lastDayState: undefined,
    };

    this._updateDoorWorldCache(door);
    this.doors.push(door);
    return door;
  }

  // Computes world space coordinates for a door and its interior bounding box.
  _updateDoorWorldCache(door) {
    door.buildingGroup.updateMatrixWorld(true);
    door.worldDoorPos.copy(door.localHingePos).applyMatrix4(door.buildingGroup.matrixWorld);
    door.worldInteriorBounds.copy(door.localInteriorBounds).applyMatrix4(door.buildingGroup.matrixWorld);
  }

  // Toggles a door open or closed and syncs its physics blocker.
  toggleDoor(door) {
    door.isOpen = !door.isOpen;
    door.targetAngle = door.isOpen ? door.openAngle : door.closedAngle;

    if (door.isOpen) {
      soundSystem.playDoorOpen(door.worldDoorPos);
    } else {
      soundSystem.playDoorClose(door.worldDoorPos);
    }

    if (door.doorCollider && this.physicsSystem?.world) {
      if (door.isOpen) {
        if (!door.savedTranslation) {
          door.savedTranslation = { ...door.doorCollider.translation() };
        }
        door.doorCollider.setTranslation({ x: 0, y: -9999, z: 0 });
      } else if (door.savedTranslation) {
        door.doorCollider.setTranslation(door.savedTranslation);
      }
    }
  }

  // Main update loop executed each animation frame.
  update(delta, playerPos, keys) {
    const clampedDelta = Math.min(delta, 0.05);

    // 1. Smoothly animate all rotating doors
    for (const door of this.doors) {
      if (Math.abs(door.currentAngle - door.targetAngle) > 0.001) {
        door.currentAngle = THREE.MathUtils.lerp(door.currentAngle, door.targetAngle, 10 * clampedDelta);
        door.doorGroup.rotation.y = door.currentAngle;
      }
    }

    // 2. Find closest door to player
    let closestDoor = null;
    let closestDistSq = this.proximityThreshold * this.proximityThreshold;

    for (const door of this.doors) {
      const distSq = playerPos.distanceToSquared(door.worldDoorPos);
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestDoor = door;
      }
    }
    this.activeDoor = closestDoor;

    // 3. Interior Detection
    let insideDoor = null;
    for (const door of this.doors) {
      if (door.worldInteriorBounds.containsPoint(playerPos)) {
        insideDoor = door;
        break;
      }
    }
    this.currentInsideDoor = insideDoor;

    const insideAnyHouse = !!insideDoor;
    if (insideAnyHouse !== this.isPlayerInside) {
      this.isPlayerInside = insideAnyHouse;
      if (this.playerController?.setInteriorMode) {
        this.playerController.setInteriorMode(insideAnyHouse);
      }
    }

    // Sync interior isolation to DayNightSystem so sunlight, ambient, and sky IBL are zeroed out inside
    if (this.dayNightSystem?.setInteriorState) {
      this.dayNightSystem.setInteriorState(this.isPlayerInside);
    }

    // 4. Virtual Lighting Rig Synchronization (Active Building Only)
    // Only illuminate the building the player is inside (or within close door proximity)
    const targetBuilding = insideDoor || (closestDoor && closestDistSq < 100 ? closestDoor : null);
    const isDay = this.dayNightSystem ? this.dayNightSystem.isDayTime() : true;

    if (targetBuilding) {
      // Automatic day/night state synchronization (only when user hasn't manually overridden)
      if (!targetBuilding.manualLightOverride && (targetBuilding.lastDayState === undefined || targetBuilding.lastDayState !== isDay)) {
        targetBuilding.lastDayState = isDay;
        // Day = Lights ON (bright natural indoor light); Night = Lights OFF (dark inside)
        targetBuilding.lightsOn = isDay;
      }

      const isLightOn = targetBuilding.lightsOn;
      const defs = targetBuilding.localLights || [];

      // Rig Light 1 (e.g. Ground floor living room / main lobby)
      if (defs[0]) {
        this._tempVec.copy(defs[0].pos).applyMatrix4(targetBuilding.buildingGroup.matrixWorld);
        this.rigLight1.position.copy(this._tempVec);
        this.rigLight1.distance = defs[0].range || 14;
        this.rigLight1.color.setHex(defs[0].color || 0xffeedd);
        const targetInt1 = isLightOn ? (defs[0].intensity || 30) : 0;
        this.rigLight1.intensity = THREE.MathUtils.lerp(this.rigLight1.intensity, targetInt1, 10 * clampedDelta);
      } else {
        this.rigLight1.intensity = 0;
      }

      // Rig Light 2 (e.g. Second floor lounge / bedroom for 2-story villa)
      if (defs[1]) {
        this._tempVec.copy(defs[1].pos).applyMatrix4(targetBuilding.buildingGroup.matrixWorld);
        this.rigLight2.position.copy(this._tempVec);
        this.rigLight2.distance = defs[1].range || 14;
        this.rigLight2.color.setHex(defs[1].color || 0xffeedd);
        const targetInt2 = isLightOn ? (defs[1].intensity || 30) : 0;
        this.rigLight2.intensity = THREE.MathUtils.lerp(this.rigLight2.intensity, targetInt2, 10 * clampedDelta);
      } else {
        this.rigLight2.intensity = 0;
      }
    } else {
      // Player is outside away from buildings: smoothly fade out rig lights
      if (this.rigLight1.intensity > 0.01) {
        this.rigLight1.intensity = THREE.MathUtils.lerp(this.rigLight1.intensity, 0, 10 * clampedDelta);
      } else {
        this.rigLight1.intensity = 0;
      }
      if (this.rigLight2.intensity > 0.01) {
        this.rigLight2.intensity = THREE.MathUtils.lerp(this.rigLight2.intensity, 0, 10 * clampedDelta);
      } else {
        this.rigLight2.intensity = 0;
      }
    }

    // 5. Handle Keyboard Triggers (Debounced)
    // KeyE: Open / Close Door
    const isEPressed = keys.has("KeyE");
    if (isEPressed && !this.eKeyPressedLastFrame && this.activeDoor) {
      this.toggleDoor(this.activeDoor);
    }
    this.eKeyPressedLastFrame = isEPressed;

    // KeyF or KeyG: Toggle Interior Lights inside building
    const isFPressed = keys.has("KeyF") || keys.has("KeyG");
    if (isFPressed && !this.fKeyPressedLastFrame && targetBuilding) {
      targetBuilding.lightsOn = !targetBuilding.lightsOn;
      targetBuilding.manualLightOverride = true;
    }
    this.fKeyPressedLastFrame = isFPressed;

    // 6. Update Bottom-Left Rectangular Interactive Action Prompt
    let showDoorChip = false;
    let showLightChip = false;

    if (this.activeDoor) {
      showDoorChip = true;
      if (this.doorTextEl) {
        this.doorTextEl.textContent = this.activeDoor.isOpen ? "CLOSE DOOR" : "OPEN DOOR";
      }
    }

    if (targetBuilding) {
      showLightChip = true;
      if (this.lightTextEl) {
        this.lightTextEl.textContent = targetBuilding.lightsOn ? "LIGHTS OFF" : "LIGHTS ON";
      }
    }

    this.doorChipEl?.classList.toggle("hidden", !showDoorChip);
    this.lightChipEl?.classList.toggle("hidden", !showLightChip);

    if (showDoorChip || showLightChip) {
      this.promptEl.classList.remove("hidden");
    } else {
      this.promptEl.classList.add("hidden");
    }
  }

  dispose() {
    if (this.promptEl?.parentNode) {
      this.promptEl.parentNode.removeChild(this.promptEl);
    }
    if (this.rigLight1?.parent) {
      this.rigLight1.parent.remove(this.rigLight1);
    }
    if (this.rigLight2?.parent) {
      this.rigLight2.parent.remove(this.rigLight2);
    }
    this.doors = [];
  }
}
