import { verifyForPublicDistribution, type AssetLicenseRecord } from './license.ts';

/** §62 asset review workflow. */
export type ReviewStage =
  | 'draft'
  | 'license-review'
  | 'content-review'
  | 'technical-review'
  | 'approved'
  | 'published'
  | 'unpublished'
  | 'rejected';

export type ReviewerRole = 'admin' | 'reviewer' | 'developer' | 'content-manager';

export interface ReviewEvent {
  stage: ReviewStage;
  by: string;
  role: ReviewerRole;
  at: string;
  note: string;
}

export interface ReviewRecord {
  stage: ReviewStage;
  licenseVerified: boolean;
  contentReview: boolean;
  technicalReview: boolean;
  rejectionReason: string | null;
  history: ReviewEvent[];
}

export const newReviewRecord = (): ReviewRecord => ({
  stage: 'draft',
  licenseVerified: false,
  contentReview: false,
  technicalReview: false,
  rejectionReason: null,
  history: [],
});

const TRANSITIONS: Record<ReviewStage, readonly ReviewStage[]> = {
  draft: ['license-review'],
  'license-review': ['content-review', 'rejected'],
  'content-review': ['technical-review', 'rejected'],
  'technical-review': ['approved', 'rejected'],
  approved: ['published', 'rejected'],
  published: ['unpublished'],
  unpublished: ['published', 'draft'],
  rejected: ['draft'],
};

/** Which roles may move an asset into a stage. */
const STAGE_ROLES: Record<ReviewStage, readonly ReviewerRole[]> = {
  draft: ['admin', 'content-manager', 'developer'],
  'license-review': ['admin', 'content-manager', 'developer'],
  'content-review': ['admin', 'reviewer'],
  'technical-review': ['admin', 'reviewer'],
  approved: ['admin', 'reviewer'],
  published: ['admin', 'content-manager'],
  unpublished: ['admin', 'content-manager'],
  rejected: ['admin', 'reviewer'],
};

/** §63: the one rule that decides public availability. */
export function canPublish(license: AssetLicenseRecord, review: ReviewRecord): boolean {
  return (
    review.licenseVerified &&
    license.redistributionAllowed &&
    review.technicalReview &&
    review.contentReview &&
    verifyForPublicDistribution(license).ok
  );
}

export function isPubliclyAvailable(license: AssetLicenseRecord, review: ReviewRecord): boolean {
  return review.stage === 'published' && canPublish(license, review);
}

export interface TransitionRequest {
  to: ReviewStage;
  by: string;
  role: ReviewerRole;
  note?: string;
  at?: string;
}

export type TransitionResult = { ok: true; record: ReviewRecord } | { ok: false; reason: string };

/**
 * Moves a review record to a new stage, enforcing the workflow order, role permissions,
 * and the publication gate. Returns a new record; the input is not modified.
 */
export function transition(license: AssetLicenseRecord, current: ReviewRecord, req: TransitionRequest): TransitionResult {
  if (!TRANSITIONS[current.stage].includes(req.to)) {
    return { ok: false, reason: `Cannot move from "${current.stage}" to "${req.to}".` };
  }
  if (!STAGE_ROLES[req.to].includes(req.role)) {
    return { ok: false, reason: `Role "${req.role}" cannot move assets to "${req.to}".` };
  }
  if (!req.by.trim()) return { ok: false, reason: 'Reviewer name is required.' };

  const next: ReviewRecord = structuredClone(current);
  const note = req.note?.trim() ?? '';

  switch (req.to) {
    case 'content-review':
      // Leaving licence review means the licence was verified.
      if (!verifyForPublicDistribution(license).ok) {
        return { ok: false, reason: 'Licence checks are failing; the licence cannot be marked verified.' };
      }
      next.licenseVerified = true;
      break;
    case 'technical-review':
      next.contentReview = true;
      break;
    case 'approved':
      next.technicalReview = true;
      break;
    case 'published':
      if (!canPublish(license, next)) {
        return { ok: false, reason: 'Publication blocked: licence, content and technical reviews must all pass.' };
      }
      break;
    case 'rejected':
      if (!note) return { ok: false, reason: 'A rejection reason is required.' };
      next.rejectionReason = note;
      break;
    case 'draft':
      next.licenseVerified = false;
      next.contentReview = false;
      next.technicalReview = false;
      next.rejectionReason = null;
      break;
    default:
      break;
  }
  next.stage = req.to;
  next.history.push({ stage: req.to, by: req.by.trim(), role: req.role, at: req.at ?? new Date().toISOString(), note });
  return { ok: true, record: next };
}
