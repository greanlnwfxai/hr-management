# ADR-017: Mobile Expo Router and Web-Compatible Shell

## Status
Accepted

## Date
2026-06-20

## Context
The mobile app now supports authenticated attendance, leave, calendar, profile, and approval workflows. It must run in Expo React Native while also preserving Expo web export compatibility for CI and verification. Navigation improvements were needed, but a risky router rewrite was outside the intended scope of recent polish work.

## Decision
Use Expo Router as the mobile navigation foundation, require Expo web export compatibility, and prefer lightweight shared shell components over risky navigation rewrites.

### Router foundation
- Mobile app uses Expo Router.
- Current protected screens include `home`, `calendar`, `attendance`, `leave`, `profile`, and `approvals`.

### Web compatibility policy
- Expo web export must pass.
- Avoid native-only APIs or patterns that break web export unless explicitly scoped with a safe fallback.
- Mobile verification should include typecheck and Expo web export where appropriate.

### Shared UI shell decision
The mobile app uses lightweight shared shell components for navigation consistency:
- shared bottom navigation component
- shared mobile screen header component

These improve navigation and visual consistency without forcing a full Expo Router tab-architecture rewrite.

### Scope restraint
- Avoid risky router or tab rewrites unless explicitly scoped.
- Prefer incremental navigation refinement when the task is polish-oriented rather than architectural.

## Consequences

**Positive**
- Expo web remains a first-class verification target.
- Shared shell components improve consistency without destabilizing routes.
- The mobile app can evolve incrementally while preserving current auth and password-change flows.

**Negative**
- The bottom navigation is not a full native tab architecture.
- Some screens, such as approvals, remain outside the main bottom-nav shell for scope safety.
- Future architectural navigation changes may still be needed if the mobile app grows significantly.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Full Expo Router tabs rewrite during polish work | Too risky for a refinement-focused milestone |
| Native-only navigation behaviors | Would weaken Expo web compatibility |
| No shared shell components | Leaves navigation/header consistency fragmented |

## Follow-up Tasks
- Reassess whether a true tabs architecture is needed only when a dedicated routing task is scoped.
- Keep Expo web export in the mobile verification path.
- Continue documenting mobile shell conventions as new screens are added.
