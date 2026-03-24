import { describe, it, expect } from 'vitest';
import { mergeLogs } from '@shared/services/googleDrive';
import type { TaskLog } from '@shared/types';

function log(
  id: string,
  ver: number,
  updatedAt: string,
  desc: string,
  syncStatus: TaskLog['syncStatus'] = 'pending',
): TaskLog {
  return {
    id,
    date: '2026-03-20',
    timeSlotStart: '2026-03-20T10:00:00.000Z',
    timeSlotEnd: '2026-03-20T11:00:00.000Z',
    taskDescription: desc,
    timeSpentMinutes: 30,
    hasBlocker: false,
    nextPlan: 'n',
    isAdhoc: false,
    hadMeeting: false,
    isOvertime: false,
    isBackfill: false,
    createdAt: updatedAt,
    updatedAt,
    syncStatus,
    syncVersion: ver,
  };
}

describe('integration: sync merge (LWW)', () => {
  it('prefers higher syncVersion', () => {
    const local = [log('a', 1, '2026-03-20T12:00:00.000Z', 'local')];
    const remote = [log('a', 2, '2026-03-20T11:00:00.000Z', 'remote')];
    const m = mergeLogs(local, remote);
    expect(m).toHaveLength(1);
    expect(m[0].taskDescription).toBe('remote');
  });

  it('on tie uses newer updatedAt', () => {
    const local = [log('a', 2, '2026-03-20T13:00:00.000Z', 'newer-local')];
    const remote = [log('a', 2, '2026-03-20T12:00:00.000Z', 'older-remote')];
    const m = mergeLogs(local, remote);
    expect(m[0].taskDescription).toBe('newer-local');
  });

  it('combines unique ids', () => {
    const local = [log('a', 1, '2026-03-20T12:00:00.000Z', 'A')];
    const remote = [log('b', 1, '2026-03-20T12:00:00.000Z', 'B')];
    const m = mergeLogs(local, remote);
    expect(m.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});
