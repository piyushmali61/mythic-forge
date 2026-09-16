import { createId } from '../util/ids.ts';
import { SCENE_FORMAT_VERSION } from '../version.ts';
import type {
  BehaviourDef,
  BehaviourType,
  CameraComponent,
  ColliderComponent,
  Components,
  Entity,
  LightComponent,
  LightType,
  MaterialDef,
  MeshComponent,
  PrimitiveType,
  RigidBodyComponent,
  SceneDocument,
  SceneEnvironment,
  SceneHud,
  Transform,
} from './types.ts';

export const defaultTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

export const defaultMaterial = (color = '#c8c2b8'): MaterialDef => ({
  presetId: null,
  color,
  metalness: 0,
  roughness: 0.7,
  emissive: '#000000',
  emissiveIntensity: 0,
  opacity: 1,
  textureAssetId: null,
  textureRepeat: [1, 1],
  doubleSided: false,
  flatShading: false,
});

export const defaultMesh = (primitive: PrimitiveType): MeshComponent => ({
  primitive,
  castShadow: true,
  receiveShadow: true,
});

export const defaultLight = (type: LightType): LightComponent => ({
  type,
  color: type === 'directional' ? '#fff4e0' : '#ffffff',
  intensity: type === 'directional' ? 2.2 : type === 'hemisphere' ? 0.8 : 12,
  range: type === 'point' || type === 'spot' ? 12 : 0,
  angle: 35,
  castShadow: type === 'directional',
  groundColor: '#3a3128',
});

export const defaultCamera = (isMain = true): CameraComponent => ({
  projection: 'perspective',
  fov: 60,
  orthoSize: 6,
  near: 0.1,
  far: 500,
  isMain,
});

export const defaultCollider = (size: [number, number, number] = [1, 1, 1]): ColliderComponent => ({
  shape: 'box',
  center: [0, 0, 0],
  size,
  isTrigger: false,
});

export const defaultRigidBody = (): RigidBodyComponent => ({
  mass: 1,
  useGravity: true,
  isKinematic: false,
});

export function defaultBehaviour(type: BehaviourType): BehaviourDef {
  switch (type) {
    case 'rotate':
      return { type, axis: 'y', speed: 45 };
    case 'bob':
      return { type, amplitude: 0.25, frequency: 0.5 };
    case 'playerController':
      return { type, mode: 'third-person', moveSpeed: 4.5, jumpSpeed: 5.5, lookSensitivity: 0.25 };
    case 'followCamera':
      return { type, targetId: null, distance: 6, height: 3, smoothing: 8 };
    case 'collectible':
      return { type, scoreValue: 1, soundAssetId: null };
  }
}

export const BEHAVIOUR_INFO: Record<BehaviourType, { label: string; description: string }> = {
  rotate: { label: 'Rotate', description: 'Spins the object continuously.' },
  bob: { label: 'Bob', description: 'Moves the object gently up and down.' },
  playerController: {
    label: 'Player Controller',
    description: 'Moves this object with WASD/arrow keys or the on-screen pad. Space/Jump to jump.',
  },
  followCamera: { label: 'Follow Camera', description: 'Makes this camera follow a target object.' },
  collectible: { label: 'Collectible', description: 'Disappears and adds score when the player touches it.' },
};

export const defaultEnvironment = (): SceneEnvironment => ({
  background: '#1b1a1f',
  ambientColor: '#ffffff',
  ambientIntensity: 0.35,
  fogEnabled: false,
  fogColor: '#1b1a1f',
  fogNear: 30,
  fogFar: 120,
  gravity: -9.81,
});

export const defaultHud = (): SceneHud => ({ title: '', showScore: false, winMessage: '' });

export function createEntity(name: string, components: Components = {}, transform?: Partial<Transform>): Entity {
  return {
    id: createId('e'),
    name,
    parent: null,
    children: [],
    enabled: true,
    visible: true,
    locked: false,
    isStatic: false,
    transform: { ...defaultTransform(), ...transform },
    components,
  };
}

export const PRIMITIVE_LABELS: Record<PrimitiveType, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  capsule: 'Capsule',
  cylinder: 'Cylinder',
  cone: 'Cone',
  plane: 'Plane',
  quad: 'Quad',
  torus: 'Torus',
};

/** Local-space collider that matches the unit primitive. */
export function primitiveColliderSize(primitive: PrimitiveType): [number, number, number] {
  switch (primitive) {
    case 'plane':
      return [1, 0.02, 1];
    case 'quad':
      return [1, 1, 0.02];
    case 'capsule':
      return [1, 2, 1];
    case 'torus':
      return [1.3, 1.3, 0.3];
    default:
      return [1, 1, 1];
  }
}

export function createPrimitive(primitive: PrimitiveType, name = PRIMITIVE_LABELS[primitive]): Entity {
  return createEntity(name, { mesh: defaultMesh(primitive), material: defaultMaterial() });
}

export function createLightEntity(type: LightType): Entity {
  const names: Record<LightType, string> = {
    directional: 'Directional Light',
    point: 'Point Light',
    spot: 'Spot Light',
    hemisphere: 'Sky Light',
  };
  const transform: Partial<Transform> =
    type === 'directional'
      ? { position: [4, 8, 5], rotation: [-50, 35, 0] }
      : type === 'spot'
        ? { position: [0, 4, 0], rotation: [-90, 0, 0] }
        : { position: [0, 3, 0] };
  return createEntity(names[type], { light: defaultLight(type) }, transform);
}

export function createCameraEntity(isMain = true): Entity {
  return createEntity('Main Camera', { camera: defaultCamera(isMain) }, { position: [0, 3, 8], rotation: [-15, 0, 0] });
}

export function createEmptyScene(name = 'Main'): SceneDocument {
  return {
    format: 'mythic-forge-scene',
    formatVersion: SCENE_FORMAT_VERSION,
    id: createId('scene'),
    name,
    environment: defaultEnvironment(),
    hud: defaultHud(),
    rootIds: [],
    entities: {},
  };
}
