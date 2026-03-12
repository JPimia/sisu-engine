import { type ChildProcess, spawn as spawnProcess, spawnSync } from 'node:child_process';
import { dispatch } from '@sisu/core';
import { newRunId } from '@sisu/protocol';
import { Command } from 'commander';
import { outputJson } from '../output.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

// ---------------------------------------------------------------------------
// RunAgentRuntime — minimal interface for the run command
// Decoupled from @sisu/core's AgentRuntime to support richer status reporting.
// ---------------------------------------------------------------------------

export interface RunSpawnConfig {
  runId: string;
  role: string;
  model: string;
  workItemId: string;
  planId: string;
  taskDescription: string;
  workingDirectory: string;
  systemPrompt: string;
}

export interface RunAgentHandle {
  runId: string;
  pid?: number;
}

export type RunAgentStatus = 'running' | 'completed' | 'failed';

export interface RunAgentRuntime {
  spawn(config: RunSpawnConfig): Promise<RunAgentHandle>;
  poll(runId: string): Promise<RunAgentStatus>;
  stop(runId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Inline Claude Code runtime implementation
// Used in production when no runtime is injected.
// ---------------------------------------------------------------------------

interface ProcessEntry {
  process: ChildProcess;
  status: RunAgentStatus | 'spawning';
}

function makeClaudeCodeRuntime(): RunAgentRuntime {
  const processes = new Map<string, ProcessEntry>();

  return {
    async spawn(config: RunSpawnConfig) {
      const args = ['--model', config.model, '--permission-mode', 'bypassPermissions'];
      const child = spawnProcess('claude', args, {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const entry: ProcessEntry = { process: child, status: 'spawning' };
      processes.set(config.runId, entry);

      const input = `${config.systemPrompt}\n\n${config.taskDescription}`;
      child.stdin?.write(input);
      child.stdin?.end();

      child.once('spawn', () => {
        const e = processes.get(config.runId);
        if (e && e.status === 'spawning') e.status = 'running';
      });

      child.once('error', () => {
        const e = processes.get(config.runId);
        if (e) e.status = 'failed';
      });

      child.once('exit', (code) => {
        const e = processes.get(config.runId);
        if (e && e.status !== 'failed') {
          e.status = code === 0 ? 'completed' : 'failed';
        }
      });

      return { runId: config.runId, pid: child.pid };
    },

    async poll(runId: string) {
      const entry = processes.get(runId);
      if (!entry) return 'failed';
      const s = entry.status;
      if (s === 'spawning' || s === 'running') return 'running';
      return s;
    },

    async stop(runId: string) {
      const entry = processes.get(runId);
      if (entry) {
        entry.process.kill('SIGTERM');
        processes.delete(runId);
      }
    },

    async isAvailable() {
      try {
        return spawnSync('which', ['claude']).status === 0;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// makeRunCommand
// ---------------------------------------------------------------------------

export function makeRunCommand(runtime?: RunAgentRuntime): Command {
  const cmd = new Command('run');

  cmd
    .description('Create, dispatch, and execute a work item end-to-end')
    .requiredOption('--title <text>', 'Work item title')
    .option('--kind <kind>', 'Work item kind (task, feature, bug)', 'task')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--model <model>', 'Model to use for agent execution', 'claude-sonnet-4-6')
    .option('--timeout <seconds>', 'Maximum time to wait in seconds', '300')
    .option('--poll <ms>', 'Heartbeat poll interval in milliseconds', '3000')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: {
        title: string;
        kind: string;
        db: string;
        model: string;
        timeout: string;
        poll: string;
        json?: boolean;
      }) => {
        const storage = openStorage(opts.db);
        const rt = runtime ?? makeClaudeCodeRuntime();

        // Step 1: Create work item
        const item = await storage.createWorkItem({
          title: opts.title,
          metadata: { kind: opts.kind },
        });
        console.log(`Created work item ${item.id}`);

        // Step 2: Dispatch → execution plan
        const plan = await dispatch(item.id, storage);
        console.log(`Dispatched → plan ${plan.id} (${plan.steps.length} step(s))`);

        // Step 3: Find first pending step
        const step = plan.steps.find((s) => s.status === 'pending');
        if (!step) {
          console.error('No pending steps in execution plan');
          process.exitCode = 1;
          return;
        }

        // Step 4: Resolve model preference
        const roleFromStorage = await storage.getRole(step.role);
        const model = roleFromStorage?.modelPreference ?? opts.model;

        // Step 5: Spawn agent
        const runId = newRunId();
        const handle = await rt.spawn({
          runId,
          role: step.role,
          model,
          workItemId: item.id,
          planId: plan.id,
          taskDescription: opts.title,
          workingDirectory: process.cwd(),
          systemPrompt: `You are a ${step.role} agent. Complete the assigned task: ${opts.title}`,
        });
        console.log(`Agent spawned (run ${handle.runId})`);

        // Step 6: Track in storage
        const lease = await storage.createLease({
          runId: handle.runId,
          role: step.role,
          workItemId: item.id,
          planId: plan.id,
          model,
        });

        await storage.updatePlanStep(plan.id, step.id, {
          status: 'running',
          runId: handle.runId,
          startedAt: new Date().toISOString(),
        });

        await storage.updateWorkItem(item.id, { assignedRun: handle.runId });

        // Step 7: Poll until terminal status
        const timeoutMs = Number(opts.timeout) * 1000;
        const pollMs = Number(opts.poll);
        const deadline = Date.now() + timeoutMs;
        let finalStatus: 'done' | 'failed' = 'failed';

        while (Date.now() < deadline) {
          await sleep(pollMs);

          const agentStatus = await rt.poll(handle.runId);
          const ts = new Date().toISOString();

          await storage.updateLease(lease.id, { lastHeartbeat: ts });

          if (agentStatus === 'completed') {
            finalStatus = 'done';
            break;
          } else if (agentStatus === 'failed') {
            finalStatus = 'failed';
            break;
          }
          // 'running' → continue polling
        }

        // Step 8: Finalize storage state
        await storage.updateLease(lease.id, { active: false });

        await storage.updatePlanStep(plan.id, step.id, {
          status: finalStatus,
          completedAt: new Date().toISOString(),
        });

        const updated = await storage.updateWorkItem(item.id, { status: finalStatus });

        if (opts.json) {
          outputJson(updated);
        } else {
          console.log(`Work item ${item.id}: ${finalStatus}`);
        }
      },
    );

  return cmd;
}
