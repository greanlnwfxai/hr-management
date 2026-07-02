# ADR-030: Non-Destructive Docker Verification

**Status:** Accepted | **Date:** 2026-07-01

## Decision

`scripts/docker-verify.sh` no longer runs `docker compose down`. It is now
build/start + health/reachability checks only, and it leaves containers
running on both pass and fail.

## Key Points

- Self-check guard greps its own source for forbidden Docker commands and
  refuses to run if found — prevents the fix from being silently reverted
- Flow: `docker compose config` → `docker compose up -d --build` → poll
  `/health` → poll web/mobile reachability → print `docker compose ps` (and
  `logs --tail=100` on failure)
- Never stops/removes containers, volumes, images, or networks
- Stopping containers remains a manual, explicit user decision only
- **Corrects stale guidance** in ADR-003 ("may perform teardown operations")
  and any earlier note that this script invokes `docker compose down` —
  no longer true as of `v1.2.65`

## Source

`docs/adr/ADR-030-non-destructive-docker-verification.md`

#adr #docker #safety #harness
