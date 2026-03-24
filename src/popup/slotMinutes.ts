/** Length of the logging slot in whole minutes (hourly slots → 60). */
export function slotMinutesFromBounds(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    return 60;
  }
  const m = Math.round((b - a) / 60000);
  return Math.min(120, Math.max(15, m));
}
