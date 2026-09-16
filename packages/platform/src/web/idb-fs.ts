import { UserFacingError, utf8Decode, utf8Encode, type FileStat, type FileSystem, type FsOp, type KeyValueStore } from '@mythic-forge/core';

const DB_NAME = 'mythic-forge';
const DB_VERSION = 1;
const META = 'fileMeta';
const DATA = 'fileData';
const KV = 'kv';
const HIGH = String.fromCharCode(0xffff);

interface MetaRecord {
  path: string;
  size: number;
  modifiedAt: number;
}

const promisify = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

const rangeFor = (prefix: string): IDBKeyRange => {
  const p = `${prefix.replace(/\/+$/, '')}/`;
  return IDBKeyRange.bound(p, `${p}${HIGH}`);
};

const storageError = (error: unknown): Error => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new UserFacingError(
      'storage-full',
      'There is not enough storage space to save. Free up space on your device and try again.',
      String(error),
    );
  }
  return error instanceof Error ? error : new Error(String(error));
};

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'path' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is in use by another Mythic Forge window'));
  });
}

/**
 * File system on IndexedDB. Metadata and contents live in separate stores so listing a
 * project never loads file contents into memory. Every `apply` is one transaction:
 * IndexedDB guarantees it is all-or-nothing, which is what makes saves crash-safe.
 */
export class IndexedDbFileSystem implements FileSystem {
  readonly id = 'indexeddb';
  readonly persistent = true;
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const tx = this.db.transaction(DATA, 'readonly');
    const value = (await promisify(tx.objectStore(DATA).get(path))) as Uint8Array | undefined;
    return value ?? null;
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.readBytes(path);
    return bytes ? utf8Decode(bytes) : null;
  }

  async stat(path: string): Promise<FileStat | null> {
    const tx = this.db.transaction(META, 'readonly');
    const meta = (await promisify(tx.objectStore(META).get(path))) as MetaRecord | undefined;
    return meta ? { path: meta.path, size: meta.size, modifiedAt: meta.modifiedAt } : null;
  }

  async list(prefix: string): Promise<FileStat[]> {
    const tx = this.db.transaction(META, 'readonly');
    const records = (await promisify(tx.objectStore(META).getAll(rangeFor(prefix)))) as MetaRecord[];
    return records.map((m) => ({ path: m.path, size: m.size, modifiedAt: m.modifiedAt }));
  }

  async apply(ops: readonly FsOp[]): Promise<void> {
    if (ops.length === 0) return;
    const tx = this.db.transaction([META, DATA], 'readwrite');
    const meta = tx.objectStore(META);
    const data = tx.objectStore(DATA);
    const now = Date.now();
    const finished = done(tx);
    try {
      for (const op of ops) {
        if (op.kind === 'write') {
          const raw = typeof op.data === 'string' ? utf8Encode(op.data) : op.data;
          // Structured clone copies the whole backing buffer, so store views as compact copies.
          const bytes = raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength ? raw : raw.slice();
          data.put(bytes, op.path);
          meta.put({ path: op.path, size: bytes.byteLength, modifiedAt: now } satisfies MetaRecord);
        } else if (op.kind === 'delete') {
          data.delete(op.path);
          meta.delete(op.path);
        } else {
          data.delete(rangeFor(op.prefix));
          meta.delete(rangeFor(op.prefix));
        }
      }
    } catch (error) {
      tx.abort();
      await finished.catch(() => undefined);
      throw storageError(error);
    }
    try {
      await finished;
    } catch (error) {
      throw storageError(error);
    }
  }

  async copyPrefix(fromPrefix: string, toPrefix: string): Promise<void> {
    const from = fromPrefix.replace(/\/+$/, '');
    const to = toPrefix.replace(/\/+$/, '');
    const listed = await this.list(from);
    const ops: FsOp[] = [];
    for (const f of listed) {
      const bytes = await this.readBytes(f.path);
      if (bytes) ops.push({ kind: 'write', path: `${to}${f.path.slice(from.length)}`, data: bytes });
    }
    await this.apply(ops);
  }
}

export class IndexedDbKeyValueStore implements KeyValueStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction(KV, 'readonly');
    return (await promisify(tx.objectStore(KV).get(key))) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const tx = this.db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(value, key);
    await done(tx).catch((e: unknown) => {
      throw storageError(e);
    });
  }

  async delete(key: string): Promise<void> {
    const tx = this.db.transaction(KV, 'readwrite');
    tx.objectStore(KV).delete(key);
    await done(tx);
  }
}
