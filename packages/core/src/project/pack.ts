import { validateAssetMeta } from '../assets/meta.ts';
import { log } from '../log/logger.ts';
import type { FileSystem, FsOp } from '../platform/types.ts';
import { createZip, safeUnzip, type ExtractedFile } from '../security/archive.ts';
import type { ResourceLimits } from '../security/limits.ts';
import { validateScene } from '../scene/validate.ts';
import { sha256Hex } from '../util/bytes.ts';
import { UserFacingError } from '../util/errors.ts';
import { createId, isValidId } from '../util/ids.ts';
import { isRecord, parseJsonLimited, stringifyPretty } from '../util/json.ts';
import { ENGINE_VERSION, PACK_FORMAT_VERSION } from '../version.ts';
import { PROJECT_FILE, checkCompatibility, peekVersion, validateManifest } from './manifest.ts';
import { projectDir, type ProjectStore } from './project-store.ts';

export const PACK_EXTENSION = 'mfpack';
const PACK_MANIFEST = 'pack.json';

interface PackManifest {
  format: 'mythic-forge-pack';
  formatVersion: number;
  engineVersion: string;
  projectName: string;
  createdAt: string;
  files: { path: string; size: number; sha256: string }[];
}

const EXCLUDED = [/^cache\//, /^builds\//, /^metadata\/backups\//];

/**
 * Exports a project as a portable `.mfpack` (zip + integrity manifest), used to move
 * projects between phone, laptop and PC. Derived data (cache, builds, backups) is excluded.
 */
export async function exportProjectPack(fs: FileSystem, projectId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  const dir = projectDir(projectId);
  const listed = await fs.list(dir);
  const files: ExtractedFile[] = [];
  const entries: PackManifest['files'] = [];
  let name = 'project';
  for (const f of listed) {
    const rel = f.path.slice(dir.length + 1);
    if (EXCLUDED.some((re) => re.test(rel))) continue;
    const bytes = await fs.readBytes(f.path);
    if (!bytes) continue;
    if (rel === PROJECT_FILE) {
      const raw = parseJsonLimited(bytes, 16 * 1024 * 1024);
      if (isRecord(raw) && typeof raw.name === 'string') name = raw.name;
    }
    files.push({ path: rel, bytes });
    entries.push({ path: rel, size: bytes.byteLength, sha256: await sha256Hex(bytes) });
  }
  if (!entries.some((e) => e.path === PROJECT_FILE)) throw new UserFacingError('project-missing', 'Project not found.');
  const manifest: PackManifest = {
    format: 'mythic-forge-pack',
    formatVersion: PACK_FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    projectName: name,
    createdAt: new Date().toISOString(),
    files: entries,
  };
  files.push({ path: PACK_MANIFEST, bytes: new TextEncoder().encode(stringifyPretty(manifest)) });
  const safeName = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'project';
  return { bytes: createZip(files), fileName: `${safeName}.${PACK_EXTENSION}` };
}

export interface ImportedPack {
  projectId: string;
  name: string;
  warnings: string[];
}

/**
 * Imports an untrusted `.mfpack`. Everything is validated before anything is written:
 * archive safety, integrity hashes, file allow-list, manifest, scenes and asset metadata.
 */
export async function importProjectPack(
  fs: FileSystem,
  store: ProjectStore,
  archive: Uint8Array,
  limits: ResourceLimits,
): Promise<ImportedPack> {
  let files: ExtractedFile[];
  try {
    files = safeUnzip(archive, limits);
  } catch (error) {
    throw new UserFacingError('pack-invalid', 'This file is not a valid or safe Mythic Forge project.', String(error));
  }
  const byPath = new Map(files.map((f) => [f.path, f.bytes]));
  const packRaw = byPath.get(PACK_MANIFEST);
  const pack = packRaw ? parseJsonLimited(packRaw, limits.maxJsonBytes) : null;
  if (!isRecord(pack) || pack.format !== 'mythic-forge-pack' || !Array.isArray(pack.files)) {
    throw new UserFacingError('pack-invalid', 'This file is not a Mythic Forge project package.');
  }
  if (typeof pack.formatVersion !== 'number' || pack.formatVersion > PACK_FORMAT_VERSION) {
    throw new UserFacingError('pack-newer', 'This project package was made by a newer version of Mythic Forge.');
  }

  // Integrity: every listed file must be present with the right hash; nothing unlisted is accepted.
  const listed = new Set<string>();
  for (const entry of pack.files) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      throw new UserFacingError('pack-invalid', 'The project package manifest is damaged.');
    }
    const bytes = byPath.get(entry.path);
    if (!bytes) throw new UserFacingError('pack-incomplete', 'The project package is incomplete.', `Missing ${entry.path}`);
    if ((await sha256Hex(bytes)) !== entry.sha256) {
      throw new UserFacingError('pack-corrupt', 'The project package is corrupted.', `Hash mismatch: ${entry.path}`);
    }
    listed.add(entry.path);
  }
  for (const path of byPath.keys()) {
    if (path !== PACK_MANIFEST && !listed.has(path)) {
      throw new UserFacingError('pack-invalid', 'The project package contains unexpected files.', path);
    }
  }

  // Allowed layout only.
  const warnings: string[] = [];
  for (const path of listed) {
    const ok =
      path === PROJECT_FILE ||
      /^scenes\/[^/]+\.mfscene$/.test(path) ||
      /^assets\/[a-z0-9][a-z0-9_.-]*\/[^/]+$/.test(path) ||
      path === 'metadata/thumbnail.webp';
    if (!ok) throw new UserFacingError('pack-invalid', 'The project package has an unexpected layout.', path);
  }

  const manifestRaw = parseJsonLimited(byPath.get(PROJECT_FILE) ?? new Uint8Array(), limits.maxJsonBytes);
  const version = peekVersion(manifestRaw);
  if (!version) throw new UserFacingError('pack-invalid', 'The project file inside the package is damaged.');
  const compat = checkCompatibility(version.formatVersion, version.engineVersion);
  if (compat.status === 'unsupported') {
    throw new UserFacingError('pack-newer', `This project needs a newer Mythic Forge (${version.engineVersion}).`);
  }
  if (compat.status !== 'needs-upgrade') {
    const manifest = validateManifest(manifestRaw, limits.maxStringLength);
    if (!manifest.ok) throw new UserFacingError('pack-invalid', 'The project file inside the package is damaged.', manifest.errors.join('\n'));
    warnings.push(...manifest.warnings);
    for (const scenePath of manifest.value.scenes) {
      const raw = byPath.get(scenePath);
      if (!raw) throw new UserFacingError('pack-incomplete', 'A scene is missing from the package.', scenePath);
      const scene = validateScene(parseJsonLimited(raw, limits.maxJsonBytes), {
        maxEntities: limits.maxEntitiesPerScene,
        maxStringLength: limits.maxStringLength,
      });
      if (!scene.ok) throw new UserFacingError('pack-invalid', 'A scene in the package is damaged.', scene.errors.join('\n'));
    }
  }

  // Asset metadata must be valid and every listed asset file must exist.
  const assetIds = new Set<string>();
  for (const path of listed) {
    const m = /^assets\/([^/]+)\//.exec(path);
    if (m?.[1]) assetIds.add(m[1]);
  }
  for (const assetId of assetIds) {
    const metaBytes = byPath.get(`assets/${assetId}/asset.meta.json`);
    const meta = validateAssetMeta(metaBytes ? parseJsonLimited(metaBytes, limits.maxJsonBytes) : null, assetId);
    if (!meta.ok) throw new UserFacingError('pack-invalid', 'An asset in the package is damaged.', meta.errors.join('\n'));
    for (const f of meta.value.files) {
      if (!byPath.has(`assets/${assetId}/${f.name}`)) {
        throw new UserFacingError('pack-incomplete', 'An asset file is missing from the package.', f.name);
      }
    }
  }

  // Keep the original id when free (so a project moved between devices keeps its identity).
  const originalId = isRecord(manifestRaw) && isValidId(manifestRaw.id) ? manifestRaw.id : null;
  const projectId = originalId && !(await store.exists(originalId)) ? originalId : createId('p');
  const manifestObj = manifestRaw as Record<string, unknown>;
  let name = typeof manifestObj.name === 'string' ? manifestObj.name : 'Imported Project';
  if (projectId !== originalId) {
    name = `${name} (imported)`.slice(0, 80);
    warnings.push('A project with the same id already exists, so this copy was given a new id.');
  }
  const ops: FsOp[] = [];
  for (const path of listed) {
    if (path === PROJECT_FILE) continue;
    ops.push({ kind: 'write', path: `${projectDir(projectId)}/${path}`, data: byPath.get(path)! });
  }
  const finalManifest = { ...manifestObj, id: projectId, name, archived: false };
  ops.push({ kind: 'write', path: `${projectDir(projectId)}/${PROJECT_FILE}`, data: stringifyPretty(finalManifest) });
  await fs.apply(ops);
  log.info('Projects', `Imported project "${name}".`);
  return { projectId, name, warnings };
}
