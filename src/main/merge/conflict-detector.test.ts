import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { detectMergeConflicts } from './conflict-detector'

const run = (command: string, cwd: string) => {
  execSync(command, { cwd, stdio: 'ignore' })
}

describe('detectMergeConflicts', () => {
  it('builds conflict package when merge has conflicts', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'kanban-merge-test-'))
    try {
      run('git init -b main', repoPath)
      writeFileSync(path.join(repoPath, 'file.txt'), 'base\n', 'utf-8')
      run('git add .', repoPath)
      run('git -c user.name=Test -c user.email=test@example.com commit -m "init"', repoPath)

      run('git checkout -b feature', repoPath)
      writeFileSync(path.join(repoPath, 'file.txt'), 'feature\n', 'utf-8')
      run('git add .', repoPath)
      run('git -c user.name=Test -c user.email=test@example.com commit -m "feature"', repoPath)

      run('git checkout main', repoPath)
      writeFileSync(path.join(repoPath, 'file.txt'), 'main\n', 'utf-8')
      run('git add .', repoPath)
      run('git -c user.name=Test -c user.email=test@example.com commit -m "main"', repoPath)

      const result = await detectMergeConflicts({
        repoPath,
        baseBranch: 'main',
        headBranch: 'feature',
        task: { id: 'task-1', title: 'Test task' },
        pr: { id: 'pr-1', base: 'main', head: 'feature' },
      })

      expect(result).not.toBeNull()
      expect(result?.files.length).toBe(1)
      expect(result?.files[0].markers).toContain('<<<<<<<')
    } finally {
      rmSync(repoPath, { recursive: true, force: true })
    }
  })
})
