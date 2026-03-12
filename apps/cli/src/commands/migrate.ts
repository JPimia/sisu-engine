import { PostgresStorage } from '@sisu/core';
import { Command } from 'commander';
import { Pool } from 'pg';

export function makeMigrateCommand(): Command {
  const cmd = new Command('migrate');
  cmd.description('Run PostgreSQL database migrations');
  cmd
    .option('--database-url <url>', 'PostgreSQL connection URL', process.env.DATABASE_URL)
    .option('--dry-run', 'Show migrations that would run without executing')
    .action(async (opts: { databaseUrl?: string; dryRun?: boolean }) => {
      if (!opts.databaseUrl) {
        console.error('Error: --database-url or DATABASE_URL env var required');
        process.exit(1);
      }
      const pool = new Pool({ connectionString: opts.databaseUrl });
      try {
        if (opts.dryRun) {
          console.log('Dry run — would apply pending migrations');
        } else {
          await PostgresStorage.runMigrations(pool);
          console.log('Migrations applied successfully');
        }
      } finally {
        await pool.end();
      }
    });
  return cmd;
}
