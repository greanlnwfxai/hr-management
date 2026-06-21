# ADR Index

Architecture Decision Records for the HR Management System.

This index includes the original backend-v1 ADR pack plus later ADRs added through `v1.1.32`. Full documents live in `docs/adr/` in the project repository. This index provides summaries and links.

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
| [[ADR-010 Attendance Timezone]] | Attendance Timezone Policy | Business Rules | Asia/Bangkok UTC+7 fixed; LATE if strictly after 08:30 Bangkok |
| [[ADR-011 Leave Workflow]] | Leave Workflow and Balance Integration | Business Rules | Atomic approval+balance deduction; two tightly-integrated modules |
| [[ADR-012 Backend v1 Readiness]] | Backend v1.0 Readiness | Process | Backend declared READY for local/dev; 3 items block production |
| [[ADR-013 Identity and Account Lifecycle]] | Identity and Employee Account Lifecycle | Security | Username/email login, employee-linked accounts, HR provisioning/reset flow |
| [[ADR-014 Password Change Policy]] | Password Change and mustChangePassword Policy | Security | JWT-protected self-service password change plus UX-enforced mustChangePassword flow |
| [[ADR-015 Security Harness]] | Security Harness and Review Policy | Security | Local scripts, CI security job, Dependabot, accepted-risk tracking, scoped review cadence |
| [[ADR-016 Agent Workflow]] | Agent Workflow and Docker Safety Policy | Process | CLAUDE/AGENTS guidance split, manual git control, destructive Docker restrictions |
| [[ADR-017 Mobile Expo Router]] | Mobile Expo Router and Web-Compatible Shell | Mobile | Expo Router foundation, Expo web compatibility, shared mobile shell components |
| [[ADR-018 Audit Log Status]] | Audit Log Foundation Specification Status | Process | ~~Audit log remains specification-only~~ — **Superseded by ADR-019** |
| [[ADR-019 Audit Trail and Admin Review]] | Audit Trail and Admin Audit Log Review | Security | Append-only audit trail, best-effort writes, metadata denylist, RBAC-restricted read API, read-only admin UI |

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
├── ADR-012-backend-v1-readiness.md
├── ADR-013-identity-and-employee-account-lifecycle.md
├── ADR-014-password-change-and-must-change-password-policy.md
├── ADR-015-security-harness-and-review-policy.md
├── ADR-016-agent-workflow-and-docker-safety-policy.md
├── ADR-017-mobile-expo-router-and-web-compatible-shell.md
├── ADR-018-audit-log-foundation-specification-status.md
└── ADR-019-audit-trail-and-admin-review.md
```

## Related Notes

- [[System Architecture]]
- [[Backend v1 Architecture]]
- [[RBAC Rules]]
- [[Leave Rules]]
- [[Attendance Rules]]

#hr-management #adr #architecture
