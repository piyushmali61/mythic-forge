# Mythic Forge — Contributor Guide & Engineering Standards

Thank you for contributing to **Mythic Forge** by **Mythic Bharat Studios**!
Please review our architectural constraints and code quality standards before submitting changes.

---

## 1. Core Engineering Principles (§101, §102)

1. **No Fake Functionality (§101):** If a feature is not yet implemented, mark it clearly as `NOT IMPLEMENTED` in the UI and documentation. Do not create placeholder buttons or mock functions that mislead users.
2. **Subsystem Isolation:**
   - `@mythic-forge/core` must remain 100% platform-independent and headless. Never import DOM APIs (`document`, `window`), WebGL, or `@mythic-forge/renderer` into `core`.
   - Platform-specific code belongs strictly inside `packages/platform/` or app shells (`apps/android`, `apps/desktop`).
3. **Strict Secrets Policy (§103):** Never commit private keys, keystores, cloud API keys, or access tokens to source control. Use environment variables and configuration injection.

---

## 2. Development Workflow & Commands

### Prerequisites
- Node.js $\ge 22.18$
- npm $\ge 10.0$

### Essential Scripts
```bash
# Start local editor dev server
npm run dev

# Run full quality check (TypeCheck + Vitest + License Audit)
npm run check

# Run Vitest test suite
npm test

# Generate procedural assets
npm run assets:generate

# Audit asset licenses
npm run audit:licenses

# Update third-party dependency notices
npm run notices

# Run core performance benchmark
npm run bench:core
```

---

## 3. Asset Contribution & Sign-Off Rules (§15, §46, §62)

When adding new 3D models, textures, sounds, or materials to the engine:

1. **Document Every Field:** Every asset must contain an `AssetLicenseRecord` documenting creator, source, license ID, commercial permissions, and attribution.
2. **Permissive Only:** Only assets under explicit permissive licenses (e.g., CC0, MIT, Apache-2.0) or studio in-house creations (`MBS-ASSET-1.0`) are allowed.
3. **Formal Studio Sign-off:** Run the sign-off tool to record reviewer verification:
   ```bash
   npm run assets:signoff -- --reviewer "Your Name" --role admin --i-have-reviewed --id <asset-id>
   ```
4. **Audit Verification:** `npm run audit:licenses` must report 0 violations.

---

## 4. Pull Request Checklist

Before submitting a pull request, ensure:
- [ ] `npm run check` passes with 0 errors.
- [ ] All new logic is covered by Vitest unit or integration tests.
- [ ] Code follows TypeScript strict-mode standards without `any` overrides.
- [ ] Any modified or added documentation is clear and beginner-accessible.
