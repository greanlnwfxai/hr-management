# CTO Summary

## Step
T-080 — Mobile Proactive Session Expiry UX

## Status
PASS

## Scope
Mobile app only. No backend, no web app, no database changes.

## Root Cause / Current Limitation
The mobile app handled expired sessions **reactively** only: the user triggered an API call, the backend returned 401, `SessionExpiredError` was thrown, hooks caught it, `signOut()` was called, and the user was redirected to `/login`. No feedback was shown on the login screen, and the expired token sat in secure storage until the first API call was made.

Two gaps:
1. **App restart with expired token** — the stored token was restored as a valid session; the user landed on `/home` and saw an error only on the first data fetch.
2. **Request with known-expired token** — the HTTP request was sent with a token the client already knew was expired, wasting a round-trip.

## Files Created
| File | Purpose |
|---|---|
| `apps/mobile/src/auth/session.ts` | JWT expiry helper: `isTokenExpired(token, bufferSeconds?)` |

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/src/auth/AuthProvider.tsx` | `restoreSession()` — check token expiry proactively; clear storage and set error state if expired |
| `apps/mobile/src/api/client.ts` | `authGet`, `authPost`, `authPatch` — throw `SessionExpiredError` before making the HTTP request if token is expired |

## New Session Expiry Behavior

### Session restore on app open
`AuthProvider.restoreSession()` now calls `isTokenExpired(token)` after loading from storage. If expired:
- `clearToken()` + `clearUser()` called immediately
- Auth state set to `isAuthenticated: false`, `error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'`
- `index.tsx` redirects to `/login`
- Login screen displays the error in its existing red error box

### Proactive API request check
`authGet`, `authPost`, `authPatch` each call `isTokenExpired(token)` before the `fetch`. If expired, `SessionExpiredError` is thrown immediately — no HTTP request is sent. The existing hook error handlers catch this and call `signOut()` + navigate to `/login` (unchanged behavior).

### Reactive 401 fallback (unchanged)
If the backend returns 401 (clock drift, revoked token, etc.), the existing reactive path still triggers `SessionExpiredError` as before.

### `isTokenExpired` helper
- Decodes JWT payload via base64url → base64 → `atob()` → `JSON.parse`
- Missing `exp` → treated as expired
- Malformed token → treated as expired
- Default buffer: 60 seconds (avoids edge cases where token expires mid-request)
- No token value is logged at any point

## What Was Intentionally Not Changed
- No refresh token flow added
- No backend auth architecture change
- No JWT signing rules change
- No long-lived tokens
- No production environment variables
- `SessionExpiredError` class and message unchanged (existing reactive path unaffected)

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` (mobile) | PASS |
| `./scripts/verify.sh` (API + Prisma + Web) | PASS |
| `./scripts/mobile-verify.sh` (mobile typecheck + Expo export) | PASS |
| `./scripts/security-review.sh` | PASS |

## Security Review

| Field | Result |
|---|---|
| Auth impact | No new endpoints added or changed |
| RBAC impact | None |
| Data privacy impact | None — client-side JWT decoding reads only the `exp` claim; no PII accessed |
| Password/token/hash impact | Token not logged; `isTokenExpired` reads only `exp` from the decoded payload |
| Mobile security impact | Improves mobile security: expired tokens cleared from SecureStore at app start |
| Dependency/advisory impact | No new packages added; mobile audit: no HIGH/CRITICAL findings |
| Secrets/logging check | No tokens or secrets logged; confirmed by secret scan |
| New endpoints protected | None |
| Risk level | LOW |
| Security decision | PASS |

**Security note:** Client-side JWT decoding is UX-only. The backend remains the sole source of truth for authorization. A crafted token that passes client-side expiry checks will still be rejected with 401 by the API.

## Production Safety Confirmation
- No backend changes
- No Docker changes
- No database commands run
- No destructive commands run
- No environment variables changed
- No git operations performed

## Known Limitations
- No unit test suite in the mobile project; `isTokenExpired` logic is exercised by the Expo web export build only
- Thai message on the login screen (`เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่`) persists until the user begins a sign-in attempt, which clears it — this is acceptable UX
- `atob` is used for base64 decoding; this is available globally in Hermes (React Native) and in all browser environments

## Recommended Commit Message
```
feat(mobile): add proactive session expiry handling

Decode JWT exp on client to detect expired tokens before API calls and
on session restore. Clears stored token, shows Thai expiry message on
login screen, and avoids sending requests with a known-expired token.
Reactive 401 handling is unchanged.
```
