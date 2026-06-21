# Production Geofence Readiness

> **Applies to:** `v1.1.46-geofence-runtime-verification` and later
> **Full checklist:** `docs/PRODUCTION_GEOFENCE_READINESS.md`
> **Runtime verification:** [[CTO Summary T062]] (T-062 — Geofence Runtime Verification)

---

## What This Is

An operational SOP for enabling the Attendance Geofence safely in a real production environment. The geofence pack is fully implemented and runtime-verified. This note covers the go-live steps, not the implementation.

---

## Production Readiness Checklist (Summary)

### Prerequisites

- [ ] Production API healthy (`GET /health` → ok)
- [ ] HTTPS/TLS in place — GPS data must not travel over plain HTTP
- [ ] SUPER_ADMIN or HR_ADMIN account verified in production
- [ ] Real company coordinates approved by business owner
- [ ] Employee policy communicated
- [ ] Support contact and rollback owner identified

### Admin Configuration Steps

1. Login as HR_ADMIN or SUPER_ADMIN
2. Go to `/attendance/geofence-settings`
3. Confirm source badge: `DB` (config from database) or `ENV` (from env variables)
4. Enter real latitude and longitude (from Google Maps — see section below)
5. Set radius in meters
6. Set max GPS accuracy in meters
7. **Keep enabled = false until real-device test is done**
8. Save and reload page — confirm values persisted
9. Enable only after Go/No-Go sign-off

---

## Getting Company Coordinates

1. Open Google Maps in a browser
2. Navigate to the **office entrance** (not city centre — use the actual building pin)
3. Right-click → **"Copy coordinates"**
4. Google Maps returns: `latitude, longitude` (latitude first)
5. Paste into the admin form

> **Privacy:** Do not put raw coordinates in public docs or screenshots.

---

## Radius and Accuracy Guide

| Parameter | Default | Guidance |
|---|---|---|
| `radiusMeters` | 100 m | Single office: 50–100 m; campus: 100–250 m; poor indoor GPS: widen slightly |
| `maxAccuracyMeters` | 100 m | Start at 100 m; tighten after real-device testing |

---

## Go / No-Go Checklist

| # | Item | Status |
|---|---|---|
| 1 | Production API healthy | ☐ PASS / ☐ FAIL |
| 2 | Web admin reachable | ☐ PASS / ☐ FAIL |
| 3 | HR_ADMIN/SUPER_ADMIN login verified | ☐ PASS / ☐ FAIL |
| 4 | Real company coordinates confirmed | ☐ PASS / ☐ FAIL |
| 5 | Radius approved | ☐ PASS / ☐ FAIL |
| 6 | Max GPS accuracy approved | ☐ PASS / ☐ FAIL |
| 7 | Real-device inside-radius test pass | ☐ PASS / ☐ FAIL |
| 8 | Real-device outside-radius test pass (422) | ☐ PASS / ☐ FAIL |
| 9 | Poor GPS accuracy test pass (422) | ☐ PASS / ☐ FAIL |
| 10 | Permission-denied handled gracefully | ☐ PASS / ☐ FAIL |
| 11 | Audit privacy verified (no raw GPS) | ☐ PASS / ☐ FAIL |
| 12 | Employee communication sent | ☐ PASS / ☐ FAIL |
| 13 | Support process ready | ☐ PASS / ☐ FAIL |
| 14 | Rollback owner identified | ☐ PASS / ☐ FAIL |

All 14 items must be PASS before enabling `enabled: true` in production.

---

## Privacy Note

Employee GPS is used **only for validation** and is never stored:
- No `latitude`, `longitude`, or `accuracy` field in any `ATTENDANCE_CLOCK_IN/OUT` audit metadata
- `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` metadata uses boolean flags only (no raw coordinates)
- See [[ADR-020 Attendance Geofence and Admin Configuration]] for the privacy decision

---

## Rollback / Disable

If issues arise after go-live:

1. Login as SUPER_ADMIN or HR_ADMIN
2. Go to `/attendance/geofence-settings`
3. Uncheck **Enable Geofence** and save
4. Reload to confirm `enabled: false`
5. Record who disabled, when, and why

The DB config row is retained. Web/legacy attendance is not affected.
Do **not** delete the `geofence_config` row manually.

---

## Known Limitations

- **Single office only** — no multi-branch geofence support
- **GPS spoofing not blocked** — no device integrity API (SafetyNet/DeviceCheck)
- **No failed-geofence audit events** — rejected 422 attempts are not logged (T-064 may address this)
- **DB row cannot revert to env source** once created — update via admin panel only

---

## Related Notes

- [[Attendance Geofence]] — full domain knowledge
- [[ADR-020 Attendance Geofence and Admin Configuration]] — architecture decisions
- [[Development Workflow]] — agent/user collaboration rules
- [[Verification Workflow]] — verification gate scripts

## Related Docs

- `docs/PRODUCTION_GEOFENCE_READINESS.md` — full checklist with all sections
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — backend specification
- `docs/CTO_SUMMARY_T062.md` — runtime verification results

#sop #geofence #attendance #production #operations #privacy
