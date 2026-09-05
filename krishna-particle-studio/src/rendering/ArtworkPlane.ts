import * as THREE from 'three';

const vertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uUnveilProgress;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    if (texColor.a < 0.01 || uOpacity < 0.001 || uUnveilProgress < 0.001) discard;

    // Center-outward radial distance for smooth progressive wave unhiding
    float centerDist = length(vUv - vec2(0.5)) * 1.414;
    
    // Smooth unhiding front (from center outwards) - Starts strictly from 0.0 when uUnveilProgress is low
    float front = clamp((uUnveilProgress - centerDist * 0.45) / 0.55, 0.0, 1.0);
    front = smoothstep(0.0, 1.0, front);

    // Unhiding Glow Wave Crest: peaks dynamically as the unhiding front sweeps through
    float waveFront = exp(-pow((centerDist - uUnveilProgress) * 4.5, 2.0));
    float smoothGlowWave = waveFront * uGlow;

    // Luminous highlight extraction
    float lum = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float highlight = pow(max(0.0, lum - 0.10), 1.5) * smoothGlowWave;
    
    // Divine golden warm bloom tint
    vec3 bloomColor = vec3(1.20, 1.10, 0.90) * (highlight + smoothGlowWave * 0.35);

    // Soft edge vignette glow around image boundaries during unhiding wave
    vec2 uvDist = abs(vUv - vec2(0.5)) * 2.0;
    float edgeGlow = (1.0 - smoothstep(0.65, 1.0, max(uvDist.x, uvDist.y))) * smoothGlowWave * 0.20;

    // Smooth dim -> radiant glow wave -> crisp photograph transition
    vec3 finalColor = mix(texColor.rgb * 0.25, texColor.rgb + bloomColor, front) * (1.0 + smoothGlowWave * 0.28) + vec3(0.06, 0.05, 0.02) * edgeGlow;

    float finalAlpha = texColor.a * uOpacity * front;
    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

/**
 * ArtworkPlane.ts
 * Manages the REAL official Krishna source image texture plane in WebGL.
 * Unhides with a smooth progressive dim-to-glow wave animation.
 */
export class ArtworkPlane {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;
  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, THREE.Texture>();
  private currentSrc: string | null = null;
  private time = 0;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(1.0, 1.0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      uniforms: {
        uTexture: { value: null },
        uOpacity: { value: 0 },
        uGlow: { value: 0 },
        uUnveilProgress: { value: 0 },
        uTime: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // Positioned slightly behind particles
    this.mesh.position.set(0, 0, -0.01);
    this.mesh.renderOrder = 0;
  }

  /**
   * Loads and sets the official source image texture with maximum sharpness settings.
   */
  async setImage(src: string, aspect: number): Promise<void> {
    if (this.currentSrc === src && this.material.uniforms.uTexture.value) {
      this.updateAspect(aspect);
      return;
    }

    let texture = this.textureCache.get(src);
    if (!texture) {
      texture = await new Promise<THREE.Texture>((resolve, reject) => {
        this.textureLoader.load(
          src,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 16;
            resolve(tex);
          },
          undefined,
          (err) => reject(err)
        );
      });
      this.textureCache.set(src, texture);
    }

    texture.rotation = 0;

    this.currentSrc = src;
    this.material.uniforms.uTexture.value = texture;
    this.material.needsUpdate = true;
    this.updateAspect(aspect);
  }

  private updateAspect(aspect: number): void {
    this.geometry.dispose();
    this.geometry = new THREE.PlaneGeometry(aspect, 1.0);
    this.mesh.geometry = this.geometry;
  }

  setOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity));
  }

  setGlow(glow: number): void {
    this.material.uniforms.uGlow.value = Math.max(0, Math.min(2.5, glow));
  }

  setUnveilProgress(progress: number): void {
    this.material.uniforms.uUnveilProgress.value = Math.max(0, Math.min(1, progress));
  }

  update(delta: number): void {
    this.time += delta;
    this.material.uniforms.uTime.value = this.time;
  }

  setScale(scale: number): void {
    this.mesh.scale.setScalar(scale);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.textureCache.forEach((tex) => tex.dispose());
    this.textureCache.clear();
  }
}
