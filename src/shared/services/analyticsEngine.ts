import { createOrUpdateDailyAnalytics, getTaskLogsByDate, getTaskLogsByDateRange } from '../storage/db';
import { buildSuggestions, computeProductivityScore, countMissedSlotsForDate, topBlockerTexts } from '../utils/heuristics';
import type { DailyAnalytics, TaskLog, UserSettings } from '../types';
import {
  adhocMinutesFromSegments,
  logUsesSegments,
  meetingMinutesFromSegments,
  minutesByCategoryFromSegments,
  sumSegmentMinutes,
} from '../utils/segments';

export type DayAggregate = {
  totalProductiveMinutes: number;
  totalMeetingMinutes: number;
  totalAdhocMinutes: number;
  totalOvertimeMinutes: number;
  minutesByCategory: Record<string, number>;
};

/** Aggregate metrics from a set of logs (one calendar day or arbitrary subset). */
export function aggregateLogs(logs: TaskLog[]): DayAggregate {
  const minutesByCategory: Record<string, number> = {};
  let totalMeetingMinutes = 0;
  let totalAdhocMinutes = 0;
  let totalProductiveMinutes = 0;
  let totalOvertimeMinutes = 0;

  const addCat = (id: string, m: number) => {
    if (m <= 0) {
      return;
    }
    minutesByCategory[id] = (minutesByCategory[id] ?? 0) + m;
  };

  for (const log of logs) {
    if (logUsesSegments(log) && log.timeSegments) {
      const segs = log.timeSegments;
      const byCat = minutesByCategoryFromSegments(segs);
      for (const [id, m] of Object.entries(byCat)) {
        addCat(id, m);
      }
      totalMeetingMinutes += meetingMinutesFromSegments(segs);
      totalAdhocMinutes += adhocMinutesFromSegments(segs);
      const prod = segs
        .filter((s) => s.categoryId !== 'meeting' && s.categoryId !== 'break')
        .reduce((a, s) => a + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
      totalProductiveMinutes += prod;
      if (log.isOvertime) {
        totalOvertimeMinutes += sumSegmentMinutes(segs);
      }
    } else {
      const meet = log.hadMeeting ? log.meetingDurationMinutes ?? 0 : 0;
      totalMeetingMinutes += meet;
      if (log.isAdhoc) {
        totalAdhocMinutes += log.timeSpentMinutes;
      }
      totalProductiveMinutes += log.timeSpentMinutes;
      addCat('legacy', log.timeSpentMinutes);
      if (log.isOvertime) {
        totalOvertimeMinutes += log.timeSpentMinutes;
      }
    }
  }

  return {
    totalProductiveMinutes,
    totalMeetingMinutes,
    totalAdhocMinutes,
    totalOvertimeMinutes,
    minutesByCategory,
  };
}

function blockerCount(logs: TaskLog[]): number {
  return logs.filter((l) => l.hasBlocker).length;
}

/**
 * Compute daily analytics from TaskLogs and optionally cache in IndexedDB.
 */
export async function computeDailyAnalytics(
  date: string,
  schedule: Pick<UserSettings, 'timezone' | 'loginTime' | 'logoutTime' | 'weekendsOff'>,
  persist = true,
): Promise<DailyAnalytics> {
  const logs = await getTaskLogsByDate(date);
  const agg = aggregateLogs(logs);
  const missedSlots = countMissedSlotsForDate(date, logs, schedule);
  const blockers = blockerCount(logs);
  const top = topBlockerTexts(logs);
  const productivityScore = computeProductivityScore({
    blockerCount: blockers,
    missedSlots,
    totalMeetingMinutes: agg.totalMeetingMinutes,
    totalProductiveMinutes: agg.totalProductiveMinutes,
  });

  const row: DailyAnalytics = {
    date,
    totalProductiveMinutes: agg.totalProductiveMinutes,
    totalMeetingMinutes: agg.totalMeetingMinutes,
    totalAdhocMinutes: agg.totalAdhocMinutes,
    totalOvertimeMinutes: agg.totalOvertimeMinutes,
    minutesByCategory: agg.minutesByCategory,
    blockerCount: blockers,
    missedSlots,
    productivityScore,
    topBlockers: top,
    suggestions: [],
  };
  row.suggestions = buildSuggestions(row);

  if (persist) {
    await createOrUpdateDailyAnalytics(row);
  }
  return row;
}

export type MonthlyRollup = {
  monthKey: string;
  days: { date: string; productivityScore: number; totalMinutes: number; blockerCount: number }[];
  avgScore: number;
  totalBlockers: number;
  overtimeDays: number;
};

export async function computeMonthlyRollup(
  startDate: string,
  endDate: string,
  schedule: Pick<UserSettings, 'timezone' | 'loginTime' | 'logoutTime' | 'weekendsOff'>,
): Promise<MonthlyRollup> {
  const logs = await getTaskLogsByDateRange(startDate, endDate);
  const byDate = new Map<string, TaskLog[]>();
  for (const l of logs) {
    const arr = byDate.get(l.date) ?? [];
    arr.push(l);
    byDate.set(l.date, arr);
  }

  const days: MonthlyRollup['days'] = [];
  let scoreSum = 0;
  let totalBlockers = 0;
  let overtimeDays = 0;

  for (const [date, dayLogs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const missed = countMissedSlotsForDate(date, dayLogs, schedule);
    const agg = aggregateLogs(dayLogs);
    const bc = blockerCount(dayLogs);
    const score = computeProductivityScore({
      blockerCount: bc,
      missedSlots: missed,
      totalMeetingMinutes: agg.totalMeetingMinutes,
      totalProductiveMinutes: agg.totalProductiveMinutes,
    });
    days.push({
      date,
      productivityScore: score,
      totalMinutes: agg.totalProductiveMinutes + agg.totalMeetingMinutes,
      blockerCount: bc,
    });
    scoreSum += score;
    totalBlockers += bc;
    if (dayLogs.some((l) => l.isOvertime)) {
      overtimeDays += 1;
    }
  }

  const avgScore = days.length ? Math.round(scoreSum / days.length) : 0;
  const monthKey = startDate.slice(0, 7);

  return {
    monthKey,
    days,
    avgScore,
    totalBlockers,
    overtimeDays,
  };
}
