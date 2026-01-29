import fs from 'node:fs'
import path from 'node:path'
import simpleGit from 'simple-git'
import type { MergeConflictFile, MergeConflictPackage } from '../../shared/types/merge'
import { createTempWorkspace } from './temp-workspace'

const readFileSafe = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

const readStageContent = async (
  git: ReturnType<typeof simpleGit>,
  stage: 1 | 2 | 3,
  filePath: string
): Promise<string> => {
  try {
    return await git.raw(['show', `:${stage}:${filePath}`])
  } catch {
    return ''
  }
}

const listConflictFiles = async (git: ReturnType<typeof simpleGit>): Promise<string[]> => {
  const output = await git.raw(['diff', '--name-only', '--diff-filter=U'])
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line))
}

export const detectMergeConflicts = async (input: {
  repoPath: string
  baseBranch: string
  headBranch: string
  task: { id: string; title: string }
  pr: { id: string; base: string; head: string }
}): Promise<MergeConflictPackage | null> => {
  const workspace = await createTempWorkspace(input.repoPath, input.baseBranch)
  const git = simpleGit({ baseDir: workspace.path, binary: 'git' })

  try {
    try {
      await git.raw(['merge', '--no-commit', '--no-ff', input.headBranch])
    } catch (error) {
      const conflictFiles = await listConflictFiles(git)
      if (conflictFiles.length === 0) {
        throw error
      }
    }

    const conflictFiles = await listConflictFiles(git)
    if (conflictFiles.length === 0) {
      return null
    }

    const files: MergeConflictFile[] = []
    for (const file of conflictFiles) {
      const markers = readFileSafe(path.join(workspace.path, file))
      const base = await readStageContent(git, 1, file)
      const ours = await readStageContent(git, 2, file)
      const theirs = await readStageContent(git, 3, file)
      files.push({ path: file, base, ours, theirs, markers })
    }

    return {
      task: input.task,
      pr: input.pr,
      files,
      rules: {
        style: 'default',
        denylist: ['*.env', '*.pem', '*.key', '*.p12'],
      },
    }
  } finally {
    await workspace.cleanup()
  }
}
