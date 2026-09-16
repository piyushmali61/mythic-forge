import { unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DESKTOP_LIMITS,
  ENGINE_VERSION,
  MemoryFileSystem,
  MemoryKeyValueStore,
  PROJECT_FORMAT_VERSION,
  ProjectStore,
  RecoveryStore,
  applyMigrations,
  checkCompatibility,
  createPrimitive,
  exportProjectPack,
  importProjectPack,
  isRecoveryRelevant,
  parseBackupStamp,
  planMigrations,
  projectDir,
  type NewAssetInput,
  type ProjectMigration,
} from '../src/index.ts';

const glb = (seed: number): Uint8Array => new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, seed]);

const userAsset = (name: string, bytes: Uint8Array): NewAssetInput => ({
  name,
  kind: 'model',
  fileFormat: 'glb',
  mainFile: `${name}.glb`,
  files: [{ name: `${name}.glb`, bytes }],
  originalBytes: bytes.byteLength,
  provenance: {
    source: 'user-import',
    userConfirmedRights: true,
    originalFileName: `${name}.glb`,
    catalogId: null,
    catalogVersion: null,
    license: null,
  },
  importSettings: null,
  stats: { vertices: 3, triangles: 1 },
});

let fs: MemoryFileSystem;
let store: ProjectStore;

beforeEach(() => {
  fs = new MemoryFileSystem();
  store = new ProjectStore(fs, DESKTOP_LIMITS);
});

const create = (name = 'My Game', templateId = 'basic-3d') =>
  store.create({ name, type: '3d-game', targets: ['android', 'windows'], performanceProfile: 'balanced', templateId });

describe('ProjectStore', () => {
  it('creates, lists and opens a project', async () => {
    const { manifest } = await create();
    expect(manifest.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(manifest.engineVersion).toBe(ENGINE_VERSION);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: manifest.id, name: 'My Game', compatibility: { status: 'current' }, error: null });
    expect(list[0]!.sizeBytes).toBeGreaterThan(0);
    const opened = await store.open(manifest.id);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.warnings).toEqual([]);
      expect(Object.keys(opened.scene.entities).length).toBeGreaterThan(3);
    }
  });

  it('copies template assets and wires them into the scene', async () => {
    const assets = ['mbs.diya-lamp', 'mbs.banyan-tree'].map((catalogId, i) => ({
      ...userAsset(catalogId.replace('mbs.', ''), glb(i)),
      provenance: { ...userAsset('x', glb(0)).provenance, source: 'official' as const, catalogId, catalogVersion: '1.0.0' },
    }));
    const { manifest, scene } = await store.create({
      name: 'Shrine',
      type: '3d-game',
      targets: ['android'],
      performanceProfile: 'battery-saver',
      templateId: 'shrine-of-lamps',
      assets,
    });
    const projectAssets = await store.listAssets(manifest.id);
    expect(projectAssets).toHaveLength(2);
    const used = new Set(Object.values(scene.entities).map((e) => e.components.model?.assetId).filter(Boolean));
    for (const a of projectAssets) expect(used.has(a.id)).toBe(true);
  });

  it('saves atomically with rolling backups', async () => {
    const { manifest, scene } = await create();
    let m = manifest;
    for (let i = 0; i < 5; i++) {
      scene.name = `Rev ${i}`;
      m = await store.save(m, m.startScene, scene);
      await new Promise((r) => setTimeout(r, 2));
    }
    const backups = await store.listBackups(m.id);
    expect(backups).toHaveLength(3);
    expect(backups[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const opened = await store.open(m.id);
    expect(opened.ok && opened.scene.name).toBe('Rev 4');
    await store.restoreBackup(m.id, backups[0]!.id);
    const restored = await store.open(m.id);
    expect(restored.ok && restored.scene.name).toBe('Rev 3');
  });

  it('refuses to save scenes that are not part of the project', async () => {
    const { manifest, scene } = await create();
    await expect(store.save(manifest, 'scenes/../../escape.mfscene', scene)).rejects.toThrow();
  });

  it('renames, archives, duplicates and deletes', async () => {
    const { manifest } = await create();
    await store.rename(manifest.id, '  Renamed  ');
    await store.setArchived(manifest.id, true);
    const copyId = await store.duplicate(manifest.id, 'Copy');
    const list = await store.list();
    expect(list.map((p) => p.name).sort()).toEqual(['Copy', 'Renamed']);
    expect(list.find((p) => p.id === manifest.id)!.archived).toBe(true);
    expect(list.find((p) => p.id === copyId)!.archived).toBe(false);
    await store.delete(manifest.id);
    expect((await store.list()).map((p) => p.id)).toEqual([copyId]);
    expect(await fs.list(projectDir(manifest.id))).toEqual([]);
  });

  it('deduplicates identical imports and never loses originals when clearing cache', async () => {
    const { manifest } = await create();
    const first = await store.addAsset(manifest.id, userAsset('statue', glb(7)));
    const second = await store.addAsset(manifest.id, userAsset('statue again', glb(7)));
    expect(second.deduplicated).toBe(true);
    expect(second.meta.id).toBe(first.meta.id);
    await fs.apply([{ kind: 'write', path: `${projectDir(manifest.id)}/cache/thumb.webp`, data: new Uint8Array([1]) }]);
    await store.clearCache(manifest.id);
    expect(await store.readAssetFile(manifest.id, first.meta.id)).toEqual(glb(7));
    expect(await fs.stat(`${projectDir(manifest.id)}/cache/thumb.webp`)).toBeNull();
  });

  it('rejects asset files with reserved or duplicate names', async () => {
    const { manifest } = await create();
    const bad = userAsset('x', glb(1));
    bad.files.push({ name: 'asset.meta.json', bytes: new Uint8Array([1]) });
    await expect(store.addAsset(manifest.id, bad)).rejects.toThrow();
  });

  it('reports damaged and newer projects without throwing', async () => {
    const { manifest } = await create();
    await fs.apply([{ kind: 'write', path: `${projectDir(manifest.id)}/project.mfproj`, data: '{ not json' }]);
    const r = await store.open(manifest.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('corrupt');
    const list = await store.list();
    expect(list[0]!.error).toBeTruthy();

    const { manifest: m2 } = await create('Future');
    await fs.apply([
      {
        kind: 'write',
        path: `${projectDir(m2.id)}/project.mfproj`,
        data: JSON.stringify({ ...m2, formatVersion: PROJECT_FORMAT_VERSION + 1, engineVersion: '9.0.0' }),
      },
    ]);
    const future = await store.open(m2.id);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toBe('unsupported');
  });
});

describe('compatibility & migrations', () => {
  it('classifies versions', () => {
    expect(checkCompatibility(PROJECT_FORMAT_VERSION, ENGINE_VERSION).status).toBe('current');
    expect(checkCompatibility(PROJECT_FORMAT_VERSION, '0.0.1').status).toBe('older-engine');
    expect(checkCompatibility(PROJECT_FORMAT_VERSION, '99.0.0').status).toBe('newer-engine');
    expect(checkCompatibility(PROJECT_FORMAT_VERSION + 1, '99.0.0').status).toBe('unsupported');
    expect(checkCompatibility(0, '0.0.1').status).toBe('needs-upgrade');
  });

  it('plans and applies migration chains', () => {
    const registry: ProjectMigration[] = [
      { from: 0, to: 1, description: 'rename title→name', migrateManifest: ({ title, ...rest }) => ({ ...rest, name: title }) },
      {
        from: 1,
        to: 2,
        description: 'add hud',
        migrateManifest: (m) => m,
        migrateScene: (s) => ({ ...s, hud: { title: 'x' } }),
      },
    ];
    expect(planMigrations(0, 2, registry)?.map((m) => m.to)).toEqual([1, 2]);
    expect(planMigrations(0, 3, registry)).toBeNull();
    const out = applyMigrations({ formatVersion: 0, title: 'Old' }, { 'scenes/a.mfscene': { name: 'a' } }, planMigrations(0, 2, registry)!);
    expect(out.manifest).toEqual({ formatVersion: 2, name: 'Old' });
    expect(out.scenes['scenes/a.mfscene']).toEqual({ name: 'a', hud: { title: 'x' } });
  });
});

describe('.mfpack', () => {
  it('round-trips a project between devices', async () => {
    const { manifest, scene } = await create('Travel');
    await store.addAsset(manifest.id, userAsset('bust', glb(3)));
    await fs.apply([{ kind: 'write', path: `${projectDir(manifest.id)}/cache/junk.bin`, data: new Uint8Array(100) }]);
    await store.createBackup(manifest.id);
    const { bytes, fileName } = await exportProjectPack(fs, manifest.id);
    expect(fileName).toBe('Travel.mfpack');
    const names = Object.keys(unzipSync(bytes));
    expect(names.some((n) => n.startsWith('cache/'))).toBe(false);
    expect(names.some((n) => n.startsWith('metadata/backups/'))).toBe(false);

    // Import on a "different device".
    const fs2 = new MemoryFileSystem();
    const store2 = new ProjectStore(fs2, DESKTOP_LIMITS);
    const imported = await importProjectPack(fs2, store2, bytes, DESKTOP_LIMITS);
    expect(imported.projectId).toBe(manifest.id);
    const opened = await store2.open(imported.projectId);
    expect(opened.ok && opened.scene).toEqual(scene);
    expect(await store2.listAssets(imported.projectId)).toHaveLength(1);

    // Importing again on the same device creates a separate copy.
    const again = await importProjectPack(fs2, store2, bytes, DESKTOP_LIMITS);
    expect(again.projectId).not.toBe(manifest.id);
    expect(again.name).toBe('Travel (imported)');
  });

  it('rejects tampered, incomplete or smuggled content', async () => {
    const { manifest } = await create('Victim');
    const { bytes } = await exportProjectPack(fs, manifest.id);
    const files = unzipSync(bytes);

    const tampered = { ...files, 'scenes/main.mfscene': new TextEncoder().encode('{"format":"mythic-forge-scene"}') };
    await expect(importProjectPack(fs, store, zipSync(tampered), DESKTOP_LIMITS)).rejects.toThrow(/corrupted/);

    const smuggled = { ...files, 'scripts/run.js': new TextEncoder().encode('alert(1)') };
    await expect(importProjectPack(fs, store, zipSync(smuggled), DESKTOP_LIMITS)).rejects.toThrow();

    const extra = { ...files, 'notes.txt': new TextEncoder().encode('hi') };
    await expect(importProjectPack(fs, store, zipSync(extra), DESKTOP_LIMITS)).rejects.toThrow(/unexpected/);

    const { 'pack.json': _omit, ...noManifest } = files;
    await expect(importProjectPack(fs, store, zipSync(noManifest), DESKTOP_LIMITS)).rejects.toThrow(/not a Mythic Forge/);

    await expect(importProjectPack(fs, store, new Uint8Array([1, 2, 3]), DESKTOP_LIMITS)).rejects.toThrow();
    expect((await store.list()).length).toBe(1);
  });
});

describe('recovery', () => {
  it('stores snapshots outside the project and detects unclean sessions', async () => {
    const recovery = new RecoveryStore(fs, new MemoryKeyValueStore());
    const { manifest, scene } = await create();
    scene.entities = {};
    const cube = createPrimitive('cube');
    scene.entities[cube.id] = cube;
    scene.rootIds = [cube.id];
    await recovery.beginSession(manifest.id);
    await recovery.write({
      projectId: manifest.id,
      projectName: manifest.name,
      scenePath: manifest.startScene,
      scene,
      savedAt: new Date(Date.now() + 1000).toISOString(),
      baseModifiedAt: manifest.modifiedAt,
    });
    expect((await recovery.uncleanSession())?.projectId).toBe(manifest.id);
    const snap = await recovery.read(manifest.id);
    expect(snap?.scene.rootIds).toEqual([cube.id]);
    expect(isRecoveryRelevant(snap!, manifest.modifiedAt)).toBe(true);
    expect(isRecoveryRelevant(snap!, new Date(Date.now() + 60_000).toISOString())).toBe(false);
    // The project itself was not modified by the recovery write.
    const opened = await store.open(manifest.id);
    expect(opened.ok && Object.keys(opened.scene.entities).length).toBeGreaterThan(1);
    await recovery.endSession();
    await recovery.clear(manifest.id);
    expect(await recovery.uncleanSession()).toBeNull();
    expect(await recovery.read(manifest.id)).toBeNull();
  });

  it('parses backup stamps', () => {
    expect(parseBackupStamp('20260917T102233123Z-save')).toBe('2026-09-17T10:22:33.123Z');
    expect(parseBackupStamp('garbage')).toBe('');
  });
});
