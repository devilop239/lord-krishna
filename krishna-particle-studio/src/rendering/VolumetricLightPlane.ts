import * as THREE from 'three';

const vertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uGoldRatio;
  uniform float uPulse;

  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 center = vec2(0.50, 0.52);
    vec2 p = vUv - center;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // Dynamic volumetric light rays radiating outwards
    float rays1 = sin(angle * 12.0 + uTime * 0.45) * 0.5 + 0.5;
    float rays2 = cos(angle * 22.0 - uTime * 0.30) * 0.5 + 0.5;
    float rayPattern = mix(rays1, rays2, 0.5);

    // Subtle noise turbulence
    float n = noise(vec2(angle * 4.0, dist * 3.0 - uTime * 0.2));
    rayPattern = pow(rayPattern * (0.7 + n * 0.6), 1.8);

    // Radial falloff: brightest near center, fading smoothly towards edges
    float falloff = exp(-dist * 3.2) * (1.0 - smoothstep(0.40, 0.85, dist));

    // Divine colors: Deep Krishna Blue & Warm Radiant Gold
    vec3 krishnaBlue = vec3(0.06, 0.18, 0.42);
    vec3 divineGold  = vec3(0.95, 0.72, 0.32);
    vec3 deepPurple  = vec3(0.12, 0.05, 0.22);

    float goldMix = clamp(uGoldRatio + sin(angle * 3.0 + uTime * 0.5) * 0.2, 0.0, 1.0);
    vec3 rayColor = mix(krishnaBlue, divineGold, goldMix);
    rayColor = mix(rayColor, deepPurple, (1.0 - goldMix) * 0.3);

    float pulseFactor = 0.85 + 0.15 * sin(uTime * 1.2 + uPulse * 3.14);
    float alpha = rayPattern * falloff * uIntensity * pulseFactor;

    gl_FragColor = vec4(rayColor * (1.0 + uIntensity * 0.4), alpha * 0.65);
  }
`;

/**
 * VolumetricLightPlane.ts
 * Background spiritual god-rays & volumetric atmosphere behind the RADHE RADHE logo.
 */
export class VolumetricLightPlane {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(16.0, 9.0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uGoldRatio: { value: 0.5 },
        uPulse: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 0, -0.25);
    this.mesh.renderOrder = -1;
  }

  setIntensity(intensity: number): void {
    this.material.uniforms.uIntensity.value = Math.max(0, Math.min(2.5, intensity));
  }

  setGoldRatio(ratio: number): void {
    this.material.uniforms.uGoldRatio.value = Math.max(0, Math.min(1, ratio));
  }

  update(delta: number, elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
