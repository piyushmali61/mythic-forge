import { log, type LogEntry, type LogLevel } from '@mythic-forge/core';
import { useEffect, useState } from 'preact/hooks';
import { settings, svc } from '../app/state.ts';
import { Segmented } from '../ui/common.tsx';

type Filter = 'all' | 'error' | 'warn' | 'info';

const LABEL: Record<LogLevel, string> = { error: '[ERROR]', warn: '[WARNING]', info: '[INFO]', perf: '[PERF]', debug: '[DEBUG]' };

export function ConsolePanel() {
  const [entries, setEntries] = useState<readonly LogEntry[]>(log.entries());
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => log.subscribe((list) => setEntries([...list])), []);
  const dev = settings.value.developer.devMode;
  const shown = entries
    .filter((e) => (filter === 'all' ? dev || e.level !== 'debug' : filter === 'info' ? e.level === 'info' || e.level === 'perf' : e.level === filter))
    .slice(-300)
    .reverse();
  const count = (level: LogLevel): number => entries.filter((e) => e.level === level).length;
  return (
    <div>
      <div class="console-filters">
        <Segmented
          label="Filter messages"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'error', label: `Errors (${count('error')})` },
            { value: 'warn', label: `Warnings (${count('warn')})` },
            { value: 'info', label: 'Info' },
          ]}
        />
        <span class="spacer" />
        <button
          type="button"
          class="btn btn-sm"
          onClick={() =>
            void svc().platform.files.save('mythic-forge-console.txt', new TextEncoder().encode(log.exportText('Mythic Forge console')), 'text/plain')
          }
        >
          Export
        </button>
        <button type="button" class="btn btn-sm btn-ghost" onClick={() => log.clear()}>
          Clear
        </button>
      </div>
      {shown.length === 0 ? (
        <p class="dim" style={{ padding: '10px' }}>
          No messages.
        </p>
      ) : (
        <ul class="log-list" aria-live="polite">
          {shown.map((e) => (
            <li key={e.id}>
              <span class={`log-level ${e.level}`}>{LABEL[e.level]}</span>
              <span class="log-time">{new Date(e.time).toLocaleTimeString()}</span>
              <span style={{ minWidth: 0 }}>
                <span class="dim">{e.source}: </span>
                {e.message}
                {e.detail && dev && <div class="log-detail">{e.detail}</div>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
