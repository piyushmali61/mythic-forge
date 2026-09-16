import type { FileSystem, KeyValueStore } from '../platform/types.ts';
import type { SceneDocument } from '../scene/types.ts';
import { validateScene } from '../scene/validate.ts';
import { isValidId } from '../util/ids.ts';
import { isRecord, parseJsonLimited, stringifyPretty } from '../util/json.ts';

const SESSION_KEY = 'session.active';
const recoveryPath = (projectId: string): string => `recovery/${projectId}.json`;

export interface RecoverySnapshot {
  projectId: string;
  projectName: string;
  scenePath: string;
  scene: SceneDocument;
  savedAt: string;
  /** `modifiedAt` of the project when editing started; used to detect stale snapshots. */
  baseModifiedAt: string;
}

export interface SessionMarker {
  projectId: string;
  startedAt: string;
}

/**
 * Auto-save writes here, never over the project itself, so a bad auto-save can't damage
 * the user's last deliberate save. A session marker detects crashes/kills.
 */
export class RecoveryStore {
  private readonly fs: FileSystem;
  private readonly kv: KeyValueStore;

  constructor(fs: FileSystem, kv: KeyValueStore) {
    this.fs = fs;
    this.kv = kv;
  }

  async write(snapshot: RecoverySnapshot): Promise<void> {
    await this.fs.apply([{ kind: 'write', path: recoveryPath(snapshot.projectId), data: stringifyPretty(snapshot) }]);
  }

  async read(projectId: string): Promise<RecoverySnapshot | null> {
    if (!isValidId(projectId)) return null;
    const bytes = await this.fs.readBytes(recoveryPath(projectId));
    if (!bytes) return null;
    const raw = parseJsonLimited(bytes, 64 * 1024 * 1024);
    if (!isRecord(raw) || raw.projectId !== projectId || typeof raw.scenePath !== 'string') return null;
    const scene = validateScene(raw.scene);
    if (!scene.ok) return null;
    return {
      projectId,
      projectName: typeof raw.projectName === 'string' ? raw.projectName.slice(0, 80) : 'Project',
      scenePath: raw.scenePath,
      scene: scene.value,
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
      baseModifiedAt: typeof raw.baseModifiedAt === 'string' ? raw.baseModifiedAt : '',
    };
  }

  async clear(projectId: string): Promise<void> {
    if (!isValidId(projectId)) return;
    await this.fs.apply([{ kind: 'delete', path: recoveryPath(projectId) }]);
  }

  /** All recovery snapshots on this device. */
  async list(): Promise<RecoverySnapshot[]> {
    const files = await this.fs.list('recovery');
    const out: RecoverySnapshot[] = [];
    for (const f of files) {
      const id = f.path.slice('recovery/'.length).replace(/\.json$/, '');
      const snap = await this.read(id);
      if (snap) out.push(snap);
    }
    return out;
  }

  async beginSession(projectId: string): Promise<void> {
    await this.kv.set<SessionMarker>(SESSION_KEY, { projectId, startedAt: new Date().toISOString() });
  }

  async endSession(): Promise<void> {
    await this.kv.delete(SESSION_KEY);
  }

  /** The session marker left behind by a crash or forced close, if any. */
  async uncleanSession(): Promise<SessionMarker | null> {
    const marker = await this.kv.get<SessionMarker>(SESSION_KEY);
    return marker && isValidId(marker.projectId) ? marker : null;
  }
}

/** A snapshot is worth offering only if it is newer than the project's last save. */
export function isRecoveryRelevant(snapshot: RecoverySnapshot, projectModifiedAt: string): boolean {
  const saved = Date.parse(snapshot.savedAt);
  const modified = Date.parse(projectModifiedAt);
  if (Number.isNaN(saved)) return false;
  return Number.isNaN(modified) || saved > modified;
}
