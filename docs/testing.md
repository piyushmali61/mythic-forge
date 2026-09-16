# Mythic Forge — Testing & Quality Assurance Strategy

## 1. Automated Testing Architecture (§79)

Mythic Forge maintains automated test coverage across all platform-independent subsystems using **Vitest**:

```
mythic-forge/
├── packages/core/test/
│   ├── commands.test.ts    # Undo/Redo stack execution, memory bounds, and inversion
│   ├── license.test.ts     # 10-point distribution gate, contradictory terms detection
│   ├── math.test.ts        # Vec3, Quat, Mat4 operations and transformations
│   ├── perf.test.ts        # Quality profiles, device tiers, and governor throttling
│   ├── project.test.ts     # ProjectStore atomic operations, backups, .mfpack round-trips
│   ├── runtime.test.ts     # GameRuntime simulation, physics ticks, behaviour lifecycles
│   ├── scene.test.ts       # SceneModel mutations, entity hierarchies, template validation
│   ├── security.test.ts    # Magic-byte sniffers, zip-bomb counters, path traversal tests
│   └── services.test.ts    # Repository client, conditional requests, download manager
│
├── packages/platform/test/
│   └── idb-fs.test.ts      # IndexedDB filesystem adapter verified via fake-indexeddb
│
└── apps/editor/test/
    └── markdown.test.ts    # In-app documentation and legal text parser validation
```

---

## 2. Test Execution Commands

```bash
# Run the full Vitest suite (142+ tests)
npm test

# Run Vitest in watch mode during development
npm run test:watch

# Execute complete quality verification (typecheck + test + license audit)
npm run check
```

---

## 3. Core Benchmark Runner (`npm run bench:core`) (§106)

To detect performance and memory regressions before device deployment, `tools/benchmark/core-bench.ts` measures:
1. **Validation Latency:** Validating a 5,000-object scene against schema constraints ($\approx 2.6\text{ MB}$ JSON).
2. **Serialization Latency:** Stringifying 5,000-entity scene graphs.
3. **Atomic Save Latency:** Committing 5,000 objects to disk with rolling backup creation.
4. **Archive Export / Import:** Packing and unpacking 20 MB payloads via `.mfpack` with SHA-256 integrity validation.
5. **Runtime Simulation:** Stepping a 5,000-object physics and behaviour world at 60 Hz.
6. **Command History Stress:** 10,000 continuous undoable transform commands with bounded history memory.
7. **Local Search:** Tokenized full-text search across 5,000 indexed documents.

Results are written automatically to `reports/core-bench.md` and `reports/core-bench.json`.

---

## 4. Hardware Device Testing Matrix (§80)

Before any public release, the engineering team executes tests across five target hardware categories:

| Device Tier | Reference Device | Primary Validation Points |
|---|---|---|
| **Low-End Android** | Android 10, 2–3 GB RAM (e.g. MediaTek Helio A22 / G25) | Cold boot $\le 2.5\text{ s}$, 30 FPS stable in Battery Saver, no OOM crashes, thermal stability. |
| **Mid-Range Android** | Android 13/14, 6–8 GB RAM (e.g. Snapdragon 778G / Dimensity 7050) | 45–60 FPS stable in Balanced profile, smooth touch gestures, rapid GLB import. |
| **High-End Android** | Android 14/15, Flagship (e.g. Snapdragon 8 Gen 2/3) | 60–120 FPS in High profile, instant scene navigation, high-resolution textures. |
| **Entry Windows Laptop** | Intel Core i3 / Celeron, Integrated UHD Graphics, 8 GB RAM | 60 FPS in Balanced profile, low fan noise in idle state, quick project saving. |
| **Desktop Workstation** | Discrete GPU (NVIDIA RTX / AMD Radeon), 16+ GB RAM | Ultra profile with soft shadow maps, multi-window stability, zero stuttering. |
