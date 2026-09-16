/**
 * Licence audit (§15, §46, §63). Run by `npm run build`.
 *
 * FAILS the build when:
 *  - a catalog cannot be parsed, or an entry is rejected by the validator;
 *  - an entry is marked "published" but does not pass the public-distribution gate;
 *  - a listed file is missing or its SHA-256 does not match.
 * Reports (without failing) entries that are still awaiting review, and draft licences.
 *
 * Usage: node tools/license-audit/audit.ts [--json reports/license-audit.json]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_LICENSES, auditCatalog, parseCatalog, type AuditRow } from '../../packages/core/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKS = ['official', 'free-open'];

interface PackReport {
  pack: string;
  rows: AuditRow[];
  rejected: { id: string; reasons: string[] }[];
  integrityErrors: string[];
}

function auditPack(pack: string): PackReport {
  const dir = join(ROOT, 'apps', 'editor', 'public', 'asset-packs', pack);
  const catalogPath = join(dir, 'catalog.json');
  if (!existsSync(catalogPath)) {
    return { pack, rows: [], rejected: [{ id: '(catalog)', reasons: ['catalog.json missing — run npm run assets:generate'] }], integrityErrors: [] };
  }
  const parsed = parseCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const integrityErrors: string[] = [];
  for (const entry of parsed.catalog.entries) {
    for (const f of entry.files) {
      const path = join(dir, f.path);
      if (!existsSync(path)) {
        integrityErrors.push(`${entry.id}: missing file ${f.path}`);
        continue;
      }
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (hash !== f.sha256) integrityErrors.push(`${entry.id}: hash mismatch for ${f.path}`);
    }
  }
  return { pack, rows: auditCatalog(parsed.catalog), rejected: parsed.rejected, integrityErrors };
}

const reports = PACKS.map(auditPack);
let failures = 0;
for (const r of reports) {
  console.log(`\n== ${r.pack} ==`);
  for (const rej of r.rejected) {
    failures++;
    console.log(`  ✗ REJECTED ${rej.id}: ${rej.reasons.join('; ')}`);
  }
  for (const err of r.integrityErrors) {
    failures++;
    console.log(`  ✗ INTEGRITY ${err}`);
  }
  for (const row of r.rows) {
    if (row.published && !row.publishable) {
      failures++;
      console.log(`  ✗ ${row.id}@${row.version} is PUBLISHED but fails the gate:`);
      for (const f of row.failures) console.log(`      - ${f.id}: ${f.message}`);
      for (const g of row.reviewGaps) console.log(`      - ${g}`);
    } else if (row.published) {
      console.log(`  ✓ ${row.id}@${row.version} published`);
    } else {
      const why = [...row.failures.map((f) => f.id), ...row.reviewGaps].join(', ');
      console.log(`  • ${row.id}@${row.version} not public (stage: ${row.stage})${why ? ` — ${why}` : ''}`);
    }
  }
  if (r.rows.length === 0 && r.rejected.length === 0) console.log('  (no entries)');
}

const drafts = Object.values(KNOWN_LICENSES).filter((l) => l.name.includes('DRAFT'));
const usesDraft = reports.some((r) => r.rows.some((row) => row.published));
if (drafts.length && usesDraft) {
  console.log(`\n! WARNING: published assets use a DRAFT licence (${drafts.map((d) => d.id).join(', ')}). Legal review is required before public release.`);
}

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag > 0 && process.argv[jsonFlag + 1]) {
  const out = join(ROOT, process.argv[jsonFlag + 1]!);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  console.log(`\nReport written to ${process.argv[jsonFlag + 1]}`);
}

if (failures > 0) {
  console.error(`\nLicence audit FAILED with ${failures} problem(s). Public distribution is blocked.`);
  process.exit(1);
}
console.log('\nLicence audit passed: no unverified asset is marked for public distribution.');
