import type { DailyAnalytics, TaskLog, UserSettings } from '../types';
import { expectedWorkingHoursForDate, hourInTimezone, isoOnDateKey } from './time';

/**
 * Productivity score (deterministic MVP):
 * Start at 100, subtract for blockers, missed slots, high meeting ratio.
 */
export function computeProductivityScore(input: {
  blockerCount: number;
  missedSlots: number;
  totalMeetingMinutes: number;
  totalProductiveMinutes: number;
}): number {
  let s = 100;
  s -= Math.min(40, input.blockerCount * 8);
  s -= Math.min(30, input.missedSlots * 10);
  const total = input.totalProductiveMinutes + input.totalMeetingMinutes;
  if (total > 0) {
    const meetRatio = input.totalMeetingMinutes / total;
    if (meetRatio > 0.5) {
      s -= Math.min(20, Math.round((meetRatio - 0.5) * 80));
    }
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function buildSuggestions(a: DailyAnalytics): string[] {
  const out: string[] = [];
  if (a.missedSlots > 0) {
    out.push(`You missed ${a.missedSlots} expected slot(s) — use backfill to close the gap.`);
  }
  if (a.blockerCount > 2) {
    out.push('Several blockers logged — consider time-boxing or escalating.');
  }
  if (a.totalMeetingMinutes > a.totalProductiveMinutes && a.totalMeetingMinutes > 60) {
    out.push('Meetings exceeded focus time — protect deep-work blocks.');
  }
  if (a.productivityScore < 60) {
    out.push('Score is low this day — review blockers and tomorrow’s first task.');
  }
  if (out.length === 0) {
    out.push('Steady day — keep logging each hour.');
  }
  return out;
}

export function topBlockerTexts(logs: TaskLog[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.hasBlocker && l.blockerDescription?.trim()) {
      const k = l.blockerDescription.trim().slice(0, 120);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

export function countMissedSlotsForDate(
  dateKey: string,
  logs: TaskLog[],
  schedule: Pick<UserSettings, 'timezone' | 'loginTime' | 'logoutTime' | 'weekendsOff'>,
): number {
  const expected = expectedWorkingHoursForDate(dateKey, schedule);
  const loggedHours = new Set<number>();
  for (const l of logs) {
    if (!isoOnDateKey(l.timeSlotStart, dateKey, schedule.timezone)) {
      continue;
    }
    loggedHours.add(hourInTimezone(l.timeSlotStart, schedule.timezone));
  }
  let missed = 0;
  for (const h of expected) {
    if (!loggedHours.has(h)) {
      missed += 1;
    }
  }
  return missed;
}
