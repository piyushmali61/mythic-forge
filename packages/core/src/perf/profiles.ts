export const QUALITY_LEVELS = ['ultra-low', 'low', 'medium', 'high', 'ultra'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const SHADOW_QUALITIES = ['off', 'low', 'medium', 'high'] as const;
export type ShadowQuality = (typeof SHADOW_QUALITIES)[number];

export const FPS_OPTIONS = [30, 45, 60, 90, 120] as const;

export type BatteryMode = 'max-saving' | 'balanced' | 'performance';
export const PERFORMANCE_PROFILES = ['battery-saver', 'balanced', 'performance', 'custom'] as const;
export type PerformanceProfileId = (typeof PERFORMANCE_PROFILES)[number];

/**
 * Settings that the renderer actually applies. Settings for features that don't exist yet
 * (post-processing, particles, LOD) are intentionally absent — see docs/performance.md.
 */
export interface QualitySettings {
  level: QualityLevel;
  /** Multiplier applied to the (capped) device pixel ratio. */
  renderScale: number;
  maxPixelRatio: number;
  shadows: ShadowQuality;
  /** Textures larger than this are downscaled on load. */
  textureMaxSize: number;
  /** Applied when the renderer is created (requires a viewport restart). */
  antialias: boolean;
  /** Environment-map reflections on metallic/smooth materials. */
  reflections: boolean;
  /** Scene fog. */
  ambientEffects: boolean;
  /** Camera far-plane cap in metres. */
  drawDistance: number;
  /** Play-mode frame-rate cap. The editor renders on demand regardless. */
  targetFps: number;
}

export const SHADOW_MAP_SIZE: Record<ShadowQuality, number> = { off: 0, low: 512, medium: 1024, high: 2048 };

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualitySettings>> = {
  'ultra-low': {
    level: 'ultra-low',
    renderScale: 0.6,
    maxPixelRatio: 1,
    shadows: 'off',
    textureMaxSize: 512,
    antialias: false,
    reflections: false,
    ambientEffects: false,
    drawDistance: 120,
    targetFps: 30,
  },
  low: {
    level: 'low',
    renderScale: 0.8,
    maxPixelRatio: 1,
    shadows: 'off',
    textureMaxSize: 1024,
    antialias: false,
    reflections: false,
    ambientEffects: true,
    drawDistance: 200,
    targetFps: 30,
  },
  medium: {
    level: 'medium',
    renderScale: 1,
    maxPixelRatio: 1.5,
    shadows: 'low',
    textureMaxSize: 2048,
    antialias: false,
    reflections: false,
    ambientEffects: true,
    drawDistance: 350,
    targetFps: 30,
  },
  high: {
    level: 'high',
    renderScale: 1,
    maxPixelRatio: 2,
    shadows: 'medium',
    textureMaxSize: 4096,
    antialias: true,
    reflections: true,
    ambientEffects: true,
    drawDistance: 600,
    targetFps: 60,
  },
  ultra: {
    level: 'ultra',
    renderScale: 1,
    maxPixelRatio: 2.5,
    shadows: 'high',
    textureMaxSize: 8192,
    antialias: true,
    reflections: true,
    ambientEffects: true,
    drawDistance: 1000,
    targetFps: 60,
  },
};

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  'ultra-low': 'Ultra Low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};

export const levelIndex = (level: QualityLevel): number => QUALITY_LEVELS.indexOf(level);
export const minLevel = (a: QualityLevel, b: QualityLevel): QualityLevel => (levelIndex(a) <= levelIndex(b) ? a : b);

export interface QualityInputs {
  /** Result of device classification. */
  deviceTier: QualityLevel;
  isMobile: boolean;
  batteryMode: BatteryMode;
  projectProfile: PerformanceProfileId;
  /** Project "custom" profile level, used when projectProfile is 'custom'. */
  projectCustomLevel: QualityLevel | null;
  /** User override from Settings → Graphics. */
  qualityOverride: QualityLevel | 'auto';
  fpsOverride: number | 'auto';
  /** OS battery saver active. */
  lowPowerMode: boolean;
}

export interface ResolvedQuality {
  settings: QualitySettings;
  /** Human-readable explanation of why these settings were chosen. */
  reasons: string[];
}

/** Combines device capability, user preferences and project profile into concrete settings. */
export function resolveQuality(input: QualityInputs): ResolvedQuality {
  const reasons: string[] = [];
  let level: QualityLevel = input.deviceTier;
  reasons.push(`Device tier: ${QUALITY_LABELS[input.deviceTier]}`);

  if (input.qualityOverride !== 'auto') {
    level = input.qualityOverride;
    reasons.push(`Quality set manually to ${QUALITY_LABELS[level]}`);
  } else if (input.projectProfile === 'custom' && input.projectCustomLevel) {
    level = minLevel(input.projectCustomLevel, input.deviceTier);
    reasons.push(`Project custom profile: ${QUALITY_LABELS[input.projectCustomLevel]}`);
  }

  const saving = input.batteryMode === 'max-saving' || input.projectProfile === 'battery-saver' || input.lowPowerMode;
  let fps: number;
  if (saving) {
    level = minLevel(level, 'low');
    fps = 30;
    reasons.push(
      input.lowPowerMode
        ? 'System battery saver is on'
        : input.batteryMode === 'max-saving'
          ? 'Battery mode: Maximum Battery Saving'
          : 'Project profile: Battery Saver',
    );
  } else if (input.batteryMode === 'performance' || input.projectProfile === 'performance') {
    fps = 60;
    reasons.push('Performance mode');
  } else {
    if (input.qualityOverride === 'auto') level = minLevel(level, input.isMobile ? 'medium' : 'high');
    fps = input.isMobile ? 30 : 60;
    reasons.push('Balanced mode');
  }

  if (input.fpsOverride !== 'auto' && !saving) {
    fps = input.fpsOverride;
    reasons.push(`Frame rate set manually to ${fps} FPS`);
  }

  return { settings: { ...QUALITY_PRESETS[level], targetFps: fps }, reasons };
}
