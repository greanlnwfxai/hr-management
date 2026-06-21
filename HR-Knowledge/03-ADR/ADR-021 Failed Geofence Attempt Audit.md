# ADR-021 — Failed Geofence Attempt Audit

**Status:** Accepted
**Date:** 2026-06-21
**Tasks:** T-064, T-065
**Related tags:** `v1.1.48-failed-geofence-audit-spec`, `v1.1.49-failed-geofence-audit-implementation`
**Implementation reference:** `docs/SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md`, `docs/CTO_SUMMARY_T065.md`

---

## Context

The attendance geofence flow already enforced mobile clock-in and clock-out at the backend and returned `422` when a request failed geofence validation. Before T-065, those rejected attempts were not captured in the audit trail, creating a visibility gap for security review and incident analysis.

The implementation needed to preserve current attendance behavior:

- Existing `422` responses must remain unchanged
- No attendance record should be created for rejected attempts
- Web and legacy requests must remain unaffected
- Successful inside-radius mobile attendance must not emit rejection audit events
- Audit writes must remain best-effort and never block the business response

The implementation also needed to follow the privacy rules already established for attendance geofence handling and audit metadata.

## Decision

Use a single audit event, `ATTENDANCE_GEOFENCE_REJECTED`, for both failed mobile clock-in and failed mobile clock-out geofence attempts.

The event is differentiated by `attemptType`:

- `CLOCK_IN`
- `CLOCK_OUT`

The implemented event shape is:

- `action`: `ATTENDANCE_GEOFENCE_REJECTED`
- `targetType`: `ATTENDANCE`
- `targetId`: `null`
- `targetLabel`: `clock-in-geofence-rejected` or `clock-out-geofence-rejected`
- `result`: `REJECTED`

The rejection reasons are categorical only:

- `MISSING_LOCATION`
- `POOR_ACCURACY`
- `GEOFENCE_NOT_CONFIGURED`
- `OUTSIDE_RADIUS`

Allowed metadata fields are limited to:

```ts
{
  attemptType: 'CLOCK_IN' | 'CLOCK_OUT',
  source: 'mobile',
  reason:
    | 'MISSING_LOCATION'
    | 'POOR_ACCURACY'
    | 'GEOFENCE_NOT_CONFIGURED'
    | 'OUTSIDE_RADIUS',
  hasCoordinates: boolean,
  hasAccuracy: boolean,
  accuracyBucket: 'UNKNOWN' | 'ACCEPTABLE' | 'POOR',
  configSource: 'db' | 'env',
  geofenceEnabled: boolean,
  result: 'REJECTED',
}
```

## Privacy Decision

Do not store raw GPS coordinates, raw numeric accuracy, exact distance, company coordinates, or free-form notes in rejected geofence audit metadata.

Specifically excluded:

- raw `latitude`
- raw `longitude`
- raw numeric `accuracy`
- exact `distance`
- `companyLatitude`
- `companyLongitude`
- company coordinate pairs
- free-form mobile `note`
- bearing, offsets, or other derived location fields

The design keeps only categorical rejection reason data, boolean presence flags, and bucketed accuracy (`UNKNOWN`, `ACCEPTABLE`, `POOR`).

As defense in depth, the audit sanitizer denylist also redacts exact-key matches for:

- `latitude`
- `longitude`
- `accuracy`
- `distance`

`accuracyBucket` remains preserved because sanitizer matching is exact-key based rather than prefix based.

## Consequences

Positive consequences:

- Failed mobile geofence attempts are now visible in the audit trail
- Audit records distinguish clock-in versus clock-out without requiring two event names
- Privacy-sensitive location values remain excluded from persistent audit data
- Existing mobile client and API error behavior remain unchanged
- Audit failure cannot block attendance responses because writes remain best-effort

Accepted tradeoffs:

- Rejected attempts do not create an attendance record, so audit logs are the only durable record of those failures
- Best-effort audit writes can still be lost under infrastructure failure
- The event is intentionally limited to mobile geofence rejections and does not represent all attendance validation failures

## Alternatives Considered

### 1. Separate events for clock-in and clock-out rejection

Rejected because it would duplicate the event taxonomy without adding meaningful structure. `attemptType` already provides the needed distinction.

### 2. Store raw coordinates or exact distance for investigation

Rejected because it would violate privacy-by-design expectations for attendance location handling and expand sensitive audit data retention unnecessarily.

### 3. Store free-form rejection note or derived location details

Rejected because unstructured fields increase leakage risk and are not required for operational review.

### 4. Create attendance rows for rejected attempts

Rejected because a rejected attempt is not a successful attendance event and should not pollute the attendance record model.

## Implementation Reference

Implemented in T-065 with:

- event action `ATTENDANCE_GEOFENCE_REJECTED`
- best-effort audit write before each geofence-related `422`
- preserved mobile/API response behavior
- sanitizer denylist expansion for GPS-related exact keys

See:

- `docs/SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md`
- `docs/CTO_SUMMARY_T065.md`
- tag `v1.1.49-failed-geofence-audit-implementation`

## Related Tasks

- T-064 — Specification
- T-065 — Implementation

## Related Notes

- [[ADR-019 Audit Trail and Admin Review]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[Attendance Geofence]]
- [[Audit Log Module]]

#adr #attendance #audit-log #geofence #privacy #mobile #security
