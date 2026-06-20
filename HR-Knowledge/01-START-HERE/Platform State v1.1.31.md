# Platform State v1.1.31

Last updated: 2026-06-20
Latest tag: `v1.1.31-audit-log-foundation-spec`

## Overview

The HR Management System is now beyond the original backend v1.0-only foundation.

Current shipped scope includes:
- JWT auth with username or email login
- Employee, department, and position management
- HR account provisioning and temporary password reset
- Web profile and password change
- Mobile login, dashboard, attendance, leave, calendar, manager approval, and profile/password change
- Forced `mustChangePassword` UX enforcement on web and mobile
- Security harness scripts, security CI job, Dependabot, and accepted-risk tracking
- Audit log foundation documented as specification-only work

This note is the quickest high-level reference for the current product state through `v1.1.31`.

---

## Auth And Account State

### Login

- `POST /auth/login` accepts username or email via `login`
- Legacy `email` field is still accepted
- Inactive users (`isActive = false`) are rejected
- Successful login updates `lastLoginAt`

### User Identity Fields

The current auth/account model includes:
- `username`
- `mustChangePassword`
- `employeeId`
- `isActive`
- `passwordGeneratedAt`
- `lastLoginAt`

### HR Account Management

HR/Admin account operations currently include:
- `GET /employees/:id/account`
- `POST /employees/:id/account`
- `POST /employees/:id/account/reset-password`

These are the current live employee-account endpoints. Older variants like `/employees/:id/provision` or `/employees/:id/reset-password` are not current API routes.

### Temporary Passwords

Temporary passwords are:
- generated server-side
- returned once only in provision/reset responses
- never persisted in plain text
- never stored in audit-style docs or UI state beyond one-time presentation
- paired with `mustChangePassword: true`

### Password Change

Current self-service password change endpoint:
- `POST /auth/change-password`

Current user profile endpoint:
- `GET /auth/me`

Both web and mobile profile flows consume these endpoints.

### Forced Password Change

`mustChangePassword` is now actively enforced at the UI layer:
- Web: protected app routes redirect to `/profile` until password is changed
- Mobile: deep screens like attendance, leave, and approvals redirect to `/profile`; Home keeps profile access available

This is a frontend UX policy gate. Backend authentication and RBAC remain the server authority.

---

## Security State

### Security Harness

Security tooling currently includes:
- `./scripts/security-review.sh`
- `./scripts/security-audit.sh`
- `./scripts/secret-scan.sh`

### Policy Notes

- Full security review is not required for every task
- Monthly security review policy exists for ongoing review cadence
- For ordinary non-security tasks, run the smallest relevant verification set
- `security-audit` is especially relevant when `package.json` or lockfiles change
- `secret-scan` is available locally and also enforced in CI

### CI And Dependency Automation

Current security automation includes:
- GitHub Actions blocking job: `Security — Audit & Secret Scan`
- Dependabot for API, Web, Mobile, and GitHub Actions
- Accepted risk tracking via `.security-accepted-risks`

---

## Mobile State

The mobile app currently supports:
- login
- home dashboard
- attendance clock-in / clock-out
- leave request submission and history
- calendar screen
- profile and password change
- manager approval screen
- `mustChangePassword` enforcement
- shared bottom navigation and shared header patterns from T-056A

### UI Direction

The current mobile UI direction keeps:
- dark navy employee hero styling on Home
- modern employee self-service presentation
- pill-shaped check-in / check-out actions
- calendar and dashboard cards
- bottom-navigation-like shared shell without a risky Expo Router tab rewrite

### Relevant Milestones

- T-056 — Mobile UI + Calendar Polish
- T-056A — Mobile UI Final Polish & Navigation Refinement

---

## Attendance State

### Current Schedule Rule

Working schedule is:
- `08:30–17:30`

### Late Threshold

Attendance is `LATE` when clock-in is strictly after `08:30` in Asia/Bangkok.

### Timezone

- Timezone policy: `Asia/Bangkok`
- Fixed offset: `UTC+7`
- No daylight saving time

Older notes that mention `09:00` or `08:00–17:00` are stale if they conflict with current source and current milestone docs.

---

## Web Admin State

The web admin app currently includes:
- profile and password change page
- employee detail account management
- account provisioning
- temporary password reset
- account summary display with:
  - `username`
  - `email`
  - `role`
  - `isActive`
  - `mustChangePassword`
  - `passwordGeneratedAt`
  - `lastLoginAt`

`GET /employees/:id/account` is the current read endpoint for that account summary.

---

## API Notes

Current core endpoints of interest:
- `POST /auth/change-password`
- `GET /auth/me`
- `GET /employees/:id/account`
- `POST /employees/:id/account`
- `POST /employees/:id/account/reset-password`
- `POST /attendance/clock-in`
- `POST /attendance/clock-out`
- `GET /attendance/me`
- `GET /attendance`
- `GET /attendance/:id`
- `POST /leave/request`
- `GET /leave/me`
- `GET /leave`
- `GET /leave/:id`
- `PATCH /leave/:id/approve`
- `PATCH /leave/:id/reject`
- `GET /dashboard`

Endpoint ambiguity resolved from source:
- Active route: `POST /employees/:id/account`
- Active route: `POST /employees/:id/account/reset-password`
- Active route: `GET /employees/:id/account`
- Not current route: `POST /employees/:id/provision`
- Not current route: `POST /employees/:id/reset-password`

---

## Audit Log State

Audit log work is currently specification-only.

Reference:
- `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`

Current status:
- no Prisma audit log model yet
- no migration yet
- no API endpoint yet
- no runtime audit capture yet

Any future audit log implementation should be phased and reviewed before backend or database changes are introduced.

---

## Related Notes

- [[Current Status]]
- [[Project Overview]]
- [[API Route Index]]
- [[Attendance Rules]]
- [[Development Workflow]]
- [[Verification Workflow]]

#hr-management #current-state #v1-1-31 #rag-ready
