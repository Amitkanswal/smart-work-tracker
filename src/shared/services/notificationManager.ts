// @ts-nocheck Chrome notification API type mismatch
/**
 * Workaround for incomplete Chrome notification API typings.
 */
export interface NotificationCreateOptions {
  type: 'basic' | 'image' | 'list' | 'progress';
  iconUrl: string;
  title: string;
  message: string;
  priority?: number;
  requireInteraction?: boolean;
}

/**
 * Open the logging UI: prefer action popup (user-gesture contexts); fall back to a popup window.
 * `chrome.action.openPopup` is not available from all contexts; `windows.create` requires `windows` permission.
 */
export async function openLoggingUi(): Promise<void> {
  const popupUrl = chrome.runtime.getURL('popup.html');

  try {
    const open = chrome.action?.openPopup;
    if (typeof open === 'function') {
      const result = open.call(chrome.action);
      if (result && typeof result.then === 'function') {
        await result.catch(() => undefined);
        return;
      }
    }
  } catch {
    /* fall through */
  }

  if (chrome.windows?.create) {
    await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 420,
      height: 680,
      focused: true,
    });
    return;
  }

  if (chrome.tabs?.create) {
    await chrome.tabs.create({ url: popupUrl, active: true });
  }
}

/**
 * Show a Chrome notification.
 */
export async function showNotification(isDev: boolean = false): Promise<void> {
  const notificationId = `nudge-${Date.now()}`;

  const opts: NotificationCreateOptions = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Smart Work Tracker',
    message: isDev
      ? '[DEV] Time to log your work!'
      : 'Time to log your last hour of work.',
    priority: 1,
    requireInteraction: false,
  };

  return new Promise((resolve) => {
    chrome.notifications.create(
      notificationId,
      opts as unknown as chrome.notifications.NotificationOptions,
      () => {
        resolve();
      },
    );
  });
}

/**
 * Listen for notification clicks and open the logging UI.
 */
export function registerNotificationClickOpensPopup(): void {
  chrome.notifications.onClicked.addListener(() => {
    void openLoggingUi();
  });
}

/**
 * Listen for notification clicks (optional callback before open).
 */
export function onNotificationClick(callback: (notificationId: string) => void): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    callback(notificationId);
    void openLoggingUi();
  });
}

/**
 * Listen for notification close events.
 */
export function onNotificationClosed(callback: (notificationId: string, byUser: boolean) => void): void {
  chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    callback(notificationId, byUser);
  });
}
