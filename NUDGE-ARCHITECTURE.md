# NUDGE-ARCHITECTURE.md — Nudge / Recovery / Progression System

> **Status:** Mandatory architectural requirement
> **Scope:** SISU engine core + all agent roles
> **Schema:** `sisu.architecture.nudge.v1`

## Purpose

This document defines the architecture for SISU's nudge, recovery, and progression system — the mechanisms that ensure no active workflow remains indefinitely stalled due to missed timing, missed wake-ups, or recoverable no-progress conditions.

Without this system, SISU agents can silently wait forever for signals that already arrived, miss events because they weren't listening yet, or stall without anyone noticing. The nudge system makes progress **durable and observable**.

---

## Core Principle

> **No active workflow may remain indefinitely stalled due to missed timing, missed wake-up, or recoverable no-progress conditions without detection, logging, and either recovery or escalation.**

This is not aspirational. This is a hard invariant. Any SISU deployment that violates this principle has a bug.

---

## 1. Progress Invariants

### Rule

Every active work item, plan step, agent run, and wait state must have **expected progress conditions** — concrete, evaluable conditions that define "should have advanced by now."

The system must be able to detect "should have advanced but did not."

### Rationale

Without progress invariants, stalls are invisible. You cannot detect what you haven't defined. Every active entity must declare what "forward progress" looks like and within what time window.

### Examples

- A builder spawned 10 minutes ago should have sent at least one status or worker_done mail
- A reviewer spawned 5 minutes ago should have sent review_pass or review_fail
- A work item in `in_progress` for 30+ minutes with no state transitions is potentially stalled
- A wait state expecting mail type X should have a deadline

---

## 2. Wait-State Re-evaluation

### Rule

Waiting states must be **re-checked periodically** and/or on relevant state changes. Agents or steps must not wait forever because they missed an event edge. The engine must evaluate **current state**, not just past triggers.

### Rationale

Event-driven systems have a classic failure mode: if the event fires before the consumer starts listening, the consumer waits forever. SISU must not depend on transient timing — it must evaluate durable state.

### Implementation

- Wait conditions should be expressed as **state predicates**, not just event subscriptions
- The engine should periodically re-evaluate wait predicates against current state
- When a wait state is entered, immediately check if the condition is already satisfied
- Use both: event-driven advancement (fast path) + periodic re-evaluation (safety net)

---

## 3. Nudge Engine

### Rule

Introduce a dedicated nudge/recovery component that:

- Scans for stalled work on a configurable interval
- Checks unmet vs already-satisfied wait conditions
- Replays or reissues safe wake-up signals
- Advances eligible steps when conditions are already satisfied
- Escalates when progress cannot safely continue automatically

### Rationale

Individual agents cannot reliably self-diagnose stalls (they may be dead or stuck). A centralized component with a system-wide view can detect patterns that no single agent sees.

### Where It Lives

- **Core engine** (`packages/core/`) — the nudge engine is a first-class engine component, not a role
- It runs on a timer (configurable, default: every 30 seconds)
- It has read access to: work items, execution plans, agent runs, leases, mail
- It has write access to: nudge events, escalation mail, safe state re-evaluations

---

## 4. Safe Nudges Only

### Rule

- Nudges must be **idempotent** and **rule-governed**
- Nudges must never bypass permission, lifecycle, or contract rules
- A nudge can re-evaluate, re-notify, requeue, or escalate — but NEVER invent illegal state transitions

### Rationale

A nudge system that can force arbitrary state changes is more dangerous than the stalls it prevents. Safety comes from constraining nudge actions to a well-defined, auditable set.

### Allowed Nudge Actions

| Action | Description | Safe? |
|--------|-------------|-------|
| Re-evaluate wait condition | Check if condition is now satisfied | ✅ Always safe |
| Re-send notification | Replay a mail that may have been missed | ✅ Safe if idempotent |
| Requeue work | Put a stalled item back in the processing queue | ✅ Safe if lifecycle state allows |
| Escalate | Send escalation mail to supervisor/coordinator | ✅ Always safe |
| Force state transition | Move an entity to a new lifecycle state | ❌ NEVER — only lifecycle participants do this |
| Kill agent | Terminate a stalled agent run | ⚠️ Only via orchestrator authority |

---

## 5. Missed-Signal Recovery

### Rule

If mail or a prerequisite arrived **before** a consumer started waiting, the system must still detect that the condition is already satisfied and continue. Progress must depend on **durable state + condition evaluation**, not only transient timing.

### Rationale

This is the single most common cause of silent stalls in event-driven systems. SISU's mail system is durable (mail persists in the database), so the information exists — the system just needs to check it.

### Implementation

- When an agent enters a wait state, immediately query durable state (mail, work item status, etc.)
- If the waited-for condition is already true, skip the wait and advance immediately
- The nudge engine provides a safety net: even if the immediate check is missed, periodic re-evaluation catches it

---

## 6. Stall Detection

### Rule

Detect the following stall conditions:

- **Agent stall:** Agent run with no meaningful progress (heartbeat, mail, file changes) for too long
- **Satisfied-wait stall:** Waiting step whose dependency is already satisfied but hasn't advanced
- **Unprocessed-mail stall:** Mail unread/unprocessed beyond expected threshold
- **Plan stall:** Active execution plan with no state transition in expected window
- **Lease stall:** Stale lease pretending to be active (heartbeat expired but lease not released)

Stall conditions must emit **explicit events** and **diagnostics**.

### Rationale

Detection without diagnostics is useless. When a stall is detected, the system needs to know: what stalled, for how long, what was expected, what actually happened. This enables both automated recovery and human debugging.

### Where It Lives

- **Monitor role** — the monitor agent is the primary stall detector at the agent/task level
- **Nudge engine** — the core nudge engine detects system-level stalls (missed signals, satisfied waits)
- **Lease manager** — detects stale leases via heartbeat timeout (already exists in core)

### Stall Event Schema

```typescript
interface StallEvent {
  entityType: 'agent_run' | 'work_item' | 'plan_step' | 'mail' | 'lease';
  entityId: string;
  stallType: 'no_progress' | 'satisfied_wait' | 'unprocessed_mail' | 'plan_stuck' | 'stale_lease';
  detectedAt: ISO8601;
  stalledSince: ISO8601;
  expectedCondition: string;
  actualState: string;
  diagnostics: Record<string, unknown>;
}
```

---

## 7. Escalation Path

### Rule

If automatic nudge cannot safely resolve a stall, escalate explicitly:

1. **Retry** — requeue or re-evaluate (automatic, if safe)
2. **Supervisor/Coordinator review** — escalation mail with diagnostics
3. **Human/Operator intervention** — surface to operator dashboard or notification channel
4. **Failure with reason** — mark the entity as failed with a clear diagnostic

**Silent permanent waiting is forbidden.**

### Rationale

Every stall must resolve in finite time. The escalation path ensures that even if automated recovery fails, a human eventually sees the problem. "Waiting forever" is a bug, not a state.

### Escalation Levels

| Level | Trigger | Action | Actor |
|-------|---------|--------|-------|
| L0 | Satisfied wait detected | Re-evaluate and advance | Nudge engine |
| L1 | Agent stall < threshold | Re-send wake-up signal | Nudge engine |
| L2 | Agent stall > threshold | Escalation mail | Monitor → Supervisor |
| L3 | Task stall | Escalation mail | Monitor → Coordinator |
| L4 | Systemic stall (3+ agents) | Escalation mail | Monitor → Orchestrator |
| L5 | Unresolvable | Human notification | Orchestrator → Operator |

---

## 8. Nudge Auditability

### Rule

Every nudge must be recorded with:

- **Target entity** — what was nudged (agent run, work item, plan step, etc.)
- **Detected problem** — what stall or anomaly triggered the nudge
- **Reason for nudge** — which rule or threshold was violated
- **Action taken** — what the nudge engine did (re-evaluate, re-send, escalate, etc.)
- **Result** — did the nudge resolve the stall? Did it escalate?

It must be possible to inspect why the system nudged something.

### Rationale

Without audit trails, nudge behavior is a black box. Operators need to understand: why is the system poking this agent? Is the nudge engine creating noise? Are nudges actually resolving stalls or just generating escalations?

### Nudge Record Schema

```typescript
interface NudgeRecord {
  id: string;
  timestamp: ISO8601;
  targetEntityType: string;
  targetEntityId: string;
  detectedProblem: string;
  rule: string;
  action: 're_evaluate' | 'resend_signal' | 'requeue' | 'escalate' | 'mark_failed';
  result: 'resolved' | 'escalated' | 'no_change' | 'failed';
  diagnostics: Record<string, unknown>;
}
```

---

## 9. Replay / Requeue Support

### Rule

The engine must support safe requeue/re-evaluation of stuck work **without corrupting lifecycle state**. Recovery actions must be idempotent and observable.

### Rationale

When work gets stuck, the fix is often simple: re-evaluate the condition, re-send the signal, or put the item back in the queue. But if these recovery actions aren't idempotent, they can create duplicate work, double-send mail, or corrupt state. Safety requires that recovery actions can be applied multiple times with the same result.

### Implementation

- All nudge actions must be idempotent by design
- Re-evaluation checks current state before acting (no blind replays)
- Requeued items retain their lifecycle state — requeue means "re-process from current state," not "reset to beginning"
- Every replay/requeue is logged as a NudgeRecord

---

## Implementation Guidance

### Where Each Capability Lives

| Capability | Component | Location |
|------------|-----------|----------|
| Nudge engine (core loop) | Engine core | `packages/core/nudge/` |
| Stall detection (agent-level) | Monitor role | `packages/templates-default/roles/monitor.md` + runtime |
| Stall detection (system-level) | Nudge engine | `packages/core/nudge/` |
| Wait-state re-evaluation | Engine core | `packages/core/plans/` or `packages/core/nudge/` |
| Missed-signal recovery | Engine core + mail system | `packages/core/mail/` + `packages/core/nudge/` |
| Escalation routing | Mail system | `packages/core/mail/` |
| Nudge audit log | Engine core | `packages/core/nudge/audit.ts` |
| Operator dashboard integration | API layer | `packages/api/` |

### Configuration

```typescript
interface NudgeConfig {
  enabled: boolean;
  scanIntervalMs: number;          // Default: 30000 (30s)
  agentStallThresholdMs: number;   // Default: 60000 (60s)
  waitReEvalIntervalMs: number;    // Default: 15000 (15s)
  mailUnprocessedThresholdMs: number; // Default: 30000 (30s)
  planStallThresholdMs: number;    // Default: 1800000 (30min)
  maxAutoRetries: number;          // Default: 3
  escalationCooldownMs: number;    // Default: 300000 (5min)
}
```

---

## Integration Points

### Work Items

- Every work item has expected progress conditions based on its current status
- Status transitions are monitored for timeliness
- Stalled work items trigger nudge evaluation

### Execution Plans

- Each plan step has an expected duration window
- Steps in `waiting` status are candidates for re-evaluation
- Plans with no transitions beyond threshold trigger stall events

### Leases

- Lease heartbeat expiry already exists in core
- Nudge engine supplements this by checking if expired leases have stalled dependent work
- Stale leases that block progress are escalated, not just expired

### Mail

- Unprocessed mail beyond threshold triggers nudge evaluation
- Mail that satisfies a wait condition is detected even if the waiter started late
- Re-send is safe because mail processing should be idempotent

### Agent Runs

- Agent runs without heartbeat updates trigger stall detection (Monitor role)
- Agent runs without meaningful output (mail, file changes) trigger progress stall detection (Nudge engine)
- Dead agents with active leases trigger lease cleanup + work requeue

---

## Summary

The nudge system is SISU's immune system. It ensures that:

1. **Nothing waits forever** — every wait has a deadline and re-evaluation
2. **Missed signals are recovered** — durable state beats transient timing
3. **Stalls are visible** — detection emits events and diagnostics
4. **Recovery is safe** — nudges are idempotent and rule-governed
5. **Escalation is guaranteed** — if automation can't fix it, a human sees it
6. **Everything is auditable** — every nudge is recorded with reason and result

Without this system, SISU is a fair-weather engine that works when everything goes right. With it, SISU is a resilient system that recovers from the failures that inevitably occur in distributed agent orchestration.
