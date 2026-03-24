import { create } from 'zustand';
import type { MissedSlot } from '@shared/utils/backfill';
import type { TimeSegment, UserSettings } from '@shared/types';

export type SaveState = 'idle' | 'saving' | 'success' | 'error';

export type TaskLogFormState = {
  loaded: boolean;
  settings: UserSettings | null;
  dateKey: string;
  slotHour: number;
  timeSlotStart: string;
  timeSlotEnd: string;
  /** Blocks that sum to the slot length (usually 60). */
  timeSegments: TimeSegment[];
  /** Optional narrative for the hour (not required for charts). */
  sessionSummary: string;
  hasBlocker: boolean;
  blockerDescription: string;
  nextPlan: string;
  linkedTicket: string;
  isOvertimeManual: boolean;
  isBackfill: boolean;
  missedSlots: MissedSlot[];
  fieldErrors: Partial<Record<string, string>>;
  saveState: SaveState;
  toast: string | null;
  recentTickets: string[];
  online: boolean;
};

type Actions = {
  setMany: (partial: Partial<TaskLogFormState>) => void;
  resetFields: () => void;
};

export const defaultInitialSegments = (): TimeSegment[] => [{ categoryId: 'focus', minutes: 60, note: '' }];

const baseFieldDefaults: Pick<
  TaskLogFormState,
  | 'timeSegments'
  | 'sessionSummary'
  | 'hasBlocker'
  | 'blockerDescription'
  | 'nextPlan'
  | 'linkedTicket'
  | 'isOvertimeManual'
  | 'isBackfill'
  | 'missedSlots'
  | 'fieldErrors'
  | 'saveState'
  | 'toast'
  | 'recentTickets'
  | 'online'
> = {
  timeSegments: defaultInitialSegments(),
  sessionSummary: '',
  hasBlocker: false,
  blockerDescription: '',
  nextPlan: '',
  linkedTicket: '',
  isOvertimeManual: false,
  isBackfill: false,
  missedSlots: [],
  fieldErrors: {},
  saveState: 'idle',
  toast: null,
  recentTickets: [],
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

export const useTaskLogFormStore = create<TaskLogFormState & Actions>((set, get) => ({
  loaded: false,
  settings: null,
  dateKey: '',
  slotHour: 9,
  timeSlotStart: '',
  timeSlotEnd: '',
  ...baseFieldDefaults,
  setMany: (partial) => set(partial),
  resetFields: () =>
    set(() => {
      const s = get();
      return {
        ...baseFieldDefaults,
        timeSegments: defaultInitialSegments(),
        loaded: s.loaded,
        settings: s.settings,
        dateKey: s.dateKey,
        slotHour: s.slotHour,
        timeSlotStart: s.timeSlotStart,
        timeSlotEnd: s.timeSlotEnd,
        missedSlots: s.missedSlots,
        recentTickets: s.recentTickets,
        online: s.online,
      };
    }),
}));
