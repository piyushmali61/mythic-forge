import { log } from '../log/logger.ts';
import { mat4, type Mat4 } from '../math/mat4.ts';
import { quat, type Quat } from '../math/quat.ts';
import { DEG2RAD, clamp, damp, vec3, type Vec3 } from '../math/vec3.ts';
import type {
  BehaviourDef,
  CollectibleBehaviour,
  Components,
  FollowCameraBehaviour,
  PlayerControllerBehaviour,
  SceneDocument,
} from '../scene/types.ts';
import { deepClone } from '../util/json.ts';
import { Emitter } from '../util/emitter.ts';
import type { InputSource, InputState } from './input.ts';
import {
  DEFAULT_PHYSICS,
  aabbOverlap,
  stepBody,
  type Aabb,
  type Body,
  type PhysicsOptions,
  type StaticCollider,
} from './physics.ts';

export interface RuntimeEntity {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  /** Enabled flag of this entity alone. */
  enabled: boolean;
  isStatic: boolean;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  readonly start: { position: Vec3; rotation: Quat };
  components: Components;
  behaviours: { def: BehaviourDef; failed: boolean }[];
  body: Body | null;
  /** Controller/camera state. */
  yaw: number;
  pitch: number;
  collected: boolean;
}

export interface AudioSink {
  play(assetId: string, options: { volume: number; loop: boolean }): void;
  stopAll(): void;
}

export interface RuntimeEvents {
  score: { score: number; collected: number; total: number };
  won: { message: string };
  sound: { assetId: string };
  error: { entityId: string; message: string };
}

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
const KILL_Y = -60;

/**
 * Play-mode simulation. Works on a private copy of the scene, so stopping play restores the
 * editor state exactly. Contains no rendering code; the renderer reads transforms from it.
 * Behaviour errors are caught per behaviour: the faulty behaviour is disabled and reported,
 * the game keeps running.
 */
export class GameRuntime {
  readonly events = new Emitter<RuntimeEvents>();
  readonly entities = new Map<string, RuntimeEntity>();
  readonly scene: SceneDocument;
  /** Entities whose transform or visibility changed during the last `update`. */
  readonly changed = new Set<string>();
  score = 0;
  collectedCount = 0;
  readonly totalCollectibles: number;
  won = false;
  time = 0;
  private accumulator = 0;
  private staticColliders: StaticCollider[] = [];
  private readonly input: InputSource;
  private readonly audio: AudioSink | null;
  private readonly bobBase = new Map<string, number>();
  private readonly physics: PhysicsOptions;

  constructor(scene: SceneDocument, input: InputSource, audio: AudioSink | null = null) {
    this.scene = deepClone(scene);
    this.input = input;
    this.audio = audio;
    this.physics = { ...DEFAULT_PHYSICS, gravity: this.scene.environment.gravity };
    let collectibles = 0;
    for (const e of Object.values(this.scene.entities)) {
      const rotation = quat.fromEulerDeg(e.transform.rotation);
      const behaviours = (e.components.behaviours ?? []).map((def) => ({ def, failed: false }));
      if (behaviours.some((b) => b.def.type === 'collectible')) collectibles++;
      this.entities.set(e.id, {
        id: e.id,
        name: e.name,
        parent: e.parent,
        children: e.children,
        enabled: e.enabled,
        isStatic: e.isStatic,
        position: vec3.clone(e.transform.position),
        rotation,
        scale: vec3.clone(e.transform.scale),
        start: { position: vec3.clone(e.transform.position), rotation },
        components: e.components,
        behaviours,
        body: null,
        yaw: 0,
        pitch: 0,
        collected: false,
      });
    }
    this.totalCollectibles = collectibles;
  }

  start(): void {
    for (const e of this.entities.values()) {
      const rb = e.components.rigidBody;
      const col = e.components.collider;
      if (rb && col && !rb.isKinematic && !col.isTrigger) {
        if (e.parent !== null) {
          log.warn('Runtime', `"${e.name}" has a Rigid Body but is not at the scene root; it will not be simulated.`);
        } else {
          const half: Vec3 = [
            Math.abs(col.size[0] * e.scale[0]) / 2,
            Math.abs(col.size[1] * e.scale[1]) / 2,
            Math.abs(col.size[2] * e.scale[2]) / 2,
          ];
          e.body = {
            center: vec3.add(e.position, vec3.mul(col.center, e.scale)),
            half,
            velocity: [0, 0, 0],
            grounded: false,
            useGravity: rb.useGravity,
          };
        }
      }
      const pc = e.behaviours.find((b) => b.def.type === 'playerController');
      if (pc) {
        const euler = quat.toEulerDeg(e.rotation);
        e.yaw = euler[1] * DEG2RAD;
      }
      for (const b of e.behaviours) {
        if (b.def.type === 'bob') this.bobBase.set(e.id, e.position[1]);
      }
      const src = e.components.audioSource;
      if (src && src.playOnStart && this.isActive(e.id)) {
        this.audio?.play(src.assetId, { volume: src.volume, loop: src.loop });
      }
    }
    // Initialise follow cameras relative to their targets.
    for (const e of this.entities.values()) {
      for (const b of e.behaviours) {
        if (b.def.type === 'followCamera') {
          const target = b.def.targetId ? this.entities.get(b.def.targetId) : undefined;
          if (target) {
            const d = vec3.sub(e.position, target.position);
            e.yaw = Math.atan2(d[0], d[2]);
          }
        }
      }
    }
    this.rebuildStaticColliders();
    this.emitScore();
  }

  stop(): void {
    this.audio?.stopAll();
    this.events.clear();
  }

  isActive(id: string): boolean {
    let e = this.entities.get(id);
    while (e) {
      if (!e.enabled || e.collected) return false;
      e = e.parent ? this.entities.get(e.parent) : undefined;
    }
    return true;
  }

  /** Advances the simulation by real elapsed time using fixed sub-steps. */
  update(dt: number): void {
    this.changed.clear();
    this.accumulator += Math.min(dt, 0.25);
    const input = this.input.read();
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      // Look deltas apply once per rendered frame, not per sub-step.
      this.fixedStep(steps === 0 ? input : { ...input, lookX: 0, lookY: 0, jump: input.jump });
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0;
  }

  private fixedStep(input: InputState): void {
    const dt = FIXED_DT;
    this.time += dt;
    // Kinematic/animated movers first, then players, then cameras (which follow players).
    for (const phase of ['movers', 'players', 'cameras'] as const) {
      for (const e of this.entities.values()) {
        if (!this.isActive(e.id)) continue;
        for (const b of e.behaviours) {
          if (b.failed) continue;
          const t = b.def.type;
          const inPhase =
            phase === 'movers'
              ? t === 'rotate' || t === 'bob'
              : phase === 'players'
                ? t === 'playerController'
                : t === 'followCamera';
          if (!inPhase) continue;
          try {
            this.runBehaviour(e, b.def, input, dt);
          } catch (error) {
            b.failed = true;
            const message = error instanceof Error ? error.message : String(error);
            log.error('Runtime', `Behaviour "${t}" on "${e.name}" stopped after an error.`, message);
            this.events.emit('error', { entityId: e.id, message });
          }
        }
      }
      if (phase === 'movers') this.refreshDynamicColliders();
    }
    this.checkCollectibles();
  }

  private runBehaviour(e: RuntimeEntity, def: BehaviourDef, input: InputState, dt: number): void {
    switch (def.type) {
      case 'rotate': {
        const axis: Vec3 = def.axis === 'x' ? [1, 0, 0] : def.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
        e.rotation = quat.normalize(quat.multiply(e.rotation, quat.fromAxisAngle(axis, def.speed * DEG2RAD * dt)));
        this.changed.add(e.id);
        break;
      }
      case 'bob': {
        const base = this.bobBase.get(e.id) ?? e.position[1];
        e.position[1] = base + Math.sin(this.time * Math.PI * 2 * def.frequency) * def.amplitude;
        this.changed.add(e.id);
        break;
      }
      case 'playerController':
        this.updatePlayer(e, def, input, dt);
        break;
      case 'followCamera':
        this.updateFollowCamera(e, def, input, dt);
        break;
      case 'collectible':
        break;
    }
  }

  private mainCameraYaw(): number {
    for (const e of this.entities.values()) {
      if (e.components.camera?.isMain && e.behaviours.some((b) => b.def.type === 'followCamera')) return e.yaw;
    }
    return 0;
  }

  private updatePlayer(e: RuntimeEntity, def: PlayerControllerBehaviour, input: InputState, dt: number): void {
    let move: Vec3 = [0, 0, 0];
    const mx = clamp(input.moveX, -1, 1);
    const my = clamp(input.moveY, -1, 1);

    if (def.mode === 'platformer') {
      move = [mx * def.moveSpeed * dt, 0, 0];
      if (mx !== 0) e.yaw = mx > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (def.mode === 'first-person') {
      e.yaw -= input.lookX * def.lookSensitivity * DEG2RAD;
      e.pitch = clamp(e.pitch - input.lookY * def.lookSensitivity * DEG2RAD, -80 * DEG2RAD, 80 * DEG2RAD);
      const s = Math.sin(e.yaw);
      const c = Math.cos(e.yaw);
      const forward: Vec3 = [-s, 0, -c];
      const right: Vec3 = [c, 0, -s];
      move = vec3.scale(vec3.add(vec3.scale(right, mx), vec3.scale(forward, my)), def.moveSpeed * dt);
      // Pitch the first child camera.
      for (const childId of e.children) {
        const child = this.entities.get(childId);
        if (child?.components.camera) {
          child.rotation = quat.fromAxisAngle([1, 0, 0], e.pitch);
          this.changed.add(child.id);
          break;
        }
      }
    } else {
      const camYaw = this.mainCameraYaw();
      const s = Math.sin(camYaw);
      const c = Math.cos(camYaw);
      const forward: Vec3 = [-s, 0, -c];
      const right: Vec3 = [c, 0, -s];
      let dir = vec3.add(vec3.scale(right, mx), vec3.scale(forward, my));
      const len = vec3.length(dir);
      if (len > 1) dir = vec3.scale(dir, 1 / len);
      move = vec3.scale(dir, def.moveSpeed * dt);
      if (len > 0.05) {
        const targetYaw = Math.atan2(dir[0], dir[2]);
        let delta = targetYaw - e.yaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        e.yaw += delta * damp(12, dt);
      }
    }

    if (e.body) {
      if (input.jump && e.body.grounded && def.jumpSpeed > 0) {
        e.body.velocity[1] = def.jumpSpeed;
        e.body.grounded = false;
      }
      stepBody(e.body, move, this.staticColliders, dt, this.physics);
      const col = e.components.collider!;
      e.position = vec3.sub(e.body.center, vec3.mul(col.center, e.scale));
      if (e.position[1] < KILL_Y) this.respawn(e);
    } else {
      e.position = vec3.add(e.position, move);
    }
    e.rotation = quat.fromYaw(e.yaw);
    this.changed.add(e.id);
  }

  private respawn(e: RuntimeEntity): void {
    e.position = vec3.clone(e.start.position);
    if (e.body) {
      const col = e.components.collider!;
      e.body.center = vec3.add(e.position, vec3.mul(col.center, e.scale));
      e.body.velocity = [0, 0, 0];
    }
    log.info('Runtime', `"${e.name}" fell out of the world and was respawned.`);
  }

  private updateFollowCamera(e: RuntimeEntity, def: FollowCameraBehaviour, input: InputState, dt: number): void {
    if (e.parent !== null) return;
    const target = def.targetId ? this.entities.get(def.targetId) : undefined;
    if (!target) return;
    const platformer = target.behaviours.some((b) => b.def.type === 'playerController' && b.def.mode === 'platformer');
    if (!platformer) {
      e.yaw -= input.lookX * 0.3 * DEG2RAD;
      e.pitch = clamp(e.pitch - input.lookY * 0.2 * DEG2RAD, -0.6, 0.9);
    }
    const heightBoost = def.distance * Math.sin(e.pitch);
    const desired: Vec3 = [
      target.position[0] + Math.sin(e.yaw) * def.distance,
      target.position[1] + def.height + heightBoost,
      target.position[2] + Math.cos(e.yaw) * def.distance,
    ];
    e.position = vec3.lerp(e.position, desired, damp(def.smoothing, dt));
    const lookAt: Vec3 = [target.position[0], target.position[1] + 0.8, target.position[2]];
    e.rotation = quat.lookRotation(vec3.sub(lookAt, e.position));
    this.changed.add(e.id);
  }

  private checkCollectibles(): void {
    const players = [...this.entities.values()].filter(
      (e) => e.body !== null && e.behaviours.some((b) => b.def.type === 'playerController') && this.isActive(e.id),
    );
    if (players.length === 0) return;
    for (const e of this.entities.values()) {
      const col = e.behaviours.find((b) => b.def.type === 'collectible');
      if (!col || e.collected || !this.isActive(e.id)) continue;
      const box = this.worldBox(e, 1.0);
      for (const p of players) {
        const pb: Aabb = {
          min: vec3.sub(p.body!.center, p.body!.half),
          max: vec3.add(p.body!.center, p.body!.half),
        };
        if (aabbOverlap(pb, box)) {
          this.collect(e, col.def as CollectibleBehaviour);
          break;
        }
      }
    }
  }

  private collect(e: RuntimeEntity, def: CollectibleBehaviour): void {
    e.collected = true;
    this.markSubtreeChanged(e.id);
    this.score += def.scoreValue;
    this.collectedCount++;
    if (def.soundAssetId) {
      this.audio?.play(def.soundAssetId, { volume: 1, loop: false });
      this.events.emit('sound', { assetId: def.soundAssetId });
    }
    this.emitScore();
    if (this.collectedCount === this.totalCollectibles && !this.won) {
      this.won = true;
      if (this.scene.hud.winMessage) this.events.emit('won', { message: this.scene.hud.winMessage });
    }
  }

  private markSubtreeChanged(id: string): void {
    this.changed.add(id);
    for (const c of this.entities.get(id)?.children ?? []) this.markSubtreeChanged(c);
  }

  private emitScore(): void {
    this.events.emit('score', { score: this.score, collected: this.collectedCount, total: this.totalCollectibles });
  }

  // ---- transforms & colliders ----------------------------------------------------------------

  worldMatrix(id: string): Mat4 {
    const e = this.entities.get(id);
    if (!e) return mat4.identity();
    const local = mat4.compose(e.position, e.rotation, e.scale);
    return e.parent ? mat4.multiply(this.worldMatrix(e.parent), local) : local;
  }

  /** World AABB of an entity's collider (or a unit box if it has none, scaled by `fallback`). */
  private worldBox(e: RuntimeEntity, fallback: number): Aabb {
    const col = e.components.collider;
    const center: Vec3 = col ? col.center : [0, fallback / 2, 0];
    const half: Vec3 = col ? [col.size[0] / 2, col.size[1] / 2, col.size[2] / 2] : [fallback / 2, fallback / 2, fallback / 2];
    return mat4.transformBox(this.worldMatrix(e.id), center, half);
  }

  private rebuildStaticColliders(): void {
    this.staticColliders = [];
    for (const e of this.entities.values()) {
      const col = e.components.collider;
      if (!col || col.isTrigger || e.body || !this.isActive(e.id)) continue;
      if (e.behaviours.some((b) => b.def.type === 'collectible')) continue;
      this.staticColliders.push({ id: e.id, box: this.worldBox(e, 1) });
    }
  }

  /** Moving (non-static) colliders are refreshed each step; static ones are computed once. */
  private refreshDynamicColliders(): void {
    for (const c of this.staticColliders) {
      const e = this.entities.get(c.id)!;
      if (!e.isStatic && this.hasMovingAncestorOrSelf(e)) c.box = this.worldBox(e, 1);
    }
  }

  private hasMovingAncestorOrSelf(e: RuntimeEntity): boolean {
    let cur: RuntimeEntity | undefined = e;
    while (cur) {
      if (cur.behaviours.some((b) => b.def.type === 'rotate' || b.def.type === 'bob')) return true;
      cur = cur.parent ? this.entities.get(cur.parent) : undefined;
    }
    return false;
  }
}
