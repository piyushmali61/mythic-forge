import type { PlayInput, ViewportStats } from '@mythic-forge/renderer';
import { useRef } from 'preact/hooks';
import { svc } from '../app/state.ts';
import type { HudState } from './session.ts';

export function PerfOverlay({ stats, notice }: { stats: ViewportStats | null; notice: string | null }) {
  if (!stats) return null;
  const f = (n: number, d = 1): string => n.toFixed(d);
  return (
    <div class="perf-overlay" aria-label="Performance">
      <dl>
        <dt>FPS</dt>
        <dd>{stats.fps > 0 ? f(stats.fps, 0) : 'idle'}</dd>
        <dt>Frame time</dt>
        <dd>{stats.frameMs > 0 ? `${f(stats.frameMs)} ms` : '—'}</dd>
        <dt>CPU (render)</dt>
        <dd>{f(stats.workMs, 2)} ms</dd>
        <dt>GPU</dt>
        <dd>n/a</dd>
        <dt>Memory (JS)</dt>
        <dd>{stats.jsHeapMB !== null ? `${f(stats.jsHeapMB, 0)} MB` : 'n/a'}</dd>
        <dt>Draw calls</dt>
        <dd>{stats.drawCalls}</dd>
        <dt>Triangles</dt>
        <dd>{stats.triangles.toLocaleString()}</dd>
        <dt>Objects / assets</dt>
        <dd>
          {stats.entities} / {stats.loadedAssets}
        </dd>
        <dt>GPU buffers / textures</dt>
        <dd>
          {stats.geometries} / {stats.textures}
        </dd>
        <dt>Render scale</dt>
        <dd>{Math.round(stats.renderScale * 100)}%</dd>
        <dt>Frames drawn</dt>
        <dd>{stats.framesRendered}</dd>
      </dl>
      {notice && <div style={{ marginTop: '4px', color: '#e5b54c', maxWidth: '200px' }}>{notice}</div>}
    </div>
  );
}

export function PlayHud({ hud, input, paused }: { hud: HudState; input: PlayInput; paused: boolean }) {
  const touch = svc().platform.device.isTouch;
  return (
    <div class="hud">
      {(hud.title || hud.showScore) && (
        <div class="hud-top" role="status">
          {hud.title && <span>{hud.title}</span>}
          {hud.showScore && (
            <span>
              Score {hud.score}
              {hud.total > 0 && ` · ${hud.collected}/${hud.total}`}
            </span>
          )}
        </div>
      )}
      {hud.won && (
        <div class="hud-win" role="alert">
          {hud.won}
        </div>
      )}
      {paused && <div class="hud-win">Paused</div>}
      {!touch && !paused && <div class="hud-hint">WASD / arrows to move · Space to jump · drag to look · Esc to stop</div>}
      {touch && !paused && <TouchControls input={input} />}
    </div>
  );
}

/** On-screen stick and jump button, shown on touch devices while playing. */
export function TouchControls({ input }: { input: PlayInput }) {
  const knob = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const RADIUS = 52;

  const move = (e: PointerEvent): void => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setVirtualStick(dx / RADIUS, -dy / RADIUS);
  };
  const end = (e: PointerEvent): void => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    if (knob.current) knob.current.style.transform = '';
    input.setVirtualStick(0, 0);
  };

  return (
    <div class="touch-controls">
      <div
        class="stick"
        aria-label="Move"
        onPointerDown={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div class="stick-knob" ref={knob} />
      </div>
      <button
        type="button"
        class="jump-btn"
        onPointerDown={(e) => {
          e.stopPropagation();
          input.setVirtualJump(true);
        }}
        onPointerUp={() => input.setVirtualJump(false)}
        onPointerCancel={() => input.setVirtualJump(false)}
        onPointerLeave={() => input.setVirtualJump(false)}
      >
        Jump
      </button>
    </div>
  );
}
