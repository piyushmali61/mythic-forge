import { FPS_OPTIONS, QUALITY_LEVELS, type BatteryMode, type QualityLevel } from '../perf/profiles.ts';
import { isRecord } from '../util/json.ts';
import { Reader } from '../validate/reader.ts';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type ReducedMotionSetting = 'system' | 'on' | 'off';
export type AutosaveInterval = 0 | 5 | 10 | 15;

export interface AppSettings {
  version: 1;
  general: {
    firstRunComplete: boolean;
    theme: ThemeSetting;
    confirmDestructive: boolean;
  };
  editor: {
    autosaveMinutes: AutosaveInterval;
    showGrid: boolean;
    gizmoSize: number;
    snapTranslate: number;
    snapRotate: number;
    historyLimit: number;
  };
  graphics: {
    quality: QualityLevel | 'auto';
    targetFps: number | 'auto';
    editorPreviewQuality: 'low' | 'full';
  };
  performance: {
    adaptiveQuality: boolean;
    showOverlay: boolean;
  };
  battery: {
    mode: BatteryMode;
    /** Keep rendering while the app is in the background. Off by default and discouraged. */
    backgroundRendering: boolean;
    thumbnailQuality: 'off' | 'low' | 'medium';
    /** When importing, heavy processing only starts after the user presses Import. */
    assetProcessing: 'on-demand';
  };
  network: {
    /** Master switch for every network request (asset repository, documentation links). */
    allowNetwork: boolean;
    /** Pause downloads while the OS reports a data-saver connection. */
    respectDataSaver: boolean;
  };
  accessibility: {
    uiScale: number;
    largeText: boolean;
    highContrast: boolean;
    reducedMotion: ReducedMotionSetting;
  };
  developer: {
    /** Shows technical error details and verbose logs. */
    devMode: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  general: { firstRunComplete: false, theme: 'dark', confirmDestructive: true },
  editor: { autosaveMinutes: 5, showGrid: true, gizmoSize: 1, snapTranslate: 0, snapRotate: 0, historyLimit: 200 },
  graphics: { quality: 'auto', targetFps: 'auto', editorPreviewQuality: 'full' },
  performance: { adaptiveQuality: true, showOverlay: false },
  battery: { mode: 'balanced', backgroundRendering: false, thumbnailQuality: 'low', assetProcessing: 'on-demand' },
  network: { allowNetwork: true, respectDataSaver: true },
  accessibility: { uiScale: 1, largeText: false, highContrast: false, reducedMotion: 'system' },
  developer: { devMode: false },
};

const AUTOSAVE: readonly AutosaveInterval[] = [0, 5, 10, 15];

/** Reads settings from storage, repairing anything invalid with defaults. */
export function normalizeSettings(input: unknown): AppSettings {
  const d = DEFAULT_SETTINGS;
  if (!isRecord(input)) return structuredClone(d);
  const r = new Reader(200);
  const g = r.obj(input.general, 'general');
  const e = r.obj(input.editor, 'editor');
  const gr = r.obj(input.graphics, 'graphics');
  const p = r.obj(input.performance, 'performance');
  const b = r.obj(input.battery, 'battery');
  const n = r.obj(input.network, 'network');
  const a = r.obj(input.accessibility, 'accessibility');
  const dev = r.obj(input.developer, 'developer');
  const fps = gr.targetFps === 'auto' || gr.targetFps === undefined
    ? 'auto'
    : (FPS_OPTIONS as readonly number[]).includes(gr.targetFps as number)
      ? (gr.targetFps as number)
      : 'auto';
  const autosave = AUTOSAVE.includes(e.autosaveMinutes as AutosaveInterval)
    ? (e.autosaveMinutes as AutosaveInterval)
    : d.editor.autosaveMinutes;
  return {
    version: 1,
    general: {
      firstRunComplete: r.bool(g.firstRunComplete, 'g', d.general.firstRunComplete),
      theme: r.oneOf(g.theme, 'g', ['dark', 'light', 'system'] as const, d.general.theme),
      confirmDestructive: r.bool(g.confirmDestructive, 'g', d.general.confirmDestructive),
    },
    editor: {
      autosaveMinutes: autosave,
      showGrid: r.bool(e.showGrid, 'e', d.editor.showGrid),
      gizmoSize: r.num(e.gizmoSize, 'e', d.editor.gizmoSize, 0.5, 3),
      snapTranslate: r.num(e.snapTranslate, 'e', d.editor.snapTranslate, 0, 100),
      snapRotate: r.num(e.snapRotate, 'e', d.editor.snapRotate, 0, 90),
      historyLimit: r.int(e.historyLimit, 'e', d.editor.historyLimit, 20, 1000),
    },
    graphics: {
      quality: gr.quality === 'auto' ? 'auto' : r.oneOf(gr.quality, 'gr', QUALITY_LEVELS, 'medium'),
      targetFps: fps,
      editorPreviewQuality: r.oneOf(gr.editorPreviewQuality, 'gr', ['low', 'full'] as const, d.graphics.editorPreviewQuality),
    },
    performance: {
      adaptiveQuality: r.bool(p.adaptiveQuality, 'p', d.performance.adaptiveQuality),
      showOverlay: r.bool(p.showOverlay, 'p', d.performance.showOverlay),
    },
    battery: {
      mode: r.oneOf(b.mode, 'b', ['max-saving', 'balanced', 'performance'] as const, d.battery.mode),
      backgroundRendering: r.bool(b.backgroundRendering, 'b', d.battery.backgroundRendering),
      thumbnailQuality: r.oneOf(b.thumbnailQuality, 'b', ['off', 'low', 'medium'] as const, d.battery.thumbnailQuality),
      assetProcessing: 'on-demand',
    },
    network: {
      allowNetwork: r.bool(n.allowNetwork, 'n', d.network.allowNetwork),
      respectDataSaver: r.bool(n.respectDataSaver, 'n', d.network.respectDataSaver),
    },
    accessibility: {
      uiScale: r.num(a.uiScale, 'a', d.accessibility.uiScale, 0.8, 1.6),
      largeText: r.bool(a.largeText, 'a', d.accessibility.largeText),
      highContrast: r.bool(a.highContrast, 'a', d.accessibility.highContrast),
      reducedMotion: r.oneOf(a.reducedMotion, 'a', ['system', 'on', 'off'] as const, d.accessibility.reducedMotion),
    },
    developer: { devMode: r.bool(dev.devMode, 'dev', d.developer.devMode) },
  };
}
