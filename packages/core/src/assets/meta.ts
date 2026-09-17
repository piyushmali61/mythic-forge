import { IMPORT_FORMATS, type FileFormat } from '../security/file-types.ts';
import { isSafeRelativePath } from '../security/paths.ts';
import { isValidId } from '../util/ids.ts';
import { isRecord } from '../util/json.ts';
import { Reader, type ValidationResult } from '../validate/reader.ts';
import { readLicenseRecord, readStats } from './records.ts';
import { DEFAULT_IMPORT_SETTINGS, type AssetFileRecord, type ImportSettings, type ProjectAssetMeta } from './types.ts';

const FORMATS = [...new Set(Object.values(IMPORT_FORMATS).map((f) => f.format))] as FileFormat[];

/** Validates `asset.meta.json` from an untrusted project. */
export function validateAssetMeta(input: unknown, expectedId: string): ValidationResult<ProjectAssetMeta> {
  const r = new Reader(1000);
  if (!isRecord(input) || input.format !== 'mythic-forge-asset' || input.formatVersion !== 1) {
    return { ok: false, errors: ['Not a Mythic Forge asset metadata file'], warnings: [] };
  }
  if (!isValidId(input.id) || input.id !== expectedId) {
    return { ok: false, errors: ['Asset id is invalid or does not match its folder'], warnings: [] };
  }
  const files: AssetFileRecord[] = [];
  if (Array.isArray(input.files)) {
    for (const f of input.files.slice(0, 64)) {
      if (!isRecord(f) || typeof f.name !== 'string' || !isSafeRelativePath(f.name) || f.name.includes('/')) {
        r.fail('files', 'invalid file name');
        continue;
      }
      if (f.name === 'asset.meta.json') {
        r.fail('files', 'reserved file name');
        continue;
      }
      files.push({
        name: f.name,
        size: r.int(f.size, 'files.size', 0, 0, Number.MAX_SAFE_INTEGER),
        sha256: typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256) ? f.sha256 : '',
      });
    }
  }
  const mainFile = typeof input.mainFile === 'string' ? input.mainFile : '';
  if (!files.some((f) => f.name === mainFile)) r.fail('mainFile', 'main file is not listed');

  const prov = r.obj(input.provenance, 'provenance');
  const settingsIn = isRecord(input.importSettings) ? input.importSettings : null;
  const importSettings: ImportSettings | null = settingsIn
    ? {
        compressTextures: r.bool(settingsIn.compressTextures, 'importSettings.compressTextures', DEFAULT_IMPORT_SETTINGS.compressTextures),
        textureQuality: r.num(settingsIn.textureQuality, 'importSettings.textureQuality', DEFAULT_IMPORT_SETTINGS.textureQuality, 0.1, 1),
        maxTextureSize: r.int(settingsIn.maxTextureSize, 'importSettings.maxTextureSize', DEFAULT_IMPORT_SETTINGS.maxTextureSize, 16, 16384),
        generateMipmaps: r.bool(settingsIn.generateMipmaps, 'importSettings.generateMipmaps', true),
        optimizeMesh: r.bool(settingsIn.optimizeMesh, 'importSettings.optimizeMesh', true),
        removeUnused: r.bool(settingsIn.removeUnused, 'importSettings.removeUnused', true),
        generateCollider: r.bool(settingsIn.generateCollider, 'importSettings.generateCollider', true),
        // Assets imported before LODs existed have none.
        generateLods: r.bool(settingsIn.generateLods, 'importSettings.generateLods', false),
      }
    : null;

  if (r.errors.length > 0) return { ok: false, errors: r.errors, warnings: r.warnings };
  return {
    ok: true,
    warnings: r.warnings,
    value: {
      format: 'mythic-forge-asset',
      formatVersion: 1,
      id: input.id,
      name: r.str(input.name, 'name', input.id, 120) || input.id,
      kind: r.oneOf(input.kind, 'kind', ['model', 'texture', 'audio'] as const, 'model'),
      fileFormat: r.oneOf(input.fileFormat, 'fileFormat', FORMATS, 'glb'),
      mainFile,
      files,
      importedAt: r.isoDate(input.importedAt, 'importedAt', new Date(0).toISOString()),
      originalBytes: r.int(input.originalBytes, 'originalBytes', 0, 0, Number.MAX_SAFE_INTEGER),
      storedBytes: r.int(input.storedBytes, 'storedBytes', 0, 0, Number.MAX_SAFE_INTEGER),
      provenance: {
        source: r.oneOf(prov.source, 'provenance.source', ['user-import', 'official', 'free-open'] as const, 'user-import'),
        userConfirmedRights: r.bool(prov.userConfirmedRights, 'provenance.userConfirmedRights', false),
        originalFileName: r.str(prov.originalFileName, 'provenance.originalFileName', '', 200),
        catalogId: r.nullableStr(prov.catalogId, 'provenance.catalogId', 64),
        catalogVersion: r.nullableStr(prov.catalogVersion, 'provenance.catalogVersion', 32),
        license: isRecord(prov.license) ? readLicenseRecord(r, prov.license, 'provenance.license') : null,
      },
      importSettings,
      stats: readStats(r, input.stats, 'stats'),
    },
  };
}
