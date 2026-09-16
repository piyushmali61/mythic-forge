# Mythic Forge — Battery Optimization & Power Management

## 1. Battery-First Engine Philosophy (§23, §99)

> *"A powerful creation engine that respects the device."*

Battery drain in mobile and laptop creation tools is overwhelmingly caused by:
1. Continuous render loops that draw identical pixels 60–120 times every second.
2. Background threads and tasks running while the application is minimized or the screen is off.
3. Wasteful wake locks keeping CPU cores in high-power C-states.
4. Continuous background network polling, telemetry, or file scanning.

Mythic Forge rejects these practices through a strict invariant:
> **"If the user cannot benefit from a process running right now, do not run it right now."**

---

## 2. Core Battery Conservation Mechanisms

### A. Render-on-Demand Editor (0 FPS Idle) (§23)
When editing a scene, the WebGL 2 viewport draws **only** in response to input events (camera moves, gizmo drags, hierarchy mutations, material tweaks). If the user pauses to think, the renderer does nothing. CPU and GPU utilization immediately drop to zero.

### B. Instant Background Suspension (§26, §35)
When the application loses focus, enters the background, or the device screen turns off:
- **Android Shell:** Capacitor app lifecycle hooks (`appStateChange`) notify `@mythic-forge/platform`. All rendering stops, Web Audio context is suspended, and the runtime physics tick halts.
- **Web / Desktop:** Page Visibility API (`visibilitychange`) pauses the canvas rendering and freezes timer events.
- **Zero Background Activity:** The app does not perform background asset scanning, thumbnail processing, or network calls while minimized.

### C. Zero Wake Locks (§26)
Mythic Forge never requests or holds Android `PARTIAL_WAKE_LOCK` or screen wake locks. The operating system is permitted to enter deep sleep whenever the user leaves the device idle.

### D. On-Demand Lazy Thumbnails (§27, §28)
Asset thumbnails are generated one at a time using an offscreen canvas only when an asset card is scrolled into view. Unseen assets consume 0 CPU cycles.

---

## 3. Battery Saver Mode (§24, §50)

Users can activate **Battery Saver Mode** manually from **Settings → Battery** or let the engine toggle it automatically when low battery status is detected:

```json
{
  "batterySaver": {
    "targetFps": 30,
    "resolutionScale": 0.75,
    "shadowsEnabled": false,
    "antiAliasing": "off",
    "backgroundSuspension": true,
    "thumbnailQuality": "low"
  }
}
```

### Measured Impact
- **GPU Power Consumption:** Reduced by $\approx 65\text{–}80\%$ compared to standard 60 FPS continuous rendering.
- **Thermal Dissipation:** Keeps devices cool, preventing aggressive OS thermal throttling.

---

## 4. Thermal Management Integration (§66)

On Android (API 29+), the app uses a lightweight native Java plugin (`ThermalStatusPlugin.java`) registered to `PowerManager.OnThermalStatusChangedListener`:
- **Event-Driven:** The plugin listens for OS-broadcasted thermal severity changes (`MODERATE`, `SEVERE`, `CRITICAL`).
- **Zero Sensor Polling:** The app never polls hardware temperature sensors directly.
- **Graceful Action:** Upon receiving a thermal warning, the Adaptive Governor lowers the target FPS to 30 and disables shadows, displaying a polite, user-friendly notification:
  > *"Performance has been adjusted to manage device temperature."*
