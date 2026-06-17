# HR Management — Mobile App

Expo React Native app for the HR Management system.

## Stack

| Item | Choice |
|---|---|
| Framework | Expo SDK 52 |
| Navigation | Expo Router 4 (file-based) |
| Language | TypeScript (strict) |
| Auth storage | expo-secure-store (Keychain / Keystore) |
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
| `npm run web` | Run in browser via Metro |
| `npm run typecheck` | TypeScript type check (CI-safe) |

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
| `/home` | Home | Protected; shows user info, feature cards, health check, logout |

## Future Tasks

- **T-044** — Mobile Dashboard & Profile
- **T-045** — Mobile Attendance Foundation
- **T-046** — Attendance Geofence Backend
- **T-047** — Mobile Geofence Clock In/Out
- **T-048** — Mobile Leave Request
