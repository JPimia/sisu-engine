/**
 * Shared assignment injection logic for runtime adapters.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assignment } from '@sisu/protocol';
import type { SpawnConfig } from './types.js';

let _coreModule: typeof import('@sisu/core') | undefined;

async function getCore(): Promise<typeof import('@sisu/core')> {
  if (!_coreModule) {
    _coreModule = await import('@sisu/core');
  }
  return _coreModule;
}

function resolveTemplatesDir(): string {
  try {
    const resolved = import.meta.resolve('@sisu/templates-default');
    const filePath = fileURLToPath(resolved);
    return dirname(dirname(filePath));
  } catch {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    return join(thisDir, '..', '..', 'templates-default');
  }
}

/**
 * Load a role prompt markdown file from templates-default/roles/{role}.md.
 */
export async function loadRolePrompt(role: string): Promise<string> {
  const templatesDir = resolveTemplatesDir();
  const rolePath = join(templatesDir, 'roles', `${role}.md`);
  return readFile(rolePath, 'utf8');
}

/**
 * Load the execution contract from templates-default/execution-contract.md.
 */
export async function loadExecutionContract(): Promise<string> {
  const templatesDir = resolveTemplatesDir();
  const contractPath = join(templatesDir, 'execution-contract.md');
  return readFile(contractPath, 'utf8');
}

export interface AssignmentInjectionResult {
  env: Record<string, string>;
  systemPrompt: string;
}

/**
 * Prepare assignment injection for a spawn config.
 * Writes the assignment file and returns env vars + system prompt.
 */
export async function prepareAssignmentInjection(
  config: SpawnConfig,
): Promise<AssignmentInjectionResult | undefined> {
  if (!config.assignment) {
    return undefined;
  }

  const assignment: Assignment = config.assignment;
  const core = await getCore();

  // 1. Write assignment file
  await core.writeAssignment(config.workingDirectory, assignment);

  // 2. Build env vars
  const apiUrl = config.apiUrl ?? 'http://localhost:3000';
  const sisuEnv = core.buildAgentEnv({
    apiUrl,
    runId: config.runId,
    planId: config.planId,
    assignment,
  });

  // 3. Load role prompt and execution contract
  const [rolePrompt, executionContract] = await Promise.all([
    loadRolePrompt(assignment.frontmatter.role),
    loadExecutionContract(),
  ]);

  // 4. Assemble system prompt
  const systemPrompt = core.assembleSystemPrompt({
    rolePrompt,
    executionContract,
    assignment,
  });

  return {
    env: { ...sisuEnv },
    systemPrompt,
  };
}
