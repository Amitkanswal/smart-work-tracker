import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showNotification, onNotificationClick, onNotificationClosed } from '@shared/services/notificationManager';

const mockChromeNotifications = {
  create: vi.fn((id, options, callback) => {
    if (callback) callback(id);
  }),
  onClicked: {
    addListener: vi.fn(),
  },
  onClosed: {
    addListener: vi.fn(),
  },
};

const mockChromeRuntime = {
  getURL: vi.fn((path: string) => `chrome-extension://id/${path}`),
  lastError: undefined,
};

const mockChromeAction = {
  openPopup: vi.fn(),
};

const mockWindows = {
  create: vi.fn().mockResolvedValue({}),
};

describe('Notification Manager', () => {
  beforeEach(() => {
    global.chrome = {
      notifications: mockChromeNotifications,
      runtime: mockChromeRuntime,
      action: mockChromeAction,
      windows: mockWindows,
    } as unknown as typeof chrome;
    vi.clearAllMocks();
  });

  it('shows a notification', async () => {
    await showNotification();

    expect(mockChromeNotifications.create).toHaveBeenCalledWith(
      expect.stringContaining('nudge-'),
      expect.objectContaining({
        type: 'basic',
        title: 'Smart Work Tracker',
        message: 'Time to log your last hour of work.',
      }),
      expect.any(Function),
    );
  });

  it('shows dev notification with different message', async () => {
    await showNotification(true);

    expect(mockChromeNotifications.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: '[DEV] Time to log your work!',
      }),
      expect.any(Function),
    );
  });

  it('listens for notification clicks', () => {
    const callback = vi.fn();
    onNotificationClick(callback);

    expect(mockChromeNotifications.onClicked.addListener).toHaveBeenCalled();

    // Simulate click
    const listener = mockChromeNotifications.onClicked.addListener.mock.calls[0]?.[0];
    if (listener) {
      listener('test-notification-id');
      expect(callback).toHaveBeenCalledWith('test-notification-id');
      expect(mockChromeAction.openPopup).toHaveBeenCalled();
    }
  });

  it('listens for notification closed events', () => {
    const callback = vi.fn();
    onNotificationClosed(callback);

    expect(mockChromeNotifications.onClosed.addListener).toHaveBeenCalled();

    // Simulate close
    const listener = mockChromeNotifications.onClosed.addListener.mock.calls[0]?.[0];
    if (listener) {
      listener('test-notification-id', true);
      expect(callback).toHaveBeenCalledWith('test-notification-id', true);
    }
  });
});
