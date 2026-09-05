import type { ParticleDataset, ParticleDatasetHeader } from './types';

const MAGIC_KPRT = 0x5452504b; // "KPRT" in Little Endian

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(`[Dataset Validation Error] ${message}`);
    this.name = 'DatasetValidationError';
  }
}

/**
 * Parses binary buffer (.bin) produced by Python offline preprocessing pipeline.
 */
export function parseBinaryParticleDataset(assetId: string, buffer: ArrayBuffer): ParticleDataset {
  if (buffer.byteLength < 64) {
    throw new DatasetValidationError(`File size too small (${buffer.byteLength} bytes). Corrupted binary header.`);
  }

  const dataView = new DataView(buffer);
  
  // Read Magic "KPRT"
  const magicNum = dataView.getUint32(0, true);
  if (magicNum !== MAGIC_KPRT) {
    throw new DatasetValidationError(`Invalid binary magic. Expected 'KPRT', got ${magicNum.toString(16)}.`);
  }

  const version = dataView.getUint32(4, true);
  const count = dataView.getUint32(8, true);
  const width = dataView.getUint32(12, true);
  const height = dataView.getUint32(16, true);
  const aspect = dataView.getFloat32(20, true);
  const minX = dataView.getFloat32(24, true);
  const maxX = dataView.getFloat32(28, true);
  const minY = dataView.getFloat32(32, true);
  const maxY = dataView.getFloat32(36, true);
  const minZ = dataView.getFloat32(40, true);
  const maxZ = dataView.getFloat32(44, true);
  const coverageScore = dataView.getFloat32(48, true);

  const header: ParticleDatasetHeader = {
    magic: 'KPRT',
    version,
    count,
    width,
    height,
    aspect,
    minX, maxX,
    minY, maxY,
    minZ, maxZ,
    coverageScore,
  };

  // VALIDATION CHECKS
  if (count <= 0) {
    throw new DatasetValidationError(`Invalid particle count: ${count}`);
  }

  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  if (boundsWidth <= 0 || boundsHeight <= 0) {
    throw new DatasetValidationError(`Invalid spatial bounds: width=${boundsWidth}, height=${boundsHeight}`);
  }

  const targetAspect = boundsWidth / boundsHeight;
  const aspectErr = Math.abs(targetAspect - aspect) / aspect;
  if (aspectErr > 0.20) {
    console.warn(`[Dataset Warning] Asset '${assetId}' target bounds aspect (${targetAspect.toFixed(3)}) deviates from source aspect (${aspect.toFixed(3)}).`);
  }

  const floatsPerParticle = 3 + 3 + 1 + 1 + 1 + 1 + 3 + 2 + 1; // 16 floats = 64 bytes per particle
  const expectedPayloadBytes = count * floatsPerParticle * 4;
  const actualPayloadBytes = buffer.byteLength - 64;

  if (actualPayloadBytes < expectedPayloadBytes) {
    throw new DatasetValidationError(`Binary payload truncated! Expected ${expectedPayloadBytes} bytes, found ${actualPayloadBytes} bytes.`);
  }

  // De-interleave payload arrays into typed Float32Arrays
  const payloadFloatArray = new Float32Array(buffer, 64, count * floatsPerParticle);

  const target = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const importance = new Float32Array(count);
  const luminance = new Float32Array(count);
  const edge = new Float32Array(count);
  const scatter = new Float32Array(count * 3);
  const delays = new Float32Array(count * 2);
  const seed = new Float32Array(count);

  let offset = 0;
  for (let i = 0; i < count; i++) {
    target[i * 3]     = payloadFloatArray[offset++];
    target[i * 3 + 1] = payloadFloatArray[offset++];
    target[i * 3 + 2] = payloadFloatArray[offset++];

    color[i * 3]     = payloadFloatArray[offset++];
    color[i * 3 + 1] = payloadFloatArray[offset++];
    color[i * 3 + 2] = payloadFloatArray[offset++];

    size[i]       = payloadFloatArray[offset++];
    importance[i] = payloadFloatArray[offset++];
    luminance[i]  = payloadFloatArray[offset++];
    edge[i]       = payloadFloatArray[offset++];

    scatter[i * 3]     = payloadFloatArray[offset++];
    scatter[i * 3 + 1] = payloadFloatArray[offset++];
    scatter[i * 3 + 2] = payloadFloatArray[offset++];

    delays[i * 2]     = payloadFloatArray[offset++];
    delays[i * 2 + 1] = payloadFloatArray[offset++];

    seed[i] = payloadFloatArray[offset++];
  }

  return {
    assetId,
    header,
    target,
    color,
    size,
    importance,
    luminance,
    edge,
    scatter,
    delays,
    seed,
  };
}

/**
 * Fetch preprocessed binary dataset from public/generated/particles/<assetId>.bin
 */
export async function loadParticleDataset(assetId: string, binUrl: string): Promise<ParticleDataset> {
  const response = await fetch(binUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch particle dataset for asset '${assetId}' from '${binUrl}': ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parseBinaryParticleDataset(assetId, arrayBuffer);
}
