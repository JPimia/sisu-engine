# SISU Architecture Diagrams

Mermaid diagrams showing the current MVP design. All diagrams reflect actual code, not aspirational features.

---

## 1. MVP Architecture Flowchart

Complete data flow through all packages: CLI → Core (Storage, Dispatch, Mail, Queue) → Runtime → Agent.

```mermaid
flowchart TD
    subgraph CLI["apps/cli (Commander)"]
        CMD_INIT["sisu init"]
        CMD_WORK["sisu work create|list|show\n|dispatch|cancel|retry"]
        CMD_AGENTS["sisu agents\nsisu agents stop"]
        CMD_MAIL["sisu mail list|show"]
        CMD_DASH["sisu dashboard\n(live ANSI loop)"]
    end

    subgraph Protocol["packages/protocol (leaf — no deps)"]
        TYPES["types.ts\nWorkItem, ExecutionPlan, ExecutionPlanStep\nAgentMail, RuntimeLease, RoleDefinition\nWorkflowTemplate, WorkItemStatus"]
        IDS["ids.ts\nwrk_ / plan_ / mail_ / run_ / lease_ / wf_"]
        SCHEMAS["schemas.ts\nZod schemas"]
    end

    subgraph Templates["packages/templates-default (leaf — no deps)"]
        ROLES_T["9 built-in roles\norchestrator, coordinator, supervisor\nlead, scout, builder, reviewer\nmerger, monitor"]
        WORKFLOWS_T["WorkflowTemplate[]\nwf_simple-task (default)\nappliesTo, steps[]"]
    end

    subgraph Core["packages/core"]
        subgraph Storage["storage/"]
            STORAGE["SqliteStorage (sqlite.ts)\nSQLite WAL mode\nTables: work_items, execution_plans\nplan_steps, mail, leases\nRoles+Workflows injected as in-memory arrays"]
            IFACE["SisuStorage interface (interface.ts)\ncreateWorkItem / getWorkItem / listWorkItems / updateWorkItem\ncreatePlan / getPlan / updatePlanStep\nsendMail / listMail / markRead\ncreateLease / getLease / updateLease / listLeases\nlistRoles / getRole / listWorkflows / getWorkflow"]
        end

        subgraph DispatchPkg["dispatch/"]
            BRIEFING["briefing.ts — assembleBriefing()\nFetches in parallel:\n• getWorkItem (subject)\n• listWorkItems(in_progress/blocked/planning)\n• listMail(workItemId) max 10\n• listRoles()\n• listWorkflows()"]
            WF_SEL["workflow-selector.ts — selectWorkflow()\n1. explicit workflowTemplateId in context\n2. appliesTo status match\n3. default wf_simple-task"]
            DISPATCHER["dispatcher.ts — dispatch()\nqueued → planning → in_progress\ncreatePlan from workflow steps"]
            PLAN_EXEC["plan-executor.ts — executeNextStep()\nfindReadyStep() → pending step\nwith all deps done\ngetRole → model preference\nruntime.spawn() → createLease\nupdatePlanStep(running)"]
        end

        subgraph LifecyclePkg["lifecycle/"]
            LIFECYCLE["work-item.ts\nisValidTransition() / transition()\nVALID_TRANSITIONS state machine"]
        end

        subgraph MailPkg["mail/"]
            MAILBOX["mailbox.ts\nsend() / check(agentId) / checkByWorkItem()\nmarkRead() / listMail()"]
        end

        subgraph QueuePkg["queue/"]
            QUEUE["queue.ts — Queue (SQLite)\nJobTypes: dispatch, spawn, review, retry\nenqueue() / claim() atomic / complete() / fail()"]
        end

        subgraph RolesPkg["roles/"]
            REGISTRY["registry.ts — RoleRegistry\nBuilt-in: 9 roles\nmodelTier: strategic/execution/review/observation\ncanSpawn hierarchy"]
        end
    end

    subgraph Runtime["packages/runtime-openclaw"]
        RT_MGR["RuntimeManager (manager.ts)\nregistry: Map of name → AgentRuntime\ndelegates spawn/stop/heartbeat"]
        RT_CC["ClaudeCodeRuntime (claude-code.ts)\nspawn('claude', ['--print', '--model', model\n'--permission-mode', 'bypassPermissions'])\nwrites systemPrompt+taskDescription to stdin\nMap<runId, ProcessEntry>\nheartbeat: 15s interval, TTL: 60s"]
        RT_CX["CodexRuntime (codex.ts)\nspawn('codex', ['exec', '--full-auto'\n'--json', taskDescription])"]
    end

    subgraph AgentProcess["Agent Process"]
        AGENT["Claude Code / Codex\nreads task from stdin (ClaudeCode)\nor args (Codex)\noutputs result to stdout\nsends/checks mail via storage"]
    end

    CMD_INIT -->|"openStorage(dbPath)\nmigrate schema"| STORAGE
    CMD_WORK -->|"createWorkItem()"| STORAGE
    CMD_WORK -->|"dispatch(id, storage)"| DISPATCHER
    CMD_AGENTS -->|"listLeases(active)"| STORAGE
    CMD_AGENTS -->|"runtime.stop(runId)"| RT_MGR
    CMD_MAIL -->|"listMail(filter)"| MAILBOX
    CMD_DASH -->|"listLeases + listWorkItems poll"| STORAGE

    Templates -->|"injected via constructor\noptions.roles / options.workflows"| STORAGE
    STORAGE --> IFACE

    DISPATCHER --> BRIEFING
    DISPATCHER --> WF_SEL
    DISPATCHER -->|"createPlan()"| STORAGE
    DISPATCHER -->|"updateWorkItem(status)"| STORAGE
    BRIEFING -->|"parallel reads"| STORAGE
    PLAN_EXEC -->|"getRole / createLease\nupdatePlanStep"| STORAGE
    PLAN_EXEC -->|"runtime.spawn(SpawnConfig)"| RT_MGR

    RT_MGR --> RT_CC
    RT_MGR --> RT_CX
    RT_CC -->|"child_process.spawn"| AGENT
    RT_CX -->|"child_process.spawn"| AGENT

    AGENT -->|"storage.sendMail()"| MAILBOX
    MAILBOX --> STORAGE
    AGENT -->|"storage.listMail({to, read:false})"| MAILBOX

    QUEUE -->|"claim() → dispatch job"| DISPATCHER
    CMD_WORK -->|"enqueue(dispatch)"| QUEUE

    LIFECYCLE -->|"validates transitions"| STORAGE

    style CLI fill:#dbeafe,stroke:#3b82f6
    style Protocol fill:#f0fdf4,stroke:#16a34a
    style Templates fill:#fce7f3,stroke:#db2777
    style Core fill:#fefce8,stroke:#ca8a04
    style Runtime fill:#ede9fe,stroke:#7c3aed
    style AgentProcess fill:#ffedd5,stroke:#ea580c
```

---

## 2. UML Sequence Diagram

Full lifecycle: init, create work item, dispatch, plan execution, agent spawn, heartbeats, mail exchange, completion, and monitoring.

```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI (apps/cli)
    participant Storage as Storage (SqliteStorage)
    participant Lifecycle as Lifecycle (work-item.ts)
    participant Queue as Queue (SQLite jobs)
    participant Dispatch as Dispatcher (dispatcher.ts)
    participant PlanExec as PlanExecutor (plan-executor.ts)
    participant Mailbox as Mailbox (mail/mailbox.ts)
    participant RTMgr as RuntimeManager
    participant Runtime as ClaudeCodeRuntime
    participant Agent as Agent Process

    Note over User,Storage: 1. Initialization
    User->>CLI: sisu init [--db path]
    CLI->>Storage: openStorage(dbPath) — create DB, run migrations
    Storage-->>CLI: SisuStorage instance (WAL mode, tables created)

    Note over User,Storage: 2. Work Item Creation
    User->>CLI: sisu work create --title "..."
    CLI->>Storage: createWorkItem({ title, metadata })
    Storage-->>CLI: WorkItem { id: wrk_xxx, status: "queued", version: 1 }
    CLI-->>User: Created work item wrk_xxx

    Note over CLI,Queue: 3. Queue Dispatch Job
    User->>CLI: sisu work dispatch wrk_xxx
    CLI->>Queue: enqueue({ type: "dispatch", payload: { workItemId } })
    Queue-->>CLI: Job { id: job_xxx, status: "pending" }

    Note over Queue,Dispatch: Queue Worker Claims Job
    Queue->>Queue: claim() — atomic transaction (SELECT + UPDATE pending→claimed)
    Queue-->>Dispatch: Job { type: "dispatch", payload: { workItemId } }

    Note over Dispatch,Storage: 4a. Briefing Assembly (parallel fetches)
    Dispatch->>Storage: assembleBriefing("dispatch", workItemId)
    par
        Storage->>Storage: getWorkItem(workItemId)
    and
        Storage->>Storage: listWorkItems({ status: [in_progress, blocked, planning] })
    and
        Storage->>Storage: listMail({ workItemId }) — max 10, newest first
    and
        Storage->>Storage: listRoles()
    and
        Storage->>Storage: listWorkflows()
    end
    Storage-->>Dispatch: CoordinatorBriefing { subject, activeItems, recentMail, roles, workflows }

    Note over Dispatch,Lifecycle: 4b. Status Transition queued → planning
    Dispatch->>Storage: updateWorkItem(id, { status: "planning" })
    Lifecycle->>Lifecycle: isValidTransition("queued", "planning") ✓
    Storage-->>Dispatch: WorkItem { status: "planning", version: 2 }

    Note over Dispatch: 4c. Workflow Selection
    Dispatch->>Dispatch: selectWorkflow(workItem, workflows)
    Note right of Dispatch: 1. context.workflowTemplateId (explicit)?<br/>2. workflow.appliesTo includes status?<br/>3. default: wf_simple-task

    Note over Dispatch,Storage: 4d. Plan Creation
    Dispatch->>Storage: createPlan({ workItemId, workflowTemplateId, steps[] })
    Storage-->>Dispatch: ExecutionPlan { id: plan_xxx, steps: [{ id, role, status: "pending" }] }

    Note over Dispatch,Lifecycle: 4e. Status Transition planning → in_progress
    Dispatch->>Storage: updateWorkItem(id, { status: "in_progress" })
    Lifecycle->>Lifecycle: isValidTransition("planning", "in_progress") ✓
    Storage-->>Dispatch: WorkItem { status: "in_progress", version: 3 }

    Note over PlanExec,Runtime: 5. Plan Step Execution
    Dispatch->>PlanExec: executeNextStep(plan, storage, runtime)
    PlanExec->>PlanExec: findReadyStep(plan) — pending step, all deps done
    PlanExec->>Storage: getRole(step.role)
    Storage-->>PlanExec: RoleDefinition { modelPreference: "claude-sonnet-4-6" }
    PlanExec->>RTMgr: runtime.spawn(SpawnConfig { runId: run_xxx, role, model, workItemId, planId, systemPrompt, taskDescription })
    RTMgr->>Runtime: spawn(config)
    Runtime->>Agent: child_process.spawn("claude", ["--print", "--model", "claude-sonnet-4-6", "--permission-mode", "bypassPermissions"])
    Agent->>Agent: stdin.write(systemPrompt + "\n\n" + taskDescription); stdin.end()
    Agent-->>Runtime: ChildProcess { pid }
    Runtime-->>RTMgr: AgentHandle { runId: run_xxx, pid, status: "spawning" }
    RTMgr-->>PlanExec: AgentHandle
    Runtime->>Runtime: process 'spawn' event → status = "active"

    PlanExec->>Storage: createLease({ runId, role, workItemId, planId, model })
    Storage-->>PlanExec: RuntimeLease { id: lease_xxx, runId, active: true, expiresAt }
    PlanExec->>Storage: updatePlanStep(planId, stepId, { status: "running", runId, startedAt })
    Storage-->>PlanExec: ExecutionPlan (step status: "running")

    Note over Runtime,Storage: 6. Heartbeats (every 15s, TTL 60s)
    loop every 15 seconds
        Runtime->>Runtime: heartbeat(runId) — check processes Map
        Runtime-->>RTMgr: LeaseStatus { status: "active", heartbeatAt, expiresAt }
        RTMgr->>Storage: updateLease(leaseId, { lastHeartbeat, expiresAt })
    end

    Note over Agent,Mailbox: 7. Agent Mail Exchange
    Agent->>Mailbox: storage.sendMail({ from: agentId, to: coordinator, type: "status", subject, body, workItemId })
    Mailbox->>Storage: sendMail(input)
    Storage-->>Mailbox: AgentMail { id: mail_xxx, createdAt }

    User->>CLI: sisu mail list
    CLI->>Mailbox: check(agentId, storage) — listMail({ to, read: false })
    Mailbox->>Storage: listMail({ to: agentId, read: false })
    Storage-->>Mailbox: AgentMail[]
    Mailbox-->>CLI: unread messages
    CLI->>Mailbox: markRead(mailId, storage)
    Mailbox->>Storage: markRead(mailId)

    Note over Agent,Storage: 8. Agent Completion
    Agent->>Agent: task complete → exit code 0
    Runtime->>Runtime: process 'exit' handler → status = "active" (code 0)
    PlanExec->>Storage: updatePlanStep(planId, stepId, { status: "done", completedAt })
    Storage-->>PlanExec: ExecutionPlan (step status: "done")

    PlanExec->>PlanExec: findReadyStep(plan) — next pending step?
    alt more steps ready
        PlanExec->>RTMgr: runtime.spawn(nextStep)
    else all steps done
        PlanExec->>Storage: updateWorkItem(id, { status: "done" })
        Lifecycle->>Lifecycle: isValidTransition("in_progress", "done") ✓
        Storage-->>PlanExec: WorkItem { status: "done" }
        Queue->>Queue: complete(jobId, result)
    end

    Note over User,Storage: 9. Monitoring
    User->>CLI: sisu agents
    CLI->>Storage: listLeases({ active: true })
    Storage-->>CLI: RuntimeLease[]
    CLI-->>User: active agents table

    User->>CLI: sisu dashboard
    CLI->>CLI: setInterval → poll listWorkItems + listLeases
    CLI-->>User: live ANSI terminal display
```

---

## 3. Work Item State Machine

Exact `VALID_TRANSITIONS` from `packages/core/src/lifecycle/work-item.ts`.

```mermaid
stateDiagram-v2
    [*] --> queued : createWorkItem()

    queued --> ready : ready for execution
    queued --> cancelled : cancel
    queued --> failed : error

    ready --> planning : dispatch begins
    ready --> in_progress : skip planning
    ready --> cancelled : cancel
    ready --> failed : error

    planning --> in_progress : plan created, execution starts
    planning --> blocked : dependency missing
    planning --> cancelled : cancel
    planning --> failed : error

    in_progress --> in_review : submit for review
    in_progress --> blocked : blocked on dependency
    in_progress --> done : completed successfully
    in_progress --> cancelled : cancel
    in_progress --> failed : error

    in_review --> done : approved
    in_review --> in_progress : rework needed
    in_review --> blocked : blocked on dependency
    in_review --> cancelled : cancel
    in_review --> failed : error

    blocked --> ready : unblocked
    blocked --> in_progress : resume directly
    blocked --> cancelled : cancel
    blocked --> failed : error

    done --> [*]
    failed --> [*]
    cancelled --> [*]
```

---

## 4. Package Dependency Graph

Inter-package dependencies within the pnpm workspace.

```mermaid
flowchart BT
    protocol["@sisu/protocol\npackages/protocol\n(leaf — no deps)\ntypes.ts, schemas.ts, ids.ts"]

    templates["@sisu/templates-default\npackages/templates-default\n(leaf — no deps)\n9 built-in roles + workflow templates\nmirrors protocol types locally"]

    core["@sisu/core\npackages/core\nstorage, dispatch, mail, queue\nlifecycle, roles"]

    runtime["@sisu/runtime-openclaw\npackages/runtime-openclaw\nClaudeCodeRuntime, CodexRuntime\nRuntimeManager"]

    cli["apps/cli\nCommander CLI binary (sisu)\nwork, agents, mail, dashboard\ninit, roles, health, doctor"]

    core -->|"imports types"| protocol
    runtime -->|"imports types"| protocol
    cli -->|"imports dispatch, storage"| core
    cli -->|"imports types"| protocol
    cli -.->|"templates injected\nat storage construction"| templates

    note1["plan-executor.ts defines local\nAgentRuntime interface;\nruntime-openclaw satisfies it"]
    runtime -.->|"implements"| note1
    core -.->|"defines interface"| note1
```
