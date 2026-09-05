import type { KrishnaImageAsset } from '../images/types';
import { randRange } from '../utils/random';
import { formatSeedLabel, mixSeed, rngFromSeed } from './seed';
import type { CreationRecipe, DeviceTier, DissolveStyle, SpawnStyle } from './types';

const SPAWNS: SpawnStyle[]       = ['rise', 'sides', 'cloud', 'spiral', 'descend', 'emerge'];
const DISSOLVES: DissolveStyle[] = ['float-away', 'darkness', 'rise', 'scatter', 'cloud'];

function pickAvoiding<T>(rng: () => number, items: T[], avoid?: T): T {
  if (items.length === 1) return items[0];
  const pool = avoid === undefined ? items : items.filter((item) => item !== avoid);
  const list = pool.length ? pool : items;
  return list[Math.floor(rng() * list.length) % list.length];
}

export interface DirectorMemory {
  lastImageId?:   string;
  lastSpawn?:     SpawnStyle;
  lastDissolve?:  DissolveStyle;
  shownImageIds?: string[];
}

export interface ComposeContext {
  images: KrishnaImageAsset[];
  memory: DirectorMemory;
  tier:   DeviceTier;
}

/**
 * DivineArtDirector:
 * Generates deterministic creation recipes for each experience iteration.
 * Manages device-aware orientation selection (Desktop Landscape vs Mobile Portrait),
 * timing budgets, motion personalities, and dissolve styling.
 */
export class DivineArtDirector {
  compose(seed: number, ctx: ComposeContext): CreationRecipe {
    const rng = rngFromSeed(mixSeed(seed, 11));

    // ── Device orientation & asset targeting ─────────────────────────────────
    const isDesktop = ctx.tier === 'desktop';
    const targetDevice = isDesktop ? 'pc' : 'mobile';

    // Prioritize deviceTarget ('pc' for PC/laptops/tablets, 'mobile' for Mobile/Android)
    let matchingImages = ctx.images.filter((img) => img.deviceTarget === targetDevice);
    if (!matchingImages.length) {
      const targetOrientation = isDesktop ? 'landscape' : 'portrait';
      matchingImages = ctx.images.filter((img) => img.orientation === targetOrientation);
    }
    const candidateImages = matchingImages.length > 0 ? matchingImages : ctx.images;

    const candidateIds = candidateImages.map((img) => img.id);
    let history = ctx.memory.shownImageIds || [];
    let pool = candidateIds.filter((id) => !history.includes(id));
    if (pool.length === 0) {
      pool = candidateIds;
      history = [];
    }
    const imageId = pickAvoiding(rng, pool, ctx.memory.lastImageId);
    history.push(imageId);
    ctx.memory.shownImageIds = history;
    const image = candidateImages.find((img) => img.id === imageId) ?? candidateImages[0];

    // ── Style pair: spawn + dissolve ──────────────────────────────────────────
    const spawnStyle    = pickAvoiding(rng, SPAWNS,    ctx.memory.lastSpawn);
    const dissolveStyle = pickAvoiding(rng, DISSOLVES, ctx.memory.lastDissolve);

    // ── Particle count budget ────────────────────────────────────────────────
    const baseCount  = 140000;
    const densityVar = randRange(rng, 0.95, 1.05);
    const count      = Math.round(baseCount * densityVar);

    // ── Motion personality ───────────────────────────────────────────────────
    const slow = rng() < 0.40;
    const formationSpeed = slow
      ? randRange(rng, 0.75, 0.90)
      : randRange(rng, 0.95, 1.15);

    let turbulence = randRange(rng, 0.14, 0.28);
    let noise      = randRange(rng, 0.10, 0.20);
    if (slow) { turbulence *= 0.75; noise *= 0.75; }

    // ── Timing budgets ───────────────────────────────────────────────────────
    const timings = {
      float:    randRange(rng, 2.0, 3.5),
      attract:  randRange(rng, 2.0, 3.0),
      form:     randRange(rng, 5.5, 7.5),
      settle:   randRange(rng, 1.5, 2.0),
      hold:     randRange(rng, 6.0, 9.0),
      dissolve: randRange(rng, 3.5, 5.0),
    };

    if (spawnStyle === 'emerge' || spawnStyle === 'spiral') {
      timings.float   += 0.8;
      timings.attract += 0.5;
    }

    // ── Mobile-specific timing compression ──────────────────────────────────
    // Shorter hold & attract keeps the loop snappy on small screens
    if (!isDesktop) {
      timings.hold    = randRange(rng, 5.0, 7.0);   // was 6–9s on desktop
      timings.attract = randRange(rng, 1.8, 2.5);   // was 2–3s on desktop
      timings.dissolve = randRange(rng, 3.0, 4.2);  // slightly faster dissolve on mobile
    }

    // ── Visual parameters ────────────────────────────────────────────────────
    const recipe: CreationRecipe = {
      seed,
      seedLabel:          formatSeedLabel(seed),
      imageId:            image?.id ?? '',
      spawnStyle,
      dissolveStyle,
      count,
      size:               randRange(rng, 1.15, 1.45),
      sizeRandomness:     randRange(rng, 0.35, 0.55),
      brightness:         randRange(rng, 0.95, 1.10),
      glow:               (ctx.tier === 'mobile' ? 0.5 : 1.0) * randRange(rng, 0.20, 0.35),
      opacity:            1.0,
      twinkle:            randRange(rng, 0.15, 0.30),
      floatSpeed:         randRange(rng, 0.25, 0.45),
      turbulence,
      noise,
      attractionStrength: randRange(rng, 0.95, 1.30),
      springStrength:     randRange(rng, 12.0, 18.0),
      damping:            randRange(rng, 6.0,  8.0),
      targetSpread:       0,
      formationSpeed,
      delayScale:         randRange(rng, 0.90, 1.30),
      colorMode:          'image',
      colorWarmth:        0,
      timings,
      cameraZ:            40.0,
      cameraDrift:        randRange(rng, 0.08, 0.18),
      parallax:           randRange(rng, 0.40, 0.80),
      fogDensity:         randRange(rng, 0.008, 0.014),
      spawnSeed:          mixSeed(seed, 21),
      targetSeed:         mixSeed(seed, 34),
    };

    return recipe;
  }
}
