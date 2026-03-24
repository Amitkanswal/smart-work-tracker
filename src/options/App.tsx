import { useCallback, useEffect, useState } from 'react';
import { clearAllData } from '@shared/storage/db';
import {
  coerceUserSettings,
  getSettings,
  onSettingsChange,
  resetSettings,
  updateSettings,
} from '@shared/storage/settingsStore';
import {
  getAccessToken,
  getOAuthRedirectUriForHelp,
  getUserEmail,
  hasBuildTimeGoogleOAuthClient,
  revokeGoogleSession,
} from '@shared/services/googleAuth';
import { createMonthlySheetIfNeeded } from '@shared/services/googleSheets';
import { runDriveSyncIfPossible } from '@shared/services/syncManager';
import type { UserSettings } from '@shared/types';
import { MAX_WORK_CATEGORIES } from '@shared/constants';
import type { WorkCategoryDef } from '@shared/types';
import { validateLoginLogout } from '@shared/utils/validators';
import { TimezonePicker } from './TimezonePicker';

export function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    if (s.googleAccountLinked) {
      setEmail(await getUserEmail());
    } else {
      setEmail(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = onSettingsChange((next) => {
      if (next) {
        setSettings({ ...next });
      }
    });
    return unsub;
  }, [refresh]);

  const patch = async (partial: Partial<UserSettings>) => {
    if (!settings) {
      return;
    }
    setError(null);
    const current = await getSettings();
    const preview = coerceUserSettings({ ...current, ...partial });
    const v = validateLoginLogout(preview.loginTime, preview.logoutTime);
    if (v) {
      setError(v);
      return;
    }
    await updateSettings(partial);
    setSettings(await getSettings());
    setMessage('Saved.');
    setTimeout(() => setMessage(null), 2000);
  };

  if (!settings) {
    return <p className="p-8 text-slate-600">Loading settings…</p>;
  }

  const dashboardUrl = chrome.runtime.getURL('dashboard.html');

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8 text-slate-800">
      <header>
        <h1 className="text-2xl font-semibold text-indigo-950">Smart Work Tracker — Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Changes apply immediately. Leave and hours affect hourly nudges.{' '}
          <a className="text-indigo-600 underline" href={dashboardUrl} target="_blank" rel="noreferrer">
            Open dashboard
          </a>
        </p>
      </header>

      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="hours-heading">
        <h2 id="hours-heading" className="text-lg font-medium text-slate-900">
          Working hours
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Login (HH:mm)</span>
            <input
              type="time"
              className="rounded border border-slate-300 px-2 py-1"
              value={settings.loginTime}
              onChange={(e) => void patch({ loginTime: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Logout (HH:mm)</span>
            <input
              type="time"
              className="rounded border border-slate-300 px-2 py-1"
              value={settings.logoutTime}
              onChange={(e) => void patch({ logoutTime: e.target.value })}
            />
          </label>
        </div>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-slate-700">Timezone</span>
          <p className="text-xs text-slate-500">
            Choose a zone below — your choice is saved when you click a quick pick, a search result, or{' '}
            <em>Validate &amp; apply</em> (not while typing).
          </p>
          <TimezonePicker value={settings.timezone} onCommit={(tz) => void patch({ timezone: tz })} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.weekendsOff}
            onChange={(e) => void patch({ weekendsOff: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Weekends off</span> — Saturday and Sunday in this timezone
            count as non-working (no hourly nudges, no “missed slot” expectations).
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-lg font-medium text-slate-900">
          Time block categories
        </h2>
        <p className="text-xs text-slate-600">
          Used in the popup to split each hour. IDs stay stable when you rename a label (existing logs keep the same
          category id). Up to {MAX_WORK_CATEGORIES} categories.
        </p>
        <ul className="space-y-2">
          {settings.workCategories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-2">
              <span className="font-mono text-[10px] text-slate-400" title="Stable id (do not edit in data)">
                {c.id}
              </span>
              <input
                type="text"
                className="min-w-[10rem] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                value={c.label}
                maxLength={80}
                aria-label={`Label for category ${c.id}`}
                onChange={(e) => {
                  const label = e.target.value;
                  const next: WorkCategoryDef[] = settings.workCategories.map((row) =>
                    row.id === c.id ? { ...row, label } : row,
                  );
                  void patch({ workCategories: next });
                }}
              />
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                disabled={settings.workCategories.length <= 1}
                onClick={() => {
                  if (settings.workCategories.length <= 1) {
                    return;
                  }
                  void patch({
                    workCategories: settings.workCategories.filter((row) => row.id !== c.id),
                  });
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
          disabled={settings.workCategories.length >= MAX_WORK_CATEGORIES}
          onClick={() => {
            if (settings.workCategories.length >= MAX_WORK_CATEGORIES) {
              return;
            }
            const newId = `cat_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
            void patch({
              workCategories: [...settings.workCategories, { id: newId, label: 'New category' }],
            });
          }}
        >
          Add category
        </button>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="notif-heading">
        <h2 id="notif-heading" className="text-lg font-medium text-slate-900">
          Notifications
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Interval (minutes)</span>
          <input
            type="number"
            min={1}
            max={1440}
            className="max-w-xs rounded border border-slate-300 px-2 py-1"
            value={settings.notificationIntervalMinutes}
            onChange={(e) =>
              void patch({ notificationIntervalMinutes: Math.max(1, parseInt(e.target.value, 10) || 60) })
            }
          />
          <span className="text-xs text-slate-500">
            Repeating reminder only while you are within <strong>working hours</strong> (above), not on leave, and not
            on a weekend when &quot;Weekends off&quot; is on. Editing this interval reschedules the next reminder. If you
            never see nudges, allow notifications for Chrome in your OS settings and confirm you are inside the working
            window in your chosen timezone.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notificationSound}
            onChange={(e) => void patch({ notificationSound: e.target.checked })}
          />
          Sound (reserved for future use)
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="leave-heading">
        <h2 id="leave-heading" className="text-lg font-medium text-slate-900">
          Leave
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.isOnLeave}
            onChange={(e) => void patch({ isOnLeave: e.target.checked })}
          />
          On leave (stops nudges immediately)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Leave start (date)</span>
            <input
              type="date"
              className="rounded border border-slate-300 px-2 py-1"
              value={settings.leaveStartDate ?? ''}
              onChange={(e) => void patch({ leaveStartDate: e.target.value || undefined })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Leave end (date)</span>
            <input
              type="date"
              className="rounded border border-slate-300 px-2 py-1"
              value={settings.leaveEndDate ?? ''}
              onChange={(e) => void patch({ leaveEndDate: e.target.value || undefined })}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="google-heading">
        <h2 id="google-heading" className="text-lg font-medium text-slate-900">
          Google account & sync
        </h2>
        <p className="text-xs text-slate-600">
          The <strong>Google account</strong> is always yours (the account you pick at sign-in). The{' '}
          <strong>OAuth Client ID</strong> identifies the app in Google Cloud — use the field below if this build was
          shipped without a built-in client id, or set{' '}
          <code className="rounded bg-slate-100 px-1">VITE_GOOGLE_OAUTH_CLIENT_ID</code> when building.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">OAuth 2.0 Client ID (Web application)</span>
          <input
            type="text"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            placeholder={hasBuildTimeGoogleOAuthClient() ? 'Optional — using build-time client' : 'Required to link Google'}
            value={settings.googleOAuthClientId ?? ''}
            onChange={(e) =>
              void patch({ googleOAuthClientId: e.target.value.trim() || undefined })
            }
          />
          <span className="text-xs text-slate-500">
            In Google Cloud Console → APIs &amp; Services → Credentials → create <em>OAuth client ID</em> →{' '}
            <em>Web application</em>. Under <strong>Authorized redirect URIs</strong> add:
          </span>
          <code className="block break-all rounded bg-slate-100 px-2 py-1 text-xs">{getOAuthRedirectUriForHelp()}</code>
        </label>
        {settings.googleAccountLinked ? (
          <div className="space-y-2 text-sm">
            <p>
              Linked{email ? ` as ${email}` : ''}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-300"
                onClick={() => void runDriveSyncIfPossible().then(() => setMessage('Sync requested.'))}
              >
                Sync now (Drive)
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
                onClick={async () => {
                  await revokeGoogleSession();
                  await patch({ googleAccountLinked: false });
                  setEmail(null);
                }}
              >
                Unlink Google
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={async () => {
              const s = await getSettings();
              if (!hasBuildTimeGoogleOAuthClient() && !s.googleOAuthClientId?.trim()) {
                setError('Add an OAuth Client ID above, or rebuild with VITE_GOOGLE_OAUTH_CLIENT_ID set.');
                return;
              }
              const token = await getAccessToken(true);
              if (!token) {
                setError('Could not complete sign-in. Check Client ID, redirect URI, and API scopes.');
                return;
              }
              await updateSettings({ googleAccountLinked: true });
              setSettings(await getSettings());
              setEmail(await getUserEmail());
              setMessage('Google account linked.');
              setTimeout(() => setMessage(null), 2000);
            }}
          >
            Link Google account
          </button>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Spreadsheet ID (optional)</span>
          <input
            type="text"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            placeholder="from sheets URL"
            value={settings.sheetId ?? ''}
            onChange={(e) => void patch({ sheetId: e.target.value.trim() || undefined })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.autoExportToSheets}
            onChange={(e) => void patch({ autoExportToSheets: e.target.checked })}
          />
          Auto-export pending rows to Sheets (skipped on leave)
        </label>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={async () => {
            const id = await createMonthlySheetIfNeeded(new Date().toISOString().slice(0, 7));
            if (id) {
              await patch({ sheetId: id });
              setMessage(`Created sheet ${id}`);
            } else {
              setError('Could not create sheet.');
            }
          }}
        >
          Create monthly spreadsheet
        </button>
        {settings.lastSyncTimestamp && (
          <p className="text-xs text-slate-500">Last sync: {settings.lastSyncTimestamp}</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-5" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-lg font-medium text-amber-950">
          Data
        </h2>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          onClick={() => void resetSettings().then(() => refresh())}
        >
          Reset settings to defaults
        </button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          onClick={async () => {
            if (window.confirm('Delete all local logs and analytics?')) {
              await clearAllData();
              setMessage('Local data cleared.');
            }
          }}
        >
          Clear all local data
        </button>
      </section>
    </div>
  );
}
