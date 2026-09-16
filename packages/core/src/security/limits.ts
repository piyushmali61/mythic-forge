/**
 * Resource limits for untrusted input. Defaults are conservative for phones;
 * desktop builds may raise them (Settings → Assets → Import limits, developer mode only).
 */
export interface ResourceLimits {
  /** Maximum size of a single imported file. */
  maxImportFileBytes: number;
  /** Maximum number of files selected in one import. */
  maxFilesPerImport: number;
  /** Maximum size of an archive (.mfpack) before extraction. */
  maxArchiveBytes: number;
  /** Maximum total bytes after extraction. */
  maxArchiveExpandedBytes: number;
  /** Maximum number of entries in an archive. */
  maxArchiveEntries: number;
  /** Maximum ratio of expanded/compressed size for one entry (zip-bomb guard). */
  maxCompressionRatio: number;
  /** Maximum width/height of an imported texture. */
  maxTextureDimension: number;
  /** Maximum size of any JSON document (project, scene, metadata, catalog). */
  maxJsonBytes: number;
  /** Maximum number of entities in one scene. */
  maxEntitiesPerScene: number;
  /** Maximum length of user-visible strings (names, descriptions). */
  maxStringLength: number;
  /** Soft cap for derived cache data per device. */
  maxCacheBytes: number;
}

export const MOBILE_LIMITS: ResourceLimits = {
  maxImportFileBytes: 100 * 1024 * 1024,
  maxFilesPerImport: 32,
  maxArchiveBytes: 512 * 1024 * 1024,
  maxArchiveExpandedBytes: 768 * 1024 * 1024,
  maxArchiveEntries: 4096,
  maxCompressionRatio: 200,
  maxTextureDimension: 4096,
  maxJsonBytes: 16 * 1024 * 1024,
  maxEntitiesPerScene: 20_000,
  maxStringLength: 2_000,
  maxCacheBytes: 256 * 1024 * 1024,
};

export const DESKTOP_LIMITS: ResourceLimits = {
  ...MOBILE_LIMITS,
  maxImportFileBytes: 512 * 1024 * 1024,
  maxFilesPerImport: 128,
  maxArchiveBytes: 2 * 1024 * 1024 * 1024,
  maxArchiveExpandedBytes: 3 * 1024 * 1024 * 1024,
  maxArchiveEntries: 16_384,
  maxTextureDimension: 8192,
  maxJsonBytes: 64 * 1024 * 1024,
  maxEntitiesPerScene: 100_000,
  maxCacheBytes: 1024 * 1024 * 1024,
};

/** Hard ceilings that user configuration can never exceed. */
export const ABSOLUTE_LIMITS: ResourceLimits = {
  ...DESKTOP_LIMITS,
  maxImportFileBytes: 2 * 1024 * 1024 * 1024,
  maxTextureDimension: 16_384,
};

export function clampLimits(requested: Partial<ResourceLimits>, base: ResourceLimits): ResourceLimits {
  const out: ResourceLimits = { ...base };
  for (const key of Object.keys(base) as (keyof ResourceLimits)[]) {
    const value = requested[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[key] = Math.min(Math.floor(value), ABSOLUTE_LIMITS[key]);
    }
  }
  return out;
}
