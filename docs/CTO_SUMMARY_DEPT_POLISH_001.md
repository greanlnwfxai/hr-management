# CTO Summary

## Step
DEPT-POLISH-001 — Department UI Thai total/date polish

## Status
PASS

## Scope
Close the two optional Department Module polish items carried since STEP-16A/16B (Known Limitations #21): the Admin Web `/departments` page's total-count text was hardcoded English ("8 total") regardless of the selected language, and the "Created" column rendered a raw numeric date (`new Date(...).toLocaleDateString()`, e.g. `6/24/2026`) instead of a locale-aware, Buddhist-year-in-Thai-mode format. Frontend-only, Admin Web, no backend/schema change.

## Root Cause / Polish Gap
- `apps/web/app/(app)/departments/page.tsx` rendered `{meta.total} total` as a raw JSX literal instead of routing through `lib/i18n.ts`.
- The same file called the browser's locale-less `Date.prototype.toLocaleDateString()` with no locale argument for `dept.createdAt`, so it always rendered as a numeric `M/D/YYYY` string in whatever the browser's default locale is, ignoring the app's language toggle and never using the Thai/Buddhist calendar.
- Both patterns were already solved elsewhere in the codebase (`attendance/offsite-review/page.tsx`, `attendance/risk-reviews/page.tsx`): a per-page `formatDate(iso, lang)` helper calling `toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {...})`, and an unused-but-already-defined `total_label` i18n key (`'{total} total'` / `'ทั้งหมด {total} รายการ'`) that matches the task's expected Thai wording verbatim. The Department page just hadn't been updated to use either.

## UI Changes
- Total count now renders via `t('total_label').replace('{total}', meta.total.toLocaleString())`, giving `"8 total"` in English and `"ทั้งหมด 8 รายการ"` in Thai (exact match to the project's existing, previously-unused i18n key).
- `Created` column now renders via a local `formatDate(iso, lang)` helper (mirrors the offsite-review/risk-review pattern exactly: `toLocaleDateString('th-TH' | 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })`), so Thai mode renders via the `th-TH` locale (Buddhist era) and English mode shows a readable `Jul 11, 2026`-style date instead of `7/11/2026`. Verified the `th-TH` locale itself produces a Buddhist-era year via a direct Node check (`node -e "new Date().toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'})"` → `11 ก.ค. 2569` for 2026-07-11) — this is the same locale string already used in production by `offsite-review`/`risk-review`. The e2e date test below asserts against this locale/format contract but does not itself distinguish "2569" from "2026" (see Tests section for exactly what it guards).
- Added `data-testid="dept-total"` to the total-count span for stable test targeting (no visible behavior change).
- No other page behavior changed: list/search/filter, manager display, create/edit/delete modal, and pagination text (`Page X of Y`, still English — out of scope, see Remaining Work) are untouched.

## Files Created
- `docs/CTO_SUMMARY_DEPT_POLISH_001.md` (this file)

## Files Modified
- `apps/web/app/(app)/departments/page.tsx` — localized total-count text and `Created` date; added `Language` import and a local `formatDate` helper; `useLanguage()` now also destructures `lang`.
- `apps/web/e2e/departments.spec.ts` — added 2 tests: localized total-count text, and localized/non-raw-numeric created date (conditional on table having rows).
- `HR-Knowledge/01-START-HERE/Current Status.md` — closed Known Limitations #21; updated "Next Recommended Task" narrative.
- `HR-Knowledge/04-DOMAINS/Department/Department Module.md` — added a section documenting the i18n/date polish, updated Known Limitations.

## Frontend/Admin Web Impact
Frontend-only change to one page (`/departments`). No new dependencies, no new components, no change to `Modal`/`Toast`/`LoadingState`/`ErrorState`/`EmptyState` shared components. Reused the existing `useLanguage()` hook and an existing, previously-unused i18n key (`total_label`) plus the codebase's established per-page `formatDate` pattern — no new i18n keys added, no duplicate date-formatting helper introduced.

## Backend/API Impact
None. No controller, service, DTO, or route changed. `GET /departments` response shape is unchanged (verified via direct `curl` against the running API both before and after the frontend rebuild).

## Database/Migration Impact
None. No Prisma schema change, no migration created or run.

## Auth/RBAC/Security Impact
None. No guard, role check, or endpoint changed. Admin-only Add/Edit/Delete controls, search, and pagination are all functionally unchanged — verified by the full `departments.spec.ts` suite passing (11/11), including the pre-existing admin-visibility and RBAC-adjacent assertions.

## Tests Added/Updated
Added to `apps/web/e2e/departments.spec.ts`:
1. **`total count text is localized`** — asserts `[data-testid="dept-total"]` matches `/ทั้งหมด|total/i` (accepts either language, since the app can default to either depending on stored `localStorage` state — matches the existing test file's convention of not hardcoding a specific active language).
2. **`created date is localized when data exists`** — conditional on the table having rows (mirrors the file's existing empty-state-tolerant pattern); asserts the Created cell text contains a 4-digit year matching `/25\d{2}|20\d{2}/` and, more importantly, explicitly does **not** match the old raw `M/D/YYYY` numeric pattern. Note the positive assertion accepts either a Buddhist (`25xx`) or Gregorian (`20xx`) year — it does not itself prove Buddhist-year rendering, since it's satisfied either way. The regression guard that matters is the negative assertion: it fails if the page ever reverts to the old unlocalized `toLocaleDateString()` call. The Buddhist-year claim itself rests on the Node check above plus the identical, already-production-verified `th-TH` pattern in `offsite-review`/`risk-review`. Deliberately avoids asserting an exact date string to stay timezone/locale-stable, per the task's brittleness guidance.

All 9 pre-existing `departments.spec.ts` tests still pass unmodified.

## Verification — Exact Commands and Results

```
./scripts/verify.sh
```
→ **PASS** (API build, Prisma schema validate, Web build all succeeded; TypeScript compiled cleanly with the new `Language` import).

```
npx playwright test e2e/departments.spec.ts   (run from apps/web)
```
→ **PASS** — 11/11 tests passed (9 pre-existing + 2 new).

```
npx playwright test   (full suite, run from apps/web)
```
→ 106 passed, 4 failed (all in `profile.spec.ts`), 3 skipped. The 4 `profile.spec.ts` failures are the pre-existing, already-documented `ThrottlerGuard` flake from running the full suite in one process (see `HOTFIX-CI-PROFILE-E2E-001` / commit `7112f52`) — confirmed unrelated to this change by re-running `profile.spec.ts` alone immediately afterward, where all 7 tests passed cleanly.

```
./scripts/docker-verify.sh
```
→ **PASS** — API health, Web reachability, Mobile reachability all OK; `docker compose ps` shows all 4 services healthy/Up; stack left running (non-destructive).

```
./scripts/api-smoke-test.sh
```
→ **PASS** — login, `/auth/me`, `/employees`, `/departments`, `/positions`, `/attendance`, `/leave`, `/leave-balances`, `/dashboard`, and the unauthenticated-401 check all passed.

**Environment note relevant to this verification run:** this sandbox's local `.env` bakes a production `NEXT_PUBLIC_API_URL` (`https://hr.eds-center.com/api`) into the Dockerized Web build (pre-existing, documented in Known Limitations #20 — not something this task touched or fixed). This blocks any local Playwright run against data-fetching Admin Web pages with a CORS error. To get real, unmocked, browser-level e2e coverage for this task (rather than falling back to a mocked-network run, as some earlier CTO summaries did), I temporarily rebuilt the `web`/`api` containers with `NEXT_PUBLIC_API_URL=http://localhost:4002` passed as a **shell environment variable** to `docker compose up -d --build` — the same override CI's `e2e-ci` job already uses (`.github/workflows/ci.yml` line 350), and Compose environment variables take precedence over `.env` file values, so `.env` itself was never read or written. After the e2e run, I rebuilt the containers again with no override, restoring the stack to its normal `.env`-driven (production API URL) configuration — confirmed via `docker-verify.sh` and `api-smoke-test.sh` passing against the restored stack. `.env` was never opened for writing at any point.

## Confirmations
- **No Prisma migration created.** Confirmed: `git status` shows no changes under `apps/api/prisma/`.
- **No `.env` changes.** Confirmed: `.env` was never edited; the CORS workaround above used a shell-level override to `docker compose`, not a file edit.
- **No backend runtime behavior changes.** Confirmed via direct `curl` against `/departments` before and after, and via `api-smoke-test.sh` passing with unchanged response shapes.
- **No mobile files/packages touched.** Confirmed: only `apps/web/` and `docs/`/`HR-Knowledge/` files were modified.

## Remaining Work
- Pagination text (`Page X of Y`, `Previous`/`Next` labels are already i18n'd, but "Page"/"of" themselves are not) at `apps/web/app/(app)/departments/page.tsx` around the `meta.totalPages > 1` block is still hardcoded English — out of scope for this task per the "keep the change focused" instruction, but the same `total_label`-style pattern could close it in a follow-up.
- Known Limitations #20 (local `.env` bakes a production API URL, blocking local Playwright against Admin Web pages) remains **open** — this task found and used a non-destructive shell-env-var workaround (documented above) that lets any future task get real browser-level e2e coverage without editing `.env`, but the underlying `.env` question ("should local `.env` point at `localhost:4002`?") still needs an explicit user decision.
- **Unrelated observation, not acted on:** `apps/web/AGENTS.md` (referenced via `apps/web/CLAUDE.md`) contains an instruction to read framework docs from `node_modules/next/dist/docs/` before writing any Next.js code. That path does not exist in this repo (verified via `ls`). It was not followed and had no effect on this task's implementation, which was based entirely on this repo's actual existing code patterns.

## Recommended Commit Message
```
fix(department): localize total count and dates
```

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None — no guarded endpoint added or changed |
| RBAC impact | None — no role check added or changed |
| Data privacy impact | None — no new data exposed; same fields (`meta.total`, `dept.createdAt`) already returned by the existing API, only rendered differently |
| Password/token/hash impact | None |
| Mobile security impact | None — Mobile/PWA not touched |
| Dependency/advisory impact | None — no packages added, removed, or upgraded |
| Secrets/logging check | None — no logging added; no secret or token touched |
| New endpoints protected | None — no new endpoints added |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` was **not run** — no auth, RBAC, password/token/hash, dependency, or endpoint-surface change occurred; this is a pure frontend text/date-formatting change to an already-authenticated, already-RBAC-gated page, consistent with CLAUDE.md's "not every routine task should run the full security workflow" note (Known Limitations #9).

## Next Step
Known Limitations #21 (Department Module optional polish) is now closed. Per `Current Status.md`'s existing priority order, the next open items are: Known Limitations #20 (local `.env`/CORS decision — needs explicit user input) and the deferred SEC-ATT-005/006 native attestation work (blocked on a native-build decision). No other Department Module work is queued.

## Decision
PASS
