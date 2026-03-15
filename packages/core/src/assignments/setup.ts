/**
 * .sisu directory setup and assignment file writer.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Assignment } from '@sisu/protocol';
import { assignmentToMarkdown } from './writer.js';

/**
 * Create the .sisu/assignments/ and .sisu/specs/ directories.
 */
export async function setupAssignmentDir(worktreePath: string): Promise<void> {
  await mkdir(join(worktreePath, '.sisu', 'assignments'), { recursive: true });
  await mkdir(join(worktreePath, '.sisu', 'specs'), { recursive: true });
}

/**
 * Write an assignment overlay file to .sisu/assignments/{taskId}.md.
 * Creates the directory structure if it doesn't exist.
 * Returns the absolute path of the written file.
 */
export async function writeAssignment(
  worktreePath: string,
  assignment: Assignment,
): Promise<string> {
  await setupAssignmentDir(worktreePath);
  const filePath = join(worktreePath, '.sisu', 'assignments', `${assignment.frontmatter.taskId}.md`);
  const content = assignmentToMarkdown(assignment);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}
