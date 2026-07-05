// Runtime-safe enum definitions for DTO validation.
// These mirror the Prisma schema enums but are guaranteed to be defined at
// module-load time regardless of whether `prisma generate` has run.

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  HR_ADMIN    = 'HR_ADMIN',
  MANAGER     = 'MANAGER',
  EMPLOYEE    = 'EMPLOYEE',
}

export enum EmployeeStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  RESIGNED = 'RESIGNED',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  LATE    = 'LATE',
  ABSENT  = 'ABSENT',
}

export enum LeaveType {
  SICK     = 'SICK',
  VACATION = 'VACATION',
  PERSONAL = 'PERSONAL',
  OTHER    = 'OTHER',
}

export enum LeaveStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum OffSiteStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum WorkMode {
  ONSITE  = 'ONSITE',
  OFFSITE = 'OFFSITE',
}

export enum AttendanceSource {
  COMPANY_GEOFENCE   = 'COMPANY_GEOFENCE',
  OFFSITE_PLANNED    = 'OFFSITE_PLANNED',
  OFFSITE_UNPLANNED  = 'OFFSITE_UNPLANNED',
}

export enum AttendanceReviewStatus {
  AUTO_ACCEPTED    = 'AUTO_ACCEPTED',
  PENDING_REVIEW   = 'PENDING_REVIEW',
  APPROVED         = 'APPROVED',
  REJECTED         = 'REJECTED',
  MISSING_CHECKOUT = 'MISSING_CHECKOUT',
}

// SEC-ATT-004: distinct nonce scopes, one per attendance action/endpoint.
export enum AttendanceNonceAction {
  CLOCK_IN          = 'CLOCK_IN',
  CLOCK_OUT         = 'CLOCK_OUT',
  OFFSITE_CLOCK_IN  = 'OFFSITE_CLOCK_IN',
  OFFSITE_CLOCK_OUT = 'OFFSITE_CLOCK_OUT',
}

// SEC-ATT-007A: risk severity assigned to a recorded AttendanceRiskReview row.
export enum AttendanceRiskLevel {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// SEC-ATT-007A: HR/Admin review workflow state for a risk review row.
export enum AttendanceRiskReviewStatus {
  PENDING  = 'PENDING',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  IGNORED  = 'IGNORED',
}

// SEC-ATT-007A: what happened to the underlying attendance attempt. ACCEPTED
// is a valid value but is never written by the automatic scoring hooks in
// attendance.service.ts (a fully clean attempt has nothing to review) —
// reserved for a possible future manual-flag path.
export enum AttendanceRiskResult {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  FLAGGED  = 'FLAGGED',
}

// SEC-ATT-007A: sanitized reason codes recorded on an AttendanceRiskReview row.
// These are categorical signals already computed by the SEC-ATT-002/003/004
// payload/geofence/nonce checks — never raw GPS, raw nonce, or raw
// attestation/token values. DEVICE_INTEGRITY_UNAVAILABLE and
// NATIVE_ATTESTATION_UNAVAILABLE are reserved for a future native-build signal
// (SEC-ATT-005/006, both DEFERRED) and are not emitted by any current hook —
// see attendance-risk-review.service.ts.
export enum AttendanceRiskReasonCode {
  MISSING_CAPTURED_AT           = 'MISSING_CAPTURED_AT',
  MISSING_SOURCE_CAPTURED_AT    = 'MISSING_SOURCE_CAPTURED_AT',
  INVALID_CAPTURED_AT           = 'INVALID_CAPTURED_AT',
  STALE_LOCATION                = 'STALE_LOCATION',
  FUTURE_LOCATION               = 'FUTURE_LOCATION',
  LOW_LOCATION_ACCURACY         = 'LOW_LOCATION_ACCURACY',
  MOCK_LOCATION_DETECTED        = 'MOCK_LOCATION_DETECTED',
  SIMULATED_LOCATION_DETECTED   = 'SIMULATED_LOCATION_DETECTED',
  GEOFENCE_REJECTED             = 'GEOFENCE_REJECTED',
  GEOFENCE_EDGE_CASE            = 'GEOFENCE_EDGE_CASE',
  NONCE_MISSING_ALLOWED         = 'NONCE_MISSING_ALLOWED',
  NONCE_INVALID                 = 'NONCE_INVALID',
  NONCE_EXPIRED                 = 'NONCE_EXPIRED',
  NONCE_REUSED                  = 'NONCE_REUSED',
  NONCE_ACTION_MISMATCH         = 'NONCE_ACTION_MISMATCH',
  NONCE_USER_MISMATCH           = 'NONCE_USER_MISMATCH',
  DEVICE_INTEGRITY_UNAVAILABLE  = 'DEVICE_INTEGRITY_UNAVAILABLE',
  NATIVE_ATTESTATION_UNAVAILABLE = 'NATIVE_ATTESTATION_UNAVAILABLE',
}
