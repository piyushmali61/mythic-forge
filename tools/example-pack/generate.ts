/**
 * Generates the reference demo project:
 *   - examples/shrine-of-lamps.mfpack (portable archive ready to import into Mythic Forge)
 *   - examples/shrine-of-lamps/ (unpacked project directory for reference)
 *
 * Usage: node tools/example-pack/generate.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESKTOP_LIMITS,
  MemoryFileSystem,
  OFFICIAL_ASSETS,
  ProjectStore,
  getTemplate,
  exportProjectPack,
  projectDir,
  type Catalog,
  type NewAssetInput,
} from '../../packages/core/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OFFICIAL_DIR = join(ROOT, 'apps', 'editor', 'public', 'asset-packs', 'official');
const EXAMPLES_DIR = join(ROOT, 'examples');
const OUT_DIR = join(EXAMPLES_DIR, 'shrine-of-lamps');
const OUT_PACK = join(EXAMPLES_DIR, 'shrine-of-lamps.mfpack');

async function main(): Promise<void> {
  console.log('[example-pack] Generating reference demo project: Shrine of Lamps…');

  const fs = new MemoryFileSystem();
  const store = new ProjectStore(fs, DESKTOP_LIMITS);

  // Read official catalog
  const catalogText = readFileSync(join(OFFICIAL_DIR, 'catalog.json'), 'utf8');
  const catalog = JSON.parse(catalogText) as Catalog;

  const { manifest } = await store.create({
    name: 'Shrine of Lamps',
    type: '3d-game',
    targets: ['android', 'windows'],
    performanceProfile: 'balanced',
    templateId: 'empty',
  });

  const assetMap = new Map<string, string>();

  // Add the official models needed by the shrine template
  for (const entry of catalog.entries) {
    if (entry.kind !== 'model') continue;
    const mainFile = entry.files.find((f) => f.role === 'main');
    if (!mainFile) continue;

    const glbBytes = readFileSync(join(OFFICIAL_DIR, mainFile.path));
    const fileName = `${entry.id}.glb`;

    const input: NewAssetInput = {
      name: entry.name,
      kind: 'model',
      fileFormat: 'glb',
      mainFile: fileName,
      files: [{ name: fileName, bytes: glbBytes }],
      originalBytes: glbBytes.byteLength,
      provenance: {
        source: 'official',
        userConfirmedRights: true,
        originalFileName: fileName,
        catalogId: entry.id,
        catalogVersion: entry.version,
        license: entry.license,
      },
      importSettings: null,
      stats: entry.stats as Record<string, unknown>,
    };

    const { meta } = await store.addAsset(manifest.id, input);
    assetMap.set(entry.id, meta.id);
  }

  // Build template scene with resolved asset ids
  const template = getTemplate('shrine-of-lamps');
  if (!template) throw new Error('shrine-of-lamps template not found');
  const scene = template.build({
    assetIdFor(catalogId: string): string | null {
      return assetMap.get(catalogId) ?? null;
    },
  });

  // Save the project with the populated scene
  const updated = await store.save(manifest, manifest.startScene, scene);

  // Export .mfpack
  const { bytes: packBytes } = await exportProjectPack(fs, updated.id);

  mkdirSync(EXAMPLES_DIR, { recursive: true });
  writeFileSync(OUT_PACK, packBytes);
  console.log(`[example-pack] Created ${OUT_PACK} (${packBytes.byteLength} bytes)`);

  // Also write the unpacked project tree into examples/shrine-of-lamps/
  rmSync(OUT_DIR, { recursive: true, force: true });
  const pDir = projectDir(updated.id);
  const files = await fs.list(pDir);

  for (const f of files) {
    const rel = f.path.slice(pDir.length + 1);
    if (rel.startsWith('cache/') || rel.startsWith('metadata/backups/')) continue;
    const dest = join(OUT_DIR, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const content = await fs.readBytes(f.path);
    if (content) {
      writeFileSync(dest, content);
    }
  }

  console.log(`[example-pack] Extracted reference project files to ${OUT_DIR}/`);
}

main().catch((err: unknown) => {
  console.error('[example-pack] Failed to generate example pack:', err);
  process.exit(1);
});
