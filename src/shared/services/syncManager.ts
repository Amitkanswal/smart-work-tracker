import { getAccessToken } from './googleAuth';
import { downloadSyncPayload, mergeLogs, uploadSyncPayload } from './googleDrive';
import { db } from '../storage/db';
import { getSettings, updateSettings } from '../storage/settingsStore';
import type { SyncPayload } from '../types';
import { enqueueOffline } from './offlineQueue';

/**
 * Last-write-wins merge (syncVersion, then updatedAt), upload merged JSON to Drive appDataFolder,
 * persist merged rows locally.
 */
export async function runDriveSyncIfPossible(): Promise<void> {
  const settings = await getSettings();
  if (!settings.googleAccountLinked) {
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOffline({ kind: 'drive_sync' });
    return;
  }

  const token = await getAccessToken(false);
  if (!token) {
    return;
  }

  const localLogs = await db.taskLogs.toArray();
  const remote = await downloadSyncPayload(token);
  const remoteLogs = remote?.taskLogs ?? [];
  const remoteVersion = remote?.version ?? 0;

  const merged = mergeLogs(localLogs, remoteLogs);
  const allVersions = [
    remoteVersion,
    ...merged.map((l) => l.syncVersion),
    ...localLogs.map((l) => l.syncVersion),
  ];
  const nextVersion = Math.max(0, ...allVersions) + 1;

  const normalized = merged.map((l) => ({
    ...l,
    syncStatus: 'synced' as const,
    syncVersion: nextVersion,
  }));

  const payload: SyncPayload = { taskLogs: normalized, version: nextVersion };
  await uploadSyncPayload(token, payload);
  await db.taskLogs.bulkPut(normalized);

  await updateSettings({ lastSyncTimestamp: new Date().toISOString() });
}
