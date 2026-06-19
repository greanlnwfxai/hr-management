# HR Management System Agent Guide

This file is for Codex and other agent-based coding tools working in the root `hr-management` repo. It reflects the project state after `v1.1.25-security-ci-dependabot`.

`CLAUDE.md` remains the primary Claude operating file. Use this document as the agent-focused quick guide for repo shape, current features, verification, and safety rules. Keep both files aligned, but do not duplicate every implementation detail.

## Project Summary

HR Management is internal tooling for employee administration, department and position management, attendance tracking, leave workflows, mobile HR features, and the security review harness that protects delivery quality.

Current shipped scope includes:

- JWT auth with username or email login
- Employee, department, and position management
- Attendance flows, including mobile geofence clock in/out
- Leave requests, leave balances, and manager approvals
- Mobile dashboard, profile, and password change flows
- Security CI, Dependabot, and review scripts

## Stack and Ports

### Stack

- API: NestJS 11, Passport JWT, class-validator, Prisma 6, PostgreSQL 16
- Web: Next.js App Router, React, TailwindCSS
- Mobile: Expo React Native
- Runtime: Node.js 22
- Orchestration: Docker Compose

### Local Ports

| Service | URL / Port | Notes |
|---|---|---|
| Web Admin | `http://localhost:3002` | Next.js admin app |
| Mobile Web | `http://localhost:3004` | Expo web build via Docker |
| API | `http://localhost:4002` | NestJS API |
| PostgreSQL | `5432` | Local database |
| Redis | not used | Do not assume Redis exists |

## Repository Structure

Important paths to know before editing:

- `apps/api` — NestJS API
- `apps/web` — Next.js admin web app
- `apps/mobile` — Expo mobile app
- `scripts` — verification, security, smoke, CI helper scripts
- `docs` — CTO summaries, security docs, architecture notes, feature docs
- `.github/workflows` — CI jobs and automation
- `.github/dependabot.yml` — dependency update policy
- `.security-accepted-risks` — accepted risk registry for unresolved findings
- `CLAUDE.md` — main Claude workflow guide
- `AGENTS.md` — this file

## Backend Structure

The API uses a flat NestJS feature layout under `apps/api/src`. There is no `src/modules` container.

Key directories:

- `apps/api/src/auth`
- `apps/api/src/employees`
- `apps/api/src/leave`
- `apps/api/src/leave-balance`
- `apps/api/src/attendance`
- `apps/api/src/dashboard`
- `apps/api/src/prisma`
- `apps/api/src/common`

Other active features currently present:

- `apps/api/src/departments`
- `apps/api/src/positions`

Rule for new backend work:

- New backend features should be created as `apps/api/src/<feature>`
- Do not introduce `apps/api/src/modules`

## Current Auth Behavior

- Login supports either username or email through `POST /auth/login`
- Protected endpoints use `Authorization: Bearer <token>`
- Demo admin credentials:
  - username: `admin`
  - email: `admin@hr.local`
  - password: `admin1234`
- JWT payload and safe auth responses include current identity context needed by clients
- The `User` model includes:
  - `username`
  - `mustChangePassword`
  - employee linkage behavior surfaced as `employeeId`
- Account provisioning creates usernames in lowercase and typically sets `mustChangePassword: true`
- Mobile currently supports viewing profile data and changing password

## Current Mobile Features

The mobile app currently supports:

- Auth
- Dashboard and profile
- Attendance with geofence clock in/out
- Leave request submission and history
- Role-based UX
- Manager approval
- Profile and password change

## Current Web Features

The web admin app currently supports:

- Admin dashboard
- Employee management
- Department and position management
- Attendance management
- Leave management
- Account provisioning from employee detail
- Login with username or email

## Milestone Context

Latest milestone history relevant to agents:

- `v1.1.19` — Mobile Leave Request
- `v1.1.20` — Mobile Role-Based UX
- `v1.1.21` — Username Login & HR Account Provisioning
- `v1.1.22` — Mobile Manager Approval
- `v1.1.23` — Mobile Profile & Password Change
- `v1.1.24` — Security Harness Foundation
- `v1.1.25` — Security CI + Dependabot

Current CI jobs:

1. API — Build & Validate
2. Web — Build & Validate
3. Mobile — Typecheck & Export
4. Compose — Config Validation
5. Integration — Runtime API Test
6. E2E — Playwright Critical Flows
7. Security — Audit & Secret Scan

## Verification Scripts

Existing repo-level verification scripts:

- `./scripts/security-review.sh`
- `./scripts/security-audit.sh`
- `./scripts/secret-scan.sh`
- `./scripts/verify.sh`
- `./scripts/docker-verify.sh`
- `./scripts/api-smoke-test.sh`
- `./scripts/mobile-verify.sh`
- `./scripts/e2e-test.sh`

Agents may run non-destructive verification relevant to the task. Prefer the smallest useful verification set, and report what was or was not run.

## Security Rules

These rules apply to every task:

- Every task must include a `Security Review` section in the CTO Summary
- Run `./scripts/security-review.sh` before declaring security-sensitive work done
- Do not expose secrets, tokens, or credentials in code, logs, summaries, or screenshots
- Do not return password hashes from the backend
- Backend RBAC is the source of truth
- Mobile and web UI gating are not authorization
- Any HIGH or CRITICAL vulnerability must be patched or recorded in `.security-accepted-risks`
- Do not fabricate advisory details, CVEs, or external security references

Security harness references:

- `scripts/security-audit.sh`
- `scripts/secret-scan.sh`
- `scripts/security-review.sh`
- `.security-accepted-risks`
- `docs/SECURITY_HARNESS.md`
- `docs/SECURITY_PATCH_POLICY.md`
- `docs/SECURITY_REVIEW_CHECKLIST.md`
- `docs/SECURITY_REVIEW_LOG.md`
- `.github/dependabot.yml`

## Docker Safety Rules

Do not run destructive Docker commands in this repo.

Forbidden:

- `docker compose down`
- `docker compose down -v`
- `docker system prune`
- `docker volume rm`
- `docker volume prune`
- `docker rm`
- `docker rmi`
- any command that stops, removes, resets, or deletes containers, images, networks, or volumes

Allowed inspection only:

- `docker ps`
- `docker ps -a`
- `docker compose ps`
- `docker compose logs --tail=100`
- `docker volume ls`
- `docker compose config`
- `curl` health checks

Do not restart Docker in this task flow unless the user explicitly asks.

## Git and Delivery Workflow

Agents may edit files and run non-destructive verification, but the user handles final git operations manually.

Do not run:

- `git add`
- `git commit`
- `git push`
- `git tag`

Also do not deploy from agent workflows unless the user explicitly requests it.
