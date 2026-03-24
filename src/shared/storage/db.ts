import Dexie, { type Table } from 'dexie';
import { DB_NAME, STORE_DAILY_ANALYTICS, STORE_TASK_LOGS } from '../constants';
import type { DailyAnalytics, TaskLog } from '../types';

/**
 * SmartWorkTrackerDB — local-first IndexedDB.
 * Primary data store for TaskLogs and computed DailyAnalytics.
 */
export class SmartWorkTrackerDB extends Dexie {
  taskLogs!: Table<TaskLog>;
  dailyAnalytics!: Table<DailyAnalytics>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      [STORE_TASK_LOGS]: '++id, date, [date+timeSlotStart], syncStatus',
      [STORE_DAILY_ANALYTICS]: 'date',
    });
    this.version(2)
      .stores({
        [STORE_TASK_LOGS]: 'id, date, [date+timeSlotStart], syncStatus',
        [STORE_DAILY_ANALYTICS]: 'date',
      })
      .upgrade(async (tx) => {
        const tbl = tx.table(STORE_TASK_LOGS);
        const rows = await tbl.toArray();
        await tbl.clear();
        for (const row of rows) {
          const r = row as Record<string, unknown>;
          const id =
            typeof r.id === 'string' && String(r.id).length > 0
              ? String(r.id)
              : typeof r.id === 'number'
                ? `legacy-${r.id}`
                : crypto.randomUUID();
          await tbl.add({ ...r, id } as TaskLog);
        }
      });
  }
}

/**
 * Singleton instance
 */
export const db = new SmartWorkTrackerDB();

/**
 * TaskLog CRUD operations
 */
export async function createTaskLog(log: TaskLog): Promise<string> {
  return db.taskLogs.add(log);
}

export async function getTaskLogById(id: string): Promise<TaskLog | undefined> {
  return db.taskLogs.get(id);
}

export async function updateTaskLog(id: string, updates: Partial<TaskLog>): Promise<number> {
  return db.taskLogs.update(id, updates);
}

export async function deleteTaskLog(id: string): Promise<void> {
  await db.taskLogs.delete(id);
}

export async function getAllTaskLogs(): Promise<TaskLog[]> {
  return db.taskLogs.toArray();
}

/**
 * Query by date (ISO string: "2026-03-20")
 */
export async function getTaskLogsByDate(date: string): Promise<TaskLog[]> {
  return db.taskLogs.where('date').equals(date).toArray();
}

/**
 * Query by date range (inclusive)
 */
export async function getTaskLogsByDateRange(
  startDate: string,
  endDate: string,
): Promise<TaskLog[]> {
  return db.taskLogs.where('date').between(startDate, endDate, true, true).toArray();
}

/**
 * Get all pending syncs
 */
export async function getPendingSyncs(): Promise<TaskLog[]> {
  return db.taskLogs.where('syncStatus').equals('pending').toArray();
}

/**
 * Mark log as synced
 */
export async function markSynced(id: string, version: number): Promise<number> {
  return db.taskLogs.update(id, {
    syncStatus: 'synced',
    syncVersion: version,
  });
}

/**
 * DailyAnalytics CRUD
 */
export async function createOrUpdateDailyAnalytics(analytics: DailyAnalytics): Promise<string> {
  return db.dailyAnalytics.put(analytics);
}

export async function getDailyAnalyticsForDate(date: string): Promise<DailyAnalytics | undefined> {
  return db.dailyAnalytics.get(date);
}

export async function getDailyAnalyticsByDateRange(
  startDate: string,
  endDate: string,
): Promise<DailyAnalytics[]> {
  return db.dailyAnalytics.where('date').between(startDate, endDate, true, true).toArray();
}

/**
 * Clear all data (for settings reset)
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([db.taskLogs.clear(), db.dailyAnalytics.clear()]);
}
