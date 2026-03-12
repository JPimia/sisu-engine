import { Command } from 'commander';
import { outputJson, outputTable } from '../output.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

function duration(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function makeAgentsCommand(): Command {
  const agents = new Command('agents');
  // enablePositionalOptions ensures --db after a subcommand name is parsed
  // by the subcommand, not the parent (which also has --db).
  agents
    .enablePositionalOptions()
    .description('List active agent runs')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const leases = await storage.listLeases({ active: true });

      if (opts.json) {
        outputJson(leases);
      } else if (leases.length === 0) {
        console.log('No active agents.');
      } else {
        outputTable(
          ['Run ID', 'Role', 'Model', 'Work Item', 'Duration'],
          leases.map((l) => [l.runId, l.role, l.model, l.workItemId ?? '-', duration(l.createdAt)]),
        );
      }
    });

  // agents stop <runId>
  agents
    .command('stop <runId>')
    .description('Stop a running agent')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (runId: string, opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      // getLease takes the lease id; find by runId via listLeases
      const leases = await storage.listLeases({});
      const lease = leases.find((l) => l.runId === runId);
      if (!lease) {
        console.error(`No active lease found for run ${runId}`);
        process.exitCode = 1;
        return;
      }
      const updated = await storage.updateLease(lease.id, { active: false });
      if (opts.json) {
        outputJson(updated);
      } else {
        console.log(`Stopped agent ${runId}`);
      }
    });

  return agents;
}
