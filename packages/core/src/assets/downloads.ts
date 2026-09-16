import { concatBytes } from '../util/bytes.ts';
import { Emitter } from '../util/emitter.ts';
import { createId } from '../util/ids.ts';
import { describeError } from '../util/errors.ts';
import type { CatalogFile } from './catalog.ts';
import { verifyFile, type FetchLike } from './repository.ts';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export interface DownloadItem {
  id: string;
  label: string;
  url: string;
  file: CatalogFile;
  received: number;
  total: number;
  status: DownloadStatus;
  error: string | null;
  /** Bytes per second over the last few seconds. */
  speed: number;
}

interface Internal {
  item: DownloadItem;
  chunks: Uint8Array[];
  controller: AbortController | null;
  samples: { at: number; bytes: number }[];
  onComplete: (bytes: Uint8Array) => Promise<void> | void;
}

export interface DownloadManagerOptions {
  fetch: FetchLike;
  networkAllowed: () => boolean;
  maxConcurrent?: number;
  now?: () => number;
}

/**
 * Pausable, resumable downloads (HTTP Range requests) with integrity verification.
 * Nothing runs unless the user started it, and everything stops when the network
 * is disallowed or the app is backgrounded (`pauseAll`).
 */
export class DownloadManager {
  readonly events = new Emitter<{ change: readonly DownloadItem[] }>();
  private items = new Map<string, Internal>();
  private readonly options: Required<DownloadManagerOptions>;
  private lastEmit = 0;

  constructor(options: DownloadManagerOptions) {
    this.options = { maxConcurrent: 2, now: () => Date.now(), ...options };
  }

  list(): DownloadItem[] {
    return [...this.items.values()].map((i) => ({ ...i.item }));
  }

  enqueue(label: string, url: string, file: CatalogFile, onComplete: (bytes: Uint8Array) => Promise<void> | void): string {
    const id = createId('dl');
    this.items.set(id, {
      item: { id, label, url, file, received: 0, total: file.bytes, status: 'queued', error: null, speed: 0 },
      chunks: [],
      controller: null,
      samples: [],
      onComplete,
    });
    this.emit(true);
    this.pump();
    return id;
  }

  pause(id: string): void {
    const d = this.items.get(id);
    if (!d || (d.item.status !== 'downloading' && d.item.status !== 'queued')) return;
    d.item.status = 'paused';
    d.controller?.abort();
    d.controller = null;
    d.item.speed = 0;
    this.emit(true);
    this.pump();
  }

  resume(id: string): void {
    const d = this.items.get(id);
    if (!d || (d.item.status !== 'paused' && d.item.status !== 'failed')) return;
    d.item.status = 'queued';
    d.item.error = null;
    this.emit(true);
    this.pump();
  }

  cancel(id: string): void {
    const d = this.items.get(id);
    if (!d) return;
    d.controller?.abort();
    d.item.status = 'cancelled';
    d.chunks = [];
    d.item.received = 0;
    this.emit(true);
    this.pump();
  }

  /** Removes finished/cancelled entries from the list. */
  clearFinished(): void {
    for (const [id, d] of this.items) {
      if (d.item.status === 'completed' || d.item.status === 'cancelled') this.items.delete(id);
    }
    this.emit(true);
  }

  pauseAll(): void {
    for (const d of this.items.values()) {
      if (d.item.status === 'downloading' || d.item.status === 'queued') this.pause(d.item.id);
    }
  }

  private active(): number {
    let n = 0;
    for (const d of this.items.values()) if (d.item.status === 'downloading' || d.item.status === 'verifying') n++;
    return n;
  }

  private pump(): void {
    if (!this.options.networkAllowed()) return;
    for (const d of this.items.values()) {
      if (this.active() >= this.options.maxConcurrent) return;
      if (d.item.status === 'queued') void this.run(d);
    }
  }

  private async run(d: Internal): Promise<void> {
    d.item.status = 'downloading';
    const controller = new AbortController();
    d.controller = controller;
    this.emit(true);
    try {
      const headers: Record<string, string> = {};
      if (d.item.received > 0) headers.Range = `bytes=${d.item.received}-`;
      const res = await this.options.fetch(d.item.url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (d.item.received > 0 && res.status !== 206) {
        // Server ignored the range: start over.
        d.chunks = [];
        d.item.received = 0;
      }
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) return;
          d.chunks.push(value);
          d.item.received += value.byteLength;
          if (d.item.total && d.item.received > d.item.total) throw new Error('Received more data than expected');
          this.sample(d);
          this.emit(false);
        }
      } else {
        const buf = new Uint8Array(await res.arrayBuffer());
        d.chunks.push(buf);
        d.item.received += buf.byteLength;
      }
      if (controller.signal.aborted) return;
      d.item.status = 'verifying';
      d.item.speed = 0;
      this.emit(true);
      const bytes = concatBytes(d.chunks);
      await verifyFile(d.item.file, bytes);
      await d.onComplete(bytes);
      d.chunks = [];
      d.item.status = 'completed';
    } catch (error) {
      if (controller.signal.aborted) return;
      d.item.status = 'failed';
      d.item.error = describeError(error, 'The download failed.').message;
      // A failed integrity check must restart from scratch.
      d.chunks = [];
      d.item.received = 0;
    } finally {
      if (d.controller === controller) d.controller = null;
      this.emit(true);
      this.pump();
    }
  }

  private sample(d: Internal): void {
    const now = this.options.now();
    d.samples.push({ at: now, bytes: d.item.received });
    while (d.samples.length > 2 && now - d.samples[0]!.at > 3000) d.samples.shift();
    const first = d.samples[0]!;
    const span = (now - first.at) / 1000;
    d.item.speed = span > 0 ? (d.item.received - first.bytes) / span : 0;
  }

  /** Progress events are throttled to 4/s to keep the UI cheap. */
  private emit(force: boolean): void {
    const now = this.options.now();
    if (!force && now - this.lastEmit < 250) return;
    this.lastEmit = now;
    this.events.emit('change', this.list());
  }
}
