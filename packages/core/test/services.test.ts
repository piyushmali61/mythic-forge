import { describe, expect, it } from 'vitest';
import {
  AssetRepositoryClient,
  DEFAULT_SETTINGS,
  DownloadManager,
  Logger,
  SearchIndex,
  isAllowedRepositoryUrl,
  normalizeSettings,
  redact,
  sha256Hex,
  type CatalogFile,
  type DownloadItem,
  type FetchLike,
} from '../src/index.ts';

describe('settings', () => {
  it('repairs invalid stored settings', () => {
    const s = normalizeSettings({
      editor: { autosaveMinutes: 7, gizmoSize: 99 },
      graphics: { quality: 'insane', targetFps: 1000 },
      accessibility: { uiScale: 'big' },
      battery: { mode: 'max-saving' },
    });
    expect(s.editor.autosaveMinutes).toBe(5);
    expect(s.editor.gizmoSize).toBe(3);
    expect(s.graphics.quality).toBe('medium');
    expect(s.graphics.targetFps).toBe('auto');
    expect(s.accessibility.uiScale).toBe(1);
    expect(s.battery.mode).toBe('max-saving');
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('logger', () => {
  it('keeps a bounded buffer and redacts personal data', () => {
    const log = new Logger({ maxEntries: 3, minLevel: 'debug' });
    for (let i = 0; i < 5; i++) log.info('t', `msg ${i}`);
    expect(log.entries().map((e) => e.message)).toEqual(['msg 2', 'msg 3', 'msg 4']);
    expect(redact('C:\\Users\\asha\\Documents\\x and /home/ravi/y mail me@example.com')).toBe(
      'C:\\Users\\<user>\\Documents\\x and /home/<user>/y mail <email>',
    );
    const quiet = new Logger({ minLevel: 'warn' });
    quiet.info('t', 'hidden');
    quiet.error('t', 'shown', 'stack');
    expect(quiet.exportText('header')).toMatch(/ERROR \[t\] shown\n {4}stack/);
    expect(quiet.entries()).toHaveLength(1);
  });
});

describe('search', () => {
  it('finds by prefix with AND semantics and filters by kind', () => {
    const idx = new SearchIndex([
      { id: '1', kind: 'asset', title: 'Carved Pillar', text: 'temple architecture stone', ref: '1' },
      { id: '2', kind: 'asset', title: 'Diya Lamp', text: 'light festival brass', ref: '2' },
      { id: '3', kind: 'project', title: 'Temple Run Clone', text: '', ref: '3' },
      { id: '4', kind: 'doc', title: 'Importing Models', text: 'glb gltf obj', ref: '4' },
    ]);
    expect(idx.search('temp').map((h) => h.doc.id).sort()).toEqual(['1', '3']);
    expect(idx.search('temple stone').map((h) => h.doc.id)).toEqual(['1']);
    expect(idx.search('temple', 10, ['project']).map((h) => h.doc.id)).toEqual(['3']);
    expect(idx.search('GLB')[0]!.doc.id).toBe('4');
    expect(idx.search('   ')).toEqual([]);
  });
});

// ---- network (mocked) -------------------------------------------------------------------------

function mockServer(files: Record<string, Uint8Array>, options: { supportRange?: boolean; etag?: string } = {}) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers = init?.headers ?? {};
    requests.push({ url, headers });
    const path = new URL(url).pathname.slice(1);
    if (options.etag && headers['If-None-Match'] === options.etag) {
      return { ok: false, status: 304, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), body: null };
    }
    const data = files[path];
    if (!data) return { ok: false, status: 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), body: null };
    let start = 0;
    let status = 200;
    const range = headers.Range && /bytes=(\d+)-/.exec(headers.Range);
    if (range && options.supportRange !== false) {
      start = Number(range[1]);
      status = 206;
    }
    const slice = data.slice(start);
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Emit in 3 chunks with an await in between, so pause can interrupt.
        const third = Math.ceil(slice.byteLength / 3);
        for (let i = 0; i < slice.byteLength; i += third) {
          await new Promise((r) => setTimeout(r, 5));
          if (signal?.aborted) {
            controller.error(new DOMException('aborted', 'AbortError'));
            return;
          }
          controller.enqueue(slice.slice(i, i + third));
        }
        controller.close();
      },
    });
    return {
      ok: true,
      status,
      headers: new Headers(options.etag ? { ETag: options.etag } : {}),
      arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
      body,
    };
  };
  return { fetch, requests };
}

const waitFor = async (cond: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('repository client', () => {
  it('only allows HTTPS, same-origin or localhost', () => {
    expect(isAllowedRepositoryUrl('https://assets.example.com/', null)).toBe(true);
    expect(isAllowedRepositoryUrl('http://assets.example.com/', null)).toBe(false);
    expect(isAllowedRepositoryUrl('http://localhost:5173/catalog', null)).toBe(true);
    expect(isAllowedRepositoryUrl('/asset-packs/official/', 'https://localhost')).toBe(true);
    expect(isAllowedRepositoryUrl('javascript:alert(1)', null)).toBe(false);
  });

  it('uses conditional requests and validates the catalog', async () => {
    const catalog = new TextEncoder().encode(JSON.stringify({ format: 'mythic-forge-catalog', formatVersion: 1, entries: [] }));
    const { fetch, requests } = mockServer({ 'catalog.json': catalog }, { etag: '"v1"' });
    const client = new AssetRepositoryClient({ baseUrl: 'https://repo.example/', fetch, networkAllowed: () => true });
    const first = await client.fetchCatalog(null);
    expect(first.changed).toBe(true);
    expect(first.manifest.etag).toBe('"v1"');
    const second = await client.fetchCatalog(first.manifest);
    expect(second.changed).toBe(false);
    expect(requests[1]!.headers['If-None-Match']).toBe('"v1"');
    expect(() => client.resolve('../secret')).toThrow();
  });

  it('refuses to run when the network is disallowed', async () => {
    const { fetch, requests } = mockServer({});
    const client = new AssetRepositoryClient({ baseUrl: 'https://repo.example/', fetch, networkAllowed: () => false });
    await expect(client.fetchCatalog(null)).rejects.toThrow(/Network/);
    expect(requests).toHaveLength(0);
  });
});

describe('DownloadManager', () => {
  const payload = new Uint8Array(3000).map((_, i) => i % 251);
  const fileFor = async (bytes: Uint8Array): Promise<CatalogFile> => ({
    path: 'models/x.glb',
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    role: 'main',
  });

  it('downloads, verifies and completes', async () => {
    const { fetch } = mockServer({ 'models/x.glb': payload });
    const dm = new DownloadManager({ fetch, networkAllowed: () => true });
    let received: Uint8Array | null = null;
    const id = dm.enqueue('X', 'https://repo.example/models/x.glb', await fileFor(payload), (b) => {
      received = b;
    });
    await waitFor(() => dm.list().find((d) => d.id === id)!.status === 'completed');
    expect(received).toEqual(payload);
  });

  it('pauses and resumes with a Range request', async () => {
    const { fetch, requests } = mockServer({ 'models/x.glb': payload });
    const dm = new DownloadManager({ fetch, networkAllowed: () => true });
    let received: Uint8Array | null = null;
    const id = dm.enqueue('X', 'https://repo.example/models/x.glb', await fileFor(payload), (b) => {
      received = b;
    });
    const item = (): DownloadItem => dm.list().find((d) => d.id === id)!;
    await waitFor(() => item().received > 0);
    dm.pause(id);
    expect(item().status).toBe('paused');
    const partial = item().received;
    expect(partial).toBeLessThan(payload.byteLength);
    dm.resume(id);
    await waitFor(() => item().status === 'completed');
    expect(requests.at(-1)!.headers.Range).toBe(`bytes=${partial}-`);
    expect(received).toEqual(payload);
  });

  it('fails integrity checks and supports cancel', async () => {
    const { fetch } = mockServer({ 'models/x.glb': payload });
    const dm = new DownloadManager({ fetch, networkAllowed: () => true });
    const wrong = { ...(await fileFor(payload)), sha256: '0'.repeat(64) };
    const id = dm.enqueue('X', 'https://repo.example/models/x.glb', wrong, () => {
      throw new Error('should not complete');
    });
    await waitFor(() => dm.list().find((d) => d.id === id)!.status === 'failed');
    expect(dm.list()[0]!.error).toMatch(/integrity/);
    dm.cancel(id);
    expect(dm.list()[0]!.status).toBe('cancelled');
    dm.clearFinished();
    expect(dm.list()).toEqual([]);
  });

  it('does not start while the network is disallowed', async () => {
    const { fetch, requests } = mockServer({ 'models/x.glb': payload });
    let allowed = false;
    const dm = new DownloadManager({ fetch, networkAllowed: () => allowed });
    const id = dm.enqueue('X', 'https://repo.example/models/x.glb', await fileFor(payload), () => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(requests).toHaveLength(0);
    expect(dm.list()[0]!.status).toBe('queued');
    allowed = true;
    dm.pause(id);
    dm.resume(id);
    await waitFor(() => dm.list()[0]!.status === 'completed');
  });
});
