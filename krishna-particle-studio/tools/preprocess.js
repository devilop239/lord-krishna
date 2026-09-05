import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const mobileAssetsDir = path.join(rootDir, 'public/assets/krishna');
const pcAssetsDir = path.join(rootDir, 'public/assets/krishna ji-pc');
const outputDir = path.join(rootDir, 'public/generated/particles');

const MAGIC = 'KPRT';
const VERSION = 1;
const DEFAULT_PARTICLE_COUNT = 140000;

function computeLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hash2(ix, iy, seed = 9001) {
  let h = Math.imul(ix + 1, 374761393) ^ Math.imul(iy + 1, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pseudoRand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildScatter(col, row, cols, rows, rng) {
  const nx = (col / Math.max(1, cols)) * 2 - 1;
  const ny = (row / Math.max(1, rows)) * 2 - 1;
  const dist = Math.hypot(nx, ny);

  const angle = Math.atan2(ny, nx) + (0.5 + rng() * 1.0) * Math.PI;
  const spread = 22.0 + rng() * 25.0;

  const sx = Math.cos(angle) * spread * (1.2 + rng());
  const sy = Math.sin(angle) * spread * (1.2 + rng());
  const sz = -15.0 - rng() * 25.0 - dist * 15.0;
  return [sx, sy, sz];
}

/**
 * Parses REAL source artwork (PNG/JPG) into an optimized binary particle dataset (.bin).
 * Samples 100% real image colors, alpha masks, luminance, and Sobel edge details.
 */
export function processImageFileToBinary(imageFilePath, targetCount = DEFAULT_PARTICLE_COUNT) {
  const ext = path.extname(imageFilePath).toLowerCase();
  const fileBuf = fs.readFileSync(imageFilePath);

  let width = 0;
  let height = 0;
  let rgbaData = null;

  if (ext === '.png') {
    const parsed = PNG.sync.read(fileBuf);
    width = parsed.width;
    height = parsed.height;
    rgbaData = parsed.data;
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const parsed = jpeg.decode(fileBuf, { useTolerant: true, formatAsRGBA: true });
    width = parsed.width;
    height = parsed.height;
    rgbaData = parsed.data;
  } else {
    throw new Error(`Unsupported image extension: ${ext}`);
  }

  const aspect = width / height;

  const pixelCount = width * height;
  const luminance = new Float32Array(pixelCount);
  const edges = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = rgbaData[o] / 255.0;
    const g = rgbaData[o + 1] / 255.0;
    const b = rgbaData[o + 2] / 255.0;
    luminance[i] = computeLuminance(r, g, b);
  }

  // Sobel Edge Filter
  let maxEdge = 1e-6;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -luminance[(y - 1) * width + (x - 1)] + luminance[(y - 1) * width + (x + 1)] +
        -2 * luminance[y * width + (x - 1)] + 2 * luminance[y * width + (x + 1)] +
        -luminance[(y + 1) * width + (x - 1)] + luminance[(y + 1) * width + (x + 1)];
      const gy =
        -luminance[(y - 1) * width + (x - 1)] - 2 * luminance[(y - 1) * width + x] - luminance[(y - 1) * width + (x + 1)] +
        luminance[(y + 1) * width + (x - 1)] + 2 * luminance[(y + 1) * width + x] + luminance[(y + 1) * width + (x + 1)];
      const mag = Math.hypot(gx, gy);
      edges[idx] = mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }

  const normEdge = 1.0 / maxEdge;
  for (let i = 0; i < pixelCount; i++) {
    edges[i] = Math.min(1.0, edges[i] * normEdge);
  }

  // Calculate high-resolution regular sampling grid
  const gridRows = Math.round(Math.sqrt(targetCount / aspect));
  const gridCols = Math.round(gridRows * aspect);
  const actualParticleCount = gridRows * gridCols;

  const rng = pseudoRand(42);
  const worldH = 1.0;
  const worldW = aspect;

  const cellWorldHeight = worldH / gridRows;

  const targets = new Float32Array(actualParticleCount * 3);
  const colors = new Float32Array(actualParticleCount * 3);
  const sizes = new Float32Array(actualParticleCount);
  const importances = new Float32Array(actualParticleCount);
  const luminances = new Float32Array(actualParticleCount);
  const edgesArray = new Float32Array(actualParticleCount);
  const scatters = new Float32Array(actualParticleCount * 3);
  const delays = new Float32Array(actualParticleCount * 2);
  const seeds = new Float32Array(actualParticleCount);

  let pIdx = 0;
  let minX = 1e6, maxX = -1e6, minY = 1e6, maxY = -1e6, minZ = 1e6, maxZ = -1e6;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const u = (c + 0.5) / gridCols;
      const v = (r + 0.5) / gridRows;

      const px = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
      const py = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
      const idx = py * width + px;
      const o = idx * 4;

      const rVal = rgbaData[o] / 255.0;
      const gVal = rgbaData[o + 1] / 255.0;
      const bVal = rgbaData[o + 2] / 255.0;
      const aVal = rgbaData[o + 3] / 255.0;

      const lVal = luminance[idx];
      const eVal = edges[idx];

      const x = (u - 0.5) * worldW;
      const y = (0.5 - v) * worldH;
      const z = (0.5 - lVal) * 0.06 + eVal * 0.04;

      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);

      const isGold = lVal > 0.15 && rVal > 0.32 && gVal > 0.20 && rVal > bVal * 0.9;
      const isBlue = lVal > 0.08 && bVal > 0.20 && bVal > rVal * 0.95;
      let impVal = 0.40 + eVal * 0.70 + (isGold ? 0.40 : 0) + (isBlue ? 0.30 : 0) + (lVal > 0.6 ? 0.20 : 0);
      if (lVal < 0.02 && eVal < 0.08 && !isGold && !isBlue) impVal *= 0.30;
      impVal = Math.max(0.08, Math.min(1.0, aVal * impVal));

      const [sx, sy, sz] = buildScatter(c, r, gridCols, gridRows, rng);
      const regHash = hash2(Math.floor(c / 2), Math.floor(r / 2));
      const localSeed = rng();

      const normalizedImp = Math.min(1.0, impVal * 1.5);
      const delayOut = Math.min(2.4, (1.0 - normalizedImp) * 1.8 + regHash * 0.7 + localSeed * 0.3);
      const delayIn = Math.min(2.8, (1.0 - normalizedImp) * 1.4 + (1.0 - eVal) * 0.5 + localSeed * 0.25);

      const pSz = 1.05 + lVal * 0.15 + eVal * 0.10;

      targets[pIdx * 3] = x;
      targets[pIdx * 3 + 1] = y;
      targets[pIdx * 3 + 2] = z;

      colors[pIdx * 3] = rVal;
      colors[pIdx * 3 + 1] = gVal;
      colors[pIdx * 3 + 2] = bVal;

      sizes[pIdx] = pSz;
      importances[pIdx] = impVal;
      luminances[pIdx] = lVal;
      edgesArray[pIdx] = eVal;

      scatters[pIdx * 3] = sx;
      scatters[pIdx * 3 + 1] = sy;
      scatters[pIdx * 3 + 2] = sz;

      delays[pIdx * 2] = delayOut;
      delays[pIdx * 2 + 1] = delayIn;

      seeds[pIdx] = localSeed;

      pIdx++;
    }
  }

  // Header 64 bytes
  const headerBuf = Buffer.alloc(64);
  headerBuf.write(MAGIC, 0, 4, 'ascii');
  headerBuf.writeUInt32LE(VERSION, 4);
  headerBuf.writeUInt32LE(actualParticleCount, 8);
  headerBuf.writeUInt32LE(width, 12);
  headerBuf.writeUInt32LE(height, 16);
  headerBuf.writeFloatLE(aspect, 20);
  headerBuf.writeFloatLE(minX, 24);
  headerBuf.writeFloatLE(maxX, 28);
  headerBuf.writeFloatLE(minY, 32);
  headerBuf.writeFloatLE(maxY, 36);
  headerBuf.writeFloatLE(minZ, 40);
  headerBuf.writeFloatLE(maxZ, 44);
  headerBuf.writeFloatLE(cellWorldHeight, 48);

  const count = actualParticleCount;
  const payloadFloatCount = count * (3 + 3 + 1 + 1 + 1 + 1 + 3 + 2 + 1);
  const payloadBuf = Buffer.alloc(payloadFloatCount * 4);

  let offset = 0;
  for (let i = 0; i < count; i++) {
    payloadBuf.writeFloatLE(targets[i * 3], offset); offset += 4;
    payloadBuf.writeFloatLE(targets[i * 3 + 1], offset); offset += 4;
    payloadBuf.writeFloatLE(targets[i * 3 + 2], offset); offset += 4;

    payloadBuf.writeFloatLE(colors[i * 3], offset); offset += 4;
    payloadBuf.writeFloatLE(colors[i * 3 + 1], offset); offset += 4;
    payloadBuf.writeFloatLE(colors[i * 3 + 2], offset); offset += 4;

    payloadBuf.writeFloatLE(sizes[i], offset); offset += 4;
    payloadBuf.writeFloatLE(importances[i], offset); offset += 4;
    payloadBuf.writeFloatLE(luminances[i], offset); offset += 4;
    payloadBuf.writeFloatLE(edgesArray[i], offset); offset += 4;

    payloadBuf.writeFloatLE(scatters[i * 3], offset); offset += 4;
    payloadBuf.writeFloatLE(scatters[i * 3 + 1], offset); offset += 4;
    payloadBuf.writeFloatLE(scatters[i * 3 + 2], offset); offset += 4;

    payloadBuf.writeFloatLE(delays[i * 2], offset); offset += 4;
    payloadBuf.writeFloatLE(delays[i * 2 + 1], offset); offset += 4;

    payloadBuf.writeFloatLE(seeds[i], offset); offset += 4;
  }

  return Buffer.concat([headerBuf, payloadBuf]);
}

function scanDirFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  return fs.readdirSync(dir)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((f) => ({ filename: f, fullPath: path.join(dir, f) }));
}

/**
 * Preprocesses Mobile assets (krishna/) AND PC assets (krishna ji-pc/).
 * Uses mtime caching to run instantly if binary datasets are already up-to-date.
 */
export function runPreprocessing(rootDirPath = rootDir, outDir = outputDir, forceRebuild = false) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const mobDir = path.join(rootDirPath, 'public/assets/krishna');
  const pcDir = path.join(rootDirPath, 'public/assets/krishna ji-pc');

  const mobileFiles = scanDirFiles(mobDir).map((item) => ({ ...item, deviceTarget: 'mobile', prefix: 'mobile' }));
  const pcFiles = scanDirFiles(pcDir).map((item) => ({ ...item, deviceTarget: 'pc', prefix: 'pc' }));

  const allFiles = [...mobileFiles, ...pcFiles];

  // Clean stale/orphan datasets from output directory
  const validAssetIds = new Set(allFiles.map(item => `${item.prefix}-${path.parse(item.filename).name}`));
  const existingGenFiles = fs.readdirSync(outDir);
  for (const f of existingGenFiles) {
    if (f === 'manifest.json') continue;
    const ext = path.extname(f);
    if (ext === '.bin' || ext === '.json') {
      const base = path.basename(f, ext);
      if (!validAssetIds.has(base)) {
        try { fs.unlinkSync(path.join(outDir, f)); } catch (_) {}
      }
    }
  }

  const manifest = [];
  let updatedCount = 0;

  for (const item of allFiles) {
    const baseId = path.parse(item.filename).name;
    const assetId = `${item.prefix}-${baseId}`;

    const binFile = `${assetId}.bin`;
    const binPath = path.join(outDir, binFile);
    const metaPath = path.join(outDir, `${assetId}.json`);

    const imgStat = fs.statSync(item.fullPath);
    let isUpToDate = false;

    if (!forceRebuild && fs.existsSync(binPath) && fs.existsSync(metaPath)) {
      const binStat = fs.statSync(binPath);
      if (binStat.mtimeMs >= imgStat.mtimeMs && binStat.size > 1000) {
        isUpToDate = true;
      }
    }

    if (isUpToDate) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        // Ensure accurate image filename in meta
        meta.file = item.filename;
        manifest.push(meta);
        continue;
      } catch (_) {
        // Fall back to rebuild if JSON is corrupt
      }
    }

    const buffer = processImageFileToBinary(item.fullPath, 140000);
    fs.writeFileSync(binPath, buffer);

    const actualCount = buffer.readUInt32LE(8);
    const width = buffer.readUInt32LE(12);
    const height = buffer.readUInt32LE(16);
    const aspect = buffer.readFloatLE(20);
    const minX = buffer.readFloatLE(24);
    const maxX = buffer.readFloatLE(28);
    const minY = buffer.readFloatLE(32);
    const maxY = buffer.readFloatLE(36);
    const cellWorldHeight = buffer.readFloatLE(48);

    const orientation = aspect > 1.05 ? 'landscape' : (aspect < 0.95 ? 'portrait' : 'square');

    const meta = {
      id: assetId,
      baseId,
      file: item.filename,
      deviceTarget: item.deviceTarget, // 'mobile' or 'pc'
      binFile,
      particleCount: actualCount,
      width,
      height,
      aspect,
      orientation,
      cellWorldHeight,
      bounds: { minX, maxX, minY, maxY },
      coverageScore: 1.0,
    };

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    manifest.push(meta);
    updatedCount++;

    console.log(`  ✓ Preprocessed '${assetId}' [${item.deviceTarget.toUpperCase()}] -> ${binPath} (${actualCount} particles, aspect=${aspect.toFixed(4)})`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (updatedCount > 0) {
    console.log(`[Preprocessing] Updated ${updatedCount} asset(s). Total ${manifest.length} binary assets in ${outDir}`);
  }
  return manifest;
}

if (process.argv[1] && process.argv[1].endsWith('preprocess.js')) {
  runPreprocessing();
}
