import { createRng } from '../utils/random';

const STORAGE_KEY = 'kps-last-seeds';

export function formatSeedLabel(seed: number): string {
  return `KRISHNA-${String(seed >>> 0).padStart(6, '0')}`;
}

export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function readRecent(): number[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((n) => Number(n) >>> 0) : [];
  } catch {
    return [];
  }
}

function writeRecent(seeds: number[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeds.slice(0, 8)));
  } catch {
    /* private mode / blocked storage */
  }
}

/** Entropy seed that avoids repeating the last few refresh results. */
export function createExperienceSeed(): number {
  const t = Date.now();
  const p = typeof performance !== 'undefined' ? performance.now() : 0;
  const r = Math.random() * 0xffffffff;
  let seed = mixSeed(t >>> 0, Math.floor(p * 1000) ^ (r >>> 0));
  const recent = readRecent();
  let guard = 0;
  while (recent.includes(seed) && guard < 12) {
    seed = mixSeed(seed, 0x85ebca6b + guard);
    guard += 1;
  }
  writeRecent([seed, ...recent]);
  return seed;
}

export function rngFromSeed(seed: number): () => number {
  return createRng(seed >>> 0);
}
