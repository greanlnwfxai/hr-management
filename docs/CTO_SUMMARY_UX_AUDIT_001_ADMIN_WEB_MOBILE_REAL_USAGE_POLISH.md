# CTO Summary

## Step
UX-AUDIT-001 — Admin Web + Mobile Real-Usage Polish Audit

## Status
PASS (audit-only)

## Scope
Audit-only review of Admin Web and Mobile/PWA real-usage UX after the recent stabilization work (`v1.2.95` T-098, `v1.2.96` HOTFIX-T089A, `v1.2.97` ACCESS-UX-001). No runtime, API, mobile, or migration code was written or modified. Deliverable is a prioritized polish backlog plus one flagged security finding, via static code inspection of Admin Web pages, Mobile/PWA screens, shared components, backend RBAC-relevant service code, and existing QA/CTO/status docs.

## Files Created
- `docs/UX_AUDIT_001_ADMIN_WEB_MOBILE_REAL_USAGE_POLISH.md`
- `docs/CTO_SUMMARY_UX_AUDIT_001_ADMIN_WEB_MOBILE_REAL_USAGE_POLISH.md`

## Files Modified
- `HR-Knowledge/01-START-HERE/Current Status.md` (appended a short "UX-AUDIT-001 complete" note under Next Recommended Task; audit/planning status only, no implementation claimed)

## Verification Result
Docs-only change (plus one small, non-code addition to a knowledge doc). Per the task's own verification instructions for audit-only work:
- `git status` → clean except the two new doc files and the one Current Status.md addition
- `git diff --stat` → doc-only
- `git diff --check` → clean (no whitespace conflicts)
- `git diff --stat -- apps/api/ apps/web/app apps/mobile prisma/` → **empty** (confirms zero runtime/API/mobile/migration impact)
- `./scripts/verify.sh` / `./scripts/docker-verify.sh` / `./scripts/api-smoke-test.sh` — **not run**, per task instructions ("If only docs/HR-Knowledge changed, no build/test required")
- `./scripts/security-review.sh` — **not run**, per task instructions (no runtime/security files changed by this audit itself)

## Issues Found
None in the audit process itself. The audit's *findings* (not process issues) are:
- One confirmed, live **RBAC/data-exposure security finding** (see below) — flagged separately, not folded into the polish backlog.
- One doc-accuracy note: `Current Status.md` Known Limitation #4 still lists `GET /leave/:id` as unscoped for MANAGER; verified via `git show 1be3fb9` that this was actually fixed in the same commit that introduced the limitation-table text (`HOTFIX-T089A`, `v1.2.96`) — the code is correct, only the doc text is stale. Logged as `DOC-FIX-001` in the backlog, not corrected in this pass to keep this task's Current Status.md edit minimal and scoped to adding the UX-AUDIT-001 status note.

## Risk
Low (the audit itself). The one finding surfaced (`SEC-OFFSITE-001`) is Medium risk as a future fix, and is explicitly called out as such — not resolved here.

## Decision
PASS

## Key Findings
- Admin Web and Mobile/PWA are both functionally solid with correct backend RBAC gating almost everywhere, but polish quality is inconsistent: i18n coverage, date formatting, and access-denied presentation are each implemented 3+ different ways across the app.
- **Admin Web:** highest-friction pages are `/offsite` (almost entirely hardcoded Thai, zero e2e coverage) and `employees/[id]` (hardcoded English almost everywhere outside one subcomponent). Access-denied UX has 4 incompatible implementations, one of which (`ErrorState` 403 branch) is hardcoded English and guaranteed to ignore the language toggle.
- **Mobile/PWA:** Home screen silently swallows a captured error state — a failed data fetch renders confident zeroed stat cards with no error/retry UI, unlike every other screen in the app. Manager Approval's documented Home-card entry point no longer exists in code; the only discovery path is a small header button on the Leave screen. Test coverage across all of Mobile is two pure-utility Jest files; zero screen/component tests exist anywhere, including the highest-risk clock-in/out and approval flows.
- **Security (flagged separately, verified against source, not from a summary):** `GET /off-site` (list) and `GET /off-site/:id` are not department-scoped for MANAGER (`apps/api/src/off-site/off-site.service.ts`), unlike the equivalent `/leave` endpoints already fixed in `HOTFIX-T089A`. Reachable today via the Admin Web `/offsite` page for any MANAGER. Already tracked as Known Limitation #4 but under-prioritized ("future, if needed") relative to its actual severity and the precedent set by `HOTFIX-T089A` treating the identical pattern as a same-day hotfix for `/leave`.

## Top Recommended Next Task
`UX-POLISH-001` — Mobile Home: surface the currently-swallowed `useHomeSummaries` error state (error+retry banner) instead of silently rendering fabricated zero data. Highest-reach screen in the product (every role, every session), small and additive fix, no backend/RBAC/migration touch. See Section F of the audit doc for the full rationale, including why this was chosen over the security finding and over other Admin Web candidates.

## Runtime Impact
None. No `apps/api`, `apps/web/app`, or `apps/mobile` source was modified.

## API Impact
None.

## Migration Impact
None. No Prisma schema or migration files touched.

## Security/RBAC/Privacy Impact
None from this audit's own changes (docs-only). However, this audit **discovered and reports** a live, pre-existing RBAC/data-exposure issue — see the "SECURITY FINDING" section of the audit doc and the Key Findings above. Per the task's critical workflow rules, this is reported distinctly and not bundled into the polish backlog, and this audit does not attempt to fix it (audit-only task, no code changes permitted).

## Verification Performed
Static code inspection only: direct reads of Admin Web page source, Mobile screen/hook source, shared components, backend `leave`/`off-site` controller and service source (to verify the security finding against actual code rather than a summary), relevant e2e spec files, existing QA/CTO-summary docs, `Current Status.md`, and targeted `git log`/`git show` history checks. No live environment was driven — no Docker stack started, no browser automated, no Jest/Playwright suite executed, no mobile device/simulator used. This matches the audit-only instruction and mirrors the already-documented limitation that the prior `QA_T089`/`QA_T086` manual-QA passes were themselves never confirmed executed live.

## Recommended Next 3 Tasks
1. `UX-POLISH-001` — Mobile Home error-state fix (frontend-only, mobile).
2. `UX-POLISH-002` — Consolidate Admin Web's 4 access-denied UX variants; fix `ErrorState`'s hardcoded-English 403 branch (frontend-only, web).
3. `UX-POLISH-003` — i18n retrofit of Admin Web `/offsite` page + add missing e2e coverage (frontend-only, web).

*(Tracked separately, recommended for equal-or-higher scheduling priority: `SEC-OFFSITE-001` — department-scope `GET /off-site` for MANAGER, mirroring `HOTFIX-T089A`. Backend-touching, Medium risk, requires redeploy — intentionally not one of the "3 polish tasks" above.)*

## PASS/FAIL Recommendation
**PASS.** The audit fulfilled its scope: inspected both apps' real-usage UX, cross-referenced existing QA/CTO docs and test coverage, produced a prioritized, risk-classified polish backlog, and correctly separated out a live security finding rather than folding it into polish work. No code was changed. No production redeploy is required for this audit itself.

## Recommended Commit Message
```
docs(ux): audit admin and mobile real-usage polish
```
