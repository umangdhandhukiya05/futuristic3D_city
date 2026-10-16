import * as THREE from "three";
import { getModelLoader } from "../world/modelLoader.js";

/**
 * Shortest-arc angular interpolation to smoothly rotate between two angles
 * without spinning 360 degrees when wrapping around -PI / +PI.
 *
 * @param {number} current - Current angle in radians
 * @param {number} target - Target angle in radians
 * @param {number} factor - Interpolation factor (0 to 1)
 * @returns {number}
 */
function lerpAngle(current, target, factor) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return current + diff * Math.min(1, Math.max(0, factor));
}

/**
 * PlayerController
 *
 * Implements Step 2 — Player Controller:
 * - Rapier 3D kinematic capsule collider navigation and obstacle collision response.
 * - WASD locomotion with sprint (Shift) and jump (Space).
 * - Mouse look with pointer lock integration and clamped vertical pitch.
 * - Third-Person Perspective (TPP) camera orbiting smoothly behind the character.
 * - Robot character model (`/models/character/robot_charcter.glb`) scaled to physical capsule
 *   dimensions (1.70m height) with full skeletal animation (idle, walk, run, jump, hifive).
 * - First-Person Perspective (FPP) camera mode where the character model is cleanly hidden
 *   and camera acts directly as the player.
 */
export class PlayerController {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.PerspectiveCamera} options.camera
   * @param {import("./PhysicsSystem.js").PhysicsSystem} options.physicsSystem
   * @param {HTMLElement} options.domElement - WebGL canvas element
   * @param {string} [options.initialMode="tpp"] - 'tpp' | 'fpp' | 'top' | 'isometric'
   * @param {Function} [options.onModeChange] - Callback invoked when view mode changes
   * @param {boolean} [options.invertY=false] - Invert vertical mouse pitch
   */
  constructor(options) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.physicsSystem = options.physicsSystem;
    this.domElement = options.domElement;
    this.viewMode = options.initialMode || "tpp";
    this.onModeChange = options.onModeChange || null;
    this.invertY = options.invertY || false;

    // Camera angles & orbit boom parameters
    this.yaw = 0.0;
    this.pitch = 0.15; // Slightly elevated pitch looking down at robot in TPP
    this.tppDistance = 3.6; // Boom arm distance behind character (meters)
    this.minTppDistance = 1.6;
    this.maxTppDistance = 7.0;
    this.tppHeightOffset = 1.25; // Target height offset at robot chest
    this.mouseSensitivity = 0.0022;
    this.minPitch = -0.65; // Clamped look up (~ -37 degrees)
    this.maxPitch = 1.05;  // Clamped look down (~ +60 degrees)

    // Pointer lock state
    this.isPointerLocked = false;

    // Robot Character Model & Animation
    this.robotGroup = new THREE.Group();
    this.robotGroup.name = "Player_Robot_Group";
    this.scene.add(this.robotGroup);

    this.robotModel = null;
    this.chestLight = null;
    this.isLoaded = false;

    // Character Animation State
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.currentActionName = "";

    // Locomotion state
    this.currentRotationY = 0.0;
    this.targetRotationY = 0.0;
    this.isMoving = false;
    this.isSprinting = false;

    // Top view pan/zoom state
    this.panSpeed = 45.0;
    this.zoomSpeed = 40.0;

    // Temporary calculation vectors
    this._moveDir = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();

    this._bindEvents();
  }

  /**
   * Initializes event listeners for canvas clicks, mouse look, and scroll zoom.
   *
   * @private
   */
  _bindEvents() {
    this._onClick = () => {
      if ((this.viewMode === "tpp" || this.viewMode === "fpp") && !this.isPointerLocked) {
        this.domElement.requestPointerLock?.();
      }
    };

    this._onPointerLockChange = () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    };

    this._onMouseMove = (event) => {
      if (!this.isPointerLocked) return;

      if (this.viewMode === "tpp" || this.viewMode === "fpp") {
        this.yaw -= event.movementX * this.mouseSensitivity;
        // Moving mouse up (movementY < 0) reduces pitch, tilting the camera upward
        const pitchDelta = event.movementY * this.mouseSensitivity * (this.invertY ? -1 : 1);
        this.pitch += pitchDelta;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
      }
    };

    this._onWheel = (event) => {
      if (this.viewMode === "tpp") {
        event.preventDefault();
        const zoomDelta = event.deltaY * 0.003;
        this.tppDistance = THREE.MathUtils.clamp(
          this.tppDistance + zoomDelta,
          this.minTppDistance,
          this.maxTppDistance
        );
      } else if (this.viewMode === "top") {
        event.preventDefault();
        const zoomAmount = event.deltaY * 0.1;
        this.camera.position.y = THREE.MathUtils.clamp(
          this.camera.position.y + zoomAmount,
          15,
          300
        );
      }
    };

    this.domElement.addEventListener("click", this._onClick);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    document.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("wheel", this._onWheel, { passive: false });
  }

  /**
   * Asynchronously loads, scales, centers, and enhances the robot character model
   * to fit the physical capsule collider with full skeletal animations.
   *
   * @param {string} [modelPath="/models/character/robot_charcter.glb"]
   * @returns {Promise<THREE.Group>}
   */
  async loadRobotModel(modelPath = "/models/character/robot_charcter.glb") {
    const loader = getModelLoader();

    try {
      const gltf = await loader.loadAsync(modelPath);
      const rawModel = gltf.scene;

      // 1. Reset Root Translation Offset from Blender export
      const robotRoot = rawModel.getObjectByName("Robot_Root") || rawModel;
      robotRoot.position.set(0, 0, 0);

      // 2. Measure Raw Bounding Dimensions
      rawModel.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(rawModel);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);

      // Height of capsule collider in PhysicsSystem is 1.70 meters
      const targetHeight = this.physicsSystem.playerHeight || 1.70;
      const scaleFactor = targetHeight / Math.max(0.1, rawSize.y);

      // 3. Create Model Wrapper with Scaled Dimensions
      const modelWrapper = new THREE.Group();
      modelWrapper.name = "Robot_Visual_Mesh";
      modelWrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);

      // Align feet precisely at Y = 0
      rawModel.position.set(0, -rawBox.min.y, 0);
      modelWrapper.add(rawModel);

      // 4. Enhance Materials with Vibrant Futuristic Glow & PBR Finish
      rawModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.castShadow = true;
          child.receiveShadow = true;

          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => {
            const matName = (mat.name || "").toLowerCase();

            // Glowing cyan cybernetic lights (chest, ears, visor, forearms, shins)
            if (matName.includes("blue") || matName.includes("light") || matName.includes("ring")) {
              mat.emissive = new THREE.Color(0x00d4ff);
              mat.emissiveIntensity = 2.8;
              mat.toneMapped = false;
            } else if (matName.includes("visor") || matName.includes("eye")) {
              mat.color = new THREE.Color(0x0a192f);
              mat.roughness = 0.08;
              mat.metalness = 0.85;
              mat.emissive = new THREE.Color(0x00a3ff);
              mat.emissiveIntensity = 0.8;
              mat.toneMapped = false;
            } else if (matName.includes("white")) {
              mat.roughness = 0.22;
              mat.metalness = 0.15;
            } else if (matName.includes("dark")) {
              mat.roughness = 0.35;
              mat.metalness = 0.7;
            }
          });
        }
      });

      // 5. Setup Skeletal Animation Mixer & Actions
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(rawModel);

        const hifiveClip = gltf.animations.find((a) => a.name === "Robot_HiFive");
        const jumpClip = gltf.animations.find((a) => a.name === "Robot_Jump");
        const runClip = gltf.animations.find((a) => a.name === "Robot_Run");
        const walkClip = gltf.animations.find((a) => a.name === "Robot_Walk");

        // Convert jump to in-place by neutralizing Root.position Y motion so Rapier physics handles flight
        if (jumpClip) {
          const rootPosTrack = jumpClip.tracks.find((t) => t.name === "Root.position");
          if (rootPosTrack) {
            for (let i = 1; i < rootPosTrack.values.length; i += 3) {
              rootPosTrack.values[i] = 0.0;
            }
          }
        }

        // Generate natural Idle animation from rest pose with gentle breathing loop
        let idleClip = null;
        if (hifiveClip) {
          const idleTracks = [];
          hifiveClip.tracks.forEach((track) => {
            const vSize = track.getValueSize();
            const val0 = Array.from(track.values.slice(0, vSize));
            const times = [0, 1.5, 3.0];
            const values = [];

            if (track.name === "Chest.quaternion" || track.name === "Spine.quaternion") {
              const qRest = new THREE.Quaternion(val0[0], val0[1], val0[2], val0[3]);
              const qBreath = qRest.clone().multiply(
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.015)
              );
              values.push(...qRest.toArray(), ...qBreath.toArray(), ...qRest.toArray());
            } else if (track.name === "Head.quaternion") {
              const qRest = new THREE.Quaternion(val0[0], val0[1], val0[2], val0[3]);
              const qBreath = qRest.clone().multiply(
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.01)
              );
              values.push(...qRest.toArray(), ...qBreath.toArray(), ...qRest.toArray());
            } else {
              values.push(...val0, ...val0, ...val0);
            }

            if (track instanceof THREE.QuaternionKeyframeTrack) {
              idleTracks.push(new THREE.QuaternionKeyframeTrack(track.name, times, values));
            } else if (track instanceof THREE.VectorKeyframeTrack) {
              idleTracks.push(new THREE.VectorKeyframeTrack(track.name, times, values));
            }
          });
          idleClip = new THREE.AnimationClip("Robot_Idle", 3.0, idleTracks);
        }

        this.actions = {};
        if (idleClip) {
          this.actions.idle = this.mixer.clipAction(idleClip);
          this.actions.idle.setLoop(THREE.LoopRepeat);
        }
        if (walkClip) {
          this.actions.walk = this.mixer.clipAction(walkClip);
          this.actions.walk.setLoop(THREE.LoopRepeat);
        }
        if (runClip) {
          this.actions.run = this.mixer.clipAction(runClip);
          this.actions.run.setLoop(THREE.LoopRepeat);
        }
        if (jumpClip) {
          this.actions.jump = this.mixer.clipAction(jumpClip);
          this.actions.jump.setLoop(THREE.LoopOnce);
          this.actions.jump.clampWhenFinished = true;
        }
        if (hifiveClip) {
          this.actions.hifive = this.mixer.clipAction(hifiveClip);
          this.actions.hifive.setLoop(THREE.LoopOnce);
        }

        // Return to idle/movement when emote completes
        this.mixer.addEventListener("finished", (e) => {
          if (e.action === this.actions.hifive) {
            this.fadeToAction(this.isMoving ? (this.isSprinting ? "run" : "walk") : "idle", 0.25);
          }
        });

        // Start in Idle pose
        if (this.actions.idle) {
          this.currentAction = this.actions.idle;
          this.currentActionName = "idle";
          this.currentAction.play();
        }
      }

      // 6. Add Subtle Chest Point Light (illuminates city street at night)
      this.chestLight = new THREE.PointLight(0x00d4ff, 1.2, 5.0);
      this.chestLight.position.set(0, 1.25, 0.25);
      this.robotGroup.add(this.chestLight);

      // 7. Mount Model into Robot Container Group
      this.robotGroup.add(modelWrapper);
      this.robotModel = modelWrapper;

      // Position robot group at initial physical player feet coordinates
      const spawnFeet = this.physicsSystem.getPlayerFeetPosition();
      this.robotGroup.position.copy(spawnFeet);

      // Set visibility according to initial view mode
      this.robotGroup.visible = this.viewMode !== "fpp";
      this.isLoaded = true;

      return this.robotGroup;
    } catch (error) {
      console.error("Failed to load robot character model:", error);
      return null;
    }
  }

  /**
   * Switches the active view mode and adjusts camera & model visibility accordingly.
   *
   * @param {'tpp' | 'fpp' | 'top' | 'isometric'} mode
   */
  setViewMode(mode) {
    if (!["tpp", "fpp", "top", "isometric"].includes(mode)) return;

    this.viewMode = mode;

    // In FPP mode, the character model is hidden so the camera acts directly as the player
    // without clipping into the robot's head/visor.
    // In TPP, Top, and Isometric modes, the robot character is visible.
    this.robotGroup.visible = mode !== "fpp";

    if (mode === "top") {
      if (this.isPointerLocked) document.exitPointerLock?.();
      this.camera.position.set(0, 90, 0.1);
      this.camera.lookAt(0, 0, 0);
    } else if (mode === "isometric") {
      if (this.isPointerLocked) document.exitPointerLock?.();
      this.camera.position.set(60, 50, 60);
      this.camera.lookAt(0, 0, 0);
    } else if (mode === "fpp") {
      const eyePos = this.physicsSystem.getPlayerEyePosition();
      this.camera.position.copy(eyePos);
    }

    if (this.onModeChange) {
      this.onModeChange(mode);
    }
  }

  /**
   * Cycles to the next camera perspective in sequence.
   */
  cycleViewMode() {
    const modes = ["tpp", "fpp", "top", "isometric"];
    const currentIndex = modes.indexOf(this.viewMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setViewMode(nextMode);
  }

  /**
   * Smoothly crossfades between animation states (idle, walk, run, jump, hifive).
   *
   * @param {string} name - Name of target action ('idle' | 'walk' | 'run' | 'jump' | 'hifive')
   * @param {number} [duration=0.2] - Transition duration in seconds
   */
  fadeToAction(name, duration = 0.2) {
    if (!this.actions || !this.actions[name]) return;
    const nextAction = this.actions[name];
    if (this.currentAction === nextAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(duration);
    }

    const timeScale = name === "jump" ? 1.4 : name === "run" ? 1.15 : 1.0;
    nextAction
      .reset()
      .setEffectiveTimeScale(timeScale)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();

    this.currentAction = nextAction;
    this.currentActionName = name;
  }

  /**
   * Primary controller update loop executed every animation frame.
   *
   * @param {number} delta - Frame delta in seconds
   * @param {Set<string>} keys - Active keyboard key codes
   */
  update(delta, keys) {
    const clampedDelta = Math.min(delta, 0.05);

    if (this.viewMode === "tpp" || this.viewMode === "fpp") {
      // 1. Compute Horizontal Movement Relative to Camera Yaw
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);

      // Forward direction into the scene
      const fwdX = -sinY;
      const fwdZ = -cosY;

      // Right direction
      const rgtX = cosY;
      const rgtZ = -sinY;

      const fwd = keys.has("KeyW") || keys.has("ArrowUp");
      const bwd = keys.has("KeyS") || keys.has("ArrowDown");
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      const isSprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const jump = keys.has("Space");
      this.isSprinting = isSprinting;

      this._moveDir.set(0, 0, 0);
      if (fwd) this._moveDir.add({ x: fwdX, y: 0, z: fwdZ });
      if (bwd) this._moveDir.sub({ x: fwdX, y: 0, z: fwdZ });
      if (right) this._moveDir.add({ x: rgtX, y: 0, z: rgtZ });
      if (left) this._moveDir.sub({ x: rgtX, y: 0, z: rgtZ });

      this.isMoving = this._moveDir.lengthSq() > 0.0001;
      if (this.isMoving) {
        this._moveDir.normalize();
      }

      // 2. Advance Rapier Kinematic Physics Simulation
      this.physicsSystem.update(
        clampedDelta,
        {
          moveVector: this._moveDir,
          isSprinting,
          jump,
          skipCameraSync: true, // We control camera positioning explicitly
        },
        this.camera
      );

      // 3. Synchronize Physical Body & Ground Position
      const bodyPos = this.physicsSystem.getPlayerPosition();
      const isGrounded = this.physicsSystem.isGrounded();
      const baseFeetY = Math.max(0, bodyPos.y - this.physicsSystem.eyeOffset);
      this.robotGroup.position.set(bodyPos.x, baseFeetY, bodyPos.z);

      // 4. Smoothly Rotate Character to Movement Heading
      if (this.isMoving) {
        this.targetRotationY = Math.atan2(this._moveDir.x, this._moveDir.z);
        this.currentRotationY = lerpAngle(this.currentRotationY, this.targetRotationY, 14 * clampedDelta);
        this.robotGroup.rotation.y = this.currentRotationY;
      }

      // 5. Skeletal Animation State Machine
      if (this.mixer) {
        if (!isGrounded) {
          // Airborne (jumping or falling): play jump animation
          if (this.currentActionName !== "jump") {
            this.fadeToAction("jump", 0.12);
          }
        } else {
          // Grounded
          if (this.currentActionName === "jump") {
            // Touchdown from jump: transition back to movement or idle
            this.fadeToAction(this.isMoving ? (isSprinting ? "run" : "walk") : "idle", 0.18);
          } else if (keys.has("KeyH") && !this.isMoving && this.actions.hifive) {
            // Emote / Hi-Five
            if (this.currentActionName !== "hifive") {
              this.fadeToAction("hifive", 0.2);
            }
          } else if (this.currentActionName !== "hifive" || !this.actions.hifive?.isRunning()) {
            if (this.isMoving) {
              this.fadeToAction(isSprinting ? "run" : "walk", 0.2);
            } else {
              this.fadeToAction("idle", 0.25);
            }
          }
        }

        this.mixer.update(clampedDelta);
      }

      // 5. Update Camera Based on Active View Mode
      if (this.viewMode === "tpp") {
        // TPP: Orbit camera following behind robot
        const targetY = bodyPos.y + (this.tppHeightOffset - this.physicsSystem.eyeOffset);
        this._targetLook.set(bodyPos.x, targetY, bodyPos.z);

        const hDist = this.tppDistance * Math.cos(this.pitch);
        const vDist = this.tppDistance * Math.sin(this.pitch);

        const camX = this._targetLook.x + sinY * hDist;
        const camY = Math.max(0.4, this._targetLook.y + vDist);
        const camZ = this._targetLook.z + cosY * hDist;

        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(this._targetLook);
      } else if (this.viewMode === "fpp") {
        // FPP: Camera sits directly at player eye level
        const eyeY = bodyPos.y + this.physicsSystem.eyeOffset;
        this.camera.position.set(bodyPos.x, eyeY, bodyPos.z);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotation.order = "YXZ";
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = -this.pitch;
      }
    } else {
      // Step physics world in Top / Isometric modes
      this.physicsSystem.step(clampedDelta);

      // Keep character feet pinned on ground
      const bodyPos = this.physicsSystem.getPlayerPosition();
      const baseFeetY = Math.max(0, bodyPos.y - this.physicsSystem.eyeOffset);
      this.robotGroup.position.set(bodyPos.x, baseFeetY, bodyPos.z);

      if (this.viewMode === "top") {
        if (keys.has("KeyW") || keys.has("ArrowUp")) this.camera.position.z -= this.panSpeed * clampedDelta;
        if (keys.has("KeyS") || keys.has("ArrowDown")) this.camera.position.z += this.panSpeed * clampedDelta;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) this.camera.position.x -= this.panSpeed * clampedDelta;
        if (keys.has("KeyD") || keys.has("ArrowRight")) this.camera.position.x += this.panSpeed * clampedDelta;

        if (keys.has("KeyQ")) this.camera.position.y = Math.min(this.camera.position.y + this.zoomSpeed * clampedDelta, 300);
        if (keys.has("KeyE")) this.camera.position.y = Math.max(this.camera.position.y - this.zoomSpeed * clampedDelta, 15);
      }
    }
  }

  /**
   * Clean up event listeners and Three.js memory upon disposal.
   */
  dispose() {
    this.domElement.removeEventListener("click", this._onClick);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    document.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("wheel", this._onWheel);

    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    if (this.robotGroup) {
      this.scene.remove(this.robotGroup);
    }
  }
}
