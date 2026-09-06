/**
 * AudioController:
 * High-end glassmorphic music player controller for Krishna Ji Flute Theme.
 * Supports play/pause, seek scrubber, volume slider, track time formatting,
 * live wave animations, autoplay unlock, and minimize/expand toggle.
 */
export class AudioController {
  private audio: HTMLAudioElement;
  private isPlaying = false;
  private targetVolume = 0.50;
  private isMinimized = false;
  private isSeeking = false;
  private onNextCreationCallback: (() => void) | null = null;
  private cleanupListeners: (() => void) | null = null;

  // UI elements
  private playBtn: HTMLButtonElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private volMuteBtn: HTMLButtonElement | null = null;
  private miniToggleBtn: HTMLButtonElement | null = null;
  private progressInput: HTMLInputElement | null = null;
  private progressFill: HTMLElement | null = null;
  private volumeInput: HTMLInputElement | null = null;
  private timeCurr: HTMLElement | null = null;
  private timeDur: HTMLElement | null = null;
  private playerContainer: HTMLElement | null = null;

  constructor(src: string, onNextCreation?: () => void) {
    this.onNextCreationCallback = onNextCreation || null;

    const existing = document.getElementById('bg-audio') as HTMLAudioElement | null;
    if (existing) {
      this.audio = existing;
      this.audio.src = src;
    } else {
      this.audio = new Audio(src);
      this.audio.id = 'bg-audio';
      this.audio.loop = true;
      this.audio.preload = 'auto';
      document.body.appendChild(this.audio);
    }

    this.audio.loop = true;
    this.audio.volume = this.targetVolume;

    // Check saved user mute preference
    const userMuted = localStorage.getItem('krishna_audio_muted') === 'true';
    this.isPlaying = !userMuted;

    this.bindUI();
    this.setupAutoplayUnlock();
    this.setupAudioEvents();
  }

  setOnNextCreation(cb: () => void): void {
    this.onNextCreationCallback = cb;
  }

  private bindUI(): void {
    this.playerContainer = document.getElementById('music-player-bar');
    this.playBtn = document.getElementById('btn-play-pause') as HTMLButtonElement | null;
    this.prevBtn = document.getElementById('btn-prev-creation') as HTMLButtonElement | null;
    this.nextBtn = document.getElementById('btn-next-creation') as HTMLButtonElement | null;
    this.volMuteBtn = document.getElementById('btn-volume-mute') as HTMLButtonElement | null;
    this.miniToggleBtn = document.getElementById('btn-toggle-mini') as HTMLButtonElement | null;
    this.progressInput = document.getElementById('music-progress') as HTMLInputElement | null;
    this.progressFill = document.getElementById('music-progress-fill');
    this.volumeInput = document.getElementById('music-volume') as HTMLInputElement | null;
    this.timeCurr = document.getElementById('music-time-curr');
    this.timeDur = document.getElementById('music-time-dur');

    // Controls
    this.playBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onNextCreationCallback) this.onNextCreationCallback();
    });

    this.nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onNextCreationCallback) this.onNextCreationCallback();
    });

    this.volMuteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });

    this.miniToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    // Volume slider
    if (this.volumeInput) {
      this.volumeInput.value = String(this.targetVolume);
      this.volumeInput.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.setVolume(val);
      });
    }

    // Progress scrubber
    if (this.progressInput) {
      this.progressInput.addEventListener('pointerdown', () => { this.isSeeking = true; });
      this.progressInput.addEventListener('pointerup', () => { this.isSeeking = false; });
      this.progressInput.addEventListener('input', (e) => {
        const pct = parseFloat((e.target as HTMLInputElement).value);
        if (this.audio.duration) {
          this.audio.currentTime = (pct / 100) * this.audio.duration;
          this.updateProgressUI();
        }
      });
    }
  }

  private setupAudioEvents(): void {
    this.audio.addEventListener('timeupdate', () => {
      if (!this.isSeeking) {
        this.updateProgressUI();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.updateProgressUI();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updateUIState();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updateUIState();
    });
  }

  private setupAutoplayUnlock(): void {
    const unlock = () => {
      const isMuted = localStorage.getItem('krishna_audio_muted') === 'true';
      if (!isMuted && this.audio.paused) {
        void this.play();
      }
    };

    const events = ['pointerdown', 'touchstart', 'click', 'keydown', 'scroll'];
    events.forEach((evt) => {
      window.addEventListener(evt, unlock, { capture: true, passive: true });
    });

    const preloader = document.getElementById('preloader');
    if (preloader) {
      preloader.addEventListener('click', unlock, { passive: true });
    }

    this.cleanupListeners = () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, unlock, { capture: true });
      });
    };

    // Immediate play attempt
    const isMuted = localStorage.getItem('krishna_audio_muted') === 'true';
    if (!isMuted) {
      void this.play();
    }
  }

  async play(): Promise<void> {
    try {
      localStorage.setItem('krishna_audio_muted', 'false');
      this.audio.volume = this.targetVolume;
      this.audio.muted = false;
      await this.audio.play();
      this.isPlaying = true;
      this.updateUIState();
    } catch {
      this.isPlaying = true;
      this.updateUIState();
    }
  }

  pause(): void {
    localStorage.setItem('krishna_audio_muted', 'true');
    this.audio.pause();
    this.isPlaying = false;
    this.updateUIState();
  }

  toggle(): void {
    if (this.isPlaying && !this.audio.paused) {
      this.pause();
    } else {
      void this.play();
    }
  }

  setVolume(val: number): void {
    this.targetVolume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.targetVolume;
    if (this.targetVolume > 0 && this.audio.muted) {
      this.audio.muted = false;
    }
    if (this.volumeInput) {
      this.volumeInput.value = String(this.targetVolume);
    }
    this.updateUIState();
  }

  toggleMute(): void {
    if (this.audio.volume > 0 && !this.audio.muted) {
      this.setVolume(0);
    } else {
      this.setVolume(0.50);
      void this.play();
    }
  }

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    if (this.playerContainer) {
      this.playerContainer.classList.toggle('is-minimized', this.isMinimized);
    }
  }

  private updateProgressUI(): void {
    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 0;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    if (this.progressInput && !this.isSeeking) {
      this.progressInput.value = pct.toFixed(1);
    }
    if (this.progressFill) {
      this.progressFill.style.width = `${pct}%`;
    }
    if (this.timeCurr) {
      this.timeCurr.textContent = this.formatTime(cur);
    }
    if (this.timeDur) {
      this.timeDur.textContent = dur > 0 ? this.formatTime(dur) : '4:54';
    }
  }

  private updateUIState(): void {
    const active = this.isPlaying && !this.audio.paused;
    if (this.playerContainer) {
      this.playerContainer.classList.toggle('is-playing', active);
      this.playerContainer.classList.toggle('is-muted', this.audio.volume === 0 || this.audio.muted);
    }
    if (this.playBtn) {
      this.playBtn.setAttribute('title', active ? 'Pause Music' : 'Play Music');
    }
  }

  private formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  dispose(): void {
    if (this.cleanupListeners) this.cleanupListeners();
    this.audio.pause();
  }
}
