# CTO Summary

## Task
T-067 / T-067R — Failed Geofence Audit Runtime Verification

## Status
**PASS** (T-067R — after approved container rebuild)

Initial attempt (T-067) was BLOCKED due to a stale container artifact. After user-approved rebuild,
T-067R completed successfully. All 4 rejection cases produced audit events. Privacy: clean.

---

## Scope
Verify at runtime that `ATTENDANCE_GEOFENCE_REJECTED` audit events are emitted, queryable from
`/audit-logs`, and privacy-safe when mobile attendance is rejected by geofence validation.
Documentation only — no application code changes.

## Runtime Environment (T-067R)
- Branch: `main`
- Latest commit: `879e369 docs(knowledge): sync failed geofence audit knowledge and ADR`
- API container: rebuilt via `docker compose up -d --build api` (user-approved, 2026-06-21)
- API URL: `http://localhost:4002`
- DB: PostgreSQL 16 (hr-db, healthy)
- All services: healthy throughout

## Files Created
- `docs/CTO_SUMMARY_T067.md` (this file)

## Files Modified
None. All non-doc paths unchanged.

---

## Part 1: T-067 Initial Attempt — BLOCKED

### Blocker: Container Artifact Predated T-065

The `hr-api` container running before rebuild was compiled from a pre-T-065 artifact.

| Check | Source (`attendance.service.ts`) | Pre-rebuild Dist |
|---|---|---|
| `validateGeofence` call in `clockIn` | `validateGeofence(dto, 'CLOCK_IN', ctx)` — 3 args | `validateGeofence(dto)` — 1 arg |
| `ATTENDANCE_GEOFENCE_REJECTED` | Present (line 412) | **Not found** |
| `OUTSIDE_RADIUS` | Present (line 385) | **Not found** |
| `MISSING_LOCATION` | Present (line 324) | **Not found** |
| `recordBestEffort` count | **5** (4 calls + 1 def) | **4** (missing T-065 call at line 409) |

The 422 rejection responses were correct in the pre-rebuild container (basic geofence validation
was pre-existing), but the audit logging call added by T-065 was absent.

### T-067 Test Results (pre-rebuild)
All 4 cases returned correct HTTP 422 with correct messages. Zero audit events created.

---

## Part 2: Container Rebuild

Command run with explicit user approval:
```
docker compose up -d --build api
```

No `docker compose down`, no `down -v`, no prune, no volume/image/network removal.

### Post-rebuild Artifact Verification

| Check | Result |
|---|---|
| `ATTENDANCE_GEOFENCE_REJECTED` in dist | **1** ✅ |
| `OUTSIDE_RADIUS` in dist | **1** ✅ |
| `MISSING_LOCATION` in dist | **1** ✅ |
| `recordBestEffort` count in dist | **5** ✅ (matches source) |
| `validateGeofence` call site | `validateGeofence(dto, 'CLOCK_IN', ctx)` — 3 args ✅ |
| API health post-rebuild | `{"status":"ok"}` ✅ |

---

## Part 3: T-067R Verification — PASS

### Auth / Account Notes
- Admin login: `admin@hr.local` — credentials sourced from `scripts/api-smoke-test.sh`.
  Passwords and tokens are not recorded in this summary.
- Admin account used for all config, audit, and clock-in/clock-out requests.
- `validateGeofence` runs before `requireEmployeeId` — rejection audit events fire before any
  employee profile lookup, so admin account works for all 4 rejection cases.

### Original Geofence Config (captured before T-067R sandbox)

| Field             | Value  |
|-------------------|--------|
| enabled           | `false`|
| hasCoordinates    | `true` |
| radiusMeters      | `100`  |
| maxAccuracyMeters | `100`  |
| source            | `db`   |

Raw coordinates not recorded (privacy rule).

### Audit Baseline Before T-067R
- `ATTENDANCE_GEOFENCE_REJECTED` events: **0**

### Controlled Sandbox Config Applied
| Field             | Value  |
|-------------------|--------|
| enabled           | `true` |
| latitude          | public placeholder (Bangkok center) |
| longitude         | public placeholder (Bangkok center) |
| radiusMeters      | `100`  |
| maxAccuracyMeters | `100`  |
| source            | `db`   |

Local sandbox only; not production.

---

## Test Cases (T-067R)

### Case A — Mobile clock-in missing GPS

| Field | Value |
|---|---|
| Request | `POST /attendance/clock-in` `{"source":"mobile"}` (no lat/lon/accuracy) |
| Expected HTTP | 422 |
| Actual HTTP | **422 ✅** |
| Expected message | `Location is required for mobile attendance.` |
| Actual message | `Location is required for mobile attendance.` **✅** |
| Audit event found | **YES ✅** |
| action | `ATTENDANCE_GEOFENCE_REJECTED` ✅ |
| targetType | `ATTENDANCE` ✅ |
| targetId | `null` ✅ |
| targetLabel | `clock-in-geofence-rejected` ✅ |
| result | `REJECTED` ✅ |
| metadata.reason | `MISSING_LOCATION` ✅ |
| metadata.attemptType | `CLOCK_IN` ✅ |
| metadata.source | `mobile` ✅ |
| metadata.hasCoordinates | `false` ✅ |
| metadata.hasAccuracy | `false` ✅ |
| metadata.accuracyBucket | `UNKNOWN` ✅ |
| metadata.configSource | `db` ✅ |
| metadata.geofenceEnabled | `true` ✅ |
| metadata.result | `REJECTED` ✅ |
| Privacy metadata | **PASS** ✅ |

### Case B — Mobile clock-in poor GPS accuracy

| Field | Value |
|---|---|
| Request | `POST /attendance/clock-in` `{"source":"mobile","latitude":<placeholder>,"longitude":<placeholder>,"accuracy":150}` |
| Expected HTTP | 422 |
| Actual HTTP | **422 ✅** |
| Expected message | `GPS accuracy is too low. Please try again near the office.` |
| Actual message | `GPS accuracy is too low. Please try again near the office.` **✅** |
| Audit event found | **YES ✅** |
| metadata.reason | `POOR_ACCURACY` ✅ |
| metadata.attemptType | `CLOCK_IN` ✅ |
| metadata.hasCoordinates | `true` ✅ |
| metadata.hasAccuracy | `true` ✅ |
| metadata.accuracyBucket | `POOR` ✅ (accuracy 150 > maxAccuracyMeters 100) |
| metadata.configSource | `db` ✅ |
| Privacy metadata | **PASS** ✅ |

### Case C — Mobile clock-in outside radius

| Field | Value |
|---|---|
| Request | `POST /attendance/clock-in` `{"source":"mobile","latitude":"<outside-radius placeholder>","longitude":"<outside-radius placeholder>","accuracy":25}` |
| Expected HTTP | 422 |
| Actual HTTP | **422 ✅** |
| Expected message | `You are outside the allowed company area.` |
| Actual message | `You are outside the allowed company area.` **✅** |
| Audit event found | **YES ✅** |
| metadata.reason | `OUTSIDE_RADIUS` ✅ |
| metadata.attemptType | `CLOCK_IN` ✅ |
| metadata.hasCoordinates | `true` ✅ |
| metadata.hasAccuracy | `true` ✅ |
| metadata.accuracyBucket | `ACCEPTABLE` ✅ |
| targetLabel | `clock-in-geofence-rejected` ✅ |
| Privacy metadata | **PASS** ✅ |

### Case D — Mobile clock-out outside radius

| Field | Value |
|---|---|
| Request | `POST /attendance/clock-out` `{"source":"mobile","latitude":"<outside-radius placeholder>","longitude":"<outside-radius placeholder>","accuracy":25}` |
| Expected HTTP | 422 |
| Actual HTTP | **422 ✅** |
| Expected message | `You are outside the allowed company area.` |
| Actual message | `You are outside the allowed company area.` **✅** |
| Audit event found | **YES ✅** |
| metadata.reason | `OUTSIDE_RADIUS` ✅ |
| metadata.attemptType | `CLOCK_OUT` ✅ |
| targetLabel | `clock-out-geofence-rejected` ✅ |
| metadata.accuracyBucket | `ACCEPTABLE` ✅ |
| Privacy metadata | **PASS** ✅ |
| Note | `validateGeofence` fires before the "no clock-in" guard and `requireEmployeeId` — confirmed by 422 returned with no prior clock-in row |

### Case E — Web/legacy bypass does not emit rejected audit
Skipped at runtime. Covered by T-065 automated tests.
Rationale: requires a successful non-rejected web clock-in, which creates an attendance row side effect.

### Case F — Inside-radius mobile success does not emit rejected audit
Skipped at runtime. Covered by T-065 automated tests.
Rationale: requires a successful mobile clock-in, creating an attendance row side effect not safe
to produce without a disposable sandbox employee account.

---

## Privacy Verification Summary

**PASS** — checked all 9 required safe fields and 8 forbidden fields across all 4 events.

### Forbidden fields — absent from all events
| Field | Status |
|---|---|
| `latitude` | Not present ✅ |
| `longitude` | Not present ✅ |
| `accuracy` | Not present ✅ |
| `distance` | Not present ✅ |
| `companyLatitude` | Not present ✅ |
| `companyLongitude` | Not present ✅ |
| `note` | Not present ✅ |
| `bearing` | Not present ✅ |

### Required safe fields — present in all 4 events
`attemptType`, `source`, `reason`, `hasCoordinates`, `hasAccuracy`, `accuracyBucket`,
`configSource`, `geofenceEnabled`, `result` — all present in all 4 events ✅

---

## Geofence Config Restore Result

| Step | Result |
|---|---|
| PATCH enable (sandbox start, T-067R) | HTTP 200 ✅ |
| PATCH restore (sandbox end, T-067R) | HTTP 200 ✅ |
| Post-restore `enabled` | `false` ✅ |
| Post-restore `radiusMeters` | `100` ✅ |
| Post-restore `maxAccuracyMeters` | `100` ✅ |
| Post-restore `source` | `db` ✅ |
| Post-restore `hasCoordinates` | `true` ✅ |

Config fully restored. No `env→db` source change (source was already `db` before T-067R).

---

## Skipped Runtime Checks
| Check | Reason |
|---|---|
| Case E (web bypass) | Attendance row side effect; covered by T-065 automated tests |
| Case F (inside-radius mobile success) | Attendance row side effect; covered by T-065 automated tests |

---

## Attendance Records Side Effect Check
1 attendance record existed for 2026-06-21 before T-067R tests began;
`checkIn` was `2026-06-21T08:18:09Z` — predates all T-067R requests (~11:21 UTC).
No attendance records were created by any T-067R test case. Total remained at 19.

## Audit Log Side Effects Created (T-067 + T-067R combined)
| Event | Count | Notes |
|---|---|---|
| `ATTENDANCE_GEOFENCE_REJECTED` | **4** | All from T-067R (0 from T-067 pre-rebuild) |
| `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` | **4** | 2 from T-067 (enable+restore), 2 from T-067R (enable+restore), plus 2 pre-existing |

---

## Docker Safety Compliance
- ✅ No `docker compose down`
- ✅ No `docker compose down -v`
- ✅ No `docker system prune`
- ✅ No volumes, images, networks or containers removed
- ✅ Only `docker compose up -d --build api` run (user-approved)
- ✅ `docker exec` used read-only (grep only)
- ✅ All services healthy throughout

## Git Safety Compliance
- ✅ No `git add`
- ✅ No `git commit`
- ✅ No `git push`
- ✅ No tags created
- ✅ Working tree clean before and after (`git status --short` → only `?? docs/CTO_SUMMARY_T067.md`)
- ✅ `git diff --check` exits 0
- ✅ No changes to any forbidden path

## Out-of-Scope Confirmed
- `apps/api/**` — ✅ unchanged
- `apps/web/**` — ✅ unchanged
- `apps/mobile/**` — ✅ unchanged
- `apps/api/prisma/schema.prisma` — ✅ unchanged
- `apps/api/prisma/migrations/**` — ✅ unchanged
- `package.json`, lockfiles — ✅ unchanged
- `docker-compose.yml` — ✅ unchanged
- `.env.example` — ✅ unchanged
- Test files — ✅ unchanged
- Source code — ✅ unchanged

---

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints. `/attendance/clock-in` and `/clock-out` are pre-existing JWT-guarded endpoints. |
| RBAC impact | No changes. |
| Data privacy impact | All 4 runtime audit events confirmed free of raw coordinates, exact distance, free-form notes. Privacy PASS. |
| Password/token/hash impact | None. Admin credentials from sandbox script only; no tokens in summary. |
| Mobile security impact | No code changes. Rejection paths tested and confirmed audit-logged. |
| Dependency/advisory impact | No packages added or changed. |
| Secrets/logging check | No secrets or tokens in logs or this summary. |
| New endpoints protected | No new endpoints. |
| Container rebuild finding | Rebuild resolved the stale-artifact gap. Forensic audit control is now live in the running environment. |
| Risk level | **LOW** |
| Security decision | **PASS** |

---

## Issues Found
| Issue | Severity | Resolution |
|---|---|---|
| Container artifact predated T-065 — no audit events at runtime | Medium | Resolved by user-approved rebuild (`docker compose up -d --build api`) |

---

## Risks / Limitations
1. Cases E and F (web bypass and inside-radius success) not runtime-tested to avoid attendance
   row side effects. Both are covered by T-065 automated tests.
2. `GEOFENCE_NOT_CONFIGURED` rejection reason not runtime-tested (would require PATCH to remove
   coordinates, which is a schema constraint violation when enabled — not safely triggerable).
   Covered by T-065 automated tests.

---

## Final Decision
**PASS** (T-067R)

All 4 required rejection cases:
- Return correct HTTP 422 with unchanged messages ✅
- Emit `ATTENDANCE_GEOFENCE_REJECTED` audit events with correct fields ✅
- Produce privacy-safe metadata (no forbidden fields; all required safe fields present) ✅

Geofence config restored to original state. No attendance records created. No source code changed.

---

## Recommended Commit Message
```
docs(verify): add failed geofence audit runtime verification
```

## Suggested Tag (after CI green)
```
v1.1.51-failed-geofence-audit-runtime-verification
```

## Next Recommended Task
**EPIC CLOSED — Attendance Geofence + Failed Attempt Audit**

Or, if continuing:
**Next Epic Planning — HR Frontend / Mobile / Leave Workflow**
