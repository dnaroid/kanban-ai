import { app } from 'electron'
import type { TaskUpdateInput } from '../../../shared/types/ipc.js'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
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
import { ProjectRepoAdapter } from '../../infra/project/project-repo.adapter'
import { RunRepoAdapter } from '../../infra/run/run-repo.adapter'
import { TaskRepoAdapter } from '../../infra/task/task-repo.adapter'
import { TaskMovePolicy } from '../../domain/task/task-move.policy'
import { boardRepo } from '../../db/board-repository'
import { opencodeModelRepo } from '../../db/opencode-model-repository'
import { taskRepo } from '../../db/task-repository'
import { buildContextSnapshot } from '../../run/context-snapshot-builder'
import { emitTaskEvent } from '../event-bus-ipc'
import { runService } from '../../run/run-service'

// Repository Adapters
const projectRepoAdapter = new ProjectRepoAdapter()
const taskRepoAdapter = new TaskRepoAdapter()
const runRepoAdapter = new RunRepoAdapter()

// Helper Functions
function emitTaskUpdated(taskId: string) {
  const task = taskRepo.getById(taskId)
  if (!task) return
  emitTaskEvent({ type: 'task.updated', task })
}

const updateTaskAndEmit = (taskId: string, patch: TaskUpdateInput['patch']) => {
  return updateTaskUseCase.execute({ taskId, patch })
}

const resolveInProgressColumnId = (taskId: string): string | null => {
  const task = taskRepo.getById(taskId)
  if (!task) return null
  const columns = boardRepo.getColumns(task.boardId)
  const normalizeName = (value: string) =>
    value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const nameMatches = (entry: { name: string }) => {
    const normalized = normalizeName(entry.name)
    return (
      normalized === 'in progress' ||
      normalized.includes('progress') ||
      normalized === 'в работе' ||
      normalized === 'в процессе' ||
      normalized.includes('работ')
    )
  }
  const column = columns.find(nameMatches)
  if (column) return column.id
  const fallback = columns.find((entry) => entry.orderIndex === 1)
  return fallback?.id ?? null
}

// Project Use Cases
const createProjectUseCase = new CreateProjectUseCase(projectRepoAdapter)
const getProjectsUseCase = new GetProjectsUseCase(projectRepoAdapter)
const getProjectByIdUseCase = new GetProjectByIdUseCase(projectRepoAdapter)
const updateProjectUseCase = new UpdateProjectUseCase(projectRepoAdapter)
const deleteProjectUseCase = new DeleteProjectUseCase(projectRepoAdapter)

// Task Use Cases
const createTaskUseCase = new CreateTaskUseCase(taskRepoAdapter)
const listTasksByBoardUseCase = new ListTasksByBoardUseCase(taskRepoAdapter)
const updateTaskUseCase = new UpdateTaskUseCase(
  taskRepoAdapter,
  (difficulty) => opencodeModelRepo.getModelForDifficulty(difficulty),
  emitTaskUpdated
)
const moveTaskUseCase = new MoveTaskUseCase(taskRepoAdapter, new TaskMovePolicy())
const deleteTaskUseCase = new DeleteTaskUseCase(taskRepoAdapter)

// Run Use Cases
const startRunUseCase = new StartRunUseCase(
  runRepoAdapter,
  taskRepoAdapter,
  ({ taskId, roleId, mode }) => buildContextSnapshot({ taskId, roleId, mode }),
  (runId) => runService.enqueue(runId),
  resolveInProgressColumnId,
  updateTaskAndEmit
)
const cancelRunUseCase = new CancelRunUseCase((runId) => runService.cancel(runId))
const deleteRunUseCase = new DeleteRunUseCase(runRepoAdapter)
const listRunsByTaskUseCase = new ListRunsByTaskUseCase(runRepoAdapter)
const getRunUseCase = new GetRunUseCase(runRepoAdapter)

// OpenCode Client Factory
const createOpencodeClientInstance = (projectPath?: string) => {
  const baseUrl = process.env.OPENCODE_URL || 'http://127.0.0.1:4096'
  return createOpencodeClient({
    baseUrl,
    throwOnError: true,
    directory: projectPath ?? app.getPath('userData'),
  })
}

export const appContext = {
  // Repository Adapters
  projectRepoAdapter,
  taskRepoAdapter,
  runRepoAdapter,

  // Helper Functions
  emitTaskUpdated,
  updateTaskAndEmit,
  resolveInProgressColumnId,

  // Project Use Cases
  createProjectUseCase,
  getProjectsUseCase,
  getProjectByIdUseCase,
  updateProjectUseCase,
  deleteProjectUseCase,

  // Task Use Cases
  createTaskUseCase,
  listTasksByBoardUseCase,
  updateTaskUseCase,
  moveTaskUseCase,
  deleteTaskUseCase,

  // Run Use Cases
  startRunUseCase,
  cancelRunUseCase,
  deleteRunUseCase,
  listRunsByTaskUseCase,
  getRunUseCase,

  // OpenCode Client Factory
  createOpencodeClientInstance,

  // Repositories
  boardRepo,
  opencodeModelRepo,
  taskRepo,
}

export type AppContext = typeof appContext
