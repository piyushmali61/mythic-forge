import type { ComponentChildren } from 'preact';
import { createDemoProject, importProjectFile } from '../app/project-actions.ts';
import { navigate, projects, projectsLoaded, type Route } from '../app/state.ts';
import { NotImplemented } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { searchOpen } from './SearchOverlay.tsx';
import { ProjectCard } from './ProjectCard.tsx';

function Tile({ icon, title, text, to, onClick, disabled, extra }: { icon: IconName; title: string; text: string; to?: Route; onClick?: () => void; disabled?: boolean; extra?: ComponentChildren }) {
  return (
    <button
      type="button"
      class="card interactive tile"
      disabled={disabled}
      style={disabled ? { opacity: 0.6, cursor: 'default' } : undefined}
      onClick={() => {
        if (disabled) return;
        if (onClick) onClick();
        else if (to) navigate(to);
      }}
    >
      <span class="tile-icon">
        <Icon name={icon} size={22} />
      </span>
      <span>
        <h3>
          {title} {extra}
        </h3>
        <p>{text}</p>
      </span>
    </button>
  );
}

export function Home() {
  const recent = projects.value.filter((p) => !p.archived).slice(0, 3);
  return (
    <div class="page">
      <section class="hero" aria-label="Welcome">
        <img src="./icons/logo.svg" alt="" width="64" height="64" />
        <div class="hero-text">
          <h1>WELCOME TO MYTHIC FORGE</h1>
          <div class="muted">Create. Build. Play. — by Mythic Bharat Studios</div>
        </div>
        <div class="row wrap">
          <button type="button" class="icon-btn" aria-label="Search" title="Search (Ctrl+K)" onClick={() => (searchOpen.value = true)}>
            <Icon name="search" />
          </button>
          <button type="button" class="btn btn-primary btn-lg" onClick={() => navigate({ name: 'new-project' })}>
            <Icon name="plus" /> New Project
          </button>
        </div>
      </section>

      <section class="section" aria-labelledby="recent-h">
        <h2 class="section-title" id="recent-h">
          Recent Projects
        </h2>
        {!projectsLoaded.value ? (
          <p class="dim">Loading…</p>
        ) : recent.length === 0 ? (
          <div class="card row wrap">
            <span class="muted" style={{ flex: 1 }}>
              You don't have any projects yet.
            </span>
            <button type="button" class="btn" onClick={() => void createDemoProject()}>
              <Icon name="play" /> Explore the demo
            </button>
            <button type="button" class="btn" onClick={() => void importProjectFile()}>
              <Icon name="download" /> Import a project
            </button>
          </div>
        ) : (
          <div class="project-grid">
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
        {projects.value.length > 3 && (
          <p>
            <button type="button" class="btn btn-ghost" onClick={() => navigate({ name: 'projects' })}>
              All projects ({projects.value.length}) <Icon name="chevron-right" />
            </button>
          </p>
        )}
      </section>

      <section class="section" aria-labelledby="explore-h">
        <h2 class="section-title" id="explore-h">
          Explore
        </h2>
        <div class="grid-auto">
          <Tile icon="sparkle" title="Official Assets" text="Original models and materials by Mythic Bharat Studios." to={{ name: 'library', tab: 'official' }} />
          <Tile icon="library" title="Free & Open Assets" text="Third-party assets with verified licences." to={{ name: 'library', tab: 'free-open' }} />
          <Tile icon="template" title="Templates" text="Start from a playable scene." to={{ name: 'templates' }} />
          <Tile icon="play" title="Demo: Shrine of Lamps" text="A small game you can open, play and change." onClick={() => void createDemoProject()} />
        </div>
      </section>

      <section class="section" aria-labelledby="learn-h">
        <h2 class="section-title" id="learn-h">
          Learn
        </h2>
        <div class="grid-auto">
          <Tile icon="book" title="Getting Started" text="Your first scene in five minutes." to={{ name: 'docs', page: 'getting-started' }} />
          <Tile icon="behaviour" title="Tutorials" text="Behaviours, physics and play mode." to={{ name: 'docs', page: 'behaviours' }} />
          <Tile icon="terminal" title="Documentation" text="Everything the editor can do." to={{ name: 'docs' }} />
        </div>
      </section>

      <section class="section" aria-labelledby="community-h">
        <h2 class="section-title" id="community-h">
          Community
        </h2>
        <div class="grid-auto">
          <Tile icon="users" title="Community" text="Sharing assets and projects with other creators is planned for a later version." disabled extra={<NotImplemented label="Planned" />} />
          <Tile icon="settings" title="Settings" text="Battery, graphics, storage, privacy and more." to={{ name: 'settings' }} />
        </div>
      </section>
    </div>
  );
}
