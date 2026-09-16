/**
 * Community sharing and reporting — ARCHITECTURE ONLY (§17, §84, §85).
 * There is no community service in 0.1; the app does not submit or report anything.
 * These types and validators define the contract a future service must implement,
 * so the client-side rules are fixed and tested before any backend exists.
 */
import { KNOWN_LICENSES } from './license.ts';

export interface AssetSubmission {
  title: string;
  description: string;
  creator: string;
  licenseId: string;
  sourceUrl: string;
  category: string;
  previewFileName: string;
  assetFileName: string;
  /** "I have the necessary rights to distribute this asset." */
  rightsConfirmed: boolean;
}

export const RIGHTS_DECLARATION = 'I have the necessary rights to distribute this asset.';

export function validateSubmission(s: AssetSubmission): string[] {
  const problems: string[] = [];
  if (s.title.trim().length < 3) problems.push('Title is required.');
  if (s.description.trim().length < 10) problems.push('Please describe the asset.');
  if (!s.creator.trim()) problems.push('Creator is required.');
  const license = KNOWN_LICENSES[s.licenseId];
  if (!license) problems.push('Choose a recognised licence.');
  else if (!license.acceptableForPublicLibrary || s.licenseId === 'MBS-ASSET-1.0') {
    problems.push(`${license.name} can't be used for community submissions.`);
  }
  if (!s.category.trim()) problems.push('Category is required.');
  if (!s.previewFileName) problems.push('A preview image is required.');
  if (!s.assetFileName) problems.push('The asset file is required.');
  if (!s.rightsConfirmed) problems.push('You must confirm you have the rights to distribute this asset.');
  return problems;
}

export const REPORT_REASONS = [
  { id: 'copyright', label: 'Copyright concern' },
  { id: 'license-violation', label: 'License violation' },
  { id: 'malware', label: 'Malware/security concern' },
  { id: 'misleading', label: 'Misleading information' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export interface AssetReport {
  assetId: string;
  reason: ReportReason;
  details: string;
  /** Optional; only sent if the reporter chooses to be contacted. */
  contact: string | null;
}

export interface CopyrightComplaint {
  assetId: string;
  reporterName: string;
  reporterContact: string;
  workDescription: string;
  evidenceUrls: string[];
  /** Good-faith and accuracy declaration. */
  declarationAccepted: boolean;
}

export type ModerationState = 'open' | 'under-review' | 'action-taken' | 'dismissed' | 'appealed';

export function validateComplaint(c: CopyrightComplaint): string[] {
  const problems: string[] = [];
  if (!c.reporterName.trim()) problems.push('Your name is required.');
  if (!c.reporterContact.trim()) problems.push('Contact information is required.');
  if (c.workDescription.trim().length < 20) problems.push('Describe the original work.');
  if (!c.declarationAccepted) problems.push('You must accept the declaration.');
  for (const url of c.evidenceUrls) {
    try {
      if (new URL(url).protocol !== 'https:') problems.push(`Evidence links must use HTTPS: ${url}`);
    } catch {
      problems.push(`Invalid link: ${url}`);
    }
  }
  return problems;
}
