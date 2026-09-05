import './style.css';
import { Engine } from './core/Engine';
import { SceneComposer } from './rendering/SceneComposer';
import { ParticleField } from './particles/ParticleField';
import { ExperienceDirector } from './experience/ExperienceDirector';

/**
 * Phase 3 bootstrap — minimal cinematic experience.
 * No visible controls, no UI panels, no image selector.
 * The ExperienceDirector owns everything: image selection,
 * randomized recipe, particle formation, continuous cycling.
 */
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('[Krishna] Missing canvas.');
    return;
  }

  const engine = new Engine({ canvas, maxPixelRatio: 2 });
  engine.camera.position.set(0, 0, 40);

  const composer = new SceneComposer(engine);
  // 4K QUALITY: Increase max particle buffer for high-density rendering
  const field = new ParticleField({}, 200_000);
  engine.scene.add(field.points);

  // Register particle field update into the engine loop
  engine.addUpdatable((delta, elapsed) => field.update(delta, elapsed));

  // Sync canvas height for correct particle sizing
  field.setCanvasHeight(canvas.parentElement?.clientHeight ?? window.innerHeight);
  engine.events.on('resize', ({ height }) => {
    field.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    field.setCanvasHeight(height);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) engine.pause();
    else engine.start();
  });

  engine.start();

  const director = new ExperienceDirector(engine, field, composer);
  await director.start();

  // Mount the glassmorphic fullscreen button
  mountFullscreenButton();

  window.addEventListener('beforeunload', () => {
    director.dispose();
    composer.dispose();
    field.dispose();
    engine.dispose();
  });
}

/**
 * Wires up the fullscreen toggle button.
 * - Click → enter / exit fullscreen
 * - Esc key → browser handles exit natively; we sync the icon via fullscreenchange
 * - If Fullscreen API unavailable, hide the button gracefully.
 */
function mountFullscreenButton(): void {
  const btn = document.getElementById('btn-fullscreen') as HTMLButtonElement | null;
  if (!btn) return;

  // Hide if the Fullscreen API is not supported (some iOS Safari versions)
  if (!document.documentElement.requestFullscreen) {
    btn.style.display = 'none';
    return;
  }

  const syncIcon = () => {
    const isFull = !!document.fullscreenElement;
    btn.classList.toggle('is-fullscreen', isFull);
    btn.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
  };

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } else {
      void document.exitFullscreen();
    }
  });

  // Sync icon whenever fullscreen state changes (covers Esc key too)
  document.addEventListener('fullscreenchange', syncIcon);
}

void bootstrap();
