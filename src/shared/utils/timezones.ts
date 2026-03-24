/**
 * IANA timezone ids for UI (datalist / select). Uses Intl when available.
 */
const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function getTimeZoneOptions(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') {
      return [...fn.call(Intl, 'timeZone')].sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }
  return [...FALLBACK_TIMEZONES];
}

/** One-click popular zones (subset of IANA ids). */
export const QUICK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

/** Whether `tz` is accepted by the engine (valid IANA zone id). */
export function isValidIanaTimeZone(tz: string): boolean {
  const id = String(tz).trim();
  if (!id) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: id }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
