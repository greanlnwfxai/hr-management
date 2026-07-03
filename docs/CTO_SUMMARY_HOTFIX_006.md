# CTO Summary

## Step
HOTFIX-006 — Forward Production Geofence ENV to API Container

## Status
PASS

## Scope
Infrastructure-only fix. Add 5 missing environment variable forwarding entries to
`docker-compose.production.yml` under the `api` service so Portainer Stack env values
reach the API process at runtime. Update `docs/PRODUCTION_DEPLOYMENT.md` to document
the geofence env vars in the recommended-tuning table.

## Why Portainer Env Values Were Not Visible Inside API Container

Portainer Stack environment variables are available to Docker Compose as
**host-level environment variables** when `docker compose up` executes.
Docker Compose only passes a host env var into a container when the compose
file explicitly declares it under the service's `environment:` block.

`docker-compose.production.yml` did not list any of the geofence vars under
`api.environment`. Docker Compose silently ignored the Portainer-set values;
they never entered the container. `printenv` inside the container returned
nothing for them.

The backend's env-fallback path in `GeofenceConfigService.getEffectiveConfig()`
then saw:
```
process.env.COMPANY_LATITUDE  → undefined → parseFloat('') → NaN → latitude: null
process.env.COMPANY_LONGITUDE → undefined → parseFloat('') → NaN → longitude: null
```

The mobile `GET /attendance/geofence-location` response therefore returned
`latitude: null, longitude: null`, which the mobile modal correctly interpreted
as unconfigured, displaying:
> ยังไม่ได้ตั้งค่าตำแหน่งบริษัท / ติดต่อ HR เพื่อตั้งค่า geofence

## Exact Env Names Confirmed from Backend

Source: `apps/api/src/attendance/geofence-config.service.ts` lines 31–37

| Env var | Backend reads | Default (no row in DB) |
|---|---|---|
| `COMPANY_LATITUDE` | `parseFloat(process.env.COMPANY_LATITUDE ?? '')` | `NaN` → `null` |
| `COMPANY_LONGITUDE` | `parseFloat(process.env.COMPANY_LONGITUDE ?? '')` | `NaN` → `null` |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `parseInt(process.env.COMPANY_GEOFENCE_RADIUS_METERS ?? '100', 10)` | `100` |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `parseInt(process.env.ATTENDANCE_GPS_MAX_ACCURACY_METERS ?? '100', 10)` | `100` |
| `ATTENDANCE_GEOFENCE_ENABLED` | `process.env.ATTENDANCE_GEOFENCE_ENABLED === 'true'` | `false` |

> **Priority:** If a `GeofenceConfig` row with `id = 'default'` exists in the database, it
> takes precedence over all env vars. Env vars are only the fallback path.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_006.md` (this file)

## Files Modified
| File | Change |
|---|---|
| `docker-compose.production.yml` | Add 5 geofence env vars to `api.environment`; add optional-vars note in prerequisite comment |
| `docs/PRODUCTION_DEPLOYMENT.md` | Add geofence vars to "Recommended Production Tuning" table with explanatory note |

## Change Detail

### docker-compose.production.yml — api service environment block

**Before (geofence vars entirely absent):**
```yaml
environment:
  PORT: 4002
  DATABASE_URL: ${DATABASE_URL:?...}
  JWT_SECRET: ${JWT_SECRET:?...}
  JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-8h}
  CORS_ORIGIN: ${CORS_ORIGIN:?...}
  THROTTLE_TTL: ${THROTTLE_TTL:-60}
  THROTTLE_LIMIT: ${THROTTLE_LIMIT:-100}
  LOGIN_THROTTLE_TTL: ${LOGIN_THROTTLE_TTL:-60}
  LOGIN_THROTTLE_LIMIT: ${LOGIN_THROTTLE_LIMIT:-5}
  TRUST_PROXY: ${TRUST_PROXY:-true}
```

**After (geofence vars forwarded with safe defaults):**
```yaml
environment:
  ...
  TRUST_PROXY: ${TRUST_PROXY:-true}
  # Geofence / mobile attendance — required for mobile clock-in location validation.
  # Set in Portainer Stack env (or .env) to match company coordinates.
  ATTENDANCE_GEOFENCE_ENABLED: ${ATTENDANCE_GEOFENCE_ENABLED:-false}
  COMPANY_LATITUDE: ${COMPANY_LATITUDE:-}
  COMPANY_LONGITUDE: ${COMPANY_LONGITUDE:-}
  COMPANY_GEOFENCE_RADIUS_METERS: ${COMPANY_GEOFENCE_RADIUS_METERS:-100}
  ATTENDANCE_GPS_MAX_ACCURACY_METERS: ${ATTENDANCE_GPS_MAX_ACCURACY_METERS:-100}
```

**Style notes:**
- `${VAR:-}` (empty default) for `COMPANY_LATITUDE`/`LONGITUDE` — backend correctly parses
  empty string to NaN → null, matching the no-config state. Avoids hardcoding Bangkok coords
  as a production default that would silently appear configured.
- `${VAR:-false/100}` for the other three — matches the backend's own code fallbacks.
- None use `:?` (mandatory) — geofence is optional; stack starts fine without these values.

## Verification Result

```
git status --short           → M docker-compose.production.yml  M docs/PRODUCTION_DEPLOYMENT.md
git diff --check             → (no whitespace issues)

docker compose -f docker-compose.production.yml config --quiet → compose config valid

./scripts/verify.sh          → PASS (API build, Prisma validate, web build)
./scripts/mobile-verify.sh   → PASS (TypeScript + Expo web export)
./scripts/security-review.sh → PASS (secret scan, dependency audit)
```

## Production Redeploy Verification Steps

After committing, pushing, and redeploying via Portainer:

### 1. Confirm env vars are present inside the container
```bash
docker exec hr-api-prod printenv | grep -E "COMPANY_|GEOFENCE|ATTENDANCE"
```

Expected output:
```
COMPANY_LATITUDE=13.7563
COMPANY_LONGITUDE=100.5018
COMPANY_GEOFENCE_RADIUS_METERS=100
ATTENDANCE_GPS_MAX_ACCURACY_METERS=100
ATTENDANCE_GEOFENCE_ENABLED=false   # or true if set in Portainer
```

### 2. Verify the geofence API endpoint returns coordinates
```bash
# Get a JWT first
TOKEN=$(curl -s -X POST https://<your-api>/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin@hr.local","password":"<password>"}' \
  | jq -r '.accessToken')

curl -s https://<your-api>/attendance/geofence-location \
  -H "Authorization: Bearer $TOKEN" | jq .

unset TOKEN
```

Expected response (when `COMPANY_LATITUDE`/`COMPANY_LONGITUDE` are set):
```json
{
  "enabled": false,
  "latitude": 13.7563,
  "longitude": 100.5018,
  "radiusMeters": 100,
  "maxAccuracyMeters": 100,
  "source": "env"
}
```

### 3. Test mobile Home screen
- Open PWA Home screen on mobile
- Tap "เช็คอิน"
- Modal should show spinner → then "📍 ตรวจสอบตำแหน่งสำเร็จ" (not "ยังไม่ได้ตั้งค่าตำแหน่งบริษัท")
- Tap "ยืนยันเช็คอิน" → clock-in executes → "ลงเวลาเข้าสำเร็จ"

### 4. (Optional) Enable geofence enforcement
If you want the backend to reject clock-ins outside the geofence radius:
- Add `ATTENDANCE_GEOFENCE_ENABLED=true` in Portainer Stack environment
- Redeploy API service (only the api container needs restart)
- Verify: employees outside 100m of (13.7563, 100.5018) will receive a 422 rejection

## Remaining Risk / Limitations

| Item | Notes |
|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` not in Portainer (defaults to `false`) | Geofence enforcement is OFF — clock-in proceeds regardless of location. Set to `true` in Portainer when ready to enforce. |
| Portainer Stack values override `:-` defaults | Portainer env takes precedence. If someone sets `COMPANY_LATITUDE=` (empty), it passes empty string → null → modal shows no-config. |
| DB row takes precedence over env | If an admin previously saved a `GeofenceConfig` record via the web admin UI, the DB row overrides all env vars. Use the admin geofence settings page to view/update. |
| No container restart of `db` or `web` required | Only the `api` service reads these vars. Partial redeploy (api only) is sufficient. |
| `EXPO_PUBLIC_API_BASE_URL` is baked at build time | Mobile web bundle must already point to the production API. No change required here. |

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new endpoints added or changed |
| RBAC impact | None |
| Data privacy impact | None — `COMPANY_LATITUDE`/`LONGITUDE` are company premises coordinates, not employee data. Already returned by the authenticated `/attendance/geofence-location` endpoint. |
| Password/token/hash impact | None |
| Mobile security impact | None — no mobile code changed. Geofence enforcement is still server-side. |
| Dependency/advisory impact | No new packages or dependencies |
| Secrets/logging check | Coordinates are not secrets. No new sensitive data in compose or docs. |
| New endpoints protected | N/A |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — compose file change only adds env forwarding entries with safe defaults. No code logic
changed. No database changes. No API endpoint changes. Stack still starts correctly even if
the Portainer vars are not set (env defaults keep the no-config fallback intact).

## Decision
PASS

## Next Step
1. Commit this change with the recommended message below.
2. Push and retag as needed.
3. Redeploy via Portainer (Update Stack).
4. Run the production verification commands above.
5. If geofence enforcement is desired: set `ATTENDANCE_GEOFENCE_ENABLED=true` in Portainer.

## Recommended Commit Message
```
fix(deploy): forward geofence env vars to production api

docker-compose.production.yml forwarded no geofence/attendance vars
to the api container, so COMPANY_LATITUDE/LONGITUDE were undefined
inside the process. The backend env-fallback in GeofenceConfigService
then returned latitude: null, causing the mobile modal to show
"ยังไม่ได้ตั้งค่าตำแหน่งบริษัท" even though Portainer had the values set.

Add five env entries to api.environment so Portainer Stack values flow
through. Also document these vars in PRODUCTION_DEPLOYMENT.md.
```
