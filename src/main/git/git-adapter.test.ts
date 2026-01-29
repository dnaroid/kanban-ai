import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { SimpleGitAdapter } from './git-adapter'

describe('SimpleGitAdapter', () => {
  it('creates branch, detects diff, and commits', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'kanban-git-'))

    try {
      execSync('git init', { cwd: repoPath })
      execSync('git config user.email "test@example.com"', { cwd: repoPath })
      execSync('git config user.name "Test User"', { cwd: repoPath })
      writeFileSync(path.join(repoPath, 'README.md'), 'hello')
      execSync('git add .', { cwd: repoPath })
      execSync('git commit -m "init"', { cwd: repoPath })

      const adapter = new SimpleGitAdapter()
      const base = await adapter.getDefaultBranch(repoPath)
      await adapter.createBranch(repoPath, 'task/test', base)

      writeFileSync(path.join(repoPath, 'README.md'), 'hello world')
      const diff = await adapter.getDiff(repoPath)
      expect(diff).toContain('hello world')

      const commit = await adapter.commitAll(repoPath, 'update readme')
      expect(commit.sha).toBeTruthy()

      const status = await adapter.getStatus(repoPath)
      expect(status.isDirty).toBe(false)
    } finally {
      rmSync(repoPath, { recursive: true, force: true })
    }
  })
})
