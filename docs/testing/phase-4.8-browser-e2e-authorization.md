# Phase 4.8 Browser E2E Authorization Testing Guide

**Project**: Andemta — Ethiopian Consumer Research Marketplace  
**Framework**: Playwright Test (`@playwright/test`) with system Google Chrome (`channel: 'chrome'`)

---

## 1. Prerequisites

- Node.js & npm workspaces installed (`npm install` at root)
- PostgreSQL running on `127.0.0.1:5432` with Phase 4.1+ migrations and RBAC seed applied (`npm run prisma:seed`)
- Redis running on `127.0.0.1:6379`
- Google Chrome installed locally (used via Playwright `channel: 'chrome'`)

---

## 2. Configuration & Environment Variables

Configured in `apps/web/playwright.config.ts`:
- `PLAYWRIGHT_API_PORT` (default: `4001`)
- `PLAYWRIGHT_WEB_PORT` (default: `3001`)
- `PLAYWRIGHT_API_URL` (default: `http://127.0.0.1:4001`)
- `PLAYWRIGHT_WEB_URL` (default: `http://127.0.0.1:3001`)

Playwright automatically boots isolated E2E server instances on ports `4001` (`npx nest start` with `RATE_LIMIT_ENABLED=false`) and `3001` (`npx next dev -H 127.0.0.1 -p 3001`) so tests never collide with a running dev server on `3000`/`4000` or trigger the 15-minute login rate limiter.

`apps/web/e2e/fixtures/test-fixtures.ts` automatically reads `DATABASE_URL` from `apps/api/.env` if not already set in the shell.

---

## 3. Test Fixture Strategy

`setupPhase48Fixtures()` creates isolated, timestamped test records for each spec file and cleans them up in `afterAll`:
- **Users** (created with real Argon2id password hashes and verified `emailVerifiedAt`):
  - `biniyam`: `SYSTEM:PARTICIPANT`, `ORGANIZATION:OWNER` in Shewa Fashion, `ORGANIZATION:RESEARCHER` in Debre Berhan University
  - `viewerUser`: `SYSTEM:PARTICIPANT`, `ORGANIZATION:VIEWER` in Shewa Fashion
  - `orgAdminUser`: `SYSTEM:PARTICIPANT`, `ORGANIZATION:ADMIN` in Shewa Fashion
  - `platformAdminUser`: `SYSTEM:ADMIN`, no organization memberships
  - `suspendedMemberUser`: `SYSTEM:PARTICIPANT`, `SUSPENDED` membership in Shewa Fashion
- **Organizations**: `Shewa Fashion`, `Debre Berhan University`, and `Unrelated Org`.

---

## 4. Running Browser E2E Tests

Run the full browser E2E suite from `apps/web`:
```powershell
npm run test:e2e --workspace=@andemta/web
```

Run an individual test file:
```powershell
cd apps/web
npx playwright test e2e/auth-and-session.spec.ts
npx playwright test e2e/system-authorization.spec.ts
npx playwright test e2e/organization-authorization.spec.ts
npx playwright test e2e/organization-switching.spec.ts
npx playwright test e2e/backend-regression.spec.ts
```

---

## 5. Cleanup & Limitations

- Every spec calls `fixtures.cleanup()` in `afterAll` to delete created organizations, memberships, sessions, system roles, and users.
- **Limitations**: Running against `next dev` on Windows requires up to 90s per test on cold route compilation; `RATE_LIMIT_ENABLED=false` is used only for the isolated E2E API server on port `4001`.
