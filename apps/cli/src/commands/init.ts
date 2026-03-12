import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { outputJson } from '../output.js';
import { DEFAULT_DB_PATH, openStorage, storageExists } from '../storage.js';

export function makeInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Initialize SISU config and local SQLite storage')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .option('--json', 'Output as JSON')
    .action((opts: { db: string; json?: boolean }) => {
      const dbPath = opts.db;

      if (storageExists(dbPath)) {
        const result = { status: 'already_initialized', path: dbPath };
        if (opts.json) {
          outputJson(result);
        } else {
          console.log(`SISU already initialized at ${dbPath}`);
        }
        return;
      }

      mkdirSync(dirname(dbPath), { recursive: true });
      openStorage(dbPath); // triggers migration

      const result = { status: 'initialized', path: dbPath };
      if (opts.json) {
        outputJson(result);
      } else {
        console.log(`SISU initialized at ${dbPath}`);
      }
    });

  return cmd;
}
