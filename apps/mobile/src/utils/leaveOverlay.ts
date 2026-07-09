import type { LeaveRequestRecord } from '../api/types';
import { leaveTypeLabel } from '../hooks/useLeave';

function parseDateOnly(value: string): Date {
  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Finds the approved leave request (if any) whose inclusive date range
 * covers the given calendar date. Non-approved (pending/rejected) leave
 * never overrides the normal schedule display.
 */
export function findApprovedLeaveForDate(
  approvedLeave: LeaveRequestRecord[],
  date: Date,
): LeaveRequestRecord | null {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  for (const request of approvedLeave) {
    if (request.status !== 'APPROVED') continue;

    const start = parseDateOnly(request.startDate).getTime();
    const end = parseDateOnly(request.endDate).getTime();
    if (target >= start && target <= end) return request;
  }

  return null;
}

/**
 * Resolves the day-type label to display for a schedule/attendance header:
 * an approved leave's type always takes precedence over the normal
 * workday/weekend fallback label passed by the caller.
 */
export function resolveDayTypeLabel(
  approvedLeave: LeaveRequestRecord | null,
  fallbackLabel: string,
): string {
  return approvedLeave ? leaveTypeLabel(approvedLeave.leaveType) : fallbackLabel;
}
