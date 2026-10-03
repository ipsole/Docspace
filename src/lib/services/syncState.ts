import { isFirestoreEnabled, firestoreGet, firestoreSet } from '../storage/firestoreAdapter';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '../storage/storage';
import path from 'path';

export interface WorkspaceSyncState {
  workspaceId: string;
  invoicesUpdatedAt?: number;
  clientsUpdatedAt?: number;
  projectsUpdatedAt?: number;
  leadsUpdatedAt?: number;
  calendarUpdatedAt?: number;
  updatedAt: number;
}

const LOCAL_SYNC_DIR = path.join(STORAGE_ROOT, 'sync_state');

/**
 * Updates the sync timestamp for a given entity in a workspace.
 * Active clients listening to this single document via onSnapshot
 * will be notified immediately to invalidate their local cache.
 */
export async function touchWorkspaceSync(
  workspaceId: string,
  entity: 'invoices' | 'clients' | 'projects' | 'leads' | 'calendar'
): Promise<void> {
  if (!workspaceId) return;

  const now = Date.now();
  type SyncFieldKey = 'invoicesUpdatedAt' | 'clientsUpdatedAt' | 'projectsUpdatedAt' | 'leadsUpdatedAt' | 'calendarUpdatedAt';
  const fieldKey: SyncFieldKey = `${entity}UpdatedAt`;

  if (isFirestoreEnabled()) {
    try {
      const docId = `sync_${workspaceId}`;
      const existing = (await firestoreGet('sync_state', docId)) as WorkspaceSyncState | null;
      const updated: WorkspaceSyncState = {
        workspaceId,
        ...(existing || {}),
        [fieldKey]: now,
        updatedAt: now,
      };
      await firestoreSet('sync_state', docId, updated);
    } catch (err: any) {
      console.warn(`[SyncState] Failed to touch sync state for workspace ${workspaceId}:`, err.message);
    }
  } else {
    try {
      const filePath = path.join(LOCAL_SYNC_DIR, `${workspaceId}.json`);
      let existing: WorkspaceSyncState = { workspaceId, updatedAt: now };
      const raw = await safeReadFile(filePath);
      if (raw) {
        try { existing = JSON.parse(raw); } catch {}
      }
      existing[fieldKey] = now;
      existing.updatedAt = now;
      await safeWriteFile(filePath, JSON.stringify(existing, null, 2));
    } catch (err: any) {
      console.warn(`[SyncState] Failed to write local sync state:`, err.message);
    }
  }
}

/**
 * Gets the current sync timestamps for a workspace.
 */
export async function getWorkspaceSyncState(workspaceId: string): Promise<WorkspaceSyncState | null> {
  if (!workspaceId) return null;

  if (isFirestoreEnabled()) {
    try {
      const docId = `sync_${workspaceId}`;
      return (await firestoreGet('sync_state', docId)) as WorkspaceSyncState | null;
    } catch {
      return null;
    }
  } else {
    try {
      const filePath = path.join(LOCAL_SYNC_DIR, `${workspaceId}.json`);
      const raw = await safeReadFile(filePath);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
