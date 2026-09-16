import type {
  DeviceInfo,
  Lifecycle,
  LifecycleState,
  NetworkInfo,
  PickedFile,
  PowerMonitor,
  PowerState,
  ThermalState,
  UserFiles,
} from '@mythic-forge/core';

// ---- lifecycle ---------------------------------------------------------------------------------

export class WebLifecycle implements Lifecycle {
  private current: LifecycleState;
  private listeners = new Set<(s: LifecycleState) => void>();
  private exitHandlers = new Set<() => void>();

  constructor() {
    this.current = document.visibilityState === 'hidden' ? 'hidden' : 'active';
    document.addEventListener('visibilitychange', () => this.set(document.visibilityState === 'hidden' ? 'hidden' : 'active'));
    // Page Lifecycle API (Chromium): the page may be frozen and later discarded.
    document.addEventListener('freeze', () => {
      this.set('background');
      this.runExitHandlers();
    });
    document.addEventListener('resume', () => this.set(document.visibilityState === 'hidden' ? 'hidden' : 'active'));
    window.addEventListener('pagehide', () => this.runExitHandlers());
  }

  get state(): LifecycleState {
    return this.current;
  }

  /** Native shells feed their own app-state events through here. */
  set(state: LifecycleState): void {
    if (state === this.current) return;
    this.current = state;
    for (const l of this.listeners) l(state);
    if (state !== 'active') this.runExitHandlers();
  }

  subscribe(listener: (state: LifecycleState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onBeforeExit(handler: () => void): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  private runExitHandlers(): void {
    for (const h of this.exitHandlers) {
      try {
        h();
      } catch (error) {
        console.error('[Lifecycle] exit handler failed', error);
      }
    }
  }
}

// ---- power -------------------------------------------------------------------------------------

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

interface PressureRecordLike {
  state: 'nominal' | 'fair' | 'serious' | 'critical';
}

interface PressureObserverLike {
  observe(source: 'cpu', options?: { sampleInterval?: number }): Promise<void>;
  disconnect(): void;
}

type PressureObserverCtor = new (cb: (records: PressureRecordLike[]) => void) => PressureObserverLike;

/**
 * Battery + pressure signals from the browser. Everything is event-driven. The Compute Pressure
 * observer (Chromium desktop) only runs while someone is subscribed — i.e. during play mode.
 */
export class WebPowerMonitor implements PowerMonitor {
  protected current: PowerState = { batteryLevel: null, charging: null, lowPowerMode: null, thermal: 'unknown' };
  private listeners = new Set<(s: PowerState) => void>();
  private pressure: PressureObserverLike | null = null;

  constructor() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    nav
      .getBattery?.()
      .then((battery) => {
        const update = (): void => this.update({ batteryLevel: battery.level, charging: battery.charging });
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
        update();
      })
      .catch(() => undefined);
  }

  get state(): PowerState {
    return this.current;
  }

  subscribe(listener: (state: PowerState) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.startPressure();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stopPressure();
    };
  }

  protected update(patch: Partial<PowerState>): void {
    const next = { ...this.current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    for (const l of this.listeners) l(next);
  }

  protected startPressure(): void {
    const Ctor = (globalThis as unknown as { PressureObserver?: PressureObserverCtor }).PressureObserver;
    if (!Ctor) return;
    try {
      this.pressure = new Ctor((records) => {
        const last = records[records.length - 1];
        if (last) this.update({ thermal: last.state as ThermalState });
      });
      this.pressure.observe('cpu', { sampleInterval: 2000 }).catch(() => {
        this.pressure = null;
      });
    } catch {
      this.pressure = null;
    }
  }

  protected stopPressure(): void {
    this.pressure?.disconnect();
    this.pressure = null;
  }
}

// ---- device ------------------------------------------------------------------------------------

export function readDeviceInfo(platform: DeviceInfo['platform'], isNativeShell: boolean): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const ua = nav.userAgent;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const isMobile =
    platform === 'android' ||
    platform === 'ios' ||
    nav.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|Mobile/i.test(ua) ||
    (coarse && Math.min(screen.width, screen.height) < 820);
  return {
    platform,
    isNativeShell,
    isMobile,
    isTouch: (nav.maxTouchPoints ?? 0) > 0,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cpuCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    screenWidth: screen.width,
    screenHeight: screen.height,
    pixelRatio: window.devicePixelRatio || 1,
    prefersReducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    userAgent: ua,
  };
}

export function detectWebPlatform(): DeviceInfo['platform'] {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad/i.test(ua)) return 'ios';
  return 'web';
}

// ---- files -------------------------------------------------------------------------------------

export class WebUserFiles implements UserFiles {
  pick(options: { accept: string; multiple: boolean }): Promise<PickedFile[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options.accept;
      input.multiple = options.multiple;
      input.style.display = 'none';
      let settled = false;
      const finish = (files: PickedFile[]): void => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(files);
      };
      input.addEventListener('change', () => {
        const list = [...(input.files ?? [])].map(
          (f): PickedFile => ({ name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) }),
        );
        finish(list);
      });
      input.addEventListener('cancel', () => finish([]));
      document.body.appendChild(input);
      input.click();
    });
  }

  async save(name: string, data: Uint8Array, mime: string): Promise<'saved' | 'shared' | 'cancelled'> {
    const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return 'saved';
  }
}

// ---- network -----------------------------------------------------------------------------------

export class WebNetworkInfo implements NetworkInfo {
  private listeners = new Set<(online: boolean) => void>();

  constructor() {
    const emit = (): void => {
      for (const l of this.listeners) l(navigator.onLine);
    };
    window.addEventListener('online', emit);
    window.addEventListener('offline', emit);
  }

  get online(): boolean {
    return navigator.onLine;
  }

  get saveData(): boolean | null {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return typeof conn?.saveData === 'boolean' ? conn.saveData : null;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
