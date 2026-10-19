import * as THREE from "three";

// SoundSystem: Pure procedural 3D Spatial Audio Engine built on native Web Audio API.
// Synthesizes rich sci-fi & urban audio in real-time without relying on external audio files:
// - Character locomotion footsteps & servo motors
// - Futuristic pneumatic sliding doors (open & close)
// - Vehicle engine hums modulated by speed & RPM
// - Dual-tone automotive & air horns
export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.vehicleGain = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Noise buffer cache for pneumatic hisses and friction
    this.noiseBuffer = null;

    // Vehicle active sound synthesis nodes
    this.vehicleAudioNodes = new Map();

    // Reusable vectors for 3D spatial calculations
    this._camPos = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._camUp = new THREE.Vector3();

    // Auto-unlock on first user interaction (browser autoplay policy)
    this._setupAutoUnlock();
  }

  // Initializes the AudioContext upon user gesture
  init() {
    if (this.isInitialized) return;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) {
        console.warn("Web Audio API is not supported in this browser.");
        return;
      }

      this.ctx = new AudioCtxClass();

      // Master volume stage
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX bus (character, doors, horns)
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Ambient Vehicles bus
      this.vehicleGain = this.ctx.createGain();
      this.vehicleGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
      this.vehicleGain.connect(this.masterGain);

      // Pre-generate 2-second white noise buffer for whooshes, pneumatic hiss, and clicks
      this._generateNoiseBuffer();

      this.isInitialized = true;

      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    } catch (e) {
      console.warn("Error initializing Web Audio API:", e);
    }
  }

  _setupAutoUnlock() {
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }

  // Generates white noise buffer for procedural sound synthesis
  _generateNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2.0; // 2 seconds
    this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  // Creates a 3D Spatial PannerNode configured for natural inverse-distance attenuation
  _createPanner(position, refDist = 5.0, maxDist = 70.0) {
    if (!this.ctx) return null;

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = refDist;
    panner.maxDistance = maxDist;
    panner.rolloffFactor = 1.2;

    if (position) {
      if (panner.positionX) {
        panner.positionX.setValueAtTime(position.x, this.ctx.currentTime);
        panner.positionY.setValueAtTime(position.y, this.ctx.currentTime);
        panner.positionZ.setValueAtTime(position.z, this.ctx.currentTime);
      } else {
        panner.setPosition(position.x, position.y, position.z);
      }
    }

    return panner;
  }

  // Synchronizes the Web Audio Listener with the Three.js active Camera in 3D world space
  updateListener(camera) {
    if (!this.ctx || !camera) return;

    camera.getWorldPosition(this._camPos);
    camera.getWorldDirection(this._camFwd);
    this._camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    const listener = this.ctx.listener;
    const t = this.ctx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(this._camPos.x, t);
      listener.positionY.setValueAtTime(this._camPos.y, t);
      listener.positionZ.setValueAtTime(this._camPos.z, t);
      listener.forwardX.setValueAtTime(this._camFwd.x, t);
      listener.forwardY.setValueAtTime(this._camFwd.y, t);
      listener.forwardZ.setValueAtTime(this._camFwd.z, t);
      listener.upX.setValueAtTime(this._camUp.x, t);
      listener.upY.setValueAtTime(this._camUp.y, t);
      listener.upZ.setValueAtTime(this._camUp.z, t);
    } else {
      listener.setPosition(this._camPos.x, this._camPos.y, this._camPos.z);
      listener.setOrientation(
        this._camFwd.x,
        this._camFwd.y,
        this._camFwd.z,
        this._camUp.x,
        this._camUp.y,
        this._camUp.z
      );
    }
  }

  // =========================================================================
  // 1. CHARACTER MOVEMENT AUDIO (Robotic Servo & Metallic Pavement Steps)
  // =========================================================================
  playFootstep(isSprinting = false, position = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // 1A. Low mechanical foot plant thump (Pitch sweep down)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    const baseFreq = isSprinting ? 140 : 110;
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

    oscGain.gain.setValueAtTime(isSprinting ? 0.35 : 0.22, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(oscGain);

    // 1B. High-frequency robotic joint servo click
    const servoOsc = this.ctx.createOscillator();
    const servoGain = this.ctx.createGain();
    const servoFilter = this.ctx.createBiquadFilter();

    servoOsc.type = "triangle";
    servoOsc.frequency.setValueAtTime(isSprinting ? 820 : 680, t);
    servoOsc.frequency.exponentialRampToValueAtTime(320, t + 0.08);

    servoFilter.type = "bandpass";
    servoFilter.frequency.setValueAtTime(1200, t);
    servoFilter.Q.setValueAtTime(3.0, t);

    servoGain.gain.setValueAtTime(isSprinting ? 0.15 : 0.09, t);
    servoGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    servoOsc.connect(servoFilter);
    servoFilter.connect(servoGain);

    // Routing (spatial panner if position provided, otherwise directly to SFX bus)
    if (position) {
      const panner = this._createPanner(position, 2.0, 30.0);
      oscGain.connect(panner);
      servoGain.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      oscGain.connect(this.sfxGain);
      servoGain.connect(this.sfxGain);
    }

    osc.start(t);
    osc.stop(t + 0.15);
    servoOsc.start(t);
    servoOsc.stop(t + 0.1);
  }

  // =========================================================================
  // 2. DOOR OPEN & CLOSE SOUNDS (Futuristic Pneumatic Whoosh & Latch)
  // =========================================================================
  playDoorOpen(position) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(position, 3.0, 45.0);

    // 2A. Pneumatic Air Release Hiss (Filtered noise opening up)
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(350, t);
      filter.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
      filter.Q.setValueAtTime(2.2, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.38, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(panner);

      noise.start(t);
      noise.stop(t + 0.75);
    }

    // 2B. Precision Electric Servo Whine
    const servo = this.ctx.createOscillator();
    const servoGain = this.ctx.createGain();

    servo.type = "sine";
    servo.frequency.setValueAtTime(280, t);
    servo.frequency.exponentialRampToValueAtTime(540, t + 0.55);

    servoGain.gain.setValueAtTime(0.12, t);
    servoGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    servo.connect(servoGain);
    servoGain.connect(panner);

    panner.connect(this.sfxGain);

    servo.start(t);
    servo.stop(t + 0.65);
  }

  playDoorClose(position) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(position, 3.0, 45.0);

    // 2A. Pneumatic Compression Hiss (Filtered noise closing down)
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.exponentialRampToValueAtTime(280, t + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(panner);

      noise.start(t);
      noise.stop(t + 0.55);
    }

    // 2B. Solid Heavy Magnetic Lock Click at t + 0.38s
    const clickTime = t + 0.38;
    const latchOsc = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();

    latchOsc.type = "triangle";
    latchOsc.frequency.setValueAtTime(160, clickTime);
    latchOsc.frequency.exponentialRampToValueAtTime(45, clickTime + 0.12);

    latchGain.gain.setValueAtTime(0.42, clickTime);
    latchGain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.15);

    latchOsc.connect(latchGain);
    latchGain.connect(panner);

    panner.connect(this.sfxGain);

    latchOsc.start(clickTime);
    latchOsc.stop(clickTime + 0.16);
  }

  // =========================================================================
  // 3. VEHICLE HORN AUDIO (Dual-Tone Automotive & Air Horn)
  // =========================================================================
  playVehicleHorn(position, isBus = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const panner = this._createPanner(position, 8.0, 120.0);

    // Authentic automotive dual-tone frequencies:
    // Car: F#4 (370Hz) + A4 (440Hz)
    // Bus: Heavy dual air horn: F#3 (185Hz) + A3 (220Hz)
    const freq1 = isBus ? 185 : 370;
    const freq2 = isBus ? 220 : 440;
    const hornDuration = isBus ? 0.65 : 0.42;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const hornGain = this.ctx.createGain();

    osc1.type = isBus ? "sawtooth" : "triangle";
    osc2.type = isBus ? "sawtooth" : "triangle";

    osc1.frequency.setValueAtTime(freq1, t);
    osc2.frequency.setValueAtTime(freq2, t);

    // Slight vibrato on the horn for rich authentic resonance
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(6.0, t); // 6 Hz vibrato
    lfoGain.gain.setValueAtTime(4.0, t);
    lfo.connect(osc1.frequency);
    lfo.connect(osc2.frequency);

    // Envelope
    hornGain.gain.setValueAtTime(0.01, t);
    hornGain.gain.linearRampToValueAtTime(isBus ? 0.35 : 0.28, t + 0.04);
    hornGain.gain.setValueAtTime(isBus ? 0.35 : 0.28, t + hornDuration - 0.08);
    hornGain.gain.exponentialRampToValueAtTime(0.001, t + hornDuration);

    osc1.connect(hornGain);
    osc2.connect(hornGain);
    hornGain.connect(panner);
    panner.connect(this.sfxGain);

    lfo.start(t);
    osc1.start(t);
    osc2.start(t);

    lfo.stop(t + hornDuration);
    osc1.stop(t + hornDuration);
    osc2.stop(t + hornDuration);
  }

  // =========================================================================
  // 4. VEHICLE ENGINES & AMBIENT TRAFFIC SOUNDS
  // =========================================================================
  // Updates continuous 3D spatial engine sounds for active vehicles
// Only tracks the closest 4 vehicles within hearing range to minimize CPU usage
  updateVehiclesAudio(activeVehicles, playerPos) {
    if (!this.ctx || !activeVehicles || !playerPos) return;

    const t = this.ctx.currentTime;
    const MAX_AUDIBLE_DIST_SQ = 65.0 * 65.0; // 65 meters

    // Rank vehicles by proximity to player
    const candidates = [];
    activeVehicles.forEach((v) => {
      if (!v.visible) return;
      const dx = v.position.x - playerPos.x;
      const dz = v.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < MAX_AUDIBLE_DIST_SQ) {
        candidates.push({ v, distSq });
      }
    });

    candidates.sort((a, b) => a.distSq - b.distSq);
    const activeCandidates = candidates.slice(0, 4); // Top 4 closest
    const activeSet = new Set(activeCandidates.map((c) => c.v));

    // Cleanup nodes of vehicles that left the audible radius
    for (const [v, nodes] of this.vehicleAudioNodes.entries()) {
      if (!activeSet.has(v)) {
        try {
          nodes.gain.gain.linearRampToValueAtTime(0.001, t + 0.3);
          setTimeout(() => {
            try {
              nodes.osc.stop();
              nodes.osc.disconnect();
              nodes.gain.disconnect();
              nodes.panner.disconnect();
            } catch {
              // ignore cleanup error
            }
          }, 350);
        } catch {
              // ignore cleanup error
            }
        this.vehicleAudioNodes.delete(v);
      }
    }

    // Update or spawn sound nodes for active audible vehicles
    activeCandidates.forEach(({ v }) => {
      let nodes = this.vehicleAudioNodes.get(v);
      const isBus = v.userData.type === "bus";
      const speed = v.userData.currentSpeed;
      const speedRatio = THREE.MathUtils.clamp(speed / 10.5, 0.0, 1.0);

      if (!nodes) {
        // Spawn engine audio node pipeline: Oscillator -> Lowpass Filter -> Gain -> 3D Panner
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        const panner = this._createPanner(v.position, 6.0, 65.0);

        osc.type = isBus ? "sawtooth" : "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(isBus ? 180 : 260, t);

        gain.gain.setValueAtTime(0.01, t);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.vehicleGain);

        osc.start(t);

        nodes = { osc, filter, gain, panner, nextHornTime: t + 5.0 + Math.random() * 15.0 };
        this.vehicleAudioNodes.set(v, nodes);
      }

      // Update 3D spatial position
      if (nodes.panner.positionX) {
        nodes.panner.positionX.setValueAtTime(v.position.x, t);
        nodes.panner.positionY.setValueAtTime(v.position.y, t);
        nodes.panner.positionZ.setValueAtTime(v.position.z, t);
      } else {
        nodes.panner.setPosition(v.position.x, v.position.y, v.position.z);
      }

      // RPM Pitch modulation:
      // Bus idle: 45Hz, at cruise: 95Hz
      // Car idle: 65Hz, at cruise: 145Hz
      const minFreq = isBus ? 45 : 65;
      const maxFreq = isBus ? 95 : 145;
      const targetFreq = THREE.MathUtils.lerp(minFreq, maxFreq, speedRatio);
      nodes.osc.frequency.setTargetAtTime(targetFreq, t, 0.12);

      // Filter cutoff opens up as vehicle accelerates
      const minCutoff = isBus ? 140 : 180;
      const maxCutoff = isBus ? 320 : 480;
      const targetCutoff = THREE.MathUtils.lerp(minCutoff, maxCutoff, speedRatio);
      nodes.filter.frequency.setTargetAtTime(targetCutoff, t, 0.12);

      // Volume modulation: quieter at idle (0.08), prominent while moving (0.22)
      const targetVol = THREE.MathUtils.lerp(0.06, isBus ? 0.24 : 0.18, speedRatio);
      nodes.gain.gain.setTargetAtTime(targetVol, t, 0.15);

      // Occasional gentle horn honk in traffic or when waiting
      if (t > nodes.nextHornTime) {
        // Honk if stopped or casually in traffic
        if (Math.random() < 0.4) {
          this.playVehicleHorn(v.position, isBus);
        }
        nodes.nextHornTime = t + 12.0 + Math.random() * 20.0;
      }
    });
  }
}

// Global Singleton Instance
export const soundSystem = new SoundSystem();
