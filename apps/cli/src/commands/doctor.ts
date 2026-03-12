import { Command } from 'commander';
import { outputJson } from '../output.js';
import { DEFAULT_DB_PATH, openStorage, storageExists } from '../storage.js';

export function makeDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd
    .description('Validate config, templates, and roles')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { db: string; json?: boolean }) => {
      const diagnostics: Array<{ name: string; status: 'ok' | 'error'; message: string }> = [];

      // Check DB exists
      if (!storageExists(opts.db)) {
        diagnostics.push({
          name: 'database',
          status: 'error',
          message: `Not found at ${opts.db}. Run 'sisu init'.`,
        });
      } else {
        diagnostics.push({ name: 'database', status: 'ok', message: opts.db });

        try {
          const storage = openStorage(opts.db);

          // Check roles
          const roles = await storage.listRoles();
          diagnostics.push({
            name: 'roles',
            status: roles.length > 0 ? 'ok' : 'error',
            message: `${roles.length} role(s) registered`,
          });

          // Check workflows
          const workflows = await storage.listWorkflows();
          diagnostics.push({
            name: 'workflows',
            status: workflows.length > 0 ? 'ok' : 'error',
            message: `${workflows.length} workflow template(s) registered`,
          });
        } catch (err) {
          diagnostics.push({
            name: 'storage',
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const allOk = diagnostics.every((d) => d.status === 'ok');

      if (opts.json) {
        outputJson({ status: allOk ? 'ok' : 'issues_found', diagnostics });
      } else {
        for (const d of diagnostics) {
          const icon = d.status === 'ok' ? '✓' : '✗';
          console.log(`${icon} ${d.name}: ${d.message}`);
        }
        if (!allOk) process.exitCode = 1;
      }
    });

  return cmd;
}
