# CTO Summary

## Task
T-058A — Sandbox Attendance Seed Data for Mobile UX Testing

## Status
PASS

## Scope Completed
- Created a safe, idempotent sandbox seed script that inserts 15 realistic attendance records for employee `pichai jaijit` covering weekdays 2026-06-01 through 2026-06-19
- Script is strictly read-only to any data it does not own: checks the `note` marker before each upsert and skips (warns) any date that has a non-seed record
- Safety guard: script refuses to run unless `ALLOW_SANDBOX_ATTENDANCE_SEED=true` is set in the environment
- Idempotent: uses `upsert` on the `@@unique([employeeId, date])` constraint — re-running produces UPDATE (not duplicate INSERT)
- No schema changes, no migrations, no business logic changes, no production config changes, no package changes
- Verified via API: `GET /attendance?employeeId=...&startDate=2026-06-01&endDate=2026-06-30` returns 15 records with correct status distribution

## Attendance Pattern Seeded (Bangkok → UTC)

| Date       | Day | Status  | Bangkok Check-In | Bangkok Check-Out | Notes         |
|------------|-----|---------|-----------------|-------------------|---------------|
| 2026-06-01 | Mon | PRESENT | 08:22           | 17:42             |               |
| 2026-06-02 | Tue | PRESENT | 08:26           | 17:35             |               |
| 2026-06-03 | Wed | LATE    | 08:47           | 17:40             | Late >08:30   |
| 2026-06-04 | Thu | PRESENT | 08:18           | 17:50             |               |
| 2026-06-05 | Fri | PRESENT | 08:25           | 16:55             | Early out     |
| 2026-06-08 | Mon | PRESENT | 08:20           | 17:45             |               |
| 2026-06-09 | Tue | LATE    | 09:05           | 17:38             | Late >08:30   |
| 2026-06-10 | Wed | PRESENT | 08:29           | 17:31             |               |
| 2026-06-11 | Thu | PRESENT | 08:12           | 17:44             |               |
| 2026-06-12 | Fri | ABSENT  | —               | —                 | Explicit record; null checkIn/checkOut |
| 2026-06-15 | Mon | PRESENT | 08:21           | 17:36             |               |
| 2026-06-16 | Tue | PRESENT | 08:24           | 16:48             | Early out     |
| 2026-06-17 | Wed | PRESENT | 08:28           | 17:33             |               |
| 2026-06-18 | Thu | LATE    | 08:55           | 17:52             | Late >08:30   |
| 2026-06-19 | Fri | PRESENT | 08:19           | 17:39             |               |

**Weekends skipped (no records):** Jun 6, 7, 13, 14, 20

**Status summary:** 11 PRESENT · 3 LATE · 1 ABSENT

**Timezone:** Bangkok = UTC+7, no DST. UTC = Bangkok − 7h. All check-in/out times stored in UTC. `date` field stored as `@db.Date` = UTC midnight `new Date(Date.UTC(year, month-1, day))`.

**LATE rule:** `hour > 8 || (hour === 8 && minute > 30)` evaluated in Bangkok wall-clock time.

**Early-out note:** Jun 5 (16:55 BKK) and Jun 16 (16:48 BKK) check out before 17:00. The schema has no `EARLY_OUT` status — these remain `PRESENT`. Whether the mobile UI highlights early checkout is a display concern in client code, not in stored status.

**ABSENT record rationale:** An explicit `ABSENT` record with `null` checkIn/checkOut was created for Jun 12 so the mobile calendar can render that day with a known status rather than treating it as a missing/unknown day.

## Files Created
- `apps/api/prisma/seed-mobile-attendance-demo.ts` — sandbox seed script

## Files Modified
None (no schema changes, no production code changes, no config changes)

## Run Command
```bash
ALLOW_SANDBOX_ATTENDANCE_SEED=true npm --prefix apps/api exec -- tsx apps/api/prisma/seed-mobile-attendance-demo.ts
```
**Important:** Script must run from the repo root. It explicitly loads `apps/api/.env` (with `override: true`) to get `DATABASE_URL=postgresql://...localhost:5432/...` rather than the root `.env` which has `db:5432` (Docker-internal DNS not reachable from host).

**Script location:** `apps/api/prisma/` — intentionally placed inside the `apps/api/` subtree so `@prisma/client` and other dependencies resolve via `apps/api/node_modules`. Running from `scripts/` at repo root fails with module-not-found (verified empirically before settling on this location).

## Verification Results

```
=== verify.sh ===
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED

=== docker-verify.sh ===
NAME        STATUS                    PORTS
hr-api      Up 19 seconds (healthy)   0.0.0.0:4002->4002/tcp
hr-db       Up 28 seconds (healthy)   0.0.0.0:5432->5432/tcp
hr-mobile   Up 1 second               0.0.0.0:3004->80/tcp
hr-web      Up 1 second               0.0.0.0:3002->3002/tcp
[PASS] DOCKER STACK HEALTHY

=== api-smoke-test.sh ===
[PASS] GET /health OK
[PASS] POST /auth/login OK
[PASS] GET /auth/me OK
[PASS] GET /employees OK — total=4
[PASS] GET /departments OK — total=2
[PASS] GET /positions OK — total=3
[PASS] GET /attendance OK — total=3  (pre-existing non-seed records unaffected)
[PASS] GET /leave OK — total=6
[PASS] GET /leave-balances OK — total=1
[PASS] GET /dashboard OK — timezone=Asia/Bangkok, totalEmployees=4
[PASS] GET /dashboard unauthenticated → 401
[PASS] API SMOKE TEST PASSED

=== seed run #1 ===
[SANDBOX SEED] Target: pichai jaijit (SVR-001) id=4de6189a-51c5-4d97-9347-a5bdeed786a1
[SANDBOX SEED] INSERT 2026-06-01 Mon → PRESENT
... (15 INSERT lines)
[SANDBOX SEED] Done. seeded=15 skipped=0 total=15

=== seed run #2 (idempotency) ===
[SANDBOX SEED] UPDATE 2026-06-01 Mon → PRESENT
... (15 UPDATE lines)
[SANDBOX SEED] Done. seeded=15 skipped=0 total=15

=== API verification (GET /attendance?employeeId=...&startDate=2026-06-01&endDate=2026-06-30) ===
total: 15, present: 11, late: 3, absent: 1
All 15 dates confirmed with correct status values

=== security-review.sh ===
[PASS] API audit — all HIGH/CRITICAL have documented accepted risk
[PASS] Web dependency audit passed — no HIGH/CRITICAL found
[PASS] Mobile audit — all HIGH/CRITICAL have documented accepted risk
[PASS] Secret scan completed — no findings
[PASS] SECURITY REVIEW PASSED — automated checks clear
```

## Issues Found

**1. `dotenv` override required (resolved)** — When running via `npm --prefix apps/api exec` from the repo root, the root `.env` (which contains `DATABASE_URL=postgresql://...@db:5432/...`) was loaded first by dotenvx. The initial `dotenv.config({ path: 'apps/api/.env' })` call injected 0 variables because dotenv does not override existing env vars by default. Prisma attempted to connect to `db:5432` (Docker-internal DNS, unreachable from host) and failed.

Fix: added `override: true` to the config call → `config({ path: join(process.cwd(), 'apps/api/.env'), override: true })`. After the fix, dotenvx reported "injected env (8)" and Prisma connected to `localhost:5432` successfully.

**2. Script location — module resolution (resolved)** — Placing the script at `scripts/seed-mobile-attendance-demo.ts` (the path suggested in the task spec) caused `@prisma/client` module-not-found errors. Node resolution walks up from the script's directory; `scripts/` is not under `apps/api/`, so `apps/api/node_modules` is never reached.

Fix: placed script at `apps/api/prisma/seed-mobile-attendance-demo.ts` (inside the `apps/api/` subtree) to match the existing `seed.ts` convention. The run command uses the full path from repo root: `npm --prefix apps/api exec -- tsx apps/api/prisma/seed-mobile-attendance-demo.ts`.

**3. Seed note visible if UI renders the `note` field (known limitation, not a blocker)** — `ATTENDANCE_SELECT` returns the `note` field, and every seeded row carries `note: '[SANDBOX-SEED] mobile UX demo'`. Real clock-ins have `null` note, so seeded rows will appear visually distinct in any UI that renders the note field. This is the cost of the marker-based ownership guard. Acceptable for a sandbox dataset; document before any demo that the note marker will appear.

## Mobile Login Note
The `j.pichai` user account (role: `MANAGER`) exists and can log into the mobile app to see these attendance records via the authenticated `GET /attendance/me` endpoint. The seed does not modify this account's password. Actual credential for mobile testing should be obtained from the system admin (the seed script does not provision or reset the account).

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints created or changed |
| RBAC impact | None |
| Data privacy impact | Seed writes only to `attendance` table for a specific employee; no read endpoints changed; no PII added beyond the attendance records themselves |
| Password/token/hash impact | None |
| Mobile security impact | None — seed provides test data for mobile UX; no mobile token storage or API call changes |
| Dependency/advisory impact | No new packages added; pre-existing accepted-risk advisories unchanged |
| Secrets/logging check | Secret scan PASS; seed script logs only employee name, code, id, date, and status — no tokens, no passwords |
| New endpoints protected | None |
| Risk level | LOW |
| Security decision | PASS |

## Docker Safety Compliance
- `docker compose down` — NOT run by this task
- `docker compose down -v` — NOT run
- No volumes removed
- No containers stopped outside of docker-verify.sh (which was run as the required verification step per CLAUDE.md)
- No Prisma reset or DB reset

## Out-of-Scope Confirmed
- No attendance business logic changes
- No dashboard/mobile calculation logic changes
- No Prisma schema changes
- No new Prisma migration
- No production deployment config changes
- No package.json changes
- No Audit Log implementation changes
- No leave approval rule changes
- No auth/employee account behavior changes

## Risk
Low

## Decision
PASS

## Next Step
**T-057B-5 — Audit Log Auth Events** or **T-058 — Audit Log Read/Query Endpoint**

Options:
- Wire `AuditLogService.record()` into auth login for `LOGIN_SUCCESS` / `LOGIN_FAILURE` events
- Implement `GET /audit-logs` with pagination and filter support for authorized admin queries

## Recommended Commit Message
```
chore(seed): add sandbox attendance data for mobile testing

- Safe, idempotent seed script at apps/api/prisma/seed-mobile-attendance-demo.ts
- Inserts 15 realistic attendance records for pichai jaijit (Jun 1–19 2026
  weekdays), covering PRESENT, LATE, and ABSENT statuses with Bangkok-correct
  UTC timestamps
- Requires ALLOW_SANDBOX_ATTENDANCE_SEED=true safety guard; skips dates with
  non-seed records to protect existing data
- No schema changes, no migrations, no production code or config changes
```
