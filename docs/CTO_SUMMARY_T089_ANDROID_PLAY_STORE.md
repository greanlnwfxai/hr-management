# CTO Summary

## Step
T-089 — Android Play Store Distribution Readiness Spec

## Status
SPEC ONLY / PASS

---

## Classification

**T-task** (technical / internal planning) — not a REQ task.

| Reason | Detail |
|--------|--------|
| REQ tasks | Direct user/business workflow requirements implemented in the codebase |
| T-tasks | Technical readiness, infrastructure planning, internal documentation |
| This task | Future Android distribution planning — no user-facing workflow change |

---

## Scope

Docs-only. Created the Android Play Store Distribution Readiness Spec for STEP Connect.
No runtime code, database, Docker, mobile app, Android project files, signing keys,
or Play Console submission was touched.

---

## Constraints Observed

| Area | Change made? |
|------|-------------|
| Runtime code (backend, API, web, mobile) | NO |
| Database / Prisma schema | NO |
| Auth or session logic | NO |
| Business logic (attendance, geofence, leave) | NO |
| Docker / production compose | NO |
| Android project files / APK / AAB | NO |
| Signing keys | NO |
| Play Console submission | NO |
| git add / commit / push / tag | NO (user performs manually) |
| `docker compose down` or destructive Docker commands | NO |
| `./scripts/docker-verify.sh` | NOT RUN (no Docker changes) |

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/T089_ANDROID_PLAY_STORE_READINESS_SPEC.md` | Full Android Play Store readiness specification — 12 sections, TWA checklist, option comparison, privacy/data safety requirements, release plan |
| `docs/CTO_SUMMARY_T089_ANDROID_PLAY_STORE.md` | This CTO summary |

> **Naming note:** `docs/CTO_SUMMARY_T088.md` and `docs/CTO_SUMMARY_T089.md` already exist
> and document prior tasks (Admin Web Production QA and Admin Web Real-Usage QA respectively).
> This task is numbered T-089 for the Android Play Store track; the suffix `_ANDROID_PLAY_STORE`
> distinguishes it from the prior T-089 Admin Web QA summary.

---

## Files Modified

None.

---

## Recommendation Summary

| Question | Recommendation |
|----------|---------------|
| Should we publish to Play Store now? | No — not yet urgent |
| If we do, what approach? | Android TWA wrapper first (Option A) |
| What should we NOT do yet? | Full Expo/React Native native Android build (Option B) |
| What do we keep? | Current PWA/Add-to-Home-Screen on both Android and iOS |
| What is the next concrete step if Play Store is decided? | T-090 — Android TWA Technical Proof of Concept |

---

## Key Readiness Items (summary)

The spec identifies the following as the highest-priority items before any Play Store work
can begin:

1. **HTTPS domain** — `mobilehr.eds-center.com` is already HTTPS. ✓
2. **PWA manifest** — present; needs `display: standalone`, `name`, `start_url` review.
3. **Digital Asset Links** — `assetlinks.json` must be hosted at `/.well-known/`; not yet deployed.
4. **Signing key** — no keystore exists yet; strategy must be decided before Play Console enrollment.
5. **Privacy policy** — required by Play Store; must be reviewed by owner/legal.
6. **Data Safety form** — must accurately declare GPS collection (foreground, no third-party sharing).
7. **Play Console account** — not yet created ($25 one-time registration).
8. **Icons** — 512×512 maskable PNG and adaptive icon layers not yet produced.

---

## Risks

| Risk | Level | Note |
|------|-------|------|
| Play Store location permission policy | Medium | Foreground-only GPS; document clearly |
| Privacy / Data Safety inaccuracy | Medium | Owner/legal review required before submission |
| New Play Console account testing requirements | Medium | 20-tester / 14-day closed testing period may apply |
| Signing key loss | Critical (if it happens) | Must enroll in Google Play App Signing immediately |
| `assetlinks.json` unavailability | Medium | Deploy failure removes the file → TWA degrades to tab mode |

---

## Open Decisions (require owner input)

| # | Decision |
|---|----------|
| OD1 | Final package name (proposed: `com.stepsolutions.hr.stepconnect`) |
| OD2 | Privacy policy URL and content (owner/legal drafts this) |
| OD3 | Data retention/deletion policy for attendance and location records |
| OD4 | Whether to enroll in Google Play App Signing (strongly recommended) |
| OD5 | Timeline for T-090 TWA POC — is Play Store distribution a near-term priority? |

---

## Verification Performed

```
git diff --check
→ (clean — no output)

git status --short
→ (clean — no output)
```

`./scripts/verify.sh` — not run (docs-only task; no build artifacts affected).
`./scripts/docker-verify.sh` — not run (no Docker changes; not approved for this task).
`./scripts/security-review.sh` — not run (no code changes; no new dependencies).

---

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | No endpoints added or changed. |
| RBAC impact | None. |
| Data privacy impact | Spec documents that GPS and employee profile data are collected; no new data exposure created. The privacy/data-safety section is documentation only — requires owner review before any submission. |
| Password/token/hash impact | None. No credential handling changed. |
| Mobile security impact | No mobile runtime code changed. Spec notes that background GPS must NOT be added without separate privacy review — this is a protective constraint, not a new risk. |
| Dependency/advisory impact | No new packages added. |
| Secrets/logging check | No credentials, tokens, or secrets in any new document. No signing keys generated or committed. |
| New endpoints protected | N/A — no new endpoints. |
| Risk level | LOW |
| Security decision | PASS |

---

## Issues Found

None. Spec is documentation only.

---

## Risk

Low (documentation only; no runtime changes)

## Decision

PASS — Spec created. No implementation. Proceed to T-090 when Play Store distribution is
officially prioritized.

## Next Step

**Proposed T-090 — Android TWA Technical Proof of Concept:**
1. Initialize Bubblewrap project against `https://mobilehr.eds-center.com/manifest.json`.
2. Verify PWA manifest (`display`, `name`, `start_url`, `scope`, icons).
3. Build a test AAB on a dev machine.
4. Verify Digital Asset Links on a staging or dev domain.
5. Test on Android emulator — confirm fullscreen TWA (no address bar).

**Before T-090 can start:**
- Play Console account must be created (OD5 decision).
- Package name confirmed (OD1).
- Signing key strategy decided (OD4).

## Recommended Commit Message

```
docs(mobile): add Android Play Store readiness spec

Create T089_ANDROID_PLAY_STORE_READINESS_SPEC.md covering:
- Option comparison: TWA vs native Expo vs PWA-only
- TWA readiness checklist (domain, manifest, assetlinks, icons,
  signing, Bubblewrap, Play Console, monitoring, rollback)
- Privacy/data safety requirements (GPS, employee data)
- Location permission policy risk documentation
- Proposed release plan: T-090 → T-091 → T-092 → T-093
- Acceptance criteria and non-goals
Recommendation: Android TWA first; not urgent to start yet.
Docs only — no runtime code changed.
```

Recommended tag after PASS: `v1.2.55-android-play-store-readiness-spec`
