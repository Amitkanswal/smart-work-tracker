import { exportPendingLogsToSheetIfPossible } from './googleSheets';
import { runDriveSyncIfPossible } from './syncManager';

/**
 * Invoked only via dynamic import from `offlineQueue` so the queue module never
 * statically depends on `syncManager` (avoids Vite preload cycles that pulled React into the SW).
 */
export async function flushDriveSyncFromQueue(): Promise<void> {
  await runDriveSyncIfPossible();
}

export async function flushSheetsExportFromQueue(): Promise<void> {
  await exportPendingLogsToSheetIfPossible();
}
