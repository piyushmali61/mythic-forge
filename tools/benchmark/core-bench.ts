/**
 * Core benchmark (§106): measures the platform-independent systems in Node so regressions
 * show up in CI without a device. Device-level metrics (FPS, GPU, battery) come from the
 * in-app benchmark (Settings → Performance → Run benchmark).
 *
 * Usage: npm run bench:core  → prints a table and writes reports/core-bench.md/.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CommandHistory,
  DESKTOP_LIMITS,
  ENGINE_VERSION,
  GameRuntime,
  MemoryFileSystem,
  ProjectStore,
  SceneModel,
  ScriptedInput,
  SearchIndex,
  TransformCommand,
  createEmptyScene,
  createPrimitive,
  exportProjectPack,
  importProjectPack,
  percentile,
  validateScene,
  type SceneDocument,
} from '../../packages/core/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Result {
  name: string;
  runs: number;
  medianMs: number;
  p95Ms: number;
  note: string;
}

async function measure(name: string, runs: number, fn: () => unknown | Promise<unknown>, note = ''): Promise<Result> {
  const times: number[] = [];
  await fn(); // warm-up
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  return { name, runs, medianMs: percentile(times, 50), p95Ms: percentile(times, 95), note };
}

function bigScene(count: number): SceneDocument {
  const scene = createEmptyScene();
  for (let i = 0; i < count; i++) {
    const e = createPrimitive(i % 2 ? 'cube' : 'sphere');
    e.transform.position = [(i % 100) * 2, 0.5, Math.floor(i / 100) * 2];
    if (i % 10 === 0) e.components.behaviours = [{ type: 'rotate', axis: 'y', speed: 45 }];
    scene.entities[e.id] = e;
    scene.rootIds.push(e.id);
  }
  return scene;
}

const results: Result[] = [];
const scene5k = bigScene(5000);
const json5k = JSON.stringify(scene5k);

results.push(await measure('Validate 5,000-object scene', 10, () => validateScene(JSON.parse(json5k)), `${(json5k.length / 1048576).toFixed(1)} MB JSON`));
results.push(await measure('Serialise 5,000-object scene', 10, () => JSON.stringify(scene5k, null, 2)));

const fs = new MemoryFileSystem();
const store = new ProjectStore(fs, DESKTOP_LIMITS);
const { manifest } = await store.create({ name: 'Bench', type: '3d-game', targets: ['android'], performanceProfile: 'balanced', templateId: 'shrine-of-lamps' });
let m = manifest;
results.push(
  await measure('Save project (5,000 objects, with backup)', 10, async () => {
    m = await store.save(m, m.startScene, scene5k);
  }),
);
results.push(await measure('Open project (5,000 objects)', 10, () => store.open(m.id)));
const blob = new Uint8Array(20 * 1024 * 1024).map((_, i) => (i * 2654435761) >>> 24);
blob.set([0x67, 0x6c, 0x54, 0x46]);
await store.addAsset(m.id, {
  name: 'big',
  kind: 'model',
  fileFormat: 'glb',
  mainFile: 'big.glb',
  files: [{ name: 'big.glb', bytes: blob }],
  originalBytes: blob.byteLength,
  provenance: { source: 'user-import', userConfirmedRights: true, originalFileName: 'big.glb', catalogId: null, catalogVersion: null, license: null },
  importSettings: null,
  stats: {},
});
let pack: Uint8Array = new Uint8Array();
results.push(
  await measure('Export .mfpack (20 MB asset)', 5, async () => {
    pack = (await exportProjectPack(fs, m.id)).bytes;
  }),
);
results.push(
  await measure('Import .mfpack (20 MB asset, verified)', 5, async () => {
    const fs2 = new MemoryFileSystem();
    await importProjectPack(fs2, new ProjectStore(fs2, DESKTOP_LIMITS), pack, DESKTOP_LIMITS);
  }),
);

const runtime = new GameRuntime(scene5k, new ScriptedInput());
runtime.start();
results.push(await measure('Runtime step, 5,000 objects (500 rotating)', 60, () => runtime.update(1 / 60), 'one 60 Hz frame'));

const model = new SceneModel(structuredClone(scene5k));
const history = new CommandHistory({ maxEntries: 200 });
const ids = Object.keys(scene5k.entities);
results.push(
  await measure('10,000 undoable transform edits', 3, () => {
    for (let i = 0; i < 10_000; i++) {
      const id = ids[i % ids.length]!;
      const before = model.get(id)!.transform;
      history.execute(new TransformCommand(model, id, before, { ...before, position: [i, 0, 0] }));
    }
  }, `history capped at ${200} entries`),
);

const index = new SearchIndex(ids.map((id, i) => ({ id, kind: 'asset' as const, title: `Asset ${i} temple stone`, text: 'architecture lamp tree', ref: id })));
results.push(await measure('Search 5,000 documents', 50, () => index.search('temp sto')));

const lines = [
  `# Core benchmark — Mythic Forge ${ENGINE_VERSION}`,
  '',
  `- Date: ${new Date().toISOString()}`,
  `- Node ${process.version} on ${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? 'unknown CPU'} (${os.cpus().length} threads)`,
  '',
  '| Benchmark | Median (ms) | p95 (ms) | Runs | Note |',
  '|---|---:|---:|---:|---|',
  ...results.map((r) => `| ${r.name} | ${r.medianMs.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.runs} | ${r.note} |`),
  '',
];
const outDir = join(ROOT, 'reports');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'core-bench.md'), lines.join('\n'));
writeFileSync(join(outDir, 'core-bench.json'), JSON.stringify({ engine: ENGINE_VERSION, node: process.version, results }, null, 2));
console.log(lines.join('\n'));
