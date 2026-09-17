import type { Vec3 } from '../math/vec3.ts';

export const PRIMITIVE_TYPES = ['cube', 'sphere', 'capsule', 'cylinder', 'cone', 'plane', 'quad', 'torus'] as const;
export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

export const LIGHT_TYPES = ['directional', 'point', 'spot', 'hemisphere'] as const;
export type LightType = (typeof LIGHT_TYPES)[number];

export interface Transform {
  position: Vec3;
  /** Intrinsic XYZ Euler angles, degrees. */
  rotation: Vec3;
  scale: Vec3;
}

export interface MaterialDef {
  /** Official material preset this material started from (informational). */
  presetId: string | null;
  /** `#rrggbb` */
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  /** Texture asset inside the project, or null. */
  textureAssetId: string | null;
  /** Texture repeat (tiling). */
  textureRepeat: [number, number];
  doubleSided: boolean;
  flatShading: boolean;
}

export interface MeshComponent {
  primitive: PrimitiveType;
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface ModelComponent {
  assetId: string;
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface LightComponent {
  type: LightType;
  color: string;
  intensity: number;
  /** Point/spot range in metres (0 = infinite). */
  range: number;
  /** Spot cone angle in degrees. */
  angle: number;
  castShadow: boolean;
  /** Hemisphere ground colour. */
  groundColor: string;
}

export interface CameraComponent {
  projection: 'perspective' | 'orthographic';
  /** Vertical field of view, degrees. */
  fov: number;
  /** Half-height of the orthographic view, metres. */
  orthoSize: number;
  near: number;
  far: number;
  /** The camera used when the game runs. */
  isMain: boolean;
}

export interface ColliderComponent {
  shape: 'box';
  center: Vec3;
  size: Vec3;
  /** Triggers report overlaps but don't block movement. */
  isTrigger: boolean;
}

export interface RigidBodyComponent {
  mass: number;
  useGravity: boolean;
  /** Kinematic bodies are moved by behaviours, not by gravity. */
  isKinematic: boolean;
}

/** Plays animation clips stored in the entity's model (play mode and exported games only). */
export interface AnimatorComponent {
  /** Clip played by default. Empty = the model's first clip. */
  clip: string;
  /** Clip played while the entity is moving (player-controlled objects). Empty = keep `clip`. */
  moveClip: string;
  /** Playback speed multiplier. */
  speed: number;
  loop: boolean;
  playOnStart: boolean;
}

export interface AudioSourceComponent {
  assetId: string;
  volume: number;
  loop: boolean;
  playOnStart: boolean;
}

// ---- Behaviours: the MVP's safe, declarative alternative to scripting. No user code runs. ----

export interface RotateBehaviour {
  type: 'rotate';
  axis: 'x' | 'y' | 'z';
  /** Degrees per second. */
  speed: number;
}

export interface BobBehaviour {
  type: 'bob';
  /** Metres. */
  amplitude: number;
  /** Cycles per second. */
  frequency: number;
}

export interface PlayerControllerBehaviour {
  type: 'playerController';
  mode: 'third-person' | 'first-person' | 'platformer';
  moveSpeed: number;
  jumpSpeed: number;
  /** Degrees per unit of look input. */
  lookSensitivity: number;
}

export interface FollowCameraBehaviour {
  type: 'followCamera';
  targetId: string | null;
  distance: number;
  height: number;
  /** Higher = snappier. */
  smoothing: number;
}

export interface CollectibleBehaviour {
  type: 'collectible';
  scoreValue: number;
  /** Audio asset played when collected (optional). */
  soundAssetId: string | null;
}

export type BehaviourDef =
  | RotateBehaviour
  | BobBehaviour
  | PlayerControllerBehaviour
  | FollowCameraBehaviour
  | CollectibleBehaviour;

export type BehaviourType = BehaviourDef['type'];

export interface Components {
  mesh?: MeshComponent;
  model?: ModelComponent;
  material?: MaterialDef;
  light?: LightComponent;
  camera?: CameraComponent;
  collider?: ColliderComponent;
  rigidBody?: RigidBodyComponent;
  audioSource?: AudioSourceComponent;
  animator?: AnimatorComponent;
  behaviours?: BehaviourDef[];
}

export type ComponentKey = keyof Components;

export interface Entity {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  /** Disabled entities (and their children) don't render or run. */
  enabled: boolean;
  /** Hidden in the editor viewport only. */
  visible: boolean;
  /** Locked entities can't be selected in the viewport. */
  locked: boolean;
  /** Static entities never move at runtime (enables batching and cheaper physics). */
  isStatic: boolean;
  transform: Transform;
  components: Components;
}

export interface SceneEnvironment {
  background: string;
  ambientColor: string;
  ambientIntensity: number;
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** m/s², negative is down. */
  gravity: number;
}

export interface SceneHud {
  title: string;
  showScore: boolean;
  /** Shown when every collectible is collected (empty = no message). */
  winMessage: string;
}

export interface SceneDocument {
  format: 'mythic-forge-scene';
  formatVersion: number;
  id: string;
  name: string;
  environment: SceneEnvironment;
  hud: SceneHud;
  rootIds: string[];
  entities: Record<string, Entity>;
}
