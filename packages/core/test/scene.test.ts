import { describe, expect, it } from 'vitest';
import {
  SCENE_FORMAT_VERSION,
  SceneModel,
  TEMPLATES,
  createEmptyScene,
  createPrimitive,
  validateScene,
  type SceneChange,
} from '../src/index.ts';

const noAssets = { assetIdFor: () => null };

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s builds a valid scene', (_id, template) => {
    const scene = template.build(noAssets);
    const result = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(result.value).toEqual(scene);
      const cameras = Object.values(scene.entities).filter((e) => e.components.camera?.isMain);
      expect(cameras.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('shrine template references official assets when available', () => {
    const shrine = TEMPLATES.find((t) => t.id === 'shrine-of-lamps')!;
    const scene = shrine.build({ assetIdFor: (id) => `a_${id.replace(/[^a-z]/g, '')}` });
    const modelIds = Object.values(scene.entities)
      .map((e) => e.components.model?.assetId)
      .filter(Boolean);
    expect(new Set(modelIds).size).toBe(shrine.requiredAssets.length);
    expect(scene.hud.showScore).toBe(true);
  });
});

describe('validateScene', () => {
  it('rejects non-scenes and newer formats', () => {
    expect(validateScene(null).ok).toBe(false);
    expect(validateScene({ format: 'other' }).ok).toBe(false);
    const newer = { ...createEmptyScene(), formatVersion: SCENE_FORMAT_VERSION + 1 };
    const r = validateScene(newer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer/);
  });

  it('repairs invalid values with warnings', () => {
    const scene = createEmptyScene();
    const cube = createPrimitive('cube');
    (cube.transform as unknown as Record<string, unknown>).position = [1, 'x', Infinity];
    (cube.components.material as unknown as Record<string, unknown>).color = 'red';
    (cube.components.material as unknown as Record<string, unknown>).roughness = 7;
    (cube.components as Record<string, unknown>).behaviours = [{ type: 'runShellCommand', cmd: 'rm -rf /' }, { type: 'rotate', speed: 10 }];
    scene.entities[cube.id] = cube;
    scene.rootIds.push(cube.id);
    const r = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.value.entities[cube.id]!;
    expect(e.transform.position).toEqual([1, 0, 0]);
    expect(e.components.material!.color).toBe('#c8c2b8');
    expect(e.components.material!.roughness).toBe(1);
    expect(e.components.behaviours).toEqual([{ type: 'rotate', axis: 'y', speed: 10 }]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('repairs broken hierarchy (missing parents, cycles, inconsistent children)', () => {
    const scene = createEmptyScene();
    const a = createPrimitive('cube', 'A');
    const b = createPrimitive('cube', 'B');
    const c = createPrimitive('cube', 'C');
    a.parent = b.id; // cycle a <-> b
    b.parent = a.id;
    c.parent = 'e_missing';
    a.children = ['e_ghost'];
    for (const e of [a, b, c]) scene.entities[e.id] = e;
    scene.rootIds = ['e_nothing'];
    const r = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = r.value;
    // No cycles: walking parents from every entity terminates at a root.
    for (const e of Object.values(doc.entities)) {
      const seen = new Set<string>();
      let p = e.parent;
      while (p) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
        p = doc.entities[p]!.parent;
      }
    }
    expect(doc.entities[c.id]!.parent).toBeNull();
    expect(doc.rootIds).toContain(c.id);
    for (const e of Object.values(doc.entities)) {
      for (const child of e.children) expect(doc.entities[child]!.parent).toBe(e.id);
    }
  });

  it('drops entities with invalid or mismatched ids', () => {
    const scene = createEmptyScene();
    const cube = createPrimitive('cube');
    scene.entities['../../etc'] = { ...cube, id: '../../etc' };
    scene.entities.e_other = cube;
    const r = validateScene(JSON.parse(JSON.stringify(scene)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value.entities)).toEqual([]);
  });

  it('enforces the entity limit', () => {
    const scene = createEmptyScene();
    for (let i = 0; i < 5; i++) {
      const e = createPrimitive('cube');
      scene.entities[e.id] = e;
    }
    expect(validateScene(scene, { maxEntities: 4 }).ok).toBe(false);
  });
});

describe('SceneModel', () => {
  const setup = () => {
    const model = new SceneModel(createEmptyScene());
    const changes: SceneChange[] = [];
    model.events.on('change', (c) => changes.push(c));
    return { model, changes };
  };

  it('adds, reparents and removes entities, emitting changes', () => {
    const { model, changes } = setup();
    const a = createPrimitive('cube', 'A');
    const b = createPrimitive('sphere', 'B');
    model.addEntity(a);
    model.addEntity(b);
    expect(model.childrenOf(null)).toEqual([a.id, b.id]);
    expect(model.setParent(b.id, a.id)).toBe(true);
    expect(model.childrenOf(a.id)).toEqual([b.id]);
    expect(model.setParent(a.id, b.id)).toBe(false); // would create a cycle
    const removed = model.removeEntity(a.id);
    expect(removed.entities.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(model.entityCount).toBe(0);
    model.insertSubtree(removed);
    expect(model.get(b.id)?.parent).toBe(a.id);
    expect(changes.map((c) => c.type)).toEqual(['added', 'added', 'reparented', 'removed', 'added']);
    expect(model.revision).toBe(5);
  });

  it('clones subtrees with fresh ids and remapped references', () => {
    const { model } = setup();
    const player = createPrimitive('capsule', 'Player');
    const cam = createPrimitive('cube', 'Cam');
    cam.components.behaviours = [{ type: 'followCamera', targetId: player.id, distance: 5, height: 2, smoothing: 5 }];
    model.addEntity(player);
    model.addEntity(cam);
    model.setParent(cam.id, player.id);
    const clone = model.cloneSubtree(player.id);
    expect(clone.entities).toHaveLength(2);
    const ids = clone.entities.map((e) => e.id);
    expect(ids).not.toContain(player.id);
    const clonedCam = clone.entities[1]!;
    expect(clonedCam.parent).toBe(clone.rootId);
    const follow = clonedCam.components.behaviours![0]!;
    expect(follow.type === 'followCamera' && follow.targetId).toBe(clone.rootId);
    expect(clone.entities[0]!.name).toBe('Player (copy)');
    model.insertSubtree(clone);
    expect(model.entityCount).toBe(4);
  });

  it('computes world matrices through the hierarchy', () => {
    const { model } = setup();
    const parent = createPrimitive('cube');
    parent.transform = { position: [10, 0, 0], rotation: [0, 90, 0], scale: [2, 2, 2] };
    const child = createPrimitive('cube');
    child.transform.position = [0, 0, 1];
    model.addEntity(parent);
    model.addEntity(child, parent.id);
    const m = model.worldMatrix(child.id);
    expect(m[12]).toBeCloseTo(12);
    expect(m[13]).toBeCloseTo(0);
    expect(m[14]).toBeCloseTo(0);
  });

  it('reports active state through disabled ancestors', () => {
    const { model } = setup();
    const parent = createPrimitive('cube');
    const child = createPrimitive('cube');
    model.addEntity(parent);
    model.addEntity(child, parent.id);
    expect(model.isActiveInHierarchy(child.id)).toBe(true);
    model.setFlag(parent.id, 'enabled', false);
    expect(model.isActiveInHierarchy(child.id)).toBe(false);
  });
});
