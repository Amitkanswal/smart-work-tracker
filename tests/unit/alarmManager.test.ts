import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/storage/settingsStore';
import {
  alarmIntervalFromSettings,
  isWithinWorkingHours,
  rescheduleAlarm,
  rescheduleAlarmForSettings,
  scheduleHourlyAlarm,
  scheduleHourlyAlarmForSettings,
  getAlarms,
} from '@shared/services/alarmManager';

// Mock chrome.alarms
const mockChromeAlarms = {
  create: vi.fn(),
  clear: vi.fn(() => Promise.resolve(true)),
  get: vi.fn((_name: string, callback: (a: chrome.alarms.Alarm | undefined) => void) => {
    callback(undefined);
  }),
  getAll: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
  },
};

describe('Alarm Manager', () => {
  beforeEach(() => {
    global.chrome = {
      alarms: mockChromeAlarms,
      runtime: {
        lastError: undefined,
      },
    } as unknown as typeof chrome;
    vi.clearAllMocks();
    mockChromeAlarms.get.mockImplementation((_name: string, callback: (a: chrome.alarms.Alarm | undefined) => void) => {
      callback(undefined);
    });
    mockChromeAlarms.clear.mockImplementation(() => Promise.resolve(true));
  });

  it('checks if within working hours (true when in range)', () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      loginTime: '09:00',
      logoutTime: '18:00',
      timezone: 'UTC',
      weekendsOff: false,
      isOnLeave: false,
    };

    // Mock Intl.DateTimeFormat for a time in range (e.g., 12:00)
    const mockFormatter = {
      formatToParts: () => [
        { type: 'hour', value: '12' },
        { type: 'minute', value: '30' },
      ],
    };

    global.Intl.DateTimeFormat = vi.fn(() => mockFormatter as unknown as Intl.DateTimeFormat);

    expect(isWithinWorkingHours(settings)).toBe(true);
  });

  it('checks if outside working hours (false when before login)', () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      loginTime: '09:00',
      logoutTime: '18:00',
      timezone: 'UTC',
      weekendsOff: false,
      isOnLeave: false,
    };

    // Mock Intl.DateTimeFormat for a time before login (e.g., 08:00)
    const mockFormatter = {
      formatToParts: () => [
        { type: 'hour', value: '08' },
        { type: 'minute', value: '00' },
      ],
    };

    global.Intl.DateTimeFormat = vi.fn(() => mockFormatter as unknown as Intl.DateTimeFormat);

    expect(isWithinWorkingHours(settings)).toBe(false);
  });

  it('returns false when on leave', () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      loginTime: '09:00',
      logoutTime: '18:00',
      timezone: 'UTC',
      isOnLeave: true,
    };

    // Even if time is in range, should be false
    const mockFormatter = {
      formatToParts: () => [
        { type: 'hour', value: '12' },
        { type: 'minute', value: '00' },
      ],
    };

    global.Intl.DateTimeFormat = vi.fn(() => mockFormatter as unknown as Intl.DateTimeFormat);

    expect(isWithinWorkingHours(settings)).toBe(false);
  });

  it('schedules hourly alarm', async () => {
    mockChromeAlarms.create.mockImplementation(() => {
      // Mock implementation
    });

    await scheduleHourlyAlarm(false);

    expect(mockChromeAlarms.create).toHaveBeenCalledWith(
      'hourly-nudge',
      expect.objectContaining({ periodInMinutes: 60 }),
    );
  });

  it('schedules dev alarm with 1-minute interval', async () => {
    mockChromeAlarms.create.mockImplementation(() => {
      // Mock implementation
    });

    await scheduleHourlyAlarm(true);

    expect(mockChromeAlarms.create).toHaveBeenCalledWith(
      'hourly-nudge',
      expect.objectContaining({ periodInMinutes: 1 }),
    );
  });

  it('reschedules alarm', async () => {
    mockChromeAlarms.clear.mockImplementation(() => {
      // Mock implementation
    });
    mockChromeAlarms.create.mockImplementation(() => {
      // Mock implementation
    });

    await rescheduleAlarm(false);

    expect(mockChromeAlarms.clear).toHaveBeenCalledWith('hourly-nudge');
    expect(mockChromeAlarms.create).toHaveBeenCalled();
  });

  it('uses notification interval from settings in production mode', async () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      notificationIntervalMinutes: 30,
      isOnLeave: false,
    };
    expect(alarmIntervalFromSettings(settings, false)).toBe(30);
    await scheduleHourlyAlarmForSettings(settings, false);
    expect(mockChromeAlarms.create).toHaveBeenCalledWith(
      'hourly-nudge',
      expect.objectContaining({ periodInMinutes: 30 }),
    );
  });

  it('does not recreate alarm when period already matches (avoids resetting SW timer)', async () => {
    mockChromeAlarms.get.mockImplementation((_name: string, callback: (a: chrome.alarms.Alarm | undefined) => void) => {
      callback({
        name: 'hourly-nudge',
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 30,
      });
    });
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      notificationIntervalMinutes: 30,
      isOnLeave: false,
    };
    await scheduleHourlyAlarmForSettings(settings, false);
    expect(mockChromeAlarms.create).not.toHaveBeenCalled();
    expect(mockChromeAlarms.clear).not.toHaveBeenCalled();
  });

  it('reschedules using settings', async () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      notificationIntervalMinutes: 45,
      isOnLeave: false,
    };
    await rescheduleAlarmForSettings(settings, false);
    expect(mockChromeAlarms.clear).toHaveBeenCalledWith('hourly-nudge');
    expect(mockChromeAlarms.create).toHaveBeenCalledWith(
      'hourly-nudge',
      expect.objectContaining({ periodInMinutes: 45 }),
    );
  });

  it('gets all alarms', async () => {
    const mockAlarms: chrome.alarms.Alarm[] = [
      {
        name: 'hourly-nudge',
        scheduledTime: Date.now() + 3600000,
        periodInMinutes: 60,
      },
    ];

    mockChromeAlarms.getAll.mockResolvedValue(mockAlarms);

    const alarms = await getAlarms();
    expect(alarms).toEqual(mockAlarms);
  });
});
