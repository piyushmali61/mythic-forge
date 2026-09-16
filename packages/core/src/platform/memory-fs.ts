import { utf8Decode, utf8Encode } from '../util/bytes.ts';
import type { FileStat, FileSystem, FsOp, KeyValueStore } from './types.ts';

interface MemFile {
  data: Uint8Array;
  modifiedAt: number;
}

const under = (path: string, prefix: string): boolean => path.startsWith(`${prefix.replace(/\/+$/, '')}/`);

/**
 * In-memory file system. Used by tests, benchmarks, and as a fallback when persistent
 * storage is unavailable (the UI warns the user in that case).
 */
export class MemoryFileSystem implements FileSystem {
  readonly id = 'memory';
  readonly persistent = false;
  private files = new Map<string, MemFile>();

  async readText(path: string): Promise<string | null> {
    const f = this.files.get(path);
    return f ? utf8Decode(f.data) : null;
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const f = this.files.get(path);
    return f ? f.data.slice() : null;
  }

  async stat(path: string): Promise<FileStat | null> {
    const f = this.files.get(path);
    return f ? { path, size: f.data.byteLength, modifiedAt: f.modifiedAt } : null;
  }

  async list(prefix: string): Promise<FileStat[]> {
    const out: FileStat[] = [];
    for (const [path, f] of this.files) {
      if (under(path, prefix)) out.push({ path, size: f.data.byteLength, modifiedAt: f.modifiedAt });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async apply(ops: readonly FsOp[]): Promise<void> {
    // Stage on a copy so a failure leaves the original untouched (atomicity).
    const next = new Map(this.files);
    const now = Date.now();
    for (const op of ops) {
      if (op.kind === 'write') {
        const data = typeof op.data === 'string' ? utf8Encode(op.data) : op.data.slice();
        next.set(op.path, { data, modifiedAt: now });
      } else if (op.kind === 'delete') {
        next.delete(op.path);
      } else {
        for (const path of [...next.keys()]) if (under(path, op.prefix)) next.delete(path);
      }
    }
    this.files = next;
  }

  async copyPrefix(fromPrefix: string, toPrefix: string): Promise<void> {
    const from = fromPrefix.replace(/\/+$/, '');
    const to = toPrefix.replace(/\/+$/, '');
    const ops: FsOp[] = [];
    for (const [path, f] of this.files) {
      if (under(path, from)) ops.push({ kind: 'write', path: `${to}${path.slice(from.length)}`, data: f.data });
    }
    await this.apply(ops);
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  private map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.map.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}
