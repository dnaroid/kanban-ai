import { spawn } from 'node:child_process'
import { taskRepo } from '../db/task-repository.js'
import { pullRequestRepo } from '../db/pull-request-repository.js'
import { vcsProjectRepo } from '../db/vcs-project-repository.js'
import { mergeConflictRepo } from '../db/merge-conflict-repository.js'
import { runRepo } from '../db/run-repository.js'
import { artifactRepo } from '../db/artifact-repository.js'
import { runService } from '../run/run-service.js'
import { buildMergeConflictSnapshot } from '../run/context-snapshot-builder.js'
import type { MergeConflictPackage } from '../../shared/types/merge'
import { detectMergeConflicts } from './conflict-detector'
import { createTempWorkspace } from './temp-workspace'
import simpleGit from 'simple-git'

export const detectMergeConflict = async (
  taskId: string
): Promise<{
  conflictId: string | null
  conflictPackage: MergeConflictPackage | null
}> => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const existing = mergeConflictRepo.getLatestByTaskId(task.id)
  if (existing && ['detected', 'suggested', 'applied'].includes(existing.status)) {
    return {
      conflictId: existing.id,
      conflictPackage: getConflictPackage(existing.id),
    }
  }

  const pr = pullRequestRepo.getByTaskId(taskId)
  if (!pr) {
    throw new Error('Pull request not found')
  }

  const vcsProject = vcsProjectRepo.getByProjectId(task.projectId)
  if (!vcsProject?.repoPath) {
    throw new Error('VCS project not configured')
  }

  const conflictPackage = await detectMergeConflicts({
    repoPath: vcsProject.repoPath,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    task: { id: task.id, title: task.title },
    pr: { id: pr.providerPrId, base: pr.baseBranch, head: pr.headBranch },
  })

  if (!conflictPackage) {
    return { conflictId: null, conflictPackage: null }
  }

  const conflictRecord = mergeConflictRepo.create({
    taskId: task.id,
    prId: pr.providerPrId,
    status: 'detected',
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    conflictFilesJson: JSON.stringify(conflictPackage.files),
  })

  return { conflictId: conflictRecord.id, conflictPackage }
}

export const getConflictPackage = (conflictId: string): MergeConflictPackage | null => {
  const conflict = mergeConflictRepo.getById(conflictId)
  if (!conflict) return null

  const task = taskRepo.getById(conflict.taskId)

  let files = [] as MergeConflictPackage['files']
  try {
    files = JSON.parse(conflict.conflictFilesJson || '[]') as MergeConflictPackage['files']
  } catch {
    files = []
  }

  return {
    task: { id: conflict.taskId, title: task?.title ?? '' },
    pr: { id: conflict.prId, base: conflict.baseBranch, head: conflict.headBranch },
    files,
    rules: { style: 'default', denylist: ['*.env', '*.pem', '*.key', '*.p12'] },
  }
}

export const suggestMergeResolution = async (conflictId: string): Promise<{ runId: string }> => {
  const conflictPackage = getConflictPackage(conflictId)
  if (!conflictPackage) {
    throw new Error('Merge conflict not found')
  }

  const snapshot = buildMergeConflictSnapshot({
    conflictPackage,
    roleId: 'merge-resolver',
    mode: 'execute',
  })

  const run = runRepo.create({
    taskId: conflictPackage.task.id,
    roleId: 'merge-resolver',
    mode: 'execute',
    contextSnapshotId: snapshot.id,
  })

  mergeConflictRepo.update(conflictId, { status: 'suggested' })
  runService.enqueue(run.id)

  return { runId: run.id }
}

const applyPatch = async (cwd: string, patch: string) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['apply', '--whitespace=nowarn'], {
      cwd,
      stdio: ['pipe', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(stderr || 'Failed to apply patch'))
    })

    child.stdin.write(patch)
    child.stdin.end()
  })
}

export const applyMergeResolution = async (input: {
  conflictId: string
  patchArtifactId: string
}): Promise<{ ok: true }> => {
  const conflict = mergeConflictRepo.getById(input.conflictId)
  if (!conflict) {
    throw new Error('Merge conflict not found')
  }

  const task = taskRepo.getById(conflict.taskId)
  if (!task) {
    throw new Error('Task not found for merge conflict')
  }

  const vcsProject = vcsProjectRepo.getByProjectId(task.projectId)
  if (!vcsProject?.repoPath) {
    throw new Error('VCS project not configured')
  }

  const patchArtifact = artifactRepo.getById(input.patchArtifactId)
  if (!patchArtifact) {
    throw new Error('Patch artifact not found')
  }
  if (patchArtifact.kind !== 'patch') {
    throw new Error('Artifact is not a patch')
  }

  const workspace = await createTempWorkspace(vcsProject.repoPath, conflict.baseBranch)
  const git = simpleGit({ baseDir: workspace.path, binary: 'git' })

  try {
    try {
      await git.raw(['merge', '--no-commit', '--no-ff', conflict.headBranch])
    } catch {
      // merge conflicts expected
    }

    await applyPatch(workspace.path, patchArtifact.content)

    const conflictFiles = await git.raw(['diff', '--name-only', '--diff-filter=U'])
    if (conflictFiles.trim().length > 0) {
      throw new Error('Patch did not resolve all conflicts')
    }

    await git.raw(['add', '-A'])
    const statusOutput = await git.raw(['status', '--porcelain'])
    if (statusOutput.trim().length === 0) {
      throw new Error('No changes to commit after applying patch')
    }

    await git.raw([
      '-c',
      'user.name=Kanban AI',
      '-c',
      'user.email=kanban@local',
      'commit',
      '-m',
      'Resolve merge conflicts',
    ])

    await git.raw(['push', 'origin', `HEAD:${conflict.headBranch}`])

    mergeConflictRepo.update(conflict.id, { status: 'applied' })
    return { ok: true }
  } finally {
    await workspace.cleanup()
  }
}
