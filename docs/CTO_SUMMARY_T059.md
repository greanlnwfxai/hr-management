# CTO Summary — T-059

## Task
Mobile Attendance Location Enforcement — Enforce backend geofence on clock-in/clock-out so employees can only register attendance when within the configured company location radius.

## Status
**PASS**

## Scope Completed
T-059 is a verification and gap-closure task. The core geofence feature was implemented in prior tasks:
- **T-046** — Backend geofence engine (`geofence.service.ts`, `geofence-config.service.ts`, `validateGeofence()`, updated DTOs, backend tests, `ATTENDANCE_GEOFENCE_BACKEND.md`)
- **T-047** — Mobile wiring (`useDeviceLocation.ts`, `useAttendance.ts`, `attendance.tsx` GPS permission flow, Thai error translation, `MOBILE_GEOFENCE_CLOCK.md`)

T-059 closed two gaps found during audit:
1. **docker-compose.yml** — Geofence env vars were defined in `.env.example` but never passed through to the `api` container. Added 5 passthrough entries (with safe defaults matching T-046 docs).
2. **Clock-out geofence test coverage** — `attendance.service.spec.ts` had tests for "enforces on missing location" and "skips for web" but was missing explicit "allowed when inside radius" and "rejected when outside radius" cases for clock-out. Added both.

## Files Changed

| File | Change |
|---|---|
| `docker-compose.yml` | Added 5 geofence env passthrough entries to `api` service |
| `apps/api/src/attendance/attendance.service.spec.ts` | Added 2 clock-out geofence tests (inside radius → allowed; outside radius → 422) |
| `docs/CTO_SUMMARY_T059.md` | This document (new) |

## Backend Geofence Configuration

| Variable | Default | Description |
|---|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `false` | Master switch — set `true` in production |
| `COMPANY_LATITUDE` | `13.7563` (placeholder) | Company latitude — set real value in production `.env` |
| `COMPANY_LONGITUDE` | `100.5018` (placeholder) | Company longitude — set real value in production `.env` |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `100` | Allowed radius in meters |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `100` | Max GPS accuracy error accepted |

**Note on variable naming:** The task brief listed `ATTENDANCE_COMPANY_LAT/LNG`, `ATTENDANCE_RADIUS_METERS`, `ATTENDANCE_MAX_ACCURACY_METERS`. The existing implementation and `ATTENDANCE_GEOFENCE_BACKEND.md` use different names (above). Per project rules, the existing spec doc takes precedence. Renaming would be a breaking change to production `.env` files.

**Production requirement:** Before enabling in production, set `ATTENDANCE_GEOFENCE_ENABLED=true` and configure real `COMPANY_LATITUDE`/`COMPANY_LONGITUDE` in the server `.env`. These must never be committed to source control.

## Backend Enforcement Behavior

Enforcement runs when `source === "mobile"` AND `ATTENDANCE_GEOFENCE_ENABLED=true`.

Checks (in order):
1. `latitude`, `longitude`, `accuracy` must all be present → 422 "Location is required for mobile attendance."
2. `accuracy ≤ ATTENDANCE_GPS_MAX_ACCURACY_METERS` → 422 "GPS accuracy is too low. Please try again near the office."
3. `COMPANY_LATITUDE`/`COMPANY_LONGITUDE` must be configured → 422 "Attendance geofence is not configured."
4. Haversine distance ≤ `COMPANY_GEOFENCE_RADIUS_METERS` → 422 "You are outside the allowed company area."
5. **Pass** → proceed with normal attendance business rules.

Web and legacy (no `source`) requests skip geofence entirely — existing web behavior is fully preserved.

## Mobile Behavior

- Foreground location permission requested via `expo-location` before each clock-in/out.
- Permission denied → Thai error: "กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ"
- Location read failure → Thai error: "ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาลองใหม่อีกครั้ง"
- Null accuracy fallback: `9999` (backend rejects for poor accuracy — correct behavior)
- Backend 422 errors are translated to Thai user messages by `translateClockError()`
- Buttons disabled while `locating` or `submitting` state (duplicate-submit protection)
- Raw GPS values are never logged or displayed to the user
- Company coordinates are never sent to the mobile app

## Error Handling

| Condition | HTTP | Mobile (Thai) |
|---|---|---|
| Outside company area | 422 | คุณอยู่นอกพื้นที่บริษัทที่อนุญาต |
| GPS accuracy too low | 422 | ความแม่นยำของ GPS ต่ำเกินไป กรุณาลองใหม่ใกล้อาคารสำนักงาน |
| Location fields missing | 422 | ต้องระบุตำแหน่งสำหรับการลงเวลาผ่านมือถือ |
| Geofence not configured | 422 | ระบบตรวจสอบตำแหน่งยังไม่ได้รับการตั้งค่า |
| Invalid lat/lon values | 400 | class-validator DTO rejection |
| Permission denied | OS error | กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ |
| GPS read failure | client | ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาลองใหม่อีกครั้ง |

## Security / Privacy Notes

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints; existing `/attendance/clock-in` and `/attendance/clock-out` already guarded by `JwtAuthGuard` |
| RBAC impact | No changes to role checks |
| Data privacy impact | Raw GPS coordinates not stored, not logged, not returned in any response. AuditLog metadata contains only derived attendance state fields (`attendanceId`, `date`, `status`, etc.). Verified by test: "metadata excludes raw GPS coordinates" |
| Password/token/hash impact | None |
| Mobile security impact | No change to token storage. GPS permission is foreground-only. Company coordinates stored server-side only |
| Dependency/advisory impact | No new packages added. All existing HIGH advisories are accepted risk (documented in `.security-accepted-risks` and `SECURITY_REVIEW_LOG.md`) |
| Secrets/logging check | No `console.log`/`console.debug` of GPS, tokens, or coordinates in any changed file |
| New endpoints protected | None new |
| Risk level | **LOW** |
| Security decision | **PASS** |

## Tests Added or Updated

**Added (attendance.service.spec.ts):**
- `allows clock-out when source is "mobile", geofence enabled, and user is within radius` — confirms `isWithinRadius` called and record returned
- `throws 422 on clock-out when source is "mobile", geofence enabled, and user is outside radius` — confirms `UnprocessableEntityException`

**Pre-existing (unchanged):**

*geofence.service.spec.ts (18 tests):*
- Haversine `calculateDistanceMeters`: identical coords → 0, positive value, symmetric, ~50/200/500 m accuracy, across hemispheres/prime meridian
- `isWithinRadius`: 0 m → true, 50 m → true, 99 m → true, 101 m → false, 200 m → false, 500 m → false, custom radii

*attendance.service.spec.ts (geofence section, pre-existing):*
- clockIn: skips geofence for web/no-source, skips when disabled, rejects missing location, rejects missing accuracy, rejects poor accuracy, rejects unconfigured company, rejects outside radius, allows inside radius
- audit metadata: excludes raw lat/lon/accuracy/note for both clockIn and clockOut

## Verification Results

```
=== git diff --stat ===
 apps/api/src/attendance/attendance.service.spec.ts | 41 ++++++++++++++++++++++-
 docker-compose.yml                                 |  5 +++
 2 files changed, 45 insertions(+), 1 deletion(-)

=== API tests ===
Tests: 312 passed, 312 total
Time: 7.9s

=== API build ===
PASS (nest build — no errors)

=== Web build ===
PASS (Next.js 16.2.7 — all routes static/dynamic, no errors)

=== Mobile typecheck ===
PASS (tsc --noEmit — no errors)

=== project verify (./scripts/verify.sh) ===
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED

=== secret scan ===
[PASS] No committed .env files found
[PASS] No PEM private key blocks found
[PASS] Secret scan completed — no findings

=== security review ===
[PASS] SECURITY REVIEW PASSED — automated checks clear
```

## Docker Safety Compliance

- `./scripts/docker-verify.sh` — NOT run (per task restriction)
- `docker compose down` — NOT run
- `docker compose down -v` — NOT run
- No volumes removed or pruned
- No containers stopped or reset
- Only non-destructive change: added 5 env passthrough lines to `docker-compose.yml`

## Out-of-Scope Confirmed

- No Google Maps SDK or map UI added — "Google Maps pin" means a lat/lon coordinate in config
- No geofence audit log of rejection events (planned future task)
- No mobile test additions beyond what existing pattern supports (typecheck covers it)
- No derived metadata added to AuditLog (optional feature, avoided to stay in scope)
- No failed-attempt audit events (task explicitly prohibits broadening audit scope)
- No admin UI for company location
- No multiple office support

## Risks / Limitations

- GPS spoofing is not preventable by software alone. This geofence deters casual/accidental misuse; it does not guarantee device integrity against deliberate mock-location tools.
- Accuracy rejection threshold (100 m by default) may cause false rejections in poor indoor GPS environments near the boundary.
- Single office location only. Multi-branch requires schema changes.
- Production requires real `COMPANY_LATITUDE`/`COMPANY_LONGITUDE` in server `.env` before `ATTENDANCE_GEOFENCE_ENABLED=true` is set.

## Recommended Commit Message

```
feat(attendance): enforce mobile geofence clock events

- Pass geofence env vars through docker-compose api service
- Add clock-out inside/outside radius tests to fill spec gaps

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Next Recommended Task

T-060 — Admin UI for company geofence configuration (allow HR admin to set company lat/lon/radius in the web app without requiring env var changes and container rebuilds).
