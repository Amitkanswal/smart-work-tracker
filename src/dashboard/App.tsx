import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeDailyAnalytics, computeMonthlyRollup } from '@shared/services/analyticsEngine';
import { getTaskLogsByDate } from '@shared/storage/db';
import { getSettings } from '@shared/storage/settingsStore';
import type { DailyAnalytics, UserSettings } from '@shared/types';
import { dateKeyInTimezone } from '@shared/utils/time';

const DAY_SUMMARY_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899'];

export function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [dayKey, setDayKey] = useState(() => dateKeyInTimezone(new Date(), 'UTC'));
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [daily, setDaily] = useState<DailyAnalytics | null>(null);
  const [dayLogsCount, setDayLogsCount] = useState(0);
  const [monthly, setMonthly] = useState<Awaited<ReturnType<typeof computeMonthlyRollup>> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setDayKey(dateKeyInTimezone(new Date(), s.timezone));
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const refreshDaily = useCallback(async () => {
    if (!settings) {
      return;
    }
    setLoading(true);
    const logs = await getTaskLogsByDate(dayKey);
    setDayLogsCount(logs.length);
    const schedule = {
      timezone: settings.timezone,
      loginTime: settings.loginTime,
      logoutTime: settings.logoutTime,
      weekendsOff: settings.weekendsOff,
    };
    const d = await computeDailyAnalytics(dayKey, schedule, true);
    setDaily(d);
    setLoading(false);
  }, [dayKey, settings]);

  useEffect(() => {
    if (settings) {
      void refreshDaily();
    }
  }, [settings, refreshDaily]);

  const refreshMonthly = useCallback(async () => {
    if (!settings) {
      return;
    }
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) {
      return;
    }
    const start = `${monthKey}-01`;
    const last = new Date(y, m, 0).getDate();
    const end = `${monthKey}-${String(last).padStart(2, '0')}`;
    const schedule = {
      timezone: settings.timezone,
      loginTime: settings.loginTime,
      logoutTime: settings.logoutTime,
      weekendsOff: settings.weekendsOff,
    };
    const roll = await computeMonthlyRollup(start, end, schedule);
    setMonthly(roll);
  }, [monthKey, settings]);

  useEffect(() => {
    if (settings) {
      void refreshMonthly();
    }
  }, [settings, refreshMonthly]);

  const breakdownData = useMemo(() => {
    if (!daily) {
      return [];
    }
    const focus = Math.max(0, daily.totalProductiveMinutes - daily.totalMeetingMinutes);
    return [
      { name: 'Focus', minutes: focus },
      { name: 'Meetings', minutes: daily.totalMeetingMinutes },
      { name: 'Ad-hoc', minutes: daily.totalAdhocMinutes },
      { name: 'Overtime', minutes: daily.totalOvertimeMinutes },
    ].filter((r) => r.minutes > 0);
  }, [daily]);

  const categoryBreakdownData = useMemo(() => {
    if (!daily || !settings) {
      return [];
    }
    const labelById = new Map(settings.workCategories.map((c) => [c.id, c.label]));
    return Object.entries(daily.minutesByCategory)
      .filter(([, m]) => m > 0)
      .map(([id, minutes]) => ({
        name: id === 'legacy' ? 'Legacy logs' : labelById.get(id) ?? id,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [daily, settings]);

  const monthlyChartData = useMemo(() => monthly?.days.map((d) => ({ date: d.date.slice(8), score: d.productivityScore })) ?? [], [monthly]);

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <header className="mx-auto mb-6 max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-slate-600">Local analytics from IndexedDB</p>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Daily view</h2>
          <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
            <span className="text-slate-600">Date</span>
            <input
              type="date"
              className="rounded border border-slate-300 px-2 py-1"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
            />
          </label>

          {loading && <p className="mt-4 text-sm text-slate-500">Computing…</p>}

          {!loading && daily && dayLogsCount === 0 && (
            <p className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No logs for this day. Use the popup to add an entry.
            </p>
          )}

          {!loading && daily && dayLogsCount > 0 && (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Productivity score</p>
                <p className="mt-1 text-4xl font-bold text-indigo-700">{daily.productivityScore}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Missed slots: {daily.missedSlots} · Blockers: {daily.blockerCount}
                </p>
              </div>
              <div className="h-56">
                <p className="mb-1 text-xs font-medium text-slate-600">Day summary (focus / meetings / …)</p>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <Pie
                      data={breakdownData}
                      dataKey="minutes"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={72}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                    >
                      {breakdownData.map((_, index) => (
                        <Cell key={`day-${index}`} fill={DAY_SUMMARY_COLORS[index % DAY_SUMMARY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${Number(value ?? 0)} min`, 'Time']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {categoryBreakdownData.length > 0 && (
                <div className="h-56 lg:col-span-2">
                  <p className="mb-1 text-xs font-medium text-slate-600">Minutes by category (segment logs)</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryBreakdownData}
                      layout="vertical"
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="minutes" fill="#7c3aed" name="Minutes" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {daily.topBlockers.length > 0 && (
                <div className="lg:col-span-2">
                  <p className="text-sm font-medium text-slate-700">Top blockers</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                    {daily.topBlockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="lg:col-span-2">
                <p className="text-sm font-medium text-slate-700">Suggestions</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {daily.suggestions.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Monthly view</h2>
          <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
            <span className="text-slate-600">Month</span>
            <input
              type="month"
              className="rounded border border-slate-300 px-2 py-1"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
          </label>
          {monthly && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                Avg score: <strong>{monthly.avgScore}</strong> · Total blockers:{' '}
                <strong>{monthly.totalBlockers}</strong> · Days with overtime:{' '}
                <strong>{monthly.overtimeDays}</strong>
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="score" fill="#0d9488" name="Score" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
