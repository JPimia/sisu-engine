import { homedir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { buildApp } from './app.js';

export { buildApp };

const DEFAULT_DB_PATH = join(homedir(), '.sisu', 'sisu.db');

export async function startServer(options?: { port?: number; dbPath?: string }): Promise<void> {
  const port = options?.port ?? Number(process.env.PORT ?? 3000);
  const dbPath = options?.dbPath ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;
  const storage = new SqliteStorage(dbPath, {
    roles: [...BUILT_IN_ROLES],
    workflows: [...BUILT_IN_WORKFLOWS],
  });
  const app = await buildApp({ storage, logger: true });
  await app.listen({ port, host: '0.0.0.0' });
}
