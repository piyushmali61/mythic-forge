# Mythic Forge — Rendering Engine & Graphics Specification

## 1. Graphics Backend & Hardware Acceleration (§21, §93)

Mythic Forge utilizes a modular rendering architecture built on **WebGL 2** (OpenGL ES 3.0 equivalent) via **Three.js**:
- **Hardware Compatibility:** Supported out-of-the-box by modern Android System WebViews (Android 7.0+ / API 24+) and Windows WebView2 / Chromium.
- **Graceful Detection:** The renderer probes for WebGL 2 context creation on startup. If unavailable, it shows a helpful diagnostic screen rather than crashing.

---

## 2. Render-on-Demand Loop (§23, §99)

The foundational battery-first rule of the engine:
> *"If the scene has not changed, do not draw."*

Unlike conventional engines that execute continuous `requestAnimationFrame` loops consuming 100% GPU core time even when the screen is static, Mythic Forge uses **Render-on-Demand**:

```typescript
// Viewport draw request
export function requestRender(): void {
  if (needsRender || isPaused) return;
  needsRender = true;
  requestAnimationFrame(drawSingleFrame);
}
```

### Invalidation Triggers
A frame is drawn **only** when:
1. The camera is moved or rotated (mouse drag, wheel zoom, touch pinch/pan).
2. An entity's transform, mesh, material, light, or visibility is modified.
3. An asset finishes asynchronous loading or texture upload.
4. Play mode is active and runtime simulation is ticking.

In idle editor state, **GPU utilization is ~0%**, preserving laptop and mobile battery indefinitely.

---

## 3. Graphics Quality Profiles (§22)

The engine defines five quality profiles that dynamically configure renderer capabilities:

| Parameter | Ultra-Low (Budget Mobile) | Low (Entry Mobile) | Medium (Balanced) | High (Standard PC) | Ultra (Gaming PC) |
|---|---|---|---|---|---|
| **Max Render Resolution** | $0.65\times$ Native | $0.75\times$ Native | $1.0\times$ Native | $1.0\times$ Native | $1.0\times$ Native (Max DPR 2) |
| **Shadow Maps** | Disabled | Disabled | Basic ($512\times 512$) | High ($1024\times 1024$) | Ultra ($2048\times 2048$ Soft) |
| **Anti-Aliasing** | Off | Off | FXAA | MSAA $2\times$ | MSAA $4\times$ |
| **Max Draw Distance** | $150\text{ m}$ | $250\text{ m}$ | $500\text{ m}$ | $1000\text{ m}$ | $2000\text{ m}$ |
| **Target Play FPS** | $30\text{ FPS}$ | $30\text{ FPS}$ | $45\text{ FPS}$ | $60\text{ FPS}$ | $60\text{–}120\text{ FPS}$ |

---

## 4. Camera Systems & Controls (§11, §29, §30)

The viewport includes specialized camera modes for both desktop and touch screens:

### Desktop Controls
- **Orbit Mode:** Right-click drag orbits the camera around the target point; Middle-click drag pans; Scroll wheel zooms.
- **Fly Mode:** Hold right-click and use `W`, `A`, `S`, `D`, `Q`, `E` to navigate in first-person fly-through.
- **Focus (`F` Key):** Centers the camera smoothly on the selected object.

### Mobile Touch Gestures
- **One Finger Drag:** Orbit / look around.
- **Two Finger Drag:** Pan view horizontally / vertically.
- **Pinch In / Out:** Smooth perspective zoom.

---

## 5. Transform Gizmos & Interaction (§9)

The 3D editor provides custom, battery-efficient transform gizmos:
- **Translate Mode (`W`):** Red (X), Green (Y), and Blue (Z) axis arrows with planar drag quads.
- **Rotate Mode (`E`):** Concentric Euler rotation rings with snap angle settings ($15^\circ$, $45^\circ$, $90^\circ$).
- **Scale Mode (`R`):** Bounded scale cubes with uniform center scaling.
- **Command Integration:** Every gizmo interaction records a single reversible `TransformCommand` into `CommandHistory` upon release, enabling immediate Undo (`Ctrl+Z`) and Redo (`Ctrl+Shift+Z`).
