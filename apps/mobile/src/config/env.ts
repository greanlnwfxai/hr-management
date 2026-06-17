// API base URL is set via EXPO_PUBLIC_API_BASE_URL in .env
// Fallback differs by platform:
//   iOS simulator  → localhost works directly
//   Android emulator → 10.0.2.2 routes to host machine
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4002';

export const ENV = {
  API_BASE_URL: DEFAULT_API_URL,
} as const;
