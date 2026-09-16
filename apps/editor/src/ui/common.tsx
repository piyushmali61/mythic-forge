import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from './Icon.tsx';

export function Badge({ kind, children, icon }: { kind?: 'gold' | 'success' | 'warning' | 'danger' | 'info'; children: ComponentChildren; icon?: IconName }) {
  return (
    <span class={`badge ${kind ?? ''}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ComponentChildren }) {
  const icon: IconName = kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return (
    <div class={`callout ${kind}`} role={kind === 'danger' ? 'alert' : 'note'}>
      <Icon name={icon} />
      <div>
        {title && <strong>{title}</strong>}
        {title && <br />}
        {children}
      </div>
    </div>
  );
}

/** Marks a control or feature that does not exist yet (§101). */
export function NotImplemented({ label = 'Not implemented' }: { label?: string }) {
  return (
    <span class="not-implemented" title="This feature is not available in this version of Mythic Forge.">
      {label}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty-state">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} type="button" onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  size = 18,
  class: className,
}: {
  icon: IconName;
  label: string;
  onClick?: (e: MouseEvent) => void;
  pressed?: boolean;
  disabled?: boolean;
  size?: number;
  class?: string;
}) {
  return (
    <button
      type="button"
      class={`icon-btn ${className ?? ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && ref.current) {
        const focusables = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.hasAttribute('disabled'),
        );
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (!firstEl || !lastEl) return;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);
  const onBackdrop = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div class="modal-backdrop" onMouseDown={onBackdrop}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div class="modal-header">
          <h2>{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <section class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-handle">
          <h2>{title}</h2>
          {actions}
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div class="sheet-body">{children}</div>
      </section>
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  separator?: boolean;
  heading?: boolean;
}

/** Popup menu anchored to a point. Closes on outside click, Escape, or selection. */
export function Menu({ items, x, y, onClose, label }: { items: MenuItem[]; x: number; y: number; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      if (rect.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div class="menu" role="menu" aria-label={label} ref={ref} style={{ left: `${x}px`, top: `${y}px` }}>
      {items.map((item, i) =>
        item.separator ? (
          <hr key={`sep-${i}`} />
        ) : item.heading ? (
          <div key={`h-${i}`} class="menu-heading">
            {item.label}
          </div>
        ) : (
          <button
            key={item.label}
            role="menuitem"
            type="button"
            disabled={item.disabled}
            style={item.danger ? { color: 'var(--danger)' } : undefined}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            {item.icon ? <Icon name={item.icon} size={16} /> : <span style={{ width: '16px' }} />}
            <span>{item.label}</span>
            {item.shortcut && <span class="menu-shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
