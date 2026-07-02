# CTO Summary

## Step
HOTFIX-SEC-002 — Rotate Default SUPER_ADMIN Password

## Status
PASS

---

## Scope

The default `SUPER_ADMIN` account (`admin@hr.local`) in production still accepted the seed/default password (`admin1234`). This task rotated that password via the existing self-service flow and hardened the seed script so it can never silently revert a rotated password back to the default on a future re-run.

This was a **combined data + code operation**:
1. **Data-only, production:** password rotation performed by the user through the existing Admin Web **Profile → Change Password** UI. Claude did not see, generate, store, print, or transmit the new password or any production token at any point.
2. **Code-only, local:** `apps/api/prisma/seed.ts` hardened so re-seeding an environment where `admin@hr.local` already exists no longer overwrites `password` or `mustChangePassword`.

---

## Environment Affected

- **Production:** password rotated (data-only, no source changes deployed to prod as part of this task).
- **Local/Docker:** no password rotation performed locally. Seed script hardening only (not yet applied to any running database — takes effect the next time `npm run seed` / `prisma db seed` executes).

---

## Method Used

**Production rotation — Option A (existing UI self-service flow):**
1. User logged in to production Admin Web as `admin@hr.local` using the (now-retired) default password.
2. User navigated to **Profile → Change Password**.
3. User set a new password meeting the existing complexity policy (`ChangePasswordDto`: min 8 chars, upper + lower + digit + special character) and submitted via the existing `POST /auth/change-password` endpoint (JWT-guarded, requires correct current password).
4. Claude never requested, received, generated, logged, or persisted the new password, any production JWT, or any production credential. No production database was accessed directly by Claude at any point.

**Seed hardening — code change (local only, not yet committed or deployed):**
- `apps/api/prisma/seed.ts`: previously used `prisma.user.upsert(...)`, where the `update` branch unconditionally reset `password` (to the hardcoded default) and `mustChangePassword: false` on every seed run — meaning any manual rotation of `admin@hr.local`'s password would have been silently undone the next time the seed was re-run.
- Changed to: look up the user by email first. If the user already exists, the seed makes **no changes** to `password` or `mustChangePassword` and exits — existing credentials (including a rotated password) are left untouched. Only a brand-new `admin@hr.local` (fresh database / first bootstrap) is created with the existing default seed password, unchanged from prior behavior.
- No schema changes. No Prisma migrations. No other seed behavior changed (fresh-install/CI behavior for a database that does not yet have `admin@hr.local` is unchanged).

---

## Files Created

- `docs/CTO_SUMMARY_HOTFIX_SEC_002.md` — this document.

## Files Modified

- `apps/api/prisma/seed.ts` — stop overwriting `password` / `mustChangePassword` for an existing `admin@hr.local` on re-seed.

---

## Verification Result

Local code-change verification (source change only; no production access):

```
git diff --check                → clean (no whitespace/conflict-marker issues)
npx tsc --noEmit -p tsconfig.seed.json → PASS (seed script type-checks cleanly)
./scripts/verify.sh             → PASS (API build, Prisma schema valid, Web build)
./scripts/security-review.sh    → PASS (dependency audit clean/accepted-risk only, secret scan clean)
./scripts/api-smoke-test.sh     → PASS (run against local Docker stack; local admin credentials
                                   unaffected by this change — local stack was not rotated)
```

`./scripts/docker-verify.sh` — not required; no Docker/compose/Dockerfile changes made.

Production verification, performed directly by the user (Claude did not execute or observe any of these requests or their responses):

| Check | Result |
|---|---|
| Old default password (`admin1234`) against production `POST /auth/login` | **FAILS** (confirmed by user) |
| New password against production `POST /auth/login` | **SUCCEEDS** (confirmed by user) |
| `GET /auth/me` (or equivalent) role after login with new password | **`SUPER_ADMIN`** (confirmed by user) |
| New password or any token printed, saved, logged, or committed anywhere in this session | **No** |

---

## Issues Found

None. The one gap identified during investigation — the seed script would have reverted a rotated password on next re-seed — was addressed by the seed hardening change described above before this task was closed out.

---

## Risk

Low

---

## Decision

PASS

---

## Next Step

- User decides when/whether to commit and deploy the `apps/api/prisma/seed.ts` hardening (Claude performs no git operations per project rules).
- Recommend scheduling this in the next regular deploy — it is a defensive fix with no user-facing behavior change and no schema/migration impact.
- Optional follow-up (not in scope here, not implemented): move the initial bootstrap admin password to an env-var-driven value (e.g. `SEED_ADMIN_PASSWORD`) instead of a hardcoded default, for environments provisioning `admin@hr.local` for the first time.

---

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No endpoints added or changed. Rotation used the existing `POST /auth/change-password` endpoint (JWT-guarded, requires valid current password) exactly as designed. |
| RBAC impact | None. No role checks added/changed. |
| Data privacy impact | None. No new PII exposed; no change to data access. |
| Password/token/hash impact | Production `SUPER_ADMIN` password rotated via the existing hashed, `bcrypt`-backed change-password flow. No password, hash, or token was exposed, logged, printed, or stored by Claude at any point. Seed script change stops a class of accidental password-hash overwrite (defense-in-depth), no schema change to how hashes are stored. |
| Mobile security impact | None. |
| Dependency/advisory impact | No new packages added. `./scripts/security-review.sh` dependency audit: API HIGH findings (Multer DoS, GHSA-72gw-mp4g-v24j / GHSA-3p4h-7m6x-2hcm) are pre-existing, documented accepted risks (`.security-accepted-risks`, `docs/SECURITY_REVIEW_LOG.md`); Web and Mobile audits clean. |
| Secrets/logging check | Secret scan (`./scripts/security-review.sh`) passed — no secrets in the modified file. No new password, hash, or token was written to any file, log, or terminal output during this task. |
| New endpoints protected | None added. |
| Risk level | LOW |
| Security decision | PASS |

**Security FAIL conditions checked — none triggered:**
- No password/token/hash exposed in logs, response, or source.
- No new endpoint added (so no missing-guard risk).
- No RBAC bypass introduced.
- No secret committed to source control.
- No HIGH/CRITICAL dependency vulnerability without an accepted-risk note.
- No destructive Docker command used.
- No fabricated external advisory details in this summary.

---

## Recommended Commit Message

```
fix(api): stop seed from overwriting an existing admin password

Prisma seed previously upserted admin@hr.local on every run, resetting
password and mustChangePassword to the hardcoded default. This silently
reverted any manually rotated SUPER_ADMIN password on re-seed. Seed now
only sets credentials when the account does not yet exist.
```
