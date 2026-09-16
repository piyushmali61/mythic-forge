import { describe, expect, it } from 'vitest';
import {
  auditCatalog,
  buildAttribution,
  canPublish,
  newReviewRecord,
  parseCatalog,
  publicEntries,
  transition,
  validateComplaint,
  validateSubmission,
  verifyForPublicDistribution,
  type AssetLicenseRecord,
  type ReviewRecord,
} from '../src/index.ts';

export const mbsRecord = (overrides: Partial<AssetLicenseRecord> = {}): AssetLicenseRecord => ({
  assetId: 'mbs.test',
  name: 'Test Pillar',
  creator: 'Mythic Bharat Studios',
  owner: 'Mythic Bharat Studios',
  sourceUrl: '',
  sourceDescription: 'Procedurally generated in-house by tools/asset-gen.',
  licenseId: 'MBS-ASSET-1.0',
  licenseName: 'Mythic Bharat Studios Asset License 1.0 (DRAFT)',
  licenseUrl: '',
  licenseTextPath: 'licenses/MBS-ASSET-1.0.md',
  commercialUse: true,
  modificationAllowed: true,
  redistributionAllowed: true,
  attributionRequired: false,
  attributionText: '',
  assetVersion: '1.0.0',
  containsThirdPartyContent: false,
  thirdPartyContentCleared: false,
  verifiedBy: 'A. Reviewer',
  verificationDate: '2026-09-16',
  verificationStatus: 'verified',
  verificationNotes: '',
  ...overrides,
});

const cc0Record = (overrides: Partial<AssetLicenseRecord> = {}): AssetLicenseRecord =>
  mbsRecord({
    creator: 'Someone',
    owner: 'Someone',
    sourceUrl: 'https://example.org/asset',
    licenseId: 'CC0-1.0',
    licenseName: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseTextPath: null,
    ...overrides,
  });

const fullyReviewed = (): ReviewRecord => ({
  ...newReviewRecord(),
  stage: 'approved',
  licenseVerified: true,
  contentReview: true,
  technicalReview: true,
});

const failedIds = (r: AssetLicenseRecord) => verifyForPublicDistribution(r).failures.map((f) => f.id);

describe('licence gate (§15)', () => {
  it('passes a complete in-house record', () => {
    expect(verifyForPublicDistribution(mbsRecord()).ok).toBe(true);
    expect(verifyForPublicDistribution(cc0Record()).ok).toBe(true);
  });

  it('blocks unknown/unidentifiable licences', () => {
    expect(failedIds(mbsRecord({ licenseId: 'UNKNOWN' }))).toContain('license-exists');
    expect(failedIds(mbsRecord({ licenseId: 'CUSTOM', licenseUrl: '', licenseTextPath: null }))).toContain('license-identifiable');
  });

  it('blocks non-commercial and no-derivatives licences', () => {
    const nc = failedIds(cc0Record({ licenseId: 'CC-BY-NC-4.0', attributionRequired: true, attributionText: 'x' }));
    expect(nc).toContain('intended-use-allowed'); // record claims commercial use the licence does not grant
    expect(nc).toContain('license-acceptable');
    expect(failedIds(cc0Record({ licenseId: 'CC-BY-ND-4.0', attributionRequired: true, attributionText: 'x' }))).toContain('license-acceptable');
  });

  it('blocks missing redistribution permission, source, or reviewer', () => {
    expect(failedIds(cc0Record({ redistributionAllowed: false }))).toContain('redistribution-allowed');
    expect(failedIds(cc0Record({ sourceUrl: '', sourceDescription: '' }))).toContain('source-documented');
    expect(failedIds(cc0Record({ sourceUrl: 'http://insecure.example' , sourceDescription: ''}))).toContain('source-documented');
    expect(failedIds(cc0Record({ verificationStatus: 'unverified' }))).toContain('human-verified');
    expect(failedIds(cc0Record({ verifiedBy: '' }))).toContain('human-verified');
  });

  it('requires attribution text when attribution is required', () => {
    expect(failedIds(cc0Record({ licenseId: 'CC-BY-4.0', attributionRequired: false }))).toContain('attribution-understood');
    expect(failedIds(cc0Record({ licenseId: 'CC-BY-4.0', attributionRequired: true, attributionText: '' }))).toContain('attribution-understood');
    expect(verifyForPublicDistribution(cc0Record({ licenseId: 'CC-BY-4.0', attributionRequired: true, attributionText: '"X" by Y, CC BY 4.0' })).ok).toBe(true);
  });

  it('blocks uncleared third-party content', () => {
    expect(failedIds(mbsRecord({ containsThirdPartyContent: true }))).toContain('no-restricted-content');
    expect(verifyForPublicDistribution(mbsRecord({ containsThirdPartyContent: true, thirdPartyContentCleared: true })).ok).toBe(true);
  });

  it('only allows the MBS licence on MBS-owned assets', () => {
    expect(failedIds(mbsRecord({ owner: 'Somebody Else' }))).toContain('redistribution-allowed');
  });

  it('builds TASL attributions', () => {
    const text = buildAttribution({ ...cc0Record(), name: 'Rock', creator: 'Jo', attributionText: '' });
    expect(text).toBe('"Rock" by Jo (https://example.org/asset), licensed under CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/.');
  });
});

describe('review workflow (§62/§63)', () => {
  it('walks the happy path to published', () => {
    const lic = mbsRecord();
    let rec = newReviewRecord();
    const steps = [
      ['license-review', 'developer'],
      ['content-review', 'reviewer'],
      ['technical-review', 'reviewer'],
      ['approved', 'reviewer'],
      ['published', 'content-manager'],
    ] as const;
    for (const [to, role] of steps) {
      const r = transition(lic, rec, { to, by: 'Asha', role });
      expect(r.ok, `${to}: ${r.ok ? '' : r.reason}`).toBe(true);
      if (r.ok) rec = r.record;
    }
    expect(rec.stage).toBe('published');
    expect(rec.history).toHaveLength(5);
    expect(canPublish(lic, rec)).toBe(true);
  });

  it('refuses skipped stages, wrong roles, and failing licences', () => {
    const lic = mbsRecord();
    expect(transition(lic, newReviewRecord(), { to: 'published', by: 'x', role: 'admin' }).ok).toBe(false);
    const inLicense: ReviewRecord = { ...newReviewRecord(), stage: 'license-review' };
    expect(transition(lic, inLicense, { to: 'content-review', by: 'x', role: 'developer' }).ok).toBe(false);
    const bad = mbsRecord({ verificationStatus: 'unverified' });
    expect(transition(bad, inLicense, { to: 'content-review', by: 'x', role: 'reviewer' }).ok).toBe(false);
  });

  it('cannot publish when the licence later turns out invalid', () => {
    const rec = fullyReviewed();
    const lic = mbsRecord({ redistributionAllowed: false });
    expect(canPublish(lic, rec)).toBe(false);
    const r = transition(lic, rec, { to: 'published', by: 'x', role: 'admin' });
    expect(r.ok).toBe(false);
  });

  it('requires a reason to reject, and resets reviews on return to draft', () => {
    const lic = mbsRecord();
    const rec: ReviewRecord = { ...fullyReviewed(), stage: 'technical-review' };
    expect(transition(lic, rec, { to: 'rejected', by: 'x', role: 'reviewer' }).ok).toBe(false);
    const rejected = transition(lic, rec, { to: 'rejected', by: 'x', role: 'reviewer', note: 'Texture contains a logo' });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.record.rejectionReason).toBe('Texture contains a logo');
    const draft = transition(lic, rejected.record, { to: 'draft', by: 'x', role: 'admin' });
    expect(draft.ok && draft.record.licenseVerified).toBe(false);
  });
});

describe('catalog', () => {
  const sha = 'a'.repeat(64);
  const entry = (id: string, license: AssetLicenseRecord, review: ReviewRecord, files = [{ path: `models/${id}.glb`, bytes: 10, sha256: sha, role: 'main' }]) => ({
    id,
    version: '1.0.0',
    name: id,
    section: 'official',
    kind: 'model',
    format: 'glb',
    files,
    compatibility: { minEngineVersion: '0.1.0', platforms: ['android', 'windows', 'web'], minQuality: 'ultra-low' },
    license,
    review,
  });

  it('shows only published entries that pass the gate', () => {
    const published = { ...fullyReviewed(), stage: 'published' as const };
    const raw = {
      format: 'mythic-forge-catalog',
      formatVersion: 1,
      entries: [
        entry('good', mbsRecord(), published),
        entry('unreviewed', mbsRecord(), newReviewRecord()),
        entry('lying', mbsRecord({ verificationStatus: 'unverified' }), published),
        entry('traversal', mbsRecord(), published, [{ path: '../../x.glb', bytes: 1, sha256: sha, role: 'main' }]),
        entry('nohash', mbsRecord(), published, [{ path: 'm.glb', bytes: 1, sha256: 'bad', role: 'main' }]),
        entry('future', mbsRecord(), published),
      ],
    };
    (raw.entries[5]!.compatibility as { minEngineVersion: string }).minEngineVersion = '99.0.0';
    const parsed = parseCatalog(raw);
    expect(parsed.rejected.map((r) => r.id).sort()).toEqual(['nohash', 'traversal']);
    expect(publicEntries(parsed.catalog).map((e) => e.id)).toEqual(['good']);
    const audit = auditCatalog(parsed.catalog);
    expect(audit.find((a) => a.id === 'lying')).toMatchObject({ published: true, publishable: false });
  });

  it('treats missing permission fields as restrictive', () => {
    const parsed = parseCatalog({
      format: 'mythic-forge-catalog',
      formatVersion: 1,
      entries: [{ id: 'x', version: '1.0', kind: 'model', files: [{ path: 'x.glb', sha256: sha, role: 'main' }], license: {}, review: {} }],
    });
    const lic = parsed.catalog.entries[0]!.license;
    expect(lic.redistributionAllowed).toBe(false);
    expect(lic.commercialUse).toBe(false);
    expect(lic.attributionRequired).toBe(true);
    expect(lic.containsThirdPartyContent).toBe(true);
    expect(publicEntries(parsed.catalog)).toEqual([]);
  });
});

describe('community contracts (not implemented as a service)', () => {
  it('requires rights confirmation and an acceptable licence', () => {
    const base = {
      title: 'Lamp',
      description: 'A small brass lamp model',
      creator: 'Me',
      licenseId: 'CC0-1.0',
      sourceUrl: '',
      category: 'Props',
      previewFileName: 'p.webp',
      assetFileName: 'lamp.glb',
      rightsConfirmed: true,
    };
    expect(validateSubmission(base)).toEqual([]);
    expect(validateSubmission({ ...base, rightsConfirmed: false })).toHaveLength(1);
    expect(validateSubmission({ ...base, licenseId: 'CC-BY-NC-4.0' })).toHaveLength(1);
    expect(
      validateComplaint({
        assetId: 'x',
        reporterName: 'R',
        reporterContact: 'r@example.org',
        workDescription: 'My original sculpture published in 2024',
        evidenceUrls: ['http://insecure'],
        declarationAccepted: true,
      }),
    ).toHaveLength(1);
  });
});
