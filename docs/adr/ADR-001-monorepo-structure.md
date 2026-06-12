# ADR-001: Monorepo Structure

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system requires both a backend API and a frontend web application. A decision was needed on whether to place these in separate repositories or co-locate them in a single repository. Early in the project, the working directory was at `~/Documents/hr-management`, which caused build failures and iCloud-related `ETIMEDOUT` errors when iCloud Drive attempted to sync large `node_modules` trees. The project was subsequently relocated to `~/Dev/hr-management` to resolve these issues.

Additionally, shared operational artifacts — Docker Compose, verification scripts, and documentation — need to live somewhere accessible to both applications without duplication.

## Decision
Use a single monorepo at `/Users/greanlnwfx/Dev/hr-management` with the following top-level structure:

```
hr-management/
├── apps/
│   ├── api/          # NestJS backend (Node.js 22, Prisma 6, PostgreSQL 16)
│   └── web/          # Next.js frontend (App Router, TailwindCSS)
├── docs/             # Architecture decisions, API routes, QA docs
├── scripts/          # verify.sh, docker-verify.sh, api-smoke-test.sh
├── docker-compose.yml
└── CLAUDE.md         # Claude Code operating rules
```

App-specific code, dependencies, Dockerfiles, and configuration remain inside each `apps/<name>/` directory. No cross-app imports are made at the source level.

## Consequences

**Positive**
- Single clone, single `git` history, single branch workflow.
- Docker Compose, verification scripts, and documentation are shared without duplication.
- Easier to keep API contracts and frontend in sync during development.
- CTO summaries, QA checklists, and ADRs are co-located with the code they describe.

**Negative**
- Both apps are cloned together even when only one is needed.
- CI/CD pipelines must be configured to build each app independently or use path-based triggers.
- `node_modules` for both apps exist on disk — iCloud sync must be suppressed (resolved by moving to `~/Dev/`).

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Separate repos (`hr-api`, `hr-web`) | Harder to share Docker Compose and scripts; no cross-repo visibility during backend-first development |
| Nx or Turborepo monorepo tooling | Unnecessary complexity for a two-app project at this scale |
| Single app (SSR + API in Next.js) | Mixes backend and frontend concerns; harder to replace or scale independently |

## Follow-up Tasks
- Configure CI path filters so API changes only trigger API builds and vice versa.
- Add `.env.example` for both apps to document required environment variables.
- Ensure `node_modules/` is listed in `.gitignore` for both apps.
