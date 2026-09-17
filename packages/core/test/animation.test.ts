import { describe, expect, it } from 'vitest';
import {
  GameRuntime,
  Reader,
  ScriptedInput,
  createEmptyScene,
  createEntity,
  createPrimitive,
  defaultAnimator,
  readStats,
  validateScene,
} from '../src/index.ts';

describe('Animator component', () => {
  it('survives a save/load round trip', () => {
    const scene = createEmptyScene();
    const e = createEntity('Hero', {
      model: { assetId: 'a_hero', castShadow: true, receiveShadow: true },
      animator: { ...defaultAnimator('Idle'), moveClip: 'Run', speed: 1.5, loop: false },
    });
    scene.entities[e.id] = e;
    scene.rootIds.push(e.id);
    const result = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entities[e.id]!.components.animator).toEqual({ clip: 'Idle', moveClip: 'Run', speed: 1.5, loop: false, playOnStart: true });
  });

  it('normalises untrusted animator data', () => {
    const scene = createEmptyScene();
    const e = createEntity('Hero');
    scene.entities[e.id] = e;
    scene.rootIds.push(e.id);
    const raw = JSON.parse(JSON.stringify(scene));
    raw.entities[e.id].components.animator = { clip: 42, moveClip: 'x'.repeat(500), speed: 1e9, loop: 'yes', extra: '<script>' };
    const result = validateScene(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.value.entities[e.id]!.components.animator!;
    expect(a.clip).toBe('');
    expect(a.moveClip.length).toBeLessThanOrEqual(128);
    expect(a.speed).toBe(10);
    expect(a.loop).toBe(true);
    expect(a).not.toHaveProperty('extra');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('reads clip lists from asset metadata and ignores junk', () => {
    const r = new Reader(2000);
    const stats = readStats(r, { animations: 2, clips: [{ name: 'Walk', durationSec: 1.2 }, 'bad', { name: 7, durationSec: -3 }] }, 'stats');
    expect(stats.clips).toEqual([
      { name: 'Walk', durationSec: 1.2 },
      { name: '', durationSec: 0 },
    ]);
    const many = readStats(r, { clips: Array.from({ length: 1000 }, (_, i) => ({ name: `c${i}`, durationSec: 1 })) }, 'stats');
    expect(many.clips).toHaveLength(256);
  });
});

describe('GameRuntime move speed', () => {
  it('reports how fast a player controller moves, and zero when it stops', () => {
    const scene = createEmptyScene();
    const player = createPrimitive('capsule', 'Player');
    player.components.behaviours = [{ type: 'playerController', mode: 'platformer', moveSpeed: 4, jumpSpeed: 0, lookSensitivity: 0.25 }];
    scene.entities[player.id] = player;
    scene.rootIds.push(player.id);
    const input = new ScriptedInput();
    const rt = new GameRuntime(scene, input);
    rt.start();
    const p = rt.entities.get(player.id)!;
    rt.update(1 / 30);
    expect(p.moveSpeed).toBe(0);
    input.state.moveX = 1;
    rt.update(1 / 30);
    expect(p.moveSpeed).toBeCloseTo(4, 3);
    input.state.moveX = 0;
    rt.update(1 / 30);
    expect(p.moveSpeed).toBe(0);
  });
});
