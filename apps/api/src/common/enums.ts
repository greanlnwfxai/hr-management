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
