# CTO Summary

## Step
REQ-002F — Admin Web Off-site Review UI

## Status
PASS

## Root Cause / Missing Capability
The Admin Web off-site attendance review page already existed at
`apps/web/app/(app)/attendance/offsite-review/page.tsx` (built in an earlier,
differently-numbered task — `feat(web): add off-site attendance review page` /
`feat(attendance): enable manager off-site approval`). Backend, RBAC, list/filter,
approve/reject actions, loading/empty/error states, and GPS-privacy-safe display
were all already complete and correct.

The one real gap: **the page hardcoded all Thai copy directly in JSX** instead of
going through the app's `t()` / `lib/i18n.ts` translation system that every other
Admin Web page (`risk-reviews`, `leave`, `attendance`, `offsite`) already uses. This
meant the page ignored the language toggle — it stayed in Thai even when the user
switched to English — and violated the project i18n convention. A secondary gap:
the backend already supports filtering by `employeeId` (`QueryOffsiteReviewDto`,
already wired end-to-end in `lib/api.ts`'s `getOffsiteReview()`), but the page's
filter bar didn't expose it.

This task completed only the missing parts; it did not rebuild or redesign the page.

## Scope Completed
1. Added ~60 new translation keys (English + Thai, parity-checked) to
   `apps/web/lib/i18n.ts`, plus two label-mapping helpers
   (`offsiteReviewStatusLabel`, `offsiteReviewTypeLabel`) mirroring the existing
   `riskReviewStatusLabel`/`riskReviewActionLabel` pattern used on the Risk
   Reviews page.
2. Rewrote `apps/web/app/(app)/attendance/offsite-review/page.tsx` to use `t()`
   and `useLanguage()` throughout — page title/subtitle, access-denied message,
   filter labels, status/type badges, card labels, approve/reject modals, toasts,
   and pagination are now fully bilingual. No behavioral change to data flow,
   RBAC guard, approve/reject logic, or GPS-privacy handling.
3. Added an **Employee ID filter** (text input, UUID) wired to the already-supported
   `employeeId` query param — the only filter gap versus the backend's
   `QueryOffsiteReviewDto` (status and date-range filters already existed). No new
   query params were invented; `action/type` and `risk` filters were not added
   because the backend query DTO does not support them (type is derived
   client-side from `attendanceSource`, matching existing behavior).
4. Renamed two generic component testids (`error-state` → `error-offsite-review`,
   `empty-state` → `empty-offsite-review`) to match the scoped-testid convention
   used by every other list page (`error-risk-reviews`, `empty-leave`, etc.) for
   reliable test targeting. No other testids changed.
5. Added a new Playwright e2e spec, `apps/web/e2e/attendance-offsite-review.spec.ts`
   (9 tests: heading render, load-without-error, list/empty-state render, nav
   visibility, filter defaults, status-filter switch, employee-filter empty-state,
   approve/reject modal open + validation, and a GPS-privacy assertion) — this page
   previously had **zero** test coverage.
6. Corrected two stale facts in `HR-Knowledge/04-DOMAINS/Attendance/Attendance
   Module.md`: the `offsite-review` endpoint role list said "SUPER_ADMIN, HR_ADMIN"
   but the controller and service have allowed MANAGER (own-department, scoped,
   no self-review) since `feat(attendance): enable manager off-site approval`.
   Added a paragraph documenting the Admin Web page's existence, route, RBAC, and
   privacy behavior, mirroring the existing risk-reviews documentation paragraph.

No backend, DTO, service, or Prisma schema changes were needed — the existing
`GET/PATCH /attendance/offsite-review*` endpoints and `REVIEW_SELECT` projection
already fully supported this UI.

## Files Created
- `apps/web/e2e/attendance-offsite-review.spec.ts`
- `docs/CTO_SUMMARY_REQ_002F_OFFSITE_ADMIN_REVIEW_UI.md` (this document)

## Files Modified
- `apps/web/app/(app)/attendance/offsite-review/page.tsx` — i18n retrofit, employee
  filter, scoped testids. No RBAC, data-fetch, or approve/reject logic changes.
- `apps/web/lib/i18n.ts` — new `offsite_review_*` / `page_offsite_review*` keys
  (English + Thai, key-parity verified) and two label helper functions.
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — corrected MANAGER
  role documentation for `offsite-review` endpoints; added Admin Web UI paragraph.

## Frontend/Admin Web Impact
Route `/attendance/offsite-review` unchanged. Nav visibility unchanged (already
correctly scoped to SUPER_ADMIN, HR_ADMIN, MANAGER in `AppLayout.tsx` — matches
backend RBAC exactly; not narrowed to "SUPER_ADMIN/HR_ADMIN only" as the task's
suggested UX implied, because the backend explicitly authorizes MANAGER with its
own department-scoped, no-self-review logic. Narrowing the UI would have hidden a
capability the backend already grants correctly). Page is now fully bilingual;
default language remains Thai (`DEFAULT_LANGUAGE` unchanged).

## Backend/API Impact
None. No endpoint, DTO, service, or controller file was touched.

## Database/Migration Impact
None.

## Auth/RBAC/Security Impact
None. Client-side guard (`isAdminOrManager`) unchanged; backend remains the
source of truth for 401/403 (`@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` +
department/self-review scoping in `attendance.service.ts`, both pre-existing and
untouched).

## Endpoint and Payload Summary
No new endpoints. Existing endpoints used, unchanged:

| Method | Path | Purpose |
|---|---|---|
| GET | `/attendance/offsite-review` | List (filters: `page`, `limit`, `startDate`, `endDate`, `reviewStatus`, `employeeId`) |
| PATCH | `/attendance/offsite-review/:id/approve` | Approve `{ reviewNote?: string }` |
| PATCH | `/attendance/offsite-review/:id/reject` | Reject `{ reviewNote?: string }` |

## Privacy Notes
Confirmed unchanged and correct: the page never renders `checkInLatitude/Longitude`
or `checkOutLatitude/Longitude` — the backend's `REVIEW_SELECT` projection used by
`findOffsiteReview()` does not even select those raw GPS columns, only
`checkInAccuracyMeters`, `checkInDistanceFromCompanyMeters`,
`checkOutAccuracyMeters`, `checkOutDistanceFromCompanyMeters` (meters/km, rounded).
No token, nonce, or JWT value is rendered or logged anywhere on this page. Verified
by e2e assertion (`never renders raw GPS coordinates` test) and by direct code
inspection of `apps/api/src/attendance/attendance.service.ts`'s `REVIEW_SELECT`.

## Tests Added/Updated
- `apps/web/e2e/attendance-offsite-review.spec.ts` (new, 9 tests) — see Known
  Limitations for the local execution caveat.

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` (apps/web) | PASS — zero errors |
| `./scripts/verify.sh` | **PASS** — API build, Prisma schema valid, Web build (all 17 routes, including `/attendance/offsite-review`) |
| `./scripts/docker-verify.sh` | **PASS** — non-destructive; stack rebuilt and left running; `hr-api`/`hr-db`/`hr-web`/`hr-mobile` all healthy; API `/health` 200, Web 200, Mobile 200 |
| `./scripts/api-smoke-test.sh` | **PASS** — login, `/employees` (total=67), `/attendance` (total=40), unauthenticated `/dashboard` → 401, etc. |
| `./scripts/security-review.sh` | **PASS** — dependency audit clear (pre-existing accepted-risk Multer findings only), secret scan clear |
| `npm ls react react-dom --prefix apps/mobile` | 19.1.0 / 19.1.0 — unchanged (mobile not touched) |
| Manual browser verification (mocked API, real rendering) | **PASS** — see below |

### Manual browser verification detail
The Docker-built web image's `NEXT_PUBLIC_API_URL` is baked at build time from the
repo-root `.env`, which is explicitly the **production** config file
(`# Root .env — Production (hr.eds-center.com)`; `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api`).
Any browser-based test against the locally built `hr-web` container therefore tries
to call the production API from `http://localhost:3002`, which the production
API's CORS policy correctly rejects. **This is a pre-existing environment
condition, not introduced by this change** — verified by running the existing
`attendance-risk-reviews.spec.ts` against the same running stack, which fails on
the identical three "load data" assertions with the identical CORS error. Per the
task brief and `CLAUDE.md`, `.env` was not modified to route around this.

To still visually confirm the actual rendering (not just types/build), I ran a
throwaway Playwright script (deleted after use, not committed) against a local
`next dev` server on a spare port, with `page.route()` intercepting the
`/attendance/offsite-review` and `/auth/me` calls to return realistic mock data
(two records: one `OFFSITE_UNPLANNED` pending, one `COMPANY_GEOFENCE` mixed-checkout
approved). Confirmed by screenshot in both Thai and English:
- Page title, subtitle, filters, and nav label all switch language correctly.
- Type badges ("Off-site" / "Onsite Check-in → Off-site Check-out") and status
  badges ("Pending Review" / "Approved") render correctly per language.
- Card fields (check-in/out, location, reason, note, distance, accuracy,
  reviewed-at/note) render correctly; only free-text employee-entered data
  (reason/note/location) stays untranslated, as expected.
- Approve modal opens with translated title, prefix/name/date composition, note
  field, and Cancel/Approve buttons — all correctly localized in English.
- No raw GPS coordinates rendered in any state.
- Success toasts (the one piece of new string-concatenation logic, not just
  string relocation) render correctly in both languages: Thai
  `"อนุมัติบันทึกของ สมชาย ใจดีสำเร็จ"` (matches the original hardcoded page's
  spacing convention exactly) and English `"Rejected record for สมชาย ใจดี
  successfully"`. An initial version of this composition inserted extra spaces
  around the Thai "ของ" that don't match natural Thai running-text style
  (`"อนุมัติบันทึก ของ สมชาย ใจดี สำเร็จ"`) — caught in this same manual
  verification pass and fixed by moving the spacing into the `offsite_review_toast_for_word`/
  `offsite_review_toast_success_suffix` i18n values themselves (language-specific
  spacing) rather than hardcoding spaces in the JS template string.

## Known Limitations
1. **Local Playwright e2e execution against the Docker stack cannot reach live
   data** — this affects the new `attendance-offsite-review.spec.ts` and every
   pre-existing Admin Web e2e spec equally, because of the production-`.env`
   NEXT_PUBLIC_API_URL/CORS mismatch described above. Tests that only check DOM
   presence without requiring a successful data load (heading render, nav
   visibility, filter defaults) pass; tests requiring a successful list load fail
   with a CORS console error, matching the pre-existing `attendance-risk-reviews.spec.ts`
   failure pattern exactly. This is an environment/CI concern, not a code defect —
   see the manual mocked-render verification above for proof the page itself is
   correct. No fix is proposed here per the task's explicit instruction not to
   modify `.env`.
2. The Admin Web `offsite-review` endpoint (`REVIEW_SELECT`) does not return a
   resolved `reviewedBy` name/employeeCode, only `reviewedById` (a UUID) — the
   page does not display a reviewer name because the backend doesn't provide one
   in this projection (unlike the analogous risk-reviews endpoint, which does
   join `reviewedBy`). This is a pre-existing backend projection gap, not a
   regression; flagged here rather than silently working around it with a
   backend change, per the task's "stop and report" instruction for backend
   scope gaps. Low priority — `reviewedAt` and `reviewNote` are still shown.

   **Minimal compatibility proposal** (not implemented in this task — backend
   change, out of scope per the task brief): in
   `apps/api/src/attendance/attendance.service.ts`, extend the `REVIEW_SELECT`
   projection's `reviewedById: true` to a relation select, mirroring
   `AttendanceRiskReview`'s existing `reviewedBy` join:
   ```ts
   reviewedBy: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
   ```
   (`reviewedById: true` can stay alongside it, or be dropped once the relation
   is selected.) This requires no schema/migration change — `Attendance.reviewedBy`
   is already a declared relation (`fields: [reviewedById]`) in `schema.prisma`;
   it is purely a Prisma `select` shape change. The Admin Web page would then
   render `${reviewedBy.firstName} ${reviewedBy.lastName} (${reviewedBy.employeeCode})`
   in the "reviewed at" line, matching the risk-reviews page's existing
   `reviewedBy ? ... : t('risk_reviews_reviewed_fallback')` pattern. Estimated
   effort: under 15 minutes: one backend line + one frontend type/render change.
3. `action/type` and `risk` filters from the task's "preferred" filter list were
   not added — the backend's `QueryOffsiteReviewDto` has no such query params,
   and the task explicitly said not to invent unsupported ones. The existing
   type badge (off-site vs. mixed-checkout) remains a client-side visual
   distinction only, not a queryable filter.

## Production Deployment Notes
Frontend-only change (JS/JSX + a data file). No new environment variables, no
migration, no Docker image structural change beyond the normal web rebuild. Safe
to ship in the next Admin Web release; no coordination with Mobile/PWA needed
(mobile was not touched, off-site submit flow untouched, `react`/`react-dom`
confirmed unchanged at 19.1.0).

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no endpoint added, changed, or removed |
| RBAC impact | None — client guard and backend `@Roles` decorators both unchanged; UI nav visibility already matched backend's SUPER_ADMIN/HR_ADMIN/MANAGER authorization exactly before this task |
| Data privacy impact | None — confirmed no raw GPS, no new PII field exposed; `REVIEW_SELECT` (backend, untouched) already excludes raw lat/lon |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile app/off-site submit flow not touched; `react`/`react-dom` versions unchanged (19.1.0/19.1.0) |
| Dependency/advisory impact | No new packages added. Pre-existing accepted-risk Multer advisories only (documented in `.security-accepted-risks`) |
| Secrets/logging check | No secrets, tokens, or raw GPS logged or rendered; verified by e2e assertion and code inspection |
| New endpoints protected | None (no new endpoints) |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — frontend-only i18n/filter completion of an already-functioning, already
backend-verified page; no auth/RBAC/data-model surface touched.

## Decision
PASS

## Next Step
User-driven: real-use QA of this review page against genuine off-site attendance
records once available in a non-production environment reachable from a browser
(or via a corrected local `NEXT_PUBLIC_API_URL`/CORS setup, which is outside this
task's scope). No further Admin Web off-site work is planned unless a gap is found
during that QA.

## Recommended Commit Message
```
feat(web): localize off-site review page and add employee filter

The Admin Web off-site attendance review page (/attendance/offsite-review)
worked correctly but hardcoded all Thai text, ignoring the app's language
toggle. Retrofit it onto the existing t()/lib/i18n.ts system used by every
other Admin Web page, add the backend-supported employeeId filter that was
missing from the UI, and add e2e coverage (previously none existed).

No backend, RBAC, or data-privacy behavior changed.
```
