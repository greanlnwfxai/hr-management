# Mixed Checkout Exception — Production Verification SOP

> Task: REQ-002F-4 · Date: 2026-06-30 · Status: **PASS**
> Full QA report: `docs/REQ_002F_RUNTIME_VERIFICATION.md`

---

## What Was Verified

The complete REQ-002F mixed attendance flow (ONSITE check-in → off-site check-out exception) was verified end-to-end in production on 2026-06-30 covering versions v1.2.48–v1.2.52.

All five implementation milestones were deployed before verification:

| Version | Milestone |
|---------|-----------|
| v1.2.48 | REQ-002F-0 — Spec |
| v1.2.49 | REQ-002F-1 — Backend endpoint |
| v1.2.50 | REQ-002F-2 — Mobile UX |
| v1.2.51 | HOTFIX-REQ002F-A — Fresh GPS |
| v1.2.52 | REQ-002F-3 — Admin Web review page |

---

## Key Results (Summary)

| Check | Result |
|-------|--------|
| All 5 production endpoints reachable | PASS |
| Mobile PWA cache-control: `no-store, no-cache, must-revalidate` | PASS |
| Real user completed E2E flow (check-in → exception → HR approve) | PASS |
| Admin Web type badge "เช็คอินบริษัท → เช็คเอาท์นอกสถานที่" | PASS |
| Status badge "อนุมัติแล้ว" after approve | PASS |
| Raw GPS coordinates absent from Admin UI | PASS |
| Raw GPS absent from audit log | PASS |
| JWT guard on exception endpoint | PASS |
| RBAC on review endpoints (SUPER_ADMIN/HR_ADMIN only) | PASS |

---

## Limitations Carried Forward

- **Reject flow (State E mobile card)** not exercised end-to-end in production.
- **Resubmission prevention** (HTTP 409) unit-tested only.
- **Load/concurrency testing** out of scope.

---

## Full Evidence

See `docs/REQ_002F_RUNTIME_VERIFICATION.md` for the complete 13-section QA report including environment details, endpoint verification table, E2E step log, Admin Web checklist, privacy/security table, and limitations.

---

## Related Notes

- [[Mixed Checkout Exception]]
- [[Attendance Geofence]]
- [[ADR-027 Mixed Attendance Checkout Exception Workflow]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[Mobile PWA Production Verification]]

#sop #qa #attendance #mixed-checkout #v1-2-52
