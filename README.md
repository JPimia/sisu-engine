# SISU

API-native orchestration engine for AI agent workflows.

SISU replaces hardcoded in-app orchestration with a standalone engine built for long-term scale: versioned APIs, extensible role and capability registries, isolated execution control, multi-model agent routing, and clean compatibility with Mission Control. Every agent in SISU is a real LLM-powered brain — not a script, not a cron loop, not a deterministic if/else chain. The coordinator thinks. The lead reasons. The builder writes code through a real coding session. AI handles intelligence. Code handles plumbing.

---

## Table of Contents

- [Architecture](#architecture)
- [Package Structure](#package-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [Live Testing Walkthrough](#live-testing-walkthrough)
- [Dashboard](#dashboard)
- [Roles Reference](#roles-reference)
- [Workflow Templates](#workflow-templates)
- [Development Guide](#development-guide)
- [Running Tests](#running-tests)

---

## Architecture

```
Mission Control  ──(HTTP/webhook)──►  SISU API Server
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼             ▼
                          @sisu/core   @sisu/runtime  @sisu/adapter-
                          (orchestr.)   -openclaw     mission-control
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               @sisu/     @sisu/    @sisu/
               protocol  templates  sdk
               (schemas)  -default  (client)
```

**Core principles:**
- **AI brains, not scripts** — every role is a real LLM session that reasons and adapts
- **API-first** — SISU never imports Mission Control internals; all communication is HTTP/webhook
- **Multi-model routing** — coordinator uses Opus (deep reasoning), builders use Codex/Claude Code (fast execution), monitor uses Haiku (cheap observation)
- **Stateless coordinator turns** — each coordinator decision is a fresh invocation with a curated briefing; storage is the memory, not the context window
- **Durable queue** — PostgreSQL-backed queue with `FOR UPDATE SKIP LOCKED` for safe concurrent workers
- **Pluggable runtimes** — OpenClaw, Claude Code, Codex, Gemini CLI, Pi; each runtime maps to one or more LLM models

### Data Flow

1. Mission Control upserts a task → SISU WorkItem
2. Coordinator AI reasons about dispatch strategy
3. Workflow template instantiated → ExecutionPlan
4. Runtime adapter spawns real AI agent sessions
5. Agents communicate via typed AgentMail
6. Results flow back through structured callbacks
7. Mission Control updates UI via webhook

---

## Package Structure

```
sisu/
├── apps/
│   ├── cli/              # sisu binary — operational CLI
│   └── server/           # Fastify HTTP API service
├── packages/
│   ├── protocol/         # Shared types + Zod/OpenAPI schemas (the contract)
│   ├── core/             # Orchestration domain logic (roles, dispatch, mail, queue)
│   ├── sdk/              # TypeScript client for Mission Control and other consumers
│   ├── runtime-openclaw/ # OpenClaw runtime adapter
│   ├── templates-default/# Built-in role and workflow templates
│   └── adapter-mission-control/ # MC-specific mapper + webhook integration
├── config/
│   └── sisu.config.yaml  # Service and runtime configuration
├── openapi/
│   └── sisu-v1.yaml      # OpenAPI contract (source of truth for external integration)
└── migrations/           # PostgreSQL schema migrations
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 22 | Required |
| pnpm | ≥ 10 | Workspace management |
| Claude Code CLI | latest | `claude` binary in PATH — needed for `claude-code` runtime |
| Codex CLI | latest | `codex` binary in PATH — needed for `codex` runtime |
| PostgreSQL | ≥ 17 | Production storage; SQLite used for local dev via CLI |

**Install Claude Code CLI:**
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

**Install Codex CLI:**
```bash
npm install -g @openai/codex
codex --version
```

---

## Installation

```bash
# Clone and install
git clone <repo-url> sisu
cd sisu
pnpm install

# Build all packages
pnpm build
```

For the `apps/cli` package, you also need to rebuild the native SQLite addon after install:

```bash
cd node_modules/better-sqlite3
npx node-gyp rebuild
cd ../..
```

### Local Development (SQLite)

The CLI uses SQLite for local development — no PostgreSQL required for basic testing.

```bash
# Initialize local storage
pnpm --filter @sisu/cli exec node dist/index.js init

# Or build and use directly
cd apps/cli
pnpm build
node dist/index.js init
```

### Production Setup (PostgreSQL)

```bash
# Set database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/sisu"

# Run migrations
pnpm migrate
```

---

## Configuration

Edit `config/sisu.config.yaml`:

```yaml
service:
  name: sisu
  apiVersion: v1
  host: 0.0.0.0
  port: 8787

storage:
  driver: postgres
  url: ${DATABASE_URL}

runtimes:
  default: openclaw
  providers:
    openclaw:
      baseUrl: ${OPENCLAW_BASE_URL}
      apiKey: ${OPENCLAW_API_KEY}
    claude-code:
      binary: claude
      flags: ["--print", "--permission-mode", "bypassPermissions"]
    codex:
      binary: codex
      flags: ["exec", "--full-auto", "--json"]

models:
  routing:
    strategic: "anthropic/claude-opus-4-6"   # coordinator, lead, supervisor
    execution: "openai/gpt-5.4"              # builder, merger
    review: "anthropic/claude-sonnet-4-6"    # reviewer, scout
    observation: "anthropic/claude-haiku"    # monitor
```

Environment variables:
- `DATABASE_URL` — PostgreSQL connection string
- `OPENCLAW_BASE_URL` — OpenClaw service URL
- `OPENCLAW_API_KEY` — OpenClaw API key

---

## CLI Reference

Binary: `sisu` (built from `apps/cli`)

All commands support `--json` for machine-readable output. The `--db <path>` flag selects the local SQLite file (default: `~/.sisu/sisu.db`).

### Service Commands

```bash
sisu init               # Initialize config and local SQLite storage
sisu health             # Check storage and runtime connectivity
sisu doctor             # Validate config, roles, and workflow templates
```

### Work Item Commands

```bash
# Create a work item
sisu work create --title "Build auth module" --kind feature --priority 1

# List work items (optionally filter by status)
sisu work list
sisu work list --status in_progress
sisu work list --limit 20

# Show item details and execution plan
sisu work show <id>

# Dispatch: select workflow template, create execution plan, start agents
sisu work dispatch <id>

# Cancel or retry
sisu work cancel <id>
sisu work retry <id>
```

**Priority scale:**

| Value | Label | Use |
|-------|-------|-----|
| 0 | Critical | System-breaking, dispatch immediately |
| 1 | High | Core functionality |
| 2 | Medium | Default (if omitted) |
| 3 | Low | Nice-to-have |
| 4 | Backlog | Future consideration |

### Role and Workflow Commands

```bash
sisu roles              # List registered roles with model routing
sisu workflows          # List available workflow templates
```

### Agent Commands

```bash
sisu agents             # List active agent runs with role, model, duration
sisu agents stop <runId># Stop a running agent
```

### Mail Commands

```bash
sisu mail list                         # All mail
sisu mail list --work-item <id>        # Mail for a specific work item
sisu mail list --agent <runId>         # Mail to/from a specific agent
sisu mail show <id>                    # Show full mail payload
```

### Dashboard

```bash
sisu dashboard                         # Live ANSI terminal dashboard (refreshes every 2s)
sisu dashboard --interval 5000         # Custom refresh interval
# Press q or Ctrl+C to exit
```

### JSON Output Format

```json
// Success
{ "success": true, "command": "work dispatch", "id": "wrk_01J..." }

// Error
{ "success": false, "command": "work dispatch", "error": "role builder cannot spawn reviewer" }

// List
{ "success": true, "command": "work list", "items": [...], "count": 12 }
```

---

## Live Testing Walkthrough

This section walks through a full end-to-end test using the local SQLite storage with real Claude Code and Codex agents.

### Step 1: Initialize

```bash
cd apps/cli
pnpm build
node dist/index.js init
# → SISU initialized at ~/.sisu/sisu.db
```

### Step 2: Verify Setup

```bash
node dist/index.js health
# ✓ storage: ok

node dist/index.js doctor
# ✓ database: ~/.sisu/sisu.db
# ✓ roles: 9 role(s) registered
# ✓ workflows: 5 workflow template(s) registered
```

### Step 3: Inspect Available Roles and Workflows

```bash
node dist/index.js roles
# ID            Name          Tier         Model
# coordinator   Coordinator   strategic    anthropic/claude-opus-4-6
# builder       Builder       execution    (tier default)
# reviewer      Reviewer      review       anthropic/claude-sonnet-4-6
# ...

node dist/index.js workflows
# ID                          Name                    Steps  Applies To
# wf_simple_task              Simple Task             2      task,bug
# wf_build_review             Build + Review          3      feature,task
# wf_scout_build_review       Scout Build Review      4      feature,research
# ...
```

### Step 4: Create a Work Item

```bash
node dist/index.js work create \
  --title "Add rate limiting to auth endpoints" \
  --kind feature \
  --priority 1

# Created work item wrk_01J...
#   Title:    Add rate limiting to auth endpoints
#   Status:   queued
#   Priority: 1
```

### Step 5: Dispatch — Select Workflow and Create Execution Plan

```bash
node dist/index.js work dispatch wrk_01J...

# Dispatched work item wrk_01J...
#   Plan:     plan_01J...
#   Workflow: wf_build_review
#   Steps:    3
```

The dispatch step:
1. Selects the best-fit workflow template based on work item kind and context
2. Instantiates an execution plan with concrete steps
3. Sets the first eligible step to `ready` for agent pickup

### Step 6: Inspect the Plan

```bash
node dist/index.js work show wrk_01J...
# ID:       wrk_01J...
# Title:    Add rate limiting to auth endpoints
# Status:   in_progress
# Role:     builder
# Run:      run_01J...
```

### Step 7: Monitor Active Agents

```bash
node dist/index.js agents
# Run ID       Role      Model                          Work Item     Duration
# run_01J...   builder   anthropic/claude-sonnet-4-6   wrk_01J...    45s
```

### Step 8: Watch Mail Flow

```bash
node dist/index.js mail list --work-item wrk_01J...
# Time      Type          From         To           Subject
# 20:15:01  dispatch      coordinator  builder      Dispatch: wrk_01J...
# 20:15:32  status        builder      coordinator  status
# 20:16:10  worker_done   builder      coordinator  Worker done: wrk_01J...
```

### Step 9: Open the Live Dashboard

In a separate terminal:

```bash
node dist/index.js dashboard
```

The dashboard shows:
- Active agents with role, model, work item, and uptime
- Work item queue (up to 10 items) with status
- Recent mail (last 5 messages)

Refreshes every 2 seconds. Press `q` or `Ctrl+C` to exit.

### Testing with Claude Code Runtime

To spawn a builder agent using the Claude Code runtime directly:

```bash
# Ensure claude binary is authenticated
claude --version

# Create and dispatch a work item; the runtime adapter will pick up
# the builder role's runtime setting ("claude-code") and invoke:
#   claude --print --permission-mode bypassPermissions
```

The `claude-code` runtime passes the agent's full briefing via stdin and captures structured output.

### Testing with Codex Runtime

```bash
# Ensure codex binary is available
codex --version

# Codex is configured as an execution-tier runtime:
#   codex exec --full-auto --json
# It is used for builder and merger roles when configured.
```

To override the runtime for a specific work item, set `workflowTemplateId` in the work item context or use a workflow template that specifies `runtimeOverride: codex` on the relevant step.

---

## Dashboard

`sisu dashboard` launches a live ANSI terminal dashboard that renders:

```
╔══════════════════════════════════════════════════════╗
║  SISU Dashboard                         2026-03-12  ║
╠══════════════════════════════════════════════════════╣
║  ACTIVE AGENTS (2)                                   ║
║  run_01J...   builder    opus-4.6   wrk_01J...  2m4s ║
║  run_01K...   reviewer   sonnet     wrk_01K...  45s  ║
╠══════════════════════════════════════════════════════╣
║  WORK ITEMS                                          ║
║  wrk_01J...  Add rate limiting         in_progress   ║
║  wrk_01K...  Fix auth bug              in_review     ║
║  wrk_01L...  Refactor storage layer    queued        ║
╠══════════════════════════════════════════════════════╣
║  RECENT MAIL                                         ║
║  20:16  worker_done  builder → coordinator           ║
║  20:15  status       builder → coordinator           ║
║  20:14  dispatch     coordinator → builder           ║
╚══════════════════════════════════════════════════════╝
```

- **Active Agents** — all leases currently marked active, with role, model, work item, and uptime
- **Work Items** — up to 10 most recent items with title and status
- **Recent Mail** — last 5 messages across all work items

Press `q` or `Ctrl+C` to exit.

---

## Roles Reference

SISU ships 9 built-in roles. The role registry supports additive future roles without core rewrites.

| ID | Name | Tier | Default Model | Runtime | Purpose |
|----|------|------|--------------|---------|---------|
| `orchestrator` | Orchestrator | strategic | claude-opus-4-6 | openclaw | Always-on oversight, system-level decisions |
| `coordinator` | Coordinator | strategic | claude-opus-4-6 | openclaw | Dispatch, decomposition, priority decisions |
| `supervisor` | Supervisor | strategic | claude-opus-4-6 / sonnet | openclaw | Oversight, escalation handling |
| `lead` | Lead | strategic | claude-sonnet-4-6 / opus | openclaw | Task decomposition, sub-task creation |
| `scout` | Scout | review | claude-sonnet-4-6 | openclaw | Research, analysis, discovery |
| `builder` | Builder | execution | claude-code / codex | claude-code / codex | Code writing via real agent sessions |
| `reviewer` | Reviewer | review | claude-sonnet-4-6 / opus | openclaw | Spec validation, code review with judgment |
| `merger` | Merger | execution | claude-code / codex | claude-code / codex | Conflict resolution with code understanding |
| `monitor` | Monitor | observation | claude-haiku | openclaw | Stall detection, anomaly observation |

Model routing is configured per role in `sisu.config.yaml` and overridable per workflow step.

### Role Permissions

Each role has a defined spawn hierarchy — a role can only spawn roles it is permitted to spawn, enforced at runtime. Write access is scoped (`none`, `specs`, `file_scope`, `adapter_defined`).

---

## Workflow Templates

Workflow templates define reusable orchestration molecules. SISU ships 5 built-in templates.

| ID | Name | Steps | Applies To |
|----|------|-------|------------|
| `wf_simple_task` | Simple Task | 2 | task, bug |
| `wf_build_review` | Build + Review | 3 | feature, task |
| `wf_scout_build_review` | Scout → Build → Review | 4 | feature, research |
| `wf_multi_stream_feature` | Multi-stream Feature | variable | feature, epic |
| `wf_rework_loop` | Rework Loop | 3+ | task, feature |

### Workflow Selection

When dispatching a work item, SISU selects a template using this priority order:

1. **Explicit** — `workflowTemplateId` set in the work item context
2. **appliesTo match** — template `appliesTo` list includes the work item kind
3. **Default** — `wf_simple_task` as fallback

### Custom Workflows

Workflow templates are YAML/JSON files. Place them in `packages/templates-default/workflows/` or load them via the API. A minimal template:

```yaml
id: wf_my_workflow
name: My Workflow
version: "1.0.0"
appliesTo: [feature]
steps:
  - id: build
    title: Build
    role: builder
  - id: review
    title: Review
    role: reviewer
    dependsOn: [build]
    reviewerRequired: true
```

---

## Development Guide

### Tech Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 22 |
| Language | TypeScript (strict) |
| API | Fastify + OpenAPI + Zod |
| Storage | PostgreSQL (production), SQLite (local dev) |
| Queue | PostgreSQL `FOR UPDATE SKIP LOCKED` |
| Packaging | pnpm workspace |
| Linting | Biome v2 |
| Testing | Vitest + real DB integration tests |

### Workspace Commands

```bash
pnpm build          # Build all packages
pnpm lint           # Lint all packages
pnpm typecheck      # Type-check all packages
pnpm test           # Run all tests (use pnpm test, not bun test)
pnpm migrate        # Run database migrations
pnpm openapi:check  # Regenerate + verify OpenAPI is in sync
```

### Package Conventions

- **`@sisu/protocol`** — exports Zod schemas from `schemas.ts`, TypeScript interfaces from `types.ts`; no runtime logic
- **`@sisu/core`** — pure orchestration logic; never imports Mission Control internals
- **`@sisu/templates-default`** — zero-dependency leaf package; types defined locally mirroring `@sisu/protocol`
- **`@sisu/runtime-openclaw`** — `AgentRuntime` interface in `interface.ts`, local types in `types.ts`

### Adding a New Role

1. Add the role definition to `packages/templates-default/src/index.ts`
2. Define model tier and runtime preference
3. Add to the built-in roles array (currently 9, extensible without core changes)
4. Register spawn permissions in the role hierarchy

### Adding a New Capability (Mission Control Feature)

1. Define capability IDs and schemas in `@sisu/protocol`
2. Register in `adapter-mission-control`
3. Extend adapter mapping for relevant entities/events
4. Optionally add or update workflow templates
5. Use `metadata`/`context` bags for feature-specific payloads

SISU core should not change unless the feature introduces genuinely new orchestration semantics.

### ID Conventions

```
Work items:      wrk_{ulid}
Execution plans: plan_{ulid}
Mail:            mail_{ulid}
Agent runs:      run_{ulid}
Leases:          lease_{ulid}
Workflows:       wf_{slug}    (human-readable, stable)
Roles:           stable string IDs (e.g. builder, reviewer)
```

### Version Management

```bash
pnpm version:bump <major|minor|patch>
```

Version lives in:
- Root `package.json`
- `packages/protocol/src/version.ts`
- Generated OpenAPI version header

API major bumps required for breaking contract changes. Minor bumps for additive changes.

---

## Running Tests

```bash
# All packages
pnpm test

# Single package
pnpm --filter @sisu/core test
pnpm --filter @sisu/cli test

# With coverage
pnpm --filter @sisu/core test -- --coverage
```

**Coverage targets:** 90%+ on core packages. Integration tests use real SQLite (local dev) or PostgreSQL (CI). Do not use mock-only confidence for critical lifecycle and queue paths.

**CI requirements:**
- All tests pass
- Zero lint errors
- No TypeScript errors
- OpenAPI spec in sync with generated output

CI runs on every PR and push to `main` with a real PostgreSQL 17 service container.
