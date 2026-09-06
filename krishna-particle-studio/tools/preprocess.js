import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Runs offline asset preprocessing if manifest.json is missing.
 */
export function runPreprocessing(rootDir = process.cwd()) {
  const generatedDir = path.resolve(rootDir, 'public/generated/particles');
  const manifestPath = path.resolve(generatedDir, 'manifest.json');

  if (!fs.existsSync(manifestPath) || fs.statSync(manifestPath).size === 0) {
    console.log('[Preprocess] Manifest missing. Running preprocess_krishna.py...');
    try {
      const scriptPath = path.resolve(rootDir, 'tools/preprocess_krishna.py');
      execSync(`python3 "${scriptPath}" || python "${scriptPath}"`, { stdio: 'inherit' });
    } catch (err) {
      console.warn('[Preprocess] Python preprocess notice:', err.message);
    }
  }
}
