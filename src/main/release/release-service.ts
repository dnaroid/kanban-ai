import { releaseRepo } from '../db/release-repository.js'
import { releaseItemRepo } from '../db/release-item-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { pullRequestRepo } from '../db/pull-request-repository.js'
import { runRepo } from '../db/run-repository.js'
import { runService } from '../run/run-service.js'
import { buildReleaseNotesSnapshot } from '../run/context-snapshot-builder.js'

export const createRelease = async (input: {
  projectId: string
  name: string
  targetDate?: string | null
}) => {
  const release = releaseRepo.create({
    projectId: input.projectId,
    name: input.name,
    targetDate: input.targetDate ?? null,
  })

  return { releaseId: release.id }
}

export const addReleaseItems = async (input: { releaseId: string; taskIds: string[] }) => {
  const uniqueTaskIds = Array.from(new Set(input.taskIds))
  const items = uniqueTaskIds.map((taskId) => {
    const pr = pullRequestRepo.getByTaskId(taskId)
    return { taskId, prId: pr?.providerPrId }
  })

  releaseItemRepo.addItems(input.releaseId, items)
  return { ok: true as const }
}

export const listReleases = async (projectId: string) => {
  const releases = releaseRepo.listByProject(projectId)
  return { releases }
}

export const getRelease = async (releaseId: string) => {
  const release = releaseRepo.getById(releaseId)
  if (!release) {
    throw new Error('Release not found')
  }

  releaseRepo.update(releaseId, { status: 'in_progress' })
  const items = releaseItemRepo.listByRelease(releaseId)
  return { release, items }
}

export const generateReleaseNotes = async (releaseId: string) => {
  const release = releaseRepo.getById(releaseId)
  if (!release) {
    throw new Error('Release not found')
  }

  const items = releaseItemRepo.listByRelease(releaseId)
  if (items.length === 0) {
    throw new Error('Release has no items')
  }

  const primaryTaskId = items[0].taskId
  const task = taskRepo.getById(primaryTaskId)
  if (!task) {
    throw new Error('Task not found for release notes')
  }

  const snapshot = buildReleaseNotesSnapshot({
    releaseId,
    taskId: task.id,
    roleId: 'release-notes',
    mode: 'execute',
  })

  const run = runRepo.create({
    taskId: task.id,
    roleId: 'release-notes',
    mode: 'execute',
    contextSnapshotId: snapshot.id,
  })

  runService.enqueue(run.id)
  return { runId: run.id }
}

export const publishRelease = async (input: { releaseId: string; notesMd: string }) => {
  const release = releaseRepo.update(input.releaseId, {
    notesMd: input.notesMd,
    status: 'published',
  })

  if (!release) {
    throw new Error('Release not found')
  }

  return { ok: true as const }
}
