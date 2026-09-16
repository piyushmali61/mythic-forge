import {
  SHADOW_MAP_SIZE,
  type CameraComponent,
  type Entity,
  type LightComponent,
  type QualitySettings,
  type SceneChange,
  type SceneDocument,
  type SceneEnvironment,
  type SceneModel,
} from '@mythic-forge/core';
import * as THREE from 'three';
import type { AssetCache } from './assets/asset-cache.ts';
import { GeometryCache, applyMaterial, createIcon, createMaterial, isEditorHelper } from './primitives.ts';

interface EntityNode {
  id: string;
  group: THREE.Group;
  content: THREE.Object3D | null;
  material: THREE.MeshStandardMaterial | null;
  light: THREE.Light | null;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  cameraDef: CameraComponent | null;
  helper: THREE.Object3D | null;
  /** Incremented whenever content is rebuilt, so late async loads can be discarded. */
  token: number;
  sharedContent: boolean;
  modelAssetId: string | null;
  textureAssetId: string | null;
}

export interface SceneViewOptions {
  editor: boolean;
  geometry: GeometryCache;
  assets: AssetCache;
  quality: () => QualitySettings;
  /** Called when something changed asynchronously (a model finished loading). */
  onAsyncChange: () => void;
}

const DEG = Math.PI / 180;

/** Keeps a three.js object graph in sync with a SceneModel. */
export class SceneView {
  readonly root = new THREE.Group();
  readonly ambient = new THREE.AmbientLight(0xffffff, 0.3);
  private nodes = new Map<string, EntityNode>();
  private helpersVisible = true;
  private playing = false;
  private readonly options: SceneViewOptions;

  constructor(options: SceneViewOptions) {
    this.options = options;
    this.root.name = 'SceneRoot';
    this.root.add(this.ambient);
  }

  get size(): number {
    return this.nodes.size;
  }

  node(id: string): EntityNode | undefined {
    return this.nodes.get(id);
  }

  groupOf(id: string): THREE.Group | undefined {
    return this.nodes.get(id)?.group;
  }

  // ---- building --------------------------------------------------------------------------------

  build(doc: Readonly<SceneDocument>): void {
    this.clear();
    const visit = (ids: readonly string[], parent: THREE.Object3D): void => {
      for (const id of ids) {
        const e = doc.entities[id];
        if (!e) continue;
        const node = this.createNode(e);
        parent.add(node.group);
        visit(e.children, node.group);
      }
    };
    visit(doc.rootIds, this.root);
  }

  handle(change: SceneChange, model: SceneModel): void {
    switch (change.type) {
      case 'reset':
        this.build(model.document);
        break;
      case 'added':
        for (const id of change.ids) {
          const e = model.get(id);
          if (!e || this.nodes.has(id)) continue;
          const node = this.createNode(e);
          const parent = e.parent ? this.nodes.get(e.parent)?.group : this.root;
          (parent ?? this.root).add(node.group);
        }
        break;
      case 'removed':
        for (const id of change.ids) this.removeNode(id);
        break;
      case 'transform': {
        const e = model.get(change.id);
        const node = this.nodes.get(change.id);
        if (e && node) applyTransform(node.group, e);
        break;
      }
      case 'components': {
        const e = model.get(change.id);
        const node = this.nodes.get(change.id);
        if (e && node) this.rebuildContent(node, e);
        break;
      }
      case 'meta': {
        // Name/flags only: no need to rebuild meshes or reload models.
        const e = model.get(change.id);
        const node = this.nodes.get(change.id);
        if (e && node) {
          node.group.name = e.name;
          node.group.userData.locked = e.locked;
          node.group.visible = this.visibleFor(e);
        }
        break;
      }
      case 'reparented': {
        const e = model.get(change.id);
        const node = this.nodes.get(change.id);
        if (!e || !node) break;
        const parent = e.parent ? this.nodes.get(e.parent)?.group : this.root;
        (parent ?? this.root).add(node.group);
        applyTransform(node.group, e);
        break;
      }
      case 'environment':
        break;
    }
  }

  /** Re-applies every transform and visibility flag from the document (after play mode). */
  syncAll(doc: Readonly<SceneDocument>): void {
    for (const [id, node] of this.nodes) {
      const e = doc.entities[id];
      if (e) {
        applyTransform(node.group, e);
        node.group.visible = this.visibleFor(e);
      }
    }
  }

  private visibleFor(e: Readonly<Entity>): boolean {
    return e.enabled && (this.playing || !this.options.editor || e.visible);
  }

  private createNode(e: Readonly<Entity>): EntityNode {
    const group = new THREE.Group();
    group.name = e.name;
    group.userData.entityId = e.id;
    const node: EntityNode = {
      id: e.id,
      group,
      content: null,
      material: null,
      light: null,
      camera: null,
      cameraDef: null,
      helper: null,
      token: 0,
      sharedContent: false,
      modelAssetId: null,
      textureAssetId: null,
    };
    this.nodes.set(e.id, node);
    applyTransform(group, e);
    this.rebuildContent(node, e);
    return node;
  }

  private removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.disposeContent(node);
    node.group.removeFromParent();
    this.nodes.delete(id);
  }

  clear(): void {
    for (const id of [...this.nodes.keys()]) this.removeNode(id);
  }

  private disposeContent(node: EntityNode): void {
    node.token++;
    for (const obj of [node.content, node.light, node.camera, node.helper]) obj?.removeFromParent();
    // Geometries (GeometryCache) and model resources (AssetCache) are shared; only per-entity
    // materials, shadow maps and helper icons belong to this node.
    node.material?.dispose();
    if (node.light) (node.light as THREE.DirectionalLight).shadow?.map?.dispose();
    if (node.helper) {
      node.helper.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
    node.content = null;
    node.material = null;
    node.light = null;
    node.camera = null;
    node.cameraDef = null;
    node.helper = null;
    node.sharedContent = false;
    node.modelAssetId = null;
    node.textureAssetId = null;
  }

  private rebuildContent(node: EntityNode, e: Readonly<Entity>): void {
    this.disposeContent(node);
    const token = node.token;
    const c = e.components;
    node.group.name = e.name;
    node.group.visible = this.visibleFor(e);
    node.group.userData.locked = e.locked;
    const q = this.options.quality();

    if (c.mesh) {
      const def = c.material;
      const material = def ? createMaterial(def, null) : new THREE.MeshStandardMaterial({ color: 0xc8c2b8, roughness: 0.7 });
      const mesh = new THREE.Mesh(this.options.geometry.get(c.mesh.primitive), material);
      mesh.castShadow = c.mesh.castShadow;
      mesh.receiveShadow = c.mesh.receiveShadow;
      node.content = mesh;
      node.material = material;
      node.group.add(mesh);
      if (def?.textureAssetId) {
        node.textureAssetId = def.textureAssetId;
        void this.options.assets.texture(def.textureAssetId).then((tex) => {
          if (node.token !== token || !tex || !node.material) return;
          applyMaterial(node.material, def, tex);
          this.options.onAsyncChange();
        });
      }
    } else if (c.model) {
      const model = c.model;
      node.modelAssetId = model.assetId;
      node.sharedContent = true;
      void this.options.assets.model(model.assetId).then((obj) => {
        if (node.token !== token) return;
        if (!obj) {
          if (this.options.editor) this.attachHelper(node, createIcon('empty', '#ff6b5a'));
          this.options.onAsyncChange();
          return;
        }
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = model.castShadow;
            m.receiveShadow = model.receiveShadow;
          }
        });
        node.content = obj;
        node.group.add(obj);
        this.options.onAsyncChange();
      });
    }

    if (c.light) {
      node.light = createLight(c.light, q);
      node.group.add(node.light);
      if (this.options.editor) this.attachHelper(node, createIcon('light', c.light.color));
    }
    if (c.camera) {
      node.cameraDef = { ...c.camera };
      node.camera =
        c.camera.projection === 'orthographic'
          ? new THREE.OrthographicCamera(-c.camera.orthoSize, c.camera.orthoSize, c.camera.orthoSize, -c.camera.orthoSize, c.camera.near, c.camera.far)
          : new THREE.PerspectiveCamera(c.camera.fov, 1, c.camera.near, Math.min(c.camera.far, q.drawDistance));
      node.group.add(node.camera);
      if (this.options.editor) this.attachHelper(node, createIcon('camera', '#d9b36c'));
    }
    if (this.options.editor && !c.mesh && !c.model && !c.light && !c.camera) {
      this.attachHelper(node, createIcon('empty', '#9aa0a6'));
    }
  }

  private attachHelper(node: EntityNode, helper: THREE.Object3D): void {
    if (node.helper) {
      node.helper.removeFromParent();
    }
    node.helper = helper;
    helper.visible = this.helpersVisible;
    node.group.add(helper);
  }

  // ---- play mode -------------------------------------------------------------------------------

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.setHelpersVisible(!playing);
  }

  setHelpersVisible(visible: boolean): void {
    this.helpersVisible = visible;
    for (const node of this.nodes.values()) if (node.helper) node.helper.visible = visible;
  }

  setRuntimeTransform(id: string, position: readonly number[], quaternion: readonly number[], scale: readonly number[], visible: boolean): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.group.position.set(position[0]!, position[1]!, position[2]!);
    node.group.quaternion.set(quaternion[0]!, quaternion[1]!, quaternion[2]!, quaternion[3]!);
    node.group.scale.set(scale[0]!, scale[1]!, scale[2]!);
    node.group.visible = visible;
  }

  /** The first enabled main camera, with its aspect/projection updated. */
  mainCamera(aspect: number, drawDistance: number): THREE.Camera | null {
    for (const node of this.nodes.values()) {
      if (!node.camera || !node.cameraDef?.isMain || !isVisibleInHierarchy(node.group)) continue;
      const cam = node.camera;
      const def = node.cameraDef;
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = aspect;
        cam.far = Math.min(def.far, drawDistance);
      } else {
        cam.left = -def.orthoSize * aspect;
        cam.right = def.orthoSize * aspect;
        cam.top = def.orthoSize;
        cam.bottom = -def.orthoSize;
      }
      cam.updateProjectionMatrix();
      return cam;
    }
    return null;
  }

  // ---- quality & environment ----------------------------------------------------------------

  applyQuality(q: QualitySettings): void {
    for (const node of this.nodes.values()) {
      if (node.light) configureShadow(node.light, node.light.userData.wantsShadow === true, q);
      if (node.camera instanceof THREE.PerspectiveCamera && node.cameraDef) {
        node.camera.far = Math.min(node.cameraDef.far, q.drawDistance);
        node.camera.updateProjectionMatrix();
      }
    }
    this.options.assets.setTextureMaxSize(q.textureMaxSize);
  }

  applyEnvironment(env: Readonly<SceneEnvironment>, scene: THREE.Scene, q: QualitySettings): void {
    scene.background = new THREE.Color(env.background);
    this.ambient.color.set(env.ambientColor);
    this.ambient.intensity = env.ambientIntensity;
    scene.fog = env.fogEnabled && q.ambientEffects ? new THREE.Fog(env.fogColor, env.fogNear, Math.max(env.fogFar, env.fogNear + 0.1)) : null;
  }

  // ---- picking ---------------------------------------------------------------------------------

  pick(raycaster: THREE.Raycaster): string | null {
    const hits = raycaster.intersectObject(this.root, true);
    for (const hit of hits) {
      if (!isVisibleInHierarchy(hit.object)) continue;
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.entityId === undefined) o = o.parent;
      if (!o) continue;
      if (o.userData.locked) continue;
      if (isEditorHelper(hit.object) && !this.helpersVisible) continue;
      return o.userData.entityId as string;
    }
    return null;
  }

  /** World-space bounds of an entity and its children (for "Focus"). */
  bounds(id: string): THREE.Box3 | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    node.group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(node.group, true);
    if (box.isEmpty()) {
      const p = node.group.getWorldPosition(new THREE.Vector3());
      box.setFromCenterAndSize(p, new THREE.Vector3(1, 1, 1));
    }
    return box;
  }

  referencedAssets(): Set<string> {
    const set = new Set<string>();
    for (const n of this.nodes.values()) {
      if (n.modelAssetId) set.add(n.modelAssetId);
      if (n.textureAssetId) set.add(n.textureAssetId);
    }
    return set;
  }

  dispose(): void {
    this.clear();
  }
}

function applyTransform(group: THREE.Object3D, e: Readonly<Entity>): void {
  const t = e.transform;
  group.position.set(t.position[0], t.position[1], t.position[2]);
  group.rotation.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG, 'XYZ');
  group.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

function isVisibleInHierarchy(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

function createLight(def: Readonly<LightComponent>, q: QualitySettings): THREE.Light {
  let light: THREE.Light;
  switch (def.type) {
    case 'directional': {
      const l = new THREE.DirectionalLight(def.color, def.intensity);
      l.target.position.set(0, 0, -1);
      l.add(l.target);
      const cam = l.shadow.camera;
      cam.left = -25;
      cam.right = 25;
      cam.top = 25;
      cam.bottom = -25;
      cam.near = 0.5;
      cam.far = 150;
      l.shadow.bias = -0.0005;
      l.shadow.normalBias = 0.03;
      light = l;
      break;
    }
    case 'spot': {
      const l = new THREE.SpotLight(def.color, def.intensity, def.range, def.angle * DEG, 0.3, 2);
      l.target.position.set(0, 0, -1);
      l.add(l.target);
      light = l;
      break;
    }
    case 'point':
      light = new THREE.PointLight(def.color, def.intensity, def.range, 2);
      break;
    case 'hemisphere':
      light = new THREE.HemisphereLight(def.color, def.groundColor, def.intensity);
      break;
  }
  light.userData.wantsShadow = def.castShadow;
  configureShadow(light, def.castShadow, q);
  return light;
}

function configureShadow(light: THREE.Light, wanted: boolean, q: QualitySettings): void {
  const shadowCapable = light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight || light instanceof THREE.PointLight;
  if (!shadowCapable) return;
  // Point-light shadows render six times; only allow them at high quality.
  const allowed = q.shadows !== 'off' && (!(light instanceof THREE.PointLight) || q.shadows === 'high');
  const enable = wanted && allowed;
  const size = SHADOW_MAP_SIZE[q.shadows];
  if (light.castShadow !== enable || (enable && light.shadow.mapSize.x !== size)) {
    light.castShadow = enable;
    if (enable) {
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }
}
