# CTO Summary

## Step
HOTFIX-REQ002E-D — Fix Stale PWA App Shell Cache

## Status
PASS

## Scope
Diagnose and fix the root cause of installed PWA (standalone mode) loading stale JavaScript bundle while Chrome browser mode loads the correct new code. The green off-site attendance button appeared in Chrome browser at `/home?v=1246` but did not appear when launching from the installed Home Screen icon, even after deleting the icon and re-adding it.

## Root Cause

Two interacting conditions:

**1. `nginx.conf` served `index.html` with no `Cache-Control` header.**
Without an explicit cache directive, Chrome applies heuristic caching — estimating cache lifetime from `Last-Modified` (often hours to days). The SPA entry point (`index.html`) was silently cached under the HTTP cache key `/`.

**2. PWA `start_url` is `"/"` (the cached key).**
When launched from the Home Screen in standalone mode, Chrome opens `start_url = "/"` and finds a cached (stale) `index.html` referencing the old content-hashed JS bundle. The old bundle = old code = no green button.

**Why browser mode worked but PWA did not:**
Visiting `/home?v=1246` in Chrome triggers a fetch for that URL, which nginx serves by returning `index.html` content — but Chrome caches this response under the key `/home`, not `/`. The cache entry for `start_url = "/"` is never updated by this visit. So reinstalling the PWA still reads stale `index.html` from the `/` cache entry.

There is **no service worker** in this project (Expo `output: "single"` with Metro bundler does not generate one). The issue is purely HTTP browser cache.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_REQ002E_D.md`

## Files Modified
- `apps/mobile/nginx.conf` — added three location blocks with explicit cache headers

**Before:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
```

**After:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # App shell must never be cached — every PWA launch fetches a fresh entry point
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Pragma "no-cache";
        try_files $uri =404;
    }

    # Manifest must not be cached so the installed PWA always sees the latest version
    location = /manifest.json {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Pragma "no-cache";
        try_files $uri =404;
    }

    # Content-hashed JS/CSS bundles are safe to cache forever
    location ~* ^/_expo/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
```

**Cache policy rationale:**

| Resource | Policy | Reason |
|---|---|---|
| `index.html` | `no-store, no-cache, must-revalidate` | SPA entry point — must always be fresh so new JS bundle hash is picked up |
| `manifest.json` | `no-store, no-cache, must-revalidate` | PWA manifest — must always be fresh so install sees latest version |
| `/_expo/static/*` | `public, max-age=31536000, immutable` | Content-hashed bundles — safe to cache forever; hash changes guarantee uniqueness |
| Everything else | nginx heuristic (unchanged) | Images, icons, leaflet.css — change infrequently; acceptable |

## Verification Result
```
nginx -t (via docker nginx:alpine)  → syntax ok, test successful
./scripts/verify.sh                 → PASS  (API build, Prisma schema, Web build)
./scripts/api-smoke-test.sh         → PASS  (all 10 checks)
./scripts/security-review.sh        → PASS  (dependency audit, secret scan)

curl -sI https://mobilehr.eds-center.com/ | grep cache-control
  → (no header) — confirms production currently has NO cache headers
  → after Docker rebuild this will return: Cache-Control: no-store, no-cache, must-revalidate
```

## Post-Deploy Verification Steps (manual)
1. `curl -sI https://mobilehr.eds-center.com/ | grep -i cache-control` → must show `no-store`
2. `curl -sI https://mobilehr.eds-center.com/manifest.json | grep -i cache-control` → must show `no-store`
3. `curl -sI https://mobilehr.eds-center.com/_expo/static/js/web/entry-*.js | grep -i cache-control` → must show `immutable`
4. Delete PWA from Home Screen → Add to Home Screen → Launch PWA → green off-site button must appear
5. Deploy code update → launch existing installed PWA (no reinstall) → must show new code automatically

## Issues Found
None during fix application. nginx config syntax validated via `nginx:alpine -t`. Production `curl` confirmed the absence of cache headers in current deployment, matching the diagnosis.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no endpoints added or changed |
| RBAC impact | None |
| Data privacy impact | None — cache headers do not expose new data |
| Password/token/hash impact | None |
| Mobile security impact | Positive — `no-store` on `index.html` and `manifest.json` prevents caching of files that could reference stale auth flows |
| Dependency/advisory impact | No new packages; no new audit findings |
| Secrets/logging check | None — no secrets in nginx config |
| New endpoints protected | None added |
| Risk level | LOW |
| Security decision | PASS |

## Risk
**Low.** nginx-only change. No code, no schema, no API changes. `index.html` is ~2 KB — the extra network round-trip per PWA launch adds negligible latency. Static JS bundles remain aggressively cached via `immutable`. SPA fallback (`try_files $uri $uri/ /index.html`) is unchanged. Admin Web is unaffected (separate container).

## Decision
PASS

## Next Step
Rebuild the `mobile` Docker image and deploy. Verify cache headers in production using the curl checks listed above before declaring the PWA stale-cache issue resolved.

## Recommended Commit Message
```
fix(mobile): prevent stale PWA app shell cache

nginx served index.html with no Cache-Control header, so Chrome used
heuristic caching and served a stale entry point when launching the
installed PWA via start_url="/". Visiting /home?v=1246 in browser
cached the response under a different URL key, leaving the "/" cache
untouched.

Add no-store to index.html and manifest.json so every PWA launch
fetches a fresh entry point. Add immutable to /_expo/static/* since
those bundles are content-hashed and safe to cache permanently.
```
