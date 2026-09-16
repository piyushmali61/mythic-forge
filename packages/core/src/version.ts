export const ENGINE_NAME = 'Mythic Forge';
export const STUDIO_NAME = 'Mythic Bharat Studios';
export const TAGLINE = 'Create. Build. Play.';

/** Semantic version of the engine/editor. */
export const ENGINE_VERSION = '0.1.0';
/** Bump when the on-disk project manifest layout changes. Add a migration in project/migrate.ts. */
export const PROJECT_FORMAT_VERSION = 1;
/** Bump when the scene document layout changes. */
export const SCENE_FORMAT_VERSION = 1;
/** Bump when rendering output of an unchanged scene would differ noticeably. */
export const RENDERER_VERSION = 1;
/** Bump when the .mfpack archive layout changes. */
export const PACK_FORMAT_VERSION = 1;

/** Compares two `major.minor.patch` versions. Pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function parseVersion(v: string): number[] {
  const core = v.split('-')[0] ?? '';
  return core.split('.').map((n) => {
    const x = Number.parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
}
