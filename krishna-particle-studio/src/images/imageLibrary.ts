import { krishnaImages } from 'virtual:krishna-images';
import type { KrishnaImageAsset } from './types';

/**
 * Discovers Krishna reference images from `public/assets/krishna`
 * via a Vite virtual module (directory scan at dev/build time).
 * Selection stays manual — no random pick on load.
 */
export function listKrishnaImages(): KrishnaImageAsset[] {
  return krishnaImages.map((asset) => ({ ...asset }));
}

export function getKrishnaImage(id: string): KrishnaImageAsset | undefined {
  return krishnaImages.find((asset) => asset.id === id);
}

export function getDefaultKrishnaImage(): KrishnaImageAsset | undefined {
  return krishnaImages[0];
}
