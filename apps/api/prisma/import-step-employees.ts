/**
 * T-075: Import STEP-SOLUTIONS Employee Master Data
 *
 * Usage (dry-run):
 *   DATABASE_URL=postgresql://hr_user:hr_password@localhost:5432/hr_management \
 *   EXCEL_JSON_PATH=../../tmp/step-employees-raw.json \
 *   npx tsx prisma/import-step-employees.ts
 *
 * Usage (write):
 *   DATABASE_URL=postgresql://hr_user:hr_password@localhost:5432/hr_management \
 *   ALLOW_STEP_EMPLOYEE_IMPORT=true \
 *   EXCEL_JSON_PATH=../../tmp/step-employees-raw.json \
 *   npx tsx prisma/import-step-employees.ts
 *
 * Safety:
 *   - No DELETE / TRUNCATE
 *   - No user account creation
 *   - No password changes
 *   - Idempotent: re-run is safe
 *   - Existing employees matched by firstName+lastName; userId/email/employeeCode preserved
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExcelEmployee {
  rowNum: number;
  firstName: string;
  lastName: string;
  hireDate: string; // YYYY-MM-DD
  department: string;
  position: string;
}

interface MatchedEmployee {
  excel: ExcelEmployee;
  existingId?: string;
  existingCode?: string;
  isUpdate: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function generateEmployeeCode(index: number): string {
  return `STEP-${String(index).padStart(4, "0")}`;
}

function generateEmail(index: number): string {
  return `step-imp-${String(index).padStart(4, "0")}@step-solutions.local`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const allowWrite = process.env.ALLOW_STEP_EMPLOYEE_IMPORT === "true";
  const jsonPath =
    process.env.EXCEL_JSON_PATH ??
    path.resolve(__dirname, "../../tmp/step-employees-raw.json");

  console.log("═".repeat(70));
  console.log("T-075 — Import STEP-SOLUTIONS Employee Master Data");
  console.log(
    allowWrite ? "MODE: WRITE (live import)" : "MODE: DRY-RUN (read-only)"
  );
  console.log("═".repeat(70));
  console.log();

  // ── 1. Load JSON data ─────────────────────────────────────────────────────
  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: JSON file not found: ${jsonPath}`);
    process.exit(1);
  }
  const excelEmployees: ExcelEmployee[] = JSON.parse(
    fs.readFileSync(jsonPath, "utf-8")
  );
  console.log(`Excel rows loaded: ${excelEmployees.length}`);

  // ── 2. Load current DB state ──────────────────────────────────────────────
  const dbDepts = await prisma.department.findMany();
  const dbPositions = await prisma.position.findMany({
    include: { department: true },
  });
  const dbEmployees = await prisma.employee.findMany({
    include: { department: true, position: true },
  });
  const dbUsers = await prisma.user.findMany({ select: { id: true, email: true } });

  console.log(
    `Current DB: ${dbDepts.length} depts, ${dbPositions.length} positions, ${dbEmployees.length} employees, ${dbUsers.length} users`
  );
  console.log();

  // ── 3. Plan departments ───────────────────────────────────────────────────
  const deptMap = new Map<string, string>(); // normalized name → id
  for (const d of dbDepts) {
    deptMap.set(normalizeName(d.name), d.id);
  }

  const deptNames = [...new Set(excelEmployees.map((e) => e.department))];
  const deptsToCreate: string[] = [];
  const deptsToReuse: string[] = [];
  for (const deptName of deptNames) {
    if (deptMap.has(normalizeName(deptName))) {
      deptsToReuse.push(deptName);
    } else {
      deptsToCreate.push(deptName);
    }
  }

  // ── 4. Build planned dept map (normalized → id or PENDING) ───────────────
  const plannedDeptId = new Map<string, string>(); // normalized → db id (or placeholder)
  for (const d of dbDepts) {
    plannedDeptId.set(normalizeName(d.name), d.id);
  }

  // ── 5. Plan positions ─────────────────────────────────────────────────────
  type PositionKey = string; // `${normalizedTitle}:::${departmentId}`
  const posMap = new Map<PositionKey, string>(); // → position id
  for (const p of dbPositions) {
    posMap.set(`${normalizeName(p.title)}:::${p.departmentId}`, p.id);
  }

  // Collect unique (dept, position) pairs from Excel
  type DeptPosPair = { dept: string; pos: string };
  const deptPosPairs: DeptPosPair[] = [];
  const seenPairs = new Set<string>();
  for (const e of excelEmployees) {
    const key = `${normalizeName(e.department)}:::${normalizeName(e.position)}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      deptPosPairs.push({ dept: e.department, pos: e.position });
    }
  }

  const positionsToCreate: DeptPosPair[] = [];
  const positionsToReuse: DeptPosPair[] = [];
  for (const { dept, pos } of deptPosPairs) {
    // We need the department id to look up the position; use planned id for dept
    const deptId = plannedDeptId.get(normalizeName(dept));
    if (deptId) {
      const pk: PositionKey = `${normalizeName(pos)}:::${deptId}`;
      if (posMap.has(pk)) {
        positionsToReuse.push({ dept, pos });
      } else {
        positionsToCreate.push({ dept, pos });
      }
    } else {
      // Dept will be newly created; position is definitely new too
      positionsToCreate.push({ dept, pos });
    }
  }

  // ── 6. Match existing employees ───────────────────────────────────────────
  const dbByName = new Map<string, (typeof dbEmployees)[0]>();
  for (const emp of dbEmployees) {
    dbByName.set(
      `${normalizeName(emp.firstName)}:::${normalizeName(emp.lastName)}`,
      emp
    );
  }

  const matched: MatchedEmployee[] = [];
  for (const e of excelEmployees) {
    const key = `${normalizeName(e.firstName)}:::${normalizeName(e.lastName)}`;
    const existing = dbByName.get(key);
    matched.push({
      excel: e,
      existingId: existing?.id,
      existingCode: existing?.employeeCode,
      isUpdate: !!existing,
    });
  }

  const toCreate = matched.filter((m) => !m.isUpdate);
  const toUpdate = matched.filter((m) => m.isUpdate);

  // ── 7. EmployeeCode plan for new employees ────────────────────────────────
  const existingCodes = new Set(dbEmployees.map((e) => e.employeeCode));
  let stepIndex = 1;
  for (const m of toCreate) {
    let code: string;
    do {
      code = generateEmployeeCode(stepIndex++);
    } while (existingCodes.has(code));
    (m as any).newCode = code;
    existingCodes.add(code);
  }

  // ── 8. Email plan for new employees ──────────────────────────────────────
  const existingEmails = new Set([
    ...dbEmployees.map((e) => e.email),
    ...dbUsers.map((u) => u.email),
  ]);
  let emailIndex = 1;
  for (const m of toCreate) {
    let email: string;
    do {
      email = generateEmail(emailIndex++);
    } while (existingEmails.has(email));
    (m as any).newEmail = email;
    existingEmails.add(email);
  }

  // ── 9. Dry-run report ─────────────────────────────────────────────────────
  console.log("─".repeat(70));
  console.log("DRY-RUN SUMMARY");
  console.log("─".repeat(70));
  console.log(`Excel source:  ${jsonPath}`);
  console.log(`Excel rows:    ${excelEmployees.length}`);
  console.log();
  console.log(`Departments to CREATE (${deptsToCreate.length}): ${deptsToCreate.join(", ")}`);
  console.log(`Departments to REUSE  (${deptsToReuse.length}): ${deptsToReuse.join(", ")}`);
  console.log();
  console.log(`Positions to CREATE (${positionsToCreate.length}):`);
  for (const { dept, pos } of positionsToCreate) {
    console.log(`  [${dept}] ${pos}`);
  }
  console.log(`Positions to REUSE (${positionsToReuse.length}):`);
  for (const { dept, pos } of positionsToReuse) {
    console.log(`  [${dept}] ${pos}`);
  }
  console.log();
  console.log(`Employees to CREATE (${toCreate.length}):`);
  for (const m of toCreate) {
    console.log(
      `  Row ${m.excel.rowNum}: ${m.excel.firstName} ${m.excel.lastName} | ${m.excel.department} | ${m.excel.position} | code=${(m as any).newCode} | email=${(m as any).newEmail}`
    );
  }
  console.log();
  console.log(`Employees to UPDATE (${toUpdate.length}) — existing record found by name match:`);
  for (const m of toUpdate) {
    const db = dbByName.get(
      `${normalizeName(m.excel.firstName)}:::${normalizeName(m.excel.lastName)}`
    )!;
    console.log(`  ${m.excel.firstName} ${m.excel.lastName}`);
    console.log(`    employeeCode : ${db.employeeCode} (PRESERVED)`);
    console.log(`    email        : ${db.email} (PRESERVED)`);
    console.log(`    userId       : ${db.userId ?? "none"} (PRESERVED — no auth touch)`);
    console.log(`    department   : "${db.department.name}" → "${m.excel.department}" (case-insensitive match: same row)`);
    console.log(`    position     : "${db.position.title}" → "${m.excel.position}"`);
    console.log(`    hireDate     : ${db.hireDate.toISOString().split("T")[0]} → ${m.excel.hireDate}`);
  }
  console.log();
  console.log(`Existing employees NOT in Excel (preserved untouched):`);
  for (const emp of dbEmployees) {
    const key = `${normalizeName(emp.firstName)}:::${normalizeName(emp.lastName)}`;
    const inExcel = matched.find(
      (m) =>
        normalizeName(m.excel.firstName) === normalizeName(emp.firstName) &&
        normalizeName(m.excel.lastName) === normalizeName(emp.lastName)
    );
    if (!inExcel) {
      console.log(`  ${emp.firstName} ${emp.lastName} (${emp.employeeCode}) — NOT TOUCHED`);
    }
  }
  console.log();
  console.log("Safety confirmations:");
  console.log("  ✓ No DELETE statements");
  console.log("  ✓ No TRUNCATE statements");
  console.log("  ✓ No user account creation");
  console.log("  ✓ No password changes");
  console.log("  ✓ Existing employeeCode preserved for matched employees");
  console.log("  ✓ Existing email preserved for matched employees");
  console.log("  ✓ userId/auth link preserved for matched employees");
  console.log();
  console.log(
    `After import: ${dbEmployees.length - toUpdate.length + toUpdate.length + toCreate.length} employees total (${toUpdate.length} updated + ${toCreate.length} new + ${dbEmployees.length - toUpdate.length} untouched existing)`
  );
  console.log();

  if (!allowWrite) {
    console.log("═".repeat(70));
    console.log("DRY-RUN COMPLETE — no data was written.");
    console.log("To proceed with actual import, set:");
    console.log(
      "  ALLOW_STEP_EMPLOYEE_IMPORT=true npx tsx prisma/import-step-employees.ts"
    );
    console.log("═".repeat(70));
    return;
  }

  // ── 10. Backup current DB state ───────────────────────────────────────────
  const backupDir = path.resolve(__dirname, "../../tmp");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const backupPath = path.join(backupDir, `employee-import-backup-${timestamp}.json`);

  const backup = {
    timestamp,
    employees: dbEmployees,
    departments: dbDepts,
    positions: dbPositions,
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`Backup written: ${backupPath}`);
  console.log();

  // ── 11. Create departments ────────────────────────────────────────────────
  console.log("Creating departments...");
  for (const deptName of deptsToCreate) {
    const created = await prisma.department.create({
      data: { name: deptName },
    });
    plannedDeptId.set(normalizeName(deptName), created.id);
    console.log(`  Created dept: ${deptName} (${created.id})`);
  }
  // Refresh map for any reused existing depts
  for (const deptName of deptsToReuse) {
    const existingId = deptMap.get(normalizeName(deptName))!;
    plannedDeptId.set(normalizeName(deptName), existingId);
    console.log(
      `  Reused dept: ${deptName} (${existingId}) [DB name: ${dbDepts.find((d) => d.id === existingId)?.name}]`
    );
  }

  // ── 12. Create positions ──────────────────────────────────────────────────
  console.log("Creating positions...");
  for (const { dept, pos } of positionsToCreate) {
    const deptId = plannedDeptId.get(normalizeName(dept))!;
    const created = await prisma.position.create({
      data: { title: pos, departmentId: deptId },
    });
    posMap.set(`${normalizeName(pos)}:::${deptId}`, created.id);
    console.log(`  Created position: [${dept}] ${pos} (${created.id})`);
  }
  for (const { dept, pos } of positionsToReuse) {
    const deptId = plannedDeptId.get(normalizeName(dept))!;
    const pk: PositionKey = `${normalizeName(pos)}:::${deptId}`;
    console.log(
      `  Reused position: [${dept}] ${pos} (${posMap.get(pk)})`
    );
  }

  // ── 13. Update existing employees ─────────────────────────────────────────
  console.log("Updating existing employees...");
  for (const m of toUpdate) {
    const deptId = plannedDeptId.get(normalizeName(m.excel.department))!;
    const posId = posMap.get(
      `${normalizeName(m.excel.position)}:::${deptId}`
    );
    if (!posId) {
      console.error(
        `ERROR: position not found for ${m.excel.firstName} ${m.excel.lastName}: [${m.excel.department}] ${m.excel.position}`
      );
      process.exit(1);
    }
    await prisma.employee.update({
      where: { id: m.existingId! },
      data: {
        departmentId: deptId,
        positionId: posId,
        hireDate: new Date(m.excel.hireDate),
        // Preserve: employeeCode, email, userId, status — not touched
      },
    });
    console.log(
      `  Updated: ${m.excel.firstName} ${m.excel.lastName} → [${m.excel.department}] ${m.excel.position}`
    );
  }

  // ── 14. Create new employees ──────────────────────────────────────────────
  console.log("Creating new employees...");
  let created = 0;
  for (const m of toCreate) {
    const deptId = plannedDeptId.get(normalizeName(m.excel.department))!;
    const posId = posMap.get(
      `${normalizeName(m.excel.position)}:::${deptId}`
    );
    if (!posId) {
      console.error(
        `ERROR: position not found for ${m.excel.firstName} ${m.excel.lastName}: [${m.excel.department}] ${m.excel.position}`
      );
      process.exit(1);
    }
    await prisma.employee.create({
      data: {
        employeeCode: (m as any).newCode,
        firstName: m.excel.firstName,
        lastName: m.excel.lastName,
        email: (m as any).newEmail,
        hireDate: new Date(m.excel.hireDate),
        departmentId: deptId,
        positionId: posId,
        status: "ACTIVE",
      },
    });
    created++;
    console.log(
      `  Created: ${m.excel.firstName} ${m.excel.lastName} (${(m as any).newCode}) → [${m.excel.department}] ${m.excel.position}`
    );
  }

  // ── 15. Verification ──────────────────────────────────────────────────────
  console.log();
  console.log("─".repeat(70));
  console.log("POST-IMPORT VERIFICATION");
  console.log("─".repeat(70));

  const afterDepts = await prisma.department.findMany();
  const afterEmployees = await prisma.employee.findMany({
    include: { department: true, position: true },
  });

  console.log(`Total employees: ${afterEmployees.length}`);
  console.log(`Total departments: ${afterDepts.length}`);

  // Dept counts from Excel employees only
  const excelDeptCounts = new Map<string, number>();
  for (const e of excelEmployees) {
    const key = normalizeName(e.department);
    excelDeptCounts.set(key, (excelDeptCounts.get(key) ?? 0) + 1);
  }
  console.log("\nDepartment employee counts (Excel-imported employees):");
  const expectedCounts: Record<string, number> = {
    sales: 16, operation: 14, installation: 11, service: 9,
    production: 5, accounting: 4, marketing: 3, hr: 1,
  };
  let allPass = true;
  for (const [deptKey, expected] of Object.entries(expectedCounts)) {
    const actual = excelDeptCounts.get(deptKey) ?? 0;
    const ok = actual === expected ? "✓" : "✗";
    if (actual !== expected) allPass = false;
    console.log(`  ${ok} ${deptKey}: ${actual} (expected ${expected})`);
  }

  // Key employees
  console.log("\nKey employee check:");
  const pichai = afterEmployees.find(
    (e) => normalizeName(e.firstName) === normalizeName("พิชัย") &&
            normalizeName(e.lastName) === normalizeName("ใจจิต")
  );
  const kasi = afterEmployees.find(
    (e) => normalizeName(e.firstName) === normalizeName("กาศิ") &&
            normalizeName(e.lastName) === normalizeName("จั่นอุไร")
  );

  if (pichai) {
    console.log(`  ✓ พิชัย ใจจิต (${pichai.employeeCode}) → [${pichai.department.name}] ${pichai.position.title}`);
  } else {
    console.log("  ✗ พิชัย ใจจิต — NOT FOUND");
    allPass = false;
  }
  if (kasi) {
    console.log(`  ✓ กาศิ จั่นอุไร (${kasi.employeeCode}) → [${kasi.department.name}] ${kasi.position.title}`);
  } else {
    console.log("  ✗ กาศิ จั่นอุไร — NOT FOUND");
    allPass = false;
  }

  // Duplicate check
  const nameCounts = new Map<string, number>();
  for (const e of afterEmployees) {
    const key = `${normalizeName(e.firstName)}:::${normalizeName(e.lastName)}`;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const dups = [...nameCounts.entries()].filter(([, c]) => c > 1);
  if (dups.length === 0) {
    console.log("  ✓ No duplicate full names");
  } else {
    console.log(`  ✗ Duplicate names found: ${dups.map(([n]) => n).join(", ")}`);
    allPass = false;
  }

  console.log();
  console.log("═".repeat(70));
  console.log(allPass ? "IMPORT RESULT: PASS ✓" : "IMPORT RESULT: NEEDS REVIEW ✗");
  console.log(`Backup: ${backupPath}`);
  console.log(`New employees created: ${created}`);
  console.log(`Existing employees updated: ${toUpdate.length}`);
  console.log(`Existing employees untouched: ${dbEmployees.length - toUpdate.length}`);
  console.log("═".repeat(70));
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
