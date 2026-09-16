import { signal } from '@preact/signals';
import {
  AssetRepositoryClient,
  UserFacingError,
  isEngineCompatible,
  isPubliclyAvailable,
  isValidId,
  log,
  parseCatalog,
  verifyForPublicDistribution,
  type CatalogEntry,
  type CatalogSection,
  type DownloadManager,
  type FileSystem,
  type LicenseVerdict,
  type NewAssetInput,
} from '@mythic-forge/core';
import { BUNDLED_PACKS, config } from '../lib/config.ts';

export interface LibraryItem {
  entry: CatalogEntry;
  section: CatalogSection;
  baseUrl: string;
  /** Passed every check and completed review (§63). */
  published: boolean;
  verdict: LicenseVerdict;
}

type Thumbs = import('@mythic-forge/renderer').ThumbnailRenderer;

const libraryPath = (e: CatalogEntry, file: string): string => `library/${e.id}/${e.version}/${file}`;
const thumbPath = (e: CatalogEntry, size: number): string => `cache/thumbnails/${e.id}@${e.version}-${size}.webp`;

/**
 * Official and Free & Open libraries. Catalogs are bundled with the app (works offline); a remote
 * repository is used only when configured and only when the user asks to check for updates.
 */
export class CatalogService {
  readonly items = signal<LibraryItem[]>([]);
  readonly loaded = signal(false);
  readonly problems = signal<string[]>([]);
  readonly installed = signal<Set<string>>(new Set());
  private readonly fs: FileSystem;
  private readonly downloads: DownloadManager;
  private readonly networkAllowed: () => boolean;
  private thumbs: Thumbs | null = null;
  private thumbUrls = new Map<string, string>();
  private installing = new Map<string, Promise<void>>();

  constructor(fs: FileSystem, downloads: DownloadManager, networkAllowed: () => boolean) {
    this.fs = fs;
    this.downloads = downloads;
    this.networkAllowed = networkAllowed;
  }

  /** Loads the catalogs bundled with the app. No network access. */
  async load(): Promise<void> {
    const problems: string[] = [];
    const items: LibraryItem[] = [];
    for (const section of Object.keys(BUNDLED_PACKS) as CatalogSection[]) {
      const baseUrl = BUNDLED_PACKS[section];
      try {
        const res = await fetch(`${baseUrl}catalog.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseCatalog(await res.json());
        for (const r of parsed.rejected) problems.push(`${section}: rejected ${r.id} (${r.reasons.join(', ')})`);
        for (const entry of parsed.catalog.entries) {
          if (entry.section !== section) continue;
          items.push({
            entry,
            section,
            baseUrl,
            published: isPubliclyAvailable(entry.license, entry.review),
            verdict: verifyForPublicDistribution(entry.license),
          });
        }
      } catch (error) {
        problems.push(`${section}: catalog unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    for (const p of problems) log.warn('Library', p);
    this.items.value = items;
    this.problems.value = problems;
    this.loaded.value = true;
    await this.refreshInstalled();
  }

  /**
   * Items the user may see. Release builds show only published, compatible entries;
   * development builds also show entries awaiting review (clearly labelled).
   */
  visible(section: CatalogSection): LibraryItem[] {
    return this.items.value.filter(
      (i) => i.section === section && isEngineCompatible(i.entry) && (i.published || config.includeUnreviewedAssets),
    );
  }

  find(id: string): LibraryItem | undefined {
    return this.items.value.find((i) => i.entry.id === id);
  }

  /** Whether an entry may be used in projects in this build. */
  usable(item: LibraryItem): boolean {
    return item.published || config.includeUnreviewedAssets;
  }

  async refreshInstalled(): Promise<void> {
    const files = await this.fs.list('library');
    const set = new Set<string>();
    for (const item of this.items.value) {
      const main = item.entry.files.find((f) => f.role === 'main');
      if (!main || files.some((f) => f.path === libraryPath(item.entry, main.path.split('/').pop()!))) {
        set.add(`${item.entry.id}@${item.entry.version}`);
      }
    }
    this.installed.value = set;
  }

  isInstalled(item: LibraryItem): boolean {
    return this.installed.value.has(`${item.entry.id}@${item.entry.version}`);
  }

  /** Downloads an entry's files into the local library cache (with integrity checks). */
  install(item: LibraryItem): Promise<void> {
    const key = `${item.entry.id}@${item.entry.version}`;
    const running = this.installing.get(key);
    if (running) return running;
    if (!this.usable(item)) return Promise.reject(new UserFacingError('asset-blocked', 'This asset is not available for download.'));
    const isRemote = /^https?:/i.test(item.baseUrl);
    if (isRemote && !this.networkAllowed()) {
      return Promise.reject(new UserFacingError('offline', 'Network access is turned off or unavailable.'));
    }
    const job = Promise.all(
      item.entry.files.map(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const name = file.path.split('/').pop()!;
            const url = new URL(file.path, new URL(item.baseUrl, document.baseURI)).toString();
            const id = this.downloads.enqueue(`${item.entry.name} — ${name}`, url, file, async (bytes) => {
              await this.fs.apply([{ kind: 'write', path: libraryPath(item.entry, name), data: bytes }]);
              resolve();
            });
            const off = this.downloads.events.on('change', (list) => {
              const d = list.find((x) => x.id === id);
              if (!d) return;
              if (d.status === 'failed') {
                off();
                reject(new UserFacingError('download-failed', d.error ?? 'The download failed.'));
              } else if (d.status === 'cancelled') {
                off();
                reject(new UserFacingError('download-cancelled', 'The download was cancelled.'));
              } else if (d.status === 'completed') {
                off();
              }
            });
          }),
      ),
    )
      .then(() => this.refreshInstalled())
      .finally(() => this.installing.delete(key));
    this.installing.set(key, job);
    return job;
  }

  async uninstall(item: LibraryItem): Promise<void> {
    await this.fs.apply([{ kind: 'delete-prefix', prefix: `library/${item.entry.id}/${item.entry.version}` }]);
    await this.refreshInstalled();
  }

  async readFile(item: LibraryItem, role: 'main' | 'license'): Promise<Uint8Array | null> {
    const file = item.entry.files.find((f) => f.role === role);
    if (!file) return null;
    if (!this.isInstalled(item)) await this.install(item);
    return this.fs.readBytes(libraryPath(item.entry, file.path.split('/').pop()!));
  }

  /** Licence text: from the local library if installed, otherwise from the bundled pack. */
  async licenseText(item: LibraryItem): Promise<string | null> {
    const file = item.entry.files.find((f) => f.role === 'license');
    if (!file) return null;
    const local = await this.fs.readText(libraryPath(item.entry, file.path.split('/').pop()!));
    if (local) return local;
    if (/^https?:/i.test(item.baseUrl) && !this.networkAllowed()) return null;
    const res = await fetch(new URL(file.path, new URL(item.baseUrl, document.baseURI)));
    return res.ok ? res.text() : null;
  }

  /** Builds the project-asset record for an entry (licence travels with the project). */
  async toProjectAsset(item: LibraryItem): Promise<NewAssetInput> {
    const e = item.entry;
    if (e.kind !== 'model') throw new UserFacingError('asset-kind', 'Only model assets can be added as files.');
    const main = e.files.find((f) => f.role === 'main')!;
    const bytes = await this.readFile(item, 'main');
    if (!bytes) throw new UserFacingError('asset-missing', 'The asset file is missing from the library cache.');
    return {
      name: e.name,
      kind: 'model',
      fileFormat: 'glb',
      mainFile: main.path.split('/').pop()!,
      files: [{ name: main.path.split('/').pop()!, bytes }],
      originalBytes: bytes.byteLength,
      provenance: {
        source: item.section === 'official' ? 'official' : 'free-open',
        userConfirmedRights: false,
        originalFileName: main.path,
        catalogId: e.id,
        catalogVersion: e.version,
        license: e.license,
      },
      importSettings: null,
      stats: e.stats,
    };
  }

  // ---- thumbnails (lazy, cached, one at a time) ----------------------------------------------

  async thumbnail(item: LibraryItem, size: number): Promise<string | null> {
    const e = item.entry;
    if (e.kind === 'material') return null;
    const key = thumbPath(e, size);
    const cachedUrl = this.thumbUrls.get(key);
    if (cachedUrl) return cachedUrl;
    let bytes = await this.fs.readBytes(key);
    if (!bytes) {
      if (!this.usable(item)) return null;
      const model = await this.readFile(item, 'main');
      if (!model) return null;
      if (!this.thumbs) {
        const { ThumbnailRenderer } = await import('@mythic-forge/renderer');
        this.thumbs = new ThumbnailRenderer();
      }
      bytes = await this.thumbs.renderModel(model, size);
      await this.fs.apply([{ kind: 'write', path: key, data: bytes }]);
    }
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/webp' }));
    this.thumbUrls.set(key, url);
    return url;
  }

  async clearThumbnails(): Promise<void> {
    for (const url of this.thumbUrls.values()) URL.revokeObjectURL(url);
    this.thumbUrls.clear();
    await this.fs.apply([{ kind: 'delete-prefix', prefix: 'cache/thumbnails' }]);
  }

  /**
   * Checks the configured remote repository for a newer catalog (user-initiated only).
   * Remote entries replace bundled ones with the same id and a higher version.
   */
  async checkRemote(): Promise<{ changed: boolean; count: number }> {
    if (!config.assetRepositoryUrl) {
      throw new UserFacingError('no-repo', 'No online asset repository is configured for this build. The bundled library is used.');
    }
    const client = new AssetRepositoryClient({
      baseUrl: config.assetRepositoryUrl,
      fetch: (url, init) => fetch(url, init),
      networkAllowed: this.networkAllowed,
    });
    const result = await client.fetchCatalog(null);
    const remote = result.parsed.catalog.entries.filter((e) => isValidId(e.id));
    const merged = [...this.items.value];
    for (const entry of remote) {
      const item: LibraryItem = {
        entry,
        section: entry.section,
        baseUrl: config.assetRepositoryUrl,
        published: isPubliclyAvailable(entry.license, entry.review),
        verdict: verifyForPublicDistribution(entry.license),
      };
      const idx = merged.findIndex((m) => m.entry.id === entry.id);
      if (idx < 0) merged.push(item);
      else if (merged[idx]!.entry.version.localeCompare(entry.version, undefined, { numeric: true }) < 0) merged[idx] = item;
    }
    this.items.value = merged;
    return { changed: result.changed, count: remote.length };
  }

  dispose(): void {
    this.thumbs?.dispose();
    for (const url of this.thumbUrls.values()) URL.revokeObjectURL(url);
    this.thumbUrls.clear();
  }
}
