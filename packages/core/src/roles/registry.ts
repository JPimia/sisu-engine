import type { RoleDefinition } from '@sisu/protocol';
import { BUILT_IN_ROLES } from './built-in.js';

export class SpawnViolationError extends Error {
  constructor(parentRole: string, childRole: string) {
    super(`Role '${parentRole}' is not allowed to spawn role '${childRole}'`);
    this.name = 'SpawnViolationError';
  }
}

/**
 * Registry of all known roles. Starts pre-loaded with built-in roles.
 * Custom roles can be registered at runtime.
 */
export class RoleRegistry {
  private readonly roles: Map<string, RoleDefinition>;

  constructor(extraRoles?: RoleDefinition[]) {
    this.roles = new Map();
    for (const role of BUILT_IN_ROLES) {
      this.roles.set(role.id, role);
    }
    if (extraRoles) {
      for (const role of extraRoles) {
        this.roles.set(role.id, role);
      }
    }
  }

  listRoles(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  getRole(id: string): RoleDefinition | null {
    return this.roles.get(id) ?? null;
  }

  register(role: RoleDefinition): void {
    this.roles.set(role.id, role);
  }

  /**
   * Throws SpawnViolationError if `parentRole` is not permitted to spawn `childRole`.
   */
  assertSpawnAllowed(parentRoleId: string, childRoleId: string): void {
    const parent = this.roles.get(parentRoleId);
    if (!parent) {
      throw new Error(`Unknown role: ${parentRoleId}`);
    }
    if (!parent.canSpawn.includes(childRoleId)) {
      throw new SpawnViolationError(parentRoleId, childRoleId);
    }
  }

  /**
   * Returns true if `parentRole` is allowed to spawn `childRole`.
   */
  canSpawn(parentRoleId: string, childRoleId: string): boolean {
    const parent = this.roles.get(parentRoleId);
    if (!parent) return false;
    return parent.canSpawn.includes(childRoleId);
  }
}

/** Singleton registry pre-loaded with all 9 built-in roles. */
export const defaultRegistry = new RoleRegistry();
