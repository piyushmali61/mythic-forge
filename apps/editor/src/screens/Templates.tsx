import { KNOWN_LICENSES, PROJECT_TYPE_LABELS, TEMPLATES } from '@mythic-forge/core';
import { navigate } from '../app/state.ts';
import { Badge } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export function Templates() {
  return (
    <div class="page">
      <header class="page-header">
        <h1>Templates</h1>
      </header>
      <p class="muted">Every template is original work by Mythic Bharat Studios. Scenes you build from a template belong to you.</p>
      <div class="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {TEMPLATES.map((t) => (
          <article key={t.id} class="card col">
            <div class="row">
              <span class="tile-icon">
                <Icon name={t.editorMode === '2d' ? 'image' : t.requiredAssets.length ? 'sparkle' : 'template'} size={22} />
              </span>
              <h3 style={{ margin: 0, flex: 1 }}>{t.name}</h3>
            </div>
            <p class="muted" style={{ margin: 0 }}>
              {t.description}
            </p>
            <div class="row wrap" style={{ gap: '4px' }}>
              {t.projectTypes.map((type) => (
                <Badge key={type}>{PROJECT_TYPE_LABELS[type]}</Badge>
              ))}
              {t.editorMode === '2d' && <Badge kind="warning">Beta</Badge>}
              {t.requiredAssets.length > 0 && <Badge kind="gold">Uses official assets</Badge>}
            </div>
            <div class="dim" style={{ fontSize: '0.82em' }}>
              Licence: {KNOWN_LICENSES[t.license.licenseId]?.name ?? t.license.licenseId} · {t.license.note}
            </div>
            <div>
              <button type="button" class="btn btn-primary btn-sm" onClick={() => navigate({ name: 'new-project', templateId: t.id })}>
                Use template
              </button>
            </div>
          </article>
        ))}
      </div>
      <p class="dim" style={{ marginTop: '20px', fontSize: '0.86em' }}>
        More templates (driving, puzzle) are planned for later versions.
      </p>
    </div>
  );
}
