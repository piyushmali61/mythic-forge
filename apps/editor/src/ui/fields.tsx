import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export type EditPhase = 'live' | 'commit';

const clamp = (v: number, min?: number, max?: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

const fmt = (v: number, precision: number): string => {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(precision);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

/**
 * Numeric input. Type a value (Enter/blur commits), use arrow keys to step,
 * or drag the label left/right to scrub.
 */
export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  precision = 3,
  axis,
  label,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number, phase: EditPhase) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  axis?: 'x' | 'y' | 'z';
  label?: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState(fmt(value, precision));
  const [focused, setFocused] = useState(false);
  const drag = useRef<{ startX: number; startValue: number; id: number } | null>(null);

  useEffect(() => {
    if (!focused) setText(fmt(value, precision));
  }, [value, focused, precision]);

  const commit = (): void => {
    const parsed = Number.parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      const v = clamp(parsed, min, max);
      if (v !== value) onChange(v, 'commit');
      setText(fmt(v, precision));
    } else {
      setText(fmt(value, precision));
    }
  };

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setText(fmt(value, precision));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const v = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * mult, min, max);
      onChange(Number(v.toFixed(precision)), 'commit');
      setText(fmt(v, precision));
    }
  };

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLSpanElement>): void => {
    drag.current = { startX: e.clientX, startValue: value, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLSpanElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = (e.clientX - d.startX) * step * (e.shiftKey ? 10 : 1) * 0.25;
    const v = clamp(Number((d.startValue + delta).toFixed(precision)), min, max);
    onChange(v, 'live');
  };
  const onPointerUp = (e: JSX.TargetedPointerEvent<HTMLSpanElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.clientX !== d.startX) onChange(value, 'commit');
  };

  return (
    <div class="num">
      {(axis || label) && (
        <span
          class={axis ?? ''}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title="Drag to adjust"
          aria-hidden="true"
        >
          {axis ? axis.toUpperCase() : label}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export function Vec3Input({
  value,
  onChange,
  step = 0.1,
  label,
  precision = 3,
  min,
}: {
  value: readonly [number, number, number];
  onChange: (value: [number, number, number], phase: EditPhase) => void;
  step?: number;
  label: string;
  precision?: number;
  min?: number;
}) {
  const axes = ['x', 'y', 'z'] as const;
  return (
    <div class="vec3" role="group" aria-label={label}>
      {axes.map((axis, i) => (
        <NumberInput
          key={axis}
          axis={axis}
          ariaLabel={`${label} ${axis.toUpperCase()}`}
          value={value[i]!}
          step={step}
          precision={precision}
          {...(min !== undefined ? { min } : {})}
          onChange={(v, phase) => {
            const next: [number, number, number] = [value[0], value[1], value[2]];
            next[i] = v;
            onChange(next, phase);
          }}
        />
      ))}
    </div>
  );
}

export function Prop({ label, children, htmlFor }: { label: string; children: ComponentChildren; htmlFor?: string }) {
  return (
    <div class="prop">
      <label for={htmlFor} title={label}>
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string, phase: EditPhase) => void; label: string }) {
  return (
    <div class="color-row">
      <input
        type="color"
        aria-label={label}
        value={value}
        onInput={(e) => onChange(e.currentTarget.value, 'live')}
        onChange={(e) => onChange(e.currentTarget.value, 'commit')}
      />
      <span class="mono dim">{value}</span>
    </div>
  );
}

export function SliderInput({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number, phase: EditPhase) => void;
  label: string;
}) {
  return (
    <div class="slider-row">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value), 'live')}
        onChange={(e) => onChange(Number(e.currentTarget.value), 'commit')}
      />
      <NumberInput ariaLabel={label} value={value} min={min} max={max} step={step} precision={2} onChange={onChange} />
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch">
      <span>
        {label}
        {hint && <span class="field-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
  small,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  id?: string;
  small?: boolean;
}) {
  return (
    <select id={id} class={`input ${small ? 'small' : ''}`} aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
