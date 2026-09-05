# Krishna Particle Experience — Phase 3

A cinematic WebGL2 particle experience where source Krishna artwork disintegrates into 140,000 living particles and organically reconstructs through space, seamlessly cross-fading into a crystal-clear 4K photographic presentation.

## Features

- **Device-Aware Asset Targeting**:
  - **PC / Laptop / Tablet**: Automatically loads landscape artwork from `public/assets/krishna ji-pc/`.
  - **Mobile / Android**: Automatically loads portrait artwork from `public/assets/krishna/`.
- **Offline Binary Preprocessing Pipeline**: Pre-calculates 140,000 particle positions, Sobel edge features, luminance maps, and 3D scatter vectors into compressed `.bin` datasets for instant load times.
- **100% Full-Screen Coverage**: Composition-aware framing math scales artwork and particle fields to cover 98% of available screen space with elegant safe margins across any aspect ratio.
- **Precision Cross-Fade Timeline**:
  - **Stage 1 (Fly-in / Assembly)**: 140,000 high-density particles assemble through space (Photo hidden).
  - **Stage 2 (Settle & Reveal)**: Particles settle into place as photo opacity cross-fades in.
  - **Stage 3 (Official 4K Photo Hold)**: 100% crystal-clear official photograph display with particles fully hidden.
  - **Stage 4 (Dissolve & Cycle)**: Photo disintegrates into floating particles before seamlessly transitioning to the next creation.

## Getting Started

Requires Node.js 18+.

```bash
# Install dependencies
npm install

# Start local development server (automatically pre-generates binary datasets)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open `http://localhost:5173` to view the experience.

## Project Structure

```
krishna-particle-studio/
├── public/
│   ├── assets/
│   │   ├── krishna/          # Mobile portrait source images
│   │   └── krishna ji-pc/    # PC landscape source images
│   └── generated/
│       └── particles/        # Preprocessed binary datasets (.bin & manifest)
├── src/
│   ├── core/                 # Engine loop, WebGL renderer, camera controller
│   ├── experience/           # Timeline lifecycle director & recipe generator
│   ├── images/               # Binary dataset loader & image library interfaces
│   ├── particles/            # High-performance 140k particle field mesh
│   ├── rendering/            # Framing math, texture plane, & scene composer
│   └── shaders/              # Custom GLSL vertex & fragment shaders
└── tools/
    ├── preprocess.js         # Node image-to-binary preprocessor
    ├── build_generated.js    # Synchronous build & dev server asset preprocessor
    └── run_preprocess.js     # Standalone preprocessing CLI script
```

## Interactive Controls

- **Click** or **Spacebar**: Trigger instant dissolution of current artwork and begin a new divine creation.
- Experience automatically cycles through seeded creation recipes.

## License

MIT
