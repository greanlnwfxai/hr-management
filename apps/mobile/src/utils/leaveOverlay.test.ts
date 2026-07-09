import { findApprovedLeaveForDate, resolveDayTypeLabel } from './leaveOverlay';
import type { LeaveRequestRecord } from '../api/types';

const employee = { id: 'emp-1', employeeCode: 'E001', firstName: 'Somchai', lastName: 'Test' };

function makeLeave(overrides: Partial<LeaveRequestRecord>): LeaveRequestRecord {
  return {
    id: 'leave-1',
    leaveType: 'VACATION',
    startDate: '2026-07-09',
    endDate: '2026-07-09',
    totalDays: 1,
    reason: null,
    status: 'APPROVED',
    approvedAt: '2026-07-01T00:00:00.000Z',
    employee,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findApprovedLeaveForDate', () => {
  it('returns the approved vacation leave that covers the target date', () => {
    const leave = makeLeave({ startDate: '2026-07-09', endDate: '2026-07-09' });
    const result = findApprovedLeaveForDate([leave], new Date(2026, 6, 9));
    expect(result).toBe(leave);
  });

  it('does not override the schedule for a pending leave request', () => {
    const pending = makeLeave({ status: 'PENDING', startDate: '2026-07-09', endDate: '2026-07-09' });
    const result = findApprovedLeaveForDate([pending], new Date(2026, 6, 9));
    expect(result).toBeNull();
  });

  it('does not override the schedule for a rejected leave request', () => {
    const rejected = makeLeave({ status: 'REJECTED', startDate: '2026-07-09', endDate: '2026-07-09' });
    const result = findApprovedLeaveForDate([rejected], new Date(2026, 6, 9));
    expect(result).toBeNull();
  });

  it('covers every date in a multi-day approved leave range, inclusive', () => {
    const leave = makeLeave({ startDate: '2026-07-08', endDate: '2026-07-11' });

    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 7))).toBeNull();
    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 8))).toBe(leave);
    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 9))).toBe(leave);
    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 10))).toBe(leave);
    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 11))).toBe(leave);
    expect(findApprovedLeaveForDate([leave], new Date(2026, 6, 12))).toBeNull();
  });

  it('returns null when no leave requests overlap the date', () => {
    const leave = makeLeave({ startDate: '2026-07-01', endDate: '2026-07-02' });
    const result = findApprovedLeaveForDate([leave], new Date(2026, 6, 9));
    expect(result).toBeNull();
  });

  it('returns null for an empty leave list', () => {
    expect(findApprovedLeaveForDate([], new Date(2026, 6, 9))).toBeNull();
  });
});

describe('resolveDayTypeLabel', () => {
  // The attendance tab ("ลงเวลา") used to compute its day-type label from
  // weekday/weekend only, ignoring approved leave — so 9 ก.ค. 2569 showed
  // "วันทำงาน" even though the home screen correctly showed "ลาพักร้อน" for the
  // same date. This covers the shared label-resolution logic both screens now
  // call; it does not by itself guard the call sites wiring it into each screen.
  it('shows the leave type label when an approved leave covers the date, overriding the workday fallback', () => {
    const leave = makeLeave({ leaveType: 'VACATION', status: 'APPROVED' });
    expect(resolveDayTypeLabel(leave, 'วันทำงาน')).toBe('ลาพักร้อน');
  });

  it('falls back to the caller-provided workday/weekend label when there is no approved leave', () => {
    expect(resolveDayTypeLabel(null, 'วันทำงาน')).toBe('วันทำงาน');
    expect(resolveDayTypeLabel(null, 'วันหยุด')).toBe('วันหยุด');
  });

  it('uses the caller-specific fallback label even when it differs between screens', () => {
    // home.tsx uses "วันหยุดประจำรอบ" for weekends; attendance.tsx uses "วันหยุด".
    // The resolver must not hardcode either — it only overrides when leave is present.
    expect(resolveDayTypeLabel(null, 'วันหยุดประจำรอบ')).toBe('วันหยุดประจำรอบ');
  });
});
