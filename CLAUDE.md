# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Discipline — READ FIRST, BEFORE ANY TASK

These two rules govern every task in this repo. Do not skip them.

### 1. CodeGraph — use it BEFORE grep/find/Read for any code question

This repo is indexed by CodeGraph (a `.codegraph/` directory exists at the root).
CodeGraph is a pre-built knowledge graph of every symbol, edge, and file — use it
instead of rolling your own grep+Read loops. It returns verbatim source **plus**
callers/callees/blast-radius in one call, in far fewer tokens.

**Reach for CodeGraph first** for any of these:
- "How does X work?" / "Where is X defined?" / architecture questions
- Tracing a flow or bug across files
- Before editing a symbol — see who calls it and what you'll break
- Surveying an area before adding code

**Tool selection (MCP — fastest path):**
- `codegraph_explore` — **PRIMARY, call first.** Accepts natural language
  ("how does TTS generation flow from UI to worker") OR a bag of symbol/file
  names. Returns verbatim source of relevant symbols grouped by file + call
  paths. Most questions need ONLY this one call.
- `codegraph_node` — Read a single file (with dependents listed) or one
  symbol's body + caller/callee trail. Use when you already know exactly
  which file/symbol.
- `codegraph_search` — Quick symbol name → location lookup (no source).
- `codegraph_callers` — List callers of one symbol.

**Shell fallback** (always works):
```bash
codegraph explore "<query or symbol names>"
codegraph node <symbol-or-file>
```

**When NOT to use CodeGraph:** raw `Read`/`Grep` is fine only to confirm a
specific detail CodeGraph didn't cover (e.g. a config value, a non-code
file). If there's no `.codegraph/` dir, skip entirely — indexing is opt-in.

**Do not** delegate code lookup to a generic subagent or run a manual
find+grep+Read sweep when CodeGraph can answer directly — that duplicates
work the index already did and costs more for the same answer.

### 2. Ponytail — lazy-senior-dev discipline (always active, level: full)

Every task. No drift. Switch: `/ponytail lite|full|ultra`. Off only on
"stop ponytail" / "normal mode".

**The ladder — stop at the first rung that holds:**
1. **YAGNI** — does this need to exist at all? Speculative = skip, say so.
2. **Reuse** — already in this codebase? helper/util/type/pattern? Look first.
3. **Stdlib** — language/platform does it?
4. **Native** — native platform feature covers it? (`<input type="date">`, CSS, DB constraint)
5. **Existing dep** — already-installed package solves it? Never add a new dep for what a few lines do.
6. **One line** — can it be one line?
7. **Minimum code** — only then, the smallest thing that works.

**Hard rules:**
- No unrequested abstractions (no 1-implementation interface, no factory for one product, no config for a constant).
- No "for later" scaffolding. Later can scaffold itself.
- Deletion over addition. Boring over clever.
- **Bug fix = root cause, not symptom.** Trace every caller of the function you're touching. One guard in the shared function beats a guard in every caller; patching only the reported path leaves siblings broken.
- Shortest working diff wins — but only after you understand the problem end-to-end. A tiny change in the wrong place is a second bug.
- Mark deliberate ceilings with a `// ponytail:` comment naming the ceiling + upgrade path.
- Non-trivial logic leaves ONE small runnable check (assert-based self-check or one small test). Trivial one-liners don't.
- Never lazy about: reading the code first, input validation at trust boundaries, error handling that prevents data loss, security, a11y, things explicitly requested.

**Output style:** code first, then at most three short lines — what was skipped, when to add it. No essays.

---

## Project Overview

**vvicat** - An AI-powered short-form video/comic production tool that automatically generates storyboards, characters, scenes, and complete videos from novel text content.

### Tech Stack
- **Framework**: Next.js 15 + React 19 (App Router)
- **Database**: MySQL 8.0 + Prisma ORM
- **Queue**: Redis + BullMQ for background task processing
- **Styling**: Tailwind CSS v4
- **Authentication**: NextAuth.js
- **Testing**: Vitest
- **Internationalization**: next-intl

## Common Development Commands

### Prerequisites
```bash
# Copy and configure environment variables (required before npm install)
cp .env.example .env
# Edit .env with your API keys
```

### Infrastructure
```bash
# Start MySQL, Redis, MinIO infrastructure (from docker-compose)
docker compose up mysql redis minio -d

# Initialize database schema (required first time)
npx prisma db push

# Full Docker setup (pre-built image)
docker compose up -d

# Full Docker setup (build locally)
git pull
docker compose down && docker compose up -d --build
```

### Development
```bash
# Install dependencies
npm install

# Start full development stack (Next.js + all workers)
npm run dev

# Start individual services:
npm run dev:next      # Next.js dev server only (http://localhost:3000)
npm run dev:worker    # Background workers
npm run dev:watchdog  # Task watchdog
npm run dev:board     # BullMQ task management board (http://localhost:3010/admin/queues)

# Production build
npm run build
npm run start
```

### Database & Prisma
```bash
# Generate Prisma client
npx prisma generate

# Push schema changes to database
npx prisma db push

# Run migrations
npx prisma migrate dev

# Open Prisma Studio (database browser)
npx prisma studio
```

### Testing
```bash
# Run all tests
npm run test:all

# Run unit tests
npm run test:unit:all

# Run billing tests
npm run test:billing

# Run integration tests
npm run test:integration:api
npm run test:integration:provider
npm run test:integration:chain
npm run test:integration:task

# Run system tests
npm run test:system

# Run regression tests
npm run test:regression:cases

# Run test guards (contracts + coverage)
npm run test:guards
```

### Code Quality
```bash
# Type checking
npm run typecheck

# Lint all files
npm run lint:all

# Verify before commit (lint + typecheck + tests)
npm run verify:commit

# Verify before push (lint + typecheck + tests + build)
npm run verify:push
```

## Project Architecture

### Core Domain Model

```
Project ──┬── NovelPromotionProject
          ├── Characters (NovelPromotionCharacter)
          ├── Episodes ──┬── Clips
          │              ├── VoiceLines
          │              ├── Storyboards ── Panels (images/videos)
          │              └── Shots
          └── Locations ── LocationImages
```

**Key Entities**:
- `User`: User accounts, preferences, balances, global assets
- `Project`: Top-level container for a user's work
- `NovelPromotionProject`: Project-specific config (models, art style, video ratio)
- `NovelPromotionCharacter`: Character definitions with multiple appearances
- `NovelPromotionLocation`: Scene/background definitions with multiple images
- `NovelPromotionEpisode`: One episode containing clips, shots, storyboards
- `NovelPromotionStoryboard`: Storyboard for a clip, containing multiple panels
- `NovelPromotionPanel`: Individual panel with image/video, lip sync, sketch
- `ArtStyle`: Global/builtin art styles with prompts and previews
- `Task`: Background task queue items (image generation, video, voice, etc.)
- `MediaObject`: Unified media storage reference for all uploaded/generated files

### Directory Structure

**Source Code (`src/`)**:
- `app/[locale]/`: Next.js App Router pages and API routes
  - `(main)/workspace/[projectId]/modes/novel-promotion/`: Core video production flow
  - `admin/`: Admin configuration center
  - `profile/`: User profile, asset library, settings
  - `api/`: Server-side API endpoints
- `components/`: Shared React components
- `lib/`: Core business logic
  - `workers/`: Background task processors (BullMQ handlers)
    - `image.worker.ts` - Image generation tasks
    - `video.worker.ts` - Video generation tasks
    - `voice.worker.ts` - Voice synthesis tasks
    - `text.worker.ts` - LLM/analysis tasks
  - `billing/`: Billing, balance management, cost calculation
  - `ai-runtime/`: AI SDK integration
  - `image-generation/`: Image generation providers
  - `config-center/`: Admin configuration (art styles, prompts)
  - `asset-utils/`: Global asset library utilities
  - `prisma/`: Prisma schema and migrations
- `hooks/`: React hooks
- `types/`: TypeScript type definitions
- `i18n/`: Internationalization

**Tests (`tests/`)**:
- `unit/`: Unit tests (billing, helpers, guards, components)
- `integration/`: Integration tests (API, provider, chain, task)
- `system/`: End-to-end system tests
- `regression/`: Regression test cases
- `contracts/`: Contract/requirement tests
- `concurrency/`: Concurrency tests
- `setup/`: Test setup files

### Architecture Patterns

1. **Task-based Asynchronous Processing**: All AI operations (image, video, voice, text) go through BullMQ queues with retries, heartbeats, and progress tracking via `Task` table.

2. **Graph-based Workflow Engine**: `GraphRun` + `GraphStep` + `GraphEvent` for complex multi-step workflows with checkpointing and resumability.

3. **Unified Media System**: All files (images, videos, audio) referenced through `MediaObject` table with SHA256 deduplication.

4. **Prompt Versioning System**: `PromptDefinition` + `PromptVersion` + `ProjectPromptOverride` for managing AI prompts with version history and per-project overrides.

5. **Billing Pipeline**: `UserBalance` → `BalanceFreeze` → `BalanceTransaction` for atomic billing with idempotency keys.

6. **Multi-tenancy**: All user data separated by `userId` foreign keys. Admin `scope` for global resources (art styles).

### Key Configuration Files

- `prisma/schema.prisma`: Database schema
- `vitest.config.ts`: Test configuration
- `.env.example`: Environment variable template
- `docker-compose.yml`: Docker development/production setup
- `scripts/seed-prompt-config.ts`: Prompt configuration seeding
- `messages/{locale}/`: i18n translation files

### Development Notes

- The app uses **Next.js App Router** (not Pages Router)
- All database operations use **Prisma Client** - no raw SQL unless necessary
- Background tasks use **BullMQ** with Redis; workers run in separate processes
- Internationalization uses `next-intl` - all user-facing text needs translations
- The project has **extensive guard tests** for contracts, coverage, and behavior quality
- API routes use `checkAuth` middleware for authentication
- Prefer **user-level concurrency gates** to prevent resource exhaustion
- Use `MediaObject` table for all file references instead of raw URLs

## Environment Variables

Key variables needed for development:
- `DATABASE_URL`: MySQL connection string
- `REDIS_HOST`/`REDIS_PORT`: Redis connection
- `MINIO_ENDPOINT`/credentials: S3-compatible storage
- `NEXTAUTH_URL`/`NEXTAUTH_SECRET`: Authentication
- API keys for AI providers (OpenAI, Google, FAL, Ark/Qwen) - configured in-app

See `.env.example` for full list.
