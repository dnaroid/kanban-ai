import { createHash } from 'node:crypto'
import { ErrorCode, fail, type Result } from "../../shared/src/ipc'
import type {
  BoardRepoPort,
  ContextSnapshotRepoPort,
  ProjectRepoPort,
  RolePresetProvider,
  TaskRepoPort,
} from '../ports'
import type { RunMode } from '../db/run-types'
import { toResultError } from '../ipc/map-error'
import { DENYLIST_PATTERNS, redactValue } from './run-security.js'

type BuildContextSnapshotInput = {
  taskId: string
  roleId: string
  mode?: RunMode
}

type ContextSnapshotBuilderDeps = {
  taskRepo: TaskRepoPort
  projectRepo: ProjectRepoPort
  boardRepo: BoardRepoPort
  contextSnapshotRepo: ContextSnapshotRepoPort
  rolePresetProvider: RolePresetProvider
}

export class ContextSnapshotBuilder {
  constructor(private readonly deps: ContextSnapshotBuilderDeps) {}

  build({ taskId, roleId, mode }: BuildContextSnapshotInput): Result<{ id: string }> {
    try {
      const taskResult = this.deps.taskRepo.getById(taskId)
      if (!taskResult.ok) {
        return taskResult
      }

      const task = taskResult.data
      if (!task) {
        return fail(ErrorCode.TASK_NOT_FOUND, 'Task not found for context snapshot')
      }

      if (!task.boardId) {
        return fail(ErrorCode.VALIDATION_ERROR, 'Task is missing boardId for context snapshot')
      }

      if (!task.columnId) {
        return fail(ErrorCode.VALIDATION_ERROR, 'Task is missing columnId for context snapshot')
      }

      const projectResult = this.deps.projectRepo.getById(task.projectId)
      if (!projectResult.ok) {
        return projectResult
      }

      const project = projectResult.data
      if (!project) {
        return fail(ErrorCode.PROJECT_NOT_FOUND, 'Project not found for context snapshot')
      }

      const columnsResult = this.deps.boardRepo.getColumns(task.boardId)
      if (!columnsResult.ok) {
        return columnsResult
      }

      const column = columnsResult.data.find((col) => col.id === task.columnId)
      const rolePreset = this.deps.rolePresetProvider.getById(roleId)

      const limits = {
        maxTimeMs: Number(process.env.RUN_MAX_TIME_MS ?? 0),
        maxOutputChars: Number(process.env.RUN_MAX_OUTPUT_CHARS ?? 0),
      }

      const payload = {
        task: {
          id: task.id,
          title: task.title,
          description: task.description ?? '',
          descriptionMd: task.descriptionMd ?? '',
          acceptanceCriteria: task.descriptionMd ?? task.description ?? '',
          type: task.type,
          priority: task.priority,
          tags: task.tags ?? [],
          status: task.status,
        },
        board: {
          id: task.boardId,
          column: {
            id: task.columnId,
            name: column?.name ?? '',
          },
        },
        project: {
          id: project.id,
          name: project.name,
          repoPath: project.path,
        },
        role: {
          id: rolePreset.id,
          name: rolePreset.name,
          description: rolePreset.description,
          preset: rolePreset.preset,
        },
        mode: mode ?? 'execute',
        limits,
        security: {
          denylist: DENYLIST_PATTERNS.map((pattern) => pattern.source),
          safeMode: process.env.OPENCODE_SAFE_MODE !== '0',
        },
      }

      const sanitizedPayload = redactValue(payload)
      const hash = createHash('sha256').update(JSON.stringify(sanitizedPayload)).digest('hex')

      return this.deps.contextSnapshotRepo.create({
        taskId: task.id,
        kind: 'run_input_v1',
        summary: task.title,
        payload: sanitizedPayload,
        hash,
      })
    } catch (error) {
      return toResultError(error)
    }
  }
}
