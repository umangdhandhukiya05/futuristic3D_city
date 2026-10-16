import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * PhysicsSystem
 *
 * Encapsulates the Rapier 3D physics engine, gravity simulation, static collision
 * surfaces (city ground slab and perimeter boundaries), and kinematic character
 * controller for realistic first-person player physics and navigation.
 */
export class PhysicsSystem {
  /**
   * Factory method to asynchronously initialize Rapier WebAssembly and construct
   * the PhysicsSystem instance.
   *
   * @param {Object} [options]
   * @returns {Promise<PhysicsSystem>}
   */
  static async create(options = {}) {
    await RAPIER.init();
    return new PhysicsSystem(options);
  }

  constructor(options = {}) {
    // 1. World & Gravity Configuration
    const gravityVec = options.gravity || { x: 0.0, y: -9.81, z: 0.0 };
    this.gravityY = gravityVec.y;
    this.world = new RAPIER.World(gravityVec);
    this.world.timestep = options.timestep || 1 / 60;

    // Movement tuning
    this.walkSpeed = options.walkSpeed || 8.0;
    this.sprintSpeed = options.sprintSpeed || 14.0;
    this.jumpSpeed = options.jumpSpeed || 5.5;
    this.terminalVelocity = options.terminalVelocity || -40.0;

    // Player physical dimensions
    this.playerHeight = options.playerHeight || 1.7; // Total player height in meters
    this.capsuleRadius = options.capsuleRadius || 0.35;
    // Total capsule height = 2 * halfHeight + 2 * radius = playerHeight
    this.capsuleHalfHeight = Math.max(0.1, (this.playerHeight - 2 * this.capsuleRadius) / 2);
    // Eye offset relative to capsule geometric center
    this.eyeOffset = this.capsuleHalfHeight + this.capsuleRadius;

    // 2. Setup Ground Collider (covers the 500x500 city floor plane at Y = 0)
    this._createGroundCollider(options.groundSize || 500);

    // 3. Setup Perimeter Boundary Walls (prevents walking off the city borders)
    this._createPerimeterWalls(options.boundaryLimit || 245);

    // 4. Setup Player RigidBody & Kinematic Character Controller
    const spawnPos = options.initialPosition || new THREE.Vector3(0, this.playerHeight, 24);
    this._createPlayerController(spawnPos);

    // Internal temporary calculation vectors
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
  }

  /**
   * Creates a solid, non-penetrable ground collider slab sitting at Y = 0.
   * Top surface aligns flush with the visual cobblestone ground plane.
   *
   * @private
   * @param {number} size - Dimension of square ground plane (default 500)
   */
  _createGroundCollider(size) {
    const halfSize = size / 2 + 10;
    const thickness = 2.0;

    // Center slab at Y = -thickness / 2 so the top surface sits exactly at Y = 0.0
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -thickness / 2, 0);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);

    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(halfSize, thickness / 2, halfSize)
      .setFriction(0.8)
      .setRestitution(0.0);

    this.groundCollider = this.world.createCollider(groundColliderDesc, this.groundBody);
  }

  /**
   * Creates invisible perimeter wall colliders around city borders.
   *
   * @private
   * @param {number} limit - Distance from origin to border walls
   */
  _createPerimeterWalls(limit) {
    const wallHeight = 40.0;
    const wallThickness = 2.0;
    const walls = [
      { x: 0, z: -limit, hx: limit, hz: wallThickness }, // North border
      { x: 0, z: limit, hx: limit, hz: wallThickness },  // South border
      { x: -limit, z: 0, hx: wallThickness, hz: limit }, // West border
      { x: limit, z: 0, hx: wallThickness, hz: limit },  // East border
    ];

    this.boundaryColliders = [];
    walls.forEach((w) => {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, wallHeight / 2, w.z);
      const body = this.world.createRigidBody(bodyDesc);
      const colDesc = RAPIER.ColliderDesc.cuboid(w.hx, wallHeight / 2, w.hz)
        .setFriction(0.0)
        .setRestitution(0.0);
      const col = this.world.createCollider(colDesc, body);
      this.boundaryColliders.push({ body, col });
    });
  }

  /**
   * Sets up kinematic player capsule and Rapier's advanced character controller.
   *
   * @private
   * @param {THREE.Vector3} spawnPos
   */
  _createPlayerController(spawnPos) {
    // Body origin is at capsule center (spawn eye Y minus eye offset)
    const bodyCenterY = Math.max(this.eyeOffset, spawnPos.y - this.eyeOffset);

    const playerBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPos.x, bodyCenterY, spawnPos.z);
    this.playerBody = this.world.createRigidBody(playerBodyDesc);

    const playerColliderDesc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius)
      .setFriction(0.0)
      .setRestitution(0.0);
    this.playerCollider = this.world.createCollider(playerColliderDesc, this.playerBody);

    // Advanced Kinematic Character Controller:
    // Handles ground detection, step climbs, sliding against colliders, and slope handling
    const offset = 0.02;
    this.characterController = this.world.createCharacterController(offset);
    this.characterController.enableAutostep(0.45, 0.2, true); // Smoothly climb over sidewalk & curb steps
    this.characterController.enableSnapToGround(0.35);       // Prevent jitter when descending curbs
    this.characterController.setApplyImpulsesToDynamicBodies(true);

    // Player state tracker
    this.player = {
      position: new THREE.Vector3(spawnPos.x, bodyCenterY, spawnPos.z),
      verticalVelocity: 0.0,
      isGrounded: true,
    };
  }

  /**
   * Primary physics update loop called every animation frame.
   *
   * @param {number} delta - Frame delta time in seconds
   * @param {Object} inputState - Input key states or move vector { forward, backward, left, right, isSprinting, jump, moveVector, skipCameraSync }
   * @param {THREE.Camera} [camera] - Three.js camera for orientation & position sync (optional if moveVector is provided)
   */
  update(delta, inputState, camera = null) {
    if (!this.world || !this.playerBody) return;

    const clampedDelta = Math.min(delta, 0.05);

    // 1. Horizontal Movement Direction
    if (inputState.moveVector && inputState.moveVector.isVector3) {
      this._moveDir.copy(inputState.moveVector);
    } else if (camera) {
      camera.getWorldDirection(this._forward);
      this._forward.y = 0;
      this._forward.normalize();

      this._right.crossVectors(this._forward, camera.up).normalize();

      this._moveDir.set(0, 0, 0);
      if (inputState.forward) this._moveDir.add(this._forward);
      if (inputState.backward) this._moveDir.sub(this._forward);
      if (inputState.right) this._moveDir.add(this._right);
      if (inputState.left) this._moveDir.sub(this._right);
    } else {
      this._moveDir.set(0, 0, 0);
    }

    if (this._moveDir.lengthSq() > 0) {
      this._moveDir.normalize();
    }

    const speed = inputState.isSprinting ? this.sprintSpeed : this.walkSpeed;
    const moveX = this._moveDir.x * speed * clampedDelta;
    const moveZ = this._moveDir.z * speed * clampedDelta;

    // 2. Vertical Dynamics: Gravity & Jump
    if (inputState.jump && this.player.isGrounded) {
      this.player.verticalVelocity = this.jumpSpeed;
      this.player.isGrounded = false;
    } else if (!this.player.isGrounded) {
      this.player.verticalVelocity += this.gravityY * clampedDelta;
      if (this.player.verticalVelocity < this.terminalVelocity) {
        this.player.verticalVelocity = this.terminalVelocity;
      }
    } else {
      // Small continuous downward probe to verify groundedness
      this.player.verticalVelocity = -1.0;
    }

    const moveY = this.player.verticalVelocity * clampedDelta;

    // 3. Compute Collider Movement with Obstacle Collision Response
    const desiredTranslation = { x: moveX, y: moveY, z: moveZ };
    this.characterController.computeColliderMovement(this.playerCollider, desiredTranslation);

    const computed = this.characterController.computedMovement();
    const currentTranslation = this.playerBody.translation();

    const nextPosition = {
      x: currentTranslation.x + computed.x,
      y: currentTranslation.y + computed.y,
      z: currentTranslation.z + computed.z,
    };

    // Apply computed translation to Rapier body & step simulation
    this.playerBody.setNextKinematicTranslation(nextPosition);
    this.world.step();

    // 4. Update Grounded State & Reset Fall Velocity
    this.player.isGrounded = this.characterController.computedGrounded();

    if (this.player.isGrounded && this.player.verticalVelocity < 0) {
      this.player.verticalVelocity = 0.0;
    }

    // 5. Synchronize State Tracker & (Optionally) Camera Position
    const updatedPos = this.playerBody.translation();
    this.player.position.set(updatedPos.x, updatedPos.y, updatedPos.z);

    if (!inputState.skipCameraSync && camera) {
      camera.position.set(
        updatedPos.x,
        updatedPos.y + this.eyeOffset,
        updatedPos.z
      );
    }
  }

  /**
   * Advances the physics world when camera is in Top or Isometric view
   * without applying first-person character movement.
   */
  step() {
    if (!this.world) return;
    this.world.step();
  }

  /**
   * Returns the current physical position of the player (center of body).
   *
   * @returns {THREE.Vector3}
   */
  getPlayerPosition() {
    if (!this.playerBody) return new THREE.Vector3();
    const pos = this.playerBody.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  /**
   * Returns current camera eye position.
   *
   * @returns {THREE.Vector3}
   */
  getPlayerEyePosition() {
    if (!this.playerBody) return new THREE.Vector3();
    const pos = this.playerBody.translation();
    return new THREE.Vector3(pos.x, pos.y + this.eyeOffset, pos.z);
  }

  /**
   * Returns current player feet / ground contact position.
   *
   * @returns {THREE.Vector3}
   */
  getPlayerFeetPosition() {
    if (!this.playerBody) return new THREE.Vector3();
    const pos = this.playerBody.translation();
    return new THREE.Vector3(pos.x, Math.max(0, pos.y - this.eyeOffset), pos.z);
  }

  /**
   * Teleports the player body to new world coordinates.
   *
   * @param {number} x
   * @param {number} y - Eye height or ground height
   * @param {number} z
   */
  setPlayerPosition(x, y, z) {
    if (!this.playerBody) return;
    const bodyY = Math.max(this.eyeOffset, y - this.eyeOffset);
    this.playerBody.setTranslation({ x, y: bodyY, z }, true);
    this.player.position.set(x, bodyY, z);
    this.player.verticalVelocity = 0.0;
  }

  /**
   * Checks whether the player is currently standing firmly on the ground.
   *
   * @returns {boolean}
   */
  isGrounded() {
    return this.player.isGrounded;
  }

  /**
   * Adds an arbitrary static obstacle box collider to the physics world.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} halfWidth
   * @param {number} halfHeight
   * @param {number} halfDepth
   * @param {number} [friction=0.5]
   * @param {number} [restitution=0.0]
   * @returns {RAPIER.Collider}
   */
  addStaticBox(x, y, z, halfWidth, halfHeight, halfDepth, friction = 0.5, restitution = 0.0) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfDepth)
      .setFriction(friction)
      .setRestitution(restitution);
    return this.world.createCollider(colDesc, body);
  }

  /**
   * Clean up Rapier memory and simulation.
   */
  dispose() {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
  }
}
