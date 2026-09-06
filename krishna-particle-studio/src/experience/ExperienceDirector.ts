import type { Engine } from '../core/Engine';
import type { ParticleField } from '../particles/ParticleField';
import type { SceneComposer } from '../rendering/SceneComposer';
import { listKrishnaImages } from '../images/imageLibrary';
import { loadParticleDataset } from '../images/datasetLoader';
import type { KrishnaImageAsset, ParticleDataset } from '../images/types';
import { DivineArtDirector, type DirectorMemory } from './DivineArtDirector';
import { createExperienceSeed } from './seed';
import type { CreationRecipe, DeviceTier } from './types';
import { computeFraming } from '../rendering/Framing';
import { ArtworkPlane } from '../rendering/ArtworkPlane';

type Act = 'prepare' | 'form' | 'hold' | 'dissolve';

function deviceTier(): DeviceTier {
  const touch = navigator.maxTouchPoints > 0 && window.innerWidth < 900;
  return touch || window.innerWidth < 720 ? 'mobile' : 'desktop';
}

/**
 * ExperienceDirector:
 * Controls the synchronized runtime timeline:
 * 1. Particle Assembly: 140,000 particles fly in and assemble (Photo 0% HIDDEN, Particles 100% VISIBLE).
 * 2. Precision Transition: As particles settle (progress 0.75->1.0), photo cross-fades (0->100%) & particles fade out (100->0%).
 * 3. Official Photo Hold: 100% Crystal-Clear Official Photograph (Photo 100%, Particles 0% FULLY HIDDEN).
 * 4. Dissolve: Photo fades out (100->0%) & particles fade back in (0->100%) as they disintegrate into space.
 */
export class ExperienceDirector {
  private engine: Engine;
  private field: ParticleField;
  private composer: SceneComposer;
  private artworkPlane: ArtworkPlane;
  private images: KrishnaImageAsset[];
  private director = new DivineArtDirector();
  private memory: DirectorMemory = {};
  private cache = new Map<string, ParticleDataset>();
  private recipe: CreationRecipe | null = null;
  private act: Act = 'prepare';
  private actTime = 0;
  private gen = 0;
  private busy = false;
  private fpsEma = 60;
  private holdFpsLow = 0;
  private isPrecaching = false;
  private removeTick: () => void;
  private onKey: (e: KeyboardEvent) => void;
  private cleanupListeners: () => void;

  constructor(engine: Engine, field: ParticleField, composer: SceneComposer) {
    this.engine = engine;
    this.field = field;
    this.composer = composer;
    this.images = listKrishnaImages();

    this.artworkPlane = new ArtworkPlane();
    this.engine.scene.add(this.artworkPlane.mesh);

    this.removeTick = engine.addUpdatable((delta) => this.tick(delta));
    engine.events.on('stats', (stats) => this.adaptQuality(stats.fps));
    engine.events.on('resize', () => this.fitArtwork());

    // ── Keyboard shortcut to manually trigger next creation (desktop) ──────────
    this.onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        this.requestNewCreation(true);
      }
    };

    let wheelTimer: number | null = null;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 30) {
        if (wheelTimer !== null) return;
        wheelTimer = window.setTimeout(() => { wheelTimer = null; }, 600);
        this.requestNewCreation(true);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', this.onKey);

    this.cleanupListeners = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', this.onKey);
    };
  }

  async start(): Promise<void> {
    this.field.setPlaying(true);
    await this.beginCreation(createExperienceSeed());
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async beginCreation(seed: number): Promise<void> {
    const gen = ++this.gen;
    this.busy = true;
    this.act = 'prepare';
    this.actTime = 0;
    this.field.setDissolveAmount(0);
    this.artworkPlane.setOpacity(0);
    this.artworkPlane.setUnveilProgress(0);
    this.artworkPlane.setGlow(0);
    this.field.setConfig({ opacity: 1.0 });

    if (!this.images.length) {
      this.busy = false;
      return;
    }

    // ── Compose recipe ─────────────────────────────────────────────────────────
    let recipe = this.director.compose(seed, {
      images: this.images,
      memory: this.memory,
      tier: deviceTier(),
    });

    const asset = this.images.find((img) => img.id === recipe.imageId) ?? this.images[0];
    
    // Concurrently load particle dataset AND official source image texture
    const [dataset] = await Promise.all([
      this.loadDataset(asset),
      this.artworkPlane.setImage(asset.src, 0.72),
    ]);

    if (gen !== this.gen) return; // superseded by a newer creation

    // Update texture plane with exact dataset aspect ratio
    await this.artworkPlane.setImage(asset.src, dataset.header.aspect);

    this.recipe = recipe;
    this.memory.lastImageId  = recipe.imageId;
    this.memory.lastSpawn    = recipe.spawnStyle;
    this.memory.lastDissolve = recipe.dissolveStyle;

    const isMobile = deviceTier() === 'mobile';
    const glowScale = isMobile ? 0.5 : 1.0;
    const isFirstRun = gen === 1;

    // For continuous loop transitions (gen > 1): skip float phase entirely so particles
    // spring directly from their current dissolved positions to the new image targets
    if (!isFirstRun) {
      recipe.timings.float   = 0;                        // No scatter/float phase — jump straight to attract
      recipe.timings.attract = isMobile ? 2.0 : 2.5;    // Faster re-form on mobile for snappiness
    }

    this.field.setSeeds(recipe.spawnSeed, recipe.targetSeed);
    this.field.setSpawnStyle(recipe.spawnStyle);
    this.field.setDissolveStyle(recipe.dissolveStyle);
    this.field.setTimings(recipe.timings);
    this.field.setConfig({
      count:              dataset.header.count,
      size:               recipe.size,
      sizeRandomness:     recipe.sizeRandomness,
      brightness:         recipe.brightness,
      glow:               recipe.glow * glowScale,
      opacity:            1.0,
      twinkle:            recipe.twinkle,
      floatSpeed:         recipe.floatSpeed,
      turbulence:         recipe.turbulence,
      noise:              recipe.noise,
      attractionStrength: recipe.attractionStrength,
      springStrength:     recipe.springStrength,
      damping:            recipe.damping,
      targetSpread:       recipe.targetSpread,
      formationSpeed:     recipe.formationSpeed,
      delayScale:         recipe.delayScale,
      colorWarmth:        recipe.colorWarmth,
      colorMode:          'image',
    });

    // Apply preprocessed binary dataset
    // First run: scatter particles to spawn positions, then attract in
    // Subsequent runs: continuous morph — preserve current positions/velocities for seamless loop
    if (isFirstRun) {
      this.field.applyDataset(dataset, true, isMobile);
    } else {
      this.field.applyDatasetContinuous(dataset);
    }
    this.field.setRevealTarget(dataset.header.count);
    this.field.setPlaying(true);

    // ── Scene atmosphere & composition framing ────────────────────────────────
    this.composer.setRecipe(recipe);
    this.fitArtwork();

    this.act = 'form';
    this.actTime = 0;
    this.busy = false;

    // Developer inspection object (hidden)
    (window as unknown as { __creation: unknown }).__creation = {
      seed:     recipe.seedLabel,
      image:    recipe.imageId,
      spawn:    recipe.spawnStyle,
      dissolve: recipe.dissolveStyle,
      count:    dataset.header.count,
      aspect:   dataset.header.aspect,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async loadDataset(asset: KrishnaImageAsset): Promise<ParticleDataset> {
    const hit = this.cache.get(asset.id);
    if (hit) return hit;
    const dataset = await loadParticleDataset(asset.id, asset.binSrc);
    this.cache.set(asset.id, dataset);
    return dataset;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private tick(delta: number): void {
    this.artworkPlane.update(delta);
    if (!this.recipe || this.busy) return;
    this.actTime += delta;
    const recipe = this.recipe;

    const tCurrent = this.field.getFormationTime();
    const tDuration = this.field.getFormationDuration();

    let imageOpacity = 0.0;
    let particleOpacity = 1.0;
    let assemblyGlow = 0.0;
    let artworkGlow = 0.0;
    let unveilProgress = 0.0;

    if (this.act === 'form') {
      const progress = Math.min(1.0, Math.max(0.0, tCurrent / Math.max(0.1, tDuration)));

      // STAGE 1: Particles fly in & assemble (Photo HIDDEN 0.0, Particles VISIBLE 1.0)
      if (progress < 0.75) {
        imageOpacity = 0.0;
        particleOpacity = 1.0;
        // Glow builds dynamically as particles stream in and come close together
        assemblyGlow = 0.4 + 0.8 * Math.sin((progress / 0.75) * (Math.PI / 2));
        artworkGlow = 0.0;
        unveilProgress = 0.0;
      } else {
        // STAGE 2: Exact Settle & Cross-Fade (progress 0.75 -> 1.00)
        const u = (progress - 0.75) / 0.25;
        const smoothU = Math.min(1.0, Math.max(0.0, u * u * (3.0 - 2.0 * u)));
        imageOpacity = 1.0;                   // Enable image material for progressive unhiding
        particleOpacity = 1.0 - smoothU;      // Particles fade 1.0 -> 0.0
        assemblyGlow = 1.2 * (1.0 - smoothU); // Glow gently dims down as photo unhides!
        unveilProgress = smoothU;             // Progressive dim-to-glow wave sweeps 0.0 -> 1.0!
        artworkGlow = Math.sin(smoothU * Math.PI) * 1.0;
      }

      if (tCurrent >= tDuration) {
        this.act = 'hold';
        this.actTime = 0;
      }
    } else if (this.act === 'hold') {
      // STAGE 3: 100% Crystal-Clear Official Photographic Krishna Artwork (Photo 1.0, Particles 0.0 FULLY HIDDEN)
      imageOpacity = 1.0;
      particleOpacity = 0.0;
      assemblyGlow = 0.0;
      unveilProgress = 1.0;
      // Gentle decay of lingering unhiding bloom wave into crystal-clear hold
      artworkGlow = Math.max(0.0, 1.0 - this.actTime / 1.6) * 0.45;

      // Background pre-cache remaining datasets sequentially (one by one) to prevent network congestion on Vercel
      if (this.actTime > 0.5 && !this.isPrecaching && this.cache.size < this.images.length) {
        const nextAsset = this.images.find((asset) => !this.cache.has(asset.id));
        if (nextAsset) {
          this.isPrecaching = true;
          this.loadDataset(nextAsset).finally(() => {
            this.isPrecaching = false;
          });
        }
      }

      if (this.actTime >= recipe.timings.hold) {
        this.act = 'dissolve';
        this.actTime = 0;
      }
    } else if (this.act === 'dissolve') {
      // STAGE 4: Disintegration & Dissolve Explosion
      const dissolveVal = Math.min(1.0, Math.max(0.0, this.actTime / recipe.timings.dissolve));
      this.field.setDissolveAmount(dissolveVal);

      if (dissolveVal < 0.35) {
        const u = dissolveVal / 0.35;
        const smoothU = u * u * (3.0 - 2.0 * u);
        imageOpacity = 1.0;
        particleOpacity = smoothU;             // Particles fade back in 0.0 -> 1.0
        assemblyGlow = smoothU * 1.0;          // Glow re-ignites on dissolve!
        unveilProgress = 1.0 - smoothU;        // Smoothly dims back out 1.0 -> 0.0!
        artworkGlow = (1.0 - smoothU) * 0.8;
      } else {
        imageOpacity = 0.0;
        particleOpacity = 1.0;                 // Particles fully bright as they explode/scatter into space
        assemblyGlow = 1.0;
        artworkGlow = 0.0;
        unveilProgress = 0.0;
      }

      if (dissolveVal >= 1.0) {
        void this.beginCreation(createExperienceSeed());
      }
    }

    const isMobile = deviceTier() === 'mobile';
    const glowScale = isMobile ? 0.5 : 1.0;

    this.artworkPlane.setOpacity(imageOpacity);
    this.artworkPlane.setGlow(artworkGlow * glowScale);
    this.artworkPlane.setUnveilProgress(unveilProgress);
    this.field.setConfig({ opacity: particleOpacity });
    this.field.setAssemblyGlow(assemblyGlow * glowScale);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  /** Click, Tap, or Swipe: dissolve creation and start a new one when creation is in hold state. */
  public requestNewCreation(force = false): void {
    if (this.busy) return;
    if (!force && (this.act === 'prepare' || this.act === 'form' || this.act === 'dissolve')) return;
    this.busy = true;
    const gen = this.gen;
    this.act = 'dissolve';
    this.actTime = 0;

    const quickDuration = 1.6;
    const started = performance.now();

    const step = (now: number) => {
      if (this.gen !== gen) return;
      const u = Math.min(1, (now - started) / (quickDuration * 1000));
      this.field.setDissolveAmount(u);
      
      const photoFade = Math.max(0, 1.0 - u * 2.5);
      const particleFade = Math.min(1.0, u * 2.5);
      
      this.artworkPlane.setOpacity(photoFade);
      this.field.setConfig({ opacity: particleFade });

      if (u < 1) {
        requestAnimationFrame(step);
      } else {
        void this.beginCreation(createExperienceSeed());
      }
    };
    requestAnimationFrame(step);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private adaptQuality(fps: number): void {
    this.fpsEma = this.fpsEma * 0.85 + fps * 0.15;
    if (this.act !== 'form' && this.act !== 'hold') return;

    if (this.fpsEma < 45) this.holdFpsLow += 1;
    else this.holdFpsLow = 0;

    if (this.holdFpsLow > 8 && this.recipe) {
      this.holdFpsLow = 0;
      const currentCount = this.field.getConfig().count;
      const reduced = Math.max(30000, Math.round(currentCount * 0.75));
      this.field.setConfig({ count: reduced });
      this.field.setRevealTarget(reduced);
    }
  }

  setVisible(visible: boolean): void {
    this.artworkPlane.mesh.visible = visible;
  }

  private fitArtwork(): void {
    const dataset = this.field.getDataset();
    const aspect = dataset?.header.aspect ?? 0.72;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const camera = this.engine.camera;

    const framing = computeFraming(aspect, width, height, camera.fov, camera.position.z);
    this.field.points.scale.setScalar(framing.scale);
    this.artworkPlane.setScale(framing.scale);
  }

  dispose(): void {
    this.removeTick();
    this.cleanupListeners();
    this.artworkPlane.dispose();
  }
}
