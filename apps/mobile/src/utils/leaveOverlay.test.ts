import { findApprovedLeaveForDate } from './leaveOverlay';
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
