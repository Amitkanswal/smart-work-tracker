import { ALARM_NAME_HOURLY, DEFAULT_SETTINGS, DEV_ALARM_INTERVAL_MINUTES } from '../constants';
import { isOnLeaveForNow, isWeekendNow } from '../utils/time';
import type { UserSettings } from '../types';

/**
 * Check if current time is within working hours (respecting timezone and leave status).
 */
export function isWithinWorkingHours(settings: UserSettings): boolean {
  if (isOnLeaveForNow(settings)) {
    return false;
  }
  if (settings.weekendsOff !== false && isWeekendNow(settings)) {
    return false;
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: settings.timezone,
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return currentTime >= settings.loginTime && currentTime < settings.logoutTime;
}

/** Clamp Chrome alarm period (minutes). */
export function alarmIntervalFromSettings(settings: UserSettings, isDev: boolean): number {
  if (isDev) {
    return DEV_ALARM_INTERVAL_MINUTES;
  }
  const n = settings.notificationIntervalMinutes;
  if (!Number.isFinite(n) || n < 1) {
    return 60;
  }
  return Math.min(24 * 60, Math.max(1, Math.floor(n)));
}

function getAlarm(name: string): Promise<chrome.alarms.Alarm | undefined> {
  return new Promise((resolve) => {
    chrome.alarms.get(name, (a) => {
      resolve(a);
    });
  });
}

/**
 * Schedule the nudge alarm using user interval (or 1 min in dev).
 * If an alarm with the same period already exists, does nothing — recreating on every
 * service worker start would reset the timer and delay or drop nudges.
 */
export async function scheduleHourlyAlarmForSettings(
  settings: UserSettings,
  isDev: boolean = false,
): Promise<void> {
  const periodInMinutes = alarmIntervalFromSettings(settings, isDev);
  const existing = await getAlarm(ALARM_NAME_HOURLY);
  if (existing?.periodInMinutes === periodInMinutes) {
    return;
  }
  await chrome.alarms.clear(ALARM_NAME_HOURLY);
  chrome.alarms.create(ALARM_NAME_HOURLY, {
    periodInMinutes,
  } as chrome.alarms.AlarmCreateInfo);
}

/**
 * @deprecated Use scheduleHourlyAlarmForSettings with DEFAULT_SETTINGS in tests.
 */
export async function scheduleHourlyAlarm(isDev: boolean = false): Promise<void> {
  await scheduleHourlyAlarmForSettings(DEFAULT_SETTINGS, isDev);
}

/**
 * Reschedule alarm (e.g. on settings change).
 */
export async function rescheduleAlarmForSettings(
  settings: UserSettings,
  isDev: boolean = false,
): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME_HOURLY);
  await scheduleHourlyAlarmForSettings(settings, isDev);
}

/**
 * @deprecated Use rescheduleAlarmForSettings in production paths.
 */
export async function rescheduleAlarm(isDev: boolean = false): Promise<void> {
  await rescheduleAlarmForSettings(DEFAULT_SETTINGS, isDev);
}

/**
 * Get all active alarms.
 */
export async function getAlarms(): Promise<chrome.alarms.Alarm[]> {
  return chrome.alarms.getAll();
}
