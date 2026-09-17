import type { ThermalState } from '../platform/types.ts';
import { Emitter } from '../util/emitter.ts';
import { SHADOW_QUALITIES, type QualitySettings } from './profiles.ts';

interface Rung {
  label: string;
  apply(s: QualitySettings): QualitySettings;
}

/** Degradation ladder, cheapest-to-notice first. Each rung builds on the previous ones. */
const LADDER: readonly Rung[] = [
  {
    label: 'Lowered shadow quality',
    apply: (s) => ({ ...s, shadows: SHADOW_QUALITIES[Math.max(0, SHADOW_QUALITIES.indexOf(s.shadows) - 1)]! }),
  },
  { label: 'Turned off shadows', apply: (s) => ({ ...s, shadows: 'off' }) },
  { label: 'Turned off reflections', apply: (s) => ({ ...s, reflections: false }) },
  { label: 'Reduced render resolution', apply: (s) => ({ ...s, renderScale: Math.min(s.renderScale, 0.85) }) },
  { label: 'Reduced render resolution', apply: (s) => ({ ...s, renderScale: Math.min(s.renderScale, 0.7) }) },
  { label: 'Reduced draw distance', apply: (s) => ({ ...s, drawDistance: Math.min(s.drawDistance, 150) }) },
  { label: 'Switched to simpler models sooner', apply: (s) => ({ ...s, lodDistance: Math.min(s.lodDistance, 0.5) }) },
  { label: 'Reduced render resolution', apply: (s) => ({ ...s, renderScale: Math.min(s.renderScale, 0.55), maxPixelRatio: 1 }) },
  { label: 'Limited frame rate to 30 FPS', apply: (s) => ({ ...s, targetFps: Math.min(s.targetFps, 30) }) },
];

export const MAX_RUNG = LADDER.length;

export interface GovernorOptions {
  /** Frames in the rolling window. */
  windowSize: number;
  /** A frame is "slow" when its interval exceeds target × this factor. */
  slowFactor: number;
  /** Downshift when this fraction of the window is slow. */
  slowFraction: number;
  /** Upshift only after this long without trouble. */
  upshiftAfterMs: number;
  /** Minimum time between two changes. */
  cooldownMs: number;
  /** Work time must be below this fraction of the frame budget to upshift. */
  upshiftWorkFraction: number;
}

export interface GovernorChange {
  settings: QualitySettings;
  rung: number;
  direction: 'down' | 'up';
  reason: string;
  thermal: boolean;
}

/**
 * Adaptive quality: gradually lowers quality when frames are late and restores it when there is
 * sustained headroom. Thermal signals from the OS push quality down and block upshifts.
 * It only receives samples while the game loop runs, so it costs nothing when idle.
 */
export class AdaptiveQualityGovernor {
  readonly events = new Emitter<{ change: GovernorChange }>();
  private base: QualitySettings;
  private rung = 0;
  private intervals: number[] = [];
  private works: number[] = [];
  private lastChangeAt = -Infinity;
  private troubleFreeSince = 0;
  private thermal: ThermalState = 'nominal';
  private thermalFloor = 0;
  private enabled = true;
  private readonly options: GovernorOptions;

  constructor(base: QualitySettings, options: Partial<GovernorOptions> = {}) {
    this.base = base;
    this.options = {
      windowSize: 45,
      slowFactor: 1.35,
      slowFraction: 0.25,
      upshiftAfterMs: 12_000,
      cooldownMs: 3_000,
      upshiftWorkFraction: 0.5,
      ...options,
    };
  }

  get current(): QualitySettings {
    return this.settingsAt(this.rung);
  }

  get currentRung(): number {
    return this.rung;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetWindow();
  }

  /** New base settings (profile/quality changed). Keeps the thermal floor. */
  reset(base: QualitySettings, now = 0): void {
    this.base = base;
    this.rung = this.thermalFloor;
    this.resetWindow();
    this.troubleFreeSince = now;
  }

  /**
   * @param intervalMs time since the previous rendered frame
   * @param workMs CPU time spent producing this frame
   */
  sample(intervalMs: number, workMs: number, now: number): void {
    if (!this.enabled) return;
    const { windowSize, slowFactor, slowFraction, cooldownMs, upshiftAfterMs, upshiftWorkFraction } = this.options;
    this.intervals.push(intervalMs);
    this.works.push(workMs);
    if (this.intervals.length > windowSize) {
      this.intervals.shift();
      this.works.shift();
    }
    if (this.intervals.length < windowSize) return;
    const target = 1000 / this.current.targetFps;
    const slow = this.intervals.filter((i) => i > target * slowFactor).length / this.intervals.length;
    const sinceChange = now - this.lastChangeAt;

    if (slow >= slowFraction) {
      this.troubleFreeSince = now;
      if (sinceChange >= cooldownMs && this.rung < MAX_RUNG) {
        this.move(this.rung + 1, now, 'down', false);
      }
      return;
    }
    const avgWork = this.works.reduce((a, b) => a + b, 0) / this.works.length;
    const canUpshift =
      this.rung > this.thermalFloor &&
      this.thermal !== 'fair' &&
      now - this.troubleFreeSince >= upshiftAfterMs &&
      sinceChange >= upshiftAfterMs &&
      avgWork < (1000 / this.settingsAt(this.rung - 1).targetFps) * upshiftWorkFraction;
    if (canUpshift) {
      this.move(this.rung - 1, now, 'up', false);
      this.troubleFreeSince = now;
    }
  }

  /** Event-driven thermal input from the platform (never polled). */
  onThermal(state: ThermalState, now: number): void {
    this.thermal = state;
    const floor = state === 'critical' ? MAX_RUNG : state === 'serious' ? Math.min(MAX_RUNG, 4) : 0;
    this.thermalFloor = floor;
    if (this.rung < floor) this.move(floor, now, 'down', true);
  }

  private settingsAt(rung: number): QualitySettings {
    let s = { ...this.base };
    for (let i = 0; i < rung && i < LADDER.length; i++) s = LADDER[i]!.apply(s);
    return s;
  }

  private move(to: number, now: number, direction: 'down' | 'up', thermal: boolean): void {
    if (to === this.rung) return;
    const from = this.rung;
    this.rung = to;
    this.lastChangeAt = now;
    this.resetWindow();
    const reason = thermal
      ? 'Performance has been reduced to manage device temperature.'
      : direction === 'down'
        ? `${LADDER[Math.min(to, LADDER.length) - 1]?.label ?? 'Reduced quality'} to keep the game smooth.`
        : `Restored quality (${LADDER[from - 1]?.label.toLowerCase() ?? 'quality'} undone).`;
    this.events.emit('change', { settings: this.current, rung: to, direction, reason, thermal });
  }

  private resetWindow(): void {
    this.intervals = [];
    this.works = [];
  }
}
