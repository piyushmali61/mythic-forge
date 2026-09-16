import { useState } from 'preact/hooks';
import { dialog, dismissToast, toasts } from '../app/state.ts';
import { IconButton, Modal } from './common.tsx';
import { Icon } from './Icon.tsx';

export function DialogHost() {
  const d = dialog.value;
  const [typed, setTyped] = useState('');
  if (!d) return null;
  const finish = (id: string | null): void => {
    dialog.value = null;
    setTyped('');
    d.resolve(id);
  };
  const unlocked = !d.requireText || typed.trim() === d.requireText;
  return (
    <Modal
      title={d.title}
      onClose={() => finish(null)}
      footer={d.choices.map((c) => (
        <button
          key={c.id}
          type="button"
          class={`btn ${c.kind === 'primary' ? 'btn-primary' : c.kind === 'danger' ? 'btn-danger' : ''}`}
          disabled={c.guarded && !unlocked}
          onClick={() => finish(c.id)}
        >
          {c.label}
        </button>
      ))}
    >
      <div style={{ whiteSpace: 'pre-wrap' }} class={d.mono ? 'mono' : ''}>
        {d.body}
      </div>
      {d.requireText && (
        <div class="field" style={{ marginTop: '14px' }}>
          <label for="dlg-confirm">
            Type <strong>{d.requireText}</strong> to confirm
          </label>
          <input id="dlg-confirm" class="input" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} autoComplete="off" />
        </div>
      )}
    </Modal>
  );
}

export function ToastHost() {
  const list = toasts.value;
  if (list.length === 0) return null;
  return (
    <div class="toasts" role="region" aria-label="Notifications">
      {list.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'success' ? 'check' : t.kind === 'info' ? 'info' : 'alert'} />
          <div class="toast-body">
            <div>{t.message}</div>
            {t.detail && <div class="dim" style={{ fontSize: '0.86em', marginTop: '2px' }}>{t.detail}</div>}
            {t.actions && (
              <div class="row wrap" style={{ marginTop: '6px' }}>
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    class="btn btn-sm"
                    onClick={() => {
                      dismissToast(t.id);
                      a.run();
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton icon="x" label="Dismiss" size={14} onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
