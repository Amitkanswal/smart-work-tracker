/**
 * Global constants for the extension.
 * No runtime logic — purely configuration.
 */

import type { UserSettings, WorkCategoryDef } from './types';

// Database
export const DB_NAME = 'SmartWorkTrackerDB';
export const DB_VERSION = 2;
export const STORE_TASK_LOGS = 'taskLogs';
export const STORE_DAILY_ANALYTICS = 'dailyAnalytics';

// Chrome storage
export const CHROME_STORAGE_KEY_SETTINGS = 'userSettings';
export const CHROME_LOCAL_FORM_DRAFT_KEY = 'swtTaskLogFormDraft';
export const CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY = 'swtGoogleWebOAuthToken';

/** Max categories in settings (sync size). */
export const MAX_WORK_CATEGORIES = 20;

export const DEFAULT_WORK_CATEGORIES: WorkCategoryDef[] = [
  { id: 'focus', label: 'Focus / deep work' },
  { id: 'meeting', label: 'Meeting / call' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'code_review', label: 'Code review' },
  { id: 'admin', label: 'Admin / email' },
  { id: 'learning', label: 'Learning / reading' },
  { id: 'break', label: 'Break' },
  { id: 'adhoc', label: 'Ad-hoc' },
  { id: 'other', label: 'Other' },
];

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  loginTime: '09:00',
  logoutTime: '18:00',
  timezone: 'UTC',
  notificationIntervalMinutes: 60,
  notificationSound: true,
  weekendsOff: true,
  workCategories: DEFAULT_WORK_CATEGORIES,
  isOnLeave: false,
  googleAccountLinked: false,
  autoExportToSheets: false,
};

// Validation
export const TASK_DESCRIPTION_MAX_LENGTH = 500;
export const SESSION_SUMMARY_MAX_LENGTH = 500;
export const SEGMENT_NOTE_MAX_LENGTH = 200;
export const BLOCKER_DESCRIPTION_MAX_LENGTH = 300;
export const NEXT_PLAN_MAX_LENGTH = 300;
export const TIME_SPENT_MINUTES_MAX = 60;
export const TIME_SPENT_MINUTES_MIN = 0;

// Sync
export const SYNC_BACKOFF_BASE_MS = 1000;
export const SYNC_BACKOFF_MAX_MS = 30000;
export const OFFLINE_QUEUE_MAX_SIZE = 100;

// Alarms
export const ALARM_NAME_HOURLY = 'hourly-nudge';
export const ALARM_INTERVAL_MINUTES = 60;
export const DEV_ALARM_INTERVAL_MINUTES = 1; // for testing

// Productivity score
export const PRODUCTIVITY_SCORE_MAX = 100;
export const PRODUCTIVITY_SCORE_MIN = 0;

// Backfill
export const BACKFILL_WINDOW_HOURS = 48;
