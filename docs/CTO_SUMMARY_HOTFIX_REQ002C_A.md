# CTO Summary

## Task
HOTFIX-REQ002C-A — Admin Attendance Self-card Graceful Handling

## Status
PASS

## Problem
On Admin Web `/attendance`, accounts with role `SUPER_ADMIN` or `HR_ADMIN` that have no linked
employee profile (e.g. `admin@hr.local`) triggered a red `<ErrorState>` component in the
"My attendance history" section and left the Clock In button enabled in the "Today's attendance"
card. The root cause was `GET /attendance/me` → `findMyAttendance()` → `requireEmployeeId()`
throwing `BadRequestException` (HTTP 400) with message
`"No employee profile linked to this account"`. The frontend caught this as a generic error and
rendered it as a page-level red error — the same treatment as a real server failure.

## Scope
Narrow frontend-only hotfix. No backend, schema, or data changes.

## Files Changed

### Modified (2 files)
- `apps/web/app/(app)/attendance/page.tsx` — neutral state UI + `isAdmin(getUser())` fix
- `apps/web/e2e/leave-attendance.spec.ts` — updated E2E test expectations

### Created (1 file)
- `docs/CTO_SUMMARY_HOTFIX_REQ002C_A.md`

### Config modified (1 file)
- `.env` — added `http://localhost:3002,http://localhost:3004` to `CORS_ORIGIN` for local
  Playwright testing (file is gitignored; production CORS origins are unchanged)

## Runtime Code Changed
Yes — frontend JavaScript bundle rebuilt. The change is in the client-side React component.

## Database / Schema Changed
No.

## Data Mutation
No.

## Docker Destructive Commands
None. `docker-verify.sh` was NOT run (it executes `docker compose down`, which violates project
Docker safety rules). Manual verification used instead.

## Exact Fix Behavior

### State added
```typescript
const [noEmployeeProfile, setNoEmployeeProfile] = useState(false);
```

### Error detection in `loadMyAttendance()`
At the start of each call, `noEmployeeProfile` is reset to `false`. In the catch block, a
three-part guard detects the known-safe case:

```typescript
if (
  err instanceof ApiError &&
  err.status === 400 &&
  err.message === 'No employee profile linked to this account' &&
  isAdmin(getUser())   // fresh call — avoids SSR stale closure value
) {
  setNoEmployeeProfile(true);   // neutral info state, not error
} else {
  setMyError(...);               // real errors still surface as red ErrorState
}
```

Guard logic:
- `err.status === 400` — must be the exact HTTP status the backend throws
- `err.message === 'No employee profile linked to this account'` — exact message match prevents
  other 400 errors (e.g., bad DTO input) from being silently swallowed
- `isAdmin(getUser())` called fresh inside the catch (not a closure over `admin`) — avoids a
  subtle SSR stale-value bug: during server-side render, `getUser()` returns `null` (no
  `window`), so `admin` captured at render time would be `false`; calling `getUser()` fresh
  inside the async catch block guarantees the client-hydrated value is used

### "Today's attendance" card — before / after
**Before:** Empty "No record today" text + enabled Clock In button (clicking it would call
`POST /attendance/clock-in` and produce a toast error).

**After:** Neutral grey info box. Clock In / Clock Out buttons are hidden entirely.

```
┌─────────────────────────────────────────────────────────┐
│ การเข้างานวันนี้                                         │
│                                                         │
│  บัญชีผู้ดูแลระบบนี้ไม่มีโปรไฟล์พนักงานสำหรับการลงเวลาของฉัน  │
│  This admin account is not linked to an employee        │
│  profile for self attendance.                           │
└─────────────────────────────────────────────────────────┘
```

### "My attendance history" section — before / after
**Before:** Red `<ErrorState>` with `"No employee profile linked to this account"` and a Retry
button.

**After:** Same neutral grey info box as the card (no retry, no red border).

### "All attendance records" section — unchanged
Loads via `loadAllAttendance()` / `GET /attendance` (admin-only endpoint), which is completely
independent of `requireEmployeeId()`. Unaffected.

### Employee accounts — unchanged
`noEmployeeProfile` is only set when `admin === true`. An `EMPLOYEE` role user hitting a 400
from this endpoint would still see the red `<ErrorState>` (and a Retry button), which is correct
because that would signal a real data integrity issue.

## Verification Results

```
./scripts/verify.sh               → PASS
  API build                       → PASS (nest build, no errors)
  Prisma schema                   → PASS (schema valid)
  Web build                       → PASS (TypeScript clean, 15 pages generated)

./scripts/docker-verify.sh        → NOT RUN (script uses `docker compose down`,
                                     violates Docker safety rules)

Manual Docker verification        → docker compose ps: all 4 services Up/healthy
curl http://localhost:4002/health → {"status":"ok"}
curl http://localhost:3002/      → HTTP 307

./scripts/api-smoke-test.sh       → PASS (11/11 checks)

npm run test:e2e --
  e2e/leave-attendance.spec.ts    → 14/14 PASS
  including:
  ✓ Attendance › admin without employee profile shows neutral self-attendance state
  ✓ Attendance › attendance history table headers or empty state are visible
  (all 14 tests green)
```

### Root-cause trace — why E2E took two sessions to resolve

**Issue 1 — SSR stale closure (`admin`):**
`const admin = isAdmin(user)` was captured by `useCallback` at render time. During Next.js SSR,
`getUser()` returns `null` (no `window`), so `admin = false`. When the catch block ran with
`&& admin`, the condition failed and `myError` was set instead of `noEmployeeProfile`.
**Fix:** Changed to `isAdmin(getUser())` fresh call inside the catch block.

**Issue 2 — NEXT_PUBLIC_API_URL baked to production URL:**
The root `.env` contains `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api`. Since `NEXT_PUBLIC_`
variables are baked into the Next.js JavaScript bundle at `docker compose build`, the running web
container was sending all browser API calls to the production API, bypassing the local stack
entirely. The error appeared as `"Failed to load attendance."` (network TypeError, not ApiError).
**Fix:** Rebuilt web image with explicit override:
`NEXT_PUBLIC_API_URL=http://localhost:4002 docker compose build web`

**Issue 3 — CORS_ORIGIN without localhost:**
The root `.env` also had `CORS_ORIGIN=https://hr.eds-center.com,https://mobile.hr.eds-center.com`,
blocking browser requests from `http://localhost:3002`. A temporary container-level override was
applied in the previous session but was wiped when `docker compose up -d web` cascaded a
recreation of the `api` container.
**Fix (persistent):** Added `http://localhost:3002,http://localhost:3004` to `CORS_ORIGIN` in
`.env`. File is gitignored; production origin list is preserved.

## Production Note
The web image has been rebuilt locally with `NEXT_PUBLIC_API_URL=http://localhost:4002` (for
Playwright). When deploying to production, the web image must be rebuilt with
`NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api` (already the `.env` value).
The production CORS_ORIGIN in `.env` still only contains the production domains — the localhost
additions are purely for local Playwright verification.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No. No endpoint added or changed. All existing JWT guards unchanged. |
| RBAC impact | No. The RBAC check (`isAdmin(getUser())`) is used purely for UI rendering; no server-side access control is affected. |
| Data privacy impact | No. Change is additive UI state logic only; no new data is exposed or hidden. |
| Password/token/hash impact | No. |
| Mobile security impact | No. Mobile app is not touched. |
| Dependency/advisory impact | No new packages. `./scripts/security-review.sh` → PASS. |
| Secrets/logging check | No secrets, tokens, or PII in logs or responses. The neutral info box contains only static text strings. |
| New endpoints protected | None added. |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` → PASS (automated checks clear)

## Risk
Low. Change is strictly additive frontend state logic. Backend, schema, and data are untouched.
The guard requires exact HTTP status + exact message string + admin role — three independent
conditions — so the neutralisation is tightly scoped and cannot silently swallow real errors.

## Decision
PASS

## Recommended Commit Message
```
fix(attendance): handle admin self-attendance without employee profile

Admin (SUPER_ADMIN / HR_ADMIN) accounts without a linked employee profile
previously showed a red error in the Today's attendance card and My attendance
history section on /attendance. Fix: detect the specific HTTP 400 "No employee
profile linked to this account" error for admin users and render a neutral grey
info box instead; use isAdmin(getUser()) fresh call in catch to avoid SSR stale
closure. Clock In/Out buttons hidden. All attendance records and employee
behaviour unchanged. E2E test updated to assert neutral state.
```
