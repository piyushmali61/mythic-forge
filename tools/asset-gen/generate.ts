/**
 * Builds the asset packs served with the app:
 *   assets/<pack>/catalog.source.json  (hand-maintained metadata, licence & review records)
 *   → apps/editor/public/asset-packs/<pack>/catalog.json + model files + licence texts
 *
 * Usage: npm run assets:generate
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCatalog, parseCatalog, stringifyPretty } from '../../packages/core/src/index.ts';
import { writeGlb } from './glb-writer.ts';
import { MODEL_BUILDERS } from './models.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = join(ROOT, 'apps', 'editor', 'public', 'asset-packs');
const COPYRIGHT = 'Copyright (c) 2026 Mythic Bharat Studios. Licensed under MBS-ASSET-1.0.';

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

interface SourceEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  kind: 'model' | 'material';
  category: string;
  tags: string[];
  material?: Record<string, unknown>;
  review: Record<string, unknown>;
  verification?: Record<string, unknown>;
  license?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  section?: string;
}

interface SourceCatalog {
  publisher: string;
  defaults: { section: string; compatibility: Record<string, unknown>; license?: Record<string, unknown> };
  entries: SourceEntry[];
}

export function buildPack(pack: 'official' | 'free-open'): { entries: number; rejected: number } {
  const sourcePath = join(ROOT, 'assets', pack, 'catalog.source.json');
  const sourceText = readFileSync(sourcePath, 'utf8');
  const source = JSON.parse(sourceText) as SourceCatalog;
  const outDir = join(OUT_ROOT, pack);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'models'), { recursive: true });

  const licenseFiles = new Map<string, { bytes: number; sha256: string }>();
  const addLicense = (relPath: string): { bytes: number; sha256: string } => {
    let info = licenseFiles.get(relPath);
    if (!info) {
      const src = join(ROOT, 'assets', relPath);
      const dest = join(outDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      const bytes = readFileSync(src);
      info = { bytes: bytes.byteLength, sha256: sha256(bytes) };
      licenseFiles.set(relPath, info);
    }
    return info;
  };

  const entries = source.entries.map((e) => {
    const license = {
      ...(source.defaults.license ?? {}),
      ...(e.license ?? {}),
      ...(e.verification ?? {}),
      assetId: e.id,
      name: e.name,
      assetVersion: e.version,
    } as Record<string, unknown>;
    const files: { path: string; bytes: number; sha256: string; role: string }[] = [];
    let stats: Record<string, unknown> = {};
    let format = 'material';
    if (e.kind === 'model') {
      const builder = MODEL_BUILDERS[e.id];
      if (!builder) throw new Error(`No model builder for ${e.id}`);
      const { bytes, stats: s } = writeGlb(e.name, builder(), COPYRIGHT);
      const rel = `models/${e.id}.glb`;
      writeFileSync(join(outDir, rel), bytes);
      files.push({ path: rel, bytes: bytes.byteLength, sha256: sha256(bytes), role: 'main' });
      stats = { ...s, meshes: 1, textures: 0, animations: 0, bones: 0 };
      format = 'glb';
    }
    const licensePath = license.licenseTextPath;
    if (typeof licensePath === 'string' && licensePath) {
      const info = addLicense(licensePath);
      files.push({ path: licensePath, ...info, role: 'license' });
    }
    return {
      id: e.id,
      version: e.version,
      name: e.name,
      description: e.description,
      section: e.section ?? source.defaults.section,
      kind: e.kind,
      category: e.category,
      tags: e.tags,
      format,
      files,
      material: e.material ?? null,
      stats,
      compatibility: { ...source.defaults.compatibility, ...(e.compatibility ?? {}) },
      license,
      review: e.review,
      previousVersions: [],
    };
  });

  const catalog = {
    format: 'mythic-forge-catalog',
    formatVersion: 1,
    publisher: source.publisher,
    generatedAt: '',
    sourceSha256: sha256(sourceText),
    entries,
  };
  // The app parses this with the same validator; make sure nothing gets rejected.
  const parsed = parseCatalog(JSON.parse(JSON.stringify(catalog)));
  if (parsed.rejected.length) {
    throw new Error(`Generated ${pack} catalog has invalid entries: ${JSON.stringify(parsed.rejected)}`);
  }
  writeFileSync(join(outDir, 'catalog.json'), stringifyPretty(catalog));
  const audit = auditCatalog(parsed.catalog);
  const publishable = audit.filter((a) => a.publishable).length;
  console.log(`[asset-gen] ${pack}: ${entries.length} entries written (${publishable} publishable, ${entries.length - publishable} awaiting review)`);
  for (const e of entries) {
    if (e.kind === 'model') {
      const s = e.stats as { triangles: number; boundsMin: number[]; boundsMax: number[] };
      const size = s.boundsMax.map((v, i) => (v - s.boundsMin[i]!).toFixed(2)).join(' × ');
      console.log(`  ${e.id.padEnd(22)} ${String(e.files[0]!.bytes).padStart(7)} B  ${String(s.triangles).padStart(5)} tris  ${size} m`);
    }
  }
  return { entries: entries.length, rejected: parsed.rejected.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildPack('official');
  buildPack('free-open');
}
