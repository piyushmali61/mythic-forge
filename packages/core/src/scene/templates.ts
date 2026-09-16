import type { Vec3 } from '../math/vec3.ts';
import type { ProjectType } from '../project/manifest.ts';
import {
  createCameraEntity,
  createEmptyScene,
  createEntity,
  createLightEntity,
  createPrimitive,
  defaultBehaviour,
  defaultCamera,
  defaultCollider,
  defaultMaterial,
  defaultRigidBody,
  primitiveColliderSize,
} from './defaults.ts';
import type { BehaviourDef, Entity, MaterialDef, PrimitiveType, SceneDocument } from './types.ts';

/** Official asset ids used by templates (see assets/official/catalog.json). */
export const OFFICIAL_ASSETS = {
  shrinePlatform: 'mbs.shrine-platform',
  carvedPillar: 'mbs.carved-pillar',
  diyaLamp: 'mbs.diya-lamp',
  stoneTorana: 'mbs.stone-torana',
  kalashPot: 'mbs.kalash-pot',
  banyanTree: 'mbs.banyan-tree',
} as const;

export type TemplateId =
  | 'empty'
  | 'basic-3d'
  | 'third-person'
  | 'first-person'
  | 'platformer'
  | 'simple-environment'
  | 'shrine-of-lamps'
  | 'side-scroller-2d';

export interface TemplateContext {
  /** Project asset id for an official catalog asset copied into the project, or null if unavailable. */
  assetIdFor(catalogId: string): string | null;
}

export interface ProjectTemplate {
  id: TemplateId;
  name: string;
  description: string;
  projectTypes: readonly ProjectType[];
  editorMode: '3d' | '2d';
  /** Official catalog assets copied into the project on creation. */
  requiredAssets: readonly string[];
  /** All templates are original works of Mythic Bharat Studios. */
  license: { owner: string; licenseId: string; note: string };
  build(ctx: TemplateContext): SceneDocument;
}

const MBS_TEMPLATE_LICENSE = {
  owner: 'Mythic Bharat Studios',
  licenseId: 'MBS-ASSET-1.0',
  note: 'Original template content. Scenes you build from it are yours.',
};

// ---- small builders ---------------------------------------------------------------------------

class SceneBuilder {
  readonly scene: SceneDocument;

  constructor(name = 'Main') {
    this.scene = createEmptyScene(name);
  }

  add(entity: Entity, parent: Entity | null = null): Entity {
    this.scene.entities[entity.id] = entity;
    if (parent) {
      entity.parent = parent.id;
      parent.children.push(entity.id);
    } else {
      this.scene.rootIds.push(entity.id);
    }
    return entity;
  }

  camera(position: Vec3, rotation: Vec3, extra: Partial<Entity['components']> = {}): Entity {
    const cam = createCameraEntity(true);
    cam.transform.position = position;
    cam.transform.rotation = rotation;
    Object.assign(cam.components, extra);
    return this.add(cam);
  }

  sun(rotation: Vec3 = [-50, 35, 0], intensity = 2.2): Entity {
    const light = createLightEntity('directional');
    light.transform.rotation = rotation;
    light.components.light!.intensity = intensity;
    light.isStatic = true;
    return this.add(light);
  }

  sky(sky = '#bcd3ff', ground = '#4a3a2a', intensity = 0.7): Entity {
    const light = createLightEntity('hemisphere');
    light.components.light!.color = sky;
    light.components.light!.groundColor = ground;
    light.components.light!.intensity = intensity;
    light.isStatic = true;
    return this.add(light);
  }

  prim(
    primitive: PrimitiveType,
    name: string,
    position: Vec3,
    scale: Vec3 = [1, 1, 1],
    material: Partial<MaterialDef> = {},
    options: { collider?: boolean; isStatic?: boolean; rotation?: Vec3; parent?: Entity | null } = {},
  ): Entity {
    const e = createPrimitive(primitive, name);
    e.transform.position = position;
    e.transform.scale = scale;
    if (options.rotation) e.transform.rotation = options.rotation;
    e.components.material = { ...defaultMaterial(), ...material };
    if (options.collider) e.components.collider = defaultCollider(primitiveColliderSize(primitive));
    e.isStatic = options.isStatic ?? false;
    return this.add(e, options.parent ?? null);
  }

  ground(size = 40, color = '#6f7d5a'): Entity {
    return this.prim('cube', 'Ground', [0, -0.1, 0], [size, 0.2, size], { color, roughness: 0.95 }, { collider: true, isStatic: true });
  }

  player(position: Vec3, mode: 'third-person' | 'first-person' | 'platformer', color = '#e0a33a'): Entity {
    const p = this.prim('capsule', 'Player', position, [1, 1, 1], { color, roughness: 0.5 });
    p.transform.scale = [0.8, 0.9, 0.8];
    p.components.collider = defaultCollider([1, 2, 1]);
    p.components.rigidBody = defaultRigidBody();
    p.components.behaviours = [{ ...(defaultBehaviour('playerController') as Extract<BehaviourDef, { type: 'playerController' }>), mode }];
    return p;
  }

  followCamera(target: Entity, distance = 7, height = 3.5, position?: Vec3): Entity {
    const pos: Vec3 = position ?? [target.transform.position[0], target.transform.position[1] + height, target.transform.position[2] + distance];
    return this.camera(pos, [-18, 0, 0], {
      behaviours: [{ type: 'followCamera', targetId: target.id, distance, height, smoothing: 8 }],
    });
  }

  model(assetId: string | null, name: string, position: Vec3, collider: { size: Vec3; center: Vec3 } | null, options: { rotation?: Vec3; scale?: Vec3; isStatic?: boolean; fallback?: () => Entity } = {}): Entity | null {
    if (!assetId) return options.fallback ? options.fallback() : null;
    const e = createEntity(name, { model: { assetId, castShadow: true, receiveShadow: true } });
    e.transform.position = position;
    if (options.rotation) e.transform.rotation = options.rotation;
    if (options.scale) e.transform.scale = options.scale;
    if (collider) e.components.collider = { shape: 'box', center: collider.center, size: collider.size, isTrigger: false };
    e.isStatic = options.isStatic ?? true;
    return this.add(e);
  }

  collectible(entity: Entity, score = 1): Entity {
    const behaviours: BehaviourDef[] = entity.components.behaviours ?? [];
    behaviours.push({ type: 'collectible', scoreValue: score, soundAssetId: null });
    behaviours.push({ type: 'rotate', axis: 'y', speed: 90 });
    entity.components.behaviours = behaviours;
    entity.isStatic = false;
    if (entity.components.collider) entity.components.collider.isTrigger = true;
    return entity;
  }
}

// ---- templates -------------------------------------------------------------------------------

const emptyTemplate: ProjectTemplate = {
  id: 'empty',
  name: 'Empty',
  description: 'A camera and a light. Start from scratch.',
  projectTypes: ['3d-game', '3d-experience', 'empty'],
  editorMode: '3d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.camera([0, 3, 8], [-15, 0, 0]);
    b.sun();
    return b.scene;
  },
};

const basic3dTemplate: ProjectTemplate = {
  id: 'basic-3d',
  name: 'Basic 3D Scene',
  description: 'Ground, lighting, a camera and a few shapes to play with.',
  projectTypes: ['3d-game', '3d-experience', 'empty'],
  editorMode: '3d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.scene.environment.background = '#20242c';
    b.camera([0, 4, 10], [-18, 0, 0]);
    b.sun();
    b.sky();
    b.ground(30, '#5b6150');
    b.prim('cube', 'Cube', [-2, 0.5, 0], [1, 1, 1], { color: '#d98c3f' }, { collider: true });
    b.prim('sphere', 'Sphere', [0, 0.5, 0], [1, 1, 1], { color: '#e6dcc8', roughness: 0.3 }, { collider: true });
    const cyl = b.prim('cylinder', 'Cylinder', [2, 0.5, 0], [1, 1, 1], { color: '#4c7bb3' }, { collider: true });
    cyl.components.behaviours = [{ type: 'rotate', axis: 'y', speed: 30 }];
    return b.scene;
  },
};

const thirdPersonTemplate: ProjectTemplate = {
  id: 'third-person',
  name: 'Third Person',
  description: 'A controllable character with a follow camera and some obstacles.',
  projectTypes: ['3d-game'],
  editorMode: '3d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.scene.environment.background = '#9fb8d8';
    b.scene.environment.fogEnabled = true;
    b.scene.environment.fogColor = '#9fb8d8';
    b.scene.environment.fogNear = 25;
    b.scene.environment.fogFar = 70;
    b.sun();
    b.sky();
    b.ground(60);
    const player = b.player([0, 1, 0], 'third-person');
    b.followCamera(player);
    const crate = { color: '#9a6b3f', roughness: 0.8 };
    b.prim('cube', 'Crate', [3, 0.5, -3], [1, 1, 1], crate, { collider: true, isStatic: true });
    b.prim('cube', 'Crate', [3, 1.5, -3], [1, 1, 1], crate, { collider: true, isStatic: true });
    b.prim('cube', 'Step', [-3, 0.2, -4], [2, 0.4, 2], { color: '#8d8d8d' }, { collider: true, isStatic: true });
    b.prim('cube', 'Step', [-3, 0.6, -5.5], [2, 1.2, 1], { color: '#8d8d8d' }, { collider: true, isStatic: true });
    b.prim('cube', 'Wall', [0, 1, -10], [12, 2, 0.5], { color: '#b9a88e' }, { collider: true, isStatic: true });
    return b.scene;
  },
};

const firstPersonTemplate: ProjectTemplate = {
  id: 'first-person',
  name: 'First Person',
  description: 'Walk around a small courtyard from a first-person view. Drag to look.',
  projectTypes: ['3d-game', '3d-experience'],
  editorMode: '3d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.scene.environment.background = '#aec6e6';
    b.sun([-55, 20, 0]);
    b.sky();
    b.ground(40, '#7c7466');
    const player = b.player([0, 1, 6], 'first-person', '#777777');
    player.components.mesh!.castShadow = false;
    const eye = createCameraEntity(true);
    eye.name = 'Eye Camera';
    eye.transform.position = [0, 0.7, 0];
    eye.transform.rotation = [0, 0, 0];
    eye.transform.scale = [1.25, 1.1111, 1.25];
    eye.components.camera = { ...defaultCamera(true), fov: 70, near: 0.05 };
    b.add(eye, player);
    const wall = { color: '#c9b79c', roughness: 0.9 };
    b.prim('cube', 'Wall North', [0, 1.5, -10], [20, 3, 0.5], wall, { collider: true, isStatic: true });
    b.prim('cube', 'Wall South', [0, 1.5, 10], [20, 3, 0.5], wall, { collider: true, isStatic: true });
    b.prim('cube', 'Wall East', [10, 1.5, 0], [0.5, 3, 20], wall, { collider: true, isStatic: true });
    b.prim('cube', 'Wall West', [-10, 1.5, 0], [0.5, 3, 20], wall, { collider: true, isStatic: true });
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 2], [4, 2]] as const) {
      b.prim('cylinder', 'Column', [x, 1.5, z], [0.6, 3, 0.6], { color: '#e8e0d0' }, { collider: true, isStatic: true });
    }
    return b.scene;
  },
};

const platformerTemplate: ProjectTemplate = {
  id: 'platformer',
  name: 'Platformer',
  description: 'Run and jump across platforms and collect the gems.',
  projectTypes: ['3d-game'],
  editorMode: '3d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.scene.environment.background = '#2a2f45';
    b.scene.hud = { title: 'Collect the gems', showScore: true, winMessage: 'All gems collected!' };
    b.sun([-40, -20, 0]);
    b.sky('#c7d2ff', '#302840', 0.8);
    const stone = { color: '#8a7f73', roughness: 0.9 };
    b.prim('cube', 'Start Ledge', [0, -0.5, 0], [6, 1, 3], stone, { collider: true, isStatic: true });
    const platforms: [number, number, number][] = [[5, 0.5, 3], [9, 1.5, 2.5], [13.5, 2.2, 3], [18, 1, 3], [23, 2, 4]];
    platforms.forEach(([x, y, w], i) => {
      b.prim('cube', `Platform ${i + 1}`, [x, y - 0.25, 0], [w, 0.5, 3], stone, { collider: true, isStatic: true });
      const gem = b.prim('sphere', `Gem ${i + 1}`, [x, y + 0.8, 0], [0.4, 0.4, 0.4], {
        color: '#39d4c4',
        emissive: '#1e8f85',
        emissiveIntensity: 1.2,
        roughness: 0.2,
      }, { collider: true });
      b.collectible(gem);
    });
    const mover = b.prim('cube', 'Moving Platform', [28, 2.5, 0], [3, 0.5, 3], { color: '#c98f3a' }, { collider: true });
    mover.components.behaviours = [{ type: 'bob', amplitude: 1, frequency: 0.25 }];
    const player = b.player([0, 1, 0], 'platformer');
    b.followCamera(player, 10, 2, [0, 3, 10]);
    return b.scene;
  },
};

const environmentTemplate: ProjectTemplate = {
  id: 'simple-environment',
  name: 'Simple Environment',
  description: 'A calm clearing with trees, rocks and a pond. Good for exploration pieces.',
  projectTypes: ['3d-experience', '3d-game'],
  editorMode: '3d',
  requiredAssets: [OFFICIAL_ASSETS.banyanTree],
  license: MBS_TEMPLATE_LICENSE,
  build(ctx) {
    const b = new SceneBuilder();
    Object.assign(b.scene.environment, { background: '#b8cfe0', fogEnabled: true, fogColor: '#b8cfe0', fogNear: 20, fogFar: 80 });
    b.camera([0, 5, 16], [-15, 0, 0]);
    b.sun([-35, 40, 0], 2.4);
    b.sky('#dbe8f5', '#5a4a36', 0.8);
    b.ground(80, '#6d8052');
    b.prim('cylinder', 'Pond', [4, 0.01, -2], [7, 0.02, 5], { color: '#3d6f8e', roughness: 0.05, metalness: 0.2 }, { isStatic: true });
    const treeSpots: [number, number][] = [[-8, -6], [-12, 4], [10, -10], [-3, -14], [14, 6]];
    for (const [x, z] of treeSpots) {
      b.model(ctx.assetIdFor(OFFICIAL_ASSETS.banyanTree), 'Banyan Tree', [x, 0, z], { size: [1.2, 5, 1.2], center: [0, 2.5, 0] }, {
        rotation: [0, (x * 37) % 360, 0],
        fallback: () => {
          const trunk = b.prim('cylinder', 'Tree', [x, 1.25, z], [0.5, 2.5, 0.5], { color: '#6b4a2f' }, { collider: true, isStatic: true });
          b.prim('cone', 'Foliage', [0, 1.1, 0], [5, 1.4, 5], { color: '#3f6b35', flatShading: true }, { isStatic: true, parent: trunk });
          return trunk;
        },
      });
    }
    const rock = { color: '#8c8a84', roughness: 1, flatShading: true };
    b.prim('sphere', 'Rock', [-4, 0.3, 3], [1.6, 0.8, 1.2], rock, { collider: true, isStatic: true });
    b.prim('sphere', 'Rock', [7, 0.2, 3], [1, 0.5, 0.9], rock, { collider: true, isStatic: true });
    return b.scene;
  },
};

const shrineTemplate: ProjectTemplate = {
  id: 'shrine-of-lamps',
  name: 'Shrine of Lamps',
  description: 'Indian-inspired courtyard: light every diya by walking to it. Uses official Mythic Bharat Studios assets.',
  projectTypes: ['3d-game', '3d-experience'],
  editorMode: '3d',
  requiredAssets: Object.values(OFFICIAL_ASSETS),
  license: MBS_TEMPLATE_LICENSE,
  build(ctx) {
    const b = new SceneBuilder('Shrine of Lamps');
    Object.assign(b.scene.environment, {
      background: '#2b1e2e',
      ambientColor: '#ffd9a8',
      ambientIntensity: 0.25,
      fogEnabled: true,
      fogColor: '#2b1e2e',
      fogNear: 18,
      fogFar: 60,
    });
    b.scene.hud = { title: 'Collect every diya', showScore: true, winMessage: 'The shrine glows. Well done!' };
    b.sun([-35, -140, 0], 1.6).components.light!.color = '#ffb070';
    b.sky('#6a5a8c', '#3a2a1a', 0.6);
    b.ground(60, '#a0764c');

    const a = (key: keyof typeof OFFICIAL_ASSETS) => ctx.assetIdFor(OFFICIAL_ASSETS[key]);

    // Stepped platform: the model plus three stacked step colliders so the player can climb it.
    const shrine = b.model(a('shrinePlatform'), 'Shrine Platform', [0, 0, -6], null, {
      fallback: () => b.prim('cube', 'Shrine Platform', [0, 0.6, -6], [8, 1.2, 8], { color: '#c9a27a' }, { isStatic: true }),
    });
    if (shrine) {
      const modelBased = !!shrine.components.model;
      [[8, 0.2], [6.5, 0.6], [5, 1.0]].forEach(([w, cy], i) => {
        const step = createEntity(`Step Collider ${i + 1}`, {
          collider: { shape: 'box', center: [0, 0, 0], size: [1, 1, 1], isTrigger: false },
        });
        step.transform.position = modelBased ? [0, cy!, 0] : [0, (cy! - 0.6) / 1.2, 0];
        step.transform.scale = modelBased ? [w!, 0.4, w!] : [w! / 8, 0.4 / 1.2, w! / 8];
        step.isStatic = true;
        b.add(step, shrine);
      });
    }

    for (const [x, z] of [[-2, -8], [2, -8], [-2, -4], [2, -4]] as const) {
      b.model(a('carvedPillar'), 'Carved Pillar', [x, 1.2, z], { size: [0.7, 3, 0.7], center: [0, 1.5, 0] }, {
        fallback: () => b.prim('cylinder', 'Pillar', [x, 2.7, z], [0.6, 3, 0.6], { color: '#d8b98f' }, { collider: true, isStatic: true }),
      });
    }
    const torana = b.model(a('stoneTorana'), 'Torana Gateway', [0, 0, 6], null);
    if (torana) {
      for (const x of [-1.4, 1.4]) {
        const post = createEntity('Post Collider', {
          collider: { shape: 'box', center: [0, 0, 0], size: [0.6, 3.8, 0.6], isTrigger: false },
        });
        post.transform.position = [x, 1.9, 0];
        post.isStatic = true;
        b.add(post, torana);
      }
    }
    b.model(a('kalashPot'), 'Kalash', [0, 1.2, -6], { size: [0.5, 0.62, 0.5], center: [0, 0.31, 0] });
    for (const [x, z] of [[-14, -12], [14, -10], [-12, 10], [13, 12]] as const) {
      b.model(a('banyanTree'), 'Banyan Tree', [x, 0, z], { size: [1.2, 5, 1.2], center: [0, 2.5, 0] }, { rotation: [0, x * 11, 0] });
    }

    const lampSpots: [number, number, number][] = [[-6, 0, 2], [6, 0, 2], [-8, 0, -8], [8, 0, -8], [0, 1.2, -7.4], [0, 0, 10]];
    lampSpots.forEach(([x, y, z], i) => {
      const lamp =
        b.model(a('diyaLamp'), `Diya ${i + 1}`, [x, y, z], { size: [1.2, 1.2, 1.2], center: [0, 0.3, 0] }, {
          scale: [1.6, 1.6, 1.6],
          isStatic: false,
        }) ??
        b.prim('sphere', `Diya ${i + 1}`, [x, y + 0.3, z], [0.4, 0.4, 0.4], { color: '#ffb347', emissive: '#ff8c1a', emissiveIntensity: 2 }, { collider: true });
      const glow = createLightEntity('point');
      glow.name = 'Glow';
      glow.transform.position = [0, 0.4, 0];
      glow.components.light = { ...glow.components.light!, color: '#ff9a3c', intensity: 6, range: 5, castShadow: false };
      b.add(glow, lamp);
      b.collectible(lamp);
      // Diyas shouldn't spin; they bob gently instead.
      lamp.components.behaviours = lamp.components.behaviours!.filter((x) => x.type !== 'rotate');
      lamp.components.behaviours.push({ type: 'bob', amplitude: 0.08, frequency: 0.6 });
    });

    const player = b.player([0, 1, 13], 'third-person', '#d4a24c');
    b.followCamera(player, 7, 3.5);
    return b.scene;
  },
};

const sideScroller2dTemplate: ProjectTemplate = {
  id: 'side-scroller-2d',
  name: '2D Side-Scroller',
  description: 'Orthographic camera and flat sprites (quads). Beta: 2D uses the 3D engine with a locked view.',
  projectTypes: ['2d-game'],
  editorMode: '2d',
  requiredAssets: [],
  license: MBS_TEMPLATE_LICENSE,
  build() {
    const b = new SceneBuilder();
    b.scene.environment.background = '#1f2a3a';
    b.scene.hud = { title: '', showScore: true, winMessage: 'Level complete!' };
    b.sun([-10, 0, 0], 1.2);
    b.scene.environment.ambientIntensity = 1.2;
    const flat = { roughness: 1, flatShading: true };
    b.prim('cube', 'Ground', [8, -0.5, 0], [30, 1, 1], { ...flat, color: '#4c6b3c' }, { collider: true, isStatic: true });
    b.prim('cube', 'Block', [6, 1, 0], [2, 1, 1], { ...flat, color: '#8a5a3c' }, { collider: true, isStatic: true });
    b.prim('cube', 'Block', [11, 2, 0], [2, 1, 1], { ...flat, color: '#8a5a3c' }, { collider: true, isStatic: true });
    for (const [i, x] of [3, 6, 11, 16].entries()) {
      const coin = b.prim('quad', `Coin ${i + 1}`, [x, x === 6 ? 2.2 : x === 11 ? 3.2 : 1, 0], [0.6, 0.6, 1], {
        color: '#ffd24a',
        emissive: '#a07800',
        emissiveIntensity: 0.6,
        doubleSided: true,
      }, { collider: true });
      coin.components.collider!.size = [1, 1, 1];
      b.collectible(coin);
    }
    const player = b.prim('quad', 'Player', [0, 1, 0], [0.9, 1.8, 1], { color: '#e05a47', doubleSided: true });
    player.components.collider = defaultCollider([1, 1, 1]);
    player.components.rigidBody = defaultRigidBody();
    player.components.behaviours = [{ type: 'playerController', mode: 'platformer', moveSpeed: 5, jumpSpeed: 7, lookSensitivity: 0.25 }];
    const cam = createCameraEntity(true);
    cam.name = 'Camera 2D';
    cam.transform.position = [0, 2, 20];
    cam.components.camera = { ...defaultCamera(true), projection: 'orthographic', orthoSize: 5 };
    cam.components.behaviours = [{ type: 'followCamera', targetId: player.id, distance: 20, height: 1, smoothing: 6 }];
    b.add(cam);
    return b.scene;
  },
};

export const TEMPLATES: readonly ProjectTemplate[] = [
  emptyTemplate,
  basic3dTemplate,
  thirdPersonTemplate,
  firstPersonTemplate,
  platformerTemplate,
  environmentTemplate,
  shrineTemplate,
  sideScroller2dTemplate,
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function templatesFor(type: ProjectType): ProjectTemplate[] {
  return TEMPLATES.filter((t) => t.projectTypes.includes(type));
}
