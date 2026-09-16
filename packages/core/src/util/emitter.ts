export type Listener<T> = (event: T) => void;

/** Minimal typed event emitter. A listener that throws does not stop the others. */
export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const stored = listener as Listener<never>;
    set.add(stored);
    return () => {
      set.delete(stored);
    };
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(event);
      } catch (error) {
        console.error(`[Emitter] listener for "${String(type)}" failed`, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
