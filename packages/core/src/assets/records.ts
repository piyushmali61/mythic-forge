import { isRecord } from '../util/json.ts';
import type { Reader } from '../validate/reader.ts';
import type { AssetLicenseRecord } from './license.ts';
import type { ReviewEvent, ReviewRecord, ReviewStage, ReviewerRole } from './review.ts';
import type { AssetStats } from './types.ts';

const STAGES: readonly ReviewStage[] = [
  'draft',
  'license-review',
  'content-review',
  'technical-review',
  'approved',
  'published',
  'unpublished',
  'rejected',
];
const ROLES: readonly ReviewerRole[] = ['admin', 'reviewer', 'developer', 'content-manager'];

/**
 * Reads a licence record from untrusted JSON. Missing booleans default to the *restrictive*
 * value so that incomplete data can never make an asset look more permissive than it is.
 */
export function readLicenseRecord(r: Reader, value: unknown, path: string): AssetLicenseRecord {
  const v = r.obj(value, path);
  return {
    assetId: r.str(v.assetId, `${path}.assetId`, '', 64),
    name: r.str(v.name, `${path}.name`, '', 200),
    creator: r.str(v.creator, `${path}.creator`, '', 200),
    owner: r.str(v.owner, `${path}.owner`, '', 200),
    sourceUrl: r.str(v.sourceUrl, `${path}.sourceUrl`, '', 500),
    sourceDescription: r.str(v.sourceDescription, `${path}.sourceDescription`, '', 1000),
    licenseId: r.str(v.licenseId, `${path}.licenseId`, 'UNKNOWN', 64),
    licenseName: r.str(v.licenseName, `${path}.licenseName`, '', 200),
    licenseUrl: r.str(v.licenseUrl, `${path}.licenseUrl`, '', 500),
    licenseTextPath: r.nullableStr(v.licenseTextPath, `${path}.licenseTextPath`, 240),
    commercialUse: r.bool(v.commercialUse, `${path}.commercialUse`, false),
    modificationAllowed: r.bool(v.modificationAllowed, `${path}.modificationAllowed`, false),
    redistributionAllowed: r.bool(v.redistributionAllowed, `${path}.redistributionAllowed`, false),
    attributionRequired: r.bool(v.attributionRequired, `${path}.attributionRequired`, true),
    attributionText: r.str(v.attributionText, `${path}.attributionText`, '', 1000),
    assetVersion: r.str(v.assetVersion, `${path}.assetVersion`, '', 32),
    containsThirdPartyContent: r.bool(v.containsThirdPartyContent, `${path}.containsThirdPartyContent`, true),
    thirdPartyContentCleared: r.bool(v.thirdPartyContentCleared, `${path}.thirdPartyContentCleared`, false),
    verifiedBy: r.str(v.verifiedBy, `${path}.verifiedBy`, '', 200),
    verificationDate: r.str(v.verificationDate, `${path}.verificationDate`, '', 40),
    verificationStatus: r.oneOf(v.verificationStatus, `${path}.verificationStatus`, ['unverified', 'verified', 'rejected'] as const, 'unverified'),
    verificationNotes: r.str(v.verificationNotes, `${path}.verificationNotes`, '', 2000),
  };
}

export function readReviewRecord(r: Reader, value: unknown, path: string): ReviewRecord {
  const v = r.obj(value, path);
  const history: ReviewEvent[] = [];
  if (Array.isArray(v.history)) {
    for (const h of v.history.slice(0, 100)) {
      if (!isRecord(h)) continue;
      history.push({
        stage: r.oneOf(h.stage, `${path}.history.stage`, STAGES, 'draft'),
        by: r.str(h.by, `${path}.history.by`, '', 200),
        role: r.oneOf(h.role, `${path}.history.role`, ROLES, 'developer'),
        at: r.str(h.at, `${path}.history.at`, '', 40),
        note: r.str(h.note, `${path}.history.note`, '', 1000),
      });
    }
  }
  return {
    stage: r.oneOf(v.stage, `${path}.stage`, STAGES, 'draft'),
    licenseVerified: r.bool(v.licenseVerified, `${path}.licenseVerified`, false),
    contentReview: r.bool(v.contentReview, `${path}.contentReview`, false),
    technicalReview: r.bool(v.technicalReview, `${path}.technicalReview`, false),
    rejectionReason: r.nullableStr(v.rejectionReason, `${path}.rejectionReason`, 1000),
    history,
  };
}

export function readStats(r: Reader, value: unknown, path: string): AssetStats {
  const v = r.obj(value, path);
  const out: AssetStats = {};
  const intKeys = ['vertices', 'triangles', 'meshes', 'materials', 'textures', 'animations', 'bones', 'width', 'height', 'gpuBytesEstimate'] as const;
  for (const key of intKeys) {
    if (v[key] !== undefined) out[key] = r.int(v[key], `${path}.${key}`, 0, 0, Number.MAX_SAFE_INTEGER);
  }
  if (v.durationSec !== undefined) out.durationSec = r.num(v.durationSec, `${path}.durationSec`, 0, 0, 1e7);
  if (v.boundsMin !== undefined) out.boundsMin = r.vec3(v.boundsMin, `${path}.boundsMin`, [0, 0, 0]);
  if (v.boundsMax !== undefined) out.boundsMax = r.vec3(v.boundsMax, `${path}.boundsMax`, [0, 0, 0]);
  return out;
}
