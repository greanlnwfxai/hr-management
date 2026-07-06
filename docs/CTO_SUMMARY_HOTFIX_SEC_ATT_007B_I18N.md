# CTO Summary

## Step
HOTFIX-SEC-ATT-007B-I18N — Thai localization for Admin Attendance Risk Review Queue UI

## Status
PASS

## Scope
Frontend/Admin Web only. Production visual check on `/attendance/risk-reviews`
(shipped in SEC-ATT-007B, commit `f601b2b`, tag `v1.2.80-sec-att-007b-risk-review-ui`)
found several labels still hardcoded in English regardless of the selected
language: the page subtitle, all filter labels/placeholders/options, table
column headers, badge values (risk level / status / result), the action
column, the "Detail" button, the pagination/count summary text, and every
label/placeholder/button inside the detail/review modal. This task replaces
every hardcoded English string on that page with translation keys in
`apps/web/lib/i18n.ts`, adds Thai display-label helpers for the four
enum-like values (`riskLevel`, `status`, `result`, `action`), and keeps
English fully available through the existing language switch.

**Explicitly NOT done** (per task guardrails): no backend change, no
database/schema/migration change, no API behavior change, no auth/RBAC
change, no destructive Docker command, no git mutation (no `git add`/
`commit`/`push`/`tag`/`merge`).

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_SEC_ATT_007B_I18N.md` — this file

## Files Modified
- `apps/web/lib/i18n.ts` — added ~50 new `risk_reviews_*` translation keys
  (both `en` and `th`) covering the subtitle, filter labels/placeholders/
  options, table headers, pagination words, modal/detail labels, review-form
  labels/placeholder, and toast messages; added 4 new enum-label helper
  functions (`riskLevelLabel`, `riskReviewStatusLabel`, `riskReviewResultLabel`,
  `riskReviewActionLabel`) following the existing `leaveTypeLabel`/
  `attendanceStatusLabel`/`roleLabel` pattern, using the exact Thai values
  specified in the task brief (e.g. `HIGH` → `สูง`, `PENDING` → `รอดำเนินการ`,
  `FLAGGED` → `ถูกแจ้งเตือน`, `CLOCK_IN` → `เช็กอิน`)
- `apps/web/app/(app)/attendance/risk-reviews/page.tsx` — replaced every
  hardcoded English string with `t(...)` calls or the new enum-label
  helpers; `riskLevelBadge`/`statusBadge`/`resultBadge` now take a `lang`
  parameter and render the translated label instead of the raw enum value;
  the raw `rec.action`/`detail.action` value is now rendered through
  `riskReviewActionLabel`; added `data-testid="btn-apply-filters"` to the
  Apply Filters button so tests don't depend on its (now localized) label
- `apps/web/e2e/attendance-risk-reviews.spec.ts` — updated 3 assertions that
  previously matched the hardcoded English button/heading text
  (`getByRole('button', { name: 'Apply Filters' })`,
  `getByRole('heading', { name: 'Risk Review Detail' })`) to use the
  existing `data-testid` selectors instead, so the tests pass regardless of
  which language is active (default is Thai per `DEFAULT_LANGUAGE` in
  `lib/i18n.ts`)
- `HR-Knowledge/01-START-HERE/Current Status.md` — added a short note under
  "Next Recommended Task" recording this hotfix

No backend file was changed — no `apps/api/**` diff (confirmed by `git status`
equivalent: only the files listed above were touched).

## Verification Result
```
./scripts/verify.sh          → PASS (API build, Prisma schema valid, Web build —
                                 TypeScript compiled cleanly with the new i18n
                                 keys/helpers, /attendance/risk-reviews still
                                 appears in the Next.js build route table)
./scripts/docker-verify.sh   → PASS (stack rebuilt with the new web image;
                                 api/db/web/mobile all healthy/reachable;
                                 non-destructive, stack left running per policy)
./scripts/api-smoke-test.sh  → PASS (login, /auth/me, /employees, /departments,
                                 /positions, /attendance, /leave, /leave-balances,
                                 /dashboard, unauthenticated 401 check — all
                                 unaffected, confirming zero backend regression)
./scripts/security-review.sh → PASS (dependency audit + secret scan; only the
                                 pre-existing, already-accepted Multer findings —
                                 no new package added by this task)
```

**Live visual verification** — ran `npx playwright test
e2e/attendance-risk-reviews.spec.ts` against the rebuilt Docker web image.
4 of 7 tests passed; the Playwright snapshot for the 3 failures shows the
page rendering fully in Thai as intended:

```
heading "ตรวจสอบความเสี่ยงการลงเวลา"                  (page title)
paragraph "ตรวจสอบการลงเวลาเข้า-ออกที่ถูกระบบป้องกันการปลอมแปลง..." (subtitle)
combobox "สถานะ": ทุกสถานะ / รอดำเนินการ / ตรวจสอบแล้ว / อนุมัติแล้ว / ปฏิเสธแล้ว / ละเว้นแล้ว
combobox "ระดับความเสี่ยง": ทุกระดับ / ต่ำ / ปานกลาง / สูง / วิกฤต
combobox "ผลลัพธ์": ทุกผลลัพธ์ / ผ่าน / ถูกปฏิเสธ / ถูกแจ้งเตือน
combobox "การดำเนินการ": ทุกการดำเนินการ / เช็กอิน / เช็กเอาต์ / เช็กอินนอกสถานที่ / เช็กเอาต์นอกสถานที่
textbox "รหัส UUID ของพนักงาน", button "ใช้ตัวกรอง"
```
This confirms every required label and enum value from the task brief
renders correctly in Thai. I also confirmed the enum Thai strings
(`วิกฤต`, `ถูกแจ้งเตือน`, `เช็กอินนอกสถานที่`) are present in the actual
compiled JS bundle served by the running `hr-web` container (`docker exec
hr-web grep ...`), not just in source.

## Issues Found
The 3 Playwright failures are **not related to this task's changes**. Each
failed on `โหลดรายการความเสี่ยงล้มเหลว` ("Failed to load risk reviews") —
the page's own translated error state — because the browser's `GET
/attendance/risk-reviews` call went to `https://hr.eds-center.com/api/...`
instead of `http://localhost:4002`. Root cause (confirmed via the
Playwright trace's network log): the local, git-ignored root `.env` bakes
`NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api` into the Dockerized web
build at Next.js build time. This is the same pre-existing environment
issue already documented in `docs/CTO_SUMMARY_SEC_ATT_007B.md` §8 and
`HR-Knowledge/01-START-HERE/Current Status.md` — confirmed here again by
independently curling the API directly (`GET /attendance/risk-reviews` with
a fresh admin token → `200 {"data":[],...}`, works correctly), isolating the
failure to the browser-side API host, not this task's UI/i18n code or the
backend. Left untouched per the task's explicit "no backend changes" /
existing-issue guidance; not something this diff can or should fix.

## Risk
Low

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None — no auth code touched |
| RBAC impact | None — `isAdmin(user)` gate on the page unchanged |
| Data privacy impact | None — no new data field displayed; existing metadata redaction (`redactSensitive`, GPS/nonce/token denylist) unchanged |
| Password/token/hash impact | None |
| Mobile security impact | None — Admin Web only, no mobile file touched |
| Dependency/advisory impact | None — no package added/changed |
| Secrets/logging check | None — no new `console.log`/logging added; no secret/token string added to translation tables |
| New endpoints protected | None — no new endpoint added; page still calls only the existing SEC-ATT-007A `GET /attendance/risk-reviews` and `PATCH /attendance/risk-reviews/:id/review`, both already `@Roles(SUPER_ADMIN, HR_ADMIN)`-guarded |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
None queued specifically under SEC-ATT-007 — this hotfix closes out the
localization gap found in production. SEC-ATT-005/006 (native Play
Integrity/App Attest) remain DEFERRED per SEC-ATT-005A/006A pending a
native-build decision, as recorded in Current Status.md.

## Recommended Commit Message
```
fix(attendance): localize risk review queue UI to Thai (HOTFIX-SEC-ATT-007B-I18N)

Production visual check on /attendance/risk-reviews found the subtitle,
filter labels/options, table headers, badge values, action labels, the
Detail button, and the review modal still hardcoded in English
regardless of the selected language.

Adds ~50 risk_reviews_* translation keys (en/th) to lib/i18n.ts plus
four enum-label helpers (riskLevelLabel, riskReviewStatusLabel,
riskReviewResultLabel, riskReviewActionLabel) using the exact Thai
values specified for riskLevel/status/result/action, and wires every
hardcoded string in the risk-reviews page through t()/the new helpers.
English remains fully available via the existing language switch.

No raw GPS, nonce, or token value is displayed (unchanged from
SEC-ATT-007B's client-side redaction pass). No backend, schema,
migration, auth, or RBAC change.

Updated attendance-risk-reviews.spec.ts to assert on data-testid
selectors instead of hardcoded English button/heading text, since the
app defaults to Thai (DEFAULT_LANGUAGE) and those strings are now
localized.

verify.sh / docker-verify.sh / api-smoke-test.sh / security-review.sh
all PASS. Playwright run against the rebuilt Docker image confirms
every required Thai label/filter/enum renders correctly; the 3
remaining test failures reproduce the same pre-existing local
NEXT_PUBLIC_API_URL environment mismatch already documented in
CTO_SUMMARY_SEC_ATT_007B.md §8 (confirmed unrelated to this task via
direct curl against the API).
```
