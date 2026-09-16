export interface GpuProbe {
  webgl2: boolean;
  renderer: string | null;
  vendor: string | null;
  maxTextureSize: number | null;
}

let cached: GpuProbe | null = null;

/**
 * One-off WebGL 2 capability check. The context is released immediately afterwards.
 * The GPU name is used only on this device to choose a quality tier; it is never sent anywhere.
 */
export function probeGpu(): GpuProbe {
  if (cached) return cached;
  const result: GpuProbe = { webgl2: false, renderer: null, vendor: null, maxTextureSize: null };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2', { powerPreference: 'low-power', failIfMajorPerformanceCaveat: false });
    if (gl) {
      result.webgl2 = true;
      result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      result.renderer = (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) as string;
      result.vendor = (info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) as string;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // Leave defaults: treated as no WebGL 2.
  }
  cached = result;
  return result;
}
