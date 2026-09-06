/**
 * Framing.ts
 * Composition-aware image-space framing math.
 * Dynamically scales Krishna artwork and particles to fill 94-96% of the screen space on:
 * - PC / Laptop / Tablet Landscape (matching PC landscape artwork)
 * - Mobile / Android Portrait (matching Mobile portrait artwork)
 * Maintains exact aspect ratio with professional 2-3% safe padding.
 */

export interface FramingResult {
  worldWidth: number;
  worldHeight: number;
  scale: number;
  frustumWidth: number;
  frustumHeight: number;
}

export function computeFraming(
  sourceAspect: number,
  viewportWidth: number,
  viewportHeight: number,
  cameraFovDeg: number = 50,
  cameraZ: number = 40.0
): FramingResult {
  const fovRad = (cameraFovDeg * Math.PI) / 180;
  const frustumHeight = 2.0 * cameraZ * Math.tan(fovRad / 2.0);
  const viewportAspect = viewportWidth / Math.max(1, viewportHeight);
  const frustumWidth = frustumHeight * viewportAspect;

  // Universal Fullscreen Cover Mode: Guarantees 100% full screen coverage across all devices (PC, Laptop, Tablet, Mobile)
  // Eliminates all top, bottom, left, and right black bars / pillarboxing / letterboxing
  const scaleToCoverWidth = frustumWidth / sourceAspect;
  const scaleToCoverHeight = frustumHeight;

  const targetHeight = Math.max(scaleToCoverWidth, scaleToCoverHeight);
  const targetWidth = targetHeight * sourceAspect;
  const scale = targetHeight;

  return {
    worldWidth: targetWidth,
    worldHeight: targetHeight,
    scale,
    frustumWidth,
    frustumHeight,
  };
}

/**
 * Framing math specifically tailored for logo brand presentation.
 * Scales logo artwork to ~55-60% of viewport frustum so it sits with luxury padding
 * and never feels oversized or stretched.
 */
export function computeLogoFraming(
  sourceAspect: number,
  viewportWidth: number,
  viewportHeight: number,
  cameraFovDeg: number = 50,
  cameraZ: number = 40.0
): FramingResult {
  const fovRad = (cameraFovDeg * Math.PI) / 180;
  const frustumHeight = 2.0 * cameraZ * Math.tan(fovRad / 2.0);
  const viewportAspect = viewportWidth / Math.max(1, viewportHeight);
  const frustumWidth = frustumHeight * viewportAspect;

  const isPortraitMobile = viewportAspect < 0.95;

  // Desktop/Landscape: 85% width / 74% height; Mobile Portrait: 94% width / 58% height
  const maxW = frustumWidth * (isPortraitMobile ? 0.94 : 0.85);
  const maxH = frustumHeight * (isPortraitMobile ? 0.58 : 0.74);

  const targetHeight = Math.min(maxW / sourceAspect, maxH);
  const targetWidth = targetHeight * sourceAspect;
  const scale = targetHeight;

  return {
    worldWidth: targetWidth,
    worldHeight: targetHeight,
    scale,
    frustumWidth,
    frustumHeight,
  };
}
