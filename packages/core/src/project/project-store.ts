import { validateAssetMeta } from '../assets/meta.ts';
import type { AssetKind, AssetProvenance, AssetStats, ImportSettings, ProjectAssetMeta } from '../assets/types.ts';
import { log } from '../log/logger.ts';
import type { PerformanceProfileId, QualityLevel } from '../perf/profiles.ts';
import type { FileSystem, FsOp } from '../platform/types.ts';
import type { FileFormat } from '../security/file-types.ts';
import type { ResourceLimits } from '../security/limits.ts';
import { sanitizeFileName } from '../security/paths.ts';
import { getTemplate } from '../scene/templates.ts';
import type { SceneDocument } from '../scene/types.ts';
import { validateScene } from '../scene/validate.ts';
import { sha256Hex } from '../util/bytes.ts';
import { UserFacingError } from '../util/errors.ts';
import { createId, isValidId } from '../util/ids.ts';
import { deepClone, isRecord, parseJsonLimited, stringifyPretty } from '../util/json.ts';
import { ENGINE_VERSION, PROJECT_FORMAT_VERSION, RENDERER_VERSION } from '../version.ts';
import {
  PROJECT_FILE,
  PROJECT_TYPES,
  applyMigrations,
  checkCompatibility,
  peekVersion,
  planMigrations,
  validateManifest,
  type Compatibility,
  type ProjectManifest,
  type ProjectType,
  type TargetPlatform,
} from './manifest.ts';

export const PROJECTS_ROOT = 'projects';
const MAX_BACKUPS = 3;
const MAIN_SCENE = 'scenes/main.mfscene';

export const projectDir = (id: string): string => `${PROJECTS_ROOT}/${id}`;

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  targets: TargetPlatform[];
  template: string;
  engineVersion: string;
  createdAt: string;
  modifiedAt: string;
  archived: boolean;
  sizeBytes: number;
  hasThumbnail: boolean;
  compatibility: Compatibility;
  /** Set when the manifest could not be read. */
  error: string | null;
}

export interface NewAssetInput {
  id?: string;
  name: string;
  kind: AssetKind;
  fileFormat: FileFormat;
  mainFile: string;
  files: { name: string; bytes: Uint8Array }[];
  originalBytes: number;
  provenance: AssetProvenance;
  importSettings: ImportSettings | null;
  stats: AssetStats;
}

export interface CreateProjectOptions {
  name: string;
  description?: string;
  type: ProjectType;
  targets: TargetPlatform[];
  performanceProfile: PerformanceProfileId;
  customQuality?: QualityLevel | null;
  templateId: string;
  /** Library assets to copy in (e.g. those a template requires). */
  assets?: NewAssetInput[];
}

export type OpenResult =
  | {
      ok: true;
      manifest: ProjectManifest;
      scenePath: string;
      scene: SceneDocument;
      compatibility: Compatibility;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'not-found' | 'corrupt' | 'unsupported' | 'needs-upgrade';
      message: string;
      compatibility?: Compatibility;
      details: string[];
    };

export interface BackupInfo {
  id: string;
  createdAt: string;
}

const clampName = (name: string): string => name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) || 'Untitled Project';

/** `20260917T102233123Z` — sortable and safe as a folder name. */
export const backupStamp = (d: Date): string => d.toISOString().replace(/[-:.]/g, '');

export function parseBackupStamp(id: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z` : '';
}

/**
 * Reads and writes projects on a platform file system. Every multi-file change is a single
 * atomic `apply`, so a crash can never leave a half-written project behind.
 */
export class ProjectStore {
  private readonly fs: FileSystem;
  private readonly limits: ResourceLimits;

  constructor(fs: FileSystem, limits: ResourceLimits) {
    this.fs = fs;
    this.limits = limits;
  }

  // ---- listing ------------------------------------------------------------------------------

  async list(): Promise<ProjectSummary[]> {
    const files = await this.fs.list(PROJECTS_ROOT);
    const byProject = new Map<string, { size: number; hasManifest: boolean; hasThumb: boolean }>();
    for (const f of files) {
      const rest = f.path.slice(PROJECTS_ROOT.length + 1);
      const slash = rest.indexOf('/');
      if (slash < 0) continue;
      const id = rest.slice(0, slash);
      const rel = rest.slice(slash + 1);
      const entry = byProject.get(id) ?? { size: 0, hasManifest: false, hasThumb: false };
      entry.size += f.size;
      if (rel === PROJECT_FILE) entry.hasManifest = true;
      if (rel === 'metadata/thumbnail.webp') entry.hasThumb = true;
      byProject.set(id, entry);
    }
    const out: ProjectSummary[] = [];
    for (const [id, info] of byProject) {
      if (!info.hasManifest || !isValidId(id)) continue;
      out.push(await this.summarize(id, info.size, info.hasThumb));
    }
    return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  private async summarize(id: string, sizeBytes: number, hasThumbnail: boolean): Promise<ProjectSummary> {
    const base: ProjectSummary = {
      id,
      name: id,
      description: '',
      type: 'empty',
      targets: [],
      template: '',
      engineVersion: '?',
      createdAt: '',
      modifiedAt: '',
      archived: false,
      sizeBytes,
      hasThumbnail,
      compatibility: { status: 'current' },
      error: null,
    };
    try {
      const raw = await this.readJson(`${projectDir(id)}/${PROJECT_FILE}`);
      const version = peekVersion(raw);
      if (!version || !isRecord(raw)) return { ...base, error: 'The project file is damaged.' };
      const compatibility = checkCompatibility(version.formatVersion, version.engineVersion);
      const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
      return {
        ...base,
        name: clampName(str(raw.name, id)),
        description: str(raw.description, '').slice(0, 200),
        type: (PROJECT_TYPES as readonly string[]).includes(str(raw.type, '')) ? (raw.type as ProjectType) : 'empty',
        targets: Array.isArray(raw.targets) ? (raw.targets.filter((t) => t === 'android' || t === 'windows') as TargetPlatform[]) : [],
        template: str(raw.template, ''),
        engineVersion: version.engineVersion,
        createdAt: str(raw.createdAt, ''),
        modifiedAt: str(raw.modifiedAt, ''),
        archived: raw.archived === true,
        compatibility,
      };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : 'Unreadable project' };
    }
  }

  async exists(id: string): Promise<boolean> {
    return isValidId(id) && (await this.fs.stat(`${projectDir(id)}/${PROJECT_FILE}`)) !== null;
  }

  async sizeOf(id: string): Promise<number> {
    const files = await this.fs.list(projectDir(id));
    return files.reduce((sum, f) => sum + f.size, 0);
  }

  // ---- create / open / save -------------------------------------------------------------------

  async create(options: CreateProjectOptions): Promise<{ manifest: ProjectManifest; scene: SceneDocument }> {
    const template = getTemplate(options.templateId) ?? getTemplate('empty')!;
    const id = createId('p');
    const dir = projectDir(id);
    const ops: FsOp[] = [];
    const assetIds = new Map<string, string>();
    for (const asset of options.assets ?? []) {
      const { meta, ops: assetOps } = await this.prepareAsset(dir, asset);
      ops.push(...assetOps);
      if (asset.provenance.catalogId) assetIds.set(asset.provenance.catalogId, meta.id);
    }
    const scene = template.build({ assetIdFor: (catalogId) => assetIds.get(catalogId) ?? null });
    const now = new Date().toISOString();
    const manifest: ProjectManifest = {
      format: 'mythic-forge-project',
      formatVersion: PROJECT_FORMAT_VERSION,
      id,
      name: clampName(options.name),
      description: (options.description ?? '').slice(0, 500),
      type: options.type,
      targets: options.targets.length ? options.targets : ['android', 'windows'],
      performanceProfile: options.performanceProfile,
      customQuality: options.customQuality ?? null,
      template: template.id,
      editorMode: template.editorMode,
      engineVersion: ENGINE_VERSION,
      createdWithEngineVersion: ENGINE_VERSION,
      rendererVersion: RENDERER_VERSION,
      createdAt: now,
      modifiedAt: now,
      startScene: MAIN_SCENE,
      scenes: [MAIN_SCENE],
      archived: false,
    };
    ops.push({ kind: 'write', path: `${dir}/${MAIN_SCENE}`, data: stringifyPretty(scene) });
    // Manifest last: a project "exists" once its manifest exists.
    ops.push({ kind: 'write', path: `${dir}/${PROJECT_FILE}`, data: stringifyPretty(manifest) });
    await this.fs.apply(ops);
    log.info('Projects', `Created project "${manifest.name}" from template "${template.name}".`);
    return { manifest, scene };
  }

  async open(id: string, scenePath?: string): Promise<OpenResult> {
    if (!isValidId(id)) return { ok: false, reason: 'not-found', message: 'Project not found.', details: [] };
    const dir = projectDir(id);
    let raw: unknown;
    try {
      raw = await this.readJson(`${dir}/${PROJECT_FILE}`);
    } catch (error) {
      return { ok: false, reason: 'corrupt', message: 'The project file is too large or unreadable.', details: [String(error)] };
    }
    if (raw === null) return { ok: false, reason: 'not-found', message: 'Project not found.', details: [] };
    const version = peekVersion(raw);
    if (!version) return { ok: false, reason: 'corrupt', message: 'The project file is damaged.', details: [] };
    const compatibility = checkCompatibility(version.formatVersion, version.engineVersion);
    if (compatibility.status === 'unsupported') {
      return {
        ok: false,
        reason: 'unsupported',
        compatibility,
        message: `This project was created with a newer version of Mythic Forge (${version.engineVersion}). Please update the app to open it.`,
        details: [],
      };
    }
    if (compatibility.status === 'needs-upgrade') {
      return {
        ok: false,
        reason: 'needs-upgrade',
        compatibility,
        message: 'This project was created using an older version of Mythic Forge.',
        details: [],
      };
    }
    const manifestResult = validateManifest(raw, this.limits.maxStringLength);
    if (!manifestResult.ok) {
      return { ok: false, reason: 'corrupt', message: 'The project file is damaged.', details: manifestResult.errors };
    }
    const manifest = manifestResult.value;
    const path = scenePath && manifest.scenes.includes(scenePath) ? scenePath : manifest.startScene;
    let sceneRaw: unknown;
    try {
      sceneRaw = await this.readJson(`${dir}/${path}`);
    } catch (error) {
      return { ok: false, reason: 'corrupt', message: 'The scene file is too large or unreadable.', details: [String(error)] };
    }
    const sceneResult = validateScene(sceneRaw, {
      maxEntities: this.limits.maxEntitiesPerScene,
      maxStringLength: this.limits.maxStringLength,
    });
    if (!sceneResult.ok) {
      return { ok: false, reason: 'corrupt', message: 'The scene could not be loaded.', details: sceneResult.errors };
    }
    return {
      ok: true,
      manifest,
      scenePath: path,
      scene: sceneResult.value,
      compatibility,
      warnings: [...manifestResult.warnings, ...sceneResult.warnings],
    };
  }

  /**
   * Saves the manifest and one scene atomically. When `backup` is true, the previously saved
   * version is kept under metadata/backups (the newest MAX_BACKUPS are retained).
   */
  async save(manifest: ProjectManifest, scenePath: string, scene: SceneDocument, options: { backup: boolean } = { backup: true }): Promise<ProjectManifest> {
    const dir = projectDir(manifest.id);
    if (!manifest.scenes.includes(scenePath)) throw new Error(`Scene ${scenePath} is not part of the project`);
    const next: ProjectManifest = {
      ...deepClone(manifest),
      formatVersion: PROJECT_FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      rendererVersion: RENDERER_VERSION,
      modifiedAt: new Date().toISOString(),
    };
    const ops: FsOp[] = [];
    if (options.backup) ops.push(...(await this.backupOps(manifest.id, 'save')));
    ops.push({ kind: 'write', path: `${dir}/${scenePath}`, data: stringifyPretty(scene) });
    ops.push({ kind: 'write', path: `${dir}/${PROJECT_FILE}`, data: stringifyPretty(next) });
    await this.fs.apply(ops);
    return next;
  }

  async updateManifest(id: string, patch: (m: ProjectManifest) => ProjectManifest): Promise<ProjectManifest> {
    const result = await this.open(id);
    if (!result.ok) throw new UserFacingError('project-unavailable', result.message, result.details.join('\n'));
    const next = { ...patch(result.manifest), modifiedAt: new Date().toISOString() };
    await this.fs.apply([{ kind: 'write', path: `${projectDir(id)}/${PROJECT_FILE}`, data: stringifyPretty(next) }]);
    return next;
  }

  async rename(id: string, name: string): Promise<ProjectManifest> {
    return this.updateManifest(id, (m) => ({ ...m, name: clampName(name) }));
  }

  async setArchived(id: string, archived: boolean): Promise<ProjectManifest> {
    return this.updateManifest(id, (m) => ({ ...m, archived }));
  }

  async duplicate(id: string, newName: string): Promise<string> {
    if (!(await this.exists(id))) throw new UserFacingError('project-missing', 'Project not found.');
    const newId = createId('p');
    const files = await this.fs.list(projectDir(id));
    const ops: FsOp[] = [];
    let manifestText: string | null = null;
    for (const f of files) {
      const rel = f.path.slice(projectDir(id).length + 1);
      if (rel.startsWith('cache/') || rel.startsWith('metadata/backups/') || rel.startsWith('builds/')) continue;
      if (rel === PROJECT_FILE) {
        manifestText = await this.fs.readText(f.path);
        continue;
      }
      const bytes = await this.fs.readBytes(f.path);
      if (bytes) ops.push({ kind: 'write', path: `${projectDir(newId)}/${rel}`, data: bytes });
    }
    const manifest = manifestText ? (JSON.parse(manifestText) as Record<string, unknown>) : null;
    if (!manifest) throw new UserFacingError('project-corrupt', 'The project file is damaged.');
    const now = new Date().toISOString();
    Object.assign(manifest, { id: newId, name: clampName(newName), createdAt: now, modifiedAt: now, archived: false });
    ops.push({ kind: 'write', path: `${projectDir(newId)}/${PROJECT_FILE}`, data: stringifyPretty(manifest) });
    await this.fs.apply(ops);
    return newId;
  }

  async delete(id: string): Promise<void> {
    if (!isValidId(id)) return;
    await this.fs.apply([{ kind: 'delete-prefix', prefix: projectDir(id) }]);
    log.info('Projects', 'Project deleted.');
  }

  /** Removes derived data only. Original assets and scenes are never touched. */
  async clearCache(id: string): Promise<void> {
    await this.fs.apply([{ kind: 'delete-prefix', prefix: `${projectDir(id)}/cache` }]);
  }

  // ---- backups & migration --------------------------------------------------------------------

  private async backupOps(id: string, reason: string): Promise<FsOp[]> {
    const dir = projectDir(id);
    const stamp = `${backupStamp(new Date())}-${reason.replace(/[^a-z0-9-]/gi, '')}`;
    const ops: FsOp[] = [];
    const current = await this.fs.list(dir);
    for (const f of current) {
      const rel = f.path.slice(dir.length + 1);
      if (rel === PROJECT_FILE || rel.startsWith('scenes/')) {
        const bytes = await this.fs.readBytes(f.path);
        if (bytes) ops.push({ kind: 'write', path: `${dir}/metadata/backups/${stamp}/${rel}`, data: bytes });
      }
    }
    if (ops.length === 0) return [];
    const existing = await this.listBackups(id);
    for (const old of existing.slice(MAX_BACKUPS - 1)) {
      ops.push({ kind: 'delete-prefix', prefix: `${dir}/metadata/backups/${old.id}` });
    }
    return ops;
  }

  async createBackup(id: string, reason = 'manual'): Promise<void> {
    const ops = await this.backupOps(id, reason);
    if (ops.length) await this.fs.apply(ops);
  }

  /** Newest first. */
  async listBackups(id: string): Promise<BackupInfo[]> {
    const prefix = `${projectDir(id)}/metadata/backups`;
    const files = await this.fs.list(prefix);
    const ids = new Set<string>();
    for (const f of files) {
      const name = f.path.slice(prefix.length + 1).split('/')[0];
      if (name) ids.add(name);
    }
    return [...ids]
      .sort()
      .reverse()
      .map((b) => ({ id: b, createdAt: parseBackupStamp(b) }));
  }

  async restoreBackup(id: string, backupId: string): Promise<void> {
    const dir = projectDir(id);
    const prefix = `${dir}/metadata/backups/${backupId}`;
    const files = await this.fs.list(prefix);
    if (files.length === 0) throw new UserFacingError('backup-missing', 'That backup no longer exists.');
    const ops: FsOp[] = [...(await this.backupOps(id, 'before-restore'))];
    for (const f of files) {
      const bytes = await this.fs.readBytes(f.path);
      if (bytes) ops.push({ kind: 'write', path: `${dir}/${f.path.slice(prefix.length + 1)}`, data: bytes });
    }
    await this.fs.apply(ops);
  }

  /** Backs up, then migrates an older-format project to the current format (§57). */
  async upgrade(id: string): Promise<void> {
    const dir = projectDir(id);
    const raw = await this.readJson(`${dir}/${PROJECT_FILE}`);
    const version = peekVersion(raw);
    if (!version || !isRecord(raw)) throw new UserFacingError('project-corrupt', 'The project file is damaged.');
    const plan = planMigrations(version.formatVersion, PROJECT_FORMAT_VERSION);
    if (!plan) {
      throw new UserFacingError(
        'no-migration',
        'This project format is too old to upgrade automatically.',
        `No migration path from format ${version.formatVersion} to ${PROJECT_FORMAT_VERSION}.`,
      );
    }
    const sceneFiles = (await this.fs.list(`${dir}/scenes`)).map((f) => f.path);
    const scenes: Record<string, Record<string, unknown>> = {};
    for (const path of sceneFiles) {
      const s = await this.readJson(path);
      if (isRecord(s)) scenes[path] = s;
    }
    const migrated = applyMigrations(raw, scenes, plan);
    const ops: FsOp[] = [...(await this.backupOps(id, `pre-upgrade-v${version.formatVersion}`))];
    for (const [path, scene] of Object.entries(migrated.scenes)) ops.push({ kind: 'write', path, data: stringifyPretty(scene) });
    ops.push({ kind: 'write', path: `${dir}/${PROJECT_FILE}`, data: stringifyPretty(migrated.manifest) });
    await this.fs.apply(ops);
  }

  // ---- assets ----------------------------------------------------------------------------------

  private async prepareAsset(dir: string, input: NewAssetInput): Promise<{ meta: ProjectAssetMeta; ops: FsOp[] }> {
    const id = input.id && isValidId(input.id) ? input.id : createId('a');
    const ops: FsOp[] = [];
    const files = [];
    let stored = 0;
    const names = new Set<string>();
    for (const f of input.files) {
      const name = sanitizeFileName(f.name, 'file');
      if (name === 'asset.meta.json' || names.has(name.toLowerCase())) {
        throw new UserFacingError('asset-files', 'The asset contains duplicate or reserved file names.');
      }
      names.add(name.toLowerCase());
      files.push({ name, size: f.bytes.byteLength, sha256: await sha256Hex(f.bytes) });
      stored += f.bytes.byteLength;
      ops.push({ kind: 'write', path: `${dir}/assets/${id}/${name}`, data: f.bytes });
    }
    const mainFile = sanitizeFileName(input.mainFile, 'file');
    if (!names.has(mainFile.toLowerCase())) throw new UserFacingError('asset-files', 'The asset is missing its main file.');
    const meta: ProjectAssetMeta = {
      format: 'mythic-forge-asset',
      formatVersion: 1,
      id,
      name: input.name.trim().slice(0, 120) || 'Asset',
      kind: input.kind,
      fileFormat: input.fileFormat,
      mainFile,
      files,
      importedAt: new Date().toISOString(),
      originalBytes: input.originalBytes,
      storedBytes: stored,
      provenance: input.provenance,
      importSettings: input.importSettings,
      stats: input.stats,
    };
    ops.push({ kind: 'write', path: `${dir}/assets/${id}/asset.meta.json`, data: stringifyPretty(meta) });
    return { meta, ops };
  }

  /**
   * Adds an asset to a project. If an identical file from the same source is already present,
   * the existing asset is returned instead of storing a duplicate.
   */
  async addAsset(projectId: string, input: NewAssetInput): Promise<{ meta: ProjectAssetMeta; deduplicated: boolean }> {
    const main = input.files.find((f) => sanitizeFileName(f.name) === sanitizeFileName(input.mainFile));
    if (main) {
      const hash = await sha256Hex(main.bytes);
      for (const existing of await this.listAssets(projectId)) {
        const existingMain = existing.files.find((f) => f.name === existing.mainFile);
        if (
          existingMain?.sha256 === hash &&
          existing.provenance.source === input.provenance.source &&
          existing.provenance.catalogVersion === input.provenance.catalogVersion
        ) {
          return { meta: existing, deduplicated: true };
        }
      }
    }
    const { meta, ops } = await this.prepareAsset(projectDir(projectId), input);
    await this.fs.apply(ops);
    log.info('Assets', `Added "${meta.name}" to the project.`);
    return { meta, deduplicated: false };
  }

  async listAssets(projectId: string): Promise<ProjectAssetMeta[]> {
    const prefix = `${projectDir(projectId)}/assets`;
    const files = await this.fs.list(prefix);
    const out: ProjectAssetMeta[] = [];
    for (const f of files) {
      if (!f.path.endsWith('/asset.meta.json')) continue;
      const assetId = f.path.slice(prefix.length + 1).split('/')[0] ?? '';
      const raw = await this.readJson(f.path).catch(() => null);
      const result = validateAssetMeta(raw, assetId);
      if (result.ok) out.push(result.value);
      else log.warn('Assets', `Skipped damaged asset metadata (${assetId}).`, result.errors.join('\n'));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAsset(projectId: string, assetId: string): Promise<ProjectAssetMeta | null> {
    if (!isValidId(assetId)) return null;
    const raw = await this.readJson(`${projectDir(projectId)}/assets/${assetId}/asset.meta.json`).catch(() => null);
    const result = validateAssetMeta(raw, assetId);
    return result.ok ? result.value : null;
  }

  async readAssetFile(projectId: string, assetId: string, fileName?: string): Promise<Uint8Array | null> {
    const meta = await this.getAsset(projectId, assetId);
    if (!meta) return null;
    const name = fileName ?? meta.mainFile;
    if (!meta.files.some((f) => f.name === name)) return null;
    return this.fs.readBytes(`${projectDir(projectId)}/assets/${assetId}/${name}`);
  }

  async removeAsset(projectId: string, assetId: string): Promise<void> {
    if (!isValidId(assetId)) return;
    await this.fs.apply([{ kind: 'delete-prefix', prefix: `${projectDir(projectId)}/assets/${assetId}` }]);
  }

  async writeThumbnail(projectId: string, bytes: Uint8Array): Promise<void> {
    await this.fs.apply([{ kind: 'write', path: `${projectDir(projectId)}/metadata/thumbnail.webp`, data: bytes }]);
  }

  async readThumbnail(projectId: string): Promise<Uint8Array | null> {
    return this.fs.readBytes(`${projectDir(projectId)}/metadata/thumbnail.webp`);
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private async readJson(path: string): Promise<unknown> {
    const bytes = await this.fs.readBytes(path);
    if (!bytes) return null;
    return parseJsonLimited(bytes, this.limits.maxJsonBytes);
  }
}
