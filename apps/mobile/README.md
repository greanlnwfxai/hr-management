# HR Management — Mobile App

Expo React Native app for the HR Management system.

## Stack

| Item | Choice |
|---|---|
| Framework | Expo SDK 52 |
| Navigation | Expo Router 4 (file-based) |
| Language | TypeScript (strict) |
| Auth storage | expo-secure-store (Keychain / Keystore) |
| Location | expo-location (foreground only) |
| Styling | React Native StyleSheet |

## Setup

```bash
cd apps/mobile
npm install --legacy-peer-deps
cp .env.example .env
# Edit .env with your local API URL
```

## Scripts

| Command | Description |
|---|---|
| `npm run start` | Start Expo dev server |
| `npm run ios` | Launch iOS simulator |
| `npm run android` | Launch Android emulator |
| `npm run web` | Run in browser via Metro (http://localhost:3004) |
| `npm run typecheck` | TypeScript type check (CI-safe) |

## CI

The mobile app runs as a dedicated CI job (`mobile-ci`) in GitHub Actions on every push and PR to `main`.

| Check | Command | Notes |
|---|---|---|
| TypeScript typecheck | `npm run typecheck` | `tsc --noEmit` — fails on any type error |
| Expo web export | `npx expo export --platform web` | Static bundle — fails if Metro bundler errors |

**Install:** CI uses `npm ci` (plain, no `--legacy-peer-deps`). The lockfile resolves peer deps at install time, so the flag is not needed in CI. The README `setup` section uses `npm install --legacy-peer-deps` for interactive local installs where the flag is required.

**Local equivalent:**
```bash
./scripts/mobile-verify.sh
```

See [docs/MOBILE_CI.md](../../docs/MOBILE_CI.md) for the full CI reference, local verification commands, and known limitations.

## Environment Variables

Set `EXPO_PUBLIC_API_BASE_URL` in `.env`:

```
# iOS simulator
EXPO_PUBLIC_API_BASE_URL=http://localhost:4002

# Android emulator
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4002

# Physical device (replace with your machine's LAN IP)
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.x:4002
```

`EXPO_PUBLIC_*` variables are embedded at build time. Do not store secrets here.

## Local API Connectivity

The API runs on port **4002** (see root `.env` / `docker-compose.yml`).

| Target | URL |
|---|---|
| iOS Simulator | `http://localhost:4002` |
| Android Emulator | `http://10.0.2.2:4002` |
| Physical Device | `http://<LAN-IP>:4002` |

Start the API first:
```bash
# From repo root
docker compose up api db
```

## Auth

Login with JWT via `POST /auth/login`. Token stored securely with `expo-secure-store`.

**Demo credentials (local seed):**
```
Email:    admin@hr.local
Password: admin1234
```

The login screen has a **"ใช้บัญชีทดสอบ (Demo)"** button to pre-fill these values.

## Screens

| Route | Screen | Status |
|---|---|---|
| `/` | Index | Redirects based on auth state (loading → home or login) |
| `/login` | Login | Real JWT login form (T-043) |
| `/home` | Home | Protected dashboard — profile card, live HR summary, feature navigation (T-044) |
| `/attendance` | Attendance | Protected attendance screen — today card, history, live geofence clock-in/out (T-045, T-047) |

## Dashboard & Profile (T-044)

The `/home` screen fetches live data from the API using the stored JWT:

| Endpoint | Data shown |
|---|---|
| `GET /auth/me` | Profile card: email, role |
| `GET /dashboard` | Summary cards: employees, departments, attendance today, pending leave |

**Session expiry:** a `401` response clears the token and redirects to `/login` automatically.

**Refresh:** pull-to-refresh or the "อัปเดตข้อมูล" button re-fetches all data.

See [docs/MOBILE_DASHBOARD_PROFILE.md](../../docs/MOBILE_DASHBOARD_PROFILE.md) for full details.

## Attendance Screen (T-045)

Navigate to the Attendance screen by tapping the **การลงเวลา** card on the Home screen.

The `/attendance` screen fetches live attendance data from the API:

| Endpoint | Data shown |
|---|---|
| `GET /attendance/me?startDate=TODAY&endDate=TODAY&limit=1` | Today's attendance card (check-in, check-out, status) |
| `GET /attendance/me?page=1&limit=10` | Recent history list |

**Clock In / Clock Out (T-047):** Buttons are live. Tapping either button:
1. Requests foreground location permission.
2. Reads current GPS position.
3. Sends `{ source: "mobile", latitude, longitude, accuracy }` to the backend.
4. Displays backend success or geofence rejection in Thai.

Geofence enforcement is controlled by `ATTENDANCE_GEOFENCE_ENABLED` on the backend (default `false` in development).

**Testing manually:**
```bash
# Start backend
docker compose up -d

# (Optional) enable geofence in backend .env:
# ATTENDANCE_GEOFENCE_ENABLED=true
# COMPANY_LATITUDE=<lat>
# COMPANY_LONGITUDE=<lon>

# Start mobile
cd apps/mobile
npm run web

# Open http://localhost:8081
# Login with admin@hr.local / admin1234
# Tap "การลงเวลา" card on Home screen
# Grant location permission
# Tap "ลงเวลาเข้า" or "ลงเวลาออก"
```

**API base URL:** Set `EXPO_PUBLIC_API_BASE_URL` in `.env` (defaults to `http://localhost:4002`).

See [docs/MOBILE_ATTENDANCE_FOUNDATION.md](../../docs/MOBILE_ATTENDANCE_FOUNDATION.md) and [docs/MOBILE_GEOFENCE_CLOCK.md](../../docs/MOBILE_GEOFENCE_CLOCK.md) for full details.

## Future Tasks

- **T-048** — Mobile Leave Request
