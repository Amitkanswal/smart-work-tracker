import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { getTimeZoneOptions, isValidIanaTimeZone, QUICK_TIMEZONES } from '@shared/utils/timezones';

type Props = {
  value: string;
  onCommit: (ianaId: string) => void;
};

const LIST_MAX = 200;

/**
 * Reliable timezone selection: explicit clicks commit once (no per-keystroke sync).
 * Search filters IANA ids; custom id validated before apply.
 */
export function TimezonePicker({ value, onCommit }: Props) {
  const allZones = useMemo(() => getTimeZoneOptions(), []);
  const [query, setQuery] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  useEffect(() => {
    setCustomDraft('');
    setCustomError(null);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allZones;
    }
    return allZones.filter((z) => z.toLowerCase().includes(q));
  }, [allZones, query]);

  const shown = useMemo(() => filtered.slice(0, LIST_MAX), [filtered]);

  const selectZone = useCallback(
    (tz: string) => {
      const id = tz.trim();
      if (!isValidIanaTimeZone(id)) {
        return;
      }
      onCommit(id);
      setQuery('');
      setCustomError(null);
    },
    [onCommit],
  );

  const tryCustom = useCallback(() => {
    const id = customDraft.trim();
    if (!id) {
      setCustomError('Enter an IANA timezone id.');
      return;
    }
    if (!isValidIanaTimeZone(id)) {
      setCustomError('Not a valid IANA timezone (check spelling and underscores).');
      return;
    }
    setCustomError(null);
    onCommit(id);
    setCustomDraft('');
  }, [customDraft, onCommit]);

  let previewNow = '';
  try {
    previewNow = formatInTimeZone(new Date(), value, 'EEE, MMM d, yyyy · HH:mm');
  } catch {
    previewNow = '—';
  }

  return (
    <div className="space-y-3">
      {!isValidIanaTimeZone(value) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          The saved timezone id is not valid. Select a valid IANA zone below (e.g. <code className="font-mono">UTC</code>
          ).
        </p>
      )}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm">
        <p className="font-medium text-indigo-950">Selected timezone</p>
        <p className="mt-0.5 font-mono text-sm text-indigo-900">{value}</p>
        <p className="mt-1 text-xs text-indigo-800/80">Clock preview: {previewNow}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Quick picks</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TIMEZONES.map((tz) => (
            <button
              key={tz}
              type="button"
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                value === tz
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
              }`}
              onClick={() => selectZone(tz)}
            >
              {tz.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="tz-search" className="mb-1 block text-sm font-medium text-slate-700">
          Search all IANA zones
        </label>
        <input
          id="tz-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. Kolkata, Tokyo, New_York…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          {filtered.length > LIST_MAX ? ` — showing first ${LIST_MAX}` : ''}. Click a row to save.
        </p>
      </div>

      <div
        className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-inner"
        role="listbox"
        aria-label="Timezone search results"
      >
        {shown.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">No matches. Try another search.</p>
        ) : (
          shown.map((tz) => (
            <button
              key={tz}
              type="button"
              role="option"
              aria-selected={value === tz}
              className={`flex w-full items-center border-b border-slate-100 px-3 py-2 text-left font-mono text-sm last:border-b-0 hover:bg-indigo-50 ${
                value === tz ? 'bg-indigo-50 font-semibold text-indigo-900' : 'text-slate-800'
              }`}
              onClick={() => selectZone(tz)}
            >
              {tz}
            </button>
          ))
        )}
      </div>

      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Custom IANA id</p>
        <p className="mb-2 text-xs text-slate-500">
          If your zone is not listed, type the exact id (e.g. <code className="rounded bg-white px-1">Europe/Zurich</code>
          ).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder="Europe/Zurich"
            value={customDraft}
            onChange={(e) => {
              setCustomDraft(e.target.value);
              setCustomError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tryCustom();
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            onClick={() => tryCustom()}
          >
            Validate &amp; apply
          </button>
        </div>
        {customError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {customError}
          </p>
        )}
      </div>
    </div>
  );
}
