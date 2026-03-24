import { subHours } from 'date-fns';
import { BACKFILL_WINDOW_HOURS } from '../constants';
import type { TaskLog, UserSettings } from '../types';
import {
  dateKeyInTimezone,
  expectedWorkingHoursForDate,
  hourInTimezone,
  isoOnDateKey,
  isOnLeaveForNow,
} from './time';

/**
 * Calendar date keys from `from` to `to` (inclusive) stepping by user timezone midnights is approximated
 * by walking UTC hours — good enough for 48h window.
 */
function dateKeysInRange(settings: UserSettings, from: Date, to: Date): string[] {
  const keys = new Set<string>();
  let t = from.getTime();
  const end = to.getTime();
  while (t <= end) {
    keys.add(dateKeyInTimezone(new Date(t), settings.timezone));
    t += 12 * 3600 * 1000;
  }
  keys.add(dateKeyInTimezone(to, settings.timezone));
  return [...keys].sort();
}

export type MissedSlot = { dateKey: string; hour: number };

export function listMissedSlots(
  settings: UserSettings,
  logs: TaskLog[],
  now: Date = new Date(),
): MissedSlot[] {
  if (isOnLeaveForNow(settings, now)) {
    return [];
  }
  const cutoff = subHours(now, BACKFILL_WINDOW_HOURS);
  const keys = dateKeysInRange(settings, cutoff, now);
  const missed: MissedSlot[] = [];

  for (const dateKey of keys) {
    const expected = expectedWorkingHoursForDate(dateKey, settings);
    const dayLogs = logs.filter((l) => isoOnDateKey(l.timeSlotStart, dateKey, settings.timezone));
    const logged = new Set(dayLogs.map((l) => hourInTimezone(l.timeSlotStart, settings.timezone)));
    for (const h of expected) {
      if (!logged.has(h)) {
        missed.push({ dateKey, hour: h });
      }
    }
  }
  return missed;
}
