# Mobile PWA Real-Usage QA Checklist — T-086

**App:** STEP Connect
**Production URL:** `https://mobilehr.eds-center.com`
**QA scope:** End-to-end real-device testing for the STEP Connect PWA milestone (v1.2.24–v1.2.27)
**Created:** T-086 (2026-06-26)
**Status:** Manual execution required on iPhone device

---

## How to Use This Checklist

- Execute on a physical iPhone running iOS 16+ (recommended) or iOS 15 (regression check).
- All tests assume the user has added STEP Connect to the Home Screen via Safari → Share → Add to Home Screen.
- Mark each item `[x]` when confirmed, `[!]` if a defect is found, or `[-]` if not testable in current environment.
- If a `[!]` defect is found, stop that section and document: reproduction steps, expected result, actual result, severity.

---

## Pre-Flight

- [ ] Working tree is clean: `git status --short` → no output
- [ ] `./scripts/verify.sh` → PASS
- [ ] `./scripts/mobile-verify.sh` → PASS
- [ ] Production URL is reachable: `curl -sI https://mobilehr.eds-center.com | head -5` → HTTP 200
- [ ] Manifest is live: `curl -sL "https://mobilehr.eds-center.com/manifest.json?v=1.2.25" | python3 -m json.tool` → `"display": "standalone"`
- [ ] Icon content-length correct: `curl -I "https://mobilehr.eds-center.com/apple-touch-icon.png?v=1.2.25"` → `content-length: 42973`

---

## A. Launch / PWA Shell

> Open STEP Connect from the iPhone Home Screen icon (not from Safari browser directly).

- [ ] **A1** — App launches from Home Screen icon without opening Safari
- [ ] **A2** — No Safari URL bar at the top of the screen
- [ ] **A3** — No Safari bottom toolbar (Back / Forward / Share / Tabs bar)
- [ ] **A4** — Home Screen shortcut name shows **STEP Connect**
- [ ] **A5** — Home Screen icon is dark navy (`#1E3A8A`) with bold "STEP", thin white divider, and "Connect"
- [ ] **A6** — App layout is portrait-friendly; no horizontal scroll or content cut-off
- [ ] **A7** — Press iPhone Home button → switch to another app → return to STEP Connect: app resumes without reloading to Safari

---

## B. Login / Session

> Test authentication flows from the STEP Connect PWA.

- [ ] **B1** — Login screen loads when not authenticated
- [ ] **B2** — Enter valid employee credentials → login succeeds → Home tab is shown
- [ ] **B3** — Enter wrong password → error message is displayed in Thai, user-friendly (no raw stack trace)
- [ ] **B4** — Enter empty fields → appropriate validation feedback shown
- [ ] **B5** — On expired or invalid session, app redirects to login with Thai message: `เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่`
- [ ] **B6** — Logout from Profile tab → returns to login screen
- [ ] **B7** — After logout, press iPhone Back gesture (swipe from left edge) → does not bypass login; login screen persists
- [ ] **B8** — Close app from App Switcher after logout → reopen from Home Screen → remains on login screen (session is not restored)

---

## C. Home (หน้าแรก)

> Verify home screen content and primary CTA.

- [ ] **C1** — Header shows **STEP Connect** app name or branding
- [ ] **C2** — Employee name or greeting message loads (not a blank card)
- [ ] **C3** — Attendance quick action card is visible (check-in / check-out CTA)
- [ ] **C4** — Check-in / check-out button is tappable and initiates the geofence modal (see Section F)
- [ ] **C5** — No content overflows outside the visible iPhone screen area (no horizontal scroll, no clipped text)
- [ ] **C6** — Safe-area insets respected at top (no content under iPhone notch or Dynamic Island) and bottom (no content under home indicator)

---

## D. Calendar (ปฏิทิน)

> Tap the Calendar tab and verify standalone mode is preserved.

- [ ] **D1** — Tapping Calendar tab navigates inside the standalone PWA (no Safari URL bar appears)
- [ ] **D2** — Calendar content loads (calendar view or schedule list)
- [ ] **D3** — No blank white screen on Calendar tab
- [ ] **D4** — Pressing iPhone Back gesture or device Back does not exit the standalone container into Safari
- [ ] **D5** — Switching from Calendar back to Home tab stays in standalone

---

## E. Attendance / ลงเวลา

> Tap the Attendance tab and verify standalone mode and content.

- [ ] **E1** — Tapping Attendance tab navigates inside standalone PWA
- [ ] **E2** — Attendance history loads (list of clock-in/out records, or empty state message)
- [ ] **E3** — Empty state (no records yet) shows a readable Thai message, not a blank screen
- [ ] **E4** — If check-in/out CTA exists on the Attendance page: verify it is consistent with the Home page CTA (no duplicate/conflicting UX)
- [ ] **E5** — No loading spinner that never resolves (wait up to 5 seconds on a normal connection)

---

## F. Geofence Check-In / Check-Out Modal

> Tap the check-in/out action from the Home tab.

- [ ] **F1** — Tapping check-in / check-out opens a modal (centered overlay, not a new page)
- [ ] **F2** — Modal is vertically centered; background app is dimmed
- [ ] **F3** — Map renders inside the modal (company location visible as a marker or labelled pin)
- [ ] **F4** — User's current location is indicated on the map (GPS dot or device location marker)
- [ ] **F5** — When inside the geofence radius: green indicator / "อยู่ในพื้นที่" status shown
- [ ] **F6** — When outside the geofence radius: red / outside indicator shown (if testable)
- [ ] **F7** — Footer confirm and cancel buttons are visible and not hidden behind the keyboard or safe area
- [ ] **F8** — Cancel button closes the modal; no navigation or state change occurs
- [ ] **F9** — Confirm button (when inside geofence) completes the clock-in/out action; success feedback is shown
- [ ] **F10** — If location permission is denied: readable error message in Thai or English; no crash or blank modal
- [ ] **F11** — If location is unavailable (e.g., airplane mode): readable error message; no blank screen

---

## G. Leave / การลา

> Tap the Leave tab and verify standalone mode and content.

- [ ] **G1** — Tapping Leave tab navigates inside standalone PWA
- [ ] **G2** — Existing leave requests load (list or empty state message)
- [ ] **G3** — New leave request form is reachable (button or FAB visible)
- [ ] **G4** — Leave balance counts are displayed if the design shows them
- [ ] **G5** — Validation messages on the leave form are understandable (Thai preferred)
- [ ] **G6** — No admin-only action visible (e.g., approve/reject buttons should not appear for an EMPLOYEE role user)
- [ ] **G7** — Submitted leave request appears in the list with PENDING status

---

## H. Profile / โปรไฟล์

> Tap the Profile tab and verify content and security.

- [ ] **H1** — Tapping Profile tab navigates inside standalone PWA
- [ ] **H2** — Employee name, role, department, and position load correctly
- [ ] **H3** — Profile information matches the logged-in employee (no cross-contamination with other users)
- [ ] **H4** — Logout button is visible and functional (see B6)
- [ ] **H5** — No JWT token, password hash, or other secret value is displayed anywhere on the Profile screen
- [ ] **H6** — No debug data, raw JSON, or server error object is visible in the UI

---

## I. Navigation — Bottom Tab Bar

> Systematic tab switching to confirm standalone is fully preserved.

| # | Tap sequence | Expected |
|---|---|---|
| I1 | หน้าแรก → ปฏิทิน | No Safari UI |
| I2 | ปฏิทิน → ลงเวลา | No Safari UI |
| I3 | ลงเวลา → การลา | No Safari UI |
| I4 | การลา → โปรไฟล์ | No Safari UI |
| I5 | โปรไฟล์ → หน้าแรก | No Safari UI |
| I6 | Rapid tap: Home → Calendar → Home → Leave → Profile | No Safari UI at any point |

- [ ] **I1–I6** — All tab transitions confirmed standalone
- [ ] **I7** — Active tab state is visually clear (highlighted icon / label)
- [ ] **I8** — Switching tabs repeatedly (10+ times) does not cause a stale navigation that opens Safari
- [ ] **I9** — All 5 tab labels match: **หน้าแรก**, **ปฏิทิน**, **ลงเวลา**, **การลา**, **โปรไฟล์**

---

## J. Production / Network Behavior

> Verify resilience and error handling.

- [ ] **J1** — App loads within 5 seconds on a normal WiFi or 4G connection
- [ ] **J2** — API errors (e.g., 500 or network timeout) show user-friendly message; no blank white screen
- [ ] **J3** — No blank white screen on any tab at any point during normal usage
- [ ] **J4** — No obvious unhandled JavaScript exception visible to the user (no "Something went wrong" crash boundary with a raw error)
- [ ] **J5** — Production URL `https://mobilehr.eds-center.com` serves the app with HTTPS (no mixed-content warning)

---

## K. Visual / UX Notes

> Qualitative observations. Mark `[x]` if acceptable, `[!]` if a visible problem exists.

- [ ] **K1** — Thai text is readable at default iPhone font size (no truncation, no overlap)
- [ ] **K2** — Touch targets (buttons, tabs) are large enough (≥ 44×44 pt recommended by Apple HIG)
- [ ] **K3** — Spacing is comfortable on iPhone screen (no elements jammed together)
- [ ] **K4** — Safe-area padding is applied at top and bottom (content not clipped by notch or home indicator)
- [ ] **K5** — When a form field receives focus and the keyboard appears, the focused input remains visible (not hidden behind keyboard)
- [ ] **K6** — Color scheme is consistent with STEP Connect branding: navy `#1E3A8A` as primary color

---

## Pass / Fail Criteria

A T-086 QA session is **PASS** when:

1. All Section A (Launch/PWA Shell) items pass.
2. All Section I (Navigation) items I1–I6 pass — standalone preserved on all tabs.
3. Login and logout flows (B1, B2, B3, B6) pass.
4. Home CTA (C3, C4) and geofence modal basics (F1, F7, F8) pass.
5. No `[!]` defects in Sections A, B, C, I.
6. Sections D–H and J–K may have isolated `[-]` items (not testable) without blocking PASS, as long as no confirmed `[!]` defects exist.

A T-086 QA session is **FAIL** when:

- Any of A1–A7 fails (PWA shell broken)
- Any of I1–I6 fails (Safari exits standalone)
- B2 fails (login broken in production)
- F1 or F8 fails (geofence modal unusable)
- A security-sensitive `[!]` defect is found in H5 (secret exposure)

---

## Known Limitations / Out of Scope

| # | Area | Limitation |
|---|---|---|
| L1 | iOS version | Standalone chrome varies on iOS < 16.4. App functions; only chrome appearance may differ. |
| L2 | Add to Home Screen | This checklist requires the shortcut to be created via Safari Add to Home Screen. Opening directly in Safari is a different (expected) mode. |
| L3 | Geofence outside test | Testing "outside geofence" requires physical distance from the office or mock location. Mark `[-]` if untestable. |
| L4 | Offline/service worker | No service worker is present. Offline behavior is undefined and out of scope. |
| L5 | Push notifications | Not implemented. Out of scope. |
| L6 | Android | STEP Connect is iOS-primary. Android Chrome PWA behavior is not in this QA scope. |
| L7 | Session expiry simulation | B5 (expired session) may require manually clearing localStorage or waiting for JWT TTL to expire. |

---

## Bugs Found

> Complete this section during/after QA execution. Empty = no bugs found.

| ID | Section | Severity | Description | Expected | Actual | Suggested fix |
|----|---------|----------|-------------|----------|--------|---------------|
| — | — | — | None found at time of checklist creation | — | — | — |

---

## Related Documents

- `HR-Knowledge/04-DOMAINS/Mobile/STEP Connect PWA.md`
- `HR-Knowledge/08-SOP/Mobile PWA Production Verification.md`
- `docs/adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md`
- `docs/CTO_SUMMARY_T086.md`
- `docs/CTO_SUMMARY_HOTFIX_010.md` — standalone navigation fix
- `docs/CTO_SUMMARY_HOTFIX_011.md` — icon cache-bust
- `docs/CTO_SUMMARY_T084.md` — icon rebrand
- `docs/CTO_SUMMARY_T085.md` — knowledge sync

#qa #mobile #pwa #standalone #step-connect
