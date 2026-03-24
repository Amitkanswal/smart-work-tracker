import {
  CHROME_STORAGE_KEY_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_WORK_CATEGORIES,
  MAX_WORK_CATEGORIES,
} from '../constants';
import type { UserSettings, WorkCategoryDef } from '../types';

export { CHROME_STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS };

function normalizeWorkCategories(raw: unknown): WorkCategoryDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_WORK_CATEGORIES];
  }
  const out: WorkCategoryDef[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (out.length >= MAX_WORK_CATEGORIES) {
      break;
    }
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? '').trim().slice(0, 64);
    const label = String(r.label ?? '').trim().slice(0, 80);
    if (!id || !label || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, label });
  }
  return out.length > 0 ? out : [...DEFAULT_WORK_CATEGORIES];
}

function normalizeWallTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m?.[1] || !m[2]) return '09:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Merge stored JSON with defaults, normalize types (fixes `<input type="time">` quirks and legacy rows). */
export function coerceUserSettings(raw: Partial<UserSettings> | undefined | null): UserSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const ni = merged.notificationIntervalMinutes;
  return {
    ...merged,
    loginTime: normalizeWallTime(merged.loginTime),
    logoutTime: normalizeWallTime(merged.logoutTime),
    timezone: String(merged.timezone || 'UTC').trim() || 'UTC',
    notificationIntervalMinutes:
      typeof ni === 'number' && Number.isFinite(ni) ? Math.max(1, Math.min(1440, Math.floor(ni))) : 60,
    weekendsOff: merged.weekendsOff !== false,
    workCategories: normalizeWorkCategories(merged.workCategories),
    notificationSound: Boolean(merged.notificationSound),
    isOnLeave: Boolean(merged.isOnLeave),
    googleAccountLinked: Boolean(merged.googleAccountLinked),
    autoExportToSheets: Boolean(merged.autoExportToSheets),
    leaveStartDate: merged.leaveStartDate?.trim() || undefined,
    leaveEndDate: merged.leaveEndDate?.trim() || undefined,
    googleOAuthClientId: merged.googleOAuthClientId?.trim() || undefined,
    sheetId: merged.sheetId?.trim() || undefined,
    lastSyncTimestamp: merged.lastSyncTimestamp?.trim() || undefined,
  };
}

/**
 * Get all user settings or defaults if not yet saved.
 */
export async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(CHROME_STORAGE_KEY_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const stored = result[CHROME_STORAGE_KEY_SETTINGS] as Partial<UserSettings> | undefined;
      resolve(coerceUserSettings(stored));
    });
  });
}

/**
 * Serialize writes so rapid UI updates (e.g. time + timezone) cannot interleave
 * and drop fields — each update reads storage after the previous write completes.
 */
let settingsWriteChain: Promise<void> = Promise.resolve();

/**
 * Update settings with partial merge.
 * Only provided keys are updated; others remain unchanged.
 */
export async function updateSettings(updates: Partial<UserSettings>): Promise<void> {
  const next = settingsWriteChain.then(async () => {
    const current = await getSettings();
    const merged = coerceUserSettings({ ...current, ...updates });
    await new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set({ [CHROME_STORAGE_KEY_SETTINGS]: merged }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  });
  settingsWriteChain = next.then(() => undefined).catch(() => undefined);
  return next;
}

/**
 * Reset all settings to defaults.
 */
export async function resetSettings(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [CHROME_STORAGE_KEY_SETTINGS]: coerceUserSettings(DEFAULT_SETTINGS) }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

/**
 * Listen for changes to settings.
 * Returns an unsubscribe function.
 */
export function onSettingsChange(
  callback: (newSettings: UserSettings, oldSettings?: UserSettings) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (CHROME_STORAGE_KEY_SETTINGS in changes) {
      const change = changes[CHROME_STORAGE_KEY_SETTINGS];
      callback(coerceUserSettings(change.newValue), coerceUserSettings(change.oldValue));
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
