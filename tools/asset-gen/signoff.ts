/**
 * Studio sign-off for official assets (§62). A named Mythic Bharat Studios reviewer records
 * that they checked each asset, and the entry is moved through the review workflow to
 * "published". The workflow rules in @mythic-forge/core are enforced — nothing is skipped.
 *
 * Usage:
 *   npm run assets:signoff -- --reviewer "Full Name" --role admin --i-have-reviewed [--id mbs.diya-lamp]
 *
 * By passing --i-have-reviewed the reviewer confirms, for every selected asset, that:
 *   1. Mythic Bharat Studios owns it (or holds written redistribution rights);
 *   2. it contains no third-party content (or that content is cleared);
 *   3. the content is appropriate for all audiences;
 *   4. it opens correctly in Mythic Forge on a low-end device profile.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stringifyPretty,
  transition,
  verifyForPublicDistribution,
  type AssetLicenseRecord,
  type ReviewRecord,
  type ReviewStage,
  type ReviewerRole,
} from '../../packages/core/src/index.ts';
import { buildPack } from './generate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(ROOT, 'assets', 'official', 'catalog.source.json');

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const reviewer = arg('--reviewer')?.trim();
const role = (arg('--role') ?? 'admin') as ReviewerRole;
const onlyId = arg('--id');
if (!reviewer || !process.argv.includes('--i-have-reviewed')) {
  console.error('Refusing to sign off: pass --reviewer "Full Name" and --i-have-reviewed (see the header of this file).');
  process.exit(1);
}

const source = JSON.parse(readFileSync(SOURCE, 'utf8')) as {
  defaults: { license: Partial<AssetLicenseRecord> };
  entries: { id: string; name: string; version: string; review: ReviewRecord; verification: Partial<AssetLicenseRecord> }[];
};
const today = new Date().toISOString().slice(0, 10);
const PATH: ReviewStage[] = ['license-review', 'content-review', 'technical-review', 'approved', 'published'];

let changed = 0;
for (const entry of source.entries) {
  if (onlyId && entry.id !== onlyId) continue;
  if (entry.review.stage === 'published') continue;
  entry.verification = {
    ...entry.verification,
    verifiedBy: reviewer,
    verificationDate: today,
    verificationStatus: 'verified',
    verificationNotes: `Signed off by ${reviewer} (${role}) on ${today} via tools/asset-gen/signoff.ts.`,
  };
  const license = {
    ...source.defaults.license,
    ...entry.verification,
    assetId: entry.id,
    name: entry.name,
    assetVersion: entry.version,
  } as AssetLicenseRecord;
  const verdict = verifyForPublicDistribution(license);
  if (!verdict.ok) {
    console.error(`✗ ${entry.id}: licence checks fail — ${verdict.failures.map((f) => f.id).join(', ')}`);
    continue;
  }
  let record = entry.review;
  let ok = true;
  for (const stage of PATH.slice(Math.max(0, PATH.indexOf(record.stage) + 1))) {
    const result = transition(license, record, { to: stage, by: reviewer, role, note: 'Studio sign-off' });
    if (!result.ok) {
      console.error(`✗ ${entry.id}: ${result.reason}`);
      ok = false;
      break;
    }
    record = result.record;
  }
  if (!ok) continue;
  entry.review = record;
  changed++;
  console.log(`✓ ${entry.id} published`);
}

writeFileSync(SOURCE, stringifyPretty(source));
buildPack('official');
console.log(`\n${changed} asset(s) signed off. Commit assets/official/catalog.source.json and the regenerated pack.`);
