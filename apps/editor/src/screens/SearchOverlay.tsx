import { signal } from '@preact/signals';
import { SearchIndex, TEMPLATES, type SearchDocument, type SearchHit } from '@mythic-forge/core';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { openProject } from '../app/project-actions.ts';
import { navigate, projects, svc } from '../app/state.ts';
import { DOC_PAGES } from '../docs/index.ts';
import { Modal } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';

export const searchOpen = signal(false);

const KIND_ICON: Record<SearchDocument['kind'], IconName> = { project: 'folder', asset: 'cube', template: 'template', doc: 'book' };
const KIND_LABEL: Record<SearchDocument['kind'], string> = { project: 'Project', asset: 'Asset', template: 'Template', doc: 'Docs' };

/** Global search over local content. The index is built when the overlay opens, never in the background. */
export function SearchOverlay() {
  const [query, setQuery] = useState('');
  const catalogs = svc().catalogs;
  const [ready, setReady] = useState(catalogs.loaded.value);

  useEffect(() => {
    if (!catalogs.loaded.value) void catalogs.load().then(() => setReady(true));
  }, []);

  const index = useMemo(() => {
    const docs: SearchDocument[] = [
      ...projects.value.map((p) => ({ id: `p:${p.id}`, kind: 'project' as const, title: p.name, text: p.description, ref: p.id })),
      ...(['official', 'free-open'] as const).flatMap((section) =>
        catalogs.visible(section).map((i) => ({
          id: `a:${i.entry.id}`,
          kind: 'asset' as const,
          title: i.entry.name,
          text: `${i.entry.description} ${i.entry.tags.join(' ')} ${i.entry.category} ${i.entry.license.creator}`,
          ref: `${section}|${i.entry.id}`,
        })),
      ),
      ...TEMPLATES.map((t) => ({ id: `t:${t.id}`, kind: 'template' as const, title: t.name, text: t.description, ref: t.id })),
      ...DOC_PAGES.map((d) => ({ id: `d:${d.id}`, kind: 'doc' as const, title: d.title, text: d.keywords, ref: d.id })),
    ];
    return new SearchIndex(docs);
  }, [ready, projects.value]);

  const hits: SearchHit[] = query.trim() ? index.search(query, 30) : [];

  const open = (hit: SearchHit): void => {
    searchOpen.value = false;
    const { kind, ref } = hit.doc;
    if (kind === 'project') void openProject(ref);
    else if (kind === 'asset') {
      const [section, id] = ref.split('|') as ['official' | 'free-open', string];
      navigate({ name: 'library', tab: section, assetId: id });
    } else if (kind === 'template') navigate({ name: 'new-project', templateId: ref });
    else navigate({ name: 'docs', page: ref });
  };

  return (
    <Modal title="Search" onClose={() => (searchOpen.value = false)}>
      <div class="search">
        <Icon name="search" size={16} />
        <input
          class="input"
          type="search"
          placeholder="Projects, assets, templates, documentation…"
          aria-label="Search everything"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) open(hits[0]);
          }}
        />
      </div>
      {query.trim() && hits.length === 0 && <p class="dim" style={{ marginTop: '12px' }}>No results.</p>}
      <ul class="search-results" aria-label="Results">
        {hits.map((h) => (
          <li key={h.doc.id}>
            <button type="button" onClick={() => open(h)}>
              <Icon name={KIND_ICON[h.doc.kind]} />
              <span style={{ flex: 1 }}>{h.doc.title}</span>
              <span class="badge">{KIND_LABEL[h.doc.kind]}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
