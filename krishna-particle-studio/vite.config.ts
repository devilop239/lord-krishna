import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { ensureGeneratedDatasets } from './tools/build_generated.js';
import { runPreprocessing } from './tools/preprocess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Trigger dataset auto-preprocessing update


// Preprocess Mobile (4 assets) and PC (7 assets) on startup - Fresh manifest active
ensureGeneratedDatasets(__dirname);

interface ManifestItem {
  id: string;
  baseId?: string;
  file: string;
  deviceTarget?: 'mobile' | 'pc';
  binFile: string;
  particleCount?: number;
  width?: number;
  height?: number;
  aspect?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  cellWorldHeight?: number;
}

function scanKrishnaAssets() {
  runPreprocessing(__dirname);
  const genDir = path.resolve(__dirname, 'public/generated/particles');
  const manifestPath = path.join(genDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) return [];

  try {
    const manifest: ManifestItem[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return manifest.map((item: ManifestItem, i: number) => {
      const isPc = item.deviceTarget === 'pc' || (typeof item.id === 'string' && item.id.startsWith('pc-'));
      const folder = isPc ? 'krishna ji-pc' : 'krishna';
      const aspect = item.aspect ?? 1.0;
      return {
        id: item.id,
        file: item.file,
        deviceTarget: item.deviceTarget || (isPc ? 'pc' : 'mobile'),
        orientation: item.orientation || (aspect > 1.05 ? 'landscape' : 'portrait'),
        src: encodeURI(`/assets/${folder}/${item.file}`),
        binSrc: `/generated/particles/${item.binFile}`,
        metaSrc: `/generated/particles/${item.id}.json`,
        label: item.id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        index: i + 1,
      };
    });
  } catch (err) {
    console.error('Error reading particle manifest:', err);
    return [];
  }
}

function krishnaImagePlugin(): Plugin {
  const virtualId = 'virtual:krishna-images';
  const resolved = `\0${virtualId}`;

  return {
    name: 'krishna-images',
    buildStart() {
      ensureGeneratedDatasets(__dirname);
    },
    resolveId(id) {
      if (id === virtualId) return resolved;
      return undefined;
    },
    load(id) {
      if (id !== resolved) return undefined;
      const assets = scanKrishnaAssets();
      return `export const krishnaImages = ${JSON.stringify(assets, null, 2)};\n`;
    },
  };
}

export default defineConfig({
  server: {
    host: true,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
  },
  plugins: [krishnaImagePlugin()],
});
