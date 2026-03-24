import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TaskLog } from '@shared/types';
import { computeDailyAnalytics } from '@shared/services/analyticsEngine';
import { clearAllData, createTaskLog, getTaskLogsByDate } from '@shared/storage/db';

describe('integration: task log flow', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  afterEach(async () => {
    await clearAllData();
  });

  it('saves a log and appears in daily query and analytics', async () => {
    const log: TaskLog = {
      id: crypto.randomUUID(),
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00.000Z',
      timeSlotEnd: '2026-03-20T10:00:00.000Z',
      taskDescription: 'Integration task',
      timeSpentMinutes: 50,
      hasBlocker: false,
      nextPlan: 'Ship',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T10:00:00.000Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    const rows = await getTaskLogsByDate('2026-03-20');
    expect(rows).toHaveLength(1);
    expect(rows[0].taskDescription).toBe('Integration task');

    const analytics = await computeDailyAnalytics(
      '2026-03-20',
      {
        timezone: 'UTC',
        loginTime: '09:00',
        logoutTime: '18:00',
        weekendsOff: true,
      },
      false,
    );
    expect(analytics.totalProductiveMinutes).toBeGreaterThanOrEqual(50);
    expect(analytics.productivityScore).toBeGreaterThan(0);
  });

  it('multi-segment log rolls up minutesByCategory', async () => {
    const log: TaskLog = {
      id: crypto.randomUUID(),
      date: '2026-03-21',
      timeSlotStart: '2026-03-21T09:00:00.000Z',
      timeSlotEnd: '2026-03-21T10:00:00.000Z',
      timeSegments: [
        { categoryId: 'meeting', minutes: 15 },
        { categoryId: 'focus', minutes: 30 },
        { categoryId: 'debugging', minutes: 15 },
      ],
      taskDescription: 'Notes',
      timeSpentMinutes: 60,
      hasBlocker: false,
      nextPlan: 'Continue',
      isAdhoc: false,
      hadMeeting: true,
      meetingDurationMinutes: 15,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-21T10:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    const analytics = await computeDailyAnalytics(
      '2026-03-21',
      {
        timezone: 'UTC',
        loginTime: '09:00',
        logoutTime: '18:00',
        weekendsOff: true,
      },
      false,
    );
    expect(analytics.minutesByCategory.meeting).toBe(15);
    expect(analytics.minutesByCategory.focus).toBe(30);
    expect(analytics.minutesByCategory.debugging).toBe(15);
    expect(analytics.totalMeetingMinutes).toBe(15);
  });
});
