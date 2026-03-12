import { Command } from 'commander';
import { outputJson } from '../output.js';
import { DEFAULT_DB_PATH, openStorage, storageExists } from '../storage.js';

export function makeHealthCommand(): Command {
  const cmd = new Command('health');
  cmd
    .description('Check storage and runtime connectivity')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action(async (opts: { db: string; json?: boolean }) => {
      const dbPath = opts.db;
      const checks: Record<string, 'ok' | 'error'> = {};
      const errors: Record<string, string> = {};

      // Storage check
      if (!storageExists(dbPath)) {
        checks['storage'] = 'error';
        errors['storage'] = `Database not found at ${dbPath}. Run 'sisu init' first.`;
      } else {
        try {
          const storage = openStorage(dbPath);
          await storage.listWorkItems();
          checks['storage'] = 'ok';
        } catch (err) {
          checks['storage'] = 'error';
          errors['storage'] = err instanceof Error ? err.message : String(err);
        }
      }

      const allOk = Object.values(checks).every((v) => v === 'ok');

      if (opts.json) {
        outputJson({ status: allOk ? 'healthy' : 'degraded', checks, errors });
      } else {
        for (const [name, status] of Object.entries(checks)) {
          const icon = status === 'ok' ? '✓' : '✗';
          console.log(`${icon} ${name}: ${status}`);
          if (errors[name]) {
            console.log(`  ${errors[name]}`);
          }
        }
        if (allOk) {
          console.log('\nAll checks passed.');
        } else {
          console.log('\nSome checks failed.');
          process.exitCode = 1;
        }
      }
    });

  return cmd;
}
