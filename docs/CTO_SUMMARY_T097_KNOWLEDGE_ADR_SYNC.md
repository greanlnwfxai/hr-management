# CTO Summary

## Step
T-097 — HR-Knowledge / ADR Sync after v1.2.85–v1.2.89

## Status
PASS

## Purpose of Sync
Bring `HR-Knowledge/` and the ADR pack up to date with five shipped
releases (`v1.2.85`–`v1.2.89`) that closed out mobile approved-leave display,
off-site submit-path normalization, off-site attendance review, and a CI
flakiness fix — none of which had been reflected in the knowledge base yet.
Docs/knowledge-only task; no runtime, API, schema, or test-code changes.

## Source Tags Covered
- `v1.2.85-hotfix-mobile-leave-calendar` (HOTFIX-MOBILE-LEAVE-CALENDAR-001)
- `v1.2.86-hotfix-mobile-react-mismatch` (HOTFIX-MOBILE-REACT-MISMATCH-001)
- `v1.2.87-hotfix-mobile-leave-attendance` (HOTFIX-MOBILE-LEAVE-ATTENDANCE-001)
- `v1.2.88-req-002e-offsite-mobile-submit-normalization` (REQ-002E-F1)
- `v1.2.89-req-002f-offsite-review-ui` (REQ-002F, plus HOTFIX-CI-PROFILE-E2E-001 included in the same tag)

Also reconciled: the ADR/release-timeline gap between `v1.2.72` (the last
knowledge sync) and `v1.2.85` — the SEC-ATT-001–007B pack and STEP-16A/16B
Department Module closure — which had shipped but were only ever cross-linked
individually, not summarized as a group in `Current Status.md`'s release
timeline.

## Files Created
- `docs/adr/ADR-033-offsite-review-access-scope-and-ci-throttle-policy.md` — full ADR
- `HR-Knowledge/03-ADR/ADR-033 Off-site Review Access Scope and CI Throttle Policy.md` — concise ADR
- `docs/CTO_SUMMARY_T097_KNOWLEDGE_ADR_SYNC.md` (this file)

## Files Modified
- `HR-Knowledge/01-START-HERE/Current Status.md` — bumped to v1.2.89, added a
  `Release Timeline: v1.2.72 – v1.2.89` table, closed out REQ-002E/REQ-002F
  status, added the CI-throttle-hotfix narrative paragraph, added 4 new
  Known Limitations rows (leave/me overlap now explicitly named as
  HOTFIX-LEAVE-ME-OVERLAP, off-site `reviewedBy` gap, Playwright/`.env`
  mismatch, Department optional polish), bumped ADR count 32→33
- `HR-Knowledge/03-ADR/ADR Index.md` — added ADR-033 row + source-file entry,
  bumped count and "added through" tag reference
- `HR-Knowledge/04-DOMAINS/Attendance/Off-site Work Mode.md` — added a
  status banner (CLOSED end-to-end), a new "Admin Web Off-site Review UI
  (REQ-002F)" section (route, RBAC incl. MANAGER dept-scope/no-self-review,
  privacy-safe display), a Known Limitations row for the `reviewedBy` gap,
  and an ADR-033 cross-link
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — added a short
  closure/status line under the existing off-site-review UI paragraph (no
  rewrite — that paragraph was already correct from REQ-002F), one Known
  Limitations row, one ADR-033 cross-link
- `HR-Knowledge/04-DOMAINS/Leave/Leave Request Module.md` — added a "Mobile
  Display (STEP Connect)" section describing the Home/Calendar/Attendance
  approved-leave overlay, and a Known Limitations row naming
  HOTFIX-LEAVE-ME-OVERLAP explicitly (containment-vs-overlap bug in
  `buildDateFilter`)
- `HR-Knowledge/05-API/API Route Index.md` — corrected a stale RBAC fact
  (off-site review endpoints listed as SUPER_ADMIN/HR_ADMIN only; MANAGER has
  been authorized, department-scoped, since before this sync) and added a
  note flagging that this table is still missing the SEC-ATT-004/007A
  endpoints (out of this sync's range — left as a named gap, not silently
  fixed, to avoid a wider unplanned audit)

## Key Knowledge Updates
- **Off-site attendance is now documented as fully CLOSED**: REQ-002C
  (backend), REQ-002E (Mobile/PWA UI + submit normalization, real-use QA
  passed), REQ-002F (Admin Web review UI) — no remaining blocker.
- **Mobile approved-leave display** is documented as consistent across
  Home/Calendar/Attendance (three sequential hotfixes), with the
  containment-vs-overlap `GET /leave/me` gap named as open follow-up work
  (`HOTFIX-LEAVE-ME-OVERLAP`) in both `Current Status.md` and
  `Leave Request Module.md`.
- **CI throttle hotfix** is documented as CI-only everywhere it's
  mentioned — the production `THROTTLE_LIMIT=100` default and every other
  CI job are explicitly called out as unchanged, each time.
- Remaining work list consolidated into `Current Status.md`'s Known
  Limitations table (rows #18–21) and its "Next Recommended Task" opening
  paragraph, replacing scattered prose-only mentions.

## ADR Updates
Added **ADR-033 — Off-site Review Access Scope, GPS Privacy Display, and CI
Throttle Policy** (both the full `docs/adr/` version and the concise
`HR-Knowledge/03-ADR/` version). This is a single ADR covering three related
decisions from REQ-002F and its CI follow-up, per the task's "don't create
excessive ADRs" instruction:
1. Why the off-site review UI keeps MANAGER access (extends ADR-023's
   department-scoping mechanism; the backend already authorized it, so
   narrowing the UI would have hidden a capability)
2. Why raw GPS is never shown (extends ADR-020/ADR-022's no-raw-GPS
   precedent; the backend projection doesn't even fetch the coordinate
   columns)
3. Why the CI e2e job's throttle limit (500) is higher than production's
   (100) — a test-execution-volume accommodation, explicitly not a
   production security relaxation, following the existing
   `LOGIN_THROTTLE_LIMIT` precedent

ADR count: 32 → 33. Updated in `Current Status.md` and `ADR Index.md`
(table, policy-count sentence, and the `docs/adr/` source-file tree).

## Runtime Impact
None. No application source, DTO, controller, service, migration, or
frontend component file was touched. `CLAUDE.md`'s three-script verification
gate (`verify.sh`, `docker-verify.sh`, `api-smoke-test.sh`) was **not** run —
this is an explicit, deliberate skip, not an oversight: the gate exists to
catch build/runtime regressions, and this task touches zero files under
`apps/`, `scripts/`, or `docker-compose.yml`, so there is no runtime surface
for those scripts to exercise. `git diff --stat` (below) confirms the changed
file set is entirely `HR-Knowledge/**` and `docs/adr/**` markdown.

## Database Impact
None. No Prisma schema, migration, or seed file touched.

## Security / RBAC / Privacy Notes
| Field | Answer |
|---|---|
| Auth impact | None — no endpoint added/changed |
| RBAC impact | None — documented an existing MANAGER grant (off-site review), did not add or change any guard/role |
| Data privacy impact | None — documented an existing no-raw-GPS behavior, did not expose or reference any new PII |
| Password/token/hash impact | None |
| Mobile security impact | None |
| Dependency/advisory impact | None — no `package.json`/lockfile touched |
| Secrets/logging check | No secrets, tokens, or credentials introduced; all placeholders/generic examples only |
| New endpoints protected | None (no endpoints added) |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` was not run — no dependency manifest, source
file, or secret-bearing file was touched; the script would not exercise
anything this change touches.

## Verification Commands and Results
```
git status                → clean except the files listed above (all HR-Knowledge/**.md and docs/adr/**.md)
git diff --stat           → 6 files changed, 105 insertions(+), 16 deletions(-); plus 3 new files (ADR-033 pair + this summary)
git diff --stat -- apps/ scripts/   → empty (confirms zero runtime-surface files touched)
```
`./scripts/verify.sh` was intentionally not run — see Runtime Impact above;
this task's own instructions call for "a lightweight check if available"
for docs-only work, and `git status`/`git diff --stat` fully cover that for
a change with no runtime surface. No production deploy and no Docker
command (destructive or otherwise) were run, per task scope.

## Remaining Work List
1. **HOTFIX-LEAVE-ME-OVERLAP** — `GET /leave/me`'s `buildDateFilter` uses
   containment instead of overlap (`apps/api/src/leave/leave.service.ts`);
   switch to `startDate: { lte: end }, endDate: { gte: start }`.
2. **Off-site reviewedBy name backend polish** — extend
   `REVIEW_SELECT` in `attendance.service.ts` to a `reviewedBy` relation
   select (no migration needed).
3. **Department optional polish** — English "8 total"-style count string,
   numeric (unformatted) department dates.
4. **Playwright local env mismatch** — local root `.env`'s
   `NEXT_PUBLIC_API_URL` points at production, breaking local browser-level
   Playwright runs against any data-fetching admin page (pre-existing,
   documented, not fixed per standing instruction not to edit `.env`).
5. **Native attestation deferred** — SEC-ATT-005 (Android Play Integrity)
   and SEC-ATT-006 (iOS App Attest/DeviceCheck) remain DEFERRED pending an
   approved native-app build decision; no PWA/WebKit entry point exists for
   either.

## Recommended Commit Message
```
docs(knowledge): sync HR status through off-site review closure

Update HR-Knowledge and ADR pack through v1.2.89: mark REQ-002E/REQ-002F
closed, document the mobile approved-leave display consistency fixes and
the CI-only e2e throttle hotfix, add ADR-033 (off-site review MANAGER
access, GPS privacy display, and CI throttle policy), and consolidate the
remaining-work list. Docs-only, no runtime/schema/API changes.
```

## PASS/FAIL Recommendation
**PASS.** All required knowledge updates are in place, cross-linked, and
consistent (verified no stale ADR-count/version references remain). The
change set is confirmed docs-only via `git diff --stat`. No fabricated
external facts were introduced — the one item the brief asserted without an
existing dedicated QA doc (mobile off-site real-use QA passing) is
attributed to the task's own stated production-verification status, not
invented as a citation to a nonexistent document.
