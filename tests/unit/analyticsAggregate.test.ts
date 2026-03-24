import { describe, it, expect } from 'vitest';
import { aggregateLogs } from '@shared/services/analyticsEngine';
import type { TaskLog } from '@shared/types';

const baseLog = (over: Partial<TaskLog>): TaskLog => ({
  id: 'x',
  date: '2026-03-20',
  timeSlotStart: '2026-03-20T09:00:00Z',
  timeSlotEnd: '2026-03-20T10:00:00Z',
  taskDescription: 'Legacy',
  timeSpentMinutes: 60,
  hasBlocker: false,
  nextPlan: 'n',
  isAdhoc: false,
  hadMeeting: false,
  isOvertime: false,
  isBackfill: false,
  createdAt: '2026-03-20T10:00:00Z',
  updatedAt: '2026-03-20T10:00:00Z',
  syncStatus: 'pending',
  syncVersion: 0,
  ...over,
});

describe('aggregateLogs', () => {
  it('aggregates legacy logs into minutesByCategory.legacy', () => {
    const agg = aggregateLogs([
      baseLog({ id: 'a', timeSpentMinutes: 45 }),
      baseLog({ id: 'b', timeSpentMinutes: 30, hadMeeting: true, meetingDurationMinutes: 30 }),
    ]);
    expect(agg.minutesByCategory.legacy).toBe(75);
    expect(agg.totalMeetingMinutes).toBe(30);
  });

  it('aggregates segment logs by category and meetings', () => {
    const agg = aggregateLogs([
      baseLog({
        id: 's1',
        timeSegments: [
          { categoryId: 'meeting', minutes: 15 },
          { categoryId: 'focus', minutes: 30 },
          { categoryId: 'debugging', minutes: 15 },
        ],
        taskDescription: 'derived',
        timeSpentMinutes: 60,
        hadMeeting: true,
        meetingDurationMinutes: 15,
      }),
    ]);
    expect(agg.minutesByCategory.meeting).toBe(15);
    expect(agg.minutesByCategory.focus).toBe(30);
    expect(agg.minutesByCategory.debugging).toBe(15);
    expect(agg.totalMeetingMinutes).toBe(15);
    expect(agg.totalProductiveMinutes).toBe(45);
  });
});
