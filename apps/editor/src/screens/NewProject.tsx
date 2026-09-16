import {
  PROJECT_TYPE_LABELS,
  QUALITY_LABELS,
  QUALITY_LEVELS,
  getTemplate,
  templatesFor,
  type PerformanceProfileId,
  type ProjectType,
  type QualityLevel,
  type TargetPlatform,
} from '@mythic-forge/core';
import { useState } from 'preact/hooks';
import { createProject, openProject } from '../app/project-actions.ts';
import { navigate, reportError, svc } from '../app/state.ts';
import { Badge } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';

const STEPS = ['Name', 'Type', 'Platform', 'Performance', 'Template'] as const;

const TYPES: { value: ProjectType; icon: IconName; text: string; badge?: string }[] = [
  { value: '3d-game', icon: 'cube', text: 'Characters, physics, collectibles, play mode.' },
  { value: '2d-game', icon: 'image', text: 'Side-on games with flat sprites. Uses the 3D engine with a locked orthographic view.', badge: 'Beta' },
  { value: '3d-experience', icon: 'globe', text: 'Walkthroughs, showcases and interactive scenes.' },
  { value: 'empty', icon: 'empty', text: 'Just a camera and a light.' },
];

type PlatformChoice = 'android' | 'windows' | 'cross';
const PLATFORMS: { value: PlatformChoice; label: string; text: string }[] = [
  { value: 'android', label: 'Android', text: 'Phones and tablets. Touch controls, battery-aware defaults.' },
  { value: 'windows', label: 'Windows', text: 'Laptops and desktop PCs. Keyboard and mouse.' },
  { value: 'cross', label: 'Cross-platform', text: 'Android and Windows from the same project.' },
];

const PROFILES: { value: PerformanceProfileId; label: string; icon: IconName; text: string }[] = [
  { value: 'battery-saver', label: 'Battery Saver', icon: 'battery', text: '30 FPS, no shadows, lower resolution. Best for phones and long sessions.' },
  { value: 'balanced', label: 'Balanced', icon: 'gauge', text: 'Adapts to the device: 30 FPS on phones, 60 FPS on PCs.' },
  { value: 'performance', label: 'Performance', icon: 'cpu', text: '60 FPS and the best quality this device supports. Uses more power.' },
  { value: 'custom', label: 'Custom', icon: 'sliders', text: 'Pick a quality level. It is still capped by what the device can handle.' },
];

export function NewProject({ templateId }: { templateId?: string | undefined }) {
  const preset = templateId ? getTemplate(templateId) : undefined;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>(preset?.projectTypes[0] ?? '3d-game');
  const [platform, setPlatform] = useState<PlatformChoice>(svc().platform.device.isMobile ? 'android' : 'cross');
  const [profile, setProfile] = useState<PerformanceProfileId>(svc().platform.device.isMobile ? 'battery-saver' : 'balanced');
  const [customQuality, setCustomQuality] = useState<QualityLevel>('medium');
  const [template, setTemplate] = useState<string>(preset?.id ?? '');
  const [busy, setBusy] = useState(false);

  const templates = templatesFor(type);
  const selectedTemplate = templates.find((t) => t.id === template) ?? templates[0];
  const nameValid = name.trim().length > 0 && name.trim().length <= 80;
  const canNext = step === 0 ? nameValid : true;

  const create = async (): Promise<void> => {
    if (!selectedTemplate || !nameValid) return;
    setBusy(true);
    try {
      const targets: TargetPlatform[] = platform === 'cross' ? ['android', 'windows'] : [platform];
      const id = await createProject({
        name: name.trim(),
        type,
        targets,
        performanceProfile: profile,
        customQuality: profile === 'custom' ? customQuality : null,
        templateId: selectedTemplate.id,
      });
      await openProject(id);
    } catch (error) {
      reportError(error, 'The project could not be created.', () => void create());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="page" style={{ maxWidth: '860px' }}>
      <header class="page-header">
        <button type="button" class="icon-btn" aria-label="Back" onClick={() => (step === 0 ? navigate({ name: 'projects' }) : setStep(step - 1))}>
          <Icon name="arrow-left" />
        </button>
        <h1>New Project</h1>
      </header>
      <ol class="steps" aria-label="Steps" style={{ listStyle: 'none', padding: 0 }}>
        {STEPS.map((s, i) => (
          <li key={s} class={`step ${i === step ? 'current' : i < step ? 'done' : ''}`} aria-current={i === step ? 'step' : undefined}>
            <span class="dot">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
            {s}
            {i < STEPS.length - 1 && <span class="dim"> ›</span>}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canNext) return;
          if (step < STEPS.length - 1) setStep(step + 1);
          else void create();
        }}
      >
        {step === 0 && (
          <div class="card">
            <div class="field">
              <label for="project-name">Project name</label>
              <input
                id="project-name"
                class="input"
                autoFocus
                maxLength={80}
                placeholder="e.g. Mythic Warrior"
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <span class="field-hint">You can rename it later.</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div class="choice-grid" role="radiogroup" aria-label="Project type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                class="choice"
                aria-checked={type === t.value}
                onClick={() => {
                  setType(t.value);
                  setTemplate('');
                }}
              >
                <strong>
                  <Icon name={t.icon} /> {PROJECT_TYPE_LABELS[t.value]} {t.badge && <Badge kind="warning">{t.badge}</Badge>}
                </strong>
                <span>{t.text}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            <div class="choice-grid" role="radiogroup" aria-label="Target platform">
              {PLATFORMS.map((p) => (
                <button key={p.value} type="button" role="radio" class="choice" aria-checked={platform === p.value} onClick={() => setPlatform(p.value)}>
                  <strong>{p.label}</strong>
                  <span>{p.text}</span>
                </button>
              ))}
            </div>
            <p class="dim" style={{ marginTop: '12px', fontSize: '0.88em' }}>
              The target sets defaults and shows relevant warnings. Projects are portable either way. Packaging finished games as Android or Windows apps from inside the editor is not available in this version — see <em>Building & Exporting</em> in the docs.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <div class="choice-grid" role="radiogroup" aria-label="Performance profile">
              {PROFILES.map((p) => (
                <button key={p.value} type="button" role="radio" class="choice" aria-checked={profile === p.value} onClick={() => setProfile(p.value)}>
                  <strong>
                    <Icon name={p.icon} /> {p.label}
                  </strong>
                  <span>{p.text}</span>
                </button>
              ))}
            </div>
            {profile === 'custom' && (
              <div class="field" style={{ marginTop: '14px', maxWidth: '300px' }}>
                <label for="custom-quality">Quality level</label>
                <select id="custom-quality" class="input" value={customQuality} onChange={(e) => setCustomQuality(e.currentTarget.value as QualityLevel)}>
                  {QUALITY_LEVELS.map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_LABELS[q]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p class="dim" style={{ marginTop: '12px', fontSize: '0.88em' }}>
              This device was detected as <strong>{QUALITY_LABELS[svc().device.tier]}</strong> ({svc().device.reasons.join(', ')}).
            </p>
          </>
        )}

        {step === 4 && (
          <div class="choice-grid" role="radiogroup" aria-label="Template">
            {templates.map((t) => (
              <button key={t.id} type="button" role="radio" class="choice" aria-checked={selectedTemplate?.id === t.id} onClick={() => setTemplate(t.id)}>
                <strong>
                  {t.name} {t.requiredAssets.length > 0 && <Badge kind="gold">Official assets</Badge>}
                </strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        )}

        <div class="row" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
          {step > 0 && (
            <button type="button" class="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="submit" class="btn btn-primary" disabled={!canNext || busy}>
            {step < STEPS.length - 1 ? 'Next' : busy ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
