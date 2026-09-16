import { log, type AudioSink, type ProjectStore } from '@mythic-forge/core';

const MIME: Record<string, string> = { wav: 'audio/wav', ogg: 'audio/ogg', mp3: 'audio/mpeg' };

/** Plays project audio assets during play mode using media elements (no always-on audio graph). */
export class AudioPlayer implements AudioSink {
  private urls = new Map<string, Promise<string | null>>();
  private playing = new Set<HTMLAudioElement>();
  private readonly store: ProjectStore;
  private readonly projectId: string;

  constructor(store: ProjectStore, projectId: string) {
    this.store = store;
    this.projectId = projectId;
  }

  play(assetId: string, options: { volume: number; loop: boolean }): void {
    let url = this.urls.get(assetId);
    if (!url) {
      url = this.load(assetId);
      this.urls.set(assetId, url);
    }
    void url.then((src) => {
      if (!src) return;
      const el = new Audio(src);
      el.volume = Math.max(0, Math.min(1, options.volume));
      el.loop = options.loop;
      el.addEventListener('ended', () => this.playing.delete(el));
      this.playing.add(el);
      el.play().catch((e: unknown) => {
        this.playing.delete(el);
        log.warn('Audio', 'Sound could not be played.', String(e));
      });
    });
  }

  stopAll(): void {
    for (const el of this.playing) {
      el.pause();
      el.removeAttribute('src');
    }
    this.playing.clear();
  }

  dispose(): void {
    this.stopAll();
    for (const p of this.urls.values()) void p.then((u) => u && URL.revokeObjectURL(u));
    this.urls.clear();
  }

  private async load(assetId: string): Promise<string | null> {
    const meta = await this.store.getAsset(this.projectId, assetId);
    if (!meta || meta.kind !== 'audio') return null;
    const bytes = await this.store.readAssetFile(this.projectId, assetId);
    if (!bytes) return null;
    return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[meta.fileFormat] ?? 'audio/mpeg' }));
  }
}
