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

### Modified (1 file)
- `apps/web/app/(app)/attendance/page.tsx`

### Created (1 file)
- `docs/CTO_SUMMARY_HOTFIX_REQ002C_A.md`

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
  admin
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
- `admin` — only admin users (SUPER_ADMIN / HR_ADMIN) see the neutral state; an EMPLOYEE
  account hitting this error would still see the red error (which would indicate a real data
  integrity issue, not expected admin behavior)

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
./scripts/verify.sh         → PASS
  API build                 → PASS (nest build, no errors)
  Prisma schema             → PASS (schema valid)
  Web build                 → PASS (TypeScript clean, 15 pages generated)

./scripts/docker-verify.sh  → NOT RUN (script uses `docker compose down`,
                               violates Docker safety rules)

Manual Docker verification  → docker compose ps: all 4 services Up/healthy
curl http://localhost:4002/health → {"status":"ok"}
curl http://localhost:3002/      → HTTP 307

./scripts/api-smoke-test.sh → PASS (11/11 checks)
```

## Production Note
The Docker image for `hr-web` is not rebuilt in this session — the running container still serves
the pre-hotfix build. To apply the fix in the running stack, the web image must be rebuilt and
restarted. Since `docker compose down` is prohibited, the user should perform this manually:

```bash
docker compose build web
docker compose up -d web
```
(Non-destructive: rebuilds only the web image and restarts only the web container.)

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
info box instead. Clock In/Out buttons are hidden for these accounts. All
attendance records section and employee account behaviour are unchanged.
```
