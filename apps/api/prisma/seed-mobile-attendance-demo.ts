// Sandbox seed: realistic attendance records for pichai jaijit (mobile UX testing)
// Safety guard: requires ALLOW_SANDBOX_ATTENDANCE_SEED=true
// Idempotent: upserts on employeeId+date unique constraint
// Ownership guard: skips any date that already has a non-seed record

import { config } from 'dotenv';
import { join } from 'path';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

config({ path: join(process.cwd(), 'apps/api/.env'), override: true });

if (process.env.ALLOW_SANDBOX_ATTENDANCE_SEED !== 'true') {
  console.error('[SANDBOX SEED] Refused. Set ALLOW_SANDBOX_ATTENDANCE_SEED=true to run.');
  process.exit(1);
}

const EMPLOYEE_FIRST = 'pichai';
const EMPLOYEE_LAST = 'jaijit';
const SEED_NOTE = '[SANDBOX-SEED] mobile UX demo';

// date stored as @db.Date → UTC midnight
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// Bangkok = UTC+7, no DST. All check-in/out times are 08:xx–17:xx Bangkok → subtract 7h for UTC.
function bkkToUtc(year: number, month: number, day: number, bkkHour: number, bkkMin: number): Date {
  return new Date(Date.UTC(year, month - 1, day, bkkHour - 7, bkkMin));
}

// 15 weekdays: Jun 1–5, 8–12, 15–19 (skip weekends Jun 6–7, 13–14; today Jun 20 is weekend)
// LATE = clock-in strictly after 08:30 Bangkok (hour > 8 || (hour === 8 && minute > 30))
// ABSENT: explicit record with null checkIn/checkOut (enables mobile calendar to render the day)
// Early-out (Jun 5, 16): checkOut before 17:00; status stays PRESENT (no EARLY_OUT enum)
const RECORDS: Array<{
  date: Date;
  dateLabel: string;
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
}> = [
  // Week 1
  { date: utcDate(2026,6,1),  dateLabel:'2026-06-01 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,1, 8,22), checkOut:bkkToUtc(2026,6,1, 17,42) },
  { date: utcDate(2026,6,2),  dateLabel:'2026-06-02 Tue', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,2, 8,26), checkOut:bkkToUtc(2026,6,2, 17,35) },
  { date: utcDate(2026,6,3),  dateLabel:'2026-06-03 Wed', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,3, 8,47), checkOut:bkkToUtc(2026,6,3, 17,40) },
  { date: utcDate(2026,6,4),  dateLabel:'2026-06-04 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,4, 8,18), checkOut:bkkToUtc(2026,6,4, 17,50) },
  { date: utcDate(2026,6,5),  dateLabel:'2026-06-05 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,5, 8,25), checkOut:bkkToUtc(2026,6,5, 16,55) }, // early-out
  // Week 2
  { date: utcDate(2026,6,8),  dateLabel:'2026-06-08 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,8, 8,20), checkOut:bkkToUtc(2026,6,8, 17,45) },
  { date: utcDate(2026,6,9),  dateLabel:'2026-06-09 Tue', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,9, 9, 5), checkOut:bkkToUtc(2026,6,9, 17,38) },
  { date: utcDate(2026,6,10), dateLabel:'2026-06-10 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,10,8,29), checkOut:bkkToUtc(2026,6,10,17,31) },
  { date: utcDate(2026,6,11), dateLabel:'2026-06-11 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,11,8,12), checkOut:bkkToUtc(2026,6,11,17,44) },
  { date: utcDate(2026,6,12), dateLabel:'2026-06-12 Fri', status:AttendanceStatus.ABSENT,  checkIn:null,                      checkOut:null },
  // Week 3
  { date: utcDate(2026,6,15), dateLabel:'2026-06-15 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,15,8,21), checkOut:bkkToUtc(2026,6,15,17,36) },
  { date: utcDate(2026,6,16), dateLabel:'2026-06-16 Tue', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,16,8,24), checkOut:bkkToUtc(2026,6,16,16,48) }, // early-out
  { date: utcDate(2026,6,17), dateLabel:'2026-06-17 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,17,8,28), checkOut:bkkToUtc(2026,6,17,17,33) },
  { date: utcDate(2026,6,18), dateLabel:'2026-06-18 Thu', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,18,8,55), checkOut:bkkToUtc(2026,6,18,17,52) },
  { date: utcDate(2026,6,19), dateLabel:'2026-06-19 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,19,8,19), checkOut:bkkToUtc(2026,6,19,17,39) },
];

async function main() {
  const prisma = new PrismaClient();

  try {
    const employee = await prisma.employee.findFirst({
      where: {
        firstName: { equals: EMPLOYEE_FIRST, mode: 'insensitive' },
        lastName:  { equals: EMPLOYEE_LAST,  mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });

    if (!employee) {
      console.error(`[SANDBOX SEED] Employee "${EMPLOYEE_FIRST} ${EMPLOYEE_LAST}" not found. Aborting.`);
      process.exit(1);
    }

    console.log(`[SANDBOX SEED] Target: ${employee.firstName} ${employee.lastName} (${employee.employeeCode}) id=${employee.id}`);

    let seeded = 0;
    let skipped = 0;

    for (const rec of RECORDS) {
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: rec.date } },
        select: { id: true, note: true },
      });

      if (existing && existing.note !== SEED_NOTE) {
        console.warn(`[SANDBOX SEED] SKIP ${rec.dateLabel}: existing non-seed record (id=${existing.id}). Not overwriting.`);
        skipped++;
        continue;
      }

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: employee.id, date: rec.date } },
        create: {
          employeeId: employee.id,
          date:       rec.date,
          status:     rec.status,
          checkIn:    rec.checkIn,
          checkOut:   rec.checkOut,
          note:       SEED_NOTE,
        },
        update: {
          status:   rec.status,
          checkIn:  rec.checkIn,
          checkOut: rec.checkOut,
          note:     SEED_NOTE,
        },
      });

      const action = existing ? 'UPDATE' : 'INSERT';
      console.log(`[SANDBOX SEED] ${action} ${rec.dateLabel} → ${rec.status}`);
      seeded++;
    }

    console.log(`\n[SANDBOX SEED] Done. seeded=${seeded} skipped=${skipped} total=${RECORDS.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[SANDBOX SEED] Fatal error:', err);
  process.exit(1);
});
