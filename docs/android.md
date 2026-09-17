# Mythic Forge — Android Platform Architecture

## 1. Overview & Architecture (§3, §35)

The Android edition of Mythic Forge is built using **Capacitor 8** hosting the compiled web application from local app assets (`https://localhost` origin).

```
┌─────────────────────────────────────────────────────────┐
│                    Mythic Forge UI                      │
│                  (apps/editor/dist)                     │
├─────────────────────────────────────────────────────────┤
│                 Android System WebView                  │
│                   (WebGL 2 Hardware)                    │
├─────────────────────────────────────────────────────────┤
│                    Capacitor Shell                      │
│  - App Lifecycle (Pause/Resume/Back)                    │
│  - System Share Intent (.mfpack / Web Builds)           │
│  - Native ThermalStatus Plugin (Java API 29+)           │
├─────────────────────────────────────────────────────────┤
│                   Android OS Kernel                     │
└─────────────────────────────────────────────────────────┘
```

Key Advantages:
- **Small APK:** the v0.1.0 debug APK is 6.4 MB, within the 15 MB budget. Most of it is the unminified debug `classes.dex`; a minified release build is smaller.
  The shell hosts the **app build** (`npm run build:app`), which never contains `downloads/`. An earlier build bundled the previous APK inside the new one and reached 43 MB. `tools/android/package-apk.py` now refuses such an APK.
  Launcher icons and splash screens are WebP (`tools/brand/make-icons.py`).
- **Fast Startup:** No heavyweight embedded browser runtime; boots directly via the system-optimized WebView.
- **100% Offline Capable:** All engine assets, scripts, styles, and catalogs load locally without cellular or Wi-Fi connectivity.

---

## 2. Minimal Permissions Policy (§35)

Mythic Forge requests **zero runtime permissions**.

Review of `apps/android/android/app/src/main/AndroidManifest.xml`:
```xml
<!-- Permissions: INTERNET only (a normal, install-time permission). It is used solely
     for the optional online asset repository when one is configured; the editor itself
     works fully offline. No runtime permissions (camera, microphone, location, contacts,
     storage...) are requested. -->
<uses-permission android:name="android.permission.INTERNET" />
```

- **No Storage Permission Needed:** File imports use the Android SAF (Storage Access Framework) file picker, and project exports use the native Android Share Sheet via `androidx.core.content.FileProvider`.
- **No Background Activity:** Does not register background services or broadcast receivers that drain battery.

---

## 3. Native Thermal Management Plugin

To safeguard battery longevity and avoid device overheating, `apps/android/android/app/src/main/java/com/mythicbharatstudios/mythicforge/ThermalStatusPlugin.java` implements a native bridge to `android.os.PowerManager`:

```java
@CapacitorPlugin(name = "ThermalStatus")
public class ThermalStatusPlugin extends Plugin {
    @Override
    public void load() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                pm.addThermalStatusListener(new PowerManager.OnThermalStatusChangedListener() {
                    @Override
                    public void onThermalStatusChanged(int status) {
                        JSObject ret = new JSObject();
                        ret.put("status", statusToString(status));
                        notifyListeners("thermalStatusChange", ret);
                    }
                });
            }
        }
    }
}
```

The TypeScript platform adapter (`packages/platform/src/capacitor/android.ts`) receives these events and informs the core `AdaptiveQualityGovernor` to gracefully drop shadow maps and clamp FPS before the device experiences severe hardware throttling.

---

## 4. Build & Deployment Commands

### Prerequisites
- Node.js $\ge 22.18$
- JDK 17 or newer (v0.1.0 was built with the JDK 25 bundled with Android Studio, Gradle 9.5, AGP 8.13)
- Android SDK platform 36 (`compileSdk`/`targetSdk` 36, `minSdk` 24)

### Build Steps

1. **Build the app bundle and sync it into the Android project** (runs `npm run build:app`, then `cap sync android`):
   ```bash
   npm run android:sync
   ```
   Do not sync a web build (`npm run build`) into the shell: it contains the `downloads/` folder.

2. **Assemble Debug APK:**
   ```bash
   cd apps/android/android
   ./gradlew assembleDebug
   ```
   *The built APK will be generated in `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.*
   To publish it on the web build's download buttons, run `npm run package:android` (it copies the APK to `downloads/`).
   A debug APK is signed with the local debug key. Use it for testing only.

3. **Build Production Release Bundle (AAB for Google Play):**
   ```bash
   ./gradlew bundleRelease
   ```
   Keep the upload keystore and its passwords outside the repository (`*.jks`/`*.keystore` are git-ignored).
   Pass them in through `~/.gradle/gradle.properties` or environment variables.

---

## 5. WebView debugging

`capacitor.config.json` does not set `webContentsDebuggingEnabled`, so Capacitor's default applies: **debuggable (debug) builds can be inspected** from `chrome://inspect`, and **release builds cannot**. Do not set it to `true`: that would let anyone with USB access inspect a release build and read its projects.

## 6. Verified on

| Date | Device | Result |
|---|---|---|
| 2026-09-17 | Android 17 emulator (Pixel 4 profile) | Installs and starts with the strict CSP, with no console errors from the app. Demo project loads its official models. In play mode the touch stick moves the player and collecting a diya updates the score. |

Capacitor logs `Error injecting safe area CSS` at start. This comes from Capacitor's own injected script, not from Mythic Forge. The app gets its safe-area insets from CSS `env()` (`--safe-top`/`--safe-bottom`), so the layout is unaffected.
