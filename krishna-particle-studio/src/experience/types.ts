import type { ColorMode } from '../types/particles';

export type SpawnStyle = 'rise' | 'sides' | 'cloud' | 'spiral' | 'descend' | 'emerge';

export type DissolveStyle = 'float-away' | 'darkness' | 'rise' | 'scatter' | 'cloud';

export interface CreationTimings {
  float: number;
  attract: number;
  form: number;
  settle: number;
  hold: number;
  dissolve: number;
}

export interface CreationRecipe {
  seed: number;
  seedLabel: string;
  imageId: string;
  spawnStyle: SpawnStyle;
  dissolveStyle: DissolveStyle;
  count: number;
  size: number;
  sizeRandomness: number;
  brightness: number;
  glow: number;
  opacity: number;
  twinkle: number;
  floatSpeed: number;
  turbulence: number;
  noise: number;
  attractionStrength: number;
  springStrength: number;
  damping: number;
  targetSpread: number;
  formationSpeed: number;
  delayScale: number;
  colorMode: ColorMode;
  colorWarmth: number;
  timings: CreationTimings;
  cameraZ: number;
  cameraDrift: number;
  parallax: number;
  fogDensity: number;
  spawnSeed: number;
  targetSeed: number;
}

export type DeviceTier = 'mobile' | 'desktop';
