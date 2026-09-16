import { describe, expect, it } from 'vitest';
import {
  AdaptiveQualityGovernor,
  FrameScheduler,
  MAX_RUNG,
  QUALITY_PRESETS,
  classifyDevice,
  evaluateBudgets,
  percentile,
  resolveQuality,
  type GovernorChange,
  type QualityInputs,
  type SchedulerHost,
} from '../src/index.ts';

const inputs = (o: Partial<QualityInputs> = {}): QualityInputs => ({
  deviceTier: 'high',
  isMobile: true,
  batteryMode: 'balanced',
  projectProfile: 'balanced',
  projectCustomLevel: null,
  qualityOverride: 'auto',
  fpsOverride: 'auto',
  lowPowerMode: false,
  ...o,
});

describe('resolveQuality', () => {
  it('balanced mobile caps at medium / 30 FPS', () => {
    const { settings } = resolveQuality(inputs());
    expect(settings.level).toBe('medium');
    expect(settings.targetFps).toBe(30);
  });

  it('battery saver (any source) caps at low / 30 FPS and ignores FPS overrides', () => {
    for (const o of [{ batteryMode: 'max-saving' as const }, { projectProfile: 'battery-saver' as const }, { lowPowerMode: true }]) {
      const { settings, reasons } = resolveQuality(inputs({ ...o, fpsOverride: 120 }));
      expect(settings.level).toBe('low');
      expect(settings.targetFps).toBe(30);
      expect(reasons.length).toBeGreaterThan(1);
    }
  });

  it('performance mode keeps the device tier and targets 60 FPS', () => {
    const { settings } = resolveQuality(inputs({ batteryMode: 'performance' }));
    expect(settings.level).toBe('high');
    expect(settings.targetFps).toBe(60);
  });

  it('respects manual overrides', () => {
    const { settings } = resolveQuality(inputs({ qualityOverride: 'ultra', fpsOverride: 90, isMobile: false }));
    expect(settings.level).toBe('ultra');
    expect(settings.targetFps).toBe(90);
  });

  it('custom project profile cannot exceed the device tier', () => {
    const { settings } = resolveQuality(inputs({ deviceTier: 'low', projectProfile: 'custom', projectCustomLevel: 'ultra' }));
    expect(settings.level).toBe('low');
  });
});

describe('classifyDevice', () => {
  const base = { isMobile: true, memoryGB: 8, cpuCores: 8, gpuRenderer: 'Adreno (TM) 740', maxTextureSize: 16384, webgl2: true };

  it('recognises high, low and software devices', () => {
    expect(classifyDevice(base).tier).toBe('high');
    expect(classifyDevice({ ...base, memoryGB: 2, gpuRenderer: 'Mali-T720' }).tier).toBe('ultra-low');
    expect(classifyDevice({ ...base, gpuRenderer: 'Adreno (TM) 506', memoryGB: 3 }).tier).toBe('low');
    expect(classifyDevice({ ...base, gpuRenderer: 'Google SwiftShader' })).toMatchObject({ tier: 'ultra-low', softwareRendering: true });
    expect(classifyDevice({ ...base, webgl2: false }).tier).toBe('ultra-low');
  });

  it('classifies desktops', () => {
    const d = { ...base, isMobile: false, memoryGB: 8 };
    expect(classifyDevice({ ...d, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)', cpuCores: 16 }).tier).toBe('ultra');
    expect(classifyDevice({ ...d, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11)' }).tier).toBe('high');
    expect(classifyDevice({ ...d, gpuRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11)' }).tier).toBe('low');
    expect(classifyDevice({ ...d, gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' }).tier).toBe('medium');
    expect(classifyDevice({ ...d, gpuRenderer: null }).tier).toBe('medium');
  });
});

describe('AdaptiveQualityGovernor', () => {
  const run = (g: AdaptiveQualityGovernor, frames: number, interval: number, work: number, start: number): number => {
    let t = start;
    for (let i = 0; i < frames; i++) {
      t += interval;
      g.sample(interval, work, t);
    }
    return t;
  };

  it('steps down gradually when frames are late, then recovers', () => {
    const g = new AdaptiveQualityGovernor({ ...QUALITY_PRESETS.high });
    const changes: GovernorChange[] = [];
    g.events.on('change', (c) => changes.push(c));
    let t = run(g, 45, 33, 25, 0); // 60 FPS target, getting 30
    expect(g.currentRung).toBe(1);
    expect(g.current.shadows).toBe('low');
    t = run(g, 45, 33, 25, t); // a fresh window is full, but the 3 s cooldown hasn't passed
    expect(g.currentRung).toBe(1);
    t = run(g, 55, 33, 25, t); // cooldown over → next rung
    expect(g.currentRung).toBe(2);
    expect(g.current.shadows).toBe('off');
    expect(changes.every((c) => c.direction === 'down')).toBe(true);
    // Healthy for a long time with little work → one step back up.
    t = run(g, 900, 16.7, 3, t);
    expect(g.currentRung).toBeLessThan(2);
    expect(changes.at(-1)!.direction).toBe('up');
  });

  it('never goes beyond the last rung', () => {
    const g = new AdaptiveQualityGovernor({ ...QUALITY_PRESETS.ultra }, { cooldownMs: 0 });
    run(g, 45 * (MAX_RUNG + 5), 100, 90, 0);
    expect(g.currentRung).toBe(MAX_RUNG);
    expect(g.current.targetFps).toBe(30);
    expect(g.current.renderScale).toBeLessThanOrEqual(0.55);
  });

  it('reacts to thermal events immediately and blocks recovery while hot', () => {
    const g = new AdaptiveQualityGovernor({ ...QUALITY_PRESETS.high });
    const changes: GovernorChange[] = [];
    g.events.on('change', (c) => changes.push(c));
    g.onThermal('serious', 0);
    expect(g.currentRung).toBe(4);
    expect(changes[0]!.thermal).toBe(true);
    expect(changes[0]!.reason).toMatch(/temperature/);
    run(g, 2000, 16.7, 1, 0);
    expect(g.currentRung).toBe(4);
    g.onThermal('nominal', 40_000);
    run(g, 2000, 16.7, 1, 40_000);
    expect(g.currentRung).toBeLessThan(4);
  });

  it('does nothing when disabled', () => {
    const g = new AdaptiveQualityGovernor({ ...QUALITY_PRESETS.high });
    g.setEnabled(false);
    run(g, 500, 100, 90, 0);
    expect(g.currentRung).toBe(0);
  });
});

class FakeHost implements SchedulerHost {
  time = 0;
  frames: ((t: number) => void)[] = [];
  timers: { at: number; cb: () => void; id: number }[] = [];
  frameRequests = 0;
  private nextId = 1;
  now = () => this.time;
  requestFrame = (cb: (t: number) => void) => {
    this.frameRequests++;
    this.frames.push(cb);
    return this.nextId++;
  };
  cancelFrame = () => {
    this.frames = [];
  };
  setTimer = (cb: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, cb, id });
    return id;
  };
  clearTimer = (h: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== h);
  };
  /** Advance by one 60 Hz vsync. */
  vsync() {
    this.time += 1000 / 60;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.cb();
    const frames = this.frames;
    this.frames = [];
    for (const f of frames) f(this.time);
  }
}

describe('FrameScheduler', () => {
  it('renders nothing while idle in on-demand mode and coalesces invalidations', () => {
    const host = new FakeHost();
    let rendered = 0;
    const s = new FrameScheduler(host, () => rendered++);
    for (let i = 0; i < 300; i++) host.vsync();
    expect(rendered).toBe(0);
    expect(host.frameRequests).toBe(0);
    s.invalidate();
    s.invalidate();
    s.invalidate();
    for (let i = 0; i < 10; i++) host.vsync();
    expect(rendered).toBe(1);
  });

  it('limits continuous mode to the target FPS without waking every vsync', () => {
    const host = new FakeHost();
    let rendered = 0;
    const s = new FrameScheduler(host, () => rendered++);
    s.setTargetFps(30);
    s.setMode('continuous');
    for (let i = 0; i < 600; i++) host.vsync(); // 10 s at 60 Hz
    expect(rendered).toBeGreaterThanOrEqual(280);
    expect(rendered).toBeLessThanOrEqual(305);
    // Timer-based sleeping means far fewer frame callbacks than vsyncs.
    expect(host.frameRequests).toBeLessThan(400);
  });

  it('stops completely when paused and redraws once on resume', () => {
    const host = new FakeHost();
    let rendered = 0;
    const s = new FrameScheduler(host, () => rendered++);
    s.setMode('continuous');
    s.setTargetFps(60);
    for (let i = 0; i < 60; i++) host.vsync();
    const before = rendered;
    s.setPaused(true);
    const requests = host.frameRequests;
    for (let i = 0; i < 600; i++) host.vsync();
    expect(rendered).toBe(before);
    expect(host.frameRequests).toBe(requests);
    s.setMode('on-demand');
    s.setPaused(false);
    for (let i = 0; i < 5; i++) host.vsync();
    expect(rendered).toBe(before + 1);
    s.dispose();
    s.invalidate();
    host.vsync();
    expect(rendered).toBe(before + 1);
  });
});

describe('budgets', () => {
  it('evaluates pass/fail per platform', () => {
    const results = evaluateBudgets({ startup: 1200, fps: 58, idleFrames: 0 }, false);
    expect(results.find((r) => r.budget.id === 'startup')!.pass).toBe(false);
    expect(results.find((r) => r.budget.id === 'fps')!.pass).toBe(true);
    expect(results.find((r) => r.budget.id === 'idleFrames')!.pass).toBe(true);
    expect(results.find((r) => r.budget.id === 'jsHeap')!.pass).toBeNull();
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });
});
