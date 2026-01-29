import { taskRepo } from '../db/task-repository.js'
import { taskVcsLinkRepo } from '../db/task-vcs-link-repository.js'
import { buildTaskBranchName } from './task-branching.js'

export const ensureTaskBranchName = (taskId: string): string => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const existing = taskVcsLinkRepo.getByTaskId(taskId)
  if (existing?.branchName) {
    return existing.branchName
  }

  const branchName = buildTaskBranchName(task.id, task.title)
  taskVcsLinkRepo.upsert(taskId, { branchName })
  return branchName
}
