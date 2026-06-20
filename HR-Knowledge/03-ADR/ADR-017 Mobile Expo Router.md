# ADR-017: Mobile Expo Router and Web-Compatible Shell

**Status:** Accepted | **Date:** 2026-06-20

## Decision

Use Expo Router as the mobile navigation foundation, keep Expo web export compatibility, and prefer lightweight shared shell components over risky router rewrites.

## Key Points

- mobile app uses Expo Router
- Expo web export must pass
- avoid native-only changes that break web export
- shared bottom navigation and shared mobile screen header are shell components
- avoid risky router/tab rewrites unless explicitly scoped

## Source

`docs/adr/ADR-017-mobile-expo-router-and-web-compatible-shell.md`

#adr #mobile #expo
