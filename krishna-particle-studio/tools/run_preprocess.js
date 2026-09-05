import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreprocessing } from './preprocess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

runPreprocessing(rootDir);
