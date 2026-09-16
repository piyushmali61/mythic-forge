# Mythic Forge — Licensing & Compliance Specification

## 1. Important Legal Principles (§1, §15, §46)

Because Mythic Forge is designed for public distribution across Google Play and desktop platforms, the engine adheres to an uncompromised legal standard:

> **DO NOT include copyrighted models, textures, sounds, animations, or fonts unless their license explicitly allows the intended redistribution.**
> 
> - "Free download" does **NOT** mean free to redistribute.
> - "Found on GitHub" does **NOT** mean freely redistributable.
> - "Available online" does **NOT** mean commercially usable.
> - "CC" does **NOT** automatically mean unrestricted.
> - An asset available on a 3D marketplace does **NOT** give Mythic Bharat Studios the right to bundle it inside the engine.

If any asset's license terms or provenance are ambiguous:
**DO NOT INCLUDE THE ASSET. BLOCK PUBLIC DISTRIBUTION.**

---

## 2. Asset License Metadata Schema (§1, §15)

Every bundled or downloadable asset must contain a complete `AssetLicenseRecord` (`packages/core/src/assets/license.ts`):

```typescript
export interface AssetLicenseRecord {
  assetId: string;
  name: string;
  creator: string;
  owner: string;
  sourceUrl: string;
  sourceDescription: string;
  licenseId: string;          // e.g. 'MBS-ASSET-1.0', 'CC0-1.0', 'MIT'
  licenseName: string;
  licenseUrl: string;
  licenseTextPath: string | null;
  commercialUse: boolean;
  modificationAllowed: boolean;
  redistributionAllowed: boolean;
  attributionRequired: boolean;
  attributionText: string;
  assetVersion: string;
  containsThirdPartyContent: boolean;
  thirdPartyContentCleared: boolean;
  verifiedBy: string;         // Full name of studio reviewer
  verificationDate: string;   // ISO Date (YYYY-MM-DD)
  verificationStatus: 'verified' | 'unverified' | 'rejected';
  verificationNotes: string;
}
```

---

## 3. The 10-Point Public Distribution Gate (§15, §63)

Before any asset can be packaged into the official build or served through the library, the engine executes `verifyForPublicDistribution()`:

1. **`license-exists`**: A non-empty license ID and valid license name are recorded.
2. **`license-identifiable`**: Identified as a recognized permissive license (`KNOWN_LICENSES`) or documented custom license.
3. **`redistribution-allowed`**: Redistribution through the Mythic Forge library is explicitly permitted.
4. **`intended-use-allowed`**: Both commercial use and modification are permitted without contradiction.
5. **`attribution-understood`**: Attribution requirements are documented, and ready-to-copy credit text is provided if required.
6. **`source-documented`**: Source HTTPS URL or in-house procedural derivation is fully documented.
7. **`no-restricted-content`**: The asset contains no un-cleared third-party intellectual property.
8. **`license-preserved`**: The full legal license text is preserved and linked or bundled.
9. **`license-acceptable`**: The license does not impose restrictive ShareAlike or NonCommercial copyleft constraints on user projects.
10. **`human-verified`**: A named reviewer has signed off with a recorded date.

If **any** check fails:
$$\text{BLOCK PUBLIC DISTRIBUTION}$$

---

## 4. Review & Approval Workflow (§61, §62, §63)

Every asset moves through five distinct review stages before reaching end users:

```
[DRAFT]
   │
   ▼
[LICENSE REVIEW] ────► Legal / provenance checks (source, redistribution rights)
   │
   ▼
[CONTENT REVIEW] ────► Quality, appropriateness, branding check
   │
   ▼
[TECHNICAL REVIEW] ──► Geometry budgets, triangle counts, texture resolution, low-end profile test
   │
   ▼
[APPROVED]
   │
   ▼
[PUBLISHED] ─────────► Asset becomes publicly available in the Asset Library
```

---

## 5. Automated Build Verification & Tooling (§47, §48)

The project includes automated audit tools run on every build:

1. **`npm run audit:licenses` (`tools/license-audit/audit.ts`):** Scans all asset catalogs. If any entry marked for distribution fails the 10-point gate, the build immediately aborts with exit code 1.
2. **`npm run notices` (`tools/third-party-notices/generate.ts`):** Scans all `node_modules` runtime packages, verifies license compatibility (MIT / Apache-2.0), and updates `THIRD_PARTY_NOTICES.md` and `apps/editor/public/third-party-licenses.json`.
3. **`npm run assets:signoff` (`tools/asset-gen/signoff.ts`):** CLI tool for authorized studio reviewers to record formal sign-offs.
