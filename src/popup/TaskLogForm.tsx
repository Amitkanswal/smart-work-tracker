import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  CHROME_LOCAL_FORM_DRAFT_KEY,
  SEGMENT_NOTE_MAX_LENGTH,
  SESSION_SUMMARY_MAX_LENGTH,
} from '@shared/constants';
import { createTaskLog, getAllTaskLogs } from '@shared/storage/db';
import { getSettings } from '@shared/storage/settingsStore';
import type { TaskLog, TimeSegment } from '@shared/types';
import { validateSegmentedTaskLog } from '@shared/utils/validators';
import { listMissedSlots } from '@shared/utils/backfill';
import { deriveLegacyFromSegments, sumSegmentMinutes, validCategoryIds } from '@shared/utils/segments';
import {
  isAfterLogoutWallClock,
  slotBoundsFromWallHour,
  suggestedSlotForNow,
} from '@shared/utils/time';
import { defaultInitialSegments, useTaskLogFormStore } from './taskLogFormStore';
import { slotMinutesFromBounds } from './slotMinutes';

const MINUTE_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;

type DraftShape = Partial<
  Pick<
    ReturnType<typeof useTaskLogFormStore.getState>,
    | 'dateKey'
    | 'slotHour'
    | 'timeSegments'
    | 'sessionSummary'
    | 'hasBlocker'
    | 'blockerDescription'
    | 'nextPlan'
    | 'linkedTicket'
    | 'isOvertimeManual'
    | 'isBackfill'
  >
>;

async function loadDraft(): Promise<DraftShape | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHROME_LOCAL_FORM_DRAFT_KEY, (r) => {
      resolve((r[CHROME_LOCAL_FORM_DRAFT_KEY] as DraftShape) ?? null);
    });
  });
}

async function saveDraft(d: DraftShape): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [CHROME_LOCAL_FORM_DRAFT_KEY]: d }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

async function clearDraft(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(CHROME_LOCAL_FORM_DRAFT_KEY, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function normalizeDraftSegments(raw: unknown): TimeSegment[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const out: TimeSegment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const categoryId = String(r.categoryId ?? '').trim();
    const minutes = parseInt(String(r.minutes ?? 0), 10);
    const note = r.note != null ? String(r.note) : '';
    if (!categoryId || !Number.isFinite(minutes)) {
      continue;
    }
    out.push({ categoryId, minutes, note: note || undefined });
  }
  return out.length > 0 ? out : null;
}

export function TaskLogForm() {
  const s = useTaskLogFormStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const init = useCallback(async () => {
    const [settings, allLogs, draft] = await Promise.all([
      getSettings(),
      getAllTaskLogs(),
      loadDraft(),
    ]);
    const sug = suggestedSlotForNow(new Date(), settings);
    const missed = listMissedSlots(settings, allLogs);
    const tickets = [
      ...new Set(
        allLogs
          .map((l) => l.linkedTicket?.trim())
          .filter((x): x is string => Boolean(x)),
      ),
    ].slice(0, 8);

    const { timeSlotStart, timeSlotEnd } = draft?.dateKey
      ? slotBoundsFromWallHour(
          draft.dateKey,
          draft.slotHour ?? sug.hour,
          settings.timezone,
        )
      : { timeSlotStart: sug.timeSlotStart, timeSlotEnd: sug.timeSlotEnd };

    const fromDraft = normalizeDraftSegments(draft?.timeSegments);

    useTaskLogFormStore.getState().setMany({
      loaded: true,
      settings,
      dateKey: draft?.dateKey ?? sug.dateKey,
      slotHour: draft?.slotHour ?? sug.hour,
      timeSlotStart,
      timeSlotEnd,
      timeSegments: fromDraft ?? defaultInitialSegments(),
      sessionSummary: draft?.sessionSummary ?? '',
      hasBlocker: draft?.hasBlocker ?? false,
      blockerDescription: draft?.blockerDescription ?? '',
      nextPlan: draft?.nextPlan ?? '',
      linkedTicket: draft?.linkedTicket ?? '',
      isOvertimeManual: draft?.isOvertimeManual ?? false,
      isBackfill: draft?.isBackfill ?? false,
      missedSlots: missed,
      recentTickets: tickets,
    });
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const on = () => useTaskLogFormStore.getState().setMany({ online: true });
    const off = () => useTaskLogFormStore.getState().setMany({ online: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const persistDraft = useCallback(() => {
    if (!s.loaded) {
      return;
    }
    const d: DraftShape = {
      dateKey: s.dateKey,
      slotHour: s.slotHour,
      timeSegments: s.timeSegments,
      sessionSummary: s.sessionSummary,
      hasBlocker: s.hasBlocker,
      blockerDescription: s.blockerDescription,
      nextPlan: s.nextPlan,
      linkedTicket: s.linkedTicket,
      isOvertimeManual: s.isOvertimeManual,
      isBackfill: s.isBackfill,
    };
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void saveDraft(d).catch(() => undefined);
    }, 400);
  }, [s]);

  useEffect(() => {
    persistDraft();
  }, [
    persistDraft,
    s.dateKey,
    s.slotHour,
    s.timeSegments,
    s.sessionSummary,
    s.hasBlocker,
    s.blockerDescription,
    s.nextPlan,
    s.linkedTicket,
    s.isOvertimeManual,
    s.isBackfill,
    s.loaded,
  ]);

  const updateSlotFromDateHour = useCallback(
    (dateKey: string, hour: number) => {
      const tz = s.settings?.timezone ?? 'UTC';
      const { timeSlotStart, timeSlotEnd } = slotBoundsFromWallHour(dateKey, hour, tz);
      useTaskLogFormStore.getState().setMany({ dateKey, slotHour: hour, timeSlotStart, timeSlotEnd });
    },
    [s.settings?.timezone],
  );

  const suggested = useMemo(() => {
    if (!s.settings) {
      return null;
    }
    return suggestedSlotForNow(new Date(), s.settings);
  }, [s.settings]);

  const slotMin = useMemo(
    () => slotMinutesFromBounds(s.timeSlotStart, s.timeSlotEnd),
    [s.timeSlotStart, s.timeSlotEnd],
  );

  const allocated = useMemo(() => sumSegmentMinutes(s.timeSegments), [s.timeSegments]);

  const categorySet = useMemo(() => {
    if (!s.settings) {
      return new Set<string>();
    }
    return validCategoryIds(s.settings.workCategories);
  }, [s.settings]);

  const isOvertimeAuto = s.settings ? isAfterLogoutWallClock(s.settings) : false;
  const isOvertime = isOvertimeAuto || s.isOvertimeManual;

  const updateSegment = (index: number, patch: Partial<TimeSegment>) => {
    const next = s.timeSegments.map((row, i) => (i === index ? { ...row, ...patch } : row));
    useTaskLogFormStore.getState().setMany({ timeSegments: next });
  };

  const removeSegment = (index: number) => {
    if (s.timeSegments.length <= 1) {
      return;
    }
    useTaskLogFormStore.getState().setMany({
      timeSegments: s.timeSegments.filter((_, i) => i !== index),
    });
  };

  const addSegment = () => {
    const first = s.settings?.workCategories[0]?.id ?? 'focus';
    useTaskLogFormStore.getState().setMany({
      timeSegments: [...s.timeSegments, { categoryId: first, minutes: 15, note: '' }],
    });
  };

  const fillRemainder = () => {
    if (!s.settings) {
      return;
    }
    const rem = slotMin - allocated;
    if (rem <= 0) {
      return;
    }
    const focusId =
      s.settings.workCategories.find((c) => c.id === 'focus')?.id ??
      s.settings.workCategories[0]?.id ??
      'focus';
    const segs = [...s.timeSegments];
    const last = segs[segs.length - 1];
    if (last && last.categoryId === focusId) {
      segs[segs.length - 1] = { ...last, minutes: last.minutes + rem };
    } else {
      segs.push({ categoryId: focusId, minutes: rem, note: '' });
    }
    useTaskLogFormStore.getState().setMany({ timeSegments: segs });
  };

  const submit = async () => {
    if (!s.settings) {
      return;
    }
    const errors = validateSegmentedTaskLog({
      timeSegments: s.timeSegments,
      sessionSummary: s.sessionSummary,
      nextPlan: s.nextPlan,
      hasBlocker: s.hasBlocker,
      blockerDescription: s.blockerDescription,
      validCategoryIds: categorySet,
      slotMinutes: slotMin,
    });
    if (Object.keys(errors).length > 0) {
      useTaskLogFormStore.getState().setMany({ fieldErrors: errors, toast: 'Fix highlighted fields.' });
      return;
    }

    const derived = deriveLegacyFromSegments(s.timeSegments);
    const summary = s.sessionSummary.trim();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const log: TaskLog = {
      id,
      date: s.dateKey,
      timeSlotStart: s.timeSlotStart,
      timeSlotEnd: s.timeSlotEnd,
      timeSegments: s.timeSegments.map((x) => ({
        categoryId: x.categoryId,
        minutes: x.minutes,
        note: x.note?.trim() || undefined,
      })),
      taskDescription: summary || derived.taskDescription,
      timeSpentMinutes: derived.timeSpentMinutes,
      hasBlocker: s.hasBlocker,
      blockerDescription: s.hasBlocker ? s.blockerDescription.trim() : undefined,
      nextPlan: s.nextPlan.trim(),
      linkedTicket: s.linkedTicket.trim() || undefined,
      isAdhoc: derived.isAdhoc,
      adhocDescription: derived.adhocDescription,
      hadMeeting: derived.hadMeeting,
      meetingDetails: derived.meetingDetails,
      meetingDurationMinutes: derived.meetingDurationMinutes,
      isOvertime,
      isBackfill: s.isBackfill,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      syncVersion: 0,
    };

    useTaskLogFormStore.getState().setMany({ saveState: 'saving', fieldErrors: {}, toast: null });
    try {
      await createTaskLog(log);
      await clearDraft();
      useTaskLogFormStore.getState().setMany({ saveState: 'success', toast: 'Saved locally.' });
      useTaskLogFormStore.getState().resetFields();
      if (s.settings) {
        const sug = suggestedSlotForNow(new Date(), s.settings);
        updateSlotFromDateHour(sug.dateKey, sug.hour);
        useTaskLogFormStore.getState().setMany({
          isBackfill: false,
          missedSlots: listMissedSlots(s.settings, await getAllTaskLogs()),
        });
      }
      chrome.runtime.sendMessage({ type: 'SWT_SYNC_NOW' }, () => undefined);
      if (!navigator.onLine) {
        chrome.runtime.sendMessage(
          { type: 'SWT_ENQUEUE_OFFLINE', payload: { kind: 'drive_sync' } },
          () => undefined,
        );
      }
      setTimeout(() => useTaskLogFormStore.getState().setMany({ saveState: 'idle', toast: null }), 2500);
    } catch (e) {
      useTaskLogFormStore.getState().setMany({
        saveState: 'error',
        toast: e instanceof Error ? e.message : 'Save failed.',
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  if (!s.loaded || !s.settings) {
    return (
      <div className="p-4 text-sm text-slate-600" role="status">
        Loading…
      </div>
    );
  }

  const err = (name: string) => s.fieldErrors[name];
  const cats = s.settings.workCategories;
  const pct = Math.min(100, Math.round((allocated / slotMin) * 100));

  return (
    <form className="flex flex-col gap-2 p-3 pb-4" onKeyDown={onKeyDown} onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-indigo-950">Log this hour</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            s.online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
          title={s.online ? 'Online' : 'Offline — sync queued'}
        >
          {s.online ? 'Online' : 'Offline'}
        </span>
      </div>

      {s.missedSlots.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
          <span className="font-medium">{s.missedSlots.length}</span> missed slot(s).{' '}
          <label className="sr-only" htmlFor="missed-slot">
            Backfill slot
          </label>
          <select
            id="missed-slot"
            className="ml-1 max-w-[220px] rounded border border-amber-300 bg-white px-1 py-0.5 text-xs"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                return;
              }
              const [dk, h] = v.split('|');
              if (!dk || h === undefined) {
                return;
              }
              updateSlotFromDateHour(dk, parseInt(h, 10));
              useTaskLogFormStore.getState().setMany({ isBackfill: true });
              e.currentTarget.value = '';
            }}
          >
            <option value="">Fill a missed slot…</option>
            {s.missedSlots.map((m) => (
              <option key={`${m.dateKey}|${m.hour}`} value={`${m.dateKey}|${m.hour}`}>
                {m.dateKey} @ {String(m.hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-600">Date</span>
          <input
            type="date"
            className="rounded border border-slate-300 px-1 py-1"
            value={s.dateKey}
            onChange={(e) => {
              updateSlotFromDateHour(e.target.value, s.slotHour);
              const sug2 = suggested;
              if (sug2 && (e.target.value !== sug2.dateKey || s.slotHour !== sug2.hour)) {
                useTaskLogFormStore.getState().setMany({ isBackfill: true });
              }
            }}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-600">Slot hour (local)</span>
          <input
            type="number"
            min={0}
            max={23}
            className="rounded border border-slate-300 px-1 py-1"
            value={s.slotHour}
            onChange={(e) => {
              const h = Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0));
              updateSlotFromDateHour(s.dateKey, h);
              const sug2 = suggested;
              if (sug2 && (s.dateKey !== sug2.dateKey || h !== sug2.hour)) {
                useTaskLogFormStore.getState().setMany({ isBackfill: true });
              } else {
                useTaskLogFormStore.getState().setMany({ isBackfill: false });
              }
            }}
          />
        </label>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-indigo-950">This hour — time blocks</span>
          <span className="text-xs text-slate-600">
            {allocated} / {slotMin} min
          </span>
        </div>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${allocated > slotMin ? 'bg-red-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {allocated < slotMin && (
          <button
            type="button"
            className="mb-2 text-xs font-medium text-indigo-700 underline"
            onClick={fillRemainder}
          >
            Fill remainder with Focus (or add block)
          </button>
        )}
        {err('timeSegments') && <p className="mb-2 text-xs text-red-600">{err('timeSegments')}</p>}

        <div className="flex flex-col gap-2">
          {s.timeSegments.map((seg, i) => (
            <div key={i} className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <select
                  className="min-w-[8rem] flex-1 rounded border border-slate-300 px-1 py-1 text-xs"
                  value={seg.categoryId}
                  onChange={(e) => updateSegment(i, { categoryId: e.target.value })}
                  aria-label={`Block ${i + 1} category`}
                >
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={slotMin}
                  className="w-14 rounded border border-slate-300 px-1 py-1 text-xs"
                  value={seg.minutes}
                  onChange={(e) =>
                    updateSegment(i, { minutes: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  aria-label={`Block ${i + 1} minutes`}
                />
                <span className="text-xs text-slate-500">min</span>
                {s.timeSegments.length > 1 && (
                  <button
                    type="button"
                    className="ml-auto text-xs text-red-600 hover:underline"
                    onClick={() => removeSegment(i)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="mb-1 flex flex-wrap gap-1">
                {MINUTE_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-indigo-100"
                    onClick={() => updateSegment(i, { minutes: m })}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <input
                type="text"
                maxLength={SEGMENT_NOTE_MAX_LENGTH}
                placeholder="Note (optional)"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                value={seg.note ?? ''}
                onChange={(e) => updateSegment(i, { note: e.target.value })}
              />
              {err(`segment_${i}_category`) && (
                <p className="text-xs text-red-600">{err(`segment_${i}_category`)}</p>
              )}
              {err(`segment_${i}_minutes`) && (
                <p className="text-xs text-red-600">{err(`segment_${i}_minutes`)}</p>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 w-full rounded border border-dashed border-indigo-300 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
          onClick={addSegment}
        >
          + Add time block
        </button>
      </div>

      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-slate-600">Session summary (optional)</span>
        <textarea
          maxLength={SESSION_SUMMARY_MAX_LENGTH}
          rows={2}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Overall context for this hour…"
          value={s.sessionSummary}
          onChange={(e) => useTaskLogFormStore.getState().setMany({ sessionSummary: e.target.value })}
        />
        {err('sessionSummary') && <span className="text-red-600">{err('sessionSummary')}</span>}
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={s.hasBlocker}
          onChange={(e) => useTaskLogFormStore.getState().setMany({ hasBlocker: e.target.checked })}
        />
        Blocker
      </label>
      {s.hasBlocker && (
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-slate-600">Blocker details *</span>
          <textarea
            rows={2}
            maxLength={300}
            className="rounded border border-slate-300 px-2 py-1"
            value={s.blockerDescription}
            onChange={(e) => useTaskLogFormStore.getState().setMany({ blockerDescription: e.target.value })}
          />
          {err('blockerDescription') && (
            <span className="text-red-600">{err('blockerDescription')}</span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-slate-600">Next plan *</span>
        <textarea
          rows={2}
          maxLength={300}
          className="rounded border border-slate-300 px-2 py-1"
          value={s.nextPlan}
          onChange={(e) => useTaskLogFormStore.getState().setMany({ nextPlan: e.target.value })}
        />
        {err('nextPlan') && <span className="text-red-600">{err('nextPlan')}</span>}
      </label>

      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-slate-600">Linked ticket</span>
        <input
          list="recent-tickets"
          className="rounded border border-slate-300 px-2 py-1"
          value={s.linkedTicket}
          onChange={(e) => useTaskLogFormStore.getState().setMany({ linkedTicket: e.target.value })}
        />
        <datalist id="recent-tickets">
          {s.recentTickets.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={s.isOvertimeManual}
            onChange={(e) => useTaskLogFormStore.getState().setMany({ isOvertimeManual: e.target.checked })}
          />
          Mark overtime
        </label>
        {isOvertimeAuto && (
          <span className="text-amber-800">After logout — logged as overtime</span>
        )}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={s.isBackfill}
            onChange={(e) => useTaskLogFormStore.getState().setMany({ isBackfill: e.target.checked })}
          />
          Backfill entry
        </label>
      </div>

      <button
        type="button"
        className="mt-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        disabled={s.saveState === 'saving'}
        onClick={() => void submit()}
      >
        {s.saveState === 'saving' ? 'Saving…' : 'Save log'}
      </button>
      <p className="text-[10px] text-slate-500">⌘/Ctrl + Enter to submit</p>

      {s.toast && (
        <p className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-800" role="status">
          {s.toast}
        </p>
      )}
    </form>
  );
}
