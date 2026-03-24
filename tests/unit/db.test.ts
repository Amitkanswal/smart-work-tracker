import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TaskLog } from '@shared/types';
import {
  createTaskLog,
  deleteTaskLog,
  getTaskLogById,
  getTaskLogsByDate,
  getTaskLogsByDateRange,
  getPendingSyncs,
  markSynced,
  updateTaskLog,
  clearAllData,
  createOrUpdateDailyAnalytics,
  getDailyAnalyticsForDate,
  db,
} from '@shared/storage/db';

describe('Dexie database', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  afterEach(async () => {
    await clearAllData();
  });

  it('creates and retrieves a task log', async () => {
    const log: TaskLog = {
      id: 'test-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00+05:30',
      timeSlotEnd: '2026-03-20T10:00:00+05:30',
      taskDescription: 'Write code',
      timeSpentMinutes: 45,
      hasBlocker: false,
      nextPlan: 'Debug',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    const id = await createTaskLog(log);
    expect(id).toBe('test-1');

    const retrieved = await getTaskLogById('test-1');
    expect(retrieved).toMatchObject(log);
  });

  it('queries by date', async () => {
    const logs: TaskLog[] = [
      {
        id: 'log-1',
        date: '2026-03-20',
        timeSlotStart: '2026-03-20T09:00:00Z',
        timeSlotEnd: '2026-03-20T10:00:00Z',
        taskDescription: 'Task 1',
        timeSpentMinutes: 30,
        hasBlocker: false,
        nextPlan: 'Next',
        isAdhoc: false,
        hadMeeting: false,
        isOvertime: false,
        isBackfill: false,
        createdAt: '2026-03-20T09:00:00Z',
        updatedAt: '2026-03-20T09:00:00Z',
        syncStatus: 'pending',
        syncVersion: 0,
      },
      {
        id: 'log-2',
        date: '2026-03-21',
        timeSlotStart: '2026-03-21T09:00:00Z',
        timeSlotEnd: '2026-03-21T10:00:00Z',
        taskDescription: 'Task 2',
        timeSpentMinutes: 45,
        hasBlocker: true,
        blockerDescription: 'Blocked by X',
        nextPlan: 'Unblock',
        isAdhoc: false,
        hadMeeting: false,
        isOvertime: false,
        isBackfill: false,
        createdAt: '2026-03-21T09:00:00Z',
        updatedAt: '2026-03-21T09:00:00Z',
        syncStatus: 'pending',
        syncVersion: 0,
      },
    ];

    await createTaskLog(logs[0]);
    await createTaskLog(logs[1]);

    const march20 = await getTaskLogsByDate('2026-03-20');
    expect(march20).toHaveLength(1);
    expect(march20[0].id).toBe('log-1');

    const march21 = await getTaskLogsByDate('2026-03-21');
    expect(march21).toHaveLength(1);
    expect(march21[0].id).toBe('log-2');
  });

  it('queries by date range', async () => {
    const dates = ['2026-03-20', '2026-03-21', '2026-03-22'];
    for (const date of dates) {
      await createTaskLog({
        id: `log-${date}`,
        date,
        timeSlotStart: `${date}T09:00:00Z`,
        timeSlotEnd: `${date}T10:00:00Z`,
        taskDescription: `Task for ${date}`,
        timeSpentMinutes: 30,
        hasBlocker: false,
        nextPlan: 'Next',
        isAdhoc: false,
        hadMeeting: false,
        isOvertime: false,
        isBackfill: false,
        createdAt: `${date}T09:00:00Z`,
        updatedAt: `${date}T09:00:00Z`,
        syncStatus: 'pending',
        syncVersion: 0,
      });
    }

    const range = await getTaskLogsByDateRange('2026-03-20', '2026-03-21');
    expect(range).toHaveLength(2);
  });

  it('filters pending syncs', async () => {
    const log1: TaskLog = {
      id: 'log-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00Z',
      timeSlotEnd: '2026-03-20T10:00:00Z',
      taskDescription: 'Task 1',
      timeSpentMinutes: 30,
      hasBlocker: false,
      nextPlan: 'Next',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    const log2: TaskLog = {
      ...log1,
      id: 'log-2',
      syncStatus: 'synced',
    };

    await createTaskLog(log1);
    await createTaskLog(log2);

    const pending = await getPendingSyncs();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('log-1');
  });

  it('updates a task log', async () => {
    const log: TaskLog = {
      id: 'log-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00Z',
      timeSlotEnd: '2026-03-20T10:00:00Z',
      taskDescription: 'Original',
      timeSpentMinutes: 30,
      hasBlocker: false,
      nextPlan: 'Next',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    await updateTaskLog('log-1', { taskDescription: 'Updated', timeSpentMinutes: 50 });

    const updated = await getTaskLogById('log-1');
    expect(updated).toBeDefined();
    expect(updated?.taskDescription).toBe('Updated');
    expect(updated?.timeSpentMinutes).toBe(50);
  });

  it('marks log as synced', async () => {
    const log: TaskLog = {
      id: 'log-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00Z',
      timeSlotEnd: '2026-03-20T10:00:00Z',
      taskDescription: 'Task',
      timeSpentMinutes: 30,
      hasBlocker: false,
      nextPlan: 'Next',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    await markSynced('log-1', 1);

    const synced = await getTaskLogById('log-1');
    expect(synced).toBeDefined();
    expect(synced?.syncStatus).toBe('synced');
    expect(synced?.syncVersion).toBe(1);
  });

  it('deletes a task log', async () => {
    const log: TaskLog = {
      id: 'log-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00Z',
      timeSlotEnd: '2026-03-20T10:00:00Z',
      taskDescription: 'Task',
      timeSpentMinutes: 30,
      hasBlocker: false,
      nextPlan: 'Next',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    await deleteTaskLog('log-1');

    const deleted = await getTaskLogById('log-1');
    expect(deleted).toBeUndefined();
  });

  it('creates and retrieves daily analytics', async () => {
    const analytics = {
      date: '2026-03-20',
      totalProductiveMinutes: 480,
      totalMeetingMinutes: 60,
      totalAdhocMinutes: 30,
      totalOvertimeMinutes: 0,
      minutesByCategory: { focus: 400, meeting: 60 },
      blockerCount: 2,
      missedSlots: 0,
      productivityScore: 85,
      topBlockers: ['API', 'Email'],
      suggestions: ['Check API status', 'Batch email'],
    };

    await createOrUpdateDailyAnalytics(analytics);
    const retrieved = await getDailyAnalyticsForDate('2026-03-20');

    expect(retrieved).toBeDefined();
    expect(retrieved).toMatchObject(analytics);
  });

  it('clears all data', async () => {
    const log: TaskLog = {
      id: 'log-1',
      date: '2026-03-20',
      timeSlotStart: '2026-03-20T09:00:00Z',
      timeSlotEnd: '2026-03-20T10:00:00Z',
      taskDescription: 'Task',
      timeSpentMinutes: 30,
      hasBlocker: false,
      nextPlan: 'Next',
      isAdhoc: false,
      hadMeeting: false,
      isOvertime: false,
      isBackfill: false,
      createdAt: '2026-03-20T09:00:00Z',
      updatedAt: '2026-03-20T09:00:00Z',
      syncStatus: 'pending',
      syncVersion: 0,
    };

    await createTaskLog(log);
    await createOrUpdateDailyAnalytics({
      date: '2026-03-20',
      totalProductiveMinutes: 100,
      totalMeetingMinutes: 30,
      totalAdhocMinutes: 10,
      totalOvertimeMinutes: 0,
      minutesByCategory: {},
      blockerCount: 1,
      missedSlots: 0,
      productivityScore: 70,
      topBlockers: [],
      suggestions: [],
    });

    await clearAllData();

    const logs = await db.taskLogs.toArray();
    const analytics = await db.dailyAnalytics.toArray();

    expect(logs).toHaveLength(0);
    expect(analytics).toHaveLength(0);
  });
});
