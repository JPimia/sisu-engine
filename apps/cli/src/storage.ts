import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';

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
