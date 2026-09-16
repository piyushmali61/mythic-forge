import { minLevel, type QualityLevel } from './profiles.ts';

export interface DeviceSignals {
  isMobile: boolean;
  memoryGB: number | null;
  cpuCores: number | null;
  /** Unmasked WebGL renderer string, if the browser exposes it. Used locally only. */
  gpuRenderer: string | null;
  maxTextureSize: number | null;
  webgl2: boolean;
}

export interface DeviceClassification {
  tier: QualityLevel;
  reasons: string[];
  softwareRendering: boolean;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|microsoft basic render|mesa offscreen/i;
const LOW_END_MOBILE_GPU = /mali-(4\d\d|t[678]\d\d|g31|g51|g52)|adreno[^0-9]*(3\d\d|4\d\d|50\d|51\d)|powervr (sgx|rogue ge\d)|vivante|videocore/i;
const HIGH_END_MOBILE_GPU = /adreno[^0-9]*(7[3-9]\d|8\d\d)|mali-g(7[6-9]|710|715|720|925)|immortalis|xclipse|apple a1[5-9]|apple m\d/i;
const DESKTOP_DISCRETE = /geforce|rtx|quadro|radeon (rx|pro)|arc a\d|radeon\(tm\) rx/i;
const DESKTOP_HIGH_END = /rtx (30[6-9]0|40[6-9]0|50[6-9]0)|radeon rx (6[7-9]|7[7-9]|9[0-9])\d\d/i;
const DESKTOP_WEAK_IGPU = /intel.*(hd graphics ?(2|3|4|5)\d{2,3}|hd graphics$)|gma|radeon r[2-5]/i;

/**
 * Heuristic device classification. It is deliberately conservative: the adaptive governor
 * can always lower quality further at runtime, and users can override it.
 */
export function classifyDevice(s: DeviceSignals): DeviceClassification {
  const reasons: string[] = [];
  const gpu = s.gpuRenderer ?? '';

  if (!s.webgl2) {
    return { tier: 'ultra-low', reasons: ['WebGL 2 is not available'], softwareRendering: true };
  }
  if (SOFTWARE_GPU.test(gpu)) {
    return { tier: 'ultra-low', reasons: ['Software rendering detected (no GPU acceleration)'], softwareRendering: true };
  }

  let tier: QualityLevel;
  if (s.isMobile) {
    tier = 'medium';
    if (s.memoryGB !== null && s.memoryGB <= 2) {
      tier = 'ultra-low';
      reasons.push(`${s.memoryGB} GB RAM`);
    } else if (s.memoryGB !== null && s.memoryGB <= 4) {
      tier = 'low';
      reasons.push(`${s.memoryGB} GB RAM`);
    }
    if (s.cpuCores !== null && s.cpuCores <= 4) {
      tier = minLevel(tier, 'low');
      reasons.push(`${s.cpuCores} CPU cores`);
    }
    if (LOW_END_MOBILE_GPU.test(gpu)) {
      tier = minLevel(tier, 'low');
      reasons.push('Entry-level mobile GPU');
    } else if (HIGH_END_MOBILE_GPU.test(gpu) && (s.memoryGB === null || s.memoryGB >= 6)) {
      tier = 'high';
      reasons.push('High-end mobile GPU');
    }
  } else {
    tier = 'medium';
    if (DESKTOP_WEAK_IGPU.test(gpu)) {
      tier = 'low';
      reasons.push('Older integrated graphics');
    } else if (DESKTOP_HIGH_END.test(gpu) && (s.cpuCores ?? 0) >= 8) {
      tier = 'ultra';
      reasons.push('High-end discrete GPU');
    } else if (DESKTOP_DISCRETE.test(gpu)) {
      tier = 'high';
      reasons.push('Discrete GPU');
    } else if (/iris|apple|radeon/i.test(gpu)) {
      tier = 'medium';
      reasons.push('Modern integrated graphics');
    } else {
      reasons.push('GPU not identified; using a safe default');
    }
    if (s.memoryGB !== null && s.memoryGB < 4) {
      tier = minLevel(tier, 'low');
      reasons.push(`${s.memoryGB} GB RAM`);
    }
  }

  if (s.maxTextureSize !== null && s.maxTextureSize < 4096) {
    tier = minLevel(tier, 'low');
    reasons.push(`Max texture size ${s.maxTextureSize}`);
  }
  if (reasons.length === 0) reasons.push('Typical device');
  return { tier, reasons, softwareRendering: false };
}
