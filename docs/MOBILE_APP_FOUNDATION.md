# Mobile App Foundation (T-042)

## Stack Choice

| Layer | Choice | Reason |
|---|---|---|
| Framework | Expo SDK 52 | Managed workflow — no Xcode/Android Studio config needed for dev |
| Navigation | Expo Router 4 | File-based routing (mirrors Next.js App Router convention already in web) |
| Language | TypeScript (strict) | Consistent with API and web apps |
| Styling | React Native StyleSheet | No heavy UI library — foundation only |
| Safe area | SafeAreaView (built-in RN) | Expo-compatible, no extra package needed at this stage |

## Folder Structure

```
apps/mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root Stack navigator + StatusBar
│   ├── index.tsx           # Entry point → redirects to /login
│   ├── login.tsx           # Login placeholder screen
│   └── home.tsx            # Home screen with feature cards + health check
├── src/
│   ├── api/
│   │   └── client.ts       # API client (getHealth)
│   ├── config/
│   │   └── env.ts          # EXPO_PUBLIC_* environment variables
│   ├── components/         # Placeholder — shared components (T-043+)
│   ├── hooks/              # Placeholder — custom hooks (T-043+)
│   ├── screens/            # Placeholder — non-routing screen components (T-043+)
│   └── styles/
│       └── colors.ts       # Light/dark color tokens (ready for theme toggle)
├── app.json                # Expo config (slug, scheme, plugins)
├── babel.config.js         # babel-preset-expo
├── tsconfig.json           # extends expo/tsconfig.base, strict: true
├── expo-env.d.ts           # expo-router type reference
├── package.json            # scripts + dependencies
├── .env.example            # EXPO_PUBLIC_API_BASE_URL template
└── README.md               # Developer setup guide
```

## How to Run the Mobile App

### Prerequisites

- Node.js 22
- Expo CLI (installed via `npx expo` — no global install needed)
- iOS: macOS + Xcode 16+ with a Simulator target
- Android: Android Studio + an AVD (emulator)

### Install

```bash
cd apps/mobile
npm install --legacy-peer-deps
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_BASE_URL for your target
```

### Start the dev server

```bash
npm run start
# or for a specific target:
npm run ios
npm run android
npm run web
```

Press `i` for iOS, `a` for Android, `w` for web from the Expo terminal.

### Type check (CI-safe, non-interactive)

```bash
npm run typecheck
```

## API Base URL Setup

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env`.

### iOS Simulator (macOS)

The simulator shares the Mac's network stack, so `localhost` works directly:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:4002
```

### Android Emulator

The emulator uses `10.0.2.2` to reach the host machine's loopback:

```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4002
```

### Physical Device (iOS or Android)

Find your machine's LAN IP (`ifconfig | grep "inet "` on macOS) and use it:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.x:4002
```

The device and your development machine must be on the same Wi-Fi network.  
The API Docker container must expose port 4002 externally (it does by default).

## What is Included in T-042

- Expo SDK 52 + Expo Router 4 project scaffold
- TypeScript configuration (strict mode)
- 3 screens: Login placeholder, Home with health check, Index redirect
- API client with `getHealth()` function
- `EXPO_PUBLIC_*` environment variable setup
- Color token system for future light/dark theme support
- Placeholder directory structure for components, hooks, screens
- `.gitignore` entries for Expo build artifacts
- README and this documentation

## What is Intentionally NOT Included

| Feature | Future Task |
|---|---|
| Real JWT authentication | T-043 |
| User profile screen | T-044 |
| Attendance tracking (UI) | T-045 |
| Geofence / GPS backend | T-046 |
| Clock in/out with geofence | T-047 |
| Leave request flow | T-048 |
| Thai/English i18n toggle | T-043 or T-044 |
| Full dark/light theme toggle | T-043 or T-044 |
| Push notifications | Future |
| EAS Build / OTA updates | Future |

## Future Tasks

| Task | Scope |
|---|---|
| **T-043** | Mobile Auth — JWT login, token storage, protected routes |
| **T-044** | Mobile Dashboard & Profile — real employee data |
| **T-045** | Mobile Attendance Foundation — check-in/out UI |
| **T-046** | Attendance Geofence Backend — API-side GPS validation |
| **T-047** | Mobile Geofence Clock In/Out — GPS-gated attendance |
| **T-048** | Mobile Leave Request — submit and view leave requests |

## Known Limitations (T-042)

- Login screen is a placeholder — tapping "Continue" navigates directly to Home without authentication.
- No language toggle implemented yet; Thai and English text are hardcoded side-by-side.
- No dark mode toggle; color tokens exist in `src/styles/colors.ts` but are not wired to a theme provider.
- npm install requires `--legacy-peer-deps` flag due to `react-native@0.76.5` peer dep declaring `^18.2.0` while Expo SDK 52 ships React 18.3.1. This is a known upstream version-string mismatch; no runtime impact.
- Expo EAS / OTA / production build is not configured. `npm run start` launches the local Expo Go / development build only.
