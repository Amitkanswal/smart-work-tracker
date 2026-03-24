import { describe, it, expect } from 'vitest';
import { expectedWorkingHoursForDate, isWeekendDateKey } from '@shared/utils/time';

describe('time / weekends', () => {
  it('detects Saturday and Sunday in UTC', () => {
    expect(isWeekendDateKey('2026-03-21', 'UTC')).toBe(true); // Saturday
    expect(isWeekendDateKey('2026-03-22', 'UTC')).toBe(true); // Sunday
    expect(isWeekendDateKey('2026-03-20', 'UTC')).toBe(false); // Friday
  });

  it('returns no expected hours on weekend when weekendsOff', () => {
    const hours = expectedWorkingHoursForDate('2026-03-21', {
      loginTime: '09:00',
      logoutTime: '18:00',
      timezone: 'UTC',
      weekendsOff: true,
    });
    expect(hours).toEqual([]);
  });

  it('returns slots on weekend when weekendsOff is false', () => {
    const hours = expectedWorkingHoursForDate('2026-03-21', {
      loginTime: '09:00',
      logoutTime: '12:00',
      timezone: 'UTC',
      weekendsOff: false,
    });
    expect(hours.length).toBeGreaterThan(0);
  });
});
