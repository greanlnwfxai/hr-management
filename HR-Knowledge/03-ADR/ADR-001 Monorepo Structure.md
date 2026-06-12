# ADR-001: Monorepo Structure

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Use a single monorepo at `/Users/greanlnwfx/Dev/hr-management` with:

```
hr-management/
├── apps/
│   ├── api/    # NestJS backend
│   └── web/    # Next.js frontend
├── docs/       # ADRs, API routes, QA docs
├── scripts/    # verify.sh, docker-verify.sh, api-smoke-test.sh
├── docker-compose.yml
└── CLAUDE.md
```

## Why

- Single clone, single git history, shared Docker Compose and scripts
- No cross-app imports at the source level
- Easier to keep API contracts and frontend in sync

## Key Note

The project was relocated from `~/Documents/hr-management` to `~/Dev/hr-management` to resolve iCloud Drive `ETIMEDOUT` errors during node_modules sync.

## Source

`docs/adr/ADR-001-monorepo-structure.md`

## Related Notes

- [[System Architecture]]
- [[ADR Index]]

#adr #infrastructure
