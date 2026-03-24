import { addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { UserSettings } from '../types';

/** YYYY-MM-DD for a calendar day in the user's IANA timezone. */
export function dateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * True if the user should be treated as on leave right now:
 * explicit flag, or calendar today falls inside leaveStartDate..leaveEndDate (inclusive).
 */
export function isOnLeaveForNow(settings: UserSettings, now: Date = new Date()): boolean {
  if (settings.isOnLeave) {
    return true;
  }
  const start = settings.leaveStartDate;
  const end = settings.leaveEndDate;
  if (!start || !end) {
    return false;
  }
  const today = dateKeyInTimezone(now, settings.timezone);
  return today >= start && today <= end;
}

/** Parse "HH:mm" to minutes from midnight; invalid -> NaN. */
export function parseHmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m?.[1] || !m[2]) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/** Clock hour (0–23) of an instant in the user's timezone. */
export function hourInTimezone(isoOrDate: string | Date, timeZone: string): number {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
}

/**
 * Working-hour clock hours (0–23) for `dateKey` that should have a log slot,
 * based on login/logout wall times (half-open [login, logout)).
 */
/** ISO weekday in user TZ: 1=Mon … 7=Sun. Weekend = Sat/Sun. */
export function isoWeekdayInTimezone(dateKey: string, timeZone: string): number {
  const d = fromZonedTime(`${dateKey}T12:00:00`, timeZone);
  return parseInt(formatInTimeZone(d, timeZone, 'i'), 10);
}

export function isWeekendDateKey(dateKey: string, timeZone: string): boolean {
  const i = isoWeekdayInTimezone(dateKey, timeZone);
  return i === 6 || i === 7;
}

export function isWeekendNow(settings: UserSettings, now: Date = new Date()): boolean {
  const key = dateKeyInTimezone(now, settings.timezone);
  return isWeekendDateKey(key, settings.timezone);
}

export function expectedWorkingHoursForDate(
  dateKey: string,
  settings: Pick<UserSettings, 'loginTime' | 'logoutTime' | 'timezone' | 'weekendsOff'>,
): number[] {
  if (settings.weekendsOff !== false && isWeekendDateKey(dateKey, settings.timezone)) {
    return [];
  }

  const loginM = parseHmToMinutes(settings.loginTime);
  const logoutM = parseHmToMinutes(settings.logoutTime);
  if (!Number.isFinite(loginM) || !Number.isFinite(logoutM) || logoutM <= loginM) {
    return [];
  }

  const hours: number[] = [];
  for (let m = loginM; m < logoutM; m += 60) {
    hours.push(Math.floor(m / 60));
  }
  return hours;
}

/** Whether `iso` falls on `dateKey` in the user's timezone. */
export function isoOnDateKey(iso: string, dateKey: string, timeZone: string): boolean {
  return dateKeyInTimezone(new Date(iso), timeZone) === dateKey;
}

/** Wall-clock hour (0–23) and minute in IANA timezone for an instant. */
export function clockHourMinuteInTimezone(isoOrDate: string | Date, timeZone: string): {
  hour: number;
  minute: number;
} {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const h = parseInt(formatInTimeZone(d, timeZone, 'H'), 10);
  const m = parseInt(formatInTimeZone(d, timeZone, 'm'), 10);
  return { hour: h, minute: m };
}

/**
 * Start/end ISO (UTC) for a working slot starting at wall hour on dateKey in timezone.
 */
export function slotBoundsFromWallHour(dateKey: string, hour: number, timeZone: string): {
  timeSlotStart: string;
  timeSlotEnd: string;
} {
  const local = `${dateKey}T${String(hour).padStart(2, '0')}:00:00`;
  const start = fromZonedTime(local, timeZone);
  const end = addHours(start, 1);
  return { timeSlotStart: start.toISOString(), timeSlotEnd: end.toISOString() };
}

/** Default slot for "now": current calendar day + floored clock hour in user TZ. */
export function suggestedSlotForNow(now: Date, settings: UserSettings): {
  dateKey: string;
  hour: number;
  timeSlotStart: string;
  timeSlotEnd: string;
} {
  const dateKey = dateKeyInTimezone(now, settings.timezone);
  const { hour } = clockHourMinuteInTimezone(now, settings.timezone);
  const { timeSlotStart, timeSlotEnd } = slotBoundsFromWallHour(dateKey, hour, settings.timezone);
  return { dateKey, hour, timeSlotStart, timeSlotEnd };
}

export function isAfterLogoutWallClock(settings: UserSettings, now: Date = new Date()): boolean {
  const logoutM = parseHmToMinutes(settings.logoutTime);
  if (!Number.isFinite(logoutM)) {
    return false;
  }
  const { hour, minute } = clockHourMinuteInTimezone(now, settings.timezone);
  const nowM = hour * 60 + minute;
  return nowM >= logoutM;
}
