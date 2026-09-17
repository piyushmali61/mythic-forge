import { QUALITY_PRESETS, createEmptyScene, createEntity, defaultAnimator, type SceneDocument } from '@mythic-forge/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EntityAnimator } from '../src/animation.ts';
import type { AssetCache } from '../src/assets/asset-cache.ts';
import { GeometryCache } from '../src/primitives.ts';
import { SceneView } from '../src/scene-view.ts';

/** A model whose child "Box" rises 1 m over 1 s ("Rise") or slides 2 m along X ("Slide"). */
function animatedModel(): THREE.Object3D {
  const root = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  box.name = 'Box';
  root.add(box);
  root.animations = [
    new THREE.AnimationClip('Rise', 1, [new THREE.VectorKeyframeTrack('Box.position', [0, 1], [0, 0, 0, 0, 1, 0])]),
    new THREE.AnimationClip('Slide', 1, [new THREE.VectorKeyframeTrack('Box.position', [0, 1], [0, 0, 0, 2, 0, 0])]),
  ];
  return root;
}

const box = (root: THREE.Object3D) => root.getObjectByName('Box')!;

describe('EntityAnimator', () => {
  it('plays the chosen clip and restores the pose when stopped', () => {
    const root = animatedModel();
    const animator = EntityAnimator.create(root, defaultAnimator('Rise'), 'Test')!;
    animator.update(0, false);
    animator.update(0.5, false);
    expect(box(root).position.y).toBeCloseTo(0.5, 5);
    animator.stop();
    expect(box(root).position.y).toBe(0);
  });

  it('cross-fades to the move clip while moving and back when idle', () => {
    const root = animatedModel();
    const animator = EntityAnimator.create(root, { ...defaultAnimator('Rise'), moveClip: 'Slide' }, 'Test')!;
    animator.update(0, false);
    animator.update(0.1, false);
    for (let i = 0; i < 10; i++) animator.update(0.05, true);
    expect(box(root).position.x).toBeGreaterThan(0.5);
    expect(box(root).position.y).toBeLessThan(0.1);
    for (let i = 0; i < 20; i++) animator.update(0.02, false);
    expect(box(root).position.x).toBe(0);
    expect(box(root).position.y).toBeGreaterThan(0);
  });

  it('falls back to the first clip for unknown names and ignores models without clips', () => {
    const root = animatedModel();
    const animator = EntityAnimator.create(root, defaultAnimator('Missing'), 'Test')!;
    animator.update(0, false);
    animator.update(0.5, false);
    expect(box(root).position.y).toBeCloseTo(0.5, 5);
    expect(EntityAnimator.create(new THREE.Group(), defaultAnimator(), 'Static')).toBeNull();
  });

  it('holds the last frame of a non-looping clip and respects speed', () => {
    const root = animatedModel();
    const animator = EntityAnimator.create(root, { ...defaultAnimator('Rise'), loop: false, speed: 2 }, 'Test')!;
    animator.update(0, false);
    animator.update(0.25, false);
    expect(box(root).position.y).toBeCloseTo(0.5, 5);
    animator.update(3, false);
    expect(box(root).position.y).toBeCloseTo(1, 5);
  });

  it('does nothing when idle playback is off and no move clip is set', () => {
    const root = animatedModel();
    const animator = EntityAnimator.create(root, { ...defaultAnimator('Rise'), playOnStart: false }, 'Test')!;
    animator.update(0.5, false);
    animator.update(0.5, true);
    expect(box(root).position.y).toBe(0);
  });
});

describe('SceneView animation', () => {
  function setup(): { view: SceneView; scene: SceneDocument; id: string } {
    const scene = createEmptyScene();
    const e = createEntity('Hero', { model: { assetId: 'a_hero', castShadow: false, receiveShadow: false }, animator: defaultAnimator() });
    scene.entities[e.id] = e;
    scene.rootIds.push(e.id);
    const assets = { model: async () => animatedModel(), texture: async () => null } as unknown as AssetCache;
    const view = new SceneView({ editor: false, geometry: new GeometryCache('low'), assets, quality: () => QUALITY_PRESETS.low, onAsyncChange: () => undefined });
    view.build(scene);
    return { view, scene, id: e.id };
  }

  it('animates models only while playing', async () => {
    const { view, id } = setup();
    await new Promise((r) => setTimeout(r, 0));
    const content = view.node(id)!.content!;
    view.updateAnimations(0.5, () => 0);
    expect(box(content).position.y).toBe(0);

    view.setPlaying(true);
    view.updateAnimations(0, () => 0);
    view.updateAnimations(0.5, () => 0);
    expect(box(content).position.y).toBeCloseTo(0.5, 5);

    view.setPlaying(false);
    expect(box(content).position.y).toBe(0);
    view.dispose();
  });

  it('starts animators for models that finish loading after play starts', async () => {
    const { view, id } = setup();
    view.setPlaying(true);
    await new Promise((r) => setTimeout(r, 0));
    view.updateAnimations(0, () => 0);
    view.updateAnimations(0.25, () => 0);
    expect(box(view.node(id)!.content!).position.y).toBeCloseTo(0.25, 5);
    view.dispose();
  });
});
