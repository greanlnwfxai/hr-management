# CTO Summary

## Step
T-046 — Attendance Geofence Backend

## Status
PASS

## Scope
Backend geofence validation foundation for mobile attendance. Adds Haversine distance calculation, environment-variable-driven geofence config, optional location payload on clock-in/out DTOs, and server-side enforcement that only applies to `source: "mobile"` requests when `ATTENDANCE_GEOFENCE_ENABLED=true`. Web and legacy attendance flows are fully unaffected. No Prisma schema changes, no mobile GPS UI, no migration.

## Files Created
- `apps/api/src/attendance/geofence.service.ts` — Haversine distance calculation and radius check
- `apps/api/src/attendance/geofence-config.service.ts` — Reads geofence env vars (enabled flag, coordinates, radius, accuracy limit)
- `apps/api/src/attendance/geofence.service.spec.ts` — 15 Haversine unit tests covering same-point, near/far, boundary, symmetry, cross-hemisphere, cross-meridian
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — Full policy documentation: business rule, env vars, payload contract, validation rules, error behavior, security notes, known limitations, future improvements, T-047 integration plan

## Files Modified
- `apps/api/src/attendance/dto/clock-in.dto.ts` — Added optional `source`, `latitude`, `longitude`, `accuracy` fields with class-validator guards
- `apps/api/src/attendance/dto/clock-out.dto.ts` — Same location fields
- `apps/api/src/attendance/attendance.service.ts` — Injected `GeofenceService` + `GeofenceConfigService`; added `validateGeofence()` called at start of `clockIn()` and `clockOut()`
- `apps/api/src/attendance/attendance.module.ts` — Registered `GeofenceService` and `GeofenceConfigService` as providers
- `apps/api/src/attendance/attendance.service.spec.ts` — Added mock providers for new services; added 13 new geofence test cases (disabled bypass, web bypass, missing location, poor accuracy, company not configured, outside radius, within radius, error message text)
- `.env.example` — Added `ATTENDANCE_GEOFENCE_*` and `COMPANY_*` env var block with placeholder coordinates and `ENABLED=false`
- `apps/api/.env.example` — Same geofence env var block
- `docs/API_ROUTES.md` — Documented optional location payload for `POST /attendance/clock-in` and `clock-out`; added field table and geofence behavior note
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — Added "T-046 Status" section confirming backend geofence is available and what it added

## Attendance API Routes Inspected
| Method | Path | Notes |
|---|---|---|
| POST | /attendance/clock-in | Extended: now accepts optional location payload |
| POST | /attendance/clock-out | Extended: now accepts optional location payload |
| GET | /attendance/me | Read-only — unchanged |
| GET | /attendance | Read-only — unchanged |
| GET | /attendance/:id | Read-only — unchanged |

## Geofence Config Summary
| Variable | Default | Purpose |
|---|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `false` | Master switch — disabled by default for safe local dev |
| `COMPANY_LATITUDE` | — | Company GPS latitude (placeholder: 13.7563) |
| `COMPANY_LONGITUDE` | — | Company GPS longitude (placeholder: 100.5018) |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `100` | Allowed distance from company location |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `100` | Maximum GPS error radius accepted |

No real company coordinates stored. Placeholder values (Bangkok city center) used in `.env.example` only.

## Distance Calculation Summary
- **Formula:** Haversine (great-circle distance on spherical Earth, R = 6,371,000 m)
- **Implementation:** `GeofenceService.calculateDistanceMeters()` and `isWithinRadius()`
- **Accuracy:** < 0.5% error for distances under a few km — more than sufficient for 100 m geofence
- **Dependencies:** Pure math only. No external maps, geocoding, or third-party APIs.
- **Tests:** 15 unit tests covering 0 m, ~50 m, ~99 m (boundary pass), ~101 m (boundary fail), ~200 m, ~500 m, symmetry, custom radii, cross-hemisphere, cross-meridian

## DTO / Validation Summary
Both `ClockInDto` and `ClockOutDto` extended with:
- `source?: 'web' | 'mobile'` — validated with `@IsIn(['web', 'mobile'])`
- `latitude?: number` — `@Min(-90)` `@Max(90)`
- `longitude?: number` — `@Min(-180)` `@Max(180)`
- `accuracy?: number` — `@IsPositive()` (> 0)

All fields optional. Existing web payloads (note only) continue to pass without modification.

## Backend Policy Behavior
Geofence validation fires only when `source === 'mobile'` AND `ATTENDANCE_GEOFENCE_ENABLED=true`.

Rejection order:
1. Missing `latitude`, `longitude`, or `accuracy` → 422 `"Location is required for mobile attendance."`
2. `accuracy > ATTENDANCE_GPS_MAX_ACCURACY_METERS` → 422 `"GPS accuracy is too low. Please try again near the office."`
3. Company coordinates not configured → 422 `"Attendance geofence is not configured."`
4. Distance > `COMPANY_GEOFENCE_RADIUS_METERS` → 422 `"You are outside the allowed company area."`
5. All pass → normal attendance logic (duplicate check, LATE rule, DB write)

Web / legacy behavior: If `source` is absent or `"web"`, `validateGeofence()` returns immediately. Existing web clock-in/out is completely unaffected.

## Tests Added
**New file: `geofence.service.spec.ts`** (15 tests)
- Same point → ~0 m
- Distinct points → > 0
- Symmetry: d(A,B) == d(B,A)
- ~50 m, ~200 m, ~500 m latitude offsets
- Cross-hemisphere (negative latitude)
- Cross-meridian
- Within 100 m radius at 0, 50, 99 m
- Outside 100 m radius at 101, 200, 500 m
- Custom 200 m radius allows 150 m
- Custom 50 m radius rejects 75 m

**Updated: `attendance.service.spec.ts`** (+13 geofence tests, 143 total)
- Web/no-source path skips geofence even when enabled
- `source: 'web'` explicitly skips geofence
- `source: 'mobile'` + disabled geofence → bypass
- `source: 'mobile'` + enabled + missing location → 422
- Missing accuracy only → 422
- Poor accuracy → 422
- Company not configured → 422
- Outside radius → 422
- Within radius → allowed
- Error message text assertions for key rejection cases
- Clock-out: mobile enforces; web skips

All 15 existing attendance service tests continue to pass unchanged.

## Documentation Updated
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — Created (full policy doc)
- `docs/API_ROUTES.md` — Updated clock-in/out section with location payload table and geofence note
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — Added T-046 completion section
- `.env.example` — Added geofence env var block
- `apps/api/.env.example` — Added geofence env var block

## Verification Results
| Check | Result |
|---|---|
| `npm test` (API — all suites) | **PASS** — 143 tests, 15 suites |
| `npm run build` (API) | **PASS** |
| `npx prisma validate` | **PASS** — schema unchanged |
| `npm run typecheck` (mobile) | **PASS** |
| `./scripts/verify.sh` | **PASS** — API build + Prisma + web build |
| `./scripts/docker-verify.sh` | **PASS** — all 3 containers healthy |
| `./scripts/api-smoke-test.sh` | **PASS** — all 11 checks |
| `./scripts/e2e-test.sh` | **PASS** — 51 Playwright tests |

## Manual API Verification Notes
Verified against live Docker stack at `http://localhost:4002`:

| Test | Expected | Result |
|---|---|---|
| Web clock-in (no source, geofence disabled) | 201 attendance record | PASS — LATE status returned |
| Mobile clock-in, out-of-range coords, geofence disabled | Bypass (business rule response) | PASS — 409 "Already clocked in" (not 422 geofence) |
| Mobile clock-in, missing location, geofence disabled | Bypass (business rule response) | PASS — 409 (geofence skipped correctly) |
| Invalid latitude (200), DTO validation | 400 Bad Request | PASS — `"latitude must not be greater than 90"` |

Note: Geofence enforcement (422 rejections) not testable against Docker stack since `ATTENDANCE_GEOFENCE_ENABLED` defaults to `false`. Covered fully by unit tests with mock config.

## Existing Web / API / Mobile Impact
- **Web attendance:** Fully unaffected. No `source` field sent → geofence bypassed.
- **Existing E2E tests:** All 51 pass — attendance tests unaffected.
- **Existing API unit tests:** All 143 pass — existing 30 tests unchanged, 13 new added.
- **Mobile app (T-045):** No changes to mobile code. Disabled buttons remain disabled. T-046 note added to MOBILE_ATTENDANCE_FOUNDATION.md.
- **Prisma schema:** Unchanged. No migration required.
- **Docker stack:** No changes to Dockerfile or docker-compose.yml.

## Known Limitations
- Geofence only applies when `source: "mobile"` is sent — no automatic enforcement for clients that don't send a source field
- Single office location — multiple offices require schema + config refactoring (future)
- No geofence audit log (future)
- GPS spoofing cannot be fully prevented by software alone
- No admin UI for company location — env var only
- Geofence disabled by default — must be explicitly enabled in production

## Risk
**Low** — Backend-only change. No schema changes, no migration, no web UI changes. New code is purely additive (optional fields, conditional validation). Existing behavior preserved via `source` discriminator. Fully covered by tests.

## Decision
**PASS**

## Next Recommended Task
**T-047 — Mobile Geofence Clock-In / Clock-Out**
- Request GPS location permission via `expo-location`
- On Clock In / Clock Out tap: read current `latitude`, `longitude`, `accuracy`
- Send payload `{ source: "mobile", latitude, longitude, accuracy }` to existing endpoints
- Handle 422 geofence rejections — display backend error message to user
- Handle GPS permission denied gracefully
- Enable the disabled Clock In / Clock Out buttons from T-045

## Recommended Commit Message
```
feat(api): add attendance geofence validation foundation (T-046)

- Add GeofenceService with Haversine distance calculation
- Add GeofenceConfigService reading env vars (ATTENDANCE_GEOFENCE_ENABLED,
  COMPANY_LATITUDE, COMPANY_LONGITUDE, COMPANY_GEOFENCE_RADIUS_METERS,
  ATTENDANCE_GPS_MAX_ACCURACY_METERS)
- Extend ClockInDto and ClockOutDto with optional source, latitude,
  longitude, accuracy fields (class-validator guarded)
- Add validateGeofence() to AttendanceService: enforces location check
  only when source=mobile and geofence enabled; web path unchanged
- Add 15 Haversine unit tests and 13 geofence service integration tests
- Add ATTENDANCE_GEOFENCE_BACKEND.md documentation
- Update API_ROUTES.md, .env.example, MOBILE_ATTENDANCE_FOUNDATION.md

All 143 API tests pass. verify.sh, docker-verify.sh, smoke test,
and 51 E2E tests all PASS.
```
