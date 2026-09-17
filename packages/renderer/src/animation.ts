import { log, type AnimatorComponent } from '@mythic-forge/core';
import * as THREE from 'three';

/** Cross-fade length when the animator switches clips. */
const FADE_SECONDS = 0.25;
/** Horizontal speed (m/s) above which an entity counts as moving. */
export const MOVING_SPEED = 0.2;

/**
 * Plays one entity's model animations. Animators exist only while the game runs (play mode and
 * exported games), so the editor never spends frames on them. `stop` restores the model's pose.
 */
export class EntityAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly root: THREE.Object3D;
  private readonly clips: readonly THREE.AnimationClip[];
  private readonly def: Readonly<AnimatorComponent>;
  private readonly entityName: string;
  private current: THREE.AnimationAction | null = null;
  private currentClip: THREE.AnimationClip | null = null;
  private readonly warned = new Set<string>();

  private constructor(root: THREE.Object3D, def: Readonly<AnimatorComponent>, entityName: string) {
    this.root = root;
    this.clips = root.animations;
    this.def = def;
    this.entityName = entityName;
    this.mixer = new THREE.AnimationMixer(root);
  }

  /** Returns null when the model has no animation clips. */
  static create(root: THREE.Object3D, def: Readonly<AnimatorComponent>, entityName: string): EntityAnimator | null {
    if (root.animations.length === 0) {
      log.warn('Animation', `"${entityName}" has an Animator, but its model contains no animation clips.`);
      return null;
    }
    return new EntityAnimator(root, def, entityName);
  }

  /** Advances the animation. `moving` selects the move clip when one is set. */
  update(dt: number, moving: boolean): void {
    const wanted = moving && this.def.moveClip ? this.find(this.def.moveClip) : this.def.playOnStart ? this.find(this.def.clip) : null;
    if (wanted !== this.currentClip) this.switchTo(wanted);
    this.mixer.update(dt);
  }

  stop(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.current = null;
    this.currentClip = null;
  }

  private switchTo(clip: THREE.AnimationClip | null): void {
    const previous = this.current;
    this.currentClip = clip;
    this.current = null;
    if (clip) {
      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(this.def.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !this.def.loop;
      action.timeScale = this.def.speed;
      if (previous) action.fadeIn(FADE_SECONDS);
      action.play();
      this.current = action;
    }
    if (previous && previous !== this.current) previous.fadeOut(FADE_SECONDS);
  }

  /** Empty name = first clip. A missing name falls back to the first clip (reported once). */
  private find(name: string): THREE.AnimationClip {
    const first = this.clips[0]!;
    if (!name) return first;
    const clip = THREE.AnimationClip.findByName(this.clips as THREE.AnimationClip[], name);
    if (clip) return clip;
    if (!this.warned.has(name)) {
      this.warned.add(name);
      log.warn('Animation', `"${this.entityName}": the model has no clip named "${name}"; playing "${first.name}" instead.`);
    }
    return first;
  }
}
