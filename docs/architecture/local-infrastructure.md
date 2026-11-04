# Andemta Local Infrastructure Architecture

This document describes the local infrastructure topology, service dependencies, configuration, and operational workflows for the **Andemta** Consumer Research Marketplace backend.

---

## 1. Overview & Architectural Philosophy

Andemta utilizes a **local-first, non-containerized** infrastructure setup for development:

| Component | Technology | Hosting Environment | Default Port | Connection / URL |
|---|---|---|---|---|
| **Database** | PostgreSQL 16+ | Native Windows Service | `5432` | `postgresql://postgres:postgres@localhost:5432/andemta_db?schema=public` |
| **ORM** | Prisma 6.x | Monorepo (`apps/api`) | N/A | Schema: `apps/api/prisma/schema.prisma` |
| **Cache & Store** | Redis 7+ | WSL2 Ubuntu | `6379` | `localhost:6379` |
| **Background Queues** | BullMQ | Monorepo (`apps/api`) | N/A | Worker connection: `maxRetriesPerRequest: null` |
| **Backend API** | NestJS | Node.js (Windows) | `4000` | `http://localhost:4000/api/v1` |
| **Frontend Web** | Next.js | Node.js (Windows) | `3000` | `http://localhost:3000` |

### Why Native Windows + WSL2 Redis?
- **Zero Docker overhead:** Avoids heavy Docker Desktop virtualization overhead and file-system translation penalties on Windows.
- **Fast reload cycles:** Native file watching across Windows drives without container bind-mount latency.
- **Native WSL2 Port Forwarding:** WSL2 automatically forwards localhost ports to the Windows host, so Redis running in WSL2 is directly accessible at `localhost:6379` without custom network bridges.

---

## 2. PostgreSQL Configuration (Windows Native)

### Service Management
PostgreSQL runs as a native Windows service.

1. **Verify service status via PowerShell (Admin):**
   ```powershell
   Get-Service -Name postgresql*
   ```

2. **Start / Stop service:**
   ```powershell
   Start-Service -Name "postgresql-x64-16"
   Stop-Service -Name "postgresql-x64-16"
   ```

3. **Database creation (`andemta_db`):**
   ```sql
   -- Connect via psql:
   psql -U postgres

   -- Create database:
   CREATE DATABASE andemta_db;
   GRANT ALL PRIVILEGES ON DATABASE andemta_db TO postgres;
   ```

### Connection String Format
Configure in `apps/api/.env`:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/andemta_db?schema=public"
```

---

## 3. Redis Configuration (WSL2 Ubuntu)

Redis runs inside the local WSL2 Ubuntu distribution and binds to all interfaces or loopback (`127.0.0.1` / `0.0.0.0`).

### Starting Redis in WSL2
1. **Launch WSL terminal from Windows PowerShell:**
   ```powershell
   wsl -d Ubuntu
   ```

2. **Start Redis server:**
   ```bash
   sudo service redis-server start
   ```

3. **Verify Redis responsiveness:**
   ```bash
   redis-cli ping
   # Expected output: PONG
   ```

4. **Verify Windows-to-WSL accessibility:**
   From Windows PowerShell:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 6379
   ```

---

## 4. BullMQ Integration & Worker Connection Rules

BullMQ is managed through `@nestjs/bullmq` and `bullmq`.

### Important Worker Connection Constraint
BullMQ workers **mandate** that Redis connections disable request retries on blocking commands:
```typescript
{
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null, // Required by BullMQ workers
  enableReadyCheck: false,
}
```

### Demonstration Queue: `infrastructure-ping`
- **Queue Name:** `infrastructure-ping` (`INFRASTRUCTURE_PING_QUEUE`)
- **Job Name:** `infrastructure.ping` (`INFRASTRUCTURE_PING_JOB`)
- **Default Job Options:**
  - `attempts: 3`
  - `backoff: { type: 'exponential', delay: 1000 }`
  - `removeOnComplete: { count: 100, age: 3600 }` (Retain 100 completed jobs for 1 hour)
  - `removeOnFail: { count: 100, age: 86400 }` (Retain 100 failed jobs for 24 hours)

---

## 5. Health Monitoring Architecture

Andemta separates health probing into two distinct endpoints:

```text
┌─────────────────────────────────┐
│     Client / Orchestrator       │
└────────────────┬────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
 ┌───────────────┐ ┌───────────────┐
 │ GET /health   │ │ GET /ready    │
 │ (Liveness)    │ │ (Readiness)   │
 └───────┬───────┘ └───────┬───────┘
         │                 │
         │ Process state   ├───► PostgreSQL (SELECT 1)
         │ (Non-blocking)  │
         │                 └───► Redis (PING -> PONG)
         ▼                 ▼
   200 OK (Alive)    200 OK / 503 Unavailable
```

### 1. Liveness Probe (`GET /api/v1/health`)
- **Purpose:** Checks if the Node.js process is active and accepting HTTP requests.
- **Characteristics:** Non-blocking, zero external network or database queries.
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Andemta API is healthy",
    "data": {
      "status": "ok",
      "timestamp": "2026-11-04T06:30:00.000Z",
      "service": "andemta-api",
      "version": "0.1.0",
      "uptime": 128,
      "environment": "development"
    },
    "meta": null
  }
  ```

### 2. Readiness Probe (`GET /api/v1/health/ready`)
- **Purpose:** Verifies that all required backend infrastructure services are responding before traffic is routed.
- **Checks:**
  - **PostgreSQL:** Runs lightweight probe query `SELECT 1` via `PrismaService.checkHealth()`.
  - **Redis:** Sends `PING` command and expects `PONG` via `RedisService.checkHealth()`.
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Andemta API infrastructure is ready",
    "data": {
      "status": "ok",
      "timestamp": "2026-11-04T06:30:00.000Z",
      "service": "andemta-api",
      "version": "0.1.0",
      "uptime": 128,
      "environment": "development",
      "checks": {
        "database": {
          "status": "up",
          "responseTimeMs": 3
        },
        "redis": {
          "status": "up",
          "responseTimeMs": 1
        }
      }
    },
    "meta": null
  }
  ```
- **Degraded Response (503 Service Unavailable):**
  ```json
  {
    "success": false,
    "message": "One or more infrastructure services are unavailable",
    "data": null,
    "errors": [
      {
        "field": "database",
        "message": "Database probe query failed"
      }
    ]
  }
  ```

---

## 6. Local Development Startup Sequence

Follow this order when starting your local development environment:

1. **Start PostgreSQL:** Ensure Windows service `postgresql-x64-16` is running.
2. **Start Redis:** In WSL2 terminal, execute `sudo service redis-server start`.
3. **Verify Environment Configuration:** Ensure `apps/api/.env` has correct credentials.
4. **Generate Prisma Client:**
   ```bash
   npm run prisma:generate
   ```
5. **Start Application Services:**
   ```bash
   # Both API and Web concurrently
   npm run dev

   # Or backend alone
   npm run dev:api
   ```
6. **Check Readiness:**
   ```bash
   curl http://localhost:4000/api/v1/health/ready
   ```

---

## 7. Prisma Workflow & CLI Commands

All Prisma commands can be run from the root workspace or within `apps/api`:

| Command | Action |
|---|---|
| `npm run prisma:validate` | Validates `schema.prisma` syntax and configuration |
| `npm run prisma:generate` | Generates `@prisma/client` TypeScript typings |
| `npm run prisma:migrate:dev` | Creates and applies new schema migration in development |
| `npm run prisma:migrate:deploy` | Applies pending migrations in production / staging |
| `npm run prisma:studio` | Launches web UI at `http://localhost:5555` to inspect data |

---

## 8. Troubleshooting Guide

### 1. `Can't reach database server at localhost:5432`
- Verify PostgreSQL is running: `Get-Service postgresql*` in PowerShell.
- Verify credentials in `apps/api/.env`: `DATABASE_URL="postgresql://postgres:<password>@localhost:5432/andemta_db?schema=public"`.
- Verify database exists: run `psql -U postgres -l` and ensure `andemta_db` is listed.

### 2. `ECONNREFUSED 127.0.0.1:6379`
- Ensure WSL2 Redis is running: `wsl -d Ubuntu -e sudo service redis-server status`.
- Check if Redis port forwarding is blocked by Windows Firewall: run `Test-NetConnection -ComputerName localhost -Port 6379`.
- Verify Redis configuration in WSL (`/etc/redis/redis.conf`): ensure `bind 127.0.0.1 ::1` or `protected-mode no` if binding externally.

### 3. BullMQ Worker Retries Error
- **Error:** `Connection is closed` or `maxRetriesPerRequest is not null`.
- **Cause:** BullMQ requires `maxRetriesPerRequest: null` on worker connections. Check `jobs.module.ts` configuration.

