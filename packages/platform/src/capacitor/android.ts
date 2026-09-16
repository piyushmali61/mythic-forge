import { App } from '@capacitor/app';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { bytesToBase64, log, sanitizeFileName, type ThermalState, type UserFiles } from '@mythic-forge/core';
import { WebLifecycle, WebPowerMonitor, WebUserFiles } from '../web/web-services.ts';

/**
 * Native plugin implemented in apps/android (ThermalStatusPlugin.java).
 * Uses PowerManager thermal status + power-save broadcasts: event-driven, no polling.
 */
interface ThermalStatusPlugin {
  getStatus(): Promise<{ thermal: ThermalState; powerSave: boolean }>;
  addListener(event: 'change', cb: (s: { thermal: ThermalState; powerSave: boolean }) => void): Promise<PluginListenerHandle>;
}

const ThermalStatus = registerPlugin<ThermalStatusPlugin>('ThermalStatus');

/** Native plugin in apps/android (ProjectExportPlugin.java): writes to cache/exports and opens the share sheet. */
interface ProjectExportPlugin {
  share(options: { name: string; data: string; mime: string }): Promise<{ closed: boolean }>;
}

const ProjectExport = registerPlugin<ProjectExportPlugin>('ProjectExport');

/** Feeds Android app-state events (pause/resume) into the shared lifecycle. */
export function wireAndroidLifecycle(lifecycle: WebLifecycle): void {
  void App.addListener('appStateChange', ({ isActive }) => lifecycle.set(isActive ? 'active' : 'background'));
  void App.addListener('pause', () => lifecycle.set('background'));
  void App.addListener('resume', () => lifecycle.set('active'));
}

export type BackHandler = () => boolean;
const backHandlers: BackHandler[] = [];

/**
 * Android back button: the most recently registered handler that returns true consumes it
 * (close dialog, leave editor…). If nothing handles it, the app is minimised rather than killed.
 */
export function onAndroidBack(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.indexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

export function wireAndroidBackButton(): void {
  void App.addListener('backButton', () => {
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      if (backHandlers[i]!()) return;
    }
    void App.minimizeApp();
  });
}

export class AndroidPowerMonitor extends WebPowerMonitor {
  private handle: PluginListenerHandle | null = null;

  constructor() {
    super();
    ThermalStatus.getStatus()
      .then((s) => this.update({ thermal: s.thermal, lowPowerMode: s.powerSave }))
      .catch((e: unknown) => log.debug('Platform', 'Thermal status unavailable', String(e)));
  }

  protected override startPressure(): void {
    ThermalStatus.addListener('change', (s) => this.update({ thermal: s.thermal, lowPowerMode: s.powerSave }))
      .then((h) => {
        this.handle = h;
      })
      .catch(() => undefined);
  }

  protected override stopPressure(): void {
    void this.handle?.remove();
    this.handle = null;
  }
}

/** Picking uses the WebView file chooser; saving goes through the Android share sheet. */
export class AndroidUserFiles implements UserFiles {
  private readonly web = new WebUserFiles();

  pick(options: { accept: string; multiple: boolean }) {
    return this.web.pick(options);
  }

  async save(name: string, data: Uint8Array, mime: string): Promise<'saved' | 'shared' | 'cancelled'> {
    // Base64 over the bridge is simple but memory-hungry for very large files; see docs/android.md.
    await ProjectExport.share({ name: sanitizeFileName(name, 'export'), data: bytesToBase64(data), mime });
    return 'shared';
  }
}
