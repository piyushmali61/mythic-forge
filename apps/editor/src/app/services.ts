import {
  DESKTOP_LIMITS,
  DownloadManager,
  MOBILE_LIMITS,
  ProjectStore,
  RecoveryStore,
  classifyDevice,
  log,
  type DeviceClassification,
  type ResourceLimits,
} from '@mythic-forge/core';
import { createPlatform, type AppPlatform } from '@mythic-forge/platform';
import { probeGpu, type GpuProbe } from '@mythic-forge/renderer/probe';
import { config } from '../lib/config.ts';
import { CatalogService } from './catalog-service.ts';

export interface Services {
  platform: AppPlatform;
  store: ProjectStore;
  recovery: RecoveryStore;
  limits: ResourceLimits;
  downloads: DownloadManager;
  catalogs: CatalogService;
  gpu: GpuProbe;
  device: DeviceClassification;
  /** Whether the OS/browser promised not to evict our storage. */
  persistentStorage: boolean;
}

export async function bootstrap(networkAllowed: () => boolean): Promise<Services> {
  log.configure({ minLevel: config.isDev ? 'debug' : 'info', mirrorToConsole: config.isDev });
  const platform = await createPlatform();
  const limits = platform.device.isMobile ? MOBILE_LIMITS : DESKTOP_LIMITS;
  const store = new ProjectStore(platform.fs, limits);
  const recovery = new RecoveryStore(platform.fs, platform.kv);
  // Bundled packs are same-origin files, so the manager itself never blocks them;
  // CatalogService checks the network policy before any remote download.
  const downloads = new DownloadManager({ fetch: (url, init) => fetch(url, init), networkAllowed: () => true });
  const catalogs = new CatalogService(platform.fs, downloads, networkAllowed);

  const gpu = probeGpu();
  const device = classifyDevice({
    isMobile: platform.device.isMobile,
    memoryGB: platform.device.memoryGB,
    cpuCores: platform.device.cpuCores,
    gpuRenderer: gpu.renderer,
    maxTextureSize: gpu.maxTextureSize,
    webgl2: gpu.webgl2,
  });
  log.info(
    'Device',
    `${platform.shell} on ${platform.device.platform}; quality tier ${device.tier} (${device.reasons.join(', ')})`,
  );
  if (!platform.fs.persistent) log.warn('Storage', 'Using temporary storage — projects will not be kept after closing.');

  let persistentStorage = false;
  try {
    persistentStorage = await platform.requestPersistentStorage();
  } catch {
    persistentStorage = false;
  }

  return { platform, store, recovery, limits, downloads, catalogs, gpu, device, persistentStorage };
}
