# CTO Summary

## Step
REQ-002E-F1 — Normalize off-site submit path and require checkout note

## Status
PASS

## Root Cause / Gap Found
A REQ-002E audit (this session, prior turn) found the off-site Mobile/PWA UI functionally complete but with two concrete gaps against the product/security spec:

1. **`offsite-checkout.tsx`'s `note` field was optional in the UI**, even though the product requirement is that off-site actions always carry a reason/note. (Check-in already satisfied this via its required `reason` field; check-out had no equivalent required field.)
2. **`offsite-checkin.tsx` and `offsite-checkout.tsx` called `clockInOffsite`/`clockOutOffsite` directly**, duplicating GPS-fetch/submit logic instead of using the already-built `useOffsiteAttendance.ts` hook. The hook was the only code path that attached `timezoneOffsetMinutes` and the SEC-ATT-004 replay nonce — since the screens never called it, `grep` confirmed **zero call sites** used the hook, so real off-site submissions were missing `timezoneOffsetMinutes` and `nonce` entirely.

## Scope Completed
Mobile app (`apps/mobile/`) only. No backend, database, or Admin Web changes.

1. Extracted validation and payload-building into a new pure-logic module (`apps/mobile/src/utils/offsiteAttendance.ts`), matching the existing `leaveOverlay.ts` pattern of testable, framework-free helpers.
2. Rewired `useOffsiteAttendance.ts` to build payloads through those shared helpers instead of inline object literals, and made `performOffsiteClockOut`'s `note` parameter required (TypeScript-level) instead of optional.
3. Rewired both `offsite-checkin.tsx` and `offsite-checkout.tsx` to submit through `useOffsiteAttendance()` instead of calling the API client functions directly — this is the first time either screen actually used the hook.
4. Added a required-note validator to `offsite-checkout.tsx` (min 3 chars, Thai error message, same pattern as check-in's `reason` field) and updated its label/placeholder to reflect the requirement.
5. Added a client-side GPS-accuracy guard (`> 100m` rejected) **inside the shared hook** (not duplicated per-screen) so a low-accuracy fix is still blocked before any network call, preserving the pre-existing UX even though the screens no longer do their own pre-submit accuracy check.
6. Removed now-dead duplicate `translateError()` functions from both screens — `useOffsiteAttendance.ts`'s existing `translateOffsiteError()` is a superset of both and is now the single source of Thai error copy for off-site actions.

## Files Created
| File | Purpose |
|---|---|
| `apps/mobile/src/utils/offsiteAttendance.ts` | Pure validation (`validateWorkLocationName`, `validateOffsiteReason`, `validateOffsiteNote`) and payload-building (`buildOffsiteClockInPayload`, `buildOffsiteClockOutPayload`) helpers, shared by the hook and both screens |
| `apps/mobile/src/utils/offsiteAttendance.test.ts` | Unit tests for the above (18 test cases) |

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/src/hooks/useOffsiteAttendance.ts` | Builds payloads via the new shared helpers instead of inline literals; `performOffsiteClockOut(note: string)` — `note` is now required, not optional; added a `MAX_ACCURACY_METERS = 100` client-side guard in both `performOffsiteClockIn`/`performOffsiteClockOut`, run right after `getLocation()` and before the nonce fetch/API call |
| `apps/mobile/app/offsite-checkin.tsx` | Submits via `useOffsiteAttendance().performOffsiteClockIn(...)` instead of calling `clockInOffsite` directly; dropped the local fresh-GPS-refetch/low-accuracy/translate-error logic (now centralized in the hook); mount-time GPS pill kept as an informational preview only (no longer gates submission); `validateFields()` now delegates to the shared validators |
| `apps/mobile/app/offsite-checkout.tsx` | Same submit-path change via `performOffsiteClockOut(note)`; added required-note validation (`validateOffsiteNote`, min 3 chars) with a Thai field error, changed the label from "หมายเหตุ (ไม่จำเป็น)" to "เหตุผล/หมายเหตุ *" and the placeholder to prompt for a reason; added `inputError`/`fieldError` styles (previously only present in the check-in screen) |

## Frontend/Mobile Impact
- Off-site check-out now blocks submission until a note (≥3 chars, Thai-validated) is entered — matches check-in's existing reason requirement.
- Both off-site screens now route through one shared hook for the actual submit, eliminating the duplicate GPS/nonce/payload logic that had drifted (check-out was missing `timezoneOffsetMinutes`/`nonce` in practice).
- **Behavior change, by design:** a low-accuracy GPS reading is now rejected inside the hook (same Thai message, same effect) rather than in per-screen code — net behavior is unchanged for the user, but the check now lives in one place instead of two.
- Normal (on-site) check-in/check-out is untouched — `home.tsx`, `useAttendance.ts`, and the geofence modal flow were not modified.

## Backend/API Impact
None. `POST /attendance/offsite/clock-in` and `/clock-out` and their DTOs are unchanged. The task intentionally left `note` optional in `OffsiteClockOutDto` — the requirement is enforced in the mobile UI layer only, per the task's explicit "backend DTO can remain optional" instruction.

## Database/Migration Impact
None.

## Auth/Security Impact
- No new or changed endpoints; no RBAC change.
- No raw GPS coordinates, nonce, or token values are logged or displayed anywhere in the modified files (verified by inspection and by `./scripts/security-review.sh`'s secret scan).
- The new client-side accuracy guard means a bad-accuracy fix never leaves the device on the off-site path — previously such a reading would reach the server and be rejected by the DTO's `@Max(100)` at the `ValidationPipe` (before the service or any `AttendanceRiskReview`/audit logic runs), so this is a UX/efficiency improvement, not a security-relevant behavior change; the server-side constraint is unchanged and still authoritative.
- `./scripts/security-review.sh` automated checks (dependency audit, secret scan) passed; manual checklist items reviewed by inspection (no new endpoints, no RBAC change, no PII exposure, no secrets in logs).

## Off-site Payload Summary — Before / After

**Check-in** (`POST /attendance/offsite/clock-in`)
| Field | Before | After |
|---|---|---|
| `latitude`/`longitude`/`accuracy` | ✅ sent | ✅ sent (unchanged) |
| `capturedAt` | ✅ sent | ✅ sent (unchanged) |
| `platform` | ✅ sent | ✅ sent (unchanged) |
| `workLocationName`/`reason` | ✅ sent (required in UI) | ✅ sent (required in UI, unchanged) |
| `note` | ✅ sent when provided (optional) | ✅ sent when provided (optional, unchanged) |
| `timezoneOffsetMinutes` | ❌ **not sent** — screen bypassed the hook | ✅ sent |
| `nonce` | ❌ **not sent** — screen bypassed the hook | ✅ sent when issuance succeeds (best-effort, per SEC-ATT-004) |

**Check-out** (`POST /attendance/offsite/clock-out`)
| Field | Before | After |
|---|---|---|
| `latitude`/`longitude`/`accuracy` | ✅ sent | ✅ sent (unchanged) |
| `capturedAt` | ✅ sent | ✅ sent (unchanged) |
| `platform` | ✅ sent | ✅ sent (unchanged) |
| `note` | Optional, sent only if non-empty | **Required** — UI blocks submit below 3 chars, always sent |
| `timezoneOffsetMinutes` | ❌ **not sent** | ✅ sent |
| `nonce` | ❌ **not sent** | ✅ sent when issuance succeeds |

## Tests Added/Updated
`apps/mobile/src/utils/offsiteAttendance.test.ts` (18 new test cases, pure-function level — no RTL/component-rendering infra exists in this repo, matching the established `leaveOverlay.test.ts` pattern):
- `validateOffsiteNote` rejects empty, whitespace-only, and <3-char notes; accepts ≥3 chars; returns a Thai message.
- `validateWorkLocationName` / `validateOffsiteReason` — carried over from the previous inline logic, now independently tested.
- `buildOffsiteClockInPayload` — asserts all location fields present, `timezoneOffsetMinutes` included even when `0`, `note`/`nonce` omitted when absent and included when provided.
- `buildOffsiteClockOutPayload` — same assertions, plus that `note` is always present (required parameter).

**Important scope note on test coverage:** these tests verify the extracted helper functions, not the screens' wiring. There is no React Native Testing Library (or equivalent) in this project, so the fact that `offsite-checkout.tsx` actually calls `validateOffsiteNote()` and blocks the submit button, and that both screens call `useOffsiteAttendance()` instead of the API client directly, is verified by code inspection + `tsc --noEmit` + the Expo web export build succeeding — not by an automated component/integration test. This mirrors the existing test-coverage ceiling documented in prior mobile hotfixes (e.g. `HOTFIX-MOBILE-LEAVE-CALENDAR-001`).

Existing `leaveOverlay.test.ts` (11 tests) verified unaffected — full suite: **26/26 passing**.

## Verification Commands and Results
| Command | Result |
|---|---|
| `npm ls react react-dom --prefix apps/mobile` | ✅ `react@19.1.0` / `react-dom@19.1.0` throughout, no drift |
| `npx jest` (apps/mobile) | ✅ 2 suites, 26/26 tests passing |
| `npx tsc --noEmit` (apps/mobile) | ✅ 0 errors |
| `./scripts/mobile-verify.sh` | ✅ PASS (typecheck + Expo web export) |
| `./scripts/verify.sh` | ✅ PASS (API build, Prisma validate, Web build) |
| `./scripts/docker-verify.sh` | ✅ PASS on 2nd attempt — 1st attempt failed with a transient `DeadlineExceeded` pulling `node:22-alpine` image metadata (registry/network timeout unrelated to this change); rebuilt stack healthy (`hr-api`, `hr-web`, `hr-mobile`, `hr-db` all Up/healthy), containers left running per policy |
| `./scripts/api-smoke-test.sh` | ✅ PASS (login + all smoke-tested endpoints) |
| `./scripts/security-review.sh` | ✅ PASS — dependency audit (Multer HIGH findings remain accepted-risk, documented pre-existing), secret scan clean; manual checklist reviewed by inspection |

## Known Limitations
1. **No component/integration test for the screens.** As noted above, screen-level wiring (button disabled state, error rendering, hook invocation) is verified by `tsc`, the Expo web export build, and manual code inspection only — not by an automated UI test, because this repo has no React Native component-testing library installed.
2. **Not verified via an authenticated live click-through in this sandbox.** Same `.env`/CORS limitation documented in prior mobile hotfixes (`NEXT_PUBLIC_API_URL` in the local root `.env` points at a non-localhost host) prevents an authenticated browser session against the Dockerized web/mobile build in this environment. Verified at the logic/bundle/build level; recommend the user do a quick manual click-through (off-site check-in with a short note, off-site check-out with a short note, and confirm the note-required validation blocks empty submission) after deploying.
3. **"Status refresh after submit" is via navigation, not a live re-render.** Each screen calls `refreshAttendance()` (its own `useAttendance()` instance) and then `router.back()` immediately; the home screen's `useFocusEffect` re-fetches attendance when it regains focus. There is no visible in-place refresh on the off-site screens themselves — this matches the pre-existing behavior, just stated precisely.
4. Backend `OffsiteClockOutDto.note` remains optional (unchanged) — the requirement is enforced client-side only, per the task's explicit scope constraint against a backend/schema change.

## Production Deployment Notes
Purely a mobile/PWA bundle change — no new environment variables, no migration, no backend redeploy required. Standard mobile/web Docker image rebuild covers this change (already exercised via `docker-verify.sh` above).

## Recommended Commit Message
```
fix(mobile): normalize off-site submit path and require checkout note

- Extract validateOffsiteNote/validateOffsiteReason/validateWorkLocationName
  and buildOffsiteClockInPayload/buildOffsiteClockOutPayload into a new
  shared, unit-tested utils/offsiteAttendance.ts (18 tests)
- Wire offsite-checkin.tsx and offsite-checkout.tsx through the existing
  useOffsiteAttendance hook instead of calling clockInOffsite/clockOutOffsite
  directly — this was the only path that attached timezoneOffsetMinutes and
  the SEC-ATT-004 replay nonce, so real off-site submissions were silently
  missing both fields until now
- Require a note (>=3 chars, Thai-validated) on off-site check-out, matching
  check-in's existing required reason field; backend DTO stays optional,
  enforced in the mobile UI only
- Move the low-accuracy (>100m) GPS guard into the shared hook so it isn't
  duplicated per screen, preserving the pre-existing UX
- Remove now-redundant per-screen translateError() duplicates; hook's
  translateOffsiteError() is the single source of Thai error copy

Scope: apps/mobile/ only. No backend/DB/Admin Web changes.
```

## PASS/FAIL Recommendation
**PASS.** Both identified gaps are closed, all required verification commands pass (docker-verify.sh passed on a clean retry after one transient, unrelated network timeout), and normal on-site attendance is untouched.
