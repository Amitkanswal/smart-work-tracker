import { describe, it, expect } from 'vitest';
import { validateTimeSegments, validateSegmentedTaskLog } from '@shared/utils/validators';

const cat = new Set(['focus', 'meeting', 'adhoc']);

describe('validateTimeSegments', () => {
  it('rejects empty list', () => {
    const e = validateTimeSegments([], 60, cat);
    expect(e.timeSegments).toMatch(/at least one/);
  });

  it('rejects unknown category', () => {
    const e = validateTimeSegments([{ categoryId: 'nope', minutes: 30 }], 60, cat);
    expect(e.segment_0_category).toBeDefined();
  });

  it('rejects when sum exceeds slot', () => {
    const e = validateTimeSegments(
      [
        { categoryId: 'focus', minutes: 40 },
        { categoryId: 'meeting', minutes: 30 },
      ],
      60,
      cat,
    );
    expect(e.timeSegments).toMatch(/Total is 70/);
  });

  it('accepts valid segments within cap', () => {
    const e = validateTimeSegments(
      [
        { categoryId: 'focus', minutes: 30 },
        { categoryId: 'meeting', minutes: 15 },
      ],
      60,
      cat,
    );
    expect(Object.keys(e)).toHaveLength(0);
  });
});

describe('validateSegmentedTaskLog', () => {
  it('requires full slot allocation', () => {
    const e = validateSegmentedTaskLog({
      timeSegments: [
        { categoryId: 'focus', minutes: 30 },
        { categoryId: 'meeting', minutes: 15 },
      ],
      sessionSummary: '',
      nextPlan: 'Next',
      hasBlocker: false,
      validCategoryIds: cat,
      slotMinutes: 60,
    });
    expect(e.timeSegments).toMatch(/45 \/ 60/);
  });

  it('passes when segments fill slot and next plan set', () => {
    const e = validateSegmentedTaskLog({
      timeSegments: [
        { categoryId: 'meeting', minutes: 15 },
        { categoryId: 'focus', minutes: 30 },
        { categoryId: 'debugging', minutes: 15 },
      ],
      sessionSummary: '',
      nextPlan: 'Ship',
      hasBlocker: false,
      validCategoryIds: new Set(['focus', 'meeting', 'debugging']),
      slotMinutes: 60,
    });
    expect(Object.keys(e)).toHaveLength(0);
  });
});
