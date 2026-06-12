# ADR Index

Architecture Decision Records for the HR Management System.

All ADRs are **Accepted** as of 2026-06-12 (Backend v1.0). Full documents live in `docs/adr/` in the project repository. This index provides summaries and links.

## Index

| ADR | Title | Domain | Summary |
|---|---|---|---|
| [[ADR-001 Monorepo Structure]] | Monorepo Structure | Infrastructure | Single repo for `apps/api` + `apps/web` + shared scripts/docs |
| [[ADR-002 PostgreSQL and Prisma]] | PostgreSQL and Prisma ORM | Database | PostgreSQL 16 + Prisma 6 as ORM; runtime-safe enum pattern |
| [[ADR-003 Docker Compose]] | Docker Compose for Local Dev | Infrastructure | Three-service Docker stack; API runs in production mode |
| [[ADR-004 Backend-First Strategy]] | Backend-First Strategy | Process | Complete API before frontend; ADRs written post-implementation |
| [[ADR-005 JWT Authentication]] | JWT Authentication | Security | Passport JWT, 8h expiry, DB re-validation per request |
| [[ADR-006 RBAC]] | Role-Based Access Control | Security | Four roles: SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE |
| [[ADR-007 API Standards]] | API Design Standards | API | Plural nouns, paginated shape, ValidationPipe, select projections |
| [[ADR-008 Deployment Strategy]] | Deployment Strategy | Infrastructure | Local/dev Docker Compose; cloud target deferred |
| [[ADR-009 Development Harness]] | Development Harness and Manual Git | Process | Claude Code writes/verifies; user handles all git operations |
| [[ADR-010 Attendance Timezone]] | Attendance Timezone Policy | Business Rules | Asia/Bangkok UTC+7 fixed; LATE if strictly after 09:00 Bangkok |
| [[ADR-011 Leave Workflow]] | Leave Workflow and Balance Integration | Business Rules | Atomic approval+balance deduction; two tightly-integrated modules |
| [[ADR-012 Backend v1 Readiness]] | Backend v1.0 Readiness | Process | Backend declared READY for local/dev; 3 items block production |

## ADR Policy

ADRs in this project are written **after implementation**, not before. This ensures each decision document reflects what was actually built and verified, not what was planned. See [[ADR-004 Backend-First Strategy]].

## Source Files

Original ADR markdown files are in the project repository at:

```
docs/adr/
├── ADR-001-monorepo-structure.md
├── ADR-002-postgresql-and-prisma.md
├── ADR-003-docker-compose-local-development.md
├── ADR-004-backend-first-strategy.md
├── ADR-005-jwt-authentication.md
├── ADR-006-role-based-access-control.md
├── ADR-007-api-standards.md
├── ADR-008-deployment-strategy.md
├── ADR-009-development-harness-and-manual-git-workflow.md
├── ADR-010-attendance-timezone-policy.md
├── ADR-011-leave-workflow-and-balance-integration.md
└── ADR-012-backend-v1-readiness.md
```

## Related Notes

- [[System Architecture]]
- [[Backend v1 Architecture]]
- [[RBAC Rules]]
- [[Leave Rules]]
- [[Attendance Rules]]

#hr-management #adr #architecture
