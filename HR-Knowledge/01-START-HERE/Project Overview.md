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

## Backend-First Strategy

The project followed a **backend-first** approach:

1. Build and verify the full API before any frontend work.
2. All business rules (leave balance, attendance timezone, approval flow) validated end-to-end before UI development starts.
3. ADRs written after implementation — not speculatively — to accurately reflect what was built.

See [[ADR Index]] → ADR-004 for the full rationale.

## Backend v1.0 Status

**COMPLETE** as of 2026-06-12.

All 8 backend modules implemented, verified, and documented. 30 API endpoints across 8 modules. All three verification scripts pass.

See [[Current Status]] for the full module list.

## ADR Status

**12 ADRs completed** covering every major architectural decision. See [[ADR Index]].

## Current Branch

`feature/department-module`

## Development Workflow

| Actor | Responsibilities |
|---|---|
| Claude Code | Write code, run builds, run tests, Docker verification, CTO Summary, recommend commit messages |
| User + ChatGPT | `git add`, `git commit`, `git push`, `git tag`, branch management, PR review |

Claude Code **must never** run git mutations. See [[Development Workflow]].

## Related Notes

- [[Current Status]]
- [[System Architecture]]
- [[ADR Index]]
- [[API Route Index]]

#hr-management #backend-v1 #project-overview
