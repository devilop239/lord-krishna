import * as THREE from 'three';
import { EventEmitter } from '../utils/EventEmitter';
import type { EngineStats } from '../types/particles';

interface EngineEvents {
  tick: { delta: number; elapsed: number };
  stats: EngineStats;
  resize: { width: number; height: number };
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Clamp the effective device pixel ratio to avoid overdraw on hi-DPI displays. */
  maxPixelRatio?: number;
  backgroundColor?: number;
}

/**
 * Owns the WebGL2 renderer, scene and camera, and drives the
 * animation loop. Rendering concerns live here; particle/UI
 * logic subscribes via events or is registered as an "updatable".
 */
export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly events = new EventEmitter<EngineEvents>();

  private canvas: HTMLCanvasElement;
  private clock = new THREE.Clock();
  private rafId: number | null = null;
  private running = false;
  private maxPixelRatio: number;

  private resizeObserver: ResizeObserver;
  private updatables = new Set<(delta: number, elapsed: number) => void>();

  // FPS monitoring (rolling window, sampled every ~250ms)
  private frameCount = 0;
  private fpsAccum = 0;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.maxPixelRatio = options.maxPixelRatio ?? 2;

    this.scene = new THREE.Scene();
    if (options.backgroundColor !== undefined) {
      this.scene.background = new THREE.Color(options.backgroundColor);
    }

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(0, 0, 40);

    let context: WebGL2RenderingContext | null = null;
    try {
      context = this.canvas.getContext('webgl2', { antialias: true, alpha: true }) as WebGL2RenderingContext | null;
    } catch {
      context = null;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      context: context ?? undefined,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',  // 4K QUALITY: High precision rendering
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 4K QUALITY: Enable features for sharper rendering
    this.renderer.sortObjects = true;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);

    this.handleResize();
  }

  /** Register a per-frame callback (e.g. a particle system's update()). */
  addUpdatable(fn: (delta: number, elapsed: number) => void): () => void {
    this.updatables.add(fn);
    return () => this.updatables.delete(fn);
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    // FIXED: Better pixel ratio for sharper rendering
    const pixelRatio = Math.min(this.maxPixelRatio, window.devicePixelRatio || 1);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.events.emit('resize', { width, height });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  pause(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    this.updatables.forEach((fn) => fn(delta, elapsed));
    this.events.emit('tick', { delta, elapsed });

    this.renderer.render(this.scene, this.camera);

    this.sampleFps(delta);
  };

  private sampleFps(delta: number): void {
    this.frameCount += 1;
    this.fpsAccum += delta;
    if (this.fpsAccum >= 0.25) {
      const fps = this.frameCount / this.fpsAccum;
      this.events.emit('stats', {
        fps: Math.round(fps),
        frameMs: Math.round((this.fpsAccum / this.frameCount) * 1000 * 100) / 100,
      });
      this.frameCount = 0;
      this.fpsAccum = 0;
    }
  }

  /** Full teardown: stops the loop, disposes GPU resources, detaches observers. */
  dispose(): void {
    this.pause();
    this.resizeObserver.disconnect();
    this.events.dispose();

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh | THREE.Points;
      const geometry = (mesh as THREE.Points).geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose();

      const material = (mesh as THREE.Points).material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material?.dispose();
      }
    });

    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
