import {
  DESKTOP_LIMITS,
  ProjectStore,
  exportProjectPack,
  importProjectPack,
  type FsOp,
} from '@mythic-forge/core';
import { describe, expect, it } from 'vitest';
import { IndexedDbFileSystem, IndexedDbKeyValueStore, openDatabase } from '../src/web/idb-fs.ts';

let counter = 0;
const freshFs = async () => {
  const db = await openDatabase(`test-${Date.now()}-${counter++}`);
  return { fs: new IndexedDbFileSystem(db), kv: new IndexedDbKeyValueStore(db) };
};

describe('IndexedDbFileSystem', () => {
  it('writes, lists, reads and deletes', async () => {
    const { fs } = await freshFs();
    await fs.apply([
      { kind: 'write', path: 'projects/p1/project.mfproj', data: '{"x":1}' },
      { kind: 'write', path: 'projects/p1/assets/a/m.glb', data: new Uint8Array([1, 2, 3]) },
      { kind: 'write', path: 'projects/p10/project.mfproj', data: '{}' },
    ]);
    expect((await fs.list('projects/p1')).map((f) => f.path)).toEqual(['projects/p1/assets/a/m.glb', 'projects/p1/project.mfproj']);
    expect(await fs.readText('projects/p1/project.mfproj')).toBe('{"x":1}');
    expect(await fs.readBytes('projects/p1/assets/a/m.glb')).toEqual(new Uint8Array([1, 2, 3]));
    expect((await fs.stat('projects/p1/assets/a/m.glb'))?.size).toBe(3);
    await fs.apply([{ kind: 'delete-prefix', prefix: 'projects/p1' }]);
    expect(await fs.list('projects/p1')).toEqual([]);
    expect(await fs.readText('projects/p10/project.mfproj')).toBe('{}');
    await fs.apply([{ kind: 'delete', path: 'projects/p10/project.mfproj' }]);
    expect(await fs.stat('projects/p10/project.mfproj')).toBeNull();
  });

  it('stores compact copies of typed-array views', async () => {
    const { fs } = await freshFs();
    const big = new Uint8Array(1024);
    big[10] = 7;
    await fs.apply([{ kind: 'write', path: 'x/view.bin', data: big.subarray(10, 12) }]);
    const back = await fs.readBytes('x/view.bin');
    expect(back).toEqual(new Uint8Array([7, 0]));
    expect(back!.buffer.byteLength).toBe(2);
  });

  it('applies batches atomically (a failing op rolls back the whole batch)', async () => {
    const { fs } = await freshFs();
    await fs.apply([{ kind: 'write', path: 'p/a.txt', data: 'original' }]);
    const bad = [
      { kind: 'write', path: 'p/a.txt', data: 'changed' },
      // An invalid key makes IndexedDB throw part-way through the batch.
      { kind: 'write', path: undefined as unknown as string, data: 'x' },
    ] as FsOp[];
    await expect(fs.apply(bad)).rejects.toThrow();
    expect(await fs.readText('p/a.txt')).toBe('original');
  });

  it('copies prefixes', async () => {
    const { fs } = await freshFs();
    await fs.apply([
      { kind: 'write', path: 'a/1.txt', data: 'one' },
      { kind: 'write', path: 'a/sub/2.txt', data: 'two' },
    ]);
    await fs.copyPrefix('a', 'b');
    expect((await fs.list('b')).map((f) => f.path)).toEqual(['b/1.txt', 'b/sub/2.txt']);
    expect(await fs.readText('b/sub/2.txt')).toBe('two');
  });

  it('stores key/value settings', async () => {
    const { kv } = await freshFs();
    await kv.set('settings', { a: 1, nested: { b: [1, 2] } });
    expect(await kv.get('settings')).toEqual({ a: 1, nested: { b: [1, 2] } });
    await kv.delete('settings');
    expect(await kv.get('settings')).toBeUndefined();
  });

  it('runs the full project lifecycle on IndexedDB', async () => {
    const { fs } = await freshFs();
    const store = new ProjectStore(fs, DESKTOP_LIMITS);
    const { manifest, scene } = await store.create({
      name: 'IDB Project',
      type: '3d-game',
      targets: ['android', 'windows'],
      performanceProfile: 'balanced',
      templateId: 'platformer',
    });
    scene.name = 'Edited';
    const saved = await store.save(manifest, manifest.startScene, scene);
    const opened = await store.open(saved.id);
    expect(opened.ok && opened.scene.name).toBe('Edited');
    const pack = await exportProjectPack(fs, saved.id);
    const other = await freshFs();
    const imported = await importProjectPack(other.fs, new ProjectStore(other.fs, DESKTOP_LIMITS), pack.bytes, DESKTOP_LIMITS);
    expect(imported.projectId).toBe(saved.id);
  });
});
