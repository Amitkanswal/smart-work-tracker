import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserSettings } from '@shared/types';
import {
  getSettings,
  updateSettings,
  resetSettings,
  onSettingsChange,
  CHROME_STORAGE_KEY_SETTINGS,
  DEFAULT_SETTINGS,
} from '@shared/storage/settingsStore';

// Mock chrome.storage API
const mockChrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    lastError: undefined as unknown,
  },
};

describe('SettingsStore', () => {
  beforeEach(() => {
    global.chrome = mockChrome as unknown as typeof chrome;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('gets default settings if none stored', async () => {
    mockChrome.storage.sync.get.mockImplementation((key, callback) => {
      callback({});
    });

    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('gets stored settings', async () => {
    const stored: UserSettings = {
      ...DEFAULT_SETTINGS,
      timezone: 'America/New_York',
      notificationIntervalMinutes: 30,
    };

    mockChrome.storage.sync.get.mockImplementation((key, callback) => {
      callback({ [CHROME_STORAGE_KEY_SETTINGS]: stored });
    });

    const settings = await getSettings();
    expect(settings).toEqual(stored);
  });

  it('rejects on chrome.runtime.lastError', async () => {
    mockChrome.runtime.lastError = { message: 'Storage error' };
    mockChrome.storage.sync.get.mockImplementation((key, callback) => {
      callback({});
    });

    await expect(getSettings()).rejects.toEqual({ message: 'Storage error' });
  });

  it('updates settings with partial merge', async () => {
    const initial: UserSettings = {
      ...DEFAULT_SETTINGS,
      timezone: 'UTC',
    };

    let saveCall: Record<string, unknown> | null = null;
    mockChrome.storage.sync.get.mockImplementation((key, callback) => {
      mockChrome.runtime.lastError = undefined;
      callback({ [CHROME_STORAGE_KEY_SETTINGS]: initial });
    });
    mockChrome.storage.sync.set.mockImplementation((data, callback) => {
      mockChrome.runtime.lastError = undefined;
      saveCall = data;
      callback();
    });

    await updateSettings({ notificationIntervalMinutes: 45 });

    expect(saveCall?.[CHROME_STORAGE_KEY_SETTINGS]).toEqual({
      ...initial,
      notificationIntervalMinutes: 45,
    });
  });

  it('resets to defaults', async () => {
    let saveCall: Record<string, unknown> | null = null;
    mockChrome.storage.sync.set.mockImplementation((data, callback) => {
      mockChrome.runtime.lastError = undefined;
      saveCall = data;
      callback();
    });

    await resetSettings();

    expect(saveCall?.[CHROME_STORAGE_KEY_SETTINGS]).toEqual(DEFAULT_SETTINGS);
  });

  it('listens for settings changes', async () => {
    const callback = vi.fn();
    const oldSettings: UserSettings = { ...DEFAULT_SETTINGS };
    const newSettings: UserSettings = { ...DEFAULT_SETTINGS, timezone: 'Asia/Kolkata' };

    mockChrome.storage.onChanged.addListener.mockImplementation((listener) => {
      // Simulate a change
      listener({
        [CHROME_STORAGE_KEY_SETTINGS]: {
          oldValue: oldSettings,
          newValue: newSettings,
        },
      });
    });

    const unsubscribe = onSettingsChange(callback);

    expect(callback).toHaveBeenCalledWith(newSettings, oldSettings);
    expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();

    // Test unsubscribe
    unsubscribe();
    expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });

  it('ignores unrelated storage changes', async () => {
    const callback = vi.fn();

    mockChrome.storage.onChanged.addListener.mockImplementation((listener) => {
      listener({ otherKey: { newValue: 'value' } });
    });

    onSettingsChange(callback);

    expect(callback).not.toHaveBeenCalled();
  });
});
