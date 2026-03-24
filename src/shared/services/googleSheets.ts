import { getAccessToken } from './googleAuth';
import { getPendingSyncs, getAllTaskLogs } from '../storage/db';
import { getSettings } from '../storage/settingsStore';
import { isOnLeaveForNow } from '../utils/time';
import type { TaskLog } from '../types';

function rowFromLog(log: TaskLog): string[] {
  const timeSegmentsJson =
    log.timeSegments && log.timeSegments.length > 0 ? JSON.stringify(log.timeSegments) : '';
  return [
    log.id,
    log.date,
    log.timeSlotStart,
    log.timeSlotEnd,
    log.taskDescription,
    String(log.timeSpentMinutes),
    String(log.hasBlocker),
    log.blockerDescription ?? '',
    log.nextPlan,
    log.linkedTicket ?? '',
    String(log.isAdhoc),
    log.adhocDescription ?? '',
    String(log.hadMeeting),
    log.meetingDetails ?? '',
    String(log.meetingDurationMinutes ?? ''),
    String(log.isOvertime),
    String(log.isBackfill),
    log.syncStatus,
    String(log.syncVersion),
    timeSegmentsJson,
  ];
}

const HEADER = [
  'id',
  'date',
  'timeSlotStart',
  'timeSlotEnd',
  'taskDescription',
  'timeSpentMinutes',
  'hasBlocker',
  'blockerDescription',
  'nextPlan',
  'linkedTicket',
  'isAdhoc',
  'adhocDescription',
  'hadMeeting',
  'meetingDetails',
  'meetingDurationMinutes',
  'isOvertime',
  'isBackfill',
  'syncStatus',
  'syncVersion',
  'timeSegmentsJson',
];

export async function exportPendingLogsToSheetIfPossible(): Promise<void> {
  const settings = await getSettings();
  if (!settings.sheetId || !settings.googleAccountLinked) {
    return;
  }
  if (settings.autoExportToSheets && isOnLeaveForNow(settings)) {
    return;
  }
  const token = await getAccessToken(false);
  if (!token) {
    return;
  }

  const logs = await getPendingSyncs();
  if (logs.length === 0) {
    return;
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${settings.sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: logs.map((l) => rowFromLog(l)) }),
    },
  );
  if (!res.ok) {
    throw new Error(`Sheets append failed: ${res.status}`);
  }
}

export async function createMonthlySheetIfNeeded(monthLabel: string): Promise<string | null> {
  const token = await getAccessToken(true);
  if (!token) {
    return null;
  }
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: `Smart Work Tracker ${monthLabel}` },
      sheets: [{ properties: { title: 'Sheet1' } }],
    }),
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { spreadsheetId?: string };
  return data.spreadsheetId ?? null;
}

export async function exportAllLogsToSheet(sheetId: string): Promise<boolean> {
  const token = await getAccessToken(true);
  if (!token) {
    return false;
  }
  const logs = await getAllTaskLogs();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [HEADER, ...logs.map((l) => rowFromLog(l))] }),
    },
  );
  return res.ok;
}
