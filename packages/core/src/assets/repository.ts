import { sha256Hex } from '../util/bytes.ts';
import { UserFacingError } from '../util/errors.ts';
import { parseJsonLimited } from '../util/json.ts';
import { safeRelativePath } from '../security/paths.ts';
import { parseCatalog, type CatalogFile, type CatalogParseResult } from './catalog.ts';

export type FetchLike = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  body?: ReadableStream<Uint8Array> | null;
}>;

export interface CachedManifest {
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
  body: string;
}

export interface RepositoryOptions {
  /** Base URL of the repository. Must be HTTPS unless it's the app's own origin or localhost. */
  baseUrl: string;
  fetch: FetchLike;
  /** Returns false to block every request (Settings → Network, offline). */
  networkAllowed: () => boolean;
  maxCatalogBytes?: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedRepositoryUrl(url: string, appOrigin: string | null): boolean {
  try {
    const u = new URL(url, appOrigin ?? undefined);
    if (appOrigin && u.origin === new URL(appOrigin).origin) return true;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Client for the official Mythic Bharat Studios asset repository.
 * - Only fetches when the user asks (no polling).
 * - Uses conditional requests (ETag / Last-Modified) so unchanged catalogs cost almost nothing.
 * - Treats all responses as untrusted: size limits, schema validation, SHA-256 verification.
 * - Never executes anything it downloads.
 */
export class AssetRepositoryClient {
  private readonly options: Required<RepositoryOptions>;

  constructor(options: RepositoryOptions) {
    this.options = { maxCatalogBytes: 8 * 1024 * 1024, ...options };
  }

  resolve(path: string): string {
    const rel = safeRelativePath(path);
    const base = this.options.baseUrl.endsWith('/') ? this.options.baseUrl : `${this.options.baseUrl}/`;
    return new URL(rel, new URL(base, globalThis.location?.href ?? 'https://invalid.local/')).toString();
  }

  /**
   * Fetches `catalog.json`. Pass the previous cached copy to make a conditional request.
   * Returns `{ changed: false }` on 304.
   */
  async fetchCatalog(cached: CachedManifest | null): Promise<{ changed: boolean; manifest: CachedManifest; parsed: CatalogParseResult }> {
    if (!this.options.networkAllowed()) throw new UserFacingError('offline', 'Network access is turned off or unavailable.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    const res = await this.options.fetch(this.resolve('catalog.json'), { headers });
    if (res.status === 304 && cached) {
      return { changed: false, manifest: { ...cached, fetchedAt: new Date().toISOString() }, parsed: parseCatalog(JSON.parse(cached.body)) };
    }
    if (!res.ok) throw new UserFacingError('repo-http', 'The asset library could not be reached.', `HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const json = parseJsonLimited(bytes, this.options.maxCatalogBytes);
    if (json === undefined) throw new UserFacingError('repo-invalid', 'The asset library sent invalid data.');
    const parsed = parseCatalog(json);
    return {
      changed: true,
      manifest: {
        etag: res.headers.get('ETag'),
        lastModified: res.headers.get('Last-Modified'),
        fetchedAt: new Date().toISOString(),
        body: new TextDecoder().decode(bytes),
      },
      parsed,
    };
  }

  /** Downloads a catalog file completely and verifies its hash. */
  async fetchFile(file: CatalogFile, signal?: AbortSignal): Promise<Uint8Array> {
    if (!this.options.networkAllowed()) throw new UserFacingError('offline', 'Network access is turned off or unavailable.');
    const res = await this.options.fetch(this.resolve(file.path), signal ? { signal } : undefined);
    if (!res.ok) throw new UserFacingError('repo-http', 'The download failed.', `HTTP ${res.status} for ${file.path}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await verifyFile(file, bytes);
    return bytes;
  }
}

export async function verifyFile(file: CatalogFile, bytes: Uint8Array): Promise<void> {
  if (file.bytes && bytes.byteLength !== file.bytes) {
    throw new UserFacingError('integrity', 'The downloaded file is incomplete.', `${file.path}: expected ${file.bytes} bytes, got ${bytes.byteLength}`);
  }
  const hash = await sha256Hex(bytes);
  if (hash !== file.sha256) {
    throw new UserFacingError('integrity', 'The downloaded file failed its integrity check and was discarded.', `${file.path}: sha256 mismatch`);
  }
}
