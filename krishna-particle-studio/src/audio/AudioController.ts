/**
 * AudioController
 * Drives the glass music player dock: play/pause, waveform-synced scrubber,
 * popover volume fader, minimize/restore, and fullscreen toggle.
 */

const WAVE_BAR_COUNT = 40;

export class AudioController {
  private audio: HTMLAudioElement;
  private isPlaying = false;
  private targetVolume = 0.5;
  private isMinimized = false;
  private isSeeking = false;
  private onNextCreationCallback: (() => void) | null = null;
  private cleanupListeners: (() => void) | null = null;

  // UI elements
  private dock: HTMLElement | null = null;
  private playerBar: HTMLElement | null = null;
  private miniRestore: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private volMuteBtn: HTMLButtonElement | null = null;
  private volWrap: HTMLElement | null = null;
  private volFill: HTMLElement | null = null;
  private volNum: HTMLElement | null = null;
  private volMutedLines: SVGGElement | null = null;
  private miniToggleBtn: HTMLButtonElement | null = null;
  private progressInput: HTMLInputElement | null = null;
  private waveContainer: HTMLElement | null = null;
  private waveBars: HTMLSpanElement[] = [];
  private volumeInput: HTMLInputElement | null = null;
  private timeCurr: HTMLElement | null = null;
  private timeDur: HTMLElement | null = null;
  private fsBtn: HTMLButtonElement | null = null;

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

    const userMuted = localStorage.getItem('krishna_audio_muted') === 'true';
    this.isPlaying = !userMuted;

    this.buildWaveform();
    this.bindUI();
    this.setupAutoplayUnlock();
    this.setupAudioEvents();
  }

  setOnNextCreation(cb: () => void): void {
    this.onNextCreationCallback = cb;
  }

  // ─── Setup ──────────────────────────────────────────────────────────

  private buildWaveform(): void {
    this.waveContainer = document.getElementById('music-wave');
    if (!this.waveContainer) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < WAVE_BAR_COUNT; i++) {
      const bar = document.createElement('span');
      frag.appendChild(bar);
      this.waveBars.push(bar);
    }
    this.waveContainer.appendChild(frag);
  }

  private bindUI(): void {
    this.dock = document.getElementById('player-dock');
    this.playerBar = document.getElementById('music-player-bar');
    this.miniRestore = document.getElementById('mini-restore');
    this.playBtn = document.getElementById('btn-play-pause') as HTMLButtonElement | null;
    this.prevBtn = document.getElementById('btn-prev-creation') as HTMLButtonElement | null;
    this.nextBtn = document.getElementById('btn-next-creation') as HTMLButtonElement | null;
    this.volMuteBtn = document.getElementById('btn-volume-mute') as HTMLButtonElement | null;
    this.volWrap = document.getElementById('music-vol-wrap');
    this.volFill = document.getElementById('music-vol-fill');
    this.volNum = document.getElementById('music-vol-num');
    this.volMutedLines = document.getElementById('music-vol-muted-lines') as unknown as SVGGElement | null;
    this.miniToggleBtn = document.getElementById('btn-toggle-mini') as HTMLButtonElement | null;
    this.progressInput = document.getElementById('music-progress') as HTMLInputElement | null;
    this.volumeInput = document.getElementById('music-volume') as HTMLInputElement | null;
    this.timeCurr = document.getElementById('music-time-curr');
    this.timeDur = document.getElementById('music-time-dur');
    this.fsBtn = document.getElementById('btn-fullscreen') as HTMLButtonElement | null;

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
      this.toggleVolumePopover();
    });

    // Close the volume popover when clicking anywhere else.
    document.addEventListener('click', () => this.closeVolumePopover());
    this.volWrap?.addEventListener('click', (e) => e.stopPropagation());

    this.miniToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    this.miniRestore?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    if (this.volumeInput) {
      this.volumeInput.value = String(this.targetVolume);
      this.volumeInput.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.setVolume(val);
      });
    }

    if (this.progressInput) {
      this.progressInput.addEventListener('pointerdown', () => { this.isSeeking = true; });
      this.progressInput.addEventListener('pointerup', () => { this.isSeeking = false; });
      this.progressInput.addEventListener('input', (e) => {
        const pct = parseFloat((e.target as HTMLInputElement).value);
        if (this.audio.duration) {
          this.audio.currentTime = (pct / 100) * this.audio.duration;
        }
        this.renderWaveform(pct);
      });
    }

    this.fsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
      this.fsBtn?.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
    });

    this.updateVolumeUI();
  }

  private setupAudioEvents(): void {
    this.audio.addEventListener('timeupdate', () => {
      if (!this.isSeeking) this.updateProgressUI();
    });

    this.audio.addEventListener('loadedmetadata', () => this.updateProgressUI());

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
    preloader?.addEventListener('click', unlock, { passive: true });

    this.cleanupListeners = () => {
      events.forEach((evt) => window.removeEventListener(evt, unlock, { capture: true }));
    };

    const isMuted = localStorage.getItem('krishna_audio_muted') === 'true';
    if (!isMuted) void this.play();
  }

  // ─── Playback ───────────────────────────────────────────────────────

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

  // ─── Volume ─────────────────────────────────────────────────────────

  setVolume(val: number): void {
    this.targetVolume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.targetVolume;
    if (this.targetVolume > 0 && this.audio.muted) this.audio.muted = false;
    if (this.volumeInput) this.volumeInput.value = String(this.targetVolume);
    this.updateVolumeUI();
    this.updateUIState();
  }

  toggleMute(): void {
    if (this.audio.volume > 0 && !this.audio.muted) {
      this.setVolume(0);
    } else {
      this.setVolume(0.5);
      void this.play();
    }
  }

  private toggleVolumePopover(): void {
    this.volWrap?.classList.toggle('is-open');
  }

  private closeVolumePopover(): void {
    this.volWrap?.classList.remove('is-open');
  }

  private updateVolumeUI(): void {
    const pct = Math.round(this.targetVolume * 100);
    if (this.volFill) this.volFill.style.height = `${pct}%`;
    if (this.volNum) this.volNum.textContent = `${pct}%`;
    if (this.volMutedLines) {
      this.volMutedLines.style.display = pct === 0 ? 'block' : 'none';
    }
  }

  // ─── Minimize ───────────────────────────────────────────────────────

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.playerBar?.classList.toggle('is-minimized', this.isMinimized);
    this.dock?.classList.toggle('is-minimized', this.isMinimized);
  }

  // ─── Fullscreen ─────────────────────────────────────────────────────

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API unsupported or blocked — fail silently.
    }
  }

  // ─── UI sync ────────────────────────────────────────────────────────

  private renderWaveform(pct: number): void {
    if (!this.waveBars.length) return;
    const doneCount = Math.round((pct / 100) * this.waveBars.length);
    this.waveBars.forEach((bar, i) => {
      bar.classList.toggle('is-done', i < doneCount);
      bar.classList.toggle('is-active', i === doneCount);
    });
  }

  private updateProgressUI(): void {
    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 0;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    if (this.progressInput && !this.isSeeking) {
      this.progressInput.value = pct.toFixed(1);
    }
    this.renderWaveform(pct);
    if (this.timeCurr) this.timeCurr.textContent = this.formatTime(cur);
    if (this.timeDur) this.timeDur.textContent = dur > 0 ? this.formatTime(dur) : '4:54';
  }

  private updateUIState(): void {
    const active = this.isPlaying && !this.audio.paused;
    this.playerBar?.classList.toggle('is-playing', active);
    this.updateVolumeUI();
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
