/**
 * Minimal typed event emitter — avoids pulling in a dependency
 * for the handful of cross-module events the app needs
 * (UI -> engine, engine -> UI stats, etc).
 */
export type Listener<T> = (payload: T) => void;

export class EventEmitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((listener) => listener(payload));
  }

  dispose(): void {
    this.listeners = {};
  }
}
