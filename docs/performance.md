# Mythic Forge — Performance Architecture & Budgets

## 1. Practical Performance Budgets (§64)

The engine enforces strict resource budgets to ensure fluid operation across devices ranging from a \$100 Android smartphone to a high-end desktop workstation:

| Target Metric | Budget (Low-End Android) | Budget (Mid-Range Android) | Budget (Desktop PC) |
|---|---|---|---|
| **Cold Launch to Interactive** | $\le 2.5\text{ s}$ | $\le 1.8\text{ s}$ | $\le 1.0\text{ s}$ |
| **Initial JS Bundle (Gzip)** | $\le 120\text{ KB}$ | $\le 120\text{ KB}$ | $\le 120\text{ KB}$ |
| **Editor Chunk + Three.js (Gzip)** | $\le 350\text{ KB}$ | $\le 350\text{ KB}$ | $\le 350\text{ KB}$ |
| **Idle Editor CPU / GPU** | $\sim 0\%\text{ (0 FPS)}$ | $\sim 0\%\text{ (0 FPS)}$ | $\sim 0\%\text{ (0 FPS)}$ |
| **Play Mode Frame Time (p95)** | $\le 33.3\text{ ms (30 FPS)}$ | $\le 22.2\text{ ms (45 FPS)}$ | $\le 16.7\text{ ms (60 FPS)}$ |
| **Demo Project Load Time** | $\le 2.0\text{ s}$ | $\le 1.2\text{ s}$ | $\le 0.5\text{ s}$ |
| **10 MB GLB Import & Analysis** | $\le 10.0\text{ s}$ | $\le 6.0\text{ s}$ | $\le 3.0\text{ s}$ |
| **RAM Footprint (Demo Open)** | $\le 150\text{ MB}$ | $\le 200\text{ MB}$ | $\le 300\text{ MB}$ |
| **Android APK Package Size** | $\le 15\text{ MB}$ | $\le 15\text{ MB}$ | — |

---

## 2. Adaptive Quality Governor (§25, §65)

Mythic Forge includes an automatic runtime governor (`packages/core/src/perf/governor.ts`) that continuously evaluates runtime telemetry:

$$\text{Frame Time} > \text{Budget} \quad\text{or}\quad \text{Thermal Throttling Event}$$

### Progressive quality degradation

The governor works only while a game runs (it gets no samples from the idle editor). It keeps a window of the last 45 frame intervals. When at least 25% of them are over 1.35× the frame budget, it moves one step down the ladder, waiting at least 3 s between changes. Each step builds on the previous ones, cheapest to notice first:

1. Shadow quality one step lower
2. Shadows off
3. Reflections off
4. Render scale ≤ 0.85
5. Render scale ≤ 0.7
6. Draw distance ≤ 150 m
7. LOD distance ≤ ×0.5 (simpler models appear sooner)
8. Render scale ≤ 0.55 and pixel ratio 1
9. Frame rate ≤ 30 FPS

It steps back up one level at a time. That happens only after 12 s without slow frames, and only if CPU work per frame stays below half of the budget of the level it would move to.

**Thermal input** comes from the platform as events and is never polled. `serious` forces at least step 4, and `critical` forces every step. While the device reports `fair`, quality is never raised. Under `serious` or `critical`, it is never raised past the forced step.

---

## 3. Frame Rate Management & Sleep Scheduling (§24)

Traditional game loops often spin on `requestAnimationFrame`, continuously keeping the CPU and GPU wakefulness at maximum power.

Mythic Forge implements the `FrameScheduler` (`packages/core/src/perf/scheduler.ts`):
- **Precise FPS Clamping:** Targets 30, 45, 60, 90, or 120 FPS.
- **Sleep Intervals:** In Play Mode, between frame ticks, the scheduler uses millisecond-accurate timer sleeps instead of spinning in active busy-wait loops.
- **Background Suspension:** When the app tab or window is hidden (via Page Visibility API or Android `onPause`), the frame loop suspends **completely** (0 draws, 0 audio ticks).

---

## 4. Benchmark & Validation Suite (§79, §106)

Mythic Forge includes two distinct benchmark suites:

### A. Core CLI Benchmark (`npm run bench:core`)
Runs in Node.js to prevent regression in CI environments without requiring a physical GPU:
- Validates 5,000-object scene validation and JSON serialization.
- Measures save/open latency for 5,000-entity scenes.
- Benchmarks `.mfpack` export and verified import with 20 MB payloads.
- Runs 10,000 transactional undoable transform commands.
- Measures indexed search over 5,000 items.
- Outputs detailed reports to `reports/core-bench.md` and `reports/core-bench.json`.

### B. In-App Performance Benchmark
Accessible inside the Editor (**Settings → Performance → Run Benchmark**):
- Measures active WebGL 2 draw calls, triangles, and millisecond frame timings directly on the host hardware.
- Compares real-world results against the target budget tier.
