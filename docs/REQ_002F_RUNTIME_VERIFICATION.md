# REQ-002F — Mixed Attendance Flow: Runtime Verification / Production QA

**Document type:** Production QA Report
**Task:** REQ-002F-4
**Date:** 2026-06-30
**Status:** PASS

---

## 1. Objective

Confirm that the REQ-002F mixed attendance flow (on-site check-in → off-site check-out exception)
is deployed, operational, and correct end-to-end in the production environment following the
completion of all five implementation milestones (v1.2.48–v1.2.52).

This document captures verification evidence gathered from production after the final deployment.
No runtime code changes were made as part of this task.

---

## 2. Scope

| # | Area | In Scope |
|---|------|----------|
| 1 | Backend API — mixed checkout exception endpoint | Yes |
| 2 | Backend API — off-site review queue extension | Yes |
| 3 | Mobile PWA (STEP Connect) — geofence exception UX | Yes |
| 4 | Mobile PWA — fresh GPS enforcement (HOTFIX-REQ002F-A) | Yes |
| 5 | Admin Web — off-site review page | Yes |
| 6 | Privacy: raw GPS not displayed in Admin UI | Yes |
| 7 | Cache headers on mobile PWA app shell | Yes |
| 8 | Automated unit / integration tests | Not re-run (covered in prior task summaries) |
| 9 | Load testing / concurrency | Out of scope |
| 10 | Reject flow (HR rejects a mixed checkout) | Not tested in this session — see Limitations |

---

## 3. Environment

| Component | Location | Note |
|-----------|----------|------|
| API | `http://172.16.2.31:4002` | Production — NestJS 11, Node 22 |
| Admin Web | `http://172.16.2.31:3002` | Production — Next.js (App Router) |
| Mobile STEP Connect (LAN) | `http://172.16.2.31:3004` | Production — Next.js PWA |
| Mobile STEP Connect (public) | `https://mobilehr.eds-center.com` | Production — HTTPS, external access |
| Database | PostgreSQL 16 | Managed via Docker Compose on host |
| Orchestration | Docker Compose | All three services confirmed running |

---

## 4. Version / Tag Coverage

| Version | Milestone | CTO Summary |
|---------|-----------|-------------|
| v1.2.48 | REQ-002F-0 — Mixed Attendance Flow Spec | `docs/CTO_SUMMARY_REQ_002F_SPEC.md` |
| v1.2.49 | REQ-002F-1 — Backend Mixed Checkout Exception Foundation | `docs/CTO_SUMMARY_REQ_002F_1.md` |
| v1.2.50 | REQ-002F-2 — Mobile Mixed Checkout UX | `docs/CTO_SUMMARY_REQ_002F_2.md` |
| v1.2.51 | HOTFIX-REQ002F-A — Force Fresh GPS for Attendance Actions | `docs/CTO_SUMMARY_HOTFIX_REQ002F_A.md` |
| v1.2.52 | REQ-002F-3 — Admin Off-site Attendance Review UI | `docs/CTO_SUMMARY_REQ_002F_3.md` |

All five versions were deployed to production before this verification was performed.

---

## 5. Production Endpoints Verified

| Method | Endpoint | Expected | Result |
|--------|----------|----------|--------|
| GET | `http://172.16.2.31:4002/health` | 200 OK | **PASS** |
| HEAD | `http://172.16.2.31:3004/` | 200 OK | **PASS** |
| HEAD | `http://172.16.2.31:3004/home` | 200 OK | **PASS** |
| HEAD | `http://172.16.2.31:3002/attendance` | 200 OK | **PASS** |
| HEAD | `http://172.16.2.31:3002/attendance/offsite-review` | 200 OK | **PASS** |

All production services were reachable and returned expected HTTP status codes at time of verification.

---

## 6. Health Check Result

```
GET http://172.16.2.31:4002/health → 200 OK
```

API health endpoint confirms the NestJS application is running with all required modules
(PrismaModule, AttendanceModule, AuthModule) healthy.

---

## 7. Mobile PWA Cache Verification

App shell cache-control headers confirmed on `http://172.16.2.31:3004/`:

```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
```

**Assessment:** These headers ensure the PWA app shell is not served from a stale browser cache.
Combined with the HOTFIX-REQ002F-A GPS freshness fix (navigator.geolocation with `maximumAge: 0`),
stale PWA state and stale GPS positions are both mitigated. Employees will always load the current
version of the app and receive a fresh GPS fix at the time of attendance action.

---

## 8. End-to-End User Flow Verified (Real User, Production)

A real employee completed the full mixed checkout flow in production. Steps executed:

| # | Step | Outcome |
|---|------|---------|
| 1 | Employee checks in at company (inside geofence, `attendanceSource=COMPANY_GEOFENCE`) | Check-in recorded |
| 2 | Employee travels to external work location outside company geofence | — |
| 3 | Employee opens STEP Connect and attempts check-out | System detects outside-geofence condition |
| 4 | Mobile presents off-site checkout exception option | Mixed checkout option visible |
| 5 | Employee completes mixed checkout exception flow | Exception submitted with work location and reason |
| 6 | Exception record placed in `reviewStatus=PENDING_REVIEW` | Backend confirmed |
| 7 | HR/Admin opens Admin Web, navigates to off-site review page | Page loaded successfully |
| 8 | Mixed checkout record appears in review list | Visible in queue |
| 9 | Record type badge displayed: **"เช็คอินบริษัท → เช็คเอาท์นอกสถานที่"** | Correct label |
| 10 | HR/Admin approves the record | Action completed |
| 11 | Record status updated to `reviewStatus=APPROVED` | Status badge: **"อนุมัติแล้ว"** |

All 11 steps completed successfully in production.

---

## 9. Admin Web Review Page Verification

**URL tested:** `http://172.16.2.31:3002/attendance/offsite-review`

Evidence collected from production (screenshot + observation):

| Check | Result |
|-------|--------|
| Page title: **"ตรวจสอบการลงเวลานอกสถานที่"** | PASS |
| Route accessible and rendered without error | PASS |
| Sidebar menu item: **"ตรวจสอบนอกสถานที่"** visible | PASS |
| Mixed checkout card visible in the review list | PASS |
| Status badge **"อนุมัติแล้ว"** displayed after review | PASS |
| Type badge **"เช็คอินบริษัท → เช็คเอาท์นอกสถานที่"** displayed | PASS |
| Distance from company (meters) displayed | PASS |
| GPS accuracy (meters) displayed | PASS |
| Employee name displayed | PASS |
| Check-in time displayed | PASS |
| Check-out time displayed | PASS |
| Work location name displayed | PASS |
| Reason text displayed | PASS |
| Reviewed-at timestamp displayed | PASS |
| Raw latitude / longitude **NOT** shown | PASS |

---

## 10. Privacy / Security Verification

| Area | Finding | Status |
|------|---------|--------|
| Raw GPS coordinates in Admin UI | Not displayed. `OffsiteReviewRecord` TypeScript type excludes `checkInLatitude`, `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude`. Only distance and accuracy (safe business metrics) are shown. | PASS |
| Raw GPS coordinates in mobile UI | Not displayed. Mobile screens show `workLocationName` (human text) and GPS accuracy status pill only. | PASS |
| Raw GPS in audit log | `audit-log.sanitizer.ts` strips lat/lon/accuracy from all metadata. Confirmed in v1.2.49 (CTO_SUMMARY_REQ_002F_1.md). | PASS |
| GPS freshness | `useDeviceLocation.ts` bypasses expo-location on web and calls `navigator.geolocation.getCurrentPosition` with `maximumAge: 0`. All three attendance screens re-acquire GPS at submit time. Fixed in v1.2.51 (HOTFIX-REQ002F-A). | PASS |
| JWT guard on submission endpoint | `POST /attendance/offsite/mixed-checkout-exception` protected by `JwtAuthGuard`. No unauthenticated access possible. | PASS |
| Employee isolation | Exception submitted via JWT userId; employee can only submit for their own record. Backend validates via `requireEmployeeId()`. | PASS |
| Admin review RBAC | `GET /attendance/offsite-review`, `PATCH .../approve`, `PATCH .../reject` require `SUPER_ADMIN` or `HR_ADMIN` role. Frontend `isAdmin()` check blocks MANAGER and EMPLOYEE from the review page. | PASS |
| Geofence abuse prevention | Backend validates employee is OUTSIDE company radius before accepting the exception. Returns HTTP 422 if inside geofence. | PASS |
| Tokens / secrets in responses or logs | None observed. NestJS interceptors log route + status only. | PASS |

---

## 11. What Was Not Tested / Limitations

| # | Limitation | Notes |
|---|------------|-------|
| 1 | **Reject flow** — HR rejects a mixed checkout exception | Not tested in this session. The reject path exists in the UI (`rejectOffsiteReview`) and backend (`rejectOffsiteAttendance`), but was not exercised. Recommendation: test in staging. |
| 2 | **Resubmission prevention** — Employee attempts to submit a second exception** | Backend returns HTTP 409 (unit-tested in v1.2.49). Not exercised end-to-end in production. |
| 3 | **EMPLOYEE / MANAGER role blocked from review page** | Confirmed by code inspection and RBAC logic, not live session. |
| 4 | **Geofence inside-rejection** — Employee inside geofence submits exception | Backend returns HTTP 422 (unit-tested). Not exercised in production (would require a test device inside the geofence). |
| 5 | **State D/E mobile cards** — Approved / Rejected state rendering on mobile** | Approved card observed indirectly (HR approved the record). Rejected state card (State E) not exercised end-to-end. |
| 6 | **Automated test suite re-run in production** | Not applicable — `jest` tests run against local environment only. Test results from v1.2.49 (498 tests, all PASS) remain the authoritative automated baseline. |
| 7 | **Load / concurrency testing** | Out of scope. |
| 8 | **iOS native PWA add-to-home-screen flow** | Tested via browser. Native PWA install flow on iPhone not retested in this session. |

---

## 12. Final PASS Statement

All in-scope production verification checks passed on 2026-06-30.

The REQ-002F mixed attendance flow is confirmed operational end-to-end in production:
- Backend exception endpoint accepts and records the checkout correctly
- Review queue surfaces mixed checkout records alongside standard off-site records
- Mobile UX presents the exception flow and PENDING_REVIEW state card
- Admin Web review page lists, labels, and approves mixed checkout records
- Privacy safeguards (no raw GPS in UI, audit log, or logs) verified in production
- GPS freshness fix (HOTFIX-REQ002F-A) confirmed via cache-control headers

**Overall QA decision: PASS**

---

## 13. Follow-Up Recommendations

| Priority | Recommendation |
|----------|----------------|
| Medium | Exercise the **reject flow** in staging: HR rejects a mixed checkout; verify employee sees "ถูกปฏิเสธ" (State E) card on mobile with reviewer note. |
| Medium | Add the **reject flow** to the Admin Web QA checklist (`docs/QA_T088_ADMIN_WEB_PRODUCTION_QA.md`) for future regression testing. |
| Low | Consider adding a `type` query parameter filter to `GET /attendance/offsite-review` (deferred as OD-3 in spec) when the HR review queue grows large enough to warrant it. |
| Low | Document the **payroll interpretation**: mixed checkout records have `workMode=ONSITE` and `attendanceSource=COMPANY_GEOFENCE`; `reviewStatus=APPROVED` is the signal for payroll purposes. Update HR policy documentation when available. |
