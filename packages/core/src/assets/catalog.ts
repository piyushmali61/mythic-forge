import type { QualityLevel } from '../perf/profiles.ts';
import { QUALITY_LEVELS } from '../perf/profiles.ts';
import { isSafeRelativePath } from '../security/paths.ts';
import { isValidId } from '../util/ids.ts';
import { isRecord } from '../util/json.ts';
import { Reader } from '../validate/reader.ts';
import { ENGINE_VERSION, compareVersions } from '../version.ts';
import { verifyForPublicDistribution, type AssetLicenseRecord, type LicenseCheck } from './license.ts';
import { readLicenseRecord, readReviewRecord, readStats } from './records.ts';
import { canPublish, isPubliclyAvailable, type ReviewRecord } from './review.ts';
import type { AssetStats } from './types.ts';

export type CatalogSection = 'official' | 'free-open';
export type CatalogKind = 'model' | 'material' | 'texture' | 'audio';
export type CatalogPlatform = 'android' | 'windows' | 'web';

export interface CatalogFile {
  /** Relative to the catalog's base URL. */
  path: string;
  bytes: number;
  sha256: string;
  role: 'main' | 'license' | 'companion';
}

export interface MaterialPresetValues {
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  flatShading: boolean;
}

export interface CatalogEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  section: CatalogSection;
  kind: CatalogKind;
  category: string;
  tags: string[];
  format: string;
  files: CatalogFile[];
  material: MaterialPresetValues | null;
  stats: AssetStats;
  compatibility: {
    minEngineVersion: string;
    platforms: CatalogPlatform[];
    /** Lowest quality tier the asset is suitable for. */
    minQuality: QualityLevel;
  };
  license: AssetLicenseRecord;
  review: ReviewRecord;
  /** Older versions still downloadable (projects are never silently upgraded). */
  previousVersions: string[];
}

export interface Catalog {
  format: 'mythic-forge-catalog';
  formatVersion: 1;
  publisher: string;
  generatedAt: string;
  entries: CatalogEntry[];
}

export interface CatalogParseResult {
  catalog: Catalog;
  rejected: { id: string; reasons: string[] }[];
  warnings: string[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+(\.\d+)?$/;

/** Parses a catalog from untrusted JSON (bundled file or remote repository). */
export function parseCatalog(input: unknown): CatalogParseResult {
  const r = new Reader(4000);
  const rejected: CatalogParseResult['rejected'] = [];
  if (!isRecord(input) || input.format !== 'mythic-forge-catalog' || input.formatVersion !== 1) {
    return {
      catalog: { format: 'mythic-forge-catalog', formatVersion: 1, publisher: '', generatedAt: '', entries: [] },
      rejected: [{ id: '(catalog)', reasons: ['Not a supported Mythic Forge catalog'] }],
      warnings: [],
    };
  }
  const entries: CatalogEntry[] = [];
  const rawEntries = Array.isArray(input.entries) ? input.entries.slice(0, 10_000) : [];
  const seen = new Set<string>();
  rawEntries.forEach((raw, i) => {
    const path = `entries[${i}]`;
    if (!isRecord(raw) || !isValidId(raw.id)) {
      rejected.push({ id: `#${i}`, reasons: ['invalid id'] });
      return;
    }
    const reasons: string[] = [];
    const version = r.str(raw.version, `${path}.version`, '', 32);
    if (!SEMVER.test(version)) reasons.push('invalid version');
    const key = `${raw.id}@${version}`;
    if (seen.has(key)) reasons.push('duplicate id/version');
    seen.add(key);

    const files: CatalogFile[] = [];
    if (Array.isArray(raw.files)) {
      for (const f of raw.files.slice(0, 64)) {
        if (!isRecord(f) || typeof f.path !== 'string' || !isSafeRelativePath(f.path)) {
          reasons.push('unsafe or invalid file path');
          continue;
        }
        if (typeof f.sha256 !== 'string' || !SHA256.test(f.sha256)) {
          reasons.push(`missing sha256 for ${f.path}`);
          continue;
        }
        files.push({
          path: f.path,
          bytes: r.int(f.bytes, `${path}.files.bytes`, 0, 0, Number.MAX_SAFE_INTEGER),
          sha256: f.sha256,
          role: r.oneOf(f.role, `${path}.files.role`, ['main', 'license', 'companion'] as const, 'companion'),
        });
      }
    }
    const kind = r.oneOf(raw.kind, `${path}.kind`, ['model', 'material', 'texture', 'audio'] as const, 'model');
    if (kind !== 'material' && !files.some((f) => f.role === 'main')) reasons.push('no main file');

    let material: MaterialPresetValues | null = null;
    if (kind === 'material') {
      const m = r.obj(raw.material, `${path}.material`);
      material = {
        color: r.color(m.color, `${path}.material.color`, '#cccccc'),
        metalness: r.num(m.metalness, `${path}.material.metalness`, 0, 0, 1),
        roughness: r.num(m.roughness, `${path}.material.roughness`, 0.7, 0, 1),
        emissive: r.color(m.emissive, `${path}.material.emissive`, '#000000'),
        emissiveIntensity: r.num(m.emissiveIntensity, `${path}.material.emissiveIntensity`, 0, 0, 100),
        flatShading: r.bool(m.flatShading, `${path}.material.flatShading`, false),
      };
    }
    const compat = r.obj(raw.compatibility, `${path}.compatibility`);
    const platforms = r
      .strArray(compat.platforms, `${path}.compatibility.platforms`, 8)
      .filter((p): p is CatalogPlatform => p === 'android' || p === 'windows' || p === 'web');

    if (reasons.length > 0) {
      rejected.push({ id: raw.id, reasons });
      return;
    }
    entries.push({
      id: raw.id,
      version,
      name: r.str(raw.name, `${path}.name`, raw.id, 120),
      description: r.str(raw.description, `${path}.description`, '', 1000),
      section: r.oneOf(raw.section, `${path}.section`, ['official', 'free-open'] as const, 'official'),
      kind,
      category: r.str(raw.category, `${path}.category`, 'Props', 60),
      tags: r.strArray(raw.tags, `${path}.tags`, 20, 40),
      format: r.str(raw.format, `${path}.format`, '', 16),
      files,
      material,
      stats: readStats(r, raw.stats, `${path}.stats`),
      compatibility: {
        minEngineVersion: r.str(compat.minEngineVersion, `${path}.compatibility.minEngineVersion`, '0.0.0', 32),
        platforms,
        minQuality: r.oneOf(compat.minQuality, `${path}.compatibility.minQuality`, QUALITY_LEVELS, 'ultra-low'),
      },
      license: readLicenseRecord(r, raw.license, `${path}.license`),
      review: readReviewRecord(r, raw.review, `${path}.review`),
      previousVersions: r.strArray(raw.previousVersions, `${path}.previousVersions`, 50, 32),
    });
  });

  return {
    catalog: {
      format: 'mythic-forge-catalog',
      formatVersion: 1,
      publisher: r.str(input.publisher, 'publisher', '', 200),
      generatedAt: r.str(input.generatedAt, 'generatedAt', '', 40),
      entries,
    },
    rejected,
    warnings: r.warnings,
  };
}

export function isEngineCompatible(entry: CatalogEntry, engineVersion = ENGINE_VERSION): boolean {
  return compareVersions(entry.compatibility.minEngineVersion, engineVersion) <= 0;
}

/**
 * Entries the app may show and offer for download. Defence in depth: even if a catalog
 * marks an entry as published, it is hidden unless the licence gate passes here too.
 */
export function publicEntries(catalog: Catalog): CatalogEntry[] {
  return catalog.entries.filter((e) => isPubliclyAvailable(e.license, e.review) && isEngineCompatible(e));
}

export interface AuditRow {
  id: string;
  version: string;
  name: string;
  section: CatalogSection;
  stage: string;
  publishable: boolean;
  published: boolean;
  failures: LicenseCheck[];
  reviewGaps: string[];
}

/** Full audit used by `npm run audit:licenses` and the internal review tooling. */
export function auditCatalog(catalog: Catalog): AuditRow[] {
  return catalog.entries.map((e) => {
    const verdict = verifyForPublicDistribution(e.license);
    const reviewGaps: string[] = [];
    if (!e.review.licenseVerified) reviewGaps.push('licence review not completed');
    if (!e.review.contentReview) reviewGaps.push('content review not completed');
    if (!e.review.technicalReview) reviewGaps.push('technical review not completed');
    if (!e.license.redistributionAllowed) reviewGaps.push('redistribution not allowed');
    if (e.section === 'official' && e.license.owner !== 'Mythic Bharat Studios' && e.license.licenseId === 'MBS-ASSET-1.0') {
      reviewGaps.push('official MBS-licensed asset must be owned by Mythic Bharat Studios');
    }
    return {
      id: e.id,
      version: e.version,
      name: e.name,
      section: e.section,
      stage: e.review.stage,
      publishable: canPublish(e.license, e.review),
      published: e.review.stage === 'published',
      failures: verdict.failures,
      reviewGaps,
    };
  });
}
