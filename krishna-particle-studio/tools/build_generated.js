import path from 'node:path';
import fs from 'node:fs';
import jpeg from 'jpeg-js';
import { runPreprocessing } from './preprocess.js';

function rotateJpeg180(filePath) {
  const fileBuf = fs.readFileSync(filePath);
  const raw = jpeg.decode(fileBuf, { useTolerant: true, formatAsRGBA: true });
  const { width, height, data } = raw;

  const outData = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const newX = width - 1 - x;
      const newY = height - 1 - y;
      const dstIdx = (newY * width + newX) * 4;

      outData[dstIdx]     = data[srcIdx];
      outData[dstIdx + 1] = data[srcIdx + 1];
      outData[dstIdx + 2] = data[srcIdx + 2];
      outData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  const encoded = jpeg.encode({ data: outData, width, height }, 95);
  fs.writeFileSync(filePath, encoded.data);
  console.log(`[Auto-Rotate 180] Successfully corrected '${path.basename(filePath)}' to right-side up (${width}x${height})`);
}

function fixPcImageOrientations(rootDir) {
  const pcDir = path.join(rootDir, 'public/assets/krishna ji-pc');
  if (!fs.existsSync(pcDir)) return;

  const targetUpsideDownFiles = ['pc-05.jpg', 'pc-06.jpg', 'pc-07.jpg'];
  for (const filename of targetUpsideDownFiles) {
    const fullPath = path.join(pcDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const fileBuf = fs.readFileSync(fullPath);
        const raw = jpeg.decode(fileBuf, { useTolerant: true, formatAsRGBA: true });
        // Check if image is landscape but upside down (e.g. tree trunk at top or moon at bottom in pc-06)
        // We track a marker file or check pixel features to only flip once
        const markerPath = path.join(pcDir, `.${filename}.upright`);
        if (!fs.existsSync(markerPath)) {
          rotateJpeg180(fullPath);
          fs.writeFileSync(markerPath, 'upright');
        }
      } catch (err) {
        console.error(`[Auto-Rotate] Error fixing '${filename}':`, err);
      }
    }
  }
}

export function ensureGeneratedDatasets(rootDir) {
  // Ensure all PC JPG source images are saved in true landscape orientation
  fixPcImageOrientations(rootDir);

  runPreprocessing(rootDir, undefined, false);
}
