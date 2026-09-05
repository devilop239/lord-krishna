export type ImageOrientation = 'landscape' | 'portrait' | 'square';
export type DeviceTarget = 'mobile' | 'pc';

export interface KrishnaImageAsset {
  id: string;
  file: string;
  src: string;
  binSrc: string;
  metaSrc: string;
  label: string;
  index: number;
  deviceTarget?: DeviceTarget;
  orientation?: ImageOrientation;
}

export interface ParticleDatasetHeader {
  magic: string;
  version: number;
  count: number;
  width: number;
  height: number;
  aspect: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  coverageScore: number;
}

export interface ParticleDataset {
  assetId: string;
  header: ParticleDatasetHeader;
  target: Float32Array;      // N * 3
  color: Float32Array;       // N * 3
  size: Float32Array;        // N * 1
  importance: Float32Array;  // N * 1
  luminance: Float32Array;   // N * 1
  edge: Float32Array;        // N * 1
  scatter: Float32Array;     // N * 3
  delays: Float32Array;      // N * 2 (delayOut, delayIn)
  seed: Float32Array;        // N * 1
}

export interface ParticleDatasetMeta {
  id: string;
  file: string;
  binFile: string;
  deviceTarget?: DeviceTarget;
  particleCount: number;
  width: number;
  height: number;
  aspect: number;
  orientation?: ImageOrientation;
  bounds: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
  coverageScore: number;
}


