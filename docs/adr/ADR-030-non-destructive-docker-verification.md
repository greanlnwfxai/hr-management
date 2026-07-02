# ADR-030 — Non-Destructive Docker Verification

**Status:** Accepted
**Date:** 2026-07-01
**Tasks:** T-091 (v1.2.65)
**Related tags:** `v1.2.65-docker-verify-non-destructive`
**Implementation reference:** `docs/CTO_SUMMARY_T091_DOCKER_VERIFY_NON_DESTRUCTIVE.md`

---

## Context

`scripts/docker-verify.sh` began with an unconditional `docker compose down`
before `docker compose up -d --build`, intending to guarantee a clean recreate
on every run. This directly conflicted with this repository's own Docker Safety
Rule (CLAUDE.md: "Do NOT run `docker compose down`") and caused a real, contained
incident during HOTFIX-REQ002G-5: a ~20-second service interruption when the
script was run before its contents had been inspected. No data was lost only
because `postgres_data` is a named volume that survives `down` without `-v` —
the near-miss was closer than the safety policy intended.

ADR-003 (Docker Compose) and ADR-016 (Agent Workflow and Docker Safety Policy)
already establish that destructive teardown requires explicit user approval,
but prior to this fix `docker-verify.sh` itself violated that policy by design,
and both ADR stubs described the script only as "historical" or "may perform
teardown operations" without stating that this was corrected.

## Decision

Refactor `scripts/docker-verify.sh` to be **fully non-destructive**:

1. A safety guard greps the script's own (non-comment) source for forbidden
   Docker commands (`compose down`, `system prune`, `volume/container/image/
   network rm`) and refuses to run if any are found — this protects against the
   fix being silently reverted in a future edit.
2. `docker compose config` — validates the compose file; no side effects.
3. `docker compose up -d --build` — builds and starts/updates services.
   Non-destructive: recreates only containers whose image/config changed; never
   stops services first.
4. Polls (max 120s) for API `GET /health`.
5. Polls (max 120s) for web (`:3002`) and mobile (`:3004`) reachability.
6. Prints `docker compose ps`, and on any failure, `docker compose logs
   --tail=100` for the relevant service (read-only).
7. Exits non-zero on any failed health/reachability check.
8. Prints an explicit "non-destructive, containers left running" notice at both
   the start and the end of the run.
9. Never stops, removes, or resets containers, volumes, images, or networks —
   under any run outcome, pass or fail.

Stopping or resetting containers remains a manual decision made by the user
only. Agents must never run `docker compose down` or any other teardown/cleanup
command as part of verification.

## Consequences

**Positive:**
- `docker-verify.sh` can now be run as a normal, always-safe verification step
  (as required by CLAUDE.md's three-script verification gate), rather than
  something that must be withheld or run only with explicit approval.
- The self-check guard prevents this fix from being silently regressed.
- Containers remain running after verification, preserving in-progress
  local/manual testing state instead of interrupting it.

**Negative / Trade-offs:**
- The script no longer guarantees a fully clean container recreate on every
  run — a stale container that isn't picked up by `up -d --build`'s
  change-detection could in theory persist. This is an accepted trade-off:
  clean-slate resets remain a manual, explicit user action.

## Superseded Guidance

This ADR corrects the following statements in earlier ADRs, which are now
**stale** and should be read as historical context only, not current guidance:

- ADR-003 ("Because `docker-verify.sh` may perform teardown operations, do not
  treat it as an always-safe default") — **no longer accurate**; the script is
  confirmed non-destructive as of `v1.2.65`.
- ADR-016 / `HR-Knowledge/01-START-HERE/Current Status.md` (pre-`v1.2.65`
  wording) — any statement that `docker-verify.sh` "internally invokes
  `docker compose down`" is stale.

## Related ADRs

- ADR-003 — Docker Compose for Local Development (base architecture; stale
  teardown caveat corrected by this ADR)
- ADR-016 — Agent Workflow and Docker Safety Policy (destructive-action policy
  this fix now fully complies with)
- ADR-009 — Development Harness and Manual Git Workflow
