import type { SyncPayload } from '../types';
import type { TaskLog } from '../types';

const APPDATA_FILE = 'smart-work-tracker-data.json';

async function authHeaders(token: string): Promise<HeadersInit> {
  return { Authorization: `Bearer ${token}` };
}

export async function findAppDataFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${APPDATA_FILE}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`,
    { headers: await authHeaders(token) },
  );
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function downloadSyncPayload(token: string): Promise<SyncPayload | null> {
  const id = await findAppDataFileId(token);
  if (!id) {
    return null;
  }
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: await authHeaders(token),
  });
  if (!res.ok) {
    return null;
  }
  try {
    return (await res.json()) as SyncPayload;
  } catch {
    return null;
  }
}

export function mergeLogs(local: TaskLog[], remote: TaskLog[]): TaskLog[] {
  const byId = new Map<string, TaskLog>();
  for (const r of remote) {
    byId.set(r.id, r);
  }
  for (const l of local) {
    const existing = byId.get(l.id);
    if (!existing || l.syncVersion > existing.syncVersion) {
      byId.set(l.id, l);
    } else if (l.syncVersion === existing.syncVersion && l.updatedAt > existing.updatedAt) {
      byId.set(l.id, l);
    }
  }
  return [...byId.values()];
}

export async function uploadSyncPayload(token: string, payload: SyncPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const existingId = await findAppDataFileId(token);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          ...(await authHeaders(token)),
          'Content-Type': 'application/json',
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`Drive media update failed: ${res.status}`);
    }
    return;
  }

  const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      ...(await authHeaders(token)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: APPDATA_FILE,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    }),
  });
  if (!metaRes.ok) {
    throw new Error(`Drive file create failed: ${metaRes.status}`);
  }
  const meta = (await metaRes.json()) as { id: string };
  const up = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${meta.id}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        ...(await authHeaders(token)),
        'Content-Type': 'application/json',
      },
      body,
    },
  );
  if (!up.ok) {
    throw new Error(`Drive initial upload failed: ${up.status}`);
  }
}
