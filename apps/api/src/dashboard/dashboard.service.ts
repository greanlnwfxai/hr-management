import { Injectable } from '@nestjs/common';
import type {
  AttendanceStatus as PrismaAttendanceStatus,
  EmployeeStatus as PrismaEmployeeStatus,
  LeaveStatus as PrismaLeaveStatus,
} from '@prisma/client';
import { AttendanceStatus, EmployeeStatus, LeaveStatus, UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

// Thailand is UTC+7 with no DST — this offset never changes.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Leave balances with <= this many remaining days are flagged as "low".
const LOW_BALANCE_THRESHOLD = 3;

// OT cutoff: 17:30 Bangkok = 1050 minutes from midnight Bangkok.
// Stored checkOut is UTC; add BANGKOK_OFFSET_MS to convert to Bangkok wall time.
const OT_CUTOFF_MINUTES = 17 * 60 + 30;

export type RangePreset = '7d' | 'thisMonth' | 'lastMonth';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(range: RangePreset = '7d', actor?: { userId?: string | null; role?: string | null }) {
    const today = this.todayBangkok();
    const currentYear = this.bangkokYear();

    // Resolve department scope for MANAGER — resolve once, use everywhere.
    let scopeDeptId: string | undefined;
    if (actor?.role === UserRole.MANAGER) {
      const managerEmp = actor.userId
        ? await this.prisma.employee.findFirst({
            where: { userId: actor.userId },
            select: { managedDepartment: { select: { id: true } } },
          })
        : null;
      if (!managerEmp?.managedDepartment) {
        const { from, to } = this.dateRange(range);
        return this.buildEmptySummary(from, to, range);
      }
      scopeDeptId = managerEmp.managedDepartment.id;
    }

    const empFilter = scopeDeptId ? { departmentId: scopeDeptId } : {};
    const attEmpFilter = scopeDeptId ? { employee: { departmentId: scopeDeptId } } : {};
    const leaveEmpFilter = scopeDeptId ? { employee: { departmentId: scopeDeptId } } : {};

    const [
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      resignedEmployees,
      totalDepartments,
      totalPositions,
      todayPresentCount,
      todayLateCount,
      todayAbsentCount,
      todayClockedInCount,
      todayClockedOutCount,
      totalLeaveRequests,
      pendingLeaveRequests,
      approvedLeaveRequests,
      rejectedLeaveRequests,
      recentEmployees,
      recentAttendance,
      recentLeaveRequests,
      currentYearBalances,
    ] = await Promise.all([
      this.prisma.employee.count({ where: empFilter }),
      this.prisma.employee.count({
        where: { ...empFilter, status: EmployeeStatus.ACTIVE as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.employee.count({
        where: { ...empFilter, status: EmployeeStatus.INACTIVE as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.employee.count({
        where: { ...empFilter, status: EmployeeStatus.RESIGNED as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.department.count({ where: scopeDeptId ? { id: scopeDeptId } : {} }),
      this.prisma.position.count({ where: scopeDeptId ? { departmentId: scopeDeptId } : {} }),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.PRESENT as unknown as PrismaAttendanceStatus,
          ...attEmpFilter,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.LATE as unknown as PrismaAttendanceStatus,
          ...attEmpFilter,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.ABSENT as unknown as PrismaAttendanceStatus,
          ...attEmpFilter,
        },
      }),
      this.prisma.attendance.count({
        where: { date: today, checkIn: { not: null }, ...attEmpFilter },
      }),
      this.prisma.attendance.count({
        where: { date: today, checkOut: { not: null }, ...attEmpFilter },
      }),
      this.prisma.leaveRequest.count({ where: leaveEmpFilter }),
      this.prisma.leaveRequest.count({
        where: { ...leaveEmpFilter, status: LeaveStatus.PENDING as unknown as PrismaLeaveStatus },
      }),
      this.prisma.leaveRequest.count({
        where: { ...leaveEmpFilter, status: LeaveStatus.APPROVED as unknown as PrismaLeaveStatus },
      }),
      this.prisma.leaveRequest.count({
        where: { ...leaveEmpFilter, status: LeaveStatus.REJECTED as unknown as PrismaLeaveStatus },
      }),
      this.prisma.employee.findMany({
        where: empFilter,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, title: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: attEmpFilter,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          date: true,
          status: true,
          checkIn: true,
          checkOut: true,
          createdAt: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: leaveEmpFilter,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          status: true,
          createdAt: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.leaveBalance.findMany({
        where: { year: currentYear, ...leaveEmpFilter },
        select: { totalDays: true, usedDays: true },
      }),
    ]);

    const lowLeaveBalanceCount = currentYearBalances.filter(
      (b) => b.totalDays - b.usedDays <= LOW_BALANCE_THRESHOLD,
    ).length;

    const { from, to } = this.dateRange(range);
    const analytics = await this.computeAnalytics(from, to, range, scopeDeptId);

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Bangkok',
      employees: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        resignedEmployees,
        totalDepartments,
        totalPositions,
      },
      attendance: {
        todayDate: today.toISOString().split('T')[0],
        todayPresentCount,
        todayLateCount,
        todayAbsentCount,
        todayClockedInCount,
        todayClockedOutCount,
      },
      leave: {
        totalLeaveRequests,
        pendingLeaveRequests,
        approvedLeaveRequests,
        rejectedLeaveRequests,
        lowLeaveBalanceCount,
      },
      recent: {
        employees: recentEmployees,
        attendance: recentAttendance,
        leaveRequests: recentLeaveRequests,
      },
      analytics,
    };
  }

  private buildEmptySummary(from: Date, to: Date, preset: RangePreset) {
    const dateSeries = this.buildDateSeries(from, to);
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Bangkok',
      employees: { totalEmployees: 0, activeEmployees: 0, inactiveEmployees: 0, resignedEmployees: 0, totalDepartments: 0, totalPositions: 0 },
      attendance: { todayDate: this.todayBangkok().toISOString().split('T')[0], todayPresentCount: 0, todayLateCount: 0, todayAbsentCount: 0, todayClockedInCount: 0, todayClockedOutCount: 0 },
      leave: { totalLeaveRequests: 0, pendingLeaveRequests: 0, approvedLeaveRequests: 0, rejectedLeaveRequests: 0, lowLeaveBalanceCount: 0 },
      recent: { employees: [], attendance: [], leaveRequests: [] },
      analytics: {
        range: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0], preset },
        attendanceTrend: dateSeries.map((date) => ({ date, present: 0, late: 0, absent: 0 })),
        leaveStatus: { pending: 0, approved: 0, rejected: 0 },
        leaveByDepartment: [],
        offSiteStatus: { pending: 0, approved: 0, rejected: 0 },
        overtimeTrend: dateSeries.map((date) => ({ date, hours: 0 })),
        topLeaveRequesters: [],
        recentOffSite: [],
      },
    };
  }

  private async computeAnalytics(from: Date, to: Date, preset: RangePreset, scopeDeptId?: string) {
    const empRelFilter = scopeDeptId ? { employee: { departmentId: scopeDeptId } } : {};
    const deptFilter = scopeDeptId ? { id: scopeDeptId } : {};

    const [attendanceRows, leaveRows, offSiteRows, allDepts] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: { gte: from, lte: to }, ...empRelFilter },
        select: { date: true, status: true, checkOut: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { startDate: { gte: from, lte: to }, ...empRelFilter },
        select: {
          status: true,
          employeeId: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.offSiteRequest.findMany({
        where: { date: { gte: from, lte: to }, ...empRelFilter },
        select: {
          id: true,
          date: true,
          status: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.department.findMany({
        where: deptFilter,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const dateSeries = this.buildDateSeries(from, to);

    // Attendance trend: bucket by date, count by status
    const attMap = new Map<string, { present: number; late: number; absent: number }>();
    for (const dateStr of dateSeries) {
      attMap.set(dateStr, { present: 0, late: 0, absent: 0 });
    }
    for (const row of attendanceRows) {
      const key = row.date.toISOString().split('T')[0];
      const bucket = attMap.get(key);
      if (bucket) {
        if (row.status === AttendanceStatus.PRESENT) bucket.present++;
        else if (row.status === AttendanceStatus.LATE) bucket.late++;
        else if (row.status === AttendanceStatus.ABSENT) bucket.absent++;
      }
    }
    const attendanceTrend = dateSeries.map((date) => {
      const b = attMap.get(date)!;
      return { date, present: b.present, late: b.late, absent: b.absent };
    });

    // Leave status: count by status
    const leaveStatus = { pending: 0, approved: 0, rejected: 0 };
    for (const row of leaveRows) {
      if (row.status === LeaveStatus.PENDING) leaveStatus.pending++;
      else if (row.status === LeaveStatus.APPROVED) leaveStatus.approved++;
      else if (row.status === LeaveStatus.REJECTED) leaveStatus.rejected++;
    }

    // Leave by department: seed from all departments, then fold leave rows
    const deptMap = new Map<string, { departmentId: string; departmentName: string; pending: number; approved: number; rejected: number }>();
    for (const dept of allDepts) {
      deptMap.set(dept.id, { departmentId: dept.id, departmentName: dept.name, pending: 0, approved: 0, rejected: 0 });
    }
    for (const row of leaveRows) {
      const deptId = row.employee?.department?.id ?? '__none__';
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, { departmentId: deptId, departmentName: row.employee?.department?.name ?? '—', pending: 0, approved: 0, rejected: 0 });
      }
      const bucket = deptMap.get(deptId)!;
      if (row.status === LeaveStatus.PENDING) bucket.pending++;
      else if (row.status === LeaveStatus.APPROVED) bucket.approved++;
      else if (row.status === LeaveStatus.REJECTED) bucket.rejected++;
    }
    // Only include departments that have at least one leave request
    const leaveByDepartment = Array.from(deptMap.values()).filter(
      (d) => d.pending + d.approved + d.rejected > 0,
    );

    // Off-site status
    const offSiteStatus = { pending: 0, approved: 0, rejected: 0 };
    for (const row of offSiteRows) {
      if (row.status === 'PENDING') offSiteStatus.pending++;
      else if (row.status === 'APPROVED') offSiteStatus.approved++;
      else if (row.status === 'REJECTED') offSiteStatus.rejected++;
    }

    // OT trend: bucket by date, sum OT hours (checkout after 17:30 Bangkok)
    const otMap = new Map<string, number>();
    for (const dateStr of dateSeries) otMap.set(dateStr, 0);
    for (const row of attendanceRows) {
      if (!row.checkOut) continue;
      const bangkokMs = row.checkOut.getTime() + BANGKOK_OFFSET_MS;
      const bangkokDate = new Date(bangkokMs);
      const bangkokTotalMins = bangkokDate.getUTCHours() * 60 + bangkokDate.getUTCMinutes();
      const otMins = Math.max(0, bangkokTotalMins - OT_CUTOFF_MINUTES);
      if (otMins > 0) {
        const key = row.date.toISOString().split('T')[0];
        otMap.set(key, (otMap.get(key) ?? 0) + otMins);
      }
    }
    const overtimeTrend = dateSeries.map((date) => ({
      date,
      hours: parseFloat(((otMap.get(date) ?? 0) / 60).toFixed(1)),
    }));

    // Top leave requesters: group by employee, count, top 5
    const requesterMap = new Map<string, { employeeId: string; employeeName: string; count: number }>();
    for (const row of leaveRows) {
      if (!row.employee) continue;
      const id = row.employee.id;
      if (!requesterMap.has(id)) {
        requesterMap.set(id, {
          employeeId: id,
          employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
          count: 0,
        });
      }
      requesterMap.get(id)!.count++;
    }
    const topLeaveRequesters = Array.from(requesterMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent off-site requests (top 5 most recent)
    const recentOffSite = offSiteRows.slice(0, 5).map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      status: r.status,
      employee: r.employee ?? undefined,
    }));

    return {
      range: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        preset,
      },
      attendanceTrend,
      leaveStatus,
      leaveByDepartment,
      offSiteStatus,
      overtimeTrend,
      topLeaveRequesters,
      recentOffSite,
    };
  }

  // Returns the UTC Date that represents midnight of today's Bangkok calendar date.
  // E.g. if Bangkok is 2026-06-12 08:00 (UTC+7), this returns 2026-06-12T00:00:00.000Z.
  // This matches how Attendance.date values are stored when clocking in from Bangkok.
  private todayBangkok(): Date {
    const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
    return new Date(
      Date.UTC(
        bangkokNow.getUTCFullYear(),
        bangkokNow.getUTCMonth(),
        bangkokNow.getUTCDate(),
      ),
    );
  }

  private bangkokYear(): number {
    return new Date(Date.now() + BANGKOK_OFFSET_MS).getUTCFullYear();
  }

  private dateRange(range: RangePreset): { from: Date; to: Date } {
    const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
    const todayUTC = new Date(
      Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()),
    );

    if (range === 'thisMonth') {
      const from = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), 1));
      return { from, to: todayUTC };
    }

    if (range === 'lastMonth') {
      const prevYear = bangkokNow.getUTCMonth() === 0 ? bangkokNow.getUTCFullYear() - 1 : bangkokNow.getUTCFullYear();
      const prevMonth = bangkokNow.getUTCMonth() === 0 ? 11 : bangkokNow.getUTCMonth() - 1;
      const from = new Date(Date.UTC(prevYear, prevMonth, 1));
      // Day 0 of current month = last day of previous month
      const to = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), 0));
      return { from, to };
    }

    // Default: 7d — today minus 6 days through today
    const from = new Date(todayUTC);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to: todayUTC };
  }

  private buildDateSeries(from: Date, to: Date): string[] {
    const series: string[] = [];
    const cur = new Date(from);
    while (cur <= to) {
      series.push(cur.toISOString().split('T')[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return series;
  }
}
