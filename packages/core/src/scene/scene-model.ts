import { mat4, type Mat4 } from '../math/mat4.ts';
import { quat } from '../math/quat.ts';
import { Emitter } from '../util/emitter.ts';
import { createId } from '../util/ids.ts';
import { deepClone } from '../util/json.ts';
import type { Components, Entity, SceneDocument, SceneEnvironment, SceneHud, Transform } from './types.ts';

export type EntityFlag = 'enabled' | 'visible' | 'locked' | 'isStatic';

export type SceneChange =
  | { type: 'added'; ids: string[] }
  | { type: 'removed'; ids: string[] }
  | { type: 'transform'; id: string }
  | { type: 'components'; id: string }
  | { type: 'meta'; id: string }
  | { type: 'reparented'; id: string }
  | { type: 'environment' }
  | { type: 'reset' };

/** A detached copy of an entity and all its descendants (used by delete/undo, duplicate, prefabs). */
export interface EntitySubtree {
  rootId: string;
  parent: string | null;
  index: number;
  /** Root first, then descendants. Children arrays refer to ids within the subtree. */
  entities: Entity[];
}

interface SceneEvents {
  change: SceneChange;
}

/**
 * The editable scene. All mutations go through here so the renderer, hierarchy panel and
 * dirty-tracking stay in sync through a single event stream.
 */
export class SceneModel {
  readonly events = new Emitter<SceneEvents>();
  private doc: SceneDocument;
  /** Increments on every mutation. Compare against a saved revision to know if there are unsaved changes. */
  revision = 0;

  constructor(doc: SceneDocument) {
    this.doc = doc;
  }

  get document(): Readonly<SceneDocument> {
    return this.doc;
  }

  get id(): string {
    return this.doc.id;
  }

  get entityCount(): number {
    return Object.keys(this.doc.entities).length;
  }

  get(id: string): Readonly<Entity> | undefined {
    return this.doc.entities[id];
  }

  has(id: string): boolean {
    return id in this.doc.entities;
  }

  childrenOf(id: string | null): readonly string[] {
    if (id === null) return this.doc.rootIds;
    return this.doc.entities[id]?.children ?? [];
  }

  all(): Readonly<Entity>[] {
    return Object.values(this.doc.entities);
  }

  /** Depth-first order, matching the hierarchy panel. */
  ordered(): Readonly<Entity>[] {
    const out: Entity[] = [];
    const visit = (ids: readonly string[]): void => {
      for (const id of ids) {
        const e = this.doc.entities[id];
        if (!e) continue;
        out.push(e);
        visit(e.children);
      }
    };
    visit(this.doc.rootIds);
    return out;
  }

  indexOf(id: string): number {
    const e = this.doc.entities[id];
    if (!e) return -1;
    return this.childrenOf(e.parent).indexOf(id);
  }

  isAncestor(ancestorId: string, id: string): boolean {
    let p = this.doc.entities[id]?.parent ?? null;
    while (p !== null) {
      if (p === ancestorId) return true;
      p = this.doc.entities[p]?.parent ?? null;
    }
    return false;
  }

  /** True if the entity and all its ancestors are enabled. */
  isActiveInHierarchy(id: string): boolean {
    let e = this.doc.entities[id];
    while (e) {
      if (!e.enabled) return false;
      e = e.parent ? this.doc.entities[e.parent] : undefined;
    }
    return true;
  }

  worldMatrix(id: string): Mat4 {
    const chain: Entity[] = [];
    let e = this.doc.entities[id];
    while (e) {
      chain.unshift(e);
      e = e.parent ? this.doc.entities[e.parent] : undefined;
    }
    let m = mat4.identity();
    for (const node of chain) {
      const t = node.transform;
      m = mat4.multiply(m, mat4.compose(t.position, quat.fromEulerDeg(t.rotation), t.scale));
    }
    return m;
  }

  // ---- mutations -------------------------------------------------------------------------

  /** Inserts a new single entity (its `children` must be empty). */
  addEntity(entity: Entity, parentId: string | null = null, index?: number): void {
    if (this.has(entity.id)) throw new Error(`Entity ${entity.id} already exists`);
    if (entity.children.length > 0) throw new Error('Use insertSubtree for entities with children');
    this.insertSubtree({ rootId: entity.id, parent: parentId, index: index ?? -1, entities: [entity] });
  }

  insertSubtree(subtree: EntitySubtree): void {
    const { rootId, parent } = subtree;
    if (parent !== null && !this.has(parent)) throw new Error(`Parent ${parent} not found`);
    for (const e of subtree.entities) {
      if (this.has(e.id)) throw new Error(`Entity ${e.id} already exists`);
    }
    for (const e of subtree.entities) {
      const copy = deepClone(e);
      if (copy.id === rootId) copy.parent = parent;
      this.doc.entities[copy.id] = copy;
    }
    const siblings = parent === null ? this.doc.rootIds : this.doc.entities[parent]!.children;
    const at = subtree.index < 0 || subtree.index > siblings.length ? siblings.length : subtree.index;
    siblings.splice(at, 0, rootId);
    this.changed({ type: 'added', ids: subtree.entities.map((e) => e.id) });
  }

  /** Captures an entity and its descendants without modifying the scene. */
  snapshot(id: string): EntitySubtree {
    const root = this.doc.entities[id];
    if (!root) throw new Error(`Entity ${id} not found`);
    const entities: Entity[] = [];
    const visit = (eid: string): void => {
      const e = this.doc.entities[eid];
      if (!e) return;
      entities.push(deepClone(e));
      e.children.forEach(visit);
    };
    visit(id);
    return { rootId: id, parent: root.parent, index: this.indexOf(id), entities };
  }

  removeEntity(id: string): EntitySubtree {
    const snap = this.snapshot(id);
    const siblings = snap.parent === null ? this.doc.rootIds : this.doc.entities[snap.parent]!.children;
    siblings.splice(siblings.indexOf(id), 1);
    for (const e of snap.entities) delete this.doc.entities[e.id];
    this.changed({ type: 'removed', ids: snap.entities.map((e) => e.id) });
    return snap;
  }

  setTransform(id: string, transform: Transform): void {
    const e = this.require(id);
    e.transform = deepClone(transform);
    this.changed({ type: 'transform', id });
  }

  setName(id: string, name: string): void {
    const e = this.require(id);
    e.name = name.trim().slice(0, 120) || 'Object';
    this.changed({ type: 'meta', id });
  }

  setFlag(id: string, flag: EntityFlag, value: boolean): void {
    const e = this.require(id);
    e[flag] = value;
    this.changed({ type: 'meta', id });
  }

  setComponent<K extends keyof Components>(id: string, key: K, value: Components[K] | undefined): void {
    const e = this.require(id);
    if (value === undefined) delete e.components[key];
    else e.components[key] = deepClone(value);
    this.changed({ type: 'components', id });
  }

  /** Moves an entity under a new parent. Refuses to create cycles. Preserves world placement only if asked by the caller. */
  setParent(id: string, parentId: string | null, index = -1): boolean {
    const e = this.require(id);
    if (parentId === id || (parentId !== null && (!this.has(parentId) || this.isAncestor(id, parentId)))) {
      return false;
    }
    const oldSiblings = e.parent === null ? this.doc.rootIds : this.doc.entities[e.parent]!.children;
    oldSiblings.splice(oldSiblings.indexOf(id), 1);
    const newSiblings = parentId === null ? this.doc.rootIds : this.doc.entities[parentId]!.children;
    const at = index < 0 || index > newSiblings.length ? newSiblings.length : index;
    newSiblings.splice(at, 0, id);
    e.parent = parentId;
    this.changed({ type: 'reparented', id });
    return true;
  }

  setEnvironment(environment: SceneEnvironment): void {
    this.doc.environment = deepClone(environment);
    this.changed({ type: 'environment' });
  }

  setHud(hud: SceneHud): void {
    this.doc.hud = deepClone(hud);
    this.changed({ type: 'environment' });
  }

  setSceneName(name: string): void {
    this.doc.name = name.trim().slice(0, 120) || 'Main';
    this.changed({ type: 'environment' });
  }

  /**
   * Creates a copy of a subtree with fresh ids (not inserted). References between entities
   * inside the subtree (e.g. a follow camera's target) are remapped to the copies.
   */
  cloneSubtree(id: string, nameSuffix = ' (copy)'): EntitySubtree {
    const snap = this.snapshot(id);
    return remapSubtree(snap, nameSuffix);
  }

  replaceDocument(doc: SceneDocument): void {
    this.doc = doc;
    this.changed({ type: 'reset' });
  }

  toJSON(): SceneDocument {
    return deepClone(this.doc);
  }

  private require(id: string): Entity {
    const e = this.doc.entities[id];
    if (!e) throw new Error(`Entity ${id} not found`);
    return e;
  }

  private changed(change: SceneChange): void {
    this.revision++;
    this.events.emit('change', change);
  }
}

export function remapSubtree(snap: EntitySubtree, nameSuffix = ''): EntitySubtree {
  const idMap = new Map<string, string>();
  for (const e of snap.entities) idMap.set(e.id, createId('e'));
  const entities = snap.entities.map((e) => {
    const copy = deepClone(e);
    copy.id = idMap.get(e.id)!;
    copy.children = e.children.map((c) => idMap.get(c)!).filter(Boolean);
    if (e.id === snap.rootId) {
      copy.name = `${e.name}${nameSuffix}`.slice(0, 120);
    } else {
      copy.parent = e.parent ? (idMap.get(e.parent) ?? null) : null;
    }
    for (const b of copy.components.behaviours ?? []) {
      if (b.type === 'followCamera' && b.targetId && idMap.has(b.targetId)) b.targetId = idMap.get(b.targetId)!;
    }
    return copy;
  });
  return { rootId: idMap.get(snap.rootId)!, parent: snap.parent, index: snap.index + 1, entities };
}
