# CTO Summary

## Step
T-091 — Remove Destructive Docker Command from docker-verify.sh

## Status
PASS

## Scope
`scripts/docker-verify.sh` began with `docker compose down`, violating the repo's
own Docker Safety Rule (CLAUDE.md). This was flagged as a process note during
HOTFIX-REQ002G-5. This task refactors the script to be fully non-destructive
while preserving its verification value, and updates docs/instructions that
implied teardown.

## Root Cause
`scripts/docker-verify.sh` (original line 30) unconditionally ran `docker compose
down` before `docker compose up -d --build`, intending to guarantee a clean
recreate. This directly conflicted with the repo's Docker Safety Rule
("Do NOT run `docker compose down`") and caused a real (contained) incident
during HOTFIX-REQ002G-5: a ~20s service interruption when the script was run
before its contents were inspected. No data was lost only because
`postgres_data` is a named volume that survives `down` without `-v`.

## Files Created
- `docs/CTO_SUMMARY_T091_DOCKER_VERIFY_NON_DESTRUCTIVE.md`

## Files Modified
- `scripts/docker-verify.sh` — removed `docker compose down`; script is now
  build/start + health/reachability checks only
- `CLAUDE.md` — clarified `docker-verify.sh` is non-destructive and leaves
  containers running; noted `docker compose up -d --build` as an allowed
  command under Docker Safety Rules; linked this summary

## Exact Destructive Command Removed
```bash
info "Tearing down existing stack..."
docker compose down
```
(previously ran unconditionally at the start of `docker-verify.sh`, before
`docker compose up -d --build`)

## New docker-verify.sh Behavior
1. Safety guard: greps its own (non-comment) source for forbidden Docker
   commands (`compose down`, `system prune`, `volume/container/image/network
   rm`) and refuses to run if any are found — protects against the fix being
   silently reverted later.
2. `docker compose config` — validates compose file, no side effects.
3. `docker compose up -d --build` — builds and starts/updates services.
   Non-destructive: recreates only containers whose image/config changed;
   never stops services first.
4. Waits (poll loop, max 120s) for API `/health`.
5. Waits (poll loop, max 120s) for web (`:3002`) and mobile (`:3004`)
   reachability — new checks beyond the original script's scope.
6. Prints `docker compose ps` and, on any failure, the relevant service's
   `docker compose logs --tail=100` (read-only).
7. Exits non-zero on any failed health/reachability check.
8. Prints an explicit "non-destructive, containers left running" notice at
   both the start and the end of the run.
9. Never stops or removes containers, volumes, images, or networks —
   confirmed empirically (see Verification Result).

## Safety Notes
- No `docker compose down`, `down -v`, `docker system prune`, or
  `volume/container/image/network rm` anywhere in the script (verified by
  grep — the only matches are inside the comment block documenting the rule).
- The in-script safety guard fails fast (before doing anything) if a future
  edit reintroduces a forbidden command outside a comment.
- CLAUDE.md's Docker Safety Rules section now explicitly allows
  `docker compose up -d --build` as run by this script and links to this
  summary for context.
- Stopping/removing containers remains a manual, explicit user decision only.

## Verification Result
```
bash -n scripts/docker-verify.sh                              → PASS (no syntax errors)
grep for forbidden commands (down/prune/*-rm) in the script    → PASS (0 real matches, 2 comment-only matches documenting the rule)
git diff --check                                               → PASS (no whitespace errors)
./scripts/verify.sh          → PASS (API build, prisma validate, web build all green)
./scripts/api-smoke-test.sh  → PASS (health, login, /auth/me, employees, departments,
                                       positions, attendance, leave, leave-balances,
                                       dashboard, 401 guard — all green)
./scripts/docker-verify.sh   → PASS (config valid; up -d --build; API/web/mobile all
                                       reachable; docker compose ps shows all 4
                                       services Up/healthy afterward)
```

Post-run `docker compose ps` (containers confirmed still running, not torn down):
```
NAME        SERVICE   STATUS
hr-api      api       Up (healthy)
hr-db       db        Up (healthy)
hr-mobile   mobile    Up
hr-web      web       Up
```

## Issues Found
During implementation, the first version of the web/mobile reachability checks
used a single `curl` attempt with no retry. Because `docker compose up -d
--build` recreates the web/mobile containers (Next.js/nginx need a moment to
bind their port), the single-shot check produced a false FAIL immediately
after recreation. Fixed by adding the same poll-with-timeout pattern already
used for the API health check (max 120s, 3s interval) to the web and mobile
reachability checks. Re-ran and confirmed PASS.

## Risk
Low — script/docs-only change. No application runtime logic, database schema,
or migrations were touched. No git operations were performed.

## Decision
PASS

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None — no auth code changed |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None — smoke test credentials unchanged, not logged by this script |
| Mobile security impact | None — added a reachability *check* (GET to `:3004`) only, no token/storage handling changed |
| Dependency/advisory impact | None — no packages added or changed |
| Secrets/logging check | No secrets/tokens in the script; logs printed on failure are container stdout only (existing app logs), not new sensitive output |
| New endpoints protected | None — no new endpoints added |
| Risk level | LOW |
| Security decision | PASS |

## Confirmation
- No destructive Docker command was run before, during, or after this task
  (`docker compose down`, `down -v`, `system prune`, `volume/container/image/
  network rm` — none executed).
- No `git add`, `git commit`, `git push`, `git tag`, or `git merge` was run.
- Containers were left running at every point, confirmed via `docker compose
  ps` before and after script execution.

## Next Step
Awaiting user review/tagging. No further backend/frontend feature step queued
by this task.

## Recommended Commit Message
```
chore(harness): make docker verification non-destructive

Remove `docker compose down` from scripts/docker-verify.sh. The script now
validates config, runs `docker compose up -d --build`, waits for API health
and web/mobile reachability, and always leaves the stack running. Adds an
in-script guard against reintroducing destructive Docker commands, and
clarifies in CLAUDE.md that docker-verify.sh is non-destructive and that
stopping/removing containers is a manual user decision only.
```

Recommended tag after PASS: `v1.2.65-docker-verify-non-destructive`
