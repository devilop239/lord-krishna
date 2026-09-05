import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { CreationRecipe } from '../experience/types';

/**
 * Manages scene atmosphere: fog, camera drift, and subtle pointer parallax.
 * Receives recipe parameters so each experience has its own camera personality.
 *
 * Phase 3: setRecipe() wires fog density, camera Z, and drift amount
 * from the randomised recipe rather than using fixed constants.
 */
export class SceneComposer {
  private engine: Engine;
  private pointer       = new THREE.Vector2(0, 0);
  private targetPointer = new THREE.Vector2(0, 0);
  private basePosition: THREE.Vector3;
  private elapsed = 0;
  private removeUpdatable: () => void;

  // Recipe-driven parameters (updated per experience)
  private cameraDrift = 0.14;
  private fogDensity  = 0.010;
  private fog: THREE.FogExp2;

  private onPointerMove = (event: PointerEvent) => {
    this.targetPointer.x = (event.clientX / window.innerWidth)  * 2 - 1;
    this.targetPointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };

  constructor(engine: Engine) {
    this.engine = engine;
    this.basePosition = engine.camera.position.clone();

    // Krishna Blue fog - synchronized with background
    this.fog = new THREE.FogExp2(0x0a0f1e, this.fogDensity);
    engine.scene.fog = this.fog;

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.removeUpdatable = engine.addUpdatable((delta) => this.update(delta));
  }

  /**
   * Called by ExperienceDirector after each new recipe is composed.
   * Smoothly transitions fog + camera drift to recipe values so the
   * atmosphere shifts subtly between experiences.
   */
  setRecipe(recipe: CreationRecipe): void {
    this.cameraDrift = recipe.cameraDrift;
    this.fogDensity  = recipe.fogDensity;

    // Update fog immediately; camera Z is set on the engine camera directly
    this.fog.density = this.fogDensity;

    // Gently reposition camera Z to recipe value
    const { camera } = this.engine;
    this.basePosition.z = recipe.cameraZ;
    camera.position.z   = recipe.cameraZ;
    camera.updateProjectionMatrix();
  }

  private update(delta: number): void {
    this.elapsed += delta;
    // Smooth pointer lag for parallax
    this.pointer.lerp(this.targetPointer, Math.min(1, delta * 0.75));

    const { camera } = this.engine;
    const drift = this.cameraDrift;

    // Pointer parallax + very slow ambient drift
    camera.position.x =
      this.basePosition.x +
      this.pointer.x * drift * 2.0 +
      Math.sin(this.elapsed * 0.048) * drift * 0.55;

    camera.position.y =
      this.basePosition.y -
      this.pointer.y * drift * 1.2 +
      Math.cos(this.elapsed * 0.038) * drift * 0.38;

    camera.position.z = this.basePosition.z;
    camera.lookAt(0, 0, 0);
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    this.removeUpdatable();
  }
}
