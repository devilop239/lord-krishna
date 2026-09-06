import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { ensureGeneratedDatasets } from './tools/build_generated.js';

function krishnaImagePlugin(): Plugin {
  const virtualModuleId = 'virtual:krishna-images';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'krishna-image-plugin',
    configResolved(config) {
      try {
        ensureGeneratedDatasets(config.root);
      } catch (err) {
        console.warn('[Krishna Plugin] Preprocessing check notice:', err);
      }
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const manifestPath = path.resolve(process.cwd(), 'public/generated/particles/manifest.json');
        if (fs.existsSync(manifestPath)) {
          const rawManifest = fs.readFileSync(manifestPath, 'utf-8');
          const entries = JSON.parse(rawManifest);

          const items = entries.map((entry: any, index: number) => {
            const isPc = entry.deviceTarget === 'pc';
            const subDir = isPc ? 'krishna ji-pc' : 'krishna';
            return {
              id: entry.id,
              file: entry.file,
              src: `/assets/${subDir}/${entry.file}`,
              binSrc: `/generated/particles/${entry.binFile}`,
              metaSrc: `/generated/particles/${entry.id}.json`,
              label: entry.baseId || entry.id,
              index: index + 1,
              deviceTarget: entry.deviceTarget,
              orientation: entry.orientation,
            };
          });

          return `export const krishnaImages = ${JSON.stringify(items, null, 2)};`;
        }

        return `export const krishnaImages = [];`;
      }
    },
  };
}

export default defineConfig({
  plugins: [krishnaImagePlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'esnext',
  },
});
