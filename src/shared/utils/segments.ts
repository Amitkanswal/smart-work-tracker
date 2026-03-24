import type { TaskLog, TimeSegment, WorkCategoryDef } from '../types';

export const CATEGORY_ID_MEETING = 'meeting';
export const CATEGORY_ID_ADHOC = 'adhoc';

export function sumSegmentMinutes(segments: TimeSegment[]): number {
  return segments.reduce((a, s) => a + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
}

/** True if log uses segment model. */
export function logUsesSegments(log: TaskLog): boolean {
  return Array.isArray(log.timeSegments) && log.timeSegments.length > 0;
}

export function minutesByCategoryFromSegments(segments: TimeSegment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of segments) {
    const id = s.categoryId.trim();
    if (!id) {
      continue;
    }
    const m = Number.isFinite(s.minutes) ? s.minutes : 0;
    out[id] = (out[id] ?? 0) + m;
  }
  return out;
}

export function meetingMinutesFromSegments(segments: TimeSegment[]): number {
  return segments
    .filter((s) => s.categoryId === CATEGORY_ID_MEETING)
    .reduce((a, s) => a + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
}

export function adhocMinutesFromSegments(segments: TimeSegment[]): number {
  return segments
    .filter((s) => s.categoryId === CATEGORY_ID_ADHOC)
    .reduce((a, s) => a + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
}

/**
 * Build legacy TaskLog fields from segments for Sheets/sync consumers.
 */
export function deriveLegacyFromSegments(segments: TimeSegment[]): Pick<
  TaskLog,
  | 'taskDescription'
  | 'timeSpentMinutes'
  | 'hadMeeting'
  | 'meetingDurationMinutes'
  | 'isAdhoc'
  | 'adhocDescription'
  | 'meetingDetails'
> {
  const total = sumSegmentMinutes(segments);
  const meetMin = meetingMinutesFromSegments(segments);
  const adhocMin = adhocMinutesFromSegments(segments);
  const noteParts = segments
    .map((s) => (s.note?.trim() ? s.note.trim() : ''))
    .filter(Boolean);
  const taskDescription = noteParts.length > 0 ? noteParts.join(' · ') : '';

  const adhocNotes = segments
    .filter((s) => s.categoryId === CATEGORY_ID_ADHOC && s.note?.trim())
    .map((s) => s.note!.trim());

  return {
    taskDescription,
    timeSpentMinutes: Math.min(60, Math.max(0, total)),
    hadMeeting: meetMin > 0,
    meetingDurationMinutes: meetMin > 0 ? meetMin : undefined,
    meetingDetails: meetMin > 0 ? segments.filter((s) => s.categoryId === CATEGORY_ID_MEETING).map((s) => s.note?.trim()).filter(Boolean).join(' · ') || undefined : undefined,
    isAdhoc: adhocMin > 0,
    adhocDescription: adhocNotes.length > 0 ? adhocNotes.join(' · ') : adhocMin > 0 ? `${adhocMin}m ad-hoc` : undefined,
  };
}

export function validCategoryIds(categories: WorkCategoryDef[]): Set<string> {
  return new Set(categories.map((c) => c.id));
}
