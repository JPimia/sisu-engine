import { Command } from 'commander';
import { outputJson, outputTable } from '../output.js';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

export function makeRolesCommand(): Command {
  const cmd = new Command('roles');
  cmd
    .description('List registered roles with model routing')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const roles = await storage.listRoles();

      if (opts.json) {
        outputJson(roles);
      } else if (roles.length === 0) {
        console.log('No roles registered.');
      } else {
        outputTable(
          ['ID', 'Name', 'Tier', 'Model', 'Max Concurrent'],
          roles.map((r) => [
            r.id,
            r.name,
            r.modelTier,
            r.modelPreference ?? '(tier default)',
            r.maxConcurrency === -1 ? 'unlimited' : String(r.maxConcurrency),
          ]),
        );
      }
    });

  return cmd;
}

export function makeWorkflowsCommand(): Command {
  const cmd = new Command('workflows');
  cmd
    .description('List workflow templates')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { db: string; json?: boolean }) => {
      const storage = openStorage(opts.db);
      const workflows = await storage.listWorkflows();

      if (opts.json) {
        outputJson(workflows);
      } else if (workflows.length === 0) {
        console.log('No workflow templates registered.');
      } else {
        outputTable(
          ['ID', 'Name', 'Steps', 'Applies To'],
          workflows.map((w) => [
            w.id,
            w.name,
            String(w.steps.length),
            w.appliesTo?.join(', ') ?? '-',
          ]),
        );
      }
    });

  return cmd;
}
