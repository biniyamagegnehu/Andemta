# Production Security Checklist — Phase 3.9

This checklist details mandatory configuration, environment variables, infrastructure settings, and operational procedures required before deploying Andemta to a production environment.

---

## 1. Environment & Secrets Configuration

- [ ] **Node Environment**
  - Set `NODE_ENV=production`.
  - Ensures Pino JSON logging is enabled and detailed internal error disclosure in `AllExceptionsFilter` is suppressed.
- [ ] **JWT Access Secret**
  - Generate a minimum 32-character (256-bit) cryptographically random secret string using `openssl rand -base64 32`.
  - Set `JWT_ACCESS_SECRET` with the generated value.
  - Never commit this value to version control or source code.
- [ ] **JWT Claim Metadata**
  - `JWT_ISSUER=andemta-api`
  - `JWT_AUDIENCE=andemta-client`
  - `JWT_ACCESS_EXPIRES_IN=15m`
- [ ] **Cookie Security Flags**
  - `AUTH_COOKIE_SECURE=true` (requires HTTPS; rejects non-TLS connections).
  - `AUTH_COOKIE_SAME_SITE=lax` (prevents cross-site cookie attachment on state-mutating requests).
  - `AUTH_REFRESH_COOKIE_NAME=andemta_refresh`
  - `AUTH_REFRESH_COOKIE_PATH=/api/v1/auth` (limits scope exclusively to auth endpoints).
- [ ] **Redis Authentication & Encryption**
  - `REDIS_PASSWORD` must be set and non-empty (enforced by Joi validation when `NODE_ENV=production`).
  - `REDIS_TLS_ENABLED=true` if using cloud-hosted managed Redis with TLS (e.g., AWS ElastiCache with in-transit encryption, Upstash).
- [ ] **Database Connection & Timeouts**
  - `DATABASE_URL` pointing to production PostgreSQL cluster.
  - `DATABASE_QUERY_TIMEOUT_MS=30000` (applies `statement_timeout` on connection pool to prevent connection exhaustion).
- [ ] **Reverse Proxy & Trust Proxy**
  - Set `TRUST_PROXY` according to ingress architecture:
    - Set to `true` or specific IP/CIDR (e.g., `'loopback'`, `'10.0.0.0/8'`) when deployed behind AWS ALB, Cloudflare, Traefik, or NGINX.
    - Set to `false` if exposed directly without an ingress proxy to prevent IP spoofing attacks against rate limits.
- [ ] **Swagger Documentation Disabled**
  - `SWAGGER_ENABLED=false` (prevents API schema enumeration by unauthenticated attackers).

---

## 2. Network & Transport Security

- [ ] **HTTPS / TLS Termination**
  - Terminate TLS 1.2+ at the load balancer / reverse proxy with modern cipher suites.
  - Ensure HSTS header with `max-age=31536000; includeSubDomains; preload` is served (enabled by Helmet in `main.ts`).
- [ ] **CORS Policy**
  - Configured in `main.ts` to allow only `FRONTEND_URL`.
  - In production, ensure `FRONTEND_URL` points strictly to the production domain (e.g. `https://andemta.et`).
  - Local origins (`localhost:3000`, `127.0.0.1:3000`) are automatically excluded in production.
- [ ] **HTTP Security Headers**
  - Helmet configured with Content Security Policy (`default-src: 'none'` in API mode), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict referrer policy.

---

## 3. Rate Limiting & Abuse Prevention

- [ ] **Redis Rate Limiting Storage**
  - Verify Redis is running and reachable by API instances (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`).
  - Atomic Lua scripts track request quotas using key prefix `rl:auth:`.
- [ ] **Rate Limiter Failure Policy**
  - `RATE_LIMIT_FAIL_CLOSED=false` (default): Fails open to in-memory fallback if Redis is temporarily unreachable.
  - Set `RATE_LIMIT_FAIL_CLOSED=true` only if zero-unmetered-request tolerance is strictly mandated.
- [ ] **Account Lockout Thresholds**
  - Max 5 failed attempts per account -> 1 minute lockout.
  - 6–9 failed attempts -> 5 minutes lockout.
  - 10+ failed attempts -> 15 minutes lockout.
  - Password reset unlocks the account automatically.

---

## 4. Background Jobs & Database Maintenance

- [ ] **Automated Auth Cleanup Job**
  - Verify BullMQ worker is running with queue `auth-cleanup`.
  - Runs daily scheduled cleanup job or repeatable BullMQ job.
  - Cleans expired/revoked sessions, consumed email verification tokens, and expired password reset tokens older than `AUTH_CLEANUP_RETENTION_DAYS=30`.
- [ ] **Database Connection Pool Sizing**
  - Ensure PostgreSQL `max_connections` is sized appropriately for the number of API container instances and BullMQ worker concurrency.

---

## 5. Monitoring, Logging & Alerting

- [ ] **Pino Redaction**
  - Redaction keys active for:
    - `req.body.password`
    - `req.body.newPassword`
    - `req.body.refreshToken`
    - `req.body.token`
    - `req.query.code`
    - `req.query.state`
    - `req.headers.cookie`
    - `req.headers.authorization`
  - Never disable logging redaction.
- [ ] **Security Event Metrics / Alerts**
  - Monitor log messages for:
    - `[AccountLockoutService] Account hash ... restricted` (potential brute force attack).
    - `[AppThrottlerGuard] Rate limit exceeded` (potential DoS / credential stuffing).
    - `[CsrfOriginGuard] Rejected untrusted origin` (potential CSRF attack).
    - `[SessionService] Token reuse detected` (stolen refresh token attempt).
