import { describe, expect, it } from 'vitest';
import {
  GameRuntime,
  ScriptedInput,
  TEMPLATES,
  createEmptyScene,
  createEntity,
  createPrimitive,
  defaultCollider,
  defaultRigidBody,
  quat,
  type SceneDocument,
} from '../src/index.ts';

const add = (scene: SceneDocument, e: ReturnType<typeof createEntity>) => {
  scene.entities[e.id] = e;
  scene.rootIds.push(e.id);
  return e;
};

function world() {
  const scene = createEmptyScene();
  const ground = createPrimitive('cube', 'Ground');
  ground.transform = { position: [0, -0.5, 0], rotation: [0, 0, 0], scale: [40, 1, 40] };
  ground.components.collider = defaultCollider([1, 1, 1]);
  ground.isStatic = true;
  add(scene, ground);
  const player = createPrimitive('capsule', 'Player');
  player.transform.position = [0, 3, 0];
  player.components.collider = defaultCollider([1, 2, 1]);
  player.components.rigidBody = defaultRigidBody();
  player.components.behaviours = [{ type: 'playerController', mode: 'third-person', moveSpeed: 5, jumpSpeed: 5, lookSensitivity: 0.25 }];
  add(scene, player);
  return { scene, ground, player };
}

const simulate = (rt: GameRuntime, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) rt.update(1 / 30);
};

describe('GameRuntime', () => {
  it('drops the player onto the ground', () => {
    const { scene, player } = world();
    const rt = new GameRuntime(scene, new ScriptedInput());
    rt.start();
    simulate(rt, 2);
    const p = rt.entities.get(player.id)!;
    expect(p.position[1]).toBeCloseTo(1, 2);
    expect(p.body!.grounded).toBe(true);
  });

  it('moves, jumps and walks up small steps but not walls', () => {
    const { scene, player } = world();
    const step = createPrimitive('cube', 'Step');
    step.transform = { position: [0, 0.15, -3], rotation: [0, 0, 0], scale: [4, 0.3, 2] };
    step.components.collider = defaultCollider();
    add(scene, step);
    const wall = createPrimitive('cube', 'Wall');
    wall.transform = { position: [0, 2, -8], rotation: [0, 0, 0], scale: [10, 4, 1] };
    wall.components.collider = defaultCollider();
    add(scene, wall);

    const input = new ScriptedInput();
    const rt = new GameRuntime(scene, input);
    rt.start();
    simulate(rt, 1);
    input.state.moveY = 1; // forward = -Z (no follow camera → yaw 0)
    simulate(rt, 3);
    const p = rt.entities.get(player.id)!;
    expect(p.position[2]).toBeLessThan(-6);
    expect(p.position[2]).toBeGreaterThan(-7.6); // stopped by the wall (wall face at z=-7.5, half depth 0.5)
    expect(p.position[1]).toBeCloseTo(1, 1); // stepped up onto the 0.3 step then off it

    input.state.moveY = 0;
    input.state.jump = true;
    rt.update(1 / 30);
    input.state.jump = false;
    simulate(rt, 0.2);
    expect(p.position[1]).toBeGreaterThan(1.3);
    simulate(rt, 2);
    expect(p.position[1]).toBeCloseTo(1, 1);
  });

  it('collects items, tracks score and announces a win', () => {
    const { scene, player } = world();
    scene.hud = { title: '', showScore: true, winMessage: 'You win' };
    const gem = createPrimitive('sphere', 'Gem');
    gem.transform.position = [0, 1, -2];
    gem.components.collider = { ...defaultCollider(), isTrigger: true };
    gem.components.behaviours = [{ type: 'collectible', scoreValue: 5, soundAssetId: null }, { type: 'rotate', axis: 'y', speed: 90 }];
    add(scene, gem);
    const input = new ScriptedInput();
    const rt = new GameRuntime(scene, input);
    const scores: number[] = [];
    let won = '';
    rt.events.on('score', (s) => scores.push(s.score));
    rt.events.on('won', (w) => (won = w.message));
    rt.start();
    expect(rt.totalCollectibles).toBe(1);
    simulate(rt, 1);
    const before = rt.entities.get(gem.id)!.rotation;
    expect(before).not.toEqual(quat.identity());
    input.state.moveY = 1;
    simulate(rt, 1);
    expect(rt.isActive(gem.id)).toBe(false);
    expect(scores).toEqual([0, 5]);
    expect(won).toBe('You win');
    expect(rt.entities.get(player.id)!.position[2]).toBeLessThan(-2);
  });

  it('respawns players that fall out of the world', () => {
    const { scene, player, ground } = world();
    delete scene.entities[ground.id];
    scene.rootIds = scene.rootIds.filter((id) => id !== ground.id);
    const rt = new GameRuntime(scene, new ScriptedInput());
    rt.start();
    simulate(rt, 5);
    const p = rt.entities.get(player.id)!;
    expect(p.position[1]).toBeGreaterThan(-60);
  });

  it('never mutates the editor scene and isolates behaviour failures', () => {
    const { scene } = world();
    const cam = createEntity('Camera', {
      camera: { projection: 'perspective', fov: 60, orthoSize: 5, near: 0.1, far: 100, isMain: true },
      behaviours: [{ type: 'followCamera', targetId: 'e_missing', distance: 5, height: 2, smoothing: 5 }],
    });
    add(scene, cam);
    const snapshot = JSON.stringify(scene);
    const rt = new GameRuntime(scene, new ScriptedInput());
    // Force a failure inside a behaviour.
    const entity = rt.entities.get(cam.id)!;
    const faulty = {
      type: 'bob' as const,
      amplitude: 1,
      get frequency(): number {
        throw new Error('boom');
      },
    };
    entity.behaviours.push({ def: faulty, failed: false });
    const errors: string[] = [];
    rt.events.on('error', (e) => errors.push(e.message));
    rt.start();
    simulate(rt, 0.5);
    expect(errors).toEqual(['boom']);
    expect(entity.behaviours.find((b) => b.def.type === 'bob')!.failed).toBe(true);
    expect(JSON.stringify(scene)).toBe(snapshot);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('template %s simulates without errors', (_id, template) => {
    const scene = template.build({ assetIdFor: () => null });
    const input = new ScriptedInput();
    const rt = new GameRuntime(scene, input);
    const errors: string[] = [];
    rt.events.on('error', (e) => errors.push(e.message));
    rt.start();
    input.state.moveX = 0.5;
    input.state.moveY = 1;
    input.state.lookX = 3;
    simulate(rt, 2);
    expect(errors).toEqual([]);
    for (const e of rt.entities.values()) {
      for (const v of [...e.position, ...e.rotation]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
