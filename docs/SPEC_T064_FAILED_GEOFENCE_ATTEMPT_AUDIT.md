# Specification: Failed Geofence Attempt Audit

> T-064 — Failed Geofence Attempt Audit Specification
> Status: SPECIFICATION ONLY — no code, schema, migration, route, or UI changes.
> Future implementation task: T-065.

---

## 1. Problem Statement

### What currently happens on rejected mobile geofence attempts

When a mobile employee submits a clock-in or clock-out request and geofence validation fails, the backend returns HTTP 422 with a human-readable message (e.g., `"You are outside the allowed company area."`). No record of this rejection is created anywhere. The request is evaluated, the 422 response is returned, and the event is discarded silently.

### Why lack of audit visibility is a gap

The existing Audit Log system (T-057B-1 through T-057B-7) captures 9 event types covering login, password changes, leave approvals, and successful attendance clock-in/out. Geofence rejections are the only significant attendance-path outcome that generates no audit trail.

Without an audit record:

- HR admins cannot distinguish between employees who forgot to clock in vs. employees whose attempts were rejected by the geofence.
- There is no way to detect repeated rejection patterns (e.g., an employee consistently attempting from outside the allowed area) through the audit log interface.
- An investigation into disputed attendance records has no signal about failed attempts during the day.
- System operators cannot verify in a production incident review whether the geofence is triggering as expected or is misconfigured.

### Why this matters for HR operations and fraud monitoring

A geofence system that silently discards rejections provides no operational feedback. HR admins reviewing attendance discrepancies cannot know whether an employee failed to clock in because they forgot, because their device had poor GPS, or because they were not at the office. The `ATTENDANCE_GEOFENCE_REJECTED` event provides a discrete, queryable signal for each of these cases via the existing `/audit-logs` read API.

Fraud monitoring is a secondary benefit: a pattern of repeated `OUTSIDE_RADIUS` rejections from the same employee, or `MISSING_LOCATION` rejections immediately followed by a successful clock-in with `source=web`, is a signal reviewable by SUPER_ADMIN or HR_ADMIN.

### Why privacy constraints are critical

Employee GPS coordinates are precise physical location data. Storing raw latitude, longitude, exact distance from office, or raw GPS accuracy in the audit table would:

1. Record the employee's physical position in a persistent, queryable append-only log.
2. Expose that position to every SUPER_ADMIN and HR_ADMIN who views audit log detail.
3. Potentially allow triangulation of an employee's position outside working hours if the rejection occurred before or after a shift.
4. Create a data retention liability since audit logs have no cleanup policy today.

The prior decisions in T-060 (geofence config audit) and T-062 (runtime verification) established the principle that no raw GPS coordinates appear in any audit metadata. This specification extends that principle to rejection events.

---

## 2. Goals

1. Record a structured audit event for each rejected mobile geofence clock-in or clock-out attempt.
2. Preserve the existing API behavior exactly: the client continues to receive the same 422 response with the same message.
3. Preserve employee privacy: no raw GPS coordinates, no exact distance, no raw accuracy values stored anywhere.
4. Keep the audit write best-effort: an audit write failure must not convert a 422 into a 500 or suppress the original 422.
5. Avoid creating an attendance record for rejected attempts (current behavior preserved).
6. Keep the implementation small, targeted, and fully covered by unit and integration tests.
7. Use the existing `AuditLogService` and `recordBestEffort` pattern without architectural changes.

---

## 3. Non-Goals

The following are explicitly out of scope for T-064 and T-065:

- **No GPS spoofing detection.** The audit event records that a rejection occurred; it does not attempt to detect whether coordinates were fabricated. Spoofing mitigation requires device integrity APIs (SafetyNet / DeviceCheck), which are a separate initiative.
- **No device integrity integration.** No SafetyNet, Play Integrity, or DeviceCheck signals are collected or stored.
- **No map visualization.** The audit event is a text record; it does not draw a map showing where the employee was.
- **No failed-attempt dashboard.** No new web UI page or analytics view for geofence rejections. Reviewers use the existing `/audit-logs` page with the `action=ATTENDANCE_GEOFENCE_REJECTED` filter.
- **No admin notification system.** No push notification, email, or Slack alert on rejection events.
- **No raw GPS retention.** Raw coordinates, exact distance, and raw accuracy values must never be stored in any form, even if the value would be useful for diagnosis.
- **No multi-office support.** This specification covers a single configured office location. Multi-office support requires schema redesign.
- **No implementation in T-064.** This is a specification document. Code, schema, migrations, DTOs, and tests are T-065 scope.

---

## 4. Proposed Audit Event Design

### 4.1 Event Action

```
ATTENDANCE_GEOFENCE_REJECTED
```

### 4.2 Target Fields

| Field | Value | Notes |
|---|---|---|
| `targetType` | `ATTENDANCE` | Consistent with `ATTENDANCE_CLOCK_IN` / `ATTENDANCE_CLOCK_OUT` events |
| `targetId` | `null` | No attendance record is created for rejected attempts; there is no record to reference |
| `targetLabel` | `clock-in-geofence-rejected` or `clock-out-geofence-rejected` | Human-readable label; differentiates clock-in vs clock-out at a glance in the admin UI |

### 4.3 Actor Fields

| Field | Source |
|---|---|
| `actorUserId` | Employee's `userId` from the JWT payload |
| `actorRole` | Employee's role from the JWT payload |

The actor is always the employee whose clock-in or clock-out was rejected. This makes the audit log filterable by `actorUserId` (to review all rejections for one employee) or by `actorRole` (to review rejections by role group).

### 4.4 Result Value

```
REJECTED
```

`REJECTED` is used (not `FAILURE`) because this is a business-logic outcome — the employee was not in the geofence area — rather than an authentication or system error. This keeps `FAILURE` reserved for auth and system failures.

### 4.5 Metadata Schema

```json
{
  "attemptType": "CLOCK_IN" | "CLOCK_OUT",
  "source": "mobile",
  "reason": "MISSING_LOCATION" | "POOR_ACCURACY" | "GEOFENCE_NOT_CONFIGURED" | "OUTSIDE_RADIUS",
  "hasCoordinates": true | false,
  "hasAccuracy": true | false,
  "accuracyBucket": "UNKNOWN" | "ACCEPTABLE" | "POOR",
  "configSource": "db" | "env",
  "geofenceEnabled": true,
  "result": "REJECTED"
}
```

### 4.6 Metadata Field Definitions

| Field | Type | Description |
|---|---|---|
| `attemptType` | `"CLOCK_IN"` \| `"CLOCK_OUT"` | Whether the rejected attempt was a clock-in or clock-out |
| `source` | `"mobile"` | Always `"mobile"` — geofence rejection events are never emitted for web/legacy requests |
| `reason` | enum string | Which validation rule triggered the rejection (see §4.7) |
| `hasCoordinates` | boolean | Whether the mobile request included latitude and longitude fields |
| `hasAccuracy` | boolean | Whether the mobile request included an accuracy field |
| `accuracyBucket` | `"UNKNOWN"` \| `"ACCEPTABLE"` \| `"POOR"` | Coarse GPS quality signal (see §4.8) |
| `configSource` | `"db"` \| `"env"` | Whether the effective geofence config was read from the DB row or environment variables |
| `geofenceEnabled` | boolean | Whether geofence was enabled in the effective config (always `true` when this event fires) |
| `result` | `"REJECTED"` | Redundant with the top-level `result` field; included for metadata self-containedness |

### 4.7 Reason Codes

| Reason | Trigger Condition | Maps to 422 Message |
|---|---|---|
| `MISSING_LOCATION` | latitude, longitude, or accuracy not present in the request | `"Location is required for mobile attendance."` |
| `POOR_ACCURACY` | `accuracy > maxAccuracyMeters` | `"GPS accuracy is too low. Please try again near the office."` |
| `GEOFENCE_NOT_CONFIGURED` | Geofence enabled but company coordinates missing/invalid in both DB and env | `"Attendance geofence is not configured."` |
| `OUTSIDE_RADIUS` | Distance from company location exceeds `radiusMeters` | `"You are outside the allowed company area."` |

### 4.8 Accuracy Bucket

The raw GPS accuracy value (`accuracy` in meters, e.g. `85`) is not stored. Instead, a coarse bucket classification is derived:

| `accuracyBucket` | Condition |
|---|---|
| `UNKNOWN` | No accuracy value was present in the request (reason: `MISSING_LOCATION`) |
| `POOR` | `accuracy > maxAccuracyMeters` (reason: `POOR_ACCURACY`) |
| `ACCEPTABLE` | `accuracy <= maxAccuracyMeters` (reason: `GEOFENCE_NOT_CONFIGURED` or `OUTSIDE_RADIUS`) |

The `ACCEPTABLE` bucket indicates GPS quality passed the accuracy check but the attempt was rejected for another reason. `POOR` indicates the GPS signal itself was too imprecise to trust. This gives HR admins a useful signal (was the GPS bad, or was the employee simply outside the office?) without recording the raw accuracy number.

### 4.9 Allowed vs Forbidden Metadata Fields

**Allowed:**

- `attemptType` — does not identify location
- `source` — discriminator, not location data
- `reason` — categorical business reason
- `hasCoordinates` — boolean presence flag
- `hasAccuracy` — boolean presence flag
- `accuracyBucket` — coarse categorical signal
- `configSource` — admin-visible config metadata
- `geofenceEnabled` — admin-visible config state
- `result` — outcome label

**Forbidden (must never appear in metadata):**

- `latitude` — raw employee GPS coordinate
- `longitude` — raw employee GPS coordinate
- `accuracy` — raw GPS accuracy number
- `distance` — calculated meters from office (equivalent to coordinate disclosure given known office location)
- `companyLatitude` — company coordinate
- `companyLongitude` — company coordinate
- `note` — free-form mobile field; may contain arbitrary employee text
- Any derived field that allows reverse-calculation of position (e.g., bearing, x/y offset)

### 4.10 Example Events by Rejection Reason

**Case 1 — Missing location fields (CLOCK_IN)**
```json
{
  "action": "ATTENDANCE_GEOFENCE_REJECTED",
  "actorUserId": "7f3c1a2e-...",
  "actorRole": "EMPLOYEE",
  "targetType": "ATTENDANCE",
  "targetId": null,
  "targetLabel": "clock-in-geofence-rejected",
  "result": "REJECTED",
  "metadata": {
    "attemptType": "CLOCK_IN",
    "source": "mobile",
    "reason": "MISSING_LOCATION",
    "hasCoordinates": false,
    "hasAccuracy": false,
    "accuracyBucket": "UNKNOWN",
    "configSource": "db",
    "geofenceEnabled": true,
    "result": "REJECTED"
  }
}
```

**Case 2 — Poor GPS accuracy (CLOCK_IN)**
```json
{
  "action": "ATTENDANCE_GEOFENCE_REJECTED",
  "actorUserId": "7f3c1a2e-...",
  "actorRole": "EMPLOYEE",
  "targetType": "ATTENDANCE",
  "targetId": null,
  "targetLabel": "clock-in-geofence-rejected",
  "result": "REJECTED",
  "metadata": {
    "attemptType": "CLOCK_IN",
    "source": "mobile",
    "reason": "POOR_ACCURACY",
    "hasCoordinates": true,
    "hasAccuracy": true,
    "accuracyBucket": "POOR",
    "configSource": "env",
    "geofenceEnabled": true,
    "result": "REJECTED"
  }
}
```

**Case 3 — Geofence not configured (CLOCK_OUT)**
```json
{
  "action": "ATTENDANCE_GEOFENCE_REJECTED",
  "actorUserId": "7f3c1a2e-...",
  "actorRole": "EMPLOYEE",
  "targetType": "ATTENDANCE",
  "targetId": null,
  "targetLabel": "clock-out-geofence-rejected",
  "result": "REJECTED",
  "metadata": {
    "attemptType": "CLOCK_OUT",
    "source": "mobile",
    "reason": "GEOFENCE_NOT_CONFIGURED",
    "hasCoordinates": true,
    "hasAccuracy": true,
    "accuracyBucket": "ACCEPTABLE",
    "configSource": "env",
    "geofenceEnabled": true,
    "result": "REJECTED"
  }
}
```

**Case 4 — Outside radius (CLOCK_IN)**
```json
{
  "action": "ATTENDANCE_GEOFENCE_REJECTED",
  "actorUserId": "7f3c1a2e-...",
  "actorRole": "EMPLOYEE",
  "targetType": "ATTENDANCE",
  "targetId": null,
  "targetLabel": "clock-in-geofence-rejected",
  "result": "REJECTED",
  "metadata": {
    "attemptType": "CLOCK_IN",
    "source": "mobile",
    "reason": "OUTSIDE_RADIUS",
    "hasCoordinates": true,
    "hasAccuracy": true,
    "accuracyBucket": "ACCEPTABLE",
    "configSource": "db",
    "geofenceEnabled": true,
    "result": "REJECTED"
  }
}
```

**Case 5 — Outside radius (CLOCK_OUT)**
```json
{
  "action": "ATTENDANCE_GEOFENCE_REJECTED",
  "actorUserId": "7f3c1a2e-...",
  "actorRole": "EMPLOYEE",
  "targetType": "ATTENDANCE",
  "targetId": null,
  "targetLabel": "clock-out-geofence-rejected",
  "result": "REJECTED",
  "metadata": {
    "attemptType": "CLOCK_OUT",
    "source": "mobile",
    "reason": "OUTSIDE_RADIUS",
    "hasCoordinates": true,
    "hasAccuracy": true,
    "accuracyBucket": "ACCEPTABLE",
    "configSource": "db",
    "geofenceEnabled": true,
    "result": "REJECTED"
  }
}
```

---

## 5. Privacy Design

### 5.1 Why raw coordinates are forbidden

Raw latitude and longitude uniquely identify a physical position on Earth. Stored in an append-only audit log with no retention policy, they create a persistent record of where an employee was at the time of each rejected clock-in or clock-out attempt. This data could be reviewed by any SUPER_ADMIN or HR_ADMIN, could survive indefinitely, and has no operational justification beyond a timestamp of physical position. The audit event's purpose is to record that a rejection occurred and why — not where the employee was.

### 5.2 Why exact distance is forbidden

Given the office coordinates (which are admin-configurable and known to system operators), storing the exact distance in meters from the office is functionally equivalent to storing the employee's coordinates. Given `distance` and a known bearing convention, the employee's position can be partially triangulated. Even without a bearing, a known `distance` places the employee on a circle around the office. This is sufficient to disclose location context and is therefore forbidden.

### 5.3 Whether exact accuracy is allowed or bucketed

Exact GPS accuracy (e.g., `"accuracy": 87`) is a raw device signal. Stored literally, it reveals the quality of the GPS reading at the moment of the attempt. While less sensitive than coordinates, it is a numeric sensor value that provides marginal diagnostic benefit over a coarse bucket classification.

**Decision: use bucketed accuracy (`UNKNOWN` / `ACCEPTABLE` / `POOR`) — do not store the raw number.**

Justification: The `POOR_ACCURACY` reason code already tells an HR admin that the GPS signal was inadequate. The `ACCEPTABLE` bucket confirms the GPS was usable. Knowing that accuracy was `87 m` vs. `94 m` has no HR operational value and introduces unnecessary detail. The bucket classification is sufficient for the intended use case.

### 5.4 How to safely represent location-related context

The design uses boolean and categorical fields that convey operational meaning without geographic precision:

- `hasCoordinates: false` signals the mobile app did not send location data — possibly a permissions issue or code error.
- `accuracyBucket: "POOR"` signals the GPS hardware was unable to achieve a reliable fix — a device environment issue.
- `reason: "OUTSIDE_RADIUS"` signals the employee's GPS was working and they were located outside the office area — the most HR-significant outcome.

These three signals together give HR admins the information they need to respond appropriately (ask the employee to re-enable GPS permissions, contact IT about device GPS quality, or have a conversation about attendance location) without exposing coordinates.

### 5.5 Alignment with prior AuditLog metadata sanitizer policy

The existing `audit-log.sanitizer.ts` applies a denylist of sensitive key names (password, token, hash, secret, apikey, etc.) and redacts them. GPS coordinates are not on the sanitizer's current denylist because they have not previously appeared in audit metadata — the sanitizer protects against accidentally included secrets.

The approach for `ATTENDANCE_GEOFENCE_REJECTED` is **caller-enforced exclusion**: the code that emits the event is responsible for never including `latitude`, `longitude`, `accuracy`, or `distance` in the metadata object. This is the same pattern used for `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` (T-060) which never includes raw coordinate values despite the config record containing them.

In T-065 implementation, the sanitizer should also add `latitude`, `longitude`, `accuracy`, and `distance` to `AUDIT_SENSITIVE_KEYS` as a defense-in-depth measure. This ensures that even if a future developer accidentally includes these fields in metadata, they will be redacted before the DB insert.

### 5.6 Alignment with T-060 and T-062 privacy decisions

**T-060 (Admin Geofence Config):** The `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` event stores `newHasCoordinates: boolean` and `newRadiusMeters: integer` but never the raw latitude/longitude of the company. This specification uses the same pattern: boolean and integer config signals, no raw coordinate values.

**T-062 (Runtime Verification):** The runtime verification explicitly tested that audit metadata for geofence-related events contains no `latitude`, `longitude`, or `accuracy` values. The `ATTENDANCE_GEOFENCE_REJECTED` event design is consistent with those findings.

---

## 6. Backend Flow Proposal (T-065 Implementation)

> This section describes the intended future implementation. No code changes are made in T-064.

### 6.1 Current state

`apps/api/src/attendance/attendance.service.ts` contains a `validateGeofence()` method that runs when `source === "mobile"` and geofence is enabled. It checks the four failure conditions in sequence and throws an `HttpException` (422) for each. Clock-in and clock-out call this method before proceeding to business logic.

Currently, `validateGeofence()` throws immediately with no side effects.

### 6.2 Proposed T-065 change (described, not implemented)

In T-065, immediately before each `throw` statement in `validateGeofence()`, the implementation should call `auditLogService.recordBestEffort()` with the `ATTENDANCE_GEOFENCE_REJECTED` event.

Pseudocode (illustrative only — not final code):

```
// Before throwing MISSING_LOCATION:
await recordBestEffort({
  action: 'ATTENDANCE_GEOFENCE_REJECTED',
  actorUserId: userId,
  actorRole: userRole,
  targetType: 'ATTENDANCE',
  targetId: null,
  targetLabel: `${attemptType.toLowerCase()}-geofence-rejected`,
  result: 'REJECTED',
  metadata: {
    attemptType,
    source: 'mobile',
    reason: 'MISSING_LOCATION',
    hasCoordinates: false,
    hasAccuracy: false,
    accuracyBucket: 'UNKNOWN',
    configSource: config.source,
    geofenceEnabled: true,
    result: 'REJECTED',
  },
});
throw new HttpException('Location is required for mobile attendance.', 422);
```

The `recordBestEffort` pattern wraps the audit write in a try/catch. If the audit DB write fails for any reason, the catch block discards the error and execution continues to the `throw`. The client receives the same 422 response regardless of whether the audit write succeeded.

### 6.3 Scope constraint: mobile only

The event must only be emitted when `source === "mobile"`. Web and legacy requests that omit `source` bypass `validateGeofence()` entirely and must never generate `ATTENDANCE_GEOFENCE_REJECTED` events. This is naturally enforced because `validateGeofence()` is only called when `source === "mobile"` — no conditional guard is needed inside the audit call itself.

### 6.4 No attendance record for rejected attempts

Current behavior: `validateGeofence()` throws before any attendance record is created. T-065 must not change this. The audit write occurs between the validation failure detection and the throw; no attendance record creation happens on any code path that reaches this audit call.

### 6.5 AuditLogService dependency

`AttendanceModule` must import `AuditLogModule` (or inject `AuditLogService` via module imports) to emit this event. This must be checked for circular dependency issues at T-065 implementation time. The known circular dependency rule is: `AuditLogModule` must not import `AuthModule`. `AttendanceModule` importing `AuditLogModule` does not create this circular path.

---

## 7. Test Plan (for T-065 Implementation)

The following tests must be written in T-065. They are specified here so the implementation can be validated completely.

### 7.1 Unit/integration tests (attendance.service.spec.ts)

| Test | Expected behaviour |
|---|---|
| `source=mobile`, lat/lon/accuracy missing → | returns 422; audit event emitted with `reason: MISSING_LOCATION`, `hasCoordinates: false`, `hasAccuracy: false`, `accuracyBucket: UNKNOWN` |
| `source=mobile`, accuracy > maxAccuracyMeters → | returns 422; audit event emitted with `reason: POOR_ACCURACY`, `hasCoordinates: true`, `hasAccuracy: true`, `accuracyBucket: POOR` |
| `source=mobile`, geofence enabled but no coordinates configured → | returns 422; audit event emitted with `reason: GEOFENCE_NOT_CONFIGURED`, `hasCoordinates: true`, `hasAccuracy: true`, `accuracyBucket: ACCEPTABLE` |
| `source=mobile`, outside radius → | returns 422; audit event emitted with `reason: OUTSIDE_RADIUS`, `hasCoordinates: true`, `hasAccuracy: true`, `accuracyBucket: ACCEPTABLE` |
| Clock-in attempt rejected → | `targetLabel: "clock-in-geofence-rejected"`, `attemptType: "CLOCK_IN"` |
| Clock-out attempt rejected → | `targetLabel: "clock-out-geofence-rejected"`, `attemptType: "CLOCK_OUT"` |
| Audit write throws error → | 422 still returned to caller; no 500 or uncaught exception |
| Metadata inspection → | audit event metadata contains no `latitude`, `longitude`, `accuracy`, or `distance` keys in any test case |
| `source=web` or source omitted → | no `ATTENDANCE_GEOFENCE_REJECTED` event emitted; geofence validation not called |
| `source=mobile`, inside radius → | 200/201 returned; no `ATTENDANCE_GEOFENCE_REJECTED` event emitted |

### 7.2 Sanitizer test

| Test | Expected behaviour |
|---|---|
| `latitude`, `longitude`, `accuracy`, `distance` added to `AUDIT_SENSITIVE_KEYS` | If accidentally passed in metadata, values are replaced with `'[REDACTED]'` before DB insert |

### 7.3 RBAC / read API tests (no change expected)

| Test | Expected behaviour |
|---|---|
| SUPER_ADMIN calls `GET /audit-logs?action=ATTENDANCE_GEOFENCE_REJECTED` | 200, list of events |
| HR_ADMIN calls `GET /audit-logs?action=ATTENDANCE_GEOFENCE_REJECTED` | 200, list of events |
| MANAGER calls `GET /audit-logs?action=ATTENDANCE_GEOFENCE_REJECTED` | 403 |
| EMPLOYEE calls `GET /audit-logs?action=ATTENDANCE_GEOFENCE_REJECTED` | 403 |

---

## 8. Runtime Verification Plan (for T-065 Implementation)

After T-065 is merged and deployed to a sandbox or test environment, verification should proceed as follows. These steps do not apply to T-064.

### Steps

1. Confirm geofence is enabled in the test environment:
   ```
   GET /attendance/geofence-config
   ```
   Response should include `"enabled": true` and valid company coordinates.

2. Attempt a clock-in from a mobile client (or curl with `source: "mobile"`) using coordinates known to be outside the configured radius. Expect `422`.

3. Attempt a clock-in with `source: "mobile"` but omit `latitude` / `longitude` / `accuracy`. Expect `422`.

4. Query the audit log:
   ```
   GET /audit-logs?action=ATTENDANCE_GEOFENCE_REJECTED
   ```
   Confirm the events exist with correct `reason`, `attemptType`, and `actorUserId`.

5. Inspect the metadata of each event in the audit log detail modal. Confirm:
   - No `latitude` key
   - No `longitude` key
   - No `accuracy` key (raw number)
   - No `distance` key
   - `accuracyBucket` present and one of: `UNKNOWN`, `ACCEPTABLE`, `POOR`

6. Perform one clock-in with `source: "mobile"` from inside the radius. Confirm:
   - Attendance record created successfully
   - No `ATTENDANCE_GEOFENCE_REJECTED` event in audit log

7. Perform one clock-in with `source: "web"` (or omit source) from outside the radius. Confirm:
   - Attendance record created successfully (geofence bypassed for web)
   - No `ATTENDANCE_GEOFENCE_REJECTED` event in audit log

8. Confirm that `ATTENDANCE_CLOCK_IN` and `ATTENDANCE_CLOCK_OUT` events continue to be emitted normally for successful requests.

### Safety constraints

- Do not run `docker compose down` or `docker compose down -v` during verification.
- Do not run `./scripts/docker-verify.sh` (it internally invokes docker compose down).
- Do not `PATCH /attendance/geofence-config` in production — only in sandbox/test.
- Restore geofence config to its pre-test state after verification if it was changed.

---

## 9. Risks and Tradeoffs

| Risk | Assessment |
|---|---|
| **Increased audit volume** | Any employee whose clock-in is rejected by geofence generates an audit event. In a large deployment with many employees near the boundary, repeated rejections (e.g., poor indoor GPS) may generate many records. Audit log has no cleanup policy today (known limitation #10). Acceptable risk for now. |
| **Employee sensitivity** | Employees may be uncomfortable knowing that failed location attempts are logged by the employer. The event records that a rejection occurred, not where they were. HR communication about what the audit log records may be warranted. |
| **Limited diagnostic detail** | The privacy design deliberately omits exact location data. This means HR admins cannot precisely determine how far outside the area an employee was. This is intentional; the `reason` field provides sufficient operational signal. |
| **Exact location unavailable by design** | If an employee disputes a rejection, HR admins cannot use the audit log to verify the employee's position claim. This is the correct tradeoff. Position disputes require on-site investigation, not audit log GPS data. |
| **No spoofing protection** | An employee with a GPS spoofing app can generate successful clock-ins while physically outside the office. The `OUTSIDE_RADIUS` rejection event only fires for non-spoofed coordinates that happen to be outside. This is a known limitation (limitation #13) not addressed by this specification. |
| **Repeated attempts from one employee** | A single employee could generate dozens of `ATTENDANCE_GEOFENCE_REJECTED` events in a short window. Rate limiting at the audit write level is not implemented. This is acceptable for the current scale. |

---

## 10. Decision Recommendation

### Recommended action

**Proceed with implementing `ATTENDANCE_GEOFENCE_REJECTED` in T-065.**

### Event design decision

- One event action for both clock-in and clock-out rejections: `ATTENDANCE_GEOFENCE_REJECTED`
- Differentiated by `attemptType: "CLOCK_IN"` or `"CLOCK_OUT"` in metadata and `targetLabel` in the event fields
- Using a single action string (not `ATTENDANCE_CLOCK_IN_GEOFENCE_REJECTED`) keeps audit log filtering simpler and consistent

### Metadata decision

- Safe fields: `attemptType`, `source`, `reason`, `hasCoordinates`, `hasAccuracy`, `accuracyBucket`, `configSource`, `geofenceEnabled`, `result`
- No raw GPS: no `latitude`, `longitude`, `accuracy` (raw number), or `distance`
- No company coordinates: `companyLatitude`, `companyLongitude` must not appear
- No free-form text: `note` must not be included

### Implementation decision

- Best-effort write: audit write wrapped in try/catch; failure does not change the 422 response
- Mobile-only: event emitted only when `source === "mobile"`; web/legacy bypass preserved
- Defense-in-depth: add `latitude`, `longitude`, `accuracy`, `distance` to sanitizer denylist in T-065

### Next task

**T-065 — Failed Geofence Attempt Audit Implementation**

---

## Appendix: Rejection Reason to Metadata Field Mapping

| Rejection Reason | `hasCoordinates` | `hasAccuracy` | `accuracyBucket` |
|---|---|---|---|
| `MISSING_LOCATION` | `false` | `false` | `UNKNOWN` |
| `POOR_ACCURACY` | `true` | `true` | `POOR` |
| `GEOFENCE_NOT_CONFIGURED` | `true` | `true` | `ACCEPTABLE` |
| `OUTSIDE_RADIUS` | `true` | `true` | `ACCEPTABLE` |
