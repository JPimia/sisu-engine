import type { ChildProcess } from 'node:child_process';
import { spawn as spawnProcess, spawnSync } from 'node:child_process';
import type { AgentRuntime } from './interface.js';
import type { AgentHandle, AgentStatus, LeaseStatus, SpawnConfig } from './types.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const LEASE_TTL_MS = 60_000;

interface ProcessEntry {
  process: ChildProcess;
  status: AgentStatus;
}

export class ClaudeCodeRuntime implements AgentRuntime {
  readonly name = 'claude-code';

  private readonly processes = new Map<string, ProcessEntry>();

  async spawn(config: SpawnConfig): Promise<AgentHandle> {
    const args = ['--print', '--model', config.model, '--permission-mode', 'bypassPermissions'];

    const child = spawnProcess('claude', args, {
      cwd: config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const entry: ProcessEntry = { process: child, status: 'spawning' };
    this.processes.set(config.runId, entry);

    const input = `${config.systemPrompt}\n\n${config.taskDescription}`;
    child.stdin?.write(input);
    child.stdin?.end();

    child.once('spawn', () => {
      const existing = this.processes.get(config.runId);
      if (existing) {
        existing.status = 'active';
      }
    });

    child.once('error', () => {
      const existing = this.processes.get(config.runId);
      if (existing) {
        existing.status = 'failed';
      }
    });

    child.once('exit', (code) => {
      const existing = this.processes.get(config.runId);
      if (existing && existing.status !== 'failed') {
        existing.status = code === 0 ? 'active' : 'failed';
      }
    });

    const handle: AgentHandle = {
      runId: config.runId,
      pid: child.pid,
      status: 'spawning',
    };

    return handle;
  }

  async stop(runId: string): Promise<void> {
    const entry = this.processes.get(runId);
    if (!entry) {
      return;
    }
    entry.process.kill('SIGTERM');
    this.processes.delete(runId);
  }

  async heartbeat(runId: string): Promise<LeaseStatus> {
    const entry = this.processes.get(runId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);
    const heartbeatAt = new Date(now.getTime() + HEARTBEAT_INTERVAL_MS);

    let status: AgentStatus;
    if (!entry) {
      status = 'failed';
    } else {
      status = entry.status;
    }

    return {
      runId,
      status,
      heartbeatAt: heartbeatAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = spawnSync('which', ['claude'], { encoding: 'utf8' });
      return result.status === 0;
    } catch {
      return false;
    }
  }
}
