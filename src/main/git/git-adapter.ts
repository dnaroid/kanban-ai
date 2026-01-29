import simpleGit, { SimpleGit } from 'simple-git'

export interface GitStatus {
  branch: string
  isDirty: boolean
  ahead: number
  behind: number
}

export interface GitAdapter {
  ensureRepo(repoPath: string): Promise<void>
  getDefaultBranch(repoPath: string): Promise<string>
  getStatus(repoPath: string): Promise<GitStatus>
  checkoutBranch(repoPath: string, branch: string): Promise<void>
  createBranch(repoPath: string, branch: string, from?: string): Promise<void>
  getDiff(repoPath: string): Promise<string>
  commitAll(repoPath: string, message: string): Promise<{ sha: string }>
  push(repoPath: string, branch: string): Promise<void>
}

const DEFAULT_BRANCH = 'main'

const getGit = (repoPath: string): SimpleGit => simpleGit({ baseDir: repoPath, binary: 'git' })

const parseRemoteHead = (output: string): string | null => {
  const trimmed = output.trim()
  if (!trimmed) return null
  const parts = trimmed.split('/')
  return parts[parts.length - 1] || null
}

export class SimpleGitAdapter implements GitAdapter {
  async ensureRepo(repoPath: string): Promise<void> {
    const git = getGit(repoPath)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      throw new Error('Path is not a git repository')
    }
  }

  async getDefaultBranch(repoPath: string): Promise<string> {
    const git = getGit(repoPath)
    try {
      const headRef = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      return parseRemoteHead(headRef) ?? DEFAULT_BRANCH
    } catch {
      try {
        const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
        return branch.trim() || DEFAULT_BRANCH
      } catch {
        return DEFAULT_BRANCH
      }
    }
  }

  async getStatus(repoPath: string): Promise<GitStatus> {
    const git = getGit(repoPath)
    const status = await git.status()
    return {
      branch: status.current ?? '',
      isDirty: !status.isClean(),
      ahead: status.ahead,
      behind: status.behind,
    }
  }

  async checkoutBranch(repoPath: string, branch: string): Promise<void> {
    const git = getGit(repoPath)
    await git.checkout(branch)
  }

  async createBranch(repoPath: string, branch: string, from?: string): Promise<void> {
    const git = getGit(repoPath)
    if (from) {
      await git.checkoutBranch(branch, from)
      return
    }
    await git.checkoutLocalBranch(branch)
  }

  async getDiff(repoPath: string): Promise<string> {
    const git = getGit(repoPath)
    return git.diff()
  }

  async commitAll(repoPath: string, message: string): Promise<{ sha: string }> {
    const git = getGit(repoPath)
    await git.add('.')
    const result = await git.commit(message)
    return { sha: result.commit }
  }

  async push(repoPath: string, branch: string): Promise<void> {
    const git = getGit(repoPath)
    await git.push('origin', branch)
  }
}

export const createGitAdapter = (): GitAdapter => new SimpleGitAdapter()
