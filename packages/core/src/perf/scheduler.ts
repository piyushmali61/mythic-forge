export interface SchedulerHost {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export type RenderMode = 'on-demand' | 'continuous';

export interface FrameInfo {
  now: number;
  /** Seconds since the previous frame, clamped to avoid simulation spirals. */
  dt: number;
  /** Milliseconds since the previous rendered frame (for performance monitoring). */
  intervalMs: number;
}

export const browserSchedulerHost = (): SchedulerHost => ({
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (h) => cancelAnimationFrame(h),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

/**
 * Battery-first frame scheduling.
 *
 * - `on-demand` (editor): renders exactly one frame after `invalidate()`; zero work when nothing changes.
 * - `continuous` (play mode): renders at `targetFps`. Below display rate it sleeps with a timer and
 *   only then asks for an animation frame, so the device isn't woken on every vsync.
 * - `paused` (app hidden/backgrounded): nothing is scheduled at all.
 */
export class FrameScheduler {
  private mode: RenderMode = 'on-demand';
  private paused = false;
  private targetFps = 30;
  private frameHandle: number | null = null;
  private timerHandle: unknown = null;
  private lastFrameAt: number | null = null;
  private pendingInvalidate = false;
  private disposed = false;
  framesRendered = 0;
  private readonly host: SchedulerHost;
  private readonly onFrame: (info: FrameInfo) => void;

  constructor(host: SchedulerHost, onFrame: (info: FrameInfo) => void) {
    this.host = host;
    this.onFrame = onFrame;
  }

  get currentMode(): RenderMode {
    return this.mode;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setMode(mode: RenderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.lastFrameAt = null;
    this.cancelScheduled();
    this.schedule();
  }

  setTargetFps(fps: number): void {
    this.targetFps = Math.max(1, Math.min(240, fps));
    if (this.mode === 'continuous') {
      this.cancelScheduled();
      this.schedule();
    }
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.lastFrameAt = null;
    if (paused) {
      this.cancelScheduled();
    } else {
      // Always redraw once when coming back (the canvas may have been cleared).
      this.pendingInvalidate = true;
      this.schedule();
    }
  }

  /** Requests a redraw in on-demand mode. Multiple calls before the frame coalesce into one. */
  invalidate(): void {
    this.pendingInvalidate = true;
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelScheduled();
  }

  private schedule(): void {
    if (this.disposed || this.paused || this.frameHandle !== null || this.timerHandle !== null) return;
    if (this.mode === 'on-demand') {
      if (this.pendingInvalidate) this.frameHandle = this.host.requestFrame(this.tick);
      return;
    }
    const interval = 1000 / this.targetFps;
    const now = this.host.now();
    const wait = this.lastFrameAt === null ? 0 : this.lastFrameAt + interval - now;
    // Near/above display rate a timer adds jitter, so rely on the frame callback alone.
    if (wait > 6 && this.targetFps < 55) {
      this.timerHandle = this.host.setTimer(() => {
        this.timerHandle = null;
        if (!this.disposed && !this.paused) this.frameHandle = this.host.requestFrame(this.tick);
      }, wait - 4);
    } else {
      this.frameHandle = this.host.requestFrame(this.tick);
    }
  }

  private readonly tick = (): void => {
    this.frameHandle = null;
    if (this.disposed || this.paused) return;
    const now = this.host.now();
    if (this.mode === 'continuous' && this.lastFrameAt !== null) {
      const interval = 1000 / this.targetFps;
      // Allow some vsync jitter; otherwise wait for the next opportunity.
      if (now - this.lastFrameAt < interval * 0.8) {
        this.schedule();
        return;
      }
    }
    const intervalMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    const dt = Math.min(intervalMs, 100) / 1000;
    this.lastFrameAt = now;
    this.pendingInvalidate = false;
    this.framesRendered++;
    try {
      this.onFrame({ now, dt, intervalMs });
    } finally {
      if (this.mode === 'continuous') this.schedule();
      else if (this.pendingInvalidate) this.schedule();
    }
  };

  private cancelScheduled(): void {
    if (this.frameHandle !== null) {
      this.host.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    if (this.timerHandle !== null) {
      this.host.clearTimer(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
