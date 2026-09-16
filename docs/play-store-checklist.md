# Mythic Forge — Google Play Store Readiness Checklist

> [!IMPORTANT]
> **Always verify against current Google Play policies at release time (§81).** Google updates developer program policies regularly; never rely solely on historical assumptions.

---

## 1. Technical Requirements Checklist (§81)

- [x] **Target API Level:** Configured for the latest mandatory target SDK (Target SDK 34 / 35).
- [x] **Architecture Support:** Native 64-bit support (`arm64-v8a`, `x86_64`) provided by Capacitor Android runtime.
- [x] **Distribution Format:** Production builds compile to an **Android App Bundle (.aab)** via `./gradlew bundleRelease` (required for new apps on Google Play).
- [x] **APK / AAB Size Limit:** Core package size is $\approx 4.9\text{ MB}$, well within the 150 MB direct download threshold without requiring Play Feature Delivery or Play Asset Delivery for the base engine.
- [x] **Screen Compatibility:** Supports phones and tablets across all display densities with responsive touch layouts (`compactLayout` in `App.tsx`).

---

## 2. Permissions & Data Safety Checklist (§35, §36, §82)

- [x] **Zero Dangerous Permissions:** No runtime permissions requested (`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `CAMERA`, `RECORD_AUDIO`, `ACCESS_FINE_LOCATION`, `READ_CONTACTS`).
- [x] **Minimal Install-Time Permissions:** Only `android.permission.INTERNET` declared for optional online repository checks.
- [x] **Data Safety Declaration:**
  - *Data Collection:* Mythic Forge collects **zero** personal data by default.
  - *Data Sharing:* Zero data is shared with third parties.
  - *Tracking / Advertising:* Zero advertising IDs or tracking SDKs are bundled.
  - *Security Practices:* All local project storage is sandboxed within the application's private directory.
- [x] **Privacy Policy URL:** Publicly hosted privacy policy documenting the local-first architecture and zero-telemetry default.

---

## 3. Intellectual Property & Store Listing (§1, §42, §85)

- [x] **Original Branding:** App title is **"Mythic Forge"** by **Mythic Bharat Studios** ("Create. Build. Play."). Contains no copyrighted terms or trademarked logos.
- [x] **Cleared Bundled Assets:** All bundled 3D models and materials have passed the 10-point distribution gate under `MBS-ASSET-1.0` or `CC0-1.0`.
- [x] **Third-Party Notices:** `THIRD_PARTY_NOTICES.md` is bundled and accessible in-app under **Settings → About → Third-Party Licenses**.
- [x] **User-Generated Content Policy:** Terms of Use clearly advise users that they are legally responsible for assets they import, and prohibited from infringing third-party copyrights.
- [x] **Copyright Contact:** Functional copyright contact mechanism provided in documentation and about screens for DMCA / copyright inquiries.

---

## 4. Release Preparation Procedure

1. **Clean Build:**
   ```bash
   npm run check
   npm run build
   npm run android:sync
   ```

2. **Generate Release AAB:**
   ```bash
   cd apps/android/android
   ./gradlew bundleRelease
   ```

3. **Signing:** Sign the generated `.aab` located in `apps/android/android/app/build/outputs/bundle/release/` using your studio production upload keystore configured in `gradle.properties` (never commit keystores to Git).
4. **Internal Testing Track:** Upload the `.aab` to Google Play Console Internal Testing track and verify on at least 3 physical Android test devices (entry-level, mid-range, flagship).
