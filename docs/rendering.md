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

The five presets live in `packages/core/src/perf/profiles.ts` (`QUALITY_PRESETS`):

| Setting | Ultra Low | Low | Medium | High | Ultra |
|---|---|---|---|---|---|
| Render scale | 0.6 | 0.8 | 1.0 | 1.0 | 1.0 |
| Max pixel ratio | 1 | 1 | 1.5 | 2 | 2.5 |
| Shadows | Off | Off | Low: 512 px, basic | Medium: 1024 px, PCF | High: 2048 px, PCF |
| Texture limit | 512 px | 1024 px | 2048 px | 4096 px | 8192 px |
| Anti-aliasing (WebGL multisampling) | Off | Off | Off | On | On |
| Reflections (environment map) | Off | Off | Off | On | On |
| Fog / ambient effects | Off | On | On | On | On |
| Draw distance | 120 m | 200 m | 350 m | 600 m | 1000 m |
| LOD distance | ×0.5 | ×0.7 | ×1 | ×1.5 | ×2.5 |
| Play-mode FPS cap | 30 | 30 | 30 | 60 | 60 |

Point-light shadows (six renders each) are used only at High shadow quality. Anti-aliasing changes take effect the next time the editor opens, because they need a new WebGL context. Post-processing and particles don't exist yet, so they have no settings.

---

## 4. Levels of Detail (LOD) (§21, §22)

- **At import** (*Generate LODs*, on by default): every static mesh with at least 2,000 triangles gets two simplified copies with about 35% and 12% of its triangles (`packages/renderer/src/assets/lod.ts`). Simplification uses vertex clustering, which is O(n): both levels took 92 ms for a 65,000-triangle mesh and 259 ms for 261,000 triangles on the development PC (2026-09-17). Phones will be slower. Vertices that share a grid cell and face roughly the same way are merged, so hard edges survive. A level that doesn't save at least 20% is dropped. Skinned, morphing and animated models are skipped.
- **Storage:** the copies are ordinary nodes in the project's GLB, tagged with `extras.mfLod`, so no custom file format is needed. Re-importing such a GLB removes old copies before generating new ones.
- **At load:** `buildLods` turns each tagged set into a `ScaledLOD` (a `THREE.LOD`). Its switch distances are 8× and 20× the mesh's bounding radius, multiplied by the object's world scale and by the quality level's *LOD distance*. The Viewport passes that value through `camera.userData.lodDistanceScale`. A 10% hysteresis stops flicker at the boundary.
- **Cost:** LOD copies add about 40% to a large mesh's stored size and GPU memory, in exchange for far fewer triangles drawn at a distance.
- **Adaptive quality** can halve the LOD distance when frames are late (see [performance.md](performance.md)).

---

## 5. Camera Systems & Controls (§11, §29, §30)

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

## 6. Transform Gizmos & Interaction (§9)

The 3D editor provides custom, battery-efficient transform gizmos:
- **Translate Mode (`W`):** Red (X), Green (Y), and Blue (Z) axis arrows with planar drag quads.
- **Rotate Mode (`E`):** Concentric Euler rotation rings with snap angle settings ($15^\circ$, $45^\circ$, $90^\circ$).
- **Scale Mode (`R`):** Bounded scale cubes with uniform center scaling.
- **Command Integration:** Every gizmo interaction records a single reversible `TransformCommand` into `CommandHistory` upon release, enabling immediate Undo (`Ctrl+Z`) and Redo (`Ctrl+Shift+Z`).
