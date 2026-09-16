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
- **Tiny APK Footprint:** $\approx 4.9\text{ MB}$ debug APK, well below the $15\text{ MB}$ performance budget.
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

The TypeScript platform adapter (`packages/platform/src/capacitor/thermal.ts`) receives these events and informs the Core `AdaptiveGovernor` to gracefully drop shadow maps and clamp FPS before the device experiences severe hardware throttling.

---

## 4. Build & Deployment Commands

### Prerequisites
- Node.js $\ge 22.18$
- Java JDK 17 or 21
- Android SDK (API 34 or 35)

### Build Steps

1. **Build Editor Assets:**
   ```bash
   npm run build
   ```

2. **Sync Web Assets to Android Project:**
   ```bash
   npm run android:sync
   ```

3. **Assemble Debug APK:**
   ```bash
   cd apps/android/android
   ./gradlew assembleDebug
   ```
   *The built APK will be generated in `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.*

4. **Build Production Release Bundle (AAB for Google Play):**
   ```bash
   ./gradlew bundleRelease
   ```
