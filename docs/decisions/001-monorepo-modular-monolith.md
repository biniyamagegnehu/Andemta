# ADR 001: Monorepo Architecture and Confirmed Technology Stack

## Status
Accepted

## Context
Andemta is an Ethiopian Consumer Research Marketplace connecting organizations, businesses, and universities with research participants. To build a robust, maintainable, and scalable long-term platform, key technical decisions were needed for repository structure, language ecosystem, framework selection, and local developer infrastructure.

## Decisions

1. **Repository & Workspaces: Monorepo with npm Workspaces**
   - We utilize a unified monorepo managed via native `npm workspaces` (`apps/api`, `apps/web`, `packages/shared`, `packages/config`).
   - *Rationale:* Eliminates multi-repo synchronization lag, simplifies dependency management without third-party tool complexity, and enables atomic type sharing.

2. **Backend Framework: NestJS + TypeScript**
   - The backend service (`apps/api`) is structured as a Modular Monolith in NestJS.
   - *Rationale:* Provides strong architectural guardrails, native dependency injection, decorators, TypeScript-first development, and clean modular boundaries that can scale gracefully.

3. **Frontend Framework: Next.js + TypeScript (App Router)**
   - The frontend (`apps/web`) uses Next.js with the App Router, Tailwind CSS, and shadcn/ui.
   - *Rationale:* High performance, server-side rendering capability for SEO/landing pages, rich client component ecosystem for interactive surveys and dashboards.

4. **Database & ORM: PostgreSQL + Prisma 6**
   - The primary data store is PostgreSQL (`andemta_db`), operated locally directly on Windows without Docker. Prisma 6 provides type-safe schema modeling and migrations.

5. **Cache & Queue: Redis + BullMQ**
   - Redis runs locally inside WSL2 Ubuntu (`localhost:6379`) to power in-memory caching and BullMQ background task processing.

6. **API Structure & Standards**
   - REST API prefixed globally at `/api/v1`.
   - Health check at `/api/v1/health`.
   - Strict TypeScript mode enabled across all packages.

## Consequences
- Developers need Node.js, native PostgreSQL on Windows, and WSL2 Ubuntu with Redis installed.
- No Docker overhead is required for local development.
- Business feature implementations commence in subsequent phases atop this validated foundation.

