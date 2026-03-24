/** User-defined or default activity type for a slice of the hour. */
export interface WorkCategoryDef {
  id: string;
  label: string;
}

/** One slice of time within an hourly TaskLog. */
export interface TimeSegment {
  categoryId: string;
  minutes: number;
  note?: string;
}

/**
 * TaskLog — primary data stored in IndexedDB.
 * One entry per hourly slot (or manual backfill).
 */
export interface TaskLog {
  id: string; // UUID v4
  date: string; // ISO date: "2026-03-20"
  timeSlotStart: string; // ISO 8601 datetime with offset
  timeSlotEnd: string;
  /**
   * When non-empty, source of truth for time use in this slot.
   * Legacy `taskDescription` / `timeSpentMinutes` / meeting flags may be derived for exports.
   */
  timeSegments?: TimeSegment[];
  /** Optional narrative for the hour (graphs use segments). */
  taskDescription: string;
  timeSpentMinutes: number; // 0-60

  hasBlocker: boolean;
  blockerDescription?: string;

  nextPlan: string;
  linkedTicket?: string;

  isAdhoc: boolean;
  adhocDescription?: string;
  adhocLinkedStory?: string;

  hadMeeting: boolean;
  meetingDetails?: string;
  meetingDurationMinutes?: number;

  isOvertime: boolean;
  isBackfill: boolean;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  syncStatus: 'pending' | 'synced' | 'conflict';
  syncVersion: number;
}

/**
 * UserSettings — user-provided config stored in chrome.storage.sync.
 * Small footprint; never store full logs here.
 */
export interface UserSettings {
  loginTime: string; // "09:00"
  logoutTime: string; // "18:00"
  timezone: string; // IANA: "Asia/Kolkata", "America/New_York"
  notificationIntervalMinutes: number; // 60 for hourly
  notificationSound: boolean;
  /** When true (default), Saturday/Sunday in `timezone` count as non-working — no nudges or expected slots. */
  weekendsOff: boolean;
  /** Editable activity categories for time segments (max ~20, keep small for sync quota). */
  workCategories: WorkCategoryDef[];
  isOnLeave: boolean;
  leaveStartDate?: string; // ISO date
  leaveEndDate?: string; // ISO date
  googleAccountLinked: boolean;
  /**
   * OAuth 2.0 Client ID from the user’s Google Cloud project (Web client).
   * Used when the extension was built without `VITE_GOOGLE_OAUTH_CLIENT_ID` so each user can supply their own app id; the **signed-in Google account** is always the end user’s.
   */
  googleOAuthClientId?: string;
  autoExportToSheets: boolean;
  sheetId?: string; // Google Sheets ID
  lastSyncTimestamp?: string; // ISO 8601
}

/**
 * DailyAnalytics — computed metrics for a single day (cached in IndexedDB).
 * Regenerated on demand from TaskLogs; not canonical source.
 */
export interface DailyAnalytics {
  date: string; // ISO date: "2026-03-20"
  totalProductiveMinutes: number;
  totalMeetingMinutes: number;
  totalAdhocMinutes: number;
  totalOvertimeMinutes: number;
  /** Minutes keyed by category id (segment-based logs); may be empty for legacy-only days. */
  minutesByCategory: Record<string, number>;
  blockerCount: number;
  missedSlots: number;
  productivityScore: number; // 0-100
  topBlockers: string[];
  suggestions: string[];
}

/**
 * Sync status union for TaskLog.
 */
export type SyncStatus = TaskLog['syncStatus'];

/**
 * Request/response shape for Google Drive sync.
 */
export interface SyncPayload {
  taskLogs: TaskLog[];
  version: number;
}
