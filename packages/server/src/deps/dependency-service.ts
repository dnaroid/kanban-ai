import type { TaskLink, TaskLinkType } from "@shared/types/ipc"
import { taskRepo } from '../db/task-repository'
import { taskLinkRepo } from '../db/task-link-repository'

type AddDependencyInput = {
  fromTaskId: string
  toTaskId: string
  type: TaskLinkType
}

const ensureTaskExists = (taskId: string) => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }
  return task
}

const createsCycle = (projectId: string, fromTaskId: string, toTaskId: string): boolean => {
  const links = taskLinkRepo.listByProject(projectId, 'blocks')
  const adjacency = new Map<string, Set<string>>()

  for (const link of links) {
    if (!adjacency.has(link.fromTaskId)) {
      adjacency.set(link.fromTaskId, new Set())
    }
    adjacency.get(link.fromTaskId)?.add(link.toTaskId)
  }

  if (!adjacency.has(fromTaskId)) {
    adjacency.set(fromTaskId, new Set())
  }
  adjacency.get(fromTaskId)?.add(toTaskId)

  const visited = new Set<string>()
  const stack = [toTaskId]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    if (current === fromTaskId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const next = adjacency.get(current)
    if (!next) continue
    for (const neighbor of next) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor)
      }
    }
  }

  return false
}

export const dependencyService = {
  list(taskId: string): TaskLink[] {
    return taskLinkRepo.listByTaskId(taskId)
  },
  add(input: AddDependencyInput): TaskLink {
    if (input.fromTaskId === input.toTaskId) {
      throw new Error('Cannot link task to itself')
    }

    const fromTask = ensureTaskExists(input.fromTaskId)
    const toTask = ensureTaskExists(input.toTaskId)

    if (fromTask.projectId !== toTask.projectId) {
      throw new Error('Cross-project dependencies are not supported')
    }

    const existing = taskLinkRepo.findByEndpoints(input.fromTaskId, input.toTaskId, input.type)
    if (existing) {
      return existing
    }

    if (
      input.type === 'blocks' &&
      createsCycle(fromTask.projectId, input.fromTaskId, input.toTaskId)
    ) {
      throw new Error('Dependency cycle detected')
    }

    return taskLinkRepo.create({
      projectId: fromTask.projectId,
      fromTaskId: input.fromTaskId,
      toTaskId: input.toTaskId,
      linkType: input.type,
    })
  },
  remove(linkId: string): void {
    taskLinkRepo.delete(linkId)
  },
}
