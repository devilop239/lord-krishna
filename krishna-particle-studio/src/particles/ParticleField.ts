import * as THREE from 'three';
import particleVert from '../shaders/particle.vert.glsl?raw';
import particleFrag from '../shaders/particle.frag.glsl?raw';
import type { ParticleDataset } from '../images/types';
import type { ParticleAttributeBuffers, ParticleFieldConfig } from '../types/particles';
import type { SpawnStyle, DissolveStyle, CreationTimings } from '../experience/types';

export const DEFAULT_CONFIG: ParticleFieldConfig = {
  count: 80000,
  size: 1.0,
  sizeRandomness: 0.55,
  glow: 0.22,
  opacity: 1,
  brightness: 1,
  twinkle: 0.18,
  floatSpeed: 0.28,
  turbulence: 0.18,
  noise: 0.14,
  formationSpeed: 1,
  attractionStrength: 1,
  springStrength: 14,
  damping: 6.5,
  targetSpread: 0,
  delayScale: 1,
  colorWarmth: 0,
  colorMode: 'image',
};

export type PixelPhase =
  | 'float'
  | 'attract'
  | 'form'
  | 'settle'
  | 'breathe';

const DEFAULT_TIMINGS: CreationTimings = {
  float: 3.5,
  attract: 3.0,
  form: 8.0,
  settle: 2.4,
  hold: 12.0,
  dissolve: 5.0,
};

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export class ParticleField {
  readonly points: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  private buffers: ParticleAttributeBuffers;
  private config: ParticleFieldConfig;
  private readonly maxCount: number;

  private dataset: ParticleDataset | null = null;

  // Timeline
  private cycleTime = 0;
  private playing = false;
  private lastPhase: PixelPhase = 'float';

  // Phase boundary cache
  private tAttract = DEFAULT_TIMINGS.float;
  private tForm = DEFAULT_TIMINGS.float + DEFAULT_TIMINGS.attract;
  private tSettle = DEFAULT_TIMINGS.float + DEFAULT_TIMINGS.attract + DEFAULT_TIMINGS.form;
  private tBreathe = DEFAULT_TIMINGS.float + DEFAULT_TIMINGS.attract + DEFAULT_TIMINGS.form + DEFAULT_TIMINGS.settle;

  // Dissolve state (0..1)
  private dissolveAmount = 0;

  // Styles
  private spawnStyle: SpawnStyle = 'cloud';
  private dissolveStyleValue: DissolveStyle = 'float-away';
  getSpawnStyle(): SpawnStyle { return this.spawnStyle; }
  getDissolveStyle(): DissolveStyle { return this.dissolveStyleValue; }

  // Seeds
  private spawnSeed = 9001;
  private targetSeed = 9001;
  getSpawnSeed(): number { return this.spawnSeed; }
  getTargetSeed(): number { return this.targetSeed; }

  private canvasH = 800;

  constructor(config: Partial<ParticleFieldConfig> = {}, maxCount = 200_000) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxCount = Math.max(maxCount, this.config.count);
    this.buffers = this.allocateBuffers(this.maxCount);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.buffers.position, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.buffers.size, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.buffers.color, 3));
    this.geometry.setAttribute('aBrightness', new THREE.BufferAttribute(this.buffers.brightness, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.buffers.seed, 1));
    this.geometry.setAttribute('aTarget', new THREE.BufferAttribute(this.buffers.target, 3));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(this.buffers.opacity, 1));
    this.geometry.setAttribute('aImportance', new THREE.BufferAttribute(this.buffers.importance, 1));
    this.geometry.setDrawRange(0, 0);

    const fov = 50;
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uBaseSize: { value: this.config.size },
        uGlow: { value: this.config.glow },
        uOpacity: { value: this.config.opacity },
        uTwinkle: { value: this.config.twinkle },
        uBrightness: { value: this.config.brightness },
        uWorldPixel: { value: 0.10 },
        uCanvasH: { value: this.canvasH },
        uTanHalfFov: { value: Math.tan((fov * Math.PI) / 360) },
        uAssemblyGlow: { value: 1.0 },
      },
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setAssemblyGlow(glow: number): void {
    (this.material.uniforms.uAssemblyGlow.value as number) = Math.max(0, Math.min(2.5, glow));
  }

  private allocateBuffers(count: number): ParticleAttributeBuffers {
    return {
      position: new Float32Array(count * 3),
      velocity: new Float32Array(count * 3),
      scatterOffset: new Float32Array(count * 3),
      target: new Float32Array(count * 3),
      targetColor: new Float32Array(count * 3),
      size: new Float32Array(count),
      color: new Float32Array(count * 3),
      brightness: new Float32Array(count),
      opacity: new Float32Array(count),
      seed: new Float32Array(count),
      importance: new Float32Array(count),
      delayOut: new Float32Array(count),
      delayIn: new Float32Array(count),
    };
  }

  setPlaying(playing: boolean): void { this.playing = playing; }

  setTimings(timings: CreationTimings): void {
    this.tAttract = timings.float;
    this.tForm = timings.float + timings.attract;
    this.tSettle = timings.float + timings.attract + timings.form;
    this.tBreathe = timings.float + timings.attract + timings.form + timings.settle;
  }

  setSpawnStyle(style: SpawnStyle): void { this.spawnStyle = style; }
  setDissolveStyle(style: DissolveStyle): void { this.dissolveStyleValue = style; }

  setSeeds(spawn: number, target: number): void {
    this.spawnSeed = spawn;
    this.targetSeed = target;
  }

  setDissolveAmount(u: number): void {
    this.dissolveAmount = Math.max(0, Math.min(1, u));
  }

  setRevealTarget(n: number): void {
    const target = Math.min(n, this.maxCount);
    this.geometry.setDrawRange(0, Math.round(target));
  }

  getFormationTime(): number { return this.cycleTime; }
  getFormationDuration(): number { return this.tBreathe; }
  getPhase(): PixelPhase { return this.phaseAt(this.cycleTime); }
  getDataset(): ParticleDataset | null { return this.dataset; }
  getConfig(): Readonly<ParticleFieldConfig> { return this.config; }

  onPhaseChange?: (phase: PixelPhase) => void;

  applyDataset(dataset: ParticleDataset, scatter = true, isMobile = false): void {
    this.dataset = dataset;
    const n = Math.min(this.maxCount, dataset.header.count);
    this.config.count = n;

    // Derived world pixel fragment size from binary dataset header
    const cellWorld = dataset.header.coverageScore > 0 ? dataset.header.coverageScore : (1.0 / Math.sqrt(n));
    (this.material.uniforms.uWorldPixel.value as number) = cellWorld;

    const { target, color, size, importance, luminance, scatter: scatterBuf, delays, seed } = dataset;
    const scatterScale = isMobile ? 0.35 : 1.0;

    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const tx = target[ix];
      const ty = target[ix + 1];
      const tz = target[ix + 2];

      const sx = scatterBuf[ix] * scatterScale;
      const sy = scatterBuf[ix + 1] * scatterScale;
      const sz = scatterBuf[ix + 2] * scatterScale;

      this.buffers.target[ix] = tx;
      this.buffers.target[ix + 1] = ty;
      this.buffers.target[ix + 2] = tz;

      this.buffers.scatterOffset[ix] = sx;
      this.buffers.scatterOffset[ix + 1] = sy;
      this.buffers.scatterOffset[ix + 2] = sz;

      if (scatter) {
        this.buffers.position[ix] = tx + sx;
        this.buffers.position[ix + 1] = ty + sy;
        this.buffers.position[ix + 2] = tz + sz;
      }

      // Only zero velocities on the very first load (scatter=true)
      // For continuous transitions (scatter=false) we preserve momentum
      if (scatter) {
        this.buffers.velocity[ix] = 0;
        this.buffers.velocity[ix + 1] = 0;
        this.buffers.velocity[ix + 2] = 0;
      }

      this.buffers.color[ix] = color[ix];
      this.buffers.color[ix + 1] = color[ix + 1];
      this.buffers.color[ix + 2] = color[ix + 2];
      this.buffers.targetColor[ix] = color[ix];
      this.buffers.targetColor[ix + 1] = color[ix + 1];
      this.buffers.targetColor[ix + 2] = color[ix + 2];

      this.buffers.size[i] = size[i];
      this.buffers.brightness[i] = 0.75 + luminance[i] * 0.35;
      this.buffers.opacity[i] = 1.0;
      this.buffers.seed[i] = seed[i];
      this.buffers.importance[i] = importance[i];
      this.buffers.delayOut[i] = delays[i * 2];
      this.buffers.delayIn[i] = delays[i * 2 + 1];
    }

    this.geometry.setDrawRange(0, n);
    this.markAllAttrs();

    this.cycleTime = 0;
    this.lastPhase = 'float';
    this.dissolveAmount = 0;

    if (scatter) {
      this.snapToScattered();
    }
  }

  /**
   * Continuous transition variant of applyDataset — used for loop iterations (gen > 1).
   *
   * Key differences from applyDataset():
   * - Current particle POSITIONS are preserved (no teleport/snap)
   * - Current particle VELOCITIES are preserved (momentum carries through from dissolve)
   * - scatterOffset is zeroed so the spring target is exactly the new pixel target
   * - cycleTime is reset with float phase collapsed to 0 so attraction starts immediately
   *
   * Result: particles spring smoothly from their current dissolved positions directly into
   * the new image form — no visible break or restart between animation cycles.
   */
  applyDatasetContinuous(dataset: ParticleDataset): void {
    this.dataset = dataset;
    const n = Math.min(this.maxCount, dataset.header.count);
    this.config.count = n;

    const cellWorld = dataset.header.coverageScore > 0
      ? dataset.header.coverageScore
      : (1.0 / Math.sqrt(n));
    (this.material.uniforms.uWorldPixel.value as number) = cellWorld;

    const { target, color, size, importance, luminance, delays, seed } = dataset;

    for (let i = 0; i < n; i++) {
      const ix = i * 3;

      // New pixel targets
      this.buffers.target[ix]     = target[ix];
      this.buffers.target[ix + 1] = target[ix + 1];
      this.buffers.target[ix + 2] = target[ix + 2];

      // Zero scatter offsets: scatterMix=0 → particle goes exactly to target
      // This makes the spring pull particles from their CURRENT dissolved positions
      // directly to the new image pixels, with no intermediate scatter snap
      this.buffers.scatterOffset[ix]     = 0;
      this.buffers.scatterOffset[ix + 1] = 0;
      this.buffers.scatterOffset[ix + 2] = 0;

      // ── PRESERVE current positions and velocities ──────────────────────────
      // Do NOT touch this.buffers.position or this.buffers.velocity
      // The spring physics will naturally pull them toward the new targets

      // Morph colors toward new image
      this.buffers.targetColor[ix]     = color[ix];
      this.buffers.targetColor[ix + 1] = color[ix + 1];
      this.buffers.targetColor[ix + 2] = color[ix + 2];
      // Note: this.buffers.color is the current displayed color; it will lerp
      // toward targetColor in update() — no hard color snap

      this.buffers.size[i]       = size[i];
      this.buffers.brightness[i] = 0.75 + luminance[i] * 0.35;
      this.buffers.opacity[i]    = 1.0;
      this.buffers.seed[i]       = seed[i];
      this.buffers.importance[i] = importance[i];
      this.buffers.delayOut[i]   = delays[i * 2];
      this.buffers.delayIn[i]    = delays[i * 2 + 1];
    }

    this.geometry.setDrawRange(0, n);
    this.markAllAttrs();

    // Reset timeline — float phase will be 0 (set via setTimings before this call)
    // so scatterMix immediately enters the attract computation from the start
    this.cycleTime = 0;
    this.lastPhase = 'float';
    this.dissolveAmount = 0;
    // No snapToScattered() — positions stay exactly where they are
  }

  replay(): void {
    this.cycleTime = 0;
    this.lastPhase = 'float';
    this.dissolveAmount = 0;
    this.playing = true;
    this.snapToScattered();
  }

  setConfig(partial: Partial<ParticleFieldConfig>): void {
    this.config = { ...this.config, ...partial };
    if (partial.size !== undefined) (this.material.uniforms.uBaseSize.value as number) = partial.size;
    if (partial.glow !== undefined) (this.material.uniforms.uGlow.value as number) = partial.glow;
    if (partial.opacity !== undefined) (this.material.uniforms.uOpacity.value as number) = partial.opacity;
    if (partial.twinkle !== undefined) (this.material.uniforms.uTwinkle.value as number) = partial.twinkle;
    if (partial.brightness !== undefined) (this.material.uniforms.uBrightness.value as number) = partial.brightness;
  }

  setPixelRatio(ratio: number): void {
    (this.material.uniforms.uPixelRatio.value as number) = ratio;
  }

  setCanvasHeight(height: number): void {
    this.canvasH = height;
    (this.material.uniforms.uCanvasH.value as number) = height;
  }

  private snapToScattered(): void {
    const { position, velocity, scatterOffset, target } = this.buffers;
    const n = this.config.count;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      position[ix] = target[ix] + scatterOffset[ix];
      position[ix + 1] = target[ix + 1] + scatterOffset[ix + 1];
      position[ix + 2] = target[ix + 2] + scatterOffset[ix + 2];
      velocity[ix] = 0;
      velocity[ix + 1] = 0;
      velocity[ix + 2] = 0;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private phaseAt(time: number): PixelPhase {
    if (time < this.tAttract) return 'float';
    if (time < this.tForm) return 'attract';
    if (time < this.tSettle) return 'form';
    if (time < this.tBreathe) return 'settle';
    return 'breathe';
  }

  update(delta: number, elapsed: number): void {
    (this.material.uniforms.uTime.value as number) = elapsed;
    const n = this.config.count;
    if (n <= 0) return;

    if (this.playing) this.cycleTime += delta * this.config.formationSpeed;
    const time = this.cycleTime;
    const phase = this.phaseAt(time);
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.onPhaseChange?.(phase);
    }

    const { position, velocity, target, seed, delayOut, delayIn, scatterOffset } = this.buffers;
    const spring = this.config.springStrength;
    const damp = this.config.damping;
    const turb = this.config.turbulence;
    const dt = Math.min(delta, 0.05);

    const tAttract = this.tAttract;
    const tForm = this.tForm;
    const dissolve = this.dissolveAmount;

    // ALL particles remain active! Zero CPU freezing hack!
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const s = seed[i];
      const dOut = delayOut[i];
      const dIn = delayIn[i];

      let scatterMix: number;

      if (dissolve > 0) {
        const dissolveDelay = dOut * 0.35;
        const dU = smooth01((dissolve - dissolveDelay) / 0.8);
        const normalMix = this.computeScatterMix(time, dOut, dIn, tAttract, tForm);
        scatterMix = Math.max(normalMix, dU);
      } else {
        scatterMix = this.computeScatterMix(time, dOut, dIn, tAttract, tForm);
      }

      // 3D Drift and turbulence - active from the very 1st second on site load/reload
      const driftActive = time < tForm + 1.5 || dissolve > 0.05;
      const floatBase = 0.18; // Instant fluid movement on page load/reload
      const driftAmp = driftActive ? (floatBase + turb * scatterMix * 0.40) : 0;
      const drift = {
        x: Math.sin(elapsed * 0.72 + s * 9.1) * driftAmp,
        y: Math.cos(elapsed * 0.58 + s * 5.2) * driftAmp * 0.85,
        z: Math.sin(elapsed * 0.65 + s * 11.3) * driftAmp * 1.6,
      };

      // Systematic 3D Orbital Vortex Ribbons during float and attraction
      let orbitX = 0;
      let orbitY = 0;
      let orbitZ = 0;

      if (scatterMix > 0.02) {
        const orbitAngle = elapsed * 0.45 + (s * 6.2831);
        const orbitRadius = scatterMix * (1.2 + Math.sin(s * 17.1) * 0.4);
        orbitX = Math.cos(orbitAngle) * orbitRadius;
        orbitY = Math.sin(orbitAngle * 0.85) * orbitRadius * 0.7;
        orbitZ = Math.sin(orbitAngle * 1.3) * orbitRadius * 1.5;
      }

      // Dissolve vector logic
      let dissolveX = 0;
      let dissolveY = 0;
      let dissolveZ = 0;

      if (dissolve > 0) {
        switch (this.dissolveStyleValue) {
          case 'float-away':
            dissolveY = dissolve * 18.0 * (0.5 + s);
            dissolveX = Math.sin(elapsed * 0.8 + s * 6.28) * dissolve * 6.0;
            break;
          case 'darkness':
            dissolveZ = -dissolve * 25.0;
            break;
          case 'rise':
            dissolveY = dissolve * 28.0;
            dissolveX = Math.cos(elapsed + s * 3.14) * dissolve * 4.0;
            break;
          case 'scatter':
            dissolveX = (s - 0.5) * dissolve * 35.0;
            dissolveY = (s - 0.5) * dissolve * 35.0;
            dissolveZ = (s - 0.5) * dissolve * 35.0;
            break;
          case 'cloud':
            dissolveZ = -dissolve * 30.0;
            dissolveX = Math.sin(elapsed * 1.2 + s * 5.0) * dissolve * 12.0;
            dissolveY = Math.cos(elapsed * 1.2 + s * 4.0) * dissolve * 12.0;
            break;
        }
      }

      // Target positions (3D spatial assembly)
      const gx = target[ix] + scatterOffset[ix] * scatterMix + drift.x + orbitX + dissolveX;
      const gy = target[ix + 1] + scatterOffset[ix + 1] * scatterMix + drift.y + orbitY + dissolveY;
      const gz = target[ix + 2] + scatterOffset[ix + 2] * scatterMix + drift.z + orbitZ + dissolveZ;

      // Smooth color morphing as particles fly towards the new image target
      const targetC = this.buffers.targetColor;
      const c = this.buffers.color;
      const cLerp = Math.min(1.0, dt * 2.5);
      c[ix] += (targetC[ix] - c[ix]) * cLerp;
      c[ix + 1] += (targetC[ix + 1] - c[ix + 1]) * cLerp;
      c[ix + 2] += (targetC[ix + 2] - c[ix + 2]) * cLerp;

      // Physics spring simulation
      velocity[ix] += (gx - position[ix]) * spring * dt;
      velocity[ix + 1] += (gy - position[ix + 1]) * spring * dt;
      velocity[ix + 2] += (gz - position[ix + 2]) * spring * dt;

      const dampF = Math.exp(-damp * dt);
      velocity[ix] *= dampF;
      velocity[ix + 1] *= dampF;
      velocity[ix + 2] *= dampF;

      position[ix] += velocity[ix] * dt;
      position[ix + 1] += velocity[ix + 1] * dt;
      position[ix + 2] += velocity[ix + 2] * dt;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }

  private computeScatterMix(
    time: number,
    delayOut: number,
    delayIn: number,
    tAttract: number,
    tForm: number,
  ): number {
    if (time <= 0) return 1;

    if (time < tAttract) {
      return 1;
    }

    if (time < tForm) {
      const attractStart = tAttract + delayOut * 0.4;
      const attractDur = (tForm - tAttract) * 0.85;
      const progress = Math.max(0, (time - attractStart) / attractDur);
      
      const baseMix = 1 - easeOutCubic(progress);
      const oscillation = Math.sin(progress * Math.PI * 1.5) * 0.08 * (1 - progress);
      return Math.max(0, baseMix + oscillation);
    }

    const settleDur = 2.0 + delayIn * 0.4;
    const settled = easeOutCubic(Math.max(0, (time - tForm) / settleDur));
    return (1 - settled) * 0.05;
  }

  private markAllAttrs(): void {
    Object.values(this.geometry.attributes).forEach((attr) => {
      (attr as THREE.BufferAttribute).needsUpdate = true;
    });
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
