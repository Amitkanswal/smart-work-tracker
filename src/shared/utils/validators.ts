import {
  BLOCKER_DESCRIPTION_MAX_LENGTH,
  NEXT_PLAN_MAX_LENGTH,
  SEGMENT_NOTE_MAX_LENGTH,
  SESSION_SUMMARY_MAX_LENGTH,
  TIME_SPENT_MINUTES_MAX,
  TIME_SPENT_MINUTES_MIN,
} from '../constants';
import type { TimeSegment } from '../types';
import { sumSegmentMinutes } from './segments';

export type FieldErrors = Partial<Record<string, string>>;

const SLOT_MINUTES_DEFAULT = 60;

export function validateTimeSegments(
  segments: TimeSegment[],
  slotMinutes: number,
  validCategoryIds: Set<string>,
): FieldErrors {
  const e: FieldErrors = {};
  const cap = Math.min(60, Math.max(1, slotMinutes));

  if (!segments.length) {
    e.timeSegments = 'Add at least one time block.';
    return e;
  }

  let sum = 0;
  segments.forEach((s, i) => {
    const prefix = `segment_${i}`;
    if (!s.categoryId?.trim() || !validCategoryIds.has(s.categoryId)) {
      e[`${prefix}_category`] = 'Pick a category.';
    }
    const m = s.minutes;
    if (!Number.isFinite(m) || m < 1 || m > cap) {
      e[`${prefix}_minutes`] = `Use 1–${cap} minutes per block.`;
    } else {
      sum += m;
    }
    const note = s.note?.trim() ?? '';
    if (note.length > SEGMENT_NOTE_MAX_LENGTH) {
      e[`${prefix}_note`] = `Max ${SEGMENT_NOTE_MAX_LENGTH} characters.`;
    }
  });

  if (sum > cap) {
    e.timeSegments = `Total is ${sum} min — hour slot is ${cap} min. Remove time or shorten a block.`;
  }

  return e;
}

/** Popup save: segments + session-level fields (no legacy meeting/adhoc form fields). */
export function validateSegmentedTaskLog(input: {
  timeSegments: TimeSegment[];
  sessionSummary: string;
  nextPlan: string;
  hasBlocker: boolean;
  blockerDescription?: string;
  validCategoryIds: Set<string>;
  slotMinutes?: number;
}): FieldErrors {
  const slot = input.slotMinutes ?? SLOT_MINUTES_DEFAULT;
  const e = validateTimeSegments(input.timeSegments, slot, input.validCategoryIds);
  if (Object.keys(e).length > 0) {
    return e;
  }

  const sum = sumSegmentMinutes(input.timeSegments);
  if (sum < slot) {
    e.timeSegments = `Allocated ${sum} / ${slot} min — add more time or use “Fill remainder”.`;
  }

  const summary = input.sessionSummary.trim();
  if (summary.length > SESSION_SUMMARY_MAX_LENGTH) {
    e.sessionSummary = `Max ${SESSION_SUMMARY_MAX_LENGTH} characters.`;
  }

  const np = input.nextPlan.trim();
  if (!np) {
    e.nextPlan = 'Next plan is required.';
  } else if (np.length > NEXT_PLAN_MAX_LENGTH) {
    e.nextPlan = `Max ${NEXT_PLAN_MAX_LENGTH} characters.`;
  }

  if (input.hasBlocker) {
    const b = (input.blockerDescription ?? '').trim();
    if (!b) {
      e.blockerDescription = 'Describe the blocker.';
    } else if (b.length > BLOCKER_DESCRIPTION_MAX_LENGTH) {
      e.blockerDescription = `Max ${BLOCKER_DESCRIPTION_MAX_LENGTH} characters.`;
    }
  }

  return e;
}

/** @deprecated Legacy single-block form; kept for tests/migrations. */
export function validateTaskLogForm(input: {
  taskDescription: string;
  timeSpentMinutes: number;
  nextPlan: string;
  hasBlocker: boolean;
  blockerDescription?: string;
  isAdhoc: boolean;
  adhocDescription?: string;
  hadMeeting: boolean;
  meetingDetails?: string;
  meetingDurationMinutes?: number;
}): FieldErrors {
  const e: FieldErrors = {};
  const t = input.taskDescription.trim();
  if (!t) {
    e.taskDescription = 'Task description is required.';
  } else if (t.length > SESSION_SUMMARY_MAX_LENGTH) {
    e.taskDescription = `Max ${SESSION_SUMMARY_MAX_LENGTH} characters.`;
  }

  if (
    !Number.isFinite(input.timeSpentMinutes) ||
    input.timeSpentMinutes < TIME_SPENT_MINUTES_MIN ||
    input.timeSpentMinutes > TIME_SPENT_MINUTES_MAX
  ) {
    e.timeSpentMinutes = `Minutes must be ${TIME_SPENT_MINUTES_MIN}–${TIME_SPENT_MINUTES_MAX}.`;
  }

  const np = input.nextPlan.trim();
  if (!np) {
    e.nextPlan = 'Next plan is required.';
  } else if (np.length > NEXT_PLAN_MAX_LENGTH) {
    e.nextPlan = `Max ${NEXT_PLAN_MAX_LENGTH} characters.`;
  }

  if (input.hasBlocker) {
    const b = (input.blockerDescription ?? '').trim();
    if (!b) {
      e.blockerDescription = 'Describe the blocker.';
    } else if (b.length > BLOCKER_DESCRIPTION_MAX_LENGTH) {
      e.blockerDescription = `Max ${BLOCKER_DESCRIPTION_MAX_LENGTH} characters.`;
    }
  }

  if (input.isAdhoc) {
    const a = (input.adhocDescription ?? '').trim();
    if (!a) {
      e.adhocDescription = 'Describe the ad-hoc work.';
    }
  }

  if (input.hadMeeting) {
    const m = (input.meetingDetails ?? '').trim();
    if (!m) {
      e.meetingDetails = 'Meeting details are required.';
    }
    const md = input.meetingDurationMinutes;
    if (!Number.isFinite(md) || (md ?? 0) < 1 || (md ?? 0) > 480) {
      e.meetingDurationMinutes = 'Use 1–480 minutes.';
    }
  }

  return e;
}

export function validateLoginLogout(loginTime: string, logoutTime: string): string | null {
  const lp = loginTime.split(':').map(Number);
  const op = logoutTime.split(':').map(Number);
  const lh = lp[0];
  const lm = lp[1];
  const oh = op[0];
  const om = op[1];
  if (
    lh === undefined ||
    lm === undefined ||
    oh === undefined ||
    om === undefined ||
    !Number.isFinite(lh) ||
    !Number.isFinite(lm) ||
    !Number.isFinite(oh) ||
    !Number.isFinite(om)
  ) {
    return 'Use HH:mm for login and logout.';
  }
  const a = lh * 60 + lm;
  const b = oh * 60 + om;
  if (a >= b) {
    return 'Login must be before logout.';
  }
  return null;
}
