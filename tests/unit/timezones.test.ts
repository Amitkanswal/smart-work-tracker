import { describe, it, expect } from 'vitest';
import { isValidIanaTimeZone } from '@shared/utils/timezones';

describe('timezones', () => {
  it('accepts common IANA ids', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
  });

  it('rejects invalid ids', () => {
    expect(isValidIanaTimeZone('')).toBe(false);
    expect(isValidIanaTimeZone('   ')).toBe(false);
    expect(isValidIanaTimeZone('Not/A/Zone')).toBe(false);
    expect(isValidIanaTimeZone('GMT+5')).toBe(false);
  });
});
