import { ok, type Result } from '../../../shared/ipc'
import type { TaskUpdateInput } from '../../../shared/types/ipc.js'
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  UpdateProjectUseCase,
} from '../../app/project/commands'
import {
  CreateTaskUseCase,
  DeleteTaskUseCase,
  MoveTaskUseCase,
  UpdateTaskUseCase,
} from '../../app/task/commands'
import { CancelRunUseCase } from '../../app/run/commands/cancel-run.use-case'
import { DeleteRunUseCase } from '../../app/run/commands/delete-run.use-case'
import { StartRunUseCase } from '../../app/run/commands/start-run.use-case'
import { GetProjectByIdUseCase, GetProjectsUseCase } from '../../app/project/queries'
import { GetRunUseCase, ListRunsByTaskUseCase } from '../../app/run/queries'
import { ListTasksByBoardUseCase } from '../../app/task/queries'
import { TaskMovePolicy } from '../../domain/task/task-move.policy'
import { dbManager } from '../../db'
import { withTransaction } from '../../db/transaction'
import { emitTaskEvent } from '../../ipc/event-bus-ipc'
import { ContextSnapshotBuilder } from '../../run/context-snapshot-builder.js'
import type { RolePresetProvider } from '../../ports'
import type { RepositoriesModule } from './repositories.module'
import type { ServicesModule } from './services.module'

export function createUseCasesModule(repositories: RepositoriesModule, services: ServicesModule) {
  const {
    projectRepoAdapter,
    taskRepoAdapter,
    runRepoAdapter,
    boardRepoAdapter,
    contextSnapshotRepoAdapter,
    getModelForDifficulty,
  } = repositories

  const rolePresetProvider: RolePresetProvider = {
    getById(roleId) {
      const db = dbManager.connect()
      const row = db
        .prepare(
          `
          SELECT id, name, description, preset_json as presetJson
          FROM agent_roles
          WHERE id = ?
          LIMIT 1
          `
        )
        .get(roleId) as
        | { id: string; name: string; description: string; presetJson: string }
        | undefined

      if (!row) {
        return {
          id: roleId,
          name: roleId.toUpperCase(),
          description: '',
          preset: {},
        }
      }

      let preset: Record<string, unknown> = {}
      try {
        preset = JSON.parse(row.presetJson) as Record<string, unknown>
      } catch (error) {
        console.warn('[ContextSnapshot] Failed to parse role preset JSON:', error)
      }

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        preset,
      }
    },
  }

  const contextSnapshotBuilder = new ContextSnapshotBuilder({
    taskRepo: taskRepoAdapter,
    projectRepo: projectRepoAdapter,
    boardRepo: boardRepoAdapter,
    contextSnapshotRepo: contextSnapshotRepoAdapter,
    rolePresetProvider,
  })

  function emitTaskUpdated(taskId: string) {
    const taskResult = taskRepoAdapter.getById(taskId)
    if (!taskResult.ok || !taskResult.data) {
      return
    }
    emitTaskEvent({ type: 'task.updated', task: taskResult.data })
  }

  const updateTaskUseCase = new UpdateTaskUseCase(
    taskRepoAdapter,
    getModelForDifficulty,
    emitTaskUpdated
  )

  const updateTaskAndEmit = (taskId: string, patch: TaskUpdateInput['patch']): Result<void> => {
    const result = updateTaskUseCase.execute({ taskId, patch })
    if (result.ok === false) {
      return result
    }

    return ok(undefined)
  }

  const resolveInProgressColumnId = (taskId: string): string | null => {
    const taskResult = taskRepoAdapter.getById(taskId)
    if (!taskResult.ok || !taskResult.data) {
      return null
    }

    const task = taskResult.data
    const columnsResult = boardRepoAdapter.getColumns(task.boardId)
    if (!columnsResult.ok) {
      return null
    }

    const columns = columnsResult.data as Array<{
      id: string
      orderIndex: number
      systemKey?: string
    }>
    const column = columns.find(
      (entry) => (entry as { systemKey?: string }).systemKey === 'in_progress'
    )
    if (column) {
      return column.id
    }

    const fallback = columns.find((entry) => entry.orderIndex === 1)
    return fallback?.id ?? null
  }

  const createProjectUseCase = new CreateProjectUseCase(projectRepoAdapter)
  const getProjectsUseCase = new GetProjectsUseCase(projectRepoAdapter)
  const getProjectByIdUseCase = new GetProjectByIdUseCase(projectRepoAdapter)
  const updateProjectUseCase = new UpdateProjectUseCase(projectRepoAdapter)
  const deleteProjectUseCase = new DeleteProjectUseCase(projectRepoAdapter)

  const createTaskUseCase = new CreateTaskUseCase(taskRepoAdapter)
  const listTasksByBoardUseCase = new ListTasksByBoardUseCase(taskRepoAdapter)
  const moveTaskUseCase = new MoveTaskUseCase(taskRepoAdapter, new TaskMovePolicy())
  const deleteTaskUseCase = new DeleteTaskUseCase(taskRepoAdapter)

  const startRunUseCase = new StartRunUseCase(
    runRepoAdapter,
    taskRepoAdapter,
    ({ taskId, roleId, mode }) => contextSnapshotBuilder.build({ taskId, roleId, mode }),
    withTransaction,
    services.enqueueRun,
    resolveInProgressColumnId,
    updateTaskAndEmit
  )
  const cancelRunUseCase = new CancelRunUseCase(services.cancelRun)
  const deleteRunUseCase = new DeleteRunUseCase(runRepoAdapter)
  const listRunsByTaskUseCase = new ListRunsByTaskUseCase(runRepoAdapter)
  const getRunUseCase = new GetRunUseCase(runRepoAdapter)

  return {
    emitTaskUpdated,
    updateTaskAndEmit,
    resolveInProgressColumnId,
    createProjectUseCase,
    getProjectsUseCase,
    getProjectByIdUseCase,
    updateProjectUseCase,
    deleteProjectUseCase,
    createTaskUseCase,
    listTasksByBoardUseCase,
    updateTaskUseCase,
    moveTaskUseCase,
    deleteTaskUseCase,
    startRunUseCase,
    cancelRunUseCase,
    deleteRunUseCase,
    listRunsByTaskUseCase,
    getRunUseCase,
  }
}

export type UseCasesModule = ReturnType<typeof createUseCasesModule>
