/**
 * Asset licence model and the public-distribution gate.
 *
 * IMPORTANT: software cannot decide whether a licence is genuine or applies to a file.
 * These checks guarantee that the required verification DATA exists and is internally
 * consistent, and they BLOCK distribution otherwise. A named human reviewer is still
 * responsible for the verification itself.
 */

export interface LicenseInfo {
  id: string;
  name: string;
  url: string;
  commercialUse: boolean;
  modification: boolean;
  redistribution: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  /** Whether assets under this licence may be bundled in the public Mythic Forge library. */
  acceptableForPublicLibrary: boolean;
  notes: string;
}

export const KNOWN_LICENSES: Readonly<Record<string, LicenseInfo>> = {
  'CC0-1.0': {
    id: 'CC0-1.0',
    name: 'Creative Commons Zero v1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: false,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes: 'Public-domain dedication. Crediting the creator is still good practice.',
  },
  'PDM-1.0': {
    id: 'PDM-1.0',
    name: 'Public Domain Mark 1.0',
    url: 'https://creativecommons.org/publicdomain/mark/1.0/',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: false,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes: 'Marks a work already free of known copyright. Public-domain status can differ by country — reviewer must confirm.',
  },
  'CC-BY-4.0': {
    id: 'CC-BY-4.0',
    name: 'Creative Commons Attribution 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes: 'Attribution must be shown wherever the asset is used, including in games built with it.',
  },
  'CC-BY-SA-4.0': {
    id: 'CC-BY-SA-4.0',
    name: 'Creative Commons Attribution-ShareAlike 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: true,
    acceptableForPublicLibrary: false,
    notes: 'ShareAlike obligations on adaptations need legal review before inclusion. Blocked by default.',
  },
  'CC-BY-NC-4.0': {
    id: 'CC-BY-NC-4.0',
    name: 'Creative Commons Attribution-NonCommercial 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    commercialUse: false,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: false,
    acceptableForPublicLibrary: false,
    notes: 'Not usable in commercial games. Not allowed in the public library.',
  },
  'CC-BY-ND-4.0': {
    id: 'CC-BY-ND-4.0',
    name: 'Creative Commons Attribution-NoDerivatives 4.0',
    url: 'https://creativecommons.org/licenses/by-nd/4.0/',
    commercialUse: true,
    modification: false,
    redistribution: true,
    attributionRequired: true,
    shareAlike: false,
    acceptableForPublicLibrary: false,
    notes: 'Cannot be modified. Not allowed in the public library.',
  },
  MIT: {
    id: 'MIT',
    name: 'MIT License',
    url: 'https://opensource.org/license/mit',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes: 'Copyright notice and licence text must be preserved.',
  },
  'Apache-2.0': {
    id: 'Apache-2.0',
    name: 'Apache License 2.0',
    url: 'https://www.apache.org/licenses/LICENSE-2.0',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes: 'Preserve licence text and NOTICE file; state changes.',
  },
  'OFL-1.1': {
    id: 'OFL-1.1',
    name: 'SIL Open Font License 1.1',
    url: 'https://openfontlicense.org/',
    commercialUse: true,
    modification: true,
    redistribution: true,
    attributionRequired: true,
    shareAlike: true,
    acceptableForPublicLibrary: true,
    notes: 'Fonts only. Cannot be sold by itself; reserved font names apply to modified versions.',
  },
  'MBS-ASSET-1.0': {
    id: 'MBS-ASSET-1.0',
    name: 'Mythic Bharat Studios Asset License 1.0 (DRAFT)',
    // No public URL exists yet; the full text ships with the app (licenseTextPath).
    url: '',
    commercialUse: true,
    modification: true,
    redistribution: false,
    attributionRequired: false,
    shareAlike: false,
    acceptableForPublicLibrary: true,
    notes:
      'Use in personal and commercial projects and modify freely. Redistributing the asset files on their own (outside a built project) is not allowed. DRAFT — requires legal review before release.',
  },
};

export type VerificationStatus = 'unverified' | 'verified' | 'rejected';

export interface AssetLicenseRecord {
  assetId: string;
  name: string;
  creator: string;
  /** Copyright holder (may differ from creator, e.g. work-for-hire). */
  owner: string;
  /** Original public source. Empty for in-house assets (use `sourceDescription`). */
  sourceUrl: string;
  sourceDescription: string;
  /** Key of KNOWN_LICENSES, or 'CUSTOM'. */
  licenseId: string;
  licenseName: string;
  licenseUrl: string;
  /** Path of the preserved licence text inside the asset package, if any. */
  licenseTextPath: string | null;
  commercialUse: boolean;
  modificationAllowed: boolean;
  /**
   * Whether Mythic Bharat Studios may redistribute this asset *through the Mythic Forge library*.
   * For MBS-owned assets this is true even though end users may not redistribute raw files.
   */
  redistributionAllowed: boolean;
  attributionRequired: boolean;
  /** Ready-to-copy credit line (required when attribution is required). */
  attributionText: string;
  assetVersion: string;
  containsThirdPartyContent: boolean;
  thirdPartyContentCleared: boolean;
  verifiedBy: string;
  /** ISO date (YYYY-MM-DD). */
  verificationDate: string;
  verificationStatus: VerificationStatus;
  verificationNotes: string;
}

export type LicenseCheckId =
  | 'license-exists'
  | 'license-identifiable'
  | 'redistribution-allowed'
  | 'intended-use-allowed'
  | 'attribution-understood'
  | 'source-documented'
  | 'no-restricted-content'
  | 'license-preserved'
  | 'license-acceptable'
  | 'human-verified';

export interface LicenseCheck {
  id: LicenseCheckId;
  passed: boolean;
  message: string;
}

export interface LicenseVerdict {
  ok: boolean;
  checks: LicenseCheck[];
  failures: LicenseCheck[];
}

const isHttpsUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));

/** Runs the §15 checklist. Any failure means: BLOCK PUBLIC DISTRIBUTION. */
export function verifyForPublicDistribution(record: AssetLicenseRecord): LicenseVerdict {
  const known = KNOWN_LICENSES[record.licenseId];
  const isMbs = record.licenseId === 'MBS-ASSET-1.0';
  const checks: LicenseCheck[] = [];
  const add = (id: LicenseCheckId, passed: boolean, message: string): void => {
    checks.push({ id, passed, message });
  };

  add(
    'license-exists',
    !!record.licenseId && record.licenseId !== 'UNKNOWN' && !!record.licenseName.trim(),
    'A licence is recorded.',
  );
  add(
    'license-identifiable',
    !!known || (record.licenseId === 'CUSTOM' && (isHttpsUrl(record.licenseUrl) || !!record.licenseTextPath)),
    known ? `Identified as ${known.name}.` : 'Custom licences need a licence URL or preserved licence text.',
  );

  // For MBS-owned assets the studio is the rights holder, so library redistribution is the owner's decision.
  const licensePermitsRedistribution = isMbs ? record.owner === 'Mythic Bharat Studios' : (known?.redistribution ?? true);
  add(
    'redistribution-allowed',
    record.redistributionAllowed && licensePermitsRedistribution,
    isMbs && record.owner !== 'Mythic Bharat Studios'
      ? 'MBS licence may only be applied to assets owned by Mythic Bharat Studios.'
      : 'Redistribution through the Mythic Forge library is permitted.',
  );

  const contradicts =
    !!known && ((record.commercialUse && !known.commercialUse) || (record.modificationAllowed && !known.modification));
  add(
    'intended-use-allowed',
    record.commercialUse && record.modificationAllowed && !contradicts,
    contradicts
      ? 'The record claims permissions the licence does not grant.'
      : 'Commercial use and modification are both allowed (required for the library).',
  );

  const attributionContradiction = !!known && known.attributionRequired && !record.attributionRequired && !isMbs;
  add(
    'attribution-understood',
    !attributionContradiction && (!record.attributionRequired || record.attributionText.trim().length > 0),
    attributionContradiction
      ? 'The licence requires attribution but the record says it does not.'
      : record.attributionRequired
        ? 'Attribution text is provided.'
        : 'No attribution required.',
  );

  add(
    'source-documented',
    isHttpsUrl(record.sourceUrl) || record.sourceDescription.trim().length >= 10,
    'Source is documented (HTTPS URL or an in-house description).',
  );
  add(
    'no-restricted-content',
    !record.containsThirdPartyContent || record.thirdPartyContentCleared,
    record.containsThirdPartyContent
      ? 'Third-party content inside the asset has been cleared.'
      : 'No third-party content declared.',
  );
  add(
    'license-preserved',
    isHttpsUrl(record.licenseUrl) || !!record.licenseTextPath,
    'Licence text is preserved (URL or bundled text).',
  );
  add(
    'license-acceptable',
    known ? known.acceptableForPublicLibrary : record.licenseId === 'CUSTOM',
    known && !known.acceptableForPublicLibrary ? `${known.name}: ${known.notes}` : 'Licence type is acceptable for the public library.',
  );
  add(
    'human-verified',
    record.verificationStatus === 'verified' && record.verifiedBy.trim().length > 0 && isIsoDate(record.verificationDate),
    'A named reviewer verified the licence and recorded the date.',
  );

  const failures = checks.filter((c) => !c.passed);
  return { ok: failures.length === 0, checks, failures };
}

/** TASL-style credit: Title, Author, Source, Licence. */
export function buildAttribution(record: Pick<AssetLicenseRecord, 'name' | 'creator' | 'sourceUrl' | 'licenseName' | 'licenseUrl' | 'attributionText'>): string {
  if (record.attributionText.trim()) return record.attributionText.trim();
  const source = record.sourceUrl ? ` (${record.sourceUrl})` : '';
  const license = record.licenseUrl ? `${record.licenseName} — ${record.licenseUrl}` : record.licenseName;
  return `"${record.name}" by ${record.creator}${source}, licensed under ${license}.`;
}

/** Plain-language permission summary for the licence UI. */
export function describePermissions(record: AssetLicenseRecord): { label: string; value: string }[] {
  return [
    { label: 'Commercial use', value: record.commercialUse ? 'Yes' : 'No' },
    { label: 'Modification', value: record.modificationAllowed ? 'Yes' : 'No' },
    {
      label: 'Redistribution',
      value:
        record.licenseId === 'MBS-ASSET-1.0'
          ? 'Only inside projects you build — not as standalone files'
          : record.redistributionAllowed
            ? 'Yes'
            : 'No',
    },
    { label: 'Attribution', value: record.attributionRequired ? 'Required' : 'Not required' },
  ];
}
