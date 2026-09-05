uniform float uTime;
uniform float uPixelRatio;
uniform float uBaseSize;
uniform float uTwinkle;
uniform float uBrightness;
uniform float uWorldPixel;
uniform float uCanvasH;
uniform float uTanHalfFov;
uniform float uAssemblyGlow;

attribute float aSize;
attribute vec3 aColor;
attribute float aBrightness;
attribute float aSeed;
attribute vec3 aTarget;
attribute float aOpacity;
attribute float aImportance;

varying vec3 vColor;
varying float vBrightness;
varying float vShimmer;
varying float vOpacity;
varying float vLum;
varying float vImportance;
varying float vProximityGlow;

void main() {
  vColor = aColor;
  vOpacity = aOpacity;
  vLum = aBrightness;
  vImportance = aImportance;

  // GPU Twinkle & Shimmer
  float twinkleHz = 0.35 + aSeed * 1.1;
  float shimmer = 0.94 + 0.06 * sin(uTime * twinkleHz * 2.0 + aSeed * 6.2831);
  vShimmer = mix(1.0, shimmer, uTwinkle * aBrightness);
  vBrightness = aBrightness * uBrightness;

  // Compute convergence & proximity energy as particles assemble close to each other
  float distToTarget = length(position - aTarget);
  float prox = smoothstep(2.5, 0.05, distToTarget);
  vProximityGlow = prox * uAssemblyGlow;

  // Living Krishna GPU micro-motion
  vec3 p = position;
  float breatheZ = sin(uTime * 0.75 + aSeed * 12.56) * 0.025 * (0.5 + aImportance * 0.5);
  float shimmerX = cos(uTime * 0.55 + aSeed * 9.1) * 0.008;
  float shimmerY = sin(uTime * 0.45 + aSeed * 7.3) * 0.006;
  p.x += shimmerX;
  p.y += shimmerY;
  p.z += breatheZ;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float z = max(-mvPosition.z, 0.15);
  
  // Exact screen-space cell size calculation for seamless solid image reconstruction
  float worldToPixels = uCanvasH / (2.0 * uTanHalfFov * z);
  float cellPixels = max(uWorldPixel, 0.0025) * worldToPixels;
  
  // Proximity glow gently expands size during assembly for rich luminous aura
  float sizeBoost = 1.0 + vProximityGlow * 0.35;
  float pixelSize = cellPixels * uPixelRatio * uBaseSize * aSize * 1.55 * sizeBoost;

  gl_PointSize = clamp(pixelSize, 2.5, 72.0);
  gl_Position = projectionMatrix * mvPosition;
}
