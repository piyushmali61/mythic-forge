import { KNOWN_LICENSES, buildAttribution, describePermissions, type AssetLicenseRecord, type LicenseVerdict } from '@mythic-forge/core';
import { Fragment } from 'preact';
import { toast } from '../../app/state.ts';
import { Icon } from '../../ui/Icon.tsx';

const CHECK_LABELS: Record<string, string> = {
  'license-exists': 'Licence recorded',
  'license-identifiable': 'Licence identified',
  'redistribution-allowed': 'Redistribution allowed',
  'intended-use-allowed': 'Commercial use and modification allowed',
  'attribution-understood': 'Attribution requirements recorded',
  'source-documented': 'Source documented',
  'no-restricted-content': 'No restricted third-party content',
  'license-preserved': 'Licence text preserved',
  'license-acceptable': 'Licence type accepted for the library',
  'human-verified': 'Verified by a named reviewer',
};

/** Makes licensing visible (§45). */
export function LicensePanel({ license, verdict, published }: { license: AssetLicenseRecord; verdict: LicenseVerdict; published: boolean }) {
  const ok = published && verdict.ok;
  const known = KNOWN_LICENSES[license.licenseId];
  const attribution = license.attributionRequired ? buildAttribution(license) : null;
  return (
    <section class="license-panel" aria-label="Licence">
      <div class={`license-status ${ok ? 'ok' : 'pending'}`}>
        <Icon name={ok ? 'shield' : 'alert'} />
        {ok ? 'LICENCE VERIFIED' : 'LICENCE REVIEW PENDING'}
      </div>
      <div style={{ fontWeight: 650, marginBottom: '6px' }}>{license.licenseName || license.licenseId}</div>
      {known?.notes && <p class="muted" style={{ fontSize: '0.88em' }}>{known.notes}</p>}
      <dl class="kv">
        {describePermissions(license).map((p) => (
          <Fragment key={p.label}>
            <dt>{p.label}</dt>
            <dd>{p.value}</dd>
          </Fragment>
        ))}
        <dt>Creator</dt>
        <dd>{license.creator || '—'}</dd>
        <dt>Owner</dt>
        <dd>{license.owner || '—'}</dd>
        <dt>Source</dt>
        <dd>
          {license.sourceUrl ? (
            <a href={license.sourceUrl} target="_blank" rel="noopener noreferrer">
              {license.sourceUrl}
            </a>
          ) : (
            license.sourceDescription || '—'
          )}
        </dd>
        <dt>Verification</dt>
        <dd>
          {license.verificationStatus === 'verified'
            ? `Verified by ${license.verifiedBy} on ${license.verificationDate}`
            : license.verificationNotes || 'Not yet verified'}
        </dd>
      </dl>
      {attribution && (
        <>
          <div class="field-label" style={{ marginTop: '12px' }}>
            Attribution (required)
          </div>
          <div class="attribution">
            <span style={{ flex: 1 }}>{attribution}</span>
            <button
              type="button"
              class="btn btn-sm"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(attribution)
                  .then(() => toast('Attribution copied.', 'success'))
                  .catch(() => toast('Copy failed — select the text instead.', 'warning'))
              }
            >
              Copy
            </button>
          </div>
        </>
      )}
      <details style={{ marginTop: '10px' }}>
        <summary class="dim">Licence checks ({verdict.checks.length - verdict.failures.length}/{verdict.checks.length} passed)</summary>
        <ul class="check-list">
          {verdict.checks.map((c) => (
            <li key={c.id}>
              <span class={c.passed ? 'pass' : 'fail'}>
                <Icon name={c.passed ? 'check' : 'alert'} size={14} />
              </span>
              <span>
                {CHECK_LABELS[c.id] ?? c.id}
                {!c.passed && <span class="dim"> — {c.message}</span>}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
