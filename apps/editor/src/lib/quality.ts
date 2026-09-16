import { resolveQuality, type ProjectManifest, type ResolvedQuality } from '@mythic-forge/core';
import { power, settings, svc } from '../app/state.ts';

/** Concrete quality for the current device, user settings, OS power state and project profile. */
export function currentQuality(project?: Pick<ProjectManifest, 'performanceProfile' | 'customQuality'>): ResolvedQuality {
  const s = settings.value;
  const services = svc();
  return resolveQuality({
    deviceTier: services.device.tier,
    isMobile: services.platform.device.isMobile,
    batteryMode: s.battery.mode,
    projectProfile: project?.performanceProfile ?? 'balanced',
    projectCustomLevel: project?.customQuality ?? null,
    qualityOverride: s.graphics.quality,
    fpsOverride: s.graphics.targetFps,
    lowPowerMode: power.value.lowPowerMode === true,
  });
}

/** WebGL power preference: never ask for the discrete GPU unless the user chose performance. */
export function powerPreference(): WebGLPowerPreference {
  const mode = settings.value.battery.mode;
  if (mode === 'performance') return 'high-performance';
  if (mode === 'max-saving') return 'low-power';
  return 'default';
}
