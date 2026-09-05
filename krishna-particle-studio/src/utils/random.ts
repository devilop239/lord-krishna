/**
 * Deterministic pseudo-random number generator (mulberry32).
 * Using a seeded RNG means a given particle field can be
 * reproduced exactly — useful once procedural compositions
 * need to be regenerated or shared.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform random point inside a sphere of the given radius. */
export function randomInSphere(rng: () => number, radius: number): [number, number, number] {
  // Rejection-free approach via spherical coordinates + cube-root radius
  // for uniform volumetric density.
  const u = rng();
  const v = rng();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(rng());
  const sinPhi = Math.sin(phi);
  return [
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi),
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
