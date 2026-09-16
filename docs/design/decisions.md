# Mythic Forge — Design Decisions (pre-implementation)

This document answers the 15 pre-implementation questions from the master brief (§110).
It is kept up to date: when implementation reality differs from the plan, the plan is edited, not the facts.

---

## 1. Requirements analysis (condensed)

The brief describes ~25 subsystems. Grouped by *what actually makes the product work*:

| Group | Systems | MVP? |
|---|---|---|
| Data model | project format, scene graph, undo/redo, settings, recovery | Yes |
| Editor | project manager, wizard, hierarchy, inspector, gizmos, console, mobile layout | Yes |
| Assets | import (GLB/glTF/OBJ, FBX experimental), images, audio, optimization, library, licensing | Yes |
| Runtime | play mode, safe behaviours, simple physics, audio | Yes (basic) |
| Rendering | three.js viewport, quality profiles, render-on-demand, adaptive quality | Yes |
| Platform | web/PWA, Android (Capacitor), Windows (Tauri) | Web + Android tested; Windows shell provided |
| Distribution | web export, license audit, third-party notices | Yes |
| Services | accounts, cloud sync, community, marketplace, admin dashboard | **Architecture only** |

## 2. Conflicts found in the brief, and how they are resolved

| # | Conflict | Resolution |
|---|---|---|
| C1 | "Production-quality engine with 25 systems" vs "build a strong MVP first" | Explicit MVP scope (§6). Everything else is visibly labelled **NOT IMPLEMENTED** in the UI and docs. |
| C2 | "Scripting system" vs "never execute imported code" | MVP ships **declarative behaviours** (rotate, bob, player controller, follow camera, collectible). No user code runs. A sandboxed Lua/WASM runtime is a v1.x item. |
| C3 | "Build Android/Windows games" vs "runs on a phone" | Native packaging needs SDKs, signing keys and toolchains that cannot run on a phone. MVP exports a **self-contained web build**; native packaging of games is planned (desktop-only). |
| C4 | "Monitor GPU usage and temperature" vs what platforms expose | GPU utilisation is not exposed to WebGL; frame time is used as the proxy. Thermal: Android `PowerManager` thermal status (native plugin) and Chromium Compute Pressure API on desktop. Both are event-driven — no sensor polling. |
| C5 | "Human-readable project format" vs "efficient for large projects" | JSON for manifests/scenes/metadata; binary assets stay as their own files and are never base64-encoded into JSON. |
| C6 | "Start on phone, continue on PC" vs sandboxed app storage | Portable **`.mfpack`** archive (zip + integrity manifest) moves projects between any devices. Direct folder access on desktop is planned for the Tauri shell. |
| C7 | "Offline-first" vs "repository integration" | Official catalog is bundled; remote repository is optional, HTTPS-only, manifest-validated, and never contacted unless the user asks. |
| C8 | "Verify every licence" vs software can't do legal review | Software **enforces** that verification data exists and blocks distribution when it doesn't. A named human reviewer must still do the verification. |
| C9 | "90/120 FPS" vs battery-first | Offered, but defaults are 30 FPS (mobile) / 60 FPS (desktop) in play mode, and **0 FPS when the editor is idle**. |
| C10 | "Mythic Bharat Studios Asset License" doesn't exist yet | A clearly marked **DRAFT** licence is included; it must be reviewed by legal counsel before public release. |
| C11 | "Hide stack traces" vs "developers need detail" | Friendly messages by default; *Developer mode* reveals details and verbose logs. |
| C12 | "Post-processing / particles / LOD" settings vs MVP renderer has none of those | Settings that would do nothing are **not shown**. They appear when the feature exists. |

## 3. Technology selection

Compared options:

| Option | Performance | Battery | Cross-platform effort | Dev/maintenance cost | Licence |
|---|---|---|---|---|---|
| Native C++ core + native UIs | Best | Best | Very high (UI written per platform) | Very high | Your choice |
| Rust core + egui/wgpu | Very good | Very good | Medium | High; editor UI ecosystem immature | MIT/Apache |
| Fork Godot (MIT) | Very good | Good | Low | Medium, but you inherit a 2M-line C++ codebase and its identity | MIT |
| **TypeScript core + three.js (WebGL 2) + system WebView shells** | Good (GPU-accelerated) | Good with render-on-demand | **Low** (one UI, responsive) | **Low** | MIT / Apache |

**Chosen: TypeScript + three.js + Preact, shipped in Capacitor (Android) and Tauri 2 (Windows; macOS/Linux later).**

Why:
1. The brief is ~80% tooling (editor UI, asset pipeline, licensing, project management) and ~20% real-time rendering. Web UI technology is the fastest way to build a *good* responsive editor for both phones and PCs from one codebase.
2. WebGL 2 is a GLES 3.0-class hardware API available in Android System WebView and WebView2 on Windows. three.js is mature, MIT-licensed, and has solid glTF support.
3. System WebView shells keep the install small (no bundled Chromium, unlike Electron): Capacitor APKs are a few MB; Tauri binaries are ~5–10 MB.
4. Battery: the editor draws **nothing** unless something changed (render-on-demand). Backgrounded apps stop rendering entirely.
5. Future-proofing: `@mythic-forge/core` has no DOM and no three.js dependency. The project/scene format is engine-agnostic JSON, so a native runtime (C++/Rust) could later load the same projects for exported games.

Trade-offs accepted:
- JS/GC overhead and a lower performance ceiling than native. Mitigated by budgets, adaptive quality, and keeping the heavy work on the GPU.
- Older/unsupported Android WebViews (no WebGL 2) cannot run the editor; the app detects this and says so instead of crashing.

Dependencies (all permissive): `three` (MIT), `preact` (MIT), `@preact/signals` (MIT), `fflate` (MIT), `@capacitor/*` (MIT), Tauri (MIT/Apache-2.0). Dev: Vite, Vitest, TypeScript (MIT/Apache-2.0). No fonts, images or models from third parties are bundled.

## 4. Architecture

```
apps/editor ──────────────── UI (Preact). Home, wizard, editor, library, settings, docs
   │
   ├── packages/renderer ─── three.js viewport, scene sync, gizmos, import/optimize, thumbnails
   ├── packages/platform ─── platform adapters: web (IndexedDB FS, visibility, battery, pressure),
   │                          capacitor (Android lifecycle, thermal plugin, share), tauri (desktop)
   └── packages/core ─────── NO DOM, NO three.js:
          project/  format, validation, migration, store, .mfpack
          scene/    scene model, factories, templates
          commands/ undo/redo
          assets/   metadata, licence gate, review workflow, catalog, repository, downloads
          security/ file-type sniffing, path safety, archive limits
          perf/     quality profiles, device tiers, adaptive governor, frame scheduler, budgets
          runtime/  play-mode world, behaviours, simple physics
          platform/ interfaces implemented by packages/platform
apps/android  ─ Capacitor shell (+ native ThermalStatus plugin)
apps/desktop  ─ Tauri 2 shell
apps/editor/src/player ─ standalone runtime bundled into web exports
```

Rules: `core` never imports from `renderer`, `platform` or `apps`. Platform-specific code lives only in `packages/platform` and the shells.

## 5. MVP scope

Implemented in MVP (0.1): project manager, wizard, templates, 3D editor (hierarchy, inspector, gizmos, console, perf overlay), primitives, lights, cameras, materials, GLB/glTF/OBJ import (+FBX experimental), images, audio, import analysis & optimisation, asset library with licence UI, official assets (original, procedurally generated), save/load with atomic writes, backups, auto-save, crash recovery, undo/redo, play mode with behaviours & basic physics, quality profiles, adaptive quality, battery modes, settings, docs, web export, `.mfpack` export/import, licence audit, third-party notices, benchmarks, Android shell.

Explicitly **NOT IMPLEMENTED** in 0.1: accounts, cloud sync, community sharing/reporting backend, marketplace, admin dashboard, user scripting, animation playback/editing, skeletal animation controls, LOD generation, particles, post-processing, native Android/Windows game packaging from inside the app, remote official asset server (client exists; no server is deployed), in-app updates.

## 6. Project format

See [project-format.md](../project-format.md). Summary:

```
<project>/
  project.mfproj            JSON manifest (format + engine + renderer versions)
  scenes/<name>.mfscene     JSON scene (flat entity map)
  assets/<assetId>/<file>   original/optimised asset bytes
  assets/<assetId>/asset.meta.json   provenance, licence, import settings, stats, sha256
  metadata/backups/<n>/     last 3 saved versions of manifest + scenes
  cache/                    derived data; safe to delete; never exported
  builds/                   export output; never exported in .mfpack
```

Folders like `models/`, `textures/`, `audio/` from the brief are replaced by `assets/<id>/` so an asset's bytes and its licence metadata can never be separated, and renames never break references.

## 7. Asset / licence metadata

See [licensing.md](../licensing.md). The record contains every field listed in §1 and §15 of the brief. Public distribution requires **all** of: licence identified, redistribution allowed, intended use allowed, attribution understood, source documented, no restricted third-party content, licence text preserved, licence review + content review + technical review done. The build (`npm run build`) fails if any public catalog entry fails the gate, and the app re-checks at runtime.

## 8. Security boundaries

See [security.md](../security.md). Everything from outside the app is untrusted: imported files, `.mfpack` archives, project JSON, downloaded catalog data. Controls: extension allow-list + magic-byte sniffing, executable signature rejection, size limits, path normalisation, zip-bomb limits (entries, expanded size, ratio), JSON size limits and schema validation, no code execution from content, HTTPS-only remote catalog, SHA-256 integrity on downloads and packs.

## 9. Performance budgets (initial; to be validated on real devices)

| Metric | Low-end Android | Desktop |
|---|---|---|
| Launch → interactive home | ≤ 2.5 s | ≤ 1.0 s |
| Home JS (gzip) | ≤ 120 KB | same |
| Editor chunk incl. three.js (gzip) | ≤ 350 KB | same |
| Editor idle CPU / GPU | ~0 (no frame loop) | same |
| Play-mode frame time (p95) | ≤ 33.3 ms (30 FPS) | ≤ 16.7 ms (60 FPS) |
| Demo project load | ≤ 2 s | ≤ 0.5 s |
| 10 MB GLB import + analysis | ≤ 10 s | ≤ 3 s |
| JS heap, demo open | ≤ 150 MB | ≤ 300 MB |
| APK size | ≤ 15 MB | — |

Encoded in `packages/core/src/perf/budgets.ts` and checked by the benchmark report.

## 10. Battery-saving mechanisms

See [battery.md](../battery.md). Render-on-demand editor; frame limiter that sleeps with timers instead of spinning on vsync; complete stop when hidden/backgrounded; battery-saver profile (30 FPS, no shadows, reduced resolution); adaptive quality governor; lazy thumbnails (only visible cards, one at a time, cached); no background scanning, polling, sync, or telemetry; network only on explicit user action; no wake locks.

## 11. Android architecture

Capacitor 8 shell hosting the same web build from local files (`https://localhost` origin, no network needed). `@capacitor/app` for pause/resume/back button; a small native **ThermalStatus** plugin (Java, `PowerManager.OnThermalStatusChangedListener`, API 29+) pushes thermal events. No runtime permissions requested. Export uses the system share sheet. See [android.md](../android.md).

## 12. Windows architecture

Tauri 2 shell (WebView2) with the same web build. Storage is WebView2 IndexedDB in 0.1; direct project folders on disk are planned. The web build is also an installable, offline-capable PWA (Edge/Chrome), which is the path verified in this environment. See [windows.md](../windows.md).

## 13. Testing strategy

- Unit tests (Vitest) for all of `core` and the IndexedDB file system (fake-indexeddb).
- Integration tests: project create → edit → save → reload → pack → import round-trip; licence gate over the shipped catalog; runtime simulation.
- Manual/instrumented: browser checks at desktop and phone viewports; Android emulator smoke test.
- Benchmarks: `npm run bench:core` (Node) and the in-app benchmark (Settings → Performance).
- Real-device matrix (low/mid/high Android, low/mid/high Windows) — **must be run by the team before 1.0**; see [testing.md](../testing.md).

## 14. Play Store readiness

See [play-store-checklist.md](../play-store-checklist.md). Every item must be re-checked against Google's live policy pages at release time; nothing in this repo claims compliance.

## 15. Incremental delivery

Roadmap follows §96 of the brief; the repo is structured so each package is independently testable.
