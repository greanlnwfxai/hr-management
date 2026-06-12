import { Injectable } from '@nestjs/common';
import type {
  AttendanceStatus as PrismaAttendanceStatus,
  EmployeeStatus as PrismaEmployeeStatus,
  LeaveStatus as PrismaLeaveStatus,
} from '@prisma/client';
import { AttendanceStatus, EmployeeStatus, LeaveStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

// Thailand is UTC+7 with no DST — this offset never changes.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Leave balances with <= this many remaining days are flagged as "low".
const LOW_BALANCE_THRESHOLD = 3;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const today = this.todayBangkok();
    const currentYear = this.bangkokYear();

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
      this.prisma.employee.count(),
      this.prisma.employee.count({
        where: { status: EmployeeStatus.ACTIVE as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.employee.count({
        where: { status: EmployeeStatus.INACTIVE as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.employee.count({
        where: { status: EmployeeStatus.RESIGNED as unknown as PrismaEmployeeStatus },
      }),
      this.prisma.department.count(),
      this.prisma.position.count(),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.PRESENT as unknown as PrismaAttendanceStatus,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.LATE as unknown as PrismaAttendanceStatus,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: today,
          status: AttendanceStatus.ABSENT as unknown as PrismaAttendanceStatus,
        },
      }),
      this.prisma.attendance.count({
        where: { date: today, checkIn: { not: null } },
      }),
      this.prisma.attendance.count({
        where: { date: today, checkOut: { not: null } },
      }),
      this.prisma.leaveRequest.count(),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.PENDING as unknown as PrismaLeaveStatus },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.APPROVED as unknown as PrismaLeaveStatus },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.REJECTED as unknown as PrismaLeaveStatus },
      }),
      this.prisma.employee.findMany({
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
        where: { year: currentYear },
        select: { totalDays: true, usedDays: true },
      }),
    ]);

    const lowLeaveBalanceCount = currentYearBalances.filter(
      (b) => b.totalDays - b.usedDays <= LOW_BALANCE_THRESHOLD,
    ).length;

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
}
