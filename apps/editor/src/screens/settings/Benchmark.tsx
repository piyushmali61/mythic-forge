import {
  ENGINE_VERSION,
  GameRuntime,
  SceneModel,
  ScriptedInput,
  evaluateBudgets,
  percentile,
  type BudgetResult,
} from '@mythic-forge/core';
import { Viewport, type AssetSource } from '@mythic-forge/renderer';
import { useRef, useState } from 'preact/hooks';
import { createProject } from '../../app/project-actions.ts';
import { refreshProjects, reportError, svc } from '../../app/state.ts';
import { currentQuality } from '../../lib/quality.ts';
import { Modal } from '../../ui/common.tsx';

interface Step {
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/**
 * In-app benchmark (§64, §106). Uses a temporary project that is deleted afterwards.
 * Measures what can be measured from inside a WebView; GPU utilisation and battery drain
 * need external tools (see docs/performance.md).
 */
export function BenchmarkModal({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<Step[]>([
    { label: 'Startup time', status: 'pending' },
    { label: 'Create and open demo project', status: 'pending' },
    { label: 'Build scene in viewport', status: 'pending' },
    { label: 'Import and optimise a model', status: 'pending' },
    { label: 'Play mode for 6 seconds', status: 'pending' },
    { label: 'Idle editor for 4 seconds', status: 'pending' },
  ]);
  const [results, setResults] = useState<BudgetResult[] | null>(null);
  const [report, setReport] = useState<string>('');
  const [running, setRunning] = useState(false);

  const mark = (i: number, status: Step['status'], note?: string): void =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, status, ...(note ? { note } : {}) } : x)));

  const run = async (): Promise<void> => {
    if (!host.current) return;
    setRunning(true);
    const { store } = svc();
    const values: Record<string, number | null> = {};
    let projectId: string | null = null;
    let viewport: Viewport | null = null;
    try {
      mark(0, 'running');
      values.startup = (window as unknown as { __mfStartupMs?: number }).__mfStartupMs ?? null;
      mark(0, 'done', values.startup ? `${values.startup.toFixed(0)} ms` : 'not recorded');

      mark(1, 'running');
      projectId = await createProject({ name: 'Benchmark (temporary)', type: '3d-game', targets: ['android', 'windows'], performanceProfile: 'balanced', templateId: 'shrine-of-lamps' });
      let t = performance.now();
      const opened = await store.open(projectId);
      values.projectLoad = performance.now() - t;
      if (!opened.ok) throw new Error(opened.message);
      mark(1, 'done', `${values.projectLoad.toFixed(0)} ms`);

      mark(2, 'running');
      const pid = projectId;
      const source: AssetSource = {
        load: async (assetId) => {
          const meta = await store.getAsset(pid, assetId);
          const bytes = meta ? await store.readAssetFile(pid, assetId) : null;
          return meta && bytes ? { bytes, format: meta.fileFormat, generateMipmaps: true } : null;
        },
      };
      t = performance.now();
      viewport = new Viewport({
        container: host.current,
        assets: source,
        quality: currentQuality(opened.manifest).settings,
        editor: false,
        mode2d: false,
        showGrid: false,
        gizmoSize: 1,
        powerPreference: 'default',
        geometryDetail: 'full',
        adaptiveQuality: false,
      });
      viewport.setScene(new SceneModel(opened.scene));
      await viewport.assetsSettled();
      await nextFrame();
      values.sceneBuild = performance.now() - t;
      mark(2, 'done', `${values.sceneBuild.toFixed(0)} ms`);

      mark(3, 'running');
      const assets = await store.listAssets(projectId);
      const sample = assets.find((a) => a.kind === 'model');
      if (sample) {
        const bytes = (await store.readAssetFile(projectId, sample.id))!;
        const { analyzeModel, optimizeModel } = await import('@mythic-forge/renderer/importer');
        t = performance.now();
        const analysis = await analyzeModel({ name: 'sample.glb', bytes }, 'glb', []);
        await optimizeModel(analysis, { compressTextures: true, textureQuality: 0.85, maxTextureSize: 1024, generateMipmaps: true, optimizeMesh: true, removeUnused: true, generateCollider: true });
        values.assetImport = performance.now() - t;
        mark(3, 'done', `${values.assetImport.toFixed(0)} ms (${sample.name})`);
      } else {
        values.assetImport = null;
        mark(3, 'skipped', 'no sample model available in this build');
      }

      mark(4, 'running');
      const input = new ScriptedInput();
      const runtime = new GameRuntime(opened.scene, input);
      runtime.start();
      const framesBefore = viewport.framesRendered;
      const targetFps = currentQuality(opened.manifest).settings.targetFps;
      viewport.setStatsEnabled(true);
      viewport.startPlay(runtime);
      const started = performance.now();
      // Drive the player around with scripted input (no real input needed).
      while (performance.now() - started < 6000) {
        const phase = (performance.now() - started) / 1000;
        input.state.moveY = Math.sin(phase) > 0 ? 1 : -1;
        input.state.moveX = Math.cos(phase * 0.7);
        input.state.lookX = 2;
        await sleep(100);
      }
      const frames = viewport.framesRendered - framesBefore;
      const intervals = viewport.recentFrameIntervals();
      viewport.stopPlay();
      viewport.setStatsEnabled(false);
      values.fps = frames / 6;
      values.frameTimeP95 = percentile(intervals, 95);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      values.jsHeap = mem ? mem.usedJSHeapSize / 1048576 : null;
      mark(4, 'done', `${values.fps.toFixed(1)} FPS rendered (target ${targetFps}), p95 frame interval ${values.frameTimeP95.toFixed(1)} ms`);

      mark(5, 'running');
      await sleep(300);
      const before = viewport.framesRendered;
      await sleep(4000);
      values.idleFrames = viewport.framesRendered - before;
      mark(5, 'done', `${values.idleFrames} frame(s) drawn while idle`);

      const evaluated = evaluateBudgets(values, svc().platform.device.isMobile);
      setResults(evaluated);
      const lines = [
        `# Mythic Forge benchmark (${ENGINE_VERSION})`,
        `Date: ${new Date().toISOString()}`,
        `Device: ${svc().platform.device.platform} (${svc().platform.shell}), tier ${svc().device.tier}, GPU ${svc().gpu.renderer ?? 'unknown'}`,
        `Cores: ${svc().platform.device.cpuCores ?? '?'}, memory: ${svc().platform.device.memoryGB ?? '?'} GB (browser-reported)`,
        '',
        '| Metric | Value | Budget | Result |',
        '|---|---:|---:|---|',
        ...evaluated.map((r) => `| ${r.budget.label} | ${r.value === null ? 'n/a' : r.value.toFixed(1)} ${r.budget.unit} | ${r.budget.higherIsBetter ? '≥' : '≤'} ${r.limit} | ${r.pass === null ? 'not measured' : r.pass ? 'PASS' : 'FAIL'} |`),
        '',
        'Not measured here: GPU utilisation, battery drain and temperature (use platform tools; see docs/performance.md).',
      ];
      setReport(lines.join('\n'));
    } catch (error) {
      reportError(error, 'The benchmark could not finish.');
    } finally {
      viewport?.dispose();
      if (projectId) {
        await store.delete(projectId).catch(() => undefined);
        await refreshProjects();
      }
      setRunning(false);
    }
  };

  return (
    <Modal
      title="Benchmark"
      onClose={() => !running && onClose()}
      wide
      footer={
        <>
          {report && (
            <button type="button" class="btn" onClick={() => void svc().platform.files.save('mythic-forge-benchmark.md', new TextEncoder().encode(report), 'text/markdown')}>
              Save report
            </button>
          )}
          <button type="button" class="btn btn-primary" disabled={running} onClick={() => void run()}>
            {running ? 'Running…' : results ? 'Run again' : 'Start'}
          </button>
        </>
      }
    >
      <p class="muted">Takes about 20 seconds. Keep the app in the foreground. A temporary project is created and removed afterwards.</p>
      <div ref={host} style={{ position: 'relative', height: '200px', borderRadius: '8px', overflow: 'hidden', background: '#000', marginBottom: '12px' }} />
      <ol>
        {steps.map((s) => (
          <li key={s.label}>
            {s.label} — <span class={s.status === 'done' ? '' : 'dim'}>{s.status}</span>
            {s.note && <span class="dim"> · {s.note}</span>}
          </li>
        ))}
      </ol>
      {results && (
        <table class="table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Budget</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.budget.id}>
                <td>{r.budget.label}</td>
                <td>{r.value === null ? 'n/a' : `${r.value.toFixed(1)} ${r.budget.unit}`}</td>
                <td>
                  {r.budget.higherIsBetter ? '≥' : '≤'} {r.limit} {r.budget.unit}
                </td>
                <td>
                  {r.pass === null ? (
                    <span class="badge">not measured</span>
                  ) : r.pass ? (
                    <span class="badge success">PASS</span>
                  ) : (
                    <span class="badge danger">FAIL</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
