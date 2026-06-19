# Force mustChangePassword Flow

## Overview

When a user account has `mustChangePassword: true` (set by HR admin after provisioning a new account), the system enforces a password change before granting access to any protected features. This applies to both the Web admin app and the Mobile app.

The backend is the source of truth. The frontend reads `mustChangePassword` from the user object stored in local auth state (localStorage for web, SecureStore for mobile) and enforces the restriction at the UI layer.

---

## Web Enforcer (Next.js)

### Trigger

`AppLayout.tsx` computes `forced = user?.mustChangePassword === true` where `user` is read from localStorage and kept reactive via the `hr-user-change` custom event listener (established in T-053).

### Redirect Logic

```tsx
useEffect(() => {
  if (forced && pathname !== '/profile') {
    router.replace('/profile');
  }
}, [forced, pathname, router]);
```

- Fires whenever `forced` or `pathname` changes.
- Uses `router.replace` (not `router.push`) — no stack accumulation, no back-button loop.
- Exception: `/profile` is never redirected away from. This is the allowed escape hatch.
- Loop-safe: when on `/profile`, the condition is `false`.

### Nav Suppression

When `forced === true`, role-based nav links (dashboard, employees, departments, etc.) are rendered as disabled `<span>` elements instead of `<Link>` components. They carry the same `data-testid` attributes but cannot be clicked. A hint span (`data-testid="nav-forced-hint"`) appears below them explaining the lock.

The **Profile** link and **Logout** button remain fully functional at all times.

### Banner

The amber banner from T-053 is replaced with a red forced banner (`data-testid="banner-must-change-pw"`) using the `profile_forced_banner` i18n key.

### After Password Change

When the user successfully changes their password on the profile page:
1. Profile page updates localStorage user to `mustChangePassword: false`
2. Dispatches `hr-user-change` custom event
3. `AppLayout` hears the event, re-reads localStorage → `forced` becomes `false`
4. The redirect `useEffect` no longer fires
5. Nav items restore to `<Link>` elements immediately (no page reload needed)

---

## Mobile Enforcer (Expo React Native)

### Home Screen (`home.tsx`)

- Computes `forced = !!(profile?.mustChangePassword ?? user?.mustChangePassword)`
- FeatureCards for Attendance, Leave, and Approvals are rendered with `enabled={!forced}` and `badge="เปลี่ยนรหัสผ่านก่อน"` when forced
- The Profile card remains enabled at all times
- The org dashboard overview section (employee counts, attendance, pending-leave stats — visible to admin/manager/HR roles) is hidden when forced: `{showDashboard && !forced && (...)}`
- The existing mustChangePassword banner remains (tappable → navigates to /profile)
- Logout button remains functional

### Deep Screens (`attendance.tsx`, `leave.tsx`, `approvals.tsx`)

Each screen adds a redirect guard:

```tsx
useEffect(() => {
  if (!isLoading && isAuthenticated && user?.mustChangePassword) {
    router.replace('/profile');
  }
}, [isLoading, isAuthenticated, user?.mustChangePassword]);
```

- `router.replace('/profile')` — no stack accumulation
- Guard fires only when `isLoading=false` and `isAuthenticated=true` to match the existing auth-redirect pattern
- For approvals.tsx: guard uses `!isLoading && user?.mustChangePassword` (no `isAuthenticated` in that file's useAuth destructure)

### Profile Screen (`profile.tsx`)

No changes needed. The "← กลับ" back button leads back to `home.tsx`, which does NOT redirect away (home shows a warning banner instead). No redirect loop is possible.

### After Password Change

`useProfile.changePassword()` calls `refreshUser(token)` in AuthProvider, which re-fetches `GET /auth/me` and updates the user state with `mustChangePassword: false`. This causes all guard effects to re-evaluate → forced state lifts → feature cards re-enable.

---

## Redirect Loop Analysis

| Screen | Action | Result |
|--------|--------|--------|
| `/profile` | mustChangePassword=true | No redirect (condition excludes /profile) |
| `/profile` → Back | Goes to /home | /home shows banner, no redirect |
| `/home` | mustChangePassword=true | Cards disabled, no redirect |
| `/attendance` | mustChangePassword=true | Redirect to /profile |
| `/leave` | mustChangePassword=true | Redirect to /profile |
| `/approvals` | mustChangePassword=true | Redirect to /profile |
| Any web route | mustChangePassword=true | Redirect to /profile |
| `/profile` | mustChangePassword=false | Normal render, nav restored |

---

## Limitations (Out of Scope)

- **Password change success test** (`after change, nav restores`): This E2E test would require actually changing the admin password, which would break other tests. The success flow is tested manually and verified via unit logic.
- **Mobile E2E**: No Playwright/Detox tests for mobile — verified via TypeScript typecheck and Expo web export.
- **Forgot password**: Not implemented (out of scope per T-054 spec).
- **Password expiry schedule**: Not implemented.
- **OTP/MFA**: Not implemented.
