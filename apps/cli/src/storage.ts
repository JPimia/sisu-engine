import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_ROLES, PostgresStorage, SqliteStorage } from '@sisu/core';
import type { RoleDefinition, WorkflowTemplate } from '@sisu/protocol';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { Pool } from 'pg';

export const DEFAULT_DB_PATH = join(homedir(), '.sisu', 'sisu.db');

export function openStorage(dbPath: string = DEFAULT_DB_PATH): SqliteStorage {
  return new SqliteStorage(dbPath, {
    roles: [...BUILT_IN_ROLES],
    workflows: [...BUILT_IN_WORKFLOWS],
  });
}

export function storageExists(dbPath: string = DEFAULT_DB_PATH): boolean {
  return existsSync(dbPath);
}

export async function openPostgresStorage(
  databaseUrl: string,
  options?: { roles?: RoleDefinition[]; workflows?: WorkflowTemplate[] },
): Promise<PostgresStorage> {
  const pool = new Pool({ connectionString: databaseUrl });
  await PostgresStorage.runMigrations(pool);
  return new PostgresStorage(pool, {
    roles: options?.roles ?? [...BUILT_IN_ROLES],
    workflows: options?.workflows ?? [...BUILT_IN_WORKFLOWS],
  });
}
