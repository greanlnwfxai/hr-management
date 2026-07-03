'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDashboard, getMyAttendance, getMyLeaveBalances, getMyLeave,
  type DashboardData, type RangePreset, type AttendanceRecord, type LeaveBalance, type LeaveRequest,
} from '@/lib/api';
import { ApiError } from '@/lib/api';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { useLanguage } from '@/hooks/useLanguage';
import { leaveTypeLabel, attendanceStatusLabel, leaveStatusLabel } from '@/lib/i18n';
import { getUser } from '@/lib/auth';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  });
}

// ── Attendance business-date helpers ─────────────────────────────────────────
// The API encodes `attendance.date` as a UTC-midnight timestamp representing the
// Asia/Bangkok calendar day (see apps/api attendance.service.ts `todayBangkok()`),
// e.g. "2026-07-01T00:00:00.000Z" means business date 2026-07-01 — it is not a
// real midnight instant. Comparing that raw ISO string against a "YYYY-MM-DD"
// today string never matches, which is why today's own record was never found.

function normalizeAttendanceBusinessDate(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // already a plain business-date string
  return raw.slice(0, 10); // ISO timestamp — the UTC calendar digits are the business date
}

function bangkokTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function isSameBangkokDate(raw: string, todayKey: string): boolean {
  return normalizeAttendanceBusinessDate(raw) === todayKey;
}

function formatAttendanceDate(raw: string): string {
  const key = normalizeAttendanceBusinessDate(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return raw;
  const [, y, m, d] = match;
  // Re-parse as UTC so the already-correct business-date digits aren't
  // reinterpreted through the browser's local timezone.
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatLeaveDateRange(startDate: string, endDate: string): string {
  const start = formatAttendanceDate(startDate);
  const end = formatAttendanceDate(endDate);
  return start === end ? start : `${start} – ${end}`;
}

function formatAttendanceTime(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

function statusBadge(status: string, label?: string) {
  const map: Record<string, string> = {
    ACTIVE:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    PRESENT:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    INACTIVE: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
    ABSENT:   'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    LATE:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    PENDING:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {label ?? status}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = 'zinc', icon, testid,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: 'zinc' | 'green' | 'blue' | 'amber' | 'red' | 'indigo';
  icon?: React.ReactNode;
  testid?: string;
}) {
  const accentBar: Record<string, string> = {
    zinc:   'bg-zinc-300 dark:bg-zinc-600',
    green:  'bg-green-400 dark:bg-green-500',
    blue:   'bg-blue-400 dark:bg-blue-500',
    amber:  'bg-amber-400 dark:bg-amber-500',
    red:    'bg-red-400 dark:bg-red-500',
    indigo: 'bg-indigo-400 dark:bg-indigo-500',
  };
  const accentIcon: Record<string, string> = {
    zinc:   'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400',
    green:  'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
    blue:   'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    amber:  'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    red:    'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  };
  return (
    <div data-testid={testid} className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
      <div className={`absolute left-0 top-0 h-full w-1 ${accentBar[accent]}`} />
      <div className="flex items-start justify-between gap-1 pl-1">
        <div className="min-w-0">
          <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400 truncate">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
          {sub && <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{sub}</p>}
        </div>
        {icon && (
          <div className={`flex-shrink-0 rounded-lg p-1.5 ${accentIcon[accent]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leave Balance Ring ───────────────────────────────────────────────────────

function LeaveBalanceRing({
  remaining, total, size = 96, strokeWidth = 10,
}: {
  remaining: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const ringColor = pct <= 20
    ? 'stroke-red-400 dark:stroke-red-500'
    : pct <= 50
    ? 'stroke-amber-400 dark:stroke-amber-500'
    : 'stroke-blue-400 dark:stroke-blue-500';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-zinc-100 dark:stroke-zinc-700" />
        {total > 0 && (
          <circle
            cx="50" cy="50" r={radius} fill="none" strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference - dash}
            strokeLinecap="round"
            className={`transition-all duration-500 ${ringColor}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none text-zinc-900 dark:text-zinc-50 tabular-nums">{remaining}</span>
        <span className="mt-1 text-[11px] leading-none text-zinc-400 dark:text-zinc-500 tabular-nums">/ {total}</span>
      </div>
    </div>
  );
}

// ── Chart Card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title, children, className = '', badge,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  badge?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm text-zinc-700 dark:text-zinc-300 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{title}</h2>
        {badge && (
          <span className="flex-shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-700/60 border border-zinc-200 dark:border-zinc-600 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <svg className="w-8 h-8 text-zinc-200 dark:text-zinc-700" fill="none" viewBox="0 0 40 40">
        <rect x="4" y="28" width="6" height="8" rx="1" fill="currentColor" />
        <rect x="13" y="20" width="6" height="16" rx="1" fill="currentColor" />
        <rect x="22" y="14" width="6" height="22" rx="1" fill="currentColor" />
        <rect x="31" y="8" width="6" height="28" rx="1" fill="currentColor" />
      </svg>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{message}</p>
    </div>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────────────

type LineSeries = { key: string; label: string; color: string };

function LineChart({
  data,
  series,
  emptyMessage,
}: {
  data: Array<Record<string, string | number>>;
  series: LineSeries[];
  emptyMessage: string;
}) {
  const PAD = { top: 16, right: 10, bottom: 30, left: 34 };
  const W = 520;
  const H = 148;
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const allVals = data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)));
  const maxVal = Math.max(1, ...allVals);
  const hasData = allVals.some((v) => v > 0);

  const xOf = (i: number) =>
    PAD.left + (data.length <= 1 ? cw / 2 : (i / (data.length - 1)) * cw);
  const yOf = (v: number) => PAD.top + ch - (v / maxVal) * ch;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const step = Math.ceil(data.length / 7);
  const xTicks = data
    .map((d, i) => ({ i, label: String(d.date).slice(5) }))
    .filter((_, i) => data.length <= 7 || i % step === 0);

  if (!hasData) return <ChartEmpty message={emptyMessage} />;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 200 }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)}
              stroke="currentColor" strokeOpacity={0.08} strokeWidth={1}
            />
            <text x={PAD.left - 4} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.5}>
              {v}
            </text>
          </g>
        ))}
        {xTicks.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="currentColor" fillOpacity={0.5}>
            {label}
          </text>
        ))}
        {series.map((s) => {
          const pts = data.map((d, i) => `${xOf(i)},${yOf(Number(d[s.key] ?? 0))}`).join(' ');
          return (
            <g key={s.key}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {data.map((d, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(Number(d[s.key] ?? 0))} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-3 justify-center">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

type DonutSegment = { label: string; value: number; color: string };

function DonutChart({ segments, centerLabel }: { segments: DonutSegment[]; centerLabel: string }) {
  const CX = 64, CY = 64, R = 54, IR = 32;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const hasData = total > 0;

  let angle = -Math.PI / 2;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const startAngle = angle;
    const endAngle = angle + pct * Math.PI * 2;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const ix1 = CX + IR * Math.cos(startAngle);
    const iy1 = CY + IR * Math.sin(startAngle);
    const ix2 = CX + IR * Math.cos(endAngle);
    const iy2 = CY + IR * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    const path = pct > 0
      ? `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
      : '';
    angle = endAngle;
    return { ...seg, path, pct };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 128 128" className="w-28 h-28 flex-shrink-0">
        {!hasData ? (
          <circle cx={CX} cy={CY} r={(R + IR) / 2} fill="none"
            stroke="currentColor" strokeOpacity={0.1} strokeWidth={R - IR} />
        ) : (
          arcs.map((arc, i) => arc.path && <path key={i} d={arc.path} fill={arc.color} />)
        )}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={18} fontWeight="700" fill="currentColor">
          {total}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {centerLabel}
        </text>
      </svg>
      <div className="flex flex-col gap-2 justify-center flex-1 min-w-0">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate flex-1">{s.label}</span>
            <span className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 flex-shrink-0 tabular-nums">
              {s.value}
              <span className="font-normal text-zinc-400 dark:text-zinc-500 ml-0.5">
                ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal Stacked Bar Chart ───────────────────────────────────────────────

type BarSeries = { label: string; color: string };

function StackedBarChart({
  rows,
  series,
  emptyMessage,
}: {
  rows: Array<{ label: string; values: number[] }>;
  series: BarSeries[];
  emptyMessage: string;
}) {
  const hasData = rows.some((r) => r.values.some((v) => v > 0));
  if (!hasData) return <ChartEmpty message={emptyMessage} />;

  const maxTotal = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  const BAR_H = 16;
  const GAP = 8;
  const LABEL_W = 90;
  const W = 480;
  const H = rows.length * (BAR_H + GAP) + GAP + 24;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 200 }}>
        {rows.map((row, ri) => {
          const y = GAP + ri * (BAR_H + GAP);
          const total = row.values.reduce((a, b) => a + b, 0);
          let xOff = LABEL_W;
          return (
            <g key={ri}>
              <text x={LABEL_W - 5} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.65}>
                {row.label.length > 12 ? row.label.slice(0, 11) + '…' : row.label}
              </text>
              {total === 0 ? (
                <rect x={LABEL_W} y={y} width={4} height={BAR_H} fill="currentColor" fillOpacity={0.1} rx={2} />
              ) : (
                row.values.map((v, si) => {
                  const w = (v / maxTotal) * (W - LABEL_W - 10);
                  const rx = si === 0 ? 3 : 0;
                  const ry = si === row.values.length - 1 ? 3 : 0;
                  const rect = (
                    <rect key={si} x={xOff} y={y} width={Math.max(0, w)} height={BAR_H}
                      fill={series[si]?.color ?? '#ccc'} rx={rx} ry={ry} />
                  );
                  xOff += Math.max(0, w);
                  return rect;
                })
              )}
            </g>
          );
        })}
        {series.map((s, i) => (
          <g key={i}>
            <rect x={LABEL_W + i * 80} y={H - 18} width={7} height={7} fill={s.color} rx={2} />
            <text x={LABEL_W + i * 80 + 11} y={H - 12} fontSize={8} fill="currentColor" fillOpacity={0.55}>
              {s.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Ranking Bar Chart ─────────────────────────────────────────────────────────

function RankingBarChart({
  items,
  countUnit,
  emptyMessage,
}: {
  items: Array<{ name: string; count: number }>;
  countUnit: string;
  emptyMessage: string;
}) {
  if (items.length === 0) return <ChartEmpty message={emptyMessage} />;
  const maxCount = Math.max(1, ...items.map((x) => x.count));

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="w-4 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[70%]">{item.name}</span>
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 flex-shrink-0 ml-1">
                {item.count} {countUnit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IconPeople = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconCalendar = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconClock = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" d="M12 6v6l4 2" />
  </svg>
);

const IconTrendUp = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 4 4 9-9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 7h7v7" />
  </svg>
);

const IconRefresh = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ── Personal Summary (self-scoped: attendance/me, leave-balances/my, leave/me) ──

type SelfData = {
  attendance: AttendanceRecord[];
  balances: LeaveBalance[];
  leave: LeaveRequest[];
};

function PersonalSummaryBody({ data }: { data: SelfData }) {
  const { t, lang } = useLanguage();

  const todayKey = bangkokTodayKey();
  const todayRecord = data.attendance.find((r) => isSameBangkokDate(r.date, todayKey));
  const totalRemaining = data.balances.reduce((sum, b) => sum + b.remainingDays, 0);
  const pendingLeave = data.leave.filter((l) => l.status === 'PENDING').length;

  const todayAccent = todayRecord?.status === 'PRESENT'
    ? 'green' : todayRecord?.status === 'LATE'
    ? 'amber' : todayRecord?.status === 'ABSENT'
    ? 'red' : 'zinc';

  const todayCheckIn = formatAttendanceTime(todayRecord?.checkIn);
  const todayCheckOut = formatAttendanceTime(todayRecord?.checkOut);
  const todaySub = todayCheckIn
    ? `${t('emp_dash_check_in')} ${todayCheckIn}${todayCheckOut ? ` · ${t('emp_dash_check_out')} ${todayCheckOut}` : ''}`
    : undefined;

  return (
    <div>
      {/* KPI Row */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <KpiCard
          testid="stat-today-att"
          label={t('emp_dash_today_attendance')}
          value={todayRecord ? attendanceStatusLabel(todayRecord.status, lang) : '—'}
          sub={todaySub}
          accent={todayAccent as 'zinc' | 'green' | 'amber' | 'red'}
          icon={<IconClock />}
        />
        <KpiCard
          testid="stat-leave-balance"
          label={t('emp_dash_leave_balance')}
          value={totalRemaining}
          sub={t('emp_dash_days_remaining')}
          accent="blue"
          icon={<IconCalendar />}
        />
        <KpiCard
          testid="stat-pending-leave"
          label={t('emp_dash_pending_leave')}
          value={pendingLeave}
          accent="amber"
          icon={<IconCalendar />}
        />
      </div>

      {/* 3-column panels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Recent Attendance */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-my-attendance" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('emp_dash_recent_attendance')}
          </h2>
          {data.attendance.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('emp_dash_no_attendance')}</p>
          ) : (
            <ul className="space-y-1.5">
              {data.attendance.slice(0, 7).map((a) => {
                const checkIn = formatAttendanceTime(a.checkIn);
                const checkOut = formatAttendanceTime(a.checkOut);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{formatAttendanceDate(a.date)}</span>
                    <div className="flex items-center gap-1">
                      {checkIn && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {checkIn}{checkOut ? ` – ${checkOut}` : ''}
                        </span>
                      )}
                      {statusBadge(a.status, attendanceStatusLabel(a.status, lang))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Leave Balance */}
        <div data-testid="leave-balance-ring-card" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-leave-balance" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('emp_dash_leave_balance')}
          </h2>
          {data.balances.length === 0 ? (
            <div data-testid="leave-balance-empty" className="flex flex-col items-center gap-2 py-3 text-center">
              <LeaveBalanceRing remaining={0} total={0} size={80} strokeWidth={8} />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('emp_dash_no_leave_balance')}</p>
            </div>
          ) : (
            <ul className="flex flex-wrap justify-around gap-x-3 gap-y-4 py-1">
              {data.balances.map((b) => {
                const total = b.effectiveTotalDays ?? b.totalDays;
                return (
                  <li key={b.id} className="flex flex-col items-center gap-2" style={{ width: 112 }}>
                    <LeaveBalanceRing remaining={b.remainingDays} total={total} />
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300 text-center leading-tight">
                      {leaveTypeLabel(b.leaveType, lang)}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {t('emp_dash_leave_used')} {b.usedDays}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* My Leave Requests */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-my-leave" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('emp_dash_my_leave')}
          </h2>
          {data.leave.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('emp_dash_no_leave')}</p>
          ) : (
            <ul className="space-y-1.5">
              {data.leave.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{leaveTypeLabel(l.leaveType, lang)}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatLeaveDateRange(l.startDate, l.endDate)}</p>
                  </div>
                  {statusBadge(l.status, leaveStatusLabel(l.status, lang))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee Self-Dashboard (full page, EMPLOYEE role only) ────────────────────

function EmployeeSelfView({
  data,
  refreshing,
  onRefresh,
}: {
  data: SelfData;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 data-testid="page-title-dashboard" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_employee_dashboard')}
        </h1>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-50 transition-colors"
        >
          <span className={refreshing ? 'animate-spin' : ''}><IconRefresh /></span>
          {t('dash_refresh')}
        </button>
      </div>
      <PersonalSummaryBody data={data} />
    </div>
  );
}

// ── Manager Personal Summary (embedded section under the team dashboard) ───────

function PersonalSummarySection({
  data,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
}: {
  data: SelfData | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div data-testid="section-my-summary" className="mt-6 border-t border-zinc-200 dark:border-zinc-700 pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 data-testid="section-my-summary-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_my_summary')}
        </h2>
        <button
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-50 transition-colors"
        >
          <span className={refreshing ? 'animate-spin' : ''}><IconRefresh /></span>
          {t('dash_refresh')}
        </button>
      </div>
      {loading ? (
        <LoadingState testid="loading-state-my-summary" message={t('loading_emp_dashboard')} />
      ) : error ? (
        <ErrorState testid="error-state-my-summary" message={error} onRetry={onRetry} />
      ) : data ? (
        <PersonalSummaryBody data={data} />
      ) : null}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useLanguage();
  const user = getUser();
  const isEmployee = user?.role === 'EMPLOYEE';
  const isManager = user?.role === 'MANAGER';

  // Non-employee dashboard state
  const [range, setRange] = useState<RangePreset>('7d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(!isEmployee);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Personal summary state — used by EMPLOYEE (full page) and MANAGER (embedded section)
  const [selfData, setSelfData] = useState<SelfData | null>(null);
  const [selfLoading, setSelfLoading] = useState(isEmployee || isManager);
  const [selfRefreshing, setSelfRefreshing] = useState(false);
  const [selfError, setSelfError] = useState<string | null>(null);

  const load = useCallback(async (preset: RangePreset, isRefresh = false) => {
    if (isEmployee) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await getDashboard(preset);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({ message: t('error_dashboard') });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, isEmployee]);

  const loadSelf = useCallback(async (isRefresh = false) => {
    if (isRefresh) setSelfRefreshing(true);
    else setSelfLoading(true);
    setSelfError(null);
    try {
      const [attRes, balRes, leaveRes] = await Promise.all([
        getMyAttendance({ limit: 10 }),
        getMyLeaveBalances(),
        getMyLeave({ limit: 5 }),
      ]);
      setSelfData({ attendance: attRes.data, balances: balRes.data, leave: leaveRes.data });
    } catch (err) {
      setSelfError(err instanceof ApiError ? err.message : t('error_emp_dashboard'));
    } finally {
      setSelfLoading(false);
      setSelfRefreshing(false);
    }
  }, [t]);

  useEffect(() => { if (isEmployee || isManager) loadSelf(); }, [isEmployee, isManager, loadSelf]);
  useEffect(() => { load(range); }, [range, load]);

  // Employee self-dashboard early-return
  if (isEmployee) {
    if (selfLoading) return <LoadingState testid="loading-state" message={t('loading_emp_dashboard')} />;
    if (selfError) return <ErrorState testid="error-state" message={selfError} onRetry={() => loadSelf()} />;
    if (!selfData) return null;
    return <EmployeeSelfView data={selfData} refreshing={selfRefreshing} onRefresh={() => loadSelf(true)} />;
  }

  if (loading) return <LoadingState testid="loading-state" message={t('loading_dashboard')} />;
  if (error) return <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={() => load(range)} />;
  if (!data) return null;

  const { employees, attendance, leave, recent, analytics } = data;

  const attRatePct = employees.activeEmployees > 0
    ? Math.round(((attendance.todayPresentCount + attendance.todayLateCount) / employees.activeEmployees) * 100)
    : 0;

  const RANGES: { value: RangePreset; label: string }[] = [
    { value: '7d',        label: t('dash_range_7d') },
    { value: 'thisMonth', label: t('dash_range_this_month') },
    { value: 'lastMonth', label: t('dash_range_last_month') },
  ];

  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? '';

  const LEAVE_COLORS = {
    pending:  '#f59e0b',
    approved: '#22c55e',
    rejected: '#ef4444',
  };

  const attTrendSeries: LineSeries[] = [
    { key: 'present', label: t('dash_trend_present'), color: '#22c55e' },
    { key: 'late',    label: t('dash_trend_late'),    color: '#f59e0b' },
    { key: 'absent',  label: t('dash_trend_absent'),  color: '#ef4444' },
  ];

  const otTrendSeries: LineSeries[] = [
    { key: 'hours', label: 'OT (ชม.)', color: '#818cf8' },
  ];

  return (
    <div>
      {/* ── Compact header + filter bar (single row) ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 data-testid="page-title-dashboard" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mr-1">
          {isManager ? t('page_dashboard_team') : t('page_dashboard')}
        </h1>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-auto">
          {formatTimestamp(data.generatedAt)} · {data.timezone}
        </span>
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              range === r.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => load(range, true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-50 transition-colors"
        >
          <span className={refreshing ? 'animate-spin' : ''}><IconRefresh /></span>
          {t('dash_refresh')}
        </button>
      </div>

      {/* ── KPI Row — 6 compact cards ── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          testid="stat-total"
          label={t('dash_total') + ' ' + t('dash_employees')}
          value={employees.totalEmployees}
          accent="blue"
          icon={<IconPeople />}
        />
        <KpiCard
          testid="stat-active"
          label={t('dash_active')}
          value={employees.activeEmployees}
          accent="green"
          icon={<IconPeople />}
        />
        <KpiCard
          testid="stat-att-rate"
          label={t('dash_att_rate')}
          value={`${attRatePct}%`}
          accent="indigo"
          icon={<IconTrendUp />}
        />
        <KpiCard
          testid="stat-pending"
          label={t('dash_pending_leave')}
          value={leave.pendingLeaveRequests}
          accent="amber"
          icon={<IconCalendar />}
        />
        <KpiCard
          testid="stat-pending-offsite"
          label={t('dash_pending_offsite')}
          value={analytics.offSiteStatus.pending}
          accent="zinc"
          icon={<IconClock />}
        />
        <KpiCard
          testid="stat-low-balance"
          label={t('dash_low_balance')}
          value={leave.lowLeaveBalanceCount}
          accent="red"
          icon={<IconCalendar />}
        />
      </div>

      {/* ── Chart Row 1: Attendance Trend (4) · Leave Status (3) · Leave by Dept (5) ── */}
      <div className="mb-3 grid grid-cols-12 gap-3">
        <ChartCard
          title={t('dash_chart_att_trend')}
          badge={rangeLabel}
          className="col-span-12 lg:col-span-4"
        >
          <LineChart
            data={analytics.attendanceTrend}
            series={attTrendSeries}
            emptyMessage={t('dash_no_data')}
          />
        </ChartCard>

        <ChartCard
          title={t('dash_chart_leave_status')}
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        >
          <DonutChart
            segments={[
              { label: t('dash_pending'),  value: analytics.leaveStatus.pending,  color: LEAVE_COLORS.pending },
              { label: t('dash_approved'), value: analytics.leaveStatus.approved, color: LEAVE_COLORS.approved },
              { label: t('dash_rejected'), value: analytics.leaveStatus.rejected, color: LEAVE_COLORS.rejected },
            ]}
            centerLabel={t('dash_total_center')}
          />
        </ChartCard>

        <ChartCard
          title={t('dash_chart_leave_by_dept')}
          badge={rangeLabel}
          className="col-span-12 sm:col-span-6 lg:col-span-5"
        >
          <StackedBarChart
            rows={analytics.leaveByDepartment.map((d) => ({
              label: d.departmentName,
              values: [d.pending, d.approved, d.rejected],
            }))}
            series={[
              { label: t('dash_pending'),  color: LEAVE_COLORS.pending },
              { label: t('dash_approved'), color: LEAVE_COLORS.approved },
              { label: t('dash_rejected'), color: LEAVE_COLORS.rejected },
            ]}
            emptyMessage={t('dash_no_data')}
          />
        </ChartCard>
      </div>

      {/* ── Chart Row 2: Off-site (3) · OT Trend (5) · Top Leave Requesters (4) ── */}
      <div className="mb-4 grid grid-cols-12 gap-3">
        <ChartCard
          title={t('dash_chart_offsite_status')}
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        >
          <DonutChart
            segments={[
              { label: t('dash_pending'),  value: analytics.offSiteStatus.pending,  color: LEAVE_COLORS.pending },
              { label: t('dash_approved'), value: analytics.offSiteStatus.approved, color: LEAVE_COLORS.approved },
              { label: t('dash_rejected'), value: analytics.offSiteStatus.rejected, color: LEAVE_COLORS.rejected },
            ]}
            centerLabel={t('dash_total_center')}
          />
        </ChartCard>

        <ChartCard
          title={t('dash_chart_ot_trend')}
          badge={rangeLabel}
          className="col-span-12 sm:col-span-6 lg:col-span-5"
        >
          <LineChart
            data={analytics.overtimeTrend}
            series={otTrendSeries}
            emptyMessage={t('dash_no_data')}
          />
        </ChartCard>

        <ChartCard
          title={t('dash_chart_top_leave')}
          badge={rangeLabel}
          className="col-span-12 lg:col-span-4"
        >
          <RankingBarChart
            items={analytics.topLeaveRequesters.map((r) => ({ name: r.employeeName, count: r.count }))}
            countUnit={t('dash_times')}
            emptyMessage={t('dash_no_data')}
          />
        </ChartCard>
      </div>

      {/* ── Operational panels — 4 compact columns ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-recent-employees" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_employees')}
          </h2>
          {recent.employees.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_employees')}</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.employees.slice(0, 4).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{e.firstName} {e.lastName}</span>
                  {statusBadge(e.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-recent-attendance" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_attendance')}
          </h2>
          {recent.attendance.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_attendance')}</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.attendance.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : a.date}
                  </span>
                  {statusBadge(a.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 data-testid="section-recent-leave" className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_leave')}
          </h2>
          {recent.leaveRequests.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_leave')}</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.leaveRequests.slice(0, 4).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : l.leaveType}
                  </span>
                  {statusBadge(l.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t('dash_offsite_panel')}
          </h2>
          {analytics.recentOffSite.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_offsite')}</p>
          ) : (
            <ul className="space-y-1.5">
              {analytics.recentOffSite.slice(0, 4).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {o.employee ? `${o.employee.firstName} ${o.employee.lastName}` : o.date}
                  </span>
                  {statusBadge(o.status)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isManager && (
        <PersonalSummarySection
          data={selfData}
          loading={selfLoading}
          error={selfError}
          refreshing={selfRefreshing}
          onRefresh={() => loadSelf(true)}
          onRetry={() => loadSelf()}
        />
      )}
    </div>
  );
}
