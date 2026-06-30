# T-089 — Android Play Store Distribution Readiness Spec

**Type:** T-task (technical / internal planning)
**Classification:** Docs-only — no implementation in this task
**Date:** 2026-06-30
**Status:** SPEC ONLY / PASS

---

## 1. Objective

Document the readiness requirements and recommended approach for publishing STEP Connect as an
Android app through the Google Play Store at a future date.

**This task contains no implementation.** No APK, AAB, Android project files, signing keys,
Play Console submission, or runtime code changes are made here. This document exists to capture
what must be decided and built before any Play Store submission can proceed, so that future tasks
start from a clear foundation.

---

## 2. Current State

### 2.1 Deployment Summary

| Component | URL | Method |
|-----------|-----|--------|
| STEP Connect — public | `https://mobilehr.eds-center.com` | PWA / Add to Home Screen |
| STEP Connect — LAN | `http://172.16.2.31:3004` | PWA / Add to Home Screen |
| API (production) | `http://172.16.2.31:4002` | NestJS 11, Docker Compose |
| Admin Web | `http://172.16.2.31:3002` | Next.js App Router |
| Database | PostgreSQL 16 | Docker Compose |

### 2.2 Mobile Platform Status

| Platform | Installation method | Play/App Store? |
|----------|--------------------|----|
| Android | Add to Home Screen (PWA) | No |
| iOS | Add to Home Screen (PWA) | No |

STEP Connect is a **Next.js / Expo SDK 52 web export**, served as a Progressive Web App (PWA).
Employees install it by tapping "Add to Home Screen" in their mobile browser.

### 2.3 GPS / Location Behavior

- Location is required for attendance clock-in and clock-out actions.
- Fresh GPS is mandatory on every attendance action — cached or stale coordinates are rejected
  (`HOTFIX-REQ002F-A`, `docs/CTO_SUMMARY_HOTFIX_REQ002F_A.md`).
- Location is **foreground-only** and **action-triggered** — the user taps a button, the app
  requests current GPS, submits it to the API, and releases the location context.
- No background location tracking occurs.
- Raw GPS coordinates are not displayed to employees in the UI.
- The backend (`apps/api`) is authoritative: it validates GPS against the geofence polygon and
  records the verified result. What the API stores is the verified position, not the raw
  coordinate string from the phone.

### 2.4 PWA Cache Behavior

- The STEP Connect app shell (`/`) is served with `Cache-Control: no-store` to prevent stale
  UI from being cached by Android browsers or installed PWA shells.
- This was introduced to solve a class of bugs where employees received outdated attendance
  flows after a web deploy.
- A TWA app shell wrapping the same URL would benefit from this same policy automatically.

### 2.5 Existing STEP Connect Capabilities

| Feature | Status |
|---------|--------|
| Login / JWT auth | Deployed |
| Home dashboard (attendance summary, leave balance) | Deployed |
| GPS geofence clock-in / clock-out | Deployed |
| Off-site request creation | Deployed |
| Mixed checkout exception flow (on-site → off-site) | Deployed (REQ-002F) |
| Leave request submission | Deployed |
| Calendar / attendance history | Deployed |
| Profile / password change | Deployed |
| Thai language UI | Deployed |
| PWA manifest (`manifest.json`) | Deployed |
| HTTPS public domain | Deployed (`mobilehr.eds-center.com`) |

---

## 3. Recommended Approach — Option Comparison

Three options are evaluated for Android distribution:

### Option A — Android TWA (Trusted Web Activity) Wrapper

**What it is:** A thin Android app (APK/AAB) that opens STEP Connect's production HTTPS URL
in a full-screen WebView-like surface that is verified against the domain via Digital Asset Links.
The app itself contains almost no business logic; the STEP Connect web app is the product.

| Dimension | Assessment |
|-----------|-----------|
| Benefits | Reuses 100% of existing STEP Connect PWA. No rewrite. Feature delivery stays web-based. Installable from Play Store. Update delivery via web deploy, not Play Store re-submission. Low Android-specific maintenance. Bubblewrap tooling is well-documented. |
| Risks | Requires HTTPS domain. Requires Digital Asset Links (`assetlinks.json`) to be hosted on the domain. TWA has restrictions on multi-origin navigation. If STEP Connect ever needs device hardware APIs beyond what the web exposes, TWA hits a ceiling. |
| Estimated complexity | Low–Medium. Main effort: Bubblewrap project setup, signing key management, Play Console enrollment, Digital Asset Links deployment. |
| Maintenance impact | Very low for ongoing feature work (web deploys update the app automatically). Moderate one-time setup. Occasional Play Store compliance reviews. |
| Release/update workflow | Web deploy → updated immediately in installed app. APK/AAB update only needed for TWA wrapper metadata changes (icons, package name, permissions). |
| Suitability for current HR stage | **High.** The app is mature PWA with HTTPS. TWA is the logical first Play Store step before committing to a native rewrite. |

### Option B — Full Native Expo/React Native Android App

**What it is:** Convert the STEP Connect Expo app from PWA/web export to a true native Android
build (`eas build`), producing an APK/AAB for Play Store distribution.

| Dimension | Assessment |
|-----------|-----------|
| Benefits | Full access to Android SDK. Can use native location APIs. Can use Expo push notifications properly. Future-proof for features that need native hardware. |
| Risks | Significant rebuild effort (Expo managed → native build pipeline). Android Studio toolchain, EAS Build, Gradle, signing key management, Play Store binary uploads per release. Feature delivery tied to Play Store release cycle. |
| Estimated complexity | High. Requires EAS account, Expo Application Services, Gradle configuration, Play Store binary submission per update, potential React Native library compatibility work. |
| Maintenance impact | High. Every feature release requires a native build and Play Store submission. |
| Release/update workflow | Every code change that affects Android behavior requires a new AAB submitted to Play Store. OTA updates via EAS Update are possible for JS-only changes but require additional setup. |
| Suitability for current HR stage | Low for near-term. More appropriate after TWA has validated Play Store distribution and a specific native feature need is identified. |

### Option C — Continue PWA Only (No Play Store)

**What it is:** Keep the current Add-to-Home-Screen PWA model. No Play Store.

| Dimension | Assessment |
|-----------|-----------|
| Benefits | No Play Store overhead. No signing key management. Instant updates. No Google Play policy compliance burden. |
| Risks | No discoverability via Play Store. Requires employees to know the URL and follow manual install steps. Some Android devices increasingly limit PWA capabilities (background sync, push notifications). |
| Estimated complexity | None — status quo. |
| Maintenance impact | None. |
| Release/update workflow | Same as now — web deploy. |
| Suitability for current HR stage | Acceptable for internal HR use where employee onboarding is managed. Becomes limiting if Play Store distribution or push notifications are ever required. |

### Recommendation

**Start with Option A (Android TWA).** It provides Play Store distribution with minimal risk
and zero feature regression. Option B should be deferred until there is a concrete requirement
for a native hardware capability that the web platform cannot satisfy. Option C remains valid
while Play Store distribution is not yet urgent.

---

## 4. TWA Readiness Checklist

Items marked `[DONE]` are already satisfied by the current production system.
Items marked `[TODO]` require work in a future implementation task (T-090 or later).
Items marked `[REVIEW]` require decision or legal/owner input.

### 4.1 Domain and HTTPS

| # | Item | Status | Notes |
|---|------|--------|-------|
| D1 | HTTPS production domain | `[DONE]` | `https://mobilehr.eds-center.com` — valid TLS |
| D2 | Domain ownership control | `[REVIEW]` | Must confirm the team can update DNS records and serve files at `/.well-known/assetlinks.json` |
| D3 | Domain stability commitment | `[REVIEW]` | Changing domain after Play Store submission requires re-publishing |

### 4.2 PWA Manifest

| # | Item | Status | Notes |
|---|------|--------|-------|
| M1 | `manifest.json` deployed | `[DONE]` | Present in STEP Connect Next.js app |
| M2 | `start_url` set | `[TODO]` | Verify `start_url` is `"/"` or `"/home"` — must match TWA launch URL |
| M3 | `display: standalone` | `[TODO]` | Verify or set `"display": "standalone"` |
| M4 | `name` and `short_name` | `[TODO]` | Set `"name": "STEP Connect"`, `"short_name": "STEP"` |
| M5 | `theme_color` and `background_color` | `[TODO]` | Recommend `#1e3a8a` (brand navy) |
| M6 | `scope` aligned to TWA origin | `[TODO]` | `scope` must match or be a prefix of the TWA launch URL |

### 4.3 Icons and Splash Assets

| # | Item | Status | Notes |
|---|------|--------|-------|
| I1 | 512×512 PNG icon (maskable) | `[TODO]` | Required for Play Store. Recommend `maskable` with safe-zone. |
| I2 | 192×192 PNG icon | `[TODO]` | Minimum PWA manifest icon size for standalone |
| I3 | Adaptive icon (foreground + background layers) | `[TODO]` | Recommended for Android 8+ launcher icons |
| I4 | Play Store feature graphic (1024×500) | `[TODO]` | Required for Play Console listing |
| I5 | Screenshots for Play Store listing | `[TODO]` | Minimum 2, recommended 4–8. Phone + 7-inch tablet preferred |
| I6 | Short and full description for listing | `[TODO]` | Max 80 / 4000 characters. No internal-only terminology |

### 4.4 Digital Asset Links

| # | Item | Status | Notes |
|---|------|--------|-------|
| A1 | `assetlinks.json` file | `[TODO]` | Must be hosted at `https://mobilehr.eds-center.com/.well-known/assetlinks.json` |
| A2 | SHA-256 fingerprint of release signing key | `[TODO]` | Generated from the keystore used to sign the AAB |
| A3 | Package name declared in `assetlinks.json` | `[TODO]` | Must match the `applicationId` in the TWA project |
| A4 | Verification by TWA/browser | `[TODO]` | Chrome verifies the file on app launch; failure degrades to tab mode |

### 4.5 No-Store App Shell Cache Policy

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | `Cache-Control: no-store` on app shell | `[DONE]` | Implemented post-HOTFIX-REQ002F-A. Prevents stale JS/CSS from being served from device cache. TWA inherits this behavior automatically. |
| C2 | Confirm no service worker caches app shell | `[TODO]` | If a service worker is added in future, ensure it does not cache the app shell in a way that bypasses no-store. |

### 4.6 Android Package Name and Identity

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | Package name proposal | `[REVIEW]` | Proposed: `com.stepsolutions.hr.stepconnect` (tentative — see Section 5) |
| P2 | App name | `[REVIEW]` | Proposed: `STEP Connect` |
| P3 | Version code policy | `[TODO]` | versionCode must increment on every Play Store upload; define strategy |
| P4 | applicationId uniqueness | `[TODO]` | Confirm the proposed package name is not already registered in Play Console |

### 4.7 Signing Key Strategy

| # | Item | Status | Notes |
|---|------|--------|-------|
| S1 | Release keystore creation | `[TODO]` | Generate with `keytool`; store securely (NOT in source control) |
| S2 | Keystore backup policy | `[TODO]` | Loss of keystore = cannot update the app in Play Store ever |
| S3 | Google Play App Signing | `[REVIEW]` | Recommend enrolling in Google Play App Signing; Google holds upload key backup |
| S4 | CI/CD signing integration | `[TODO]` | If CI builds the AAB, keystore must be injected as a secret, not committed |

### 4.8 Bubblewrap / TWA Build Path

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | Bubblewrap CLI installed | `[TODO]` | `npm i -g @bubblewrap/cli` or Docker equivalent |
| B2 | TWA project initialized | `[TODO]` | `bubblewrap init --manifest https://mobilehr.eds-center.com/manifest.json` |
| B3 | AAB built | `[TODO]` | `bubblewrap build` — requires JDK and Android Build Tools on build machine |
| B4 | AAB verified on emulator | `[TODO]` | Test Digital Asset Links verification in Android emulator |
| B5 | AAB signed with release key | `[TODO]` | Required before Play Console upload |

### 4.9 Internal Testing Install Path

| # | Item | Status | Notes |
|---|------|--------|-------|
| T1 | Play Console account created | `[REVIEW]` | One-time $25 developer registration fee |
| T2 | App created in Play Console | `[TODO]` | Select category, package name, default language |
| T3 | Internal testing track configured | `[TODO]` | Add internal testers by Google account email |
| T4 | AAB uploaded to internal track | `[TODO]` | Must pass Play Console automated checks |
| T5 | Internal testers install and verify | `[TODO]` | Core STEP Connect flows: login, GPS clock-in/out, leave |

### 4.10 Production Monitoring Checklist (Post-TWA Release)

| # | Item |
|---|------|
| PR1 | Monitor Android Vitals in Play Console (ANR rate, crash rate) |
| PR2 | Monitor `assetlinks.json` accessibility — a deploy that removes this file will degrade TWA to tab mode |
| PR3 | Monitor HTTPS certificate expiry on `mobilehr.eds-center.com` |
| PR4 | Monitor for Play Store policy violation notices |
| PR5 | Plan for Play Console screenshot/metadata updates when major UI changes land |

### 4.11 Rollback Strategy

| Scenario | Mitigation |
|----------|-----------|
| Bad web deploy breaks STEP Connect | Roll back web deployment; TWA users automatically get the previous version on next page load (no Play Store re-submission needed) |
| TWA app shell itself is broken | Upload a fixed AAB to Play Console internal/production track; staged rollout available |
| `assetlinks.json` accidentally removed | Re-deploy file; TWA degrades to browser tab mode (functional but not fullscreen) until file is restored |
| Signing key compromise | Requires re-publishing under new package name; prevention (Google Play App Signing) is the correct mitigation |

### 4.12 Impact of Web Deploys on Installed TWA

Because TWA displays the live web URL, **most STEP Connect updates require zero Play Store action:**

- Bug fixes, new features, UI changes → deploy to `mobilehr.eds-center.com` → users get update instantly on next app open
- App shell `Cache-Control: no-store` ensures the latest version is fetched on open
- Play Store re-submission is only needed when: the TWA wrapper's metadata changes (icons, package name, permissions declared in `AndroidManifest.xml`), or a new Android permission must be added

---

## 5. Proposed Package and App Identity

> **All values in this section are tentative.** Final values require owner/legal confirmation
> and Play Console account creation.

| Field | Proposed value | Notes |
|-------|---------------|-------|
| App name | STEP Connect | Matches existing brand |
| Short name | STEP | For launcher icon label |
| Package name | `com.stepsolutions.hr.stepconnect` | Tentative — confirm domain/company ownership |
| Domain | `mobilehr.eds-center.com` | Existing HTTPS production domain |
| Category | Business or Productivity | Choose at Play Console listing creation |
| Target audience | Internal company employees | Not public; internal / closed testing first |
| Distribution | Internal → Closed testing → Open/Production | Phased per Section 8 |
| Min Android SDK | API 21 (Android 5.0) or API 24 (7.0) recommended by Bubblewrap | Confirm with Bubblewrap init output |
| Target SDK | Latest stable (API 35 / Android 15 as of 2026) | Required by Play Store policy |

---

## 6. Privacy and Data Safety Readiness

> **This section documents readiness requirements only. Final legal wording must be reviewed
> and approved by the system owner and/or legal counsel before Play Store submission.**

Play Store Data Safety form and Privacy Policy are mandatory for all published apps.

### 6.1 Data Collected and Purpose

| Data type | Collected? | Purpose | Shared with third parties? |
|-----------|-----------|---------|---------------------------|
| Account credentials (username/email, password) | Yes | Authentication | No |
| Employee profile (name, employee ID, department) | Yes | Attendance / HR record display | No |
| Attendance records (clock-in/out timestamps) | Yes | HR attendance tracking | No |
| Precise location (GPS coordinates) | Yes | Geofence-based attendance verification | No |
| Device identifiers | No (not currently) | N/A | N/A |

### 6.2 Location Use Disclosure

- **Type:** Precise location (GPS)
- **Usage context:** Foreground only — requested when the employee actively taps an attendance action
- **Purpose:** Verify the employee is within the geofence boundary for the attendance event
- **Background tracking:** None — the app does not track location in the background
- **Required in-app disclosure:** The Play Store Data Safety form and, if required by Google
  policy, an in-app disclosure must explain why location is collected before the first request

### 6.3 Required Assets for Play Console Submission

| Asset | Status | Notes |
|-------|--------|-------|
| Privacy Policy URL | `[TODO]` | Must be a publicly accessible URL; content must cover all data types above |
| Data Safety form | `[TODO]` | Filled in Play Console; must accurately reflect collected data |
| Account deletion method | `[TODO]` | Google requires disclosure of how users can request account deletion |
| Data retention policy | `[REVIEW]` | How long are attendance records, location snapshots, and leave data retained? Owner decision. |
| Third-party SDK disclosure | `[TODO]` | If any analytics or crash-reporting SDK is added to the TWA wrapper, it must be declared |

---

## 7. Location Permission Policy Risk

| Risk | Level | Mitigation |
|------|-------|-----------|
| Google rejects app due to location permission without sufficient justification | Medium | Provide clear purpose string; document foreground-only use; no background permission requested |
| Play Store policy change restricts foreground GPS for HR apps | Low–Medium | Monitor Play Store policy updates; TWA wrapper minimizes app-layer surface area |
| Employee privacy concern over GPS data | Medium | Ensure in-app disclosure before first location request; confirm backend does not store raw coordinates beyond what is needed for audit |
| Raw GPS displayed in UI | Low (currently none) | Confirm no raw coordinate strings appear in employee-facing STEP Connect UI (verified in REQ-002F implementation) |
| Location permission granted then revoked by user | Medium | App must handle graceful degradation if permission is denied — display an actionable error rather than crashing |
| Background location permission accidentally requested | Low (currently none) | TWA manifest should not declare `ACCESS_BACKGROUND_LOCATION`; Bubblewrap default does not add it |
| Backend becomes non-authoritative (client-side GPS bypass) | Low | Backend validates GPS server-side against geofence polygon; client cannot self-report a different location successfully |

**Policy:** No background location tracking should be added to STEP Connect without a separate,
explicit privacy review and employee disclosure update. Any native feature that requires
`ACCESS_BACKGROUND_LOCATION` must go through legal and security review before implementation.

---

## 8. Play Store Release Plan (Proposed)

> **Task numbers below are tentative.** Final numbers assigned when tasks are officially created.

| Task | Title | Scope |
|------|-------|-------|
| **T-089** | Android Play Store Distribution Readiness Spec (this document) | Docs only — current task |
| **T-090** *(proposed)* | Android TWA Technical Proof of Concept | Bubblewrap init, AAB build, emulator verification, Digital Asset Links test on staging |
| **T-091** *(proposed)* | Play Console Metadata / Privacy / Data Safety Preparation | Play Console account, privacy policy, Data Safety form, screenshots, descriptions |
| **T-092** *(proposed)* | Internal Testing / Closed Testing | Upload AAB to internal track; recruit testers; execute core flows |
| **T-093** *(proposed)* | Android Production Release Decision | Review internal test results; decide open/production rollout |

Each task in T-090 onwards requires explicit approval before starting.

---

## 9. Acceptance Criteria for Future Implementation

These criteria must be met before any TWA release is declared PASS:

| # | Criterion |
|---|-----------|
| AC1 | Android app opens STEP Connect fullscreen — no Chrome address bar visible |
| AC2 | `assetlinks.json` verification passes (Chrome does not fall back to tab mode) |
| AC3 | Login flow completes successfully; JWT stored and used for subsequent requests |
| AC4 | GPS attendance clock-in completes successfully inside the geofence |
| AC5 | GPS attendance clock-out completes successfully |
| AC6 | Fresh GPS requirement still applies — stale/cached GPS correctly rejected |
| AC7 | Off-site request submission works |
| AC8 | PWA app shell fetches fresh on open (Cache-Control: no-store behavior intact) |
| AC9 | After a web deploy, the new version loads on next app open without reinstall |
| AC10 | No raw GPS coordinates visible in the employee UI |
| AC11 | No backend or database schema changes required for TWA support |
| AC12 | Internal tester install via Play Console internal track succeeds |
| AC13 | App passes Play Console automated pre-launch report (no crashes) |
| AC14 | Privacy policy URL accessible and accurate |
| AC15 | Data Safety form submitted and accurate |

---

## 10. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Play Store rejects app due to location permission policy | Medium | High | Document foreground-only use clearly; consult Play Policy Center before submission |
| R2 | New Play Console account subject to closed testing requirements (20 testers, 14-day minimum) | Medium | Medium | Start internal testing early; recruit testers from HR staff; plan timeline |
| R3 | Privacy / Data Safety form inaccuracy | Medium | High | Owner reviews form before submission; do not auto-fill from technical docs alone |
| R4 | Location permission rejected by user — app non-functional | Medium | Medium | Graceful degradation UX: explain why location is needed with a dismissible dialog before first request |
| R5 | Stale app shell after web deploy (TWA caches aggressively) | Low | Medium | `Cache-Control: no-store` on app shell already in place; verify behavior in emulator during T-090 |
| R6 | Signing key loss | Low | Critical | Enroll in Google Play App Signing immediately at account setup; keep keystore backup in secure off-site storage |
| R7 | Domain ownership changes or DNS misconfiguration | Low | High | Assign a responsible owner for the `mobilehr.eds-center.com` domain; document in system runbook |
| R8 | Future native feature need (push notifications, camera, biometrics) | Medium | Medium | TWA can be extended with native Kotlin/Java code; plan bridge if needed, or migrate to Expo native build at that point |
| R9 | Employee onboarding complexity — Play Store install vs. Home Screen | Low | Low | Play Store install is simpler for most employees; onboarding guide should be updated |
| R10 | Play Store policy drift (annual policy update by Google) | Low | Medium | Monitor Android developer policy changelog; plan annual compliance review |

---

## 11. Explicit Non-Goals (This Task)

The following are explicitly out of scope for T-089:

- ❌ No APK or AAB built
- ❌ No Play Console account created or submission made
- ❌ No Android project files (`build.gradle`, `AndroidManifest.xml`, etc.)
- ❌ No Bubblewrap project initialized
- ❌ No signing key generated or stored
- ❌ No `assetlinks.json` deployed
- ❌ No PWA manifest changes
- ❌ No icon or splash asset creation
- ❌ No iOS App Store planning (separate future task if needed)
- ❌ No backend / API changes
- ❌ No database / Prisma schema changes
- ❌ No mobile runtime code changes (STEP Connect app)
- ❌ No Admin Web changes
- ❌ No Docker or production compose changes
- ❌ No privacy policy written (requirements documented; drafting is an owner/legal task)

---

## 12. Recommendation

1. **Keep current Android and iOS PWA / Add-to-Home-Screen deployment** for all employees now.
   The existing system works and was validated in production through REQ-002F.

2. **Use T-089 as the readiness planning document.** No Play Store work should begin without
   the items in Section 4 (TWA Readiness Checklist) and Section 6 (Privacy / Data Safety) being
   addressed.

3. **Revisit Android TWA when Android adoption justifies the Play Store overhead.** Triggers
   that make Play Store worthwhile:
   - Internal employee base grows and self-managed PWA install becomes a support burden
   - Push notification capability becomes a business requirement
   - HR management requests a "proper app" for policy or audit reasons

4. **If pursued, start with T-090 — Android TWA Technical Proof of Concept** (not T-091 or T-092).
   A working POC on a dev device is the lowest-risk validation step before any Play Console
   investment or privacy form work.

5. **Do not skip Digital Asset Links verification** during T-090. A TWA that fails
   `assetlinks.json` verification silently degrades to a browser tab — it looks like it works
   but provides no real TWA experience.

---

*Document status: SPEC ONLY. No code, no implementation, no Play Store action taken.*
*Next action: Revisit this document when T-090 (TWA POC) is officially scheduled.*
