import { useState } from 'preact/hooks';
import { importProjectFile } from '../app/project-actions.ts';
import { navigate, projects, projectsLoaded, svc } from '../app/state.ts';
import { Callout, EmptyState, Segmented } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ProjectCard } from './ProjectCard.tsx';

type Filter = 'active' | 'archived' | 'all';
type Sort = 'recent' | 'name' | 'size';

export function Projects() {
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const all = projects.value;
  const q = query.trim().toLowerCase();
  const list = all
    .filter((p) => (filter === 'all' ? true : filter === 'archived' ? p.archived : !p.archived))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.sizeBytes - a.sizeBytes : b.modifiedAt.localeCompare(a.modifiedAt)));

  return (
    <div class="page">
      <header class="page-header">
        <h1>My Projects</h1>
        <button type="button" class="btn" onClick={() => void importProjectFile()}>
          <Icon name="download" /> Import
        </button>
        <button type="button" class="btn btn-primary" onClick={() => navigate({ name: 'new-project' })}>
          <Icon name="plus" /> New Project
        </button>
      </header>
      {!svc().platform.fs.persistent && (
        <Callout kind="warning" title="Temporary storage">
          This browser isn't letting Mythic Forge store data permanently (for example in a private window). Projects will be lost when you close it — export anything you want to keep.
        </Callout>
      )}
      <div class="library-toolbar">
        <div class="search">
          <Icon name="search" size={16} />
          <input class="input" type="search" placeholder="Search projects…" aria-label="Search projects" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All' },
          ]}
        />
        <select class="input" style={{ width: 'auto' }} aria-label="Sort by" value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
          <option value="recent">Last modified</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
      </div>
      {!projectsLoaded.value ? (
        <div class="empty-state" role="status">
          Loading projects…
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon="folder" title={all.length === 0 ? 'No projects yet' : 'Nothing matches'}>
          {all.length === 0 && (
            <p>
              <button type="button" class="btn btn-primary" onClick={() => navigate({ name: 'new-project' })}>
                Create your first project
              </button>
            </p>
          )}
        </EmptyState>
      ) : (
        <div class="project-grid">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
      <p class="dim" style={{ marginTop: '24px', fontSize: '0.86em' }}>
        Projects are stored on this device. To move a project to another phone, laptop or PC, use <strong>Export</strong> and open the
        <code> .mfpack</code> file there with <strong>Import</strong>.
      </p>
    </div>
  );
}
