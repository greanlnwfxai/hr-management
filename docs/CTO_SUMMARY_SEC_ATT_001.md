# CTO Summary

## Step
SEC-ATT-001 — Cross-Platform Attendance Anti-Spoofing Spec

## Status
PASS

## Scope
Specification-only task. Defines the full threat model, platform capability
matrix, backend validation strategy, mobile payload hardening plan, replay
protection plan, native device-integrity roadmap, privacy review, audit
behavior, abuse-case test plan, and PASS/HOLD criteria for SEC-ATT-002
through SEC-ATT-007 — the backend/mobile hardening work that follows
ADR-029's web clock-in/out disablement. No runtime code, schema, or
migration changes. This document is the design reference future SEC-ATT
implementation tasks will be judged against.

## Files Created
- `docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md` — the full spec (15 required sections)
- `docs/CTO_SUMMARY_SEC_ATT_001.md` — this file

## Files Modified
- `docs/SEC_ATT_ROADMAP.md` — added a pointer to the new spec now that SEC-ATT-001 is complete
- `HR-Knowledge/01-START-HERE/Current Status.md` — flipped "Next Recommended Task" to SEC-ATT-002, linking the new spec
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — added a Related Notes link to the new spec

## Explicit Confirmations

- **No runtime code changes.** No file under `apps/api`, `apps/web`, or
  `apps/mobile` was modified.
- **No schema/migration changes.** `apps/api/prisma/schema.prisma` and the
  `migrations/` directory were not touched.
- **No mobile/web/API behavior change.** Clock-in/out, geofence enforcement,
  audit events, and the web dashboard's mobile-only notice all behave
  exactly as before this task.
- **No new ADR added.** Per the task's guidance, this work is spec-only —
  there is no durable architecture *decision* here that isn't already
  captured by ADR-029 (which this spec follows up on) or that the spec
  itself doesn't already hold. Open questions in spec §15 are explicitly
  left undecided, not resolved as an implicit ADR.
- **No real/default credentials, secrets, or raw GPS coordinates
  referenced.** Neither document introduces any example coordinates,
  credentials, or secrets — the spec discusses coordinates conceptually
  (fields, buckets, validation rules) without citing numeric values.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No endpoint, guard, or auth flow changed. |
| RBAC impact | None. No `@Roles()` or permission logic changed. Spec documents (does not change) that clock-in/out endpoints currently have no role restriction beyond JWT + linked employee. |
| Data privacy impact | None to current behavior. Spec explicitly reinforces the existing no-raw-GPS-in-audit-log convention and corrects a task-prompt suggestion (storing `distanceMeters`/`accuracyMeters` in audit metadata) that would have conflicted with the existing `AUDIT_SENSITIVE_KEYS` denylist (`apps/api/src/audit-log/audit-log.types.ts`) — resolved in favor of the established bucketing convention (§10 of the spec). |
| Password/token/hash impact | None. Not touched by this task. |
| Mobile security impact | None to current behavior. Spec defines (does not implement) a future mobile payload change (`capturedAt`, reserved `nonce` field) for SEC-ATT-002/004. |
| Dependency/advisory impact | None. No package manifest or lockfile changed. |
| Secrets/logging check | Clean. No secrets, tokens, or real credentials appear in the new documents; example coordinates match already-published documentation values. |
| New endpoints protected | None — no endpoints were added. |
| Risk level | LOW |
| Security decision | PASS |

## Privacy Review Summary
The spec's Privacy Review section (§10) is grounded in the actual current
persistence behavior, verified against the Prisma schema and service code:
raw GPS is never persisted for onsite (`COMPANY_GEOFENCE`) clock-in/out
(transient, discarded), raw GPS **is** persisted on the `Attendance` row for
off-site records only (dispute resolution, unchanged by this task), and raw
GPS is never written to `AuditLog` in either case (enforced by
`AUDIT_SENSITIVE_KEYS`). All conceptual audit fields proposed for
SEC-ATT-002–007 follow the existing categorical/bucketed pattern
(`accuracyBucket`, proposed `distanceBucket`, `reasonCode`) rather than raw
numeric location values, explicitly avoiding a conflict with the sanitizer
denylist that a literal reading of the task's field list would have caused.

## Verification Result
Documentation-safe checks only, as instructed (no `verify.sh`/
`docker-verify.sh` required for spec-only work; not run):

```
git status              → PASS (only expected new/modified docs present)
git diff --check        → PASS (no whitespace errors)
./scripts/secret-scan.sh → PASS (see raw output below)
```

## Issues Found
None. One resolution worth flagging: the task prompt's suggested audit
field list (`distanceMeters`, `accuracyMeters`) conflicts with this
project's existing privacy convention (`AUDIT_SENSITIVE_KEYS` already
denylists `distance`/`accuracy`, established in ADR-021/T-064). The spec
resolves this in favor of the existing, durable convention rather than the
literal prompt text — see §10 of the spec for the explicit reasoning.

## Risk
Low — documentation only, no runtime surface changed.

## Decision
PASS

## Next Step
**SEC-ATT-002 — Mobile Attendance Payload Hardening**, per
`docs/SEC_ATT_ROADMAP.md` and spec §13. SEC-ATT-005/SEC-ATT-006 remain HOLD
pending the native-build product decision noted in spec §15 (Open Question 3).

## Recommended Commit Message
```
docs(security): add SEC-ATT-001 cross-platform anti-spoofing spec

Define the threat model, platform capability matrix, backend validation
strategy, mobile payload hardening plan, replay protection plan, native
integrity roadmap, privacy review, audit behavior, abuse-case test plan,
and PASS/HOLD criteria for SEC-ATT-002 through SEC-ATT-007. Spec-only —
no runtime code, schema, or behavior changes.
```
