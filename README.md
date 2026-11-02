# Andemta — Ethiopian Consumer Research Marketplace

[![Monorepo](https://img.shields.io/badge/Monorepo-npm%20workspaces-blue.svg)](#monorepo-structure)
[![Backend](https://img.shields.io/badge/Backend-NestJS%2010-red.svg)](apps/api)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2015-black.svg)](apps/web)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791.svg)](#9-postgresql-setup)
[![Cache](https://img.shields.io/badge/Cache-Redis-DC382D.svg)](#10-redis-setup)

> **Andemta — Better Research. Better Decisions.**

---

## 1. Project Overview

**Andemta** is a professional consumer research marketplace designed specifically for the Ethiopian market. It bridges the gap between research commissioners (organizations, enterprises, NGOs, and academic institutions) and real consumers across Ethiopia.

---

## 2. Product Description

### For Organizations & Researchers
- **Conduct Surveys & Collect Feedback:** Commission targeted studies with verified demographic, geographic, and lifestyle criteria.
- **Product & Concept Testing:** Deliver physical prototypes, digital products, and packaging concepts directly to consumers.
- **Participant Recruitment:** Rapidly assemble participant cohorts without manual screening friction.
- **Structured Research Insights:** Access real-time analytics, auditable response data, and executive-level reports.

### For Research Participants
- **Profile Management:** Register and maintain demographic profiles to unlock research opportunities.
- **Discover Opportunities:** Participate in surveys, usability evaluations, and product feedback sessions.
- **Earn Rewards:** Receive transparent, guaranteed compensation for verified contributions.

---

## 3. Technology Stack

| Layer | Technology | Version / Details |
|---|---|---|
| **Architecture** | Monorepo + Modular Monolith | npm workspaces |
| **Backend Framework** | [NestJS](https://nestjs.com/) | v10.4+, TypeScript (strict mode) |
| **Frontend Framework** | [Next.js](https://nextjs.org/) | v15+ (App Router), React 19, TypeScript |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | v3.4+, PostCSS, Autoprefixer |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) / Lucide Icons | Accessible, customizable components |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | Direct Windows installation |
| **ORM** | [Prisma](https://www.prisma.io/) | Prisma 6 (configured in later phase) |
| **Cache & Queues** | [Redis](https://redis.io/) + BullMQ | WSL2 Ubuntu service (port 6379) |
| **Local Environment** | Windows 11 + WSL2 | Native services without Docker |

---

## 4. Monorepo Structure

```text
andemta/
├── apps/
│   ├── api/                    # NestJS backend application (@andemta/api)
│   │   ├── src/
│   │   │   ├── health/         # Health check module & controller
│   │   │   ├── app.module.ts   # Root NestJS module
│   │   │   └── main.ts         # Bootstrap entrypoint (port 4000, /api/v1)
│   │   ├── .env.example        # Backend environment template
│   │   └── package.json
│   │
│   └── web/                    # Next.js frontend application (@andemta/web)
│       ├── src/
│       │   ├── app/            # Next.js App Router (layout, page, styles)
│       │   └── components/     # Reusable UI components (Navbar, Hero, etc.)
│       ├── .env.example        # Frontend environment template
│       └── package.json
│
├── packages/
│   ├── shared/                 # Shared types, interfaces & contracts (@andemta/shared)
│   │   ├── src/index.ts
│   │   └── package.json
│   │
│   └── config/                 # Shared environment & routing constants (@andemta/config)
│       ├── src/index.ts
│       └── package.json
│
├── infrastructure/
│   └── scripts/                # Local development & service validation scripts
│       ├── check-services.ps1  # Verifies local Postgres & Redis ports
│       └── start-redis-wsl.sh  # Starts Redis daemon inside WSL2
│
├── docs/
│   ├── architecture/           # High-level architecture & design documents
│   ├── api/                    # API specification & route documentation
│   └── decisions/              # Architectural Decision Records (ADRs)
│
├── .editorconfig               # Consistent code styling rules
├── .env.example                # Root environment template
├── .gitignore                  # Git ignore rules for node_modules, .env, build output
├── package.json                # Root package configuration with npm workspaces
└── README.md                   # Project documentation
```

---

## 5. Prerequisites

Before setting up Andemta, ensure the following are installed on your machine:

- **Operating System:** Windows 10/11 (with WSL2 enabled).
- **Node.js:** `v20.x` or higher (verified with Node `v24.x`).
- **npm:** `v10.x` or higher (verified with npm `v11.x`).
- **PostgreSQL:** `15+` installed natively on Windows.
- **WSL2 (Ubuntu):** Required for running the Redis server locally.

---

## 6. Installation Instructions

1. **Clone the repository:**
   ```bash
   # Clone the repository (handled manually by user)
   cd andemta
   ```

2. **Install all workspace dependencies:**
   ```bash
   npm install
   ```

   This automatically links all workspaces (`apps/api`, `apps/web`, `packages/shared`, `packages/config`) and installs required packages.

3. **Build shared packages:**
   ```bash
   npm run build --workspace=@andemta/shared
   npm run build --workspace=@andemta/config
   ```

---

## 7. Local Development Instructions

### Running Both Applications Concurrently
To start both the NestJS API and Next.js Web frontend simultaneously:

```bash
npm run dev
```

### Running Applications Independently
- **Start Backend API only:**
  ```bash
  npm run dev:api
  ```
  API will start in watch mode at `http://localhost:4000/api/v1`.

- **Start Frontend Web only:**
  ```bash
  npm run dev:web
  ```
  Web frontend will start at `http://localhost:3000`.

---

## 8. Environment Variable Setup

The monorepo uses isolated environment files per application:

| File Location | Purpose | Template |
|---|---|---|
| Root `.env.example` | Overview template for all local services | `.env.example` |
| `apps/api/.env` | Backend port, database, and Redis credentials | `apps/api/.env.example` |
| `apps/web/.env.local` | Frontend public API base URL | `apps/web/.env.example` |

### 1. Configure Backend Environment
Copy the example file:
```bash
cp apps/api/.env.example apps/api/.env
```
Ensure your `DATABASE_URL` matches your local PostgreSQL superuser password:
```env
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/andemta_db?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FRONTEND_URL=http://localhost:3000
```

### 2. Configure Frontend Environment
Copy the example file:
```bash
cp apps/web/.env.example apps/web/.env.local
```
Content:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

---

## 9. PostgreSQL Setup (Windows)

PostgreSQL runs directly on Windows without Docker.

1. **Verify PostgreSQL Service:**
   Open Windows PowerShell and check that port 5432 is listening:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./infrastructure/scripts/check-services.ps1
   ```
   Or ensure the `postgresql-x64-<version>` service is running in `services.msc`.

2. **Create the Development Database:**
   Using the `psql` command-line tool or pgAdmin:
   ```sql
   CREATE DATABASE andemta_db;
   ```
   Or via PowerShell (if `psql` is in PATH):
   ```powershell
   psql -U postgres -c "CREATE DATABASE andemta_db;"
   ```

3. **Connection Verification:**
   ```bash
   psql -U postgres -d andemta_db -c "SELECT current_database();"
   ```

---

## 10. Redis Setup (WSL2 Ubuntu)

Redis runs inside WSL2 Ubuntu and binds to `localhost:6379`, making it transparently accessible from Windows.

1. **Install Redis inside WSL2 (One-Time Setup):**
   Open a WSL2 terminal (e.g. `wsl` in Windows Terminal):
   ```bash
   sudo apt-get update
   sudo apt-get install redis-server -y
   ```

2. **Start Redis Service inside WSL2:**
   ```bash
   sudo service redis-server start
   ```
   Or use the included helper script from within WSL:
   ```bash
   ./infrastructure/scripts/start-redis-wsl.sh
   ```

3. **Verify Redis Connectivity:**
   From WSL2:
   ```bash
   redis-cli ping
   # Expected output: PONG
   ```
   From Windows PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./infrastructure/scripts/check-services.ps1
   ```

---

## 11. Application URLs

| Application | URL | Description |
|---|---|---|
| **Web Frontend** | `http://localhost:3000` | Landing page & client app |
| **Backend API** | `http://localhost:4000/api/v1` | REST API base route |
| **API Health Check** | `http://localhost:4000/api/v1/health` | Service uptime and status |

---

## 12. Available npm Scripts

Run these scripts from the repository root:

| Command | Workspace Target | Description |
|---|---|---|
| `npm run dev` | Monorepo Root | Concurrently runs backend (`:4000`) and frontend (`:3000`) |
| `npm run dev:api` | `@andemta/api` | Starts the NestJS backend in development watch mode |
| `npm run dev:web` | `@andemta/web` | Starts the Next.js development server |
| `npm run build` | All Apps | Builds the NestJS backend and Next.js frontend |
| `npm run lint` | All Apps | Runs ESLint across all backend and frontend source files |
| `npm run test:api` | `@andemta/api` | Executes backend unit and controller tests |

---

## 13. Architecture & Standards

Detailed architectural documentation is available in the `docs/` directory:
- [Architectural Overview](docs/architecture/overview.md)
- [API Conventions & Health Check](docs/api/README.md)
- [ADR 001: Monorepo & Technology Decisions](docs/decisions/001-monorepo-modular-monolith.md)

