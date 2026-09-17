import { isValidId } from '../util/ids.ts';
import { isRecord } from '../util/json.ts';
import { Reader, type ValidationResult } from '../validate/reader.ts';
import { SCENE_FORMAT_VERSION } from '../version.ts';
import {
  defaultCamera,
  defaultEnvironment,
  defaultHud,
  defaultLight,
  defaultMaterial,
} from './defaults.ts';
import {
  LIGHT_TYPES,
  PRIMITIVE_TYPES,
  type BehaviourDef,
  type Components,
  type Entity,
  type SceneDocument,
} from './types.ts';

export interface SceneValidationOptions {
  maxEntities: number;
  maxStringLength: number;
}

const DEFAULT_OPTIONS: SceneValidationOptions = { maxEntities: 100_000, maxStringLength: 2000 };

/**
 * Validates and normalises an untrusted scene document.
 * Unknown fields are dropped; invalid values fall back to defaults (warnings);
 * structural problems (bad ids, broken hierarchy) are repaired where safe or rejected.
 */
export function validateScene(input: unknown, options: Partial<SceneValidationOptions> = {}): ValidationResult<SceneDocument> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const r = new Reader(opts.maxStringLength);
  if (!isRecord(input)) return { ok: false, errors: ['Scene is not a JSON object'], warnings: [] };
  if (input.format !== 'mythic-forge-scene') {
    return { ok: false, errors: ['Not a Mythic Forge scene file'], warnings: [] };
  }
  const formatVersion = input.formatVersion;
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return { ok: false, errors: ['Scene formatVersion is missing or invalid'], warnings: [] };
  }
  if (formatVersion > SCENE_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [`Scene was saved by a newer Mythic Forge (format ${formatVersion}); this version supports ${SCENE_FORMAT_VERSION}.`],
      warnings: [],
    };
  }
  if (!isValidId(input.id)) r.fail('id', 'invalid scene id');

  const env = r.obj(input.environment, 'environment');
  const de = defaultEnvironment();
  const environment = {
    background: r.color(env.background, 'environment.background', de.background),
    ambientColor: r.color(env.ambientColor, 'environment.ambientColor', de.ambientColor),
    ambientIntensity: r.num(env.ambientIntensity, 'environment.ambientIntensity', de.ambientIntensity, 0, 10),
    fogEnabled: r.bool(env.fogEnabled, 'environment.fogEnabled', de.fogEnabled),
    fogColor: r.color(env.fogColor, 'environment.fogColor', de.fogColor),
    fogNear: r.num(env.fogNear, 'environment.fogNear', de.fogNear, 0, 1e5),
    fogFar: r.num(env.fogFar, 'environment.fogFar', de.fogFar, 0, 1e5),
    gravity: r.num(env.gravity, 'environment.gravity', de.gravity, -100, 100),
  };
  const hudIn = r.obj(input.hud, 'hud');
  const dh = defaultHud();
  const hud = {
    title: r.str(hudIn.title, 'hud.title', dh.title, 120),
    showScore: r.bool(hudIn.showScore, 'hud.showScore', dh.showScore),
    winMessage: r.str(hudIn.winMessage, 'hud.winMessage', dh.winMessage, 200),
  };

  const rawEntities = r.obj(input.entities, 'entities');
  const keys = Object.keys(rawEntities);
  if (keys.length > opts.maxEntities) {
    return { ok: false, errors: [`Scene has ${keys.length} objects; the limit is ${opts.maxEntities}.`], warnings: r.warnings };
  }

  const entities: Record<string, Entity> = {};
  for (const key of keys) {
    const e = readEntity(r, rawEntities[key], `entities.${key}`, key);
    if (e) entities[e.id] = e;
  }

  // Rebuild the hierarchy from parent pointers; keep stored child order where it is consistent.
  // Positions are precomputed into maps so ordering stays O(n log n) for very large scenes.
  const toPositions = (list: unknown[]): Map<string, number> => {
    const m = new Map<string, number>();
    list.forEach((c, i) => {
      if (typeof c === 'string' && !m.has(c)) m.set(c, i);
    });
    return m;
  };
  const storedChildren = new Map<string, Map<string, number>>();
  for (const key of keys) {
    const raw = rawEntities[key];
    if (isRecord(raw) && Array.isArray(raw.children) && raw.children.length > 0) {
      storedChildren.set(key, toPositions(raw.children));
    }
  }
  for (const e of Object.values(entities)) {
    if (e.parent !== null && !entities[e.parent]) {
      r.warn(`entities.${e.id}.parent`, 'parent not found; moved to scene root');
      e.parent = null;
    }
  }
  // Break cycles.
  for (const e of Object.values(entities)) {
    const seen = new Set<string>([e.id]);
    let p = e.parent;
    while (p !== null) {
      if (seen.has(p)) {
        r.warn(`entities.${e.id}.parent`, 'hierarchy cycle; moved to scene root');
        e.parent = null;
        break;
      }
      seen.add(p);
      p = entities[p]?.parent ?? null;
    }
  }
  const orderIndex = (positions: Map<string, number> | undefined, id: string): number =>
    positions?.get(id) ?? Number.MAX_SAFE_INTEGER;
  for (const e of Object.values(entities)) e.children = [];
  for (const e of Object.values(entities)) {
    if (e.parent !== null) entities[e.parent]!.children.push(e.id);
  }
  for (const e of Object.values(entities)) {
    if (e.children.length < 2) continue;
    const stored = storedChildren.get(e.id);
    e.children.sort((a, b) => orderIndex(stored, a) - orderIndex(stored, b));
  }
  const storedRoots = toPositions(Array.isArray(input.rootIds) ? input.rootIds : []);
  const rootIds = Object.values(entities)
    .filter((e) => e.parent === null)
    .map((e) => e.id)
    .sort((a, b) => orderIndex(storedRoots, a) - orderIndex(storedRoots, b));

  if (r.errors.length > 0) return { ok: false, errors: r.errors, warnings: r.warnings };

  return {
    ok: true,
    warnings: r.warnings,
    value: {
      format: 'mythic-forge-scene',
      formatVersion: SCENE_FORMAT_VERSION,
      id: input.id as string,
      name: r.str(input.name, 'name', 'Main', 120) || 'Main',
      environment,
      hud,
      rootIds,
      entities,
    },
  };
}

function readEntity(r: Reader, raw: unknown, path: string, key: string): Entity | null {
  if (!isRecord(raw)) {
    r.warn(path, 'ignored: not an object');
    return null;
  }
  if (!isValidId(raw.id) || raw.id !== key) {
    r.warn(path, 'ignored: id is invalid or does not match its key');
    return null;
  }
  const t = r.obj(raw.transform, `${path}.transform`);
  const parent = raw.parent === null || raw.parent === undefined ? null : isValidId(raw.parent) ? raw.parent : null;
  return {
    id: raw.id,
    name: r.str(raw.name, `${path}.name`, 'Object', 120) || 'Object',
    parent,
    children: [],
    enabled: r.bool(raw.enabled, `${path}.enabled`, true),
    visible: r.bool(raw.visible, `${path}.visible`, true),
    locked: r.bool(raw.locked, `${path}.locked`, false),
    isStatic: r.bool(raw.isStatic, `${path}.isStatic`, false),
    transform: {
      position: r.vec3(t.position, `${path}.transform.position`, [0, 0, 0]),
      rotation: r.vec3(t.rotation, `${path}.transform.rotation`, [0, 0, 0], -36000, 36000),
      scale: r.vec3(t.scale, `${path}.transform.scale`, [1, 1, 1], -1e4, 1e4),
    },
    components: readComponents(r, r.obj(raw.components, `${path}.components`), `${path}.components`),
  };
}

function readComponents(r: Reader, c: Record<string, unknown>, path: string): Components {
  const out: Components = {};
  if (isRecord(c.mesh)) {
    out.mesh = {
      primitive: r.oneOf(c.mesh.primitive, `${path}.mesh.primitive`, PRIMITIVE_TYPES, 'cube'),
      castShadow: r.bool(c.mesh.castShadow, `${path}.mesh.castShadow`, true),
      receiveShadow: r.bool(c.mesh.receiveShadow, `${path}.mesh.receiveShadow`, true),
    };
  }
  if (isRecord(c.model)) {
    if (isValidId(c.model.assetId)) {
      out.model = {
        assetId: c.model.assetId,
        castShadow: r.bool(c.model.castShadow, `${path}.model.castShadow`, true),
        receiveShadow: r.bool(c.model.receiveShadow, `${path}.model.receiveShadow`, true),
      };
    } else {
      r.warn(`${path}.model`, 'ignored: invalid asset id');
    }
  }
  if (isRecord(c.material)) {
    const m = c.material;
    const d = defaultMaterial();
    const p = `${path}.material`;
    const repeat = Array.isArray(m.textureRepeat) ? m.textureRepeat : [];
    out.material = {
      presetId: r.nullableStr(m.presetId, `${p}.presetId`, 64),
      color: r.color(m.color, `${p}.color`, d.color),
      metalness: r.num(m.metalness, `${p}.metalness`, d.metalness, 0, 1),
      roughness: r.num(m.roughness, `${p}.roughness`, d.roughness, 0, 1),
      emissive: r.color(m.emissive, `${p}.emissive`, d.emissive),
      emissiveIntensity: r.num(m.emissiveIntensity, `${p}.emissiveIntensity`, d.emissiveIntensity, 0, 100),
      opacity: r.num(m.opacity, `${p}.opacity`, d.opacity, 0, 1),
      textureAssetId: isValidId(m.textureAssetId) ? m.textureAssetId : null,
      textureRepeat: [
        r.num(repeat[0], `${p}.textureRepeat[0]`, 1, 0.01, 1000),
        r.num(repeat[1], `${p}.textureRepeat[1]`, 1, 0.01, 1000),
      ],
      doubleSided: r.bool(m.doubleSided, `${p}.doubleSided`, d.doubleSided),
      flatShading: r.bool(m.flatShading, `${p}.flatShading`, d.flatShading),
    };
  }
  if (isRecord(c.light)) {
    const l = c.light;
    const type = r.oneOf(l.type, `${path}.light.type`, LIGHT_TYPES, 'point');
    const d = defaultLight(type);
    out.light = {
      type,
      color: r.color(l.color, `${path}.light.color`, d.color),
      intensity: r.num(l.intensity, `${path}.light.intensity`, d.intensity, 0, 10_000),
      range: r.num(l.range, `${path}.light.range`, d.range, 0, 10_000),
      angle: r.num(l.angle, `${path}.light.angle`, d.angle, 1, 89),
      castShadow: r.bool(l.castShadow, `${path}.light.castShadow`, d.castShadow),
      groundColor: r.color(l.groundColor, `${path}.light.groundColor`, d.groundColor),
    };
  }
  if (isRecord(c.camera)) {
    const k = c.camera;
    const d = defaultCamera();
    const near = r.num(k.near, `${path}.camera.near`, d.near, 0.001, 1000);
    out.camera = {
      projection: r.oneOf(k.projection, `${path}.camera.projection`, ['perspective', 'orthographic'] as const, d.projection),
      fov: r.num(k.fov, `${path}.camera.fov`, d.fov, 5, 170),
      orthoSize: r.num(k.orthoSize, `${path}.camera.orthoSize`, d.orthoSize, 0.01, 10_000),
      near,
      far: r.num(k.far, `${path}.camera.far`, d.far, near + 0.001, 1e6),
      isMain: r.bool(k.isMain, `${path}.camera.isMain`, d.isMain),
    };
  }
  if (isRecord(c.collider)) {
    const k = c.collider;
    out.collider = {
      shape: 'box',
      center: r.vec3(k.center, `${path}.collider.center`, [0, 0, 0]),
      size: r.vec3(k.size, `${path}.collider.size`, [1, 1, 1], 0, 1e5),
      isTrigger: r.bool(k.isTrigger, `${path}.collider.isTrigger`, false),
    };
  }
  if (isRecord(c.rigidBody)) {
    const k = c.rigidBody;
    out.rigidBody = {
      mass: r.num(k.mass, `${path}.rigidBody.mass`, 1, 0.001, 1e6),
      useGravity: r.bool(k.useGravity, `${path}.rigidBody.useGravity`, true),
      isKinematic: r.bool(k.isKinematic, `${path}.rigidBody.isKinematic`, false),
    };
  }
  if (isRecord(c.audioSource)) {
    const k = c.audioSource;
    if (isValidId(k.assetId)) {
      out.audioSource = {
        assetId: k.assetId,
        volume: r.num(k.volume, `${path}.audioSource.volume`, 1, 0, 1),
        loop: r.bool(k.loop, `${path}.audioSource.loop`, false),
        playOnStart: r.bool(k.playOnStart, `${path}.audioSource.playOnStart`, true),
      };
    }
  }
  if (isRecord(c.animator)) {
    const k = c.animator;
    out.animator = {
      clip: r.str(k.clip, `${path}.animator.clip`, '', 128),
      moveClip: r.str(k.moveClip, `${path}.animator.moveClip`, '', 128),
      speed: r.num(k.speed, `${path}.animator.speed`, 1, 0, 10),
      loop: r.bool(k.loop, `${path}.animator.loop`, true),
      playOnStart: r.bool(k.playOnStart, `${path}.animator.playOnStart`, true),
    };
  }
  if (Array.isArray(c.behaviours)) {
    const list: BehaviourDef[] = [];
    c.behaviours.slice(0, 16).forEach((b, i) => {
      const def = readBehaviour(r, b, `${path}.behaviours[${i}]`);
      if (def) list.push(def);
    });
    if (list.length > 0) out.behaviours = list;
  }
  return out;
}

function readBehaviour(r: Reader, b: unknown, path: string): BehaviourDef | null {
  if (!isRecord(b)) return null;
  switch (b.type) {
    case 'rotate':
      return {
        type: 'rotate',
        axis: r.oneOf(b.axis, `${path}.axis`, ['x', 'y', 'z'] as const, 'y'),
        speed: r.num(b.speed, `${path}.speed`, 45, -3600, 3600),
      };
    case 'bob':
      return {
        type: 'bob',
        amplitude: r.num(b.amplitude, `${path}.amplitude`, 0.25, 0, 100),
        frequency: r.num(b.frequency, `${path}.frequency`, 0.5, 0, 20),
      };
    case 'playerController':
      return {
        type: 'playerController',
        mode: r.oneOf(b.mode, `${path}.mode`, ['third-person', 'first-person', 'platformer'] as const, 'third-person'),
        moveSpeed: r.num(b.moveSpeed, `${path}.moveSpeed`, 4.5, 0, 100),
        jumpSpeed: r.num(b.jumpSpeed, `${path}.jumpSpeed`, 5.5, 0, 100),
        lookSensitivity: r.num(b.lookSensitivity, `${path}.lookSensitivity`, 0.25, 0.01, 5),
      };
    case 'followCamera':
      return {
        type: 'followCamera',
        targetId: isValidId(b.targetId) ? b.targetId : null,
        distance: r.num(b.distance, `${path}.distance`, 6, 0, 1000),
        height: r.num(b.height, `${path}.height`, 3, -1000, 1000),
        smoothing: r.num(b.smoothing, `${path}.smoothing`, 8, 0.1, 100),
      };
    case 'collectible':
      return {
        type: 'collectible',
        scoreValue: r.int(b.scoreValue, `${path}.scoreValue`, 1, -1e6, 1e6),
        soundAssetId: isValidId(b.soundAssetId) ? b.soundAssetId : null,
      };
    default:
      r.warn(path, `unknown behaviour "${String(b.type)}" ignored`);
      return null;
  }
}
