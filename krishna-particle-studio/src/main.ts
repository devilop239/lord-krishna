import './style.css';
import { Engine } from './core/Engine';
import { SceneComposer } from './rendering/SceneComposer';
import { ParticleField } from './particles/ParticleField';
import { ExperienceDirector } from './experience/ExperienceDirector';
import { AudioController } from './audio/AudioController';

/**
 * Main application bootstrap.
 * Boots with sleek preloader screen, then launches directly into the core particle experience.
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
  const field = new ParticleField({}, 200_000);
  engine.scene.add(field.points);

  engine.addUpdatable((delta, elapsed) => field.update(delta, elapsed));

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

  const loadStart = performance.now();

  // Initialize and start official Krishna particle experience directly
  const director = new ExperienceDirector(engine, field, composer);

  // Initialize divine background Radhe Radhe theme & music bar controls
  const audioController = new AudioController('/assets/Radhee Radhee.m4a', () => {
    director.requestNewCreation(true);
  });

  await director.start();

  // Guarantee loading screen displays for at least 3.0 seconds (3000ms)
  const elapsedMs = performance.now() - loadStart;
  const minHoldMs = 3000;
  const remainingMs = Math.max(0, minHoldMs - elapsedMs);

  setTimeout(() => {
    hidePreloader();
  }, remainingMs);

  mountFullscreenButton();

  window.addEventListener('beforeunload', () => {
    audioController.dispose();
    director.dispose();
    composer.dispose();
    field.dispose();
    engine.dispose();
  });
}

/**
 * Fades out and removes the preloader overlay.
 */
function hidePreloader(): void {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('is-hidden');
  setTimeout(() => {
    if (preloader.parentNode) {
      preloader.parentNode.removeChild(preloader);
    }
  }, 900);
}

/**
 * Wires up the fullscreen toggle button with cross-browser API support.
 */
function mountFullscreenButton(): void {
  const btn = document.getElementById('btn-fullscreen') as HTMLButtonElement | null;
  if (!btn) return;

  const doc = document as any;
  const docEl = document.documentElement as any;

  const getFSElement = (): Element | null => {
    return (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      null
    );
  };

  const syncIcon = () => {
    const isFull = !!getFSElement();
    btn.classList.toggle('is-fullscreen', isFull);
    btn.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
    btn.setAttribute('title', isFull ? 'Exit Fullscreen (Esc)' : 'Fullscreen (Esc to exit)');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();

    const requestFS =
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen;

    const exitFS =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;

    try {
      if (!getFSElement()) {
        if (requestFS) {
          const promise = requestFS.call(docEl, { navigationUI: 'hide' });
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              // Retry standard request without options
              requestFS.call(docEl);
            });
          }
        }
      } else {
        if (exitFS) {
          exitFS.call(doc);
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle encountered an issue:', err);
    }
  });

  const fsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  fsEvents.forEach((evt) => {
    document.addEventListener(evt, syncIcon);
  });

  syncIcon();
}

void bootstrap();
