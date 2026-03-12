# SISU — Agent Instructions

## What This Is
SISU is an API-native orchestration engine for AI agent workflows. Every agent role is a real LLM-powered brain — not a script, not a cron loop, not deterministic if/else logic. Code handles plumbing. AI handles thinking.

## Sacred Rules
- **API-first boundaries only** — SISU must never import Mission Control internals
- **No Mission Control internals in core packages** — all MC-specific logic lives in `adapter-mission-control`
- **Strict TypeScript** — no `any`, no type assertions unless absolutely necessary and documented
- **Real DB tests** — lifecycle and queue logic must have PostgreSQL integration tests
- **All new features require protocol/schema coverage** — if it crosses a boundary, it needs a schema
- **Backward compatibility** — consider in every contract change, additive by default
- **Every role is an AI brain** — no deterministic code-based agents pretending to be intelligent
- **Multi-model routing** — different roles use different models, configured not hardcoded
- **Package boundaries are real** — core knows nothing about adapters, SDK knows nothing about internals

## Architecture
```
sisu/
  packages/
    protocol/     → Shared types + zod/openapi schemas (THE CONTRACT)
    core/         → Orchestration domain logic (roles, dispatch, lifecycle, mail, queue)
    sdk/          → TypeScript client for Mission Control and other consumers
    runtime-openclaw/           → OpenClaw runtime adapter
    adapter-mission-control/    → MC-specific mapper + webhook integration
    templates-default/          → Built-in role + workflow templates
  apps/
    server/       → Fastify HTTP API service
    cli/          → Operational CLI (`sisu` binary)
```

## Tech Stack
- Node.js 22, TypeScript strict
- Fastify + OpenAPI + Zod
- PostgreSQL (durable state, queue, outbox)
- Vitest + real DB integration tests
- Biome for formatting/linting
- pnpm workspace

## Data Flow
1. Mission Control upserts task → SISU WorkItem
2. Coordinator AI brain decides dispatch strategy
3. Workflow template instantiated → ExecutionPlan
4. Runtime adapter spawns real AI agent sessions (Claude Code / Codex / Gemini / etc.)
5. Agents communicate via typed AgentMail
6. Results flow back through structured callbacks
7. Mission Control updates UI

## Concurrency
- PostgreSQL-backed queue with FOR UPDATE SKIP LOCKED
- Optimistic versioning (CAS) on all mutable records
- Runtime leases with heartbeats (15s interval, 60s stale)
- Outbox pattern for webhook delivery
- Idempotency keys on all inbound events

## Testing Standards
- 90%+ coverage on core packages
- Integration tests with real PostgreSQL for lifecycle/queue
- No mock-only confidence for critical paths
- Every bug fix ships with a regression test

## ID Conventions
- Work items: `wrk_{ulid}`
- Execution plans: `plan_{ulid}`
- Mail: `mail_{ulid}`
- Agent runs: `run_{ulid}`
- Leases: `lease_{ulid}`
- Workflows: human-readable `wf_{slug}`
- Roles: stable string IDs (`builder`, `reviewer`, etc.)

## What NOT To Do
- Don't import Mission Control code
- Don't hardcode model choices — use config routing
- Don't use in-memory-only state for critical data
- Don't write deterministic if/else agents — every role is an AI brain
- Don't assume only 9 roles will ever exist
- Don't break backward compatibility without major version bump
