/**
 * Build-time configuration. Values come from VITE_* environment variables (see .env.example).
 * Empty values mean "not configured" and the UI says so instead of inventing links.
 */
const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const httpsOnly = (v: string): string => {
  if (!v) return '';
  try {
    return new URL(v).protocol === 'https:' ? v : '';
  } catch {
    return '';
  }
};

export const config = {
  /** Remote official repository. Empty = use the pack bundled with the app. */
  assetRepositoryUrl: httpsOnly(clean(import.meta.env.VITE_ASSET_REPOSITORY_URL)),
  websiteUrl: httpsOnly(clean(import.meta.env.VITE_WEBSITE_URL)),
  supportUrl: httpsOnly(clean(import.meta.env.VITE_SUPPORT_URL)),
  privacyPolicyUrl: httpsOnly(clean(import.meta.env.VITE_PRIVACY_POLICY_URL)),
  termsUrl: httpsOnly(clean(import.meta.env.VITE_TERMS_URL)),
  /**
   * Show official assets that have not completed studio sign-off. Always on in development;
   * off in release builds unless explicitly enabled for internal test builds.
   */
  includeUnreviewedAssets: import.meta.env.DEV || clean(import.meta.env.VITE_INCLUDE_UNREVIEWED_ASSETS) === 'true',
  isDev: import.meta.env.DEV,
};

/** Bundled asset packs, relative to the app. */
export const BUNDLED_PACKS = {
  official: './asset-packs/official/',
  'free-open': './asset-packs/free-open/',
} as const;
