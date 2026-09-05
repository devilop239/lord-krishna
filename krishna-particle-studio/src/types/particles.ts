/**
 * Core type definitions for the particle system.
 */

export type ColorMode = 'image';

export interface ParticleFieldConfig {
  /** Total number of particles to draw. */
  count: number;
  /** Base point size in pixels (before DPR scaling). */
  size: number;
  /** Extra per-particle size variation, 0..1. */
  sizeRandomness: number;
  /** Glow intensity multiplier for the soft-particle shader. */
  glow: number;
  /** Global opacity multiplier, 0..1. */
  opacity: number;
  /** Global brightness multiplier. */
  brightness: number;
  /** Twinkle / shimmer amount, 0..1. */
  twinkle: number;
  /** Speed multiplier for idle float motion. */
  floatSpeed: number;
  /** Strength of turbulence applied during motion. */
  turbulence: number;
  /** Extra trajectory noise while travelling to target. */
  noise: number;
  /** Scales how quickly the formation timeline advances. */
  formationSpeed: number;
  /** Pull toward target (normalized direction). */
  attractionStrength: number;
  /** Hooke spring toward target. */
  springStrength: number;
  /** Velocity damping (higher = settles faster). */
  damping: number;
  /** Extra XY/Z jitter around sampled image targets. */
  targetSpread: number;
  /** Stretches per-particle formation delays (slower recognition). */
  delayScale: number;
  /** Subtle warm shift on image-sampled colors, 0..1. */
  colorWarmth: number;
  colorMode: ColorMode;
}

export interface ParticleAttributeBuffers {
  position: Float32Array;
  velocity: Float32Array;
  scatterOffset: Float32Array;
  target: Float32Array;
  targetColor: Float32Array;
  size: Float32Array;
  color: Float32Array;
  brightness: Float32Array;
  opacity: Float32Array;
  seed: Float32Array;
  importance: Float32Array;
  delayOut: Float32Array;
  delayIn: Float32Array;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
}
