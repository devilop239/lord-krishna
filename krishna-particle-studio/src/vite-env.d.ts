/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const src: string;
  export default src;
}

declare module 'virtual:krishna-images' {
  export interface KrishnaImageAsset {
    id: string;
    file: string;
    src: string;
    binSrc: string;
    metaSrc: string;
    label: string;
    index: number;
    deviceTarget?: 'mobile' | 'pc';
    orientation?: 'landscape' | 'portrait' | 'square';
  }

  export const krishnaImages: KrishnaImageAsset[];
}
