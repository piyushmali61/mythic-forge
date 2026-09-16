import { describe, expect, it } from 'vitest';
import {
  CommandHistory,
  CompositeCommand,
  DeleteEntityCommand,
  ReparentCommand,
  SceneModel,
  SetComponentCommand,
  TransformCommand,
  addEntityCommand,
  createEmptyScene,
  createPrimitive,
  defaultMaterial,
  mat4,
  type Command,
} from '../src/index.ts';

const counterCommand = (state: { n: number }, by: number, cost = 10): Command => ({
  label: `add ${by}`,
  cost,
  execute: () => {
    state.n += by;
  },
  undo: () => {
    state.n -= by;
  },
});

describe('CommandHistory', () => {
  it('undoes and redoes in order', () => {
    const state = { n: 0 };
    const h = new CommandHistory();
    h.execute(counterCommand(state, 1));
    h.execute(counterCommand(state, 2));
    expect(state.n).toBe(3);
    expect(h.undo()).toBe('add 2');
    expect(state.n).toBe(1);
    expect(h.redo()).toBe('add 2');
    expect(state.n).toBe(3);
    h.undo();
    h.execute(counterCommand(state, 5)); // clears redo
    expect(h.state.canRedo).toBe(false);
    expect(state.n).toBe(6);
  });

  it('does not record commands that throw', () => {
    const h = new CommandHistory();
    expect(() =>
      h.execute({
        label: 'boom',
        execute: () => {
          throw new Error('nope');
        },
        undo: () => {},
      }),
    ).toThrow();
    expect(h.state.canUndo).toBe(false);
  });

  it('enforces entry and byte budgets, dropping the oldest first', () => {
    const state = { n: 0 };
    const h = new CommandHistory({ maxEntries: 3, maxBytes: 1000 });
    for (let i = 0; i < 5; i++) h.execute(counterCommand(state, 1));
    expect(h.state.size).toBe(3);
    const big = new CommandHistory({ maxEntries: 100, maxBytes: 100 });
    for (let i = 0; i < 5; i++) big.execute(counterCommand(state, 1, 40));
    expect(big.state.size).toBe(2);
    expect(big.approximateBytes).toBeLessThanOrEqual(100);
  });

  it('merges consecutive edits within the merge window', () => {
    let now = 0;
    const scene = new SceneModel(createEmptyScene());
    const cube = createPrimitive('cube');
    scene.addEntity(cube);
    const h = new CommandHistory({ now: () => now });
    const t0 = structuredClone(cube.transform);
    const step = (x: number) => ({ ...t0, position: [x, 0, 0] as [number, number, number] });
    h.execute(new TransformCommand(scene, cube.id, t0, step(1), 'Move', 'field-x'));
    now += 100;
    h.execute(new TransformCommand(scene, cube.id, step(1), step(2), 'Move', 'field-x'));
    now += 100;
    h.execute(new TransformCommand(scene, cube.id, step(2), step(3), 'Move', 'field-x'));
    expect(h.state.size).toBe(1);
    h.undo();
    expect(scene.get(cube.id)!.transform.position).toEqual([0, 0, 0]);
    h.redo();
    expect(scene.get(cube.id)!.transform.position).toEqual([3, 0, 0]);
    now += 5000; // outside window
    h.execute(new TransformCommand(scene, cube.id, step(3), step(4), 'Move', 'field-x'));
    expect(h.state.size).toBe(2);
  });
});

describe('scene commands', () => {
  it('add/delete with undo restores the whole subtree', () => {
    const scene = new SceneModel(createEmptyScene());
    const h = new CommandHistory();
    const parent = createPrimitive('cube', 'Parent');
    const child = createPrimitive('sphere', 'Child');
    h.execute(addEntityCommand(scene, parent));
    h.execute(addEntityCommand(scene, child, parent.id));
    h.execute(new DeleteEntityCommand(scene, parent.id));
    expect(scene.entityCount).toBe(0);
    h.undo();
    expect(scene.entityCount).toBe(2);
    expect(scene.get(child.id)!.parent).toBe(parent.id);
    h.undo();
    h.undo();
    expect(scene.entityCount).toBe(0);
  });

  it('component edits are reversible', () => {
    const scene = new SceneModel(createEmptyScene());
    const cube = createPrimitive('cube');
    scene.addEntity(cube);
    const h = new CommandHistory();
    h.execute(new SetComponentCommand(scene, cube.id, 'material', { ...defaultMaterial(), color: '#ff0000' }, 'Colour'));
    h.execute(new SetComponentCommand(scene, cube.id, 'rigidBody', { mass: 2, useGravity: true, isKinematic: false }, 'Add body'));
    expect(scene.get(cube.id)!.components.material!.color).toBe('#ff0000');
    h.undo();
    expect(scene.get(cube.id)!.components.rigidBody).toBeUndefined();
    h.undo();
    expect(scene.get(cube.id)!.components.material!.color).toBe(defaultMaterial().color);
  });

  it('reparenting keeps the world transform and undoes cleanly', () => {
    const scene = new SceneModel(createEmptyScene());
    const parent = createPrimitive('cube');
    parent.transform = { position: [5, 1, 0], rotation: [0, 45, 0], scale: [2, 2, 2] };
    const child = createPrimitive('cube');
    child.transform.position = [1, 2, 3];
    scene.addEntity(parent);
    scene.addEntity(child);
    const before = scene.worldMatrix(child.id);
    const h = new CommandHistory();
    expect(ReparentCommand.isValid(scene, child.id, parent.id)).toBe(true);
    expect(ReparentCommand.isValid(scene, parent.id, parent.id)).toBe(false);
    h.execute(new ReparentCommand(scene, child.id, parent.id));
    expect(scene.get(child.id)!.parent).toBe(parent.id);
    const after = scene.worldMatrix(child.id);
    [...after].forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 4));
    h.undo();
    expect(scene.get(child.id)!.parent).toBeNull();
    expect(scene.get(child.id)!.transform.position).toEqual([1, 2, 3]);
    expect([...scene.worldMatrix(child.id)]).toEqual([...mat4.compose([1, 2, 3], [0, 0, 0, 1], [1, 1, 1])]);
  });

  it('composite commands undo in reverse order', () => {
    const log: string[] = [];
    const mk = (n: string): Command => ({ label: n, execute: () => log.push(`do ${n}`), undo: () => log.push(`undo ${n}`) });
    const h = new CommandHistory();
    h.execute(new CompositeCommand('both', [mk('a'), mk('b')]));
    h.undo();
    expect(log).toEqual(['do a', 'do b', 'undo b', 'undo a']);
  });
});
