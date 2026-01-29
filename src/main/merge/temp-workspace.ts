import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import simpleGit from 'simple-git'

export type TempWorkspace = {
  path: string
  cleanup: () => Promise<void>
}

const createWorkspaceDir = (): string => {
  const baseDir = path.join(os.tmpdir(), 'kanban-ai-merge-')
  return fs.mkdtempSync(baseDir)
}

export const createTempWorkspace = async (
  repoPath: string,
  baseBranch: string
): Promise<TempWorkspace> => {
  const workspacePath = createWorkspaceDir()
  const git = simpleGit({ baseDir: repoPath, binary: 'git' })

  try {
    await git.raw(['worktree', 'add', '--detach', workspacePath, baseBranch])
  } catch (error) {
    try {
      await git.raw(['worktree', 'remove', '--force', workspacePath])
    } catch {
      // best-effort cleanup
    }
    try {
      fs.rmSync(workspacePath, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
    throw error
  }

  const cleanup = async () => {
    const rootGit = simpleGit({ baseDir: repoPath, binary: 'git' })
    try {
      await rootGit.raw(['worktree', 'remove', '--force', workspacePath])
    } finally {
      try {
        fs.rmSync(workspacePath, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  }

  return {
    path: workspacePath,
    cleanup,
  }
}
