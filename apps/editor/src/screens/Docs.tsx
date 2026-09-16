import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app/state.ts';
import { DOC_PAGES } from '../docs/index.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { Icon } from '../ui/Icon.tsx';

const loaders = import.meta.glob<string>('../docs/pages/*.md', { query: '?raw', import: 'default' });

async function loadPage(id: string): Promise<string | null> {
  const loader = loaders[`../docs/pages/${id}.md`];
  return loader ? loader() : null;
}

export function Docs({ page }: { page?: string | undefined }) {
  const current = DOC_PAGES.find((p) => p.id === page) ?? DOC_PAGES[0]!;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    void loadPage(current.id).then((md) => {
      if (alive) setHtml(md ? renderMarkdown(md) : '<p>This page is not available.</p>');
    });
    return () => {
      alive = false;
    };
  }, [current.id]);

  const groups = [...new Set(DOC_PAGES.map((p) => p.group))];
  const index = DOC_PAGES.indexOf(current);
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  return (
    <div class="page">
      <header class="page-header">
        <h1>Learn Mythic Forge</h1>
      </header>
      <div class="docs">
        <nav class="docs-nav" aria-label="Documentation">
          {groups.map((g) => (
            <div key={g}>
              <div class="section-title" style={{ margin: '12px 0 4px' }}>
                {g}
              </div>
              {DOC_PAGES.filter((p) => p.group === g).map((p) => (
                <button key={p.id} type="button" aria-current={p.id === current.id} onClick={() => navigate({ name: 'docs', page: p.id }, true)}>
                  {p.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <article
          class="prose"
          aria-live="polite"
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a[data-doc]');
            if (a) {
              e.preventDefault();
              navigate({ name: 'docs', page: a.getAttribute('data-doc') ?? undefined });
            }
          }}
        >
          {html === null ? <p class="dim">Loading…</p> : <div dangerouslySetInnerHTML={{ __html: html }} />}
          <div class="row" style={{ marginTop: '32px', justifyContent: 'space-between' }}>
            {prev ? (
              <button type="button" class="btn btn-ghost" onClick={() => navigate({ name: 'docs', page: prev.id }, true)}>
                <Icon name="arrow-left" /> {prev.title}
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" class="btn btn-ghost" onClick={() => navigate({ name: 'docs', page: next.id }, true)}>
                {next.title} <Icon name="chevron-right" />
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
