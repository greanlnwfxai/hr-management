# Production Geofence Readiness Checklist

## A. Purpose

This checklist guides HR/IT operators through the steps required to safely enable the Attendance Geofence feature in a real production environment.

**When to use:** Before enabling `ATTENDANCE_GEOFENCE_ENABLED=true` or setting `enabled: true` in the admin panel for the first time on a production or staging deployment.

**Applies to:** `v1.1.46-geofence-runtime-verification` and later.

**Not required for:** Local development, sandbox testing, or CI environments where `ATTENDANCE_GEOFENCE_ENABLED=false`.

---

## B. Current Implementation Summary

| Component | Description |
|---|---|
| **Backend enforcement** | `POST /attendance/clock-in` and `POST /attendance/clock-out` enforce geofence when `source === "mobile"`. Backend is the sole allow/deny authority. |
| **Admin DB-backed config** | Singleton row in `geofence_config` table (id = `"default"`). DB takes precedence over env vars. |
| **Admin Web UI** | `/attendance/geofence-settings` — SUPER_ADMIN and HR_ADMIN only. |
| **API endpoints** | `GET /attendance/geofence-config` and `PATCH /attendance/geofence-config` (SUPER_ADMIN, HR_ADMIN only). |
| **RBAC** | EMPLOYEE and MANAGER are blocked with 403. Unauthenticated requests return 401. |
| **Audit privacy** | `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` metadata contains only boolean flags and integer values — **no raw coordinates, no employee GPS data**. |
| **Web/legacy bypass** | Clock-in/out without `source: "mobile"` skips geofence entirely. Existing web admin behavior is unaffected. |
| **Validation errors** | 422 returned for: missing GPS fields, poor accuracy (>maxAccuracyMeters), outside radius, missing config. |

---

## C. Production Prerequisites

Complete all prerequisites before touching the admin config:

- [ ] **Production API is reachable** — `GET /health` returns `{"status":"ok"}`.
- [ ] **Web admin is reachable** — `https://<your-domain>/attendance/geofence-settings` loads without error.
- [ ] **HTTPS/TLS in place** — All API and web traffic uses HTTPS. GPS data must not travel over plain HTTP.
- [ ] **Auth accounts ready** — At least one SUPER_ADMIN or HR_ADMIN account exists and is verified.
- [ ] **HR_ADMIN/SUPER_ADMIN login confirmed** — Log in and confirm access to the geofence settings page.
- [ ] **Company location approved** — Business owner or facility manager has confirmed the exact company address and entrance location.
- [ ] **Policy communicated** — Employees have been informed that mobile attendance will require them to be physically present at the office.
- [ ] **Support contact identified** — A designated person or team is ready to handle employee reports of geofence rejection at go-live.
- [ ] **Rollback owner identified** — A named person knows how to disable geofence from the admin panel if needed.

---

## D. Company Coordinates SOP

### How to Get Accurate Coordinates

1. Open **Google Maps** in a browser (maps.google.com).
2. Navigate to the company's **office entrance** or **front-office location** — not the city centre, not an approximate address.
3. Right-click the exact pin point on the map.
4. Select **"Copy coordinates"** from the context menu.
5. Google Maps copies in the format: `latitude, longitude` (e.g. `13.756331, 100.501765`).

### Coordinate Validation Rules

| Rule | Check |
|---|---|
| Latitude | Must be between −90 and 90. |
| Longitude | Must be between −180 and 180. |
| Order | Always **latitude first, longitude second**. Do not swap. |
| Precision | Use at least 4 decimal places for adequate precision (±10 m). |
| Source | Use the actual building pin, not an approximate city point or postal address centroid. |

### What to Avoid

- **Do not use placeholder coordinates** (e.g. `13.7563, 100.5018` used in sandbox testing) — these refer to a public area in Bangkok, not your office.
- **Do not publish raw coordinates in public documents, screenshots, or source code comments** — company location is sensitive operational data.
- **Do not use coordinates that include nearby streets, car parks, or neighboring buildings** — use the entrance/reception pin.

---

## E. Radius Selection Guide

The `radiusMeters` value defines the allowed distance from the company pin. The recommended approach is to start conservatively and adjust after real-device testing.

| Scenario | Recommended Radius |
|---|---|
| Dense office building, stable outdoor GPS | 50–100 m |
| Mid-size office with parking (employees clock in from car park) | 100–150 m |
| Large campus or warehouse | 150–250 m |
| Building with poor indoor GPS | 100–200 m (widen to reduce false rejections) |

**Practical guidance:**

- **Default (100 m)** is appropriate for most single-office setups with clear outdoor access.
- **Too small (< 50 m):** GPS drift and indoor accuracy degradation can cause valid employees to be rejected.
- **Too large (> 300 m):** Includes surrounding streets and neighboring buildings; weakens attendance integrity.
- **HR/product owner must approve the final radius** before enabling in production.

---

## F. Max GPS Accuracy Guide

The `maxAccuracyMeters` value is the maximum acceptable GPS error radius reported by the device. If the device reports worse accuracy, the clock-in/out is rejected with:

> "GPS accuracy is too low. Please try again near the office."

| Setting | Effect |
|---|---|
| Lower value (e.g. 30 m) | Stricter — rejects more requests, higher confidence in location. Risk: more false rejections, especially indoors or in overcast conditions. |
| Higher value (e.g. 200 m) | More tolerant — allows poorer GPS signals through. Risk: weaker location confidence. |
| **100 m (default)** | Balanced starting point; suitable for most environments. |

**Recommended workflow:**

1. Start with **100 m** at go-live.
2. Monitor employee rejection rates for 2–4 weeks.
3. Adjust based on real-device behaviour:
   - If false rejections are high → increase to 150 m.
   - If accuracy is reliable → consider tightening to 50–75 m.

---

## G. Admin Configuration Steps

Perform these steps as SUPER_ADMIN or HR_ADMIN **before** go-live:

1. Log in to the web admin at `https://<your-domain>/login`.
2. Navigate to **Attendance → Geofence Settings** (or visit `/attendance/geofence-settings` directly).
3. Check the **source badge** at the top of the form:
   - `DB` = a database row exists (takes precedence over env).
   - `ENV` = no DB row; config is read from environment variables.
4. Enter the real company **Latitude** (copied from Google Maps).
5. Enter the real company **Longitude** (copied from Google Maps).
6. Set **Radius (meters)** according to section E.
7. Set **Max GPS Accuracy (meters)** according to section F.
8. **Leave "Enable Geofence" unchecked** at this stage.
9. Click **Save**.
10. **Reload the page** and confirm the values persist and the source badge shows `DB`.
11. Share the saved coordinates with the business owner for confirmation.
12. Proceed to real-device testing (section H) before enabling.

**Enable geofence only after:**
- Real-device testing is complete and passing.
- Go/No-Go checklist is signed off (section L).
- Go-live approval is received.

To enable, return to `/attendance/geofence-settings`, check **Enable Geofence**, and save.

---

## H. Real-Device Testing Plan

Run these tests after saving the production coordinates but **before** setting `enabled=true`.

> The geofence is bypassed when `enabled=false`, so tests that require rejection must be run with `enabled=true` on a staging environment first, then repeated on production after go-live approval.

### Test Matrix

| # | Test Case | Device | Expected Result |
|---|---|---|---|
| 1 | Employee physically inside office, good GPS signal | iOS | Clock-in succeeds, status correct |
| 2 | Employee physically inside office, good GPS signal | Android | Clock-in succeeds, status correct |
| 3 | Employee just outside radius (e.g. across the street) | iOS | 422 "You are outside the allowed company area." |
| 4 | Employee just outside radius | Android | 422 "You are outside the allowed company area." |
| 5 | Employee inside office, GPS accuracy reported > maxAccuracyMeters | Any | 422 "GPS accuracy is too low." |
| 6 | Employee denies GPS permission on device | iOS | App shows location permission error before sending request |
| 7 | Employee denies GPS permission on device | Android | App shows location permission error before sending request |
| 8 | Employee inside office, airplane mode | Any | Network error (not a 422) |
| 9 | Mobile clock-out inside radius | Any | 201 success |
| 10 | Mobile clock-out outside radius | Any | 422 "You are outside the allowed company area." |
| 11 | Web/legacy clock-in (no GPS) | Web browser | 201 success (geofence not triggered) |
| 12 | Audit log check after tests | Admin browser | `ATTENDANCE_CLOCK_IN/OUT` metadata has no raw GPS; `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` has no raw coordinates |

### Error Message Verification

Confirm the mobile app displays user-friendly messages matching the backend 422 response, not raw error objects.

### Audit Privacy Verification

After testing, query `GET /audit-logs` as SUPER_ADMIN and confirm:
- No `latitude`, `longitude`, `accuracy`, or raw GPS fields appear in any `ATTENDANCE_CLOCK_IN` or `ATTENDANCE_CLOCK_OUT` metadata entry.
- `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` metadata contains only `newEnabled`, `newHasCoordinates`, `newRadiusMeters`, `newMaxAccuracyMeters`, and their `previous*` equivalents.

---

## I. Rollout Plan

| Phase | Steps |
|---|---|
| **Phase 0 — Staging test** | Enable geofence on staging/QA environment. Run full test matrix (section H). Fix any issues before touching production. |
| **Phase 1 — Pilot** | Enable on production for a small pilot group (HR staff, test accounts). Run test matrix. Monitor for 3–5 business days. |
| **Phase 2 — Limited rollout** | Expand to one team or department. Collect feedback. Confirm no spike in support issues or failed attendance. |
| **Phase 3 — Full rollout** | Enable for all employees. Record go-live date and approver. |

### Monitoring Signals

- Watch for a spike in `422` responses on `/attendance/clock-in` and `/attendance/clock-out` — may indicate radius/accuracy misconfiguration.
- Watch for employee support tickets describing legitimate rejections (e.g. "I was at the office but got rejected").
- Check `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` audit events to confirm no unauthorized config changes.

---

## J. Rollback / Disable Plan

If geofence causes issues after go-live:

1. Log in as SUPER_ADMIN or HR_ADMIN.
2. Navigate to `/attendance/geofence-settings`.
3. Uncheck **Enable Geofence**.
4. Click **Save**.
5. Reload the page to confirm `enabled: false`.
6. Web/legacy attendance is not affected by disabling (it was never subject to geofence).
7. The `geofence_config` DB row is retained (not deleted) — it can be re-enabled at any time.
8. **Record who disabled it, when, and why** in the production decision record (section N).
9. A `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` audit event is automatically generated when config is saved.

**Do not delete the `geofence_config` row manually.** The system has no supported API for deletion; manual DB row deletion may cause unexpected env-fallback behavior and is not an approved operation.

---

## K. Audit / Privacy Checklist

Run this checklist after any config update or geofence-related test in production:

- [ ] `GET /audit-logs` (as SUPER_ADMIN) shows a `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` event after config update.
- [ ] `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` metadata contains only: `newEnabled`, `newHasCoordinates`, `newRadiusMeters`, `newMaxAccuracyMeters`, `previousEnabled`, `previousHasCoordinates`, `previousRadiusMeters`, `previousMaxAccuracyMeters`, `previousSource`.
- [ ] No `latitude`, `longitude`, `accuracy`, or raw GPS values appear in any audit log metadata.
- [ ] `ATTENDANCE_CLOCK_IN` and `ATTENDANCE_CLOCK_OUT` metadata does not contain any GPS fields.
- [ ] Employee-facing documentation does not expose admin-only coordinates.
- [ ] Company coordinates are not included in screenshots shared externally.
- [ ] Audit log access is limited to SUPER_ADMIN and HR_ADMIN (EMPLOYEE/MANAGER return 403).

---

## L. Go / No-Go Checklist

Complete this table before enabling geofence in production. All items must be PASS before proceeding.

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Production API healthy (`GET /health` returns ok) | ☐ PASS / ☐ FAIL | | |
| 2 | Web admin reachable and geofence settings page loads | ☐ PASS / ☐ FAIL | | |
| 3 | HR_ADMIN or SUPER_ADMIN login verified | ☐ PASS / ☐ FAIL | | |
| 4 | Real company coordinates confirmed by business owner | ☐ PASS / ☐ FAIL | | Lat/Lng on file |
| 5 | Radius value approved by HR/product owner | ☐ PASS / ☐ FAIL | | Value: ___ m |
| 6 | Max GPS accuracy value approved | ☐ PASS / ☐ FAIL | | Value: ___ m |
| 7 | Real-device inside-radius test passed | ☐ PASS / ☐ FAIL | | iOS / Android |
| 8 | Real-device outside-radius test passed | ☐ PASS / ☐ FAIL | | Returns 422 |
| 9 | Poor GPS accuracy test passed | ☐ PASS / ☐ FAIL | | Returns 422 |
| 10 | Permission-denied on device handled gracefully | ☐ PASS / ☐ FAIL | | App-level message |
| 11 | Audit privacy verified (no raw GPS in audit logs) | ☐ PASS / ☐ FAIL | | |
| 12 | Employee communication sent | ☐ PASS / ☐ FAIL | | Date sent: |
| 13 | Support process ready (who to contact if rejected) | ☐ PASS / ☐ FAIL | | Contact: |
| 14 | Rollback owner identified and briefed | ☐ PASS / ☐ FAIL | | Owner: |

**Decision:** All 14 items PASS required before enabling `enabled: true` in production.

---

## M. Known Limitations

| # | Limitation | Mitigation / Status |
|---|---|---|
| 1 | **Single-office only** — one global geofence config applies to all employees | Multi-office requires schema redesign; deferred. Use policy controls for multi-site employees. |
| 2 | **GPS spoofing not blocked** — a modified app can send fake coordinates | Device integrity APIs (SafetyNet/Android, DeviceCheck/iOS) are not implemented. Backend-only enforcement remains the standard. |
| 3 | **Indoor GPS may be inaccurate** — some buildings attenuate GPS signal | Increase `maxAccuracyMeters` (e.g. 150–200 m) if indoor false rejections are common. |
| 4 | **DB row cannot revert to env source** — once a `geofence_config` row exists, env fallback is bypassed | No delete API exists. Row is retained permanently. Operators must update via the admin panel. |
| 5 | **No failed-geofence audit events** — rejected clock-in/out attempts (422) do not generate audit log entries | This is a known gap. A future task (T-064) may add `ATTENDANCE_GEOFENCE_REJECTED` events for monitoring. |
| 6 | **Elevation not considered** — Haversine formula uses 2D surface distance | Not significant for single-floor offices; could matter for high-rise buildings with multiple companies. |
| 7 | **No MANAGER-excluded geofence** — MANAGER role is subject to the same geofence rules as EMPLOYEE when using mobile | No role exception implemented. Managers must clock in from the same physical location. |

---

## N. Production Decision Record

Fill in and retain this record after each go-live decision:

```
Date:
Decision (ENABLE / DISABLE / HOLD):
Approved by (name + role):
Coordinates source (e.g. "Google Maps pin, main entrance"):
Coordinates on file: (do not write here — store in secure config only)
Radius (meters):
Max GPS accuracy (meters):
Staging test result:
Pilot result:
Final go-live decision:
Rollback owner (name):
Notes:
```

---

## Related Documents

- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — Full backend specification
- `docs/adr/ADR-020-attendance-geofence-and-admin-configuration.md` — Architecture decision record
- `docs/CTO_SUMMARY_T059.md` — T-059 gap-closure summary
- `docs/CTO_SUMMARY_T060.md` — T-060 admin config summary
- `docs/CTO_SUMMARY_T062.md` — T-062 runtime verification summary
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Geofence.md` — Domain knowledge note
- `HR-Knowledge/08-SOP/Production Geofence Readiness.md` — Operational SOP (this document's HR-Knowledge counterpart)
