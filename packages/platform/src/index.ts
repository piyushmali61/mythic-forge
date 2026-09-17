import { Capacitor } from '@capacitor/core';
import {
  MemoryFileSystem,
  MemoryKeyValueStore,
  log,
  type FileSystem,
  type KeyValueStore,
  type Platform,
} from '@mythic-forge/core';
import { IndexedDbFileSystem, IndexedDbKeyValueStore, openDatabase } from './web/idb-fs.ts';
import {
  WebLifecycle,
  WebNetworkInfo,
  WebPowerMonitor,
  WebUserFiles,
  detectWebPlatform,
  readDeviceInfo,
} from './web/web-services.ts';

export { IndexedDbFileSystem, IndexedDbKeyValueStore, openDatabase } from './web/idb-fs.ts';
export { WebLifecycle, WebPowerMonitor, WebUserFiles, WebNetworkInfo, readDeviceInfo } from './web/web-services.ts';

export type ShellKind = 'browser' | 'capacitor' | 'tauri';

export interface AppPlatform extends Platform {
  readonly shell: ShellKind;
  /** Registers an Android back-button handler (no-op elsewhere). Return true to consume. */
  onBack(handler: () => boolean): () => void;
}

export function detectShell(): ShellKind {
  try {
    if (Capacitor.isNativePlatform()) return 'capacitor';
  } catch {
    // Fall back to window inspection if Capacitor hasn't initialized yet
  }
  const w = globalThis as unknown as {
    androidBridge?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean };
    __TAURI_INTERNALS__?: unknown;
  };
  if (w.androidBridge || w.Capacitor?.isNativePlatform?.()) return 'capacitor';
  if (w.__TAURI_INTERNALS__) return 'tauri';
  return 'browser';
}

async function openStorage(): Promise<{ fs: FileSystem; kv: KeyValueStore }> {
  try {
    const db = await openDatabase();
    return { fs: new IndexedDbFileSystem(db), kv: new IndexedDbKeyValueStore(db) };
  } catch (error) {
    log.error('Platform', 'Persistent storage is unavailable; changes will be lost when the app closes.', String(error));
    return { fs: new MemoryFileSystem(), kv: new MemoryKeyValueStore() };
  }
}

/**
 * Creates the platform services for the current environment. Native-shell modules are loaded
 * lazily so the browser build never pays for them.
 */
export async function createPlatform(): Promise<AppPlatform> {
  const shell = detectShell();
  const { fs, kv } = await openStorage();
  const lifecycle = new WebLifecycle();
  const network = new WebNetworkInfo();

  const storageEstimate = async () => {
    try {
      const e = await navigator.storage?.estimate?.();
      return { usage: e?.usage ?? null, quota: e?.quota ?? null };
    } catch {
      return { usage: null, quota: null };
    }
  };

  if (shell === 'capacitor') {
    const android = await import('./capacitor/android.ts');
    android.wireAndroidLifecycle(lifecycle);
    android.wireAndroidBackButton();
    return {
      shell,
      fs,
      kv,
      lifecycle,
      network,
      power: new android.AndroidPowerMonitor(),
      device: readDeviceInfo('android', true),
      files: new android.AndroidUserFiles(),
      // App-private storage on Android is not subject to browser eviction.
      requestPersistentStorage: async () => fs.persistent,
      storageEstimate,
      onBack: android.onAndroidBack,
    };
  }

  const isTauri = shell === 'tauri';
  return {
    shell,
    fs,
    kv,
    lifecycle,
    network,
    power: new WebPowerMonitor(),
    device: readDeviceInfo(isTauri ? 'windows' : detectWebPlatform(), isTauri),
    files: new WebUserFiles(),
    requestPersistentStorage: async () => {
      if (!fs.persistent) return false;
      if (isTauri) return true;
      try {
        return (await navigator.storage?.persist?.()) ?? false;
      } catch {
        return false;
      }
    },
    storageEstimate,
    onBack: () => () => undefined,
  };
}
