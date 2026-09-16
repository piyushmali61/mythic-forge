/**
 * Platform abstraction. `core` depends only on these interfaces;
 * implementations live in `@mythic-forge/platform` (web, Android/Capacitor, desktop/Tauri).
 */

export interface FileStat {
  path: string;
  size: number;
  modifiedAt: number;
}

export type WriteData = string | Uint8Array;

export interface WriteOp {
  kind: 'write';
  path: string;
  data: WriteData;
}

export interface DeleteOp {
  kind: 'delete';
  /** Deletes this exact path. */
  path: string;
}

export interface DeletePrefixOp {
  kind: 'delete-prefix';
  /** Deletes every file whose path starts with `prefix/`. */
  prefix: string;
}

export type FsOp = WriteOp | DeleteOp | DeletePrefixOp;

/**
 * Virtual file system with forward-slash paths.
 * `apply` MUST be atomic: either every operation is applied or none are.
 * This is what makes project saves crash-safe.
 */
export interface FileSystem {
  readonly id: string;
  /** False when data won't survive a restart (e.g. storage unavailable). */
  readonly persistent: boolean;
  readText(path: string): Promise<string | null>;
  readBytes(path: string): Promise<Uint8Array | null>;
  stat(path: string): Promise<FileStat | null>;
  /** Files whose path starts with `prefix/` (recursive). */
  list(prefix: string): Promise<FileStat[]>;
  apply(ops: readonly FsOp[]): Promise<void>;
  /** Copies every file under `fromPrefix/` to `toPrefix/` atomically. */
  copyPrefix(fromPrefix: string, toPrefix: string): Promise<void>;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export type LifecycleState = 'active' | 'hidden' | 'background';

export interface Lifecycle {
  readonly state: LifecycleState;
  /** Called on every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: LifecycleState) => void): () => void;
  /** Last chance to persist before the process may be killed. Handlers must be fast and synchronous where possible. */
  onBeforeExit(handler: () => void): () => void;
}

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';

export interface PowerState {
  /** 0..1, or null when unknown. */
  batteryLevel: number | null;
  charging: boolean | null;
  /** OS-level battery saver is on. */
  lowPowerMode: boolean | null;
  thermal: ThermalState;
}

export interface PowerMonitor {
  readonly state: PowerState;
  /** Event-driven: implementations must not poll sensors. */
  subscribe(listener: (state: PowerState) => void): () => void;
}

export interface DeviceInfo {
  platform: 'web' | 'android' | 'windows' | 'macos' | 'linux' | 'ios';
  /** Running inside a native shell (Capacitor/Tauri) rather than a browser tab. */
  isNativeShell: boolean;
  isMobile: boolean;
  isTouch: boolean;
  /** Approximate RAM in GB (browsers cap this at 8), or null. */
  memoryGB: number | null;
  cpuCores: number | null;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  prefersReducedMotion: boolean;
  userAgent: string;
}

export interface PickedFile {
  name: string;
  size: number;
  bytes(): Promise<Uint8Array>;
}

export interface UserFiles {
  /** Opens the system file picker. Returns an empty list when cancelled. */
  pick(options: { accept: string; multiple: boolean }): Promise<PickedFile[]>;
  /** Hands a file to the user (download on desktop, share sheet on Android). */
  save(name: string, data: Uint8Array, mime: string): Promise<'saved' | 'shared' | 'cancelled'>;
}

export interface NetworkInfo {
  readonly online: boolean;
  /** True when the OS reports a metered/data-saver connection (null if unknown). */
  readonly saveData: boolean | null;
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface Platform {
  readonly fs: FileSystem;
  readonly kv: KeyValueStore;
  readonly lifecycle: Lifecycle;
  readonly power: PowerMonitor;
  readonly device: DeviceInfo;
  readonly files: UserFiles;
  readonly network: NetworkInfo;
  /** Asks the OS to keep app storage from being evicted. Returns whether storage is persistent. */
  requestPersistentStorage(): Promise<boolean>;
  /** Bytes used / available, if known. */
  storageEstimate(): Promise<{ usage: number | null; quota: number | null }>;
}
