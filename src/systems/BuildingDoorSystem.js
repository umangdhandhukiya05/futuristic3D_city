import * as THREE from "three";

/**
 * BuildingDoorSystem
 *
 * Manages all interactive doors across the city for enterable buildings:
 * - common-house.glb
 * - house.glb
 *
 * Features:
 * - Proximity detection to front doors.
 * - Glowing cyberpunk HUD prompt: [E] Open Door / [E] Close Door.
 * - Single-press KeyE trigger with debounce.
 * - Smooth kinematic door opening/closing rotation.
 * - Synchronization with Rapier physical doorway barrier colliders.
 * - Interior bounding-box detection to adjust camera boom inside rooms.
 */
export class BuildingDoorSystem {
  constructor(options = {}) {
    this.physicsSystem = options.physicsSystem;
    this.playerController = options.playerController || null;
    this.domContainer = options.domContainer || document.body;

    this.doors = [];
    this.activeDoor = null;
    this.proximityThreshold = 3.6; // meters

    // Key debounce
    this.eKeyPressedLastFrame = false;

    // Interior state tracking
    this.isPlayerInside = false;

    this._createPromptUI();
  }

  setPlayerController(controller) {
    this.playerController = controller;
  }

  /**
   * Creates the floating HUD prompt for door interactions.
   *
   * @private
   */
  _createPromptUI() {
    this.promptEl = document.createElement("div");
    this.promptEl.id = "door-prompt";
    this.promptEl.className = "door-prompt hidden";
    this.promptEl.innerHTML = `
      <div class="door-key-badge">E</div>
      <div class="door-prompt-text">Open Door</div>
    `;
    this.domContainer.appendChild(this.promptEl);

    this.promptTextEl = this.promptEl.querySelector(".door-prompt-text");

    // Allow clicking the prompt directly on screen with mouse as well as pressing KeyE
    this.promptEl.addEventListener("click", () => {
      if (this.activeDoor) {
        this.toggleDoor(this.activeDoor);
        if (this.promptTextEl) {
          this.promptTextEl.textContent = this.activeDoor.isOpen ? "Close Door" : "Open Door";
        }
      }
    });
  }

  /**
   * Registers an interactive door instance.
   *
   * @param {Object} data
   * @param {string} data.id
   * @param {'common-house' | 'house' | 'office'} data.buildingType
   * @param {THREE.Object3D} data.buildingGroup
   * @param {THREE.Object3D} data.doorGroup - The rotating door group/mesh
   * @param {import("@dimforge/rapier3d-compat").Collider} [data.doorCollider] - Physics blocker
   * @param {number} [data.openAngle=-Math.PI / 2]
   * @param {number} [data.closedAngle=0]
   * @param {THREE.Vector3} data.localHingePos
   * @param {THREE.Box3} data.localInteriorBounds
   */
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
    };

    this._updateDoorWorldCache(door);
    this.doors.push(door);
    return door;
  }

  /**
   * Computes world space coordinates for a door and its interior bounding box.
   *
   * @private
   * @param {Object} door
   */
  _updateDoorWorldCache(door) {
    door.buildingGroup.updateMatrixWorld(true);
    // World position of the door opening
    door.worldDoorPos.copy(door.localHingePos).applyMatrix4(door.buildingGroup.matrixWorld);

    // World interior bounding box
    door.worldInteriorBounds.copy(door.localInteriorBounds).applyMatrix4(door.buildingGroup.matrixWorld);
  }

  /**
   * Toggles a door open or closed with physical collision synchronization.
   *
   * @param {Object} door
   */
  toggleDoor(door) {
    door.isOpen = !door.isOpen;
    door.targetAngle = door.isOpen ? door.openAngle : door.closedAngle;

    if (door.doorCollider) {
      if (door.isOpen) {
        // Immediately unblock doorway so character can walk through
        door.doorCollider.setEnabled(false);
      } else {
        // Re-enable doorway barrier after a slight delay so door swings closed first
        setTimeout(() => {
          if (!door.isOpen && door.doorCollider) {
            door.doorCollider.setEnabled(true);
          }
        }, 280);
      }
    }
  }

  /**
   * Main update loop executed each frame.
   *
   * @param {number} delta
   * @param {THREE.Vector3} playerPos - Coordinates of player
   * @param {Set<string>} keys - Active pressed keyboard keys
   */
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

    // 3. Update HUD Prompt
    if (this.activeDoor) {
      this.promptEl.classList.remove("hidden");
      this.promptTextEl.textContent = this.activeDoor.isOpen ? "Close Door" : "Open Door";
    } else {
      this.promptEl.classList.add("hidden");
    }

    // 4. Handle KeyE Press (Debounced)
    const isEPressed = keys.has("KeyE");
    if (isEPressed && !this.eKeyPressedLastFrame && this.activeDoor) {
      this.toggleDoor(this.activeDoor);
      if (this.promptTextEl) {
        this.promptTextEl.textContent = this.activeDoor.isOpen ? "Close Door" : "Open Door";
      }
    }
    this.eKeyPressedLastFrame = isEPressed;

    // 5. Interior Detection & Camera Boom Adjustment
    let insideAnyHouse = false;
    for (const door of this.doors) {
      if (door.worldInteriorBounds.containsPoint(playerPos)) {
        insideAnyHouse = true;
        break;
      }
    }

    if (insideAnyHouse !== this.isPlayerInside) {
      this.isPlayerInside = insideAnyHouse;
      if (this.playerController?.setInteriorMode) {
        this.playerController.setInteriorMode(insideAnyHouse);
      }
    }
  }

  dispose() {
    if (this.promptEl?.parentNode) {
      this.promptEl.parentNode.removeChild(this.promptEl);
    }
    this.doors = [];
  }
}
