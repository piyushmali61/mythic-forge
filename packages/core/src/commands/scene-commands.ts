import { mat4 } from '../math/mat4.ts';
import { quat } from '../math/quat.ts';
import type { EntityFlag, EntitySubtree, SceneModel } from '../scene/scene-model.ts';
import type { Components, Entity, SceneEnvironment, SceneHud, Transform } from '../scene/types.ts';
import { deepClone } from '../util/json.ts';
import type { Command } from './history.ts';

const estimateCost = (value: unknown): number => {
  try {
    return JSON.stringify(value)?.length ?? 64;
  } catch {
    return 1024;
  }
};

/** Inserts a subtree (new object, duplicate, prefab, imported model). */
export class AddSubtreeCommand implements Command {
  readonly label: string;
  readonly cost: number;
  private readonly scene: SceneModel;
  private readonly subtree: EntitySubtree;

  constructor(scene: SceneModel, subtree: EntitySubtree, label = 'Add object') {
    this.scene = scene;
    this.subtree = subtree;
    this.label = label;
    this.cost = estimateCost(subtree);
  }

  get rootId(): string {
    return this.subtree.rootId;
  }

  execute(): void {
    this.scene.insertSubtree(this.subtree);
  }

  undo(): void {
    this.scene.removeEntity(this.subtree.rootId);
  }
}

export function addEntityCommand(scene: SceneModel, entity: Entity, parent: string | null = null, label?: string): AddSubtreeCommand {
  return new AddSubtreeCommand(
    scene,
    { rootId: entity.id, parent, index: -1, entities: [entity] },
    label ?? `Add ${entity.name}`,
  );
}

export class DeleteEntityCommand implements Command {
  readonly label: string;
  private readonly scene: SceneModel;
  private readonly id: string;
  private snapshot: EntitySubtree | null = null;

  constructor(scene: SceneModel, id: string) {
    this.scene = scene;
    this.id = id;
    this.label = `Delete ${scene.get(id)?.name ?? 'object'}`;
  }

  get cost(): number {
    return this.snapshot ? estimateCost(this.snapshot) : 256;
  }

  execute(): void {
    this.snapshot = this.scene.removeEntity(this.id);
  }

  undo(): void {
    if (this.snapshot) this.scene.insertSubtree(this.snapshot);
  }
}

export class TransformCommand implements Command {
  readonly label: string;
  readonly cost = 256;
  private readonly scene: SceneModel;
  readonly id: string;
  private readonly before: Transform;
  private after: Transform;
  private readonly mergeKey: string | null;

  /** Commands with the same non-null `mergeKey` for the same entity merge into one undo step. */
  constructor(scene: SceneModel, id: string, before: Transform, after: Transform, label = 'Transform', mergeKey: string | null = null) {
    this.scene = scene;
    this.id = id;
    this.before = deepClone(before);
    this.after = deepClone(after);
    this.label = label;
    this.mergeKey = mergeKey;
  }

  execute(): void {
    this.scene.setTransform(this.id, this.after);
  }

  undo(): void {
    this.scene.setTransform(this.id, this.before);
  }

  merge(next: Command): boolean {
    if (!(next instanceof TransformCommand) || this.mergeKey === null) return false;
    if (next.id !== this.id || next.mergeKey !== this.mergeKey) return false;
    this.after = deepClone(next.after);
    return true;
  }
}

export class SetComponentCommand<K extends keyof Components> implements Command {
  readonly label: string;
  readonly cost: number;
  private readonly scene: SceneModel;
  readonly id: string;
  readonly key: K;
  private readonly before: Components[K] | undefined;
  private after: Components[K] | undefined;
  private readonly mergeKey: string | null;

  constructor(
    scene: SceneModel,
    id: string,
    key: K,
    after: Components[K] | undefined,
    label: string,
    mergeKey: string | null = null,
  ) {
    this.scene = scene;
    this.id = id;
    this.key = key;
    const current = scene.get(id)?.components[key];
    this.before = current === undefined ? undefined : deepClone(current);
    this.after = after === undefined ? undefined : deepClone(after);
    this.label = label;
    this.mergeKey = mergeKey;
    this.cost = estimateCost(this.before) + estimateCost(this.after);
  }

  execute(): void {
    this.scene.setComponent(this.id, this.key, this.after);
  }

  undo(): void {
    this.scene.setComponent(this.id, this.key, this.before);
  }

  merge(next: Command): boolean {
    if (!(next instanceof SetComponentCommand) || this.mergeKey === null) return false;
    if (next.id !== this.id || next.key !== this.key || next.mergeKey !== this.mergeKey) return false;
    this.after = next.after as Components[K] | undefined;
    return true;
  }
}

export class SetFlagCommand implements Command {
  readonly label: string;
  private readonly scene: SceneModel;
  private readonly id: string;
  private readonly flag: EntityFlag;
  private readonly value: boolean;
  private readonly before: boolean;

  constructor(scene: SceneModel, id: string, flag: EntityFlag, value: boolean) {
    this.scene = scene;
    this.id = id;
    this.flag = flag;
    this.value = value;
    this.before = scene.get(id)?.[flag] ?? !value;
    const names: Record<EntityFlag, [string, string]> = {
      enabled: ['Enable', 'Disable'],
      visible: ['Show', 'Hide'],
      locked: ['Lock', 'Unlock'],
      isStatic: ['Mark static', 'Mark dynamic'],
    };
    this.label = `${names[flag][value ? 0 : 1]} ${scene.get(id)?.name ?? 'object'}`;
  }

  execute(): void {
    this.scene.setFlag(this.id, this.flag, this.value);
  }

  undo(): void {
    this.scene.setFlag(this.id, this.flag, this.before);
  }
}

export class RenameCommand implements Command {
  readonly label = 'Rename';
  private readonly scene: SceneModel;
  private readonly id: string;
  private readonly before: string;
  private readonly after: string;

  constructor(scene: SceneModel, id: string, name: string) {
    this.scene = scene;
    this.id = id;
    this.before = scene.get(id)?.name ?? '';
    this.after = name;
  }

  execute(): void {
    this.scene.setName(this.id, this.after);
  }

  undo(): void {
    this.scene.setName(this.id, this.before);
  }
}

/**
 * Moves an entity to a new parent. By default the object keeps its world position/rotation/scale,
 * which is what users expect when dragging in the hierarchy.
 */
export class ReparentCommand implements Command {
  readonly label: string;
  private readonly scene: SceneModel;
  private readonly id: string;
  private readonly newParent: string | null;
  private readonly newIndex: number;
  private readonly keepWorld: boolean;
  private oldParent: string | null = null;
  private oldIndex = -1;
  private oldTransform: Transform | null = null;

  constructor(scene: SceneModel, id: string, newParent: string | null, newIndex = -1, keepWorld = true) {
    this.scene = scene;
    this.id = id;
    this.newParent = newParent;
    this.newIndex = newIndex;
    this.keepWorld = keepWorld;
    this.label = newParent === null ? 'Unparent' : 'Parent';
  }

  /** Whether the move is allowed (no cycles, target exists). */
  static isValid(scene: SceneModel, id: string, newParent: string | null): boolean {
    if (!scene.has(id)) return false;
    if (newParent === null) return true;
    return newParent !== id && scene.has(newParent) && !scene.isAncestor(id, newParent);
  }

  execute(): void {
    const e = this.scene.get(this.id);
    if (!e) throw new Error('Entity not found');
    this.oldParent = e.parent;
    this.oldIndex = this.scene.indexOf(this.id);
    this.oldTransform = deepClone(e.transform);
    const world = this.scene.worldMatrix(this.id);
    if (!this.scene.setParent(this.id, this.newParent, this.newIndex)) {
      throw new Error('Invalid parent');
    }
    if (this.keepWorld) {
      const parentWorld = this.newParent ? this.scene.worldMatrix(this.newParent) : mat4.identity();
      const inv = mat4.invert(parentWorld);
      if (inv) {
        const local = mat4.decompose(mat4.multiply(inv, world));
        this.scene.setTransform(this.id, {
          position: roundVec(local.position),
          rotation: roundVec(quat.toEulerDeg(local.rotation)),
          scale: roundVec(local.scale),
        });
      }
    }
  }

  undo(): void {
    this.scene.setParent(this.id, this.oldParent, this.oldIndex);
    if (this.oldTransform) this.scene.setTransform(this.id, this.oldTransform);
  }
}

const roundVec = (v: [number, number, number]): [number, number, number] => [
  Math.round(v[0] * 1e5) / 1e5,
  Math.round(v[1] * 1e5) / 1e5,
  Math.round(v[2] * 1e5) / 1e5,
];

export class EnvironmentCommand implements Command {
  readonly label = 'Edit environment';
  private readonly scene: SceneModel;
  private readonly before: SceneEnvironment;
  private after: SceneEnvironment;
  private readonly mergeKey: string | null;

  constructor(scene: SceneModel, after: SceneEnvironment, mergeKey: string | null = null) {
    this.scene = scene;
    this.before = deepClone(scene.document.environment);
    this.after = deepClone(after);
    this.mergeKey = mergeKey;
  }

  execute(): void {
    this.scene.setEnvironment(this.after);
  }

  undo(): void {
    this.scene.setEnvironment(this.before);
  }

  merge(next: Command): boolean {
    if (!(next instanceof EnvironmentCommand) || this.mergeKey === null || next.mergeKey !== this.mergeKey) return false;
    this.after = deepClone(next.after);
    return true;
  }
}

export class HudCommand implements Command {
  readonly label = 'Edit game HUD';
  private readonly scene: SceneModel;
  private readonly before: SceneHud;
  private readonly after: SceneHud;

  constructor(scene: SceneModel, after: SceneHud) {
    this.scene = scene;
    this.before = deepClone(scene.document.hud);
    this.after = deepClone(after);
  }

  execute(): void {
    this.scene.setHud(this.after);
  }

  undo(): void {
    this.scene.setHud(this.before);
  }
}
