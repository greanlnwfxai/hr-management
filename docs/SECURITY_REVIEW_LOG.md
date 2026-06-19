# Security Review Log

This log tracks security findings, accepted risks, and patch actions across tasks.

---

## T-052A.3 — CI Security Job + Dependabot Configuration — 2026-06-19

### Summary
Promoted the existing local security harness into GitHub Actions with a new
blocking CI job named `Security — Audit & Secret Scan`. Added Dependabot
configuration for API, Web, Mobile, and GitHub Actions. No dependencies were
patched in this task, and no product logic changed.

### CI Changes

- Updated `.github/workflows/ci.yml`
- Existing six CI jobs preserved unchanged
- Added seventh job:
  - `Security — Audit & Secret Scan`
- Job behavior:
  - installs dependencies for `apps/api`, `apps/web`, and `apps/mobile`
  - runs `./scripts/security-review.sh`
  - fails on unknown HIGH/CRITICAL advisories
  - fails on likely real committed secrets or private keys

### Dependabot Changes

- Added `.github/dependabot.yml`
- Configured weekly updates for:
  - npm `/apps/api`
  - npm `/apps/web`
  - npm `/apps/mobile`
  - `github-actions` `/`
- Policy:
  - timezone `Asia/Bangkok`
  - open PR limit `5`
  - commit prefix `chore(deps)`
  - patch/minor updates grouped per ecosystem
  - major updates remain separate
  - auto-merge not enabled

### Accepted-Risk Handling

- No new accepted-risk advisories added in T-052A.3
- Existing accepted risks continue to be tracked in `.security-accepted-risks`
- Human-readable rationale remains in `docs/SECURITY_REVIEW_LOG.md`

### Verification Results — T-052A.3

- `./scripts/security-review.sh`: **PASS**
- `./scripts/verify.sh`: **PASS**
- `npm --prefix apps/api test`: **PASS** (202/202)
- `git status`: task files present plus pre-existing untracked `AGENTS.md`

### Follow-up Notes

- Future external vulnerability intelligence remains a later enhancement
- Dependabot PR review discipline remains required because updates are not
  auto-merged

---

## T-052A.2 — Security Patch & Accepted-Risk Resolution — 2026-06-19

### Summary
Applied safe non-breaking dependency patch for `form-data` (API). Documented accepted
risk for all remaining HIGH advisories (multer in API; xmldom + tar in Mobile).
`scripts/security-audit.sh` now exits 0 with full accepted-risk transparency.

### Patch Applied

| Package | Workspace | Before | After | Method |
|---|---|---|---|---|
| `form-data` | apps/api | 4.0.0–4.0.5 (HIGH) | patched | `npm audit fix` (no --force) |

- Only `apps/api/package-lock.json` changed (260 lines updated in lockfile)
- `apps/api/package.json` unchanged
- Verified: API build PASS, 202/202 tests PASS

### Accepted-Risk Entries Added

All entries recorded in `.security-accepted-risks` with GHSA ID, workspace, date, and reason.

#### API — multer DoS (2 advisories)

### Accepted Risk — multer (GHSA-72gw-mp4g-v24j) — HIGH — 2026-06-19
- Advisory: GHSA-72gw-mp4g-v24j — Multer DoS via deeply nested field names
- Attack vector: requires multipart/form-data POST requests with crafted nested fields
- Why accepted: API has no multipart routes; all endpoints use JSON body. The npm-suggested fix (downgrade to @nestjs/core@7.5.5) is incompatible with NestJS 11.x.
- Review by: T-052A.3, or when @nestjs/platform-express ships multer update for NestJS 11

### Accepted Risk — multer (GHSA-3p4h-7m6x-2hcm) — HIGH — 2026-06-19
- Advisory: GHSA-3p4h-7m6x-2hcm — Multer DoS via incomplete cleanup of aborted uploads
- Attack vector: requires multipart/form-data POST requests with connection abort
- Why accepted: API has no multipart routes. Same fix incompatibility as above.
- Review by: T-052A.3, or when @nestjs/platform-express ships multer update for NestJS 11

#### Mobile — xmldom XML injection (5 advisories) — 2026-06-19
- Advisories: GHSA-wh4c-j3r5-mjhp, GHSA-2v35-w6hq-6mfw, GHSA-f6ww-3ggp-fr8h, GHSA-x6wf-f3px-wcqx, GHSA-j759-j44w-7fr8
- Attack vector: requires malicious XML/plist input processed by @expo/config-plugins during build
- Why accepted: @xmldom/xmldom is used only during Expo build-time iOS config processing (xcode plugin). It is NOT in the mobile app runtime bundle. Attack requires malicious Expo plugin during native build — not a production runtime risk.
- Fix path: requires expo@56.0.12 (major version; full regression test required)
- Review by: T-052A.3 or when Expo 56 migration is planned

#### Mobile — node-tar path traversal (7 advisories) — 2026-06-19
- Advisories: GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256, GHSA-r6q2-hw4h-h46w, GHSA-vmf3-w455-68vh
- Attack vector: requires processing a maliciously crafted tar archive during package extraction
- Why accepted: node-tar is used by npm's `cacache` (package download cache) during Expo build. NOT included in the mobile app runtime bundle. Attack requires a malicious npm package being installed in the development environment.
- Fix path: requires expo@56.0.12 (major version; full regression test required)
- Review by: T-052A.3 or when Expo 56 migration is planned

### security-audit.sh Changes
Updated from simple `npm audit --audit-level=high` to JSON-based accepted-risk check:
- Runs `npm audit --json` per workspace
- Extracts GHSA IDs from HIGH/CRITICAL findings using `node -e`
- Cross-references against `.security-accepted-risks` file
- PASS if all HIGHs are accepted-risk or no HIGH found
- FAIL if any HIGH is not in the accepted-risk file
- All findings (accepted and unaccepted) are always printed — nothing hidden

### Final Scan Results — T-052A.2
- `./scripts/security-audit.sh`: **PASS** (form-data patched; multer/xmldom/tar accepted-risk)
- `./scripts/secret-scan.sh`: **PASS**
- `./scripts/security-review.sh`: **PASS**
- `./scripts/verify.sh`: **PASS**
- `npm --prefix apps/api test`: **PASS** (202/202)

---

## T-052A.1 — Security Harness Foundation — 2026-06-19

### Summary
Initial security harness created. First automated scan run against the full codebase.

### Scripts Created
- `scripts/security-audit.sh`
- `scripts/secret-scan.sh`
- `scripts/security-review.sh`

### Docs Created
- `docs/SECURITY_HARNESS.md`
- `docs/SECURITY_REVIEW_CHECKLIST.md`
- `docs/SECURITY_PATCH_POLICY.md`
- `docs/SECURITY_REVIEW_LOG.md` (this file)
- `docs/CTO_SUMMARY_T052A1.md`

### Secret Scan Results — PASS
- Phase 1 (committed .env files): **PASS** — no committed .env files found
- Phase 2 (PEM private key blocks): **PASS** — no PEM blocks found
- Phase 3 (suspicious patterns): **PASS** — no findings after placeholder filtering
- Two false positives fixed during development:
  - `JWT_SECRET` in `throw new Error('JWT_SECRET environment variable is not set')` — filtered by `not set|environment variable` in PLACEHOLDER_REGEX
  - `DATABASE_URL` in generated Prisma client (`apps/api/generated/`) — excluded directory from scan
- False positive note: `accessToken`, `refreshToken`, `passwordHash` intentionally not scanned at WARN level as they are standard NestJS auth variable names

### Dependency Audit Results — FAIL (pre-existing)

All vulnerabilities below pre-date T-052A.1. No dependencies were added or modified in this task.

#### API (apps/api) — 25 vulnerabilities (1 low, 18 moderate, 6 high)

| Package | Severity | Advisory | Notes |
|---|---|---|---|
| `esbuild` 0.27.3–0.28.0 | HIGH | GHSA-g7r4-m6w7-qqqr | Arbitrary file read via dev server **on Windows only**. We run on macOS/Linux in production mode. Attack vector not applicable. |
| `form-data` 4.0.0–4.0.5 | HIGH | GHSA-hmw2-7cc7-3qxx | CRLF injection via multipart field names. Fixable with `npm audit fix`. API has no multipart upload endpoints; attack surface limited. |
| `multer` 1.0.0–2.1.1 | HIGH | GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm | DoS via deeply nested fields / incomplete cleanup. Transitive via `@nestjs/platform-express`. Fix requires `--force` (breaks @nestjs/testing). API has no file upload routes; DoS path unexposed. |
| `js-yaml` ≤4.1.1 | MODERATE | GHSA-h67p-54hq-rp68 | DoS in jest/test dependencies. Not in production runtime. |

#### Web (apps/web) — 2 moderate vulnerabilities

| Package | Severity | Advisory | Notes |
|---|---|---|---|
| `postcss` <8.5.10 | MODERATE | GHSA-qx2v-qp2m-jg93 | XSS via unescaped `</style>` in CSS stringify. Internal Next.js dependency. Fix requires `--force` (downgrades Next.js). |

#### Mobile (apps/mobile) — 30 vulnerabilities (24 moderate, 6 high)

| Package | Severity | Advisory | Notes |
|---|---|---|---|
| `tar` ≤7.5.15 | HIGH (multiple) | GHSA-34x7-hfp2-rc4v and others | Path traversal, arbitrary file creation/overwrite via archive extraction. Build-tool dependency only; not included in app bundle. |
| `uuid` <11.1.1 | MODERATE | GHSA-w5hq-g745-h8pq | Missing buffer bounds check. In Expo internals. Fix requires `--force` (upgrades Expo major version). |

### Risk Assessment for Pre-existing Findings

- **esbuild HIGH**: Effective risk **LOW** — Windows-only, dev server only, not applicable to our environment.
- **form-data HIGH**: Effective risk **MEDIUM** — CRLF injection, but no multipart routes exposed. Recommend targeted patch in T-052A.2.
- **multer HIGH**: Effective risk **LOW-MEDIUM** — DoS requires multipart requests; no such routes exist. Fix path unsafe without `--force`.
- **postcss MODERATE**: Effective risk **LOW** — XSS in CSS stringify, internal Next.js use only.
- **tar HIGH (mobile)**: Effective risk **LOW** — build-tool only, not in app runtime bundle.
- **uuid MODERATE (mobile)**: Effective risk **LOW** — Expo internals, not exposed API.

### Known Limitations
- Secret scan does not cover git history (use truffleHog for that)
- npm audit reflects lockfile state at time of run
- Mobile HIGH findings are Expo ecosystem managed; safe patches require Expo major version upgrade and full verification

### Next Planned Step: T-052A.2
- Add GitHub Actions security job (`security-review.sh` on PR)
- Configure Dependabot
- Establish external advisory workflow
- Evaluate safe targeted patches for `form-data` and `esbuild`
- Document accepted-risk for multer and tar (build-tool only)

---
