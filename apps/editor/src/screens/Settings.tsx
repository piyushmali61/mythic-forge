import { navigate } from '../app/state.ts';
import {
  AboutSection,
  AccessibilitySection,
  AccountsSection,
  AssetsSection,
  BatterySection,
  EditorSection,
  GeneralSection,
  GraphicsSection,
  KeyboardSection,
  NetworkSection,
  PerformanceSection,
  PrivacySection,
  ProjectsSection,
  StorageSection,
} from './settings/sections.tsx';

const SECTIONS = [
  { id: 'general', label: 'General', view: GeneralSection },
  { id: 'editor', label: 'Editor', view: EditorSection },
  { id: 'graphics', label: 'Graphics', view: GraphicsSection },
  { id: 'performance', label: 'Performance', view: PerformanceSection },
  { id: 'battery', label: 'Battery', view: BatterySection },
  { id: 'storage', label: 'Storage', view: StorageSection },
  { id: 'projects', label: 'Projects', view: ProjectsSection },
  { id: 'assets', label: 'Assets', view: AssetsSection },
  { id: 'privacy', label: 'Privacy', view: PrivacySection },
  { id: 'network', label: 'Network', view: NetworkSection },
  { id: 'accounts', label: 'Accounts', view: AccountsSection },
  { id: 'keyboard', label: 'Keyboard', view: KeyboardSection },
  { id: 'accessibility', label: 'Accessibility', view: AccessibilitySection },
  { id: 'about', label: 'About', view: AboutSection },
] as const;

export function Settings({ section }: { section?: string | undefined }) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const View = current.view;
  return (
    <div class="page">
      <header class="page-header">
        <h1>Settings</h1>
      </header>
      <div class="settings">
        <nav class="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={s.id === current.id} onClick={() => navigate({ name: 'settings', section: s.id }, true)}>
              {s.label}
            </button>
          ))}
        </nav>
        <section class="settings-panel" aria-label={current.label}>
          <h2>{current.label}</h2>
          <View />
        </section>
      </div>
    </div>
  );
}
