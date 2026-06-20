# Project Overview

## Project Name

**HR Management System** — internal tooling for managing employees, departments, attendance, and leave.

## Purpose

A full-stack HR platform built for a single company. Covers:
- Employee directory and lifecycle management
- Department and position structure
- Daily attendance with clock-in/clock-out
- Leave request workflow with balance quota enforcement
- Aggregated HR dashboard for administrators and managers
- Web self-service profile/password change
- Mobile self-service attendance, leave, calendar, profile, and manager approval
- HR-managed login account lifecycle for employees

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS 11, Passport JWT, class-validator |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Frontend | Next.js (App Router), React, TailwindCSS |
| Runtime | Node.js 22 |
| Containers | Docker Compose |

## Service Ports

| Service | Port |
|---|---|
| Web (Next.js) | 3002 |
| API (NestJS) | 4002 |
| PostgreSQL | 5432 |
| Redis | Not used yet |

## Product State

The system has moved beyond the original backend-first delivery and now includes:
- API + PostgreSQL backend
- Next.js web admin app
- Expo mobile app
- security harness and CI security automation
- audit log foundation specification for future backend work

See [[Platform State v1.1.31]] for the current product snapshot.

## Backend-First Strategy

The project followed a **backend-first** approach:

1. Build and verify the full API before any frontend work.
2. All business rules (leave balance, attendance timezone, approval flow) validated end-to-end before UI development starts.
3. ADRs written after implementation — not speculatively — to accurately reflect what was built.

See [[ADR Index]] → ADR-004 for the full rationale.

## Current Delivery State

The original backend v1.0 foundation is complete, and later milestones added:
- username/email login
- account provisioning and password reset flows
- web profile/password change
- mobile manager approval
- forced `mustChangePassword` enforcement
- mobile UI polish through T-056A
- audit log foundation specification through T-057-prep

## ADR Status

**12 ADRs completed** covering every major architectural decision. See [[ADR Index]].

## Current Baseline

- Latest known commit for synced knowledge baseline: `8ff00b7`
- Latest tag: `v1.1.31-audit-log-foundation-spec`

## Development Workflow

| Actor | Responsibilities |
|---|---|
| Claude / Codex | Implement scoped work, run non-destructive verification, write CTO-style summaries, recommend commit messages |
| User | Own final git mutations, branch decisions, release actions |
| ChatGPT reviewer | Review work and give PASS / FAIL guidance when used in the workflow |

Claude/Codex **must never** run git mutations. See [[Development Workflow]].

## Related Notes

- [[Current Status]]
- [[Platform State v1.1.31]]
- [[System Architecture]]
- [[ADR Index]]
- [[API Route Index]]

#hr-management #project-overview #v1-1-31
