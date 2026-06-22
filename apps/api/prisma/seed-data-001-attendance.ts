// DATA-001: Recreate sandbox attendance for พิชัย ใจจิต (SVR-001) and กาศิ จั่นอุไร (SVR-002)
// Safety guard: requires ALLOW_SANDBOX_ATTENDANCE_SEED=true
// Idempotent: upserts on employeeId+date unique constraint
// Ownership guard: skips any date that already has a non-seed record
// SAFE: INSERT/UPSERT only — no DELETE, no TRUNCATE, no UPDATE of non-seed rows

import { config } from 'dotenv';
import { join } from 'path';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

config({ path: join(process.cwd(), 'apps/api/.env'), override: true });

if (process.env.ALLOW_SANDBOX_ATTENDANCE_SEED !== 'true') {
  console.error('[DATA-001] Refused. Set ALLOW_SANDBOX_ATTENDANCE_SEED=true to run.');
  process.exit(1);
}

const SEED_NOTE = '[SANDBOX-SEED] mobile UX demo';

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// Bangkok = UTC+7, no DST
function bkkToUtc(year: number, month: number, day: number, bkkHour: number, bkkMin: number): Date {
  return new Date(Date.UTC(year, month - 1, day, bkkHour - 7, bkkMin));
}

type SeedRecord = {
  date: Date;
  dateLabel: string;
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
};

// 15 weekdays: Jun 1–5, 8–12, 15–19 — matches original seed data for Pichai
const PICHAI_RECORDS: SeedRecord[] = [
  // Week 1
  { date: utcDate(2026,6,1),  dateLabel:'2026-06-01 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,1, 8,22), checkOut:bkkToUtc(2026,6,1, 17,42) },
  { date: utcDate(2026,6,2),  dateLabel:'2026-06-02 Tue', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,2, 8,26), checkOut:bkkToUtc(2026,6,2, 17,35) },
  { date: utcDate(2026,6,3),  dateLabel:'2026-06-03 Wed', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,3, 8,47), checkOut:bkkToUtc(2026,6,3, 17,40) },
  { date: utcDate(2026,6,4),  dateLabel:'2026-06-04 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,4, 8,18), checkOut:bkkToUtc(2026,6,4, 17,50) },
  { date: utcDate(2026,6,5),  dateLabel:'2026-06-05 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,5, 8,25), checkOut:bkkToUtc(2026,6,5, 16,55) },
  // Week 2
  { date: utcDate(2026,6,8),  dateLabel:'2026-06-08 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,8, 8,20), checkOut:bkkToUtc(2026,6,8, 17,45) },
  { date: utcDate(2026,6,9),  dateLabel:'2026-06-09 Tue', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,9, 9, 5), checkOut:bkkToUtc(2026,6,9, 17,38) },
  { date: utcDate(2026,6,10), dateLabel:'2026-06-10 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,10,8,29), checkOut:bkkToUtc(2026,6,10,17,31) },
  { date: utcDate(2026,6,11), dateLabel:'2026-06-11 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,11,8,12), checkOut:bkkToUtc(2026,6,11,17,44) },
  { date: utcDate(2026,6,12), dateLabel:'2026-06-12 Fri', status:AttendanceStatus.ABSENT,  checkIn:null,                      checkOut:null },
  // Week 3
  { date: utcDate(2026,6,15), dateLabel:'2026-06-15 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,15,8,21), checkOut:bkkToUtc(2026,6,15,17,36) },
  { date: utcDate(2026,6,16), dateLabel:'2026-06-16 Tue', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,16,8,24), checkOut:bkkToUtc(2026,6,16,16,48) },
  { date: utcDate(2026,6,17), dateLabel:'2026-06-17 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,17,8,28), checkOut:bkkToUtc(2026,6,17,17,33) },
  { date: utcDate(2026,6,18), dateLabel:'2026-06-18 Thu', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,18,8,55), checkOut:bkkToUtc(2026,6,18,17,52) },
  { date: utcDate(2026,6,19), dateLabel:'2026-06-19 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,19,8,19), checkOut:bkkToUtc(2026,6,19,17,39) },
];

// 15 weekdays for Kasi — same date range, varied times
const KASI_RECORDS: SeedRecord[] = [
  // Week 1
  { date: utcDate(2026,6,1),  dateLabel:'2026-06-01 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,1, 8,15), checkOut:bkkToUtc(2026,6,1, 17,30) },
  { date: utcDate(2026,6,2),  dateLabel:'2026-06-02 Tue', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,2, 9,10), checkOut:bkkToUtc(2026,6,2, 17,45) },
  { date: utcDate(2026,6,3),  dateLabel:'2026-06-03 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,3, 8,28), checkOut:bkkToUtc(2026,6,3, 17,38) },
  { date: utcDate(2026,6,4),  dateLabel:'2026-06-04 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,4, 8,20), checkOut:bkkToUtc(2026,6,4, 17,52) },
  { date: utcDate(2026,6,5),  dateLabel:'2026-06-05 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,5, 8,23), checkOut:bkkToUtc(2026,6,5, 16,50) },
  // Week 2
  { date: utcDate(2026,6,8),  dateLabel:'2026-06-08 Mon', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,8, 8,45), checkOut:bkkToUtc(2026,6,8, 17,40) },
  { date: utcDate(2026,6,9),  dateLabel:'2026-06-09 Tue', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,9, 8,22), checkOut:bkkToUtc(2026,6,9, 17,35) },
  { date: utcDate(2026,6,10), dateLabel:'2026-06-10 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,10,8,17), checkOut:bkkToUtc(2026,6,10,17,29) },
  { date: utcDate(2026,6,11), dateLabel:'2026-06-11 Thu', status:AttendanceStatus.ABSENT,  checkIn:null,                      checkOut:null },
  { date: utcDate(2026,6,12), dateLabel:'2026-06-12 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,12,8,26), checkOut:bkkToUtc(2026,6,12,17,41) },
  // Week 3
  { date: utcDate(2026,6,15), dateLabel:'2026-06-15 Mon', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,15,8,19), checkOut:bkkToUtc(2026,6,15,17,33) },
  { date: utcDate(2026,6,16), dateLabel:'2026-06-16 Tue', status:AttendanceStatus.LATE,    checkIn:bkkToUtc(2026,6,16,8,52), checkOut:bkkToUtc(2026,6,16,17,48) },
  { date: utcDate(2026,6,17), dateLabel:'2026-06-17 Wed', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,17,8,25), checkOut:bkkToUtc(2026,6,17,16,45) },
  { date: utcDate(2026,6,18), dateLabel:'2026-06-18 Thu', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,18,8,11), checkOut:bkkToUtc(2026,6,18,17,44) },
  { date: utcDate(2026,6,19), dateLabel:'2026-06-19 Fri', status:AttendanceStatus.PRESENT, checkIn:bkkToUtc(2026,6,19,8,27), checkOut:bkkToUtc(2026,6,19,17,36) },
];

async function seedEmployee(
  prisma: PrismaClient,
  employeeId: string,
  label: string,
  records: SeedRecord[],
): Promise<void> {
  console.log(`\n[DATA-001] === ${label} (${employeeId}) ===`);
  let seeded = 0;
  let skipped = 0;

  for (const rec of records) {
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: rec.date } },
      select: { id: true, note: true },
    });

    if (existing && existing.note !== SEED_NOTE) {
      console.warn(`[DATA-001] SKIP ${rec.dateLabel}: existing non-seed record (id=${existing.id}). Not overwriting.`);
      skipped++;
      continue;
    }

    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: rec.date } },
      create: {
        employeeId,
        date:     rec.date,
        status:   rec.status,
        checkIn:  rec.checkIn,
        checkOut: rec.checkOut,
        note:     SEED_NOTE,
      },
      update: {
        status:   rec.status,
        checkIn:  rec.checkIn,
        checkOut: rec.checkOut,
        note:     SEED_NOTE,
      },
    });

    const action = existing ? 'UPDATE' : 'INSERT';
    console.log(`[DATA-001] ${action} ${rec.dateLabel} → ${rec.status}`);
    seeded++;
  }

  console.log(`[DATA-001] Done ${label}: seeded=${seeded} skipped=${skipped} total=${records.length}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedEmployee(prisma, '4de6189a-51c5-4d97-9347-a5bdeed786a1', 'พิชัย ใจจิต (SVR-001)', PICHAI_RECORDS);
    await seedEmployee(prisma, 'f4af5615-ade0-49da-9ed1-63efd167670a', 'กาศิ จั่นอุไร (SVR-002)', KASI_RECORDS);

    const pichaiFinal = await prisma.attendance.count({ where: { employeeId: '4de6189a-51c5-4d97-9347-a5bdeed786a1' } });
    const kasiFinal   = await prisma.attendance.count({ where: { employeeId: 'f4af5615-ade0-49da-9ed1-63efd167670a' } });
    console.log(`\n[DATA-001] Final counts: พิชัย=${pichaiFinal} กาศิ=${kasiFinal}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[DATA-001] Fatal error:', err);
  process.exit(1);
});
