import { PERFORMANCE_PROFILES, QUALITY_LEVELS, type PerformanceProfileId, type QualityLevel } from '../perf/profiles.ts';
import { isSafeRelativePath } from '../security/paths.ts';
import { isValidId } from '../util/ids.ts';
import { isRecord } from '../util/json.ts';
import { Reader, type ValidationResult } from '../validate/reader.ts';
import {
  ENGINE_VERSION,
  PROJECT_FORMAT_VERSION,
  RENDERER_VERSION,
  compareVersions,
} from '../version.ts';

export const PROJECT_TYPES = ['3d-game', '2d-game', '3d-experience', 'empty'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const TARGET_PLATFORMS = ['android', 'windows'] as const;
export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  '3d-game': '3D Game',
  '2d-game': '2D Game',
  '3d-experience': '3D Interactive Experience',
  empty: 'Empty Project',
};

export const PROJECT_FILE = 'project.mfproj';
export const SCENE_EXTENSION = '.mfscene';

export interface ProjectManifest {
  format: 'mythic-forge-project';
  formatVersion: number;
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  targets: TargetPlatform[];
  performanceProfile: PerformanceProfileId;
  customQuality: QualityLevel | null;
  template: string;
  /** 2D projects lock the editor camera to an orthographic front view. */
  editorMode: '3d' | '2d';
  /** Engine version that last saved the project. */
  engineVersion: string;
  createdWithEngineVersion: string;
  rendererVersion: number;
  createdAt: string;
  modifiedAt: string;
  /** Relative path of the scene opened first. */
  startScene: string;
  scenes: string[];
  archived: boolean;
}

export type Compatibility =
  | { status: 'current' }
  /** Same format, saved by an older engine: opens normally, with a notice. */
  | { status: 'older-engine'; savedWith: string }
  /** Same format, saved by a newer engine: opens, but newer-only data may be dropped on save. */
  | { status: 'newer-engine'; savedWith: string }
  /** Older format: must be migrated (after a backup) before editing. */
  | { status: 'needs-upgrade'; fromFormat: number; toFormat: number; savedWith: string }
  /** Newer format: cannot be opened by this version. */
  | { status: 'unsupported'; savedWith: string; formatVersion: number };

/** Decides how an existing project can be opened (§57). */
export function checkCompatibility(formatVersion: number, savedWith: string): Compatibility {
  if (formatVersion > PROJECT_FORMAT_VERSION) return { status: 'unsupported', savedWith, formatVersion };
  if (formatVersion < PROJECT_FORMAT_VERSION) {
    return { status: 'needs-upgrade', fromFormat: formatVersion, toFormat: PROJECT_FORMAT_VERSION, savedWith };
  }
  const cmp = compareVersions(savedWith, ENGINE_VERSION);
  if (cmp < 0) return { status: 'older-engine', savedWith };
  if (cmp > 0) return { status: 'newer-engine', savedWith };
  return { status: 'current' };
}

/** Reads only the version fields, before full validation (so old formats can be migrated first). */
export function peekVersion(input: unknown): { formatVersion: number; engineVersion: string } | null {
  if (!isRecord(input) || input.format !== 'mythic-forge-project') return null;
  const fv = input.formatVersion;
  if (typeof fv !== 'number' || !Number.isInteger(fv) || fv < 0) return null;
  const ev = typeof input.engineVersion === 'string' ? input.engineVersion : '0.0.0';
  return { formatVersion: fv, engineVersion: ev };
}

/** Validates a manifest that is already at the current format version. */
export function validateManifest(input: unknown, maxString = 2000): ValidationResult<ProjectManifest> {
  const r = new Reader(maxString);
  if (!isRecord(input) || input.format !== 'mythic-forge-project') {
    return { ok: false, errors: ['Not a Mythic Forge project file'], warnings: [] };
  }
  if (input.formatVersion !== PROJECT_FORMAT_VERSION) {
    return { ok: false, errors: [`Unsupported project format version ${String(input.formatVersion)}`], warnings: [] };
  }
  if (!isValidId(input.id)) r.fail('id', 'invalid project id');
  const now = new Date().toISOString();
  const scenes = r.strArray(input.scenes, 'scenes', 256, 240).filter((s) => isSafeRelativePath(s) && s.startsWith('scenes/'));
  const startScene = typeof input.startScene === 'string' && scenes.includes(input.startScene) ? input.startScene : scenes[0];
  if (!startScene) r.fail('scenes', 'project has no valid scenes');
  const targets = r.strArray(input.targets, 'targets', 4).filter((t): t is TargetPlatform =>
    (TARGET_PLATFORMS as readonly string[]).includes(t),
  );
  const customQuality =
    input.customQuality === null || input.customQuality === undefined
      ? null
      : r.oneOf(input.customQuality, 'customQuality', QUALITY_LEVELS, 'medium');

  if (r.errors.length > 0) return { ok: false, errors: r.errors, warnings: r.warnings };
  return {
    ok: true,
    warnings: r.warnings,
    value: {
      format: 'mythic-forge-project',
      formatVersion: PROJECT_FORMAT_VERSION,
      id: input.id as string,
      name: r.str(input.name, 'name', 'Untitled Project', 80).trim() || 'Untitled Project',
      description: r.str(input.description, 'description', '', 500),
      type: r.oneOf(input.type, 'type', PROJECT_TYPES, '3d-game'),
      targets: targets.length > 0 ? targets : ['android', 'windows'],
      performanceProfile: r.oneOf(input.performanceProfile, 'performanceProfile', PERFORMANCE_PROFILES, 'balanced'),
      customQuality,
      template: r.str(input.template, 'template', 'empty', 64),
      editorMode: r.oneOf(input.editorMode, 'editorMode', ['3d', '2d'] as const, '3d'),
      engineVersion: r.str(input.engineVersion, 'engineVersion', ENGINE_VERSION, 32),
      createdWithEngineVersion: r.str(input.createdWithEngineVersion, 'createdWithEngineVersion', ENGINE_VERSION, 32),
      rendererVersion: r.int(input.rendererVersion, 'rendererVersion', RENDERER_VERSION, 0, 1000),
      createdAt: r.isoDate(input.createdAt, 'createdAt', now),
      modifiedAt: r.isoDate(input.modifiedAt, 'modifiedAt', now),
      startScene: startScene!,
      scenes,
      archived: r.bool(input.archived, 'archived', false),
    },
  };
}

// ---- migrations ------------------------------------------------------------------------------

export interface ProjectMigration {
  from: number;
  to: number;
  description: string;
  migrateManifest(manifest: Record<string, unknown>): Record<string, unknown>;
  /** Optional per-scene transform. */
  migrateScene?(scene: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Registered migrations. Format 1 is the first public format, so the list is empty today.
 * When bumping PROJECT_FORMAT_VERSION, append a migration here and a test for it.
 */
export const PROJECT_MIGRATIONS: ProjectMigration[] = [];

export function planMigrations(from: number, to: number, registry: readonly ProjectMigration[] = PROJECT_MIGRATIONS): ProjectMigration[] | null {
  const plan: ProjectMigration[] = [];
  let v = from;
  while (v < to) {
    const step = registry.find((m) => m.from === v);
    if (!step || step.to <= v) return null;
    plan.push(step);
    v = step.to;
  }
  return v === to ? plan : null;
}

export function applyMigrations(
  manifest: Record<string, unknown>,
  scenes: Record<string, Record<string, unknown>>,
  plan: readonly ProjectMigration[],
): { manifest: Record<string, unknown>; scenes: Record<string, Record<string, unknown>> } {
  let m = structuredClone(manifest);
  let s = structuredClone(scenes);
  for (const step of plan) {
    m = { ...step.migrateManifest(m), formatVersion: step.to };
    if (step.migrateScene) {
      const next: Record<string, Record<string, unknown>> = {};
      for (const [path, scene] of Object.entries(s)) next[path] = step.migrateScene(scene);
      s = next;
    }
  }
  return { manifest: m, scenes: s };
}
