# CTO Summary

## Step
T-093 — Sanitize Legacy Default Credential Examples in Docs

## Status
PASS

## Scope
Docs-only cleanup following HOTFIX-SEC-002 / T-092 (production `SUPER_ADMIN` password rotation and seed hardening, v1.2.67). Reviewed every grep hit for default-credential examples, unsafe token-printing commands, and Bearer-token placeholders across `docs/` and `HR-Knowledge/`, and sanitized the ones that teach unsafe usage (copy-pasteable login steps with the literal dev seed password, or commands that print a raw `accessToken` to stdout). Left untouched the hits that are safe placeholders, field-name documentation, or dev/CI reference material that already carries an explicit "dev-only, never use in production" warning.

## Files Created
- `docs/CTO_SUMMARY_T093_SANITIZE_LEGACY_CREDENTIAL_DOCS.md` (this file)

## Files Modified
- `docs/PRODUCTION_DEPLOYMENT.md` — production smoke-test login example
- `docs/PRE_DEPLOYMENT_SECURITY.md` — pre-deploy login verification example
- `docs/AUTH_SECURITY_HARDENING.md` — local verification login + rate-limit examples
- `docs/API_DOCUMENTATION.md` — login request/response examples, added token-handling note
- `docs/MOBILE_GEOFENCE_CLOCK.md` — manual test step
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — manual test step
- `docs/MOBILE_LEAVE_REQUEST.md` — manual test step
- `docs/MOBILE_DASHBOARD_PROFILE.md` — manual test step
- `docs/MOBILE_AUTH.md` — login/response examples, demo-credentials section
- `docs/QA_T088_ADMIN_WEB_PRODUCTION_QA.md` — production QA admin-credentials note
- `docs/USERNAME_LOGIN_AND_ACCOUNT_PROVISIONING.md` — login body examples, seed/demo accounts table
- `docs/CTO_SUMMARY_T047.md` — historical manual-verification step (instructive login command)
- `docs/CTO_SUMMARY_T049.md` — historical manual-verification step (instructive login command)
- `docs/CTO_SUMMARY_HOTFIX_006.md` — added `unset TOKEN` to an already-safe capture-only example
- `HR-Knowledge/08-SOP/Verification Workflow.md` — smoke-test admin reference

## Categories Sanitized
1. **Default credentials in copy-pasteable examples** — replaced the literal dev/CI seed password with `<admin-password>` / `<current-password>` placeholders in production, pre-deploy, security-hardening, and API-doc login examples. Email-only references (`admin@hr.local` with no password) were left as-is — an email is not a secret.
2. **Token-printing commands** — rewrote `curl ... | jq .accessToken` (prints the raw JWT to the terminal) as `TOKEN=$(curl ... | jq -r '.accessToken')` followed by using `$TOKEN` only in an `Authorization: Bearer $TOKEN` header, then `unset TOKEN`. Applied in `PRODUCTION_DEPLOYMENT.md`, `PRE_DEPLOYMENT_SECURITY.md`, `AUTH_SECURITY_HARDENING.md`. One historical example in `CTO_SUMMARY_HOTFIX_006.md` already used the capture-only pattern with an `<password>` placeholder — added `unset TOKEN` for consistency, left the rest unchanged.
3. **Instructive login steps in manual test procedures** — numbered "Login with `<email>` / `<literal password>`" steps in mobile manual-test docs and two historical CTO summaries were changed to reference the seed script (`apps/api/prisma/seed.ts`) with `<admin-email>` / `<admin-password>` placeholders instead of the literal value.
4. **Production-facing credential notes** — `QA_T088_ADMIN_WEB_PRODUCTION_QA.md`'s "default admin credentials" line was rewritten to state the production password was rotated (ADR-031) and point to the self-service change-password flow, rather than listing a value to use against production.
5. **Response/example JSON** — `"accessToken": "eyJ..."`-style examples that looked like the start of a real token were normalized to the existing safe convention `"accessToken": "<JWT>"` (matching `MOBILE_AUTH.md`'s prior style).
6. **Added guidance note** — `API_DOCUMENTATION.md` now includes: "Never print, store, or commit passwords/tokens. Keep tokens in memory only and unset them after use."

## Examples of Unsafe Patterns Removed (no password values repeated)
- `curl -X POST .../auth/login -d '{"email":"...","password":"<old-default>"}' | jq .accessToken` → replaced with a `TOKEN=$(... | jq -r '.accessToken')` capture, a non-printing usage check, and `unset TOKEN`.
- `"Login with `admin@hr.local` / `<old-default>`"` manual-test steps → replaced with a pointer to the seed script and generic placeholders.
- `"accessToken": "eyJ..."` (token-shaped literal) → `"accessToken": "<JWT>"`.
- A "Default admin credentials (rotate before production): `<email>` / `<old-default>`" line in a production QA doc → replaced with a note that production was already rotated and points to the self-service flow.

## Deliberately Left Unchanged (reviewed, classified as safe)
- `Authorization: Bearer <token>`, `<JWT>`, `<admin-token>`, `<accessToken>` — already-safe placeholders.
- `{ accessToken, user }`, `"accessToken": string` — field-name/API-shape documentation, not credential values.
- `รหัสผ่านใหม่` / "New Password" — UI labels, not secrets.
- `docs/E2E_TESTING.md`, `docs/CI_CD.md`, `docs/SECURITY_REVIEW_CHECKLIST.md`, `docs/PRODUCTION_BASELINE_T078.md`, `HR-Knowledge/01-START-HERE/Current Status.md`, `HR-Knowledge/04-DOMAINS/Auth/Auth Module.md`, `docs/adr/ADR-031-...md` — these document the actual dev/CI seed default as a factual reference table/fixture and already carry an explicit "dev-only" / "never use in production" / "rotated in production" warning immediately adjacent. Replacing the value here would make the doc factually wrong about what the seed script does; the risk these rows describe is already called out, not encouraged.
- Historical CTO summaries (`CTO_SUMMARY_T050.md`, `CTO_SUMMARY_T043.md`, `CTO_SUMMARY_T052.md`, `CTO_SUMMARY_HOTFIX_SEC_002.md`, `CTO_SUMMARY_T092_KNOWLEDGE_ADR_SYNC.md`) whose credential mentions are **retrospective verification records** ("VERIFIED", "FAILS", "remains unchanged") rather than instructions to follow — per the task's own rule 5 ("older CTO summaries can be historical... do not rewrite history excessively"), these were left as-is except where a summary contained an actionable numbered "do this" step (T-047, T-049), which were sanitized.
- `docs/MOBILE_ROLE_BASED_UX.md:114` — states a testing limitation as fact ("only one seed user exists"), not an instruction to use the value.

## Verification Result
```
git diff --check                                            → PASS (no whitespace errors)
grep -RIn "admin1234" docs HR-Knowledge (manual review)      → PASS (all remaining hits are dev/CI
                                                                 reference tables or historical
                                                                 verification records with adjacent
                                                                 prod warnings — see "Deliberately
                                                                 Left Unchanged" above)
grep unsafe token-print patterns (jq .accessToken,
  jq -r '.accessToken' as final pipe stage, cat /tmp/login,
  /tmp/login.json)                                            → PASS (zero remaining hits)
grep real-looking Bearer tokens
  (Bearer eyJ|accessToken":"eyJ|refreshToken":"eyJ)           → PASS (zero hits, before and after)
Markdown lint                                                 → N/A (no markdownlint config/script
                                                                 present in this repo)
./scripts/verify.sh                                           → NOT RUN (docs-only change, no
                                                                 code/schema touched; skipped per
                                                                 task's "optional" guidance)
```

## Issues Found
None. No runtime code, Prisma schema, or migrations were touched. No secrets, passwords, hashes, or real tokens were added to any file. No git mutation (`add`/`commit`/`push`/`tag`) was performed. No Docker commands were run.

## Risk
Low

## Decision
PASS

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No endpoints added/changed — docs only. |
| RBAC impact | None. |
| Data privacy impact | None. No new PII exposed. |
| Password/token/hash impact | No password, hash, or token value was added anywhere. Existing literal dev/CI seed-password mentions were replaced with placeholders in copy-pasteable examples; the small set left unchanged already carry adjacent "dev-only / rotated in production" warnings (see above). Unsafe token-printing (`jq .accessToken` as a terminal pipe stage) was replaced with in-memory capture + `unset` in every doc where it appeared. |
| Mobile security impact | None — mobile token-storage code and API-call behavior unchanged; only doc examples updated. |
| Dependency/advisory impact | None. No packages added or changed. |
| Secrets/logging check | Manual grep for `admin@hr.local\|admin1234\|jq \.?accessToken\|Bearer eyJ\|accessToken.:.eyJ\|refreshToken.:.eyJ` performed before and after; no real secret, hash, or JWT-shaped value was introduced by this change. |
| New endpoints protected | None — no endpoints added. |
| Risk level | LOW |
| Security decision | PASS |

**Security FAIL conditions checked — none triggered:** no password/token/hash exposed; no endpoint changes; no RBAC change; no secret committed; no dependency change; no destructive Docker command run; no fabricated advisory details.

## Next Step
SEC-ATT-001

## Recommended Commit Message
```
docs(security): sanitize legacy credential examples

Replace literal dev/CI seed-password examples and unsafe
accessToken-printing commands in docs/ and HR-Knowledge/ with
placeholders and in-memory-only token capture, aligned with the
v1.2.67 SUPER_ADMIN password rotation (ADR-031). Dev/CI reference
tables that already carry an explicit "never use in production"
warning, and historical CTO-summary verification records, were
left unchanged.
```
