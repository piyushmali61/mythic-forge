import { createDemoProject } from '../app/project-actions.ts';
import { navigate, updateSettings } from '../app/state.ts';
import { Modal } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

/** Short welcome, not a tutorial (§72). */
export function FirstRun() {
  const done = (): Promise<void> => updateSettings((s) => (s.general.firstRunComplete = true));
  return (
    <Modal title="Welcome to Mythic Forge" onClose={() => void done()}>
      <div class="col" style={{ alignItems: 'center', textAlign: 'center', gap: '4px' }}>
        <img src="./icons/logo.svg" alt="" width="72" height="72" />
        <h2 style={{ letterSpacing: '0.2em', marginTop: '10px' }}>MYTHIC FORGE</h2>
        <p class="muted">Create. Build. Play. — a creation engine that respects your device.</p>
        <p>Create your first project.</p>
      </div>
      <div class="col" style={{ marginTop: '8px' }}>
        <button
          type="button"
          class="btn btn-primary btn-lg btn-block"
          onClick={() => {
            void done();
            navigate({ name: 'new-project' });
          }}
        >
          <Icon name="plus" /> Create Project
        </button>
        <button
          type="button"
          class="btn btn-lg btn-block"
          onClick={() => {
            void done().then(createDemoProject);
          }}
        >
          <Icon name="play" /> Explore Demo
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-lg btn-block"
          onClick={() => {
            void done();
            navigate({ name: 'docs', page: 'getting-started' });
          }}
        >
          <Icon name="book" /> Learn Basics
        </button>
      </div>
      <p class="dim" style={{ fontSize: '0.84em', marginTop: '14px', textAlign: 'center' }}>
        No account needed. Your projects stay on this device unless you export them.
      </p>
    </Modal>
  );
}
