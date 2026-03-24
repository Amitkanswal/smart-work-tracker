import { OFFLINE_QUEUE_MAX_SIZE } from '../constants';

const QUEUE_KEY = 'swtOfflineQueue';

export type OfflineQueueItem = {
  id: string;
  kind: 'drive_sync' | 'sheets_export';
  createdAt: string;
  payload?: unknown;
};

async function readQueue(): Promise<OfflineQueueItem[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(QUEUE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const raw = result[QUEUE_KEY];
      resolve(Array.isArray(raw) ? raw : []);
    });
  });
}

async function writeQueue(items: OfflineQueueItem[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [QUEUE_KEY]: items }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

export async function enqueueOffline(item: Omit<OfflineQueueItem, 'id' | 'createdAt'>): Promise<void> {
  const queue = await readQueue();
  const next: OfflineQueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const merged = [...queue, next].slice(-OFFLINE_QUEUE_MAX_SIZE);
  await writeQueue(merged);
}

export async function dequeueAll(): Promise<OfflineQueueItem[]> {
  const q = await readQueue();
  await writeQueue([]);
  return q;
}

export async function peekQueue(): Promise<OfflineQueueItem[]> {
  return readQueue();
}

export async function flushOfflineQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  const items = await dequeueAll();
  if (items.length === 0) {
    return;
  }
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.has('drive_sync')) {
    const { flushDriveSyncFromQueue } = await import('./syncFlush');
    await flushDriveSyncFromQueue();
  }
  if (kinds.has('sheets_export')) {
    const { flushSheetsExportFromQueue } = await import('./syncFlush');
    await flushSheetsExportFromQueue();
  }
}
