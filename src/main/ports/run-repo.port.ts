import type { Run } from '../../shared/types/ipc'
import type { Result } from '../../shared/ipc'

export interface CreateRunInput {
  taskId: string
  roleId: string
  mode?: Run['mode']
  kind?: Run['kind']
  status?: Run['status']
  budget?: Record<string, unknown>
  contextSnapshotId: string
}

type RunUpdatePatch = Partial<Omit<Run, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>>

export interface RunRepoPort {
  create(input: CreateRunInput): Result<Run>
  getById(runId: string): Result<Run | null>
  listByTask(taskId: string): Result<Run[]>
  listByStatus(status: Run['status'], limit?: number): Result<Run[]>
  update(runId: string, patch: RunUpdatePatch): Result<void>
  delete(runId: string): Result<void>
}
