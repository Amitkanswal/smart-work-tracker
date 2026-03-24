import { ALARM_NAME_HOURLY } from '@shared/constants';
import {
  isWithinWorkingHours,
  rescheduleAlarmForSettings,
  scheduleHourlyAlarmForSettings,
} from '@shared/services/alarmManager';
import {
  openLoggingUi,
  registerNotificationClickOpensPopup,
  showNotification,
} from '@shared/services/notificationManager';
import { exportPendingLogsToSheetIfPossible } from '@shared/services/googleSheets';
import { flushOfflineQueue, enqueueOffline } from '@shared/services/offlineQueue';
import { runDriveSyncIfPossible } from '@shared/services/syncManager';
import { isOnLeaveForNow } from '@shared/utils/time';
import { onSettingsChange, getSettings } from '@shared/storage/settingsStore';
import type { UserSettings } from '@shared/types';

const isDev = import.meta.env.DEV;

/**
 * Handle alarm firing: check working hours, show notification if within window.
 */
async function handleAlarmFired(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM_NAME_HOURLY) {
    return;
  }

  try {
    const settings = await getSettings();

    if (isWithinWorkingHours(settings)) {
      console.log('[SmartWorkTracker] Within working hours; showing notification.');
      await showNotification(isDev);
    } else {
      console.log('[SmartWorkTracker] Outside working hours or on leave; skipping notification.');
    }
  } catch (error) {
    console.error('[SmartWorkTracker] Error handling alarm:', error);
  }
}

// Register synchronously at load so an alarm that woke the SW is not missed, and so we
// do not replace that alarm in init before the listener exists.
chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarmFired(alarm);
});

/**
 * Initialize the background service worker.
 * Sets up notification handling, alarm schedule, and settings change detection.
 */
export async function initializeServiceWorker(): Promise<void> {
  console.log('[SmartWorkTracker] Service worker initializing...');

  registerNotificationClickOpensPopup();

  try {
    const settings = await getSettings();
    await scheduleHourlyAlarmForSettings(settings, isDev);
    console.log('[SmartWorkTracker] Nudge alarm scheduled.');
  } catch (error) {
    console.error('[SmartWorkTracker] Failed to schedule alarm:', error);
  }

  onSettingsChange(async (newSettings: UserSettings, oldSettings?: UserSettings) => {
    const needsReschedule =
      newSettings.notificationIntervalMinutes !== oldSettings?.notificationIntervalMinutes ||
      newSettings.isOnLeave !== oldSettings?.isOnLeave ||
      newSettings.loginTime !== oldSettings?.loginTime ||
      newSettings.logoutTime !== oldSettings?.logoutTime ||
      newSettings.timezone !== oldSettings?.timezone ||
      newSettings.weekendsOff !== oldSettings?.weekendsOff ||
      newSettings.leaveStartDate !== oldSettings?.leaveStartDate ||
      newSettings.leaveEndDate !== oldSettings?.leaveEndDate;

    if (needsReschedule) {
      try {
        await rescheduleAlarmForSettings(newSettings, isDev);
        console.log('[SmartWorkTracker] Alarm rescheduled after settings change.');
      } catch (e) {
        console.error('[SmartWorkTracker] Failed to reschedule alarm:', e);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SWT_SYNC_NOW') {
      void (async () => {
        try {
          await runDriveSyncIfPossible();
          const latest = await getSettings();
          if (latest.autoExportToSheets && latest.sheetId && !isOnLeaveForNow(latest)) {
            try {
              await exportPendingLogsToSheetIfPossible();
            } catch (sheetErr) {
              console.warn('[SmartWorkTracker] Sheets export skipped:', sheetErr);
            }
          }
          await flushOfflineQueue();
          sendResponse({ ok: true });
        } catch (e) {
          console.error('[SmartWorkTracker] Sync failed:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
    if (message?.type === 'SWT_ENQUEUE_OFFLINE') {
      void enqueueOffline(message.payload).then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  self.addEventListener('online', () => {
    void flushOfflineQueue();
  });

  chrome.commands?.onCommand?.addListener((command) => {
    if (command === 'open-logging-popup') {
      void openLoggingUi();
    }
  });

  console.log('[SmartWorkTracker] Service worker initialized.');
}

// Initialize on load
initializeServiceWorker().catch((error) => {
  console.error('[SmartWorkTracker] Failed to initialize service worker:', error);
});

export {};
