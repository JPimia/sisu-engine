// biome-ignore lint/style/useNodejsImportProtocol: node:child_process resolves to @types/node@25 (ChildProcess.once missing); child_process resolves to @types/node@22 (correct overloads)
import type { ChildProcess } from 'child_process';
// biome-ignore lint/style/useNodejsImportProtocol: see above
import { spawn as spawnProcess, spawnSync } from 'child_process';
<<<<<<< HEAD
import { prepareAssignmentInjection } from './assignment-support.js';
=======
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
>>>>>>> overstory/builder-selector-fix/sisu-2d2f
import type { AgentRuntime } from './interface.js';
import type { AgentHandle, AgentStatus, LeaseStatus, SpawnConfig } from './types.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const LEASE_TTL_MS = 60_000;

function resolveClaude(): string {
  const bunPath = join(homedir(), '.bun', 'bin', 'claude');
  return existsSync(bunPath) ? bunPath : 'claude';
}

interface ProcessEntry {
  process: ChildProcess;
  status: AgentStatus;
  stdout: string;
  stderr: string;
}

export class ClaudeCodeRuntime implements AgentRuntime {
  readonly name = 'claude-code';

  private readonly processes = new Map<string, ProcessEntry>();

  async spawn(config: SpawnConfig): Promise<AgentHandle> {
<<<<<<< HEAD
    const injection = await prepareAssignmentInjection(config);

    const systemPrompt = injection?.systemPrompt ?? config.systemPrompt;
    const taskWithPrompt = `${systemPrompt}\n\n---\n\nTask: ${config.taskDescription}`;

=======
    const claudeBin = resolveClaude();
>>>>>>> overstory/builder-selector-fix/sisu-2d2f
    const args = [
      '--model',
      config.model,
      '--permission-mode',
      'bypassPermissions',
<<<<<<< HEAD
      taskWithPrompt,
    ];

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(injection?.env ?? {}),
    };

    const child: ChildProcess = spawnProcess('claude', args, {
      cwd: config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
=======
      '-p',
      config.taskDescription,
    ];

    const bunInstall = join(homedir(), '.bun');
    const bunBin = join(bunInstall, 'bin');
    const spawnEnv = {
      ...process.env,
      BUN_INSTALL: bunInstall,
      PATH: `${bunBin}:${process.env.PATH ?? ''}`,
      CLAUDE_NO_CHROME: '1',
    };

    const child: ChildProcess = spawnProcess(claudeBin, args, {
      cwd: config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
>>>>>>> overstory/builder-selector-fix/sisu-2d2f
    });

    const entry: ProcessEntry = { process: child, status: 'spawning', stdout: '', stderr: '' };
    this.processes.set(config.runId, entry);

    child.stdout?.on('data', (chunk: Buffer) => {
      const existing = this.processes.get(config.runId);
      if (existing) {
        existing.stdout += chunk.toString();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const existing = this.processes.get(config.runId);
      if (existing) {
        existing.stderr += chunk.toString();
      }
    });

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
        existing.status = code === 0 ? 'completed' : 'failed';
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
      const claudeBin = join(homedir(), '.bun', 'bin', 'claude');
      if (existsSync(claudeBin)) {
        return true;
      }
      const result = spawnSync('which', ['claude'], { encoding: 'utf8' });
      return result.status === 0;
    } catch {
      return false;
    }
  }
}
