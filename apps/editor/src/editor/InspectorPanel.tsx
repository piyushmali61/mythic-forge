import {
  BEHAVIOUR_INFO,
  LIGHT_TYPES,
  PRIMITIVE_LABELS,
  PRIMITIVE_TYPES,
  defaultAnimator,
  defaultBehaviour,
  defaultCamera,
  defaultCollider,
  defaultLight,
  defaultMaterial,
  defaultRigidBody,
  primitiveColliderSize,
  type AnimatorComponent,
  type BehaviourDef,
  type BehaviourType,
  type Components,
  type Entity,
  type LightType,
  type MaterialDef,
  type PrimitiveType,
} from '@mythic-forge/core';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { svc } from '../app/state.ts';
import { IconButton, Menu, type MenuItem } from '../ui/common.tsx';
import { ColorInput, NumberInput, Prop, Select, SliderInput, Vec3Input, type EditPhase } from '../ui/fields.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import type { EditorSession } from './session.ts';

type Upd = <K extends keyof Components>(key: K, value: Components[K] | undefined, label: string, phase?: EditPhase, field?: string) => void;

function Section({ title, icon, onRemove, children }: { title: string; icon: IconName; onRemove?: () => void; children: ComponentChildren }) {
  const [open, setOpen] = useState(true);
  return (
    <section class="component" aria-label={title}>
      <div class="component-header">
        <button type="button" class="tree-toggle" aria-expanded={open} aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        </button>
        <Icon name={icon} size={15} />
        <span>{title}</span>
        <span class="spacer" />
        {onRemove && <IconButton icon="x" size={14} label={`Remove ${title}`} onClick={onRemove} />}
      </div>
      {open && <div class="component-body">{children}</div>}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="checkbox">
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function InspectorPanel({ session }: { session: EditorSession }) {
  void session.revision.value;
  const id = session.selection.value;
  const entity = id ? session.scene.get(id) : undefined;
  if (!entity) return <SceneInspector session={session} />;
  return <EntityInspector key={entity.id} session={session} entity={entity} />;
}

function EntityInspector({ session, entity: e }: { session: EditorSession; entity: Readonly<Entity> }) {
  // Entities are mutated in place, so props alone don't change; subscribe to scene revisions
  // (signal-aware components skip re-renders when props are shallow-equal).
  void session.revision.value;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const c = e.components;
  const upd: Upd = (key, value, label, phase = 'commit', field = '') => session.updateComponent(e.id, key, value, label, phase, field);
  const disabled = session.playState.value !== 'edit';

  const addItems: MenuItem[] = [
    { label: 'Mesh (shape)', icon: 'cube', disabled: !!c.mesh || !!c.model, onSelect: () => upd('mesh', { primitive: 'cube', castShadow: true, receiveShadow: true }, 'Add mesh') },
    { label: 'Material', icon: 'material', disabled: !!c.material || !c.mesh, onSelect: () => upd('material', defaultMaterial(), 'Add material') },
    { label: 'Light', icon: 'light', disabled: !!c.light, onSelect: () => upd('light', defaultLight('point'), 'Add light') },
    { label: 'Camera', icon: 'camera', disabled: !!c.camera, onSelect: () => upd('camera', defaultCamera(false), 'Add camera') },
    { label: 'Collider', icon: 'collider', disabled: !!c.collider, onSelect: () => upd('collider', fitCollider(session, e), 'Add collider') },
    { label: 'Rigid Body', icon: 'physics', disabled: !!c.rigidBody, onSelect: () => upd('rigidBody', defaultRigidBody(), 'Add rigid body') },
    { label: 'Animator', icon: 'play', disabled: !!c.animator || !c.model, onSelect: () => upd('animator', defaultAnimator(), 'Add animator') },
    {
      label: 'Audio Source',
      icon: 'music',
      disabled: !!c.audioSource || !session.assets.value.some((a) => a.kind === 'audio'),
      onSelect: () => {
        const first = session.assets.value.find((a) => a.kind === 'audio');
        if (first) upd('audioSource', { assetId: first.id, volume: 1, loop: false, playOnStart: true }, 'Add audio source');
      },
    },
    { separator: true, label: 'sep' },
    { heading: true, label: 'Behaviours' },
    ...(Object.keys(BEHAVIOUR_INFO) as BehaviourType[]).map((type) => ({
      label: BEHAVIOUR_INFO[type].label,
      icon: 'behaviour' as const,
      disabled: (c.behaviours ?? []).some((b) => b.type === type),
      onSelect: () => {
        const b = defaultBehaviour(type);
        if (b.type === 'followCamera') {
          const player = session.scene.all().find((x) => x.components.behaviours?.some((y) => y.type === 'playerController'));
          b.targetId = player?.id ?? null;
        }
        upd('behaviours', [...(c.behaviours ?? []), b], `Add ${BEHAVIOUR_INFO[type].label}`);
      },
    })),
  ];

  return (
    <fieldset class="inspector" disabled={disabled} style={{ border: 0, margin: 0, minWidth: 0 }}>
      <div class="inspector-name">
        <input
          type="checkbox"
          aria-label="Enabled"
          title="Enabled"
          checked={e.enabled}
          onChange={(ev) => session.setFlag(e.id, 'enabled', ev.currentTarget.checked)}
          style={{ width: '18px', height: '18px', accentColor: 'var(--gold)' }}
        />
        <input
          class="input"
          aria-label="Object name"
          value={e.name}
          maxLength={120}
          onChange={(ev) => session.rename(e.id, ev.currentTarget.value)}
          onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
        />
      </div>
      <div class="row wrap" style={{ marginBottom: '8px', gap: '12px' }}>
        <Check label="Static" checked={e.isStatic} onChange={(v) => session.setFlag(e.id, 'isStatic', v)} />
        <Check label="Locked" checked={e.locked} onChange={(v) => session.setFlag(e.id, 'locked', v)} />
      </div>

      <Section title="Transform" icon="transform">
        <Prop label="Position">
          <Vec3Input label="Position" value={e.transform.position} onChange={(v, phase) => session.updateTransform(e.id, { ...e.transform, position: v }, phase, 'position')} />
        </Prop>
        <Prop label="Rotation (°)">
          <Vec3Input label="Rotation" step={1} precision={2} value={e.transform.rotation} onChange={(v, phase) => session.updateTransform(e.id, { ...e.transform, rotation: v }, phase, 'rotation')} />
        </Prop>
        <Prop label="Scale">
          <Vec3Input label="Scale" step={0.05} value={e.transform.scale} onChange={(v, phase) => session.updateTransform(e.id, { ...e.transform, scale: v }, phase, 'scale')} />
        </Prop>
      </Section>

      {c.mesh && (
        <Section title="Mesh" icon="cube" onRemove={() => upd('mesh', undefined, 'Remove mesh')}>
          <Prop label="Shape">
            <Select<PrimitiveType>
              small
              label="Shape"
              value={c.mesh.primitive}
              options={PRIMITIVE_TYPES.map((p) => ({ value: p, label: PRIMITIVE_LABELS[p] }))}
              onChange={(v) => upd('mesh', { ...c.mesh!, primitive: v }, 'Change shape')}
            />
          </Prop>
          <Check label="Cast shadows" checked={c.mesh.castShadow} onChange={(v) => upd('mesh', { ...c.mesh!, castShadow: v }, 'Shadows')} />
          <Check label="Receive shadows" checked={c.mesh.receiveShadow} onChange={(v) => upd('mesh', { ...c.mesh!, receiveShadow: v }, 'Shadows')} />
        </Section>
      )}

      {c.model && (
        <Section title="Model" icon="model" onRemove={() => upd('model', undefined, 'Remove model')}>
          <Prop label="Asset">
            <Select
              small
              label="Model asset"
              value={c.model.assetId}
              options={[
                ...session.assets.value.filter((a) => a.kind === 'model').map((a) => ({ value: a.id, label: a.name })),
                ...(session.assets.value.some((a) => a.id === c.model!.assetId) ? [] : [{ value: c.model.assetId, label: 'Missing asset' }]),
              ]}
              onChange={(v) => upd('model', { ...c.model!, assetId: v }, 'Change model')}
            />
          </Prop>
          <Check label="Cast shadows" checked={c.model.castShadow} onChange={(v) => upd('model', { ...c.model!, castShadow: v }, 'Shadows')} />
          <Check label="Receive shadows" checked={c.model.receiveShadow} onChange={(v) => upd('model', { ...c.model!, receiveShadow: v }, 'Shadows')} />
        </Section>
      )}

      {c.animator && <AnimatorEditor session={session} entity={e} animator={c.animator} upd={upd} />}

      {c.material && <MaterialEditor session={session} material={c.material} upd={upd} />}
      {c.light && <LightEditor light={c.light} upd={upd} />}

      {c.camera && (
        <Section title="Camera" icon="camera" onRemove={() => upd('camera', undefined, 'Remove camera')}>
          <Prop label="Projection">
            <Select
              small
              label="Projection"
              value={c.camera.projection}
              options={[
                { value: 'perspective', label: 'Perspective' },
                { value: 'orthographic', label: 'Orthographic (2D)' },
              ]}
              onChange={(v) => upd('camera', { ...c.camera!, projection: v }, 'Camera projection')}
            />
          </Prop>
          {c.camera.projection === 'perspective' ? (
            <Prop label="Field of view">
              <SliderInput label="Field of view" min={20} max={120} step={1} value={c.camera.fov} onChange={(v, p) => upd('camera', { ...c.camera!, fov: v }, 'Field of view', p, 'fov')} />
            </Prop>
          ) : (
            <Prop label="View size">
              <NumberInput ariaLabel="Orthographic size" value={c.camera.orthoSize} min={0.1} step={0.5} onChange={(v, p) => upd('camera', { ...c.camera!, orthoSize: v }, 'View size', p, 'ortho')} />
            </Prop>
          )}
          <Prop label="Near / far">
            <div class="vec3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <NumberInput ariaLabel="Near plane" value={c.camera.near} min={0.01} step={0.05} onChange={(v, p) => upd('camera', { ...c.camera!, near: v }, 'Near plane', p, 'near')} />
              <NumberInput ariaLabel="Far plane" value={c.camera.far} min={1} step={10} onChange={(v, p) => upd('camera', { ...c.camera!, far: v }, 'Far plane', p, 'far')} />
            </div>
          </Prop>
          <Check
            label="Main camera (used in play mode)"
            checked={c.camera.isMain}
            onChange={(v) => {
              upd('camera', { ...c.camera!, isMain: v }, 'Main camera');
              if (v) {
                for (const other of session.scene.all()) {
                  if (other.id !== e.id && other.components.camera?.isMain) {
                    session.updateComponent(other.id, 'camera', { ...other.components.camera, isMain: false }, 'Main camera');
                  }
                }
              }
            }}
          />
        </Section>
      )}

      {c.collider && (
        <Section title="Collider" icon="collider" onRemove={() => upd('collider', undefined, 'Remove collider')}>
          <Prop label="Size">
            <Vec3Input label="Collider size" min={0} value={c.collider.size} onChange={(v, p) => upd('collider', { ...c.collider!, size: v }, 'Collider size', p, 'size')} />
          </Prop>
          <Prop label="Center">
            <Vec3Input label="Collider center" value={c.collider.center} onChange={(v, p) => upd('collider', { ...c.collider!, center: v }, 'Collider center', p, 'center')} />
          </Prop>
          <Check label="Trigger (detects touch, doesn't block)" checked={c.collider.isTrigger} onChange={(v) => upd('collider', { ...c.collider!, isTrigger: v }, 'Trigger')} />
          <button type="button" class="btn btn-sm" onClick={() => upd('collider', { ...fitCollider(session, e), isTrigger: c.collider!.isTrigger }, 'Fit collider')}>
            Fit to object
          </button>
        </Section>
      )}

      {c.rigidBody && (
        <Section title="Rigid Body" icon="physics" onRemove={() => upd('rigidBody', undefined, 'Remove rigid body')}>
          <Prop label="Mass (kg)">
            <NumberInput ariaLabel="Mass" value={c.rigidBody.mass} min={0.001} step={0.1} onChange={(v, p) => upd('rigidBody', { ...c.rigidBody!, mass: v }, 'Mass', p, 'mass')} />
          </Prop>
          <Check label="Use gravity" checked={c.rigidBody.useGravity} onChange={(v) => upd('rigidBody', { ...c.rigidBody!, useGravity: v }, 'Gravity')} />
          <Check label="Kinematic (moved only by behaviours)" checked={c.rigidBody.isKinematic} onChange={(v) => upd('rigidBody', { ...c.rigidBody!, isKinematic: v }, 'Kinematic')} />
          {!c.collider && <p class="dim" style={{ fontSize: '0.84em' }}>Add a Collider so this body can collide.</p>}
          {e.parent !== null && <p class="dim" style={{ fontSize: '0.84em' }}>Physics only simulates objects at the scene root.</p>}
          <p class="dim" style={{ fontSize: '0.84em' }}>Simple character physics: gravity, ground, walls and steps. Rotation and object stacking are not simulated.</p>
        </Section>
      )}

      {c.audioSource && (
        <Section title="Audio Source" icon="music" onRemove={() => upd('audioSource', undefined, 'Remove audio')}>
          <Prop label="Sound">
            <Select
              small
              label="Sound"
              value={c.audioSource.assetId}
              options={session.assets.value.filter((a) => a.kind === 'audio').map((a) => ({ value: a.id, label: a.name }))}
              onChange={(v) => upd('audioSource', { ...c.audioSource!, assetId: v }, 'Sound')}
            />
          </Prop>
          <Prop label="Volume">
            <SliderInput label="Volume" min={0} max={1} step={0.05} value={c.audioSource.volume} onChange={(v, p) => upd('audioSource', { ...c.audioSource!, volume: v }, 'Volume', p, 'volume')} />
          </Prop>
          <Check label="Play on start" checked={c.audioSource.playOnStart} onChange={(v) => upd('audioSource', { ...c.audioSource!, playOnStart: v }, 'Play on start')} />
          <Check label="Loop" checked={c.audioSource.loop} onChange={(v) => upd('audioSource', { ...c.audioSource!, loop: v }, 'Loop')} />
        </Section>
      )}

      {(c.behaviours ?? []).map((b, i) => (
        <BehaviourEditor
          key={`${b.type}-${i}`}
          session={session}
          entityId={e.id}
          behaviour={b}
          onChange={(next, phase) => {
            const list = [...(c.behaviours ?? [])];
            list[i] = next;
            upd('behaviours', list, BEHAVIOUR_INFO[b.type].label, phase, `${b.type}`);
          }}
          onRemove={() => {
            const list = (c.behaviours ?? []).filter((_, j) => j !== i);
            upd('behaviours', list.length ? list : undefined, `Remove ${BEHAVIOUR_INFO[b.type].label}`);
          }}
        />
      ))}

      <button
        type="button"
        class="btn btn-block"
        onClick={(ev) => {
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icon name="plus" /> Add component
      </button>
      {menu && <Menu label="Add component" items={addItems} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </fieldset>
  );
}

function fitCollider(session: EditorSession, e: Readonly<Entity>) {
  const c = e.components;
  if (c.mesh) return defaultCollider(primitiveColliderSize(c.mesh.primitive));
  const meta = c.model ? session.assets.value.find((a) => a.id === c.model!.assetId) : undefined;
  const min = meta?.stats.boundsMin;
  const max = meta?.stats.boundsMax;
  if (min && max) {
    const r = (v: number): number => Math.round(v * 1000) / 1000;
    return {
      ...defaultCollider([r(max[0] - min[0]), r(max[1] - min[1]), r(max[2] - min[2])]),
      center: [r((max[0] + min[0]) / 2), r((max[1] + min[1]) / 2), r((max[2] + min[2]) / 2)] as [number, number, number],
    };
  }
  return defaultCollider();
}

function MaterialEditor({ session, material: m, upd }: { session: EditorSession; material: MaterialDef; upd: Upd }) {
  const presets = svc()
    .catalogs.items.value.filter((i) => i.entry.kind === 'material' && svc().catalogs.usable(i))
    .map((i) => i.entry);
  const textures = session.assets.value.filter((a) => a.kind === 'texture');
  const set = (patch: Partial<MaterialDef>, label: string, phase: EditPhase = 'commit', field = ''): void => upd('material', { ...m, ...patch }, label, phase, field);
  return (
    <Section title="Material" icon="material" onRemove={() => upd('material', undefined, 'Remove material')}>
      {presets.length > 0 && (
        <Prop label="Preset">
          <Select
            small
            label="Material preset"
            value={m.presetId ?? ''}
            options={[{ value: '', label: 'Custom' }, ...presets.map((p) => ({ value: p.id, label: p.name }))]}
            onChange={(id) => {
              const p = presets.find((x) => x.id === id)?.material;
              if (!p) return set({ presetId: null }, 'Material preset');
              set({ presetId: id, ...p }, 'Material preset');
            }}
          />
        </Prop>
      )}
      <Prop label="Colour">
        <ColorInput label="Colour" value={m.color} onChange={(v, p) => set({ color: v, presetId: null }, 'Colour', p, 'color')} />
      </Prop>
      <Prop label="Metalness">
        <SliderInput label="Metalness" min={0} max={1} step={0.01} value={m.metalness} onChange={(v, p) => set({ metalness: v, presetId: null }, 'Metalness', p, 'metal')} />
      </Prop>
      <Prop label="Roughness">
        <SliderInput label="Roughness" min={0} max={1} step={0.01} value={m.roughness} onChange={(v, p) => set({ roughness: v, presetId: null }, 'Roughness', p, 'rough')} />
      </Prop>
      <Prop label="Glow colour">
        <ColorInput label="Emissive colour" value={m.emissive} onChange={(v, p) => set({ emissive: v }, 'Glow colour', p, 'emissive')} />
      </Prop>
      <Prop label="Glow strength">
        <SliderInput label="Emissive strength" min={0} max={10} step={0.1} value={m.emissiveIntensity} onChange={(v, p) => set({ emissiveIntensity: v }, 'Glow', p, 'emi')} />
      </Prop>
      <Prop label="Opacity">
        <SliderInput label="Opacity" min={0} max={1} step={0.01} value={m.opacity} onChange={(v, p) => set({ opacity: v }, 'Opacity', p, 'opacity')} />
      </Prop>
      <Prop label="Texture">
        <Select
          small
          label="Texture"
          value={m.textureAssetId ?? ''}
          options={[{ value: '', label: textures.length ? 'None' : 'None (import an image first)' }, ...textures.map((t) => ({ value: t.id, label: t.name }))]}
          onChange={(v) => set({ textureAssetId: v || null }, 'Texture')}
        />
      </Prop>
      {m.textureAssetId && (
        <Prop label="Tiling">
          <div class="vec3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <NumberInput ariaLabel="Tiling U" label="U" value={m.textureRepeat[0]} min={0.01} step={0.1} onChange={(v, p) => set({ textureRepeat: [v, m.textureRepeat[1]] }, 'Tiling', p, 'tu')} />
            <NumberInput ariaLabel="Tiling V" label="V" value={m.textureRepeat[1]} min={0.01} step={0.1} onChange={(v, p) => set({ textureRepeat: [m.textureRepeat[0], v] }, 'Tiling', p, 'tv')} />
          </div>
        </Prop>
      )}
      <Check label="Double-sided" checked={m.doubleSided} onChange={(v) => set({ doubleSided: v }, 'Double-sided')} />
      <Check label="Flat shading (low-poly look)" checked={m.flatShading} onChange={(v) => set({ flatShading: v }, 'Flat shading')} />
    </Section>
  );
}

function LightEditor({ light: l, upd }: { light: NonNullable<Components['light']>; upd: Upd }) {
  const set = (patch: Partial<typeof l>, label: string, phase: EditPhase = 'commit', field = ''): void => upd('light', { ...l, ...patch }, label, phase, field);
  const labels: Record<LightType, string> = { directional: 'Sun (directional)', point: 'Point', spot: 'Spot', hemisphere: 'Sky (hemisphere)' };
  return (
    <Section title="Light" icon="light" onRemove={() => upd('light', undefined, 'Remove light')}>
      <Prop label="Type">
        <Select<LightType>
          small
          label="Light type"
          value={l.type}
          options={LIGHT_TYPES.map((t) => ({ value: t, label: labels[t] }))}
          onChange={(v) => upd('light', { ...defaultLight(v), color: l.color }, 'Light type')}
        />
      </Prop>
      <Prop label="Colour">
        <ColorInput label="Light colour" value={l.color} onChange={(v, p) => set({ color: v }, 'Light colour', p, 'color')} />
      </Prop>
      <Prop label="Intensity">
        <SliderInput label="Intensity" min={0} max={l.type === 'point' || l.type === 'spot' ? 100 : 10} step={0.1} value={l.intensity} onChange={(v, p) => set({ intensity: v }, 'Intensity', p, 'int')} />
      </Prop>
      {(l.type === 'point' || l.type === 'spot') && (
        <Prop label="Range (m)">
          <NumberInput ariaLabel="Range" value={l.range} min={0} step={0.5} onChange={(v, p) => set({ range: v }, 'Range', p, 'range')} />
        </Prop>
      )}
      {l.type === 'spot' && (
        <Prop label="Cone angle">
          <SliderInput label="Cone angle" min={1} max={89} step={1} value={l.angle} onChange={(v, p) => set({ angle: v }, 'Cone angle', p, 'angle')} />
        </Prop>
      )}
      {l.type === 'hemisphere' && (
        <Prop label="Ground colour">
          <ColorInput label="Ground colour" value={l.groundColor} onChange={(v, p) => set({ groundColor: v }, 'Ground colour', p, 'ground')} />
        </Prop>
      )}
      {l.type !== 'hemisphere' && (
        <Check label="Cast shadows" checked={l.castShadow} onChange={(v) => set({ castShadow: v }, 'Light shadows')} />
      )}
      {l.type === 'point' && l.castShadow && <p class="dim" style={{ fontSize: '0.84em' }}>Point-light shadows are expensive and only render on High quality or above.</p>}
    </Section>
  );
}

function BehaviourEditor({
  session,
  entityId,
  behaviour: b,
  onChange,
  onRemove,
}: {
  session: EditorSession;
  entityId: string;
  behaviour: BehaviourDef;
  onChange: (b: BehaviourDef, phase: EditPhase) => void;
  onRemove: () => void;
}) {
  const info = BEHAVIOUR_INFO[b.type];
  return (
    <Section title={info.label} icon="behaviour" onRemove={onRemove}>
      <p class="dim" style={{ fontSize: '0.84em', marginTop: 0 }}>
        {info.description}
      </p>
      {b.type === 'rotate' && (
        <>
          <Prop label="Axis">
            <Select
              small
              label="Axis"
              value={b.axis}
              options={[
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y (up)' },
                { value: 'z', label: 'Z' },
              ]}
              onChange={(v) => onChange({ ...b, axis: v }, 'commit')}
            />
          </Prop>
          <Prop label="Speed (°/s)">
            <NumberInput ariaLabel="Rotation speed" value={b.speed} step={5} onChange={(v, p) => onChange({ ...b, speed: v }, p)} />
          </Prop>
        </>
      )}
      {b.type === 'bob' && (
        <>
          <Prop label="Height (m)">
            <NumberInput ariaLabel="Bob height" value={b.amplitude} min={0} step={0.05} onChange={(v, p) => onChange({ ...b, amplitude: v }, p)} />
          </Prop>
          <Prop label="Speed (Hz)">
            <NumberInput ariaLabel="Bob speed" value={b.frequency} min={0} step={0.05} onChange={(v, p) => onChange({ ...b, frequency: v }, p)} />
          </Prop>
        </>
      )}
      {b.type === 'playerController' && (
        <>
          <Prop label="Style">
            <Select
              small
              label="Controller style"
              value={b.mode}
              options={[
                { value: 'third-person', label: 'Third person' },
                { value: 'first-person', label: 'First person' },
                { value: 'platformer', label: 'Platformer (side-on)' },
              ]}
              onChange={(v) => onChange({ ...b, mode: v }, 'commit')}
            />
          </Prop>
          <Prop label="Move speed">
            <NumberInput ariaLabel="Move speed" value={b.moveSpeed} min={0} step={0.5} onChange={(v, p) => onChange({ ...b, moveSpeed: v }, p)} />
          </Prop>
          <Prop label="Jump speed">
            <NumberInput ariaLabel="Jump speed" value={b.jumpSpeed} min={0} step={0.5} onChange={(v, p) => onChange({ ...b, jumpSpeed: v }, p)} />
          </Prop>
          {b.mode === 'first-person' && (
            <Prop label="Look speed">
              <NumberInput ariaLabel="Look sensitivity" value={b.lookSensitivity} min={0.01} step={0.05} onChange={(v, p) => onChange({ ...b, lookSensitivity: v }, p)} />
            </Prop>
          )}
        </>
      )}
      {b.type === 'followCamera' && (
        <>
          <Prop label="Target">
            <Select
              small
              label="Follow target"
              value={b.targetId ?? ''}
              options={[{ value: '', label: 'None' }, ...session.scene.ordered().filter((x) => x.id !== entityId).map((x) => ({ value: x.id, label: x.name }))]}
              onChange={(v) => onChange({ ...b, targetId: v || null }, 'commit')}
            />
          </Prop>
          <Prop label="Distance">
            <NumberInput ariaLabel="Follow distance" value={b.distance} min={0} step={0.5} onChange={(v, p) => onChange({ ...b, distance: v }, p)} />
          </Prop>
          <Prop label="Height">
            <NumberInput ariaLabel="Follow height" value={b.height} step={0.5} onChange={(v, p) => onChange({ ...b, height: v }, p)} />
          </Prop>
          <Prop label="Smoothing">
            <NumberInput ariaLabel="Follow smoothing" value={b.smoothing} min={0.1} step={0.5} onChange={(v, p) => onChange({ ...b, smoothing: v }, p)} />
          </Prop>
        </>
      )}
      {b.type === 'collectible' && (
        <>
          <Prop label="Score">
            <NumberInput ariaLabel="Score value" value={b.scoreValue} step={1} precision={0} onChange={(v, p) => onChange({ ...b, scoreValue: Math.round(v) }, p)} />
          </Prop>
          <Prop label="Sound">
            <Select
              small
              label="Collect sound"
              value={b.soundAssetId ?? ''}
              options={[{ value: '', label: 'None' }, ...session.assets.value.filter((a) => a.kind === 'audio').map((a) => ({ value: a.id, label: a.name }))]}
              onChange={(v) => onChange({ ...b, soundAssetId: v || null }, 'commit')}
            />
          </Prop>
        </>
      )}
    </Section>
  );
}

function SceneInspector({ session }: { session: EditorSession }) {
  void session.revision.value;
  const doc = session.scene.document;
  const env = doc.environment;
  const hud = doc.hud;
  const setEnv = (patch: Partial<typeof env>, phase: EditPhase, field: string): void => session.updateEnvironment({ ...env, ...patch }, phase, field);
  return (
    <fieldset class="inspector" disabled={session.playState.value !== 'edit'} style={{ border: 0, margin: 0, minWidth: 0 }}>
      <p class="dim" style={{ marginTop: 0 }}>
        Nothing selected. These settings apply to the whole scene.
      </p>
      <Section title="Environment" icon="globe">
        <Prop label="Background">
          <ColorInput label="Background colour" value={env.background} onChange={(v, p) => setEnv({ background: v }, p, 'bg')} />
        </Prop>
        <Prop label="Ambient light">
          <ColorInput label="Ambient colour" value={env.ambientColor} onChange={(v, p) => setEnv({ ambientColor: v }, p, 'amb')} />
        </Prop>
        <Prop label="Ambient strength">
          <SliderInput label="Ambient strength" min={0} max={3} step={0.05} value={env.ambientIntensity} onChange={(v, p) => setEnv({ ambientIntensity: v }, p, 'ambi')} />
        </Prop>
        <Check label="Fog" checked={env.fogEnabled} onChange={(v) => setEnv({ fogEnabled: v }, 'commit', 'fog')} />
        {env.fogEnabled && (
          <>
            <Prop label="Fog colour">
              <ColorInput label="Fog colour" value={env.fogColor} onChange={(v, p) => setEnv({ fogColor: v }, p, 'fogc')} />
            </Prop>
            <Prop label="Fog start / end">
              <div class="vec3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <NumberInput ariaLabel="Fog start" value={env.fogNear} min={0} step={1} onChange={(v, p) => setEnv({ fogNear: v }, p, 'fogn')} />
                <NumberInput ariaLabel="Fog end" value={env.fogFar} min={0} step={1} onChange={(v, p) => setEnv({ fogFar: v }, p, 'fogf')} />
              </div>
            </Prop>
          </>
        )}
        <Prop label="Gravity (m/s²)">
          <NumberInput ariaLabel="Gravity" value={env.gravity} step={0.5} onChange={(v, p) => setEnv({ gravity: v }, p, 'grav')} />
        </Prop>
      </Section>
      <Section title="Game HUD" icon="sparkle">
        <div class="field">
          <label for="hud-title">Title shown while playing</label>
          <input id="hud-title" class="input" value={hud.title} maxLength={120} onChange={(e) => session.updateHud({ ...hud, title: e.currentTarget.value })} />
        </div>
        <Check label="Show score" checked={hud.showScore} onChange={(v) => session.updateHud({ ...hud, showScore: v })} />
        <div class="field">
          <label for="hud-win">Message when everything is collected</label>
          <input id="hud-win" class="input" value={hud.winMessage} maxLength={200} onChange={(e) => session.updateHud({ ...hud, winMessage: e.currentTarget.value })} />
        </div>
      </Section>
      <p class="dim" style={{ fontSize: '0.84em' }}>
        Custom UI layouts and scripted logic are planned. Today, games are built from behaviours (Add component → Behaviours).
      </p>
    </fieldset>
  );
}

function AnimatorEditor({ session, entity: e, animator: a, upd }: { session: EditorSession; entity: Readonly<Entity>; animator: AnimatorComponent; upd: Upd }) {
  const assetId = e.components.model?.assetId;
  const clips = session.assets.value.find((x) => x.id === assetId)?.stats.clips ?? [];
  const set = (patch: Partial<AnimatorComponent>, label: string, phase?: EditPhase, field?: string) => upd('animator', { ...a, ...patch }, label, phase, field);
  const clipOptions = (value: string, emptyLabel: string) => [
    { value: '', label: emptyLabel },
    ...clips.map((c) => ({ value: c.name, label: `${c.name} (${c.durationSec.toFixed(1)} s)` })),
    // Keep a clip name that the current model doesn't have visible instead of silently changing it.
    ...(value && !clips.some((c) => c.name === value) ? [{ value, label: `${value} (not in this model)` }] : []),
  ];
  const isPlayer = (e.components.behaviours ?? []).some((b) => b.type === 'playerController');
  return (
    <Section title="Animator" icon="play" onRemove={() => upd('animator', undefined, 'Remove animator')}>
      {!e.components.model ? (
        <p class="dim" style={{ fontSize: '0.84em' }}>Animators play clips from this object's model. Add a Model first.</p>
      ) : clips.length === 0 ? (
        <p class="dim" style={{ fontSize: '0.84em' }}>This model has no animation clips. Import a GLB, glTF or FBX file that contains animations.</p>
      ) : (
        <>
          <Prop label="Clip">
            <Select small label="Clip" value={a.clip} options={clipOptions(a.clip, 'First clip')} onChange={(v) => set({ clip: v }, 'Animation clip')} />
          </Prop>
          <Prop label="While moving">
            <Select small label="Clip while moving" value={a.moveClip} options={clipOptions(a.moveClip, 'Same clip')} onChange={(v) => set({ moveClip: v }, 'Move clip')} />
          </Prop>
          {a.moveClip && !isPlayer && <p class="dim" style={{ fontSize: '0.84em' }}>The move clip plays while a Player Controller moves this object.</p>}
          <Prop label="Speed">
            <SliderInput label="Animation speed" min={0} max={3} step={0.05} value={a.speed} onChange={(v, p) => set({ speed: v }, 'Animation speed', p, 'speed')} />
          </Prop>
          <Check label="Play clip when idle" checked={a.playOnStart} onChange={(v) => set({ playOnStart: v }, 'Play clip')} />
          <Check label="Loop" checked={a.loop} onChange={(v) => set({ loop: v }, 'Loop animation')} />
        </>
      )}
      <p class="dim" style={{ fontSize: '0.84em' }}>Animations play in play mode and in exported games.</p>
    </Section>
  );
}
