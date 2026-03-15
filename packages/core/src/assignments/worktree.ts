/**
 * Git worktree helpers for parallel agent work on isolated branches.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/**
 * Create a new git worktree.
 * Returns the absolute path of the new worktree.
 */
export async function createWorktree(
  repoPath: string,
  worktreeName: string,
  branch: string,
  baseBranch: string,
): Promise<string> {
  const worktreePath = `${repoPath}/../${worktreeName}`;
  await execFile('git', ['worktree', 'add', '-b', branch, worktreePath, baseBranch], {
    cwd: repoPath,
  });
  const { stdout } = await execFile('realpath', [worktreePath]);
  return stdout.trim();
}

/**
 * Remove a git worktree by its absolute path.
 */
export async function removeWorktree(worktreePath: string): Promise<void> {
  await execFile('git', ['worktree', 'remove', worktreePath, '--force']);
}

/**
 * List all worktree paths for a repository.
 */
export async function listWorktrees(repoPath: string): Promise<string[]> {
  const { stdout } = await execFile('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
  });
  const paths: string[] = [];
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      paths.push(line.slice('worktree '.length));
    }
  }
  return paths;
}
